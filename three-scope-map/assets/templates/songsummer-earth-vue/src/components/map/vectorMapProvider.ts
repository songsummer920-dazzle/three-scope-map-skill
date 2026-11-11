// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import type { StyleSpecification } from 'maplibre-gl';
import type { GeoFeatureCollection, Position } from '../../types/geo';
import type {
  VectorMapCoordinateSystem,
  VectorMapPalette,
  VectorMapProviderConfig,
} from './vectorMapConfig';

const GCJ_PI = Math.PI;
const GCJ_AXIS = 6378245;
const GCJ_ECCENTRICITY = 0.00669342162296594323;

function outsideMainlandChina([longitude, latitude]: Position) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(longitude: number, latitude: number) {
  let result = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude
    + 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude));
  result += (20 * Math.sin(6 * longitude * GCJ_PI) + 20 * Math.sin(2 * longitude * GCJ_PI)) * 2 / 3;
  result += (20 * Math.sin(latitude * GCJ_PI) + 40 * Math.sin(latitude / 3 * GCJ_PI)) * 2 / 3;
  result += (160 * Math.sin(latitude / 12 * GCJ_PI) + 320 * Math.sin(latitude * GCJ_PI / 30)) * 2 / 3;
  return result;
}

function transformLongitude(longitude: number, latitude: number) {
  let result = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude
    + 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude));
  result += (20 * Math.sin(6 * longitude * GCJ_PI) + 20 * Math.sin(2 * longitude * GCJ_PI)) * 2 / 3;
  result += (20 * Math.sin(longitude * GCJ_PI) + 40 * Math.sin(longitude / 3 * GCJ_PI)) * 2 / 3;
  result += (150 * Math.sin(longitude / 12 * GCJ_PI) + 300 * Math.sin(longitude / 30 * GCJ_PI)) * 2 / 3;
  return result;
}

function wgs84ToGcj02(position: Position): Position {
  if (outsideMainlandChina(position)) return [...position];
  const [longitude, latitude] = position;
  let deltaLatitude = transformLatitude(longitude - 105, latitude - 35);
  let deltaLongitude = transformLongitude(longitude - 105, latitude - 35);
  const radianLatitude = latitude / 180 * GCJ_PI;
  let magic = Math.sin(radianLatitude);
  magic = 1 - GCJ_ECCENTRICITY * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLatitude = deltaLatitude * 180
    / ((GCJ_AXIS * (1 - GCJ_ECCENTRICITY)) / (magic * sqrtMagic) * GCJ_PI);
  deltaLongitude = deltaLongitude * 180
    / (GCJ_AXIS / sqrtMagic * Math.cos(radianLatitude) * GCJ_PI);
  return [longitude + deltaLongitude, latitude + deltaLatitude];
}

function gcj02ToBd09([longitude, latitude]: Position): Position {
  const radius = Math.sqrt(longitude * longitude + latitude * latitude)
    + 0.00002 * Math.sin(latitude * Math.PI * 3000 / 180);
  const angle = Math.atan2(latitude, longitude)
    + 0.000003 * Math.cos(longitude * Math.PI * 3000 / 180);
  return [radius * Math.cos(angle) + 0.0065, radius * Math.sin(angle) + 0.006];
}

export function projectWgs84Position(
  position: Position,
  coordinateSystem: VectorMapCoordinateSystem,
): Position {
  if (coordinateSystem === 'WGS84') return [...position];
  const gcj02 = wgs84ToGcj02(position);
  return coordinateSystem === 'BD09' ? gcj02ToBd09(gcj02) : gcj02;
}

function projectCoordinates(value: unknown, coordinateSystem: VectorMapCoordinateSystem): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return projectWgs84Position([value[0], value[1]], coordinateSystem);
  }
  return value.map((entry) => projectCoordinates(entry, coordinateSystem));
}

