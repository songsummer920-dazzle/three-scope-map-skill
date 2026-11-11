<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="earth-china-map" :data-mode="mode">
    <div
      v-if="chinaMounted"
      class="china-map-stage"
      :class="{
        'is-active': mode === 'china',
        'is-handoff': handoffActive,
        'is-ready': chinaReady,
        'uses-native-entrance': props.mapPresentation !== 'standard',
      }"
    >
      <ChinaMap
        ref="chinaMapRef"
        :key="mapAttempt"
        :active="mode === 'china'"
        :show-back-button="true"
        :show-view-switch="true"
        :map-presentation="props.mapPresentation"
        :surface-variant="destinationSurfaceVariant"
        :skin="displaySkin"
        :initial-view="selectedMapView"
        :quality="props.quality"
        :map-wave-enabled="props.mapWaveEnabled"
        @ready="onChinaReady"
        @loading="onMapLoading"
        @exit="returnToEarth"
        @hud-transform="emit('map-hud-transform', $event)"
      />
    </div>
    <FuiSceneLoader v-if="(mode === 'china' && !chinaReady) || countryEntryPreparing" label="地图加载中" :error="mapLoadingStage === 'error'" retryable @retry="retryMap" />
    <div v-if="earthMounted" class="earth-fit-stage">
    <EarthView
      ref="earthViewRef"
      :key="`${earthAttempt}-${props.earthPresentation}`"
      :active="mode === 'earth'"
      v-show="mode === 'earth'"
      :start-intro="true"
      :frame-scale="props.earthScale"
      :skin="props.skin"
      :scan-style="props.scanStyle"
      :polar-style="props.polarStyle"
      :earth-presentation="props.earthPresentation"
      :quality="props.quality"
      :before-enter-china="prepareCountryEntry"
      @intro-complete="onEarthReady"
      @loading="emit('loading',$event)"
      @skin-applied="onSkinApplied"
      @skin-error="emit('skin-error',$event)"
      @retry="retryEarth"
      @first-visible="prepareChinaMap"
      @handoff-start="beginChinaHandoff"
      @enter-china="showChinaMap"
      @telemetry="forwardEarthTelemetry"
    />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue';
import {FUI_EARTH_WARMUP_GATE,type FuiPolarStyle,type FuiEarthLoading,type FuiSkinFailure} from './fuiEarthLifecycle';
import FuiSceneLoader from './FuiSceneLoader.vue';
import {resolveFuiDestinationSurface,type FuiMapPresentation,type FuiMapSurfaceVariant,type FuiMapSurfaceChoice,type FuiMapViewMode} from './fuiMapPresentation';
import type {MapQuality} from './mapQuality';
import type {FuiEarthPresentation} from './fuiEarthHologram';
import type { FuiEarthSkinId, FuiEarthScanStyle } from './fuiEarthTheme';
import {initialMapNavigationPath,type MapNavigationPath} from './mapNavigation';

const ChinaMap = defineAsyncComponent(() => import('./ChinaMap.vue'));
const EarthView = defineAsyncComponent(() => import('./EarthView.vue'));

export type EarthChinaMapMode = 'earth' | 'china';

type EarthTelemetryPayload = {
  longitude: number;
  latitude: number;
  heading: number;
  anchors: Record<string, { x: number; y: number; visible: boolean }>;
};

const props = withDefaults(defineProps<{
  initialMode?: EarthChinaMapMode;
  polarStyle?:FuiPolarStyle;
  earthPresentation?:FuiEarthPresentation;
  earthScale?: number;
  skin?: FuiEarthSkinId;
  scanStyle?: FuiEarthScanStyle;
  mapPresentation?: FuiMapPresentation;
  mapSurface?:FuiMapSurfaceChoice;
  initialMapView?:FuiMapViewMode;
  quality?:MapQuality;
  mapWaveEnabled?:boolean;
}>(), {
  initialMode: 'earth',
  polarStyle:'natural',
  earthPresentation:'surface',
  skin: 'original',
  scanStyle: 'ribbon',
  mapPresentation: 'standard',
  mapSurface:'auto',
  initialMapView:'3d',
  quality:'high',
  mapWaveEnabled:true,
});

