// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import diffuseMapUrl from '../../assets/textures/map/terrain-diffuse.jpg';
import heightMapUrl from '../../assets/textures/map/terrain-height.jpg';
import normalMapUrl from '../../assets/textures/map/terrain-normal.jpg';
import roughnessMapUrl from '../../assets/textures/map/terrain-roughness.jpg';
import { mapTheme } from './mapTheme';

export type MapTerrainMaterialConfig = {
  elevationScale: number;
  normalStrength: number;
  roughness: number;
  textureOpacity: number;
};

export const mapTerrainMaterialConfig: MapTerrainMaterialConfig = {
  elevationScale: 11.5,
  normalStrength: 1.08,
  roughness: 0.94,
  textureOpacity: 0.92,
};

type TerrainTextures = {
  diffuseMap: THREE.Texture;
  displacementMap: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
};

let terrainTextures: TerrainTextures | undefined;
let terrainTexturesReady: Promise<TerrainTextures> | undefined;

function configureTexture(texture: THREE.Texture, isColorMap = false) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.8, 2.15);
  texture.offset.set(0.07, 0.11);
  texture.rotation = -0.08;
  texture.center.set(0.5, 0.5);
  texture.anisotropy = 8;
  if (isColorMap) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

export function getTerrainTextures() {
  if (!terrainTextures) {
    const loader = new THREE.TextureLoader();
    let resolveReady: ((textures: TerrainTextures) => void) | undefined;
    let pendingTextures = 4;
    terrainTexturesReady = new Promise<TerrainTextures>((resolve) => {
      resolveReady = resolve;
    });
    const markTextureReady = () => {
      pendingTextures -= 1;
      if (pendingTextures === 0 && terrainTextures && resolveReady) resolveReady(terrainTextures);
    };
    const loadTexture = (url: string, isColorMap = false) => configureTexture(
      loader.load(url, markTextureReady, undefined, markTextureReady),
      isColorMap,
    );
    terrainTextures = {
      diffuseMap: loadTexture(diffuseMapUrl, true),
      displacementMap: loadTexture(heightMapUrl),
      normalMap: loadTexture(normalMapUrl),
      roughnessMap: loadTexture(roughnessMapUrl),
    };
  }
  return terrainTextures;
}

export async function waitForTerrainTexturesReady() {
  const textures = getTerrainTextures();
  await terrainTexturesReady;
  return textures;
}

export function createMapTerrainMaterial(
  config: MapTerrainMaterialConfig = mapTerrainMaterialConfig,
) {
  const textures = getTerrainTextures();
  const material = new THREE.MeshStandardMaterial({
    color: mapTheme.terrainColor,
    emissive: mapTheme.terrainEmissive,
    emissiveIntensity: 0.12,
    map: textures.diffuseMap,
    displacementMap: textures.displacementMap,
    displacementScale: config.elevationScale,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(config.normalStrength, config.normalStrength),
    roughnessMap: textures.roughnessMap,
    roughness: config.roughness,
    metalness: 0.03,
    transparent: true,
    opacity: config.textureOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  material.userData.terrainConfig = { ...config };
  return material;
}
