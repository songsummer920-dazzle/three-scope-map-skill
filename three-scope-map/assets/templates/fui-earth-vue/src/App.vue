<!-- SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0 -->
<!-- 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天 -->
<template>
  <main class="skin-preview" :class="{ 'is-clean': clean }" :style="skinStyle">
    <header v-if="!clean" class="preview-header">
      <div class="preview-title"><span class="title-mark" aria-hidden="true" /><h1>FUI 地球与地图</h1><span class="edition">FUI MATERIALS</span></div>
      <button class="focus-preview" type="button" aria-label="专注预览，Esc 返回" @click="clean = true">专注预览</button>
      <span class="preview-status" role="status">{{ !ready ? '正在准备场景' : skinSwitching ? '正在切换皮肤' : mode === 'china' ? '中国地形' : alerting ? '警戒模式' : '常态模式' }}</span>
    </header>
    <div class="preview-canvas" :aria-busy="!ready || skinSwitching">
      <FuiEarth ref="earthRef" :skin="selectedSkin" :primary-color="primaryColor" :alert="alerting" :scan-style="scanStyle" :map-presentation="mapPresentation" :map-style="effectiveMapStyle" :map-wave="mapWave" :map-view="mapView" :quality="quality" :initial-mode="initialMode" :polar-style="polarStyle" :earth-presentation="earthPresentation" @ready="ready = true" @loading="onLoading" @skin-error="onSkinError" @skin-applied="onSkinApplied" @mode-change="handleModeChange" />
      <button v-if="mode === 'china'" class="preview-earth-back" type="button" @click="earthRef?.returnToEarth()">
        <span aria-hidden="true">‹</span>返回地球
      </button>
    </div>
    <footer v-if="!clean" class="preview-controls">
      <div class="skin-options" role="group" aria-label="地球皮肤">
        <button v-for="skin in normalSkins" :key="skin.id" type="button" :aria-pressed="selectedSkin === skin.id" :disabled="!ready" :title="skin.subtitle" @click="selectSkin(skin.id)">
          <span class="skin-swatch" :style="{ background: skin.accent }" aria-hidden="true" />{{ skin.name }}
        </button>
      </div>
      <div v-if="mode === 'earth'" class="scan-options" role="group" aria-label="地球样式">
        <button v-for="item in FUI_EARTH_PRESENTATIONS" :key="item.id" type="button" :aria-pressed="earthPresentation === item.id" :disabled="!ready" @click="selectEarthPresentation(item.id)">{{ item.name }}</button>
      </div>
      <div v-if="mode === 'earth' && earthPresentation === 'surface'" class="scan-options" role="group" aria-label="扫光效果">
        <button v-for="effect in FUI_EARTH_SCAN_STYLES" :key="effect.id" type="button" :aria-pressed="scanStyle === effect.id" :disabled="!ready" @click="scanStyle = effect.id">{{ effect.name }}</button>
      </div>
      <div class="map-options material-options" role="group" aria-label="地图材质与动效">
        <label>主色<input type="color" aria-label="主题主色" :value="getFuiThemePrimary(activeSkin)" @input="primaryColor=($event.target as HTMLInputElement).value" /></label>
        <label>材质<select :value="mapStyle ?? ''" aria-label="地图材质" @change="selectMapStyle(($event.target as HTMLSelectElement).value)"><option value="">跟随预设</option><option value="classic">经典</option><option value="terrain-glass">地形玻璃</option><option value="smooth-glass">平滑玻璃</option></select></label>
        <label>扩散<select v-model="mapWave" aria-label="底部扩散"><option :value="undefined">跟随预设</option><option value="hex">蜂窝</option><option value="grid">网格</option><option value="none">关闭</option></select></label>
      </div>
      <span class="material-description">{{ activeInfo.subtitle }}</span>
      <button class="alert-toggle" type="button" :title="alerting ? '恢复先前的常态皮肤' : '切换为红色警戒'" :aria-pressed="alerting" :disabled="!ready" @click="alerting = !alerting"><span class="alert-indicator" aria-hidden="true" />{{ alerting ? '解除警戒' : '开启警戒' }}</button>
      <button v-if="mode === 'china' && ready" class="replay-entry" type="button" @click="earthRef?.replayEntrance()">重播入场</button>
    </footer>
  </main>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import FuiEarth from './components/map/FuiEarth.vue';
