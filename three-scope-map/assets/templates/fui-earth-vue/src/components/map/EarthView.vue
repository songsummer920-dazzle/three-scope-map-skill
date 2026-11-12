<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
  Legacy visual baseline with restrained motion refinement.
-->

<template>
  <div
    ref="host"
    class="earth-view"
    :data-earth-presentation="props.earthPresentation"
    :class="{ 'is-transitioning': isTransitioning }"
    :style="[earthThemeStyle,{'--earth-dive-duration':`${FUI_EARTH_FLIGHT_DURATION}s`}]"
  >
    <FuiSceneLoader v-if="loadPhase==='loading'||loadPhase==='warming'||loadPhase==='error'" :label="loadPhase==='warming'?'正在准备地球光影':'正在加载地球'" :error="loadPhase==='error'" error-label="地球加载失败，请重试" retryable @retry="emit('retry')" />
    <div v-if="skinFailure" class="earth-resource-notice" role="alert"><span>皮肤加载失败，已保留当前效果</span><button type="button" @click="retrySkin">重试皮肤</button><button type="button" aria-label="关闭皮肤加载提示" @click="skinFailure=undefined">关闭</button></div>
    <div class="earth-backdrop" aria-hidden="true" />
    <div class="dive-atmosphere" aria-hidden="true" />
    <div v-if="!isHologram" class="dive-cloudscape" aria-hidden="true">
      <div class="cloud-bank cloud-bank--far" />
      <div class="cloud-bank cloud-bank--left" />
      <div class="cloud-bank cloud-bank--right" />
      <div class="cloud-bank cloud-bank--near-left" />
      <div class="cloud-bank cloud-bank--near-right" />
      <div class="dive-cloud-texture" />
    </div>
    <div v-if="!isHologram" class="dive-cloud-haze" aria-hidden="true" />
    <div class="dive-vignette" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {browserMapQualityBudget,type MapQuality} from './mapQuality';
import {FuiRendererJobs} from './fuiRendererJobs';
import {supportsFuiGlassHalfFloat,fuiGlassFramebufferComplete} from './fuiGlassCapabilities';
import {createFuiEarthHologram,type FuiEarthPresentation} from './fuiEarthHologram';
import {createFuiMapGlassEnvironment} from './fuiMapGlass';
import FuiSceneLoader from './FuiSceneLoader.vue';
import {EarthResources,earthFamily,requiredEarthResources,FUI_EARTH_IMAGE_LOADER} from './fuiEarthResources';
import {EarthTimeline,LatestEarthRequest,type FuiEarthPhase,type FuiEarthLoading,type FuiPolarStyle,type FuiSkinFailure} from './fuiEarthLifecycle';
import { gsap } from 'gsap';
import {FUI_EARTH_FLIGHT_DURATION} from './fuiMapEntrance';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import chinaGeoJson from '../../assets/maps/china.json';
// Original world.earth-render.json remains the source of the verified binary caches.
import worldOutlinesUrl from '../../assets/maps/earth-geography/world-outlines.f32.gz?url';
import hologramMaskUrl from '../../assets/maps/earth-geography/hologram-mask.rgba.gz?url';
import earthGeographyCache from '../../assets/maps/earth-geography/earth-geography-cache.json';
import {loadEarthGeography,type PreparedEarthGeography} from './fuiEarthGeography';
// Cropped 70–140°E / 15–55°N from NASA BMNG topography (0–6400 m scale).
// https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/
import chinaHeightUrl from '../../assets/textures/map/china/china-height-legacy.png';
import chinaNormalUrl from '../../assets/textures/map/china/china-normal-legacy.png';
import chinaInnerGlowUrl from '../../assets/textures/map/china/earth-china-inner-glow.png';
import chinaGlassEdgesUrl from '../../assets/textures/map/china/earth-china-glass-edges.png';
import chinaEarthCache from '../../assets/textures/map/china/earth-china-cache.json';
import earthDayUrl from '../../assets/textures/map/world/earth-day.jpg';
import earthReliefUrl from '../../assets/textures/map/world/earth-relief.png';
import earthPhotographicReliefUrl from '../../assets/textures/map/world/earth-relief-photographic.jpg';
import earthPhotographicUrl from '../../assets/textures/map/world/earth-photographic.jpg';
import earthCloudsUrl from '../../assets/textures/map/world/earth-clouds.jpg';
import earthNormalUrl from '../../assets/textures/map/world/earth-normal.jpg';
import earthSpecularUrl from '../../assets/textures/map/world/earth-specular.jpg';
import earthLightsUrl from '../../assets/textures/map/world/earth-lights.png';
import earthNightDetailUrl from '../../assets/textures/map/world/earth-night-detail.png';
import type { GeoFeatureCollection, Position } from '../../types/geo';
import {
  MAP_THEME_PRIMARY,
  deriveThemeHsl,
  isLegacyMapThemePrimary,
} from './mapTheme';

import { createFuiEarthTheme, FUI_REFERENCE_LIGHTING, getFuiSkinMaterial, type FuiEarthSkinId, type FuiEarthScanStyle } from './fuiEarthTheme';
import {applyFuiPhotographicTheme,getFuiPhotographicMaterial,FUI_ENTITY_VISUAL_BASELINE} from './fuiPhotographicOptics';
import {photographicWorldMain,photographicChinaMain,photographicAtmosphereMain} from './fuiPhotographicShaders';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

const emit = defineEmits<{
  'scene-ready': [];
  'first-visible': [];
  'intro-complete': [];
  loading:[state:FuiEarthLoading];
  'skin-applied':[skin:FuiEarthSkinId];
  'skin-error':[error:FuiSkinFailure];
  retry:[];
  'intro-ready': [];
  'handoff-start': [];
  'enter-china': [];
  telemetry: [payload: EarthTelemetryPayload];
}>();

const props = withDefaults(defineProps<{
  startIntro?: boolean;
  frameScale?: number;
  active?: boolean;
  skin?: FuiEarthSkinId;
  scanStyle?: FuiEarthScanStyle;
  polarStyle?:FuiPolarStyle;
  earthPresentation?:FuiEarthPresentation;
  quality?:MapQuality;
  beforeEnterChina?:()=>Promise<boolean>;
}>(), {
  startIntro: true,
  active: true,
  skin: 'original',
  scanStyle: 'ribbon',
  polarStyle:'natural',
  earthPresentation:'surface',
  quality:'high',
});
const earthPixelRatio=()=>Math.min(window.devicePixelRatio,browserMapQualityBudget(props.quality).earthPixelRatio);

const isHologram=props.earthPresentation!=='surface';
let hologram:ReturnType<typeof createFuiEarthHologram>|undefined;
let hologramEnvironment:THREE.WebGLRenderTarget|undefined;
let hologramNeutralEnvironment:THREE.DataTexture|undefined;
let earthHalfFloat=true;
// Valid black CubeUV storage keeps the original glass sampler/shader intact
// when PMREM's half-float targets cannot be rendered on this device.
function neutralHologramEnvironment(){
  if(!hologramNeutralEnvironment){
    const width=384,height=512,pixels=new Uint8Array(width*height*4);
    for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
    const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat,THREE.UnsignedByteType);
    texture.name='fui-earth-ldr-neutral-environment';texture.mapping=THREE.CubeUVReflectionMapping;
    texture.colorSpace=THREE.LinearSRGBColorSpace;texture.minFilter=texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=false;texture.flipY=false;texture.needsUpdate=true;hologramNeutralEnvironment=texture;
  }
  return hologramNeutralEnvironment;
}
const geographyAbort=new AbortController();
let preparedGeography:PreparedEarthGeography|undefined;
type PolygonRings = Position[][];

type EarthTelemetryAnchor = {
  x: number;
  y: number;
  visible: boolean;
};

type EarthTelemetryPayload = {
  longitude: number;
  latitude: number;
  heading: number;
  anchors: Record<string, EarthTelemetryAnchor>;
};

const chinaBoundaryBounds = {
  minLon: 70,
  maxLon: 140,
  minLat: 15,
  maxLat: 55,
};
let chinaOuterRingsCache: Position[][] | undefined = chinaEarthCache.outerRings as Position[][];
let taiwanMainRingCache: Position[] | undefined;

const linearLightEnergy=(color:THREE.Color)=>color.r*.2126+color.g*.7152+color.b*.0722;
function themeForPresentation(skin:FuiEarthSkinId){
  const theme=createFuiEarthTheme(skin);
  if(!isHologram&&skin!=='original')applyFuiPhotographicTheme(theme,skin);
  if(isHologram&&skin!=='original'){
    // Holographic emitters color the same atmospheric fill at the existing
    // energy. Keep the original optical equations and all surface inputs.
    const energy=linearLightEnergy(theme.atmosphereFill);
    theme.atmosphereFill.copy(theme.atmosphere).multiplyScalar(energy/Math.max(linearLightEnergy(theme.atmosphere),.00001));
  }
  return theme;
}
const earthTheme = themeForPresentation(props.skin);
// Scan-only colors share the entity palette; hologram pigments and air stay intact.
function scanThemeForPresentation(skin:FuiEarthSkinId){
  const theme=createFuiEarthTheme(skin);
  applyFuiPhotographicTheme(theme,skin);
  return theme;
}
const scanTheme=scanThemeForPresentation(props.skin);
const materialForPresentation=(skin:FuiEarthSkinId)=>isHologram?getFuiSkinMaterial(skin):getFuiPhotographicMaterial(skin);
// Reuse the classic floating sweep shell at one strength for every entity hue.
// Its opacity is independent of the photographic ground-response scan gain.
const sweepStrengthForPresentation=(skin:FuiEarthSkinId)=>isHologram||skin!=='original'?.16:.137*materialForPresentation(skin).scanGain;
const skinMaterial = materialForPresentation(props.skin);
const skinUniforms = {
  uHoneycombMode: { value: props.scanStyle === 'honeycomb' ? 1 : 0 },
  uHoneycombColor: { value: earthTheme.sweep },
  uSkinRoughness: { value: skinMaterial.roughness },
  uSkinMetalness: { value: skinMaterial.metalness },
  uSkinSurfaceGain: { value: skinMaterial.surfaceGain },
  uSkinAlbedoTint: { value: skinMaterial.albedoTint },
  uSkinOceanShininess: { value: skinMaterial.oceanShininess },
  uSkinOceanReflection: { value: skinMaterial.oceanReflection },
  uSkinOceanDarken: { value: skinMaterial.oceanDarken },
  uSkinCityGain: { value: skinMaterial.cityGain },
  uSkinScanGain: { value: skinMaterial.scanGain },
  uSkinEdgeGain: { value: skinMaterial.edgeGain },
  uSkinEnvironmentGain: { value: skinMaterial.environmentGain },
  uSkinAtmosphereGain: { value: skinMaterial.atmosphereGain },
  uSkinReliefContrast: { value: skinMaterial.reliefContrast },
  uSkinInnerGlowGain: { value: skinMaterial.innerGlowGain },
  uSkinPolarGain: { value: skinMaterial.polarGain },
  uPolarEnhancement:{value:props.polarStyle==='enhanced'?1:0},
  uSkinWorldGain: { value: skinMaterial.worldGain },
  uSkinOceanBase: { value: skinMaterial.oceanBase },
  uSkinChinaAmbient: { value: skinMaterial.chinaAmbient },
  uSkinPolarTint: { value: earthTheme.polarTint },
  uSkinRimColor: { value: earthTheme.atmosphere },
  uSkinFillColor: { value: earthTheme.atmosphereFill },
  uSkinRimCore: { value: earthTheme.rimCore },
  uSkinReference: { value: props.skin === 'original' ? 0 : 1 },
  uSkinFlightPrecision: { value: props.skin === 'original' ? 0 : 1 },
};
const themeCss = () => ({
  '--earth-background': earthTheme.css.background,
  '--earth-ambient': earthTheme.css.ambient,
  '--earth-grid': earthTheme.css.grid,
  '--earth-cloud-shadow': earthTheme.css.cloudShadow,
  '--earth-cloud-body': earthTheme.css.cloudBody,
  '--earth-cloud-mid': earthTheme.css.cloudMid,
  '--earth-cloud-light': earthTheme.css.cloudLight,
  '--earth-cloud-glow': earthTheme.css.cloudGlow,
});
const earthThemeStyle = ref(themeCss());

const host = ref<HTMLElement>();
const isTransitioning = ref(false);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const chinaCenter = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();

let renderer: THREE.WebGLRenderer | undefined;
let composer: EffectComposer | undefined;
let bloomPass: UnrealBloomPass | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let controls: OrbitControls | undefined;
let resizeObserver: ResizeObserver | undefined;
let raf = 0;
let spinGroup: THREE.Group | undefined;
let idleDriftGroup: THREE.Group | undefined;
let globeOrientation: THREE.Group | undefined;
let chinaIntroPivot: THREE.Group | undefined;
let chinaMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;
let chinaOutlineGroup: THREE.Group | undefined;
let chinaExtrusionGroup: THREE.Group | undefined;
let transitionTimeline: gsap.core.Timeline | undefined;
let hoverTarget = 0;
let hoverValue = 0;
let flowProgress = 0;
let pointerInside = false;
let controlsInteracting = false;
let idleMotionValue = 1;
let pointerParallaxYaw = 0;
let pointerParallaxPitch = 0;
let introValue = 0;
let requestIntroStart: (() => void) | undefined;
let hasEmittedIntroReady = false;
let animationElapsed = 0;
let lastTelemetryEmit = -Infinity;

type FlyNodePulse = {
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  startOffset: number;
  cycleDuration: number;
};

type ChinaBottomEdge = {
  line: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  startScale: number;
};

type StarLayer = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  baseOpacity: number;
  rotationDuration: number;
  rotationDirection: number;
  twinkleDuration: number;
  twinkleStrength: number;
  phase: number;
};

const animatedMaterials: THREE.ShaderMaterial[] = [];
const fadeMaterials: THREE.Material[] = [];
const rendererJobs=new FuiRendererJobs();
let earthResources:EarthResources|undefined;
const imageLoader=inject(FUI_EARTH_IMAGE_LOADER,undefined);
const loadPhase=ref<FuiEarthPhase>('loading');
const skinFailure=ref<FuiSkinFailure>();
const skinSwitching=ref(false);
const skinRequest=new LatestEarthRequest<FuiEarthSkinId>();
const timeline=new EarthTimeline();
let animationPrepared=false,disposed=false,skinVersion=0;
let releasePreparation:()=>void;
const preparationReady=new Promise<void>(resolve=>{releasePreparation=resolve;});
function setPhase(phase:FuiEarthPhase){loadPhase.value=phase;if(host.value)host.value.dataset.loadPhase=phase;emit('loading',{phase,switching:skinSwitching.value});}
function failInitial(error:unknown){if(disposed||loadPhase.value==='error')return;geographyAbort.abort(error);setPhase('error');cancelAnimationFrame(raf);raf=0;if(host.value)host.value.dataset.loadError=String(error);}
let renderedEarthSkin:FuiEarthSkinId=props.skin;
const flyNodePulses: FlyNodePulse[] = [];
const starMaterials: THREE.PointsMaterial[] = [];
const starLayers: StarLayer[] = [];
const flyNodeCoreMaterials: THREE.MeshBasicMaterial[] = [];
const flyTrackMaterials: THREE.MeshBasicMaterial[] = [];
const chinaRevealMaterials: THREE.Material[] = [];
const chinaBottomEdges: ChinaBottomEdge[] = [];
const bottomEdgeBaseColor = earthTheme.bottomEdge.clone();
const bottomEdgeActiveColor = earthTheme.highlight.clone();
const baseLightDirection = new THREE.Vector3(-0.68, 0.62, 0.31).normalize();
const animatedLightDirection = baseLightDirection.clone();
const animatedChinaLightDirection = baseLightDirection.clone();
const introLightDirection = new THREE.Vector3(0.22, -0.08, -0.97).normalize();
const targetLightDirection = new THREE.Vector3();
const baseSweepAxis = new THREE.Vector3(-0.12, 0.84, 0.52).normalize();
const animatedSweepAxis = baseSweepAxis.clone();
const cameraViewDirection = new THREE.Vector3();
const cameraRightDirection = new THREE.Vector3();
const cameraUpDirection = new THREE.Vector3();
const telemetryGlobeCenter = new THREE.Vector3();
const telemetryLocalView = new THREE.Vector3();
const telemetryLocalNorth = new THREE.Vector3();
const telemetryWorldNorth = new THREE.Vector3();
const telemetryWorldPoint = new THREE.Vector3();
const telemetryWorldNormal = new THREE.Vector3();
const telemetryViewToCamera = new THREE.Vector3();
const telemetryProjectedPoint = new THREE.Vector3();
const telemetryWorldQuaternion = new THREE.Quaternion();
const telemetryInverseQuaternion = new THREE.Quaternion();
const telemetryRegions = [
  { key: 'north-america', lon: -100, lat: 40 },
  { key: 'south-america', lon: -60, lat: -15 },
  { key: 'europe', lon: 15, lat: 50 },
  { key: 'asia', lon: 100, lat: 35 },
  { key: 'africa', lon: 20, lat: 5 },
] as const;
const chinaPivotDirection = lonLatToVector3(103.6, 35.2, 1).normalize();
const chinaPivotStartPosition = chinaPivotDirection.clone().multiplyScalar(2.025);
const chinaPivotFinalPosition = chinaPivotDirection.clone().multiplyScalar(2.052);
const chinaPivotAnimatedPosition = new THREE.Vector3();
const fullTurn = Math.PI * 2;
const motionCycleDuration = 10.5;
const scanTravelDuration = 7.4;
const flyTravelDuration = 5.2;
const introDuration = 4.2;
const flyLaunchOffset = introDuration * 0.69;

const flyLineVertexShader = /* glsl */ `
  attribute float aProgress;
  uniform float uSkinFlightPrecision;
  varying float vProgress;

  void main() {
    vProgress = aProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position - normal * 0.0058 * 0.3 * uSkinFlightPrecision, 1.0);
  }
`;

const flyLineFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uStartOffset;
  uniform float uCycleDuration;
  uniform float uTravelDuration;
  uniform float uArrivalFadeDuration;
  uniform float uNetworkReveal;
  uniform float uIdleCurrentStrength;
  uniform float uSkinFlightPrecision;
  uniform vec3 uTrailColor;
  uniform vec3 uHeadColor;
  varying float vProgress;

  void main() {
    float localTime = mod(uTime - uStartOffset + uCycleDuration, uCycleDuration);
    float flightVisibility = 1.0 - smoothstep(
      uTravelDuration,
      uTravelDuration + uArrivalFadeDuration,
      localTime
    );
    float travel = smoothstep(0.0, 1.0, clamp(localTime / uTravelDuration, 0.0, 1.0));
    float behindHead = travel - vProgress;
    float validTrail = step(0.0, behindHead);
    float tail = (1.0 - smoothstep(0.012, mix(0.21, 0.085, uSkinFlightPrecision), behindHead)) * validTrail;
    float head = 1.0 - smoothstep(0.0, mix(0.032, 0.014, uSkinFlightPrecision), abs(vProgress - travel));
    float idleTravel = fract(uTime / (uCycleDuration * 0.82));
    float idleDistance = abs(vProgress - idleTravel);
    idleDistance = min(idleDistance, 1.0 - idleDistance);
    float idleCurrent = exp(-pow(idleDistance / 0.052, 2.0))
      * uIdleCurrentStrength;
    float basePath = 0.016;
    float photographic = ${isHologram ? '0.0' : 'uSkinFlightPrecision'};
    float flightAlpha = (basePath + tail * mix(mix(.56,.35,uSkinFlightPrecision),.56,photographic)
      + head * mix(mix(.72,.44,uSkinFlightPrecision),.72,photographic)) * flightVisibility;
    float hubAttenuation = mix(1.0, 0.06 + 0.94 * smoothstep(0.0, 0.16, vProgress), uSkinFlightPrecision);
    float alpha = (flightAlpha + idleCurrent) * uFade * uNetworkReveal * hubAttenuation
      * mix(1.0,mix(.30,.64,photographic),uSkinFlightPrecision);
    if (alpha < 0.004) discard;
    vec3 color = mix(
      uTrailColor,
      uHeadColor,
      clamp(head + tail * 0.3 + idleCurrent * 0.16, 0.0, 1.0)
    );
    color *= 1.0 + head * 0.17;
    gl_FragColor = vec4(color, alpha);
  }
`;

const earthVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldRadial;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  varying vec3 vViewDirection;

  void main() {
    vUv = uv;
    vec3 radial = normalize(position);
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), radial) + vec3(0.00001, 0.0, 0.0));
    vec3 north = normalize(cross(radial, east));
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldRadial = normalize(mat3(modelMatrix) * radial);
    vWorldEast = normalize(mat3(modelMatrix) * east);
    vWorldNorth = normalize(mat3(modelMatrix) * north);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// Shared physical lighting for the new world and focus surfaces. All relief
// comes from the same geographic DEM; satellite brightness is only micro-albedo.
// Sixteen midpoint samples resolve the compact optical density without a
// blurred shoulder. Surface and shell share one continuous radiance profile.
const referenceAtmosphereOptics = /* glsl */ `
  const float referenceSurfaceColorMix = ${FUI_REFERENCE_LIGHTING.surfaceColorMix.toFixed(4)};
  const float referenceEnvironmentColorMix = ${FUI_REFERENCE_LIGHTING.environmentColorMix.toFixed(4)};
  const float referenceWaterColorMix = ${FUI_REFERENCE_LIGHTING.waterColorMix.toFixed(4)};
  const float referenceCloudColorMix = ${FUI_REFERENCE_LIGHTING.cloudColorMix.toFixed(4)};
  // Hue exchange is bounded and preserves the neutral lighting's luminance.
  // All skins share this function, with no additional colored energy layered on.
  vec3 referenceColorReflection(vec3 neutralLight, vec3 pigment, float weight) {
    const vec3 luminance = vec3(.2126,.7152,.0722);
    float energy = dot(neutralLight,luminance);
    vec3 coloredLight = pigment*energy/max(dot(pigment,luminance),.0001);
    return mix(neutralLight,coloredLight,clamp(weight,0.0,1.0));
  }
  vec2 referenceOpticalDepth(vec3 point, vec3 direction, float distance) {
    float stepLength = max(distance,0.0)/16.0;
    vec2 opticalDepth = vec2(0.0);
    for(int sampleIndex=0; sampleIndex<16; sampleIndex++) {
      vec3 samplePoint = point + direction*((float(sampleIndex)+.5)*stepLength);
      float height = max(length(samplePoint)-2.0,0.0);
      opticalDepth += exp(-height/vec2(.011,.0026))*stepLength;
    }
    return opticalDepth;
  }
  vec3 referenceAirRadiance(vec2 opticalDepth, vec3 radial, vec3 scatterColor,
    vec3 fillColor, vec3 coreColor, float keyGain, float environmentGain) {
    float key = pow(max(dot(radial,normalize(vec3(-.76,.65,0.0))),0.0),3.0);
    float environment = .46 + .85*pow(max(dot(radial,normalize(vec3(-.82,-.57,0.0))),0.0),3.0)
      + .22*max(-radial.y,0.0) + .16*max(radial.y,0.0);
    float environmentDepth = opticalDepth.x*1.82*environment*environmentGain;
    float keyDepth = opticalDepth.x*5.66*key*keyGain;
    float denseKeyDepth = opticalDepth.y*10.52*key*keyGain;
    // Colored scattering remains visible around the dark limb. Match the
    // neutral fill's energy before tinting, rather than adding a white haze.
    const vec3 luminance = vec3(.2126,.7152,.0722);
    vec3 coloredFill = scatterColor * dot(fillColor,luminance)
      / max(dot(scatterColor,luminance),.001);
    vec3 environmentColor = mix(fillColor,coloredFill,referenceEnvironmentColorMix);
    // Only the small strongest-key sector approaches the pale hot core;
    // the rest of the bright shoulder retains the skin's chromatic pigment.
    float hotCore = pow(key,4.0);
    vec3 denseColor = mix(scatterColor,coreColor,.10+.45*hotCore);
    return environmentColor*.82*(1.0-exp(-environmentDepth))
      + scatterColor*1.15*(1.0-exp(-keyDepth))
      + denseColor*.65*(1.0-exp(-denseKeyDepth));
  }
