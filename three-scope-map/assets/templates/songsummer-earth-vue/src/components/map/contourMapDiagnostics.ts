// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

export type ContourMapDiagnostics = {
  renderer: 'three-contour-terrain';
  phase: 'created' | 'loading' | 'ready' | 'error' | 'destroyed';
  navigationKey: string;
  source: string;
  demoData: boolean;
  elevationUnit: 'm' | 'relative';
  coverage: 'bbox';
  contourBbox: [number, number, number, number];
  surfaceBbox: [number, number, number, number];
  overscanSurface: boolean;
  contourFeatureCount: number;
  meshVertexCount: number;
  meshTriangleCount: number;
  verticalExaggeration: number;
  interval: number;
  detailUpdates: number;
  flatTerrain: boolean;
  rotatable: true;
  firstFrameRendered: boolean;
  canvasWidth: number;
  canvasHeight: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  errors: string[];
};

declare global {
  interface Window {
    __SUMMER_MAP_CONTOUR_DIAGNOSTICS__?: ContourMapDiagnostics;
  }
}

export function createContourMapDiagnostics(): ContourMapDiagnostics {
  return {
    renderer: 'three-contour-terrain',
    phase: 'created',
    navigationKey: '',
    source: '',
    demoData: false,
    elevationUnit: 'relative',
    coverage: 'bbox',
    contourBbox: [0, 0, 0, 0],
    surfaceBbox: [0, 0, 0, 0],
    overscanSurface: false,
    contourFeatureCount: 0,
    meshVertexCount: 0,
    meshTriangleCount: 0,
    verticalExaggeration: 0,
    interval: 0,
    detailUpdates: 0,
    flatTerrain: false,
    rotatable: true,
    firstFrameRendered: false,
    canvasWidth: 0,
    canvasHeight: 0,
    cameraPosition: [0, 0, 0],
    cameraTarget: [0, 0, 0],
    errors: [],
  };
}

export function publishContourMapDiagnostics(
  diagnostics: ContourMapDiagnostics,
  patch: Partial<ContourMapDiagnostics>,
) {
  Object.assign(diagnostics, patch);
  if (typeof window === 'undefined') return;
  window.__SUMMER_MAP_CONTOUR_DIAGNOSTICS__ = { ...diagnostics, errors: [...diagnostics.errors] };
  document.documentElement.dataset.summerMapContourDiagnostics = JSON.stringify(
    window.__SUMMER_MAP_CONTOUR_DIAGNOSTICS__,
  );
}