const emit = defineEmits<{
  ready: [];
  loading:[state:FuiEarthLoading];
  'skin-applied':[skin:FuiEarthSkinId];
  'skin-error':[error:FuiSkinFailure];
  'mode-change': [mode: EarthChinaMapMode];
  'earth-telemetry': [payload: EarthTelemetryPayload];
  'handoff-start': [];
  'map-hud-transform': [payload: {
    centerX: number;
    centerY: number;
    a: number;
    b: number;
    c: number;
    d: number;
  }];
}>();

const mode = ref<EarthChinaMapMode>(props.initialMode);
const displaySkin=ref<FuiEarthSkinId>(props.skin);
const destinationSurfaceVariant=computed<FuiMapSurfaceVariant>(()=>
  resolveFuiDestinationSurface(props.mapSurface,displaySkin.value,props.earthPresentation));
function onSkinApplied(skin:FuiEarthSkinId){displaySkin.value=skin;emit('skin-applied',skin);}
// Give the visible globe priority; prepare the destination after its first reveal.
const chinaMounted = ref(props.initialMode === 'china');
const chinaReady = ref(false);
const mapLoadingStage=ref('building');
const selectedMapView=ref(props.initialMapView);
const countryEntryPreparing=ref(false);
let entryVersion=0,countryEntryPrepared=false;
let countryEntryJob:Promise<boolean>|undefined;
let disposed=false;
const earthAttempt=ref(0),mapAttempt=ref(0);
let releaseWarmup:()=>void;
const warmupGate=new Promise<void>(resolve=>{releaseWarmup=resolve;});
provide(FUI_EARTH_WARMUP_GATE,()=>warmupGate);
if(props.initialMode==='china')releaseWarmup!();
function onEarthReady(){releaseWarmup!();emit('ready');}
function onMapLoading(stage:string){mapLoadingStage.value=stage;if(mode.value==='china'){if(stage==='ready')emit('ready');emit('loading',{phase:stage==='error'?'error':stage==='ready'?'ready':stage==='entering'?'entering':'warming',switching:false});}}
function retryEarth(){earthAttempt.value++;emit('loading',{phase:'loading',switching:false});}
function retryMap(){if(countryEntryPreparing.value){countryEntryJob=undefined;void prepareCountryEntry();return;}chinaReady.value=false;mapLoadingStage.value='building';mapAttempt.value++;}
type ChinaMapApi={replayEntrance:()=>void;prepareEntrance:()=>void;syncNavigation:(path:MapNavigationPath)=>Promise<boolean>;resetToCountry:()=>Promise<boolean>;cancelPendingPreparation:()=>void;getNavigation:()=>MapNavigationPath;getView:()=>FuiMapViewMode;getRevealDiagnostics:()=>unknown};
const chinaMapRef=ref<ChinaMapApi>();
const handoffActive = ref(false);
const earthMounted=ref(props.initialMode==='earth');
watch(()=>props.skin,skin=>{if(!earthMounted.value)onSkinApplied(skin);});
const earthViewRef=ref<{returnFromChina:()=>void;retrySkin:()=>void;enterChina:()=>void;getDiagnostics:()=>unknown}>();
let pendingChinaEntry = false;
let pendingHandoff = false;
let handoffCleanupHandle: number | undefined;

function forwardEarthTelemetry(payload: EarthTelemetryPayload) {
  emit('earth-telemetry', payload);
}
function showChinaMap() {
  pendingChinaEntry=true;
  if(!countryEntryPrepared){void prepareCountryEntry();return;}
  flushCountryEntry();
}
function flushCountryEntry(){
  if(!countryEntryPrepared||!chinaReady.value)return;
  if(pendingHandoff){pendingHandoff=false;handoffActive.value=true;emit('handoff-start');}
  if(!pendingChinaEntry)return;
  pendingChinaEntry=false;
  if (props.mapPresentation !== 'standard'||chinaMapRef.value?.getView()==='overlay') chinaMapRef.value?.prepareEntrance();
  mode.value = 'china';
  emit('loading',{phase:'entering',switching:false});
  emit('mode-change', mode.value);
  if(chinaMapRef.value?.getView()!=='3d'){
    const version=entryVersion;
    void nextTick().then(()=>{if(!disposed&&version===entryVersion&&mode.value==='china'){emit('ready');emit('loading',{phase:'ready',switching:false});}});
  }
  handoffCleanupHandle = globalThis.setTimeout(() => {
    handoffActive.value = false;
  }, 920);
}

