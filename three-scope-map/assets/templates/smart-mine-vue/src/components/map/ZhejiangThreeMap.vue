<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="map-stage" :style="mapThemeStyle">
    <div ref="host" class="map-host" />
    <svg
      class="south-sea-inset"
      :class="{ 'is-visible': props.active && activeScope === 'country' }"
      :style="{ width: `${southSeaInsetWidth}px` }"
      viewBox="0 0 78 126"
      aria-hidden="true"
    >
      <rect class="south-sea-inset__frame" x="1.5" y="1.5" width="75" height="123" rx="2" />
      <path
        v-for="(path, index) in southSeaInsetPaths"
        :key="`south-sea-glow-${index}`"
        class="south-sea-inset__glow"
        :d="path"
      />
      <path
        v-for="(path, index) in southSeaInsetPaths"
        :key="`south-sea-line-${index}`"
        class="south-sea-inset__line"
        :d="path"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GeoFeatureCollection, Position } from '../../types/geo';
import { initialMapState, loadMapLevel, prefetchMapLevel, type MapScope, type MapState } from './mapDataAdapter';
import { createMapTerrainMaterial, waitForTerrainTexturesReady } from './mapTerrainMaterial';
import { mapTheme, mapThemeStyle } from './mapTheme';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

type MapFeature = GeoFeatureCollection['features'][number];
type MapLabel = { name: string; coord: Position; ripple?: boolean };
type CameraViewPreset = {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
};
type CameraViewConfig = {
  default: CameraViewPreset;
  byScope?: Partial<Record<MapScope, CameraViewPreset>>;
};
type SavedCameraViewConfig = {
  default?: CameraViewPreset;
  byScope?: Partial<Record<MapScope, CameraViewPreset>>;
};
type DrillStackItem = {
  state: MapState;
  cameraView?: CameraViewPreset;
};

const host = ref<HTMLElement>();
const southSeaInsetWidth = ref(78);
const props = withDefaults(defineProps<{
  active?: boolean;
}>(), {
  active: true,
});
const emit = defineEmits<{
  ready: [];
}>();
let renderer: THREE.WebGLRenderer | undefined;
let labelRenderer: CSS2DRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let controls: OrbitControls | undefined;
let raf = 0;
let resizeObserver: ResizeObserver | undefined;
let mapGroup: THREE.Group | undefined;
let ringDecorGroup: THREE.Group | undefined;
let provinceChaseLine: THREE.Mesh | undefined;
let provinceChasePath: {
  distances: Float32Array;
  total: number;
  tailLength: number;
} | undefined;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactiveMeshes: THREE.Mesh[] = [];
const featureMeshes = new Map<string, THREE.Mesh[]>();
const featureLiftGroups = new Map<string, THREE.Group[]>();
const featureSideMaterials = new Map<string, THREE.ShaderMaterial[]>();
const featureHighlightMaterials = new Map<string, THREE.MeshBasicMaterial[]>();
const featureByName = new Map<string, MapFeature>();
let worldHitMesh: THREE.Mesh | undefined;
const cityLabelElements = new Map<string, HTMLDivElement>();
type ProjectedPolygonLookup = {
  rings: Array<Array<readonly [number, number]>>;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
type ProvinceOuterEdge = { count: number; start: Position; end: Position };
let projectedMapPolygonsCache: ProjectedPolygonLookup[] | undefined;
let provinceOuterEdgesCache: ProvinceOuterEdge[] | undefined;
const flyLineMaterials: THREE.ShaderMaterial[] = [];
let hoveredFeature = '';
let isDrilling = false;
let hasEmittedReady = false;
let hasUserAdjustedCamera = false;
let hasRenderedStaticFrame = false;
let resolutionUpgradeHandle: number | undefined;
let currentState: MapState = initialMapState;
const activeScope = ref<MapScope>(initialMapState.scope);
let geoData = currentState.geoData;
let currentLabels: MapLabel[] = [];
let drillStack: DrillStackItem[] = [];
let drillControlEl: HTMLDivElement | undefined;
const mapWidth = 860;
const mapHeight = 530;
const mapPadding = 28;
const coastalFragmentFeatureNames = new Set(['舟山市', '宁波市', '台州市', '温州市']);
const minCoastalPolygonArea = 0.25;
const minInlandPolygonArea = 20;
const provinceChaseZ = 44.25;
const provinceChaseSegmentLength = 1.35;
const provinceChaseRibbonWidth = 2.02;
const provinceSilhouetteCellSize = 1.85;
const mapTransitionDuration = 0.78;
const southSeaInsetMinWidth = 62;
const southSeaInsetMaxWidth = 92;
const labelReferenceDistance = 880;
const cameraReferenceAspect = 16 / 9;
const cameraViewStorageKey = 'three-scope-map:smart-mine-template:camera-view:v2';
let cityLabelPresentationKey = '';
const cameraViewConfig: CameraViewConfig = {
  default: {
    fov: 31,
    position: [72, -760, 500],
    target: [-18, -42, 8],
  },
  byScope: {},
};
const provinceCapitalByName: Record<string, string> = {
  北京市: '北京市',
  天津市: '天津市',
  上海市: '上海市',
  重庆市: '重庆市',
  河北省: '石家庄市',
  山西省: '太原市',
  内蒙古自治区: '呼和浩特市',
  辽宁省: '沈阳市',
  吉林省: '长春市',
  黑龙江省: '哈尔滨市',
  江苏省: '南京市',
  浙江省: '杭州市',
  安徽省: '合肥市',
  福建省: '福州市',
  江西省: '南昌市',
  山东省: '济南市',
  河南省: '郑州市',
  湖北省: '武汉市',
  湖南省: '长沙市',
  广东省: '广州市',
  广西壮族自治区: '南宁市',
  海南省: '海口市',
  四川省: '成都市',
  贵州省: '贵阳市',
  云南省: '昆明市',
  西藏自治区: '拉萨市',
  陕西省: '西安市',
  甘肃省: '兰州市',
  青海省: '西宁市',
  宁夏回族自治区: '银川市',
  新疆维吾尔自治区: '乌鲁木齐市',
  台湾省: '台北市',
  香港特别行政区: '香港特别行政区',
  澳门特别行政区: '澳门特别行政区',
};
let lonMin = 0;
let lonMax = 0;
let latMin = 0;
let latMax = 0;
let mapScale = 1;
let projectedOffsetX = 0;
let projectedOffsetY = 0;
let mapBuildVersion = 0;
let rendererWarmupVersion = 0;

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function waitForPreloadSlice() {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function waitForBuildSlice() {
  return props.active ? waitForNextFrame() : waitForPreloadSlice();
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material?.dispose());
  });
}

