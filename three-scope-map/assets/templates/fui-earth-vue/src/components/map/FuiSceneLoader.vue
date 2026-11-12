<!-- SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1 -->
<!-- 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天 -->
<template>
  <div class="scene-loader" role="status" aria-live="polite" :data-error="error">
    <div v-if="!error" class="scene-loader__instrument" aria-hidden="true"><i/><i/><b/></div>
    <span>{{ error ? errorLabel : label }}</span>
    <button v-if="error && retryable" type="button" @click="$emit('retry')">重新加载</button>
  </div>
</template>
<script setup lang="ts">
withDefaults(defineProps<{label?:string;error?:boolean;errorLabel?:string;retryable?:boolean}>(),{label:'正在准备地图',error:false,errorLabel:'地图加载失败，请重试',retryable:false});
defineEmits<{retry:[]}>();
</script>
<style scoped>
.scene-loader{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;color:var(--fui-instrument-color,#8ac8ed);pointer-events:none;background:transparent;font:12px/1.5 ui-sans-serif,system-ui;letter-spacing:.16em}
.scene-loader__instrument{position:relative;width:78px;height:78px;animation:loader-arrive .4s ease-out both}
.scene-loader__instrument i{position:absolute;inset:0;border:1px solid currentColor;border-radius:50%;opacity:.3}
.scene-loader__instrument i:first-child{border-color:currentColor transparent transparent currentColor;opacity:.9;animation:loader-orbit 2s linear infinite}
.scene-loader__instrument i:nth-child(2){inset:9px;border-style:dashed;animation:loader-orbit 8s linear reverse infinite}
.scene-loader__instrument b{position:absolute;inset:30px;border:1px solid currentColor;transform:rotate(45deg);opacity:.8}
.scene-loader[data-error=true]{color:#b7c2cc;letter-spacing:.04em}
.scene-loader[data-error=true]{pointer-events:auto}.scene-loader button{padding:9px 18px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;letter-spacing:.04em;cursor:pointer}.scene-loader button:focus-visible{outline:2px solid currentColor;outline-offset:4px}
@keyframes loader-orbit{to{transform:rotate(360deg)}}
@keyframes loader-arrive{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.scene-loader__instrument,.scene-loader__instrument i{animation:none}}
</style>
