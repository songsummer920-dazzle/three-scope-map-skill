// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Native React host; the Three.js renderer body is shared with the validated ChinaMap baseline.
import React from 'react';
import { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from './mapRuntime';
import {FUI_EARTH_WARMUP_GATE} from './fuiEarthLifecycle';
import ZhejiangThreeMap from './ZhejiangThreeMap';
import FuiSceneLoader from './FuiSceneLoader';
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
import './ChinaMap.css';
const list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;
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
export type ChinaMapProps = {
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
} & EventProps<{
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
}>;
export default nativeMapComponent<ChinaMapProps>('ChinaMap', scope => {
const {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;
const shallowRef=ref,useId=()=>scope.id;
const VectorMap = defineAsyncComponent(() => import('./VectorMap'));
const props = withDefaults(scope.props<{
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
const emit = scope.emit;
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
scope.expose({
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
scope.render=()=> <><div {...scope.rootProps()} ref={scope.bind(hybridHost)} aria-busy={switching.value && !!pendingMode.value} data-current-view={viewMode.value} data-pending-view={pendingMode.value} data-navigation-key={mapNavigationKey(navigationPath.value)} data-switch-source={switchDiagnostics.value?.source} data-switch-target={switchDiagnostics.value?.target} data-switch-phase={switchDiagnostics.value?.phase} className={classNames("hybrid-map",scope.rootProps().className)} style={styleObject([mapThemeStyle, vectorControlStyle.value],scope.rootProps().style)} data-v-react-chinamap="">{threeMounted.value ? <ZhejiangThreeMap ref={scope.bind(threeMapRef)} active={props.active && viewMode.value === '3d'} initialNavigation={navigationPath.value} showControls={true} useInternalHudRing={true} mapPresentation={props.mapPresentation} surfaceVariant={props.surfaceVariant} skin={props.skin} quality={props.quality} mapWaveEnabled={props.mapWaveEnabled} onReady={($event?: any)=>{invoke(onThreeReady,$event);}} onLoading={($event?: any)=>{invoke(onThreeLoading,$event);}} onNavigationChange={($event?: any)=>{invoke(onThreeNavigationChange,$event);}} onHudTransform={($event?: any)=>{emit('hud-transform', $event);}} style={styleObject({display:(viewMode.value === '3d') ? undefined : 'none'})} data-v-react-chinamap=""></ZhejiangThreeMap> : null}{vectorMounted.value ? <VectorMap ref={scope.bind(vectorMapRef)} active={props.active && viewMode.value !== '3d'} navigation={navigationPath.value} palette={vectorPalette.value} overlay={vectorComposition.value === 'overlay'} overlaySurface={props.surfaceVariant === 'hologram-glass' ? 'smooth-glass' : props.mapPresentation === 'standard' ? 'classic' : 'terrain-glass'} overlaySkin={props.skin} quality={props.quality} autoEntrance={!vectorEntrancePlayed.value} onReady={($event?: any)=>{invoke(onVectorReady,$event);}} onNavigationChange={($event?: any)=>{invoke(onVectorNavigationChange,$event);}} data-v-react-chinamap=""></VectorMap> : null}{props.active && props.showBackButton && navigationPath.value.length === 1 ? <button type="button" disabled={switching.value} aria-label={backButtonLabel.value} onClick={($event?: any)=>{invoke(navigateBack,$event);}} className={classNames("dashboard-map-back")} data-v-react-chinamap=""><span aria-hidden="true" data-v-react-chinamap="">{"‹"}</span>{backButtonLabel.value}</button> : null}{switchError.value ? <span role="status" className={classNames("map-switch-error")} data-v-react-chinamap="">{switchError.value}</span> : null}{props.active && switching.value && pendingMode.value ? <FuiSceneLoader label={switchLoadingLabel.value} data-loading-view={pendingMode.value} className={classNames("map-switch-loader")} data-v-react-chinamap=""></FuiSceneLoader> : null}{props.active && props.showViewSwitch ? <div role="group" aria-label="地图视图切换" className={classNames("map-view-switch")} data-v-react-chinamap=""><button type="button" aria-pressed={viewMode.value === '3d'} disabled={switching.value} onClick={($event?: any)=>{switchView('3d');}} className={classNames({ active: viewMode.value === '3d' })} data-v-react-chinamap="">{"3D 地图"}{switching.value && pendingMode.value === '3d' ? <span role="status" aria-label="地图加载中" className={classNames("map-switch-spinner")} data-v-react-chinamap=""></span> : null}</button><button type="button" aria-pressed={viewMode.value === '2d'} disabled={switching.value} onClick={($event?: any)=>{switchView('2d');}} className={classNames({ active: viewMode.value === '2d' })} data-v-react-chinamap="">{"2D 地图"}{switching.value && pendingMode.value === '2d' ? <span role="status" aria-label="地图加载中" className={classNames("map-switch-spinner")} data-v-react-chinamap=""></span> : null}</button><button type="button" aria-pressed={viewMode.value === 'overlay'} disabled={switching.value} onClick={($event?: any)=>{switchView('overlay');}} className={classNames({ active: viewMode.value === 'overlay' })} data-v-react-chinamap="">{"2D + 3D"}{switching.value && pendingMode.value === 'overlay' ? <span role="status" aria-label="地图加载中" className={classNames("map-switch-spinner")} data-v-react-chinamap=""></span> : null}</button></div> : null}</div></>;
});
