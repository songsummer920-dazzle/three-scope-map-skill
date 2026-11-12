<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="map-stage" :style="activeMapStyle">
    <div ref="host" class="map-host" :data-has-frame="hasFrame" :data-load-phase="loadPhase" :aria-busy="loadPhase !== 'ready'" :data-terrain-resolution="terrainResolution" :data-terrain-detail="terrainDetail" :data-map-scope="activeScope" :data-map-code="activeCode" :data-map-presentation="props.mapPresentation" :data-map-surface="resolvedSurfaceVariant" :data-south-sea="isChinaCountryActive ? props.mapPresentation!=='standard' ? 'geographic-3d' : 'inset' : 'none'" :data-south-sea-islands="southSeaGeography.islands.length" :data-south-sea-segments="southSeaGeography.segments.length" />
    <span v-if="props.active && hasFrame && (loadPhase === 'building' || loadPhase === 'warming')" class="map-load-status" role="status"><i aria-hidden="true"/><span class="map-status-accessible">正在准备区域地图</span></span>
    <span v-if="props.active && !hologramSurfaceActive && props.mapPresentation !== 'standard' && terrainDetail === 'loading'" class="terrain-status map-load-status" role="status"><i aria-hidden="true"/><span class="map-status-accessible">正在细化地形</span></span>
    <span v-else-if="!hologramSurfaceActive && props.mapPresentation !== 'standard' && terrainDetail === 'overview'" class="terrain-status" role="status">地形概览 · 细节暂不可用</span>
    <svg
      class="south-sea-inset"
      :class="{ 'is-visible': props.active && hasFrame && loadPhase === 'ready' && isChinaCountryActive }"
      :style="{ width: `${southSeaInsetWidth}px`, right: southSeaInsetRight === undefined ? undefined : `${southSeaInsetRight}px`, bottom: props.mapPresentation === 'standard' ? undefined : 'max(16px, 4%)', '--south-sea-caption-size': `${8.5 * 92 / southSeaInsetWidth}px` }"
      viewBox="0 0 92 134"
      role="img"
      aria-label="南海诸岛附图"
      :aria-hidden="!props.active || !isChinaCountryActive"
    >
      <title>南海诸岛</title>
      <defs><clipPath :id="southSeaClipId"><rect x="5" y="5" width="82" height="108" /></clipPath></defs>
      <rect class="south-sea-inset__background" x=".5" y=".5" width="91" height="133" />
      <g :clip-path="`url(#${southSeaClipId})`" fill-rule="evenodd">
        <path v-for="(path,index) in southSeaInset.context" :key="`context-${index}`" class="south-sea-inset__context" :d="path" />
        <path v-for="(path,index) in southSeaInset.land" :key="`land-${index}`" class="south-sea-inset__land" :d="path" />
        <path v-for="(path,index) in southSeaInset.islets" :key="`islet-${index}`" class="south-sea-inset__islet" :d="path" />
        <path v-for="(path,index) in southSeaInset.segments" :key="`segment-${index}`" class="south-sea-inset__segment" :d="path" />
      </g>
      <path class="south-sea-inset__divider" d="M8 115 H84" />
      <text class="south-sea-inset__title" x="46" y="128" text-anchor="middle">南海诸岛</text>
      <rect class="south-sea-inset__frame" x=".5" y=".5" width="91" height="133" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import {FUI_EARTH_WARMUP_GATE} from './fuiEarthLifecycle';
import {FuiRendererJobs} from './fuiRendererJobs';
import {FuiGlassHdrPass} from './fuiGlassHdrPass';
import {supportsFuiGlassHalfFloat,supportedFuiGlassSamples} from './fuiGlassCapabilities';
import { inject, computed, onBeforeUnmount, onMounted, ref, watch, useId } from 'vue';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { createFuiMapGlassEnvironment, createFuiMapGlassMaterial, createFuiMapGlassFootprintStages, createFuiMapGlassBodyGeometryStages, createFuiMapGlassBodyFromGeometry, createFuiGlassWallOwnerLookup, FUI_MAP_GLASS_LEVELS } from './fuiMapGlass';
import {packFuiMapGeometryInput,runFuiMapGeometryWorker,unpackFuiMapGeometry,disposeFuiMapGeometry} from './fuiMapGeometry';
import {runFuiMapBuild} from './fuiMapBuildStages';
import {centerFuiMapProjection,type FuiRevealViewport} from './fuiMapRevealCamera';
import {createFuiMapSideGradientMaterial} from './fuiMapSideMaterial';
import {createSouthSeaInset} from './fuiSouthSeaInset';
import {getFuiSouthSeaData,createFuiSouthSeaMap,updateFuiSouthSeaMap,FUI_SOUTH_SEA_GLASS_LEVELS} from './fuiSouthSeaMap';
import southSeaContext from '../../assets/maps/south-sea-context.json';
import { getFuiMapMaterialPalette,getFuiMapOuterContourColor } from './fuiMapMaterial';
import { createFuiMapEdgeField,bindFuiMapGlassGlow,updateFuiMapGlassGlow,type FuiMapEdgeField } from './fuiMapGlow';
import { createFuiMapReflection,updateFuiMapReflection,resizeFuiMapReflection,FUI_MAP_REFLECTION_LAYER } from './fuiMapReflection';
import { refineFuiMapGeometry,createFuiTerrainState,createFuiFlatTerrainState,bindFuiTerrainGlass,bindFuiTerrainLine,bindFuiTerrainSideWall,bindFuiTerrainUniforms,bindFuiTerrainRaycast,prepareFuiTerrainRegional,updateFuiTerrainHitProxies,type FuiTerrainState } from './fuiMapTerrain';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GeoFeatureCollection, Position } from '../../types/geo';
import { initialMapState, loadMapLevel, prefetchMapLevel, type MapScope, type MapState } from './mapDataAdapter';
import {
  mapNavigationKey,
  mapStateToNavigationItem,
  type MapNavigationPath,
} from './mapNavigation';
import { createMapTerrainMaterial, waitForTerrainTexturesReady } from './mapTerrainMaterial';
import { createFuiMapSurface, updateFuiMapSurface, waitForFuiMapTexturesReady } from './fuiMapSurface';
import {createFuiMapHologramSurface,createFuiMapHologramBacking,updateFuiMapHologramSurface} from './fuiMapHologramSurface';
import {createFuiMapCapOpticsUniforms,setFuiMapCapRestView} from './fuiMapCapOptics';
import {isFuiChinaCountry,isFuiHainanFeature,resolveFuiHainanOwner,resolveFuiMapOpticalRegion,wrapFuiOpticalLongitude} from './fuiMapRegion';
import { createFuiMapBase, updateFuiMapBase } from './fuiMapBase';
import { requestFuiMapRelief, disposeFuiMapReliefCache, type FuiReliefBounds } from './fuiMapRelief';
import { FUI_MAP_HUD_LAYOUT, resolveFuiMapSurfaceVariant, type FuiMapPresentation, type FuiMapSurfaceVariant } from './fuiMapPresentation';
import {isFuiThemeColorId,type FuiEarthSkinId} from './fuiEarthTheme';
import {bindFuiClassicTerrainMaterial,getFuiClassicStyle,updateFuiClassicColors} from './fuiClassicTheme';
import {FUI_MAP_ENTRANCE_DURATION,createFuiEntrancePose,applyFuiEntrancePose,type FuiEntrancePose} from './fuiMapEntrance';
import { mapTheme, mapThemeStyle } from './mapTheme';
import {browserMapQualityBudget,type MapQuality} from './mapQuality';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

type MapFeature = GeoFeatureCollection['features'][number];
type MapLabel = { name: string; coord: Position; ripple?: boolean };
type CameraViewPreset = {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
};
type CameraViewConfig = {
  default: CameraViewPreset;
  byScope?: Partial<Record<MapScope, CameraViewPreset>>;
};
type SavedCameraViewConfig = {
  default?: CameraViewPreset;
  byScope?: Partial<Record<MapScope, CameraViewPreset>>;
};
type DrillStackItem = {
  state: MapState;
  cameraView?: CameraViewPreset;
};

const rendererJobs=new FuiRendererJobs();
const waitForEarthIntro=inject<(()=>Promise<void>)|undefined>(FUI_EARTH_WARMUP_GATE,undefined);
const host = ref<HTMLElement>();
const southSeaInsetWidth = ref(78);
const southSeaInsetRight = ref<number>();
let southSeaInsetLayoutKey = '';
const props = withDefaults(defineProps<{
  active?: boolean;
  showControls?: boolean;
  useInternalHudRing?: boolean;
  mapPresentation?: FuiMapPresentation;
  surfaceVariant?: FuiMapSurfaceVariant;
  skin?: FuiEarthSkinId;
  quality?:MapQuality;
  mapWaveEnabled?:boolean;
  initialNavigation?:MapNavigationPath;
}>(), {
  active: true,
  showControls: true,
  useInternalHudRing: true,
  mapPresentation: 'standard',
  surfaceVariant: 'terrain',
  skin: 'original',
  quality:'high',
  mapWaveEnabled:true,
});
const resolvedSurfaceVariant=computed(()=>resolveFuiMapSurfaceVariant(props.surfaceVariant,props.skin,props.mapPresentation));
const hologramSurfaceActive=computed(()=>resolvedSurfaceVariant.value==='hologram-glass');
const mapPaletteFamily=computed(()=>props.mapPresentation!=='standard'&&!hologramSurfaceActive.value?'entity':'shared');
const emit = defineEmits<{
  ready: [];
  loading: [stage:'building'|'warming'|'entering'|'ready'|'error'];
  'navigation-change': [path: MapNavigationPath];
  'hud-transform': [payload: {
    centerX: number;
    centerY: number;
    a: number;
    b: number;
    c: number;
    d: number;
  }];
}>();
let renderer: THREE.WebGLRenderer | undefined;
let componentDisposed=false;
let labelRenderer: CSS2DRenderer | undefined;
let scene: THREE.Scene | undefined;
let glassEnvironment:THREE.WebGLRenderTarget|undefined;
let glassHdrPass:FuiGlassHdrPass|undefined;
let glassFloatTargetsSupported=false;
let glassFloatTargetsEnabled=false;
let camera: THREE.PerspectiveCamera | undefined;
let controls: OrbitControls | undefined;
let raf = 0;
let resizeObserver: ResizeObserver | undefined;
let mapGroup: THREE.Group | undefined;
let ringDecorGroup: THREE.Group | undefined;
let provinceChaseLine: THREE.Mesh | undefined;
let provinceChasePath: {
  distances: Float32Array;
  total: number;
  tailLength: number;
} | undefined;
let lastHudTransformEmit = 0;
let lastHudTransformKey = '';
const raycaster = new THREE.Raycaster();
// Keep ordinary map picking on layer 0 while the smooth geography is drawn
// once through its linear HDR source, independently of the instrument/HUD.
const FUI_GLASS_SOURCE_LAYER=3;
raycaster.layers.enable(FUI_GLASS_SOURCE_LAYER);
const pointer = new THREE.Vector2();
const interactiveMeshes: THREE.Mesh[] = [];
const featureMeshes = new Map<string, THREE.Mesh[]>();
const featureLiftGroups = new Map<string, THREE.Group[]>();
const featureSideMaterials = new Map<string, THREE.ShaderMaterial[]>();
const featureHighlightMaterials = new Map<string, THREE.MeshBasicMaterial[]>();
const featureByName = new Map<string, MapFeature>();
let worldHitMesh: THREE.Mesh | undefined;
const cityLabelElements = new Map<string, HTMLDivElement>();
type ProjectedPolygonLookup = {
  rings: Array<Array<readonly [number, number]>>;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
type ProvinceOuterEdge = { count: number; start: Position; end: Position };
let projectedMapPolygonsCache: ProjectedPolygonLookup[] | undefined;
let provinceOuterEdgesCache: ProvinceOuterEdge[] | undefined;
const flyLineMaterials: THREE.ShaderMaterial[] = [];
let hoveredFeature = '';
let isDrilling = false;
let hasEmittedReady = false;
let hasUserAdjustedCamera = false;
let hasRenderedStaticFrame = false;
const hasFrame=ref(false);
const loadPhase=ref<'building'|'warming'|'entering'|'ready'|'error'>('building');
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let resolutionUpgradeHandle: number | undefined;
let nativeGeometryController:AbortController|undefined;
let revealViewport:FuiRevealViewport|undefined;
let revealCentered=false;
let revealVersion=0;
let revealPrepared=false;
let revealWarming=false;
let revealDiagnostics:Record<string,unknown>|undefined;
let submittedMapFrames=0;
const completedMapBuilds:string[]=[];
let currentState: MapState = initialMapState;
const activeScope = ref<MapScope>(initialMapState.scope);
const terrainDetail=ref('global');
const terrainResolution=ref(0);
const activeMapStyle=computed(()=>{
  if(props.mapPresentation==='standard')return getFuiClassicStyle(props.skin);
  const palette=getFuiMapMaterialPalette(props.skin,mapPaletteFamily.value);
  const rgba=(color:THREE.Color,alpha:number)=>{
    const c=color.clone().convertLinearToSRGB();
    const channel=(value:number)=>Math.round(THREE.MathUtils.clamp(value,0,1)*255);
    return `rgba(${channel(c.r)},${channel(c.g)},${channel(c.b)},${alpha})`;
  };
  return {...mapThemeStyle,
    '--map-stage-filter':'none',
    '--map-accent':palette.accent.getStyle(),'--map-accent-soft':palette.outer.getStyle(),
    '--map-stage-shadow':rgba(palette.accent,.20),
    '--map-drill-border':rgba(palette.outer,.50),'--map-drill-glow':rgba(palette.accent,.30),
    '--map-label-glow':rgba(palette.accent,.16),'--map-label-text-glow':rgba(palette.accent,.44),
    '--map-label-pointer-glow':rgba(palette.accent,.45),
    '--map-ripple-border':rgba(palette.accent,.54),'--map-ripple-center':rgba(palette.accent,.18),
    '--map-ripple-middle':rgba(palette.accent,.04),'--map-ripple-glow':rgba(palette.accent,.22),
  };
});
const activeCode = ref(initialMapState.code);
let mapPulseEpoch = 0;
let geoData = currentState.geoData;
let currentLabels: MapLabel[] = [];
let drillStack: DrillStackItem[] = [];
let drillControlEl: HTMLDivElement | undefined;
const mapWidth = 860;
const mapHeight = 530;
const mapPadding = 28;
const coastalFragmentFeatureNames = new Set(['舟山市', '宁波市', '台州市', '温州市']);
const minCoastalPolygonArea = 0.25;
const minInlandPolygonArea = 20;
const provinceChaseZ = 44.25;
const provinceChaseSegmentLength = 1.35;
const provinceChaseRibbonWidth = 2.02;
const provinceSilhouetteCellSize = 1.85;
const mapTransitionDuration = 0.78;
const fuiMapTransitionDuration=FUI_MAP_ENTRANCE_DURATION;
const southSeaInsetMinWidth = 62;
const southSeaInsetMaxWidth = 92;
const labelReferenceDistance = 880;
const cameraReferenceAspect = 16 / 9;
const cameraViewStorageKey = 'three-scope-map:smart-mine-template:camera-view:v2';
let cityLabelPresentationKey = '';

function currentNavigationPath(): MapNavigationPath {
  return [
    ...drillStack.map((item) => mapStateToNavigationItem(item.state)),
    mapStateToNavigationItem(currentState),
  ];
}

function emitNavigationChange() {
  emit('navigation-change', currentNavigationPath());
}
const cameraViewConfig: CameraViewConfig = {
  default: {
    fov: 31,
    position: [72, -760, 500],
    target: [-18, -42, 8],
  },
  byScope: {},
};
const provinceCapitalByName: Record<string, string> = {
  北京市: '北京市',
  天津市: '天津市',
  上海市: '上海市',
  重庆市: '重庆市',
  河北省: '石家庄市',
  山西省: '太原市',
  内蒙古自治区: '呼和浩特市',
  辽宁省: '沈阳市',
  吉林省: '长春市',
  黑龙江省: '哈尔滨市',
  江苏省: '南京市',
  浙江省: '杭州市',
  安徽省: '合肥市',
  福建省: '福州市',
  江西省: '南昌市',
  山东省: '济南市',
  河南省: '郑州市',
  湖北省: '武汉市',
  湖南省: '长沙市',
  广东省: '广州市',
  广西壮族自治区: '南宁市',
  海南省: '海口市',
  四川省: '成都市',
  贵州省: '贵阳市',
  云南省: '昆明市',
  西藏自治区: '拉萨市',
  陕西省: '西安市',
  甘肃省: '兰州市',
  青海省: '西宁市',
  宁夏回族自治区: '银川市',
  新疆维吾尔自治区: '乌鲁木齐市',
  台湾省: '台北市',
  香港特别行政区: '香港特别行政区',
  澳门特别行政区: '澳门特别行政区',
};
let lonMin = 0;
let lonMax = 0;
let latMin = 0;
let latMax = 0;
let mapScale = 1;
let projectedOffsetX = 0;
let projectedOffsetY = 0;
let mapBuildVersion = 0;
let rendererWarmupVersion = 0;
const scenePrepareStarted=performance.now();
let releaseVisibilityWait:(()=>void)|undefined;
let hiddenSince:number|undefined;
const retiredMapGroups:THREE.Group[]=[];

function disposeRetiredMapGroups(){for(const group of retiredMapGroups.splice(0))disposeObject3D(group);}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function waitForPreloadSlice() {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function waitForBuildSlice() {
  return props.active&&!document.hidden ? waitForNextFrame() : waitForPreloadSlice();
}

function waitForVisiblePage(){
  if(!document.hidden)return Promise.resolve();
  return new Promise<void>(resolve=>{
    const release=()=>{document.removeEventListener('visibilitychange',check);releaseVisibilityWait=undefined;resolve();};
    const check=()=>{if(!document.hidden)release();};
    releaseVisibilityWait=release;document.addEventListener('visibilitychange',check);
  });
}

function onPageVisibility(){
  if(host.value)host.value.dataset.pageVisible=String(!document.hidden);
  if(document.hidden){hiddenSince=performance.now()/1000;stopMapAnimation();return;}
  if(hiddenSince!==undefined&&mapGroup&&mapGroup.userData.transitionStart>0){
    mapGroup.userData.transitionStart+=performance.now()/1000-hiddenSince;
  }
  hiddenSince=undefined;
  if(props.active&&hasEmittedReady)startMapAnimation();
}

function disposeObject3D(object: THREE.Object3D) {
  if(rendererJobs.busy){void rendererJobs.afterPending(()=>disposeObject3DNow(object));return;}
  disposeObject3DNow(object);
}
function disposeObject3DNow(object: THREE.Object3D) {
  (object.userData.fuiReliefController as AbortController|undefined)?.abort();
  object.userData.fuiEdgeField?.texture.dispose();
  object.userData.fuiTerrain?.heightTexture?.dispose();
  const pending=object.userData.fuiPreparedGlass;
  if(pending){disposeFuiMapGeometry(pending);delete object.userData.fuiPreparedGlass;}
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),batches=new Set<THREE.BatchedMesh>();
  object.traverse((child) => {
    (child.userData.fuiReflectionTarget as THREE.WebGLRenderTarget|undefined)?.dispose();
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments)) return;
    if(child instanceof THREE.BatchedMesh)batches.add(child);
    for(const geometry of [child instanceof THREE.BatchedMesh?undefined:child.geometry,child.userData.originalGeometry,child.userData.texturedGeometry,child.userData.fuiTerrainHitProxy?.geometry])if(geometry)geometries.add(geometry);
    const current=Array.isArray(child.material)?child.material:[child.material];
    for(const material of [...current,child.userData.originalSurface,child.userData.texturedSurface,child.userData.hologramSurface,child.userData.fuiTerrainHitProxy?.material])if(material)materials.add(material);
  });
  batches.forEach(batch=>batch.dispose());geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
}

