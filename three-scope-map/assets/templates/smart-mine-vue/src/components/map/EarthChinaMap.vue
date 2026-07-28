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
        :active="mode === 'china'"
        @ready="onChinaReady"
      />
    </div>
    <EarthView
      v-show="mode === 'earth'"
      key="earth"
      :start-intro="chinaReady"
      @scene-ready="prepareChinaMap"
      @handoff-start="beginChinaHandoff"
      @enter-china="showChinaMap"
    />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import EarthView from './EarthView.vue';

const ChinaMap = defineAsyncComponent(() => import('./ChinaMap.vue'));

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

function prepareChinaMap() {
  if (chinaMounted.value) return;
  chinaMounted.value = true;
}

onBeforeUnmount(() => {
  if (handoffCleanupHandle !== undefined) globalThis.clearTimeout(handoffCleanupHandle);
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
  transform: translateZ(0) scale(0.78);
  transform-origin: 50% 50%;
  backface-visibility: hidden;
  will-change: transform, opacity;
  contain: layout paint;
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

.china-map-stage:not(.is-active) :deep(.map-host) {
  filter: none;
}

.china-map-stage:not(.is-active) :deep(.map-label-layer),
.china-map-stage:not(.is-active) :deep(.map-drill-control),
.china-map-stage:not(.is-active) :deep(.south-sea-inset) {
  display: none;
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
    transform: translateZ(0) scale(0.78);
  }
  28% {
    opacity: 0.24;
    transform: translateZ(0) scale(0.83);
  }
  66% {
    opacity: 0.78;
    transform: translateZ(0) scale(0.94);
  }
  100% {
    opacity: 1;
    transform: translateZ(0) scale(1);
  }
}
</style>
