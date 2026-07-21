<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="earth-china-map">
    <div
      v-if="chinaMounted"
      class="china-map-stage"
      :class="{
        'is-active': mode === 'china',
        'is-handoff': handoffActive,
        'is-ready': chinaReady,
      }"
    >
      <ChinaMap
        key="china"
        :active="mode === 'china' || handoffActive"
        @ready="onChinaReady"
      />
    </div>
    <EarthView
      v-show="mode === 'earth'"
      key="earth"
      @intro-ready="preloadChinaMap"
      @handoff-start="beginChinaHandoff"
      @enter-china="showChinaMap"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import ChinaMap from './ChinaMap.vue';
import EarthView from './EarthView.vue';

export type EarthChinaMapMode = 'earth' | 'china';

const emit = defineEmits<{
  'mode-change': [mode: EarthChinaMapMode];
}>();

const mode = ref<EarthChinaMapMode>('earth');
const chinaMounted = ref(false);
const chinaReady = ref(false);
const handoffActive = ref(false);
let pendingChinaEntry = false;
let pendingHandoff = false;
let preloadHandle: number | undefined;
let preloadDelayHandle: number | undefined;
let handoffCleanupHandle: number | undefined;
function showChinaMap() {
  if (!chinaReady.value) {
    pendingChinaEntry = true;
    chinaMounted.value = true;
    return;
  }
  mode.value = 'china';
  emit('mode-change', mode.value);
  handoffCleanupHandle = globalThis.setTimeout(() => {
    handoffActive.value = false;
  }, 920);
}

function beginChinaHandoff() {
  if (!chinaReady.value) {
    pendingHandoff = true;
    chinaMounted.value = true;
    return;
  }
  handoffActive.value = true;
}

function onChinaReady() {
  chinaReady.value = true;
  if (pendingHandoff) {
    pendingHandoff = false;
    beginChinaHandoff();
  }
  if (!pendingChinaEntry) return;
  pendingChinaEntry = false;
  showChinaMap();
}

function preloadChinaMap() {
  if (chinaMounted.value || preloadHandle !== undefined) return;
  const mountChina = () => {
    chinaMounted.value = true;
  };
  if ('requestIdleCallback' in window) {
    preloadHandle = window.requestIdleCallback(mountChina, { timeout: 500 });
  } else {
    preloadHandle = globalThis.setTimeout(mountChina, 0);
  }
}

onMounted(() => {
  preloadDelayHandle = globalThis.setTimeout(() => {
    preloadChinaMap();
  }, 1800);
});

onBeforeUnmount(() => {
  if (preloadDelayHandle !== undefined) globalThis.clearTimeout(preloadDelayHandle);
  if (handoffCleanupHandle !== undefined) globalThis.clearTimeout(handoffCleanupHandle);
  if (preloadHandle === undefined) return;
  if ('cancelIdleCallback' in window) window.cancelIdleCallback(preloadHandle);
  else globalThis.clearTimeout(preloadHandle);
});
</script>

<style scoped>
.earth-china-map {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
}

.china-map-stage {
  position: absolute;
  inset: 0;
  z-index: 6;
  opacity: 0;
  visibility: hidden;
  transform: scale(0.78);
  pointer-events: none;
  transition:
    opacity 420ms ease,
    transform 620ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s linear 620ms;
}

.china-map-stage.is-handoff {
  visibility: visible;
  animation: china-cloud-reveal 1.44s cubic-bezier(0.22, 0.72, 0.18, 1) both;
}

.china-map-stage.is-active {
  opacity: 1;
  visibility: visible;
  transform: scale(1);
  pointer-events: auto;
  animation: none;
  transition-delay: 0s;
}

@keyframes china-cloud-reveal {
  0% {
    opacity: 0.06;
    transform: scale(0.78);
  }
  28% {
    opacity: 0.24;
    transform: scale(0.83);
  }
  66% {
    opacity: 0.78;
    transform: scale(0.94);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