function isCameraViewPreset(value: unknown): value is CameraViewPreset {
  const maybeView = value as Partial<CameraViewPreset> | undefined;
  return !!maybeView
    && typeof maybeView.fov === 'number'
    && Array.isArray(maybeView.position)
    && Array.isArray(maybeView.target)
    && maybeView.position.length === 3
    && maybeView.target.length === 3
    && maybeView.position.every((item) => typeof item === 'number' && Number.isFinite(item))
    && maybeView.target.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function readSavedCameraViewConfig(): SavedCameraViewConfig {
  try {
    const raw = window.localStorage.getItem(currentCameraStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedCameraViewConfig | CameraViewPreset;
    if (isCameraViewPreset(parsed)) return { default: parsed };

    const savedConfig = parsed as SavedCameraViewConfig;
    const byScope = Object.fromEntries(
      Object.entries(savedConfig.byScope ?? {}).filter(([, view]) => isCameraViewPreset(view)),
    ) as Partial<Record<MapScope, CameraViewPreset>>;

    return {
      default: isCameraViewPreset(savedConfig.default) ? savedConfig.default : undefined,
      byScope,
    };
  } catch {
    return {};
  }
}

function writeSavedCameraViewConfig(config: SavedCameraViewConfig) {
  window.localStorage.setItem(currentCameraStorageKey(), JSON.stringify(config));
}

function currentCameraStorageKey(){return props.mapPresentation==='standard'?cameraViewStorageKey:'three-scope-map:fui-glass:camera-view:v1';}

function getFuiInstrumentFrame(){
  const points:THREE.Vector2[]=[];
  getRenderableFeatures().forEach(feature=>{
    const polygons=toTexturedPolygons(feature);
    const largest=polygons.reduce<Position[][]|undefined>((a,b)=>!a||ringProjectedArea(b[0])>ringProjectedArea(a[0])?b:a,undefined);
    largest?.[0].forEach(coord=>{const p=projectPoint(coord,0);points.push(new THREE.Vector2(p.x,p.y));});
  });
  const box=new THREE.Box2().setFromPoints(points),center=box.getCenter(new THREE.Vector2()),span=box.getSize(new THREE.Vector2());
  const radii=new THREE.Vector2(Math.max(30,span.x*.55),Math.max(30,span.y*.55,span.x*.55*.58));
  const fit=Math.max(1,...points.map(p=>Math.hypot((p.x-center.x)/radii.x,(p.y-center.y)/radii.y)))*1.02;
  radii.multiplyScalar(fit);return {points,center,radii};
}

function getFuiNorthScale(center?:THREE.Vector2){
  const y=(center??getFuiInstrumentFrame().center).y;
  const latitude=latMax-(mapHeight/2-y-projectedOffsetY)/mapScale;
  return 1/Math.max(.45,Math.cos(latitude*Math.PI/180));
}

function resolveFuiCameraView():CameraViewPreset{
  const frame=getFuiInstrumentFrame(),transform=getScopeTransform(),size=getHostSize();
  const matrix=new THREE.Matrix4().compose(transform.position,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-.09),new THREE.Vector3(transform.scale,transform.scale*getFuiNorthScale(frame.center),transform.scale));
  const world=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyMatrix4(matrix);
  const target=world(frame.center.x,frame.center.y,7);target.y-=35;
  const direction=new THREE.Vector3(0,-Math.cos(50*Math.PI/180),Math.sin(50*Math.PI/180));
  const right=new THREE.Vector3(1,0,0),up=direction.clone().cross(right).normalize();
  const fov=24,tan=Math.tan(fov*Math.PI/360),aspect=size.width/size.height;
  let distance=520;
  const contain=(p:THREE.Vector3,horizontal:number,vertical:number)=>{
    const delta=p.sub(target),near=delta.dot(direction);
    distance=Math.max(distance,near+Math.abs(delta.dot(right))/(tan*aspect*horizontal),near+Math.abs(delta.dot(up))/(tan*vertical));
  };
  frame.points.forEach(p=>contain(world(p.x,p.y,56),.78,.74));
  for(let i=0;i<48;i++){
    const a=i*Math.PI/24;
    contain(world(frame.center.x+Math.cos(a)*frame.radii.x*1.11,frame.center.y+Math.sin(a)*frame.radii.y*1.11,7),.98,.98);
  }
  if(currentState.scope==='country')southSeaGeography.fitPoints.forEach(coord=>{
    const p=projectPoint(coord,0);
    for(const z of [FUI_MAP_GLASS_LEVELS.bottom,FUI_MAP_GLASS_LEVELS.top])contain(world(p.x,p.y,z),.95,.94);
  });
  const position=target.clone().addScaledVector(direction,distance);
  return {fov,position:position.toArray() as [number,number,number],target:target.toArray() as [number,number,number]};
}

function fitBuiltInCameraViewToViewport(view: CameraViewPreset) {
  const { width, height } = getHostSize();
  const aspect = width / height;
  if (aspect >= cameraReferenceAspect) return view;

  const distanceScale = Math.min(1.5, (cameraReferenceAspect / aspect) * 1.02);
  const target = new THREE.Vector3(...view.target);
  const position = new THREE.Vector3(...view.position);
  position.sub(target).multiplyScalar(distanceScale).add(target);
  return {
    ...view,
    position: [position.x, position.y, position.z],
  } satisfies CameraViewPreset;
}

function resolveBuiltInCameraView(scope: MapScope) {
  if(props.mapPresentation!=='standard'&&scope!=='world'&&lonMax>lonMin)return resolveFuiCameraView();
  return fitBuiltInCameraViewToViewport(
    cameraViewConfig.byScope?.[scope] ?? cameraViewConfig.default,
  );
}

function resolveInitialCameraView(scope: MapScope) {
  const saved = readSavedCameraViewConfig();
  return saved.byScope?.[scope]
    ?? saved.default
    ?? resolveBuiltInCameraView(scope);
}

function getCurrentCameraView() {
  if (!camera || !controls) return undefined;
  return {
    fov: camera.fov,
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
  } satisfies CameraViewPreset;
}

function saveCurrentCameraView(mode: 'default' | 'scope') {
  const view = getCurrentCameraView();
  if (!view) return;
  hasUserAdjustedCamera = true;
  const saved = readSavedCameraViewConfig();
  if (mode === 'default') {
    writeSavedCameraViewConfig({ default: view });
    return;
  }
  writeSavedCameraViewConfig({
    ...saved,
    byScope: {
      ...(saved.byScope ?? {}),
      [currentState.scope]: view,
    },
  });
}

function resetCameraView(mode: 'scope' | 'all') {
  hasUserAdjustedCamera = false;
  if (mode === 'all') {
    window.localStorage.removeItem(currentCameraStorageKey());
    applyCameraView(resolveBuiltInCameraView(currentState.scope));
    return;
  }

  const saved = readSavedCameraViewConfig();
  const byScope = { ...(saved.byScope ?? {}) };
  if (saved.default) {
    byScope[currentState.scope] = resolveBuiltInCameraView(currentState.scope);
  } else {
    delete byScope[currentState.scope];
  }
  const nextSaved = {
    ...saved,
    byScope,
  };
  const hasScopeOverrides = Object.keys(byScope).length > 0;
  if (!nextSaved.default && !hasScopeOverrides) {
    window.localStorage.removeItem(currentCameraStorageKey());
  } else {
    writeSavedCameraViewConfig(nextSaved);
  }
  applyCameraView(resolveBuiltInCameraView(currentState.scope));
}

function applyInitialCameraViewForCurrentScope() {
  applyCameraView(resolveInitialCameraView(currentState.scope));
}

function flashButtonText(button: HTMLButtonElement, text: string, fallbackText: string) {
  button.textContent = text;
  window.setTimeout(() => {
    if (button.isConnected) button.textContent = fallbackText;
  }, 1200);
}

function handleCameraControlAction(action: string | undefined, button: HTMLButtonElement) {
  if (action === 'save-view-default') {
    saveCurrentCameraView('default');
    flashButtonText(button, '已保存统一', '保存统一');
    return true;
  }
  if (action === 'save-view-scope') {
    saveCurrentCameraView('scope');
    flashButtonText(button, '已保存本层', '保存本层');
    return true;
  }
  if (action === 'reset-view-scope') {
    resetCameraView('scope');
    flashButtonText(button, '已恢复本层', '恢复本层');
    return true;
  }
  if (action === 'reset-view-all') {
    resetCameraView('all');
    flashButtonText(button, '已恢复全部', '恢复全部');
    return true;
  }
  return false;
}

function applyCameraView(view: CameraViewPreset) {
  if (!camera) return;
  camera.fov = view.fov;
  camera.position.set(...view.position);
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.set(...view.target);
    controls.update();
  } else {
    camera.lookAt(...view.target);
  }
}

function updateSouthSeaInsetLayout() {
  if (!host.value || currentState.scope !== 'country' || lonMax <= lonMin) return;
  const {width,height}=getHostSize();
  const layoutKey=`${width}:${height}:${props.mapPresentation}`;
  if(layoutKey===southSeaInsetLayoutKey)return;
  southSeaInsetLayoutKey=layoutKey;
  const nextWidth = Math.round(THREE.MathUtils.clamp(height*78/720,southSeaInsetMinWidth,southSeaInsetMaxWidth)*10)/10;
  if (nextWidth !== southSeaInsetWidth.value) southSeaInsetWidth.value = nextWidth;
  if(props.mapPresentation==='standard'){southSeaInsetRight.value=undefined;return;}
  // The inset is screen-space UI. Derive its initial HUD-aligned anchor from
  // the built-in view, never the live/saved orbit camera or animated map pose.
  // Only a container resize or presentation change recomputes this layout.
  const view=resolveFuiCameraView(),frame=getFuiInstrumentFrame(),transform=getScopeTransform();
  const layoutCamera=new THREE.PerspectiveCamera(view.fov,width/height,1,2400);
  layoutCamera.position.set(...view.position);layoutCamera.lookAt(...view.target);layoutCamera.updateMatrixWorld(true);
  const matrix=new THREE.Matrix4().compose(transform.position,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-.09),new THREE.Vector3(transform.scale,transform.scale*getFuiNorthScale(frame.center),transform.scale));
  let rightmost=-Infinity;
  const point=new THREE.Vector3();
  for(let i=0;i<128;i++){
    const angle=i*Math.PI/64;
    point.set(frame.center.x+Math.cos(angle)*frame.radii.x*FUI_MAP_HUD_LAYOUT.ring/492,frame.center.y+Math.sin(angle)*frame.radii.y*FUI_MAP_HUD_LAYOUT.ring/492,7);
    point.applyMatrix4(matrix).project(layoutCamera);
    if(point.z>=-1&&point.z<=1)rightmost=Math.max(rightmost,(point.x+1)*width*.5);
  }
  if(Number.isFinite(rightmost)){
    const right=Math.round(THREE.MathUtils.clamp(width-rightmost,12,Math.max(12,width-nextWidth-12))*10)/10;
    if(right!==southSeaInsetRight.value)southSeaInsetRight.value=right;
  }
}

function getCityLabelScale(cameraDistance: number) {
  if (!controls) return 0.75;
  if (cameraDistance <= labelReferenceDistance) {
    const nearProgress = THREE.MathUtils.clamp(
      (labelReferenceDistance - cameraDistance)
        / Math.max(labelReferenceDistance - controls.minDistance, 1),
      0,
      1,
    );
    return THREE.MathUtils.lerp(0.75, 1, THREE.MathUtils.smoothstep(nearProgress, 0, 1));
  }
  const farProgress = THREE.MathUtils.clamp(
    (cameraDistance - labelReferenceDistance)
      / Math.max(controls.maxDistance - labelReferenceDistance, 1),
    0,
    1,
  );
  return THREE.MathUtils.lerp(0.75, 0.62, THREE.MathUtils.smoothstep(farProgress, 0, 1));
}

