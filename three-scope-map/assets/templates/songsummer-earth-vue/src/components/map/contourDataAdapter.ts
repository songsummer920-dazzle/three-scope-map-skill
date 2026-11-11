// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import type { GeoFeatureCollection, Position } from '../../types/geo';
import type { MapNavigationItem } from './mapNavigation';
import type { ContourElevationUnit, ContourMapConfig } from './contourMapConfig';
import { isLocalTerrain, terrainReferenceBounds, type TerrainBounds } from './contourTerrainMath';
import { requestTerrain } from './contourTerrainSource';

export type ContourMetadata = {
  scope: MapNavigationItem['scope'];
  code: string;
  regionName: string;
  bbox: [number, number, number, number];
  crs: 'EPSG:4326';
  elevationUnit: ContourElevationUnit;
  minElevation: number;
  maxElevation: number;
  interval: number;
  majorEvery: number;
  source: string;
  attribution?: string;
  coverage?: 'bbox' | 'administrative-boundary';
  processing?: string;
  demo: boolean;
};

export type ContourLine = {
  elevation: number;
  major: boolean;
  coordinates: Position[];
};

export type ContourGrid = {
  width: number;
  height: number;
  values: number[];
};

export type ContourSurfaceMetadata = Omit<ContourMetadata, 'interval' | 'majorEvery'> & {
  coverage: 'bbox';
};

export type ContourSurface = {
  metadata: ContourSurfaceMetadata;
  grid: ContourGrid;
};

export type ContourBundle = {
  /** Stable geographic scale while the camera streams smaller/larger patches. */
  referenceBbox?: TerrainBounds;
  colorRange?: [number, number];
  metadata: ContourMetadata;
  grid: ContourGrid;
  contours: ContourLine[];
  /** Optional larger real DEM used only to keep the rotatable view inside data coverage. */
  surface?: ContourSurface;
};

const bundleCache = new Map<string, ContourBundle>();
const pendingBundles = new Map<string, Promise<ContourBundle>>();

function featureCode(feature: GeoFeatureCollection['features'][number]) {
  return String(feature.properties.adcode ?? feature.properties.code ?? feature.properties.id ?? '');
}

function visitCoordinates(value: unknown, visitor: (position: Position) => void) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    visitor([value[0], value[1]]);
    return;
  }
  value.forEach((item) => visitCoordinates(item, visitor));
}

