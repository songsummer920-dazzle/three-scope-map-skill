// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Native React host; the Three.js renderer body is shared with the validated EarthChinaMap baseline.
import React from 'react';
import { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from './mapRuntime';
import EarthView from './EarthView';
import './EarthChinaMap.css';
const list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;
export type EarthChinaMapMode = 'earth' | 'china';
export type EarthChinaMapProps = {
  initialMode?: EarthChinaMapMode;
} & EventProps<{
  'mode-change': [mode: EarthChinaMapMode];
}>;
export default nativeMapComponent<EarthChinaMapProps>('EarthChinaMap', scope => {
const {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;
const shallowRef=ref,useId=()=>scope.id;
const ChinaMap = defineAsyncComponent(() => import('./ChinaMap'));
const props = withDefaults(scope.props<{
  initialMode?: EarthChinaMapMode;
}>(), {
  initialMode: 'earth',
});
const emit = scope.emit;
const mode = ref<EarthChinaMapMode>(props.initialMode);
const chinaMounted = ref(props.initialMode === 'china');
const chinaReady = ref(false);
const handoffActive = ref(false);
let pendingChinaEntry = false;
let pendingHandoff = false;
let handoffCleanupHandle: number | undefined;
function showChinaMap() {
  if (!chinaReady.value) {
    pendingChinaEntry = true;
    chinaMounted.value = true;
    return;
  }
  mode.value = 'china';
  emit('mode-change', mode.value);
  handoffCleanupHandle = globalThis.setTimeout(() => {
    handoffActive.value = false;
  }, 920);
}
function beginChinaHandoff() {
  if (!chinaReady.value) {
    pendingHandoff = true;
    chinaMounted.value = true;
    return;
  }
  handoffActive.value = true;
}
function onChinaReady() {
  chinaReady.value = true;
  if (pendingHandoff) {
    pendingHandoff = false;
    beginChinaHandoff();
  }
  if (!pendingChinaEntry) return;
  pendingChinaEntry = false;
  showChinaMap();
}
function prepareChinaMap() {
  if (chinaMounted.value) return;
  chinaMounted.value = true;
}
onBeforeUnmount(() => {
  if (handoffCleanupHandle !== undefined) globalThis.clearTimeout(handoffCleanupHandle);
});
scope.render=()=> <><div {...scope.rootProps()} className={classNames("earth-china-map",scope.rootProps().className)} style={styleObject(scope.rootProps().style)} data-v-react-earthchinamap="">{chinaMounted.value ? <div className={classNames("china-map-stage",{
    'is-active': mode.value === 'china',
    'is-handoff': handoffActive.value,
    'is-ready': chinaReady.value,
})} data-v-react-earthchinamap=""><ChinaMap active={mode.value === 'china'} key={"china"} onReady={($event?: any)=>{invoke(onChinaReady,$event);}} data-v-react-earthchinamap=""></ChinaMap></div> : null}{props.initialMode === 'earth' ? <EarthView active={mode.value === 'earth'} startIntro={chinaReady.value} key={"earth"} onSceneReady={($event?: any)=>{invoke(prepareChinaMap,$event);}} onHandoffStart={($event?: any)=>{invoke(beginChinaHandoff,$event);}} onEnterChina={($event?: any)=>{invoke(showChinaMap,$event);}} style={styleObject({display:(mode.value === 'earth') ? undefined : 'none'})} data-v-react-earthchinamap=""></EarthView> : null}</div></>;
});