function updateCityLabelPresentation() {
  if (!camera || !controls || !labelRenderer) return;
  const cameraDistance = camera.position.distanceTo(controls.target);
  const labelScale = getCityLabelScale(cameraDistance);
  const nextPresentationKey = [
    labelScale.toFixed(3),
    currentState.scope,
  ].join(':');
  if (nextPresentationKey === cityLabelPresentationKey) return;
  cityLabelPresentationKey = nextPresentationKey;

  const baseWidth = 68 * labelScale;
  const baseHeight = 41 * labelScale;
  const baseFontSize = THREE.MathUtils.lerp(
    8,
    10,
    THREE.MathUtils.clamp((labelScale - 0.62) / 0.38, 0, 1),
  );
  const selectedScale = 1.18;
  const style = labelRenderer.domElement.style;
  style.setProperty('--map-label-width', `${baseWidth.toFixed(1)}px`);
  style.setProperty('--map-label-height', `${baseHeight.toFixed(1)}px`);
  style.setProperty('--map-label-padding-x', `${(5 * labelScale).toFixed(1)}px`);
  style.setProperty('--map-label-padding-bottom', `${(11 * labelScale).toFixed(1)}px`);
  style.setProperty('--map-label-font-size', `${baseFontSize.toFixed(1)}px`);
  style.setProperty('--map-label-line-height', `${(baseFontSize * 1.4).toFixed(1)}px`);
  style.setProperty('--map-label-selected-width', `${(baseWidth * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-height', `${(baseHeight * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-padding-x', `${(5 * labelScale * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-padding-bottom', `${(11 * labelScale * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-font-size', `${(baseFontSize * selectedScale).toFixed(1)}px`);
  style.setProperty('--map-label-selected-line-height', `${(baseFontSize * selectedScale * 1.4).toFixed(1)}px`);
}

function updateCameraResponsiveOverlays() {
  updateSouthSeaInsetLayout();
  updateCityLabelPresentation();
  updateDashboardHudTransform();
}

function updateDashboardHudTransform() {
  if (!camera || !mapGroup || !host.value) return;
  const now = performance.now();
  if (now - lastHudTransformEmit < 50) return;

  const { width, height } = getHostSize();
  mapGroup.updateWorldMatrix(true, false);
  const hudPlaneZ = 14;
  const mapCenterWorld = mapGroup.localToWorld(new THREE.Vector3(0, 0, hudPlaneZ));
  const xWorld = mapGroup.localToWorld(new THREE.Vector3(100, 0, hudPlaneZ));
  const yWorld = mapGroup.localToWorld(new THREE.Vector3(0, 100, hudPlaneZ));
  const centerWorld = controls?.target.clone() ?? mapCenterWorld;
  const centerCorrection = centerWorld.clone().sub(mapCenterWorld);
  xWorld.add(centerCorrection);
  yWorld.add(centerCorrection);
  const project = (point: THREE.Vector3) => {
    const projected = point.project(camera!);
    return new THREE.Vector2(
      (projected.x + 1) * width * 0.5,
      (1 - projected.y) * height * 0.5,
    );
  };
  const center = project(centerWorld);
  const xPoint = project(xWorld);
  const yPoint = project(yWorld);
  const xAxis = xPoint.sub(center);
  const yAxis = yPoint.sub(center);
  const xLength = Math.max(0.0001, xAxis.length());
  const payload = {
    centerX: center.x,
    centerY: center.y,
    a: xAxis.x / xLength,
    b: xAxis.y / xLength,
    c: yAxis.x / xLength,
    d: yAxis.y / xLength,
  };
  const key = Object.values(payload).map((value) => value.toFixed(3)).join(':');
  if (key === lastHudTransformKey) return;
  lastHudTransformEmit = now;
  lastHudTransformKey = key;
  emit('hud-transform', payload);
}

function mapPointFromLocal(localPoint: THREE.Vector3) {
  return [
    localPoint.x + mapWidth / 2,
    mapHeight / 2 - localPoint.y,
  ] as const;
}

function getScopeTransform() {
  if (currentState.scope === 'world') {
    return {
      position: new THREE.Vector3(-18, -40, -22),
      scale: 0.9,
    };
  }
  return {
    position: new THREE.Vector3(-16, -42, -22),
    scale: currentState.scope === 'country' ? 0.7 : 0.768,
  };
}

function forEachMaterial(object: THREE.Object3D, callback: (material: THREE.Material) => void) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material) {
        callback(material);
        if(material instanceof THREE.ShaderMaterial && material.userData.fuiOpacityUniform) {
          material.uniforms.uOpacity.value=material.opacity;
        }
      }
    });
  });
}

function primeGroupOpacity(group: THREE.Group) {
  forEachMaterial(group, (material) => {
    material.userData.baseOpacity ??= material.opacity;
    if(props.mapPresentation!=='standard')return;
    material.transparent = true;
    material.opacity = 0;
  });
}

function settleMapForStaticFrame(group: THREE.Group) {
  const baseScale = group.userData.baseScale as number | undefined;
  const basePosition = group.userData.basePosition as THREE.Vector3 | undefined;
  if (baseScale !== undefined) group.scale.set(baseScale,baseScale*(props.mapPresentation!=='standard'?(group.userData.fuiNorthScale??1):1),baseScale);
  if (basePosition) group.position.copy(basePosition);
  group.userData.transitionStart = undefined;
  group.rotation.z=group.userData.baseRotation??group.rotation.z;
  forEachMaterial(group, (material) => {
    material.opacity = material.userData.baseOpacity ?? material.opacity;
  });
  if (labelRenderer?.domElement) labelRenderer.domElement.style.opacity = '1';
  hasRenderedStaticFrame = true;
}

function beginMapEntrance(group:THREE.Group){
  settleMapForStaticFrame(group);
  if(reducedMotion){
    loadPhase.value='ready';emit('loading','ready');
    if(renderer)renderer.domElement.style.opacity='1';
    refreshDrillControl();return;
  }
  if(props.mapPresentation!=='standard'){
    const center=getFuiInstrumentFrame().center;
    group.userData.fuiEntrancePose=createFuiEntrancePose(group,new THREE.Vector3(center.x,center.y,12));
    applyFuiEntrancePose(group,group.userData.fuiEntrancePose,0);
  }else primeGroupOpacity(group);
  // Arm the clock; its origin is the first actual animated frame after warm-up.
  group.userData.transitionStart=-1;
  loadPhase.value='entering';emit('loading','entering');
  if(labelRenderer)labelRenderer.domElement.style.opacity='0';
  if(renderer)renderer.domElement.style.opacity='0';
  if(controls)controls.enabled=false;
  if(host.value)host.value.dataset.entryProgress='0';
  refreshDrillControl();
}

function prepareEntrance(){
  if(!mapGroup||isDrilling||loadPhase.value!=='ready')return;
  resetAllFeatureHighlights();beginMapEntrance(mapGroup);
}

function replayEntrance(){
  if(!props.active||!mapGroup||isDrilling||loadPhase.value!=='ready')return;
  resetAllFeatureHighlights();beginMapEntrance(mapGroup);startMapAnimation();
}

function applyGroupTransition(group: THREE.Group, time: number) {
  let startedAt = group.userData.transitionStart as number | undefined;
  if (startedAt===undefined) return;
  if(startedAt<0){startedAt=time;group.userData.transitionStart=time;}

  const textured=props.mapPresentation!=='standard';
  const progress = Math.min(1, (time - startedAt) / (textured?fuiMapTransitionDuration:mapTransitionDuration));
  const eased = 1 - (1 - progress) ** 3;
  const baseScale = group.userData.baseScale as number;
  const basePosition = group.userData.basePosition as THREE.Vector3;

  if(textured)applyFuiEntrancePose(group,group.userData.fuiEntrancePose as FuiEntrancePose,progress);
  else{
    const introScale = THREE.MathUtils.lerp(baseScale * 0.84, baseScale, eased);
    group.scale.set(introScale, introScale, introScale);
    group.position.x = basePosition.x;
    group.position.y = basePosition.y + THREE.MathUtils.lerp(28, 0, eased);
    group.position.z = basePosition.z + THREE.MathUtils.lerp(-34, 0, eased);
    forEachMaterial(group, (material) => {material.opacity = (material.userData.baseOpacity ?? 1) * eased;});
  }
  group.userData.fuiEntranceProgress=progress;
  if(host.value)host.value.dataset.entryProgress=progress.toFixed(3);
  if(renderer)renderer.domElement.style.opacity=String(THREE.MathUtils.smoothstep(progress,0,.24));
  if (labelRenderer?.domElement) {
    labelRenderer.domElement.style.opacity = String(THREE.MathUtils.smoothstep(progress,.68,1));
  }

  if (progress >= 1) {
    group.userData.transitionStart = undefined;
    group.userData.fuiGroundShownAt=time-.72;
    loadPhase.value='ready';emit('loading','ready');
    if(controls)controls.enabled=true;
    if(renderer)renderer.domElement.style.opacity='1';
    forEachMaterial(group, (material) => {
      material.opacity = material.userData.baseOpacity ?? material.opacity;
    });
    if (labelRenderer?.domElement) labelRenderer.domElement.style.opacity = '1';
    refreshDrillControl();
  }
}

function findFeatureAtMapPoint(point: readonly [number, number]) {
  return getRenderableFeatures().find((feature) => (
    toPolygons(feature).some((polygon) => pointInProjectedPolygon(point, polygon))
  ));
}

function isDecorativeChinaInset(feature: MapFeature) {
  const name = getFeatureName(feature);
  const code = getFeatureCode(feature);
  return currentState.scope === 'country' && !name && code.includes('_JD');
}

function isRenderableFeature(feature: MapFeature) {
  if (currentState.scope === 'world') return isWorldDisplayFeature(feature);
  return !isDecorativeChinaInset(feature);
}

function getRenderableFeatures() {
  return geoData.features.filter(isRenderableFeature);
}

function toPolygons(feature: GeoFeatureCollection['features'][number]) {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as Position[][]]
    : feature.geometry.coordinates as Position[][][];
}

function updateProjectionFromGeoData() {
  refreshSouthSeaForCurrentState();
  lonMin = Infinity;
  lonMax = -Infinity;
  latMin = Infinity;
  latMax = -Infinity;

  getRenderableFeatures().forEach((feature) => {
    toPolygons(feature).forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach((coord) => {
          lonMin = Math.min(lonMin, coord[0]);
          lonMax = Math.max(lonMax, coord[0]);
          latMin = Math.min(latMin, coord[1]);
          latMax = Math.max(latMax, coord[1]);
        });
      });
    });
  });

  if (!Number.isFinite(lonMin) || !Number.isFinite(lonMax) || !Number.isFinite(latMin) || !Number.isFinite(latMax)) {
    lonMin = 0;
    lonMax = 1;
    latMin = 0;
    latMax = 1;
  }
  mapScale = Math.min(
    (mapWidth - mapPadding * 2) / Math.max(0.0001, lonMax - lonMin),
    (mapHeight - mapPadding * 2) / Math.max(0.0001, latMax - latMin),
  );
  const projectedWidth = (lonMax - lonMin) * mapScale;
  const projectedHeight = (latMax - latMin) * mapScale;
  projectedOffsetX = (mapWidth - projectedWidth) / 2;
  projectedOffsetY = (mapHeight - projectedHeight) / 2;
}

function projectCoord(coord: readonly [number, number]) {
  return [
    projectedOffsetX + (coord[0] - lonMin) * mapScale,
    projectedOffsetY + (latMax - coord[1]) * mapScale,
  ] as const;
}

function ringProjectedArea(ring: Position[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = projectCoord(ring[index]);
    const next = projectCoord(ring[(index + 1) % ring.length]);
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
}

function simplifyRingForScope(ring: Position[]) {
  // Independent point-striding destroys coincident administrative borders.
  // Keep regional source topology intact; only the separate world cache is reduced.
  if(currentState.scope!=='world')return ring;
  const maxPoints = 130;
  if (ring.length <= maxPoints) return ring;
  const step = Math.ceil(ring.length / maxPoints);
  const simplified = ring.filter((_, index) => index % step === 0);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (last && first && (last[0] !== first[0] || last[1] !== first[1])) {
    simplified.push(last);
  }
  return simplified.length >= 4 ? simplified : ring;
}

function toRenderablePolygons(feature: GeoFeatureCollection['features'][number]) {
  const featureName = getFeatureName(feature);
  const scopeAreaFloor = currentState.scope === 'world' ? 4 : currentState.scope === 'country' ? 8 : minInlandPolygonArea;
  const minArea = coastalFragmentFeatureNames.has(featureName) ? minCoastalPolygonArea : scopeAreaFloor;
  const polygons=toPolygons(feature);
  const primary=polygons.reduce<Position[][]|undefined>((largest,polygon)=>
    !largest||ringProjectedArea(polygon[0])>ringProjectedArea(largest[0])?polygon:largest,undefined);
  return polygons
    // Area thresholds may trim secondary fragments, never an entire region.
    .filter((polygon) => polygon===primary || ringProjectedArea(polygon[0]) >= minArea)
    .map((polygon) => polygon.map((ring) => simplifyRingForScope(ring)));
}

function toTexturedPolygons(feature:MapFeature){
  const polygons=toRenderablePolygons(feature);
  if(!isFuiChinaCountry(currentState.geoData,currentState)||!isFuiHainanFeature(feature))return polygons;
  // Remote islets use the geographically registered shallow maritime layer.
  // Keep them out of the thick mainland body and its terrain-edge field.
  return polygons.filter(polygon=>polygon[0].some(coord=>coord[1]>=17.5));
}

function getFeatureName(feature: MapFeature) {
  const props = feature.properties ?? {};
  return String(
    props.fullname
    ?? props.name
    ?? props.ADMIN
    ?? props.NAME
    ?? props.name_en
    ?? props.adcode
    ?? props.code
    ?? '',
  );
}

function getFeatureCode(feature: MapFeature) {
  const props = feature.properties ?? {};
  const code = props.adcode ?? props.code ?? props.id ?? props.ISO_A3 ?? props.ISO_A2 ?? props.ADM0_A3;
  return code === undefined || code === null ? '' : String(code);
}

const isChinaCountryActive=computed(()=>activeScope.value==='country'&&activeCode.value==='100000');
let southSeaGeography=getFuiSouthSeaData(initialMapState.geoData,initialMapState);
const southSeaClipId=`south-sea-${useId()}`;
const southSeaInset=ref(createSouthSeaInset(initialMapState.geoData,southSeaContext as unknown as GeoFeatureCollection,initialMapState));
function refreshSouthSeaForCurrentState(){
  southSeaGeography=getFuiSouthSeaData(currentState.geoData,currentState);
  southSeaInset.value=createSouthSeaInset(currentState.geoData,southSeaContext as unknown as GeoFeatureCollection,currentState);
}

function bindSouthSeaFeatureOwner(maritime:THREE.Group){
  const owner=resolveFuiHainanOwner({type:'FeatureCollection',features:getRenderableFeatures()});
  if(!owner)return;
  const {feature,name}=owner,state=maritime.userData.fuiSouthSea;
  state.islandMesh.userData.featureName=name;
  state.islandMesh.userData.featureCode=getFeatureCode(feature)||'460000';
  featureLiftGroups.get(name)?.push(state.islandGroup);
}

function featureCenter(feature: MapFeature): Position {
  const center = feature.properties?.center;
  if (Array.isArray(center) && typeof center[0] === 'number' && typeof center[1] === 'number') {
    return [center[0], center[1]];
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  toPolygons(feature).forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach((coord) => {
        minX = Math.min(minX, coord[0]);
        maxX = Math.max(maxX, coord[0]);
        minY = Math.min(minY, coord[1]);
        maxY = Math.max(maxY, coord[1]);
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return [0, 0];
  }
  return [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
  ];
}

function createLabelsForState(): MapLabel[] {
  const keyWorldLabels = new Set([
    'China',
    'United States of America',
    'Russia',
    'India',
    'Brazil',
    'Australia',
    'Canada',
  ]);

  const labels = getRenderableFeatures()
    .map((feature) => ({ name: getFeatureName(feature), coord: featureCenter(feature) }))
    .filter((label) => {
      if (!label.name) return false;
      if (currentState.scope === 'world') return keyWorldLabels.has(label.name);
      return true;
    })
    .slice(0, currentState.scope === 'world' ? 8 : currentState.scope === 'country' ? 36 : 60);
  const rippleSourceName = getEffectSourceLabelName(labels);
  return labels.map((label) => ({
    ...label,
    ripple: label.name === rippleSourceName,
  }));
}

function projectPoint(coord: readonly [number, number], z = 0) {
  const point = projectCoord(coord);
  return new THREE.Vector3(point[0] - mapWidth / 2, -(point[1] - mapHeight / 2), z);
}

function projectRing(ring: Position[]) {
  const points = ring.map((coord) => projectPoint(coord));
  const last = points[points.length - 1];
  const first = points[0];
  if (last && first && (last.x !== first.x || last.y !== first.y)) {
    points.push(first.clone());
  }
  return points;
}

function makeShape(rings: Position[][]) {
  let outer = projectRing(rings[0]);
  if (!THREE.ShapeUtils.isClockWise(outer.map((point) => new THREE.Vector2(point.x, point.y)))) {
    outer = outer.reverse();
  }
  const start = outer[0];
  const shape = new THREE.Shape();
  shape.moveTo(start.x, start.y);
  outer.slice(1).forEach((point) => {
    shape.lineTo(point.x, point.y);
  });
  shape.closePath();

  rings.slice(1).forEach((ring) => {
    let holePoints = projectRing(ring);
    if (THREE.ShapeUtils.isClockWise(holePoints.map((point) => new THREE.Vector2(point.x, point.y)))) {
      holePoints = holePoints.reverse();
    }
    const holeStart = holePoints[0];
    const hole = new THREE.Path();
    hole.moveTo(holeStart.x, holeStart.y);
    holePoints.slice(1).forEach((point) => {
      hole.lineTo(point.x, point.y);
    });
    hole.closePath();
    shape.holes.push(hole);
  });

  return shape;
}

function applyMapTerrainUv(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(position.count * 2);
  const geoUv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    uv[index * 2] = (x + mapWidth / 2) / mapWidth;
    uv[index * 2 + 1] = (y + mapHeight / 2) / mapHeight;
    const lon=lonMin+(x+mapWidth/2-projectedOffsetX)/mapScale;
    const lat=latMax-(mapHeight/2-y-projectedOffsetY)/mapScale;
    geoUv[index*2]=(lon+180)/360;
    geoUv[index*2+1]=(lat+90)/180;
  }

  geometry.setAttribute('geoUv',new THREE.BufferAttribute(geoUv,2));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function makeBoundary(ring: Position[], z: number, material: THREE.Material) {
  const points = ring.map((coord) => projectPoint(coord, z));
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && (first.x !== last.x || first.y !== last.y)) points.push(first.clone());
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.LineLoop(geometry, material);
  line.renderOrder = z > 40 ? 8 : 0;
  return line;
}

function makeBoundarySegments(rings: Position[][], z: number, material: THREE.Material) {
  const points: THREE.Vector3[] = [];
  rings.forEach((ring) => {
    for (let index = 0; index < ring.length; index += 1) {
      points.push(
        projectPoint(ring[index], z),
        projectPoint(ring[(index + 1) % ring.length], z),
      );
    }
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = z > 40 ? 8 : 0;
  return lines;
}

function createGlassRegionEdges(rings:Position[][],terrain:FuiTerrainState){
  const group=new THREE.Group();group.name='fui-glass-region-edges';
  // Geographic relief supplies internal depth; keep a single fine upper
  // administrative line, without a second displaced boundary network.
  const points:number[]=[];
  rings.forEach(ring=>ring.forEach((coord,index)=>{
    for(const p of [projectPoint(coord,44.65),projectPoint(ring[(index+1)%ring.length],44.65)])points.push(p.x,p.y,p.z);
  }));
  const geometry=new LineSegmentsGeometry();geometry.setPositions(points);
  const material=new LineMaterial({color:getFuiMapMaterialPalette(props.skin,mapPaletteFamily.value).inner,
    linewidth:1.25,worldUnits:false,transparent:true,opacity:.92,
    alphaToCoverage:true,depthTest:true,depthWrite:false});
  const size=getHostSize();material.resolution.set(size.width,size.height);
  const edge=new LineSegments2(geometry,material);edge.name='fui-glass-region-edge-core';edge.renderOrder=10;
  bindFuiTerrainLine(material,terrain);
  const glowMaterial=new LineMaterial({color:getFuiMapMaterialPalette(props.skin,mapPaletteFamily.value).inner,
    linewidth:3.4,worldUnits:false,transparent:true,opacity:0,blending:THREE.AdditiveBlending,
    alphaToCoverage:false,depthTest:true,depthWrite:false});
  glowMaterial.resolution.set(size.width,size.height);
  bindFuiTerrainLine(glowMaterial,terrain);
  const glow=new LineSegments2(geometry,glowMaterial);glow.name='fui-glass-region-edge-halo';glow.renderOrder=9;
  group.add(glow,edge);
  return group;
}

function coordKey(coord: Position) {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

function edgeKey(start: Position, end: Position) {
  const a = coordKey(start);
  const b = coordKey(end);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pointInProjectedRing(point: readonly [number, number], ring: Position[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = projectCoord(ring[index]);
    const previousPoint = projectCoord(ring[previous]);
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
      && (point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
        / (previousPoint[1] - currentPoint[1]) + currentPoint[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInProjectedPolygon(point: readonly [number, number], polygon: Position[][]) {
  if (!pointInProjectedRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((ring) => pointInProjectedRing(point, ring));
}

function pointInProjectedCoordinateRing(
  point: readonly [number, number],
  ring: Array<readonly [number, number]>,
) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
      && (point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
        / (previousPoint[1] - currentPoint[1]) + currentPoint[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function getProjectedMapPolygonLookup() {
  if (projectedMapPolygonsCache) return projectedMapPolygonsCache;
  projectedMapPolygonsCache = getRenderableFeatures().flatMap((feature) => (
    toRenderablePolygons(feature).map((polygon) => {
      const rings = polygon.map((ring) => ring.map((coord) => projectCoord(coord)));
      const outer = rings[0];
      return {
        rings,
        minX: Math.min(...outer.map((point) => point[0])),
        minY: Math.min(...outer.map((point) => point[1])),
        maxX: Math.max(...outer.map((point) => point[0])),
        maxY: Math.max(...outer.map((point) => point[1])),
      };
    })
  ));
  return projectedMapPolygonsCache;
}

function pointInCurrentMap(point: readonly [number, number]) {
  return getProjectedMapPolygonLookup().some((polygon) => {
    if (
      point[0] < polygon.minX
      || point[0] > polygon.maxX
      || point[1] < polygon.minY
      || point[1] > polygon.maxY
    ) return false;
    if (!pointInProjectedCoordinateRing(point, polygon.rings[0])) return false;
    return !polygon.rings.slice(1).some((ring) => pointInProjectedCoordinateRing(point, ring));
  });
}

function isProvinceExteriorEdge(start: Position, end: Position) {
  const projectedStart = projectCoord(start);
  const projectedEnd = projectCoord(end);
  const dx = projectedEnd[0] - projectedStart[0];
  const dy = projectedEnd[1] - projectedStart[1];
  const length = Math.hypot(dx, dy);
  if (length < 0.01) return false;

  const midX = (projectedStart[0] + projectedEnd[0]) / 2;
  const midY = (projectedStart[1] + projectedEnd[1]) / 2;
  const normalX = -dy / length;
  const normalY = dx / length;
  const offset = 1.8;
  const sideA = pointInCurrentMap([midX + normalX * offset, midY + normalY * offset]);
  const sideB = pointInCurrentMap([midX - normalX * offset, midY - normalY * offset]);

  return sideA !== sideB;
}

function getProvinceOuterEdges() {
  if (provinceOuterEdgesCache) return provinceOuterEdgesCache;
  const edges = new Map<string, ProvinceOuterEdge>();

  getRenderableFeatures().forEach((feature) => {
    toRenderablePolygons(feature).forEach((polygon) => {
      const ring = polygon[0];
      for (let index = 0; index < ring.length; index += 1) {
        const start = ring[index];
        const end = ring[(index + 1) % ring.length];
        const key = edgeKey(start, end);
        const edge = edges.get(key);
        if (edge) {
          edge.count += 1;
        } else {
          edges.set(key, { count: 1, start, end });
        }
      }
    });
  });

  provinceOuterEdgesCache = [...edges.values()]
    .filter((edge) => edge.count === 1 && isProvinceExteriorEdge(edge.start, edge.end));
  return provinceOuterEdgesCache;
}

function getProvinceOuterLoops() {
  const edges = getProvinceOuterEdges().map((edge) => ({ ...edge, used: false }));
  const adjacency = new Map<string, number[]>();
  const addAdjacency = (key: string, index: number) => {
    const list = adjacency.get(key) ?? [];
    list.push(index);
    adjacency.set(key, list);
  };

  edges.forEach((edge, index) => {
    addAdjacency(coordKey(edge.start), index);
    addAdjacency(coordKey(edge.end), index);
  });

  const loops: Position[][] = [];
  edges.forEach((edge, edgeIndex) => {
    if (edge.used) return;

    edge.used = true;
    const startKey = coordKey(edge.start);
    let previousKey = startKey;
    let currentKey = coordKey(edge.end);
    const loop: Position[] = [edge.start, edge.end];

    while (currentKey !== startKey) {
      const candidates = adjacency.get(currentKey) ?? [];
      const nextIndex = candidates.find((candidateIndex) => {
        if (edges[candidateIndex].used) return false;
        const candidate = edges[candidateIndex];
        const candidateStart = coordKey(candidate.start);
        const candidateEnd = coordKey(candidate.end);
        return candidateStart !== previousKey || candidateEnd !== previousKey;
      });
      if (nextIndex === undefined) break;

      const nextEdge = edges[nextIndex];
      nextEdge.used = true;
      const nextPoint = coordKey(nextEdge.start) === currentKey ? nextEdge.end : nextEdge.start;
      loop.push(nextPoint);
      previousKey = currentKey;
      currentKey = coordKey(nextPoint);
    }

    const last = loop[loop.length - 1];
    if (coordKey(last) === startKey) loop.pop();
    if (loop.length > 2) loops.push(loop);

    if (!edges[edgeIndex].used) edges[edgeIndex].used = true;
  });

  return loops;
}

function createProvinceSilhouetteLoop() {
  type GridPoint = { x: number; y: number };
  type GridEdge = { start: GridPoint; end: GridPoint; used: boolean };

  const cellSize = currentState.scope === 'world' ? 6 : currentState.scope === 'country' ? 4 : provinceSilhouetteCellSize;
  const cols = Math.ceil(mapWidth / cellSize);
  const rows = Math.ceil(mapHeight / cellSize);
  const filled = new Uint8Array(cols * rows);
  const isFilled = (x: number, y: number) => x >= 0 && x < cols && y >= 0 && y < rows
    && filled[y * cols + x] === 1;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const pointX = Math.min(mapWidth, (x + 0.5) * cellSize);
      const pointY = Math.min(mapHeight, (y + 0.5) * cellSize);
      if (pointInCurrentMap([pointX, pointY])) {
        filled[y * cols + x] = 1;
      }
    }
  }

  const edges: GridEdge[] = [];
  const pushEdge = (start: GridPoint, end: GridPoint) => {
    edges.push({ start, end, used: false });
  };

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!isFilled(x, y)) continue;
      if (!isFilled(x, y - 1)) pushEdge({ x, y }, { x: x + 1, y });
      if (!isFilled(x + 1, y)) pushEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!isFilled(x, y + 1)) pushEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!isFilled(x - 1, y)) pushEdge({ x, y: y + 1 }, { x, y });
    }
  }

  const pointKey = (point: GridPoint) => `${point.x},${point.y}`;
  const adjacency = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    [edge.start, edge.end].forEach((point) => {
      const key = pointKey(point);
      const list = adjacency.get(key) ?? [];
      list.push(index);
      adjacency.set(key, list);
    });
  });

  const loops: GridPoint[][] = [];
  edges.forEach((edge) => {
    if (edge.used) return;
    edge.used = true;
    const startKey = pointKey(edge.start);
    let previousKey = startKey;
    let currentKey = pointKey(edge.end);
    const loop: GridPoint[] = [edge.start, edge.end];
    let guard = 0;

    while (currentKey !== startKey && guard < edges.length) {
      guard += 1;
      const candidates = (adjacency.get(currentKey) ?? []).filter((candidateIndex) => !edges[candidateIndex].used);
      const nextIndex = candidates.find((candidateIndex) => {
        const candidate = edges[candidateIndex];
        const otherPoint = pointKey(candidate.start) === currentKey ? candidate.end : candidate.start;
        return pointKey(otherPoint) !== previousKey;
      }) ?? candidates[0];
      if (nextIndex === undefined) break;

      const nextEdge = edges[nextIndex];
      nextEdge.used = true;
      const nextPoint = pointKey(nextEdge.start) === currentKey ? nextEdge.end : nextEdge.start;
      loop.push(nextPoint);
      previousKey = currentKey;
      currentKey = pointKey(nextPoint);
    }

    if (loop.length > 4) loops.push(loop);
  });

  const gridLoopArea = (loop: GridPoint[]) => {
    let area = 0;
    for (let index = 0; index < loop.length; index += 1) {
      const current = loop[index];
      const next = loop[(index + 1) % loop.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area / 2);
  };

  const largestLoop = loops.sort((a, b) => gridLoopArea(b) - gridLoopArea(a))[0];
  if (!largestLoop) return [];

  return largestLoop.map((point) => {
    const x = Math.min(mapWidth, point.x * cellSize);
    const y = Math.min(mapHeight, point.y * cellSize);
    return new THREE.Vector3(x - mapWidth / 2, -(y - mapHeight / 2), provinceChaseZ);
  });
}

function smoothClosedPath(points: THREE.Vector3[], iterations = 2) {
  let smoothed = points;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextPoints: THREE.Vector3[] = [];
    smoothed.forEach((point, index) => {
      const nextPoint = smoothed[(index + 1) % smoothed.length];
      nextPoints.push(point.clone().lerp(nextPoint, 0.25));
      nextPoints.push(point.clone().lerp(nextPoint, 0.75));
    });
    smoothed = nextPoints;
  }
  return smoothed;
}

function createProvinceChaseLight() {
  const group = new THREE.Group();
  const positions: number[] = [];
  const vertexDistances: number[] = [];
  const indices: number[] = [];
  let totalDistance = 0;

  const appendSegment = (
    start: THREE.Vector3,
    end: THREE.Vector3,
  ) => {
    const length = start.distanceTo(end);
    if (length < 0.01) return;

    const normal = new THREE.Vector3(-(end.y - start.y), end.x - start.x, 0)
      .normalize()
      .multiplyScalar(provinceChaseRibbonWidth / 2);
    const divisions = Math.max(1, Math.ceil(length / provinceChaseSegmentLength));
    for (let step = 0; step < divisions; step += 1) {
      const fromRatio = step / divisions;
      const toRatio = (step + 1) / divisions;
      const from = start.clone().lerp(end, fromRatio);
      const to = start.clone().lerp(end, toRatio);
      const fromDistance = totalDistance + length * fromRatio;
      const toDistance = totalDistance + length * toRatio;
      const offset = positions.length / 3;

      [
        from.clone().add(normal),
        from.clone().sub(normal),
        to.clone().add(normal),
        to.clone().sub(normal),
      ].forEach((point) => positions.push(point.x, point.y, point.z));

      vertexDistances.push(fromDistance, fromDistance, toDistance, toDistance);
      indices.push(offset, offset + 1, offset + 2, offset + 2, offset + 1, offset + 3);
    }
    totalDistance += length;
  };

  const provinceSilhouetteLoop = smoothClosedPath(createProvinceSilhouetteLoop(), 4);
  if (provinceSilhouetteLoop.length > 4) {
    provinceSilhouetteLoop.forEach((point, index) => {
      const nextPoint = provinceSilhouetteLoop[(index + 1) % provinceSilhouetteLoop.length];
      appendSegment(point, nextPoint);
    });
  } else {
    const fallbackLoop = getProvinceOuterLoops()
      .sort((a, b) => ringProjectedArea(b) - ringProjectedArea(a))[0];
    fallbackLoop?.forEach((coord, index) => {
      const nextCoord = fallbackLoop[(index + 1) % fallbackLoop.length];
      appendSegment(projectPoint(coord, provinceChaseZ), projectPoint(nextCoord, provinceChaseZ));
    });
  }

  if (!positions.length || totalDistance <= 0) return group;

  provinceChasePath = {
    distances: new Float32Array(vertexDistances),
    total: totalDistance,
    tailLength: Math.max(100, totalDistance * 0.07),
  };

  const alphas = new Float32Array(vertexDistances.length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      color: { value: new THREE.Color(mapTheme.chaseLight) },
    },
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(color, vAlpha);
      }
    `,
  });
  provinceChaseLine = new THREE.Mesh(geometry, material);
  provinceChaseLine.renderOrder = 20;
  group.add(provinceChaseLine);

  return group;
}

function updateProvinceChaseLight(time: number) {
  if (!provinceChasePath || !provinceChaseLine) return;

  const alphaAttribute = provinceChaseLine.geometry.getAttribute('alpha') as THREE.BufferAttribute;
  const chaseSpeed = 230;
  const headDistance = (time * chaseSpeed) % provinceChasePath.total;

  for (let index = 0; index < provinceChasePath.distances.length; index += 1) {
    const vertexDistance = provinceChasePath.distances[index];
    const distanceBehindHead = (headDistance - vertexDistance + provinceChasePath.total) % provinceChasePath.total;
    if (distanceBehindHead > provinceChasePath.tailLength) {
      alphaAttribute.setX(index, 0);
    } else {
      const headRatio = 1 - distanceBehindHead / provinceChasePath.tailLength;
      alphaAttribute.setX(index, Math.pow(headRatio, 1.65));
    }
  }
  alphaAttribute.needsUpdate = true;
}

function createProvinceOutlineSegments(z: number, material: THREE.Material, renderOrder: number) {
  const points: THREE.Vector3[] = [];
  getProvinceOuterEdges().forEach((edge) => {
    points.push(projectPoint(edge.start, z), projectPoint(edge.end, z));
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.LineSegments(geometry, material);
  line.renderOrder = renderOrder;
  return line;
}

function createGlassOuterRims(shapes:THREE.Shape[],ownerAt:(x:number,y:number)=>string){
  const byOwner=new Map<string,number[]>();
  for(const shape of shapes){
    if(Math.abs(THREE.ShapeUtils.area(shape.getPoints()))<120)continue;
    const ring=shape.getPoints();
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      const name=ownerAt((a.x+b.x)/2,(a.y+b.y)/2);
      const points=byOwner.get(name)??[];
      points.push(a.x,a.y,44.18,b.x,b.y,44.18);byOwner.set(name,points);
    }
  }
  const size=getHostSize(),rims=new Map<string,THREE.Group>();
  for(const [name,points] of byOwner){
    const geometry=new LineSegmentsGeometry();geometry.setPositions(points);
    const material=new LineMaterial({color:0xffffff,linewidth:1.65,worldUnits:false,transparent:true,opacity:.98,depthTest:true,depthWrite:false});
    material.resolution.set(size.width,size.height);
    const rim=new LineSegments2(geometry,material);rim.name='fui-glass-outer-rim';rim.renderOrder=10;
    const haloMaterial=new LineMaterial({color:0xffffff,linewidth:3.4,worldUnits:false,transparent:true,opacity:.18,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending});
    haloMaterial.resolution.set(size.width,size.height);
    const halo=new LineSegments2(geometry,haloMaterial);halo.name='fui-glass-outer-halo';halo.renderOrder=9;
    const edge=new THREE.Group();edge.name='fui-glass-outer-edge';edge.add(halo,rim);rims.set(name,edge);
  }
  return rims;
}

function createGlassBottomRim(shapes:THREE.Shape[]){
  const points:number[]=[];
  for(const shape of shapes){
    if(Math.abs(THREE.ShapeUtils.area(shape.getPoints()))<120)continue;
    for(const ring of [shape.getPoints(),...shape.holes.map(hole=>hole.getPoints())]){
      ring.forEach((a,index)=>{
        const b=ring[(index+1)%ring.length];points.push(a.x,a.y,12.08,b.x,b.y,12.08);
      });
    }
  }
  const geometry=new LineSegmentsGeometry();geometry.setPositions(points);
  const material=new LineMaterial({linewidth:.9,worldUnits:false,transparent:true,opacity:.78,depthTest:true,depthWrite:false});
  const size=getHostSize();material.resolution.set(size.width,size.height);
  const rim=new LineSegments2(geometry,material);rim.name='fui-glass-bottom-rim';rim.renderOrder=7;
  rim.layers.enable(FUI_MAP_REFLECTION_LAYER);return rim;
}

function prepareLiftFollowingChase(group:THREE.Group,ownerAt:(x:number,y:number)=>string){
  if(!provinceChaseLine)return;
  const position=provinceChaseLine.geometry.getAttribute('position');
  const owners:string[]=[],restZ:number[]=[];
  const cache=new Map<string,string>();
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),key=`${x.toFixed(4)}:${y.toFixed(4)}`;
    let owner=cache.get(key);if(owner===undefined){owner=ownerAt(x,y);cache.set(key,owner);}
    owners.push(owner);restZ.push(position.getZ(i));
  }
  group.userData.fuiChaseFollowing={mesh:provinceChaseLine,owners,restZ,lastLifts:new Map<string,number>()};
}

