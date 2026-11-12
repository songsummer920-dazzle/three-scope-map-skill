// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Native React host; the Three.js renderer body is shared with the validated ChinaMap baseline.
import React from 'react';
import { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from './mapRuntime';
import ZhejiangThreeMap from './ZhejiangThreeMap';
import { mapThemeStyle } from './mapTheme';
import {
  initialMapNavigationPath,
  mapNavigationKey,
  type MapNavigationPath,
} from './mapNavigation';
import './ChinaMap.css';
const list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;
type MapViewMode = '3d' | '2d' | 'overlay';
type ThreeMapExpose = {
  syncNavigation: (path: MapNavigationPath) => Promise<void>;
};
type VectorMapExpose = {
  prepareForReveal: () => Promise<void>;
};
type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};
export type ChinaMapProps = {
  active?: boolean;
  initialView?:'3d'|'2d'|'overlay';
  overlaySurface?:'classic'|'terrain-glass'|'smooth-glass';
  preloadViews?:boolean;
} & EventProps<{
  ready: [];
}>;
export default nativeMapComponent<ChinaMapProps>('ChinaMap', scope => {
const {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;
const shallowRef=ref,useId=()=>scope.id;
const VectorMap=defineAsyncComponent(()=>import('./VectorMap'));
const props = withDefaults(scope.props<{
  active?: boolean;
  initialView?:'3d'|'2d'|'overlay';
  overlaySurface?:'classic'|'terrain-glass'|'smooth-glass';
  preloadViews?:boolean;
}>(), {
  active: true,
  initialView:'3d',
  overlaySurface:'smooth-glass',
  preloadViews:false,
});
const emit = scope.emit;
const viewMode = ref<MapViewMode>(props.initialView);
const threeMounted=ref(props.initialView==='3d');
const threeReady=ref(false);
const vectorMounted = ref(props.initialView==='2d'||props.initialView==='overlay');
const vectorReady = ref(false);
const switching = ref(false);
const switchError=ref('');
const pendingMode = ref<MapViewMode>();
const switchMaskMounted = ref(false);
const switchMaskCovered = ref(false);
const navigationPath = ref<MapNavigationPath>([...initialMapNavigationPath]);
const threeMapRef = ref<ThreeMapExpose>();
const vectorMapRef = ref<VectorMapExpose>();
let vectorPreloadHandle: number | undefined;
let vectorPreloadKind: 'idle' | 'timeout' | undefined;
let vectorReadyWaiters: Array<(ready: boolean) => void> = [];
let threeReadyWaiters:Array<(ready:boolean)=>void>=[];
function onThreeReady(){threeReady.value=true;threeReadyWaiters.forEach(resolve=>resolve(true));threeReadyWaiters=[];if(viewMode.value==='3d')emit('ready');}
function waitForThreeReady(){if(threeReady.value)return Promise.resolve(true);return new Promise<boolean>(resolve=>{const timer=setTimeout(()=>resolve(false),15000);threeReadyWaiters.push(value=>{clearTimeout(timer);resolve(value);});});}
const switchMaskCoverDuration = 80;
const switchMaskRevealDuration = 120;
function cancelVectorPreload() {
  if (vectorPreloadHandle === undefined) return;
  const idleWindow = window as IdleWindow;
  if (vectorPreloadKind === 'idle') idleWindow.cancelIdleCallback?.(vectorPreloadHandle);
  else window.clearTimeout(vectorPreloadHandle);
  vectorPreloadHandle = undefined;
  vectorPreloadKind = undefined;
}
function scheduleVectorPreload() {
  if (!props.preloadViews || !props.active || vectorMounted.value || viewMode.value !== '3d') return;
  cancelVectorPreload();
  const idleWindow = window as IdleWindow;
  const mount = () => {
    vectorPreloadHandle = undefined;
    vectorPreloadKind = undefined;
    if (props.active && viewMode.value === '3d') vectorMounted.value = true;
  };
  if (idleWindow.requestIdleCallback) {
    vectorPreloadKind = 'idle';
    vectorPreloadHandle = idleWindow.requestIdleCallback(mount, { timeout: 48 });
  } else {
    vectorPreloadKind = 'timeout';
    vectorPreloadHandle = window.setTimeout(mount, 48);
  }
}
function onVectorReady() {
  if(viewMode.value==='2d'||viewMode.value==='overlay')emit('ready');
  if (vectorReady.value) return;
  vectorReady.value = true;
  vectorReadyWaiters.forEach((resolve) => resolve(true));
  vectorReadyWaiters = [];
}
function waitForVectorReady(timeout = 30000) {
  if (vectorReady.value) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      vectorReadyWaiters = vectorReadyWaiters.filter((waiter) => waiter !== finish);
      resolve(ready);
    };
    const timer = window.setTimeout(() => finish(false), timeout);
    vectorReadyWaiters.push(finish);
  });
}
function updateNavigation(path: MapNavigationPath) {
  if (mapNavigationKey(path) === mapNavigationKey(navigationPath.value)) return;
  navigationPath.value = path.map((item) => ({ ...item }));
}
function onThreeNavigationChange(path: MapNavigationPath) {
  if (viewMode.value === '3d') updateNavigation(path);
}
function onVectorNavigationChange(path: MapNavigationPath) {
  if (viewMode.value === '2d'||viewMode.value==='overlay') updateNavigation(path);
}
function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}
function wait(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}
async function runMaskedSwitch(mode: MapViewMode) {
  switchMaskMounted.value = true;
  await waitForPaint();
  switchMaskCovered.value = true;
  await waitForPaint();
  const coverStartedAt = performance.now();

  if (mode === '2d'||mode==='overlay') await vectorMapRef.value?.prepareForReveal();
  else await threeMapRef.value?.syncNavigation(navigationPath.value);

  const remainingCoverTime = switchMaskCoverDuration - (performance.now() - coverStartedAt);
  if (remainingCoverTime > 0) await wait(remainingCoverTime);

  viewMode.value = mode;
  await waitForPaint();
  switchMaskCovered.value = false;
  await waitForPaint();
  await wait(switchMaskRevealDuration);
  switchMaskMounted.value = false;
}
async function switchView(mode: MapViewMode) {
  if (mode === viewMode.value || switching.value || !props.active) return;
  switching.value = true;
  switchError.value='';
  pendingMode.value = mode;
  try {
    if (mode === '2d'||mode==='overlay') {
      cancelVectorPreload();
      vectorMounted.value = true;
      if(!await waitForVectorReady()){if(props.active)switchError.value='底图暂未就绪，请稍后重试';return;}
      if(!props.active)return;
    }else if(mode==='3d'){
      threeMounted.value=true;await nextTick();if(!await waitForThreeReady()||!props.active)return;
    }
    await runMaskedSwitch(mode);
  } finally {
    switching.value = false;
    pendingMode.value = undefined;
  }
}
function cancelReadyWaiters() {
  threeReadyWaiters.splice(0).forEach((resolve) => resolve(false));
  vectorReadyWaiters.splice(0).forEach((resolve) => resolve(false));
}
watch(() => props.active, (active) => {
  if (active) scheduleVectorPreload();
  else {
    cancelVectorPreload();
    cancelReadyWaiters();
  }
});
onMounted(scheduleVectorPreload);
watch(()=>props.initialView,view=>{if(view!==viewMode.value)void switchView(view);});
scope.expose({switchView,getView:()=>viewMode.value});
onBeforeUnmount(() => {
  cancelReadyWaiters();
  cancelVectorPreload();
});
scope.render=()=> <><div {...scope.rootProps()} className={classNames("hybrid-map",scope.rootProps().className)} style={styleObject(mapThemeStyle,scope.rootProps().style)} data-v-react-chinamap=""><div aria-hidden={viewMode.value !== '3d'} inert={viewMode.value !== '3d'} className={classNames("three-renderer-layer",{ 'is-active': viewMode.value === '3d' })} data-v-react-chinamap="">{threeMounted.value ? <ZhejiangThreeMap ref={scope.bind(threeMapRef)} active={props.active && viewMode.value === '3d'} onReady={($event?: any)=>{invoke(onThreeReady,$event);}} onNavigationChange={($event?: any)=>{invoke(onThreeNavigationChange,$event);}} data-v-react-chinamap=""></ZhejiangThreeMap> : null}</div>{vectorMounted.value ? <VectorMap ref={scope.bind(vectorMapRef)} active={props.active && (viewMode.value === '2d' || viewMode.value === 'overlay')} navigation={navigationPath.value} overlay={viewMode.value === 'overlay'} overlaySurface={props.overlaySurface} onReady={($event?: any)=>{invoke(onVectorReady,$event);}} onNavigationChange={($event?: any)=>{invoke(onVectorNavigationChange,$event);}} data-v-react-chinamap=""></VectorMap> : null}{switchMaskMounted.value ? <div aria-hidden="true" className={classNames("map-switch-mask",{ 'is-covered': switchMaskCovered.value })} data-v-react-chinamap=""></div> : null}{switchError.value ? <span role="status" className={classNames("map-switch-error")} data-v-react-chinamap="">{switchError.value}</span> : null}{props.active ? <div role="group" aria-label="地图视图切换" className={classNames("map-view-switch")} data-v-react-chinamap=""><button type="button" aria-pressed={viewMode.value === '3d'} disabled={switching.value} onClick={($event?: any)=>{switchView('3d');}} className={classNames({ active: viewMode.value === '3d' })} data-v-react-chinamap="">{"3D 地图"}</button><button type="button" aria-pressed={viewMode.value === '2d'} disabled={switching.value} onClick={($event?: any)=>{switchView('2d');}} className={classNames({ active: viewMode.value === '2d' })} data-v-react-chinamap="">{switching.value && pendingMode.value === '2d' ? '2D 加载中' : '2D 地图'}</button><button type="button" aria-pressed={viewMode.value === 'overlay'} disabled={switching.value} onClick={($event?: any)=>{switchView('overlay');}} className={classNames({ active: viewMode.value === 'overlay' })} data-v-react-chinamap="">{switching.value && pendingMode.value === 'overlay' ? '叠加加载中' : '2D + 3D'}</button></div> : null}</div></>;
});