import {FUI_EARTH_PRESENTATIONS,isFuiEarthPresentation,type FuiEarthPresentation} from './components/map/fuiEarthHologram';
import type {FuiSkinFailure,FuiEarthLoading} from './components/map/fuiEarthLifecycle';
import { FUI_SCENE_PRESETS,isFuiMapPresentation,resolveFuiMapLook, type FuiMapPresentation,type FuiMapStyle,type FuiMapWave,type FuiMapViewMode } from './components/map/fuiMapPresentation';
import type {MapQuality} from './components/map/mapQuality';
import { FUI_THEME_PRIMARY_OVERRIDE, FUI_EARTH_SCAN_STYLES, isFuiEarthScanStyle, type FuiEarthScanStyle, FUI_EARTH_SKINS, getFuiSkinStyle, isFuiEarthSkin, getFuiThemePrimary,resolveFuiEarthThemeId, type FuiEarthSkinId } from './components/map/fuiEarthTheme';
const params = new URLSearchParams(window.location.search);
const requested = params.get('skin');
const requestedEarth=params.get('earth');
const earthPresentation=ref<FuiEarthPresentation>(isFuiEarthPresentation(requestedEarth)?requestedEarth:'surface');
const initialSkin = isFuiEarthSkin(requested) ? requested : earthPresentation.value!=='surface'?'glacier':'amber';
const selectedSkin = ref<FuiEarthSkinId>(initialSkin === 'alert' ? 'amber' : initialSkin);
const primaryColor=ref<string|undefined>(params.get('primary')??undefined);
const requestedStyle=params.get('style');
const mapStyle=ref<FuiMapStyle|undefined>(['classic','terrain-glass','smooth-glass'].includes(requestedStyle??'')?requestedStyle as FuiMapStyle:undefined);
const requestedMap=params.get('map');
const legacyPresentation=isFuiMapPresentation(requestedMap)?requestedMap:undefined;
const legacyLook=legacyPresentation?resolveFuiMapLook({presentation:legacyPresentation,preset:selectedSkin.value,earthPresentation:earthPresentation.value}):undefined;
// Preserve a legacy URL's initial material once. Color controls must not
// re-run its historical skin-dependent automatic material pairing.
const legacyMapStyle=ref<FuiMapStyle|undefined>(legacyLook?.presentation==='standard'?'classic':legacyLook?legacyLook.surface==='hologram-glass'?'smooth-glass':'terrain-glass':undefined);
const effectiveMapStyle=computed(()=>mapStyle.value??legacyMapStyle.value??FUI_SCENE_PRESETS[earthPresentation.value].mapStyle);
const requestedWave=params.get('wave');
const mapWave=ref<FuiMapWave|undefined>(['none','hex','grid'].includes(requestedWave??'')?requestedWave as FuiMapWave:legacyPresentation==='textured-grid'?'grid':legacyPresentation==='textured-hex'?'hex':undefined);
const mapView=ref<FuiMapViewMode>(params.get('view')==='overlay'?'overlay':params.get('view')==='2d'?'2d':'3d');
const quality=(['auto','high','balanced','low'].includes(params.get('quality')??'')?params.get('quality'):'high') as MapQuality;
const alerting = ref(initialSkin === 'alert');
const ready = ref(false);
const skinSwitching=ref(false);
function onLoading(state:FuiEarthLoading){ready.value=state.phase==='ready';skinSwitching.value=state.switching;}
const earthRef=ref<{replayEntrance:()=>void;returnToEarth:()=>void}>();
const initialMode=params.get('mode')==='china'?'china':'earth';
const polarStyle=params.get('polar')==='enhanced'?'enhanced':'natural';
const mode=ref<'earth'|'china'>(initialMode);
const mapPresentation=ref<FuiMapPresentation>(isFuiMapPresentation(requestedMap)?requestedMap:'textured-hex');
const clean = ref(params.get('clean') === '1');
const requestedScan = params.get('scan');
const scanStyle = ref<FuiEarthScanStyle>(isFuiEarthScanStyle(requestedScan) ? requestedScan : 'ribbon');
function leaveFocus(event: KeyboardEvent) { if (event.key === 'Escape') clean.value = false; }
function selectEarthPresentation(presentation:FuiEarthPresentation){
  earthPresentation.value=presentation;
  if(mapStyle.value===undefined)legacyMapStyle.value=undefined;
}
function selectMapStyle(style:string){
  mapStyle.value=['classic','terrain-glass','smooth-glass'].includes(style)?style as FuiMapStyle:undefined;
  if(mapStyle.value===undefined)legacyMapStyle.value=undefined;
}
function receivePreviewSkin(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.data?.type !== 'fui-preview-skin') return;
  if(isFuiEarthPresentation(event.data.earthPresentation))selectEarthPresentation(event.data.earthPresentation);
  if (isFuiEarthScanStyle(event.data.scanStyle)) scanStyle.value = event.data.scanStyle;
  if(isFuiMapPresentation(event.data.mapPresentation))mapPresentation.value=event.data.mapPresentation;
  const skin = event.data.skin;
  if (!isFuiEarthSkin(skin)) return;
  if (skin === 'alert') alerting.value = true;
  else selectSkin(skin);
}
onMounted(() => window.addEventListener('keydown', leaveFocus));
onBeforeUnmount(() => window.removeEventListener('keydown', leaveFocus));
onMounted(() => window.addEventListener('message', receivePreviewSkin));
onBeforeUnmount(() => window.removeEventListener('message', receivePreviewSkin));
const normalSkins = FUI_EARTH_SKINS.filter((skin) => skin.id !== 'alert');
const activeSkin = computed(() => alerting.value ? 'alert' : resolveFuiEarthThemeId(selectedSkin.value,primaryColor.value??FUI_THEME_PRIMARY_OVERRIDE));
const activeInfo = computed(() => FUI_EARTH_SKINS.find((skin) => skin.id === activeSkin.value)??{subtitle:'自定义主题'});
const skinStyle = computed(() => getFuiSkinStyle(activeSkin.value));
let earthHasBeenShown=initialMode==='earth';
function handleModeChange(next:'earth'|'china'){if(next==='earth'&&!earthHasBeenShown){ready.value=false;earthHasBeenShown=true;}mode.value=next;window.parent.postMessage({type:'fui-preview-mode',mode:next},window.location.origin);}
function onSkinApplied(skin:FuiEarthSkinId){alerting.value=skin==='alert';if(skin!=='alert'&&!primaryColor.value)selectedSkin.value=skin;}
function onSkinError(error:FuiSkinFailure){if(isFuiEarthSkin(error.rendered)){alerting.value=error.rendered==='alert';if(error.rendered!=='alert')selectedSkin.value=error.rendered;}}
function selectSkin(skin: FuiEarthSkinId) { primaryColor.value=undefined;selectedSkin.value = skin; alerting.value = false; }
</script>
<style scoped>
.skin-preview{position:relative;width:100%;height:100%;overflow:hidden;background:var(--fui-background);color:#dce2e8;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif}
.preview-header{position:absolute;inset:0 0 auto;height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;z-index:2;border-bottom:1px solid #ffffff0e}
.preview-title{display:flex;align-items:center;gap:12px}.title-mark{width:8px;height:8px;background:rgb(var(--fui-hud-rgb));border-radius:50%}h1{margin:0;font-size:16px;font-weight:550;letter-spacing:.05em}.edition{margin-left:12px;color:#939da8;font:10px ui-monospace,monospace;letter-spacing:.15em}.focus-preview{margin-left:auto;margin-right:24px;padding:8px 10px;border:0;background:transparent;color:#a9b3bd;font:12px system-ui;cursor:pointer}.focus-preview:hover{color:#fff}.preview-status{font-size:12px;color:#abb4be}
.preview-canvas{position:absolute;inset:64px 0 82px}.is-clean .preview-canvas{inset:0}
.preview-earth-back{position:absolute;left:26px;top:24px;z-index:20;display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 12px 0 10px;border:1px solid rgb(var(--fui-hud-rgb)/.32);border-radius:2px;background:rgba(7,13,19,.84);color:#dce8f1;font:13px/1 system-ui;cursor:pointer;transition:border-color .16s ease,background .16s ease}
.preview-earth-back span{font:22px/1 monospace;color:rgb(var(--fui-hud-rgb))}
.preview-earth-back:hover{border-color:rgb(var(--fui-hud-rgb)/.72);background:rgba(15,26,36,.94)}
/* The preview has one Earth exit at every map depth; regional back navigation stays in the map. */
.skin-preview :deep(.dashboard-map-back){display:none}
.preview-controls{position:absolute;inset:auto 0 0;min-height:82px;flex-wrap:wrap;padding:16px 32px;display:flex;align-items:center;gap:24px;z-index:2;border-top:1px solid #ffffff0e}
.material-options label{display:inline-flex;align-items:center;gap:6px;color:#9fa9b4;font-size:12px}.material-options select{max-width:118px;border:1px solid #ffffff26;border-radius:3px;padding:7px;background:#101820;color:#dce2e8}.material-options input[type=color]{width:28px;height:28px;padding:2px;border:1px solid #ffffff26;background:transparent;border-radius:3px}
.skin-options,.scan-options,.map-options{display:flex;gap:6px}.skin-options button,.scan-options button,.map-options button,.alert-toggle,.replay-entry{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 14px;border:1px solid transparent;border-radius:3px;background:transparent;color:#a9b3bd;font-size:13px;cursor:pointer;transition:background .18s ease,color .18s ease,border-color .18s ease;white-space:nowrap}.skin-options button:hover:not(:disabled),.scan-options button:hover:not(:disabled),.map-options button:hover:not(:disabled){color:#f2f5f7;background:#ffffff08}.skin-options button[aria-pressed=true],.scan-options button[aria-pressed=true],.map-options button[aria-pressed=true]{border-color:rgb(var(--fui-hud-rgb)/.36);background:rgb(var(--fui-hud-rgb)/.07);color:#f1f4f6}.skin-swatch{width:6px;height:6px;border-radius:50%}.material-description{font-size:12px;color:#9fa9b4;flex:1}.replay-entry{border-color:rgb(var(--fui-hud-rgb)/.26);color:rgb(var(--fui-hud-rgb))}.replay-entry:hover{background:rgb(var(--fui-hud-rgb)/.08)}.alert-toggle{margin-left:auto;border-color:#c47b6d50;color:#e4ab9e}.alert-toggle:hover:not(:disabled),.alert-toggle[aria-pressed=true]{background:#bc523315;border-color:#e7907c8c;color:#ffd0bd}.alert-indicator{height:6px;width:6px;background:currentColor;border-radius:50%}button:focus-visible{outline:2px solid #dce9f4;outline-offset:4px}button:disabled{opacity:.45;cursor:wait}
@media(max-width:1320px){.material-description{display:none}.preview-controls{min-height:128px}.preview-canvas{bottom:128px}.map-options{margin-left:auto}}
@media(max-width:900px){.preview-controls{flex-wrap:wrap;min-height:124px}.preview-canvas{bottom:124px}.skin-options{width:100%;justify-content:center}.scan-options{margin-right:auto}}
@media(max-width:760px){.preview-header{height:54px;padding:0 18px}.edition{display:none}.preview-canvas{inset:54px 0 124px}.preview-controls{padding:12px 14px;gap:10px;flex-wrap:wrap;min-height:124px}.skin-options{width:100%;justify-content:center}.skin-options button{flex:1;padding:0 10px}.material-description{padding-left:6px}.alert-toggle{min-height:34px}.is-clean .preview-canvas{inset:0}}
@media(max-width:760px){.preview-canvas{bottom:178px}.preview-controls{min-height:178px}.map-options{width:100%;justify-content:center}.map-options button{flex:1;padding:0 7px}.alert-toggle{margin-left:0}.is-clean .preview-canvas{inset:0}}
@media(prefers-reduced-motion:reduce){button{transition:none!important}}
/* Let wrapped controls reserve their actual height on every container width. */
.skin-preview{display:flex;flex-direction:column}
.skin-preview>.preview-header{position:relative;inset:auto;flex-shrink:0}
.skin-preview>.preview-canvas{position:relative;inset:auto;flex:1;min-height:0}
.skin-preview>.preview-controls{position:relative;inset:auto;flex-shrink:0}
/* Keep navigation and view selection available in the focused preview. */
.skin-preview.is-clean :deep(.map-label-layer),
.skin-preview.is-clean :deep(.map-drill-control){display:none}
</style>
