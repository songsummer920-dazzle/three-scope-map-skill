<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
  FUI center-stage HUD extracted from the validated globe dashboard.
-->
<template>
  <div ref="host" class="fui-earth-host" :style="[skinStyle,{'--fui-earth-scale':scale}]" :data-skin="activeSkin" :data-ready="sceneReady" :data-scan-style="props.scanStyle" :data-mode="mapMode" :data-map-presentation="props.mapPresentation" :data-earth-presentation="props.earthPresentation">
    <svg v-if="activeSkin !== 'original' && mapMode === 'earth'" class="space-field" :viewBox="`0 0 ${hostSize.width} ${hostSize.height}`" aria-hidden="true">
      <defs><radialGradient :id="starGlowId"><stop :stop-color="starColor" stop-opacity=".2" /><stop offset="1" :stop-color="starColor" stop-opacity="0" /></radialGradient></defs>
      <g v-for="star in spaceStars" :key="star.index">
        <circle v-if="star.bright" :cx="star.x" :cy="star.y" r="4.5" :fill="`url(#${starGlowId})`" />
        <circle :cx="star.x" :cy="star.y" :r="star.bright ? .85 : .5" :fill="starColor" :opacity="star.opacity" />
      </g>
    </svg>
      <EarthChinaMap
        ref="earthChinaRef"
        class="earth-renderer"
        :initial-mode="props.initialMode"
        :earth-scale="scale"
        :skin="requestedSkin"
        :scan-style="props.scanStyle"
        :polar-style="props.polarStyle"
        :earth-presentation="props.earthPresentation"
        :map-presentation="resolvedMapLook.presentation"
        :map-surface="resolvedMapLook.surface"
        :map-wave-enabled="resolvedMapLook.waveEnabled"
        :initial-map-view="props.mapView"
        :quality="props.quality"
        @ready="sceneReady = true; emit('ready')"
        @loading="onLoading"
        @skin-applied="onSkinApplied"
        @skin-error="emit('skin-error',$event)"
        @earth-telemetry="emit('earth-telemetry', $event)"
        @handoff-start="beginEarthHandoff"
        @mode-change="handleMapModeChange"
      />
    <section
      v-show="mapMode === 'earth'"
      class="center-stage"
      :class="{
        'is-earth-hud-hidden': !earthHudVisible || !props.showHud,
        'without-hud': !props.showHud,
      }"
      :style="{ transform: `translate(-50%, -50%) scale(${scale})` }"
      :data-mode="mapMode"
    >
      <svg v-if="props.earthPresentation !== 'surface'" class="reference-hud hologram-hud" viewBox="0 0 1020 975" aria-hidden="true" fill="none">
        <circle cx="510" cy="460" r="450" :stroke="hudInk.ring" stroke-width="1.0" opacity=".84" />
        <circle cx="510" cy="460" r="488" :stroke="hudInk.mark" stroke-width=".80" opacity=".70" />
        <path v-for="tick in hologramTicks" :key="tick.index" :d="tick.path" :stroke="hudInk.mark" :stroke-width="tick.major ? .95 : .60" :opacity="tick.major ? .90 : .64" vector-effect="non-scaling-stroke" />
        <g class="hologram-hud-arcs" :stroke="hudInk.mark" stroke-width="2.1" stroke-linecap="round">
          <g v-for="arc in hologramArcs" :key="arc">
            <path :d="arc" />
            <path :d="arc" stroke="color-mix(in srgb, currentColor 34%, white)" stroke-width=".65" opacity=".92" />
          </g>
        </g>
      </svg>
      <div v-else-if="activeSkin === 'original'" class="orbital-rings" aria-hidden="true">
        <i v-for="n in 7" :key="n" :style="{ inset: `${n * 18}px` }" />
        <span class="orbit-segments orbit-segments--outer" />
        <span class="orbit-segments orbit-segments--middle" />
        <span class="orbit-ticks" />
        <span class="axis-bracket axis-bracket--north" />
        <span class="axis-bracket axis-bracket--east" />
        <span class="axis-bracket axis-bracket--south" />
        <span class="axis-bracket axis-bracket--west" />
        <span class="axis-cross"><b /></span>
      </div>
      <svg v-else class="reference-hud photographic-hud" viewBox="0 0 1020 975" aria-hidden="true" :style="{ color: photographicHudColor }">
        <g fill="none" stroke="currentColor" stroke-width=".9">
          <circle data-hud-role="fineRail" cx="510" cy="460" r="482" opacity=".22" stroke-dasharray="1 4" />
          <circle data-hud-role="ring" cx="510" cy="460" r="464" opacity=".65" />
          <circle data-hud-role="rail" cx="510" cy="460" r="444" opacity=".24" />
          <circle data-hud-role="innerRail" cx="510" cy="460" r="433" opacity=".15" />
          <path v-for="tick in photographicHudTicks" :key="tick.index" :data-hud-role="tick.major ? 'tickMajor' : 'tickMinor'" :d="tick.path" :opacity="tick.major ? .85 : .65" />
          <path v-for="segment in photographicHudSegments" :key="segment" data-hud-role="outer" :d="segment" opacity=".55" stroke-width="1.2" />
          <g class="reference-hud-earth">
            <path v-for="mark in photographicHudMarks" :key="mark.index" data-hud-role="mark" :d="mark.path" opacity=".8" stroke-width="1.2" />
          </g>
        </g>
      </svg>
      <template v-if="activeSkin === 'original' && props.earthPresentation === 'surface'">
        <div class="globe-reticle globe-reticle--left" aria-hidden="true"><Crosshair :size="18" :stroke-width="1.5" /></div>
        <div class="globe-reticle globe-reticle--right" aria-hidden="true"><Crosshair :size="18" :stroke-width="1.5" /></div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import type {FuiPolarStyle,FuiEarthLoading,FuiSkinFailure} from './fuiEarthLifecycle';
