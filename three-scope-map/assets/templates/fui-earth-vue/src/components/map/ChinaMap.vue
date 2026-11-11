<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div ref="hybridHost" class="hybrid-map" :style="[mapThemeStyle,vectorControlStyle]" :aria-busy="switching && !!pendingMode" :data-current-view="viewMode" :data-pending-view="pendingMode" :data-navigation-key="mapNavigationKey(navigationPath)" :data-switch-source="switchDiagnostics?.source" :data-switch-target="switchDiagnostics?.target" :data-switch-phase="switchDiagnostics?.phase">
    <ZhejiangThreeMap
      v-if="threeMounted"
      v-show="viewMode === '3d'"
      ref="threeMapRef"
      :active="props.active && viewMode === '3d'"
      :initial-navigation="navigationPath"
      :show-controls="true"
      :use-internal-hud-ring="true"
      :map-presentation="props.mapPresentation"
      :surface-variant="props.surfaceVariant"
      :skin="props.skin"
      :quality="props.quality"
      :map-wave-enabled="props.mapWaveEnabled"
      @ready="onThreeReady"
      @loading="onThreeLoading"
      @navigation-change="onThreeNavigationChange"
      @hud-transform="emit('hud-transform', $event)"
    />
    <VectorMap
      v-if="vectorMounted"
      ref="vectorMapRef"
      :active="props.active && viewMode !== '3d'"
      :navigation="navigationPath"
      :palette="vectorPalette"
      :overlay="vectorComposition==='overlay'"
      :overlay-surface="props.surfaceVariant==='hologram-glass'?'smooth-glass':props.mapPresentation==='standard'?'classic':'terrain-glass'"
      :overlay-skin="props.skin"
      :quality="props.quality"
      :auto-entrance="!vectorEntrancePlayed"
      @ready="onVectorReady"
      @navigation-change="onVectorNavigationChange"
    />

    <button
      v-if="props.active && props.showBackButton && navigationPath.length === 1"
      class="dashboard-map-back"
      type="button"
      :disabled="switching"
      :aria-label="backButtonLabel"
      @click="navigateBack"
    >
      <span aria-hidden="true">‹</span>
      {{ backButtonLabel }}
    </button>

    <span v-if="switchError" class="map-switch-error" role="status">{{ switchError }}</span>
    <FuiSceneLoader v-if="props.active && switching && pendingMode" class="map-switch-loader" :label="switchLoadingLabel" :data-loading-view="pendingMode" />
    <div v-if="props.active && props.showViewSwitch" class="map-view-switch" role="group" aria-label="地图视图切换">
      <button
        type="button"
        :aria-pressed="viewMode === '3d'"
        :class="{ active: viewMode === '3d' }"
        :disabled="switching"
        @click="switchView('3d')"
      >3D 地图<span v-if="switching && pendingMode==='3d'" class="map-switch-spinner" role="status" aria-label="地图加载中" /></button>
      <button
        type="button"
        :aria-pressed="viewMode === '2d'"
        :class="{ active: viewMode === '2d' }"
        :disabled="switching"
        @click="switchView('2d')"
      >2D 地图<span v-if="switching && pendingMode==='2d'" class="map-switch-spinner" role="status" aria-label="地图加载中" /></button>
      <button type="button" :aria-pressed="viewMode==='overlay'" :class="{active:viewMode==='overlay'}" :disabled="switching" @click="switchView('overlay')">2D + 3D<span v-if="switching && pendingMode==='overlay'" class="map-switch-spinner" role="status" aria-label="地图加载中" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, inject, nextTick, ref, watch, type Ref } from 'vue';
import {FUI_EARTH_WARMUP_GATE} from './fuiEarthLifecycle';
import ZhejiangThreeMap from './ZhejiangThreeMap.vue';
import FuiSceneLoader from './FuiSceneLoader.vue';
const VectorMap = defineAsyncComponent(() => import('./VectorMap.vue'));
import { mapThemeStyle } from './mapTheme';
import {createVectorMapControlStyle} from './vectorMapTheme';
import type { FuiMapPresentation, FuiMapSurfaceVariant, FuiMapViewMode } from './fuiMapPresentation';
import type {MapQuality} from './mapQuality';
import { getFuiVectorMapPalette, type FuiEarthSkinId } from './fuiEarthTheme';
import {
  initialMapNavigationPath,
  mapNavigationKey,
  type MapNavigationPath,
} from './mapNavigation';