function isCameraViewPreset(value: unknown): value is CameraViewPreset {
  const maybeView = value as Partial<CameraViewPreset> | undefined;
  return !!maybeView
    && typeof maybeView.fov === 'number'
    && Array.isArray(maybeView.position)
    && Array.isArray(maybeView.target)
    && maybeView.position.length === 3
    && maybeView.target.length === 3
    && maybeView.position.every((item) => typeof item === 'number' && Number.isFinite(item))
    && maybeView.target.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function readSavedCameraViewConfig(): SavedCameraViewConfig {
  try {
    const raw = window.localStorage.getItem(cameraViewStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedCameraViewConfig | CameraViewPreset;
    if (isCameraViewPreset(parsed)) return { default: parsed };

    const savedConfig = parsed as SavedCameraViewConfig;
    const byScope = Object.fromEntries(
      Object.entries(savedConfig.byScope ?? {}).filter(([, view]) => isCameraViewPreset(view)),
    ) as Partial<Record<MapScope, CameraViewPreset>>;

    return {
      default: isCameraViewPreset(savedConfig.default) ? savedConfig.default : undefined,
      byScope,
    };
  } catch {
    return {};
  }
}

function writeSavedCameraViewConfig(config: SavedCameraViewConfig) {
  window.localStorage.setItem(cameraViewStorageKey, JSON.stringify(config));
}

function fitBuiltInCameraViewToViewport(view: CameraViewPreset) {
  const { width, height } = getHostSize();
  const aspect = width / height;
  if (aspect >= cameraReferenceAspect) return view;

  const distanceScale = Math.min(1.5, (cameraReferenceAspect / aspect) * 1.02);
  const target = new THREE.Vector3(...view.target);
  const position = new THREE.Vector3(...view.position);
  position.sub(target).multiplyScalar(distanceScale).add(target);
  return {
    ...view,
    position: [position.x, position.y, position.z],
  } satisfies CameraViewPreset;
}

function resolveBuiltInCameraView(scope: MapScope) {
  return fitBuiltInCameraViewToViewport(
    cameraViewConfig.byScope?.[scope] ?? cameraViewConfig.default,
  );
}

function resolveInitialCameraView(scope: MapScope) {
  const saved = readSavedCameraViewConfig();
  return saved.byScope?.[scope]
    ?? saved.default
    ?? resolveBuiltInCameraView(scope);
}

function getCurrentCameraView() {
  if (!camera || !controls) return undefined;
  return {
    fov: camera.fov,
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
  } satisfies CameraViewPreset;
}

function saveCurrentCameraView(mode: 'default' | 'scope') {
  const view = getCurrentCameraView();
  if (!view) return;
  hasUserAdjustedCamera = true;
  const saved = readSavedCameraViewConfig();
  if (mode === 'default') {
    writeSavedCameraViewConfig({ default: view });
    return;
  }
  writeSavedCameraViewConfig({
    ...saved,
    byScope: {
      ...(saved.byScope ?? {}),
      [currentState.scope]: view,
    },
  });
}

function resetCameraView(mode: 'scope' | 'all') {
  hasUserAdjustedCamera = false;
  if (mode === 'all') {
    window.localStorage.removeItem(cameraViewStorageKey);
    applyCameraView(resolveBuiltInCameraView(currentState.scope));
    return;
  }

  const saved = readSavedCameraViewConfig();
  const byScope = { ...(saved.byScope ?? {}) };
  if (saved.default) {
    byScope[currentState.scope] = resolveBuiltInCameraView(currentState.scope);
  } else {
    delete byScope[currentState.scope];
  }
  const nextSaved = {
    ...saved,
    byScope,
  };
  const hasScopeOverrides = Object.keys(byScope).length > 0;
  if (!nextSaved.default && !hasScopeOverrides) {
    window.localStorage.removeItem(cameraViewStorageKey);
  } else {
    writeSavedCameraViewConfig(nextSaved);
  }
  applyCameraView(resolveBuiltInCameraView(currentState.scope));
}

function applyInitialCameraViewForCurrentScope() {
  applyCameraView(resolveInitialCameraView(currentState.scope));
}

function flashButtonText(button: HTMLButtonElement, text: string, fallbackText: string) {
  button.textContent = text;
  window.setTimeout(() => {
    if (button.isConnected) button.textContent = fallbackText;
  }, 1200);
}

function handleCameraControlAction(action: string | undefined, button: HTMLButtonElement) {
  if (action === 'save-view-default') {
    saveCurrentCameraView('default');
    flashButtonText(button, '已保存统一', '保存统一');
    return true;
  }
  if (action === 'save-view-scope') {
    saveCurrentCameraView('scope');
    flashButtonText(button, '已保存本层', '保存本层');
    return true;
  }
  if (action === 'reset-view-scope') {
    resetCameraView('scope');
    flashButtonText(button, '已恢复本层', '恢复本层');
    return true;
  }
  if (action === 'reset-view-all') {
    resetCameraView('all');
    flashButtonText(button, '已恢复全部', '恢复全部');
    return true;
  }
  return false;
}

function applyCameraView(view: CameraViewPreset) {
  if (!camera) return;
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

function updateSouthSeaInsetSize() {
  if (!camera || !controls) return;
  const cameraDistance = camera.position.distanceTo(controls.target);
  const zoomProgress = THREE.MathUtils.clamp(
    (cameraDistance - controls.minDistance)
      / Math.max(controls.maxDistance - controls.minDistance, 1),
    0,
    1,
  );
  const nextWidth = Math.round(
    THREE.MathUtils.lerp(southSeaInsetMaxWidth, southSeaInsetMinWidth, zoomProgress) * 10,
  ) / 10;
  if (nextWidth !== southSeaInsetWidth.value) southSeaInsetWidth.value = nextWidth;
}

function getCityLabelScale(cameraDistance: number) {
  if (!controls) return 0.75;
  if (cameraDistance <= labelReferenceDistance) {
    const nearProgress = THREE.MathUtils.clamp(
      (labelReferenceDistance - cameraDistance)
        / Math.max(labelReferenceDistance - controls.minDistance, 1),
      0,
      1,
    );
    return THREE.MathUtils.lerp(0.75, 1, THREE.MathUtils.smoothstep(nearProgress, 0, 1));
  }
  const farProgress = THREE.MathUtils.clamp(
    (cameraDistance - labelReferenceDistance)
      / Math.max(controls.maxDistance - labelReferenceDistance, 1),
    0,
    1,
  );
  return THREE.MathUtils.lerp(0.75, 0.62, THREE.MathUtils.smoothstep(farProgress, 0, 1));
}

function updateCityLabelPresentation() {
  if (!camera || !controls || !labelRenderer) return;
  const cameraDistance = camera.position.distanceTo(controls.target);
  const labelScale = getCityLabelScale(cameraDistance);
  const nextPresentationKey = [
    labelScale.toFixed(3),
    currentState.scope,
  ].join(':');
  if (nextPresentationKey === cityLabelPresentationKey) return;
  cityLabelPresentationKey = nextPresentationKey;

  const baseWidth = 68 * labelScale;
  const baseHeight = 41 * labelScale;
  const baseFontSize = THREE.MathUtils.lerp(
    8,
    10,
    THREE.MathUtils.clamp((labelScale - 0.62) / 0.38, 0, 1),
  );
  const selectedScale = 1.18;
  const style = labelRenderer.domElement.style;
  style.setProperty('--map-label-width', `${baseWidth.toFixed(1)}px`);
  style.setProperty('--map-label-height', `${baseHeight.toFixed(1)}px`);
  style.setProperty('--map-label-padding-x', `${(5 * labelScale).toFixed(1)}px`);
  style.setProperty('--map-label-padding-bottom', `${(11 * labelScale).toFixed(1)}px`);
  style.setProperty('--map-label-font-size', `${baseFontSize.toFixed(1)}px`);
  style.setProperty('--map-label-line-height', `${(baseFontSize * 1.4).toFixed(1)}px`);
  style.setProperty('--map-label-selected-width', `${(baseWidth * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-height', `${(baseHeight * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-padding-x', `${(5 * labelScale * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-padding-bottom', `${(11 * labelScale * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-font-size', `${(baseFontSize * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-line-height', `${(baseFontSize * selectedScale * 1.4).toFixed(1)}px`);
}

function updateCameraResponsiveOverlays() {
  updateSouthSeaInsetSize();
  updateCityLabelPresentation();
}

function mapPointFromLocal(localPoint: THREE.Vector3) {
  return [
    localPoint.x + mapWidth / 2,
    mapHeight / 2 - localPoint.y,
  ] as const;
}

function getScopeTransform() {
  if (currentState.scope === 'world') {
    return {
      position: new THREE.Vector3(-18, -40, -22),
      scale: 0.9,
    };
  }
  return {
    position: new THREE.Vector3(-16, -42, -22),
    scale: currentState.scope === 'country' ? 0.7 : 0.768,
  };
}

function forEachMaterial(object: THREE.Object3D, callback: (material: THREE.Material) => void) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material) callback(material);
    });
  });
}

function primeGroupOpacity(group: THREE.Group) {
  forEachMaterial(group, (material) => {
    material.userData.baseOpacity ??= material.opacity;
    material.transparent = true;
    material.opacity = 0;
  });
}

function settleMapForStaticFrame(group: THREE.Group) {
  const baseScale = group.userData.baseScale as number | undefined;
  const basePosition = group.userData.basePosition as THREE.Vector3 | undefined;
  if (baseScale !== undefined) group.scale.setScalar(baseScale);
  if (basePosition) group.position.copy(basePosition);
  group.userData.transitionStart = undefined;
  forEachMaterial(group, (material) => {
    material.opacity = material.userData.baseOpacity ?? material.opacity;
  });
  if (labelRenderer?.domElement) labelRenderer.domElement.style.opacity = '1';
  hasRenderedStaticFrame = true;
}

function applyGroupTransition(group: THREE.Group, time: number) {
  const startedAt = group.userData.transitionStart as number | undefined;
  if (!startedAt) return;

  const progress = Math.min(1, (time - startedAt) / mapTransitionDuration);
  const eased = 1 - (1 - progress) ** 3;
  const baseScale = group.userData.baseScale as number;
  const basePosition = group.userData.basePosition as THREE.Vector3;

  const introScale = THREE.MathUtils.lerp(baseScale * 0.84, baseScale, eased);
  group.scale.set(introScale, introScale, introScale);
  group.position.x = basePosition.x;
  group.position.y = basePosition.y + THREE.MathUtils.lerp(28, 0, eased);
  group.position.z = basePosition.z + THREE.MathUtils.lerp(-34, 0, eased);

  forEachMaterial(group, (material) => {
    material.opacity = (material.userData.baseOpacity ?? 1) * eased;
  });
  if (labelRenderer?.domElement) {
    labelRenderer.domElement.style.opacity = String(eased);
  }

  if (progress >= 1) {
    group.userData.transitionStart = undefined;
    forEachMaterial(group, (material) => {
      material.opacity = material.userData.baseOpacity ?? material.opacity;
    });
    if (labelRenderer?.domElement) labelRenderer.domElement.style.opacity = '1';
  }
}

function findFeatureAtMapPoint(point: readonly [number, number]) {
  return getRenderableFeatures().find((feature) => (
    toPolygons(feature).some((polygon) => pointInProjectedPolygon(point, polygon))
  ));
}

function isDecorativeChinaInset(feature: MapFeature) {
  const name = getFeatureName(feature);
  const code = getFeatureCode(feature);
  return currentState.scope === 'country' && !name && code.includes('_JD');
}

function isRenderableFeature(feature: MapFeature) {
  if (currentState.scope === 'world') return isWorldDisplayFeature(feature);
  return !isDecorativeChinaInset(feature);
}

function getRenderableFeatures() {
  return geoData.features.filter(isRenderableFeature);
}

function toPolygons(feature: GeoFeatureCollection['features'][number]) {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as Position[][]]
    : feature.geometry.coordinates as Position[][][];
}

function updateProjectionFromGeoData() {
  lonMin = Infinity;
  lonMax = -Infinity;
  latMin = Infinity;
  latMax = -Infinity;

  getRenderableFeatures().forEach((feature) => {
    toPolygons(feature).forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach((coord) => {
          lonMin = Math.min(lonMin, coord[0]);
          lonMax = Math.max(lonMax, coord[0]);
          latMin = Math.min(latMin, coord[1]);
          latMax = Math.max(latMax, coord[1]);
        });
      });
    });
  });

  if (!Number.isFinite(lonMin) || !Number.isFinite(lonMax) || !Number.isFinite(latMin) || !Number.isFinite(latMax)) {
    lonMin = 0;
    lonMax = 1;
    latMin = 0;
    latMax = 1;
  }
  mapScale = Math.min(
    (mapWidth - mapPadding * 2) / Math.max(0.0001, lonMax - lonMin),
    (mapHeight - mapPadding * 2) / Math.max(0.0001, latMax - latMin),
  );
  const projectedWidth = (lonMax - lonMin) * mapScale;
  const projectedHeight = (latMax - latMin) * mapScale;
  projectedOffsetX = (mapWidth - projectedWidth) / 2;
  projectedOffsetY = (mapHeight - projectedHeight) / 2;
}

function projectCoord(coord: readonly [number, number]) {
  return [
    projectedOffsetX + (coord[0] - lonMin) * mapScale,
    projectedOffsetY + (latMax - coord[1]) * mapScale,
  ] as const;
}

