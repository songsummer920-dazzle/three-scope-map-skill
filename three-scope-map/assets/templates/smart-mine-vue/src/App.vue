<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
-->
<template>
  <main class="map-page">
    <EarthChinaMap />
  </main>
</template>

<script setup lang="ts">
import EarthChinaMap from './components/map/EarthChinaMap.vue';
</script>

<style scoped>
.map-page {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000201;
}
</style>