const props = withDefaults(defineProps<{
  active?: boolean;
  showBackButton?: boolean;
  showViewSwitch?: boolean;
  mapPresentation?: FuiMapPresentation;
  surfaceVariant?: FuiMapSurfaceVariant;
  skin?: FuiEarthSkinId;
  initialView?:FuiMapViewMode;
  initialNavigation?:MapNavigationPath;
  quality?:MapQuality;
  mapWaveEnabled?:boolean;
}>(), {
  active: true,
  showBackButton: false,
  showViewSwitch: true,
  mapPresentation: 'standard',
  surfaceVariant: 'terrain',
  skin: 'original',
  initialView:'3d',
  initialNavigation:()=>[...initialMapNavigationPath],
  quality:'high',
  mapWaveEnabled:true,
});

const vectorPalette=computed(()=>getFuiVectorMapPalette(props.skin));
const vectorControlStyle=computed(()=>createVectorMapControlStyle(vectorPalette.value));

const emit = defineEmits<{
  ready: [];
  loading: [stage:'building'|'warming'|'entering'|'ready'|'error'];
  exit: [];
  'hud-transform': [payload: {
    centerX: number;
    centerY: number;
    a: number;
    b: number;
    c: number;
    d: number;
  }];
}>();

type MapViewMode = FuiMapViewMode;
type ThreeMapExpose = {
  syncNavigation: (path: MapNavigationPath) => Promise<void>;
  navigateBack: () => Promise<void>;
  replayEntrance: () => void;
  prepareEntrance: () => void;
  prepareForReveal:(options:{navigation:MapNavigationPath;viewport:{width:number;height:number};center:boolean;signal?:AbortSignal})=>Promise<boolean>;
  getNavigationKey:()=>string;
  getRevealDiagnostics?:()=>unknown;
};
type VectorMapExpose={goBack:()=>Promise<void>|void;prepareForReveal:(options:{navigation:MapNavigationPath;signal?:AbortSignal;timeoutMs?:number})=>Promise<boolean>;prepareEntrance:()=>boolean;replayEntrance:()=>void;startEntrance:()=>void;cancelEntrance:(restore?:boolean)=>void;getRevealDiagnostics:()=>unknown;getOverlayDiagnostics:()=>unknown};

const hybridHost=ref<HTMLDivElement>();
const viewMode = ref<MapViewMode>(props.initialView);
const vectorComposition=ref<'2d'|'overlay'>(props.initialView==='overlay'?'overlay':'2d');
const threeMounted=ref(props.initialView==='3d');
const vectorMounted = ref(false);
const switching = ref(false);
const switchError=ref('');
const pendingMode = ref<MapViewMode>();
const switchLoadingLabel=computed(()=>pendingMode.value==='overlay'?'正在加载 2D + 3D 地图':pendingMode.value==='2d'?'正在加载 2D 地图':'正在加载 3D 地图');
const switchDiagnostics=ref<{source:MapViewMode;target:MapViewMode;phase:'presenting-loader'|'preparing'|'ready'|'error'|'cancelled';requestedAtMs:number;loaderRafFrames?:number;loaderPresentedAtMs?:number;prepareStartedAtMs?:number;preparedAtMs?:number;committedAtMs?:number;elapsedMs?:number}>();
const navigationPath = ref<MapNavigationPath>(props.initialNavigation.map(item=>({...item})));
const threeMapRef = ref<ThreeMapExpose>();
const vectorMapRef=ref<VectorMapExpose>();
const vectorEntrancePlayed=ref(false);
let switchController:AbortController|undefined;
let switchVersion=0;
let disposed=false;
let navigationOverride=false;
let idleTimer:ReturnType<typeof setTimeout>|undefined;
let idleCallback:number|undefined;
let idleController:AbortController|undefined;
let idleVersion=0;
const idlePreparedSignatures=new Map<MapViewMode,string>();
let idleRescheduleAvailable=true;
let idleNavigationBlocked=false;
let currentViewReady=false;
let threeLoadingStage='building';
const idlePreparation=ref<{state:'scheduled'|'preparing'|'ready';view:MapViewMode;navigationKey:string}>();
const waitForEarthIntro=inject<(()=>Promise<void>)|undefined>(FUI_EARTH_WARMUP_GATE,undefined);
onMounted(async()=>{
  if(props.initialView==='3d')return;
  await waitForEarthIntro?.();
  if(!disposed)vectorMounted.value=true;
});

