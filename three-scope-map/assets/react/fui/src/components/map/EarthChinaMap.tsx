// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Native React host; the Three.js renderer body is shared with the validated EarthChinaMap baseline.
import React from 'react';
import { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from './mapRuntime';
import {FUI_EARTH_WARMUP_GATE,type FuiPolarStyle,type FuiEarthLoading,type FuiSkinFailure} from './fuiEarthLifecycle';
import FuiSceneLoader from './FuiSceneLoader';
import {resolveFuiDestinationSurface,type FuiMapPresentation,type FuiMapSurfaceVariant,type FuiMapSurfaceChoice,type FuiMapViewMode} from './fuiMapPresentation';
import type {MapQuality} from './mapQuality';
import type {FuiEarthPresentation} from './fuiEarthHologram';
import type { FuiEarthSkinId, FuiEarthScanStyle } from './fuiEarthTheme';
import {initialMapNavigationPath,type MapNavigationPath} from './mapNavigation';
import './EarthChinaMap.css';
const list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;
export type EarthChinaMapMode = 'earth' | 'china';
type EarthTelemetryPayload = {
  longitude: number;
  latitude: number;
  heading: number;
  anchors: Record<string, { x: number; y: number; visible: boolean }>;
};
type ChinaMapApi={replayEntrance:()=>void;prepareEntrance:()=>void;syncNavigation:(path:MapNavigationPath)=>Promise<boolean>;resetToCountry:()=>Promise<boolean>;cancelPendingPreparation:()=>void;getNavigation:()=>MapNavigationPath;getView:()=>FuiMapViewMode;getRevealDiagnostics:()=>unknown};
export type EarthChinaMapProps = {
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
} & EventProps<{
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
}>;
export default nativeMapComponent<EarthChinaMapProps>('EarthChinaMap', scope => {
const {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;
const shallowRef=ref,useId=()=>scope.id;
const ChinaMap = defineAsyncComponent(() => import('./ChinaMap'));
const EarthView = defineAsyncComponent(() => import('./EarthView'));
const props = withDefaults(scope.props<{
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
const emit = scope.emit;
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
scope.expose({retry:()=>mode.value==='china'?retryMap():retryEarth(),retrySkin:()=>earthViewRef.value?.retrySkin(),replayEntrance:()=>chinaMapRef.value?.replayEntrance(),enterChina:()=>earthViewRef.value?.enterChina(),returnToEarth,syncNavigation:(path:MapNavigationPath)=>chinaMapRef.value?.syncNavigation(path)??Promise.resolve(false),getNavigation:()=>chinaMapRef.value?.getNavigation()??initialMapNavigationPath.map(item=>({...item})),getMapDiagnostics:()=>chinaMapRef.value?.getRevealDiagnostics(),getDiagnostics:()=>earthViewRef.value?.getDiagnostics()});
scope.render=()=> <><div {...scope.rootProps()} data-mode={mode.value} className={classNames("earth-china-map",scope.rootProps().className)} style={styleObject(scope.rootProps().style)} data-v-react-earthchinamap="">{chinaMounted.value ? <div className={classNames("china-map-stage",{
    'is-active': mode.value === 'china',
    'is-handoff': handoffActive.value,
    'is-ready': chinaReady.value,
    'uses-native-entrance': props.mapPresentation !== 'standard',
})} data-v-react-earthchinamap=""><ChinaMap ref={scope.bind(chinaMapRef)} active={mode.value === 'china'} showBackButton={true} showViewSwitch={true} mapPresentation={props.mapPresentation} surfaceVariant={destinationSurfaceVariant.value} skin={displaySkin.value} initialView={selectedMapView.value} quality={props.quality} mapWaveEnabled={props.mapWaveEnabled} key={mapAttempt.value} onReady={($event?: any)=>{invoke(onChinaReady,$event);}} onLoading={($event?: any)=>{invoke(onMapLoading,$event);}} onExit={($event?: any)=>{invoke(returnToEarth,$event);}} onHudTransform={($event?: any)=>{emit('map-hud-transform', $event);}} data-v-react-earthchinamap=""></ChinaMap></div> : null}{(mode.value === 'china' && !chinaReady.value) || countryEntryPreparing.value ? <FuiSceneLoader label="地图加载中" error={mapLoadingStage.value === 'error'} retryable={true} onRetry={($event?: any)=>{invoke(retryMap,$event);}} data-v-react-earthchinamap=""></FuiSceneLoader> : null}{earthMounted.value ? <div className={classNames("earth-fit-stage")} data-v-react-earthchinamap=""><EarthView ref={scope.bind(earthViewRef)} active={mode.value === 'earth'} startIntro={true} frameScale={props.earthScale} skin={props.skin} scanStyle={props.scanStyle} polarStyle={props.polarStyle} earthPresentation={props.earthPresentation} quality={props.quality} beforeEnterChina={prepareCountryEntry} key={`${earthAttempt.value}-${props.earthPresentation}`} onIntroComplete={($event?: any)=>{invoke(onEarthReady,$event);}} onLoading={($event?: any)=>{emit('loading', $event);}} onSkinApplied={($event?: any)=>{invoke(onSkinApplied,$event);}} onSkinError={($event?: any)=>{emit('skin-error', $event);}} onRetry={($event?: any)=>{invoke(retryEarth,$event);}} onFirstVisible={($event?: any)=>{invoke(prepareChinaMap,$event);}} onHandoffStart={($event?: any)=>{invoke(beginChinaHandoff,$event);}} onEnterChina={($event?: any)=>{invoke(showChinaMap,$event);}} onTelemetry={($event?: any)=>{invoke(forwardEarthTelemetry,$event);}} style={styleObject({display:(mode.value === 'earth') ? undefined : 'none'})} data-v-react-earthchinamap=""></EarthView></div> : null}</div></>;
});