import type {FuiEarthPresentation} from './fuiEarthHologram';
import type {MapNavigationPath} from './mapNavigation';
import { Crosshair } from '@lucide/vue';
import EarthChinaMap from './EarthChinaMap.vue';
import { resolveFuiMapLook, type FuiMapPresentation } from './fuiMapPresentation';
import { FUI_THEME_PRIMARY_OVERRIDE, getFuiHudPalette, getFuiSkinStyle, getFuiThemePrimary, isFuiThemeColorId, resolveFuiEarthThemeId, type FuiEarthSkinId, type FuiEarthScanStyle } from './fuiEarthTheme';
import * as THREE from 'three';

type EarthTelemetryPayload = {
  longitude: number;
  latitude: number;
  heading: number;
  anchors: Record<string, { x: number; y: number; visible: boolean }>;
};

const props = withDefaults(defineProps<{ showHud?: boolean; skin?: FuiEarthSkinId; primaryColor?:string; alert?: boolean; scanStyle?: FuiEarthScanStyle; mapPresentation?: FuiMapPresentation; mapStyle?:'classic'|'terrain-glass'|'smooth-glass';mapWave?:'none'|'hex'|'grid';mapSurface?:'auto'|'terrain'|'hologram-glass';mapView?:'3d'|'2d'|'overlay';quality?:'high'|'balanced'|'low'|'auto';initialMode?: 'earth'|'china';polarStyle?:FuiPolarStyle;earthPresentation?:FuiEarthPresentation }>(), { showHud: true, skin: 'original', alert: false, scanStyle: 'ribbon', mapPresentation:'standard',mapSurface:'auto',mapView:'3d',quality:'high',initialMode:'earth',polarStyle:'natural',earthPresentation:'surface' });
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
const emit = defineEmits<{
  ready: [];
  loading:[state:FuiEarthLoading];
  'skin-applied':[skin:FuiEarthSkinId];
  'skin-error':[error:FuiSkinFailure];
  'earth-telemetry': [payload: EarthTelemetryPayload];
  'mode-change': [mode: 'earth' | 'china'];
  'handoff-start': [];
}>();
const host = ref<HTMLDivElement>();
const earthChinaRef=ref<{retry:()=>void;retrySkin:()=>void;replayEntrance:()=>void;enterChina:()=>void;returnToEarth:()=>void;syncNavigation:(path:MapNavigationPath)=>Promise<boolean>;getNavigation:()=>MapNavigationPath;getMapDiagnostics:()=>unknown;getDiagnostics:()=>unknown}>();
defineExpose({retry:()=>earthChinaRef.value?.retry(),retrySkin:()=>earthChinaRef.value?.retrySkin(),replayEntrance:()=>earthChinaRef.value?.replayEntrance(),enterChina:()=>earthChinaRef.value?.enterChina(),returnToEarth:()=>earthChinaRef.value?.returnToEarth(),syncNavigation:(path:MapNavigationPath)=>earthChinaRef.value?.syncNavigation(path)??Promise.resolve(false),getNavigation:()=>earthChinaRef.value?.getNavigation(),getMapDiagnostics:()=>earthChinaRef.value?.getMapDiagnostics(),getDiagnostics:()=>earthChinaRef.value?.getDiagnostics()});
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
</script>