function ringProjectedArea(ring: Position[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = projectCoord(ring[index]);
    const next = projectCoord(ring[(index + 1) % ring.length]);
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
}

function simplifyRingForScope(ring: Position[]) {
  const maxPointsByScope: Record<MapScope, number> = {
    world: 130,
    country: 220,
    province: 420,
    city: 360,
    district: 420,
  };
  const maxPoints = maxPointsByScope[currentState.scope];
  if (ring.length <= maxPoints) return ring;
  const step = Math.ceil(ring.length / maxPoints);
  const simplified = ring.filter((_, index) => index % step === 0);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (last && first && (last[0] !== first[0] || last[1] !== first[1])) {
    simplified.push(last);
  }
  return simplified.length >= 4 ? simplified : ring;
}

function toRenderablePolygons(feature: GeoFeatureCollection['features'][number]) {
  const featureName = getFeatureName(feature);
  const scopeAreaFloor = currentState.scope === 'world' ? 4 : currentState.scope === 'country' ? 8 : minInlandPolygonArea;
  const minArea = coastalFragmentFeatureNames.has(featureName) ? minCoastalPolygonArea : scopeAreaFloor;
  return toPolygons(feature)
    .filter((polygon) => ringProjectedArea(polygon[0]) >= minArea)
    .map((polygon) => polygon.map((ring) => simplifyRingForScope(ring)));
}

function getFeatureName(feature: MapFeature) {
  const props = feature.properties ?? {};
  return String(
    props.fullname
    ?? props.name
    ?? props.ADMIN
    ?? props.NAME
    ?? props.name_en
    ?? props.adcode
    ?? props.code
    ?? '',
  );
}

function getFeatureCode(feature: MapFeature) {
  const props = feature.properties ?? {};
  const code = props.adcode ?? props.code ?? props.id ?? props.ISO_A3 ?? props.ISO_A2 ?? props.ADM0_A3;
  return code === undefined || code === null ? '' : String(code);
}

function createSouthSeaInsetSvgPaths() {
  const insetFeature = initialMapState.geoData.features.find(isDecorativeChinaInset);
  if (!insetFeature) return [];
  const rings = toPolygons(insetFeature)
    .map((polygon) => polygon[0])
    .filter((ring): ring is Position[] => Array.isArray(ring) && ring.length >= 2);
  if (!rings.length) return [];

  let insetLonMin = Infinity;
  let insetLonMax = -Infinity;
  let insetLatMin = Infinity;
  let insetLatMax = -Infinity;
  rings.forEach((ring) => {
    ring.forEach(([lon, lat]) => {
      insetLonMin = Math.min(insetLonMin, lon);
      insetLonMax = Math.max(insetLonMax, lon);
      insetLatMin = Math.min(insetLatMin, lat);
      insetLatMax = Math.max(insetLatMax, lat);
    });
  });

  const frameWidth = 78;
  const frameHeight = 126;
  const framePadding = 9;
  const sourceWidth = Math.max(0.0001, insetLonMax - insetLonMin);
  const sourceHeight = Math.max(0.0001, insetLatMax - insetLatMin);
  const insetScale = Math.min(
    (frameWidth - framePadding * 2) / sourceWidth,
    (frameHeight - framePadding * 2) / sourceHeight,
  );
  const fittedWidth = sourceWidth * insetScale;
  const fittedHeight = sourceHeight * insetScale;
  const offsetX = (frameWidth - fittedWidth) / 2;
  const offsetY = (frameHeight - fittedHeight) / 2;

  return rings.map((ring) => ring.map(([lon, lat], index) => {
    const x = offsetX + (lon - insetLonMin) * insetScale;
    const y = offsetY + (insetLatMax - lat) * insetScale;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ') + ' Z');
}

const southSeaInsetPaths = createSouthSeaInsetSvgPaths();

function featureCenter(feature: MapFeature): Position {
  const center = feature.properties?.center;
  if (Array.isArray(center) && typeof center[0] === 'number' && typeof center[1] === 'number') {
    return [center[0], center[1]];
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  toPolygons(feature).forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach((coord) => {
        minX = Math.min(minX, coord[0]);
        maxX = Math.max(maxX, coord[0]);
        minY = Math.min(minY, coord[1]);
        maxY = Math.max(maxY, coord[1]);
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return [0, 0];
  }
  return [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
  ];
}

function createLabelsForState(): MapLabel[] {
  const keyWorldLabels = new Set([
    'China',
    'United States of America',
    'Russia',
    'India',
    'Brazil',
    'Australia',
    'Canada',
  ]);

  const labels = getRenderableFeatures()
    .map((feature) => ({ name: getFeatureName(feature), coord: featureCenter(feature) }))
    .filter((label) => {
      if (!label.name) return false;
      if (currentState.scope === 'world') return keyWorldLabels.has(label.name);
      return true;
    })
    .slice(0, currentState.scope === 'world' ? 8 : currentState.scope === 'country' ? 36 : 60);
  const rippleSourceName = getEffectSourceLabelName(labels);
  return labels.map((label) => ({
    ...label,
    ripple: label.name === rippleSourceName,
  }));
}

function projectPoint(coord: readonly [number, number], z = 0) {
  const point = projectCoord(coord);
  return new THREE.Vector3(point[0] - mapWidth / 2, -(point[1] - mapHeight / 2), z);
}

function projectRing(ring: Position[]) {
  const points = ring.map((coord) => projectPoint(coord));
  const last = points[points.length - 1];
  const first = points[0];
  if (last && first && (last.x !== first.x || last.y !== first.y)) {
    points.push(first.clone());
  }
  return points;
}

function makeShape(rings: Position[][]) {
  let outer = projectRing(rings[0]);
  if (!THREE.ShapeUtils.isClockWise(outer.map((point) => new THREE.Vector2(point.x, point.y)))) {
    outer = outer.reverse();
  }
  const start = outer[0];
  const shape = new THREE.Shape();
  shape.moveTo(start.x, start.y);
  outer.slice(1).forEach((point) => {
    shape.lineTo(point.x, point.y);
  });
  shape.closePath();

  rings.slice(1).forEach((ring) => {
    let holePoints = projectRing(ring);
    if (THREE.ShapeUtils.isClockWise(holePoints.map((point) => new THREE.Vector2(point.x, point.y)))) {
      holePoints = holePoints.reverse();
    }
    const holeStart = holePoints[0];
    const hole = new THREE.Path();
    hole.moveTo(holeStart.x, holeStart.y);
    holePoints.slice(1).forEach((point) => {
      hole.lineTo(point.x, point.y);
    });
    hole.closePath();
    shape.holes.push(hole);
  });

  return shape;
}

function applyMapTerrainUv(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    uv[index * 2] = (x + mapWidth / 2) / mapWidth;
    uv[index * 2 + 1] = (y + mapHeight / 2) / mapHeight;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function makeBoundary(ring: Position[], z: number, material: THREE.Material) {
  const points = ring.map((coord) => projectPoint(coord, z));
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && (first.x !== last.x || first.y !== last.y)) points.push(first.clone());
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.LineLoop(geometry, material);
  line.renderOrder = z > 40 ? 8 : 0;
  return line;
}

function makeBoundarySegments(rings: Position[][], z: number, material: THREE.Material) {
  const points: THREE.Vector3[] = [];
  rings.forEach((ring) => {
    for (let index = 0; index < ring.length; index += 1) {
      points.push(
        projectPoint(ring[index], z),
        projectPoint(ring[(index + 1) % ring.length], z),
      );
    }
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = z > 40 ? 8 : 0;
  return lines;
}

function coordKey(coord: Position) {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

function edgeKey(start: Position, end: Position) {
  const a = coordKey(start);
  const b = coordKey(end);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pointInProjectedRing(point: readonly [number, number], ring: Position[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = projectCoord(ring[index]);
    const previousPoint = projectCoord(ring[previous]);
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
      && (point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
        / (previousPoint[1] - currentPoint[1]) + currentPoint[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInProjectedPolygon(point: readonly [number, number], polygon: Position[][]) {
  if (!pointInProjectedRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((ring) => pointInProjectedRing(point, ring));
}

function pointInProjectedCoordinateRing(
  point: readonly [number, number],
  ring: Array<readonly [number, number]>,
) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
      && (point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
        / (previousPoint[1] - currentPoint[1]) + currentPoint[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function getProjectedMapPolygonLookup() {
  if (projectedMapPolygonsCache) return projectedMapPolygonsCache;
  projectedMapPolygonsCache = getRenderableFeatures().flatMap((feature) => (
    toRenderablePolygons(feature).map((polygon) => {
      const rings = polygon.map((ring) => ring.map((coord) => projectCoord(coord)));
      const outer = rings[0];
      return {
        rings,
        minX: Math.min(...outer.map((point) => point[0])),
        minY: Math.min(...outer.map((point) => point[1])),
        maxX: Math.max(...outer.map((point) => point[0])),
        maxY: Math.max(...outer.map((point) => point[1])),
      };
    })
  ));
  return projectedMapPolygonsCache;
}

function pointInCurrentMap(point: readonly [number, number]) {
  return getProjectedMapPolygonLookup().some((polygon) => {
    if (
      point[0] < polygon.minX
      || point[0] > polygon.maxX
      || point[1] < polygon.minY
      || point[1] > polygon.maxY
    ) return false;
    if (!pointInProjectedCoordinateRing(point, polygon.rings[0])) return false;
    return !polygon.rings.slice(1).some((ring) => pointInProjectedCoordinateRing(point, ring));
  });
}

function isProvinceExteriorEdge(start: Position, end: Position) {
  const projectedStart = projectCoord(start);
  const projectedEnd = projectCoord(end);
  const dx = projectedEnd[0] - projectedStart[0];
  const dy = projectedEnd[1] - projectedStart[1];
  const length = Math.hypot(dx, dy);
  if (length < 0.01) return false;

  const midX = (projectedStart[0] + projectedEnd[0]) / 2;
  const midY = (projectedStart[1] + projectedEnd[1]) / 2;
  const normalX = -dy / length;
  const normalY = dx / length;
  const offset = 1.8;
  const sideA = pointInCurrentMap([midX + normalX * offset, midY + normalY * offset]);
  const sideB = pointInCurrentMap([midX - normalX * offset, midY - normalY * offset]);

  return sideA !== sideB;
}

function getProvinceOuterEdges() {
  if (provinceOuterEdgesCache) return provinceOuterEdgesCache;
  const edges = new Map<string, ProvinceOuterEdge>();

  getRenderableFeatures().forEach((feature) => {
    toRenderablePolygons(feature).forEach((polygon) => {
      const ring = polygon[0];
      for (let index = 0; index < ring.length; index += 1) {
        const start = ring[index];
        const end = ring[(index + 1) % ring.length];
        const key = edgeKey(start, end);
        const edge = edges.get(key);
        if (edge) {
          edge.count += 1;
        } else {
          edges.set(key, { count: 1, start, end });
        }
      }
    });
  });

  provinceOuterEdgesCache = [...edges.values()]
    .filter((edge) => edge.count === 1 && isProvinceExteriorEdge(edge.start, edge.end));
  return provinceOuterEdgesCache;
}

function getProvinceOuterLoops() {
  const edges = getProvinceOuterEdges().map((edge) => ({ ...edge, used: false }));
  const adjacency = new Map<string, number[]>();
  const addAdjacency = (key: string, index: number) => {
    const list = adjacency.get(key) ?? [];
    list.push(index);
    adjacency.set(key, list);
  };

  edges.forEach((edge, index) => {
    addAdjacency(coordKey(edge.start), index);
    addAdjacency(coordKey(edge.end), index);
  });

  const loops: Position[][] = [];
  edges.forEach((edge, edgeIndex) => {
    if (edge.used) return;

    edge.used = true;
    const startKey = coordKey(edge.start);
    let previousKey = startKey;
    let currentKey = coordKey(edge.end);
    const loop: Position[] = [edge.start, edge.end];

    while (currentKey !== startKey) {
      const candidates = adjacency.get(currentKey) ?? [];
      const nextIndex = candidates.find((candidateIndex) => {
        if (edges[candidateIndex].used) return false;
        const candidate = edges[candidateIndex];
        const candidateStart = coordKey(candidate.start);
        const candidateEnd = coordKey(candidate.end);
        return candidateStart !== previousKey || candidateEnd !== previousKey;
      });
      if (nextIndex === undefined) break;

      const nextEdge = edges[nextIndex];
      nextEdge.used = true;
      const nextPoint = coordKey(nextEdge.start) === currentKey ? nextEdge.end : nextEdge.start;
      loop.push(nextPoint);
      previousKey = currentKey;
      currentKey = coordKey(nextPoint);
    }

    const last = loop[loop.length - 1];
    if (coordKey(last) === startKey) loop.pop();
    if (loop.length > 2) loops.push(loop);

    if (!edges[edgeIndex].used) edges[edgeIndex].used = true;
  });

  return loops;
}

function createProvinceSilhouetteLoop() {
  type GridPoint = { x: number; y: number };
  type GridEdge = { start: GridPoint; end: GridPoint; used: boolean };

  const cellSize = currentState.scope === 'world' ? 6 : currentState.scope === 'country' ? 4 : provinceSilhouetteCellSize;
  const cols = Math.ceil(mapWidth / cellSize);
  const rows = Math.ceil(mapHeight / cellSize);
  const filled = new Uint8Array(cols * rows);
  const isFilled = (x: number, y: number) => x >= 0 && x < cols && y >= 0 && y < rows
    && filled[y * cols + x] === 1;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const pointX = Math.min(mapWidth, (x + 0.5) * cellSize);
      const pointY = Math.min(mapHeight, (y + 0.5) * cellSize);
      if (pointInCurrentMap([pointX, pointY])) {
        filled[y * cols + x] = 1;
      }
    }
  }

  const edges: GridEdge[] = [];
  const pushEdge = (start: GridPoint, end: GridPoint) => {
    edges.push({ start, end, used: false });
  };

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!isFilled(x, y)) continue;
      if (!isFilled(x, y - 1)) pushEdge({ x, y }, { x: x + 1, y });
      if (!isFilled(x + 1, y)) pushEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!isFilled(x, y + 1)) pushEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!isFilled(x - 1, y)) pushEdge({ x, y: y + 1 }, { x, y });
    }
  }

  const pointKey = (point: GridPoint) => `${point.x},${point.y}`;
  const adjacency = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    [edge.start, edge.end].forEach((point) => {
      const key = pointKey(point);
      const list = adjacency.get(key) ?? [];
      list.push(index);
      adjacency.set(key, list);
    });
  });

  const loops: GridPoint[][] = [];
  edges.forEach((edge) => {
    if (edge.used) return;
    edge.used = true;
    const startKey = pointKey(edge.start);
    let previousKey = startKey;
    let currentKey = pointKey(edge.end);
    const loop: GridPoint[] = [edge.start, edge.end];
    let guard = 0;

    while (currentKey !== startKey && guard < edges.length) {
      guard += 1;
      const candidates = (adjacency.get(currentKey) ?? []).filter((candidateIndex) => !edges[candidateIndex].used);
      const nextIndex = candidates.find((candidateIndex) => {
        const candidate = edges[candidateIndex];
        const otherPoint = pointKey(candidate.start) === currentKey ? candidate.end : candidate.start;
        return pointKey(otherPoint) !== previousKey;
      }) ?? candidates[0];
      if (nextIndex === undefined) break;

      const nextEdge = edges[nextIndex];
      nextEdge.used = true;
      const nextPoint = pointKey(nextEdge.start) === currentKey ? nextEdge.end : nextEdge.start;
      loop.push(nextPoint);
      previousKey = currentKey;
      currentKey = pointKey(nextPoint);
    }

    if (loop.length > 4) loops.push(loop);
  });

  const gridLoopArea = (loop: GridPoint[]) => {
    let area = 0;
    for (let index = 0; index < loop.length; index += 1) {
      const current = loop[index];
      const next = loop[(index + 1) % loop.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area / 2);
  };

  const largestLoop = loops.sort((a, b) => gridLoopArea(b) - gridLoopArea(a))[0];
  if (!largestLoop) return [];

  return largestLoop.map((point) => {
    const x = Math.min(mapWidth, point.x * cellSize);
    const y = Math.min(mapHeight, point.y * cellSize);
    return new THREE.Vector3(x - mapWidth / 2, -(y - mapHeight / 2), provinceChaseZ);
  });
}

function smoothClosedPath(points: THREE.Vector3[], iterations = 2) {
  let smoothed = points;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextPoints: THREE.Vector3[] = [];
    smoothed.forEach((point, index) => {
      const nextPoint = smoothed[(index + 1) % smoothed.length];
      nextPoints.push(point.clone().lerp(nextPoint, 0.25));
      nextPoints.push(point.clone().lerp(nextPoint, 0.75));
    });
    smoothed = nextPoints;
  }
  return smoothed;
}

function createProvinceChaseLight() {
  const group = new THREE.Group();
  const positions: number[] = [];
  const vertexDistances: number[] = [];
  const indices: number[] = [];
  let totalDistance = 0;

  const appendSegment = (
    start: THREE.Vector3,
    end: THREE.Vector3,
  ) => {
    const length = start.distanceTo(end);
    if (length < 0.01) return;

    const normal = new THREE.Vector3(-(end.y - start.y), end.x - start.x, 0)
      .normalize()
      .multiplyScalar(provinceChaseRibbonWidth / 2);
    const divisions = Math.max(1, Math.ceil(length / provinceChaseSegmentLength));
    for (let step = 0; step < divisions; step += 1) {
      const fromRatio = step / divisions;
      const toRatio = (step + 1) / divisions;
      const from = start.clone().lerp(end, fromRatio);
      const to = start.clone().lerp(end, toRatio);
      const fromDistance = totalDistance + length * fromRatio;
      const toDistance = totalDistance + length * toRatio;
      const offset = positions.length / 3;

      [
        from.clone().add(normal),
        from.clone().sub(normal),
        to.clone().add(normal),
        to.clone().sub(normal),
      ].forEach((point) => positions.push(point.x, point.y, point.z));

      vertexDistances.push(fromDistance, fromDistance, toDistance, toDistance);
      indices.push(offset, offset + 1, offset + 2, offset + 2, offset + 1, offset + 3);
    }
    totalDistance += length;
  };

  const provinceSilhouetteLoop = smoothClosedPath(createProvinceSilhouetteLoop(), 4);
  if (provinceSilhouetteLoop.length > 4) {
    provinceSilhouetteLoop.forEach((point, index) => {
      const nextPoint = provinceSilhouetteLoop[(index + 1) % provinceSilhouetteLoop.length];
      appendSegment(point, nextPoint);
    });
  } else {
    const fallbackLoop = getProvinceOuterLoops()
      .sort((a, b) => ringProjectedArea(b) - ringProjectedArea(a))[0];
    fallbackLoop?.forEach((coord, index) => {
      const nextCoord = fallbackLoop[(index + 1) % fallbackLoop.length];
      appendSegment(projectPoint(coord, provinceChaseZ), projectPoint(nextCoord, provinceChaseZ));
    });
  }

  if (!positions.length || totalDistance <= 0) return group;

  provinceChasePath = {
    distances: new Float32Array(vertexDistances),
    total: totalDistance,
    tailLength: Math.max(100, totalDistance * 0.07),
  };

  const alphas = new Float32Array(vertexDistances.length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      color: { value: new THREE.Color(mapTheme.chaseLight) },
    },
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(color, vAlpha);
      }
    `,
  });
  provinceChaseLine = new THREE.Mesh(geometry, material);
  provinceChaseLine.renderOrder = 20;
  group.add(provinceChaseLine);

  return group;
}

function updateProvinceChaseLight(time: number) {
  if (!provinceChasePath || !provinceChaseLine) return;

  const alphaAttribute = provinceChaseLine.geometry.getAttribute('alpha') as THREE.BufferAttribute;
  const chaseSpeed = 230;
  const headDistance = (time * chaseSpeed) % provinceChasePath.total;

  for (let index = 0; index < provinceChasePath.distances.length; index += 1) {
    const vertexDistance = provinceChasePath.distances[index];
    const distanceBehindHead = (headDistance - vertexDistance + provinceChasePath.total) % provinceChasePath.total;
    if (distanceBehindHead > provinceChasePath.tailLength) {
      alphaAttribute.setX(index, 0);
    } else {
      const headRatio = 1 - distanceBehindHead / provinceChasePath.tailLength;
      alphaAttribute.setX(index, Math.pow(headRatio, 1.65));
    }
  }
  alphaAttribute.needsUpdate = true;
}

function createProvinceOutlineSegments(z: number, material: THREE.Material, renderOrder: number) {
  const points: THREE.Vector3[] = [];
  getProvinceOuterEdges().forEach((edge) => {
    points.push(projectPoint(edge.start, z), projectPoint(edge.end, z));
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.LineSegments(geometry, material);
  line.renderOrder = renderOrder;
  return line;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getEffectSourceLabelName(labels = currentLabels) {
  if (currentState.scope === 'country') {
    return labels.find((label) => label.name === '北京市')?.name
      ?? labels[0]?.name;
  }
  if (currentState.scope === 'province') {
    const capitalName = provinceCapitalByName[currentState.regionName];
    return labels.find((label) => label.name === capitalName)?.name
      ?? labels.find((label) => /市$/.test(label.name))?.name;
  }
  if (currentState.scope === 'city') {
    if (!labels.length) return undefined;
    return labels[hashString(currentState.code || currentState.regionName) % labels.length]?.name;
  }
  return undefined;
}

function getFlyLineSourceLabel() {
  if (currentState.scope === 'district') return undefined;
  if (currentState.scope === 'country') {
    const sourceName = getEffectSourceLabelName();
    return currentLabels.find((label) => label.name === sourceName) ?? currentLabels[0];
  }
  if (currentState.scope === 'province') {
    const sourceName = getEffectSourceLabelName();
    return currentLabels.find((label) => label.name === sourceName)
      ?? currentLabels.find((label) => /市$/.test(label.name))
      ?? currentLabels[0];
  }
  if (currentState.scope === 'city') {
    const sourceName = getEffectSourceLabelName();
    return currentLabels.find((label) => label.name === sourceName);
  }
  return undefined;
}

function getFlyLineTargets(source: MapLabel) {
  return currentLabels.filter((label) => label.name !== source.name);
}

function createFlyLines() {
  const group = new THREE.Group();
  const sourceLabel = getFlyLineSourceLabel();
  if (!sourceLabel) return group;

  const flyLineTargets = getFlyLineTargets(sourceLabel);
  if (!flyLineTargets.length) return group;

  const lineZ = currentState.scope === 'country' ? 72 : currentState.scope === 'province' ? 74 : 70;
  const sourcePoint = projectPoint(sourceLabel.coord, lineZ);
  const baseMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: currentState.scope === 'country' ? 0.14 : 0.2,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  flyLineTargets.forEach((targetLabel, index) => {
    const targetPoint = projectPoint(targetLabel.coord, lineZ);
    const distance = sourcePoint.distanceTo(targetPoint);
    const midPoint = sourcePoint.clone().lerp(targetPoint, 0.5);
    midPoint.z += Math.max(28, distance * (currentState.scope === 'country' ? 0.11 : 0.15));
    const curve = new THREE.QuadraticBezierCurve3(sourcePoint, midPoint, targetPoint);
    const points = curve.getPoints(currentState.scope === 'country' ? 72 : 88);

    const baseLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      baseMaterial,
    );
    baseLine.renderOrder = 15;
    group.add(baseLine);

    const flowGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const progress = new Float32Array(points.length);
    points.forEach((_, pointIndex) => {
      progress[pointIndex] = pointIndex / (points.length - 1);
    });
    flowGeometry.setAttribute('progress', new THREE.BufferAttribute(progress, 1));

    const flowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDelay: { value: index * 0.047 },
        uSpeed: { value: currentState.scope === 'country' ? 0.22 : 0.3 },
        uColor: { value: new THREE.Color(mapTheme.flyHead) },
      },
      vertexShader: `
        attribute float progress;
        varying float vProgress;
        void main() {
          vProgress = progress;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDelay;
        uniform float uSpeed;
        uniform vec3 uColor;
        varying float vProgress;
        void main() {
          float head = fract(uTime * uSpeed + uDelay);
          float d = head - vProgress;
          if (d < 0.0) d += 1.0;
          float body = smoothstep(0.24, 0.0, d);
          float core = smoothstep(0.035, 0.0, d);
          float alpha = body * 0.72 + core * 0.5;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
    flyLineMaterials.push(flowMaterial);

    const flowLine = new THREE.Line(flowGeometry, flowMaterial);
    flowLine.renderOrder = 16;
    group.add(flowLine);
  });

  return group;
}

function createProvinceSideWalls(material: THREE.Material) {
  const topZ = 44;
  const bottomZ = 24;
  const positions: number[] = [];
  const indices: number[] = [];

  getProvinceOuterEdges().forEach((edge) => {
    const topStart = projectPoint(edge.start, topZ);
    const topEnd = projectPoint(edge.end, topZ);
    const bottomEnd = projectPoint(edge.end, bottomZ);
    const bottomStart = projectPoint(edge.start, bottomZ);
    const offset = positions.length / 3;
    [topStart, topEnd, bottomEnd, bottomStart].forEach((point) => {
      positions.push(point.x, point.y, point.z);
    });
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

function createPolygonSideWalls(polygon: Position[][], material: THREE.Material) {
  const topZ = 44;
  const bottomZ = 24;
  const positions: number[] = [];
  const indices: number[] = [];

  polygon.forEach((ring) => {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      const topStart = projectPoint(start, topZ);
      const topEnd = projectPoint(end, topZ);
      const bottomEnd = projectPoint(end, bottomZ);
      const bottomStart = projectPoint(start, bottomZ);
      const offset = positions.length / 3;
      [topStart, topEnd, bottomEnd, bottomStart].forEach((point) => {
        positions.push(point.x, point.y, point.z);
      });
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  return mesh;
}

function createWorldSideWalls(material: THREE.Material) {
  const topZ = 46;
  const bottomZ = 30;
  const positions: number[] = [];
  const indices: number[] = [];

  geoData.features.filter(isWorldDisplayFeature).forEach((feature) => {
    toRenderablePolygons(feature).forEach((polygon) => {
      polygon.slice(0, 1).forEach((ring) => {
        for (let index = 0; index < ring.length; index += 1) {
          const start = ring[index];
          const end = ring[(index + 1) % ring.length];
          const topStart = projectPoint(start, topZ);
          const topEnd = projectPoint(end, topZ);
          const bottomEnd = projectPoint(end, bottomZ);
          const bottomStart = projectPoint(start, bottomZ);
          const offset = positions.length / 3;
          [topStart, topEnd, bottomEnd, bottomStart].forEach((point) => {
            positions.push(point.x, point.y, point.z);
          });
          indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
        }
      });
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  return mesh;
}

function createSideGradientMaterial(alpha = 0.86, topZ = 44, bottomZ = 24) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      topColor: { value: new THREE.Color(mapTheme.accent) },
      midColor: { value: new THREE.Color(mapTheme.sideMid) },
      bottomColor: { value: new THREE.Color(mapTheme.sideBottom) },
      alpha: { value: alpha },
      topZ: { value: topZ },
      bottomZ: { value: bottomZ },
    },
    vertexShader: `
      uniform float topZ;
      uniform float bottomZ;
      varying float vDepth;
      void main() {
        vDepth = clamp((position.z - bottomZ) / max(0.001, topZ - bottomZ), 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      uniform float alpha;
      varying float vDepth;
      void main() {
        vec3 lower = mix(bottomColor, midColor, smoothstep(0.0, 0.24, vDepth));
        vec3 color = mix(lower, topColor, smoothstep(0.34, 1.0, vDepth));
        float edgeGlow = smoothstep(0.48, 1.0, vDepth);
        gl_FragColor = vec4(color + edgeGlow * topColor * 0.24, alpha * (0.46 + vDepth * 0.54));
      }
    `,
  });
}

function createWorldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 760;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  const scaleX = canvas.width / mapWidth;
  const scaleY = canvas.height / mapHeight;
  const drawRing = (ring: Position[]) => {
    ring.forEach((coord, index) => {
      const point = projectCoord(coord);
      const x = point[0] * scaleX;
      const y = point[1] * scaleY;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = mapTheme.worldShadow;
  ctx.shadowBlur = 18;
  geoData.features.filter(isWorldDisplayFeature).forEach((feature) => {
    toRenderablePolygons(feature).forEach((polygon) => {
      ctx.beginPath();
      polygon.forEach(drawRing);
      ctx.fillStyle = isChinaFeature(feature) ? mapTheme.worldChinaFill : mapTheme.worldLandFill;
      ctx.fill('evenodd');
      ctx.lineWidth = isChinaFeature(feature) ? 3.2 : 1.05;
      ctx.strokeStyle = isChinaFeature(feature) ? mapTheme.worldChinaStroke : mapTheme.worldLandStroke;
      ctx.stroke();
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWorldMap() {
  const group = new THREE.Group();
  projectedMapPolygonsCache = undefined;
  provinceOuterEdgesCache = undefined;
  interactiveMeshes.length = 0;
  featureMeshes.clear();
  featureLiftGroups.clear();
  featureSideMaterials.clear();
  featureHighlightMaterials.clear();
  featureByName.clear();
  cityLabelElements.clear();
  flyLineMaterials.length = 0;
  ringDecorGroup = undefined;
  provinceChaseLine = undefined;
  provinceChasePath = undefined;

  group.rotation.z = -0.02;
  const transform = getScopeTransform();
  group.position.copy(transform.position);
  group.scale.set(transform.scale, transform.scale, transform.scale);
  group.userData.basePosition = transform.position.clone();
  group.userData.baseScale = transform.scale;

  geoData.features.filter(isWorldDisplayFeature).forEach((feature) => {
    const featureName = getFeatureName(feature);
    if (featureName) featureByName.set(featureName, feature);
  });

  const texture = createWorldTexture();
  if (texture) {
    [0, 1, 2, 3].forEach((layer) => {
      const depthMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(mapWidth, mapHeight),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0.11 - layer * 0.018,
          color: mapTheme.accent,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
        }),
      );
      depthMesh.position.set(0, -8 - layer * 5, 35 - layer * 4);
      depthMesh.scale.set(1 + layer * 0.012, 1 + layer * 0.012, 1);
      depthMesh.renderOrder = 7 - layer;
      group.add(depthMesh);
    });

    const worldMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mapWidth, mapHeight),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    worldMesh.position.z = 48;
    worldMesh.renderOrder = 12;
    group.add(worldMesh);

    const glowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mapWidth, mapHeight),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    glowMesh.position.z = 49;
    glowMesh.scale.set(1.015, 1.015, 1);
    glowMesh.renderOrder = 11;
    group.add(glowMesh);
  }

  worldHitMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(mapWidth, mapHeight),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  worldHitMesh.position.z = 58;
  worldHitMesh.userData.featureName = 'China';
  group.add(worldHitMesh);
  interactiveMeshes.push(worldHitMesh);

  group.add(createRotatingRingDecor());
  primeGroupOpacity(group);
  return group;
}

function createArc(radius: number, start: number, end: number, z: number, material: THREE.Material) {
  const points: THREE.Vector3[] = [];
  const steps = 72;
  for (let i = 0; i <= steps; i += 1) {
    const angle = start + ((end - start) * i) / steps;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  line.renderOrder = -3;
  return line;
}

function createRotatingRingDecor() {
  const plate = new THREE.Group();
  plate.position.set(0, 0, 14);
  plate.scale.set(0.9, 0.9, 0.9);
  plate.renderOrder = -3;

  const rotor = new THREE.Group();
  plate.add(rotor);
  ringDecorGroup = rotor;

  const softRing = new THREE.Mesh(
    new THREE.RingGeometry(356, 362, 192),
    new THREE.MeshBasicMaterial({
      color: mapTheme.accent,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    }),
  );
  softRing.renderOrder = -3;
  rotor.add(softRing);

  const innerSoftRing = new THREE.Mesh(
    new THREE.RingGeometry(244, 248, 160),
    new THREE.MeshBasicMaterial({
      color: mapTheme.ringDim,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    }),
  );
  innerSoftRing.renderOrder = -3;
  rotor.add(innerSoftRing);

  const arcMaterial = new THREE.LineBasicMaterial({
      color: mapTheme.accent,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const dimArcMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.arcDim,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });

  const arcSpecs: Array<[number, number, number, THREE.Material]> = [
    [0.1, 0.92, 390, arcMaterial],
    [1.42, 2.04, 390, dimArcMaterial],
    [2.56, 3.3, 390, arcMaterial],
    [4.1, 4.82, 390, dimArcMaterial],
    [5.22, 5.9, 390, arcMaterial],
    [0.72, 1.34, 316, dimArcMaterial],
    [2.12, 2.78, 316, arcMaterial],
    [3.56, 4.2, 316, dimArcMaterial],
    [5.02, 5.58, 316, arcMaterial],
    [0.18, 0.62, 252, dimArcMaterial],
    [3.18, 3.76, 252, arcMaterial],
  ];
  arcSpecs.forEach(([start, end, radius, material]) => {
    rotor.add(createArc(radius, start, end, 2, material));
  });

  const tickMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  for (let i = 0; i < 48; i += 1) {
    if (i % 4 === 0) continue;
    const angle = (Math.PI * 2 * i) / 48;
    const inner = 344;
    const outer = i % 2 === 0 ? 370 : 362;
    const points = [
      new THREE.Vector3(Math.cos(angle) * inner, Math.sin(angle) * inner, 3),
      new THREE.Vector3(Math.cos(angle) * outer, Math.sin(angle) * outer, 3),
    ];
    const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), tickMaterial);
    tick.renderOrder = -3;
    rotor.add(tick);
  }

  return plate;
}

async function createMap() {
  const group = new THREE.Group();
  projectedMapPolygonsCache = undefined;
  provinceOuterEdgesCache = undefined;
  interactiveMeshes.length = 0;
  featureMeshes.clear();
  featureLiftGroups.clear();
  featureSideMaterials.clear();
  featureHighlightMaterials.clear();
  featureByName.clear();
  cityLabelElements.clear();
  flyLineMaterials.length = 0;
  ringDecorGroup = undefined;
  provinceChaseLine = undefined;
  provinceChasePath = undefined;
  group.rotation.x = 0;
  group.rotation.z = currentState.scope === 'world' ? -0.02 : -0.09;
  const transform = getScopeTransform();
  group.position.copy(transform.position);
  const scopeScale = transform.scale;
  group.scale.set(scopeScale, scopeScale, scopeScale);
  group.userData.basePosition = transform.position.clone();
  group.userData.baseScale = scopeScale;

  const geoBaseMaterial = new THREE.MeshBasicMaterial({
    color: mapTheme.mapBase,
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const topMaterial = createMapTerrainMaterial({
    elevationScale: currentState.scope === 'country' ? 5.6 : currentState.scope === 'province' ? 8.2 : 7.2,
    normalStrength: currentState.scope === 'country' ? 0.82 : 1,
    roughness: 0.94,
    textureOpacity: currentState.scope === 'country' ? 0.84 : 0.9,
  });
  topMaterial.alphaTest = 0.02;
  topMaterial.needsUpdate = true;
  const sideMaterial = createSideGradientMaterial();
  const topGlowMaterial = new THREE.MeshBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: 0.045,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: currentState.scope === 'world' ? 0.72 : 0.46,
    depthTest: false,
    depthWrite: false,
  });
  const provinceOutlineMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accentSoft,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const bottomOutlineMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accentSoft,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const geoBaseLineMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.baseLine,
    transparent: true,
    opacity: 0.54,
    depthTest: false,
    depthWrite: false,
  });

  const renderableFeatures = getRenderableFeatures();
  for (let featureIndex = 0; featureIndex < renderableFeatures.length; featureIndex += 1) {
    const feature = renderableFeatures[featureIndex];
    const featureName = getFeatureName(feature);
    if (featureName) featureByName.set(featureName, feature);
    const renderablePolygons = toRenderablePolygons(feature);
    if (!renderablePolygons.length) continue;
    const featureGroup = new THREE.Group();
    featureGroup.userData.featureName = featureName;
    featureGroup.userData.baseZ = 0;
    featureGroup.userData.targetZ = 0;
    group.add(featureGroup);
    featureLiftGroups.set(featureName, [featureGroup]);

    const shapes = renderablePolygons.map((polygon) => makeShape(polygon));
    const featureRings = renderablePolygons.flat();

    const geoBase = new THREE.Mesh(new THREE.ShapeGeometry(shapes), geoBaseMaterial);
    geoBase.position.z = 20;
    featureGroup.add(geoBase);
    featureGroup.add(makeBoundarySegments(featureRings, 21, geoBaseLineMaterial));

    const liftSideMaterial = createSideGradientMaterial(0);
    featureGroup.add(createPolygonSideWalls(featureRings, liftSideMaterial));
    featureSideMaterials.set(featureName, [liftSideMaterial]);

    const topGeometry = applyMapTerrainUv(new THREE.ShapeGeometry(shapes));
    const mesh = new THREE.Mesh(topGeometry, topMaterial.clone());
    mesh.position.z = 44;
    mesh.userData.featureName = featureName;
    mesh.userData.featureCode = getFeatureCode(feature);
    mesh.userData.baseZ = 44;
    featureGroup.add(mesh);
    interactiveMeshes.push(mesh);
    featureMeshes.set(featureName, [mesh]);

    const topGlow = new THREE.Mesh(new THREE.ShapeGeometry(shapes), topGlowMaterial);
    topGlow.position.z = 48;
    featureGroup.add(topGlow);

    const highlightInstanceMaterial = highlightMaterial.clone();
    highlightInstanceMaterial.userData.targetOpacity = 0;
    const highlightMesh = new THREE.Mesh(new THREE.ShapeGeometry(shapes), highlightInstanceMaterial);
    highlightMesh.position.z = 52;
    highlightMesh.renderOrder = 7;
    featureGroup.add(highlightMesh);
    featureHighlightMaterials.set(featureName, [highlightInstanceMaterial]);

    featureGroup.add(makeBoundarySegments(featureRings, 44, lineMaterial));
    if (props.active && featureIndex % 2 === 1) await waitForNextFrame();
    if (!props.active && featureIndex % 6 === 5) await waitForPreloadSlice();
  }

  if (currentState.scope !== 'world') {
    await waitForBuildSlice();
    group.add(createProvinceSideWalls(sideMaterial));
    group.add(createProvinceOutlineSegments(44, provinceOutlineMaterial, 9));
    group.add(createProvinceOutlineSegments(24, bottomOutlineMaterial, 1));
  }
  if (currentState.scope !== 'world') {
    await waitForBuildSlice();
    group.add(createProvinceChaseLight());
  }
  await waitForBuildSlice();
  group.add(createFlyLines());

  group.add(createRotatingRingDecor());

  primeGroupOpacity(group);
  return group;
}

function createCityMarkers(group: THREE.Group) {
  currentLabels.forEach((city) => {
    const anchorPoint = projectPoint(city.coord, 58);
    const labelAnchor = document.createElement('div');
    labelAnchor.className = 'city-label-anchor';

    const labelEl = document.createElement('div');
    labelEl.className = 'city-label';
    if (city.ripple) {
      labelEl.classList.add('is-jinhua');
      const rippleEl = document.createElement('div');
      rippleEl.className = 'city-ripple';
      labelAnchor.appendChild(rippleEl);
      const rippleDelayEl = document.createElement('div');
      rippleDelayEl.className = 'city-ripple delay';
      labelAnchor.appendChild(rippleDelayEl);
    }
    labelEl.innerHTML = `<span>${city.name}</span>`;
    labelAnchor.appendChild(labelEl);
    cityLabelElements.set(city.name, labelEl);

    const label = new CSS2DObject(labelAnchor);
    label.position.copy(anchorPoint);
    group.add(label);
  });
  cityLabelPresentationKey = '';
  updateCityLabelPresentation();
}

function setCityLabelSelected(featureName: string) {
  cityLabelElements.forEach((element, cityName) => {
    element.classList.toggle('is-selected', cityName === featureName);
  });
}

function setFeatureHighlight(featureName: string) {
  if (hoveredFeature === featureName) return;
  if (hoveredFeature) {
    featureLiftGroups.get(hoveredFeature)?.forEach((group) => {
      group.userData.targetZ = group.userData.baseZ ?? 0;
    });
    featureSideMaterials.get(hoveredFeature)?.forEach((material) => {
      material.uniforms.topColor.value.set(mapTheme.accent);
      material.uniforms.midColor.value.set(mapTheme.sideMid);
      material.uniforms.bottomColor.value.set(mapTheme.sideBottom);
      material.uniforms.alpha.value = 0;
    });
    featureHighlightMaterials.get(hoveredFeature)?.forEach((material) => {
      material.userData.targetOpacity = 0;
    });
    featureMeshes.get(hoveredFeature)?.forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.set(material.userData.baseColor ?? mapTheme.surfaceBase);
        material.emissive.set(material.userData.baseEmissive ?? mapTheme.surfaceEmissive);
        material.emissiveIntensity = material.userData.baseEmissiveIntensity ?? 0.03;
        material.opacity = material.userData.baseOpacity ?? 0.86;
      }
    });
  }

  hoveredFeature = featureName;
  setCityLabelSelected(featureName);
  if (!featureName) return;
  featureLiftGroups.get(featureName)?.forEach((group) => {
    group.userData.targetZ = 16;
  });
  featureSideMaterials.get(featureName)?.forEach((material) => {
    material.uniforms.topColor.value.set(mapTheme.accent);
    material.uniforms.midColor.value.set(mapTheme.hoverMid);
    material.uniforms.bottomColor.value.set(mapTheme.hoverBottom);
    material.uniforms.alpha.value = 0.9;
  });
  featureHighlightMaterials.get(featureName)?.forEach((material) => {
    material.userData.targetOpacity = 0.32;
  });
  featureMeshes.get(featureName)?.forEach((mesh) => {
    const material = mesh.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.userData.baseColor ??= `#${material.color.getHexString()}`;
      material.userData.baseEmissive ??= `#${material.emissive.getHexString()}`;
      material.userData.baseOpacity ??= material.opacity;
      material.userData.baseEmissiveIntensity ??= material.emissiveIntensity;
      material.color.set(mapTheme.accent);
      material.emissive.set(mapTheme.accent);
      material.emissiveIntensity = 0.72;
      material.opacity = 0.68;
    }
  });
}

function resetAllFeatureHighlights() {
  featureLiftGroups.forEach((groups) => {
    groups.forEach((group) => {
      group.userData.targetZ = group.userData.baseZ ?? 0;
    });
  });
  featureSideMaterials.forEach((materials) => {
    materials.forEach((material) => {
      material.uniforms.topColor.value.set(mapTheme.accent);
      material.uniforms.midColor.value.set(mapTheme.sideMid);
      material.uniforms.bottomColor.value.set(mapTheme.sideBottom);
      material.uniforms.alpha.value = 0;
    });
  });
  featureHighlightMaterials.forEach((materials) => {
    materials.forEach((material) => {
      material.userData.targetOpacity = 0;
    });
  });
  featureMeshes.forEach((meshes) => {
    meshes.forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.set(material.userData.baseColor ?? mapTheme.surfaceBase);
        material.emissive.set(material.userData.baseEmissive ?? mapTheme.surfaceEmissive);
        material.emissiveIntensity = material.userData.baseEmissiveIntensity ?? 0.03;
        material.opacity = material.userData.baseOpacity ?? 0.86;
      }
    });
  });
  hoveredFeature = '';
  setCityLabelSelected('');
}

function onPointerMove(event: PointerEvent) {
  if (!host.value || !camera || !renderer) return;
  if (currentState.scope === 'world') return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
  const featureName = hit?.object.userData.featureName ?? '';
  setFeatureHighlight(featureName);
  if (featureName) prefetchDrillTarget(featureName);
}

function onPointerLeave() {
  resetAllFeatureHighlights();
}

function isChinaFeature(feature: MapFeature) {
  const name = getFeatureName(feature);
  const code = getFeatureCode(feature);
  return name === 'China' || name === '中国' || code === 'CHN' || code === 'CN';
}

function isWorldDisplayFeature(feature: MapFeature) {
  const name = getFeatureName(feature);
  return name !== 'Antarctica' && name !== '南极洲';
}

function nextScope(scope: MapScope): MapScope | undefined {
  const scopeMap: Record<MapScope, MapScope | undefined> = {
    world: 'country',
    country: 'province',
    province: 'city',
    city: 'district',
    district: undefined,
  };
  return scopeMap[scope];
}

function resolveDrillTarget(feature: MapFeature) {
  const targetScope = nextScope(currentState.scope);
  if (!targetScope) return undefined;

  if (currentState.scope === 'world') {
    if (!isChinaFeature(feature)) return undefined;
    return {
      scope: 'country' as const,
      regionName: '中国',
      code: '100000',
    };
  }

  const code = getFeatureCode(feature);
  if (!code) return undefined;
  return {
    scope: targetScope,
    regionName: getFeatureName(feature),
    code,
  };
}

function prefetchDrillTarget(featureName: string) {
  const feature = featureByName.get(featureName);
  if (!feature) return;
  const target = resolveDrillTarget(feature);
  if (!target) return;
  prefetchMapLevel(target.scope, target.code);
}

function refreshDrillControl() {
  if (!drillControlEl) return;
  const scopeLabel = {
    world: '全球',
    country: '国家',
    province: '省级',
    city: '市级',
    district: '区县',
  }[currentState.scope];
  const backDisabled = !drillStack.length || isDrilling ? 'disabled' : '';
  const actionDisabled = isDrilling ? 'disabled' : '';

  drillControlEl.innerHTML = `
    <button type="button" data-map-action="back" ${backDisabled}>返回上级</button>
    <span>${scopeLabel} / ${currentState.regionName}</span>
    <button type="button" data-map-action="save-view-default" ${actionDisabled}>保存统一</button>
    <button type="button" data-map-action="save-view-scope" ${actionDisabled}>保存本层</button>
    <button type="button" data-map-action="reset-view-scope" ${actionDisabled}>恢复本层</button>
    <button type="button" data-map-action="reset-view-all" ${actionDisabled}>恢复全部</button>
  `;
  drillControlEl.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.mapAction;
      if (action === 'back') {
        void drillBack();
        return;
      }
      handleCameraControlAction(action, button);
    });
  });
}

