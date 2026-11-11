<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div
    class="contour-map-stage"
    :class="{ 'is-active': props.active, 'is-dragging': dragging, 'is-survey': currentItem.scope === 'district' }"
    :style="mapThemeStyle"
    :aria-hidden="!props.active"
    :inert="!props.active"
  >
    <div
      ref="rendererHost"
      class="contour-terrain-host"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    />

    <div class="contour-map-drill-control">
      <button type="button" :disabled="currentPath.length <= 1 || loading" @click="goBack">返回上级</button>
      <span>{{ currentScopeLabel }} / {{ currentItem.regionName }}</span>
      <select v-if="regionOptions.length" :key="currentItem.code" aria-label="选择下一级区域" :disabled="loading" :value="''" @change="selectRegion">
        <option value="" disabled>进入{{ nextScopeLabel }}…</option>
        <option v-for="region in regionOptions" :key="region.code" :value="region.code">{{ region.name }}</option>
      </select>
      <button type="button" :disabled="loading" @click="resetView">重置视角</button>
    </div>

    <div class="contour-interaction-tip">左键旋转 · 右键平移 · 滚轮缩放<span v-if="localTerrain && bundle"> · 细线 {{ bundle.metadata.interval }}m · 主线 {{ bundle.metadata.interval * bundle.metadata.majorEvery }}m</span></div>
    <label v-if="localTerrain && bundle" class="contour-relief-control">
      地形起伏
      <select v-model="relief" aria-label="地形起伏" :disabled="loading" @change="changeRelief">
        <option value="recommended">推荐</option>
        <option v-for="ratio in [1, 2, 4, 8, 12]" :key="ratio" :value="String(ratio)">{{ ratio }}×</option>
      </select>
    </label>
    <div v-if="detailLoading || detailError" class="contour-detail-status" role="status">
      {{ detailError || '正在细化当前视野…' }}
      <button v-if="detailError" @click="retryDetail">重试</button>
    </div>

    <div v-if="bundle" class="contour-map-legend">
      <span class="legend-title">{{ currentItem.scope === 'district' ? '分层高程' : '高程' }}</span>
      <span class="legend-gradient" :style="localTerrain ? { background: contourLegendGradient(true, currentItem.scope === 'district') } : undefined" aria-hidden="true" />
      <span>{{ formatLegendValue(bundle.colorRange?.[0] ?? bundle.metadata.minElevation) }}</span>
      <span>{{ formatLegendValue(bundle.colorRange?.[1] ?? bundle.metadata.maxElevation) }}</span>
      <span v-if="currentItem.scope === 'district'" class="survey-legend-detail">细线 {{ bundle.metadata.interval }}m · 主线 {{ bundle.metadata.interval * bundle.metadata.majorEvery }}m · 起伏 {{ verticalExaggeration }}×</span>
    </div>

    <div v-if="bundle?.metadata.demo" class="contour-demo-badge">
      相对高程演示 · 非真实海拔
    </div>
    <div
      v-else-if="bundle"
      class="contour-source-badge"
      :title="[bundle.metadata.attribution || bundle.metadata.source, bundle.metadata.processing].filter(Boolean).join('\n')"
    >
      真实高程（m） · 纵向夸张 {{ verticalExaggeration }}× · {{ shortSource(bundle.metadata.source) }}
    </div>
    <div v-if="loading || errorMessage" class="contour-map-status" :class="{ 'is-error': errorMessage }">
      {{ errorMessage || '正在加载三维高程地形…' }}
      <button v-if="errorMessage" @click="retryNavigation">重新加载真实高程</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { GeoFeatureCollection } from '../../types/geo';
import { loadMapLevel } from './mapDataAdapter';
import {
  initialMapNavigationPath,
  mapNavigationKey,
  mapScopeLabel,
  nextMapScope,
  type MapNavigationPath,
} from './mapNavigation';
import { getContourMapConfig, resolveContourScopeStyle } from './contourMapConfig';
import { loadContourBundle, type ContourBundle } from './contourDataAdapter';
import {
  createContourTerrainRenderer,
  contourLegendGradient,
  findContourFeatureAtCoordinate,
  type ContourCameraState,
  type ContourTerrainRuntime,
} from './contourMapRenderer';
import {
  createContourMapDiagnostics,
  publishContourMapDiagnostics,
} from './contourMapDiagnostics';
import { mapThemeStyle } from './mapTheme';
import { requestTerrain } from './contourTerrainSource';
import { isLocalTerrain, type TerrainBounds } from './contourTerrainMath';

