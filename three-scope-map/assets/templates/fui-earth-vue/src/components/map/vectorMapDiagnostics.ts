// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import type {
  VectorBasemapConfig,
  VectorMapCoordinateSystem,
  VectorMapLayerRole,
} from './vectorMapConfig';

export type VectorMapDiagnostics = {
  version: 1;
  phase: 'initializing' | 'style-loaded' | 'idle' | 'error' | 'destroyed';
  providerId: string;
  basemapType: VectorBasemapConfig['type'];
  themeMode: 'dashboard-dark' | 'source';
  coordinateSystem: VectorMapCoordinateSystem;
  styleHydrated: boolean;
  styleLoaded: boolean;
  firstIdle: boolean;
  basemapSourceLoaded: boolean;
  sourceStates: Record<string, boolean>;
  roadLayerCount: number;
  labelLayerCount: number;
  roleCounts: Partial<Record<VectorMapLayerRole, number>>;
  navigationKey: string;
  camera: { zoom: number; bearing: number; pitch: number };
  errors: string[];
  updatedAt: string;
};

declare global {
  interface Window {
    __SUMMER_MAP_2D_DIAGNOSTICS__?: VectorMapDiagnostics;
  }
}

export function createVectorMapDiagnostics(
  providerId: string,
  basemapType: VectorBasemapConfig['type'],
  themeMode: 'dashboard-dark' | 'source',
  coordinateSystem: VectorMapCoordinateSystem,
): VectorMapDiagnostics {
  return {
    version: 1,
    phase: 'initializing',
    providerId,
    basemapType,
    themeMode,
    coordinateSystem,
    styleHydrated: false,
    styleLoaded: false,
    firstIdle: false,
    basemapSourceLoaded: false,
    sourceStates: {},
    roadLayerCount: 0,
    labelLayerCount: 0,
    roleCounts: {},
    navigationKey: '',
    camera: { zoom: 0, bearing: 0, pitch: 0 },
    errors: [],
    updatedAt: new Date().toISOString(),
  };
}

export function publishVectorMapDiagnostics(
  diagnostics: VectorMapDiagnostics,
  patch: Partial<VectorMapDiagnostics>,
) {
  Object.assign(diagnostics, patch, { updatedAt: new Date().toISOString() });
  if (typeof window === 'undefined') return;
  const snapshot = { ...diagnostics };
  window.__SUMMER_MAP_2D_DIAGNOSTICS__ = snapshot;
  document.documentElement.dataset.summerMap2dDiagnostics = JSON.stringify(snapshot);
}