function onThreeReady(){
  if(viewMode.value==='3d'){idlePreparedSignatures.set('3d',idleSignature('3d',mapNavigationKey(navigationPath.value)));emit('ready');if(threeLoadingStage==='ready'){currentViewReady=true;scheduleIdlePreparation();}}
}
function onThreeLoading(stage:'building'|'warming'|'entering'|'ready'|'error'){
  threeLoadingStage=stage;
  if(viewMode.value!=='3d')return;
  currentViewReady=stage==='ready';
  emit('loading',stage);
  if(stage!=='ready')cancelIdlePreparation();
  else if(stage==='ready')scheduleIdlePreparation();
}

const backButtonLabel = computed(() => (
  navigationPath.value.length > 1 ? '返回上一级' : '返回地球'
));

function onVectorReady() {
  if(viewMode.value!=='3d'){
    currentViewReady=true;
    playFirstVectorEntrance();
    idlePreparedSignatures.set(viewMode.value,idleSignature(viewMode.value,mapNavigationKey(navigationPath.value)));emit('ready');scheduleIdlePreparation();
  }
}
function playFirstVectorEntrance(){
  if(props.active&&viewMode.value==='overlay'&&currentViewReady&&!vectorEntrancePlayed.value&&vectorMapRef.value){vectorMapRef.value.startEntrance();vectorEntrancePlayed.value=true;}
}
function prepareEntrance(){
  if(viewMode.value==='3d')threeMapRef.value?.prepareEntrance();
  else if(viewMode.value==='overlay'&&vectorMapRef.value?.prepareEntrance())vectorEntrancePlayed.value=true;
}
function replayEntrance(){
  if(viewMode.value==='3d')threeMapRef.value?.replayEntrance();
  else if(viewMode.value==='overlay'){vectorMapRef.value?.replayEntrance();vectorEntrancePlayed.value=true;}
}

function waitForInstance<T>(target:Ref<T|undefined>,signal:AbortSignal){
  if(signal.aborted||disposed)return Promise.resolve(undefined);
  if(target.value)return Promise.resolve(target.value);
  return new Promise<T|undefined>(resolve=>{
    let settled=false,stop=()=>{};
    const finish=(instance?:T)=>{if(settled)return;settled=true;stop();signal.removeEventListener('abort',onAbort);resolve(instance);};
    const onAbort=()=>finish();signal.addEventListener('abort',onAbort,{once:true});
    stop=watch(target,instance=>{if(instance)finish(instance);},{flush:'post'});
    if(signal.aborted)finish();
  });
}

function presentSwitchLoader(signal:AbortSignal){
  return new Promise<number>(resolve=>{
    let first=0,second=0,fallback=0,frames=0,settled=false;
    const finish=()=>{if(settled)return;settled=true;cancelAnimationFrame(first);cancelAnimationFrame(second);clearTimeout(fallback);signal.removeEventListener('abort',onAbort);resolve(frames);};
    const onAbort=()=>finish();
    signal.addEventListener('abort',onAbort,{once:true});
    fallback=window.setTimeout(finish,150);
    if(signal.aborted){finish();return;}
    first=requestAnimationFrame(()=>{frames=1;second=requestAnimationFrame(()=>{frames=2;finish();});});
  });
}