export function geoDataBounds(geoData: GeoFeatureCollection): [number, number, number, number] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  geoData.features.forEach((feature) => {
    if (featureCode(feature).endsWith('_JD')) return;
    visitCoordinates(feature.geometry.coordinates, ([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) throw new Error('行政区 GeoJSON 缺少有效坐标');
  return [minX, minY, maxX, maxY];
}

function hashCode(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function demoGrid(code: string, width = 88, height = 72): ContourGrid {
  const seed = hashCode(code);
  const peaks = Array.from({ length: 6 }, (_, index) => ({
    x: 0.1 + (((seed >>> (index * 3)) & 31) / 31) * 0.8,
    y: 0.1 + (((seed >>> (index * 4 + 2)) & 31) / 31) * 0.8,
    radius: 0.055 + (((seed >>> (index * 2 + 1)) & 15) / 15) * 0.17,
    strength: 0.34 + (((seed >>> (index * 5 + 3)) & 15) / 15) * 0.62,
  }));
  const values: number[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const x = column / (width - 1);
      const y = row / (height - 1);
      let value = 0.08 + 0.1 * Math.sin(x * 9.2 + y * 3.1) + 0.07 * Math.cos(y * 11.4 - x * 2.7);
      peaks.forEach((peak) => {
        const dx = x - peak.x;
        const dy = y - peak.y;
        value += peak.strength * Math.exp(-(dx * dx + dy * dy) / (2 * peak.radius * peak.radius));
      });
      values.push(value);
    }
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { width, height, values: values.map((value) => (value - min) / Math.max(max - min, 1e-6) * 100) };
}

function interpolate(a: Position, b: Position, aValue: number, bValue: number, level: number): Position {
  const progress = Math.abs(bValue - aValue) < 1e-9 ? 0.5 : (level - aValue) / (bValue - aValue);
  return [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress];
}

function extractContours(
  grid: ContourGrid,
  bbox: [number, number, number, number],
  interval: number,
  majorEvery: number,
): ContourLine[] {
  const [minX, minY, maxX, maxY] = bbox;
  const point = (column: number, row: number): Position => [
    minX + column / (grid.width - 1) * (maxX - minX),
    maxY - row / (grid.height - 1) * (maxY - minY),
  ];
  const cases: Record<number, Array<[number, number]>> = {
    1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
    5: [[0, 1], [2, 3]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
    9: [[0, 2]], 10: [[0, 3], [1, 2]], 11: [[1, 2]], 12: [[3, 1]],
    13: [[0, 1]], 14: [[3, 0]],
  };
  const lines: ContourLine[] = [];
  for (let level = interval; level < 100; level += interval) {
    for (let row = 0; row < grid.height - 1; row += 1) {
      for (let column = 0; column < grid.width - 1; column += 1) {
        const index = row * grid.width + column;
        const values = [
          grid.values[index],
          grid.values[index + 1],
          grid.values[index + grid.width + 1],
          grid.values[index + grid.width],
        ];
        const mask = values.reduce((result, value, corner) => result | (value >= level ? 1 << corner : 0), 0);
        const segments = cases[mask];
        if (!segments) continue;
        const corners = [point(column, row), point(column + 1, row), point(column + 1, row + 1), point(column, row + 1)];
        const edges: Array<[number, number]> = [[0, 1], [1, 2], [3, 2], [0, 3]];
        segments.forEach(([edgeA, edgeB]) => {
          const [a0, a1] = edges[edgeA];
          const [b0, b1] = edges[edgeB];
          lines.push({
            elevation: level,
            major: Math.round(level / interval) % majorEvery === 0,
            coordinates: [
              interpolate(corners[a0], corners[a1], values[a0], values[a1], level),
              interpolate(corners[b0], corners[b1], values[b0], values[b1], level),
            ],
          });
        });
      }
    }
  }
  return lines;
}

function createDemoBundle(item: MapNavigationItem, geoData: GeoFeatureCollection): ContourBundle {
  const bbox = geoDataBounds(geoData);
  const grid = demoGrid(item.code);
  const intervalByScope = { world: 20, country: 10, province: 10, city: 5, district: 5 } as const;
  const interval = intervalByScope[item.scope];
  return {
    metadata: {
      scope: item.scope,
      code: item.code,
      regionName: item.regionName,
      bbox,
      crs: 'EPSG:4326',
      elevationUnit: 'relative',
      minElevation: 0,
      maxElevation: 100,
      interval,
      majorEvery: 5,
      source: 'bundled-relative-elevation-demo',
      coverage: 'bbox',
      demo: true,
    },
    grid,
    contours: extractContours(grid, bbox, interval, 5),
  };
}

function validateBundle(bundle: ContourBundle, item: MapNavigationItem) {
  if (bundle.metadata.code !== item.code || bundle.metadata.scope !== item.scope) {
    throw new Error(`等高线数据层级不匹配：期望 ${item.scope}:${item.code}`);
  }
  if (bundle.metadata.crs !== 'EPSG:4326') throw new Error('等高线发布包必须使用 EPSG:4326');
  if (bundle.grid.values.length !== bundle.grid.width * bundle.grid.height) throw new Error('等高线高程网格尺寸无效');
  if (!bundle.contours.length) throw new Error('等高线发布包不包含线数据');
  return bundle;
}

function validateSurface(surface: ContourSurface, item: MapNavigationItem) {
  if (surface.metadata.code !== item.code || surface.metadata.scope !== item.scope) {
    throw new Error(`外围高程表面层级不匹配：期望 ${item.scope}:${item.code}`);
  }
  if (surface.metadata.crs !== 'EPSG:4326') throw new Error('外围高程表面必须使用 EPSG:4326');
  if (surface.metadata.coverage !== 'bbox') throw new Error('外围高程表面必须提供完整 bbox 覆盖');
  if (surface.grid.values.length !== surface.grid.width * surface.grid.height) {
    throw new Error('外围高程网格尺寸无效');
  }
  return surface;
}

async function loadOptionalSurface(url: string, item: MapNavigationItem) {
  const response = await fetch(url);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return validateSurface(await response.json() as ContourSurface, item);
}

export async function loadContourBundle(
  item: MapNavigationItem,
  geoData: GeoFeatureCollection,
  config: ContourMapConfig,
  signal?: AbortSignal,
) {
  const key = `${item.scope}:${item.code}:${config.terrainTileUrl}:${config.dataBaseUrl}:${config.requireRealDem}:${config.allowDemoFallback}`;
  const cached = bundleCache.get(key);
  if (cached) return cached;
  // Navigation-scoped cancellation must not share an aborted worker promise.
  if (isLocalTerrain(item.scope)) {
    const referenceBbox = terrainReferenceBounds(geoDataBounds(geoData));
    const bundle = await requestTerrain({ item, referenceBbox, bbox: referenceBbox, tileUrl: config.terrainTileUrl }, signal);
    bundleCache.set(key, bundle);
    while (bundleCache.size > 8) bundleCache.delete(bundleCache.keys().next().value!);
    return bundle;
  }
  const pending = pendingBundles.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const directoryUrl = `${config.dataBaseUrl}/${item.scope}/${encodeURIComponent(item.code)}`;
    const url = `${directoryUrl}/bundle.json`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bundle = validateBundle(await response.json() as ContourBundle, item);
      bundle.surface = await loadOptionalSurface(`${directoryUrl}/surface.json`, item);
      if (config.requireRealDem && (bundle.metadata.demo || bundle.metadata.elevationUnit !== 'm')) {
        throw new Error('当前部署要求真实 DEM，但发布包仅包含演示或相对高程数据');
      }
      if (config.requireRealDem && bundle.surface
        && (bundle.surface.metadata.demo || bundle.surface.metadata.elevationUnit !== 'm')) {
        throw new Error('当前部署要求真实 DEM，但外围高程表面不是米制真实数据');
      }
      bundleCache.set(key, bundle);
      return bundle;
    } catch (error) {
      if (config.requireRealDem || !config.allowDemoFallback) throw error;
      const demoBundle = createDemoBundle(item, geoData);
      bundleCache.set(key, demoBundle);
      return demoBundle;
    }
  })();
  pendingBundles.set(key, promise);
  try {
    return await promise;
  } finally {
    pendingBundles.delete(key);
  }
}

export function clearContourBundleCache() {
  bundleCache.clear();
}