function updateLiftFollowingChase(group:THREE.Group,textured:boolean){
  const follow=group.userData.fuiChaseFollowing as {mesh:THREE.Mesh<THREE.BufferGeometry>;owners:string[];restZ:number[];lastLifts:Map<string,number>}|undefined;
  if(!follow)return;
  const lifts=new Map<string,number>();let changed=false;
  for(const owner of new Set(follow.owners)){
    const lift=textured?(featureLiftGroups.get(owner)?.[0]?.position.z??0):0;
    lifts.set(owner,lift);if(Math.abs((follow.lastLifts.get(owner)??-1)-lift)>.0001)changed=true;
  }
  if(!changed)return;
  const position=follow.mesh.geometry.getAttribute('position');
  for(let i=0;i<position.count;i++)position.setZ(i,follow.restZ[i]+(lifts.get(follow.owners[i])??0));
  position.needsUpdate=true;follow.mesh.geometry.computeBoundingSphere();follow.lastLifts=lifts;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getEffectSourceLabelName(labels = currentLabels) {
  if (currentState.scope === 'country') {
    return labels.find((label) => label.name === '北京市')?.name
      ?? labels[0]?.name;
  }
  if (currentState.scope === 'province') {
    const capitalName = provinceCapitalByName[currentState.regionName];
    return labels.find((label) => label.name === capitalName)?.name
      ?? labels.find((label) => /市$/.test(label.name))?.name;
  }
  if (currentState.scope === 'city') {
    if (!labels.length) return undefined;
    return labels[hashString(currentState.code || currentState.regionName) % labels.length]?.name;
  }
  return undefined;
}

function getFlyLineSourceLabel() {
  if (currentState.scope === 'district') return undefined;
  if (currentState.scope === 'country') {
    const sourceName = getEffectSourceLabelName();
    return currentLabels.find((label) => label.name === sourceName) ?? currentLabels[0];
  }
  if (currentState.scope === 'province') {
    const sourceName = getEffectSourceLabelName();
    return currentLabels.find((label) => label.name === sourceName)
      ?? currentLabels.find((label) => /市$/.test(label.name))
      ?? currentLabels[0];
  }
  if (currentState.scope === 'city') {
    const sourceName = getEffectSourceLabelName();
    return currentLabels.find((label) => label.name === sourceName);
  }
  return undefined;
}

function getFlyLineTargets(source: MapLabel) {
  return currentLabels.filter((label) => label.name !== source.name);
}

function createFlyLines() {
  const group = new THREE.Group();
  const sourceLabel = getFlyLineSourceLabel();
  if (!sourceLabel) return group;

  const flyLineTargets = getFlyLineTargets(sourceLabel);
  if (!flyLineTargets.length) return group;

  const lineZ = currentState.scope === 'country' ? 72 : currentState.scope === 'province' ? 74 : 70;
  const sourcePoint = projectPoint(sourceLabel.coord, lineZ);
  const baseMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: currentState.scope === 'country' ? 0.14 : 0.2,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  flyLineTargets.forEach((targetLabel, index) => {
    const targetPoint = projectPoint(targetLabel.coord, lineZ);
    const distance = sourcePoint.distanceTo(targetPoint);
    const midPoint = sourcePoint.clone().lerp(targetPoint, 0.5);
    midPoint.z += Math.max(28, distance * (currentState.scope === 'country' ? 0.11 : 0.15));
    const curve = new THREE.QuadraticBezierCurve3(sourcePoint, midPoint, targetPoint);
    const points = curve.getPoints(currentState.scope === 'country' ? 72 : 88);

    const baseLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      baseMaterial,
    );
    baseLine.renderOrder = 15;
    group.add(baseLine);

    const flowGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const progress = new Float32Array(points.length);
    points.forEach((_, pointIndex) => {
      progress[pointIndex] = pointIndex / (points.length - 1);
    });
    flowGeometry.setAttribute('progress', new THREE.BufferAttribute(progress, 1));

    const flowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDelay: { value: index * 0.047 },
        uSpeed: { value: currentState.scope === 'country' ? 0.22 : 0.3 },
        uColor: { value: new THREE.Color(mapTheme.flyHead) },
      },
      vertexShader: `
        attribute float progress;
        varying float vProgress;
        void main() {
          vProgress = progress;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDelay;
        uniform float uSpeed;
        uniform vec3 uColor;
        varying float vProgress;
        void main() {
          float head = fract(uTime * uSpeed + uDelay);
          float d = head - vProgress;
          if (d < 0.0) d += 1.0;
          float body = smoothstep(0.24, 0.0, d);
          float core = smoothstep(0.035, 0.0, d);
          float alpha = body * 0.72 + core * 0.5;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
    flyLineMaterials.push(flowMaterial);

    const flowLine = new THREE.Line(flowGeometry, flowMaterial);
    flowLine.renderOrder = 16;
    group.add(flowLine);
  });

  return group;
}

function createProvinceSideWalls(material: THREE.Material) {
  const topZ = 44;
  const bottomZ = 24;
  const positions: number[] = [];
  const indices: number[] = [];

  getProvinceOuterEdges().forEach((edge) => {
    const topStart = projectPoint(edge.start, topZ);
    const topEnd = projectPoint(edge.end, topZ);
    const bottomEnd = projectPoint(edge.end, bottomZ);
    const bottomStart = projectPoint(edge.start, bottomZ);
    const offset = positions.length / 3;
    [topStart, topEnd, bottomEnd, bottomStart].forEach((point) => {
      positions.push(point.x, point.y, point.z);
    });
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

function createPolygonSideWalls(polygon: Position[][], material: THREE.Material, keepEdge?: (a:Position,b:Position)=>boolean) {
  const topZ = 44;
  const bottomZ = 24;
  const positions: number[] = [];
  const indices: number[] = [];

  polygon.forEach((ring) => {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      if(keepEdge&&!keepEdge(start,end))continue;
      const topStart = projectPoint(start, topZ);
      const topEnd = projectPoint(end, topZ);
      const bottomEnd = projectPoint(end, bottomZ);
      const bottomStart = projectPoint(start, bottomZ);
      const offset = positions.length / 3;
      [topStart, topEnd, bottomEnd, bottomStart].forEach((point) => {
        positions.push(point.x, point.y, point.z);
      });
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  return mesh;
}

function createWorldSideWalls(material: THREE.Material) {
  const topZ = 46;
  const bottomZ = 30;
  const positions: number[] = [];
  const indices: number[] = [];

  geoData.features.filter(isWorldDisplayFeature).forEach((feature) => {
    toRenderablePolygons(feature).forEach((polygon) => {
      polygon.slice(0, 1).forEach((ring) => {
        for (let index = 0; index < ring.length; index += 1) {
          const start = ring[index];
          const end = ring[(index + 1) % ring.length];
          const topStart = projectPoint(start, topZ);
          const topEnd = projectPoint(end, topZ);
          const bottomEnd = projectPoint(end, bottomZ);
          const bottomStart = projectPoint(start, bottomZ);
          const offset = positions.length / 3;
          [topStart, topEnd, bottomEnd, bottomStart].forEach((point) => {
            positions.push(point.x, point.y, point.z);
          });
          indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
        }
      });
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  return mesh;
}

function createSideGradientMaterial(alpha = 0.86, topZ = 44, bottomZ = 24) {
  return createFuiMapSideGradientMaterial(mapTheme,alpha,topZ,bottomZ);
}

function createWorldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 760;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  const scaleX = canvas.width / mapWidth;
  const scaleY = canvas.height / mapHeight;
  const drawRing = (ring: Position[]) => {
    ring.forEach((coord, index) => {
      const point = projectCoord(coord);
      const x = point[0] * scaleX;
      const y = point[1] * scaleY;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = mapTheme.worldShadow;
  ctx.shadowBlur = 18;
  geoData.features.filter(isWorldDisplayFeature).forEach((feature) => {
    toRenderablePolygons(feature).forEach((polygon) => {
      ctx.beginPath();
      polygon.forEach(drawRing);
      ctx.fillStyle = isChinaFeature(feature) ? mapTheme.worldChinaFill : mapTheme.worldLandFill;
      ctx.fill('evenodd');
      ctx.lineWidth = isChinaFeature(feature) ? 3.2 : 1.05;
      ctx.strokeStyle = isChinaFeature(feature) ? mapTheme.worldChinaStroke : mapTheme.worldLandStroke;
      ctx.stroke();
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWorldMap() {
  const group = new THREE.Group();
  projectedMapPolygonsCache = undefined;
  provinceOuterEdgesCache = undefined;
  interactiveMeshes.length = 0;
  featureMeshes.clear();
  featureLiftGroups.clear();
  featureSideMaterials.clear();
  featureHighlightMaterials.clear();
  featureByName.clear();
  cityLabelElements.clear();
  flyLineMaterials.length = 0;
  ringDecorGroup = undefined;
  provinceChaseLine = undefined;
  provinceChasePath = undefined;

  group.rotation.z = -0.02;
  const transform = getScopeTransform();
  group.position.copy(transform.position);
  group.scale.set(transform.scale, transform.scale, transform.scale);
  group.userData.basePosition = transform.position.clone();
  group.userData.baseScale = transform.scale;

  geoData.features.filter(isWorldDisplayFeature).forEach((feature) => {
    const featureName = getFeatureName(feature);
    if (featureName) featureByName.set(featureName, feature);
  });

  const texture = createWorldTexture();
  if (texture) {
    [0, 1, 2, 3].forEach((layer) => {
      const depthMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(mapWidth, mapHeight),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0.11 - layer * 0.018,
          color: mapTheme.accent,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
        }),
      );
      depthMesh.position.set(0, -8 - layer * 5, 35 - layer * 4);
      depthMesh.scale.set(1 + layer * 0.012, 1 + layer * 0.012, 1);
      depthMesh.renderOrder = 7 - layer;
      group.add(depthMesh);
    });

    const worldMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mapWidth, mapHeight),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    worldMesh.position.z = 48;
    worldMesh.renderOrder = 12;
    group.add(worldMesh);

    const glowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mapWidth, mapHeight),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    glowMesh.position.z = 49;
    glowMesh.scale.set(1.015, 1.015, 1);
    glowMesh.renderOrder = 11;
    group.add(glowMesh);
  }

  worldHitMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(mapWidth, mapHeight),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  worldHitMesh.position.z = 58;
  worldHitMesh.userData.featureName = 'China';
  group.add(worldHitMesh);
  interactiveMeshes.push(worldHitMesh);

  if (props.useInternalHudRing) group.add(createRotatingRingDecor());
  group.add(createFuiMapBase());
  updateMapAppearance(group,0);
  primeGroupOpacity(group);
  return group;
}

function createArc(radius: number, start: number, end: number, z: number, material: THREE.Material) {
  const points: THREE.Vector3[] = [];
  const steps = 72;
  for (let i = 0; i <= steps; i += 1) {
    const angle = start + ((end - start) * i) / steps;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  line.renderOrder = -3;
  return line;
}

function createRotatingRingDecor() {
  const plate = new THREE.Group();
  plate.name='legacy-ground-ring';
  plate.position.set(0, 0, 14);
  plate.scale.set(0.9, 0.9, 0.9);
  plate.renderOrder = -3;

  const rotor = new THREE.Group();
  plate.add(rotor);
  ringDecorGroup = rotor;

  const softRing = new THREE.Mesh(
    new THREE.RingGeometry(356, 362, 192),
    new THREE.MeshBasicMaterial({
      color: mapTheme.accent,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    }),
  );
  softRing.renderOrder = -3;
  rotor.add(softRing);

  const innerSoftRing = new THREE.Mesh(
    new THREE.RingGeometry(244, 248, 160),
    new THREE.MeshBasicMaterial({
      color: mapTheme.ringDim,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    }),
  );
  innerSoftRing.renderOrder = -3;
  rotor.add(innerSoftRing);

  const arcMaterial = new THREE.LineBasicMaterial({
      color: mapTheme.accent,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const dimArcMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.arcDim,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });

  const arcSpecs: Array<[number, number, number, THREE.Material]> = [
    [0.1, 0.92, 390, arcMaterial],
    [1.42, 2.04, 390, dimArcMaterial],
    [2.56, 3.3, 390, arcMaterial],
    [4.1, 4.82, 390, dimArcMaterial],
    [5.22, 5.9, 390, arcMaterial],
    [0.72, 1.34, 316, dimArcMaterial],
    [2.12, 2.78, 316, arcMaterial],
    [3.56, 4.2, 316, dimArcMaterial],
    [5.02, 5.58, 316, arcMaterial],
    [0.18, 0.62, 252, dimArcMaterial],
    [3.18, 3.76, 252, arcMaterial],
  ];
  arcSpecs.forEach(([start, end, radius, material]) => {
    rotor.add(createArc(radius, start, end, 2, material));
  });

  const tickMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  for (let i = 0; i < 48; i += 1) {
    if (i % 4 === 0) continue;
    const angle = (Math.PI * 2 * i) / 48;
    const inner = 344;
    const outer = i % 2 === 0 ? 370 : 362;
    const points = [
      new THREE.Vector3(Math.cos(angle) * inner, Math.sin(angle) * inner, 3),
      new THREE.Vector3(Math.cos(angle) * outer, Math.sin(angle) * outer, 3),
    ];
    const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), tickMaterial);
    tick.renderOrder = -3;
    rotor.add(tick);
  }

  return plate;
}

function createRegionalFuiBase() {
  const frame=getFuiInstrumentFrame(),base=createFuiMapBase();
  base.position.x=frame.center.x;base.position.y=frame.center.y;
  base.scale.set(frame.radii.x/492,frame.radii.y/492,1);
  return base;
}

function useGlassSourceLayer(object:THREE.Object3D){
  object.traverse(child=>{
    child.layers.enable(FUI_GLASS_SOURCE_LAYER);
    child.layers.disable(0);
  });
  return object;
}

function releaseGlassHdrPass(){
  const retired=glassHdrPass;glassHdrPass=undefined;
  if(!retired)return;
  if(rendererJobs.busy)void rendererJobs.afterPending(()=>retired.dispose());
  else retired.dispose();
}

function getGlassHdrPass(targetRenderer:THREE.WebGLRenderer){
  glassHdrPass??=new FuiGlassHdrPass(targetRenderer,props.skin,props.quality);
  glassHdrPass.setSkin(props.skin);glassHdrPass.setQuality(props.quality);
  return glassHdrPass;
}

// All complete destination frames use this entry. PMREM and Reflector keep
// their native offscreen renderer calls, without re-entering the HDR pass.
function renderMapFrame(targetRenderer:THREE.WebGLRenderer,targetScene:THREE.Scene,targetCamera:THREE.Camera){
  submittedMapFrames+=1;
  if(mapGroup?.userData.fuiSurfaceFamily!=='hologram'){
    releaseGlassHdrPass();
    targetRenderer.render(targetScene,targetCamera);
    return;
  }
  const cameraMask=targetCamera.layers.mask;
  const size=getHostSize(),pass=getGlassHdrPass(targetRenderer);
  pass.setSize(size.width,size.height,targetRenderer.getPixelRatio());
  glassFloatTargetsEnabled=glassFloatTargetsSupported&&pass.diagnostics.mode==='hdr';
  if(mapGroup)syncMapReflectionBudget(mapGroup);
  if(host.value){host.value.dataset.glassOutput=pass.diagnostics.mode;host.value.dataset.floatReflectionEnabled=String(glassFloatTargetsEnabled&&browserMapQualityBudget(props.quality).reflection);}
  try{
    targetCamera.layers.set(0);
    targetRenderer.render(targetScene,targetCamera);
    pass.render(targetScene,targetCamera,size.width,size.height,targetRenderer.getPixelRatio(),FUI_GLASS_SOURCE_LAYER);
    if(host.value){const d=pass.diagnostics;host.value.dataset.glassMode=d.mode;host.value.dataset.glassBloom=String(d.bloomEnabled);host.value.dataset.glassSamples=String(d.samples);host.value.dataset.glassPmrem=String(Boolean(glassEnvironment));}
  }finally{targetCamera.layers.mask=cameraMask;}
}

function syncMapReflectionBudget(group:THREE.Group){
  const current=group.getObjectByName('fui-map-live-reflection');
  const field=group.userData.fuiEdgeField as FuiMapEdgeField|undefined;
  const wanted=Boolean(field&&props.mapPresentation!=='standard'&&glassFloatTargetsEnabled&&browserMapQualityBudget(props.quality).reflection);
  if(!wanted){if(current){current.removeFromParent();disposeObject3D(current);}return;}
  if(!current&&field){
    const size=getHostSize(),reflection=createFuiMapReflection(field,size.width,size.height,getMapPixelRatio(),props.quality,glassFloatTargetsEnabled,renderer?supportedFuiGlassSamples(renderer,2):0);
    if(reflection)group.add(group.userData.fuiSurfaceFamily==='hologram'?useGlassSourceLayer(reflection):reflection);
  }
}

function createMapRoot() {
  const group = new THREE.Group();
  group.userData.fuiMapCode=currentState.code;
  projectedMapPolygonsCache = undefined;
  provinceOuterEdgesCache = undefined;
  interactiveMeshes.length = 0;
  featureMeshes.clear();
  featureLiftGroups.clear();
  featureSideMaterials.clear();
  featureHighlightMaterials.clear();
  featureByName.clear();
  cityLabelElements.clear();
  flyLineMaterials.length = 0;
  ringDecorGroup = undefined;
  provinceChaseLine = undefined;
  provinceChasePath = undefined;
  group.rotation.x = 0;
  group.rotation.z = currentState.scope === 'world' ? -0.02 : -0.09;
  group.userData.baseRotation=group.rotation.z;
  const transform = getScopeTransform();
  group.position.copy(transform.position);
  const scopeScale = transform.scale;
  group.scale.set(scopeScale, scopeScale, scopeScale);
  group.userData.basePosition = transform.position.clone();
  group.userData.baseScale = scopeScale;
  group.userData.fuiNorthScale=getFuiNorthScale();
  return group;
}

async function prepareNativeGlassGeometry(features:MapFeature[],group:THREE.Group){
  const controller=new AbortController();nativeGeometryController=controller;
  const regions=features.map(feature=>({key:getFeatureName(feature),polygons:toTexturedPolygons(feature).map(polygon=>polygon.map(ring=>ring.map(coord=>{
    const point=projectPoint(coord);return new THREE.Vector2(point.x,point.y);
  })))}));
  const owners=regions.map(region=>({name:region.key,rings:region.polygons.flat()}));
  const packed=typeof Worker==='undefined'?undefined:await runFuiMapGeometryWorker(packFuiMapGeometryInput(regions),controller.signal,
    ()=>new Worker(new URL('./fuiMapGeometry.worker.ts',import.meta.url),{type:'module'}));
  let prepared;
  if(packed)prepared=unpackFuiMapGeometry(packed);
  else{
    const polygons=regions.flatMap(region=>region.polygons.map(polygon=>polygon.map(ring=>ring.map(point=>[point.x,point.y] as [number,number]))));
    const footprint=await runFuiMapBuild(createFuiMapGlassFootprintStages(polygons),{signal:controller.signal});
    const body=await runFuiMapBuild(createFuiMapGlassBodyGeometryStages(footprint,owners),{signal:controller.signal});
    prepared={footprint,body};
  }
  if(controller.signal.aborted||componentDisposed){disposeFuiMapGeometry(prepared);throw new DOMException('Map preparation aborted','AbortError');}
  if(nativeGeometryController===controller)nativeGeometryController=undefined;
  group.userData.fuiPreparedGlass=prepared;
  group.userData.fuiGeometryPreparation=packed?'worker':'cooperative';
  return{...prepared,regions:owners};
}

// Only the requested optical family is prepared. In particular, this path
// never instantiates the legacy terrain material, photographic surface or DEM.
async function createSmoothGlassMap(group:THREE.Group){
  group.userData.fuiSurfaceFamily='hologram';
  const features=getRenderableFeatures();
  await waitForBuildSlice();
  const prepared=await prepareNativeGlassGeometry(features,group),{footprint,regions}=prepared;
  const field=createFuiMapEdgeField(footprint,regions);group.userData.fuiEdgeField=field;
  const projection=new THREE.Vector4(1/mapScale/360,1/mapScale/180,
    (lonMin+(mapWidth/2-projectedOffsetX)/mapScale+180)/360,
    (latMax-(mapHeight/2-projectedOffsetY)/mapScale+90)/180);
  const terrain=createFuiFlatTerrainState(field,projection);group.userData.fuiTerrain=terrain;
  // Keep legacy light inputs available to the adapter. The smooth optical
  // response below uses the shared cap frame, fixed for this actual region.
  const lightFrame=new THREE.Matrix4().compose(group.position,group.quaternion,
    new THREE.Vector3(group.scale.x,group.scale.y*(group.userData.fuiNorthScale??1),group.scale.z));
  const lightCenter=new THREE.Vector3(field.bounds.x+field.bounds.z*.5,field.bounds.y+field.bounds.w*.5,44);
  const lightPosition=lightCenter.clone().add(new THREE.Vector3(-field.bounds.z*.65,field.bounds.w*.45,field.bounds.z*.70)).applyMatrix4(lightFrame);
  const lightReferenceDistance=lightCenter.clone().applyMatrix4(lightFrame).distanceTo(lightPosition);
  // Prepare the virtual cap in this map's resting view once. The reference
  // frame stays fixed while the user orbits and while the entrance moves.
  const opticalRegion=resolveFuiMapOpticalRegion(currentState.geoData,currentState);
  const opticalCenter=projectPoint([wrapFuiOpticalLongitude(opticalRegion.center.longitude,(lonMin+lonMax)/2),opticalRegion.center.latitude],44).applyMatrix4(lightFrame);
  const restEye=camera?.position.clone()??new THREE.Vector3(...resolveInitialCameraView(currentState.scope).position);
  const restView=restEye.sub(opticalCenter).normalize();
  const restEast=new THREE.Vector3(1,0,0).transformDirection(lightFrame);
  const restNorth=new THREE.Vector3(0,1,0).transformDirection(lightFrame);
  const restNormal=new THREE.Vector3(0,0,1).transformDirection(lightFrame);
  const restViewENU=new THREE.Vector3(restView.dot(restEast),restView.dot(restNorth),restView.dot(restNormal)).normalize();
  const sideMaterial=createSideGradientMaterial();
  const ownerAt=createFuiGlassWallOwnerLookup(regions);
  const bodyMaterial=sideMaterial.clone();
  const body=createFuiMapGlassBodyFromGeometry(prepared.body,bodyMaterial,glassEnvironment?.texture,{batchAdditiveCoats:props.mapPresentation!=='standard',batchSortedCores:props.mapPresentation!=='standard'});bodyMaterial.dispose();delete group.userData.fuiPreparedGlass;group.add(body);
  body.traverse(object=>object.layers.enable(FUI_MAP_REFLECTION_LAYER));useGlassSourceLayer(body);
  const wallFootprint=body.userData.fuiWallFootprint??footprint;
  const rims=createGlassOuterRims(wallFootprint,ownerAt);group.add(useGlassSourceLayer(createGlassBottomRim(wallFootprint)));
  const internalEdges=new Map<string,boolean>();
  const isInternal=(a:Position,b:Position)=>{
    const key=edgeKey(a,b),cached=internalEdges.get(key);if(cached!==undefined)return cached;
    const start=projectCoord(a),end=projectCoord(b),dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
    if(length<.001){internalEdges.set(key,false);return false;}
    const offset=Math.min(.05,length*.2),mx=(start[0]+end[0])/2,my=(start[1]+end[1])/2,nx=-dy/length*offset,ny=dx/length*offset;
    const shared=pointInCurrentMap([mx+nx,my+ny])&&pointInCurrentMap([mx-nx,my-ny]);internalEdges.set(key,shared);return shared;
  };
  let lastYield=performance.now();
  for(const feature of features){
    const name=getFeatureName(feature),polygons=toTexturedPolygons(feature);if(!polygons.length)continue;
    if(name)featureByName.set(name,feature);
    const region=new THREE.Group();region.userData.featureName=name;region.userData.baseZ=0;region.userData.targetZ=0;group.add(region);featureLiftGroups.set(name,[region]);
    for(const wall of [...body.children])if(wall.userData.fuiWallOwner===name)region.add(wall);
    const rim=rims.get(name);if(rim)region.add(rim);
    const rings=polygons.flat(),internalMaterial=createSideGradientMaterial(0);bindFuiTerrainSideWall(internalMaterial,terrain);
    const internalWall=createPolygonSideWalls(rings,internalMaterial,isInternal);internalWall.name='fui-glass-internal-wall';
    internalWall.geometry.computeBoundingBox();internalWall.geometry.boundingBox!.min.z-=28;internalWall.geometry.boundingBox!.max.z+=26;
    internalWall.geometry.boundingSphere=internalWall.geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());region.add(internalWall);
    const geometry=new THREE.ShapeGeometry(polygons.map(polygon=>makeShape(polygon)));
    // The lower vertex layer displaces this shared plane down by 2.6 units.
    // Include both layers in CPU culling bounds, including tiny island parts.
    geometry.computeBoundingBox();geometry.boundingBox!.min.z-=2.6;
    geometry.boundingSphere=geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
    const material=createFuiMapHologramSurface(props.skin,terrain,glassEnvironment?.texture);
    Object.assign(material.uniforms,createFuiMapCapOpticsUniforms('equirect',opticalRegion.center,opticalRegion.angularScale));
    setFuiMapCapRestView(material,restViewENU);
    material.uniforms.uGlassLinearOutput.value=1;
    material.uniforms.uMapScale.value=mapScale;
    material.uniforms.uGlassLightPosition.value.copy(lightPosition);
    material.uniforms.uGlassLightReferenceDistance.value=lightReferenceDistance;
    const backing=new THREE.Mesh(geometry,createFuiMapHologramBacking(material));
    backing.name='fui-hologram-region-backing';backing.position.z=44;backing.renderOrder=4.5;
    region.add(backing);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.z=44;mesh.renderOrder=6;
    mesh.name='fui-hologram-region-coat';
    mesh.userData.featureName=name;mesh.userData.featureCode=getFeatureCode(feature);mesh.userData.baseZ=44;mesh.userData.hologramSurface=material;
    region.add(mesh);interactiveMeshes.push(mesh);featureMeshes.set(name,[mesh]);
    const selectedEdges=createGlassRegionEdges(rings,terrain);
    selectedEdges.userData.fuiSmoothBoundary=true;region.add(selectedEdges);region.traverse(object=>object.layers.enable(FUI_MAP_REFLECTION_LAYER));useGlassSourceLayer(region);
    if(performance.now()-lastYield>(props.active?6:4)){await waitForBuildSlice();lastYield=performance.now();}
  }
  if(currentState.scope!=='world'){
    await waitForBuildSlice();group.add(useGlassSourceLayer(createProvinceChaseLight()));prepareLiftFollowingChase(group,ownerAt);
  }
  if(props.useInternalHudRing)group.add(createRotatingRingDecor());
  terrainDetail.value='smooth-glass';terrainResolution.value=0;
  if(isFuiChinaCountry(currentState.geoData,currentState)){
    let surfaceReference:THREE.ShaderMaterial|undefined;
    group.traverse(object=>{if(!surfaceReference&&object.name==='fui-hologram-region-coat')surfaceReference=(object as THREE.Mesh).material as THREE.ShaderMaterial;});
    const maritime=createFuiSouthSeaMap(southSeaGeography,coord=>projectPoint(coord,0),glassEnvironment?.texture,getHostSize(),sideMaterial,surfaceReference?{terrain,skin:props.skin,reference:surfaceReference}:undefined,FUI_SOUTH_SEA_GLASS_LEVELS);group.add(useGlassSourceLayer(maritime));
    interactiveMeshes.push(maritime.userData.fuiSouthSea.islandMesh);bindSouthSeaFeatureOwner(maritime);
  }
  const instrument=createRegionalFuiBase();group.add(instrument);group.userData.fuiInstrumentBase=instrument;
  syncMapReflectionBudget(group);
  sideMaterial.dispose();updateMapAppearance(group,0);primeGroupOpacity(group);return group;
}

async function createMap() {
  const group=createMapRoot();
  if(hologramSurfaceActive.value)return createSmoothGlassMap(group);
  group.userData.fuiSurfaceFamily='terrain';

  const geoBaseMaterial = new THREE.MeshBasicMaterial({
    color: mapTheme.mapBase,
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const topMaterial = createMapTerrainMaterial({
    elevationScale: currentState.scope === 'country' ? 5.6 : currentState.scope === 'province' ? 8.2 : 7.2,
    normalStrength: currentState.scope === 'country' ? 0.82 : 1,
    roughness: 0.94,
    textureOpacity: currentState.scope === 'country' ? 0.84 : 0.9,
  });
  let geographicMaterial:THREE.ShaderMaterial;
  topMaterial.alphaTest = 0.02;
  topMaterial.needsUpdate = true;
  const sideMaterial = createSideGradientMaterial();
  const topGlowMaterial = new THREE.MeshBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: 0.045,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accent,
    transparent: true,
    opacity: currentState.scope === 'world' ? 0.72 : 0.46,
    depthTest: false,
    depthWrite: false,
  });
  const provinceOutlineMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accentSoft,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const bottomOutlineMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.accentSoft,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const geoBaseLineMaterial = new THREE.LineBasicMaterial({
    color: mapTheme.baseLine,
    transparent: true,
    opacity: 0.54,
    depthTest: false,
    depthWrite: false,
  });

  for(const [material,role] of [[geoBaseMaterial,'base'],[topGlowMaterial,'accent'],[highlightMaterial,'accent'],[lineMaterial,'inner'],[provinceOutlineMaterial,'outer'],[bottomOutlineMaterial,'bottom'],[geoBaseLineMaterial,'bottom']] as const){
    material.userData.fuiColorRole=role;material.userData.fuiLegacyColor=material.color.clone();
  }
  topGlowMaterial.userData.fuiTopGlow=true;
  const renderableFeatures = getRenderableFeatures();
  await waitForBuildSlice();
  const prepared=await prepareNativeGlassGeometry(renderableFeatures,group),{footprint,regions:regionFootprints}=prepared;
  const edgeField=createFuiMapEdgeField(footprint,regionFootprints);
  group.userData.fuiEdgeField=edgeField;
  const textures=await waitForFuiMapTexturesReady([lonMin,latMin,lonMax,latMax]);
  group.userData.fuiMapTextures=textures;
  const projection=new THREE.Vector4(1/mapScale/360,1/mapScale/180,
    (lonMin+(mapWidth/2-projectedOffsetX)/mapScale+180)/360,
    (latMax-(mapHeight/2-projectedOffsetY)/mapScale+90)/180);
  const terrain=createFuiTerrainState(edgeField,projection,textures.relief,currentState.scope==='country',textures.reliefBounds);
  terrain.uniforms.uFuiTerrainEnabled!.value=hologramSurfaceActive.value?0:1;
  group.userData.fuiTerrain=terrain;
  geographicMaterial=createFuiMapSurface(props.skin,terrain,textures);
  const wallOwnerAt=createFuiGlassWallOwnerLookup(regionFootprints);
  const bodyMaterial=sideMaterial.clone();
  const glassBody=createFuiMapGlassBodyFromGeometry(prepared.body,bodyMaterial,glassEnvironment?.texture,{batchAdditiveCoats:props.mapPresentation!=='standard',batchSortedCores:props.mapPresentation!=='standard'});bodyMaterial.dispose();delete group.userData.fuiPreparedGlass;
  group.add(glassBody);
  const exteriorRims=createGlassOuterRims(glassBody.userData.fuiWallFootprint??footprint,wallOwnerAt);
  group.add(createGlassBottomRim(glassBody.userData.fuiWallFootprint??footprint));
  glassBody.traverse(object=>object.layers.enable(FUI_MAP_REFLECTION_LAYER));
  const edgeUseCount=new Map<string,number>();
  for(const feature of renderableFeatures)for(const ring of toRenderablePolygons(feature).flat())
    ring.forEach((a,i)=>{const key=edgeKey(a,ring[(i+1)%ring.length]);edgeUseCount.set(key,(edgeUseCount.get(key)??0)+1);});
  // Equal geographic borders can have different source segmentation. Check
  // both sides too, so near-identical regional subdivisions never lose a wall.
  const internalEdgeCache=new Map<string,boolean>();
  const isInternalEdge=(a:Position,b:Position)=>{
    const key=edgeKey(a,b);if((edgeUseCount.get(key)??0)>1)return true;
    const cached=internalEdgeCache.get(key);if(cached!==undefined)return cached;
    const start=projectCoord(a),end=projectCoord(b),dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
    if(length<.001){internalEdgeCache.set(key,false);return false;}
    const offset=Math.min(.05,length*.2),mx=(start[0]+end[0])/2,my=(start[1]+end[1])/2;
    const nx=-dy/length*offset,ny=dx/length*offset;
    const shared=pointInCurrentMap([mx+nx,my+ny])&&pointInCurrentMap([mx-nx,my-ny]);
    internalEdgeCache.set(key,shared);return shared;
  };
  // Anchored walls keep the raised region closed down to the body's base.
  // A second stationary relief plate would show through them as a false shelf.
  let lastBuildYield=performance.now();
  for (let featureIndex = 0; featureIndex < renderableFeatures.length; featureIndex += 1) {
    const feature = renderableFeatures[featureIndex];
    const featureName = getFeatureName(feature);
    if (featureName) featureByName.set(featureName, feature);
    const renderablePolygons = toRenderablePolygons(feature);
    if (!renderablePolygons.length) continue;
    const featureGroup = new THREE.Group();
    featureGroup.userData.featureName = featureName;
    featureGroup.userData.baseZ = 0;
    featureGroup.userData.targetZ = 0;
    group.add(featureGroup);
    featureLiftGroups.set(featureName, [featureGroup]);
    for(const wall of [...glassBody.children])if(wall.userData.fuiWallOwner===featureName)featureGroup.add(wall);
    const exteriorRim=exteriorRims.get(featureName);if(exteriorRim)featureGroup.add(exteriorRim);

    const shapes = renderablePolygons.map((polygon) => makeShape(polygon));
    const featureRings = renderablePolygons.flat();
    const texturedPolygons=toTexturedPolygons(feature),texturedRings=texturedPolygons.flat();

    const geoBase = new THREE.Mesh(new THREE.ShapeGeometry(shapes), geoBaseMaterial);
    geoBase.position.z = 20;geoBase.name='fui-legacy-region-base';
    featureGroup.add(geoBase);
    const baseEdge=makeBoundarySegments(featureRings,21,geoBaseLineMaterial);
    baseEdge.name='fui-legacy-base-edge';featureGroup.add(baseEdge);

    const liftSideMaterial = createSideGradientMaterial(0);
    const legacyWall=createPolygonSideWalls(featureRings,liftSideMaterial);
    legacyWall.name='fui-legacy-region-sidewall';featureGroup.add(legacyWall);
    const internalMaterial=createSideGradientMaterial(0);bindFuiTerrainSideWall(internalMaterial,terrain);
    const internalWall=createPolygonSideWalls(texturedRings,internalMaterial,isInternalEdge);
    internalWall.name='fui-glass-internal-wall';
    internalWall.geometry.computeBoundingBox();
    internalWall.geometry.boundingBox!.min.z-=28;
    internalWall.geometry.boundingBox!.max.z+=26;
    internalWall.geometry.boundingSphere=internalWall.geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
    featureGroup.add(internalWall);
    featureSideMaterials.set(featureName, [liftSideMaterial]);

    const originalGeometry=applyMapTerrainUv(new THREE.ShapeGeometry(shapes));
    const geographicShape=new THREE.ShapeGeometry(texturedPolygons.map(polygon=>makeShape(polygon)));
    const topGeometry=applyMapTerrainUv(refineFuiMapGeometry(geographicShape,3.2));geographicShape.dispose();
    const originalMaterial=topMaterial.clone();
    bindFuiClassicTerrainMaterial(originalMaterial);
    const texturedMaterial=geographicMaterial.clone();bindFuiTerrainUniforms(texturedMaterial,terrain);
    const mesh = new THREE.Mesh(props.mapPresentation==='standard'?originalGeometry:topGeometry,props.mapPresentation==='standard'?originalMaterial:texturedMaterial);
    mesh.userData.originalGeometry=originalGeometry;mesh.userData.texturedGeometry=topGeometry;
    mesh.userData.originalSurface=originalMaterial;
    mesh.userData.texturedSurface=texturedMaterial;
    mesh.position.z = 44;
    mesh.userData.featureName = featureName;
    mesh.userData.featureCode = getFeatureCode(feature);
    mesh.userData.baseZ = 44;
    featureGroup.add(mesh);
    bindFuiTerrainRaycast(mesh,topGeometry,terrain);
    interactiveMeshes.push(mesh);
    featureMeshes.set(featureName, [mesh]);
    const glassCoatMaterial=createFuiMapGlassMaterial(glassEnvironment?.texture);
    bindFuiMapGlassGlow(glassCoatMaterial,edgeField,props.skin);
    bindFuiTerrainGlass(glassCoatMaterial,terrain);
    const glassCoat=new THREE.Mesh(topGeometry,glassCoatMaterial);
    glassCoat.name='fui-glass-clear-coat';glassCoat.position.z=44.12;
    glassCoat.castShadow=false;
    glassCoat.renderOrder=8;glassCoat.visible=props.mapPresentation!=='standard'&&!hologramSurfaceActive.value;
    featureGroup.add(glassCoat);

    const topGlow = new THREE.Mesh(new THREE.ShapeGeometry(shapes), topGlowMaterial);
    topGlow.name='fui-legacy-top-glow';
    topGlow.position.z = 48;
    featureGroup.add(topGlow);

    const highlightInstanceMaterial = highlightMaterial.clone();
    highlightInstanceMaterial.userData.targetOpacity = 0;
    const highlightMesh = new THREE.Mesh(new THREE.ShapeGeometry(shapes), highlightInstanceMaterial);
    highlightMesh.position.z = 52;highlightMesh.name='fui-legacy-hover-highlight';
    highlightMesh.renderOrder = 7;
    featureGroup.add(highlightMesh);
    featureHighlightMaterials.set(featureName, [highlightInstanceMaterial]);

    const featureBoundary=makeBoundarySegments(featureRings,44,lineMaterial);
    featureBoundary.name='fui-original-region-boundary';
    featureGroup.add(featureBoundary);
    featureGroup.add(createGlassRegionEdges(texturedRings,terrain));
    featureGroup.traverse(object=>object.layers.enable(FUI_MAP_REFLECTION_LAYER));
    if(performance.now()-lastBuildYield>(props.active?6:4)){await waitForBuildSlice();lastBuildYield=performance.now();}
  }

  if (currentState.scope !== 'world') {
    await waitForBuildSlice();
    const outerWalls=createProvinceSideWalls(sideMaterial);
    outerWalls.name='fui-outer-sidewalls';group.add(outerWalls);
    const originalOutline=createProvinceOutlineSegments(44, provinceOutlineMaterial, 9);
    originalOutline.name='fui-original-outer-outline';group.add(originalOutline);
    const bottomOutline=createProvinceOutlineSegments(24,bottomOutlineMaterial,1);
    bottomOutline.name='fui-legacy-bottom-outline';group.add(bottomOutline);
  }
  if (currentState.scope !== 'world') {
    await waitForBuildSlice();
    group.add(createProvinceChaseLight());
    prepareLiftFollowingChase(group,wallOwnerAt);
  }
  await waitForBuildSlice();
  const flyLines=createFlyLines();flyLines.name='fui-legacy-flight-overlay';group.add(flyLines);

  if (props.useInternalHudRing) group.add(createRotatingRingDecor());
  group.userData.fuiReliefBounds=[lonMin,latMin,lonMax,latMax];
  group.userData.fuiRegional=true;
  terrainDetail.value=hologramSurfaceActive.value?'smooth-glass':'loading';terrainResolution.value=0;
  if(isFuiChinaCountry(currentState.geoData,currentState)){
    const maritime=createFuiSouthSeaMap(southSeaGeography,coord=>projectPoint(coord,0),glassEnvironment?.texture,getHostSize(),sideMaterial,undefined,props.mapPresentation==='standard'?undefined:FUI_SOUTH_SEA_GLASS_LEVELS);
    group.add(maritime);
    interactiveMeshes.push(maritime.userData.fuiSouthSea.islandMesh);
    bindSouthSeaFeatureOwner(maritime);
  }
  const instrument=createRegionalFuiBase();group.add(instrument);group.userData.fuiInstrumentBase=instrument;
  syncMapReflectionBudget(group);
  updateMapAppearance(group,0);
  topMaterial.dispose();
  geographicMaterial.dispose();
  primeGroupOpacity(group);
  return group;
}

function createCityMarkers(group: THREE.Group) {
  currentLabels.forEach((city) => {
    const anchorPoint = projectPoint(city.coord, 58);
    const labelAnchor = document.createElement('div');
    labelAnchor.className = 'city-label-anchor';

    const labelEl = document.createElement('div');
    labelEl.className = 'city-label';
    if (city.ripple) {
      labelEl.classList.add('is-jinhua');
      const rippleEl = document.createElement('div');
      rippleEl.className = 'city-ripple';
      labelAnchor.appendChild(rippleEl);
      const rippleDelayEl = document.createElement('div');
      rippleDelayEl.className = 'city-ripple delay';
      labelAnchor.appendChild(rippleDelayEl);
    }
    labelEl.innerHTML = `<span>${city.name}</span>`;
    const feature=featureByName.get(city.name);
    if(feature && resolveDrillTarget(feature)){
      labelEl.setAttribute('role','button');labelEl.tabIndex=0;
      labelEl.setAttribute('aria-label',`下钻${city.name}`);labelEl.title=city.name;
      labelEl.style.pointerEvents='auto';labelEl.style.cursor='pointer';
      labelEl.addEventListener('pointermove',event=>event.stopPropagation());
      labelEl.addEventListener('pointerdown',event=>event.stopPropagation());
      labelEl.addEventListener('click',event=>{event.stopPropagation();void drillToFeature(city.name);});
      labelEl.addEventListener('pointerenter',()=>setFeatureHighlight(city.name));
      labelEl.addEventListener('pointerleave',()=>setFeatureHighlight(''));
      labelEl.addEventListener('focus',()=>setFeatureHighlight(city.name));
      labelEl.addEventListener('blur',()=>setFeatureHighlight(''));
      labelEl.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();void drillToFeature(city.name);}
      });
    }
    labelAnchor.appendChild(labelEl);
    cityLabelElements.set(city.name, labelEl);

    const label = new CSS2DObject(labelAnchor);
    label.position.copy(anchorPoint);
    group.add(label);
  });
  cityLabelPresentationKey = '';
  updateCityLabelPresentation();
}

function setCityLabelSelected(featureName: string) {
  cityLabelElements.forEach((element, cityName) => {
    element.classList.toggle('is-selected', cityName === featureName);
  });
}

function setFeatureHighlight(featureName: string) {
  if(loadPhase.value!=='ready'||isDrilling)return;
  if (hoveredFeature === featureName) return;
  if (hoveredFeature) {
    featureLiftGroups.get(hoveredFeature)?.forEach((group) => {
      group.userData.targetZ = group.userData.baseZ ?? 0;
    });
    featureSideMaterials.get(hoveredFeature)?.forEach((material) => {
      material.uniforms.topColor.value.set(mapTheme.accent);
      material.uniforms.midColor.value.set(mapTheme.sideMid);
      material.uniforms.bottomColor.value.set(mapTheme.sideBottom);
      material.uniforms.alpha.value = 0;
    });
    featureHighlightMaterials.get(hoveredFeature)?.forEach((material) => {
      material.userData.targetOpacity = 0;
    });
    featureMeshes.get(hoveredFeature)?.forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.set(material.userData.baseColor ?? mapTheme.surfaceBase);
        material.emissive.set(material.userData.baseEmissive ?? mapTheme.surfaceEmissive);
        material.emissiveIntensity = material.userData.baseEmissiveIntensity ?? 0.03;
        material.opacity = material.userData.baseOpacity ?? 0.86;
      }
    });
  }

  hoveredFeature = featureName;
  setCityLabelSelected(featureName);
  if (!featureName) return;
  featureLiftGroups.get(featureName)?.forEach((group) => {
    group.userData.targetZ = 16;
  });
  featureSideMaterials.get(featureName)?.forEach((material) => {
    material.uniforms.topColor.value.set(mapTheme.accent);
    material.uniforms.midColor.value.set(mapTheme.hoverMid);
    material.uniforms.bottomColor.value.set(mapTheme.hoverBottom);
    material.uniforms.alpha.value = 0.9;
  });
  featureHighlightMaterials.get(featureName)?.forEach((material) => {
    material.userData.targetOpacity = 0.32;
  });
  featureMeshes.get(featureName)?.forEach((mesh) => {
    const material = mesh.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.userData.baseColor ??= `#${material.color.getHexString()}`;
      material.userData.baseEmissive ??= `#${material.emissive.getHexString()}`;
      material.userData.baseOpacity ??= material.opacity;
      material.userData.baseEmissiveIntensity ??= material.emissiveIntensity;
      material.color.set(mapTheme.accent);
      material.emissive.set(mapTheme.accent);
      material.emissiveIntensity = 0.72;
      material.opacity = 0.68;
    }
  });
}