function cancelIdlePreparation(){
  idleVersion++;
  if(idleTimer!==undefined)clearTimeout(idleTimer);idleTimer=undefined;
  if(idleCallback!==undefined)window.cancelIdleCallback?.(idleCallback);idleCallback=undefined;
  idleController?.abort();idleController=undefined;idlePreparation.value=undefined;
}
function idleSignature(target:MapViewMode,key:string){
  return JSON.stringify([target,key,props.skin,props.mapPresentation,props.surfaceVariant,props.quality]);
}
function scheduleIdlePreparation(){
  if(disposed||!props.active||!props.showViewSwitch||!currentViewReady||idleNavigationBlocked||switching.value||viewMode.value==='2d'||document.hidden)return;
  const target:MapViewMode=viewMode.value==='3d'?'overlay':'3d',key=mapNavigationKey(navigationPath.value);
  const signature=idleSignature(target,key);
  if(idlePreparedSignatures.get(target)===signature)return;
  cancelIdlePreparation();
  const version=idleVersion;
  idlePreparation.value={state:'scheduled',view:target,navigationKey:key};
  // The source entrance owns startup. Prepare one alternate view afterwards,
  // using its normal worker/one-shot draw path and no hidden animation loop.
  idleTimer=setTimeout(()=>{
    idleTimer=undefined;
    const start=()=>{idleCallback=undefined;void prepareIdleDestination(target,key,signature,version);};
    if(window.requestIdleCallback)idleCallback=window.requestIdleCallback(start,{timeout:500});else start();
  },150);
}
async function prepareIdleDestination(target:MapViewMode,key:string,signature:string,version:number){
  const valid=()=>!disposed&&version===idleVersion&&props.active&&props.showViewSwitch&&!switching.value&&!document.hidden
    &&viewMode.value!==target&&viewMode.value!=='2d'&&mapNavigationKey(navigationPath.value)===key&&idleSignature(target,key)===signature;
  if(!valid())return;
  const controller=new AbortController();idleController=controller;
  const timeout=setTimeout(()=>controller.abort(),30000);
  idlePreparation.value={state:'preparing',view:target,navigationKey:key};
  try{
    if(target==='3d')threeMounted.value=true;
    else{vectorComposition.value='overlay';vectorMounted.value=true;}
    await nextTick();
    const instance=target==='3d'?await waitForInstance(threeMapRef,controller.signal):await waitForInstance(vectorMapRef,controller.signal);
    if(!instance||!valid()||controller.signal.aborted)return;
    const path=navigationPath.value.map(item=>({...item}));
    const prepared=target==='3d'
      ?await (instance as ThreeMapExpose).prepareForReveal({navigation:path,viewport:{width:Math.max(1,hybridHost.value?.clientWidth??1),height:Math.max(1,hybridHost.value?.clientHeight??1)},center:true,signal:controller.signal})
      :await (instance as VectorMapExpose).prepareForReveal({navigation:path,signal:controller.signal});
    if(prepared&&valid()&&!controller.signal.aborted){idlePreparedSignatures.set(target,signature);idlePreparation.value={state:'ready',view:target,navigationKey:key};}
  }catch{/* Optional idle work must not change the visible view or its UI. */}
  finally{clearTimeout(timeout);if(version===idleVersion){idleController=undefined;if(idlePreparation.value?.state!=='ready')idlePreparation.value=undefined;}}
}

function updateNavigation(path: MapNavigationPath) {
  if (mapNavigationKey(path) === mapNavigationKey(navigationPath.value)) return;
  navigationPath.value = path.map((item) => ({ ...item }));
}

function onThreeNavigationChange(path: MapNavigationPath) {
  if (props.active&&!navigationOverride&&viewMode.value === '3d') updateNavigation(path);
}

function onVectorNavigationChange(path: MapNavigationPath) {
  if (props.active&&!navigationOverride&&viewMode.value !== '3d') updateNavigation(path);
}