`;

const referenceTerrainLighting = /* glsl */ `
  ${referenceAtmosphereOptics}
  vec3 referenceTerrain(vec2 uv, vec3 radial, vec3 east, vec3 north,
    vec3 viewDirection, vec3 baseColor, vec3 ridgeColor, float focus) {
    // Filter the normal field at the footprint of a range, rather than treating
    // every DEM derivative as an independently polished, sparkling facet.
    vec2 normalStep = vec2(.85/4096.0,.85/2048.0);
    vec4 relief = texture2D(uReliefMap, uv)*.44
      + (texture2D(uReliefMap,uv+vec2(normalStep.x,0.))
      + texture2D(uReliefMap,uv-vec2(normalStep.x,0.))
      + texture2D(uReliefMap,uv+vec2(0.,normalStep.y))
      + texture2D(uReliefMap,uv-vec2(0.,normalStep.y)))*.14;
    vec2 slope = relief.rg * 2.0 - 1.0;
    vec3 tangent = normalize(vec3(slope*.60, sqrt(max(1.0-dot(slope,slope),.06))));
    // World and China use the same geographic normal. The former regional
    // override produced broad unrelated lumps at the administrative boundary.
    vec3 normal = normalize(east*tangent.x + north*tangent.y + radial*tangent.z);
    vec3 key = normalize(vec3(-.68,.58,.55));
    vec3 sky = normalize(vec3(.40,.48,.78));
    float macroSun = max(dot(radial,key),0.0);
    float sun = max(dot(normal,key),0.0);
    float skyLight = max(dot(normal,sky),0.0);
    float elevation = relief.b;
    float curvature = relief.a*2.0-1.0;
    vec2 pixel = vec2(1.5/4096.0,1.5/2048.0);
    float hMean = (texture2D(uReliefMap,uv+vec2(pixel.x,0.)).b
      + texture2D(uReliefMap,uv-vec2(pixel.x,0.)).b
      + texture2D(uReliefMap,uv+vec2(0.,pixel.y)).b
      + texture2D(uReliefMap,uv-vec2(0.,pixel.y)).b)*.25;
    float rangeCavity = clamp((elevation-hMean)*12.0+curvature*1.4,-.32,.22);
    float occlusion = clamp(1.0+rangeCavity,.68,1.10);
    float photograph = dot(texture2D(uPhotographicMap,uv).rgb,vec3(.299,.587,.114));
    vec2 dt = vec2(.0010,.0020);
    float photoMean = dot((texture2D(uPhotographicMap,uv+vec2(dt.x,0.)).rgb
      + texture2D(uPhotographicMap,uv-vec2(dt.x,0.)).rgb
      + texture2D(uPhotographicMap,uv+vec2(0.,dt.y)).rgb
      + texture2D(uPhotographicMap,uv-vec2(0.,dt.y)).rgb)*.25,vec3(.299,.587,.114));
    float microAlbedo = mix(1.0,clamp(photograph/max(photoMean,.018),.70,1.38),.26);
    float west = pow(max(dot(radial,normalize(vec3(-.90,.08,.43))),0.0),2.0);
    float albedo = (.070+elevation*.15)*(.65+sqrt(max(photograph,.0001))*.55);
    albedo *= .90+west*.40;
    float diffuse = .10+pow(sun,1.50)*1.45+skyLight*.18;
    vec3 mineral = mix(baseColor,ridgeColor,smoothstep(.08,.72,elevation)*.34);
    vec3 terrain = mineral*albedo*diffuse*occlusion*microAlbedo;
    float exposed = max(sun-macroSun,0.0);
    terrain += ridgeColor*pow(exposed,1.3)*(.025+elevation*.060)*occlusion;
    terrain += ridgeColor*max(curvature,0.0)*macroSun*.025;
    float broadReflection = pow(max(dot(normal,normalize(key+viewDirection)),0.0),64.0);
    terrain += ridgeColor*broadReflection*.010*smoothstep(.06,.50,elevation)*occlusion;
    // A real surface-light response, separate from atmospheric radiance.
    // The same upper-left azimuth reaches into the visible hemisphere. DEM
    // normals, occlusion and photographic albedo keep valleys dark while
    // exposed slopes catch the colored key. Grazing is a broad shoulder,
    // not a screen-space emissive line painted over terrain.
    vec3 coloredKey = normalize(vec3(-.76,.65,.28));
    float localKey = max(dot(normal,coloredKey),0.0);
    float macroKey = max(dot(radial,coloredKey),0.0);
    float keyFacing = pow(localKey,1.8);
    float slopeCatch = .30 + 1.10*smoothstep(0.0,.16,max(localKey-macroKey,0.0));
    float keyVisibility = smoothstep(-.04,.20,dot(radial,coloredKey));
    float surfaceShoulder = pow(1.0-max(dot(radial,viewDirection),0.0),.75);
    float colorWeight = referenceSurfaceColorMix * keyFacing * keyVisibility
      * (0.20+surfaceShoulder*.80) * clamp(slopeCatch,0.0,1.0);
    terrain = referenceColorReflection(terrain,uSkinRimColor,colorWeight);
    // Curved indirect illumination reaches the entire sphere without flattening
    // the land into a constant ambient plate or a bright horizon stripe.
    float skyHemisphere = .68+.32*smoothstep(-.70,.70,radial.y);
    terrain *= skyHemisphere;
    return terrain;
  }

  // Projected distance from the physical limb, in world units. The same
  // continuous radiance profile wraps onto sea, terrain and the China surface.
  vec3 referenceAerial(vec3 surface, vec3 radial, vec3 viewDirection,
    vec3 scatterColor, vec3 fillColor, vec3 coreColor, float gain, float environmentGain) {
    vec3 point = radial*2.0;
    float alongView = dot(point,viewDirection);
    float distance = -alongView + sqrt(max(alongView*alongView+2.09*2.09-4.0,0.0));
    vec2 opticalDepth = referenceOpticalDepth(point,viewDirection,distance);
    return surface*exp(-opticalDepth.x*.7)
      + referenceAirRadiance(opticalDepth,radial,scatterColor,fillColor,coreColor,gain,environmentGain);
  }
`;

// Reuse the existing surface-to-shell radiance function verbatim. The
// hologram supplies emitters, while all presentations share this optical path.
const hologramAerialShader = referenceTerrainLighting.slice(
  referenceTerrainLighting.indexOf('  // Projected distance from the physical limb'),
);

const honeycombScanShader = /* glsl */ `
  vec3 honeycombScan(vec2 uv, vec3 radial, vec3 east, vec3 north,
    vec3 scanAxis, float progress) {
    const float PI = 3.141592653589793;
    float lon = (uv.x-.5)*2.0*PI;
    float lat = (uv.y-.5)*PI;
    vec3 geo = vec3(cos(lat)*cos(lon),sin(lat),-cos(lat)*sin(lon));
    vec3 geoEast = vec3(-sin(lon),0.0,-cos(lon));
    vec3 geoNorth = cross(geo,geoEast);
    // Shared geographic tangent frame centered on the visible Asian hemisphere.
    const vec3 anchor = vec3(-.224143868,.5,-.836516304);
    const vec3 anchorEast = vec3(-.965925826,0.0,.258819045);
    const vec3 anchorNorth = vec3(.129409523,.866025404,.482962913);
    vec2 projected = 2.0*vec2(dot(geo,anchorEast),dot(geo,anchorNorth))
      / max(1.0+dot(geo,anchor),.12);
    const float density = 20.0;
    vec2 p = projected*density;
    const vec2 lattice = vec2(1.0,1.732050808);
    vec2 a = mod(p,lattice)-.5*lattice;
    vec2 b = mod(p-.5*lattice,lattice)-.5*lattice;
    vec2 local = dot(a,a)<dot(b,b) ? a : b;
    vec2 cell = p-local;
    float borderDistance = .5-max(abs(local.x),dot(abs(local),vec2(.5,.866025404)));
    float aa = max(fwidth(borderDistance),.004);
    float wire = 1.0-smoothstep(.006,.006+aa,borderDistance);
    float inset = exp(-max(borderDistance,0.0)/.085);
    vec2 center = cell/density;
    float radius2 = dot(center,center);
    vec3 cellGeo = (anchor*(4.0-radius2)
      +4.0*(anchorEast*center.x+anchorNorth*center.y))/(4.0+radius2);
    vec3 cellWorld = normalize(radial*dot(cellGeo,geo)
      +east*dot(cellGeo,geoEast)+north*dot(cellGeo,geoNorth));
    float delta = dot(cellWorld,scanAxis)*.5+.5-(1.12-progress*1.24);
    // A compact light band reveals nearby cells beneath the broad soft sweep.
    // Fade its tail at the surface position, keeping the last row continuous.
    float wireDelta = dot(radial,scanAxis)*.5+.5-(1.12-progress*1.24);
    float tailFade = 1.0-smoothstep(.055,.10,wireDelta);
    float arrival = smoothstep(-.022,.018,delta);
    float front = exp(-pow(delta/.022,2.0));
    float trail = arrival*exp(-max(delta,0.0)/.050)*tailFade;
    float wireFront = exp(-pow(wireDelta/.022,2.0));
    float wireTrail = smoothstep(-.022,.018,wireDelta)
      * exp(-max(wireDelta,0.0)/.050)*tailFade;
    float visible = (1.0-smoothstep(.94,1.0,progress))
      * smoothstep(.0,.035,progress);
    float cellTone = .82+.18*fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
    return vec3(wire*(wireTrail*.54+wireFront*.70),
      (trail*.085+front*.025)*cellTone+inset*trail*.055,trail)*visible;
  }
`;

// All presentations use the entity sweep's soft shoulders and trailing falloff.
const ribbonEnvelopeShader = /* glsl */ `
  vec2 ribbonEnvelope(float delta) {
    float core = exp(-pow(delta/.024,2.0));
    float shoulder = exp(-pow(delta/.075,2.0));
    float tail = smoothstep(-.012,.035,delta)*exp(-max(delta,0.0)/.16);
    return vec2(min(shoulder*.72+core*.28+tail*.12,1.0),core);
  }
`;

const ribbonScanShader = /* glsl */ `
  ${ribbonEnvelopeShader}
  vec3 applyRibbonScan(vec3 surface, vec2 uv, vec3 radial, vec3 east,
    vec3 north, vec3 scanAxis, float progress, float reveal, vec3 viewDirection) {
    float delta = dot(radial,scanAxis)*.5+.5-(1.12-progress*1.24);
    vec2 envelope = ribbonEnvelope(delta);
    float band = envelope.x;
    float core = envelope.y;
    float visible = smoothstep(0.0,.035,progress)
      *(1.0-smoothstep(.94,1.0,progress));
    float energy = visible*uSweepEnergy*uSkinScanGain*reveal;
    // Match the filtered DEM frame used by terrain lighting, across China.
    vec2 normalStep = vec2(.85/4096.0,.85/2048.0);
    vec4 relief = texture2D(uReliefMap,uv)*.44
      +(texture2D(uReliefMap,uv+vec2(normalStep.x,0.0))
      +texture2D(uReliefMap,uv-vec2(normalStep.x,0.0))
      +texture2D(uReliefMap,uv+vec2(0.0,normalStep.y))
      +texture2D(uReliefMap,uv-vec2(0.0,normalStep.y)))*.14;
    vec2 slope = relief.rg*2.0-1.0;
    vec3 tangent = normalize(vec3(slope*.60,sqrt(max(1.0-dot(slope,slope),.06))));
    vec3 normal = normalize(east*tangent.x+north*tangent.y+radial*tangent.z);
    // The incoming lobe travels with the front; valleys retain occlusion.
    vec3 travelTangent = normalize(scanAxis-radial*dot(radial,scanAxis)
      +east*.00001);
    vec3 incoming = normalize(radial*.55+travelTangent*.83);
    float facing = max(dot(normal,incoming),0.0);
    float curvature = relief.a*2.0-1.0;
    float cavity = clamp(.74+curvature*2.4,.24,1.10);
    float response = clamp(.10+pow(facing,1.6)*1.45,.10,1.35)*cavity;
    float light = energy*(band*.85+core*.20)*response;
    const vec3 luminance = vec3(.2126,.7152,.0722);
    float reflectance = min(dot(surface,luminance)+.012,.18);
    surface *= 1.0+light*2.2;
    surface = referenceColorReflection(surface,uHoneycombColor,light*.58);
    surface += uHoneycombColor*(.10+reflectance*.80)*light;
    ${isHologram ? /* glsl */ `
    // Preserve the hologram's existing wire recipe. Entity grid emission is
    // supplied by the classic world-grid path, separately from terrain light.
    float wireFade = smoothstep(.08,.62,max(dot(radial,normalize(viewDirection)),0.0));
    vec2 coordinate = uv*vec2(72.0,36.0);
    vec2 pixelOffset = abs(coordinate-floor(coordinate+.5))
      /max(fwidth(coordinate),vec2(.001));
    float wire = 1.0-smoothstep(.60,1.80,min(pixelOffset.x,pixelOffset.y));
    surface += uHoneycombColor*energy*(core*.35+band*.65)*wire*.025*wireFade;
    ` : ''}
    return surface;
  }
`;

const geographicGridShader = /* glsl */ `
  float gridLine(float value, float count) {
    float coordinate = value * count;
    float distanceToLine = abs(fract(coordinate - 0.5) - 0.5);
    float antialiasWidth = max(fwidth(coordinate) * 0.72, 0.0025);
    return 1.0 - smoothstep(0.0, antialiasWidth, distanceToLine);
  }

  float gridDot(vec2 uv, vec2 count) {
    vec2 coordinate = uv * count;
    vec2 distanceToPoint = abs(fract(coordinate - 0.5) - 0.5);
    vec2 pixelWidth = max(fwidth(coordinate), vec2(0.0025));
    float pixelDistance = length(distanceToPoint / pixelWidth);
    return 1.0 - smoothstep(0.32, 1.28, pixelDistance);
  }
`;

const earthFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uIntroReveal;
  uniform vec3 uGridColor;
  uniform vec3 uLightDirection;
  uniform float uSweepProgress;
  uniform float uSweepGridStrength;
  uniform float uSweepSurfaceStrength;
  uniform float uSweepEnergy;
  uniform float uGridBreath;
  uniform vec3 uSweepAxis;
  uniform vec3 uSurfaceTint;
  uniform vec3 uEarthGrade;
  uniform vec3 uShadowFloorColor;
  uniform vec3 uTopLightColor;
  uniform vec3 uMidToneColor;
  uniform vec3 uBottomShadeColor;
  uniform vec3 uOceanHighlightColor;
  uniform vec3 uChinaFocusColor;
  uniform float uSurfaceRecolorAmount;
  uniform float uSkinRoughness;
  uniform float uSkinMetalness;
  uniform float uSkinSurfaceGain;
  uniform float uSkinAlbedoTint;
  uniform float uSkinOceanShininess;
  uniform float uSkinOceanReflection;
  uniform float uSkinOceanDarken;
  uniform float uSkinCityGain;
  uniform float uSkinScanGain;
  uniform float uSkinEdgeGain;
  uniform float uSkinEnvironmentGain;
  uniform float uSkinReliefContrast;
  uniform float uSkinInnerGlowGain;
  uniform float uSkinPolarGain;
  uniform float uPolarEnhancement;
  uniform float uSkinWorldGain;
  uniform float uSkinOceanBase;
  uniform float uSkinChinaAmbient;
  uniform vec3 uSkinPolarTint;
  uniform vec3 uSkinRimColor;
  uniform vec3 uSkinFillColor;
  uniform vec3 uSkinRimCore;
  uniform float uSkinReference;
  uniform vec3 uSweepSurfaceColor;
  uniform vec3 uGridDotColor;
  uniform vec3 uGridDotSweepColor;
  uniform vec3 uCityLightColor;
  uniform sampler2D uDayMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uSpecularMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uNightDetailMap;
  uniform sampler2D uReliefMap;
  uniform sampler2D uPhotographicMap;
  uniform sampler2D uCloudMap;
  uniform sampler2D uChinaMask;
  uniform float uChinaContact;
  uniform float uChinaFocus;
  varying vec2 vUv;
  varying vec3 vWorldRadial;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  varying vec3 vViewDirection;

  uniform float uHoneycombMode;
  uniform vec3 uHoneycombColor;
  ${honeycombScanShader}
  ${referenceTerrainLighting}
  ${ribbonScanShader}

  ${geographicGridShader}

  ${isHologram ? '' : photographicWorldMain}

  void main() {
    // FUI_PHOTO_DISPATCH_BEGIN
    ${isHologram ? '' : 'if(uSkinReference > .5){ fuiPhotographicWorld(); return; }'}
    // FUI_PHOTO_DISPATCH_END
    float surfaceReveal = smoothstep(0.0, 0.42, uIntroReveal);
    float gridReveal = smoothstep(0.28, 0.78, uIntroReveal);
    float minorGrid = max(gridLine(vUv.x, 72.0), gridLine(vUv.y, 36.0));
    float majorGrid = max(gridLine(vUv.x, 36.0), gridLine(vUv.y, 18.0));
    float grid = minorGrid * 0.56 + majorGrid * 0.22;
    float intersectionDot = gridDot(vUv, vec2(72.0, 36.0));
    vec3 tangentNormal = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    tangentNormal.xy *= 0.68;
    vec3 relief = texture2D(uReliefMap, vUv).rgb;
    if (uSkinReference > 0.5) {
      vec2 normalStep=vec2(.85/4096.0,.85/2048.0);
      relief=relief*.44+(texture2D(uReliefMap,vUv+vec2(normalStep.x,0.)).rgb
        +texture2D(uReliefMap,vUv-vec2(normalStep.x,0.)).rgb
        +texture2D(uReliefMap,vUv+vec2(0.,normalStep.y)).rgb
        +texture2D(uReliefMap,vUv-vec2(0.,normalStep.y)).rgb)*.14;
      vec2 slope = (relief.rg * 2.0 - 1.0) * 0.60;
      tangentNormal = vec3(slope, sqrt(max(1.0 - dot(slope, slope), 0.025)));
    }
    vec3 terrainNormal = normalize(
      vWorldEast * tangentNormal.x
      + vWorldNorth * tangentNormal.y
      + vWorldRadial * tangentNormal.z
    );
    vec3 lightDirection = normalize(uLightDirection);
    if (uSkinReference > 0.5) lightDirection = normalize(vec3(-0.79, 0.55, 0.48));
    vec3 viewDirection = normalize(vViewDirection);
    float lightFacing = dot(terrainNormal, lightDirection);
    float wrappedLight = smoothstep(-0.34, 0.74, lightFacing);
    float nightSide = 1.0 - smoothstep(-0.18, 0.42, lightFacing);
    float fresnel = pow(1.0 - max(dot(normalize(vWorldRadial), viewDirection), 0.0), 2.65);

    vec3 daySurface = texture2D(uDayMap, vUv).rgb;
    if(uSkinReference>.5)daySurface=texture2D(uPhotographicMap,vUv).rgb;
    float surfaceLuma = min(dot(daySurface, vec3(0.299, 0.587, 0.114)), 0.68);
    vec3 themedDaySurface = mix(
      daySurface,
      vec3(surfaceLuma),
      uSurfaceRecolorAmount
    );
    vec3 earthTint = uSurfaceTint * surfaceLuma;
    vec3 gradedSurface = mix(themedDaySurface, earthTint, 0.86) * uEarthGrade;
    float polarLatitude = smoothstep(0.67, 0.94, abs(vUv.y * 2.0 - 1.0));
    float polarIce = polarLatitude * smoothstep(0.3, 0.62, surfaceLuma);
    // The reference uses the polar cap as the main cool-white light catcher.
    // Preserve texture detail while lifting it into a desaturated blue-grey.
    vec3 polarTone = mix(vec3(surfaceLuma * 0.18), uTopLightColor * 0.64, 0.55);
    gradedSurface = mix(gradedSurface, polarTone, polarIce * 0.78);
    // Reference-matched vertical illumination: cool steel-blue at the upper
    // hemisphere, blue-grey through the middle, navy-black toward the bottom.
    float verticalPosition = clamp(vWorldRadial.y * 0.5 + 0.5, 0.0, 1.0);
    float verticalExposure = mix(
      0.78,
      1.34,
      smoothstep(0.08, 0.94, verticalPosition)
    );
    vec3 verticalFloor = mix(
      uBottomShadeColor,
      uMidToneColor,
      smoothstep(0.06, 0.56, verticalPosition)
    );
    verticalFloor = mix(
      verticalFloor,
      uTopLightColor,
      smoothstep(0.56, 0.96, verticalPosition)
    );
    vec3 color = gradedSurface * (0.78 + wrappedLight * 1.22);
    color *= mix(1.0, 0.66, polarLatitude);
    color *= verticalExposure;
    vec3 liftedFloor = max(color, verticalFloor * (0.72 + surfaceLuma * 0.18));
    float floorInfluence = mix(
      0.18,
      0.38,
      smoothstep(0.34, 0.96, verticalPosition)
    );
    color = mix(color, liftedFloor, floorInfluence);
    float satelliteDetail = clamp((surfaceLuma - 0.32) * 0.24, -0.055, 0.075);
    color *= 1.0 + satelliteDetail;

    float oceanMask = texture2D(uSpecularMap, vUv).r;
    if (uSkinReference > 0.5) {
      vec3 radial = normalize(vWorldRadial);
      float land = 1.0 - smoothstep(0.12, 0.75, oceanMask);
      float macroSun = max(dot(radial, lightDirection), 0.0);
      vec3 fillDirection = normalize(vec3(0.58, -0.28, 0.76));
      float macroFill = max(dot(radial, fillDirection), 0.0);
      // Restored photographic receiver: satellite albedo and directional
      // range highlights remain distinct instead of a uniformly rough slab.
      vec3 photograph=texture2D(uPhotographicMap,vUv).rgb;
      float photoLuma=dot(photograph,vec3(.299,.587,.114));
      float terrainSun=max(dot(terrainNormal,lightDirection),0.0);
      float diffuse=.025+pow(macroSun,1.45)*.88;
      float reliefLight=clamp(terrainSun-macroSun,-.25,.25);
      float groundDetail=.055+pow(max(photoLuma,.0001),.55)*.58;
      vec3 landColor=mix(uSurfaceTint,uTopLightColor,.28)*groundDetail
        *max(diffuse+reliefLight*.8,.018);
      float ridgeFacing=max(dot(tangentNormal.xy,normalize(vec2(-.68,.74))),0.0);
      landColor+=uTopLightColor*(pow(ridgeFacing,.9)*(.20+macroSun*.26)
        +max(reliefLight,0.0)*(.16+relief.b*.30));
      landColor*=1.0-max(-reliefLight,0.0)*1.2;
      vec3 seaColor=uBottomShadeColor*(.10+macroSun*uSkinOceanBase);
      float hemisphereGrade=mix(.20,1.0,smoothstep(-.80,.55,radial.y));
      color=mix(seaColor,landColor*uSkinWorldGain,land)*hemisphereGrade;
      float grazing=pow(1.0-max(dot(radial,viewDirection),0.0),1.6);
      float ice = polarLatitude * smoothstep(0.30, 0.62, surfaceLuma);
      // Shared cool-gray ice albedo, with satellite texture retained. Avoid
      // the former near-white floor and gain that bleached the whole cap.
      float iceAlbedo = mix(.72,1.0,smoothstep(.30,.68,surfaceLuma));
      vec3 iceColor = uSkinPolarTint * iceAlbedo
        * (0.15 + macroSun * 0.45) * uSkinPolarGain;
      color = mix(color, iceColor * hemisphereGrade, ice*uPolarEnhancement);
      // MODIS clouds remain a faint independent optical layer, with a small
      // displaced shadow. Keep the administrative China overlay unobscured.
      float cloud = texture2D(uCloudMap, vUv).r;
      float cloudShadow = texture2D(uCloudMap, vUv + vec2(0.0015, -0.001)).r;
      float chinaCloudMask = 1.0 - smoothstep(0.05, 0.45, texture2D(uChinaMask, vUv).r);
      float cloudOpacity = smoothstep(0.19, 0.88, cloud) * chinaCloudMask;
      color *= 1.0 - cloudShadow * land * 0.16 * chinaCloudMask;
      vec3 cloudRadiance = mix(uSkinFillColor,uTopLightColor,.20+macroSun*.80)
        * (.16 + macroSun*.50 + macroFill*.12)
        + uSkinFillColor * grazing * .18;
      cloudRadiance = referenceColorReflection(cloudRadiance,uSkinRimColor,referenceCloudColorMix*pow(macroSun,1.3));
      color = mix(color,cloudRadiance,cloudOpacity*.13);
    }
    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float oceanHighlight = pow(max(dot(terrainNormal, halfDirection), 0.0), uSkinOceanShininess) * oceanMask;
    color *= 1.0 - oceanMask * uSkinOceanDarken;
    color += uOceanHighlightColor * oceanHighlight * (0.08 + wrappedLight * 0.43) * uSkinOceanReflection;

    vec3 nightTexture = texture2D(uNightMap,vUv).rgb;
    float nightLight = max(max(nightTexture.r, nightTexture.g), nightTexture.b);

    float cityPhase = dot(floor(vUv * vec2(720.0, 360.0)), vec2(12.9898, 78.233));
    float naturalTwinkle = 0.97 + sin(uTime * 0.82 + cityPhase) * 0.03;
    color += uCityLightColor * pow(nightLight, 1.16)
      * (mix(0.16, 0.34, uSkinReference) + nightSide * .72) * naturalTwinkle * uSkinCityGain;

    float chinaMask = texture2D(uChinaMask, vUv).r;
    float chinaCore = smoothstep(0.82, 0.985, chinaMask);
    float contactShadow = smoothstep(0.025, 0.78, chinaMask) * (1.0 - chinaCore);
    float chinaFocusHalo = smoothstep(0.055, 0.68, chinaMask)
      * (1.0 - smoothstep(0.76, 0.985, chinaMask));
    color *= 1.0 - contactShadow * mix(.46,.12,uSkinReference) * uChinaContact;
    color += uChinaFocusColor * chinaFocusHalo * uChinaFocus * 0.2;
    vec3 sweepAxis = normalize(uSweepAxis);
    float sweepPosition = dot(normalize(vWorldRadial), sweepAxis) * 0.5 + 0.5;
    float sweepCenter = 1.12 - uSweepProgress * 1.24;
    float sweepDistance = sweepPosition - sweepCenter;
    float sweepCore = exp(-pow(sweepDistance / 0.024, 2.0));
    float sweepGlow = exp(-pow(sweepDistance / 0.075, 2.0));
    float sweepTail = exp(-max(sweepDistance, 0.0) / 0.16)
      * smoothstep(-0.012, 0.035, sweepDistance);
    float sweepBand = min(sweepGlow * 0.72 + sweepCore * 0.28 + sweepTail * 0.12, 1.0);
    color += uGridColor * grid * (0.04 + wrappedLight * 0.036)
      * gridReveal * uGridBreath;
    color += uGridDotColor * intersectionDot
      * (0.052 + wrappedLight * 0.042) * gridReveal * uGridBreath;
    if (uHoneycombMode > .5) {
      vec3 hex = honeycombScan(vUv,normalize(vWorldRadial),normalize(vWorldEast),
        normalize(vWorldNorth),sweepAxis,uSweepProgress);
      float facing = pow(max(dot(normalize(vWorldRadial),viewDirection),0.0),.35);
      color += uHoneycombColor*(hex.x*1.45+hex.y)*facing*uSweepEnergy*uSkinScanGain;
      color *= 1.0+hex.y*.18*uSweepEnergy;
    } else if (uSkinReference > .5) {
      color = applyRibbonScan(color,vUv,normalize(vWorldRadial),normalize(vWorldEast),
        normalize(vWorldNorth),sweepAxis,uSweepProgress,gridReveal,viewDirection);
    } else {
    float surfaceSweep = sweepBand * uSweepSurfaceStrength * uSweepEnergy * uSkinScanGain;
    float gridSweep = sweepBand * uSweepGridStrength * uSweepEnergy;
    float surfaceLightResponse = 0.72
      + max(dot(terrainNormal, sweepAxis), 0.0) * 0.28;
    color *= 1.0 + surfaceSweep * surfaceLightResponse
      * (0.08 + wrappedLight * 0.05);
    color += gradedSurface * surfaceSweep * 0.045;
    color += uSweepSurfaceColor
      * surfaceSweep * surfaceLightResponse * 0.16;
    float sweepCoreEnergy = sweepCore * uSweepSurfaceStrength * uSweepEnergy * uSkinScanGain;
    color += uSweepSurfaceColor * sweepCoreEnergy
      * (0.13 + surfaceLightResponse * 0.11);
    color += uGridColor * grid * gridSweep * 0.12 * gridReveal;
    color += uGridDotSweepColor * intersectionDot
      * gridSweep * 0.16 * gridReveal;
    color += uGridDotSweepColor * grid
      * sweepCoreEnergy * 0.11 * gridReveal;
    color += uGridDotSweepColor * intersectionDot
      * sweepCoreEnergy * 0.24 * gridReveal;
    }
    color += uGridColor * fresnel * mix(0.018, 0.1, wrappedLight);
    float edge = 1.0 - max(dot(normalize(vWorldRadial), viewDirection), 0.0);
    float rimLight = pow(max(dot(normalize(vWorldRadial), normalize(vec3(-0.76, 0.65, 0.0))), 0.0), 2.4);
    if (uSkinReference > .5) {
      color = referenceAerial(color,normalize(vWorldRadial),viewDirection,
        uSkinRimColor,uSkinFillColor,uSkinRimCore,uSkinEdgeGain,uSkinEnvironmentGain);
      // The atmosphere supplies the complete soft shoulder. A separate
      // sub-pixel exponential core clipped to white and looked like a bevel.
    } else {
      color += uSkinRimColor * pow(edge, 9.0) * rimLight * uSkinEdgeGain * 0.18;
      color += uSkinFillColor * pow(edge, 6.0) * min(uSkinEdgeGain, 1.0) * 0.09;
      float keyHotspot = pow(max(dot(normalize(vWorldRadial), normalize(vec3(-0.76, 0.65, 0.0))), 0.0), 16.0);
      color += mix(uSkinRimColor, uSkinRimCore, 0.52) * pow(edge, 26.0) * rimLight * uSkinEdgeGain * 5.0 * (0.40 + keyHotspot * 1.8);
    }
    color *= mix(0.12, 1.0, surfaceReveal);
    float alpha = (0.985 + grid * 0.01 + fresnel * 0.012)
      * uFade * surfaceReveal;
    gl_FragColor = vec4(color, alpha);
  }
`;