function resetAllFeatureHighlights() {
  featureLiftGroups.forEach((groups) => {
    groups.forEach((group) => {
      group.userData.targetZ = group.userData.baseZ ?? 0;
    });
  });
  featureSideMaterials.forEach((materials) => {
    materials.forEach((material) => {
      material.uniforms.topColor.value.set(mapTheme.accent);
      material.uniforms.midColor.value.set(mapTheme.sideMid);
      material.uniforms.bottomColor.value.set(mapTheme.sideBottom);
      material.uniforms.alpha.value = 0;
    });
  });
  featureHighlightMaterials.forEach((materials) => {
    materials.forEach((material) => {
      material.userData.targetOpacity = 0;
    });
  });
  featureMeshes.forEach((meshes) => {
    meshes.forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.set(material.userData.baseColor ?? mapTheme.surfaceBase);
        material.emissive.set(material.userData.baseEmissive ?? mapTheme.surfaceEmissive);
        material.emissiveIntensity = material.userData.baseEmissiveIntensity ?? 0.03;
        material.opacity = material.userData.baseOpacity ?? 0.86;
      }
    });
  });
  hoveredFeature = '';
  setCityLabelSelected('');
}

function onPointerMove(event: PointerEvent) {
  if(loadPhase.value!=='ready'||isDrilling)return;
  if (!host.value || !camera || !renderer) return;
  if (currentState.scope === 'world') return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
  const featureName = hit?.object.userData.featureName ?? '';
  setFeatureHighlight(featureName);
  if (featureName) prefetchDrillTarget(featureName);
}