function createDrillControl() {
  if (!host.value) return;
  drillControlEl = document.createElement('div');
  drillControlEl.className = 'map-drill-control';
  host.value.appendChild(drillControlEl);
  refreshDrillControl();
}

async function warmInitialMapRenderer(group: THREE.Group, buildVersion: number) {
  const warmupVersion = ++rendererWarmupVersion;
  const warmRenderer = renderer;
  const warmScene = scene;
  const warmCamera = camera;
  if (!warmRenderer || !warmScene || !warmCamera) return;

  const textures = await waitForTerrainTexturesReady();
  if (
    warmupVersion !== rendererWarmupVersion
    || buildVersion !== mapBuildVersion
    || mapGroup !== group
    || renderer !== warmRenderer
  ) return;

  await waitForPreloadSlice();
  try {
    await warmRenderer.compileAsync(warmScene, warmCamera);
  } catch {
    // A hidden render below remains the compatibility warm-up path.
  }

  for (const texture of Object.values(textures)) {
    if (warmupVersion !== rendererWarmupVersion || renderer !== warmRenderer) return;
    await waitForPreloadSlice();
    warmRenderer.initTexture(texture);
  }

  await waitForPreloadSlice();
  if (
    warmupVersion !== rendererWarmupVersion
    || buildVersion !== mapBuildVersion
    || mapGroup !== group
    || renderer !== warmRenderer
  ) return;
  if (!props.active) settleMapForStaticFrame(group);
  warmRenderer.render(warmScene, warmCamera);
  if (!props.active) labelRenderer?.render(warmScene, warmCamera);
  hasEmittedReady = true;
  requestAnimationFrame(() => emit('ready'));
}

