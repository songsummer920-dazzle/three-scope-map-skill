// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type {
  VectorMapLayerRole,
  VectorMapPalette,
  VectorMapSemanticTheme,
} from './vectorMapConfig';

export type VectorMapThemeReport = {
  roleCounts: Partial<Record<VectorMapLayerRole, number>>;
  roadLayerCount: number;
  labelLayerCount: number;
};

function layerDescriptor(layer: LayerSpecification) {
  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] ?? '' : '';
  const filter = 'filter' in layer ? JSON.stringify(layer.filter ?? '') : '';
  return `${layer.id} ${sourceLayer} ${filter}`.toLowerCase();
}

function matchesProviderHint(
  descriptor: string,
  role: VectorMapLayerRole,
  hints?: Partial<Record<VectorMapLayerRole, string[]>>,
) {
  return hints?.[role]?.some((pattern) => {
    try {
      return new RegExp(pattern, 'i').test(descriptor);
    } catch {
      return descriptor.includes(pattern.toLowerCase());
    }
  }) ?? false;
}

export function classifyVectorMapLayer(
  layer: LayerSpecification,
  hints?: Partial<Record<VectorMapLayerRole, string[]>>,
): VectorMapLayerRole {
  const descriptor = layerDescriptor(layer);
  const hintedRole = (Object.keys(hints ?? {}) as VectorMapLayerRole[])
    .find((role) => matchesProviderHint(descriptor, role, hints));
  if (hintedRole) return hintedRole;
  if (layer.type === 'background') return 'background';
  if (layer.type === 'raster') return 'raster';

  const vegetation = /park|wood|forest|grass|scrub|heath|meadow|orchard|vineyard|nursery|allotment|wetland|cemetery|pitch|golf|green|nature.reserve|protected/.test(descriptor);
  const water = /water|ocean|river|lake|canal|stream/.test(descriptor);
  const building = /building/.test(descriptor);
  const rail = /rail|transit/.test(descriptor);
  const casing = /casing|hatching/.test(descriptor);
  const majorRoad = /motorway|trunk|primary/.test(descriptor);
  const secondaryRoad = /secondary|tertiary/.test(descriptor);
  const road = /road|transportation|street|highway/.test(descriptor) || majorRoad || secondaryRoad;

  if (layer.type === 'fill') {
    if (water) return 'water';
    if (building) return 'building';
    if (vegetation) return 'vegetation';
    if (/landuse|landcover/.test(descriptor)) return 'landuse';
    return 'land';
  }
  if (layer.type === 'line') {
    if (water) return 'waterway';
    if (vegetation) return 'vegetation';
    if (rail) return 'rail';
    if (/boundary|admin/.test(descriptor)) return 'boundary';
    if (road) {
      if (majorRoad) return casing ? 'road-casing-major' : 'road-major';
      if (secondaryRoad) return casing ? 'road-casing-secondary' : 'road-secondary';
      return casing ? 'road-casing-minor' : 'road-minor';
    }
    return 'other';
  }
  if (layer.type === 'symbol') {
    if (layer.layout?.['text-field']) {
      if (/transportation_name|road|street|highway/.test(descriptor)) return 'road-label';
      if (/water_name|water|river|lake|ocean/.test(descriptor)) return 'water-label';
      if (/poi|aerodrome|mountain_peak/.test(descriptor)) return 'poi-label';
      if (/place|country|state|province|city|town|village/.test(descriptor)) return 'place-label';
      return 'other-label';
    }
    if (layer.layout?.['icon-image']) return 'icon';
  }
  return 'other';
}

function roadOpacity(role: VectorMapLayerRole, theme: VectorMapSemanticTheme) {
  if (role.endsWith('major')) return theme.opacity.roadMajor;
  if (role.endsWith('secondary')) return theme.opacity.roadSecondary;
  return theme.opacity.roadMinor;
}

function roadColor(role: VectorMapLayerRole, palette: VectorMapPalette) {
  if (role.endsWith('major')) return palette.roadMajor;
  if (role.endsWith('secondary')) return palette.roadSecondary;
  return palette.roadMinor;
}