function onPointerLeave() {
  resetAllFeatureHighlights();
}

function isChinaFeature(feature: MapFeature) {
  const name = getFeatureName(feature);
  const code = getFeatureCode(feature);
  return name === 'China' || name === '中国' || code === 'CHN' || code === 'CN';
}

function isWorldDisplayFeature(feature: MapFeature) {
  const name = getFeatureName(feature);
  return name !== 'Antarctica' && name !== '南极洲';
}

function nextScope(scope: MapScope): MapScope | undefined {
  const scopeMap: Record<MapScope, MapScope | undefined> = {
    world: 'country',
    country: 'province',
    province: 'city',
    city: 'district',
    district: undefined,
  };
  return scopeMap[scope];
}

function resolveDrillTarget(feature: MapFeature) {
  const targetScope = nextScope(currentState.scope);
  if (!targetScope) return undefined;

  if (currentState.scope === 'world') {
    if (!isChinaFeature(feature)) return undefined;
    return {
      scope: 'country' as const,
      regionName: '中国',
      code: '100000',
    };
  }

  const code = getFeatureCode(feature);
  if (!code) return undefined;
  return {
    scope: targetScope,
    regionName: getFeatureName(feature),
    code,
  };
}

function prefetchDrillTarget(featureName: string) {
  const feature = featureByName.get(featureName);
  if (!feature) return;
  const target = resolveDrillTarget(feature);
  if (!target) return;
  prefetchMapLevel(target.scope, target.code);
}

function refreshDrillControl() {
  if (!drillControlEl) return;
  const scopeLabel = {
    world: '全球',
    country: '国家',
    province: '省级',
    city: '市级',
    district: '区县',
  }[currentState.scope];
  const busy=isDrilling||loadPhase.value!=='ready';
  const backDisabled = !drillStack.length || busy ? 'disabled' : '';
  const actionDisabled = busy ? 'disabled' : '';

  drillControlEl.innerHTML = `
    <button type="button" data-map-action="back" ${backDisabled}>返回上级</button>
    <span>${scopeLabel} / ${currentState.regionName}</span>
    <button type="button" data-map-action="save-view-default" ${actionDisabled}>保存统一</button>
    <button type="button" data-map-action="save-view-scope" ${actionDisabled}>保存本层</button>
    <button type="button" data-map-action="reset-view-scope" ${actionDisabled}>恢复本层</button>
    <button type="button" data-map-action="reset-view-all" ${actionDisabled}>恢复全部</button>
  `;
  drillControlEl.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.mapAction;
      if (action === 'back') {
        void drillBack();
        return;
      }
      handleCameraControlAction(action, button);
    });
  });
}

function createDrillControl() {
  if (!host.value || !props.showControls) return;
  drillControlEl = document.createElement('div');
  drillControlEl.className = 'map-drill-control';
  host.value.appendChild(drillControlEl);
  refreshDrillControl();
}

// WebGLRenderer.compile traverses invisible objects too. Compile the actual
// view, retaining the hidden lift-wall program needed by immediate selection.
function compileVisibleMap(targetRenderer:THREE.WebGLRenderer,targetScene:THREE.Scene,targetCamera:THREE.Camera){
  const view=new THREE.Group(),seen=new Set<THREE.Object3D>();
  const add=(object:THREE.Object3D)=>{
    if(seen.has(object)||!object.layers.test(targetCamera.layers))return;
    let proxy:THREE.Object3D|undefined;
    if(object instanceof THREE.Mesh)proxy=new THREE.Mesh(object.geometry,object.material);
    else if(object instanceof THREE.LineSegments)proxy=new THREE.LineSegments(object.geometry,object.material);
    else if(object instanceof THREE.Line)proxy=new THREE.Line(object.geometry,object.material);
    else if(object instanceof THREE.Points)proxy=new THREE.Points(object.geometry,object.material);
    else if(object instanceof THREE.Sprite)proxy=new THREE.Sprite(object.material);
    if(proxy){seen.add(object);proxy.layers.mask=object.layers.mask;proxy.matrixWorld.copy(object.matrixWorld);view.add(proxy);}
  };
  targetScene.traverseVisible(add);
  targetScene.traverse(object=>{if(object.name==='fui-glass-internal-wall')add(object);});
  const pending=rendererJobs.run(()=>targetRenderer.compileAsync(view,targetCamera,targetScene));
  // Hidden one-shot preparation has no RAF frame boundary to flush it.
  // Submit synchronously while the caller's intended target is still selected.
  targetRenderer.getContext().flush();
  return pending;
}

function compileMapFrame(targetRenderer:THREE.WebGLRenderer,targetScene:THREE.Scene,targetCamera:THREE.Camera){
  if(mapGroup?.userData.fuiSurfaceFamily!=='hologram'){
    releaseGlassHdrPass();
    return compileVisibleMap(targetRenderer,targetScene,targetCamera);
  }
  const size=getHostSize(),pass=getGlassHdrPass(targetRenderer);
  pass.setSize(size.width,size.height,targetRenderer.getPixelRatio());
  glassFloatTargetsEnabled=glassFloatTargetsSupported&&pass.diagnostics.mode==='hdr';
  if(mapGroup)syncMapReflectionBudget(mapGroup);
  const cameraMask=targetCamera.layers.mask;
  let baseJob:Promise<unknown>;
  try{
    targetCamera.layers.set(0);
    baseJob=compileVisibleMap(targetRenderer,targetScene,targetCamera);
  }finally{targetCamera.layers.mask=cameraMask;}
  const sourceJob=pass.compile(targetScene,targetCamera,size.width,size.height,targetRenderer.getPixelRatio(),FUI_GLASS_SOURCE_LAYER,
    (sourceScene:THREE.Scene,sourceCamera:THREE.Camera)=>compileVisibleMap(targetRenderer,sourceScene,sourceCamera));
  return Promise.all([baseJob,sourceJob]);
}

function submitMapFrameCompiles(targetRenderer:THREE.WebGLRenderer,targetScene:THREE.Scene,targetCamera:THREE.Camera){
  const jobs:Promise<unknown>[]=[compileMapFrame(targetRenderer,targetScene,targetCamera)];
  const mirror=targetScene.getObjectByName('fui-map-live-reflection') as THREE.Object3D&{camera:THREE.Camera;getRenderTarget?:()=>THREE.WebGLRenderTarget};
  if(mirror?.visible&&mirror.getRenderTarget){
    const previousTarget=targetRenderer.getRenderTarget();
    try{targetRenderer.setRenderTarget(mirror.getRenderTarget());jobs.push(compileVisibleMap(targetRenderer,targetScene,mirror.camera));}
    finally{targetRenderer.setRenderTarget(previousTarget);}
  }
  // Attach rejection handlers immediately; the composed frame must consume
  // these exact variants before waiting for Three's asynchronous GPU polls.
  return Promise.allSettled(jobs);
}

function publishMapResourceDiagnostics(group:THREE.Group){
  if(!host.value)return;
  const modes=new Set<string>();
  group.traverse(object=>{
    if(object.userData.originalSurface)modes.add('original');
    if(object.userData.texturedSurface)modes.add('terrain');
    if(object.userData.hologramSurface)modes.add('hologram');
  });
  host.value.dataset.resourceFamily=group.userData.fuiSurfaceFamily??'terrain';
  host.value.dataset.surfaceVariants=[...modes].sort().join(',');
  host.value.dataset.terrainHitProxies=String((group.userData.fuiTerrain as FuiTerrainState|undefined)?.proxies.length??0);
  host.value.dataset.geometryPreparation=group.userData.fuiGeometryPreparation??'native';
}

async function warmInitialMapRenderer(group: THREE.Group, buildVersion: number) {
  const warmStarted=performance.now();
  const warmupVersion = ++rendererWarmupVersion;
  const warmRenderer = renderer;
  const warmScene = scene;
  const warmCamera = camera;
  if (!warmRenderer || !warmScene || !warmCamera) return;

  loadPhase.value='warming';emit('loading','warming');
  const smoothGlass=group.userData.fuiSurfaceFamily==='hologram';
  publishMapResourceDiagnostics(group);
  const textures = !smoothGlass&&props.mapPresentation==='standard'?Object.values(await waitForTerrainTexturesReady()):[];
  const geographicTextures = smoothGlass?undefined:group.userData.fuiMapTextures ?? await waitForFuiMapTexturesReady([lonMin,latMin,lonMax,latMax]);
  if (
    warmupVersion !== rendererWarmupVersion
    || buildVersion !== mapBuildVersion
    || mapGroup !== group
    || renderer !== warmRenderer
  ) return;

  settleMapForStaticFrame(group);
  group.userData.fuiWarming=true;
  updateMapAppearance(group,0);
  const visibleWait=performance.now();
  await waitForEarthIntro?.();
  if(warmupVersion!==rendererWarmupVersion||buildVersion!==mapBuildVersion)return;
  if(host.value)host.value.dataset.gpuWarmStartedAtMs=performance.now().toFixed(1);
  await waitForVisiblePage();
  if(host.value)host.value.dataset.visibilityWaitMs=(performance.now()-visibleWait).toFixed(1);
  if(warmupVersion!==rendererWarmupVersion||buildVersion!==mapBuildVersion)return;
  await waitForPreloadSlice();
  const compileStarted=performance.now();
  let compilePending:Promise<unknown>|undefined;
  try{compilePending=submitMapFrameCompiles(warmRenderer,warmScene,warmCamera);}
  catch{/* The complete hidden frame remains the compatibility warm-up path. */}
  const uploadStarted=performance.now();
  const mapTextures:THREE.Texture[]=geographicTextures?[geographicTextures.photograph,geographicTextures.relief]:[];
  for (const texture of [...textures,...mapTextures]) {
    if (warmupVersion !== rendererWarmupVersion || renderer !== warmRenderer) return;
    await waitForPreloadSlice();
    warmRenderer.initTexture(texture);
  }

  if(host.value){
    host.value.dataset.uploadMs=(performance.now()-uploadStarted).toFixed(1);
    host.value.dataset.overviewScope=geographicTextures?.scope??'none';
    host.value.dataset.resourceFamily=smoothGlass?'hologram':'terrain';
    host.value.dataset.overviewPixels=String(mapTextures.reduce((sum,t)=>sum+t.image.width*t.image.height,0));
  }
  await waitForPreloadSlice();
  if (
    warmupVersion !== rendererWarmupVersion
    || buildVersion !== mapBuildVersion
    || mapGroup !== group
    || renderer !== warmRenderer
  ) return;
  const firstFrameStarted=performance.now();
  renderMapFrame(warmRenderer,warmScene,warmCamera);
  warmRenderer.getContext().flush();
  labelRenderer?.render(warmScene, warmCamera);
  await compilePending;
  if(warmupVersion!==rendererWarmupVersion||buildVersion!==mapBuildVersion||mapGroup!==group||renderer!==warmRenderer)return;
  group.userData.fuiWarming=false;
  hasFrame.value=true;
  if(host.value){
    host.value.dataset.firstFrameMs=(performance.now()-firstFrameStarted).toFixed(1);
    host.value.dataset.compileMs=(performance.now()-compileStarted).toFixed(1);
    host.value.dataset.programCount=String(warmRenderer.info.programs?.length??0);
    host.value.dataset.prepareMs=(performance.now()-scenePrepareStarted).toFixed(1);
    host.value.dataset.warmMs=(performance.now()-warmStarted).toFixed(1);
  }
  hasEmittedReady = true;
  loadPhase.value='ready';
  if(props.active){beginMapEntrance(group);startMapAnimation();}else emit('loading','ready');
  emit('ready');emitNavigationChange();
}

async function rebuildMapForCurrentState(surfaceOnly=false) {
  const buildStarted=performance.now();
  if (!scene) return;
  revealPrepared=false;
  loadPhase.value='building';emit('loading','building');
  stopMapAnimation();
  // Let the loader/retained old frame paint before CPU geometry work starts.
  await waitForBuildSlice();
  nativeGeometryController?.abort();
  activeScope.value = currentState.scope;
  activeCode.value = currentState.code;
  const buildVersion = ++mapBuildVersion;
  const previousMapGroup = mapGroup;
  const previousCamera=surfaceOnly?getCurrentCameraView():undefined;
  geoData = currentState.geoData;
  updateProjectionFromGeoData();
  currentLabels = createLabelsForState();
  resetAllFeatureHighlights();
  const nextMapGroup = currentState.scope === 'world' ? createWorldMap() : await createMap();
  if(host.value)host.value.dataset.buildMs=(performance.now()-buildStarted).toFixed(1);
  if (buildVersion !== mapBuildVersion || !scene) {
    disposeObject3D(nextMapGroup);
    return;
  }
  if(surfaceOnly&&previousMapGroup){
    // Resource preparation must not restart the HUD/ripple epoch or disturb
    // the geographic camera/navigation state. Preserve the actual instrument.
    nextMapGroup.userData.fuiGroundShownAt=previousMapGroup.userData.fuiGroundShownAt;
    const retained=previousMapGroup.userData.fuiInstrumentBase as THREE.Object3D|undefined;
    const replacement=nextMapGroup.userData.fuiInstrumentBase as THREE.Object3D|undefined;
    if(retained&&replacement){nextMapGroup.remove(replacement);disposeObject3D(replacement);nextMapGroup.add(retained);nextMapGroup.userData.fuiInstrumentBase=retained;}
  }
  if (previousMapGroup) {
    scene.remove(previousMapGroup);
    // New materials must acquire the already linked terrain programs before
    // the previous level releases its last reference to those programs.
    retiredMapGroups.push(previousMapGroup);
  }
  labelRenderer?.domElement.replaceChildren();
  if (labelRenderer?.domElement) labelRenderer.domElement.style.opacity = '0';
  mapGroup = nextMapGroup;
  nextMapGroup.userData.fuiBuildVersion=buildVersion;
  nextMapGroup.userData.fuiNavigationKey=mapNavigationKey(currentNavigationPath());
  completedMapBuilds.push(nextMapGroup.userData.fuiNavigationKey);
  if(previousCamera)applyCameraView(previousCamera);
  else if(props.mapPresentation!=='standard'&&currentState.scope!=='world')applyCameraView(resolveInitialCameraView(currentState.scope));
  scene.add(nextMapGroup);
  createCityMarkers(mapGroup);
  resetAllFeatureHighlights();
  refreshDrillControl();

  if (!hasEmittedReady)await warmInitialMapRenderer(nextMapGroup,buildVersion);
  else{
    // Prime the exact new variants before arming the visible entrance clock.
    settleMapForStaticFrame(nextMapGroup);
    nextMapGroup.userData.fuiWarming=true;updateMapAppearance(nextMapGroup,0);
    if(renderer&&camera){
      let compilePending:Promise<unknown>|undefined;
      try{compilePending=submitMapFrameCompiles(renderer,scene,camera);}catch{/* The complete frame remains the compatibility path. */}
      renderMapFrame(renderer,scene,camera);renderer.getContext().flush();labelRenderer?.render(scene,camera);
      await compilePending;
      if(buildVersion!==mapBuildVersion||mapGroup!==nextMapGroup||componentDisposed)return;
    }
    nextMapGroup.userData.fuiWarming=false;
    if(surfaceOnly){
      loadPhase.value='ready';emit('loading','ready');
      if(renderer)renderer.domElement.style.opacity='1';
      if(controls)controls.enabled=true;
      publishMapResourceDiagnostics(nextMapGroup);
      if(host.value){host.value.dataset.overviewScope=nextMapGroup.userData.fuiMapTextures?.scope??'none';host.value.dataset.overviewPixels=String(nextMapGroup.userData.fuiMapTextures?[nextMapGroup.userData.fuiMapTextures.photograph,nextMapGroup.userData.fuiMapTextures.relief].reduce((sum,texture)=>sum+texture.image.width*texture.image.height,0):0);}
      updateMapAppearance(nextMapGroup,Math.max(0,performance.now()/1000-mapPulseEpoch));
      if(props.active)startMapAnimation();
    }else if(props.active){beginMapEntrance(nextMapGroup);startMapAnimation();}
    else {loadPhase.value='ready';disposeRetiredMapGroups();}
  }
  if(surfaceRefreshRequested)queueSurfaceFamilyRefresh();
}