async function syncNavigation(path:MapNavigationPath){
  if(!path.length||disposed)return false;
  if(switchDiagnostics.value&&switching.value&&pendingMode.value)switchDiagnostics.value={...switchDiagnostics.value,phase:'cancelled',elapsedMs:performance.now()-switchDiagnostics.value.requestedAtMs};
  cancelIdlePreparation();switchController?.abort();
  const version=++switchVersion,controller=new AbortController();switchController=controller;
  const mode=viewMode.value,key=mapNavigationKey(path);
  navigationOverride=true;switching.value=true;pendingMode.value=undefined;currentViewReady=false;switchError.value='';
  navigationPath.value=path.map(item=>({...item}));
  const timeout=setTimeout(()=>controller.abort(),30000);
  let preparedSuccessfully=false;
  const current=()=>!disposed&&!controller.signal.aborted&&version===switchVersion;
  try{
    if(mode==='3d')threeMounted.value=true;else{vectorComposition.value=mode;vectorMounted.value=true;}
    await nextTick();
    const instance=mode==='3d'?await waitForInstance(threeMapRef,controller.signal):await waitForInstance(vectorMapRef,controller.signal);
    if(!instance||!current())return false;
    const prepared=mode==='3d'
      ?await (instance as ThreeMapExpose).prepareForReveal({navigation:navigationPath.value,viewport:{width:Math.max(1,hybridHost.value?.clientWidth??1),height:Math.max(1,hybridHost.value?.clientHeight??1)},center:true,signal:controller.signal})
      :await (instance as VectorMapExpose).prepareForReveal({navigation:navigationPath.value,signal:controller.signal});
    if(!prepared||!current()||mapNavigationKey(navigationPath.value)!==key)return false;
    currentViewReady=true;idlePreparedSignatures.set(mode,idleSignature(mode,key));
    idleRescheduleAvailable=true;idleNavigationBlocked=false;preparedSuccessfully=true;emit('ready');return true;
  }catch{return false;}finally{
    clearTimeout(timeout);
    if(version===switchVersion){navigationOverride=false;switching.value=false;switchController=undefined;if(preparedSuccessfully)scheduleIdlePreparation();}
  }
}
function cancelPendingPreparation(){
  if(switchDiagnostics.value&&switching.value&&pendingMode.value)switchDiagnostics.value={...switchDiagnostics.value,phase:'cancelled',elapsedMs:performance.now()-switchDiagnostics.value.requestedAtMs};
  cancelIdlePreparation();switchController?.abort();switchVersion++;
  switchController=undefined;switching.value=false;pendingMode.value=undefined;navigationOverride=false;
  if(viewMode.value!=='3d')vectorComposition.value=viewMode.value;
}