async function rebuildMapForCurrentState() {
  if (!scene) return;
  activeScope.value = currentState.scope;
  const buildVersion = ++mapBuildVersion;
  const previousMapGroup = mapGroup;
  geoData = currentState.geoData;
  updateProjectionFromGeoData();
  currentLabels = createLabelsForState();
  resetAllFeatureHighlights();
  const nextMapGroup = currentState.scope === 'world' ? createWorldMap() : await createMap();
  if (buildVersion !== mapBuildVersion || !scene) {
    disposeObject3D(nextMapGroup);
    return;
  }
  if (previousMapGroup) {
    scene.remove(previousMapGroup);
    disposeObject3D(previousMapGroup);
  }
  labelRenderer?.domElement.replaceChildren();
  if (labelRenderer?.domElement) labelRenderer.domElement.style.opacity = '0';
  mapGroup = nextMapGroup;
  nextMapGroup.userData.transitionStart = performance.now() / 1000;
  scene.add(nextMapGroup);
  createCityMarkers(mapGroup);
  resetAllFeatureHighlights();
  refreshDrillControl();

  if (!hasEmittedReady) void warmInitialMapRenderer(nextMapGroup, buildVersion);
}

watch(() => props.active, (active, wasActive) => {
  if (active && !wasActive) {
    if (mapGroup && !hasRenderedStaticFrame) {
      primeGroupOpacity(mapGroup);
      mapGroup.userData.transitionStart = performance.now() / 1000;
      if (labelRenderer?.domElement) labelRenderer.domElement.style.opacity = '0';
    }
    startMapAnimation();
    resolutionUpgradeHandle = globalThis.setTimeout(() => {
      resolutionUpgradeHandle = undefined;
      if (!props.active || !renderer || !host.value) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(
        Math.max(host.value.clientWidth, 1),
        Math.max(host.value.clientHeight, 1),
        false,
      );
    }, 520);
    return;
  }
  if (!active && wasActive) {
    if (resolutionUpgradeHandle !== undefined) {
      globalThis.clearTimeout(resolutionUpgradeHandle);
      resolutionUpgradeHandle = undefined;
    }
    stopMapAnimation();
  }
});

