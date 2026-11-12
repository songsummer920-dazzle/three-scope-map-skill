// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Native React host; the Three.js renderer body is shared with the validated FuiEarth baseline.
import React from 'react';
import { nativeMapComponent, computed, withDefaults, classNames, styleObject, invoke, nextTick, defineAsyncComponent, type Ref, type EventProps } from './mapRuntime';
import type {FuiPolarStyle,FuiEarthLoading,FuiSkinFailure} from './fuiEarthLifecycle';
import type {FuiEarthPresentation} from './fuiEarthHologram';
import type {MapNavigationPath} from './mapNavigation';
import { Crosshair } from 'lucide-react';
import EarthChinaMap from './EarthChinaMap';
import { resolveFuiMapLook, type FuiMapPresentation } from './fuiMapPresentation';
import { FUI_THEME_PRIMARY_OVERRIDE, getFuiHudPalette, getFuiSkinStyle, getFuiThemePrimary, isFuiThemeColorId, resolveFuiEarthThemeId, type FuiEarthSkinId, type FuiEarthScanStyle } from './fuiEarthTheme';
import * as THREE from 'three';
import './FuiEarth.css';
const list=(value:any):any[]=>typeof value==='number'?Array.from({length:value},(_,i)=>i+1):value;
type EarthTelemetryPayload = {
  longitude: number;
  latitude: number;
  heading: number;
  anchors: Record<string, { x: number; y: number; visible: boolean }>;
};
export type FuiEarthProps = { showHud?: boolean; skin?: FuiEarthSkinId; primaryColor?:string; alert?: boolean; scanStyle?: FuiEarthScanStyle; mapPresentation?: FuiMapPresentation; mapStyle?:'classic'|'terrain-glass'|'smooth-glass';mapWave?:'none'|'hex'|'grid';mapSurface?:'auto'|'terrain'|'hologram-glass';mapView?:'3d'|'2d'|'overlay';quality?:'high'|'balanced'|'low'|'auto';initialMode?: 'earth'|'china';polarStyle?:FuiPolarStyle;earthPresentation?:FuiEarthPresentation } & EventProps<{
  ready: [];
  loading:[state:FuiEarthLoading];
  'skin-applied':[skin:FuiEarthSkinId];
  'skin-error':[error:FuiSkinFailure];
  'earth-telemetry': [payload: EarthTelemetryPayload];
  'mode-change': [mode: 'earth' | 'china'];
  'handoff-start': [];
}>;
export default nativeMapComponent<FuiEarthProps>('FuiEarth', scope => {
const {ref,watch,onMounted,onBeforeUnmount,provide,inject}=scope;
const shallowRef=ref,useId=()=>scope.id;
const props = withDefaults(scope.props<{ showHud?: boolean; skin?: FuiEarthSkinId; primaryColor?:string; alert?: boolean; scanStyle?: FuiEarthScanStyle; mapPresentation?: FuiMapPresentation; mapStyle?:'classic'|'terrain-glass'|'smooth-glass';mapWave?:'none'|'hex'|'grid';mapSurface?:'auto'|'terrain'|'hologram-glass';mapView?:'3d'|'2d'|'overlay';quality?:'high'|'balanced'|'low'|'auto';initialMode?: 'earth'|'china';polarStyle?:FuiPolarStyle;earthPresentation?:FuiEarthPresentation }>(), { showHud: true, skin: 'original', alert: false, scanStyle: 'ribbon', mapPresentation:'standard',mapSurface:'auto',mapView:'3d',quality:'high',initialMode:'earth',polarStyle:'natural',earthPresentation:'surface' });
const requestedSkin = computed<FuiEarthSkinId>(() => resolveFuiEarthThemeId(props.skin,props.primaryColor??FUI_THEME_PRIMARY_OVERRIDE,props.alert));
const resolvedMapLook=computed(()=>resolveFuiMapLook({style:props.mapStyle,wave:props.mapWave,presentation:props.mapPresentation,surface:props.mapSurface,preset:props.skin,earthPresentation:props.earthPresentation}));
const appliedSkin=ref<FuiEarthSkinId>(requestedSkin.value);
const activeSkin=computed(()=>appliedSkin.value);
const isPhotographic=computed(()=>props.earthPresentation==='surface'&&activeSkin.value!=='original');
// The original photographic instrument uses one ink, with hierarchy supplied
// by its fine geometry and opacity. Rotate that ink continuously from the
// resolved primary; preserve neutral custom colors without skin-ID tables.
const photographicHudColor=computed(()=>{
  const primary=new THREE.Color(getFuiThemePrimary(activeSkin.value)).getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace);
  const seed=new THREE.Color('#ffb31c').getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace);
  const ink=new THREE.Color('#d08a32').getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace);
  return new THREE.Color().setHSL(primary.h+ink.h-seed.h,primary.s*ink.s,
    Math.min(1,Math.max(.08,primary.l*ink.l/seed.l)),THREE.SRGBColorSpace).getStyle();
});
const skinStyle = computed(() => ({...getFuiSkinStyle(activeSkin.value),
  ...(props.earthPresentation==='surface'&&activeSkin.value!=='original'&&mapMode.value==='earth'
    ? {'--fui-background':'#030506'} : {}),
}));
const hudInk = computed(() => getFuiHudPalette(activeSkin.value));
const hudId = useId();
const starGlowId=`fui-stars-${hudId}`;
const starColor = computed(() => isFuiThemeColorId(activeSkin.value)
  ?new THREE.Color(getFuiThemePrimary(activeSkin.value)).lerp(new THREE.Color('#ffffff'),.65).getStyle()
  :activeSkin.value === 'amber' ? '#d4b68b' : activeSkin.value === 'glacier' ? '#8ac8ed' : '#b2becb');
