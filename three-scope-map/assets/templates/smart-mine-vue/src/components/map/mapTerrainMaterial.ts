import * as THREE from 'three';
import diffuseMapUrl from '../../assets/textures/map/terrain-diffuse.jpg';
import heightMapUrl from '../../assets/textures/map/terrain-height.jpg';
import normalMapUrl from '../../assets/textures/map/terrain-normal.jpg';
import roughnessMapUrl from '../../assets/textures/map/terrain-roughness.jpg';

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
    terrainTextures = {
      diffuseMap: configureTexture(loader.load(diffuseMapUrl), true),
      displacementMap: configureTexture(loader.load(heightMapUrl)),
      normalMap: configureTexture(loader.load(normalMapUrl)),
      roughnessMap: configureTexture(loader.load(roughnessMapUrl)),
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
