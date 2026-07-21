<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="earth-china-map">
    <Transition name="china-map-enter">
      <ChinaMap v-if="mode === 'china'" key="china" />
    </Transition>
    <EarthView
      v-if="mode === 'earth'"
      key="earth"
      @enter-china="showChinaMap"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ChinaMap from './ChinaMap.vue';
import EarthView from './EarthView.vue';

export type EarthChinaMapMode = 'earth' | 'china';

const emit = defineEmits<{
  'mode-change': [mode: EarthChinaMapMode];
}>();

const mode = ref<EarthChinaMapMode>('earth');

function showChinaMap() {
  mode.value = 'china';
  emit('mode-change', mode.value);
}
</script>

<style scoped>
.earth-china-map {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
}

.china-map-enter-enter-active {
  transition: opacity 760ms ease, transform 900ms cubic-bezier(0.16, 1, 0.3, 1), filter 760ms ease;
}

.china-map-enter-enter-from {
  opacity: 0;
  transform: scale(1.08);
  filter: blur(12px);
}

.china-map-enter-enter-to {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
}
</style>