<style scoped>
.fui-earth-host { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--fui-background, #111b26); color: #b8c8d7; font-family: 'Rajdhani', 'DIN Alternate', 'Arial Narrow', sans-serif; }
.center-stage {  position:absolute; left:50%; top:50%; transform-origin:center; z-index:1; width:1020px; height:975px; overflow:visible; background:transparent; pointer-events:none; }
.space-field { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.earth-renderer { position:absolute!important; inset:0!important; z-index:1!important; }
/* The renderer uses the complete host; its camera aligns to the HUD frame. */
.orbital-rings,.globe-reticle{transition:opacity .3s ease,visibility 0s linear 0s}
.center-stage.is-earth-hud-hidden .globe-reticle{opacity:0!important;visibility:hidden;transition:opacity .26s ease,visibility 0s linear .26s}
.orbital-rings { position:absolute; z-index:3; left:50%; top:0; width:920px; height:920px; transform:translateX(-50%); pointer-events:none; border-radius:50%; border:1px solid rgb(var(--fui-hud-rgb, 117 157 187) / .31); box-shadow:inset 0 0 70px rgb(var(--fui-hud-rgb, 117 157 187) / .07),0 0 0 20px rgb(var(--fui-hud-rgb, 117 157 187) / .035),0 0 0 48px rgb(var(--fui-hud-rgb, 117 157 187) / .018); }
.orbital-rings::before,.orbital-rings::after{content:'';position:absolute;z-index:2;left:50%;top:-24px;width:1px;height:calc(100% + 48px);background:linear-gradient(transparent 0,rgb(var(--fui-hud-rgb, 117 157 187) / .24) 8%,rgb(var(--fui-hud-rgb, 117 157 187) / .46) 17%,rgb(var(--fui-hud-rgb, 117 157 187) / .13) 42%,rgb(var(--fui-hud-rgb, 117 157 187) / .28) 50%,rgb(var(--fui-hud-rgb, 117 157 187) / .13) 58%,rgb(var(--fui-hud-rgb, 117 157 187) / .42) 83%,transparent 100%);box-shadow:12px 0 0 rgb(var(--fui-hud-rgb, 117 157 187) / .025),-12px 0 0 rgb(var(--fui-hud-rgb, 117 157 187) / .025)}.orbital-rings::after{transform:rotate(90deg)}
.orbital-rings>i { position:absolute;border-radius:50%;border:1px solid rgb(var(--fui-hud-rgb, 117 157 187) / .16);box-shadow:inset 0 0 16px rgb(var(--fui-hud-rgb, 117 157 187) / .025),0 0 9px rgb(var(--fui-hud-rgb, 117 157 187) / .018); }
.orbital-rings>i:nth-child(2),.orbital-rings>i:nth-child(5){border-style:dashed;border-color:rgb(var(--fui-hud-rgb, 117 157 187) / .23)}
.orbital-rings>i:nth-child(3),.orbital-rings>i:nth-child(7){border-style:dotted;border-color:rgb(var(--fui-hud-rgb, 117 157 187) / .21)}
.orbit-segments,.orbit-ticks{position:absolute;z-index:3;border-radius:50%;opacity:.72}
.orbit-segments{background:repeating-conic-gradient(from 3deg,rgb(var(--fui-hud-rgb, 117 157 187) / .55) 0 .7deg,transparent .7deg 5.8deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1.5px));animation:hud-orbit-drift 48s linear infinite}
.orbit-segments--outer{inset:-8px}.orbit-segments--middle{inset:46px;opacity:.48;animation-duration:68s;animation-direction:reverse}
.orbit-ticks{inset:25px;background:repeating-conic-gradient(from 1deg,rgb(var(--fui-hud-rgb, 117 157 187) / .42) 0 .34deg,transparent .34deg 2.2deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 9px),#000 calc(100% - 8px));mask:radial-gradient(farthest-side,transparent calc(100% - 9px),#000 calc(100% - 8px));opacity:.56}
.axis-cross{position:absolute;z-index:5;left:50%;top:50%;width:30px;height:30px;transform:translate(-50%,-50%);border:1px solid rgb(var(--fui-hud-rgb, 117 157 187) / .42);border-radius:50%;box-shadow:0 0 12px rgb(var(--fui-hud-rgb, 117 157 187) / .16)}
.axis-cross::before,.axis-cross::after{content:'';position:absolute;left:50%;top:50%;width:56px;height:1px;transform:translate(-50%,-50%);background:linear-gradient(90deg,transparent,rgb(var(--fui-hud-rgb, 117 157 187) / .58) 28%,transparent 29% 71%,rgb(var(--fui-hud-rgb, 117 157 187) / .58) 72%,transparent)}.axis-cross::after{transform:translate(-50%,-50%) rotate(90deg)}
.axis-cross b{position:absolute;left:50%;top:50%;width:4px;height:4px;transform:translate(-50%,-50%);border:1px solid rgb(var(--fui-hud-rgb, 117 157 187) / .78);border-radius:50%;box-shadow:0 0 7px rgb(var(--fui-hud-rgb, 117 157 187) / .55)}
.axis-bracket{position:absolute;z-index:5;width:22px;height:8px;border-top:2px solid rgb(var(--fui-hud-rgb, 117 157 187) / .52);border-left:5px solid transparent;border-right:5px solid transparent;filter:drop-shadow(0 0 3px rgb(var(--fui-hud-rgb, 117 157 187) / .24))}
.axis-bracket--north{left:50%;top:-4px;transform:translateX(-50%)}.axis-bracket--south{left:50%;bottom:-4px;transform:translateX(-50%) rotate(180deg)}.axis-bracket--east{right:-11px;top:50%;transform:translateY(-50%) rotate(90deg)}.axis-bracket--west{left:-11px;top:50%;transform:translateY(-50%) rotate(-90deg)}
.reference-hud { position:absolute; z-index:3; left:0; top:0; width:1020px; height:975px; overflow:visible; pointer-events:none; color:var(--fui-instrument-color, var(--earth-accent)); }
.reference-hud { transition:opacity .20s ease; }
.center-stage.is-earth-hud-hidden>.reference-hud,
.center-stage.is-earth-hud-hidden>.orbital-rings { opacity:0; visibility:hidden; transition:opacity .20s ease,visibility 0s linear .20s; }
.center-stage.is-earth-hud-hidden .reference-hud-earth { opacity:0; }
.center-stage.without-hud .reference-hud { display:none; }
/* The geographic renderer has no HUD-shaped mask: zoom may cross the instrument. */
@keyframes hud-orbit-drift{to{transform:rotate(360deg)}}
.globe-reticle { position:absolute;z-index:5;color:var(--earth-accent);font-size:17px;text-shadow:0 0 8px rgb(var(--fui-hud-rgb, 117 157 187) / .7)}.globe-reticle--left{left:199px;top:469px}.globe-reticle--right{right:198px;top:464px}
.center-stage.without-hud .orbital-rings { display: none; }
.globe-reticle { pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .orbit-segments { animation: none; } }
</style>

<style scoped>
.hologram-hud-arcs{transform-origin:510px 460px;animation:hologram-hud-orbit 100s linear infinite;filter:drop-shadow(0 0 2px currentColor)}
@keyframes hologram-hud-orbit{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.hologram-hud-arcs{animation:none}}
</style>