const props = withDefaults(defineProps<{
  active?: boolean;
  navigation?: MapNavigationPath;
}>(), {
  active: false,
  navigation: () => [...initialMapNavigationPath],
});

const emit = defineEmits<{
  ready: [];
  'navigation-change': [path: MapNavigationPath];
}>();

const rendererHost = ref<HTMLElement>();
const currentPath = ref<MapNavigationPath>(props.navigation.map((item) => ({ ...item })));
const loading = ref(true);
const errorMessage = ref('');
const dragging = ref(false);
const bundle = shallowRef<ContourBundle>();
const regionOptions = ref<{ code: string; name: string }[]>([]);
const relief = ref('recommended');
const detailLoading = ref(false);
const detailError = ref('');
const config = getContourMapConfig();
const diagnostics = createContourMapDiagnostics();
const currentItem = computed(() => currentPath.value.at(-1) ?? initialMapNavigationPath[0]);
const currentScopeLabel = computed(() => mapScopeLabel[currentItem.value.scope]);
const localTerrain = computed(() => isLocalTerrain(currentItem.value.scope));
const nextScopeLabel = computed(() => mapScopeLabel[nextMapScope(currentItem.value.scope) ?? 'district']);
const verticalExaggeration = computed(() => {
  const metadata = bundle.value?.metadata;
  if (!metadata || metadata.elevationUnit !== 'm') return 0;
  const referenceBbox = bundle.value?.referenceBbox ?? metadata.bbox;
  const style = resolveContourScopeStyle(config, metadata.scope, referenceBbox, metadata.elevationUnit);
  if (localTerrain.value && relief.value !== 'recommended') return Number(relief.value);
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = referenceBbox;
  const middleLatitude = (minLatitude + maxLatitude) / 2 * Math.PI / 180;
  const metresPerWorldUnit = (maxLongitude - minLongitude) * Math.cos(middleLatitude) * 111_320
    / config.terrain.width;
  return Math.round(style.elevationScale * metresPerWorldUnit * 10) / 10;
});
let geoData: GeoFeatureCollection | undefined;
let runtime: ContourTerrainRuntime | undefined;
let resizeObserver: ResizeObserver | undefined;
let navigationVersion = 0;
let readyEmitted = false;
let renderableReady = false;
let pointerStart: { x: number; y: number; pointerId: number } | undefined;
let pointerMoved = false;
let navigationAbort: AbortController | undefined;
let detailAbort: AbortController | undefined;
let detailTimer: ReturnType<typeof setTimeout> | undefined;
let detailVersion = 0;
let pendingView: TerrainBounds | undefined;
let requestedPath: MapNavigationPath = [...currentPath.value];

function changeRelief() {
  if (!bundle.value || !geoData || !localTerrain.value) return;
  const scope = currentItem.value.scope;
  const preset = getContourMapConfig().scopeStyles[scope];
  config.scopeStyles[scope] = { ...preset, terrain: { ...preset?.terrain,
    verticalExaggeration: relief.value === 'recommended' ? preset?.terrain?.verticalExaggeration : Number(relief.value) } };
  runtime?.setData(bundle.value, geoData, true);
  publishContourMapDiagnostics(diagnostics, { verticalExaggeration: verticalExaggeration.value });
}

function selectRegion(event: Event) {
  const code = (event.target as HTMLSelectElement).value;
  const region = regionOptions.value.find(item => item.code === code);
  const scope = nextMapScope(currentItem.value.scope);
  if (region && scope) void syncNavigation([...currentPath.value, { scope, code, regionName: region.name }], true);
}

