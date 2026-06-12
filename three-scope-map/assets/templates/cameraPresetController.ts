// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

export type CameraViewPreset = {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
};

export type MapScope = 'world' | 'country' | 'province' | 'city' | 'district';

export type CameraViewConfig = {
  default: CameraViewPreset;
  byScope?: Partial<Record<MapScope, CameraViewPreset>>;
};

export type SavedCameraViewConfig = {
  default?: CameraViewPreset;
  byScope?: Partial<Record<MapScope, CameraViewPreset>>;
};

export const defaultCameraViewConfig: CameraViewConfig = {
  default: {
    fov: 31,
    position: [72, -760, 500],
    target: [-18, -42, 8],
  },
  byScope: {},
};

function isNumberTuple(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

export function readSavedCameraView(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedCameraViewConfig | CameraViewPreset;
    if (isCameraViewPreset(parsed)) return { default: parsed };
    const savedConfig = parsed as SavedCameraViewConfig;
    return {
      default: isCameraViewPreset(savedConfig.default) ? savedConfig.default : undefined,
      byScope: Object.fromEntries(
        Object.entries(savedConfig.byScope ?? {}).filter(([, view]) => isCameraViewPreset(view)),
      ) as Partial<Record<MapScope, CameraViewPreset>>,
    } satisfies SavedCameraViewConfig;
  } catch {
    return {};
  }
}

function isCameraViewPreset(value: unknown): value is CameraViewPreset {
  const maybeView = value as Partial<CameraViewPreset> | undefined;
  return !!maybeView
    && typeof maybeView.fov === 'number'
    && isNumberTuple(maybeView.position)
    && isNumberTuple(maybeView.target);
}

function writeSavedCameraView(storageKey: string, config: SavedCameraViewConfig) {
  window.localStorage.setItem(storageKey, JSON.stringify(config));
}

export function resolveCameraView(
  scope: MapScope,
  storageKey: string,
  config = defaultCameraViewConfig,
) {
  const saved = readSavedCameraView(storageKey);
  return saved.byScope?.[scope]
    ?? saved.default
    ?? config.byScope?.[scope]
    ?? config.default;
}

export function applyCameraView(
  view: CameraViewPreset,
  camera: THREE.PerspectiveCamera,
  controls?: OrbitControls,
) {
  camera.fov = view.fov;
  camera.position.set(...view.position);
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.set(...view.target);
    controls.update();
  } else {
    camera.lookAt(...view.target);
  }
}

export function saveCameraView(
  storageKey: string,
  scope: MapScope,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  mode: 'default' | 'scope' = 'default',
) {
  const view: CameraViewPreset = {
    fov: camera.fov,
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
  };
  const saved = readSavedCameraView(storageKey);
  if (mode === 'default') {
    writeSavedCameraView(storageKey, { ...saved, default: view });
  } else {
    writeSavedCameraView(storageKey, {
      ...saved,
      byScope: {
        ...(saved.byScope ?? {}),
        [scope]: view,
      },
    });
  }
  return view;
}

export function resetCameraView(
  storageKey: string,
  scope: MapScope,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  mode: 'scope' | 'all' = 'all',
  config = defaultCameraViewConfig,
) {
  if (mode === 'all') {
    window.localStorage.removeItem(storageKey);
    applyCameraView(config.default, camera, controls);
    return;
  }

  const saved = readSavedCameraView(storageKey);
  const byScope = { ...(saved.byScope ?? {}) };
  delete byScope[scope];
  if (!saved.default && Object.keys(byScope).length === 0) {
    window.localStorage.removeItem(storageKey);
  } else {
    writeSavedCameraView(storageKey, { ...saved, byScope });
  }
  applyCameraView(resolveCameraView(scope, storageKey, config), camera, controls);
}