const landVertexShader = /* glsl */ `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vGeoUv;

  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vGeoUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const landFragmentShader = /* glsl */ `
  uniform float uFade;
  uniform vec3 uDark;
  uniform vec3 uLight;
  uniform vec3 uGridColor;
  uniform vec3 uGridDotColor;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vGeoUv;

  float gridLine(float value, float count) {
    float coordinate = value * count;
    float distanceToLine = abs(fract(coordinate - 0.5) - 0.5);
    float antialiasWidth = max(fwidth(coordinate) * 0.68, 0.0025);
    return 1.0 - smoothstep(0.0, antialiasWidth, distanceToLine);
  }

  float gridDot(vec2 uv, vec2 count) {
    vec2 coordinate = uv * count;
    vec2 distanceToPoint = abs(fract(coordinate - 0.5) - 0.5);
    vec2 pixelWidth = max(fwidth(coordinate), vec2(0.0025));
    float pixelDistance = length(distanceToPoint / pixelWidth);
    return 1.0 - smoothstep(0.32, 1.28, pixelDistance);
  }

  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  void main() {
    float broad = noise3(vPosition * 13.0);
    float coarse = noise3(vPosition * 34.0);
    float fine = noise3(vPosition * 82.0);
    float ridge = 1.0 - abs(noise3(vPosition * 52.0) * 2.0 - 1.0);
    float relief = broad * 0.5 + coarse * 0.34 + fine * 0.16;
    float verticalLight = smoothstep(-0.82, 0.86, normalize(vPosition).y);
    float light = 0.3 + max(dot(normalize(vNormal), normalize(vec3(-0.42, 0.78, 0.82))), 0.0) * 0.7;
    light *= mix(0.68, 1.18, verticalLight);
    float grid = max(gridLine(vGeoUv.x, 72.0), gridLine(vGeoUv.y, 36.0));
    float intersectionDot = gridDot(vGeoUv, vec2(72.0, 36.0));
    vec3 color = mix(uDark, uLight, relief * 0.56) * light;
    color += uLight * pow(ridge, 4.0) * 0.07;
    color += uGridColor * grid * 0.026;
    color += uGridDotColor * intersectionDot * 0.043;
    gl_FragColor = vec4(color, 0.94 * uFade);
  }
`;

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vScanUv;
  varying vec3 vScanEast;
  varying vec3 vScanNorth;

  void main() {
    vScanUv = uv;
    vec3 radial=normalize(position);
    vec3 east=normalize(cross(vec3(0.0,1.0,0.0),radial)+vec3(.00001,0.0,0.0));
    vec3 north=normalize(cross(radial,east));
    vScanEast=normalize(mat3(modelMatrix)*east);
    vScanNorth=normalize(mat3(modelMatrix)*north);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  ${referenceAtmosphereOptics}
  uniform vec3 uColor;
  uniform float uFade;
  uniform float uIntensity;
  uniform vec3 uLightDirection;
  uniform float uSweepProgress;
  uniform float uSweepStrength;
  uniform float uSweepEnergy;
  uniform vec3 uSweepAxis;
  uniform vec3 uSweepColor;
  uniform float uSkinReference;
  uniform float uHoneycombMode;
  uniform vec3 uRimCore;
  uniform vec3 uFillColor;
  uniform float uShellRadius;
  uniform float uHologramVolume;
  uniform float uSkinEnvironmentGain;
  uniform float uSkinEdgeGain;
  uniform float uSkinAtmosphereGain;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  ${ribbonEnvelopeShader}

  ${isHologram ? /* glsl */ `
  varying vec2 vScanUv;
  varying vec3 vScanEast;
  varying vec3 vScanNorth;
  uniform vec3 uHoneycombColor;
  uniform float uSkinScanGain;
  uniform vec3 uGridColor;
  uniform vec3 uGridDotSweepColor;
  uniform float uSweepGridStrength;
  ${geographicGridShader}
  ${honeycombScanShader}
  ` : ''}
  ${photographicAtmosphereMain}

  void main() {
    // FUI_PHOTO_DISPATCH_BEGIN
    ${isHologram ? /* glsl */ `
    if(uIntensity<=0.0){
      // The entity's actual transparent carrier, on the existing r2.14 shell.
      // Static hologram air below retains its own optical integration.
      fuiPhotographicAtmosphere();
      vec3 radial=normalize(vNormal);
      vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
      float front=smoothstep(.08,.62,max(dot(radial,viewDirection),0.0));
      float delta=dot(radial,normalize(uSweepAxis))*.5+.5-(1.12-uSweepProgress*1.24);
      float band=ribbonEnvelope(delta).x;
      float visible=smoothstep(0.0,.035,uSweepProgress)
        *(1.0-smoothstep(.94,1.0,uSweepProgress));
      vec3 scanLight;
      float scanCoverage;
      if(uHoneycombMode>.5){
        // Reuse the entity's geographic cells and compact moving trail.
        vec3 hex=honeycombScan(vScanUv,radial,normalize(vScanEast),
          normalize(vScanNorth),normalize(uSweepAxis),uSweepProgress);
        float facing=pow(max(dot(radial,viewDirection),0.0),.35);
        float energy=facing*uSweepEnergy*uSkinScanGain*uFade;
        scanLight=uHoneycombColor*(hex.x*1.45+hex.y)*energy;
        scanCoverage=(hex.x+hex.y)*energy;
      }else{
        float minorGrid=max(gridLine(vScanUv.x,72.0),gridLine(vScanUv.y,36.0));
        float majorGrid=max(gridLine(vScanUv.x,36.0),gridLine(vScanUv.y,18.0));
        float grid=minorGrid*.56+majorGrid*.22;
        float intersectionDot=gridDot(vScanUv,vec2(72.0,36.0));
        float gridSweep=band*uSweepGridStrength*uSweepEnergy*visible*front;
        scanLight=(uGridColor*grid*.12
          +uGridDotSweepColor*intersectionDot*.16)*gridSweep*uFade;
        scanCoverage=(grid+intersectionDot)*gridSweep*.12*uFade;
      }
      vec3 radiance=gl_FragColor.rgb*gl_FragColor.a+scanLight;
      float coverage=max(gl_FragColor.a,scanCoverage);
      gl_FragColor=vec4(radiance/max(coverage,.00001),coverage);
      return;
    }
    ` : 'if(uSkinReference > .5){ fuiPhotographicAtmosphere(); return; }'}
    // FUI_PHOTO_DISPATCH_END
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal);
    float rim = 1.0 - abs(dot(normal, viewDirection));
    float softHalo = pow(clamp(rim, 0.0, 1.0), 2.6);
    float edgeSoftening = 1.0 - smoothstep(0.975, 1.0, rim) * 0.48;
    float lightFacing = dot(normal, normalize(uLightDirection));
    float directional = smoothstep(0.08, 0.88, lightFacing);
    float illuminatedRim = softHalo * edgeSoftening * mix(0.004, 1.0, pow(directional, 1.35));
    vec3 haloColor = mix(uColor * 0.48, uColor, directional);
    vec3 sweepAxis = normalize(uSweepAxis);
    float sphericalPosition = dot(normal, sweepAxis) * 0.5 + 0.5;
    float sweepCenter = 1.12 - uSweepProgress * 1.24;
    float sweepDelta = sphericalPosition - sweepCenter;
    float sweepCore = exp(-pow(sweepDelta / 0.024, 2.0));
    float sweepGlow = exp(-pow(sweepDelta / 0.075, 2.0));
    float sweepTail = exp(-max(sweepDelta, 0.0) / 0.16)
      * smoothstep(-0.012, 0.035, sweepDelta);
    float sweepBand = min(sweepGlow * 0.72 + sweepCore * 0.28 + sweepTail * 0.12, 1.0);
    float refinedRibbon = step(.5,uSkinReference)*(1.0-step(.5,uHoneycombMode));
    if(refinedRibbon>.5) sweepBand = ribbonEnvelope(sweepDelta).x;
    float sweepRim = pow(clamp(rim, 0.0, 1.0), 1.5) * edgeSoftening;
    float sweepAlpha = sweepBand * sweepRim * uSweepStrength * uSweepEnergy
      * mix(mix(1.0,.55,refinedRibbon),.28,uHoneycombMode);
    vec3 finalColor = mix(
      haloColor,
      uSweepColor,
      clamp(sweepBand * uSweepStrength * uSweepEnergy * 3.2, 0.0, 1.0)
    );
    float alpha = illuminatedRim * uIntensity + sweepAlpha;
    if (uSkinReference > 0.5) {
      // One optical shell avoids summing several disconnected glow rings.
      // Preserve the separate low-energy sweep and original preset path.
      if(uShellRadius<2.08) {
        gl_FragColor=vec4(uSweepColor,sweepAlpha*uFade);
        return;
      }
      vec3 point=normal*uShellRadius;
      float along=dot(point,viewDirection);
      float distance=max(-2.0*along,0.0);
      vec3 airNormal=normal;
      float impact2=max(dot(point,point)-along*along,0.0);
      if(uHologramVolume>.5){
        // The transparent globe has no opaque ocean to provide its near air.
        // Integrate the actual front atmospheric segment across the whole
        // sphere; exterior rays retain the full unobstructed atmospheric chord.
        if(impact2<4.0){
          float leaveBody=-along+sqrt(max(4.0-impact2,0.0));
          point+=viewDirection*leaveBody;
          distance=max(distance-leaveBody,0.0);
          airNormal=normalize(point);
        }else{
          airNormal=normalize(point+viewDirection*(distance*.5));
        }
      }
      vec2 opticalDepth=referenceOpticalDepth(point,viewDirection,distance);
      if(uHologramVolume>.5){
        // The empty hologram also exposes its far air. Radial density makes
        // that segment symmetric with the near segment; no solid-body density
        // is integrated, and the profile remains continuous at the tangent.
        if(impact2<4.0)opticalDepth*=2.0;
        // Separate the narrow dense core from the translucent inner shoulder.
        // Spend less broad radiance in the ocean center, without widening
        // the source or blurring the image. The outer chord falls off naturally.
        float shoulder=smoothstep(1.25,1.99,sqrt(impact2));
        opticalDepth.x*=mix(.24,1.0,shoulder*shoulder);
        opticalDepth.y*=1.18;
      }
      finalColor=referenceAirRadiance(opticalDepth,airNormal,uColor,uFillColor,uRimCore,
        uSkinEdgeGain,uSkinEnvironmentGain);
      // One presentation response for dots, hex and every hue. No second
      // shell, screen-space halo, blur or change to the surface preset.
      if(uHologramVolume>.5)finalColor*=1.7;
      alpha=clamp(uIntensity/(.08*max(uSkinAtmosphereGain,.001)),0.0,1.3);
    }
    gl_FragColor = vec4(finalColor, alpha * uFade);
  }
`;

// Reduce only the additional skins' administrative lift, keeping world-space
// coordinates, original geometry, entrance, walls and outlines synchronized.
const focusRadiusGlsl = /* glsl */ `
  uniform float uSkinReference;
  float focusRadius(float radius) {
    return mix(radius,2.0+(radius-2.0)*${isHologram ? '.28' : FUI_ENTITY_VISUAL_BASELINE.chinaRadialScale.toFixed(2)},uSkinReference);
  }
`;

const chinaVertexShader = /* glsl */ `
  ${focusRadiusGlsl}
  uniform sampler2D uHeightMap;
  uniform float uElevationScale;
  uniform float uIntroReveal;
  uniform float uIntroElevation;
  varying float vFacing;
  varying float vElevation;
  varying vec2 vGeoUv;
  varying vec3 vPosition;
  varying vec3 vWorldRadial;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;

  vec2 chinaDemUv(vec2 geoUv) {
    float lon = geoUv.x * 360.0 - 180.0;
    float lat = geoUv.y * 180.0 - 90.0;
    return clamp(vec2((lon - 70.0) / 70.0, (lat - 15.0) / 40.0), 0.0, 1.0);
  }

  void main() {
    vGeoUv = uv;
    vElevation = texture2D(uHeightMap, chinaDemUv(uv)).r;
    vec3 radial = normalize(position);
    vec3 displacedPosition = radial * (
      focusRadius(length(position) + vElevation * uElevationScale * uIntroElevation)
    );
    vPosition = displacedPosition;
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), radial));
    vec3 north = normalize(cross(radial, east));
    vWorldRadial = normalize(mat3(modelMatrix) * radial);
    vWorldEast = normalize(mat3(modelMatrix) * east);
    vWorldNorth = normalize(mat3(modelMatrix) * north);
    vFacing = max(dot(vWorldRadial, normalize(cameraPosition - worldPosition.xyz)), 0.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const chinaFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uFade;
  uniform float uIntroReveal;
  uniform float uIntroElevation;
  uniform vec3 uColor;
  uniform sampler2D uHeightMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uReliefMap;
  uniform sampler2D uPhotographicMap;
  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uNightDetailMap;
  uniform sampler2D uInnerGlowMap;
  uniform vec3 uLightDirection;
  uniform float uInnerGlowPulse;
  uniform float uSweepProgress;
  uniform float uSweepSurfaceStrength;
  uniform float uSweepEnergy;
  uniform vec3 uSweepAxis;
  uniform vec3 uAccentSoft;
  uniform vec3 uRidgeColor;
  uniform vec3 uInnerGlowColor;
  uniform vec3 uCityLightColor;
  uniform vec3 uSlopeLightColor;
  uniform vec3 uFlatTone;
  uniform vec3 uPlainTone;
  uniform vec3 uPlateauTone;
  uniform vec3 uDrylandTone;
  uniform vec3 uForestTone;
  uniform vec3 uNortheastTone;
  uniform float uSurfaceRecolorAmount;
  uniform float uSkinRoughness;
  uniform float uSkinMetalness;
  uniform float uSkinSurfaceGain;
  uniform float uSkinAlbedoTint;
  uniform float uSkinOceanShininess;
  uniform float uSkinOceanReflection;
  uniform float uSkinOceanDarken;
  uniform float uSkinCityGain;
  uniform float uSkinScanGain;
  uniform float uSkinEdgeGain;
  uniform float uSkinEnvironmentGain;
  uniform float uSkinReliefContrast;
  uniform float uSkinInnerGlowGain;
  uniform float uSkinPolarGain;
  uniform float uPolarEnhancement;
  uniform float uSkinWorldGain;
  uniform float uSkinOceanBase;
  uniform float uSkinChinaAmbient;
  uniform vec3 uSkinPolarTint;
  uniform vec3 uSkinRimColor;
  uniform vec3 uSkinFillColor;
  uniform vec3 uSkinRimCore;
  uniform float uSkinReference;
  varying float vFacing;
  varying float vElevation;
  varying vec2 vGeoUv;
  varying vec3 vPosition;
  varying vec3 vWorldRadial;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;

  uniform float uHoneycombMode;
  uniform vec3 uHoneycombColor;
  ${honeycombScanShader}
  ${referenceTerrainLighting}
  ${ribbonScanShader}

  vec2 chinaDemUv(vec2 geoUv) {
    float lon = geoUv.x * 360.0 - 180.0;
    float lat = geoUv.y * 180.0 - 90.0;
    return clamp(vec2((lon - 70.0) / 70.0, (lat - 15.0) / 40.0), 0.0, 1.0);
  }

  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  ${isHologram ? '' : photographicChinaMain}

  void main() {
    // FUI_PHOTO_DISPATCH_BEGIN
    ${isHologram ? '' : 'if(uSkinReference > .5){ fuiPhotographicChina(); return; }'}
    // FUI_PHOTO_DISPATCH_END
    float breath = 0.5 + 0.5 * sin(uTime * 2.0);
    float coarse = noise3(vPosition * 34.0);
    float fine = noise3(vPosition * 96.0);
    float grain = coarse * 0.68 + fine * 0.32;
    vec2 demUv = chinaDemUv(vGeoUv);
    vec3 tangentNormal = texture2D(uNormalMap, demUv).rgb * 2.0 - 1.0;
    float elevation = vElevation;
    if (uSkinReference > 0.5) {
      vec3 relief = texture2D(uReliefMap, vGeoUv).rgb;
      vec2 slope = (relief.rg * 2.0 - 1.0) * 0.86;
      tangentNormal = vec3(slope, sqrt(max(1.0 - dot(slope, slope), 0.025)));
      elevation = relief.b;
    }
    vec3 terrainNormal = normalize(
      vWorldEast * tangentNormal.x
      + vWorldNorth * tangentNormal.y
      + vWorldRadial * tangentNormal.z
    );
    float lightFacing = dot(terrainNormal, normalize(uLightDirection));
    float sun = smoothstep(-0.18, 0.82, lightFacing);
    float slopeLight = dot(tangentNormal.xy, normalize(vec2(-0.68, 0.74)));
    float directional = clamp(0.38 + sun * 0.64 + slopeLight * 0.18, 0.26, 1.08);
    if (uSkinReference > 0.5) {
      directional = clamp(0.18 + sun * 0.76 + slopeLight * 0.43, 0.08, 1.14);
    }

    vec2 reliefStep = vec2(0.0027, 0.0048);
    float hEast = texture2D(uHeightMap, demUv + vec2(reliefStep.x, 0.0)).r;
    float hWest = texture2D(uHeightMap, demUv - vec2(reliefStep.x, 0.0)).r;
    float hNorth = texture2D(uHeightMap, demUv + vec2(0.0, reliefStep.y)).r;
    float hSouth = texture2D(uHeightMap, demUv - vec2(0.0, reliefStep.y)).r;
    if (uSkinReference > 0.5) {
      hEast = texture2D(uReliefMap, vGeoUv + vec2(0.0007, 0.0)).b;
      hWest = texture2D(uReliefMap, vGeoUv - vec2(0.0007, 0.0)).b;
      hNorth = texture2D(uReliefMap, vGeoUv + vec2(0.0, 0.0014)).b;
      hSouth = texture2D(uReliefMap, vGeoUv - vec2(0.0, 0.0014)).b;
    }
    float localAverage = (hEast + hWest + hNorth + hSouth) * 0.25;
    float valleyOcclusion = smoothstep(0.008, 0.085, localAverage - elevation);
    float lightHorizon = texture2D(uHeightMap, demUv + vec2(-0.0065, 0.008)).r;
    float farHorizon = texture2D(uHeightMap, demUv + vec2(-0.013, 0.016)).r;
    if (uSkinReference > 0.5) {
      lightHorizon = texture2D(uReliefMap, vGeoUv + vec2(-0.0015, 0.002)).b;
      farHorizon = texture2D(uReliefMap, vGeoUv + vec2(-0.003, 0.004)).b;
    }
    float terrainShadow = max(
      smoothstep(0.01, 0.12, lightHorizon - elevation),
      smoothstep(0.018, 0.16, farHorizon - elevation) * 0.72
    );
    float steepnessOcclusion = 1.0 - smoothstep(0.15, 0.78, tangentNormal.z);
    float ridgeExposure = smoothstep(0.006, 0.075, elevation - localAverage);
    directional *= 1.0 - valleyOcclusion * 0.3 - terrainShadow * 0.36 - steepnessOcclusion * 0.1;
    directional = pow(max(directional, mix(0.2, 0.08, uSkinReference)), uSkinReliefContrast);

    vec3 daySurface = texture2D(uDayMap, vGeoUv).rgb;
    if (uSkinReference > 0.5) daySurface = texture2D(uPhotographicMap, vGeoUv).rgb;
    float rawLuma = dot(daySurface, vec3(0.299, 0.587, 0.114));
    float surfaceLuma = pow(min(rawLuma, 0.64), 1.34);
    vec3 themedDaySurface = mix(
      daySurface,
      vec3(rawLuma),
      uSurfaceRecolorAmount
    );
    float longitude = vGeoUv.x * 360.0 - 180.0;
    float latitude = vGeoUv.y * 180.0 - 90.0;
    float westernHighland = (1.0 - smoothstep(101.0, 113.0, longitude))
      * smoothstep(0.44, 0.78, elevation);
    float northernDryland = (1.0 - smoothstep(108.0, 118.0, longitude))
      * smoothstep(34.0, 42.0, latitude)
      * (1.0 - westernHighland * 0.62);
    float easternPlain = smoothstep(103.0, 118.0, longitude)
      * (1.0 - smoothstep(39.0, 46.0, latitude));
    float northeastForest = smoothstep(116.0, 126.0, longitude)
      * smoothstep(38.0, 47.0, latitude);
    float southernForest = smoothstep(102.0, 116.0, longitude)
      * (1.0 - smoothstep(29.0, 35.0, latitude));

    vec3 plainTone = uPlainTone * surfaceLuma;
    vec3 plateauTone = uPlateauTone * surfaceLuma;
    vec3 drylandTone = uDrylandTone * surfaceLuma;
    vec3 forestTone = uForestTone * surfaceLuma;
    vec3 northeastTone = uNortheastTone * surfaceLuma;
    vec3 earthTone = plainTone;
    earthTone = mix(earthTone, plateauTone, westernHighland * 0.88);
    earthTone = mix(earthTone, drylandTone, northernDryland * 0.68);
    earthTone = mix(earthTone, forestTone, max(easternPlain * 0.52, southernForest * 0.76));
    earthTone = mix(earthTone, northeastTone, northeastForest * 0.72);
    vec3 surfaceGrade = mix(
      vec3(0.62, 0.8, 0.43),
      vec3(0.48),
      uSurfaceRecolorAmount
    );
    vec3 albedo = mix(themedDaySurface, earthTone, 0.68) * surfaceGrade;
    albedo = mix(albedo, uColor * surfaceLuma * 1.25, uSkinAlbedoTint);
    albedo *= 0.9 + grain * 0.1;
    vec3 highlandGrade = mix(
      vec3(1.03, 1.1, 0.72),
      vec3(1.05),
      uSurfaceRecolorAmount
    );
    albedo = mix(
      albedo,
      albedo * highlandGrade,
      smoothstep(0.58, 0.92, elevation) * 0.22
    );
    albedo += uColor * uHover * 0.055;
    vec3 color = albedo * directional * 1.02;
    // Keep China readable against the surrounding globe without turning it
    // into a flat white plate. The silver blue-grey lift remains stronger on
    // the lit, ridged side so the terrain texture stays visible.
    float chinaPresence = 0.018 + sun * 0.012 + ridgeExposure * 0.014;
    color += uColor * (chinaPresence + uSkinChinaAmbient * (1.0 - valleyOcclusion * 0.3));
    color += uRidgeColor * ridgeExposure * (0.035 + sun * 0.095);
    color += uRidgeColor * uSkinReference * pow(max(slopeLight, 0.0), 1.2)
      * (0.05 + elevation * 0.35) * (1.0 - valleyOcclusion * 0.55);
    vec3 skinView = normalize(cameraPosition - vWorldRadial * 2.06);
    vec3 skinHalf = normalize(normalize(uLightDirection) + skinView);
    float skinSpecular = pow(max(dot(terrainNormal, skinHalf), 0.0), mix(140.0, 22.0, uSkinRoughness));
    color += uRidgeColor * (skinSpecular * 0.23 + ridgeExposure * pow(max(slopeLight, 0.0), 2.0) * 0.055) * uSkinMetalness;
    color *= uSkinSurfaceGain;

    vec3 sweepAxis = normalize(uSweepAxis);
    float sweepPosition = dot(normalize(vWorldRadial), sweepAxis) * 0.5 + 0.5;
    float sweepCenter = 1.12 - uSweepProgress * 1.24;
    float sweepDistance = sweepPosition - sweepCenter;
    float sweepCore = exp(-pow(sweepDistance / 0.024, 2.0));
    float sweepGlow = exp(-pow(sweepDistance / 0.075, 2.0));
    float sweepTail = exp(-max(sweepDistance, 0.0) / 0.16)
      * smoothstep(-0.012, 0.035, sweepDistance);
    float sweepBand = min(sweepGlow * 0.72 + sweepCore * 0.28 + sweepTail * 0.12, 1.0);
    float terrainSweepResponse = clamp(
      0.62 + lightFacing * 0.22 + ridgeExposure * 0.38
        - valleyOcclusion * 0.22 - terrainShadow * 0.18,
      0.32,
      1.18
    );
    if (uHoneycombMode > .5) {
      vec3 radial = normalize(vWorldRadial);
      vec3 hex = honeycombScan(vGeoUv,radial,normalize(vWorldEast),
        normalize(vWorldNorth),sweepAxis,uSweepProgress);
      float facing = pow(max(dot(radial,skinView),0.0),.35);
      color += uHoneycombColor*(hex.x*1.45+hex.y)*facing*uSweepEnergy*uSkinScanGain;
      color *= 1.0+hex.y*.18*uSweepEnergy;
    } else if (uSkinReference > .5) {
      color = applyRibbonScan(color,vGeoUv,normalize(vWorldRadial),normalize(vWorldEast),
        normalize(vWorldNorth),sweepAxis,uSweepProgress,1.0,skinView);
    } else {
    float terrainSweep = sweepBand * uSweepSurfaceStrength
      * uSweepEnergy * terrainSweepResponse * uSkinScanGain;
    color *= 1.0 + terrainSweep * 0.14;
    color += albedo * terrainSweep * 0.04;
    color += uAccentSoft * terrainSweep * 0.16;
    color += uAccentSoft
      * ridgeExposure * sweepBand * uSweepEnergy * 0.1;
    float chinaSweepCore = sweepCore * uSweepSurfaceStrength * uSweepEnergy * uSkinScanGain;
    color += uAccentSoft * chinaSweepCore * (0.16 + sun * 0.08);

    }

    vec3 innerGlowSample = texture2D(uInnerGlowMap, vGeoUv).rgb;
    if (uSkinReference > 0.5) {
      // Emission follows the inward distance, modulated by actual terrain.
      // The narrow core and soft falloff must not form an opaque white bevel.
      float core = pow(innerGlowSample.g, 1.5);
      float falloff = innerGlowSample.b;
      float reliefTransmission = .24 + .76 * smoothstep(-.18,.62,slopeLight);
      color += uInnerGlowColor * (core * .065 + falloff * .085)
        * reliefTransmission * uInnerGlowPulse * uSkinInnerGlowGain;
    } else {
      float glowGradient = pow(max(innerGlowSample.r, 0.0), 0.92);
      color += uInnerGlowColor * glowGradient * (0.46 + sun * .4)
        * .92 * uInnerGlowPulse * uSkinInnerGlowGain;
    }

    vec3 nightTexture = texture2D(uNightMap,vGeoUv).rgb;
    float nightLight = max(max(nightTexture.r, nightTexture.g), nightTexture.b);

    float cityPhase = dot(
      floor(vGeoUv * vec2(720.0, 360.0)),
      vec2(12.9898, 78.233)
    );
    float naturalTwinkle = 0.97 + sin(uTime * 0.88 + cityPhase) * 0.03;
    color += uCityLightColor * pow(nightLight, 1.28)
      * 0.23 * naturalTwinkle * uSkinCityGain;
    color += uSlopeLightColor * pow(max(slopeLight, 0.0), 4.0) * (0.01 + elevation * 0.04);
    color *= mix(
      0.76,
      1.1,
      smoothstep(-0.48, 0.72, normalize(vWorldRadial).y)
    );
    color *= 0.985 + breath * 0.015;
    if (uSkinReference > .5) {
      vec3 radial = normalize(vWorldRadial);
      color = referenceAerial(color,radial,normalize(cameraPosition-radial*2.06),
        uSkinRimColor,uSkinFillColor,uSkinRimCore,uSkinEdgeGain,uSkinEnvironmentGain);
    }
    float surfaceColorReveal = smoothstep(0.0, 0.12, uIntroElevation);
    vec3 flatChinaTone = mix(
      themedDaySurface,
      uFlatTone * rawLuma,
      0.86
    ) * (0.5 + sun * 0.1);
    vec3 initialChinaTone = mix(flatChinaTone, color, 0.32);
    color = mix(initialChinaTone, color, surfaceColorReveal);
    float alpha = mix(0.9, 1.0, vFacing) * uFade * uIntroReveal;
    gl_FragColor = vec4(color, alpha);
  }
`;