async function drillToFeature(featureName: string) {
  if (isDrilling) return;
  const feature = featureByName.get(featureName);
  if (!feature) return;
  const target = resolveDrillTarget(feature);
  if (!target) return;

  isDrilling = true;
  refreshDrillControl();
  try {
    const nextGeoJson = await loadMapLevel(target.scope, target.code);
    drillStack = [...drillStack, {
      state: currentState,
      cameraView: getCurrentCameraView(),
    }];
    currentState = {
      scope: target.scope,
      regionName: target.regionName,
      code: target.code,
      geoData: nextGeoJson,
    };
    await waitForNextFrame();
    await rebuildMapForCurrentState();
  } catch (error) {
    console.warn('Map drilldown failed', error);
  } finally {
    isDrilling = false;
    refreshDrillControl();
  }
}

async function drillBack() {
  if (isDrilling) return;
  const previousItem = drillStack[drillStack.length - 1];
  if (!previousItem) return;
  const nextStack = drillStack.slice(0, -1);
  const currentBeforeBack = currentState;
  const stackBeforeBack = drillStack;
  isDrilling = true;
  drillStack = nextStack;
  currentState = previousItem.state;
  refreshDrillControl();
  try {
    await waitForNextFrame();
    await rebuildMapForCurrentState();
    if (previousItem.cameraView) applyCameraView(previousItem.cameraView);
  } catch (error) {
    console.warn('Map drillback failed', error);
    drillStack = stackBeforeBack;
    currentState = currentBeforeBack;
    await rebuildMapForCurrentState();
  } finally {
    isDrilling = false;
    refreshDrillControl();
  }
}

