// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import type { ContourGrid, ContourLine } from './contourDataAdapter';

export type TerrainBounds = [number, number, number, number];
export const isLocalTerrain = (scope: string) => ['province', 'city', 'district'].includes(scope);

export function tilePosition(longitude: number, latitude: number, zoom: number) {
  const sin = Math.sin(Math.max(-85, Math.min(85, latitude)) * Math.PI / 180);
  return [(longitude + 180) / 360 * 2 ** zoom,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** zoom];
}

export function centredBounds(longitude: number, latitude: number, longitudeSpan: number): TerrainBounds {
  const latitudeSpan = longitudeSpan * Math.cos(latitude * Math.PI / 180);
  return [Math.max(-179.99, longitude - longitudeSpan / 2), Math.max(-84, latitude - latitudeSpan / 2),
    Math.min(179.99, longitude + longitudeSpan / 2), Math.min(84, latitude + latitudeSpan / 2)];
}

export function terrainReferenceBounds(bbox: TerrainBounds): TerrainBounds {
  const latitude = (bbox[1] + bbox[3]) / 2;
  const span = Math.max(bbox[2] - bbox[0], (bbox[3] - bbox[1]) / Math.cos(latitude * Math.PI / 180), 0.015);
  return centredBounds((bbox[0] + bbox[2]) / 2, latitude, span * 1.12);
}

export function smoothGrid(grid: ContourGrid): ContourGrid {
  const { width, height, values } = grid;
  // One gentle separable Gaussian pass. The same result drives both surface and lines.
  const horizontal = values.map((v, i) => (values[i % width ? i - 1 : i] + 6 * v
    + values[i % width < width - 1 ? i + 1 : i]) / 8);
  return { width, height, values: horizontal.map((v, i) =>
    (horizontal[i >= width ? i - width : i] + 6 * v + horizontal[i < width * (height - 1) ? i + width : i]) / 8) };
}

/** Replace isolated DEM spikes only when at least six neighbours agree. */
export function despikeElevations(values: Float32Array, width: number, height: number) {
  const result = values.slice();
  for (let row = 1; row < height - 1; row++) for (let col = 1; col < width - 1; col++) {
    const i = row * width + col;
    const neighbours = [values[i - width - 1], values[i - width], values[i - width + 1], values[i - 1],
      values[i + 1], values[i + width - 1], values[i + width], values[i + width + 1]].sort((a, b) => a - b);
    const median = (neighbours[3] + neighbours[4]) / 2;
    const deviations = neighbours.map(v => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = (deviations[3] + deviations[4]) / 2;
    if (Math.abs(values[i] - median) > Math.max(80, 8 * mad)
      && deviations.filter(d => d <= Math.max(20, 3 * mad)).length >= 6) result[i] = median;
  }
  return result;
}

export function gridRange(grid: ContourGrid) {
  let min = Infinity, max = -Infinity;
  for (const value of grid.values) { min = Math.min(min, value); max = Math.max(max, value); }
  return { min, max };
}

export function contourInterval(range: number, scope: string, detail = 1) {
  const floor = scope === 'province' ? 50 : scope === 'city' ? 20 : 5;
  const desired = Math.max(floor * detail, range / 40, 2);
  const scale = 10 ** Math.floor(Math.log10(desired));
  return ([1, 2, 2.5, 5, 10].find(n => n * scale >= desired) ?? 10) * scale;
}

/** Intersect the actual mesh triangles, so lines never float over a bilinear saddle. */
export function terrainContours(grid: ContourGrid, bbox: TerrainBounds, interval: number): ContourLine[] {
  const lines: ContourLine[] = [];
  const { width, height, values } = grid;
  const point = (i: number): [number, number] => [bbox[0] + (i % width) / (width - 1) * (bbox[2] - bbox[0]),
    bbox[3] - Math.floor(i / width) / (height - 1) * (bbox[3] - bbox[1])];
  function triangle(indices: number[]) {
    const heights = indices.map(i => values[i]);
    const min = Math.min(...heights), max = Math.max(...heights);
    for (let n = Math.ceil(min / interval); n * interval < max; n++) {
      const elevation = n * interval;
      const coordinates: [number, number][] = [];
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        if ((heights[i] < elevation) === (heights[j] < elevation)) continue;
        const a = point(indices[i]), b = point(indices[j]);
        const t = (elevation - heights[i]) / (heights[j] - heights[i]);
        coordinates.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      if (coordinates.length === 2 && (Math.abs(coordinates[0][0] - coordinates[1][0]) > 1e-12
        || Math.abs(coordinates[0][1] - coordinates[1][1]) > 1e-12)) lines.push({ elevation, major: n % 5 === 0, coordinates });
    }
  }
  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width - 1; col++) {
      const i = row * width + col;
      triangle([i, i + width, i + 1]);
      triangle([i + 1, i + width, i + width + 1]);
    }
  }
  // Join shared triangle endpoints before crossing the worker boundary. This avoids
  // cloning hundreds of thousands of tiny objects without altering line geometry.
  const key = (line: ContourLine, i: number) => `${line.elevation}:${line.coordinates[i][0].toFixed(9)},${line.coordinates[i][1].toFixed(9)}`;
  const adjacency = new Map<string, number[]>();
  lines.forEach((line, i) => {
    for (let end = 0; end < 2; end++) {
      const k = key(line, end);
      const neighbours = adjacency.get(k) ?? [];
      neighbours.push(i);
      adjacency.set(k, neighbours);
    }
  });
  const visited = new Uint8Array(lines.length);
  const joined: ContourLine[] = [];
  function walk(index: number, start: number) {
    const first = lines[index];
    const coordinates = [first.coordinates[start]];
    let edge: number | undefined = index;
    let endpoint = key(first, start);
    while (edge !== undefined && !visited[edge]) {
      visited[edge] = 1;
      const segment = lines[edge];
      const end = key(segment, 0) === endpoint ? 1 : 0;
      coordinates.push(segment.coordinates[end]);
      endpoint = key(segment, end);
      edge = adjacency.get(endpoint)?.find(candidate => !visited[candidate]);
    }
    joined.push({ elevation: first.elevation, major: first.major, coordinates });
  }
  lines.forEach((line, i) => {
    if (visited[i]) return;
    if (adjacency.get(key(line, 0))!.length === 1) walk(i, 0);
    else if (adjacency.get(key(line, 1))!.length === 1) walk(i, 1);
  });
  lines.forEach((_, i) => { if (!visited[i]) walk(i, 0); });
  return joined;
}