const chinaFlowVertexShader = /* glsl */ `
  ${focusRadiusGlsl}
  varying float vProgress;

  void main() {
    vProgress = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(normalize(position)*focusRadius(length(position)),1.0);
  }
`;

const chinaContourVertexShader = /* glsl */ `
  ${focusRadiusGlsl}
  uniform sampler2D uHeightMap;
  uniform float uElevationScale;
  uniform float uSurfaceOffset;

  vec2 chinaDemUv(vec2 geoUv) {
    float lon = geoUv.x * 360.0 - 180.0;
    float lat = geoUv.y * 180.0 - 90.0;
    return clamp(vec2((lon - 70.0) / 70.0, (lat - 15.0) / 40.0), 0.0, 1.0);
  }

  vec2 sphereGeoUv(vec3 radial) {
    const float PI = 3.141592653589793;
    float lon = atan(-radial.z, radial.x);
    float lat = asin(clamp(radial.y, -1.0, 1.0));
    return vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  }

  void main() {
    vec3 radial = normalize(position);
    float elevation = texture2D(uHeightMap, chinaDemUv(sphereGeoUv(radial))).r;
    vec3 displacedPosition = radial * (
      focusRadius(length(position) + elevation * uElevationScale + uSurfaceOffset)
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
  }
`;

const chinaContourFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uHover;

  void main() {
    gl_FragColor = vec4(uColor * (0.94 + uHover * 0.16), uOpacity * uFade);
  }
`;

const chinaFlowFragmentShader = /* glsl */ `
  uniform float uFlowProgress;
  uniform float uSkinReference;
  uniform float uFade;
  uniform float uHover;
  uniform float uIntroReveal;
  uniform vec3 uTailColor;
  uniform vec3 uHeadColor;
  varying float vProgress;

  void main() {
    float travel = fract(uFlowProgress);
    float trailDistance = fract(travel - vProgress + 1.0);
    float trail = 1.0 - smoothstep(0.0, 0.15, trailDistance);
    float head = 1.0 - smoothstep(0.0, 0.01, trailDistance);
    vec3 color = mix(uTailColor, uHeadColor, head)
      * (0.14 + trail * 0.8 + head * 0.16 + uHover * 0.12);
    float alpha = (0.008 + trail * 0.82 + head * 0.12)
      * (1.0 + uHover * 0.18) * uFade * uIntroReveal * mix(1.0,${isHologram ? '.45' : FUI_ENTITY_VISUAL_BASELINE.contourFlow.toFixed(2)},uSkinReference);
    gl_FragColor = vec4(color, alpha);
  }
`;

const chinaWallVertexShader = /* glsl */ `
  ${focusRadiusGlsl}
  uniform sampler2D uHeightMap;
  uniform float uElevationScale;
  uniform float uIntroReveal;
  uniform float uIntroElevation;
  uniform float uIntroWall;
  uniform float uSurfaceRadius;
  uniform vec3 uLightDirection;
  attribute float aDepth;
  attribute float aProgress;
  attribute vec2 aGeoUv;
  varying float vDepth;
  varying float vFacing;
  varying float vProgress;
  varying float vWallLight;

  vec2 chinaDemUv(vec2 geoUv) {
    float lon = geoUv.x * 360.0 - 180.0;
    float lat = geoUv.y * 180.0 - 90.0;
    return clamp(vec2((lon - 70.0) / 70.0, (lat - 15.0) / 40.0), 0.0, 1.0);
  }

  void main() {
    vDepth = aDepth;
    vProgress = aProgress;
    float elevation = texture2D(uHeightMap, chinaDemUv(aGeoUv)).r;
    vec3 radial = normalize(position);
    float animatedRadius = mix(
      uSurfaceRadius,
      length(position),
      uIntroWall
    );
    vec3 displacedPosition = radial * (
      focusRadius(animatedRadius
        + elevation * uElevationScale * aDepth * uIntroElevation)
    );
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vec3 radialNormal = normalize(mat3(modelMatrix) * normalize(displacedPosition));
    vec3 wallNormal = normalize(normalMatrix * normal);
    vFacing = max(dot(radialNormal, normalize(cameraPosition - worldPosition.xyz)), 0.0);
    vWallLight = 0.58 + max(dot(wallNormal, normalize(uLightDirection)), 0.0) * 0.42;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// The approved entity keeps the original complete wall response.
const chinaWallFragmentShader = /* glsl */ `
  uniform float uFade;
  uniform float uHover;
  uniform float uIntroReveal;
  uniform float uWallEdgeGlow;
  uniform vec3 uBottomColor;
  uniform vec3 uMiddleColor;
  uniform vec3 uTopColor;
  uniform vec3 uEdgeColor;
  varying float vDepth;
  varying float vFacing;
  varying float vProgress;
  varying float vWallLight;

  void main() {
    vec3 color = vDepth < 0.55
      ? mix(uBottomColor, uMiddleColor, vDepth / 0.55)
      : mix(uMiddleColor, uTopColor, (vDepth - 0.55) / 0.45);
    float lowerEdgeGlow = pow(1.0 - vDepth, 4.0) * uWallEdgeGlow;
    color += uEdgeColor * lowerEdgeGlow * 0.9;
    float ribCoordinate = fract(vProgress * 360.0);
    float verticalRib = 1.0 - smoothstep(0.035, 0.16, min(ribCoordinate, 1.0 - ribCoordinate));
    float ribFade = smoothstep(0.05, 0.9, vDepth) * (1.0 - smoothstep(0.93, 1.0, vDepth));
    color *= vWallLight * (0.74 + vFacing * 0.34 + uHover * 0.26);
    color += uEdgeColor * verticalRib * ribFade * 0.22;
    gl_FragColor = vec4(color, (0.88 + vDepth * 0.12) * uFade * uIntroReveal);
  }
`;

function lonLatToVector3(lon: number, lat: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function vector3ToLonLat(direction: THREE.Vector3) {
  const normalized = direction.clone().normalize();
  return {
    longitude: THREE.MathUtils.radToDeg(Math.atan2(-normalized.z, normalized.x)),
    latitude: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normalized.y, -1, 1))),
  };
}

function emitEarthTelemetry(elapsed: number) {
  if (!camera || !globeOrientation || !host.value || elapsed - lastTelemetryEmit < 0.12) return;
  lastTelemetryEmit = elapsed;
  const activeCamera = camera;
  const activeGlobeOrientation = globeOrientation;

  activeCamera.updateMatrixWorld();
  activeGlobeOrientation.updateWorldMatrix(true, true);
  activeGlobeOrientation.getWorldPosition(telemetryGlobeCenter);
  activeGlobeOrientation.getWorldQuaternion(telemetryWorldQuaternion);
  telemetryInverseQuaternion.copy(telemetryWorldQuaternion).invert();
  telemetryLocalView.copy(activeCamera.position)
    .sub(telemetryGlobeCenter)
    .normalize()
    .applyQuaternion(telemetryInverseQuaternion)
    .normalize();

  const { longitude, latitude } = vector3ToLonLat(telemetryLocalView);
  telemetryLocalNorth.set(0, 1, 0)
    .addScaledVector(telemetryLocalView, -telemetryLocalView.y);
  if (telemetryLocalNorth.lengthSq() < 0.000001) telemetryLocalNorth.set(0, 0, -1);
  telemetryWorldNorth.copy(telemetryLocalNorth)
    .normalize()
    .applyQuaternion(telemetryWorldQuaternion)
    .normalize();
  const heading = (
    THREE.MathUtils.radToDeg(Math.atan2(
      telemetryWorldNorth.dot(cameraRightDirection),
      telemetryWorldNorth.dot(cameraUpDirection),
    )) + 360
  ) % 360;

  const hostRect = host.value.getBoundingClientRect();
  const stageElement = host.value.closest<HTMLElement>('.center-stage');
  const stageRect = stageElement?.getBoundingClientRect() ?? hostRect;
  const anchors: Record<string, EarthTelemetryAnchor> = {};
  telemetryRegions.forEach((region) => {
    telemetryWorldPoint.copy(lonLatToVector3(region.lon, region.lat, 2.04));
    activeGlobeOrientation.localToWorld(telemetryWorldPoint);
    telemetryWorldNormal.copy(lonLatToVector3(region.lon, region.lat, 1))
      .applyQuaternion(telemetryWorldQuaternion)
      .normalize();
    telemetryViewToCamera.copy(activeCamera.position).sub(telemetryWorldPoint).normalize();
    telemetryProjectedPoint.copy(telemetryWorldPoint).project(activeCamera);
    const viewportX = hostRect.left
      + (telemetryProjectedPoint.x * 0.5 + 0.5) * hostRect.width;
    const viewportY = hostRect.top
      + (-telemetryProjectedPoint.y * 0.5 + 0.5) * hostRect.height;
    anchors[region.key] = {
      x: THREE.MathUtils.clamp((viewportX - stageRect.left) / stageRect.width, 0, 1),
      y: THREE.MathUtils.clamp((viewportY - stageRect.top) / stageRect.height, 0, 1),
      visible: telemetryWorldNormal.dot(telemetryViewToCamera) > 0.035
        && telemetryProjectedPoint.z >= -1
        && telemetryProjectedPoint.z <= 1,
    };
  });

  emit('telemetry', { longitude, latitude, heading, anchors });
}

function orientGlobeToView(lon: number, lat: number, displayDirection: THREE.Vector3) {
  if (!globeOrientation) return;
  const direction = displayDirection.clone().normalize();
  const regionDirection = lonLatToVector3(lon, lat, 1).normalize();
  const alignRegion = new THREE.Quaternion().setFromUnitVectors(regionDirection, direction);
  const rotatedNorth = new THREE.Vector3(0, 1, 0).applyQuaternion(alignRegion).projectOnPlane(direction).normalize();
  const screenNorth = new THREE.Vector3(0, 1, 0).projectOnPlane(direction).normalize();
  const rollAngle = Math.atan2(
    direction.dot(rotatedNorth.clone().cross(screenNorth)),
    THREE.MathUtils.clamp(rotatedNorth.dot(screenNorth), -1, 1),
  );
  const removeRoll = new THREE.Quaternion().setFromAxisAngle(direction, rollAngle);
  globeOrientation.quaternion.copy(removeRoll.multiply(alignRegion));
}

function isDecorativeChinaInset(feature: GeoFeatureCollection['features'][number]) {
  const code = feature.properties?.adcode ?? feature.properties?.code ?? '';
  return String(code).endsWith('_JD');
}

function getDecorativeChinaInsetSegments() {
  const source = chinaGeoJson as unknown as GeoFeatureCollection;
  return source.features
    .filter(isDecorativeChinaInset)
    .flatMap((feature) => {
      const polygons = feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates as Position[][]]
        : feature.geometry.coordinates as Position[][][];
      return polygons.map((polygon) => {
        const ring = polygon[0] ?? [];
        let start = ring[0];
        let end = ring[1];
        let maxDistanceSquared = -1;
        for (let firstIndex = 0; firstIndex < ring.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < ring.length; secondIndex += 1) {
            const lonDistance = ring[firstIndex][0] - ring[secondIndex][0];
            const latDistance = ring[firstIndex][1] - ring[secondIndex][1];
            const distanceSquared = lonDistance * lonDistance + latDistance * latDistance;
            if (distanceSquared <= maxDistanceSquared) continue;
            maxDistanceSquared = distanceSquared;
            start = ring[firstIndex];
            end = ring[secondIndex];
          }
        }
        return start && end ? { start, end } : undefined;
      });
    })
    .filter((segment): segment is { start: Position; end: Position } => Boolean(segment));
}

function getPolygonRings(source: GeoFeatureCollection = chinaGeoJson as unknown as GeoFeatureCollection) {
  const polygons: PolygonRings[] = [];
  const features = source.features.filter((feature) => !isDecorativeChinaInset(feature));
  features.forEach((feature) => {
    const geometry = feature.geometry as unknown as {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: Position[][] | Position[][][];
    };
    if (geometry.type === 'Polygon') {
      polygons.push(geometry.coordinates as Position[][]);
      return;
    }
    (geometry.coordinates as Position[][][]).forEach((polygon) => polygons.push(polygon));
  });
  return polygons;
}

function chinaBoundaryPixelKey(x: number, y: number) {
  return `${x},${y}`;
}

function simplifyChinaBoundaryRing(ring: Position[], minimumDistance = 0.045) {
  if (ring.length < 4) return ring;
  const simplified: Position[] = [ring[0]];
  for (let index = 1; index < ring.length; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = ring[index];
    if (Math.hypot(current[0] - previous[0], current[1] - previous[1]) >= minimumDistance) {
      simplified.push(current);
    }
  }
  if (simplified.length > 3) {
    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < minimumDistance) {
      simplified.pop();
    }
  }
  return simplified;
}

function getBoundaryRingSignedArea(ring: Position[]) {
  return ring.reduce((area, [x, y], index) => {
    const [nextX, nextY] = ring[(index + 1) % ring.length];
    return area + x * nextY - nextX * y;
  }, 0) * 0.5;
}

function getChinaOuterRings() {
  if (chinaOuterRingsCache) return chinaOuterRingsCache;

  const width = 2048;
  const height = 1170;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    chinaOuterRingsCache = getPolygonRings().map((rings) => rings[0]);
    return chinaOuterRingsCache;
  }

  const toPixel = ([lon, lat]: Position) => [
    ((lon - chinaBoundaryBounds.minLon)
      / (chinaBoundaryBounds.maxLon - chinaBoundaryBounds.minLon)) * width,
    ((chinaBoundaryBounds.maxLat - lat)
      / (chinaBoundaryBounds.maxLat - chinaBoundaryBounds.minLat)) * height,
  ] as const;

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  getPolygonRings().forEach((rings) => {
    const path = new Path2D();
    rings.forEach((ring) => {
      ring.forEach((coordinate, index) => {
        const [x, y] = toPixel(coordinate);
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
    });
    context.fill(path, 'evenodd');
  });

  const pixels = context.getImageData(0, 0, width, height).data;
  const isFilled = (x: number, y: number) => (
    x >= 0 && x < width && y >= 0 && y < height
    && pixels[(y * width + x) * 4 + 3] > 127
  );
  type PixelEdge = {
    start: readonly [number, number];
    end: readonly [number, number];
    used: boolean;
  };
  const edges: PixelEdge[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isFilled(x, y)) continue;
      if (!isFilled(x, y - 1)) edges.push({ start: [x, y], end: [x + 1, y], used: false });
      if (!isFilled(x + 1, y)) edges.push({ start: [x + 1, y], end: [x + 1, y + 1], used: false });
      if (!isFilled(x, y + 1)) edges.push({ start: [x + 1, y + 1], end: [x, y + 1], used: false });
      if (!isFilled(x - 1, y)) edges.push({ start: [x, y + 1], end: [x, y], used: false });
    }
  }

  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = chinaBoundaryPixelKey(edge.start[0], edge.start[1]);
    const indices = outgoing.get(key) ?? [];
    indices.push(index);
    outgoing.set(key, indices);
  });

  const pixelLoops: Array<Array<readonly [number, number]>> = [];
  edges.forEach((startEdge) => {
    if (startEdge.used) return;
    startEdge.used = true;
    const startKey = chinaBoundaryPixelKey(startEdge.start[0], startEdge.start[1]);
    let currentEdge = startEdge;
    let currentKey = chinaBoundaryPixelKey(currentEdge.end[0], currentEdge.end[1]);
    const loop: Array<readonly [number, number]> = [startEdge.start, startEdge.end];

    while (currentKey !== startKey && loop.length <= edges.length) {
      const candidates = (outgoing.get(currentKey) ?? [])
        .map((index) => edges[index])
        .filter((edge) => !edge.used);
      if (!candidates.length) break;

      const incomingX = currentEdge.end[0] - currentEdge.start[0];
      const incomingY = currentEdge.end[1] - currentEdge.start[1];
      const nextEdge = candidates.reduce((best, candidate) => {
        const candidateX = candidate.end[0] - candidate.start[0];
        const candidateY = candidate.end[1] - candidate.start[1];
        const turn = Math.atan2(
          incomingX * candidateY - incomingY * candidateX,
          incomingX * candidateX + incomingY * candidateY,
        );
        const bestX = best.end[0] - best.start[0];
        const bestY = best.end[1] - best.start[1];
        const bestTurn = Math.atan2(
          incomingX * bestY - incomingY * bestX,
          incomingX * bestX + incomingY * bestY,
        );
        return turn > bestTurn ? candidate : best;
      }, candidates[0]);

      nextEdge.used = true;
      currentEdge = nextEdge;
      currentKey = chinaBoundaryPixelKey(currentEdge.end[0], currentEdge.end[1]);
      loop.push(currentEdge.end);
    }

    if (currentKey === startKey && loop.length >= 9) pixelLoops.push(loop);
  });

  const rings = pixelLoops.map((loop) => simplifyChinaBoundaryRing(loop.map(([x, y]) => [
    chinaBoundaryBounds.minLon
      + (x / width) * (chinaBoundaryBounds.maxLon - chinaBoundaryBounds.minLon),
    chinaBoundaryBounds.maxLat
      - (y / height) * (chinaBoundaryBounds.maxLat - chinaBoundaryBounds.minLat),
  ] as Position))).filter((ring) => ring.length >= 4);

  const largestRing = rings.reduce<Position[] | undefined>((largest, ring) => (
    !largest || Math.abs(getBoundaryRingSignedArea(ring)) > Math.abs(getBoundaryRingSignedArea(largest))
      ? ring
      : largest
  ), undefined);
  const exteriorDirection = Math.sign(largestRing ? getBoundaryRingSignedArea(largestRing) : 1);
  chinaOuterRingsCache = rings.filter((ring) => (
    Math.sign(getBoundaryRingSignedArea(ring)) === exteriorDirection
  ));
  return chinaOuterRingsCache;
}

function getBoundaryRingBounds(ring: Position[]) {
  return ring.reduce((result, [lon, lat]) => ({
    minLon: Math.min(result.minLon, lon),
    maxLon: Math.max(result.maxLon, lon),
    minLat: Math.min(result.minLat, lat),
    maxLat: Math.max(result.maxLat, lat),
  }), {
    minLon: Infinity,
    maxLon: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity,
  });
}

function isTaiwanMainBoundaryRing(ring: Position[]) {
  const bounds = getBoundaryRingBounds(ring);
  return bounds.minLon >= 119.7
    && bounds.maxLon <= 122.4
    && bounds.minLat >= 21.6
    && bounds.maxLat <= 25.6
    && bounds.maxLat - bounds.minLat > 2.4;
}

