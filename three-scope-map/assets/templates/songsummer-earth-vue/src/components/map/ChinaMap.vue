<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="hybrid-map" :style="mapThemeStyle">
    <div
      class="three-renderer-layer"
      :class="{ 'is-active': viewMode === '3d' }"
      :aria-hidden="viewMode !== '3d'"
      :inert="viewMode !== '3d'"
    >
      <ZhejiangThreeMap
        v-if="threeMounted"
        ref="threeMapRef"
        :active="props.active && viewMode === '3d'"
        @ready="onThreeReady"
        @navigation-change="onThreeNavigationChange"
      />
    </div>
    <VectorMap
      v-if="vectorMounted"
      ref="vectorMapRef"
      :active="props.active && (viewMode === '2d'||viewMode === 'overlay')"
      :navigation="navigationPath"
      :overlay="viewMode==='overlay'"
      :overlay-surface="props.overlaySurface"
      @ready="onVectorReady"
      @navigation-change="onVectorNavigationChange"
    />

    <div
      v-if="switchMaskMounted"
      class="map-switch-mask"
      :class="{ 'is-covered': switchMaskCovered }"
      aria-hidden="true"
    />
    <span v-if="switchError" class="map-switch-error" role="status">{{switchError}}</span>

    <div v-if="props.active" class="map-view-switch" role="group" aria-label="地图视图切换">
      <button
        type="button"
        :aria-pressed="viewMode === '3d'"
        :class="{ active: viewMode === '3d' }"
        :disabled="switching"
        @click="switchView('3d')"
      >3D 地图</button>
      <button
        type="button"
        :aria-pressed="viewMode === '2d'"
        :class="{ active: viewMode === '2d' }"
        :disabled="switching"
        @click="switchView('2d')"
      >{{ switching && pendingMode === '2d' ? '2D 加载中' : '2D 地图' }}</button>
      <button type="button" :aria-pressed="viewMode==='overlay'" :class="{active:viewMode==='overlay'}" :disabled="switching" @click="switchView('overlay')">{{switching&&pendingMode==='overlay'?'叠加加载中':'2D + 3D'}}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue';
import ZhejiangThreeMap from './ZhejiangThreeMap.vue';
const VectorMap=defineAsyncComponent(()=>import('./VectorMap.vue'));
import { mapThemeStyle } from './mapTheme';
import {
  initialMapNavigationPath,
  mapNavigationKey,
  type MapNavigationPath,
} from './mapNavigation';

const props = withDefaults(defineProps<{
  active?: boolean;
  initialView?:'3d'|'2d'|'overlay';
  overlaySurface?:'classic'|'terrain-glass'|'smooth-glass';
  preloadViews?:boolean;
}>(), {
  active: true,
  initialView:'3d',
  overlaySurface:'smooth-glass',
  preloadViews:false,
});

const emit = defineEmits<{
  ready: [];
}>();

type MapViewMode = '3d' | '2d' | 'overlay';
type ThreeMapExpose = {
  syncNavigation: (path: MapNavigationPath) => Promise<void>;
};
type VectorMapExpose = {
  prepareForReveal: () => Promise<void>;
};

const viewMode = ref<MapViewMode>(props.initialView);
const threeMounted=ref(props.initialView==='3d');
const threeReady=ref(false);
const vectorMounted = ref(props.initialView==='2d'||props.initialView==='overlay');
const vectorReady = ref(false);
const switching = ref(false);
const switchError=ref('');
const pendingMode = ref<MapViewMode>();
const switchMaskMounted = ref(false);
const switchMaskCovered = ref(false);
const navigationPath = ref<MapNavigationPath>([...initialMapNavigationPath]);
const threeMapRef = ref<ThreeMapExpose>();
const vectorMapRef = ref<VectorMapExpose>();
let vectorPreloadHandle: number | undefined;
let vectorPreloadKind: 'idle' | 'timeout' | undefined;
let vectorReadyWaiters: Array<(ready: boolean) => void> = [];
let threeReadyWaiters:Array<(ready:boolean)=>void>=[];
function onThreeReady(){threeReady.value=true;threeReadyWaiters.forEach(resolve=>resolve(true));threeReadyWaiters=[];if(viewMode.value==='3d')emit('ready');}
function waitForThreeReady(){if(threeReady.value)return Promise.resolve(true);return new Promise<boolean>(resolve=>{const timer=setTimeout(()=>resolve(false),15000);threeReadyWaiters.push(value=>{clearTimeout(timer);resolve(value);});});}
const switchMaskCoverDuration = 80;
const switchMaskRevealDuration = 120;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function cancelVectorPreload() {
  if (vectorPreloadHandle === undefined) return;
  const idleWindow = window as IdleWindow;
  if (vectorPreloadKind === 'idle') idleWindow.cancelIdleCallback?.(vectorPreloadHandle);
  else window.clearTimeout(vectorPreloadHandle);
  vectorPreloadHandle = undefined;
  vectorPreloadKind = undefined;
}

function scheduleVectorPreload() {
  if (!props.preloadViews || !props.active || vectorMounted.value || viewMode.value !== '3d') return;
  cancelVectorPreload();
  const idleWindow = window as IdleWindow;
  const mount = () => {
    vectorPreloadHandle = undefined;
    vectorPreloadKind = undefined;
    if (props.active && viewMode.value === '3d') vectorMounted.value = true;
  };
  if (idleWindow.requestIdleCallback) {
    vectorPreloadKind = 'idle';
    vectorPreloadHandle = idleWindow.requestIdleCallback(mount, { timeout: 48 });
  } else {
    vectorPreloadKind = 'timeout';
    vectorPreloadHandle = window.setTimeout(mount, 48);
  }
}

