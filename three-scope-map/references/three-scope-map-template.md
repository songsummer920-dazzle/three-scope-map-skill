# ThreeScopeMap Component Template

Use this as the structural template for a reusable Three.js map that can switch between world, country, province, city, and district scopes, including click drilldown.

```vue
<template>
  <div ref="hostEl" class="three-scope-map" />
</template>

<script setup lang="ts">
// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// This attribution is code-only and must not be rendered in the UI unless explicitly requested.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as THREE from 'three';

type MapScope = 'world' | 'country' | 'province' | 'city' | 'district';

type MapTheme = {
  primary: string;
  outline: string;
  internalLine: string;
  topFill: string;
  topOpacity: number;
  sideTop: string;
  sideMid: string;
  sideBottom: string;
  labelText: string;
  labelBorder: string;
  labelGlow: string;
  scatter: string;
  ripple: string;
  flyLine: string;
  hudRing: string;
  chaseLightHead: string;
  chaseLightTail: string;
};

type TerrainConfig = {
  elevationScale: number;
  normalStrength: number;
  roughness: number;
  textureOpacity: number;
  diffuseMap: string;
  normalMap: string;
  roughnessMap: string;
  displacementMap: string;
};

type CameraViewPreset = {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
};

type CameraViewConfig = {
  default: CameraViewPreset;
  byScope?: Partial<Record<MapScope, CameraViewPreset>>;
};

type DrillTarget = {
  scope: MapScope;
  regionName: string;
  code: string;
  geoJsonPath: string;
};

const props = defineProps<{
  scope: MapScope;
  regionName: string;
  geoJson: GeoJSON.FeatureCollection;
  labels: Array<{ name: string; coord: [number, number]; offset?: [number, number, number] }>;
  scatterPoints: Array<{ name: string; coord: [number, number]; ripple?: boolean }>;
  flyLines?: Array<{ from: string; to: string }>;
  theme: MapTheme;
  terrain: TerrainConfig;
  cameraView?: CameraViewConfig;
  cameraStorageKey?: string;
  enableDrilldown?: boolean;
  resolveDrillTarget?: (feature: GeoJSON.Feature, currentScope: MapScope) => DrillTarget | undefined;
  loadGeoJson?: (target: DrillTarget) => Promise<GeoJSON.FeatureCollection>;
}>();

const emit = defineEmits<{
  drilldown: [target: DrillTarget];
  back: [target: DrillTarget | undefined];
}>();

const hostEl = ref<HTMLDivElement>();
const drillStack = shallowRef<DrillTarget[]>([]);

let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let frameId = 0;

function createRenderer() {
  // Create renderer, camera, lights, root groups, and resize handling.
  // If props.cameraStorageKey is provided, read localStorage and apply saved camera view after OrbitControls is created.
}

function buildMap() {
  // Recompute projection bounds from props.geoJson.
  // Build top meshes, outer side thickness, internal boundary lines, outer top/bottom outlines.
  // Apply props.theme and props.terrain; do not hardcode province colors.
}

function buildLabelsAndPoints() {
  // Use exported label background asset if available.
  // Apply scope-aware label scale and point/ripple rules.
}

function buildEffects() {
  // HUD ring behind map, fly lines, one outer-contour chase-light segment.
}

function bindPointerInteraction() {
  // Raycast feature meshes.
  // Hover lifts top and side geometry together with no gap.
  // Click calls handleFeatureClick only when props.enableDrilldown is true.
  // Reset previous hover cleanly.
}

function saveCurrentCameraView() {
  // Persist camera.fov, camera.position, and controls.target.
  // Support both unified default view and current-scope override.
}

function resetCameraView() {
  // Remove either the current-scope override or all saved presets, then apply the resolved fallback view.
}

async function handleFeatureClick(feature: GeoJSON.Feature) {
  if (!props.enableDrilldown || !props.resolveDrillTarget || !props.loadGeoJson) return;
  const target = props.resolveDrillTarget(feature, props.scope);
  if (!target) return;
  drillStack.value = [
    ...drillStack.value,
    { scope: props.scope, regionName: props.regionName, code: '', geoJsonPath: '' },
  ];
  const nextGeoJson = await props.loadGeoJson(target);
  // Parent component should swap props.geoJson/scope/labels/scatter/flyLines/terrain together.
  // If this component owns state, dispose the current map, assign nextGeoJson, then rebuild all layers.
  void nextGeoJson;
  emit('drilldown', target);
}

function backDrilldown() {
  const previous = drillStack.value.at(-1);
  drillStack.value = drillStack.value.slice(0, -1);
  emit('back', previous);
}

function renderLoop() {
  frameId = requestAnimationFrame(renderLoop);
  // Animate HUD ring, ripple, fly lines, and chase light.
  renderer?.render(scene!, camera!);
}

function disposeMap() {
  cancelAnimationFrame(frameId);
  // Dispose geometries, materials, textures, event listeners, renderer.
}

onMounted(() => {
  createRenderer();
  buildMap();
  buildLabelsAndPoints();
  buildEffects();
  bindPointerInteraction();
  renderLoop();
});

watch(
  () => [props.scope, props.regionName, props.geoJson, props.theme, props.terrain],
  () => {
    disposeMap();
    createRenderer();
    buildMap();
    buildLabelsAndPoints();
    buildEffects();
    bindPointerInteraction();
    renderLoop();
  },
  { deep: false },
);

onBeforeUnmount(disposeMap);
</script>

<style scoped>
.three-scope-map {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: auto;
}
</style>
```

## Implementation Notes

- Keep `scope` explicit; do not infer world/country/province/city/district from feature count alone in rendering code.
- Keep projection, camera, geometry scale, and texture config scope-aware.
- Dispose all Three.js resources when rebuilding after scope/theme changes.
- Keep labels and scatter points data-driven so old province points do not survive a country switch.
- For drilldown, parent state should update `scope`, `regionName`, `geoJson`, labels, scatter points, fly lines, terrain, and camera in one transaction.