export function compileVectorMapTheme(
  sourceStyle: StyleSpecification,
  palette: VectorMapPalette,
  theme: VectorMapSemanticTheme,
  hints?: Partial<Record<VectorMapLayerRole, string[]>>,
): { style: StyleSpecification; report: VectorMapThemeReport } {
  const roleCounts: Partial<Record<VectorMapLayerRole, number>> = {};
  let roadLayerCount = 0;
  let labelLayerCount = 0;
  const layers = sourceStyle.layers.map((sourceLayer) => {
    const layer = { ...sourceLayer } as LayerSpecification;
    if (sourceLayer.paint) layer.paint = { ...sourceLayer.paint } as typeof layer.paint;
    if (sourceLayer.layout) layer.layout = { ...sourceLayer.layout } as typeof layer.layout;
    const role = classifyVectorMapLayer(layer, hints);
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    if (role.startsWith('road-')) roadLayerCount += 1;
    if (role.endsWith('label')) labelLayerCount += 1;
    if (theme.mode === 'source' || layer.id.startsWith('current-administrative-region')) return layer;

    const mutableLayer = layer as LayerSpecification & {
      paint?: Record<string, unknown>;
      layout?: Record<string, unknown>;
    };
    const paint = mutableLayer.paint ??= {};
    try {
      if (role === 'background') paint['background-color'] = palette.background;
      else if (role === 'raster') {
        paint['raster-saturation'] = -0.82;
        paint['raster-brightness-min'] = 0.04;
        paint['raster-brightness-max'] = 0.34;
        paint['raster-opacity'] = 0.34;
      } else if (layer.type === 'fill') {
        const fillColor = role === 'water'
          ? palette.water
          : role === 'building'
            ? palette.building
            : role === 'vegetation'
              ? palette.park
              : role === 'landuse'
                ? palette.landuse
                : palette.land;
        const fillOpacity = role === 'building'
          ? theme.opacity.building
          : role === 'vegetation'
            ? theme.opacity.vegetation
            : role === 'landuse'
              ? theme.opacity.landuse
              : theme.opacity.land;
        paint['fill-color'] = fillColor;
        paint['fill-opacity'] = fillOpacity;
        if (role === 'vegetation') {
          paint['fill-outline-color'] = palette.landuse;
          delete paint['fill-pattern'];
        }
      } else if (layer.type === 'line') {
        if (role === 'waterway') {
          paint['line-color'] = palette.waterway;
          paint['line-opacity'] = 0.78;
        } else if (role === 'vegetation') {
          paint['line-color'] = palette.landuse;
          paint['line-opacity'] = 0.16;
        } else if (role === 'rail') {
          paint['line-color'] = palette.rail;
          paint['line-opacity'] = theme.opacity.rail;
        } else if (role === 'boundary') {
          paint['line-color'] = palette.boundary;
          paint['line-opacity'] = theme.opacity.boundary;
        } else if (role.startsWith('road-')) {
          paint['line-color'] = roadColor(role, palette);
          paint['line-opacity'] = roadOpacity(role, theme)
            * (role.includes('casing') ? theme.opacity.roadCasingScale : 1);
        } else {
          paint['line-color'] = palette.roadMinor;
          paint['line-opacity'] = 0.78;
        }
      } else if (layer.type === 'symbol') {
        if (layer.layout?.['text-field']) {
          paint['text-color'] = palette.label;
          paint['text-halo-color'] = palette.labelHalo;
          paint['text-halo-width'] = 1.35;
          paint['text-opacity'] = theme.opacity.labels;
          if (role !== 'other-label') {
            const layout = mutableLayer.layout ??= {};
            layout['text-field'] = [
              'coalesce',
              ['get', 'name:zh-Hans'],
              ['get', 'name:zh'],
              ['get', 'name_zh'],
              ['get', 'name'],
            ];
          }
        }
        if (layer.layout?.['icon-image']) paint['icon-opacity'] = theme.opacity.icons;
      }
    } catch {
      // Provider-specific paint properties remain untouched when MapLibre rejects
      // an override. One unknown layer must never prevent the whole map loading.
    }
    return layer;
  });

  return {
    style: { ...sourceStyle, layers },
    report: { roleCounts, roadLayerCount, labelLayerCount },
  };
}

// CSS controls use the same semantic palette as the native map paint.
export function createVectorMapControlStyle(palette:VectorMapPalette){
  const alpha=(color:string,percent:number)=>`color-mix(in srgb, ${color} ${percent}%, transparent)`;
  return {
    '--map-accent':palette.administrativeFill,'--map-accent-soft':palette.administrativeLine,
    '--map-drill-text':palette.label,'--map-drill-text-alpha':alpha(palette.label,82),
    '--map-drill-border':alpha(palette.administrativeLine,52),
    '--map-drill-box-inner':alpha(palette.administrativeFill,12),
    '--map-drill-box-outer':alpha(palette.administrativeFill,15),
    '--map-drill-glow':alpha(palette.administrativeLine,22),
    '--map-drill-background':alpha(palette.background,92),
    '--vector-map-background':palette.background,
  };
}