async function switchView(mode: MapViewMode) {
  if(mode===viewMode.value&&!switching.value){switchError.value='';return true;}
  vectorMapRef.value?.cancelEntrance(true);
  cancelIdlePreparation();
  switchError.value='';
  switchController?.abort();
  const version=++switchVersion,controller=new AbortController();switchController=controller;
  if(mode===viewMode.value){
    if(switchDiagnostics.value)switchDiagnostics.value={...switchDiagnostics.value,phase:'cancelled',elapsedMs:performance.now()-switchDiagnostics.value.requestedAtMs};
    if(mode!=='3d')vectorComposition.value=mode;
    switching.value=false;pendingMode.value=undefined;switchController=undefined;navigationOverride=false;
    await nextTick();return true;
  }
  switching.value = true;
  switchError.value='';
  pendingMode.value = mode;
  const timing={source:viewMode.value,target:mode,phase:'presenting-loader' as const,requestedAtMs:performance.now()};
  switchDiagnostics.value=timing;
  let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},30000);
  const current=()=>!disposed&&!controller.signal.aborted&&version===switchVersion;
  // Both vector modes share one canvas. Keep the existing geographic volume
  // in place until the already-loaded basemap is committed as plain 2D.
  const deferPlainComposition=mode==='2d'&&viewMode.value==='overlay';
  try {
    // Commit the shared loading instrument before optional renderer setup.
    // A bounded frame wait also permits cancellation in occluded documents.
    await nextTick();
    const frames=await presentSwitchLoader(controller.signal);
    if(!current())return false;
    switchDiagnostics.value={...switchDiagnostics.value!,loaderRafFrames:frames,loaderPresentedAtMs:frames===2?performance.now():undefined,prepareStartedAtMs:performance.now(),phase:'preparing'};
    if(mode!=='3d'){
      // Prepare the destination composition while the committed view remains
      // visible. Waiting for a plain 2D frame would reveal the overlay too soon.
      if(!deferPlainComposition)vectorComposition.value=mode;
      vectorMounted.value = true;
    }else threeMounted.value=true;
    await nextTick();
    const instance=mode==='3d'?await waitForInstance(threeMapRef,controller.signal):await waitForInstance(vectorMapRef,controller.signal);
    if(!instance||!current())return false;
    while(current()){
      const path=navigationPath.value.map(item=>({...item})),key=mapNavigationKey(path),attempt=new AbortController();
      const abort=()=>attempt.abort();controller.signal.addEventListener('abort',abort,{once:true});
      // A source drill can finish while the other renderer is warming. Retry
      // its latest committed scope instead of revealing a stale country map.
      const stop=watch(()=>mapNavigationKey(navigationPath.value),next=>{if(next!==key)attempt.abort();},{flush:'sync'});
      let prepared=false;
      try{
        if(mode==='3d'){
          const host=hybridHost.value,viewport={width:Math.max(1,host?.clientWidth??1),height:Math.max(1,host?.clientHeight??1)};
          prepared=await (instance as ThreeMapExpose).prepareForReveal({navigation:path,viewport,center:true,signal:attempt.signal});
        }else prepared=await (instance as VectorMapExpose).prepareForReveal({navigation:path,signal:attempt.signal});
      }finally{stop();controller.signal.removeEventListener('abort',abort);}
      if(!current())return false;
      if(mapNavigationKey(navigationPath.value)!==key)continue;
      if(!prepared){switchError.value=mode==='3d'?'3D 地图暂未就绪，请稍后重试':'地图暂未就绪，请稍后重试';return false;}
      switchDiagnostics.value={...switchDiagnostics.value!,preparedAtMs:performance.now()};
      if(mode!=='3d')vectorComposition.value=mode;
      idlePreparedSignatures.set(mode,idleSignature(mode,key));
      if(mode==='2d')idlePreparedSignatures.delete('overlay');
      idleRescheduleAvailable=true;
      idleNavigationBlocked=false;
      currentViewReady=true;
      navigationOverride=false;
      if(mode==='overlay'&&!vectorEntrancePlayed.value&&vectorMapRef.value?.prepareEntrance())vectorEntrancePlayed.value=true;
      viewMode.value=mode;
      switchDiagnostics.value={...switchDiagnostics.value!,phase:'ready',committedAtMs:performance.now(),elapsedMs:performance.now()-timing.requestedAtMs};
      emit('ready');return true;
    }
    return false;
  }catch{
    if(current())switchError.value='地图暂未就绪，请稍后重试';
    return false;
  } finally {
    clearTimeout(timeout);
    if(version===switchVersion){
      if(viewMode.value!=='3d')vectorComposition.value=viewMode.value;
      if(timedOut&&!disposed)switchError.value='地图准备时间较长，请稍后重试';
      if(switchDiagnostics.value?.phase!=='ready')switchDiagnostics.value={...switchDiagnostics.value!,phase:switchError.value?'error':'cancelled',elapsedMs:performance.now()-timing.requestedAtMs};
      switching.value=false;pendingMode.value=undefined;switchController=undefined;
      if(viewMode.value===mode)scheduleIdlePreparation();
    }
  }
}

function navigateBack() {
  if (switching.value) return;
  if (navigationPath.value.length <= 1) {
    emit('exit');
    return;
  }
  if(viewMode.value==='3d')void threeMapRef.value?.navigateBack();
  else void vectorMapRef.value?.goBack();
}

onBeforeUnmount(() => {
  disposed=true;
  cancelIdlePreparation();
  switchVersion++;switchController?.abort();
});
watch(()=>props.initialView,view=>{if(switching.value||view!==viewMode.value)void switchView(view);});
watch(()=>mapNavigationKey(navigationPath.value),()=>{
  cancelIdlePreparation();
  if(idleRescheduleAvailable){idleRescheduleAvailable=false;scheduleIdlePreparation();}else idleNavigationBlocked=true;
});
watch(()=>[props.active,props.showViewSwitch] as const,([active,show])=>{
  if(active)void nextTick().then(playFirstVectorEntrance);
  if(!active||!show)cancelIdlePreparation();else scheduleIdlePreparation();
});
defineExpose({
  replayEntrance,
  prepareEntrance,
  switchView,
  syncNavigation,
  resetToCountry:()=>syncNavigation(initialMapNavigationPath),
  cancelPendingPreparation,
  getNavigation:()=>navigationPath.value.map(item=>({...item})),
  getView:()=>viewMode.value,
  getRevealDiagnostics:()=>({view:viewMode.value,pending:pendingMode.value,switch:switchDiagnostics.value?{...switchDiagnostics.value}:undefined,navigationKey:mapNavigationKey(navigationPath.value),idle:idlePreparation.value?{...idlePreparation.value,pending:idlePreparation.value.state!=='ready',target:idlePreparation.value.view,ready:idlePreparation.value.state==='ready'}:undefined,threeNavigationKey:threeMapRef.value?.getNavigationKey(),three:threeMapRef.value?.getRevealDiagnostics?.(),vector:vectorMapRef.value?.getRevealDiagnostics(),overlay:vectorMapRef.value?.getOverlayDiagnostics()}),
});
</script>

