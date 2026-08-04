<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div ref="mount" class="earth-mount" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createEarthView, type EarthViewHandle } from './core/earthViewCore';

const props = withDefaults(defineProps<{ startIntro?: boolean }>(), { startIntro: true });
const emit = defineEmits<{
  'scene-ready': [];
  'intro-ready': [];
  'handoff-start': [];
  'enter-china': [];
}>();

const mount = ref<HTMLElement>();
let instance: EarthViewHandle | undefined;

onMounted(() => {
  if (!mount.value) return;
  instance = createEarthView(mount.value, {
    onSceneReady: () => emit('scene-ready'),
    onIntroReady: () => emit('intro-ready'),
    onHandoffStart: () => emit('handoff-start'),
    onEnterChina: () => emit('enter-china'),
  });
  instance.setStartIntro(props.startIntro);
});

watch(() => props.startIntro, (value) => instance?.setStartIntro(value));

onBeforeUnmount(() => {
  instance?.destroy();
  instance = undefined;
});
</script>
