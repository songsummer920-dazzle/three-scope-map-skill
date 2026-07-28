<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
  Legacy visual baseline with restrained motion refinement.
-->

<template>
  <div
    ref="host"
    class="earth-view"
    :class="{ 'is-transitioning': isTransitioning }"
    :style="earthThemeStyle"
  >
    <div class="earth-backdrop" aria-hidden="true" />
    <div class="dive-atmosphere" aria-hidden="true" />
    <div class="dive-cloudscape" aria-hidden="true">
      <div class="cloud-bank cloud-bank--far" />
      <div class="cloud-bank cloud-bank--left" />
      <div class="cloud-bank cloud-bank--right" />
      <div class="cloud-bank cloud-bank--near-left" />
      <div class="cloud-bank cloud-bank--near-right" />
      <div class="dive-cloud-texture" />
    </div>
    <div class="dive-cloud-haze" aria-hidden="true" />
    <div class="dive-vignette" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gsap } from 'gsap';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import chinaGeoJson from '../../assets/maps/china.json';
import worldGeoJson from '../../assets/maps/world.earth-render.json';
// Cropped 70–140°E / 15–55°N from NASA BMNG topography (0–6400 m scale).
// https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/
import chinaHeightUrl from '../../assets/textures/map/china/china-height-legacy.png';
import chinaNormalUrl from '../../assets/textures/map/china/china-normal-legacy.png';
import earthDayUrl from '../../assets/textures/map/world/earth-day.jpg';
import earthNormalUrl from '../../assets/textures/map/world/earth-normal.jpg';
import earthSpecularUrl from '../../assets/textures/map/world/earth-specular.jpg';
import earthLightsUrl from '../../assets/textures/map/world/earth-lights.png';
import type { GeoFeatureCollection, Position } from '../../types/geo';
import { MAP_THEME_PRIMARY } from './mapTheme';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

const emit = defineEmits<{
  'scene-ready': [];
  'intro-ready': [];
  'handoff-start': [];
  'enter-china': [];
}>();

const props = withDefaults(defineProps<{
  startIntro?: boolean;
}>(), {
  startIntro: true,
});

type PolygonRings = Position[][];

const chinaBoundaryBounds = {
  minLon: 70,
  maxLon: 140,
  minLat: 15,
  maxLat: 55,
};
let chinaOuterRingsCache: Position[][] | undefined;
let taiwanMainRingCache: Position[] | undefined;

