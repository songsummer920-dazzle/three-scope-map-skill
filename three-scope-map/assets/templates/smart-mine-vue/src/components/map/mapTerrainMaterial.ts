// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';

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

function pseudoNoise(x: number, y: number, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function fractalNoise(x: number, y: number, seed = 0) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < 5; i += 1) {
    value += pseudoNoise(x * frequency, y * frequency, seed + i) * amplitude;
    amplitude *= 0.52;
    frequency *= 2.05;
  }
  return value;
}

function createTerrainCanvas(kind: 'diffuse' | 'height' | 'normal' | 'roughness', size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const ridge = Math.abs(fractalNoise(u * 3.4, v * 4.1, 2) - 0.5) * 2;
      const vein = Math.abs(Math.sin((u * 14.0 + v * 8.5 + fractalNoise(u * 5, v * 5, 4) * 2.8) * Math.PI));
      const terrain = Math.min(1, ridge * 0.62 + vein * 0.22 + fractalNoise(u * 9, v * 9, 8) * 0.18);
      const i = (y * size + x) * 4;

      if (kind === 'diffuse') {
        image.data[i] = 8 + terrain * 18;
        image.data[i + 1] = 18 + terrain * 34;
        image.data[i + 2] = 8 + terrain * 12;
      } else if (kind === 'height') {
        const h = 58 + terrain * 150;
        image.data[i] = h;
        image.data[i + 1] = h;
        image.data[i + 2] = h;
      } else if (kind === 'normal') {
        const dx = fractalNoise((u + 0.006) * 5, v * 5, 5) - fractalNoise((u - 0.006) * 5, v * 5, 5);
        const dy = fractalNoise(u * 5, (v + 0.006) * 5, 5) - fractalNoise(u * 5, (v - 0.006) * 5, 5);
        image.data[i] = 128 + dx * 220;
        image.data[i + 1] = 128 + dy * 220;
        image.data[i + 2] = 210;
      } else {
        const r = 150 + terrain * 78;
        image.data[i] = r;
        image.data[i + 1] = r;
        image.data[i + 2] = r;
      }
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

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

function createProceduralTexture(kind: 'diffuse' | 'height' | 'normal' | 'roughness', isColorMap = false) {
  const texture = new THREE.CanvasTexture(createTerrainCanvas(kind));
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return configureTexture(texture, isColorMap);
}

export function getTerrainTextures() {
  if (!terrainTextures) {
    terrainTextures = {
      diffuseMap: createProceduralTexture('diffuse', true),
      displacementMap: createProceduralTexture('height'),
      normalMap: createProceduralTexture('normal'),
      roughnessMap: createProceduralTexture('roughness'),
    };
  }
  return terrainTextures;
}

export function createMapTerrainMaterial(
  config: MapTerrainMaterialConfig = mapTerrainMaterialConfig,
) {
  const textures = getTerrainTextures();
  const material = new THREE.MeshStandardMaterial({
    color: '#0a1607',
    emissive: '#101d08',
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