function getTaiwanMainBoundaryRing() {
  if (taiwanMainRingCache) return taiwanMainRingCache;
  const source = chinaGeoJson as unknown as GeoFeatureCollection;
  const taiwanFeature = source.features.find((feature) => (
    String(feature.properties?.adcode ?? feature.properties?.code ?? '') === '710000'
    || feature.properties?.name === '台湾省'
  ));
  if (!taiwanFeature) return undefined;

  taiwanMainRingCache = getPolygonRings({
    type: 'FeatureCollection',
    features: [taiwanFeature],
  }).map((rings) => rings[0]).reduce<Position[] | undefined>((largest, ring) => {
    if (!largest) return ring;
    const bounds = getBoundaryRingBounds(ring);
    const largestBounds = getBoundaryRingBounds(largest);
    const area = (bounds.maxLon - bounds.minLon) * (bounds.maxLat - bounds.minLat);
    const largestArea = (largestBounds.maxLon - largestBounds.minLon)
      * (largestBounds.maxLat - largestBounds.minLat);
    return area > largestArea ? ring : largest;
  }, undefined);
  return taiwanMainRingCache;
}

function getChinaExtrusionRings() {
  const unionRings = getChinaOuterRings();
  const taiwanMainRing = getTaiwanMainBoundaryRing();
  if (!taiwanMainRing) return unionRings;

  return [
    ...unionRings.filter((ring) => !isTaiwanMainBoundaryRing(ring)),
    taiwanMainRing,
  ];
}

function createChinaContactShadowTexture() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  const path = new Path2D();
  getPolygonRings().forEach((rings) => {
    rings.forEach((ring) => {
      ring.forEach(([lon, lat], index) => {
        const x = ((lon + 180) / 360) * width;
        const y = ((90 - lat) / 180) * height;
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
    });
  });
  context.save();
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(255, 255, 255, 0.96)';
  context.shadowBlur = 15;
  context.shadowOffsetX = 5;
  context.shadowOffsetY = 5;
  context.fill(path, 'evenodd');
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createChinaInnerGlowTexture() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const outlinePolygons = getChinaOuterRings().map((ring) => [ring]);

  const path = new Path2D();
  outlinePolygons.forEach((rings) => {
    rings.forEach((ring) => {
      ring.forEach(([lon, lat], index) => {
        const x = ((lon + 180) / 360) * width;
        const y = ((90 - lat) / 180) * height;
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
    });
  });
  const lineCanvas = document.createElement('canvas');
  lineCanvas.width = width;
  lineCanvas.height = height;
  const lineContext = lineCanvas.getContext('2d');
  if (!lineContext) return new THREE.CanvasTexture(canvas);
  lineContext.strokeStyle = '#ffffff';
  lineContext.lineWidth = 7;
  lineContext.lineJoin = 'round';
  lineContext.lineCap = 'round';
  lineContext.stroke(path);

  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalAlpha = 0.9;
  context.filter = 'blur(26px)';
  context.drawImage(lineCanvas, 0, 0);
  context.restore();
  context.save();
  context.globalAlpha = 0.5;
  context.filter = 'blur(11px)';
  context.drawImage(lineCanvas, 0, 0);
  context.restore();

  // R preserves the original broad glow. G/B store independent inward
  // emission profiles for new skins, clipped to the true geographic silhouette.
  const profiles = [
    { width: 3, blur: 1 },
    { width: 18, blur: 8 },
  ].map(({ width: strokeWidth, blur }) => {
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const ctx = layer.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.clip(path, 'evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.filter = `blur(${blur}px)`;
    ctx.stroke(path);
    ctx.restore();
    return ctx.getImageData(0, 0, width, height).data;
  });
  const packed = context.getImageData(0, 0, width, height);
  for (let i = 0; i < packed.data.length; i += 4) {
    packed.data[i + 1] = profiles[0]?.[i] ?? packed.data[i];
    packed.data[i + 2] = profiles[1]?.[i] ?? packed.data[i];
  }
  context.putImageData(packed, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createWorldOutlines() {
  if(preparedGeography?.kind!=='surface')throw new Error('Earth coastline cache is not prepared');
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: earthTheme.earthCoastGlow,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.color = earthTheme.earthCoastGlow;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(preparedGeography.outlines, 3));
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 3;
  group.add(lines);
  fadeMaterials.push(material);
  return group;
}

function createSphericalShapeGeometry(rings: PolygonRings, radius: number, maxEdgeLength?: number) {
  const outer = rings[0];
  if (!outer || outer.length < 3) return undefined;
  const shape = new THREE.Shape(outer.map(([lon, lat]) => new THREE.Vector2(lon, lat)));
  rings.slice(1).forEach((ring) => {
    if (ring.length < 3) return;
    shape.holes.push(new THREE.Path(ring.map(([lon, lat]) => new THREE.Vector2(lon, lat))));
  });

  let geometry: THREE.BufferGeometry = new THREE.ShapeGeometry(shape);
  if (maxEdgeLength) {
    const sourceGeometry = geometry;
    geometry = new TessellateModifier(maxEdgeLength, 7).modify(sourceGeometry);
    sourceGeometry.dispose();
  }
  const positions = geometry.getAttribute('position');
  const normals = new Float32Array(positions.count * 3);
  const geoUvs = new Float32Array(positions.count * 2);
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    const lon = positions.getX(index);
    const lat = positions.getY(index);
    point.copy(lonLatToVector3(lon, lat, radius));
    positions.setXYZ(index, point.x, point.y, point.z);
    point.normalize();
    normals[index * 3] = point.x;
    normals[index * 3 + 1] = point.y;
    normals[index * 3 + 2] = point.z;
    geoUvs[index * 2] = (lon + 180) / 360;
    geoUvs[index * 2 + 1] = (lat + 90) / 180;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(geoUvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

function createTerrainContourMaterial(
  heightMap: THREE.Texture,
  color: THREE.ColorRepresentation,
  opacity: number,
  surfaceOffset: number,
  conformToTerrain: boolean,
  blending: THREE.Blending = THREE.NormalBlending,
) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHeightMap: { value: heightMap },
      uElevationScale: { value: conformToTerrain ? 0.028 : 0 },
      uSkinReference: skinUniforms.uSkinReference,
      uSurfaceOffset: { value: surfaceOffset },
      uColor: { value: color instanceof THREE.Color ? color : new THREE.Color(color) },
      uOpacity: { value: opacity },
      uFade: { value: 1 },
      uHover: { value: 0 },
    },
    vertexShader: chinaContourVertexShader,
    fragmentShader: chinaContourFragmentShader,
    transparent: true,
    depthWrite: false,
    blending,
  });
  animatedMaterials.push(material);
  return material;
}

function createFlowingOutline(ring: Position[], radius: number) {
  const hasClosingPoint = ring.length > 2
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1];
  const sourceRing = hasClosingPoint ? ring.slice(0, -1) : ring;
  const points = sourceRing.map(([lon, lat]) => lonLatToVector3(lon, lat, radius));
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
  const geometry = new THREE.TubeGeometry(
    curve,
    Math.max(420, Math.min(points.length * 2, 1400)),
    0.0062,
    5,
    true,
  );
  const flowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uFlowProgress: { value: 0 },
      uSkinReference: skinUniforms.uSkinReference,
      uFade: { value: 1 },
      uHover: { value: 0 },
      uIntroReveal: { value: 0 },
      uTailColor: { value: earthTheme.flowTail },
      uHeadColor: { value: earthTheme.flowHead },
    },
    vertexShader: chinaFlowVertexShader,
    fragmentShader: chinaFlowFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  flowMaterial.userData.introLayer = 'china-effects';
  animatedMaterials.push(flowMaterial);
  const flow = new THREE.Mesh(geometry, flowMaterial);
  flow.renderOrder = 9;
  return flow;
}

function createOuterGlowTube(ring: Position[], radius: number) {
  const hasClosingPoint = ring.length > 2
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1];
  const sourceRing = hasClosingPoint ? ring.slice(0, -1) : ring;
  const points = sourceRing.map(([lon, lat]) => lonLatToVector3(lon, lat, radius));
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
  const geometry = new THREE.TubeGeometry(
    curve,
    Math.max(320, Math.min(points.length * 2, 1200)),
    0.0042,
    4,
    true,
  );
  const material = new THREE.MeshBasicMaterial({
    color: earthTheme.chinaOuterGlow,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.color = earthTheme.chinaOuterGlow;
  material.userData.baseOpacity = 0.09;
  chinaRevealMaterials.push(material);
  fadeMaterials.push(material);
  const glow = new THREE.Mesh(geometry, material);
  glow.renderOrder = 8;
  return glow;
}

function createChinaJdDashedLines(radius: number) {
  const group = new THREE.Group();
  const material = new THREE.LineDashedMaterial({
    color: earthTheme.outline,
    transparent: true,
    opacity: 0.68,
    dashSize: 0.025,
    gapSize: 0.014,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.color = earthTheme.outline;
  material.userData.baseOpacity = 0.68;
  material.userData.introOnly = true;
  chinaRevealMaterials.push(material);
  fadeMaterials.push(material);

  getDecorativeChinaInsetSegments().forEach(({ start, end }) => {
    const angularSpan = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const segmentCount = Math.max(4, Math.ceil(angularSpan / 0.12));
    const points = Array.from({ length: segmentCount + 1 }, (_, index) => {
      const progress = index / segmentCount;
      return lonLatToVector3(
        THREE.MathUtils.lerp(start[0], end[0], progress),
        THREE.MathUtils.lerp(start[1], end[1], progress),
        radius,
      );
    });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      material,
    );
    line.computeLineDistances();
    line.renderOrder = 7;
    group.add(line);
  });

  return group;
}

function createChinaRegion(
  radius: number,
  heightMap: THREE.Texture,
  normalMap: THREE.Texture,
  dayMap: THREE.Texture,
  nightMap: THREE.Texture,
  innerGlowMap: THREE.Texture,
) {
  const polygons = getPolygonRings();
  const extrusionPolygons = getChinaExtrusionRings().map((ring) => [ring]);
  const geometries = measureEarthBuild('china-triangulation',()=>polygons
    .map((rings) => createSphericalShapeGeometry(rings, radius, 0.8))
    .filter((geometry): geometry is THREE.BufferGeometry => Boolean(geometry)));
  const mergedGeometry = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHover: { value: 0 },
      uFade: { value: 1 },
      uIntroReveal: { value: 0 },
      uIntroElevation: { value: 0 },
      uColor: { value: earthTheme.chinaSurface },
      ...earthResources!.uniforms('china'),
      uLightDirection: { value: baseLightDirection.clone() },
      uInnerGlowPulse: { value: 1 },
      uSweepProgress: { value: 0 },
      uSweepSurfaceStrength: { value: 0.875 },
      uSweepEnergy: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSweepColor: { value: earthTheme.sweep },
      uAccentSoft: { value: earthTheme.chinaSweep },
      uRidgeColor: { value: earthTheme.chinaRidge },
      uInnerGlowColor: { value: earthTheme.chinaInnerGlow },
      uCityLightColor: { value: earthTheme.chinaCityLight },
      uSlopeLightColor: { value: earthTheme.chinaSlopeLight },
      uFlatTone: { value: earthTheme.chinaFlatTone },
      uPlainTone: { value: earthTheme.chinaPlainTone },
      uPlateauTone: { value: earthTheme.chinaPlateauTone },
      uDrylandTone: { value: earthTheme.chinaDrylandTone },
      uForestTone: { value: earthTheme.chinaForestTone },
      uNortheastTone: { value: earthTheme.chinaNortheastTone },
      uSurfaceRecolorAmount: { value: earthTheme.surfaceRecolorAmount },
      ...skinUniforms,
      uElevationScale: { value: 0.028 },
    },
    vertexShader: chinaVertexShader,
    fragmentShader: chinaFragmentShader,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  material.userData.introLayer = 'china-surface';
  material.userData.chinaTerrainLight = true;
  animatedMaterials.push(material);
  const mesh = new THREE.Mesh(mergedGeometry, material);
  mesh.renderOrder = 5;

  const outlineGroup = new THREE.Group();
  const extrusionGroup = new THREE.Group();
  const innerRadius = 2.004;
  outlineGroup.add(createChinaJdDashedLines(radius + 0.016));
  polygons.forEach((rings) => {
    rings.forEach((ring) => {
      if (ring.length < 2) return;
      const points = ring.map(([lon, lat]) => lonLatToVector3(lon, lat, radius + 0.012));
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const glowMaterial = new THREE.LineBasicMaterial({
        color: earthTheme.chinaInnerOutline,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
  glowMaterial.color = earthTheme.chinaInnerOutline;
      glowMaterial.userData.baseOpacity = 0.14;
      chinaRevealMaterials.push(glowMaterial);
      const glowLine = new THREE.LineLoop(lineGeometry, glowMaterial);
      glowLine.renderOrder = 6;
      outlineGroup.add(glowLine);
      fadeMaterials.push(glowMaterial);
    });
  });

  extrusionPolygons.forEach((rings) => {
    rings.forEach((ring) => {
      if (ring.length < 2) return;
      const material = new THREE.LineBasicMaterial({
        color: earthTheme.outline,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
  material.color = earthTheme.outline;
      material.userData.baseOpacity = 0.48;
      chinaRevealMaterials.push(material);
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          ring.map(([lon, lat]) => lonLatToVector3(lon, lat, radius + 0.014)),
        ),
        material,
      );
      line.renderOrder = 7;
      outlineGroup.add(line);
      fadeMaterials.push(material);
    });
  });

  const mainOuterRing = extrusionPolygons
    .flatMap((rings) => rings.slice(0, 1))
    .reduce<Position[] | undefined>((longest, ring) => {
      if (!longest) return ring;
      return ring.length > longest.length ? ring : longest;
  }, undefined);
  if (mainOuterRing) {
    outlineGroup.add(createOuterGlowTube(mainOuterRing, radius + 0.02));
    outlineGroup.add(createFlowingOutline(mainOuterRing, radius + 0.03));
  }

  extrusionPolygons.forEach((rings) => {
    rings.forEach((ring) => {
      if (ring.length < 2) return;
      const wallPositions: number[] = [];
      const wallDepths: number[] = [];
      const wallProgress: number[] = [];
      const wallGeoUvs: number[] = [];
      const wallIndices: number[] = [];
      for (let index = 0; index < ring.length; index += 1) {
        const [lon, lat] = ring[index];
        const bottom = lonLatToVector3(lon, lat, innerRadius);
        const top = lonLatToVector3(lon, lat, radius);
        wallPositions.push(bottom.x, bottom.y, bottom.z, top.x, top.y, top.z);
        wallDepths.push(0, 1);
        const progress = index / Math.max(ring.length - 1, 1);
        wallProgress.push(progress, progress);
        const geoU = (lon + 180) / 360;
        const geoV = (lat + 90) / 180;
        wallGeoUvs.push(geoU, geoV, geoU, geoV);
      }
      for (let index = 0; index < ring.length - 1; index += 1) {
        const next = index + 1;
        wallIndices.push(index * 2, next * 2, index * 2 + 1);
        wallIndices.push(next * 2, next * 2 + 1, index * 2 + 1);
      }
      const wallGeometry = new THREE.BufferGeometry();
      wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
      wallGeometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(wallDepths, 1));
      wallGeometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(wallProgress, 1));
      wallGeometry.setAttribute('aGeoUv', new THREE.Float32BufferAttribute(wallGeoUvs, 2));
      wallGeometry.setIndex(wallIndices);
      wallGeometry.computeVertexNormals();
      const wallMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uFade: { value: 1 },
          uHover: { value: 0 },
          uIntroReveal: { value: 0 },
          uIntroElevation: { value: 0 },
          uIntroWall: { value: 0 },
          uWallEdgeGlow: { value: 0 },
          uSurfaceRadius: { value: radius },
          uSkinReference: skinUniforms.uSkinReference,
          uHeightMap: { value: heightMap },
          uElevationScale: { value: 0.028 },
          uLightDirection: { value: baseLightDirection.clone() },
          uBottomColor: { value: earthTheme.wallBottom },
          uMiddleColor: { value: earthTheme.wallMiddle },
          uTopColor: { value: earthTheme.wallTop },
          uEdgeColor: { value: earthTheme.wallEdge },
        },
        vertexShader: chinaWallVertexShader,
        fragmentShader: chinaWallFragmentShader,
        transparent: true,
        depthWrite: true,
        side: THREE.DoubleSide,
      });
      wallMaterial.userData.introLayer = 'china-wall';
      animatedMaterials.push(wallMaterial);
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.renderOrder = 4;
      extrusionGroup.add(wall);

      const bottomRadius = innerRadius - 0.004;
      const bottomMaterial = new THREE.LineBasicMaterial({
        color: bottomEdgeBaseColor,
        transparent: true,
        opacity: 0.54,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const bottomLine = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          ring.map(([lon, lat]) => lonLatToVector3(lon, lat, bottomRadius)),
        ),
        bottomMaterial,
      );
      const startScale = (radius + 0.014) / bottomRadius;
      bottomLine.scale.setScalar(startScale);
      bottomLine.renderOrder = 8;
      extrusionGroup.add(bottomLine);
      bottomMaterial.userData.baseOpacity = 0.54;
      bottomMaterial.userData.introOnly = true;
      chinaBottomEdges.push({ line: bottomLine, startScale });
      chinaRevealMaterials.push(bottomMaterial);
      fadeMaterials.push(bottomMaterial);
    });
  });

  for (const layer of [outlineGroup,extrusionGroup]) layer.traverse((object) => {
    if (!(object instanceof THREE.Line || object instanceof THREE.Mesh)) return;
    const ink = object.material;
    if (!(ink instanceof THREE.LineBasicMaterial || ink instanceof THREE.MeshBasicMaterial)) return;
    ink.onBeforeCompile = (shader) => {
      shader.uniforms.uSkinReference = skinUniforms.uSkinReference;
      shader.vertexShader = focusRadiusGlsl + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n transformed = normalize(transformed)*focusRadius(length(transformed));',
      );
    };
    ink.customProgramCacheKey = () => 'fui-focus-radius-v1';
  });
  return { mesh, outlineGroup, extrusionGroup };
}

function createStars() {
  const group = new THREE.Group();
  const createLayer = (
    count: number,
    minRadius: number,
    maxRadius: number,
    size: number,
    baseOpacity: number,
    rotationDuration: number,
    rotationDirection: number,
    twinkleDuration: number,
    twinkleStrength: number,
    phase: number,
  ) => {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = THREE.MathUtils.randFloat(minRadius, maxRadius);
      const direction = new THREE.Vector3().randomDirection().multiplyScalar(radius);
      positions[index * 3] = direction.x;
      positions[index * 3 + 1] = direction.y;
      positions[index * 3 + 2] = direction.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: earthTheme.star,
      size,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  material.color = earthTheme.star;
    material.userData.baseOpacity = baseOpacity;
    const points = new THREE.Points(geometry, material);
    starLayers.push({
      points,
      baseOpacity,
      rotationDuration,
      rotationDirection,
      twinkleDuration,
      twinkleStrength,
      phase,
    });
    starMaterials.push(material);
    fadeMaterials.push(material);
    group.add(points);
  };

  createLayer(900, 15, 36, 0.014, 0.48, 148, 1, 8.6, 0.045, 0.4);
  createLayer(400, 10, 25, 0.022, 0.32, 84, -1, 5.9, 0.065, 1.7);
  return group;
}

function createFlyNode(
  lon: number,
  lat: number,
  radius: number,
  isHub: boolean,
  pulseStartOffset: number,
  cycleDuration: number,
) {
  const group = new THREE.Group();
  const normal = lonLatToVector3(lon, lat, 1).normalize();
  const position = normal.clone().multiplyScalar(radius);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: isHub ? earthTheme.nodeHub : earthTheme.node,
    transparent: true,
    opacity: isHub ? 0.82 : 0.58,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  coreMaterial.color = isHub ? earthTheme.nodeHub : earthTheme.node;
  coreMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uSkinReference = skinUniforms.uSkinReference;
    shader.vertexShader = 'uniform float uSkinReference;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', `#include <begin_vertex>\n transformed *= mix(1.0,${isHologram ? '.58' : FUI_ENTITY_VISUAL_BASELINE.nodeCoreScale.toFixed(2)},uSkinReference);`,
    );
  };
  coreMaterial.customProgramCacheKey = () => 'fui-network-core-v1';
  coreMaterial.userData.baseOpacity = coreMaterial.opacity;
  flyNodeCoreMaterials.push(coreMaterial);
  fadeMaterials.push(coreMaterial);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(isHub ? 0.017 : 0.0105, 14, 10),
    coreMaterial,
  );
  core.position.copy(position);
  core.renderOrder = 13;
  group.add(core);

  const ringRadius = isHub ? 0.033 : 0.022;
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: isHub ? earthTheme.ringHub : earthTheme.ring,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  ringMaterial.color = isHub ? earthTheme.ringHub : earthTheme.ring;
  ringMaterial.userData.baseOpacity = isHub ? 0.28 : 0.22;
  fadeMaterials.push(ringMaterial);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(ringRadius * 0.7, ringRadius, 32),
    ringMaterial,
  );
  ring.position.copy(normal).multiplyScalar(radius + 0.003);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  ring.renderOrder = 12;
  group.add(ring);
  flyNodePulses.push({ ring, startOffset: pulseStartOffset, cycleDuration });
  return group;
}