<style scoped>
.hybrid-map {
  position: absolute;
  inset: 0;
}
.map-switch-error{position:absolute;top:20px;left:50%;transform:translateX(-50%);z-index:16;color:#b7c5ce;font:12px/1.5 system-ui}
.map-switch-loader{--fui-instrument-color:var(--map-accent-soft,#8ac8ed);background:rgb(3 8 13 / .55)}
.map-switch-loader :deep(.scene-loader__instrument){animation:none}
.map-switch-spinner{display:inline-block;width:9px;height:9px;margin-left:7px;border:1px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:map-switch-spin .75s linear infinite}
@keyframes map-switch-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.map-switch-spinner{animation:none}}

.dashboard-map-back {
  position: absolute;
  left: 26px;
  top: 28px;
  z-index: 15;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 13px 0 10px;
  border: 1px solid var(--map-drill-border, rgba(100, 120, 135, 0.52));
  border-radius: 2px;
  background: linear-gradient(180deg, rgba(20, 34, 46, 0.9), rgba(8, 17, 25, 0.9));
  color: var(--map-drill-text-alpha, rgba(218, 227, 233, 0.82));
  font: 13px/1 'Rajdhani', 'DIN Alternate', 'Arial Narrow', sans-serif;
  letter-spacing: 0.08em;
  box-shadow:
    inset 0 0 12px var(--map-drill-box-inner, rgba(100, 120, 135, 0.12)),
    0 0 14px var(--map-drill-box-outer, rgba(100, 120, 135, 0.12));
  cursor: pointer;
  backdrop-filter: blur(7px);
  transition: border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.dashboard-map-back span {
  margin-top: -1px;
  color: var(--map-accent-soft, #a9b6c0);
  font: 22px/1 monospace;
}

.dashboard-map-back:hover:not(:disabled) {
  border-color: var(--map-accent-soft, #a9b6c0);
  color: #f3f7fa;
  box-shadow:
    inset 0 0 16px var(--map-drill-box-inner, rgba(100, 120, 135, 0.18)),
    0 0 18px var(--map-drill-box-outer, rgba(100, 120, 135, 0.16));
}

.dashboard-map-back:disabled {
  cursor: wait;
  opacity: 0.48;
}

.map-view-switch {
  position: absolute;
  left: 50%;
  top: 126px;
  z-index: 14;
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--map-drill-border, rgba(53, 216, 255, 0.5));
  border-radius: 3px;
  background: rgba(1, 8, 13, 0.78);
  box-shadow: 0 0 18px var(--map-drill-box-outer, rgba(53, 216, 255, 0.18));
  backdrop-filter: blur(8px);
  transform: translateX(-50%);
}

.map-view-switch button {
  min-width: 78px;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--map-drill-text-alpha, rgba(220, 246, 252, 0.74));
  font-size: 13px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.map-view-switch button:hover:not(:disabled) {
  color: var(--map-drill-text, #effcff);
}

.map-view-switch button.active {
  color: #f7fdff;
  background: color-mix(in srgb, var(--map-accent, #35d8ff) 28%, rgba(3, 18, 26, 0.92));
  box-shadow: inset 0 0 14px var(--map-drill-box-inner, rgba(53, 216, 255, 0.22));
}

.map-view-switch button:disabled {
  cursor: wait;
  opacity: 0.58;
}
</style>