function beginChinaHandoff() {
  pendingHandoff=true;
  if(!countryEntryPrepared){void prepareCountryEntry();return;}
  flushCountryEntry();
}

function prepareCountryEntry(){
  if(countryEntryJob)return countryEntryJob;
  const version=++entryVersion;
  countryEntryPreparing.value=true;countryEntryPrepared=false;chinaReady.value=false;mapLoadingStage.value='building';chinaMounted.value=true;
  const job=(async()=>{
    await nextTick();
    const deadline=performance.now()+30000;
    while(!chinaMapRef.value){if(disposed||version!==entryVersion||performance.now()>deadline)return false;await new Promise(resolve=>setTimeout(resolve,16));}
    const map=chinaMapRef.value;
    if(!await map.resetToCountry()||disposed||version!==entryVersion)return false;
    countryEntryPrepared=true;countryEntryPreparing.value=false;chinaReady.value=true;mapLoadingStage.value='ready';flushCountryEntry();return true;
  })().catch(()=>false).then(ok=>{if(!ok&&!disposed&&version===entryVersion)mapLoadingStage.value='error';return ok;});
  countryEntryJob=job;
  void job.finally(()=>{if(version===entryVersion)countryEntryJob=undefined;});
  return job;
}

function onChinaReady() {
  if(countryEntryPreparing.value)return;
  chinaReady.value = true;
  // Vector destinations have no standalone map loading-stage callback.
  // Forward their first real drawn frame to the outer host as well.
  if (mode.value === 'china' && chinaMapRef.value?.getView() !== '3d') {
    emit('ready');
    emit('loading', { phase:'ready', switching:false });
  }

  flushCountryEntry();
}

function prepareChinaMap() {
  if (chinaMounted.value) return;
  chinaMounted.value = true;
}

async function returnToEarth() {
  if (mode.value !== 'china'&&!countryEntryPreparing.value) return;
  if (handoffCleanupHandle !== undefined) {
    globalThis.clearTimeout(handoffCleanupHandle);
    handoffCleanupHandle = undefined;
  }
  pendingChinaEntry = false;
  pendingHandoff = false;
  handoffActive.value = false;
  entryVersion++;countryEntryJob=undefined;countryEntryPrepared=false;countryEntryPreparing.value=false;
  chinaMapRef.value?.cancelPendingPreparation();
  if(chinaMapRef.value)selectedMapView.value=chinaMapRef.value.getView();
  const wasMounted=earthMounted.value;
  earthMounted.value=true;
  mode.value = 'earth';
  await nextTick();
  if(wasMounted){earthViewRef.value?.returnFromChina();emit('ready');}
  emit('mode-change', mode.value);
}

onBeforeUnmount(() => {
  disposed=true;entryVersion++;
  releaseWarmup!();
  if (handoffCleanupHandle !== undefined) globalThis.clearTimeout(handoffCleanupHandle);
});
watch(()=>props.initialMapView,view=>{selectedMapView.value=view;});
defineExpose({retry:()=>mode.value==='china'?retryMap():retryEarth(),retrySkin:()=>earthViewRef.value?.retrySkin(),replayEntrance:()=>chinaMapRef.value?.replayEntrance(),enterChina:()=>earthViewRef.value?.enterChina(),returnToEarth,syncNavigation:(path:MapNavigationPath)=>chinaMapRef.value?.syncNavigation(path)??Promise.resolve(false),getNavigation:()=>chinaMapRef.value?.getNavigation()??initialMapNavigationPath.map(item=>({...item})),getMapDiagnostics:()=>chinaMapRef.value?.getRevealDiagnostics(),getDiagnostics:()=>earthViewRef.value?.getDiagnostics()});
</script>

<style scoped>
.earth-fit-stage { position:absolute; inset:0; }
.earth-china-map {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
}

.china-map-stage {
  clip-path: none;
  mask-image: none;
  border-radius: 0;
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

.china-map-stage.is-handoff:not(.uses-native-entrance) {
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

/* Textured maps use the same native entrance as a direct China route.
   Prewarming keeps the final static frame hidden until activation. */
.china-map-stage.uses-native-entrance { transform:none; transition:none; }

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