function onPointerDown(event: PointerEvent) {
  if (!host.value || !camera || !renderer) return;
  if (event.target instanceof HTMLElement && event.target.closest('.map-drill-control')) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
  const featureName = hit?.object.userData.featureName;
  if (currentState.scope === 'world') {
    if (!hit || !mapGroup) return;
    const localPoint = hit.point.clone();
    mapGroup.worldToLocal(localPoint);
    const feature = findFeatureAtMapPoint(mapPointFromLocal(localPoint));
    if (feature && isChinaFeature(feature)) {
      void drillToFeature(getFeatureName(feature));
    }
  } else if (typeof featureName === 'string') {
    void drillToFeature(featureName);
  }
}

function setup() {
  if (!host.value) return;
  stopMapAnimation();
  resizeObserver?.disconnect();
  controls?.dispose();
  renderer?.dispose();
  host.value.replaceChildren();
  cityLabelElements.clear();

  const { width, height } = getHostSize();

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(cameraViewConfig.default.fov, width / height, 1, 2400);
  camera.position.set(...cameraViewConfig.default.position);
  camera.lookAt(...cameraViewConfig.default.target);

  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, props.active ? 1.5 : 1));
  host.value.appendChild(renderer.domElement);
  host.value.addEventListener('pointermove', onPointerMove);
  host.value.addEventListener('pointerdown', onPointerDown);
  host.value.addEventListener('pointerleave', onPointerLeave);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 520;
  controls.maxDistance = 1450;
  controls.target.set(...cameraViewConfig.default.target);
  controls.addEventListener('change', updateCameraResponsiveOverlays);
  controls.addEventListener('start', () => {
    hasUserAdjustedCamera = true;
  });
  hasUserAdjustedCamera = !!(
    readSavedCameraViewConfig().default
    || Object.keys(readSavedCameraViewConfig().byScope ?? {}).length
  );
  applyInitialCameraViewForCurrentScope();
  updateCameraResponsiveOverlays();

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.className = 'map-label-layer';
  host.value.appendChild(labelRenderer.domElement);
  createDrillControl();

  scene.add(new THREE.AmbientLight(mapTheme.ambientLight, 1.45));
  const light = new THREE.DirectionalLight(mapTheme.directionalLight, 2.4);
  light.position.set(120, -240, 420);
  scene.add(light);

  void rebuildMapForCurrentState();

  startMapAnimation();
}

