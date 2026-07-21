<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <ZhejiangThreeMap :active="props.active" @ready="emit('ready')" />
</template>

<script setup lang="ts">
import ZhejiangThreeMap from './ZhejiangThreeMap.vue';

const props = withDefaults(defineProps<{
  active?: boolean;
}>(), {
  active: true,
});

const emit = defineEmits<{
  ready: [];
}>();
</script>