function refreshVisibleTerrain(bbox: TerrainBounds) {
  if (!localTerrain.value || !bundle.value?.referenceBbox || loading.value) return;
  pendingView = bbox;
  clearTimeout(detailTimer);
  detailAbort?.abort();
  const version = ++detailVersion;
  const navVersion = navigationVersion;
  detailTimer = setTimeout(async () => {
    const referenceBbox = bundle.value?.referenceBbox;
    if (!referenceBbox) return;
    detailAbort = new AbortController();
    detailLoading.value = true;
    detailError.value = '';
    try {
      const nextBundle = await requestTerrain({ item: { ...currentItem.value }, referenceBbox, bbox, tileUrl: config.terrainTileUrl }, detailAbort.signal);
      if (version !== detailVersion || navVersion !== navigationVersion || !geoData || !runtime) return;
      nextBundle.colorRange = bundle.value?.colorRange;
      bundle.value = nextBundle;
      const stats = runtime.setData(nextBundle, geoData, true);
      publishContourMapDiagnostics(diagnostics, { ...stats, source: nextBundle.metadata.source,
        interval: nextBundle.metadata.interval, detailUpdates: diagnostics.detailUpdates + 1,
        flatTerrain: nextBundle.contours.length === 0 && nextBundle.metadata.maxElevation - nextBundle.metadata.minElevation < nextBundle.metadata.interval });
    } catch (error) {
      if (version === detailVersion && navVersion === navigationVersion && !(error instanceof DOMException && error.name === 'AbortError'))
        detailError.value = '当前精度已保留，新增地形加载失败';
    } finally {
      if (version === detailVersion) detailLoading.value = false;
    }
  }, 240);
}

function retryDetail() { if (pendingView) refreshVisibleTerrain(pendingView); }
function retryNavigation() { void syncNavigation(requestedPath, true); }

function publishFrame(state: ContourCameraState) {
  if (!renderableReady) return;
  publishContourMapDiagnostics(diagnostics, {
    phase: 'ready',
    firstFrameRendered: true,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    cameraPosition: state.position,
    cameraTarget: state.target,
  });
  if (!readyEmitted) {
    readyEmitted = true;
    emit('ready');
  }
}

function resetView() {
  runtime?.resetView();
}

async function syncNavigation(path: MapNavigationPath, emitChange = false) {
  const item = path.at(-1);
  if (!item || !runtime) return;
  const version = ++navigationVersion;
  requestedPath = path.map(entry => ({ ...entry }));
  navigationAbort?.abort();
  navigationAbort = new AbortController();
  detailAbort?.abort();
  clearTimeout(detailTimer);
  detailVersion++;
  detailLoading.value = false;
  detailError.value = '';
  loading.value = true;
  renderableReady = false;
  errorMessage.value = '';
  publishContourMapDiagnostics(diagnostics, {
    phase: 'loading',
    navigationKey: mapNavigationKey(path),
  });
  try {
    const nextGeoData = await loadMapLevel(item.scope, item.code);
    if (version !== navigationVersion) return;
    const nextBundle = await loadContourBundle(item, nextGeoData, config, navigationAbort.signal);
    if (version !== navigationVersion) return;
    geoData = nextGeoData;
    bundle.value = nextBundle;
    currentPath.value = path.map((entry) => ({ ...entry }));
    relief.value = 'recommended';
    if (isLocalTerrain(item.scope)) config.scopeStyles[item.scope] = getContourMapConfig().scopeStyles[item.scope];
    regionOptions.value = nextMapScope(item.scope) ? nextGeoData.features.map(feature => ({
      code: String(feature.properties.adcode ?? feature.properties.code ?? feature.properties.id ?? ''),
      name: String(feature.properties.fullname ?? feature.properties.name ?? ''),
    })).filter(region => region.code && region.name && !region.code.endsWith('_JD') && region.code !== item.code) : [];
    const stats = runtime.setData(nextBundle, nextGeoData);
    publishContourMapDiagnostics(diagnostics, {
      phase: 'ready',
      navigationKey: mapNavigationKey(path),
      source: nextBundle.metadata.source,
      demoData: nextBundle.metadata.demo,
      elevationUnit: nextBundle.metadata.elevationUnit,
      coverage: 'bbox',
      contourBbox: stats.contourBbox,
      surfaceBbox: stats.surfaceBbox,
      overscanSurface: stats.overscanSurface,
      contourFeatureCount: stats.contourFeatureCount,
      meshVertexCount: stats.meshVertexCount,
      meshTriangleCount: stats.meshTriangleCount,
      verticalExaggeration: verticalExaggeration.value,
      interval: nextBundle.metadata.interval,
      detailUpdates: 0,
      flatTerrain: nextBundle.contours.length === 0 && nextBundle.metadata.maxElevation - nextBundle.metadata.minElevation < nextBundle.metadata.interval,
      errors: [],
    });
    renderableReady = true;
    runtime.render();
    if (emitChange) emit('navigation-change', [...currentPath.value]);
  } catch (error) {
    if (version !== navigationVersion) return;
    const message = error instanceof Error ? error.message : '未知错误';
    errorMessage.value = `等高线数据加载失败：${message}`;
    publishContourMapDiagnostics(diagnostics, {
      phase: 'error',
      errors: [...diagnostics.errors, errorMessage.value].slice(-20),
    });
  } finally {
    if (version === navigationVersion) loading.value = false;
  }
}