export function projectGeoDataForProvider(
  geoData: GeoFeatureCollection,
  coordinateSystem: VectorMapCoordinateSystem,
): GeoFeatureCollection {
  if (coordinateSystem === 'WGS84') return geoData;
  return {
    ...geoData,
    features: geoData.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        center: feature.properties.center
          ? projectWgs84Position(feature.properties.center, coordinateSystem)
          : undefined,
      },
      geometry: {
        ...feature.geometry,
        coordinates: projectCoordinates(
          feature.geometry.coordinates,
          coordinateSystem,
        ) as typeof feature.geometry.coordinates,
      },
    })),
  };
}

function openMapTilesLayers(
  source: string,
  palette: VectorMapPalette,
): StyleSpecification['layers'] {
  return [
    { id: 'basemap-background', type: 'background', paint: { 'background-color': palette.background } },
    { id: 'basemap-landcover', type: 'fill', source, 'source-layer': 'landcover', paint: { 'fill-color': palette.park, 'fill-opacity': 0.76 } },
    { id: 'basemap-landuse', type: 'fill', source, 'source-layer': 'landuse', paint: { 'fill-color': palette.landuse, 'fill-opacity': 0.62 } },
    { id: 'basemap-water', type: 'fill', source, 'source-layer': 'water', paint: { 'fill-color': palette.water } },
    { id: 'basemap-waterway', type: 'line', source, 'source-layer': 'waterway', paint: { 'line-color': palette.waterway, 'line-width': 0.8 } },
    { id: 'basemap-building', type: 'fill', source, 'source-layer': 'building', minzoom: 12, paint: { 'fill-color': palette.building, 'fill-opacity': 0.72 } },
    { id: 'basemap-boundary', type: 'line', source, 'source-layer': 'boundary', paint: { 'line-color': palette.boundary, 'line-width': 0.7, 'line-opacity': 0.62 } },
    { id: 'basemap-road-minor', type: 'line', source, 'source-layer': 'transportation', paint: { 'line-color': palette.roadMinor, 'line-width': 0.8, 'line-opacity': 0.16 } },
    {
      id: 'basemap-road-secondary',
      type: 'line',
      source,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
      paint: { 'line-color': palette.roadSecondary, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 14, 1.7], 'line-opacity': 0.28 },
    },
    {
      id: 'basemap-road-major',
      type: 'line',
      source,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
      paint: { 'line-color': palette.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 14, 2.2], 'line-opacity': 0.4 },
    },
    {
      id: 'basemap-place-label',
      type: 'symbol',
      source,
      'source-layer': 'place',
      layout: {
        'text-field': ['coalesce', ['get', 'name:zh-Hans'], ['get', 'name:zh'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 10, 14],
      },
      paint: {
        'text-color': palette.label,
        'text-halo-color': palette.labelHalo,
        'text-halo-width': 1.2,
      },
    },
  ];
}

function openMapTilesStyle(
  sourceUrl: string,
  palette: VectorMapPalette,
  glyphsUrl: string,
  attribution?: string,
  tiles?: string[],
): StyleSpecification {
  const sourceName = 'replaceable-basemap';
  return {
    version: 8,
    glyphs: glyphsUrl,
    sources: {
      [sourceName]: tiles
        ? { type: 'vector', tiles, attribution, minzoom: 0, maxzoom: 14 }
        : { type: 'vector', url: sourceUrl, attribution },
    },
    layers: openMapTilesLayers(sourceName, palette),
  };
}

