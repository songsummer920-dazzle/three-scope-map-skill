// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import {MAP_THEME_PRIMARY,deriveLegacyThemeColorForPrimary,isLegacyMapThemePrimary,normalizeMapThemePrimary} from './mapTheme';

export type VectorMapThemeMode = 'dashboard-dark' | 'source';
export type VectorMapCoordinateSystem = 'WGS84' | 'GCJ02' | 'BD09';

export type VectorMapLayerRole =
  | 'background'
  | 'raster'
  | 'land'
  | 'landuse'
  | 'vegetation'
  | 'water'
  | 'waterway'
  | 'building'
  | 'boundary'
  | 'road-major'
  | 'road-secondary'
  | 'road-minor'
  | 'road-casing-major'
  | 'road-casing-secondary'
  | 'road-casing-minor'
  | 'rail'
  | 'place-label'
  | 'water-label'
  | 'road-label'
  | 'poi-label'
  | 'other-label'
  | 'icon'
  | 'other';

export type VectorMapPalette = {
  background: string;
  land: string;
  landuse: string;
  park: string;
  water: string;
  waterway: string;
  building: string;
  boundary: string;
  roadMajor: string;
  roadSecondary: string;
  roadMinor: string;
  rail: string;
  label: string;
  labelHalo: string;
  administrativeFill: string;
  administrativeLine: string;
};

export type VectorBasemapConfig =
  | {
      type: 'style-url';
      styleUrl: string;
      theme?: VectorMapThemeMode;
    }
  | {
      type: 'raster';
      tiles: string[];
      tileSize?: number;
      attribution?: string;
    }
  | {
      type: 'vector-tiles';
      tiles: string[];
      attribution?: string;
      minzoom?: number;
      maxzoom?: number;
      glyphsUrl?: string;
    }
  | {
      type: 'pmtiles';
      url: string;
      attribution?: string;
      glyphsUrl?: string;
    };

export type VectorMapProviderConfig = {
  id: string;
  basemap: VectorBasemapConfig;
  coordinateSystem: VectorMapCoordinateSystem;
  attribution?: string;
  glyphsUrl?: string;
  layerRoleHints?: Partial<Record<VectorMapLayerRole, string[]>>;
  request?: {
    headers?: Record<string, string>;
    query?: Record<string, string>;
    rewriteUrl?: (url: string) => string;
  };
  developmentProxy?: {
    origin: string;
    path: string;
  };
};

export type VectorMapSemanticTheme = {
  mode: VectorMapThemeMode;
  opacity: {
    land: number;
    landuse: number;
    vegetation: number;
    building: number;
    boundary: number;
    roadMajor: number;
    roadSecondary: number;
    roadMinor: number;
    roadCasingScale: number;
    rail: number;
    labels: number;
    icons: number;
  };
};

export type VectorMapControlLayout = {
  top: string;
  right: string;
  bottom: string;
};

export type VectorMapRuntimeConfig = {
  primaryColor?:string;
  provider: VectorMapProviderConfig;
  maxPixelRatio: number;
  palette: VectorMapPalette;
  theme: VectorMapSemanticTheme;
  controls: VectorMapControlLayout;
};

type VectorMapRuntimeOverride = {
  primaryColor?:string;
  provider?: Partial<VectorMapProviderConfig> & { basemap?: VectorBasemapConfig };
  maxPixelRatio?: number;
  palette?: Partial<VectorMapPalette>;
  theme?: Partial<Omit<VectorMapSemanticTheme, 'opacity'>> & {
    opacity?: Partial<VectorMapSemanticTheme['opacity']>;
  };
  controls?: Partial<VectorMapControlLayout>;
  /** Backward-compatible aliases retained for existing customer integrations. */
  basemap?: VectorBasemapConfig;
  coordinateSystem?: VectorMapCoordinateSystem;
};

declare global {
  interface Window {
    __SUMMER_MAP_2D_CONFIG__?: VectorMapRuntimeOverride;
  }
}