async function drillAt(clientX: number, clientY: number) {
  const scope = nextMapScope(currentItem.value.scope);
  if (!scope || !geoData || loading.value) return;
  const coordinate = runtime?.pickCoordinate(clientX, clientY);
  if (!coordinate) return;
  const hit = findContourFeatureAtCoordinate(geoData, coordinate);
  if (!hit?.code) return;
  await syncNavigation([
    ...currentPath.value,
    { scope, regionName: hit.name, code: hit.code },
  ], true);
}

function goBack() {
  if (currentPath.value.length <= 1 || loading.value) return;
  void syncNavigation(currentPath.value.slice(0, -1), true);
}

function onPointerDown(event: PointerEvent) {
  if (!props.active || loading.value || event.button !== 0) return;
  pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  pointerMoved = false;
  dragging.value = true;
}

function onPointerMove(event: PointerEvent) {
  if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
  pointerMoved ||= Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5;
}

function onPointerUp(event: PointerEvent) {
  if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
  const shouldDrill = !pointerMoved;
  pointerStart = undefined;
  dragging.value = false;
  if (shouldDrill) void drillAt(event.clientX, event.clientY);
}

function onPointerCancel() {
  pointerStart = undefined;
  pointerMoved = false;
  dragging.value = false;
}

function formatLegendValue(value: number) {
  return bundle.value?.metadata.elevationUnit === 'm' ? `${Math.round(value)}m` : `L${Math.round(value)}`;
}

function shortSource(source: string) {
  return source.includes('Mapzen') || source.includes('Terrain Tiles') ? 'Terrain Tiles' : source;
}

function waitForPaint() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

async function prepareForReveal() {
  runtime?.resize();
  runtime?.render();
  await waitForPaint();
}

defineExpose({ prepareForReveal });

watch(
  () => mapNavigationKey(props.navigation),
  () => {
    if (mapNavigationKey(props.navigation) === mapNavigationKey(currentPath.value)) return;
    void syncNavigation(props.navigation);
  },
);

watch(() => props.active, (active) => {
  runtime?.setActive(active);
  if (active) {
    runtime?.resize();
    runtime?.render();
  }
});

onMounted(() => {
  if (!rendererHost.value) return;
  runtime = createContourTerrainRenderer(rendererHost.value, config, publishFrame, refreshVisibleTerrain);
  runtime.setActive(props.active);
  resizeObserver = new ResizeObserver(() => runtime?.resize());
  resizeObserver.observe(rendererHost.value);
  void syncNavigation(currentPath.value);
});

onBeforeUnmount(() => {
  navigationVersion += 1;
  detailVersion++;
  navigationAbort?.abort();
  detailAbort?.abort();
  clearTimeout(detailTimer);
  resizeObserver?.disconnect();
  runtime?.dispose();
  publishContourMapDiagnostics(diagnostics, { phase: 'destroyed' });
});
</script>

<style scoped>
.contour-map-stage {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  background: var(--map-contour-background, #030907);
}

.contour-map-stage.is-active {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}

.contour-terrain-host {
  position: absolute;
  inset: 0;
  cursor: grab;
  touch-action: none;
}

.contour-map-stage.is-dragging .contour-terrain-host {
  cursor: grabbing;
}

.contour-terrain-host :deep(.contour-terrain-canvas) {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}

.contour-map-drill-control {
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
  text-shadow: 0 0 10px var(--map-drill-glow);
}

.contour-map-drill-control button {
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--map-drill-border);
  border-radius: 2px;
  background: var(--map-drill-background);
  color: var(--map-drill-text);
  cursor: pointer;
  box-shadow: inset 0 0 14px var(--map-drill-box-inner), 0 0 12px var(--map-drill-box-outer);
}