const emit = scope.emit;
const host = ref<HTMLDivElement>();
const earthChinaRef=ref<{retry:()=>void;retrySkin:()=>void;replayEntrance:()=>void;enterChina:()=>void;returnToEarth:()=>void;syncNavigation:(path:MapNavigationPath)=>Promise<boolean>;getNavigation:()=>MapNavigationPath;getMapDiagnostics:()=>unknown;getDiagnostics:()=>unknown}>();
scope.expose({retry:()=>earthChinaRef.value?.retry(),retrySkin:()=>earthChinaRef.value?.retrySkin(),replayEntrance:()=>earthChinaRef.value?.replayEntrance(),enterChina:()=>earthChinaRef.value?.enterChina(),returnToEarth:()=>earthChinaRef.value?.returnToEarth(),syncNavigation:(path:MapNavigationPath)=>earthChinaRef.value?.syncNavigation(path)??Promise.resolve(false),getNavigation:()=>earthChinaRef.value?.getNavigation(),getMapDiagnostics:()=>earthChinaRef.value?.getMapDiagnostics(),getDiagnostics:()=>earthChinaRef.value?.getDiagnostics()});
const scale = ref(1);
const hostSize = ref({ width: 1672, height: 941 });
const spaceStars = computed(() => Array.from({ length: 290 }, (_, index) => {
  const x = ((index * 0.61803398875 + .071) % 1) * hostSize.value.width;
  const y = ((index * 0.75487766625 + .19) % 1) * hostSize.value.height;
  const cy = hostSize.value.height / 2 - 27.5 * scale.value;
  return { index, x, y, bright: index % 23 === 0, opacity: .16 + (index % 7) * .065,
    outside: Math.hypot(x - hostSize.value.width / 2, y - cy) > 465 * scale.value };
}).filter(star => star.outside));
const polarPoint = (radius: number, angle: number) => `${(510 + radius * Math.sin(angle)).toFixed(2)},${(460 - radius * Math.cos(angle)).toFixed(2)}`;
const hologramTicks=Array.from({length:90},(_,i)=>{const angle=i*Math.PI/45;return{index:i,major:i%5===0,path:`M ${polarPoint(i%5===0?464:468,angle)} L ${polarPoint(473,angle)}`};});
const hologramArcs=[[34,39],[144,148],[223,229],[304,308]].map(([from,to])=>`M ${polarPoint(488,from*Math.PI/180)} A 488,488 0 0 1 ${polarPoint(488,to*Math.PI/180)}`);
// Photographic wrapper instrumentation is independent of the entered map HUD.
const photographicHudTicks=Array.from({length:180},(_,index)=>{
  const angle=index*Math.PI/90,major=index%5===0;
  return{index,major,path:`M ${polarPoint(major?417:420,angle)} L ${polarPoint(429,angle)}`};
});
const photographicHudSegments=Array.from({length:36},(_,index)=>{
  const angle=(index*10+3)*Math.PI/180;
  return `M ${polarPoint(476,angle)} L ${polarPoint(476,angle+.008)}`;
});
const photographicHudMarks=Array.from({length:4},(_,index)=>({
  index,path:`M ${polarPoint(446,index*Math.PI/2)} L ${polarPoint(460,index*Math.PI/2)}`,
}));
const sceneReady = ref(false);
const earthHudVisible = ref(true);
const mapMode = ref<'earth' | 'china'>(props.initialMode);
let earthHasBeenShown=props.initialMode==='earth';
function onLoading(state:FuiEarthLoading){if(state.phase!=='ready')sceneReady.value=false;emit('loading',state);}
function onSkinApplied(skin:FuiEarthSkinId){appliedSkin.value=skin;emit('skin-applied',skin);}
function beginEarthHandoff() {
  earthHudVisible.value = false;
  emit('handoff-start');
}
function handleMapModeChange(mode: 'earth' | 'china') {
  if(mode==='earth'&&!earthHasBeenShown){sceneReady.value=false;earthHasBeenShown=true;}
  mapMode.value = mode;
  earthHudVisible.value = mode === 'earth';
  emit('mode-change', mode);
}
let resizeObserver: ResizeObserver | undefined;
function updateSize(){
  if(!host.value)return;
  hostSize.value={width:host.value.clientWidth,height:host.value.clientHeight};
  // The outer rail extends above the artboard. Fit its full symmetric bounds
  // about the existing stage origin so the globe and HUD keep one frame scale.
  const photographicHeight=2*(975/2-460+482+.9/2);
  const frameInset=4;
  scale.value=isPhotographic.value
    ?Math.min(Math.max(1,host.value.clientWidth-2*frameInset)/1020,
      Math.max(1,host.value.clientHeight-2*frameInset)/photographicHeight)
    :Math.min(host.value.clientWidth/1052,host.value.clientHeight/1080);
}
watch([activeSkin,()=>props.earthPresentation],updateSize);
onMounted(()=>{
  updateSize();
  resizeObserver=new ResizeObserver(updateSize);
  if(host.value)resizeObserver.observe(host.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());
scope.render=()=> <><div {...scope.rootProps()} ref={scope.bind(host)} data-skin={activeSkin.value} data-ready={sceneReady.value} data-scan-style={props.scanStyle} data-mode={mapMode.value} data-map-presentation={props.mapPresentation} data-earth-presentation={props.earthPresentation} className={classNames("fui-earth-host",scope.rootProps().className)} style={styleObject([skinStyle.value, { '--fui-earth-scale': scale.value }],scope.rootProps().style)} data-v-react-fuiearth="">{activeSkin.value !== 'original' && mapMode.value === 'earth' ? <svg viewBox={`0 0 ${hostSize.value.width} ${hostSize.value.height}`} aria-hidden="true" className={classNames("space-field")} data-v-react-fuiearth=""><defs data-v-react-fuiearth=""><radialGradient id={starGlowId} data-v-react-fuiearth=""><stop stopColor={starColor.value} stopOpacity=".2" data-v-react-fuiearth=""></stop><stop offset="1" stopColor={starColor.value} stopOpacity="0" data-v-react-fuiearth=""></stop></radialGradient></defs>{list(spaceStars.value).map((star) => (<g key={star.index} data-v-react-fuiearth="">{star.bright ? <circle cx={star.x} cy={star.y} r="4.5" fill={`url(#${starGlowId})`} data-v-react-fuiearth=""></circle> : null}<circle cx={star.x} cy={star.y} r={star.bright ? .85 : .5} fill={starColor.value} opacity={star.opacity} data-v-react-fuiearth=""></circle></g>))}</svg> : null}<EarthChinaMap ref={scope.bind(earthChinaRef)} initialMode={props.initialMode} earthScale={scale.value} skin={requestedSkin.value} scanStyle={props.scanStyle} polarStyle={props.polarStyle} earthPresentation={props.earthPresentation} mapPresentation={resolvedMapLook.value.presentation} mapSurface={resolvedMapLook.value.surface} mapWaveEnabled={resolvedMapLook.value.waveEnabled} initialMapView={props.mapView} quality={props.quality} onReady={($event?: any)=>{sceneReady.value = true;
emit('ready');}} onLoading={($event?: any)=>{invoke(onLoading,$event);}} onSkinApplied={($event?: any)=>{invoke(onSkinApplied,$event);}} onSkinError={($event?: any)=>{emit('skin-error', $event);}} onEarthTelemetry={($event?: any)=>{emit('earth-telemetry', $event);}} onHandoffStart={($event?: any)=>{invoke(beginEarthHandoff,$event);}} onModeChange={($event?: any)=>{invoke(handleMapModeChange,$event);}} className={classNames("earth-renderer")} data-v-react-fuiearth=""></EarthChinaMap><section data-mode={mapMode.value} className={classNames("center-stage",{
    'is-earth-hud-hidden': !earthHudVisible.value || !props.showHud,
    'without-hud': !props.showHud,
})} style={styleObject({display:(mapMode.value === 'earth') ? undefined : 'none'},{ transform: `translate(-50%, -50%) scale(${scale.value})` })} data-v-react-fuiearth="">{props.earthPresentation !== 'surface' ? <svg viewBox="0 0 1020 975" aria-hidden="true" fill="none" className={classNames("reference-hud hologram-hud")} data-v-react-fuiearth=""><circle cx="510" cy="460" r="450" stroke={hudInk.value.ring} strokeWidth="1.0" opacity=".84" data-v-react-fuiearth=""></circle><circle cx="510" cy="460" r="488" stroke={hudInk.value.mark} strokeWidth=".80" opacity=".70" data-v-react-fuiearth=""></circle>{list(hologramTicks).map((tick) => (<path d={tick.path} stroke={hudInk.value.mark} strokeWidth={tick.major ? .95 : .60} opacity={tick.major ? .90 : .64} vectorEffect="non-scaling-stroke" key={tick.index} data-v-react-fuiearth=""></path>))}<g stroke={hudInk.value.mark} strokeWidth="2.1" strokeLinecap="round" className={classNames("hologram-hud-arcs")} data-v-react-fuiearth="">{list(hologramArcs).map((arc) => (<g key={arc} data-v-react-fuiearth=""><path d={arc} data-v-react-fuiearth=""></path><path d={arc} stroke="color-mix(in srgb, currentColor 34%, white)" strokeWidth=".65" opacity=".92" data-v-react-fuiearth=""></path></g>))}</g></svg> : activeSkin.value === 'original' ? <div aria-hidden="true" className={classNames("orbital-rings")} data-v-react-fuiearth="">{list(7).map((n) => (<i key={n} style={styleObject({ inset: `${n * 18}px` })} data-v-react-fuiearth=""></i>))}<span className={classNames("orbit-segments orbit-segments--outer")} data-v-react-fuiearth=""></span><span className={classNames("orbit-segments orbit-segments--middle")} data-v-react-fuiearth=""></span><span className={classNames("orbit-ticks")} data-v-react-fuiearth=""></span><span className={classNames("axis-bracket axis-bracket--north")} data-v-react-fuiearth=""></span><span className={classNames("axis-bracket axis-bracket--east")} data-v-react-fuiearth=""></span><span className={classNames("axis-bracket axis-bracket--south")} data-v-react-fuiearth=""></span><span className={classNames("axis-bracket axis-bracket--west")} data-v-react-fuiearth=""></span><span className={classNames("axis-cross")} data-v-react-fuiearth=""><b data-v-react-fuiearth=""></b></span></div> : <svg viewBox="0 0 1020 975" aria-hidden="true" className={classNames("reference-hud photographic-hud")} style={styleObject({ color: photographicHudColor.value })} data-v-react-fuiearth=""><g fill="none" stroke="currentColor" strokeWidth=".9" data-v-react-fuiearth=""><circle data-hud-role="fineRail" cx="510" cy="460" r="482" opacity=".22" strokeDasharray="1 4" data-v-react-fuiearth=""></circle><circle data-hud-role="ring" cx="510" cy="460" r="464" opacity=".65" data-v-react-fuiearth=""></circle><circle data-hud-role="rail" cx="510" cy="460" r="444" opacity=".24" data-v-react-fuiearth=""></circle><circle data-hud-role="innerRail" cx="510" cy="460" r="433" opacity=".15" data-v-react-fuiearth=""></circle>{list(photographicHudTicks).map((tick) => (<path data-hud-role={tick.major ? 'tickMajor' : 'tickMinor'} d={tick.path} opacity={tick.major ? .85 : .65} key={tick.index} data-v-react-fuiearth=""></path>))}{list(photographicHudSegments).map((segment) => (<path data-hud-role="outer" d={segment} opacity=".55" strokeWidth="1.2" key={segment} data-v-react-fuiearth=""></path>))}<g className={classNames("reference-hud-earth")} data-v-react-fuiearth="">{list(photographicHudMarks).map((mark) => (<path data-hud-role="mark" d={mark.path} opacity=".8" strokeWidth="1.2" key={mark.index} data-v-react-fuiearth=""></path>))}</g></g></svg>}{activeSkin.value === 'original' && props.earthPresentation === 'surface' ? <React.Fragment ><div aria-hidden="true" className={classNames("globe-reticle globe-reticle--left")} data-v-react-fuiearth=""><Crosshair size={18} strokeWidth={1.5} data-v-react-fuiearth=""></Crosshair></div><div aria-hidden="true" className={classNames("globe-reticle globe-reticle--right")} data-v-react-fuiearth=""><Crosshair size={18} strokeWidth={1.5} data-v-react-fuiearth=""></Crosshair></div></React.Fragment> : null}</section></div></>;
});
