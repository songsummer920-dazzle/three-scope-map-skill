// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import type { ContourBundle, ContourGrid } from './contourDataAdapter';
import type { MapNavigationItem } from './mapNavigation';
import { centredBounds, contourInterval, despikeElevations, gridRange, smoothGrid, terrainContours, tilePosition, type TerrainBounds } from './contourTerrainMath';

export type TerrainRequest = {
  item: MapNavigationItem;
  referenceBbox: TerrainBounds;
  bbox: TerrainBounds;
  tileUrl: string;
};
const tileCache = new Map<string, Float32Array>();

async function getTile(url: string) {
  const existing = tileCache.get(url);
  if (existing) return existing;
  const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error(`高程瓦片请求失败（${response.status}）`);
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(256, 256);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法解码高程数据');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = context.getImageData(0, 0, 256, 256).data;
  const elevations = new Float32Array(256 * 256);
  for (let i = 0; i < elevations.length; i++) elevations[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  const cleaned = despikeElevations(elevations, 256, 256);
  tileCache.set(url, cleaned);
  while (tileCache.size > 128) tileCache.delete(tileCache.keys().next().value!);
  return cleaned;
}

async function loadGrid(bbox: TerrainBounds, size: number, tileUrl: string) {
  // Fetch approximately two source pixels per output cell. Limit each patch to 36 tiles.
  let zoom = Math.max(0, Math.min(14, Math.ceil(Math.log2(size * 2 * 360 / (256 * (bbox[2] - bbox[0]))))));
  const extent = (z: number) => {
    const a = tilePosition(bbox[0], bbox[3], z), b = tilePosition(bbox[2], bbox[1], z);
    return [Math.floor(a[0]), Math.floor(a[1]), Math.floor(b[0]), Math.floor(b[1])];
  };
  let bounds = extent(zoom);
  while ((bounds[2] - bounds[0] + 1) * (bounds[3] - bounds[1] + 1) > 36 && zoom > 0) bounds = extent(--zoom);
  const keys: [number, number][] = [];
  for (let y = bounds[1]; y <= bounds[3]; y++) for (let x = bounds[0]; x <= bounds[2]; x++) keys.push([x, y]);
  const tiles = new Map<string, Float32Array>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, keys.length) }, async () => {
    while (cursor < keys.length) {
      const [x, y] = keys[cursor++];
      const url = tileUrl.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
      tiles.set(`${x}/${y}`, await getTile(url));
    }
  }));
  const pixel = (x: number, y: number) => {
    x = Math.max(bounds[0] * 256, Math.min((bounds[2] + 1) * 256 - 1, x));
    y = Math.max(bounds[1] * 256, Math.min((bounds[3] + 1) * 256 - 1, y));
    return tiles.get(`${Math.floor(x / 256)}/${Math.floor(y / 256)}`)![y % 256 * 256 + x % 256];
  };
  const values: number[] = [];
  for (let row = 0; row < size; row++) {
    const lat = bbox[3] - row / (size - 1) * (bbox[3] - bbox[1]);
    for (let col = 0; col < size; col++) {
      const [tx, ty] = tilePosition(bbox[0] + col / (size - 1) * (bbox[2] - bbox[0]), lat, zoom);
      const px = tx * 256, py = ty * 256, x = Math.floor(px), y = Math.floor(py), u = px - x, v = py - y;
      values.push((pixel(x, y) * (1 - u) + pixel(x + 1, y) * u) * (1 - v)
        + (pixel(x, y + 1) * (1 - u) + pixel(x + 1, y + 1) * u) * v);
    }
  }
  return { grid: smoothGrid({ width: size, height: size, values }), zoom };
}

async function build(request: TerrainRequest): Promise<ContourBundle> {
  const { item, bbox, referenceBbox, tileUrl } = request;
  const surfaceBbox = centredBounds((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, (bbox[2] - bbox[0]) * 5);
  // Sequential patches keep total provider concurrency bounded at six requests.
  const detail = await loadGrid(bbox, 321, tileUrl);
  const surround = await loadGrid(surfaceBbox, 193, tileUrl);
  const range = gridRange(detail.grid);
  const interval = contourInterval(range.max - range.min, item.scope,
    (bbox[2] - bbox[0]) / (referenceBbox[2] - referenceBbox[0]));
  const metadata = (grid: ContourGrid, bounds: TerrainBounds, zoom: number) => {
    const limits = gridRange(grid);
    return { ...item, bbox: bounds, crs: 'EPSG:4326' as const, elevationUnit: 'm' as const,
      minElevation: limits.min, maxElevation: limits.max, demo: false, coverage: 'bbox' as const,
      source: `Mapzen Terrain Tiles Terrarium z${zoom}`,
      attribution: 'Mapzen / Tilezen; USGS SRTM & GMTED2010; NOAA ETOPO1. https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
      processing: `Isolated native DEM spikes replaced by neighbour median only when deviation > max(80m, 8 MAD) and six neighbours agree; bilinear resampling to ${grid.width}×${grid.height}; one gentle Gaussian pass; contours intersect the same mesh triangles; no administrative clipping` };
  };
  return { referenceBbox, colorRange: [Math.min(0, range.min), range.max], metadata: { ...metadata(detail.grid, bbox, detail.zoom), interval, majorEvery: 5 },
    grid: detail.grid, contours: terrainContours(detail.grid, bbox, interval),
    surface: { metadata: metadata(surround.grid, surfaceBbox, surround.zoom), grid: surround.grid } };
}

// Each worker processes one view at a time. Canceled views terminate their worker.
self.onmessage = async ({ data }: MessageEvent<TerrainRequest>) => {
  try { self.postMessage({ bundle: await build(data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