function createInternationalFlyNetwork() {
  const group = new THREE.Group();
  const routes = [
    { lon: 37.6173, lat: 55.7558 },
    { lon: 139.6917, lat: 35.6895 },
    { lon: 103.8198, lat: 1.3521 },
    { lon: 55.2708, lat: 25.2048 },
    { lon: 8.6821, lat: 50.1109 },
    { lon: 151.2093, lat: -33.8688 },
    { lon: 77.209, lat: 28.6139 },
    { lon: 106.8456, lat: -6.2088 },
  ];
  const hub = { lon: 116.4074, lat: 39.9042 };
  const hubRadius = 2.094;
  const targetRadius = 2.043;
  group.add(createFlyNode(
    hub.lon,
    hub.lat,
    hubRadius,
    true,
    0,
    2.6,
  ));

  routes.forEach((route, routeIndex) => {
    const startDirection = lonLatToVector3(hub.lon, hub.lat, 1).normalize();
    const endDirection = lonLatToVector3(route.lon, route.lat, 1).normalize();
    const axis = new THREE.Vector3().crossVectors(startDirection, endDirection);
    if (axis.lengthSq() < 0.000001) axis.set(0, 1, 0);
    else axis.normalize();
    const angle = startDirection.angleTo(endDirection);
    const arcHeight = THREE.MathUtils.clamp(0.075 + angle / Math.PI * 0.2, 0.085, 0.22);
    const segmentCount = Math.ceil(90 + angle * 48);
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      const direction = startDirection.clone().applyAxisAngle(axis, angle * t).normalize();
      const surfaceRadius = THREE.MathUtils.lerp(hubRadius, targetRadius, t);
      const flightRadius = surfaceRadius + Math.sin(Math.PI * t) * arcHeight;
      points.push(direction.multiplyScalar(flightRadius));
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const trackGeometry = new THREE.TubeGeometry(curve, segmentCount, 0.0031, 5, false);
    const trackMaterial = new THREE.MeshBasicMaterial({
      color: earthTheme.flyTrack,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  trackMaterial.color = earthTheme.flyTrack;
    trackMaterial.userData.baseOpacity = 0.08;
    flyTrackMaterials.push(trackMaterial);
    fadeMaterials.push(trackMaterial);
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.renderOrder = 10;
    group.add(track);

    const dynamicGeometry = new THREE.TubeGeometry(curve, segmentCount, 0.0058, 5, false);
    const tubeUvs = dynamicGeometry.getAttribute('uv');
    const tubeProgress = new Float32Array(tubeUvs.count);
    for (let index = 0; index < tubeUvs.count; index += 1) {
      tubeProgress[index] = tubeUvs.getX(index);
    }
    dynamicGeometry.setAttribute('aProgress', new THREE.BufferAttribute(tubeProgress, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 1 },
        uStartOffset: { value: flyLaunchOffset },
        uCycleDuration: { value: motionCycleDuration },
        uTravelDuration: { value: flyTravelDuration },
        uArrivalFadeDuration: { value: 0.9 },
        uNetworkReveal: { value: 0 },
        uIdleCurrentStrength: { value: 0.038 },
        uSkinFlightPrecision: skinUniforms.uSkinFlightPrecision,
        uTrailColor: { value: earthTheme.flyTrail },
        uHeadColor: { value: earthTheme.flyHead },
      },
      vertexShader: flyLineVertexShader,
      fragmentShader: flyLineFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    material.userData.motionTimeline = true;
    animatedMaterials.push(material);
    const line = new THREE.Mesh(dynamicGeometry, material);
    line.renderOrder = 11;
    group.add(line);
    group.add(createFlyNode(
      route.lon,
      route.lat,
      targetRadius,
      false,
      routeIndex * 0.31,
      2.8,
    ));
  });
  return group;
}

const earthResourceUrls={height:chinaHeightUrl,chinaNormal:chinaNormalUrl,day:earthDayUrl,normal:earthNormalUrl,specular:earthSpecularUrl,relief:earthReliefUrl,photoRelief:earthPhotographicReliefUrl,photograph:earthPhotographicUrl,clouds:earthCloudsUrl,lights:earthLightsUrl,nightDetail:earthNightDetailUrl,innerGlow:chinaInnerGlowUrl,glassEdges:chinaGlassEdgesUrl};

const earthBuildTimes:{phase:string;ms:number}[]=[];
function measureEarthBuild<T>(phase:string,build:()=>T):T{
  const started=performance.now();try{return build();}finally{earthBuildTimes.push({phase,ms:+(performance.now()-started).toFixed(1)});}
}

// One factory for the validated Earth lighting in both presentations.
// Keep these materials, shell dimensions and animation metadata shared.
function createEarthAtmosphere(){
  if(!globeOrientation)return;
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uShellRadius: { value: 2.045 },
      uHologramVolume: { value: isHologram ? 1 : 0 },
      uColor: { value: earthTheme.atmosphere },
      uSkinReference: skinUniforms.uSkinReference,
      uHoneycombMode: skinUniforms.uHoneycombMode,
      uSkinEnvironmentGain: skinUniforms.uSkinEnvironmentGain,
      uSkinEdgeGain: skinUniforms.uSkinEdgeGain,
      uSkinAtmosphereGain: skinUniforms.uSkinAtmosphereGain,
      uRimCore: { value: earthTheme.rimCore },
      uFillColor: { value: earthTheme.atmosphereFill },
      uFade: { value: 1 },
      uIntensity: { value: 0.24 * materialForPresentation(renderedEarthSkin).atmosphereGain },
      uLightDirection: { value: baseLightDirection.clone() },
      uSweepProgress: { value: 0 },
      uSweepStrength: { value: 0 },
      uSweepEnergy: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSweepColor: { value: earthTheme.atmosphereSweep },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: !isHologram,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  atmosphereMaterial.userData.baseIntensity = 0.24 * materialForPresentation(renderedEarthSkin).atmosphereGain;
  atmosphereMaterial.userData.skinAtmosphereBase = 0.24;
  animatedMaterials.push(atmosphereMaterial);
  globeOrientation.add(new THREE.Mesh(new THREE.SphereGeometry(2.045, 96, 64), atmosphereMaterial));

  const outerGlowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uShellRadius: { value: 2.09 },
      uHologramVolume: { value: isHologram ? 1 : 0 },
      uColor: { value: earthTheme.outerAtmosphere },
      uSkinReference: skinUniforms.uSkinReference,
      uHoneycombMode: skinUniforms.uHoneycombMode,
      uSkinEnvironmentGain: skinUniforms.uSkinEnvironmentGain,
      uSkinEdgeGain: skinUniforms.uSkinEdgeGain,
      uSkinAtmosphereGain: skinUniforms.uSkinAtmosphereGain,
      uRimCore: { value: earthTheme.rimCore },
      uFillColor: { value: earthTheme.atmosphereFill },
      uFade: { value: 1 },
      uIntensity: { value: (renderedEarthSkin === 'original' ? 0.02 : 0.08) * materialForPresentation(renderedEarthSkin).atmosphereGain },
      uLightDirection: { value: baseLightDirection.clone() },
      uSweepProgress: { value: 0 },
      uSweepStrength: { value: 0 },
      uSweepEnergy: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSweepColor: { value: earthTheme.atmosphereSweep },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: !isHologram,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  outerGlowMaterial.userData.baseIntensity = (renderedEarthSkin === 'original' ? 0.02 : 0.08) * materialForPresentation(renderedEarthSkin).atmosphereGain;
  outerGlowMaterial.userData.skinAtmosphereBase = 0.02;
  outerGlowMaterial.userData.skinOuterAtmosphere = true;
  animatedMaterials.push(outerGlowMaterial);
  globeOrientation.add(new THREE.Mesh(new THREE.SphereGeometry(2.09, 96, 64), outerGlowMaterial));

  const sweepLightMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uShellRadius: { value: 2.065 },
      uHologramVolume: { value: isHologram ? 1 : 0 },
      uColor: { value: scanTheme.sweep },
      uSkinReference: skinUniforms.uSkinReference,
      uHoneycombMode: skinUniforms.uHoneycombMode,
      uSkinEnvironmentGain: skinUniforms.uSkinEnvironmentGain,
      uSkinEdgeGain: skinUniforms.uSkinEdgeGain,
      uSkinAtmosphereGain: skinUniforms.uSkinAtmosphereGain,
      uRimCore: { value: earthTheme.rimCore },
      uFillColor: { value: earthTheme.atmosphereFill },
      uFade: { value: 1 },
      uIntensity: { value: 0 },
      uLightDirection: { value: baseLightDirection.clone() },
      uSweepProgress: { value: 0 },
      uHoneycombColor: { value: scanTheme.sweep },
      uSkinScanGain: skinUniforms.uSkinScanGain,
      uGridColor: { value: scanTheme.grid },
      uGridDotSweepColor: { value: scanTheme.gridDotSweep },
      uSweepGridStrength: { value: 1 },
      uSweepStrength: { value: sweepStrengthForPresentation(renderedEarthSkin) },
      uSweepEnergy: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSweepColor: { value: scanTheme.atmosphereSweep },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: !isHologram,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  // Hollow oceans expose the far side; show the same scan once on the near shell.
  if(isHologram)sweepLightMaterial.side=THREE.FrontSide;
  sweepLightMaterial.userData.skinSweep = true;
  animatedMaterials.push(sweepLightMaterial);
  const sweepLight = new THREE.Mesh(
    new THREE.SphereGeometry(2.14, 96, 64),
    sweepLightMaterial,
  );
  sweepLight.renderOrder = 2;
  globeOrientation.add(sweepLight);

}

function createHolographicScene(){
  if(!scene||!renderer||!host.value)return;
  const stars=measureEarthBuild('stars',createStars);
  stars.traverse(object=>{if(object instanceof THREE.Points&&object.material instanceof THREE.PointsMaterial)object.material.depthTest=false;});
  scene.add(stars);
  spinGroup=new THREE.Group();idleDriftGroup=new THREE.Group();globeOrientation=new THREE.Group();
  spinGroup.add(idleDriftGroup);idleDriftGroup.add(globeOrientation);scene.add(spinGroup);
  const chinaSurfaceGeometry=measureEarthBuild('hologram-China-tessellation',()=>{
    const pieces=getPolygonRings().map(rings=>createSphericalShapeGeometry(rings,2,.8)).filter((value):value is THREE.BufferGeometry=>Boolean(value));
    const combined=mergeGeometries(pieces,false);pieces.forEach(value=>value.dispose());return combined;
  });
  if(!chinaSurfaceGeometry)throw new Error('China hologram surface geometry is missing');
  if(earthHalfFloat)hologramEnvironment=measureEarthBuild('hologram-glass-environment',()=>createFuiMapGlassEnvironment(renderer!));
  if(preparedGeography?.kind!=='hologram')throw new Error('Earth hologram cache is not prepared');
  const mask=preparedGeography.mask;
  hologram=measureEarthBuild('regular-geographic-hologram',()=>createFuiEarthHologram(undefined,chinaGeoJson as unknown as GeoFeatureCollection,renderedEarthSkin,getChinaOuterRings(),animatedLightDirection,props.earthPresentation==='hologram-hex'?'hex':'dots',{
    glsl:referenceAtmosphereOptics+hologramAerialShader,
    environment:hologramEnvironment?.texture??neutralHologramEnvironment(),
    uniforms:{uSkinRimColor:skinUniforms.uSkinRimColor,uSkinFillColor:skinUniforms.uSkinFillColor,uSkinRimCore:skinUniforms.uSkinRimCore,uSkinEdgeGain:skinUniforms.uSkinEdgeGain,uSkinEnvironmentGain:skinUniforms.uSkinEnvironmentGain},
  },chinaSurfaceGeometry,mask));
  hologram.resize(host.value.clientHeight,renderer.getPixelRatio());globeOrientation.add(hologram.group);
  animatedMaterials.push(...hologram.materials);
  // The shared optical shell integrates only real air, leaving the body open.
  createEarthAtmosphere();
  const hitGeometry=chinaSurfaceGeometry.clone();
  const hitMaterial=new THREE.ShaderMaterial({uniforms:{uHover:hologram.uniforms.uHover},side:THREE.DoubleSide});
  chinaMesh=new THREE.Mesh(hitGeometry,hitMaterial);chinaMesh.visible=false;chinaMesh.name='hologram-china-hit-region';globeOrientation.add(chinaMesh);
  host.value.dataset.hologram=JSON.stringify(hologram.diagnostics);
  orientGlobeToView(103.6,35.2,camera!.position.clone().normalize());
}

function createEarthScene() {
  if (!scene) return;
  if(isHologram){createHolographicScene();return;}
  scene.add(measureEarthBuild('stars',createStars));
  const textureLoader={load:(url:string)=>earthResources!.get((Object.keys(earthResourceUrls) as (keyof typeof earthResourceUrls)[]).find(id=>earthResourceUrls[id]===url)!)};
  const heightMap = textureLoader.load(chinaHeightUrl);
  const chinaNormalMap = textureLoader.load(chinaNormalUrl);
  const dayMap = textureLoader.load(earthDayUrl);
  const earthNormalMap = textureLoader.load(earthNormalUrl);
  const specularMap = textureLoader.load(earthSpecularUrl);
  const reliefMap = textureLoader.load(earthReliefUrl);
  const photographicMap = textureLoader.load(earthPhotographicUrl);
  const cloudMap = textureLoader.load(earthCloudsUrl);
  const nightMap = textureLoader.load(earthLightsUrl);
  const nightDetailMap = textureLoader.load(earthNightDetailUrl);
  const chinaContactShadowMap = measureEarthBuild('contact-atlas',createChinaContactShadowTexture);
  // Exact original Canvas raster, baked once instead of recomputed per refresh.
  const chinaInnerGlowMap = textureLoader.load(chinaInnerGlowUrl);
  earthResources!.addGenerated('contact',chinaContactShadowMap);

  spinGroup = new THREE.Group();
  idleDriftGroup = new THREE.Group();
  globeOrientation = new THREE.Group();
  spinGroup.add(idleDriftGroup);
  idleDriftGroup.add(globeOrientation);
  scene.add(spinGroup);

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 1 },
      uIntroReveal: { value: 0 },
      uGridColor: { value: earthTheme.grid },
      uLightDirection: { value: baseLightDirection.clone() },
      uSweepProgress: { value: 0 },
      uSweepGridStrength: { value: 1 },
      uSweepSurfaceStrength: { value: 0.88 },
      uSweepEnergy: { value: 1 },
      uGridBreath: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSurfaceTint: { value: earthTheme.earthTint },
      uEarthGrade: { value: earthTheme.earthGrade },
      uShadowFloorColor: { value: earthTheme.earthShadowFloor },
      uTopLightColor: { value: earthTheme.earthTopLight },
      uMidToneColor: { value: earthTheme.earthMidTone },
      uBottomShadeColor: { value: earthTheme.earthBottomShade },
      uOceanHighlightColor: { value: earthTheme.oceanHighlight },
      uChinaFocusColor: { value: earthTheme.chinaFocus },
      uSurfaceRecolorAmount: { value: earthTheme.surfaceRecolorAmount },
      ...skinUniforms,
      uSweepSurfaceColor: { value: earthTheme.sweepSurface },
      uGridDotColor: { value: earthTheme.gridDot },
      uGridDotSweepColor: { value: earthTheme.gridDotSweep },
      uCityLightColor: { value: earthTheme.earthCityLight },
      ...earthResources!.uniforms('globe'),
      uChinaContact: { value: 0 },
      uChinaFocus: { value: 0 },
    },
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  earthMaterial.userData.introLayer = 'earth';
  animatedMaterials.push(earthMaterial);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(2, 128, 96), earthMaterial);
  globeOrientation.add(earth);

  globeOrientation.add(measureEarthBuild('world-outlines',createWorldOutlines));

  createEarthAtmosphere();

  const china = createChinaRegion(
    2.052,
    heightMap,
    chinaNormalMap,
    dayMap,
    nightMap,
    chinaInnerGlowMap,
  );
  chinaMesh = china.mesh;
  const chinaMaterial = china.mesh.material as THREE.ShaderMaterial;
  chinaOutlineGroup = china.outlineGroup;
  chinaExtrusionGroup = china.extrusionGroup;
  chinaIntroPivot = new THREE.Group();
  chinaIntroPivot.position.copy(chinaPivotStartPosition);
  chinaIntroPivot.scale.setScalar(0.9);
  const chinaPivotOffset = chinaPivotFinalPosition.clone().multiplyScalar(-1);
  chinaExtrusionGroup.position.copy(chinaPivotOffset);
  chinaMesh.position.copy(chinaPivotOffset);
  chinaOutlineGroup.position.copy(chinaPivotOffset);
  chinaIntroPivot.add(chinaExtrusionGroup, chinaMesh, chinaOutlineGroup);
  globeOrientation.add(chinaIntroPivot);
  globeOrientation.add(measureEarthBuild('flight-network',createInternationalFlyNetwork));

  orientGlobeToView(103.6, 35.2, new THREE.Vector3(0.025, 0.065, 1));
}

function updatePointer(event: PointerEvent) {
  if (!renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function hitChina(event: PointerEvent) {
  if (!camera || !chinaMesh) return false;
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits=raycaster.intersectObject(chinaMesh,false);
  if(isHologram&&globeOrientation){
    const view=globeOrientation.worldToLocal(camera.position.clone());
    return hits.some(hit=>globeOrientation!.worldToLocal(hit.point.clone()).dot(view)>4.03);
  }
  return hits.length>0;
}

function onPointerMove(event: PointerEvent) {
  if (isTransitioning.value) return;
  pointerInside = true;
  hoverTarget = hitChina(event) ? 1 : 0;
  if (renderer?.domElement) renderer.domElement.style.cursor = hoverTarget ? 'pointer' : 'grab';
}

function onPointerEnter() {
  pointerInside = true;
}

function onPointerLeave() {
  pointerInside = false;
  hoverTarget = 0;
  if (renderer?.domElement) renderer.domElement.style.cursor = 'grab';
}

function onControlsStart() {
  controlsInteracting = true;
}

function onControlsEnd() {
  controlsInteracting = false;
}

let handoffSnapshot:{pixelRatio:number;composerPixelRatio:number;scale:THREE.Vector3;target:THREE.Vector3;position:THREE.Vector3;fades:Array<{uniform:{value:number};value:number}>;opacities:Array<{material:THREE.Material;value:number}>}|undefined;
let entryGateVersion=0,entryGatePending=false;
function returnFromChina(){
  entryGateVersion++;entryGatePending=false;
  transitionTimeline?.kill();
  if(!handoffSnapshot||!camera||!spinGroup)return;
  camera.position.copy(handoffSnapshot.position);cameraTarget.copy(handoffSnapshot.target);
  spinGroup.scale.copy(handoffSnapshot.scale);
  handoffSnapshot.fades.forEach(item=>item.uniform.value=item.value);
  handoffSnapshot.opacities.forEach(item=>item.material.opacity=item.value);
  if(renderer){renderer.setPixelRatio(earthPixelRatio());renderer.domElement.style.opacity='1';}
  composer?.setPixelRatio(earthPixelRatio());
  resize();
  const backdrop=host.value?.querySelector<HTMLElement>('.earth-backdrop');if(backdrop)backdrop.style.opacity='1';
  isTransitioning.value=false;hoverTarget=0;
  if(controls){controls.enabled=true;controls.target.copy(cameraTarget);controls.update();}
  camera.lookAt(cameraTarget);
  emit('intro-ready');
}
function getOpticsDiagnostics(){
  return{fill:earthTheme.atmosphereFill.toArray(),scatter:earthTheme.atmosphere.toArray(),fillEnergy:linearLightEnergy(earthTheme.atmosphereFill),fillPolicy:isHologram&&renderedEarthSkin!=='original'?'emissive-equal-energy':'earth'};
}
function getLightingDiagnostics(){
  return{outputMode:earthHalfFloat?'hdr':'ldr',hologramEnvironment:isHologram?(hologramEnvironment?'pmrem':'neutral-rgba8'):'none',targetType:composer?.renderTarget1.texture.type,toneMapping:renderer?.toneMapping,exposure:renderer?.toneMappingExposure,bloom:{enabled:Boolean(bloomPass?.enabled),strength:bloomPass?.strength,radius:bloomPass?.radius,threshold:bloomPass?.threshold},atmosphere:animatedMaterials.filter(material=>material.fragmentShader===atmosphereFragmentShader).map(material=>({radius:material.uniforms.uShellRadius.value,base:material.userData.skinAtmosphereBase??0}))};
}
defineExpose({returnFromChina,retrySkin,enterChina:()=>enterChina(),getDiagnostics:()=>({phase:loadPhase.value,skin:renderedEarthSkin,requested:props.skin,resources:earthResources?.diagnostics(),required:isHologram?[]:requiredEarthResources(earthFamily(renderedEarthSkin)),presentation:props.earthPresentation,hologram:hologram?{...hologram.diagnostics,focusRadius:hologram.getFocusRadius()}:undefined,lighting:getLightingDiagnostics(),optics:getOpticsDiagnostics(),timings:{...host.value?.dataset},ready:hasEmittedIntroReady})});

async function enterChina(event?: PointerEvent) {
  const hostElement = host.value;
  if (introValue < 1 || isTransitioning.value || entryGatePending || !hostElement || !renderer || !camera || !spinGroup || !globeOrientation) return;
  if(event&&hoverTarget < 0.5 && !hitChina(event))return;
  const gateVersion=++entryGateVersion;entryGatePending=true;
  let prepared=true;
  try{if(props.beforeEnterChina)prepared=await props.beforeEnterChina();}catch{prepared=false;}
  finally{if(gateVersion===entryGateVersion)entryGatePending=false;}
  if(!prepared||gateVersion!==entryGateVersion||!props.active||!hostElement.isConnected||!renderer||!camera||!spinGroup||!globeOrientation)return;
  handoffSnapshot={pixelRatio:renderer.getPixelRatio(),composerPixelRatio:earthPixelRatio(),scale:spinGroup.scale.clone(),position:camera.position.clone(),target:cameraTarget.clone(),
    fades:animatedMaterials.map(material=>({uniform:material.uniforms.uFade,value:material.uniforms.uFade.value})),
    opacities:fadeMaterials.map(material=>({material,value:material.opacity}))};
  isTransitioning.value = true;
  controls?.saveState();
  if (controls) controls.enabled = false;
  hoverTarget = 1;

  chinaCenter.copy(lonLatToVector3(103.6, 35.2, 2.078));
  globeOrientation.localToWorld(chinaCenter);
  const flightDirection = chinaCenter.clone().normalize();
  const flightEnd = flightDirection.multiplyScalar(2.42);
  const lookTarget = chinaCenter.clone().multiplyScalar(0.74);
  const startTarget = cameraTarget.clone();
  const targetProgress = { value: 0 };
  const backdropElement = hostElement.querySelector<HTMLElement>('.earth-backdrop');
  const canvasElement = renderer.domElement;
  const transitionPixelRatio = Math.min(window.devicePixelRatio, 1);
  renderer.setPixelRatio(transitionPixelRatio);
  composer?.setPixelRatio(transitionPixelRatio);

  transitionTimeline?.kill();
  transitionTimeline = gsap.timeline({
    defaults: { ease: 'power3.inOut' },
    onComplete: () => emit('enter-china'),
  });
  transitionTimeline
    .to(camera.position, {
      x: flightEnd.x,
      y: flightEnd.y,
      z: flightEnd.z,
      duration: 1.94,
      ease: 'power2.inOut',
      onUpdate: () => camera?.lookAt(cameraTarget),
    }, 0)
    .to(targetProgress, {
      value: 1,
      duration: 1.86,
      ease: 'power2.inOut',
      onUpdate: () => cameraTarget.lerpVectors(startTarget, lookTarget, targetProgress.value),
    }, 0)
    .to(spinGroup.scale, {
      x: 2.42,
      y: 2.42,
      z: 2.42,
      duration: 1.94,
      ease: 'power2.inOut',
    }, 0)
    .to(animatedMaterials.map((material) => material.uniforms.uFade), {
      value: 0,
      duration: 0.7,
      stagger: { amount: 0.12 },
    }, 1.16)
    .to(fadeMaterials, {
      opacity: 0,
      duration: 0.68,
      stagger: { amount: 0.12 },
    }, 1.2)
    .call(() => emit('handoff-start'), [], 0.72)
    .to(canvasElement, { opacity: 0, duration: 0.82, ease: 'power2.inOut' }, 1.22);
  if (backdropElement) {
    transitionTimeline.to(backdropElement, {
      opacity: 0,
      duration: 0.86,
      ease: 'power2.inOut',
    }, 1.2);
  }
  transitionTimeline.call(() => undefined, [], 2.18);
  transitionTimeline.timeScale(2.18/FUI_EARTH_FLIGHT_DURATION);
}

function updateEarthProjection(width:number,height:number){
  if(!camera)return;
  camera.aspect=width/height;
  const frameScale=props.frameScale;
  if(frameScale&&frameScale>0){
    // Preserve the original 38-degree composition while rendering beyond its
    // artboard. View offset aligns the physical globe with the HUD at y=460.
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(38)/2)*height/(975*frameScale)));
    camera.setViewOffset(width,height,0,28*frameScale,width,height);
  }else{camera.fov=38;camera.clearViewOffset();}
  camera.updateProjectionMatrix();
}

// Test the actual sized buffers, not only extension names. A failed target
// stays on the existing error/retry path rather than revealing a blank canvas.
function validateEarthComposerTargets(){
  if(!renderer||!composer)return;
  const previous=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4());
  try{for(const target of [composer.renderTarget1,composer.renderTarget2]){
    renderer.setRenderTarget(target);
    if(!fuiGlassFramebufferComplete(renderer))throw new Error('Earth compositor framebuffer is incomplete');
  }}finally{renderer.setRenderTarget(previous);renderer.setViewport(viewport);}
}