function onVectorReady() {
  if(viewMode.value==='2d'||viewMode.value==='overlay')emit('ready');
  if (vectorReady.value) return;
  vectorReady.value = true;
  vectorReadyWaiters.forEach((resolve) => resolve(true));
  vectorReadyWaiters = [];
}

function waitForVectorReady(timeout = 30000) {
  if (vectorReady.value) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      vectorReadyWaiters = vectorReadyWaiters.filter((waiter) => waiter !== finish);
      resolve(ready);
    };
    const timer = window.setTimeout(() => finish(false), timeout);
    vectorReadyWaiters.push(finish);
  });
}

function updateNavigation(path: MapNavigationPath) {
  if (mapNavigationKey(path) === mapNavigationKey(navigationPath.value)) return;
  navigationPath.value = path.map((item) => ({ ...item }));
}

function onThreeNavigationChange(path: MapNavigationPath) {
  if (viewMode.value === '3d') updateNavigation(path);
}

function onVectorNavigationChange(path: MapNavigationPath) {
  if (viewMode.value === '2d'||viewMode.value==='overlay') updateNavigation(path);
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function wait(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

async function runMaskedSwitch(mode: MapViewMode) {
  switchMaskMounted.value = true;
  await waitForPaint();
  switchMaskCovered.value = true;
  await waitForPaint();
  const coverStartedAt = performance.now();

  if (mode === '2d'||mode==='overlay') await vectorMapRef.value?.prepareForReveal();
  else await threeMapRef.value?.syncNavigation(navigationPath.value);

  const remainingCoverTime = switchMaskCoverDuration - (performance.now() - coverStartedAt);
  if (remainingCoverTime > 0) await wait(remainingCoverTime);

  viewMode.value = mode;
  await waitForPaint();
  switchMaskCovered.value = false;
  await waitForPaint();
  await wait(switchMaskRevealDuration);
  switchMaskMounted.value = false;
}

async function switchView(mode: MapViewMode) {
  if (mode === viewMode.value || switching.value || !props.active) return;
  switching.value = true;
  switchError.value='';
  pendingMode.value = mode;
  try {
    if (mode === '2d'||mode==='overlay') {
      cancelVectorPreload();
      vectorMounted.value = true;
      if(!await waitForVectorReady()){if(props.active)switchError.value='底图暂未就绪，请稍后重试';return;}
      if(!props.active)return;
    }else if(mode==='3d'){
      threeMounted.value=true;await nextTick();if(!await waitForThreeReady()||!props.active)return;
    }
    await runMaskedSwitch(mode);
  } finally {
    switching.value = false;
    pendingMode.value = undefined;
  }
}

function cancelReadyWaiters() {
  threeReadyWaiters.splice(0).forEach((resolve) => resolve(false));
  vectorReadyWaiters.splice(0).forEach((resolve) => resolve(false));
}

watch(() => props.active, (active) => {
  if (active) scheduleVectorPreload();
  else {
    cancelVectorPreload();
    cancelReadyWaiters();
  }
});

onMounted(scheduleVectorPreload);
watch(()=>props.initialView,view=>{if(view!==viewMode.value)void switchView(view);});
defineExpose({switchView,getView:()=>viewMode.value});

onBeforeUnmount(() => {
  cancelReadyWaiters();
  cancelVectorPreload();
});
</script>

<style scoped>
.hybrid-map {
  position: absolute;
  inset: 0;
}

.three-renderer-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.three-renderer-layer.is-active {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.map-switch-mask {
  position: absolute;
  inset: 0;
  z-index: 13;
  pointer-events: none;
  opacity: 0;
  background:
    radial-gradient(
      ellipse 54% 50% at 50% 48%,
      rgba(14, 36, 44, 0.96) 0%,
      rgba(2, 10, 15, 0.985) 68%,
      rgba(0, 4, 7, 0.995) 100%
    ),
    #02080c;
  transition: opacity 120ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity;
}

.map-switch-mask.is-covered {
  opacity: 1;
  transition-duration: 80ms;
}

.map-view-switch {
  position: absolute;
  left: 50%;
  top: 126px;
  z-index: 14;
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--map-drill-border, rgba(53, 216, 255, 0.5));
  border-radius: 3px;
  background: rgba(1, 8, 13, 0.78);
  box-shadow: 0 0 18px var(--map-drill-box-outer, rgba(53, 216, 255, 0.18));
  backdrop-filter: blur(8px);
  transform: translateX(-50%);
}

.map-view-switch button {
  min-width: 86px;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--map-drill-text-alpha, rgba(220, 246, 252, 0.74));
  font-size: 13px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.map-view-switch button:hover:not(:disabled) {
  color: var(--map-drill-text, #effcff);
}

.map-view-switch button.active {
  color: #f7fdff;
  background: color-mix(in srgb, var(--map-accent, #35d8ff) 28%, rgba(3, 18, 26, 0.92));
  box-shadow: inset 0 0 14px var(--map-drill-box-inner, rgba(53, 216, 255, 0.22));
}

.map-view-switch button:disabled {
  cursor: wait;
  opacity: 0.58;
}
</style>