.contour-map-drill-control button:disabled {
  cursor: default;
  opacity: 0.35;
}

.contour-map-drill-control select,
.contour-relief-control select {
  max-width: 150px;
  height: 26px;
  border: 1px solid rgba(177, 192, 158, 0.28);
  border-radius: 3px;
  background: #101a14;
  color: #d8e0ce;
  font: inherit;
}

.contour-relief-control {
  position: absolute;
  left: 32px;
  bottom: 65px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #b2bfaa;
  font-size: 11px;
}

.contour-detail-status {
  position: absolute;
  right: 32px;
  bottom: 65px;
  color: #bac8b0;
  font-size: 11px;
}

.contour-map-status button,
.contour-detail-status button {
  margin-left: 12px;
  padding: 5px 10px;
  border: 1px solid #66765b;
  border-radius: 3px;
  background: #1d2a20;
  color: #e0ead7;
  cursor: pointer;
}

.contour-interaction-tip {
  position: absolute;
  left: 32px;
  bottom: 32px;
  z-index: 3;
  color: rgba(220, 244, 199, 0.52);
  font-size: 11px;
  letter-spacing: 0.08em;
  pointer-events: none;
}

.contour-map-legend {
  position: absolute;
  left: 50%;
  bottom: 94px;
  z-index: 3;
  display: grid;
  grid-template-columns: auto 150px auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--map-contour-boundary) 28%, transparent);
  background: rgba(2, 9, 7, 0.7);
  color: var(--map-contour-label);
  font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  transform: translateX(-50%);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.legend-title {
  letter-spacing: 0.12em;
}

.is-survey .contour-map-drill-control { top: 32px; right: 28px; left: auto; transform: none; }
.is-survey .contour-map-drill-control { color: #f0ddb0; text-shadow: none; }
.is-survey .contour-map-drill-control button { box-shadow: none; background: #071a1d; border-color: #9c7e3b; color: #ffe2a0; }
.is-survey .contour-map-drill-control select,
.is-survey .contour-relief-control select { background: #071a1d; border-color: #527270; color: #e9e2c8; }
.is-survey .contour-map-legend { left: 28px; bottom: 82px; grid-template-columns: auto 180px auto auto; transform: none; background: #071a1d; backdrop-filter: none; border-color: #526d65; color: #f1e9cf; }
.is-survey .legend-gradient { width: 180px; height: 10px; }
.survey-legend-detail { grid-column: 1 / -1; padding-top: 6px; color: #b9c9bf; }
.is-survey .contour-interaction-tip { color: #b9c9bf; bottom: 26px; }
.is-survey .contour-interaction-tip span { display: none; }
@media (max-width: 700px) {
  .is-survey .contour-map-drill-control { top: 90px; left: 28px; right: auto; font-size: 12px; }
  .is-survey .contour-source-badge { bottom: 8px; left: 28px; right: auto; font-size: 9px; }
}

.legend-gradient {
  width: 150px;
  height: 7px;
  background: linear-gradient(90deg, #07120d, #203119 56%, #9eae68);
}

.contour-demo-badge,
.contour-source-badge {
  position: absolute;
  right: 32px;
  bottom: 32px;
  z-index: 3;
  color: rgba(235, 245, 222, 0.62);
  font-size: 11px;
  letter-spacing: 0.06em;
  pointer-events: none;
}

.contour-source-badge {
  color: rgba(220, 244, 199, 0.76);
}

.contour-map-status {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 4;
  padding: 10px 16px;
  border: 1px solid var(--map-drill-border);
  background: rgba(2, 9, 7, 0.88);
  color: var(--map-contour-label);
  transform: translate(-50%, -50%);
}

.contour-map-status.is-error {
  border-color: rgba(255, 112, 112, 0.72);
  color: #ffd7d7;
}
</style>