let surfaceRefreshRequested=false;
let surfaceRefreshJob:Promise<void>|undefined;
function queueSurfaceFamilyRefresh(){
  surfaceRefreshRequested=true;
  if(componentDisposed||!hasEmittedReady||!mapGroup||surfaceRefreshJob)return;
  surfaceRefreshJob=(async()=>{
    while(surfaceRefreshRequested&&!componentDisposed&&mapGroup){
      surfaceRefreshRequested=false;
      const family=hologramSurfaceActive.value?'hologram':'terrain';
      if((mapGroup.userData.fuiSurfaceFamily??'terrain')!==family)await rebuildMapForCurrentState(true);
    }
  })().catch(error=>{
    if(!componentDisposed){loadPhase.value='error';emit('loading','error');console.error('Map surface preparation failed',error);}
  }).finally(()=>{surfaceRefreshJob=undefined;if(surfaceRefreshRequested&&!componentDisposed)queueSurfaceFamilyRefresh();});
}

watch(() => props.active, (active, wasActive) => {
  if (active && !wasActive) {
    if(!hasEmittedReady)return;
    // A renderer switch prepares the exact layout/DPR while the old view is
    // still visible. Its ready buffer must not be replaced 1.4 seconds later.
    if(revealPrepared){
      resize();startMapAnimation();return;
    }
    if (mapGroup && !hasRenderedStaticFrame)beginMapEntrance(mapGroup);
    startMapAnimation();
    resolutionUpgradeHandle = globalThis.setTimeout(() => {
      resolutionUpgradeHandle = undefined;
      if (!props.active || !renderer || !host.value) return;
      renderer.setPixelRatio(getMapPixelRatio());
      renderer.setSize(
        Math.max(host.value.clientWidth, 1),
        Math.max(host.value.clientHeight, 1),
        false,
      );
    }, 1400);
    return;
  }
  if (!active && wasActive) {
    if (resolutionUpgradeHandle !== undefined) {
      globalThis.clearTimeout(resolutionUpgradeHandle);
      resolutionUpgradeHandle = undefined;
    }
    stopMapAnimation();
    if(mapGroup?.userData.transitionStart!==undefined){
      settleMapForStaticFrame(mapGroup);loadPhase.value='ready';
      if(renderer)renderer.domElement.style.opacity='1';
      if(controls)controls.enabled=true;
      updateMapAppearance(mapGroup,0);
      if(scene&&camera&&renderer){renderMapFrame(renderer,scene,camera);labelRenderer?.render(scene,camera);}
    }
  }
});

async function drillToFeature(featureName: string) {
  if (isDrilling || loadPhase.value!=='ready') return;
  const feature = featureByName.get(featureName);
  if (!feature) return;
  const target = resolveDrillTarget(feature);
  if (!target) return;

  isDrilling = true;
  loadPhase.value='building';
  refreshDrillControl();
  const previousState=currentState,previousStack=drillStack;
  try {
    const nextGeoJson = await loadMapLevel(target.scope, target.code);
    drillStack = [...drillStack, {
      state: currentState,
      cameraView: getCurrentCameraView(),
    }];
    currentState = {
      scope: target.scope,
      regionName: target.regionName,
      code: target.code,
      geoData: nextGeoJson,
    };
    await waitForNextFrame();
    await rebuildMapForCurrentState();
    emitNavigationChange();
  } catch (error) {
    console.warn('Map drilldown failed', error);
    if(currentState!==previousState){currentState=previousState;drillStack=previousStack;await rebuildMapForCurrentState();}
    else loadPhase.value='ready';
  } finally {
    isDrilling = false;
    refreshDrillControl();
  }
}

async function drillBack() {
  if (isDrilling || loadPhase.value!=='ready') return;
  const previousItem = drillStack[drillStack.length - 1];
  if (!previousItem) return;
  const nextStack = drillStack.slice(0, -1);
  const currentBeforeBack = currentState;
  const stackBeforeBack = drillStack;
  isDrilling = true;
  loadPhase.value='building';
  drillStack = nextStack;
  currentState = previousItem.state;
  refreshDrillControl();
  try {
    await waitForNextFrame();
    await rebuildMapForCurrentState();
    if (previousItem.cameraView) applyCameraView(previousItem.cameraView);
    emitNavigationChange();
  } catch (error) {
    console.warn('Map drillback failed', error);
    drillStack = stackBeforeBack;
    currentState = currentBeforeBack;
    await rebuildMapForCurrentState();
  } finally {
    isDrilling = false;
    refreshDrillControl();
  }
}

async function syncNavigation(path: MapNavigationPath) {
  if (!path.length || isDrilling) return;
  if (mapNavigationKey(path) === mapNavigationKey(currentNavigationPath())) return;
  isDrilling = true;
  refreshDrillControl();
  const previousState = currentState;
  const previousStack = drillStack;
  try {
    const states = await Promise.all(path.map(async (item): Promise<MapState> => ({
      ...item,
      geoData: await loadMapLevel(item.scope, item.code),
    })));
    const destination = states[states.length - 1];
    if (!destination) return;
    drillStack = states.slice(0, -1).map((state) => ({ state }));
    currentState = destination;
    await waitForNextFrame();
    await rebuildMapForCurrentState();
    applyCameraView(resolveInitialCameraView(currentState.scope));
    emitNavigationChange();
  } catch (error) {
    console.warn('Map navigation sync failed', error);
    currentState = previousState;
    drillStack = previousStack;
    await rebuildMapForCurrentState();
  } finally {
    isDrilling = false;
    refreshDrillControl();
  }
}

function centerCurrentMapForReveal(){
  if(!mapGroup||!camera||!controls)return;
  const group=mapGroup;
  let points=group.userData.fuiRevealCenterPoints as THREE.Vector3[]|undefined;
  if(!points){
    const frame=getFuiInstrumentFrame();
    points=frame.points.flatMap(point=>[FUI_MAP_GLASS_LEVELS.bottom,FUI_MAP_GLASS_LEVELS.top].map(z=>new THREE.Vector3(point.x,point.y,z)));
    group.userData.fuiRevealCenterPoints=points;
  }
  if(!points.length)return;
  group.updateMatrixWorld(true);
  const result=centerFuiMapProjection(camera,controls.target,points.map(point=>point.clone().applyMatrix4(group.matrixWorld)),getHostSize());
  controls.update();updateCameraResponsiveOverlays();
  const offset=[result.projectedCenter[0]-result.viewport[0]/2,result.projectedCenter[1]-result.viewport[1]/2];
  revealDiagnostics={...revealDiagnostics,...result,projectedOffset:offset};
  if(host.value){
    host.value.dataset.revealViewport=result.viewport.join('x');
    host.value.dataset.revealProjectedCenter=result.projectedCenter.map(value=>value.toFixed(2)).join(',');
    host.value.dataset.revealProjectedOffset=offset.map(value=>value.toFixed(2)).join(',');
    host.value.dataset.revealProjectedBounds=result.projectedBounds.map(value=>value.toFixed(2)).join(',');
  }
}

type MapRevealOptions={navigation?:MapNavigationPath;viewport?:FuiRevealViewport;center?:boolean;signal?:AbortSignal};
/** Prepare the destination while the previous renderer remains visible. The
 * hidden host has no layout, so the caller supplies its actual shared viewport. */
async function prepareForReveal(options:MapRevealOptions={}){
  const version=++revealVersion;
  if(options.viewport?.width&&options.viewport?.height)revealViewport={...options.viewport};
  const cancelled=()=>componentDisposed||options.signal?.aborted||version!==revealVersion;
  const waitUntil=async(predicate:()=>boolean)=>{
    while(!predicate()){
      if(cancelled()||loadPhase.value==='error')return false;
      await new Promise<void>(resolve=>setTimeout(resolve,16));
    }
    return !cancelled();
  };
  const waitForJob=async(job:Promise<unknown>)=>{
    let complete=false,failure:unknown;
    // A cancelled switch leaves valid background preparation reusable, but the
    // caller must regain control immediately instead of awaiting GPU polling.
    void job.then(()=>{complete=true;},error=>{failure=error;complete=true;});
    if(!await waitUntil(()=>complete))return false;
    if(failure)throw failure;
    return true;
  };
  let warmingGroup:THREE.Group|undefined;
  // Setup reads these values too: cold mounts warm directly at their final
  // dimensions/DPR, rather than warming a fallback-size one-pixel-ratio frame.
  revealWarming=true;
  try{
    if(!await waitUntil(()=>Boolean(hasEmittedReady&&mapGroup&&renderer&&scene&&camera&&loadPhase.value==='ready'&&!isDrilling)))return false;
    if(options.navigation?.length&&mapNavigationKey(options.navigation)!==mapNavigationKey(currentNavigationPath())){
      if(!await waitForJob(syncNavigation(options.navigation)))return false;
      if(!await waitUntil(()=>loadPhase.value==='ready'&&!isDrilling))return false;
    }
    if(cancelled()||!mapGroup||!renderer||!scene||!camera)return false;
    if(options.navigation?.length&&mapNavigationKey(options.navigation)!==mapNavigationKey(currentNavigationPath()))return false;
    const group=mapGroup,warmRenderer=renderer,warmScene=scene,warmCamera=camera,buildVersion=mapBuildVersion;
    const qualityKey=JSON.stringify([props.quality,props.mapPresentation,group.userData.fuiSurfaceFamily]);
    const reusable=revealDiagnostics?.modelId===group.uuid&&revealDiagnostics?.qualityKey===qualityKey;
    settleMapForStaticFrame(group);
    revealCentered=options.center!==false;
    resize();
    warmingGroup=group;group.userData.fuiWarming=true;updateMapAppearance(group,Math.max(0,performance.now()/1000-mapPulseEpoch));
    let compilePending:Promise<unknown>|undefined;
    if(!reusable){try{compilePending=submitMapFrameCompiles(warmRenderer,warmScene,warmCamera);}catch{/* The complete frame remains the compatibility path. */}}
    renderMapFrame(warmRenderer,warmScene,warmCamera);warmRenderer.getContext().flush();labelRenderer?.render(warmScene,warmCamera);
    if(compilePending&&!await waitForJob(compilePending))return false;
    if(cancelled()||mapGroup!==group||renderer!==warmRenderer||mapBuildVersion!==buildVersion)return false;
    // This frame consumes the final linked variants, including reflection/HDR.
    renderMapFrame(warmRenderer,warmScene,warmCamera);warmRenderer.getContext().flush();labelRenderer?.render(warmScene,warmCamera);
    group.userData.fuiWarming=false;
    revealPrepared=true;
    if(controls)controls.enabled=true;
    warmRenderer.domElement.style.opacity='1';
    hasFrame.value=true;loadPhase.value='ready';
    const preparedAt=performance.now();
    const canvasSize=warmRenderer.getSize(new THREE.Vector2()),bufferSize=warmRenderer.getDrawingBufferSize(new THREE.Vector2());
    revealDiagnostics={...revealDiagnostics,modelId:group.uuid,modelVersion:buildVersion,builds:[...completedMapBuilds],navigationKey:mapNavigationKey(currentNavigationPath()),preparedAt,version,frames:submittedMapFrames,pixelRatio:warmRenderer.getPixelRatio(),canvasViewport:canvasSize.toArray(),drawingBuffer:bufferSize.toArray(),qualityKey,geometryPreparation:group.userData.fuiGeometryPreparation??'native'};
    if(host.value){
      host.value.dataset.revealReadyAtMs=preparedAt.toFixed(1);host.value.dataset.revealVersion=String(version);
      host.value.dataset.revealNavigationKey=String(revealDiagnostics.navigationKey);host.value.dataset.revealModelId=group.uuid;
      host.value.dataset.revealBuildVersion=String(buildVersion);host.value.dataset.revealFrameCount=String(submittedMapFrames);
      host.value.dataset.revealPixelRatio=String(warmRenderer.getPixelRatio());
      host.value.dataset.revealCanvasViewport=canvasSize.toArray().join('x');host.value.dataset.revealDrawingBuffer=bufferSize.toArray().join('x');
    }
    publishMapResourceDiagnostics(group);disposeRetiredMapGroups();return true;
  }finally{if(version===revealVersion){revealWarming=false;if(warmingGroup)warmingGroup.userData.fuiWarming=false;}}
}

defineExpose({
  syncNavigation,
  prepareForReveal,
  getNavigationKey:()=>mapNavigationKey(currentNavigationPath()),
  getRevealDiagnostics:()=>revealDiagnostics?{...revealDiagnostics,frames:submittedMapFrames}:undefined,
  navigateBack: drillBack,
  replayEntrance,
  prepareEntrance,
});

function onPointerDown(event: PointerEvent) {
  if (!host.value || !camera || !renderer) return;
  if(isDrilling||loadPhase.value!=='ready')return;
  if (event.target instanceof HTMLElement && event.target.closest('.map-drill-control')) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
  const featureName = hit?.object.userData.featureName;
  if (currentState.scope === 'world') {
    if (!hit || !mapGroup) return;
    const localPoint = hit.point.clone();
    mapGroup.worldToLocal(localPoint);
    const feature = findFeatureAtMapPoint(mapPointFromLocal(localPoint));
    if (feature && isChinaFeature(feature)) {
      void drillToFeature(getFeatureName(feature));
    }
  } else if (typeof featureName === 'string') {
    void drillToFeature(featureName);
  }
}

async function setup() {
  if (!host.value) return;
  // No second context, PMREM rendering or texture work may steal the Earth's
  // entrance. Direct-map use has no gate and starts immediately.
  await waitForEarthIntro?.();
  if(componentDisposed||!host.value?.isConnected)return;
  await waitForVisiblePage();
  if(componentDisposed||!host.value?.isConnected)return;
  if(props.initialNavigation?.length){
    const states=await Promise.all(props.initialNavigation.map(async(item):Promise<MapState>=>({...item,geoData:await loadMapLevel(item.scope,item.code)})));
    if(componentDisposed||!host.value?.isConnected)return;
    currentState=states[states.length-1];drillStack=states.slice(0,-1).map(state=>({state}));geoData=currentState.geoData;
    updateProjectionFromGeoData();
  }
  stopMapAnimation();
  resizeObserver?.disconnect();
  controls?.dispose();
  disposeRetiredMapGroups();
  if(mapGroup)disposeObject3D(mapGroup);
  disposeFuiMapReliefCache();
  glassEnvironment?.dispose();glassEnvironment=undefined;
  releaseGlassHdrPass();
  renderer?.dispose();
  host.value.replaceChildren();
  cityLabelElements.clear();

  const { width, height } = getHostSize();

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(cameraViewConfig.default.fov, width / height, 1, 2400);
  camera.position.set(...cameraViewConfig.default.position);
  camera.lookAt(...cameraViewConfig.default.target);

  host.value.dataset.rendererCreateStartedAtMs=performance.now().toFixed(1);
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'high-performance',
  });
  renderer.debug.checkShaderErrors=import.meta.env.DEV||import.meta.env.MODE==='regression';
  glassFloatTargetsSupported=supportsFuiGlassHalfFloat(renderer);glassFloatTargetsEnabled=glassFloatTargetsSupported;
  host.value.dataset.glassFloatTargets=String(glassFloatTargetsSupported);
  host.value.dataset.pmremEnabled=String(glassFloatTargetsSupported);
  delete host.value.dataset.pmremStartedAtMs;delete host.value.dataset.pmremEndedAtMs;
  if(glassFloatTargetsSupported){
    host.value.dataset.pmremStartedAtMs=performance.now().toFixed(1);
    glassEnvironment=createFuiMapGlassEnvironment(renderer);
    host.value.dataset.pmremEndedAtMs=performance.now().toFixed(1);
  }
  renderer.setSize(width, height);
  renderer.setPixelRatio(getMapPixelRatio());
  // The map floats in the scene; no receiving ground or shadow plane.
  renderer.shadowMap.enabled=false;
  host.value.appendChild(renderer.domElement);
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','3D 地图画布，按住 Shift 和方向键旋转视角');
  host.value.addEventListener('pointermove', onPointerMove);
  host.value.addEventListener('pointerdown', onPointerDown);
  host.value.addEventListener('pointerleave', onPointerLeave);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  renderer.domElement.addEventListener('keydown',event=>{
    if(!event.shiftKey||!camera||!controls)return;
    const direction:Record<string,[number,number]>={ArrowLeft:[.06,0],ArrowRight:[-.06,0],ArrowUp:[0,-.06],ArrowDown:[0,.06]};
    const turn=direction[event.key];if(!turn)return;
    event.preventDefault();
    const upToY=new THREE.Quaternion().setFromUnitVectors(camera.up,new THREE.Vector3(0,1,0));
    const orbit=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target).applyQuaternion(upToY));
    orbit.theta+=turn[0];orbit.phi=THREE.MathUtils.clamp(orbit.phi+turn[1],.03,Math.PI-.03);
    camera.position.copy(new THREE.Vector3().setFromSpherical(orbit).applyQuaternion(upToY.invert()).add(controls.target));
    hasUserAdjustedCamera=true;controls.update();updateCameraResponsiveOverlays();
  });
  controls.enablePan = false;
  controls.minDistance = 520;
  controls.maxDistance = 1450;
  controls.target.set(...cameraViewConfig.default.target);
  controls.addEventListener('change', updateCameraResponsiveOverlays);
  controls.addEventListener('start', () => {
    hasUserAdjustedCamera = true;
  });
  hasUserAdjustedCamera = !!(
    readSavedCameraViewConfig().default
    || Object.keys(readSavedCameraViewConfig().byScope ?? {}).length
  );
  applyInitialCameraViewForCurrentScope();
  updateCameraResponsiveOverlays();

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.className = 'map-label-layer';
  host.value.appendChild(labelRenderer.domElement);
  createDrillControl();

  const ambient=new THREE.AmbientLight(mapTheme.ambientLight,1.45);
  ambient.layers.enable(FUI_MAP_REFLECTION_LAYER);ambient.layers.enable(FUI_GLASS_SOURCE_LAYER);scene.add(ambient);
  const light = new THREE.DirectionalLight(mapTheme.directionalLight, 2.4);
  light.position.set(120, -240, 420);
  light.castShadow=false;
  light.layers.enable(FUI_MAP_REFLECTION_LAYER);
  light.layers.enable(FUI_GLASS_SOURCE_LAYER);
  scene.add(light);

  void rebuildMapForCurrentState().catch(error=>{
    if(componentDisposed||error?.name==='AbortError')return;
    loadPhase.value='error';emit('loading','error');console.error('Map initialization failed',error);
  });
}