export const defaultVectorMapPalette: VectorMapPalette = {
  background: '#071116',
  land: '#101d22',
  landuse: '#14252a',
  park: '#14252a',
  water: '#0a2a3a',
  waterway: '#23708a',
  building: '#28434a',
  boundary: '#42626c',
  roadMajor: '#2b454d',
  roadSecondary: '#253b42',
  roadMinor: '#1d3036',
  rail: '#29383d',
  label: '#c7dce2',
  labelHalo: '#071116',
  administrativeFill: '#35d8ff',
  administrativeLine: '#9cecf4',
};
export function createVectorMapPalette(primaryColor?:string):VectorMapPalette{
  const primary=normalizeMapThemePrimary(primaryColor??MAP_THEME_PRIMARY);
  // Keep the established green-preset/blue-gray-basemap composition exactly.
  // A requested custom primary uses the same semantic contrast hierarchy,
  // with the cyan administrative accent as the source hue for those roles.
  if(primaryColor===undefined&&isLegacyMapThemePrimary(primary))return {...defaultVectorMapPalette};
  return Object.fromEntries(Object.entries(defaultVectorMapPalette).map(([role,color])=>
    [role,deriveLegacyThemeColorForPrimary(primary,color,'#35d8ff')])) as VectorMapPalette;
}
export type VectorMapInstanceTheme={primaryColor?:string;palette?:Partial<VectorMapPalette>};

export const defaultVectorMapTheme: VectorMapSemanticTheme = {
  mode: 'dashboard-dark',
  opacity: {
    land: 0.92,
    landuse: 0.92,
    vegetation: 0.48,
    building: 0.84,
    boundary: 0.78,
    roadMajor: 0.4,
    roadSecondary: 0.28,
    roadMinor: 0.16,
    roadCasingScale: 0.35,
    rail: 0.22,
    labels: 1,
    icons: 0.74,
  },
};

const defaultBasemap: VectorBasemapConfig = {
  type: 'style-url',
  styleUrl: import.meta.env.VITE_MAP_2D_STYLE_URL
    || (import.meta.env.DEV
      ? '/openfreemap/styles/liberty'
      : 'https://tiles.openfreemap.org/styles/liberty'),
  theme: 'dashboard-dark',
};

const defaultProvider: VectorMapProviderConfig = {
  id: 'openfreemap',
  basemap: defaultBasemap,
  coordinateSystem: 'WGS84',
  developmentProxy: import.meta.env.DEV
    ? { origin: 'https://tiles.openfreemap.org', path: '/openfreemap' }
    : undefined,
};

const defaultControls: VectorMapControlLayout = {
  top: '168px',
  right: '444px',
  bottom: '96px',
};

export function getVectorMapConfig(instance:VectorMapInstanceTheme|string={}): VectorMapRuntimeConfig {
  const instanceTheme=typeof instance==='string'?{primaryColor:instance}:instance;
  const runtimeConfig = typeof window === 'undefined'
    ? undefined
    : window.__SUMMER_MAP_2D_CONFIG__;
  const providerOverride = runtimeConfig?.provider;
  const basemap = runtimeConfig?.basemap
    ?? providerOverride?.basemap
    ?? defaultProvider.basemap;
  const themeMode = runtimeConfig?.theme?.mode
    ?? (basemap.type === 'style-url' ? basemap.theme : undefined)
    ?? defaultVectorMapTheme.mode;
  const primaryColor=normalizeMapThemePrimary(instanceTheme.primaryColor??runtimeConfig?.primaryColor??MAP_THEME_PRIMARY);

  return {
    primaryColor,
    provider: {
      ...defaultProvider,
      ...providerOverride,
      basemap,
      coordinateSystem: runtimeConfig?.coordinateSystem
        ?? providerOverride?.coordinateSystem
        ?? defaultProvider.coordinateSystem,
      request: {
        ...defaultProvider.request,
        ...providerOverride?.request,
        headers: {
          ...defaultProvider.request?.headers,
          ...providerOverride?.request?.headers,
        },
        query: {
          ...defaultProvider.request?.query,
          ...providerOverride?.request?.query,
        },
      },
      layerRoleHints: {
        ...defaultProvider.layerRoleHints,
        ...providerOverride?.layerRoleHints,
      },
    },
    maxPixelRatio: runtimeConfig?.maxPixelRatio
      ?? (Number(import.meta.env.VITE_MAP_2D_MAX_PIXEL_RATIO) || 1.5),
    palette: {
      ...createVectorMapPalette(instanceTheme.primaryColor??runtimeConfig?.primaryColor),
      ...runtimeConfig?.palette,
      ...instanceTheme.palette,
    },
    theme: {
      ...defaultVectorMapTheme,
      ...runtimeConfig?.theme,
      mode: themeMode,
      opacity: {
        ...defaultVectorMapTheme.opacity,
        ...runtimeConfig?.theme?.opacity,
      },
    },
    controls: {
      ...defaultControls,
      ...runtimeConfig?.controls,
    },
  };
}
