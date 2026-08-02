<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div ref="mount" class="earth-china-mount" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  createEarthChinaMap,
  type EarthChinaMapHandle,
  type EarthChinaMapMode,
} from './core/earthChinaMapCore';

const emit = defineEmits<{ 'mode-change': [mode: EarthChinaMapMode] }>();

const mount = ref<HTMLElement>();
let instance: EarthChinaMapHandle | undefined;

onMounted(() => {
  if (!mount.value) return;
  instance = createEarthChinaMap(mount.value, {
    onModeChange: (mode) => emit('mode-change', mode),
  });
});

onBeforeUnmount(() => {
  instance?.destroy();
  instance = undefined;
});
</script>