function updateMapAppearance(group:THREE.Group,time:number) {
  syncMapReflectionBudget(group);
  const hologram=hologramSurfaceActive.value;
  if(mapGroup===group){
    const current=group.userData.fuiMapCode===currentState.code;
    const ready=current&&group.userData.fuiReliefReady;
    terrainDetail.value=hologram?'smooth-glass':ready?'regional':current&&group.userData.fuiReliefFailed?'overview':group.userData.fuiRegional?'loading':'global';
    terrainResolution.value=!hologram&&ready?group.userData.fuiReliefSize:0;
  }
  if(props.active && props.mapPresentation!=='standard' && !hologram && group.userData.fuiRegional && !group.userData.fuiReliefRequested){
    group.userData.fuiReliefRequested=true;
    const controller=new AbortController();group.userData.fuiReliefController=controller;
    const bounds=group.userData.fuiReliefBounds as FuiReliefBounds;
    void requestFuiMapRelief(bounds,controller.signal).then(texture=>{
      if(controller.signal.aborted)return;
      const terrain=group.userData.fuiTerrain as FuiTerrainState;
      prepareFuiTerrainRegional(terrain,texture,bounds);
      group.userData.fuiReliefMixTarget=1;updateFuiTerrainHitProxies(terrain);
      group.userData.fuiReliefReady=true;group.userData.fuiReliefSize=texture.image.width;
      if(mapGroup===group&&!hologramSurfaceActive.value){terrainDetail.value='regional';terrainResolution.value=texture.image.width;}
    }).catch(error=>{if(error.name!=='AbortError'){group.userData.fuiReliefFailed=true;if(mapGroup===group&&!hologramSurfaceActive.value)terrainDetail.value='overview';}});
  }
  const textured=props.mapPresentation!=='standard';
  const customClassic=!textured&&isFuiThemeColorId(props.skin);
  const classicSkin=customClassic?props.skin:undefined;
  if(mapGroup===group)scene?.traverse(object=>{
    if(object instanceof THREE.Light)updateFuiClassicColors(object,classicSkin);
  });
  if(group.userData.fuiRegional)group.scale.y=group.scale.x*(textured?(group.userData.fuiNorthScale??1):1);
  const terrain=group.userData.fuiTerrain as FuiTerrainState|undefined;
  if(terrain){
    terrain.uniforms.uFuiTerrainEnabled!.value=textured&&!hologram?1:0;
    terrain.uniforms.uHasRegional!.value+=((group.userData.fuiReliefMixTarget??0)-terrain.uniforms.uHasRegional!.value)*.07;
  }
  if(renderer)renderer.shadowMap.enabled=false;
  const palette=getFuiMapMaterialPalette(props.skin,mapPaletteFamily.value);
  const now=performance.now()/1000;
  if(!props.active||group.userData.transitionStart!==undefined)group.userData.fuiGroundShownAt=undefined;
  else group.userData.fuiGroundShownAt??=now;
  const groundVisibility=group.userData.fuiWarming?1:group.userData.transitionStart!==undefined
    ?THREE.MathUtils.smoothstep(group.userData.fuiEntranceProgress??0,.03,.35)
    :group.userData.fuiGroundShownAt===undefined?0:THREE.MathUtils.smoothstep(now-group.userData.fuiGroundShownAt,.24,.72);
  group.traverse(object=>{
    if(object.name==='fui-south-sea-geography')updateFuiSouthSeaMap(object as THREE.Group,props.skin,textured,mapPaletteFamily.value);
    if(object.name==='fui-legacy-flight-overlay')object.visible=!textured;
    if(object.name==='fui-map-live-reflection')updateFuiMapReflection(object,textured&&(props.active||revealWarming)&&glassFloatTargetsEnabled&&browserMapQualityBudget(props.quality).reflection,groundVisibility);
    if(object.name==='fui-glass-bottom-rim'){
      object.visible=textured;
      (object as LineSegments2).material.color.copy(palette.inner).multiplyScalar(.70);
    }
    if(object.name==='fui-outer-sidewalls'){object.visible=!textured;object.castShadow=false;}
    if(object.name==='fui-glass-continuous-body')object.visible=textured;
    if(object.name==='fui-glass-geographic-bottom'&&object instanceof THREE.Mesh){
      // Restore the sealed dark underside after the entrance opacity fade.
      // A transparent bottom exposes remote back walls when orbiting below it.
      const material=object.material as THREE.MeshPhysicalMaterial;
      material.transparent=material.opacity<.999;
    }
    if(object.name==='fui-legacy-top-glow')object.visible=!textured;
    if(object.userData.fuiWallLift){
      object.visible=textured;
      const lift=object.userData.fuiWallLift as {value:number}|undefined;
      if(lift)lift.value=Math.max(0,object.parent?.position.z??0);
    }
    if(['fui-legacy-region-base','fui-legacy-base-edge','fui-legacy-region-sidewall','fui-legacy-bottom-outline','fui-legacy-hover-highlight'].includes(object.name))object.visible=!textured;
    if(object.name==='fui-glass-internal-wall'&&object instanceof THREE.Mesh){
      const lift=Math.max(0,object.parent?.position.z??0);
      object.visible=textured&&lift>.005;
      const material=object.material as THREE.ShaderMaterial;
      material.uniforms.uLift.value=lift;
      material.uniforms.alpha.value=.9*THREE.MathUtils.smoothstep(lift,0,.3);
    }
    if(object.name==='fui-original-region-boundary')object.visible=!textured;
    if(object.name==='fui-glass-region-edges'){
      object.visible=textured;
      for(const child of object.children){
        const material=(child as LineSegments2).material as LineMaterial;
        const selected=THREE.MathUtils.smoothstep(Math.max(0,object.parent?.position.z??0),0,12);
        if(child.name==='fui-glass-region-edge-halo'){
          child.visible=selected>.001;
          material.color.copy(palette.inner);material.linewidth=3.4;material.opacity=.18*selected*groundVisibility;
        }else{
          child.visible=true;
          material.color.copy(palette.inner).lerp(palette.outer,selected);
          if(object.userData.fuiSmoothBoundary)material.color.multiplyScalar(THREE.MathUtils.lerp(1.25,1,selected));
          material.linewidth=object.userData.fuiSmoothBoundary
            ?THREE.MathUtils.lerp(1.15,1.55,selected)
            :THREE.MathUtils.lerp(1.25,1.75,selected);
        }
      }
    }
    if(object.name==='fui-glass-clear-coat'){
      object.visible=textured&&!hologram;
      object.castShadow=false;
      if(object instanceof THREE.Mesh){
        const material=object.material as THREE.MeshPhysicalMaterial;
        const selected=THREE.MathUtils.smoothstep(Math.max(0,object.parent?.position.z??0),0,12);
        material.opacity=groundVisibility;updateFuiMapGlassGlow(material,props.skin,selected,groundVisibility);
      }
    }
    if(object.name==='fui-original-outer-outline')object.visible=!textured;
    if(object.name==='fui-glass-outer-halo'){
      object.visible=textured;
      if(object instanceof THREE.Mesh){
        const material=object.material as LineMaterial;
        const selected=THREE.MathUtils.smoothstep(Math.max(0,object.parent?.parent?.position.z??0),0,12);
        material.color.copy(palette.inner);material.linewidth=THREE.MathUtils.lerp(3.4,3.8,selected);
        material.opacity=THREE.MathUtils.lerp(.18,.23,selected)*groundVisibility;
      }
    }
    if(object.name==='fui-glass-outer-rim'){
      object.visible=textured;
      if(object instanceof THREE.Mesh){
        const material=object.material as LineMaterial;
        const selected=THREE.MathUtils.smoothstep(Math.max(0,object.parent?.parent?.position.z??0),0,12);
        material.color.copy(getFuiMapOuterContourColor(props.skin,mapPaletteFamily.value));
        material.linewidth=THREE.MathUtils.lerp(1.65,1.85,selected);
      }
    }
    if(object instanceof THREE.Mesh || object instanceof THREE.Line){
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials){
        updateFuiClassicColors(material,classicSkin,Math.max(0,object.parent?.userData.targetZ??0)>0);
        if(material.userData.fuiSide && material instanceof THREE.ShaderMaterial){
          const u=material.uniforms;u.uGlass.value=textured?1:0;
          u.uSelection.value=textured?THREE.MathUtils.smoothstep(u.uLift.value,0,12):0;
          if(textured||customClassic){u.topColor.value.copy(palette.sideTop);u.midColor.value.copy(palette.sideMid);u.bottomColor.value.copy(palette.sideBottom);}
          else if(material.userData.fuiWasGlass!==false||material.userData.fuiWasClassicTheme){u.topColor.value.set(mapTheme.accent);u.midColor.value.set(mapTheme.sideMid);u.bottomColor.value.set(mapTheme.sideBottom);}
          material.userData.fuiWasGlass=textured;
          material.userData.fuiWasClassicTheme=customClassic;
        }
        const role=material.userData.fuiColorRole as keyof typeof palette|undefined;
        if(role && 'color' in material){(material.color as THREE.Color).copy(textured||customClassic?palette[role]:material.userData.fuiLegacyColor);if(textured&&material.userData.fuiTopGlow)(material.color as THREE.Color).multiplyScalar(.30);}
      }
    }
    if(object.name==='legacy-ground-ring')object.visible=props.mapPresentation==='standard';
    if(object.name==='fui-map-ground')updateFuiMapBase(object as THREE.Group,props.skin,props.mapPresentation,Math.max(0,Math.min(time,now-(group.userData.fuiGroundShownAt??now)-.72)),groundVisibility,props.mapWaveEnabled,mapPaletteFamily.value);
    if(object instanceof THREE.Mesh&&object.userData.hologramSurface&&!object.userData.originalSurface){
      const lift=Math.max(0,object.parent?.position.z??0);
      const selected=THREE.MathUtils.smoothstep(lift,0,12);
      const material=object.userData.hologramSurface as THREE.ShaderMaterial;
      material.uniforms.uGlassDepth.value=FUI_MAP_GLASS_LEVELS.top-FUI_MAP_GLASS_LEVELS.bottom+lift;
      updateFuiMapHologramSurface(material,props.skin,selected);
    }
    if(object instanceof THREE.Mesh && object.userData.originalSurface && object.userData.texturedSurface){
      updateFuiClassicColors(object.userData.originalSurface,classicSkin,Math.max(0,object.parent?.userData.targetZ??0)>0);
      const material=object.userData.texturedSurface as THREE.ShaderMaterial;
      const hologramMaterial=object.userData.hologramSurface as THREE.ShaderMaterial|undefined;
      const selected=THREE.MathUtils.smoothstep(Math.max(0,object.parent?.position.z??0),0,12);
      updateFuiMapSurface(material,props.skin,selected);
      if(hologramMaterial)updateFuiMapHologramSurface(hologramMaterial,props.skin,selected);
      object.material=props.mapPresentation==='standard'?object.userData.originalSurface:hologram&&hologramMaterial?hologramMaterial:material;
      object.geometry=props.mapPresentation==='standard'?object.userData.originalGeometry:object.userData.texturedGeometry;
    }
  });
  updateLiftFollowingChase(group,textured);
}
watch(()=>props.mapPresentation,(presentation,previous)=>{
  if(mapGroup?.userData.transitionStart!==undefined){
    settleMapForStaticFrame(mapGroup);loadPhase.value='ready';
    if(renderer)renderer.domElement.style.opacity='1';
    if(controls)controls.enabled=true;
    refreshDrillControl();
  }
  if(props.active&&renderer&&host.value){
    renderer.setPixelRatio(getMapPixelRatio());
    renderer.setSize(Math.max(host.value.clientWidth,1),Math.max(host.value.clientHeight,1),false);
  }
  if(mapGroup)updateMapAppearance(mapGroup,0);
  if((presentation==='standard')!==(previous==='standard'))applyCameraView(resolveInitialCameraView(currentState.scope));
});
watch(()=>props.skin,()=>{if(mapGroup)updateMapAppearance(mapGroup,Math.max(0,performance.now()/1000-mapPulseEpoch));});
watch(hologramSurfaceActive,()=>queueSurfaceFamilyRefresh());
watch(()=>props.active,(active)=>{if(active)mapPulseEpoch=performance.now()/1000;});
watch(()=>props.quality,()=>{resize();if(mapGroup)updateMapAppearance(mapGroup,Math.max(0,performance.now()/1000-mapPulseEpoch));});
watch(()=>props.mapWaveEnabled,()=>{if(mapGroup)updateMapAppearance(mapGroup,Math.max(0,performance.now()/1000-mapPulseEpoch));});

function startMapAnimation() {
  if (raf || !props.active || document.hidden) return;
  raf = requestAnimationFrame(animate);
}

function stopMapAnimation() {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
}

function animate() {
  raf = 0;
  if (!props.active || !hasEmittedReady || document.hidden) return;
  const t = performance.now() / 1000;
  if (mapGroup) {
    applyGroupTransition(mapGroup, t);
    if (!mapGroup.userData.transitionStart) {
      const basePosition = mapGroup.userData.basePosition as THREE.Vector3 | undefined;
      if (basePosition) {
        mapGroup.position.x = basePosition.x;
        mapGroup.position.y = basePosition.y;
        mapGroup.position.z = basePosition.z + Math.sin(t * 0.55) * 2;
      }
    }
  }
  if (ringDecorGroup) {
    ringDecorGroup.rotation.z += 0.004;
  }
  updateProvinceChaseLight(t);
  flyLineMaterials.forEach((material) => {
    material.uniforms.uTime.value = t;
  });
  featureLiftGroups.forEach((groups) => {
    groups.forEach((group) => {
      group.position.z += ((group.userData.targetZ ?? 0) - group.position.z) * 0.16;
    });
  });
  featureHighlightMaterials.forEach((materials) => {
    materials.forEach((material) => {
      material.opacity += ((material.userData.targetOpacity ?? 0) - material.opacity) * 0.18;
    });
  });
  // Sync material visibility, anchored walls and contour AFTER this frame's lift.
  if(mapGroup)updateMapAppearance(mapGroup,t-mapPulseEpoch);
  if (scene && camera) {
    controls?.update();
    updateCameraResponsiveOverlays();
    if(renderer)renderMapFrame(renderer,scene,camera);
    labelRenderer?.render(scene, camera);
    disposeRetiredMapGroups();
  }
  if (props.active) raf = requestAnimationFrame(animate);
}

function resize() {
  if (!host.value || !camera || !renderer || !labelRenderer) return;
  const { width, height } = getHostSize();
  if(mapGroup)syncMapReflectionBudget(mapGroup);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const pixelRatio=getMapPixelRatio(revealPrepared||revealWarming);
  if(renderer.getPixelRatio()!==pixelRatio)renderer.setPixelRatio(pixelRatio);
  // Re-showing a prepared renderer must preserve its complete drawing buffer.
  // WebGLRenderer.setSize assigns canvas.width/height even at the same size.
  const canvasSize=renderer.getSize(new THREE.Vector2());
  if(canvasSize.x!==width||canvasSize.y!==height)renderer.setSize(width,height);
  else{
    renderer.domElement.style.width=`${width}px`;renderer.domElement.style.height=`${height}px`;
  }
  const labelSize=labelRenderer.getSize();
  if(labelSize.width!==width||labelSize.height!==height)labelRenderer.setSize(width,height);
  mapGroup?.traverse(object=>{
    if(object instanceof THREE.Mesh&&object.material instanceof LineMaterial)object.material.resolution.set(width,height);
    if(object.name==='fui-map-live-reflection')resizeFuiMapReflection(object,width,height,pixelRatio,props.quality);
  });
  updateCameraResponsiveOverlays();
  if (!hasUserAdjustedCamera) {
    applyCameraView(resolveBuiltInCameraView(currentState.scope));
  }
  if(revealCentered&&mapGroup&&mapGroup.userData.transitionStart===undefined)centerCurrentMapForReveal();
}

function getMapPixelRatio(forReveal=revealPrepared||revealWarming){
  const budget=browserMapQualityBudget(props.quality);
  return Math.min(window.devicePixelRatio,(props.active||forReveal)?(props.mapPresentation==='standard'?Math.min(1.5,budget.maxPixelRatio):budget.maxPixelRatio):1);
}

function getHostSize() {
  const rect = host.value?.getBoundingClientRect();
  // CSS transforms are used during the Earth -> China handoff. clientWidth/clientHeight
  // preserve the real layout size, while getBoundingClientRect() reports the temporary
  // 0.78-scale visual size and leaves the WebGL canvas undersized after the handoff.
  const width = Math.max(1, Math.round(host.value?.clientWidth || revealViewport?.width || rect?.width || 1920));
  const height = Math.max(1, Math.round(host.value?.clientHeight || revealViewport?.height || rect?.height || 1080));
  return { width, height };
}

function releaseMapOnPageHide(event:PageTransitionEvent){
  if(event.persisted)return;
  componentDisposed=true;
  revealVersion+=1;nativeGeometryController?.abort();nativeGeometryController=undefined;
  mapBuildVersion+=1;rendererWarmupVersion+=1;stopMapAnimation();
  renderer?.forceContextLoss();
  void rendererJobs.dispose(()=>{releaseGlassHdrPass();renderer?.dispose();renderer=undefined;});
}

onMounted(() => {
  void setup().catch(error=>{if(!componentDisposed){loadPhase.value='error';emit('loading','error');console.error('Map initialization failed',error);}});
  document.addEventListener('visibilitychange',onPageVisibility);
  onPageVisibility();
  window.addEventListener('resize', resize);
  window.addEventListener('pagehide',releaseMapOnPageHide);
  if (host.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host.value);
  }
});

onBeforeUnmount(() => {
  componentDisposed=true;
  revealVersion+=1;nativeGeometryController?.abort();nativeGeometryController=undefined;
  window.removeEventListener('pagehide',releaseMapOnPageHide);
  mapBuildVersion+=1;
  document.removeEventListener('visibilitychange',onPageVisibility);
  releaseVisibilityWait?.();
  rendererWarmupVersion += 1;
  if (resolutionUpgradeHandle !== undefined) globalThis.clearTimeout(resolutionUpgradeHandle);
  stopMapAnimation();
  window.removeEventListener('resize', resize);
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  host.value?.removeEventListener('pointermove', onPointerMove);
  host.value?.removeEventListener('pointerdown', onPointerDown);
  host.value?.removeEventListener('pointerleave', onPointerLeave);
  controls?.removeEventListener('change', updateCameraResponsiveOverlays);
  controls?.dispose();
  renderer?.domElement.remove();labelRenderer?.domElement.remove();
  // Cancel retired GPU work now; defer program-object destruction until the
  // lost-context completion queries in compileAsync have finished polling.
  renderer?.forceContextLoss();
  void rendererJobs.dispose(()=>{
    disposeRetiredMapGroups();if(mapGroup)disposeObject3DNow(mapGroup);
    disposeFuiMapReliefCache();glassEnvironment?.dispose();glassEnvironment=undefined;
    releaseGlassHdrPass();
    renderer?.dispose();renderer=undefined;scene=undefined;
  });
});
</script>

<style scoped>
.terrain-status{position:absolute;bottom:20px;left:26px;z-index:8;color:#9caeba;font-size:12px;pointer-events:none}
.terrain-status.map-load-status{top:auto}
.map-status-accessible{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.map-stage {
  position: absolute;
  inset: 0;
  z-index: 6;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.map-host {
  position: absolute;
  inset: 0;
  z-index: 6;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  pointer-events: auto;
  filter: var(--map-stage-filter, drop-shadow(0 0 18px var(--map-stage-shadow)));
  animation: mapStageIn 920ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
}

.map-host[data-map-presentation^="textured-"] {
  animation: none;
}
.map-host[data-has-frame="false"] :is(canvas,.map-label-layer,.map-drill-control){visibility:hidden}
.map-load-status{position:absolute;left:26px;top:26px;z-index:9;display:flex;align-items:center;gap:9px;color:var(--map-accent-soft);font:12px/1.5 system-ui;pointer-events:none}
.map-load-status i{width:12px;height:12px;border:1px solid currentColor;border-right-color:transparent;border-radius:50%;animation:map-loading-spin 1s linear infinite}
@keyframes map-loading-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.map-load-status i{animation:none}}

.south-sea-inset {
  position: absolute;
  right: 23%;
  bottom: 7.5%;
  z-index: 8;
  width: 78px;
  min-width: 62px;
  max-width: 92px;
  height: auto;
  overflow: visible;
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scale(0.96);
  transform-origin: 50% 100%;
  transition:
    opacity 460ms ease 150ms,
    transform 560ms cubic-bezier(0.16, 1, 0.3, 1) 150ms;
}

.south-sea-inset.is-visible {
  opacity: 0.9;
  transform: translateY(0) scale(1);
}

.south-sea-inset :is(path,rect) {
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
}
.south-sea-inset__background { fill: #071019; fill-opacity: .94; }
.south-sea-inset__frame {
  fill: none;
  stroke: var(--map-accent-soft);
  stroke-width: .7;
  opacity: .56;
}
.south-sea-inset__context {
  fill: #51616e;
  fill-opacity: .14;
  stroke: #8396a2;
  stroke-width: .45;
  stroke-opacity: .43;
}
.south-sea-inset__land {
  fill: var(--map-accent);
  fill-opacity: .13;
  stroke: var(--map-accent-soft);
  stroke-width: .55;
  stroke-opacity: .72;
}
.south-sea-inset__islet {
  fill: var(--map-accent);
  stroke: var(--map-accent);
  stroke-width: .65;
  opacity: .88;
}
.south-sea-inset__segment {
  fill: var(--map-accent-soft);
  stroke: var(--map-accent-soft);
  stroke-width: 1.05;
  opacity: .96;
}
.south-sea-inset__divider {
  fill: none;
  stroke: var(--map-accent-soft);
  stroke-width: .55;
  opacity: .3;
}
.south-sea-inset__title {
  fill: var(--map-accent-soft);
  font: 500 var(--south-sea-caption-size, 8.5px) "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 1.2px;
}

.map-host :deep(canvas),
.map-host :deep(.map-label-layer) {
  position: absolute;
  inset: 0;
}

.map-host :deep(.map-label-layer) {
  pointer-events: none;
}

.map-host :deep(.map-drill-control) {
  position: absolute;
  left: 50%;
  top: 176px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  transform: translateX(-50%);
  color: var(--map-drill-text-alpha);
  font-size: 14px;
  line-height: 1;
  text-shadow: 0 0 10px var(--map-drill-glow);
  pointer-events: auto;
}

.map-host :deep(.map-drill-control button) {
  height: 26px;
  border: 1px solid var(--map-drill-border);
  border-radius: 2px;
  padding: 0 12px;
  background: var(--map-drill-background);
  color: var(--map-drill-text);
  font: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 14px var(--map-drill-box-inner), 0 0 12px var(--map-drill-box-outer);
}

.map-host :deep(.map-drill-control button:disabled) {
  opacity: 0.35;
  cursor: default;
}

.map-host :deep(.city-label-anchor) {
  position: relative;
  width: 0;
  height: 0;
}

.map-host :deep(.city-label) {
  position: absolute;
  left: 0;
  bottom: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--map-label-width, 51px);
  height: var(--map-label-height, 30.8px);
  padding:
    0
    var(--map-label-padding-x, 3.8px)
    var(--map-label-padding-bottom, 8.3px);
  background-image: var(--map-label-background-image);
  background-repeat: no-repeat;
  background-size: 100% 100%;
  color: var(--map-label-text);
  font-size: var(--map-label-font-size, 8.7px);
  line-height: var(--map-label-line-height, 12.2px);
  font-weight: 700;
  letter-spacing: 0;
  text-shadow: 0 0 8px var(--map-label-text-glow);
  opacity: 0.86;
  transform-origin: center bottom;
  transform: translateX(-50%);
  transition: width 180ms ease, height 180ms ease, padding 180ms ease, font-size 180ms ease, opacity 180ms ease;
  white-space: nowrap;
}

.map-host :deep(.city-ripple) {
  position: absolute;
  left: 0;
  top: 4px;
  width: 63px;
  height: 25px;
  border: 1px solid var(--map-ripple-border);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, var(--map-ripple-center), var(--map-ripple-middle) 55%, transparent 72%);
  box-shadow: 0 0 12px var(--map-ripple-glow);
  transform: translate(-50%, -50%);
  animation: jinhua-ripple 9s ease-out infinite;
  pointer-events: none;
}

.map-host :deep(.city-ripple.delay) {
  animation-delay: 4.5s;
}

.map-host :deep(.city-label.is-selected) {
  width: var(--map-label-selected-width, 60.2px);
  height: var(--map-label-selected-height, 36.3px);
  padding:
    0
    var(--map-label-selected-padding-x, 4.4px)
    var(--map-label-selected-padding-bottom, 9.7px);
  font-size: var(--map-label-selected-font-size, 10.3px);
  line-height: var(--map-label-selected-line-height, 14.4px);
  opacity: 1;
}

.map-host :deep(.city-label span) {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
}

@keyframes jinhua-ripple {
  0% {
    opacity: 0.55;
    transform: translate(-50%, -50%) scale(0.6);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.35);
  }
}

@keyframes mapStageInCrisp {
  from { opacity: 0; transform: translateY(28px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes mapStageIn {
  from {
    opacity: 0;
    transform: translateY(28px) scale(0.96);
    filter: blur(7px) drop-shadow(0 0 0 transparent);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: var(--map-stage-filter, blur(0) drop-shadow(0 0 18px var(--map-stage-shadow)));
  }
}

</style>