function resize() {
  if (!host.value || !camera || !renderer) return;
  const width = Math.max(host.value.clientWidth, 1);
  const height = Math.max(host.value.clientHeight, 1);
  updateEarthProjection(width,height);
  renderer.setSize(width, height, false);
  try{composer?.setSize(width, height);validateEarthComposerTargets();}catch(error){failInitial(error);return;}
  hologram?.resize(height,renderer.getPixelRatio());
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function animate() {
  raf=0;
  if(disposed||!props.active||document.hidden)return;
  raf = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.05);
  animationElapsed=timeline.tick(performance.now());
  const elapsed = animationElapsed;
  introValue = THREE.MathUtils.clamp(elapsed / introDuration, 0, 1);
  if (!hasEmittedIntroReady && introValue >= 1) {
    hasEmittedIntroReady = true;
    if(host.value)host.value.dataset.loadReadyAtMs=performance.now().toFixed(1);
    emit('intro-ready');emit('intro-complete');setPhase('ready');
  }
  if(introValue>=1&&host.value&&!host.value.dataset.loadIntroEndAtMs){
    host.value.dataset.loadIntroEndAtMs=performance.now().toFixed(1);
    if(!isHologram)void earthResources?.ensureFamily(earthFamily(renderedEarthSkin)==='original'?'reference':'original').catch(()=>{if(host.value)host.value.dataset.optionalResources='retry-needed';});
  }
  const earthGrowthProgress = THREE.MathUtils.smoothstep(introValue, 0.08, 0.28);
  const earthGrowthSettle = THREE.MathUtils.smoothstep(introValue, 0.28, 0.33);
  const earthIntroScale = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(0.82, 1.025, earthGrowthProgress),
    1,
    earthGrowthSettle,
  );
  const earthVisualReveal = THREE.MathUtils.smoothstep(introValue, 0, 0.1);
  const earthLightProgress = THREE.MathUtils.smoothstep(introValue, 0.015, 0.32);
  const earthRotationRemaining = 1 - THREE.MathUtils.smoothstep(introValue, 0.06, 0.33);
  const atmosphereReveal = THREE.MathUtils.smoothstep(introValue, 0, 0.14);
  const chinaFocusReveal = THREE.MathUtils.smoothstep(introValue, 0.365, 0.42);
  const chinaFocusSettle = THREE.MathUtils.smoothstep(introValue, 0.62, 0.78);
  const chinaFocusIntensity = chinaFocusReveal * (1 - chinaFocusSettle * 0.55);
  const chinaReveal = THREE.MathUtils.smoothstep(introValue, 0.39, 0.45);
  const chinaGrowthProgress = THREE.MathUtils.smoothstep(introValue, 0.39, 0.61);
  const chinaGrowthSettle = THREE.MathUtils.smoothstep(introValue, 0.61, 0.67);
  const chinaGrowthScale = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(0.9, 1.02, chinaGrowthProgress),
    1,
    chinaGrowthSettle,
  );
  const chinaLiftProgress = THREE.MathUtils.smoothstep(introValue, 0.39, 0.63);
  const wallLinearProgress = THREE.MathUtils.smoothstep(introValue, 0.42, 0.64);
  const wallOffset = wallLinearProgress - 1;
  const chinaWallProgress = wallLinearProgress <= 0
    ? 0
    : 1 + 2.1 * wallOffset ** 3 + 1.1 * wallOffset ** 2;
  const wallEdgePulse = Math.sin(
    THREE.MathUtils.clamp(wallLinearProgress, 0, 1) * Math.PI,
  );
  const chinaElevation = THREE.MathUtils.smoothstep(introValue, 0.39, 0.63);
  const chinaEffectsReveal = THREE.MathUtils.smoothstep(introValue, 0.365, 0.48);
  const chinaContactReveal = THREE.MathUtils.smoothstep(introValue, 0.39, 0.56);
  const nodeReveal = THREE.MathUtils.smoothstep(introValue, 0.69, 0.83);
  const starReveal = THREE.MathUtils.smoothstep(introValue, 0, 0.12);
  const timelineElapsed = elapsed;
  hoverValue = THREE.MathUtils.damp(hoverValue, hoverTarget, 7, delta);
  if (controls && !isTransitioning.value) controls.enabled = introValue >= 1;
  controls?.update();
  const ambientMotionReveal = THREE.MathUtils.smoothstep(introValue, 0.55, 0.88);
  const interactionPausesIdle = introValue >= 1 && controlsInteracting;
  const idleMotionTarget = interactionPausesIdle || isTransitioning.value
    ? 0
    : ambientMotionReveal;
  idleMotionValue = THREE.MathUtils.damp(idleMotionValue, idleMotionTarget, 2.4, delta);
  const pointerParallaxActive = introValue >= 1
    && pointerInside
    && !controlsInteracting
    && !isTransitioning.value;
  pointerParallaxYaw = THREE.MathUtils.damp(
    pointerParallaxYaw,
    pointerParallaxActive ? pointer.x * THREE.MathUtils.degToRad(0.22) : 0,
    4.5,
    delta,
  );
  pointerParallaxPitch = THREE.MathUtils.damp(
    pointerParallaxPitch,
    pointerParallaxActive ? -pointer.y * THREE.MathUtils.degToRad(0.14) : 0,
    4.5,
    delta,
  );
  if (idleDriftGroup) {
    const yaw = THREE.MathUtils.degToRad(
      Math.sin(elapsed * fullTurn / 17) * 0.86
        + Math.sin(elapsed * fullTurn / 31 + 1.15) * 0.34
        + Math.sin(elapsed * fullTurn / 47 + 0.38) * 0.14,
    );
    const pitch = THREE.MathUtils.degToRad(
      Math.sin(elapsed * fullTurn / 21 + 0.75) * 0.28
        + Math.sin(elapsed * fullTurn / 37 + 2.05) * 0.11,
    );
    const roll = THREE.MathUtils.degToRad(
      Math.sin(elapsed * fullTurn / 25 + 1.8) * 0.085
        + Math.sin(elapsed * fullTurn / 43 + 0.52) * 0.035,
    );
    idleDriftGroup.rotation.set(
      (isHologram ? 0 : pitch * idleMotionValue + pointerParallaxPitch)
        + THREE.MathUtils.degToRad(2) * earthRotationRemaining,
      (isHologram ? 0 : yaw * idleMotionValue + pointerParallaxYaw)
        - THREE.MathUtils.degToRad(7) * earthRotationRemaining,
      (isHologram ? 0 : roll * idleMotionValue)
        + THREE.MathUtils.degToRad(0.6) * earthRotationRemaining,
    );
    idleDriftGroup.position.set(
      (
        Math.sin(elapsed * fullTurn / 24 + 1.15) * 0.0032
        + Math.sin(elapsed * fullTurn / 41 + 0.28) * 0.0015
      ) * idleMotionValue,
      (
        Math.sin(elapsed * fullTurn / 13.5 + 0.32) * 0.0068
        + Math.sin(elapsed * fullTurn / 29 + 1.72) * 0.0024
      ) * idleMotionValue,
      0,
    );
    const breathScale = 1
      + Math.sin(elapsed * fullTurn / 9.2)
        * 0.0025 * idleMotionValue;
    idleDriftGroup.scale.setScalar(
      earthIntroScale * breathScale,
    );
  }
  if (chinaIntroPivot) {
    chinaPivotAnimatedPosition.lerpVectors(
      chinaPivotStartPosition,
      chinaPivotFinalPosition,
      chinaLiftProgress,
    ).addScaledVector(
      chinaPivotDirection,
      Math.sin(chinaLiftProgress * Math.PI) * 0.004,
    );
    chinaIntroPivot.position.copy(chinaPivotAnimatedPosition);
    chinaIntroPivot.scale.setScalar(chinaGrowthScale);
  }
  flowProgress = (
    flowProgress + delta * THREE.MathUtils.lerp(0.118, 0.142, hoverValue)
  ) % 1;

  const lightPhase = elapsed * fullTurn / 19;
  targetLightDirection.set(
    -0.68 + Math.sin(lightPhase) * 0.06,
    0.62 + Math.sin(lightPhase * 0.73 + 0.8) * 0.035,
    0.31 + Math.cos(lightPhase) * 0.045,
  ).normalize();
  animatedLightDirection.lerpVectors(
    introLightDirection,
    targetLightDirection,
    earthLightProgress,
  ).normalize();
  const chinaLightPhase = elapsed * fullTurn / 31;
  animatedChinaLightDirection.set(
    animatedLightDirection.x + Math.sin(chinaLightPhase) * 0.075,
    animatedLightDirection.y + Math.sin(chinaLightPhase * 0.83 + 1.2) * 0.04,
    animatedLightDirection.z + Math.cos(chinaLightPhase) * 0.055,
  ).normalize();
  renderer.toneMappingExposure = THREE.MathUtils.lerp(
    0.74,
    materialForPresentation(renderedEarthSkin).exposure,
    earthLightProgress,
  );
  cameraViewDirection.copy(camera.position).sub(cameraTarget).normalize();
  cameraRightDirection.crossVectors(camera.up, cameraViewDirection);
  if (cameraRightDirection.lengthSq() < 0.000001) {
    cameraRightDirection.set(1, 0, 0);
  } else {
    cameraRightDirection.normalize();
  }
  cameraUpDirection.crossVectors(cameraViewDirection, cameraRightDirection).normalize();
  animatedSweepAxis.copy(cameraUpDirection).multiplyScalar(0.84)
    .addScaledVector(cameraViewDirection, 0.52)
    .addScaledVector(cameraRightDirection, -0.12)
    .normalize();
  emitEarthTelemetry(elapsed);

  const innerGlowPulse = 1
    + Math.sin(elapsed * fullTurn / 5.6) * 0.085
    + hoverValue * 0.08;
  const atmospherePulse = 1 + Math.sin(elapsed * fullTurn / 9.8 + 0.42) * 0.055;
  const atmosphereWakePulse = Math.sin(earthLightProgress * Math.PI);
  const flyTrackBreath = 0.84
    + (0.5 + Math.sin(elapsed * fullTurn / 5.8 + 0.55) * 0.5) * 0.16;
  const gridBreath = 0.96
    + (0.5 + Math.sin(elapsed * fullTurn / 14.5 + 0.9) * 0.5) * 0.08;
  const sweepCycleTime = timelineElapsed % motionCycleDuration;
  const rawSweepProgress = Math.min(sweepCycleTime / scanTravelDuration, 1);
  const sweepProgress = rawSweepProgress * rawSweepProgress
    * (3 - 2 * rawSweepProgress);
  const sweepCycleIndex = Math.floor(timelineElapsed / motionCycleDuration);
  const sweepNoise = Math.sin((sweepCycleIndex + 1) * 12.9898) * 43758.5453;
  const sweepEnergy = 0.96 + (sweepNoise - Math.floor(sweepNoise)) * 0.08;

  animatedMaterials.forEach((material) => {
    if (material.uniforms.uTime) {
      material.uniforms.uTime.value = material.userData.motionTimeline
        ? timelineElapsed
        : elapsed;
    }
    if (material.uniforms.uIntroReveal) {
      const introLayer = material.userData.introLayer as string | undefined;
      material.uniforms.uIntroReveal.value = introLayer === 'earth'
        ? earthVisualReveal
        : introLayer === 'china-wall'
          ? chinaWallProgress
          : introLayer === 'china-effects'
            ? chinaEffectsReveal
          : chinaReveal;
    }
    if (material.uniforms.uIntroElevation) {
      material.uniforms.uIntroElevation.value = chinaElevation;
    }
    if (material.uniforms.uIntroWall) {
      material.uniforms.uIntroWall.value = chinaWallProgress;
    }
    if (material.uniforms.uWallEdgeGlow) {
      material.uniforms.uWallEdgeGlow.value = wallEdgePulse;
    }
    if (material.uniforms.uNetworkReveal) {
      material.uniforms.uNetworkReveal.value = nodeReveal;
    }
    if (material.uniforms.uGridBreath) {
      material.uniforms.uGridBreath.value = gridBreath;
    }
    if (material.uniforms.uChinaContact) {
      material.uniforms.uChinaContact.value = chinaContactReveal;
    }
    if (material.uniforms.uChinaFocus) {
      material.uniforms.uChinaFocus.value = chinaFocusIntensity;
    }
    if (material.uniforms.uFlowProgress) {
      material.uniforms.uFlowProgress.value = flowProgress;
    }
    if (material.uniforms.uSweepProgress) {
      material.uniforms.uSweepProgress.value = sweepProgress;
    }
    if (material.uniforms.uSweepEnergy) {
      material.uniforms.uSweepEnergy.value = sweepEnergy;
    }
    const sweepAxis = material.uniforms.uSweepAxis?.value;
    if (sweepAxis instanceof THREE.Vector3) sweepAxis.copy(animatedSweepAxis);
    const lightDirection = material.uniforms.uLightDirection?.value;
    if (lightDirection instanceof THREE.Vector3) {
      lightDirection.copy(
        material.userData.chinaTerrainLight
          ? animatedChinaLightDirection
          : animatedLightDirection,
      );
    }
    if (material.uniforms.uInnerGlowPulse) {
      material.uniforms.uInnerGlowPulse.value = innerGlowPulse;
    }
    if (material.uniforms.uIntensity) {
      const baseIntensity = material.userData.baseIntensity as number | undefined;
      if (baseIntensity !== undefined) {
        material.uniforms.uIntensity.value = baseIntensity
          * atmospherePulse * atmosphereReveal
          * (1 + atmosphereWakePulse * 0.75);
      }
    }
  });
  if (chinaMesh) chinaMesh.material.uniforms.uHover.value = hoverValue;
  if (chinaExtrusionGroup) {
    chinaExtrusionGroup.children.forEach((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.ShaderMaterial)) return;
      child.material.uniforms.uHover.value = hoverValue;
    });
  }
  const hoverLiftScale = isHologram&&hologram ? hologram.getFocusRadius()/2 : 1 + hoverValue * 0.0038;
  chinaMesh?.scale.setScalar(hoverLiftScale);
  chinaExtrusionGroup?.scale.setScalar(hoverLiftScale);
  chinaOutlineGroup?.scale.setScalar(hoverLiftScale);

  if (chinaOutlineGroup && !isTransitioning.value) {
    chinaOutlineGroup.traverse((child) => {
      if (!(child instanceof THREE.Line || child instanceof THREE.Points || child instanceof THREE.Mesh)) return;
      const material = child.material;
      if (material instanceof THREE.ShaderMaterial) {
        if (material.uniforms.uHover) material.uniforms.uHover.value = hoverValue;
        return;
      }
      if (!(material instanceof THREE.LineBasicMaterial || material instanceof THREE.MeshBasicMaterial)) return;
      const baseOpacity = (material.userData.baseOpacity as number | undefined) ?? 0.58;
      material.opacity = baseOpacity * (1 + hoverValue * 0.2)
        * (0.992 + Math.sin(elapsed * fullTurn / 5.6) * 0.008)
        * chinaFocusReveal;
    });
  }
  if (!isTransitioning.value) {
    starLayers.forEach((layer) => {
      layer.points.rotation.y = elapsed * fullTurn / layer.rotationDuration
        * layer.rotationDirection;
      layer.points.rotation.x = Math.sin(
        elapsed * fullTurn / (layer.rotationDuration * 0.72) + layer.phase,
      ) * THREE.MathUtils.degToRad(0.22);
      const twinkle = 1 + Math.sin(
        elapsed * fullTurn / layer.twinkleDuration + layer.phase,
      ) * layer.twinkleStrength;
      layer.points.material.opacity = layer.baseOpacity * twinkle * starReveal;
    });
    chinaRevealMaterials.forEach((material) => {
      if (material.userData.introOnly !== true || !('opacity' in material)) return;
      const opacityMaterial = material as THREE.Material & { opacity: number };
      const baseOpacity = (material.userData.baseOpacity as number | undefined) ?? 1;
      opacityMaterial.opacity = baseOpacity * chinaReveal * chinaWallProgress;
    });
    chinaBottomEdges.forEach(({ line, startScale }) => {
      const wallVisibility = THREE.MathUtils.smoothstep(wallLinearProgress, 0, 0.16);
      line.scale.setScalar(
        THREE.MathUtils.lerp(startScale, 1, chinaWallProgress),
      );
      line.material.color.copy(bottomEdgeBaseColor).lerp(
        bottomEdgeActiveColor,
        wallEdgePulse,
      );
      const baseOpacity = (
        line.material.userData.baseOpacity as number | undefined
      ) ?? 0.54;
      line.material.opacity = baseOpacity * chinaReveal * wallVisibility
        * (1 + wallEdgePulse * 0.82);
    });
    flyNodeCoreMaterials.forEach((material) => {
      const baseOpacity = (material.userData.baseOpacity as number | undefined) ?? 0.58;
      material.opacity = baseOpacity * nodeReveal * (renderedEarthSkin === 'original' ? 1 : isHologram ? .62 : FUI_ENTITY_VISUAL_BASELINE.nodeOpacity);
    });
    flyTrackMaterials.forEach((material) => {
      const baseOpacity = (material.userData.baseOpacity as number | undefined) ?? 0.12;
      material.opacity = baseOpacity * nodeReveal * flyTrackBreath * (renderedEarthSkin === 'original' ? 1 : isHologram ? .60 : FUI_ENTITY_VISUAL_BASELINE.trackOpacity);
    });
    flyNodePulses.forEach(({ ring, startOffset, cycleDuration }) => {
      const normalizedOffset = startOffset % cycleDuration;
      const pulseTime = (
        (elapsed - normalizedOffset) % cycleDuration + cycleDuration
      ) % cycleDuration;
      const pulseProgress = pulseTime / cycleDuration;
      const baseOpacity = (ring.material.userData.baseOpacity as number | undefined) ?? 0.22;
      ring.material.opacity = Math.sin(pulseProgress * Math.PI)
        * baseOpacity * nodeReveal * (renderedEarthSkin === 'original' ? 1 : isHologram ? .62 : FUI_ENTITY_VISUAL_BASELINE.rippleOpacity);
      ring.scale.setScalar((0.72 + pulseProgress * 1.18) * (renderedEarthSkin === 'original' ? 1 : isHologram ? .66 : FUI_ENTITY_VISUAL_BASELINE.rippleScale));
    });
  }
  hologram?.resize(host.value?.clientHeight??850,renderer.getPixelRatio());
  if (composer) composer.render(delta);
  else renderer.render(scene, camera);
  // Destination construction starts only after the actual entrance has drawn
  // a visible globe. Keep the complete timeline and first-frame signal intact.
  if(earthVisualReveal>=.5&&host.value&&!host.value.dataset.loadVisibleAtMs){
    host.value.dataset.loadVisibleAtMs=performance.now().toFixed(1);emit('first-visible');
  }
}

async function setup() {
  if (!host.value) return;
  host.value.dataset.loadSetupAtMs=performance.now().toFixed(1);
  setPhase('loading');
  // Start the selected native geographic cache alongside image fetch/decode.
  // No destination state participates in either readiness dependency.
  const geographyReady=loadEarthGeography(props.earthPresentation,{outlines:worldOutlinesUrl,hologram:hologramMaskUrl},earthGeographyCache,geographyAbort.signal);
  void geographyReady.catch(failInitial);
  const startingFamily=earthFamily(renderedEarthSkin);
  earthResources=new EarthResources({urls:earthResourceUrls,loadImage:imageLoader,onTexture:(id)=>{
    if(!disposed&&renderer?.domElement.isConnected&&loadPhase.value!=='error'&&!isHologram&&requiredEarthResources(startingFamily).includes(id))earthResources!.upload(id,renderer);
  }});
  const requiredReady=isHologram?Promise.resolve():earthResources.ensureFamily(startingFamily);
  void requiredReady.catch(failInitial);
  flowProgress = 0;
  introValue = 0;
  hasEmittedIntroReady = false;
  animationElapsed = 0;
  pointerInside = false;
  controlsInteracting = false;
  idleMotionValue = 0;
  pointerParallaxYaw = 0;
  pointerParallaxPitch = 0;
  flyNodePulses.length = 0;
  starMaterials.length = 0;
  starLayers.length = 0;
  flyNodeCoreMaterials.length = 0;
  flyTrackMaterials.length = 0;
  chinaRevealMaterials.length = 0;
  chinaBottomEdges.length = 0;
  chinaIntroPivot = undefined;
  const width = Math.max(host.value.clientWidth, 1);
  const height = Math.max(host.value.clientHeight, 1);
  scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.FogExp2(earthTheme.background, 0.021);

  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  updateEarthProjection(width,height);
  camera.position.set(0, 0.1, renderedEarthSkin === 'original' ? 7.35 : 7.22);
  cameraTarget.set(0, 0, 0);
  camera.lookAt(cameraTarget);

  const contextStarted=performance.now();
  renderer = new THREE.WebGLRenderer({
    // Geometry is rasterized by the existing offscreen composer. Multisample
    // storage on the final fullscreen-blit framebuffer adds no edge samples.
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });
  // Production avoids synchronous shader-log readbacks on first program use.
  renderer.debug.checkShaderErrors=import.meta.env.DEV||import.meta.env.MODE==='regression';
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(earthPixelRatio());
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = materialForPresentation(renderedEarthSkin).exposure;
  renderer.domElement.style.visibility = 'hidden';
  host.value.appendChild(renderer.domElement);
  host.value.dataset.loadContextMs=(performance.now()-contextStarted).toFixed(1);
  host.value.dataset.loadBuffer=`${renderer.domElement.width}x${renderer.domElement.height}`;
  earthHalfFloat=supportsFuiGlassHalfFloat(renderer);
  host.value.dataset.loadOutputMode=earthHalfFloat?'hdr':'ldr';
  host.value.dataset.loadBloom=earthHalfFloat?'true':'false';
  host.value.dataset.loadEnvironment=isHologram?(earthHalfFloat?'pmrem':'neutral-rgba8'):'none';

  earthResources.setAnisotropy(Math.min(renderer.capabilities.getMaxAnisotropy(),8));
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 5.2;
  controls.maxDistance = 9;
  controls.rotateSpeed = 0.38;
  controls.enabled = false;
  controls.target.copy(cameraTarget);
  controls.addEventListener('start', onControlsStart);
  controls.addEventListener('end', onControlsEnd);

  let animationStarted = false;
  let scenePrepared = false;
  let preparing=false;
  let shaderPrime:Promise<void>|undefined;
  const startAnimation = async () => {
    if (
      animationStarted
      || !renderer
      || !scene
      || !camera
      || !renderer.domElement.isConnected
    ) return;
    if (!composer||!shaderPrime) {
      requestAnimationFrame(startAnimation);
      return;
    }
    if (!scenePrepared) {
      if(preparing||!shaderPrime)return;
      preparing=true;setPhase('warming');
      const warmRenderer=renderer,warmComposer=composer;
      if(host.value)host.value.dataset.loadAssetsAtMs=performance.now().toFixed(1);
      const uploadStarted=performance.now();
      const textureTimes:{source:string;ms:number}[]=[];
      for(const {id,texture} of isHologram?[]:earthResources!.required(startingFamily)){
        if(renderer!==warmRenderer||!host.value?.isConnected)return;
        earthResources!.upload(id,warmRenderer);
        textureTimes.push({source:String(texture.userData.fuiSource??id).split('/').pop()!,ms:+(earthResources!.diagnostics()[id]?.uploadMs??0).toFixed(1)});
      }
      if(host.value)host.value.dataset.loadResources=JSON.stringify(earthResources!.diagnostics());
      if(renderer!==warmRenderer||composer!==warmComposer||!host.value?.isConnected)return;
      host.value.dataset.loadUploadMs=(performance.now()-uploadStarted).toFixed(1);
      host.value.dataset.loadTextures=JSON.stringify(textureTimes);
      const programStatus=()=>(warmRenderer.info.programs??[]).map(program=>({
        id:program.id,name:program.name,
        ready:(program as typeof program&{isReady?:()=>boolean}).isReady?.(),
      }));
      host.value.dataset.loadPendingPrograms=JSON.stringify(programStatus());
      const frameStarted=performance.now();
      const primedPrograms=warmRenderer.info.programs?.length??0;
      const passTimes:{pass:number;ms:number}[]=[],passRenders=warmComposer.passes.map(pass=>pass.render);
      warmComposer.passes.forEach((pass,index)=>{pass.render=(...args)=>{
        const started=performance.now();try{return passRenders[index].apply(pass,args);}finally{passTimes.push({pass:index,ms:+(performance.now()-started).toFixed(1)});}
      };});
      try{warmComposer.render(0);}finally{warmComposer.passes.forEach((pass,index)=>{pass.render=passRenders[index];});}
      host.value.dataset.loadPasses=JSON.stringify(passTimes);
      host.value.dataset.loadPrograms=`${primedPrograms}/${warmRenderer.info.programs?.length??0}`;
      host.value.dataset.loadFrameMs=(performance.now()-frameStarted).toFixed(1);
      host.value.dataset.loadFirstFrameAtMs=performance.now().toFixed(1);
      host.value.dataset.loadAfterFramePrograms=JSON.stringify(programStatus());
      // Consume the programs in the complete hidden frame before awaiting
      // KHR completion polling. First use resolves active uniforms/attributes
      // even on drivers which delay progress under status-only polling.
      // Keep the async jobs owned and drained before readiness or disposal.
      await shaderPrime;
      if(renderer!==warmRenderer||composer!==warmComposer||!host.value?.isConnected)return;
      host.value.dataset.loadPreparedAtMs=performance.now().toFixed(1);
      scenePrepared=true;preparing=false;animationPrepared=true;releasePreparation!();
      emit('scene-ready');
    }
    if (!props.startIntro) {
      requestIntroStart = ()=>{void startAnimation();};
      return;
    }
    requestIntroStart = undefined;
    animationStarted = true;
    if(host.value)host.value.dataset.loadIntroAtMs=performance.now().toFixed(1);
    animationElapsed = 0;timeline.reset();setPhase('entering');
    emit('skin-applied',renderedEarthSkin);clock.start();
    renderer.domElement.style.visibility = '';
    animate();
  };
  renderer.domElement.addEventListener('pointerenter', onPointerEnter);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('pointerdown', enterChina);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host.value);

  preparedGeography=await geographyReady;
  if(disposed||!host.value?.isConnected||!renderer)return;
  if(loadPhase.value==='error')return;
  host.value.dataset.loadGeography=JSON.stringify(preparedGeography.diagnostics);
  const sceneBuildStarted=performance.now();
  createEarthScene();
  host.value.dataset.loadBuildParts=JSON.stringify(earthBuildTimes);
  host.value.dataset.loadSceneMs=(performance.now()-sceneBuildStarted).toFixed(1);
  composer = earthHalfFloat?new EffectComposer(renderer):new EffectComposer(renderer,new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType}));
  composer.setPixelRatio(earthPixelRatio());
  if(!earthHalfFloat){const size=renderer.getSize(new THREE.Vector2());composer.setSize(size.x,size.y);}
  validateEarthComposerTargets();
  composer.addPass(new RenderPass(scene, camera));
  if(earthHalfFloat){
  bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height),materialForPresentation(renderedEarthSkin).bloom,materialForPresentation(renderedEarthSkin).bloomRadius,materialForPresentation(renderedEarthSkin).bloomThreshold);
  // Add bloom RGB without replacing the scene's transparent coverage with
  // the blur pass's opaque fullscreen alpha.
  Object.assign(bloomPass.blendMaterial,{
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,
    blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
    blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
  });
  composer.addPass(bloomPass);
  }
  const outputPass=new OutputPass();
  // Keep RGB/tone mapping intact and provide valid premultiplied coverage for
  // visible glow outside the opaque globe. True black stays transparent.
  outputPass.material.fragmentShader=outputPass.material.fragmentShader.replace(/}\s*$/,`
    gl_FragColor.a=clamp(max(gl_FragColor.a,max(max(gl_FragColor.r,gl_FragColor.g),gl_FragColor.b)),0.0,1.0);
  }`);
  composer.addPass(outputPass);
  scene.traverse(object=>{
    const value=(object as THREE.Mesh).material;
    for(const material of value?(Array.isArray(value)?value:[value]):[]){
      if(!(material instanceof THREE.ShaderMaterial)||material.userData.fuiFamilyProgram)continue;
      if(!/uniform\s+float\s+uSkinReference\s*;/.test(material.vertexShader+material.fragmentShader))continue;
      const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.defines.FUI_REFERENCE_FAMILY=renderedEarthSkin==='original'?0:1;
      material.onBeforeCompile=(shader,r)=>{
        previous.call(material,shader,r);
        const declaration='const float uSkinReference=float(FUI_REFERENCE_FAMILY);';
        shader.vertexShader=shader.vertexShader.replace(/uniform\s+float\s+uSkinReference\s*;/g,declaration);
        shader.fragmentShader=shader.fragmentShader.replace(/uniform\s+float\s+uSkinReference\s*;/g,declaration);
      };
      material.customProgramCacheKey=()=>key+'|fui-optical-family-v1';
      material.userData.fuiFamilyProgram=true;
    }
  });
  // Additive shells emit light; they must not deposit opaque coverage in
  // otherwise black pixels outside the physical globe.
  scene.traverse(object=>{
    const value=(object as THREE.Mesh).material;
    for(const material of value?(Array.isArray(value)?value:[value]):[]){
      if(material.blending!==THREE.AdditiveBlending)continue;
      Object.assign(material,{
        blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,
        blendSrc:material.premultipliedAlpha?THREE.OneFactor:THREE.SrcAlphaFactor,blendDst:THREE.OneFactor,
        blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
      });
    }
  });
  const primeRenderer=renderer,primeScene=scene,primeCamera=camera,shaderStarted=performance.now();
  host.value.dataset.loadShaderAtMs=shaderStarted.toFixed(1);
  // RenderPass draws the scene to a linear composer target, not the screen.
  // Priming the screen variant would compile every scene shader again on first render.
  const sceneTarget=primeRenderer.getRenderTarget();
  let sceneJob:Promise<unknown>;
  try{primeRenderer.setRenderTarget(composer.renderTarget1);sceneJob=rendererJobs.run(()=>primeRenderer.compileAsync(primeScene,primeCamera));}
  finally{primeRenderer.setRenderTarget(sceneTarget);}
  const fxGeometry=new THREE.PlaneGeometry(2,2),fxCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),fxScene=new THREE.Scene();
  const fxMaterials=bloomPass?[bloomPass.materialHighPassFilter,...bloomPass.separableBlurMaterials,bloomPass.compositeMaterial,bloomPass.blendMaterial]:[];
  fxMaterials.forEach(material=>fxScene.add(new THREE.Mesh(fxGeometry,material)));
  const previousTarget=primeRenderer.getRenderTarget();
  let effectsJob:Promise<unknown>;
  try{primeRenderer.setRenderTarget(composer.renderTarget1);effectsJob=rendererJobs.run(()=>primeRenderer.compileAsync(fxScene,fxCamera));}
  finally{primeRenderer.setRenderTarget(previousTarget);}
  // Match the existing OutputPass render defines before its first fullscreen draw.
  outputPass.material.defines={SRGB_TRANSFER:'',ACES_FILMIC_TONE_MAPPING:''};
  const outputScene=new THREE.Scene();outputScene.add(new THREE.Mesh(fxGeometry,outputPass.material));
  const outputJob=rendererJobs.run(()=>primeRenderer.compileAsync(outputScene,fxCamera));
  // No visible RAF exists during preparation. Submit the queued link work
  // before compileAsync starts waiting on non-blocking completion queries.
  primeRenderer.getContext().flush();
  shaderPrime=Promise.all([sceneJob,effectsJob,outputJob]).then(()=>{
    if(renderer===primeRenderer&&host.value)host.value.dataset.loadCompileMs=(performance.now()-shaderStarted).toFixed(1);
  }).catch(()=>{ /* The first prepared render is the compatibility path. */ }).finally(()=>fxGeometry.dispose());

  void requiredReady.then(startAnimation).catch(failInitial);

}