function startMapAnimation() {
  if (raf || !props.active) return;
  raf = requestAnimationFrame(animate);
}

function stopMapAnimation() {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
}

function animate() {
  raf = 0;
  if (!props.active) return;
  const t = performance.now() / 1000;
  if (mapGroup) {
    applyGroupTransition(mapGroup, t);
    if (!mapGroup.userData.transitionStart) {
      const basePosition = mapGroup.userData.basePosition as THREE.Vector3 | undefined;
      if (basePosition) {
        mapGroup.position.x = basePosition.x;
        mapGroup.position.y = basePosition.y;
        mapGroup.position.z = basePosition.z + Math.sin(t * 0.55) * 2;
      }
    }
  }
  if (ringDecorGroup) {
    ringDecorGroup.rotation.z += 0.004;
  }
  updateProvinceChaseLight(t);
  flyLineMaterials.forEach((material) => {
    material.uniforms.uTime.value = t;
  });
  featureLiftGroups.forEach((groups) => {
    groups.forEach((group) => {
      group.position.z += ((group.userData.targetZ ?? 0) - group.position.z) * 0.16;
    });
  });
  featureHighlightMaterials.forEach((materials) => {
    materials.forEach((material) => {
      material.opacity += ((material.userData.targetOpacity ?? 0) - material.opacity) * 0.18;
    });
  });
  if (scene && camera) {
    controls?.update();
    updateCameraResponsiveOverlays();
    renderer?.render(scene, camera);
    labelRenderer?.render(scene, camera);
  }
  if (props.active) raf = requestAnimationFrame(animate);
}

function resize() {
  if (!host.value || !camera || !renderer || !labelRenderer) return;
  const { width, height } = getHostSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
  updateCameraResponsiveOverlays();
  if (!hasUserAdjustedCamera) {
    applyCameraView(resolveBuiltInCameraView(currentState.scope));
  }
}

function getHostSize() {
  const rect = host.value?.getBoundingClientRect();
  // CSS transforms are used during the Earth -> China handoff. clientWidth/clientHeight
  // preserve the real layout size, while getBoundingClientRect() reports the temporary
  // 0.78-scale visual size and leaves the WebGL canvas undersized after the handoff.
  const width = Math.max(1, Math.round(host.value?.clientWidth || rect?.width || 1920));
  const height = Math.max(1, Math.round(host.value?.clientHeight || rect?.height || 1080));
  return { width, height };
}

onMounted(() => {
  setup();
  window.addEventListener('resize', resize);
  if (host.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host.value);
  }
});

onBeforeUnmount(() => {
  rendererWarmupVersion += 1;
  if (resolutionUpgradeHandle !== undefined) globalThis.clearTimeout(resolutionUpgradeHandle);
  stopMapAnimation();
  window.removeEventListener('resize', resize);
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  host.value?.removeEventListener('pointermove', onPointerMove);
  host.value?.removeEventListener('pointerdown', onPointerDown);
  host.value?.removeEventListener('pointerleave', onPointerLeave);
  controls?.removeEventListener('change', updateCameraResponsiveOverlays);
  controls?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  labelRenderer?.domElement.remove();
});
</script>

<style scoped>
.map-stage {
  position: absolute;
  inset: 0;
  z-index: 6;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.map-host {
  position: absolute;
  inset: 0;
  z-index: 6;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  pointer-events: auto;
  filter: drop-shadow(0 0 18px var(--map-stage-shadow));
  animation: mapStageIn 920ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
}

.south-sea-inset {
  position: absolute;
  right: 23%;
  bottom: 7.5%;
  z-index: 8;
  width: 78px;
  min-width: 62px;
  max-width: 92px;
  height: auto;
  overflow: visible;
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scale(0.96);
  transform-origin: 50% 100%;
  transition:
    opacity 460ms ease 150ms,
    transform 560ms cubic-bezier(0.16, 1, 0.3, 1) 150ms;
}

.south-sea-inset.is-visible {
  opacity: 0.9;
  transform: translateY(0) scale(1);
}

.south-sea-inset__frame,
.south-sea-inset__glow,
.south-sea-inset__line {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.south-sea-inset__frame {
  stroke: var(--map-accent-soft);
  stroke-width: 0.85;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.4;
}

.south-sea-inset__glow {
  stroke: var(--map-accent-soft);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.17;
}

.south-sea-inset__line {
  stroke: var(--map-accent);
  stroke-width: 0.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.88;
}

.map-host :deep(canvas),
.map-host :deep(.map-label-layer) {
  position: absolute;
  inset: 0;
}

.map-host :deep(.map-label-layer) {
  pointer-events: none;
}

.map-host :deep(.map-drill-control) {
  position: absolute;
  left: 50%;
  top: 176px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  transform: translateX(-50%);
  color: var(--map-drill-text-alpha);
  font-size: 14px;
  line-height: 1;
  text-shadow: 0 0 10px var(--map-drill-glow);
  pointer-events: auto;
}

.map-host :deep(.map-drill-control button) {
  height: 26px;
  border: 1px solid var(--map-drill-border);
  border-radius: 2px;
  padding: 0 12px;
  background: var(--map-drill-background);
  color: var(--map-drill-text);
  font: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 14px var(--map-drill-box-inner), 0 0 12px var(--map-drill-box-outer);
}

.map-host :deep(.map-drill-control button:disabled) {
  opacity: 0.35;
  cursor: default;
}

.map-host :deep(.city-label-anchor) {
  position: relative;
  width: 0;
  height: 0;
}

.map-host :deep(.city-label) {
  position: absolute;
  left: 0;
  bottom: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--map-label-width, 51px);
  height: var(--map-label-height, 30.8px);
  padding:
    0
    var(--map-label-padding-x, 3.8px)
    var(--map-label-padding-bottom, 8.3px);
  background-image: var(--map-label-background-image);
  background-repeat: no-repeat;
  background-size: 100% 100%;
  color: var(--map-label-text);
  font-size: var(--map-label-font-size, 8.7px);
  line-height: var(--map-label-line-height, 12.2px);
  font-weight: 700;
  letter-spacing: 0;
  text-shadow: 0 0 8px var(--map-label-text-glow);
  opacity: 0.86;
  transform-origin: center bottom;
  transform: translateX(-50%);
  transition: width 180ms ease, height 180ms ease, padding 180ms ease, font-size 180ms ease, opacity 180ms ease;
  white-space: nowrap;
}

.map-host :deep(.city-ripple) {
  position: absolute;
  left: 0;
  top: 4px;
  width: 63px;
  height: 25px;
  border: 1px solid var(--map-ripple-border);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, var(--map-ripple-center), var(--map-ripple-middle) 55%, transparent 72%);
  box-shadow: 0 0 12px var(--map-ripple-glow);
  transform: translate(-50%, -50%);
  animation: jinhua-ripple 9s ease-out infinite;
  pointer-events: none;
}

.map-host :deep(.city-ripple.delay) {
  animation-delay: 4.5s;
}

.map-host :deep(.city-label.is-selected) {
  width: var(--map-label-selected-width, 60.2px);
  height: var(--map-label-selected-height, 36.3px);
  padding:
    0
    var(--map-label-selected-padding-x, 4.4px)
    var(--map-label-selected-padding-bottom, 9.7px);
  font-size: var(--map-label-selected-font-size, 10.3px);
  line-height: var(--map-label-selected-line-height, 14.4px);
  opacity: 1;
}

.map-host :deep(.city-label span) {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
}

@keyframes jinhua-ripple {
  0% {
    opacity: 0.55;
    transform: translate(-50%, -50%) scale(0.6);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.35);
  }
}

@keyframes mapStageIn {
  from {
    opacity: 0;
    transform: translateY(28px) scale(0.96);
    filter: blur(7px) drop-shadow(0 0 0 transparent);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0) drop-shadow(0 0 18px var(--map-stage-shadow));
  }
}

</style>
