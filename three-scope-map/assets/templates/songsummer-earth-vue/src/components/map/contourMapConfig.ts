// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import { mapTheme } from './mapTheme';
import type { MapNavigationItem } from './mapNavigation';

export type ContourElevationUnit = 'm' | 'relative';

export type ContourScopeStyle = {
  terrain?: {
    verticalExaggeration?: number;
    relativeElevationScale?: number;
    contourLift?: number;
    detailEdgeFeather?: number;
    contourEdgeFeather?: number;
  };
  lineStyle?: Partial<ContourMapConfig['lineStyle']>;
};

export type ContourMapConfig = {
  dataBaseUrl: string;
  terrainTileUrl: string;
  requireRealDem: boolean;
  allowDemoFallback: boolean;
  scopeStyles: Partial<Record<MapNavigationItem['scope'], ContourScopeStyle>>;
  terrain: {
    width: number;
    elevationScale: number;
    relativeElevationScale: number;
    contourLift: number;
    edgeFeather: number;
    detailEdgeFeather: number;
    contourEdgeFeather: number;
    roughness: number;
    metalness: number;
  };
  camera: {
    fov: number;
    near: number;
    far: number;
    position: [number, number, number];
    target: [number, number, number];
    minDistance: number;
    maxDistance: number;
    maxPanOffset: number;
    minPolarAngle: number;
    maxPolarAngle: number;
  };
  lineStyle: {
    minorColor: string;
    majorColor: string;
    minorOpacity: number;
    majorOpacity: number;
  };
  environment: {
    background: string;
    ground: string;
    fogDensity: number;
  };
};

type ContourMapRuntimeOverride = Partial<Omit<ContourMapConfig, 'terrain' | 'camera' | 'lineStyle' | 'environment'>> & {
  terrain?: Partial<ContourMapConfig['terrain']>;
  camera?: Partial<ContourMapConfig['camera']>;
  lineStyle?: Partial<ContourMapConfig['lineStyle']>;
  environment?: Partial<ContourMapConfig['environment']>;
  scopeStyles?: Partial<Record<MapNavigationItem['scope'], ContourScopeStyle>>;
};

declare global {
  interface Window {
    __SUMMER_CONTOUR_MAP_CONFIG__?: ContourMapRuntimeOverride;
  }
}

const defaultConfig: ContourMapConfig = {
  dataBaseUrl: '/maps/contours',
  terrainTileUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  requireRealDem: false,
  allowDemoFallback: true,
  scopeStyles: {
    province: {
      terrain: { verticalExaggeration: 10, contourLift: 0.002, detailEdgeFeather: 0.14, contourEdgeFeather: 0.05 },
      lineStyle: {
        minorColor: mapTheme.contour.localMinorLine,
        majorColor: mapTheme.contour.localMajorLine,
        minorOpacity: 0.2,
        majorOpacity: 0.7,
      },
    },
    city: {
      terrain: { verticalExaggeration: 5, contourLift: 0.002, detailEdgeFeather: 0.14, contourEdgeFeather: 0.05 },
      lineStyle: {
        minorColor: mapTheme.contour.localMinorLine,
        majorColor: mapTheme.contour.localMajorLine,
        minorOpacity: 0.23,
        majorOpacity: 0.74,
      },
    },
    district: {
      terrain: {
        verticalExaggeration: 2.5,
        relativeElevationScale: 0.012,
        contourLift: 0.002,
        detailEdgeFeather: 0.16,
        contourEdgeFeather: 0.05,
      },
      lineStyle: {
        minorColor: mapTheme.contour.localMinorLine,
        majorColor: mapTheme.contour.localMajorLine,
        minorOpacity: 0.26,
        majorOpacity: 0.78,
      },
    },
  },
  terrain: {
    width: 24,
    elevationScale: 0.00014,
    relativeElevationScale: 0.014,
    contourLift: 0.012,
    edgeFeather: 0.06,
    detailEdgeFeather: 0.12,
    contourEdgeFeather: 0.1,
    roughness: 0.88,
    metalness: 0.02,
  },
  camera: {
    fov: 38,
    near: 0.1,
    far: 180,
    position: [0, 5.8, 14.5],
    target: [0, 0.28, 0],
    minDistance: 5.5,
    maxDistance: 18,
    maxPanOffset: 2.5,
    minPolarAngle: 0.18,
    maxPolarAngle: 1.49,
  },
  lineStyle: {
    minorColor: mapTheme.contour.minorLine,
    majorColor: mapTheme.contour.majorLine,
    minorOpacity: 0.36,
    majorOpacity: 0.82,
  },
  environment: {
    background: mapTheme.contour.background,
    ground: '#020604',
    fogDensity: 0.006,
  },
};

export function getContourMapConfig(): ContourMapConfig {
  const runtime = typeof window === 'undefined' ? undefined : window.__SUMMER_CONTOUR_MAP_CONFIG__;
  return {
    ...defaultConfig,
    ...runtime,
    terrain: { ...defaultConfig.terrain, ...runtime?.terrain },
    camera: { ...defaultConfig.camera, ...runtime?.camera },
    lineStyle: { ...defaultConfig.lineStyle, ...runtime?.lineStyle },
    environment: { ...defaultConfig.environment, ...runtime?.environment },
    scopeStyles: { ...defaultConfig.scopeStyles, ...runtime?.scopeStyles },
  };
}

export function resolveContourScopeStyle(
  config: ContourMapConfig,
  scope: MapNavigationItem['scope'],
  bbox: [number, number, number, number],
  elevationUnit: ContourElevationUnit,
) {
  const override = config.scopeStyles[scope];
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = bbox;
  const middleLatitude = (minLatitude + maxLatitude) / 2 * Math.PI / 180;
  const physicalWidthMetres = Math.max(
    (maxLongitude - minLongitude) * Math.cos(middleLatitude) * 111_320,
    1,
  );
  const metresPerWorldUnit = physicalWidthMetres / config.terrain.width;
  const elevationScale = elevationUnit === 'm' && override?.terrain?.verticalExaggeration
    ? override.terrain.verticalExaggeration / metresPerWorldUnit
    : config.terrain.elevationScale;
  return {
    elevationScale: elevationUnit === 'm'
      ? elevationScale
      : override?.terrain?.relativeElevationScale ?? config.terrain.relativeElevationScale,
    contourLift: override?.terrain?.contourLift ?? config.terrain.contourLift,
    detailEdgeFeather: override?.terrain?.detailEdgeFeather ?? config.terrain.detailEdgeFeather,
    contourEdgeFeather: override?.terrain?.contourEdgeFeather ?? config.terrain.contourEdgeFeather,
    lineStyle: { ...config.lineStyle, ...override?.lineStyle },
  };
}