watch(()=>props.frameScale,()=>resize());
watch(()=>props.quality,()=>{if(!renderer)return;renderer.setPixelRatio(earthPixelRatio());composer?.setPixelRatio(earthPixelRatio());resize();});

function commitSkin(skin:FuiEarthSkinId){
  const previousSkin=renderedEarthSkin;renderedEarthSkin=skin;
  if(earthFamily(skin)!==earthFamily(previousSkin))scene?.traverse(object=>{
    const value=(object as THREE.Mesh).material;
    for(const material of value?(Array.isArray(value)?value:[value]):[]){
      if(material instanceof THREE.ShaderMaterial&&material.userData.fuiFamilyProgram){material.defines.FUI_REFERENCE_FAMILY=skin==='original'?0:1;material.needsUpdate=true;}
    }
  });
  if (camera && !isTransitioning.value) {
    const previousDistance = previousSkin === 'original' ? 7.35 : 7.22;
    const nextDistance = skin === 'original' ? 7.35 : 7.22;
    camera.position.sub(cameraTarget).multiplyScalar(nextDistance / previousDistance).add(cameraTarget);
  }
  hologram?.setSkin(skin);
  const next = themeForPresentation(skin);
  for (const key of Object.keys(earthTheme) as (keyof typeof earthTheme)[]) {
    const current = earthTheme[key];
    const value = next[key];
    if (current instanceof THREE.Color && value instanceof THREE.Color) current.copy(value);
  }
  Object.assign(earthTheme.css, next.css);
  earthThemeStyle.value = themeCss();
  bottomEdgeBaseColor.copy(earthTheme.bottomEdge);
  bottomEdgeActiveColor.copy(earthTheme.highlight);
  const nextScan=scanThemeForPresentation(skin);
  for(const key of ['sweep','grid','gridDotSweep','atmosphereSweep'] as const){
    scanTheme[key].copy(nextScan[key]);
  }
  const material = materialForPresentation(skin);
  skinUniforms.uSkinRoughness.value = material.roughness;
  skinUniforms.uSkinMetalness.value = material.metalness;
  skinUniforms.uSkinSurfaceGain.value = material.surfaceGain;
  skinUniforms.uSkinAlbedoTint.value = material.albedoTint;
  skinUniforms.uSkinOceanShininess.value = material.oceanShininess;
  skinUniforms.uSkinOceanReflection.value = material.oceanReflection;
  skinUniforms.uSkinOceanDarken.value = material.oceanDarken;
  skinUniforms.uSkinCityGain.value = material.cityGain;
  skinUniforms.uSkinScanGain.value = material.scanGain;
  skinUniforms.uSkinFlightPrecision.value = skin === 'original' ? 0 : 1;
  skinUniforms.uSkinReference.value = skin === 'original' ? 0 : 1;
  skinUniforms.uSkinEdgeGain.value = material.edgeGain;
  skinUniforms.uSkinEnvironmentGain.value = material.environmentGain;
  skinUniforms.uSkinAtmosphereGain.value = material.atmosphereGain;
  skinUniforms.uSkinReliefContrast.value = material.reliefContrast;
  skinUniforms.uSkinInnerGlowGain.value = material.innerGlowGain;
  skinUniforms.uSkinPolarGain.value = material.polarGain;
  skinUniforms.uSkinWorldGain.value = material.worldGain;
  skinUniforms.uSkinOceanBase.value = material.oceanBase;
  skinUniforms.uSkinChinaAmbient.value = material.chinaAmbient;
  if (renderer) renderer.toneMappingExposure = material.exposure;
  if (bloomPass) {
    bloomPass.strength = material.bloom;
    bloomPass.radius = material.bloomRadius;
    bloomPass.threshold = material.bloomThreshold;
  }
  if (scene?.fog instanceof THREE.FogExp2) scene.fog.color.copy(earthTheme.background);
  animatedMaterials.forEach((item) => {
    if (item.userData.skinSweep) item.uniforms.uSweepStrength.value = sweepStrengthForPresentation(skin);
    const base = item.userData.skinAtmosphereBase;
    if (typeof base === 'number') item.userData.baseIntensity = (item.userData.skinOuterAtmosphere && skin !== 'original' ? 0.08 : base) * material.atmosphereGain;
  });

  emit('skin-applied',skin);
}
async function requestSkin(skin:FuiEarthSkinId){
  if(loadPhase.value==='error')return;
  const version=++skinVersion;skinSwitching.value=true;skinFailure.value=undefined;emit('loading',{phase:loadPhase.value,switching:true});
  try{
    await skinRequest.run(skin,async target=>{await preparationReady;if(isHologram)return;await earthResources?.ensureFamily(earthFamily(target));if(disposed||version!==skinVersion||!renderer)return;for(const {id} of earthResources!.required(earthFamily(target)))earthResources!.upload(id,renderer);},target=>{if(!disposed)commitSkin(target);});
  }catch(error){
    if(disposed)return;skinFailure.value={requested:skin,rendered:renderedEarthSkin,message:String(error)};emit('skin-error',skinFailure.value);
  }finally{if(version===skinVersion){skinSwitching.value=false;if(!disposed)emit('loading',{phase:loadPhase.value,switching:false});}}
}
function retrySkin(){if(skinFailure.value)void requestSkin(skinFailure.value.requested as FuiEarthSkinId);}
watch(()=>props.skin,skin=>{if(skin===renderedEarthSkin&&skinFailure.value)return;void requestSkin(skin);});
watch(()=>props.polarStyle,style=>{skinUniforms.uPolarEnhancement.value=style==='enhanced'?1:0;});

watch(() => props.scanStyle, (style) => {
  skinUniforms.uHoneycombMode.value = style === 'honeycomb' ? 1 : 0;
});

watch(() => props.startIntro, (ready) => {
  if (ready) requestIntroStart?.();
});

function syncEarthAnimation(){
  if(!props.active||document.hidden){cancelAnimationFrame(raf);raf=0;timeline.pause();clock.stop();}
  else if(!disposed&&animationPrepared&&renderer&&!raf&&loadPhase.value!=='error'){clock.start();animate();}
}
watch(()=>props.active,syncEarthAnimation);
function releaseEarthOnPageHide(event:PageTransitionEvent){
  if(event.persisted)return;
  disposed=true;geographyAbort.abort();preparedGeography=undefined;skinRequest.cancel();timeline.pause();clock.stop();
  cancelAnimationFrame(raf);raf=0;
  // Lost contexts complete KHR shader polls. Keep JS program owners alive
  // until those polls drain, but do not retain obsolete GPU compilation work.
  renderer?.forceContextLoss();earthResources?.dispose();
  void rendererJobs.dispose(()=>{hologram?.dispose();hologramEnvironment?.dispose();hologramEnvironment=undefined;hologramNeutralEnvironment?.dispose();hologramNeutralEnvironment=undefined;composer?.dispose();renderer?.dispose();renderer=undefined;composer=undefined;});
}
onMounted(()=>{void setup().catch(failInitial);window.addEventListener('pagehide',releaseEarthOnPageHide);document.addEventListener('visibilitychange',syncEarthAnimation);});

onBeforeUnmount(() => {
  disposed=true;geographyAbort.abort();preparedGeography=undefined;releasePreparation!();skinRequest.cancel();document.removeEventListener('visibilitychange',syncEarthAnimation);
  window.removeEventListener('pagehide',releaseEarthOnPageHide);
  requestIntroStart = undefined;
  transitionTimeline?.kill();
  cancelAnimationFrame(raf);
  resizeObserver?.disconnect();
  controls?.removeEventListener('start', onControlsStart);
  controls?.removeEventListener('end', onControlsEnd);
  controls?.dispose();
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointerenter', onPointerEnter);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
    renderer.domElement.removeEventListener('pointerdown', enterChina);
  }
  renderer?.domElement.remove();
  renderer?.forceContextLoss();
  void rendererJobs.dispose(()=>{
    hologram?.dispose();
    hologramEnvironment?.dispose();hologramEnvironment=undefined;hologramNeutralEnvironment?.dispose();hologramNeutralEnvironment=undefined;
    if(scene)disposeObject(scene);
    bloomPass?.dispose();composer?.dispose();renderer?.dispose();
    renderer=undefined;scene=undefined;composer=undefined;
  });
  earthResources?.dispose();earthResources=undefined;
  animatedMaterials.length = 0;
  fadeMaterials.length = 0;
  flyNodePulses.length = 0;
  starMaterials.length = 0;
  starLayers.length = 0;
  flyNodeCoreMaterials.length = 0;
  flyTrackMaterials.length = 0;
  chinaRevealMaterials.length = 0;
  chinaBottomEdges.length = 0;
  chinaIntroPivot = undefined;
});
</script>

<style scoped>
.earth-resource-notice{position:absolute;z-index:15;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:12px;align-items:center;padding:12px 16px;background:#101820ee;color:#cbd8e4;font:12px system-ui;white-space:nowrap}.earth-resource-notice button{border:1px solid #7493aa;background:transparent;color:inherit;padding:6px 9px;cursor:pointer}
.earth-view {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  isolation: isolate;
  background: transparent;
  opacity: 1;
  pointer-events: auto;
  animation: earth-view-in 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.earth-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: transparent;
}

.earth-view::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    linear-gradient(var(--earth-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--earth-grid) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at center, black, transparent 72%);
}

.earth-view :deep(canvas) {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}

.dive-atmosphere,
.dive-cloudscape,
.dive-cloud-haze,
.dive-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
}

.dive-atmosphere,
.dive-cloud-haze,
.dive-vignette {
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.dive-atmosphere {
  z-index: 3;
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 0 29%,
    var(--earth-cloud-glow) 34%,
    color-mix(in srgb, var(--earth-cloud-light) 46%, transparent) 37%,
    transparent 44%
  );
  mix-blend-mode: screen;
  transform: scale(0.42);
}

.dive-cloudscape {
  z-index: 5;
  inset: -12%;
  overflow: hidden;
  contain: paint;
  transform: translateZ(0);
}

.dive-cloudscape::before,
.dive-cloudscape::after {
  content: '';
  position: absolute;
  inset: -16%;
  opacity: 0;
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.dive-cloudscape::before {
  background: var(--earth-cloud-mid);
  -webkit-mask: url('../../assets/textures/map/transition/cloud-sheet.svg') center / 100% 100% no-repeat;
  mask: url('../../assets/textures/map/transition/cloud-sheet.svg') center / 100% 100% no-repeat;
  transform: translate3d(-14%, -7%, 0) rotate(7deg) scale(0.72);
}

.dive-cloudscape::after {
  background: var(--earth-cloud-body);
  -webkit-mask: url('../../assets/textures/map/transition/cloud-sheet.svg') center / 100% 100% no-repeat;
  mask: url('../../assets/textures/map/transition/cloud-sheet.svg') center / 100% 100% no-repeat;
  transform: translate3d(14%, 8%, 0) rotate(-8deg) scale(0.7);
  display: none;
}

.cloud-bank,
.dive-cloud-texture,
.dive-cloud-haze {
  display: none;
}

.cloud-bank {
  position: absolute;
  border-radius: 48% 52% 46% 54% / 58% 43% 57% 42%;
  opacity: 0;
  transform-origin: center;
  backface-visibility: hidden;
  will-change: transform, opacity;
  background:
    radial-gradient(circle at 7% 66%, var(--earth-cloud-light) 0 7%, var(--earth-cloud-mid) 12%, transparent 25%),
    radial-gradient(circle at 18% 38%, var(--earth-cloud-mid) 0 12%, var(--earth-cloud-body) 19%, transparent 31%),
    radial-gradient(circle at 31% 62%, var(--earth-cloud-light) 0 8%, var(--earth-cloud-mid) 14%, transparent 27%),
    radial-gradient(circle at 43% 31%, var(--earth-cloud-light) 0 7%, var(--earth-cloud-body) 18%, transparent 32%),
    radial-gradient(circle at 56% 62%, var(--earth-cloud-mid) 0 12%, var(--earth-cloud-body) 20%, transparent 33%),
    radial-gradient(circle at 68% 34%, var(--earth-cloud-light) 0 8%, var(--earth-cloud-mid) 15%, transparent 29%),
    radial-gradient(circle at 80% 59%, var(--earth-cloud-light) 0 8%, var(--earth-cloud-body) 19%, transparent 31%),
    radial-gradient(circle at 92% 39%, var(--earth-cloud-mid) 0 10%, var(--earth-cloud-body) 18%, transparent 30%),
    radial-gradient(ellipse at 50% 62%, var(--earth-cloud-body) 0 27%, var(--earth-cloud-shadow) 46%, transparent 69%);
  box-shadow:
    inset 0 18px 38px var(--earth-cloud-glow),
    0 -12px 34px color-mix(in srgb, var(--earth-cloud-light) 42%, transparent);
}

.cloud-bank::before,
.cloud-bank::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background:
    radial-gradient(circle at 28% 42%, var(--earth-cloud-light), transparent 34%),
    radial-gradient(circle at 62% 52%, var(--earth-cloud-mid), transparent 40%),
    radial-gradient(circle at 78% 30%, var(--earth-cloud-body), transparent 32%);
}

.cloud-bank::before {
  inset: -16% 8% 42% -4%;
  transform: rotate(-7deg);
  mix-blend-mode: screen;
  filter: blur(2px);
}

.cloud-bank::after {
  inset: 40% -5% -18% 16%;
  transform: rotate(8deg);
  opacity: 0.84;
}

.cloud-bank--far {
  left: 7%;
  top: 17%;
  width: 86%;
  height: 36%;
  filter: blur(13px) saturate(0.78) contrast(1.08);
  transform: translate3d(0, -18%, 0) rotate(-4deg) scale(0.52);
}

.cloud-bank--left {
  left: -22%;
  top: 22%;
  width: 76%;
  height: 63%;
  filter: blur(7px) saturate(0.76) contrast(1.12);
  transform: translate3d(18%, 6%, 0) rotate(9deg) scale(0.5);
}

.cloud-bank--right {
  right: -24%;
  top: 14%;
  width: 78%;
  height: 67%;
  filter: blur(7px) saturate(0.76) contrast(1.12);
  transform: translate3d(-18%, 8%, 0) rotate(-8deg) scale(0.48);
}

.cloud-bank--near-left {
  left: -30%;
  bottom: -20%;
  width: 78%;
  height: 58%;
  filter: blur(12px) saturate(0.72) contrast(1.08);
  transform: translate3d(20%, 18%, 0) rotate(12deg) scale(0.44);
}

.cloud-bank--near-right {
  right: -30%;
  bottom: -16%;
  width: 82%;
  height: 62%;
  filter: blur(13px) saturate(0.72) contrast(1.08);
  transform: translate3d(-20%, 18%, 0) rotate(-10deg) scale(0.42);
}

.dive-cloud-texture {
  position: absolute;
  inset: 0;
  opacity: 0.001;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.55' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.42'/%3E%3C/svg%3E");
  background-size: 260px 260px;
  mix-blend-mode: soft-light;
  mask-image: radial-gradient(ellipse at 50% 53%, transparent 0 15%, #000 34%, #000 78%, transparent 96%);
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.dive-cloud-haze {
  z-index: 4;
  inset: -8%;
  background:
    radial-gradient(ellipse at 50% 50%, transparent 0 18%, color-mix(in srgb, var(--earth-cloud-mid) 34%, transparent) 45%, transparent 72%),
    linear-gradient(105deg, transparent 10%, color-mix(in srgb, var(--earth-cloud-shadow) 50%, transparent) 46%, transparent 82%);
  filter: blur(18px);
}

.dive-vignette {
  z-index: 6;
  background: radial-gradient(
    circle at 50% 48%,
    transparent 0 23%,
    rgba(1, 8, 3, 0.08) 46%,
    rgba(0, 3, 1, 0.42) 82%,
    rgba(0, 2, 1, 0.58) 100%
  );
}

.earth-view.is-transitioning {
  pointer-events: none;
}

.earth-view.is-transitioning .dive-atmosphere {
  animation: atmosphere-dive var(--earth-dive-duration,1.05s) cubic-bezier(0.45, 0, 0.65, 1) both;
}

.earth-view.is-transitioning .dive-cloudscape::before {
  animation: cloud-sheet-left-dive var(--earth-dive-duration,1.05s) cubic-bezier(0.4, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .dive-cloudscape::after {
  animation: cloud-sheet-right-dive var(--earth-dive-duration,1.05s) cubic-bezier(0.4, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .cloud-bank--far {
  animation: cloud-far-dive var(--earth-dive-duration,1.05s) cubic-bezier(0.4, 0, 0.65, 1) both;
}

.earth-view.is-transitioning .cloud-bank--left {
  animation: cloud-left-dive var(--earth-dive-duration,1.05s) cubic-bezier(0.4, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .cloud-bank--right {
  animation: cloud-right-dive var(--earth-dive-duration,1.05s) cubic-bezier(0.4, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .cloud-bank--near-left {
  animation: cloud-near-left-dive var(--earth-dive-duration,1.05s) cubic-bezier(0.42, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .cloud-bank--near-right {
  animation: cloud-near-right-dive var(--earth-dive-duration,1.05s) cubic-bezier(0.42, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .dive-cloud-texture {
  animation: cloud-texture-dive var(--earth-dive-duration,1.05s) ease-in-out both;
}

.earth-view.is-transitioning .dive-cloud-haze {
  animation: cloud-haze-dive var(--earth-dive-duration,1.05s) ease-in-out both;
}

.earth-view.is-transitioning .dive-vignette {
  animation: dive-vignette var(--earth-dive-duration,1.05s) ease-in-out both;
}

.earth-view.is-transitioning::after {
  animation: earth-grid-dive var(--earth-dive-duration,1.05s) ease-in-out both;
}

@keyframes atmosphere-dive {
  0%, 8% { opacity: 0; transform: scale(0.42); }
  30% { opacity: 0.22; }
  52% { opacity: 0.72; }
  76% { opacity: 0.32; transform: scale(3.5); }
  100% { opacity: 0; transform: scale(5.2); }
}

@keyframes cloud-sheet-left-dive {
  0%, 14% { opacity: 0; transform: translate3d(-14%, -7%, 0) rotate(7deg) scale(0.72); }
  42% { opacity: 0.34; }
  65% { opacity: 0.78; transform: translate3d(-2%, 1%, 0) rotate(3deg) scale(1.08); }
  83% { opacity: 0.34; }
  100% { opacity: 0; transform: translate3d(15%, -6%, 0) rotate(-1deg) scale(1.46); }
}

@keyframes cloud-sheet-right-dive {
  0%, 17% { opacity: 0; transform: translate3d(14%, 8%, 0) rotate(-8deg) scale(0.7); }
  45% { opacity: 0.3; }
  67% { opacity: 0.74; transform: translate3d(2%, 0, 0) rotate(-3deg) scale(1.06); }
  84% { opacity: 0.3; }
  100% { opacity: 0; transform: translate3d(-16%, -5%, 0) rotate(1deg) scale(1.44); }
}

@keyframes cloud-far-dive {
  0%, 12% { opacity: 0; transform: translate3d(0, -18%, 0) rotate(-4deg) scale(0.52); }
  36% { opacity: 0.34; }
  60% { opacity: 0.74; transform: translate3d(-2%, 4%, 0) rotate(-2deg) scale(1.08); }
  82% { opacity: 0.28; }
  100% { opacity: 0; transform: translate3d(-4%, 32%, 0) rotate(1deg) scale(1.72); }
}

@keyframes cloud-left-dive {
  0%, 16% { opacity: 0; transform: translate3d(18%, 6%, 0) rotate(9deg) scale(0.5); }
  38% { opacity: 0.45; }
  59% { opacity: 0.98; transform: translate3d(6%, -1%, 0) rotate(5deg) scale(1.04); }
  74% { opacity: 0.78; transform: translate3d(-9%, -4%, 0) rotate(2deg) scale(1.32); }
  100% { opacity: 0; transform: translate3d(-46%, -13%, 0) rotate(-4deg) scale(1.82); }
}

@keyframes cloud-right-dive {
  0%, 18% { opacity: 0; transform: translate3d(-18%, 8%, 0) rotate(-8deg) scale(0.48); }
  40% { opacity: 0.42; }
  60% { opacity: 0.98; transform: translate3d(-5%, 0, 0) rotate(-5deg) scale(1.02); }
  75% { opacity: 0.76; transform: translate3d(10%, 3%, 0) rotate(-2deg) scale(1.3); }
  100% { opacity: 0; transform: translate3d(48%, -10%, 0) rotate(4deg) scale(1.84); }
}

@keyframes cloud-near-left-dive {
  0%, 32% { opacity: 0; transform: translate3d(20%, 18%, 0) rotate(12deg) scale(0.44); }
  53% { opacity: 0.38; }
  67% { opacity: 0.9; transform: translate3d(6%, 4%, 0) rotate(8deg) scale(1.1); }
  82% { opacity: 0.64; }
  100% { opacity: 0; transform: translate3d(-48%, -24%, 0) rotate(1deg) scale(2.02); }
}

@keyframes cloud-near-right-dive {
  0%, 34% { opacity: 0; transform: translate3d(-20%, 18%, 0) rotate(-10deg) scale(0.42); }
  54% { opacity: 0.36; }
  68% { opacity: 0.9; transform: translate3d(-5%, 5%, 0) rotate(-7deg) scale(1.08); }
  83% { opacity: 0.62; }
  100% { opacity: 0; transform: translate3d(50%, -22%, 0) rotate(-1deg) scale(2.06); }
}

@keyframes cloud-texture-dive {
  0%, 24% { opacity: 0; transform: translate3d(-3%, -2%, 0) scale(0.7); }
  52% { opacity: 0.16; }
  69% { opacity: 0.42; transform: translate3d(2%, 1%, 0) scale(1.12); }
  100% { opacity: 0; transform: translate3d(8%, 6%, 0) scale(1.75); }
}

@keyframes cloud-haze-dive {
  0%, 22% { opacity: 0; transform: scale(0.7); }
  52% { opacity: 0.24; }
  67% { opacity: 0.52; transform: scale(1.1); }
  86% { opacity: 0.2; }
  100% { opacity: 0; transform: scale(1.7); }
}

@keyframes dive-vignette {
  0%, 34% { opacity: 0; }
  62% { opacity: 0.38; }
  82% { opacity: 0.18; }
  100% { opacity: 0; }
}

@keyframes earth-grid-dive {
  0%, 38% { opacity: 1; }
  66% { opacity: 0.34; }
  100% { opacity: 0; }
}

@keyframes earth-view-in {
  from {
    opacity: 0;
    transform: scale(0.94);
    filter: blur(10px);
  }

  to {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
}
</style>