export async function createVectorMapStyle(
  provider: VectorMapProviderConfig,
  palette: VectorMapPalette,
): Promise<string | StyleSpecification> {
  const config = provider.basemap;
  if (config.type === 'style-url') return config.styleUrl;
  if (config.type === 'raster') {
    return {
      version: 8,
      sources: {
        'replaceable-basemap': {
          type: 'raster',
          tiles: config.tiles,
          tileSize: config.tileSize ?? 256,
          attribution: config.attribution ?? provider.attribution,
        },
      },
      layers: [{ id: 'replaceable-basemap', type: 'raster', source: 'replaceable-basemap' }],
    };
  }

  const glyphsUrl = config.glyphsUrl
    ?? provider.glyphsUrl
    ?? 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
  if (config.type === 'pmtiles') {
    return openMapTilesStyle(
      `pmtiles://${config.url}`,
      palette,
      glyphsUrl,
      config.attribution ?? provider.attribution,
    );
  }
  const style = openMapTilesStyle(
    '',
    palette,
    glyphsUrl,
    config.attribution ?? provider.attribution,
    config.tiles,
  );
  const source = style.sources['replaceable-basemap'];
  if (source.type === 'vector') {
    source.minzoom = config.minzoom ?? 0;
    source.maxzoom = config.maxzoom ?? 14;
  }
  return style;
}

function appendQuery(url: string, query?: Record<string, string>) {
  if (!query || Object.keys(query).length === 0 || url.startsWith('pmtiles://')) return url;
  const parsed = new URL(url, window.location.href);
  Object.entries(query).forEach(([key, value]) => parsed.searchParams.set(key, value));
  return parsed.href;
}

export function createProviderRequestTransform(provider: VectorMapProviderConfig) {
  return (sourceUrl: string) => {
    let url = provider.request?.rewriteUrl?.(sourceUrl) ?? sourceUrl;
    const proxy = provider.developmentProxy;
    if (import.meta.env.DEV && proxy && url.startsWith(`${proxy.origin}/`)) {
      url = `${window.location.origin}${proxy.path}/${url.slice(proxy.origin.length + 1)}`;
    }
    return {
      url: appendQuery(url, provider.request?.query),
      headers: provider.request?.headers,
    };
  };
}

export type HydratedVectorStyle = {
  style: string | StyleSpecification;
  hydrated: boolean;
};

export async function hydrateVectorStyle(
  style: string | StyleSpecification,
  provider: VectorMapProviderConfig,
): Promise<HydratedVectorStyle> {
  if (typeof style !== 'string') return { style, hydrated: true };
  const transformRequest = createProviderRequestTransform(provider);
  try {
    const styleRequest = transformRequest(new URL(style, window.location.href).href);
    const styleResponse = await fetch(styleRequest.url, { headers: styleRequest.headers });
    if (!styleResponse.ok) return { style, hydrated: false };
    const hydrated = await styleResponse.json() as StyleSpecification;
    const sources = hydrated.sources as Record<string, Record<string, unknown>>;
    await Promise.all(Object.values(sources).map(async (source) => {
      if (source.type !== 'vector' || typeof source.url !== 'string') return;
      const sourceRequest = transformRequest(source.url);
      const tileJsonResponse = await fetch(sourceRequest.url, { headers: sourceRequest.headers });
      if (!tileJsonResponse.ok) return;
      const tileJson = await tileJsonResponse.json() as {
        tiles?: string[];
        minzoom?: number;
        maxzoom?: number;
        bounds?: [number, number, number, number];
        attribution?: string;
      };
      if (!tileJson.tiles?.length) return;
      source.tiles = tileJson.tiles.map((url) => transformRequest(url).url);
      if (tileJson.minzoom !== undefined) source.minzoom = tileJson.minzoom;
      if (tileJson.maxzoom !== undefined) source.maxzoom = tileJson.maxzoom;
      if (tileJson.bounds) source.bounds = tileJson.bounds;
      if (tileJson.attribution) source.attribution = tileJson.attribution;
      delete source.url;
    }));
    if (typeof hydrated.glyphs === 'string') hydrated.glyphs = transformRequest(hydrated.glyphs).url;
    if (typeof hydrated.sprite === 'string') hydrated.sprite = transformRequest(hydrated.sprite).url;
    if (provider.glyphsUrl) hydrated.glyphs = transformRequest(provider.glyphsUrl).url;
    return { style: hydrated, hydrated: true };
  } catch {
    return { style, hydrated: false };
  }
}