function createEarthTheme(primaryValue: THREE.ColorRepresentation) {
  const primary = new THREE.Color(primaryValue);
  const legacyPrimary = new THREE.Color('#9fc53a');
  const mix = (target: THREE.ColorRepresentation, amount: number) => (
    primary.clone().lerp(new THREE.Color(target), amount)
  );
  const deriveLegacyRole = (legacyValue: THREE.ColorRepresentation) => {
    const primaryHsl = { h: 0, s: 0, l: 0 };
    const legacyPrimaryHsl = { h: 0, s: 0, l: 0 };
    const roleHsl = { h: 0, s: 0, l: 0 };
    primary.getHSL(primaryHsl);
    legacyPrimary.getHSL(legacyPrimaryHsl);
    new THREE.Color(legacyValue).getHSL(roleHsl);
    return new THREE.Color().setHSL(
      (roleHsl.h + primaryHsl.h - legacyPrimaryHsl.h + 1) % 1,
      THREE.MathUtils.clamp(roleHsl.s + primaryHsl.s - legacyPrimaryHsl.s, 0, 1),
      THREE.MathUtils.clamp(roleHsl.l + primaryHsl.l - legacyPrimaryHsl.l, 0, 1),
    );
  };
  const deriveShaderRole = (r: number, g: number, b: number) => {
    const primaryHsl = { h: 0, s: 0, l: 0 };
    const legacyPrimaryHsl = { h: 0, s: 0, l: 0 };
    const roleHsl = { h: 0, s: 0, l: 0 };
    primary.getHSL(primaryHsl);
    legacyPrimary.getHSL(legacyPrimaryHsl);
    new THREE.Color().setRGB(r, g, b).getHSL(roleHsl);
    return new THREE.Color().setHSL(
      (roleHsl.h + primaryHsl.h - legacyPrimaryHsl.h + 1) % 1,
      THREE.MathUtils.clamp(roleHsl.s + primaryHsl.s - legacyPrimaryHsl.s, 0, 1),
      THREE.MathUtils.clamp(roleHsl.l + primaryHsl.l - legacyPrimaryHsl.l, 0, 1),
    );
  };
  const rgb = (color: THREE.Color, alpha: number) => {
    const srgb = color.clone();
    return `rgba(${Math.round(srgb.r * 255)}, ${Math.round(srgb.g * 255)}, ${Math.round(srgb.b * 255)}, ${alpha})`;
  };
  return {
    primary,
    outline: deriveLegacyRole('#9fc53a'),
    highlight: deriveLegacyRole('#d3ff62'),
    worldLandDark: deriveLegacyRole('#020806'),
    worldLandLight: deriveLegacyRole('#283b25'),
    worldOutline: deriveLegacyRole('#61772d'),
    chinaSurface: deriveLegacyRole('#315807'),
    chinaInnerOutline: deriveLegacyRole('#839a42'),
    chinaOuterGlow: deriveLegacyRole('#739f22'),
    bottomEdge: deriveLegacyRole('#8faf2f'),
    star: deriveLegacyRole('#d9ffe0'),
    nodeHub: deriveLegacyRole('#d7ff6b'),
    node: deriveLegacyRole('#a7d94a'),
    ringHub: deriveLegacyRole('#cfff58'),
    ring: deriveLegacyRole('#8fbd37'),
    flyTrack: deriveLegacyRole('#718e38'),
    flyTrail: deriveLegacyRole('#749f28'),
    flyHead: deriveLegacyRole('#e5ff8a'),
    grid: deriveLegacyRole('#587822'),
    atmosphere: deriveLegacyRole('#9fcf6b'),
    outerAtmosphere: deriveLegacyRole('#4f7e2b'),
    sweep: deriveLegacyRole('#86bd43'),
    flowTail: deriveShaderRole(0.27, 0.54, 0.045),
    flowHead: deriveShaderRole(0.78, 1, 0.31),
    wallBottom: deriveShaderRole(0.035, 0.1, 0.006),
    wallMiddle: deriveShaderRole(0.16, 0.36, 0.018),
    wallTop: deriveShaderRole(0.58, 0.82, 0.11),
    wallEdge: deriveShaderRole(0.42, 0.82, 0.075),
    earthTint: deriveShaderRole(0.22, 0.41, 0.16),
    earthGrade: deriveShaderRole(0.58, 0.76, 0.46),
    oceanHighlight: deriveShaderRole(0.34, 0.46, 0.24),
    earthCityLight: deriveShaderRole(0.56, 0.58, 0.2),
    chinaFocus: deriveShaderRole(0.15, 0.4, 0.038),
    sweepSurface: deriveShaderRole(0.11, 0.18, 0.048),
    gridDot: deriveShaderRole(0.46, 0.62, 0.15),
    gridDotSweep: deriveShaderRole(0.58, 0.78, 0.24),
    landGrid: deriveShaderRole(0.27, 0.39, 0.11),
    landGridDot: deriveShaderRole(0.38, 0.54, 0.13),
    atmosphereSweep: deriveShaderRole(0.52, 0.72, 0.25),
    chinaRidge: deriveShaderRole(0.12, 0.24, 0.038),
    chinaSweep: deriveShaderRole(0.11, 0.18, 0.045),
    chinaInnerGlow: deriveShaderRole(0.14, 0.46, 0.026),
    chinaCityLight: deriveShaderRole(0.64, 0.67, 0.27),
    chinaSlopeLight: deriveShaderRole(0.18, 0.31, 0.055),
    chinaFlatTone: deriveShaderRole(0.085, 0.16, 0.045),
    // 星空背景保持中性近黑，不参与主题换色。
    background: new THREE.Color('#000201'),
    css: {
      background: '#000201',
      ambient: 'rgba(93, 160, 34, 0.1)',
      grid: rgb(mix('#ffffff', 0.28), 0.009),
      cloudShadow: rgb(mix('#1b281e', 0.5), 0.82),
      cloudBody: rgb(mix('#647261', 0.55), 0.9),
      cloudMid: rgb(mix('#a2ae97', 0.68), 0.8),
      cloudLight: rgb(mix('#e6eddb', 0.84), 0.72),
      cloudGlow: rgb(mix('#f2f8e9', 0.86), 0.52),
    },
  };
}

