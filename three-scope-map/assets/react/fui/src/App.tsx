// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Native React host; the Three.js renderer body is shared with the validated App baseline.
import React from 'react';
import { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from './components/map/mapRuntime';
import FuiEarth from './components/map/FuiEarth';
import {FUI_EARTH_PRESENTATIONS,isFuiEarthPresentation,type FuiEarthPresentation} from './components/map/fuiEarthHologram';
import type {FuiSkinFailure,FuiEarthLoading} from './components/map/fuiEarthLifecycle';
import { FUI_SCENE_PRESETS,isFuiMapPresentation,resolveFuiMapLook, type FuiMapPresentation,type FuiMapStyle,type FuiMapWave,type FuiMapViewMode } from './components/map/fuiMapPresentation';
import type {MapQuality} from './components/map/mapQuality';
import { FUI_THEME_PRIMARY_OVERRIDE, FUI_EARTH_SCAN_STYLES, isFuiEarthScanStyle, type FuiEarthScanStyle, FUI_EARTH_SKINS, getFuiSkinStyle, isFuiEarthSkin, getFuiThemePrimary,resolveFuiEarthThemeId, type FuiEarthSkinId } from './components/map/fuiEarthTheme';
import './App.css';
const list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;

export type AppProps = {} & EventProps<{}>;
export default nativeMapComponent<AppProps>('App', scope => {
const {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;
const shallowRef=ref,useId=()=>scope.id;
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
scope.render=()=> <><main {...scope.rootProps()} className={classNames("skin-preview",{ 'is-clean': clean.value },scope.rootProps().className)} style={styleObject(skinStyle.value,scope.rootProps().style)} data-v-react-app="">{!clean.value ? <header className={classNames("preview-header")} data-v-react-app=""><div className={classNames("preview-title")} data-v-react-app=""><span aria-hidden="true" className={classNames("title-mark")} data-v-react-app=""></span><h1 data-v-react-app="">{"FUI 地球与地图"}</h1><span className={classNames("edition")} data-v-react-app="">{"FUI MATERIALS"}</span></div><button type="button" aria-label="专注预览，Esc 返回" onClick={($event?: any)=>{clean.value = true;}} className={classNames("focus-preview")} data-v-react-app="">{"专注预览"}</button><span role="status" className={classNames("preview-status")} data-v-react-app="">{!ready.value ? '正在准备场景' : skinSwitching.value ? '正在切换皮肤' : mode.value === 'china' ? '中国地形' : alerting.value ? '警戒模式' : '常态模式'}</span></header> : null}<div aria-busy={!ready.value || skinSwitching.value} className={classNames("preview-canvas")} data-v-react-app=""><FuiEarth ref={scope.bind(earthRef)} skin={selectedSkin.value} primaryColor={primaryColor.value} alert={alerting.value} scanStyle={scanStyle.value} mapPresentation={mapPresentation.value} mapStyle={effectiveMapStyle.value} mapWave={mapWave.value} mapView={mapView.value} quality={quality} initialMode={initialMode} polarStyle={polarStyle} earthPresentation={earthPresentation.value} onReady={($event?: any)=>{ready.value = true;}} onLoading={($event?: any)=>{invoke(onLoading,$event);}} onSkinError={($event?: any)=>{invoke(onSkinError,$event);}} onSkinApplied={($event?: any)=>{invoke(onSkinApplied,$event);}} onModeChange={($event?: any)=>{invoke(handleModeChange,$event);}} data-v-react-app=""></FuiEarth>{mode.value === 'china' ? <button type="button" onClick={($event?: any)=>{earthRef.value?.returnToEarth();}} className={classNames("preview-earth-back")} data-v-react-app=""><span aria-hidden="true" data-v-react-app="">{"‹"}</span>{"返回地球 "}</button> : null}</div>{!clean.value ? <footer className={classNames("preview-controls")} data-v-react-app=""><div role="group" aria-label="地球皮肤" className={classNames("skin-options")} data-v-react-app="">{list(normalSkins).map((skin) => (<button type="button" aria-pressed={selectedSkin.value === skin.id} disabled={!ready.value} title={skin.subtitle} key={skin.id} onClick={($event?: any)=>{selectSkin(skin.id);}} data-v-react-app=""><span aria-hidden="true" className={classNames("skin-swatch")} style={styleObject({ background: skin.accent })} data-v-react-app=""></span>{skin.name}</button>))}</div>{mode.value === 'earth' ? <div role="group" aria-label="地球样式" className={classNames("scan-options")} data-v-react-app="">{list(FUI_EARTH_PRESENTATIONS).map((item) => (<button type="button" aria-pressed={earthPresentation.value === item.id} disabled={!ready.value} key={item.id} onClick={($event?: any)=>{selectEarthPresentation(item.id);}} data-v-react-app="">{item.name}</button>))}</div> : null}{mode.value === 'earth' && earthPresentation.value === 'surface' ? <div role="group" aria-label="扫光效果" className={classNames("scan-options")} data-v-react-app="">{list(FUI_EARTH_SCAN_STYLES).map((effect) => (<button type="button" aria-pressed={scanStyle.value === effect.id} disabled={!ready.value} key={effect.id} onClick={($event?: any)=>{scanStyle.value = effect.id;}} data-v-react-app="">{effect.name}</button>))}</div> : null}<div role="group" aria-label="地图材质与动效" className={classNames("map-options material-options")} data-v-react-app=""><label data-v-react-app="">{"主色"}<input type="color" aria-label="主题主色" value={getFuiThemePrimary(activeSkin.value)} onChange={($event?: any)=>{primaryColor.value = ($event.target as HTMLInputElement).value;}} data-v-react-app=""></input></label><label data-v-react-app="">{"材质"}<select value={mapStyle.value ?? ''} aria-label="地图材质" onChange={($event?: any)=>{selectMapStyle(($event.target as HTMLSelectElement).value);}} data-v-react-app=""><option value="" data-v-react-app="">{"跟随预设"}</option><option value="classic" data-v-react-app="">{"经典"}</option><option value="terrain-glass" data-v-react-app="">{"地形玻璃"}</option><option value="smooth-glass" data-v-react-app="">{"平滑玻璃"}</option></select></label><label data-v-react-app="">{"扩散"}<select value={mapWave.value ?? ''} aria-label="底部扩散" onChange={($event?: any)=>{mapWave.value=$event.target.value===''?undefined:$event.target.value;}} data-v-react-app=""><option value={''} data-v-react-app="">{"跟随预设"}</option><option value="hex" data-v-react-app="">{"蜂窝"}</option><option value="grid" data-v-react-app="">{"网格"}</option><option value="none" data-v-react-app="">{"关闭"}</option></select></label></div><span className={classNames("material-description")} data-v-react-app="">{activeInfo.value.subtitle}</span><button type="button" title={alerting.value ? '恢复先前的常态皮肤' : '切换为红色警戒'} aria-pressed={alerting.value} disabled={!ready.value} onClick={($event?: any)=>{alerting.value = !alerting.value;}} className={classNames("alert-toggle")} data-v-react-app=""><span aria-hidden="true" className={classNames("alert-indicator")} data-v-react-app=""></span>{alerting.value ? '解除警戒' : '开启警戒'}</button>{mode.value === 'china' && ready.value ? <button type="button" onClick={($event?: any)=>{earthRef.value?.replayEntrance();}} className={classNames("replay-entry")} data-v-react-app="">{"重播入场"}</button> : null}</footer> : null}</main></>;
});
