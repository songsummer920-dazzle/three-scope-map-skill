<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div ref="host" class="map-mount" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createScopeMap, type ScopeMapHandle } from './core/scopeMapCore';

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const emit = defineEmits<{ ready: [] }>();

const host = ref<HTMLElement>();
let instance: ScopeMapHandle | undefined;

onMounted(() => {
  if (!host.value) return;
  instance = createScopeMap(host.value, {
    active: props.active,
    onReady: () => emit('ready'),
  });
});

watch(() => props.active, (value) => instance?.setActive(value));

onBeforeUnmount(() => {
  instance?.destroy();
  instance = undefined;
});
</script>
