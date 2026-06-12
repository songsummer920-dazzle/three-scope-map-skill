// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

export function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material?.dispose());
  });
}

export type ChunkedMapBuildContext = {
  scene: THREE.Scene;
  currentGroup?: THREE.Group;
  buildVersion: number;
  setBuildVersion: (version: number) => void;
  setCurrentGroup: (group: THREE.Group) => void;
};

export async function swapMapAfterChunkedBuild(
  context: ChunkedMapBuildContext,
  buildNextGroup: () => Promise<THREE.Group>,
) {
  const buildVersion = context.buildVersion + 1;
  context.setBuildVersion(buildVersion);
  const previousGroup = context.currentGroup;

  await waitForNextFrame();
  const nextGroup = await buildNextGroup();

  if (buildVersion !== context.buildVersion) {
    disposeObject3D(nextGroup);
    return;
  }

  if (previousGroup) {
    context.scene.remove(previousGroup);
    disposeObject3D(previousGroup);
  }

  context.scene.add(nextGroup);
  context.setCurrentGroup(nextGroup);
}