const earthTheme = createEarthTheme(MAP_THEME_PRIMARY);
const earthThemeStyle = {
  '--earth-background': earthTheme.css.background,
  '--earth-ambient': earthTheme.css.ambient,
  '--earth-grid': earthTheme.css.grid,
  '--earth-cloud-shadow': earthTheme.css.cloudShadow,
  '--earth-cloud-body': earthTheme.css.cloudBody,
  '--earth-cloud-mid': earthTheme.css.cloudMid,
  '--earth-cloud-light': earthTheme.css.cloudLight,
  '--earth-cloud-glow': earthTheme.css.cloudGlow,
};

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
const loadedTextures: THREE.Texture[] = [];
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
  varying float vProgress;

  void main() {
    vProgress = aProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
    float tail = (1.0 - smoothstep(0.012, 0.21, behindHead)) * validTrail;
    float head = 1.0 - smoothstep(0.0, 0.032, abs(vProgress - travel));
    float idleTravel = fract(uTime / (uCycleDuration * 0.82));
    float idleDistance = abs(vProgress - idleTravel);
    idleDistance = min(idleDistance, 1.0 - idleDistance);
    float idleCurrent = exp(-pow(idleDistance / 0.052, 2.0))
      * uIdleCurrentStrength;
    float basePath = 0.022;
    float flightAlpha = (basePath + tail * 0.72 + head) * flightVisibility;
    float alpha = (flightAlpha + idleCurrent) * uFade * uNetworkReveal;
    if (alpha < 0.004) discard;
    vec3 color = mix(
      uTrailColor,
      uHeadColor,
      clamp(head + tail * 0.3 + idleCurrent * 0.16, 0.0, 1.0)
    );
    color *= 1.0 + head * 0.35;
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
  uniform vec3 uOceanHighlightColor;
  uniform vec3 uChinaFocusColor;
  uniform vec3 uSweepSurfaceColor;
  uniform vec3 uGridDotColor;
  uniform vec3 uGridDotSweepColor;
  uniform vec3 uCityLightColor;
  uniform sampler2D uDayMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uSpecularMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uChinaMask;
  uniform float uChinaContact;
  uniform float uChinaFocus;
  varying vec2 vUv;
  varying vec3 vWorldRadial;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  varying vec3 vViewDirection;

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

  void main() {
    float surfaceReveal = smoothstep(0.0, 0.42, uIntroReveal);
    float gridReveal = smoothstep(0.28, 0.78, uIntroReveal);
    float minorGrid = max(gridLine(vUv.x, 72.0), gridLine(vUv.y, 36.0));
    float majorGrid = max(gridLine(vUv.x, 36.0), gridLine(vUv.y, 18.0));
    float grid = minorGrid * 0.56 + majorGrid * 0.22;
    float intersectionDot = gridDot(vUv, vec2(72.0, 36.0));
    vec3 tangentNormal = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    tangentNormal.xy *= 0.68;
    vec3 terrainNormal = normalize(
      vWorldEast * tangentNormal.x
      + vWorldNorth * tangentNormal.y
      + vWorldRadial * tangentNormal.z
    );
    vec3 lightDirection = normalize(uLightDirection);
    vec3 viewDirection = normalize(vViewDirection);
    float lightFacing = dot(terrainNormal, lightDirection);
    float wrappedLight = smoothstep(-0.34, 0.74, lightFacing);
    float nightSide = 1.0 - smoothstep(-0.18, 0.42, lightFacing);
    float fresnel = pow(1.0 - max(dot(normalize(vWorldRadial), viewDirection), 0.0), 2.65);

    vec3 daySurface = texture2D(uDayMap, vUv).rgb;
    float surfaceLuma = min(dot(daySurface, vec3(0.299, 0.587, 0.114)), 0.68);
    vec3 earthTint = uSurfaceTint * surfaceLuma;
    vec3 gradedSurface = mix(daySurface, earthTint, 0.79) * uEarthGrade;
    float polarLatitude = smoothstep(0.67, 0.94, abs(vUv.y * 2.0 - 1.0));
    float polarIce = polarLatitude * smoothstep(0.3, 0.62, surfaceLuma);
    vec3 polarTone = vec3(surfaceLuma * 0.08, surfaceLuma * 0.16, surfaceLuma * 0.09);
    gradedSurface = mix(gradedSurface, polarTone, polarIce * 0.9);
    vec3 color = gradedSurface * (0.105 + wrappedLight * 0.42);
    color *= mix(1.0, 0.64, polarLatitude);

    float oceanMask = texture2D(uSpecularMap, vUv).r;
    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float oceanHighlight = pow(max(dot(terrainNormal, halfDirection), 0.0), 88.0) * oceanMask;
    color += uOceanHighlightColor * oceanHighlight * (0.08 + wrappedLight * 0.43);

    vec3 nightTexture = texture2D(uNightMap, vUv).rgb;
    float nightLight = max(max(nightTexture.r, nightTexture.g), nightTexture.b);
    float cityPhase = dot(floor(vUv * vec2(720.0, 360.0)), vec2(12.9898, 78.233));
    float naturalTwinkle = 0.97 + sin(uTime * 0.82 + cityPhase) * 0.03;
    color += uCityLightColor * pow(nightLight, 1.35)
      * (0.1 + nightSide * 0.4) * naturalTwinkle;

    float chinaMask = texture2D(uChinaMask, vUv).r;
    float chinaCore = smoothstep(0.82, 0.985, chinaMask);
    float contactShadow = smoothstep(0.025, 0.78, chinaMask) * (1.0 - chinaCore);
    float chinaFocusHalo = smoothstep(0.055, 0.68, chinaMask)
      * (1.0 - smoothstep(0.76, 0.985, chinaMask));
    color *= 1.0 - contactShadow * 0.46 * uChinaContact;
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
    float surfaceSweep = sweepBand * uSweepSurfaceStrength * uSweepEnergy;
    float gridSweep = sweepBand * uSweepGridStrength * uSweepEnergy;
    float surfaceLightResponse = 0.72
      + max(dot(terrainNormal, sweepAxis), 0.0) * 0.28;
    color *= 1.0 + surfaceSweep * surfaceLightResponse
      * (0.08 + wrappedLight * 0.05);
    color += gradedSurface * surfaceSweep * 0.045;
    color += uSweepSurfaceColor
      * surfaceSweep * surfaceLightResponse * 0.16;
    color += uGridColor * grid * (0.04 + wrappedLight * 0.036)
      * gridReveal * uGridBreath;
    color += uGridDotColor * intersectionDot
      * (0.052 + wrappedLight * 0.042) * gridReveal * uGridBreath;
    color += uGridColor * grid * gridSweep * 0.12 * gridReveal;
    color += uGridDotSweepColor * intersectionDot
      * gridSweep * 0.16 * gridReveal;
    color += uGridColor * fresnel * mix(0.018, 0.1, wrappedLight);
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
    float light = 0.3 + max(dot(normalize(vNormal), normalize(vec3(-0.42, 0.78, 0.82))), 0.0) * 0.7;
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

  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  uniform float uIntensity;
  uniform vec3 uLightDirection;
  uniform float uSweepProgress;
  uniform float uSweepStrength;
  uniform float uSweepEnergy;
  uniform vec3 uSweepAxis;
  uniform vec3 uSweepColor;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
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
    float sweepRim = pow(clamp(rim, 0.0, 1.0), 1.5) * edgeSoftening;
    float sweepAlpha = sweepBand * sweepRim * uSweepStrength * uSweepEnergy;
    vec3 finalColor = mix(
      haloColor,
      uSweepColor,
      clamp(sweepBand * uSweepStrength * uSweepEnergy * 3.2, 0.0, 1.0)
    );
    float alpha = illuminatedRim * uIntensity + sweepAlpha;
    gl_FragColor = vec4(finalColor, alpha * uFade);
  }
`;

const chinaVertexShader = /* glsl */ `
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
      length(position) + vElevation * uElevationScale * uIntroElevation
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
  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
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

  void main() {
    float breath = 0.5 + 0.5 * sin(uTime * 2.0);
    float coarse = noise3(vPosition * 34.0);
    float fine = noise3(vPosition * 96.0);
    float grain = coarse * 0.68 + fine * 0.32;
    vec2 demUv = chinaDemUv(vGeoUv);
    vec3 tangentNormal = texture2D(uNormalMap, demUv).rgb * 2.0 - 1.0;
    vec3 terrainNormal = normalize(
      vWorldEast * tangentNormal.x
      + vWorldNorth * tangentNormal.y
      + vWorldRadial * tangentNormal.z
    );
    float lightFacing = dot(terrainNormal, normalize(uLightDirection));
    float sun = smoothstep(-0.18, 0.82, lightFacing);
    float slopeLight = dot(tangentNormal.xy, normalize(vec2(-0.68, 0.74)));
    float directional = clamp(0.38 + sun * 0.64 + slopeLight * 0.18, 0.26, 1.08);

    vec2 reliefStep = vec2(0.0027, 0.0048);
    float hEast = texture2D(uHeightMap, demUv + vec2(reliefStep.x, 0.0)).r;
    float hWest = texture2D(uHeightMap, demUv - vec2(reliefStep.x, 0.0)).r;
    float hNorth = texture2D(uHeightMap, demUv + vec2(0.0, reliefStep.y)).r;
    float hSouth = texture2D(uHeightMap, demUv - vec2(0.0, reliefStep.y)).r;
    float localAverage = (hEast + hWest + hNorth + hSouth) * 0.25;
    float valleyOcclusion = smoothstep(0.008, 0.085, localAverage - vElevation);
    float lightHorizon = texture2D(uHeightMap, demUv + vec2(-0.0065, 0.008)).r;
    float farHorizon = texture2D(uHeightMap, demUv + vec2(-0.013, 0.016)).r;
    float terrainShadow = max(
      smoothstep(0.01, 0.12, lightHorizon - vElevation),
      smoothstep(0.018, 0.16, farHorizon - vElevation) * 0.72
    );
    float steepnessOcclusion = 1.0 - smoothstep(0.15, 0.78, tangentNormal.z);
    float ridgeExposure = smoothstep(0.006, 0.075, vElevation - localAverage);
    directional *= 1.0 - valleyOcclusion * 0.3 - terrainShadow * 0.36 - steepnessOcclusion * 0.1;
    directional = max(directional, 0.2);

    vec3 daySurface = texture2D(uDayMap, vGeoUv).rgb;
    float rawLuma = dot(daySurface, vec3(0.299, 0.587, 0.114));
    float surfaceLuma = pow(min(rawLuma, 0.64), 1.34);
    float longitude = vGeoUv.x * 360.0 - 180.0;
    float latitude = vGeoUv.y * 180.0 - 90.0;
    float westernHighland = (1.0 - smoothstep(101.0, 113.0, longitude))
      * smoothstep(0.44, 0.78, vElevation);
    float northernDryland = (1.0 - smoothstep(108.0, 118.0, longitude))
      * smoothstep(34.0, 42.0, latitude)
      * (1.0 - westernHighland * 0.62);
    float easternPlain = smoothstep(103.0, 118.0, longitude)
      * (1.0 - smoothstep(39.0, 46.0, latitude));
    float northeastForest = smoothstep(116.0, 126.0, longitude)
      * smoothstep(38.0, 47.0, latitude);
    float southernForest = smoothstep(102.0, 116.0, longitude)
      * (1.0 - smoothstep(29.0, 35.0, latitude));

    vec3 plainTone = vec3(surfaceLuma * 0.12, surfaceLuma * 0.34, surfaceLuma * 0.052);
    vec3 plateauTone = vec3(surfaceLuma * 0.27, surfaceLuma * 0.45, surfaceLuma * 0.095);
    vec3 drylandTone = vec3(surfaceLuma * 0.29, surfaceLuma * 0.39, surfaceLuma * 0.085);
    vec3 forestTone = vec3(surfaceLuma * 0.085, surfaceLuma * 0.3, surfaceLuma * 0.04);
    vec3 northeastTone = vec3(surfaceLuma * 0.075, surfaceLuma * 0.255, surfaceLuma * 0.035);
    vec3 earthTone = plainTone;
    earthTone = mix(earthTone, plateauTone, westernHighland * 0.88);
    earthTone = mix(earthTone, drylandTone, northernDryland * 0.68);
    earthTone = mix(earthTone, forestTone, max(easternPlain * 0.52, southernForest * 0.76));
    earthTone = mix(earthTone, northeastTone, northeastForest * 0.72);
    vec3 albedo = mix(daySurface, earthTone, 0.84) * vec3(0.62, 0.8, 0.43);
    albedo *= 0.9 + grain * 0.1;
    albedo = mix(albedo, albedo * vec3(1.03, 1.1, 0.72), smoothstep(0.58, 0.92, vElevation) * 0.22);
    albedo += uColor * uHover * 0.055;
    vec3 color = albedo * directional * 1.16;
    color += uRidgeColor * ridgeExposure * (0.035 + sun * 0.095);

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
    float terrainSweep = sweepBand * uSweepSurfaceStrength
      * uSweepEnergy * terrainSweepResponse;
    color *= 1.0 + terrainSweep * 0.14;
    color += albedo * terrainSweep * 0.04;
    color += uAccentSoft * terrainSweep * 0.16;
    color += uAccentSoft
      * ridgeExposure * sweepBand * uSweepEnergy * 0.1;

    float innerGlow = texture2D(uInnerGlowMap, vGeoUv).r;
    float glowGradient = pow(max(innerGlow, 0.0), 0.92);
    float illuminatedGlow = glowGradient * (0.46 + sun * 0.4);
    color += uInnerGlowColor * illuminatedGlow * 1.24 * uInnerGlowPulse;

    vec3 nightTexture = texture2D(uNightMap, vGeoUv).rgb;
    float nightLight = max(max(nightTexture.r, nightTexture.g), nightTexture.b);
    float cityPhase = dot(
      floor(vGeoUv * vec2(720.0, 360.0)),
      vec2(12.9898, 78.233)
    );
    float naturalTwinkle = 0.97 + sin(uTime * 0.88 + cityPhase) * 0.03;
    color += uCityLightColor * pow(nightLight, 1.28)
      * 0.23 * naturalTwinkle;
    color += uSlopeLightColor * pow(max(slopeLight, 0.0), 4.0) * (0.01 + vElevation * 0.04);
    color *= 0.985 + breath * 0.015;
    float surfaceColorReveal = smoothstep(0.0, 0.12, uIntroElevation);
    vec3 flatChinaTone = mix(
      daySurface,
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
  varying float vProgress;

  void main() {
    vProgress = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const chinaContourVertexShader = /* glsl */ `
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
      length(position) + elevation * uElevationScale + uSurfaceOffset
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
      * (1.0 + uHover * 0.18) * uFade * uIntroReveal;
    gl_FragColor = vec4(color, alpha);
  }
`;

const chinaWallVertexShader = /* glsl */ `
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
      animatedRadius
        + elevation * uElevationScale * aDepth * uIntroElevation
    );
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vec3 radialNormal = normalize(mat3(modelMatrix) * normalize(displacedPosition));
    vec3 wallNormal = normalize(normalMatrix * normal);
    vFacing = max(dot(radialNormal, normalize(cameraPosition - worldPosition.xyz)), 0.0);
    vWallLight = 0.58 + max(dot(wallNormal, normalize(uLightDirection)), 0.0) * 0.42;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createWorldLand(radius: number) {
  const polygons = getPolygonRings(worldGeoJson as unknown as GeoFeatureCollection);
  const geometries = polygons
    .map((rings) => createSphericalShapeGeometry(rings, radius, 3.2))
    .filter((geometry): geometry is THREE.BufferGeometry => Boolean(geometry));
  const mergedGeometry = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!mergedGeometry) return undefined;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uFade: { value: 1 },
      uDark: { value: earthTheme.worldLandDark.clone() },
      uLight: { value: earthTheme.worldLandLight.clone() },
      uGridColor: { value: earthTheme.landGrid.clone() },
      uGridDotColor: { value: earthTheme.landGridDot.clone() },
    },
    vertexShader: landVertexShader,
    fragmentShader: landFragmentShader,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  animatedMaterials.push(material);
  const land = new THREE.Mesh(mergedGeometry, material);
  land.renderOrder = 2;
  return land;
}

function createWorldOutlines(radius: number) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: earthTheme.worldOutline,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const positions: number[] = [];
  getPolygonRings(worldGeoJson as unknown as GeoFeatureCollection).forEach((rings) => {
    rings.forEach((ring) => {
      if (ring.length < 2) return;
      for (let index = 0; index < ring.length; index += 1) {
        const current = ring[index];
        const next = ring[(index + 1) % ring.length];
        const start = lonLatToVector3(current[0], current[1], radius);
        const end = lonLatToVector3(next[0], next[1], radius);
        positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
      }
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
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
      uSurfaceOffset: { value: surfaceOffset },
      uColor: { value: new THREE.Color(color) },
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
      uFade: { value: 1 },
      uHover: { value: 0 },
      uIntroReveal: { value: 0 },
      uTailColor: { value: earthTheme.flowTail.clone() },
      uHeadColor: { value: earthTheme.flowHead.clone() },
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
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.userData.baseOpacity = 0.08;
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
  const geometries = polygons
    .map((rings) => createSphericalShapeGeometry(rings, radius, 0.8))
    .filter((geometry): geometry is THREE.BufferGeometry => Boolean(geometry));
  const mergedGeometry = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHover: { value: 0 },
      uFade: { value: 1 },
      uIntroReveal: { value: 0 },
      uIntroElevation: { value: 0 },
      uColor: { value: earthTheme.chinaSurface.clone() },
      uHeightMap: { value: heightMap },
      uNormalMap: { value: normalMap },
      uDayMap: { value: dayMap },
      uNightMap: { value: nightMap },
      uInnerGlowMap: { value: innerGlowMap },
      uLightDirection: { value: baseLightDirection.clone() },
      uInnerGlowPulse: { value: 1 },
      uSweepProgress: { value: 0 },
      uSweepSurfaceStrength: { value: 1.15 },
      uSweepEnergy: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSweepColor: { value: earthTheme.sweep.clone() },
      uAccentSoft: { value: earthTheme.chinaSweep.clone() },
      uRidgeColor: { value: earthTheme.chinaRidge.clone() },
      uInnerGlowColor: { value: earthTheme.chinaInnerGlow.clone() },
      uCityLightColor: { value: earthTheme.chinaCityLight.clone() },
      uSlopeLightColor: { value: earthTheme.chinaSlopeLight.clone() },
      uFlatTone: { value: earthTheme.chinaFlatTone.clone() },
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
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      glowMaterial.userData.baseOpacity = 0.18;
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
        opacity: 0.62,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      material.userData.baseOpacity = 0.62;
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
          uHeightMap: { value: heightMap },
          uElevationScale: { value: 0.028 },
          uLightDirection: { value: baseLightDirection.clone() },
          uBottomColor: { value: earthTheme.wallBottom.clone() },
          uMiddleColor: { value: earthTheme.wallMiddle.clone() },
          uTopColor: { value: earthTheme.wallTop.clone() },
          uEdgeColor: { value: earthTheme.wallEdge.clone() },
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
      opacity: 0.12,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    trackMaterial.userData.baseOpacity = 0.12;
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
        uIdleCurrentStrength: { value: 0.052 },
        uTrailColor: { value: earthTheme.flyTrail.clone() },
        uHeadColor: { value: earthTheme.flyHead.clone() },
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

function createEarthScene(onAssetsReady: () => void) {
  if (!scene) return;
  scene.add(createStars());

  const loadingManager = new THREE.LoadingManager();
  loadingManager.onLoad = onAssetsReady;
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const heightMap = textureLoader.load(chinaHeightUrl);
  const chinaNormalMap = textureLoader.load(chinaNormalUrl);
  const dayMap = textureLoader.load(earthDayUrl);
  const earthNormalMap = textureLoader.load(earthNormalUrl);
  const specularMap = textureLoader.load(earthSpecularUrl);
  const nightMap = textureLoader.load(earthLightsUrl);
  const chinaContactShadowMap = createChinaContactShadowTexture();
  const chinaInnerGlowMap = createChinaInnerGlowTexture();
  [heightMap, chinaNormalMap, earthNormalMap, specularMap].forEach((texture) => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() ?? 1, 8);
    loadedTextures.push(texture);
  });
  [dayMap, nightMap].forEach((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() ?? 1, 8);
    loadedTextures.push(texture);
  });
  chinaContactShadowMap.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() ?? 1, 8);
  chinaInnerGlowMap.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() ?? 1, 8);
  loadedTextures.push(chinaContactShadowMap, chinaInnerGlowMap);

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
      uGridColor: { value: earthTheme.grid.clone() },
      uLightDirection: { value: baseLightDirection.clone() },
      uSweepProgress: { value: 0 },
      uSweepGridStrength: { value: 1 },
      uSweepSurfaceStrength: { value: 1.15 },
      uSweepEnergy: { value: 1 },
      uGridBreath: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSurfaceTint: { value: earthTheme.earthTint.clone() },
      uEarthGrade: { value: earthTheme.earthGrade.clone() },
      uOceanHighlightColor: { value: earthTheme.oceanHighlight.clone() },
      uChinaFocusColor: { value: earthTheme.chinaFocus.clone() },
      uSweepSurfaceColor: { value: earthTheme.sweepSurface.clone() },
      uGridDotColor: { value: earthTheme.gridDot.clone() },
      uGridDotSweepColor: { value: earthTheme.gridDotSweep.clone() },
      uCityLightColor: { value: earthTheme.earthCityLight.clone() },
      uDayMap: { value: dayMap },
      uNormalMap: { value: earthNormalMap },
      uSpecularMap: { value: specularMap },
      uNightMap: { value: nightMap },
      uChinaMask: { value: chinaContactShadowMap },
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

  globeOrientation.add(createWorldOutlines(2.012));

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: earthTheme.atmosphere.clone() },
      uFade: { value: 1 },
      uIntensity: { value: 0.24 },
      uLightDirection: { value: baseLightDirection.clone() },
      uSweepProgress: { value: 0 },
      uSweepStrength: { value: 0 },
      uSweepEnergy: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSweepColor: { value: earthTheme.atmosphereSweep.clone() },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  atmosphereMaterial.userData.baseIntensity = 0.24;
  animatedMaterials.push(atmosphereMaterial);
  globeOrientation.add(new THREE.Mesh(new THREE.SphereGeometry(2.045, 96, 64), atmosphereMaterial));

  const outerGlowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: earthTheme.outerAtmosphere.clone() },
      uFade: { value: 1 },
      uIntensity: { value: 0.02 },
      uLightDirection: { value: baseLightDirection.clone() },
      uSweepProgress: { value: 0 },
      uSweepStrength: { value: 0 },
      uSweepEnergy: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSweepColor: { value: earthTheme.atmosphereSweep.clone() },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  outerGlowMaterial.userData.baseIntensity = 0.02;
  animatedMaterials.push(outerGlowMaterial);
  globeOrientation.add(new THREE.Mesh(new THREE.SphereGeometry(2.09, 96, 64), outerGlowMaterial));

  const sweepLightMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: earthTheme.sweep.clone() },
      uFade: { value: 1 },
      uIntensity: { value: 0 },
      uLightDirection: { value: baseLightDirection.clone() },
      uSweepProgress: { value: 0 },
      uSweepStrength: { value: 0.16 },
      uSweepEnergy: { value: 1 },
      uSweepAxis: { value: baseSweepAxis.clone() },
      uSweepColor: { value: earthTheme.atmosphereSweep.clone() },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  animatedMaterials.push(sweepLightMaterial);
  const sweepLight = new THREE.Mesh(
    new THREE.SphereGeometry(2.14, 96, 64),
    sweepLightMaterial,
  );
  sweepLight.renderOrder = 2;
  globeOrientation.add(sweepLight);

  const china = createChinaRegion(
    2.052,
    heightMap,
    chinaNormalMap,
    dayMap,
    nightMap,
    chinaInnerGlowMap,
  );
  chinaMesh = china.mesh;
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
  globeOrientation.add(createInternationalFlyNetwork());

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
  return raycaster.intersectObject(chinaMesh, false).length > 0;
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

function enterChina(event: PointerEvent) {
  const hostElement = host.value;
  if (introValue < 0.98 || isTransitioning.value || !hostElement || !renderer || !camera || !spinGroup || !globeOrientation) return;
  if (hoverTarget < 0.5 && !hitChina(event)) return;
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
}

function resize() {
  if (!host.value || !camera || !renderer) return;
  const width = Math.max(host.value.clientWidth, 1);
  const height = Math.max(host.value.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer?.setSize(width, height);
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
  raf = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.05);
  animationElapsed += Math.min(rawDelta, 0.16);
  const elapsed = animationElapsed;
  introValue = THREE.MathUtils.clamp(elapsed / introDuration, 0, 1);
  if (!hasEmittedIntroReady && introValue >= 0.68) {
    hasEmittedIntroReady = true;
    emit('intro-ready');
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
  if (controls && !isTransitioning.value) controls.enabled = introValue >= 0.98;
  controls?.update();
  const ambientMotionReveal = THREE.MathUtils.smoothstep(introValue, 0.55, 0.88);
  const interactionPausesIdle = introValue >= 0.98 && controlsInteracting;
  const idleMotionTarget = interactionPausesIdle || isTransitioning.value
    ? 0
    : ambientMotionReveal;
  idleMotionValue = THREE.MathUtils.damp(idleMotionValue, idleMotionTarget, 2.4, delta);
  const pointerParallaxActive = introValue >= 0.98
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
      pitch * idleMotionValue
        + THREE.MathUtils.degToRad(2) * earthRotationRemaining
        + pointerParallaxPitch,
      yaw * idleMotionValue
        - THREE.MathUtils.degToRad(7) * earthRotationRemaining
        + pointerParallaxYaw,
      roll * idleMotionValue
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
    1.16,
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
  const hoverLiftScale = 1 + hoverValue * 0.0038;
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
      material.opacity = baseOpacity * nodeReveal;
    });
    flyTrackMaterials.forEach((material) => {
      const baseOpacity = (material.userData.baseOpacity as number | undefined) ?? 0.12;
      material.opacity = baseOpacity * nodeReveal * flyTrackBreath;
    });
    flyNodePulses.forEach(({ ring, startOffset, cycleDuration }) => {
      const normalizedOffset = startOffset % cycleDuration;
      const pulseTime = (
        (elapsed - normalizedOffset) % cycleDuration + cycleDuration
      ) % cycleDuration;
      const pulseProgress = pulseTime / cycleDuration;
      const baseOpacity = (ring.material.userData.baseOpacity as number | undefined) ?? 0.22;
      ring.material.opacity = Math.sin(pulseProgress * Math.PI)
        * baseOpacity * nodeReveal;
      ring.scale.setScalar(0.72 + pulseProgress * 1.18);
    });
  }
  if (composer) composer.render(delta);
  else renderer.render(scene, camera);
}

function setup() {
  if (!host.value) return;
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
  scene.background = earthTheme.background.clone();
  scene.fog = new THREE.FogExp2(earthTheme.background, 0.021);

  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(0, 0.1, 7.0);
  cameraTarget.set(0, 0, 0);
  camera.lookAt(cameraTarget);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.domElement.style.visibility = 'hidden';
  host.value.appendChild(renderer.domElement);

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
  const startAnimation = () => {
    if (
      animationStarted
      || !renderer
      || !scene
      || !camera
      || !renderer.domElement.isConnected
    ) return;
    if (!composer) {
      requestAnimationFrame(startAnimation);
      return;
    }
    if (!scenePrepared) {
      scenePrepared = true;
      renderer.compile(scene, camera);
      composer.render(0);
      emit('scene-ready');
    }
    if (!props.startIntro) {
      requestIntroStart = startAnimation;
      return;
    }
    requestIntroStart = undefined;
    animationStarted = true;
    animationElapsed = 0;
    clock.start();
    renderer.domElement.style.visibility = '';
    animate();
  };
  createEarthScene(startAnimation);
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.1, 0.16, 0.93);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  renderer.domElement.addEventListener('pointerenter', onPointerEnter);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('pointerdown', enterChina);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host.value);
}

watch(() => props.startIntro, (ready) => {
  if (ready) requestIntroStart?.();
});

onMounted(setup);

onBeforeUnmount(() => {
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
  if (scene) disposeObject(scene);
  bloomPass?.dispose();
  composer?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  loadedTextures.forEach((texture) => texture.dispose());
  loadedTextures.length = 0;
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
  background:
    radial-gradient(circle at 50% 48%, var(--earth-ambient), transparent 33%),
    var(--earth-background);
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
  animation: atmosphere-dive 2.18s cubic-bezier(0.45, 0, 0.65, 1) both;
}

.earth-view.is-transitioning .dive-cloudscape::before {
  animation: cloud-sheet-left-dive 2.18s cubic-bezier(0.4, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .dive-cloudscape::after {
  animation: cloud-sheet-right-dive 2.18s cubic-bezier(0.4, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .cloud-bank--far {
  animation: cloud-far-dive 2.18s cubic-bezier(0.4, 0, 0.65, 1) both;
}

.earth-view.is-transitioning .cloud-bank--left {
  animation: cloud-left-dive 2.18s cubic-bezier(0.4, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .cloud-bank--right {
  animation: cloud-right-dive 2.18s cubic-bezier(0.4, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .cloud-bank--near-left {
  animation: cloud-near-left-dive 2.18s cubic-bezier(0.42, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .cloud-bank--near-right {
  animation: cloud-near-right-dive 2.18s cubic-bezier(0.42, 0, 0.62, 1) both;
}

.earth-view.is-transitioning .dive-cloud-texture {
  animation: cloud-texture-dive 2.18s ease-in-out both;
}

.earth-view.is-transitioning .dive-cloud-haze {
  animation: cloud-haze-dive 2.18s ease-in-out both;
}

.earth-view.is-transitioning .dive-vignette {
  animation: dive-vignette 2.18s ease-in-out both;
}

.earth-view.is-transitioning::after {
  animation: earth-grid-dive 2.18s ease-in-out both;
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
