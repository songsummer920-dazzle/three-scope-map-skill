<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="vector-map-stage" :class="{ 'is-active': props.active }" :style="mapStageStyle" :data-theme-accent="palette.administrativeFill" :data-theme-water="palette.water" :data-composition="props.overlay?'overlay':'single'" :data-overlay-surface="props.overlay?props.overlaySurface:undefined" :aria-hidden="!props.active" :inert="!props.active">
    <div ref="host" class="vector-map-host" />
    <div class="vector-map-drill-control" :aria-busy="loading">
      <button type="button" :disabled="currentPath.length <= 1 || loading" @click="goBack">
        返回上级
      </button>
      <span>{{ renderedScopeLabel }} / {{ renderedItem.regionName }}</span>
      <span v-if="loading" class="vector-map-status" role="status" aria-live="polite">
        <i aria-hidden="true" />
        <span v-if="loadingTarget && loadingTarget.code !== renderedItem.code" class="vector-map-pending-target" aria-hidden="true">→ {{ loadingTarget.regionName }}</span>
        <span class="vector-map-status-label">{{ loadingTarget ? `正在进入${loadingTarget.regionName}` : '正在准备地图' }}</span>
      </span>
    </div>
    <div v-if="errorMessage" class="vector-map-error" role="alert">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as maplibregl from 'maplibre-gl';
import type { ErrorEvent as MapErrorEvent, GeoJSONSource, MapLayerMouseEvent, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from './maplibreWorker.ts?worker&url';
import { Protocol } from 'pmtiles';
import type { GeoJSON as GeoJSONValue } from 'geojson';
import type { GeoFeature, GeoFeatureCollection, Position } from '../../types/geo';
import { loadMapLevel, prefetchMapLevel } from './mapDataAdapter';
import {
  initialMapNavigationPath,
  mapNavigationKey,
  mapScopeLabel,
  nextMapScope,
  type MapNavigationItem,
  type MapNavigationPath,
} from './mapNavigation';
import { mapThemeStyle } from './mapTheme';
import { getVectorMapConfig, createVectorMapPalette, type VectorMapPalette } from './vectorMapConfig';
import {VectorMap3dLayer,type OverlayDiagnostics,type OverlaySurface} from './vectorMap3dLayer';
import {resolveFuiEarthThemeId,type FuiEarthSkinId} from './fuiEarthTheme';
import {browserMapQualityBudget,type MapQuality} from './mapQuality';
import {FUI_MAP_ENTRANCE_DURATION} from './fuiMapEntrance';
import {
  createProviderRequestTransform,
  createVectorMapStyle,
  hydrateVectorStyle,
  projectGeoDataForProvider,
} from './vectorMapProvider';
import { compileVectorMapTheme, createVectorMapControlStyle, type VectorMapThemeReport } from './vectorMapTheme';
import {
  createVectorMapDiagnostics,
  publishVectorMapDiagnostics,
} from './vectorMapDiagnostics';

const props = withDefaults(defineProps<{
  active?: boolean;
  navigation?: MapNavigationPath;
  palette?: Partial<VectorMapPalette>;
  primaryColor?:string;
  overlay?:boolean;
  overlaySurface?:OverlaySurface;
  overlaySkin?:FuiEarthSkinId;
  quality?:MapQuality;
  autoEntrance?:boolean;
}>(), {
  active: false,
  navigation: () => [...initialMapNavigationPath],
  overlay:false,
  overlaySurface:'smooth-glass',
  quality:'balanced',
  autoEntrance:false,
});

const emit = defineEmits<{
  ready: [];
  'navigation-change': [path: MapNavigationPath];
}>();

const host = ref<HTMLDivElement>();
const currentPath = ref<MapNavigationPath>([...props.navigation]);
const renderedItem=ref<MapNavigationItem>({... (currentPath.value[currentPath.value.length-1]??initialMapNavigationPath[0])});
const loading = ref(true);
const loadingTarget=ref<MapNavigationItem>();
const errorMessage = ref('');
const config = getVectorMapConfig();
const mapPixelRatio=()=>Math.min(window.devicePixelRatio||1,Math.max(1,config.maxPixelRatio),browserMapQualityBudget(props.quality).quality==='low'?1:Infinity);
const palette=computed(()=>({...config.palette,...(props.primaryColor?createVectorMapPalette(props.primaryColor):{}),...props.palette}));
const overlayThemeId=computed(()=>props.overlaySkin??resolveFuiEarthThemeId('glacier',props.primaryColor??palette.value.administrativeFill));
const mapStageStyle = computed(() => ({
  ...mapThemeStyle,
  ...createVectorMapControlStyle(palette.value),
  '--vector-map-control-top': config.controls.top,
  '--vector-map-control-right': config.controls.right,
  '--vector-map-control-bottom': config.controls.bottom,
}));
const currentItem = computed(() => (
  currentPath.value[currentPath.value.length - 1] ?? initialMapNavigationPath[0]
));
const renderedScopeLabel = computed(() => mapScopeLabel[renderedItem.value.scope]);
const diagnostics = createVectorMapDiagnostics(
  config.provider.id,
  config.provider.basemap.type,
  config.theme.mode,
  config.provider.coordinateSystem,
);
let map: maplibregl.Map | undefined;
let mapLoaded = false;
let currentGeoData: GeoFeatureCollection | undefined;
let hoveredFeatureName = '';
let navigationVersion = 0;
let requestedNavigationKey=mapNavigationKey(currentPath.value);
let protocol: Protocol | undefined;
let cameraInitialized = false;
let readyEmitted = false;
let basemapReady=false;
let overlayLayer:VectorMap3dLayer|undefined;
let disposed=false;
let overlayProjection:ReturnType<maplibregl.Map['getProjection']>|undefined;
let overlayLayerOrder:string[]|undefined;
let revealPreparation:Promise<boolean>|undefined;
let revealController:AbortController|undefined;
let revealVersion=0;
let lastRevealPreparedAt=0;
let lastRevealKey='';
let lastRevealOverlay=false;
let lastRevealFrames=0;
type EntranceCamera={center:[number,number];zoom:number;bearing:number;pitch:number};
let entranceCamera:EntranceCamera|undefined;
let lastEntranceTarget:EntranceCamera|undefined;
let entrancePhase:'idle'|'armed'|'playing'|'done'|'cancelled'='idle';
let entranceStartedAt=0,entranceEndedAt=0,entrancePlays=0;
let entranceFinish:(()=>void)|undefined;
let attributionTimer:ReturnType<typeof setTimeout>|undefined;
let attributionVisibilityProbe:ReturnType<typeof setTimeout>|undefined;
let attributionVisibilityRetries=0;
let attributionVisibleElapsed=0,attributionVisibleSince=0,attributionCollapsed=false;
let attributionManual=false;
let attributionSummary:HTMLElement|undefined;
type OverlayNavigationWait = {
  version:number;
  key:string;
  source?:OverlayDiagnostics;
  minimumFrame:number;
  errorSignature:string;
  timer:ReturnType<typeof setTimeout>;
  finish:(drawn:boolean,error?:Error)=>void;
};
let overlayNavigationWait:OverlayNavigationWait|undefined;
let hoverPrefetchTimer:ReturnType<typeof setTimeout>|undefined;
let hoverPrefetchKey='';
let themeReport: VectorMapThemeReport = {
  roleCounts: {},
  roadLayerCount: 0,
  labelLayerCount: 0,
};

const regionSourceId = 'current-administrative-region';
const regionFillLayerId = 'current-administrative-region-fill';
const regionHoverLayerId = 'current-administrative-region-hover';
const regionLineLayerId = 'current-administrative-region-line';

function featureName(feature?: GeoFeature) {
  return String(feature?.properties?.fullname ?? feature?.properties?.name ?? '');
}

function featureCode(feature?: GeoFeature) {
  return String(feature?.properties?.adcode ?? feature?.properties?.code ?? feature?.properties?.id ?? '');
}

function visibleGeoData(geoData: GeoFeatureCollection): GeoFeatureCollection {
  const visible = {
    ...geoData,
    features: geoData.features.filter((feature) => {
      const code = featureCode(feature);
      return featureName(feature) !== '' && !code.endsWith('_JD');
    }),
  };
  return projectGeoDataForProvider(visible, config.provider.coordinateSystem);
}

function regionLayers(): StyleSpecification['layers'] {
  return [
    {
      id: regionFillLayerId,
      type: 'fill',
      source: regionSourceId,
      paint: {
        'fill-color': palette.value.administrativeFill,
        'fill-opacity': 0.035,
      },
    },
    {
      id: regionHoverLayerId,
      type: 'fill',
      source: regionSourceId,
      filter: ['==', ['get', 'name'], ''],
      paint: {
        'fill-color': palette.value.administrativeFill,
        'fill-opacity': 0.12,
      },
    },
    {
      id: regionLineLayerId,
      type: 'line',
      source: regionSourceId,
      paint: {
        'line-color': palette.value.administrativeLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.35, 10, 2.15],
        'line-opacity': 0.86,
      },
    },
  ];
}

function styleWithInitialRegion(
  style: string | StyleSpecification,
  geoData?: GeoFeatureCollection,
): string | StyleSpecification {
  if (typeof style === 'string' || !geoData) return style;
  return {
    ...style,
    sources: {
      ...style.sources,
      [regionSourceId]: {
        type: 'geojson',
        data: visibleGeoData(geoData) as GeoJSONValue,
        generateId: true,
      },
    },
    layers: [...style.layers, ...regionLayers()],
  };
}

function visitPositions(value: unknown, visitor: (position: Position) => void) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    visitor([value[0], value[1]]);
    return;
  }
  value.forEach((item) => visitPositions(item, visitor));
}

function fitGeoData(geoData: GeoFeatureCollection, animate = true) {
  if (!map || !mapLoaded) return;
  const bounds = new maplibregl.LngLatBounds();
  // Frame China's mainland/Hainan/Taiwan for the national 3D overview.
  // Southern islands remain real geometry in the same geographic scene;
  // they do not force the country's raised volume into a tiny central patch.
  const mainlandOverview=props.overlay&&currentItem.value.scope==='country'&&currentItem.value.code==='100000';
  visibleGeoData(geoData).features.forEach((feature) => {
    visitPositions(feature.geometry.coordinates, (position) => {
      if(!mainlandOverview||position[1]>=18)bounds.extend(position);
    });
  });
  if (bounds.isEmpty()) return;
  const pitch = cameraInitialized ? map.getPitch() : props.overlay ? 50 : 36;
  const bearing = cameraInitialized ? map.getBearing() : -10;
  const width=host.value?.clientWidth??1280,height=host.value?.clientHeight??720;
  map.fitBounds(bounds, {
    padding: props.overlay
      ? { top: Math.min(80,height*.10), right: Math.min(100,width*.07), bottom: Math.min(90,height*.12), left: Math.min(100,width*.07) }
      : { top: Math.min(110,height*.16), right: Math.min(180,width*.12), bottom: Math.min(90,height*.12), left: Math.min(180,width*.12) },
    duration: animate && props.active ? 680 : 0,
    maxZoom: currentItem.value.scope === 'district' ? 11.5 : 9.5,
    pitch,
    bearing,
  });
  cameraInitialized = true;
}

function ensureRegionLayers(animate = true, fit = true) {
  if (!map || !mapLoaded || !currentGeoData) return;
  const data = visibleGeoData(currentGeoData);
  const source = map.getSource(regionSourceId) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data as GeoJSONValue);
  } else {
    map.addSource(regionSourceId, { type: 'geojson', data: data as GeoJSONValue, generateId: true });
    regionLayers().forEach((layer) => map?.addLayer(layer));
  }
  syncOverlay();
  if(fit)fitGeoData(currentGeoData, animate);
}

function cancelHoverPrefetch(){
  if(hoverPrefetchTimer!==undefined)clearTimeout(hoverPrefetchTimer);
  hoverPrefetchTimer=undefined;hoverPrefetchKey='';
}
function scheduleHoverPrefetch(feature?:GeoFeature){
  const scope=nextMapScope(currentItem.value.scope),code=featureCode(feature);
  const key=scope&&code?`${scope}:${code}`:'';
  if(key===hoverPrefetchKey)return;
  cancelHoverPrefetch();
  if(!scope||!code||!props.active||loading.value)return;
  hoverPrefetchKey=key;
  const version=navigationVersion;
  // An intentional hover warms only the administrative JSON cache. DEM and
  // GPU work begin after navigation, so moving across the map stays cheap.
  hoverPrefetchTimer=setTimeout(()=>{
    hoverPrefetchTimer=undefined;
    if(!disposed&&props.active&&version===navigationVersion)prefetchMapLevel(scope,code);
  },120);
}
function waitForOverlayNavigation(version:number,key:string){
  overlayNavigationWait?.finish(false);
  return new Promise<boolean>((resolve,reject)=>{
    const source=overlayLayer?.diagnostics;
    const waiter:OverlayNavigationWait={version,key,source,minimumFrame:(source?.renderFrames??0)+1,errorSignature:JSON.stringify(source?.errors??[]),
      timer:setTimeout(()=>waiter.finish(false,new Error('三维地图准备超时，请重试')),30000),
      finish:(drawn,error)=>{
        if(overlayNavigationWait!==waiter)return;
        clearTimeout(waiter.timer);overlayNavigationWait=undefined;
        if(error)reject(error);else resolve(drawn);
      },
    };
    overlayNavigationWait=waiter;
  });
}
function settleOverlayNavigation(snapshot:OverlayDiagnostics){
  const waiter=overlayNavigationWait;
  if(!waiter)return;
  if(disposed||waiter.version!==navigationVersion){waiter.finish(false);return;}
  const source=overlayLayer?.diagnostics;
  // Switching between classic and native materials replaces the internal
  // renderer and starts its frame counter over on this same custom layer.
  if(source!==waiter.source){waiter.source=source;waiter.minimumFrame=1;waiter.errorSignature='[]';}
  if(snapshot.buildPhase==='error'||(snapshot.errors.length&&JSON.stringify(snapshot.errors)!==waiter.errorSignature)){
    waiter.finish(false,new Error(snapshot.errors.at(-1)??'三维地图构建失败'));return;
  }
  if(snapshot.navigationKey===waiter.key&&!snapshot.pendingNavigationKey
    &&(snapshot.buildPhase===undefined||snapshot.buildPhase==='ready')
    &&snapshot.renderFrames>=waiter.minimumFrame){waiter.finish(true);return;}
  waiter.minimumFrame=Math.max(waiter.minimumFrame,snapshot.renderFrames+1);
}
function syncPendingOverlayNavigation(){
  const waiter=overlayNavigationWait,overlay=overlayLayer?.diagnostics;
  if(waiter&&overlay&&currentGeoData&&overlay.navigationKey!==waiter.key&&overlay.pendingNavigationKey!==waiter.key)
    overlayLayer?.setData(currentGeoData,waiter.key);
}
function publishOverlay(diagnostics:OverlayDiagnostics){
  if(disposed)return;
  if(props.overlay&&diagnostics.errors.length)errorMessage.value=`三维叠加失败：${diagnostics.errors[diagnostics.errors.length-1]}`;
  const snapshot={...diagnostics,viewport:map?{width:map.getCanvas().clientWidth,height:map.getCanvas().clientHeight}:undefined};
  (window as unknown as {__SUMMER_MAP_OVERLAY_DIAGNOSTICS__?:unknown}).__SUMMER_MAP_OVERLAY_DIAGNOSTICS__=snapshot;
  host.value?.setAttribute('data-overlay-diagnostics',JSON.stringify(snapshot));
  settleOverlayNavigation(diagnostics);
  emitReadyWhenDrawn();
}
function emitReadyWhenDrawn(){
  if(readyEmitted||!basemapReady)return;
  const overlay=overlayLayer?.diagnostics;
  if(props.overlay&&(!overlay||overlay.renderFrames<1||(overlay.buildPhase!==undefined&&overlay.buildPhase!=='ready')))return;
  readyEmitted=true;emit('ready');
  // Parents remove their loading cover after this draw. Present one frame
  // after that DOM update, even when the geographic scene has already settled.
  const revealedMap=map;
  void nextTick().then(()=>requestAnimationFrame(()=>{
    if(!disposed&&map===revealedMap&&props.active)map?.triggerRepaint();
  }));
}
function syncOverlay(){
  if(!map||!mapLoaded||!currentGeoData)return;
  if(!props.overlay){
    if(overlayLayer&&map.getLayer(overlayLayer.id))map.removeLayer(overlayLayer.id);
    overlayLayer=undefined;
    if(overlayLayerOrder){for(const id of overlayLayerOrder)if(map.getLayer(id))map.moveLayer(id);overlayLayerOrder=undefined;}
    if(overlayProjection){const previous=overlayProjection;overlayProjection=undefined;map.setProjection(previous);}
    if(errorMessage.value.startsWith('三维叠加失败：'))errorMessage.value='';
  }else if(!overlayLayer||!map.getLayer(overlayLayer.id)){
    // A style may omit projection: MapLibre 6 then returns undefined despite
    // its public return type, and the actual projection defaults to Mercator.
    const projection=map.getProjection()??{type:'mercator' as const};
    if(!overlayProjection)overlayProjection=structuredClone(projection);
    if(projection.type!=='mercator')map.setProjection({type:'mercator'});
    // The 3D builder separates JD maritime geometry from administrative fills.
    // Keep the raw features here; the 2D-only visibility filter removes JD.
    overlayLayer=new VectorMap3dLayer(currentGeoData,palette.value,props.overlaySurface,publishOverlay,overlayThemeId.value,props.quality);
    overlayLayer.diagnostics.navigationKey=mapNavigationKey(currentPath.value);
    // Keep provider label layers above the geographic volume. Roads, water
    // and land remain in the same style/framebuffer underneath its clear face.
    const providerLayers=map.getStyle().layers;
    overlayLayerOrder=providerLayers.map(layer=>layer.id);
    map.addLayer(overlayLayer);
    // Some provider styles interleave labels and ordinary boundary lines.
    // Keep all ordinary geometry below the native glass; raise only symbols
    // above it, preserving symbol order. Restore the original order in 2D.
    for(const layer of providerLayers)if(layer.type==='symbol')map.moveLayer(layer.id);
    overlayLayer.setActive(props.active);
  }else{
    overlayLayer.setData(currentGeoData,mapNavigationKey(currentPath.value));
    overlayLayer.setStyle(palette.value,props.overlaySurface,overlayThemeId.value);overlayLayer.setActive(props.active);
  }
  for(const id of [regionFillLayerId,regionHoverLayerId,regionLineLayerId])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',props.overlay?'none':'visible');
  if(!props.overlay){hoveredFeatureName='';map.getCanvas().style.cursor='';}
  // A hidden destination owns only the requested preparation frame. It must
  // build the actual requested composition before the parent reveals it.
  if(revealPreparation)overlayLayer?.requestPreparationFrame();
}

async function syncNavigation(path: MapNavigationPath, emitChange = false) {
  const item = path[path.length - 1];
  if (!item) return;
  cancelEntrance(true);
  const version = ++navigationVersion;
  requestedNavigationKey=mapNavigationKey(path);
  overlayNavigationWait?.finish(false);
  cancelHoverPrefetch();
  loading.value = true;
  loadingTarget.value={...item};
  errorMessage.value = '';
  try {
    const geoData = await loadMapLevel(item.scope, item.code);
    if (version !== navigationVersion||disposed) return;
    currentPath.value = path.map((entry) => ({ ...entry }));
    currentGeoData = geoData;
    publishVectorMapDiagnostics(diagnostics, {
      navigationKey: mapNavigationKey(currentPath.value),
    });
    // Keep the previous camera until the new geographic volume has actually
    // drawn. Starting its flight while only the previous model is available
    // zooms the country texture into the next province for several frames.
    const waitForDraw=props.overlay&&mapLoaded&&Boolean(overlayLayer?.diagnostics.renderFrames);
    const overlayDrawn=waitForDraw?waitForOverlayNavigation(version,mapNavigationKey(currentPath.value)):undefined;
    ensureRegionLayers(true,!waitForDraw);
    if(overlayDrawn){
      if(!await overlayDrawn||version!==navigationVersion||disposed)return;
      fitGeoData(geoData);
    }
    renderedItem.value={...item};
    if (emitChange) emit('navigation-change', [...currentPath.value]);
  } catch (error) {
    if(version!==navigationVersion||disposed)return;
    overlayNavigationWait?.finish(false);
    errorMessage.value = error instanceof Error ? `地图数据加载失败：${error.message}` : '地图数据加载失败';
    publishVectorMapDiagnostics(diagnostics, {
      phase: 'error',
      errors: [...diagnostics.errors, errorMessage.value].slice(-20),
    });
  } finally {
    if (version === navigationVersion && mapLoaded){loading.value = false;loadingTarget.value=undefined;}
  }
}

async function drillToFeature(feature: GeoFeature) {
  const scope = nextMapScope(currentItem.value.scope);
  const code = featureCode(feature);
  if (!scope || !code || loading.value) return;
  await syncNavigation([
    ...currentPath.value,
    { scope, code, regionName: featureName(feature) || code },
  ], true);
}

function goBack() {
  if (currentPath.value.length <= 1 || loading.value) return;
  void syncNavigation(currentPath.value.slice(0, -1), true);
}

function onRegionMove(event: MapLayerMouseEvent) {
  if (!map||props.overlay) return;
  scheduleHoverPrefetch(event.features?.[0] as unknown as GeoFeature|undefined);
  const nextName = String(event.features?.[0]?.properties?.name ?? '');
  if (nextName === hoveredFeatureName) return;
  hoveredFeatureName = nextName;
  map.setFilter(regionHoverLayerId, ['==', ['get', 'name'], hoveredFeatureName]);
  map.getCanvas().style.cursor = nextMapScope(currentItem.value.scope) && nextName ? 'pointer' : '';
}

function onRegionLeave() {
  cancelHoverPrefetch();
  if (!map||props.overlay) return;
  hoveredFeatureName = '';
  map.setFilter(regionHoverLayerId, ['==', ['get', 'name'], '']);
  map.getCanvas().style.cursor = '';
}

function onRegionClick(event: MapLayerMouseEvent) {
  if(props.overlay)return;
  const rawFeature = event.features?.[0];
  if (!rawFeature) return;
  void drillToFeature(rawFeature as unknown as GeoFeature);
}
function onOverlayMove(event:MapMouseEvent){
  if(!props.overlay||!overlayLayer||!map||loading.value)return;
  // Dragging/easing already owns the camera. Defer fine terrain raycasts
  // until it settles instead of adding picking work to every moving frame.
  if(map.isMoving()){cancelHoverPrefetch();overlayLayer.setHovered('');map.getCanvas().style.cursor='';return;}
  const feature=overlayLayer.pick(event.point);
  scheduleHoverPrefetch(feature);
  const key=feature?featureCode(feature)||featureName(feature):'';
  overlayLayer.setHovered(key);map.getCanvas().style.cursor=feature&&nextMapScope(currentItem.value.scope)?'pointer':'';
}
function onOverlayLeave(){if(props.overlay){cancelHoverPrefetch();overlayLayer?.setHovered('');if(map)map.getCanvas().style.cursor='';}}
function onOverlayClick(event:MapMouseEvent){
  if(!props.overlay||!overlayLayer||!map||loading.value||map.isMoving())return;
  const feature=overlayLayer.pick(event.point);if(feature)void drillToFeature(feature);
}

function updateCameraDiagnostics() {
  if (!map) return;
  publishVectorMapDiagnostics(diagnostics, {
    camera: {
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    },
  });
}

function updateSourceDiagnostics() {
  if (!map) return;
  const style = map.getStyle();
  const sourceIds = Object.keys(style.sources ?? {})
    .filter((sourceId) => sourceId !== regionSourceId);
  const sourceStates = Object.fromEntries(sourceIds.map((sourceId) => {
    try {
      return [sourceId, map?.isSourceLoaded(sourceId) ?? false];
    } catch {
      return [sourceId, false];
    }
  }));
  publishVectorMapDiagnostics(diagnostics, {
    sourceStates,
    basemapSourceLoaded: sourceIds.length > 0 && Object.values(sourceStates).every(Boolean),
  });
}

async function setupMap() {
  if (!host.value||disposed) return;
  // Administrative data and provider style hydration are independent I/O.
  // Join them before construction so neither leaves the other waiting.
  const [,hydratedStyle]=await Promise.all([
    syncNavigation(currentPath.value),
    (async()=>hydrateVectorStyle(await createVectorMapStyle(config.provider,palette.value),config.provider))(),
  ]);
  if (!host.value||disposed) return;
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  let resolvedStyle = hydratedStyle.style;
  if (typeof resolvedStyle !== 'string') {
    const themed = compileVectorMapTheme(
      resolvedStyle,
      palette.value,
      config.theme,
      config.provider.layerRoleHints,
    );
    resolvedStyle = themed.style;
    themeReport = themed.report;
  }
  publishVectorMapDiagnostics(diagnostics, {
    styleHydrated: hydratedStyle.hydrated,
    roadLayerCount: themeReport.roadLayerCount,
    labelLayerCount: themeReport.labelLayerCount,
    roleCounts: themeReport.roleCounts,
    navigationKey: mapNavigationKey(currentPath.value),
  });
  if (!host.value||disposed) return;
  if (config.provider.basemap.type === 'pmtiles') {
    protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }
  const transformRequest = createProviderRequestTransform(config.provider);
  map = new maplibregl.Map({
    container: host.value,
    style: styleWithInitialRegion(resolvedStyle, currentGeoData) as string | StyleSpecification,
    pixelRatio:mapPixelRatio(),
    center: [104, 35],
    zoom: 3.2,
    bearing: -10,
    pitch: 36,
    maxPitch: 85,
    bearingSnap: 0,
    dragRotate: true,
    touchPitch: true,
    pitchWithRotate: true,
    rotateSpeed: 0.55,
    pitchSpeed: -0.35,
    attributionControl: false,
    localIdeographFontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
    fadeDuration: 0,
    // Native glass outlines use alpha-to-coverage. Request the same actual
    // MSAA context at construction; a borrowed Three renderer cannot add it.
    // Keep it available for later 2D/overlay switches on this same canvas.
    // Native physical transmission must retain its settled shared-canvas frame.
    // Set this at creation so later 2D -> overlay switches use the same context.
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
    transformRequest,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false, visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  attributionSummary=host.value?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-button')??undefined;
  attributionSummary?.addEventListener('click',finishAttributionInteraction);
  map.once('style.load', () => {
    mapLoaded = true;
    publishVectorMapDiagnostics(diagnostics, { phase: 'style-loaded', styleLoaded: true });
    try {
      ensureRegionLayers(false);
      applyLivePalette();
      loading.value = false;
      if(props.autoEntrance&&props.overlay&&props.active)prepareEntrance(true);
      updateCameraDiagnostics();
      updateSourceDiagnostics();
    } catch (error) {
      // MapLibre's asynchronous style-loader catches listener exceptions.
      // Surface initialization failures explicitly instead of a stuck loader.
      errorMessage.value=`地图初始化失败：${error instanceof Error?error.message:String(error)}`;
      loading.value=false;
      publishVectorMapDiagnostics(diagnostics,{phase:'error',errors:[...diagnostics.errors,errorMessage.value].slice(-20)});
    }
  });
  map.once('load', () => {
    basemapReady=true;emitReadyWhenDrawn();
  });
  map.on('idle', () => {
    updateSourceDiagnostics();
    updateCameraDiagnostics();
    publishVectorMapDiagnostics(diagnostics, { phase: 'idle', firstIdle: true });
  });
  map.on('error', (event: MapErrorEvent) => {
    console.warn('2D vector map error', event.error);
    publishVectorMapDiagnostics(diagnostics, {
      phase: 'error',
      errors: [
        ...diagnostics.errors,
        event.error?.message ?? 'Unknown MapLibre error',
      ].slice(-20),
    });
    if (!mapLoaded) errorMessage.value = `二维底图加载失败：${event.error?.message ?? '请检查底图地址'}`;
  });
  map.on('moveend', updateCameraDiagnostics);
  map.on('render',updateAttributionTimer);
  map.on('dragstart',onEntranceInteraction);
  map.on('mousedown',onEntranceInteraction);
  map.on('touchstart',onEntranceInteraction);
  map.on('wheel',onEntranceInteraction);
  map.on('mousemove', regionFillLayerId, onRegionMove);
  map.on('mouseleave', regionFillLayerId, onRegionLeave);
  map.on('click', regionFillLayerId, onRegionClick);
  map.on('mousemove',onOverlayMove);
  map.on('mouseout',onOverlayLeave);
  map.on('click',onOverlayClick);
}

function applyLivePalette(){
  if(!mapLoaded||!map)return;
  // Change only semantic paint values. Camera, GeoJSON, hover filters, tiles
  // and navigation remain on the current MapLibre instance.
  const style=map.getStyle();
  const themed=compileVectorMapTheme(style,palette.value,config.theme,config.provider.layerRoleHints).style;
  for(const layer of themed.layers){
    if(layer.id.startsWith(regionSourceId))continue;
    const previousPaint=(style.layers.find(item=>item.id===layer.id)?.paint??{}) as Record<string,unknown>;
    for(const [property,value] of Object.entries(layer.paint??{})){
      if(JSON.stringify(value)!==JSON.stringify(previousPaint[property]))
        map.setPaintProperty(layer.id,property as Parameters<maplibregl.Map['setPaintProperty']>[1],value);
    }
  }
  for(const layer of regionLayers())for(const [property,value] of Object.entries(layer.paint??{})){
    if(map.getLayer(layer.id))map.setPaintProperty(layer.id,property as Parameters<maplibregl.Map['setPaintProperty']>[1],value);
  }
}
watch(palette,applyLivePalette);
watch(palette,()=>overlayLayer?.setStyle(palette.value,props.overlaySurface,overlayThemeId.value));
watch(()=>props.overlay,()=>{if(!props.overlay)cancelEntrance(true);syncOverlay();applyLivePalette();if(!props.overlay)overlayNavigationWait?.finish(true);});
watch(()=>[props.overlaySurface,overlayThemeId.value],()=>{overlayLayer?.setStyle(palette.value,props.overlaySurface,overlayThemeId.value);syncPendingOverlayNavigation();});
watch(()=>props.quality,quality=>{overlayLayer?.setQuality(quality);if(map)map.setPixelRatio(mapPixelRatio());});

watch(
  () => mapNavigationKey(props.navigation),
  () => {
    const key=mapNavigationKey(props.navigation);
    if(key===mapNavigationKey(currentPath.value)&&key===requestedNavigationKey)return;
    void syncNavigation(props.navigation);
  },
);

watch(() => props.active, (active) => {
  if(!active){cancelHoverPrefetch();cancelEntrance(true);map?.stop();pauseAttributionTimer();}
  overlayLayer?.setActive(active);
  if(active&&entrancePhase==='armed'){playPreparedEntrance();return;}
  if(!active||performance.now()-lastRevealPreparedAt<300)return;
  void prepareForReveal();
});

onMounted(() => {
  publishVectorMapDiagnostics(diagnostics, {
    navigationKey: mapNavigationKey(currentPath.value),
  });
  void setupMap();
  document.addEventListener('visibilitychange',onMapVisibility);
});

onBeforeUnmount(() => {
  cancelEntrance(false);pauseAttributionTimer();
  attributionSummary?.removeEventListener('click',finishAttributionInteraction);
  document.removeEventListener('visibilitychange',onMapVisibility);
  overlayLayer?.setActive(false);
  disposed=true;
  navigationVersion += 1;
  overlayNavigationWait?.finish(false);
  revealController?.abort();
  cancelHoverPrefetch();
  publishVectorMapDiagnostics(diagnostics, { phase: 'destroyed' });
  map?.remove();
  map = undefined;
  overlayLayer=undefined;
  mapLoaded = false;
  cameraInitialized = false;
  readyEmitted = false;
  basemapReady=false;
  if (protocol) maplibregl.removeProtocol('pmtiles');
  protocol = undefined;
});
type RevealOptions={navigation?:MapNavigationPath;signal?:AbortSignal;timeoutMs?:number};
function prepareForReveal(options:RevealOptions={}) {
  cancelEntrance(true);
  const path=(options.navigation??props.navigation).map(item=>({...item}));
  const key=mapNavigationKey(path),overlay=props.overlay;
  revealController?.abort();
  const controller=new AbortController(),version=++revealVersion;
  revealController=controller;
  const abort=()=>controller.abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)abort();
  const deadline=performance.now()+(options.timeoutMs??30000);
  const cancelled=()=>disposed||controller.signal.aborted||version!==revealVersion||overlay!==props.overlay;
  const isReady=()=>{
    if(!map||!mapLoaded||!basemapReady||loading.value||mapNavigationKey(currentPath.value)!==key||requestedNavigationKey!==key)return false;
    const d=overlayLayer?.diagnostics;
    return !overlay||Boolean(d&&d.navigationKey===key&&!d.pendingNavigationKey&&d.renderFrames>0
      &&(d.buildPhase===undefined||d.buildPhase==='ready'));
  };
  const waitFor=(condition:()=>boolean)=>new Promise<boolean>(resolve=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const finish=(value:boolean)=>{if(timer!==undefined)clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);resolve(value);};
    const onAbort=()=>finish(false);
    const check=()=>{
      if(cancelled()||performance.now()>deadline||errorMessage.value){finish(false);return;}
      if(condition()){finish(true);return;}
      timer=setTimeout(check,25);
    };
    controller.signal.addEventListener('abort',onAbort,{once:true});check();
  });
  const task=(async()=>{
    await nextTick();
    if(cancelled())return false;
    if(mapNavigationKey(currentPath.value)!==key||requestedNavigationKey!==key)void syncNavigation(path);
    if(!await waitFor(()=>Boolean(map&&mapLoaded)))return false;
    // The initial or cached inactive layer may already have drawn once. Its
    // one-shot permit also covers an asynchronous replacement currently queued.
    overlayLayer?.requestPreparationFrame();
    if(!await waitFor(isReady))return false;
    const targetMap=map!;
    targetMap.stop();targetMap.resize();
    const before=overlayLayer?.diagnostics.renderFrames??0;
    const drawn=await new Promise<boolean>(resolve=>{
      let settled=false;
      const finish=(value:boolean)=>{
        if(settled)return;settled=true;clearTimeout(timer);targetMap.off('render',onRender);controller.signal.removeEventListener('abort',onAbort);resolve(value);
      };
      const onAbort=()=>finish(false);
      const onRender=()=>{
        if(cancelled()){finish(false);return;}
        if(isReady()&&(!overlay||Number(overlayLayer?.diagnostics.renderFrames)>before))finish(true);
      };
      const timer=setTimeout(()=>finish(false),Math.max(0,deadline-performance.now()));
      controller.signal.addEventListener('abort',onAbort,{once:true});targetMap.on('render',onRender);
      overlayLayer?.requestPreparationFrame();targetMap.triggerRepaint();
      if(cancelled())finish(false);
    });
    if(!drawn||cancelled())return false;
    lastRevealPreparedAt=performance.now();lastRevealKey=key;lastRevealOverlay=overlay;lastRevealFrames=overlayLayer?.diagnostics.renderFrames??0;
    return true;
  })().catch(()=>false);
  revealPreparation=task;
  void task.finally(()=>{
    options.signal?.removeEventListener('abort',abort);
    if(version===revealVersion){revealPreparation=undefined;revealController=undefined;}
  });
  return task;
}

function publishEntrance(){host.value?.setAttribute('data-entrance-phase',entrancePhase);}
function cancelEntrance(restore=false){
  if(entrancePhase!=='armed'&&entrancePhase!=='playing')return;
  if(entranceFinish)map?.off('moveend',entranceFinish);entranceFinish=undefined;
  map?.stop();
  const final=entranceCamera;entranceCamera=undefined;entrancePhase='cancelled';entranceEndedAt=performance.now();
  if(restore&&final&&map){overlayLayer?.requestPreparationFrame();map.jumpTo(final);}
  publishEntrance();
}
function prepareEntrance(early=false){
  if(!props.overlay||!map||!mapLoaded||(!basemapReady&&!early)||loading.value||disposed)return false;
  cancelEntrance(true);
  const center=map.getCenter();entranceCamera={center:[center.lng,center.lat],zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()};
  lastEntranceTarget={...entranceCamera,center:[...entranceCamera.center]};
  entrancePhase='armed';entranceStartedAt=0;entranceEndedAt=0;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){entrancePhase='done';entranceEndedAt=performance.now();entranceCamera=undefined;publishEntrance();return true;}
  overlayLayer?.requestPreparationFrame();
  map.jumpTo({...entranceCamera,bearing:entranceCamera.bearing-7,pitch:Math.max(0,entranceCamera.pitch-3.5)});
  publishEntrance();return true;
}
function playPreparedEntrance(){
  if(entrancePhase!=='armed'||!entranceCamera||!props.active||!props.overlay||!map||document.hidden)return;
  const target=entranceCamera;
  entrancePhase='playing';entranceStartedAt=performance.now();entrancePlays++;publishEntrance();
  entranceFinish=()=>{entranceFinish=undefined;entranceCamera=undefined;entrancePhase='done';entranceEndedAt=performance.now();publishEntrance();};
  map.once('moveend',entranceFinish);
  map.easeTo({...target,duration:FUI_MAP_ENTRANCE_DURATION*1000,easing:value=>1-(1-value)**3});
}
function replayEntrance(){if(prepareEntrance())playPreparedEntrance();}
function startEntrance(){if(entrancePhase==='armed')playPreparedEntrance();else replayEntrance();}
function onEntranceInteraction(){
  cancelEntrance(false);
  if(!attributionCollapsed){finishAttributionInteraction();host.value?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');}
}
function pauseAttributionTimer(){
  if(attributionTimer!==undefined)clearTimeout(attributionTimer);attributionTimer=undefined;
  if(attributionVisibilityProbe!==undefined)clearTimeout(attributionVisibilityProbe);attributionVisibilityProbe=undefined;
  attributionVisibilityRetries=0;
  if(attributionVisibleSince){attributionVisibleElapsed+=performance.now()-attributionVisibleSince;attributionVisibleSince=0;}
}
function finishAttributionInteraction(){attributionManual=true;attributionCollapsed=true;pauseAttributionTimer();}
function updateAttributionTimer(){
  if(attributionCollapsed||attributionTimer!==undefined||!props.active||document.hidden||!basemapReady||!readyEmitted||disposed)return;
  const overlay=overlayLayer?.diagnostics;
  if(props.overlay&&(!overlay||!overlay.renderFrames||overlay.pendingNavigationKey||overlay.navigationKey!==mapNavigationKey(currentPath.value)))return;
  const control=host.value?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
  if(!control||control.classList.contains('maplibregl-attrib-empty')||!control.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent?.trim())return;
  let element:HTMLElement|null=control;
  while(element){
    const style=getComputedStyle(element);
    if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<.99){
      if(attributionVisibilityProbe===undefined&&attributionVisibilityRetries<30){attributionVisibilityRetries++;attributionVisibilityProbe=setTimeout(()=>{attributionVisibilityProbe=undefined;updateAttributionTimer();},100);}
      return;
    }
    element=element.parentElement;
  }
  attributionVisibleSince=performance.now();
  attributionTimer=setTimeout(()=>{
    pauseAttributionTimer();
    if(!props.active||document.hidden||disposed)return;
    if(attributionVisibleElapsed<5000){updateAttributionTimer();return;}
    control.classList.remove('maplibregl-compact-show');attributionCollapsed=true;
  },Math.max(0,5000-attributionVisibleElapsed));
}
function onMapVisibility(){
  if(document.hidden){cancelEntrance(true);pauseAttributionTimer();}
  else if(props.active){map?.triggerRepaint();}
}

// Public linking API: an unavailable map/layer returns void; these methods do
// not synthesize pointer input or create a second camera/renderer.
defineExpose({
  goBack,prepareForReveal,prepareEntrance:()=>prepareEntrance(),replayEntrance,startEntrance,cancelEntrance,
  getRevealDiagnostics:()=>{
    const exposed=attributionVisibleElapsed+(attributionVisibleSince?performance.now()-attributionVisibleSince:0),control=host.value?.querySelector('.maplibregl-ctrl-attrib');
    return{preparing:Boolean(revealPreparation),navigationKey:lastRevealKey,overlay:lastRevealOverlay,renderFrames:lastRevealFrames,preparedAt:lastRevealPreparedAt,entrance:{phase:entrancePhase,startedAt:entranceStartedAt,endedAt:entranceEndedAt,plays:entrancePlays,cameraSource:'maplibre',target:lastEntranceTarget?{...lastEntranceTarget,center:[...lastEntranceTarget.center]}:undefined,camera:map?{bearing:map.getBearing(),pitch:map.getPitch(),zoom:map.getZoom()}:undefined},attribution:{collapsed:Boolean(control&&!control.classList.contains('maplibregl-compact-show')),autoComplete:attributionCollapsed,manual:attributionManual,visibleMs:exposed,remainingMs:Math.max(0,5000-exposed)}};
  },
  highlightFeature:(key:string)=>overlayLayer?.setHovered(key),
  setCamera:(camera:{center?:[number,number];zoom?:number;pitch?:number;bearing?:number})=>{cancelEntrance(false);map?.jumpTo(camera);},
  getCanvas:()=>map?.getCanvas(),
  getOverlayDiagnostics:()=>overlayLayer?.diagnostics,
});
</script>

<style scoped>
.vector-map-stage {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 140ms ease, visibility 0s linear 140ms;
}

.vector-map-stage.is-active {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition-delay: 0s;
}

.vector-map-stage::after {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  content: '';
  background:
    radial-gradient(
      ellipse 58% 56% at 50% 48%,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0) 52%,
      rgba(1, 6, 9, 0.14) 72%,
      rgba(0, 3, 6, 0.42) 100%
    ),
    linear-gradient(
      90deg,
      rgba(0, 4, 7, 0.18) 0%,
      rgba(0, 4, 7, 0) 18%,
      rgba(0, 4, 7, 0) 82%,
      rgba(0, 4, 7, 0.18) 100%
    ),
    linear-gradient(
      180deg,
      rgba(0, 3, 6, 0.08) 0%,
      rgba(0, 3, 6, 0) 22%,
      rgba(0, 3, 6, 0) 74%,
      rgba(0, 3, 6, 0.24) 100%
    );
}

.vector-map-host {
  position: absolute;
  inset: 0;
  background: #02070b;
}

.vector-map-drill-control {
  position: absolute;
  left: 50%;
  top: 176px;
  z-index: 5;
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

.vector-map-drill-control button {
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--map-drill-border);
  border-radius: 2px;
  background: var(--map-drill-background);
  color: var(--map-drill-text);
  font: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 14px var(--map-drill-box-inner), 0 0 12px var(--map-drill-box-outer);
}

.vector-map-drill-control button:disabled {
  opacity: 0.35;
  cursor: default;
}

.vector-map-status {
  display:inline-flex;align-items:center;gap:8px;pointer-events:none;
  color:var(--map-accent-soft);font-size:12px;white-space:nowrap;
  opacity:0;animation:vector-status-reveal .12s ease .16s forwards;
}
.vector-map-status i{width:10px;height:10px;border:1px solid var(--map-drill-border);border-top-color:var(--map-accent-soft);border-radius:50%;animation:vector-status-spin .8s linear infinite}
.vector-map-status-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.vector-map-error {
  position:absolute;left:50%;top:216px;z-index:6;max-width:min(80%,520px);padding:8px 12px;
  border:1px solid rgba(255,120,104,.45);border-radius:2px;background:rgba(2,10,15,.88);
  color:#ffb3a8;font-size:12px;line-height:1.5;transform:translateX(-50%);
}
@keyframes vector-status-reveal{to{opacity:1}}
@keyframes vector-status-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.vector-map-status{animation:none;opacity:1}.vector-map-status i{animation:none}}

.vector-map-stage :deep(.maplibregl-ctrl-bottom-right) {
  right: var(--vector-map-control-right);
  bottom: var(--vector-map-control-bottom);
}

.vector-map-stage :deep(.maplibregl-ctrl-top-right) {
  top: var(--vector-map-control-top);
  right: var(--vector-map-control-right);
}

.vector-map-stage :deep(.maplibregl-ctrl-group) {
  overflow: hidden;
  border: 1px solid var(--map-drill-border);
  border-radius: 2px;
  background: rgba(2, 10, 15, 0.82);
  box-shadow: 0 0 14px var(--map-drill-box-outer);
}

.vector-map-stage :deep(.maplibregl-ctrl-group button) {
  filter: invert(1) hue-rotate(165deg) saturate(0.55);
}

.vector-map-stage :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group) {
  overflow: visible;
  width: 44px;
  height: 44px;
  border-color: var(--map-drill-border);
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--map-accent) 18%, var(--vector-map-background)) 0%, var(--vector-map-background) 72%);
  box-shadow:
    inset 0 0 16px var(--map-drill-box-inner),
    0 0 16px var(--map-drill-box-outer);
}

.vector-map-stage :deep(.maplibregl-ctrl-top-right button.maplibregl-ctrl-compass) {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  filter: none;
}

.vector-map-stage :deep(.maplibregl-ctrl-top-right button.maplibregl-ctrl-compass::after) {
  position: absolute;
  top: 1px;
  left: 50%;
  z-index: 2;
  color: var(--map-accent-soft);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.04em;
  content: 'N';
  transform: translateX(-50%);
  text-shadow: 0 0 7px var(--map-drill-glow);
  pointer-events: none;
}

.vector-map-stage :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass-arrow) {
  background-size: 36px 36px;
  filter: invert(1) saturate(0) brightness(1.1);
}

.vector-map-stage :deep(.maplibregl-ctrl-attrib) {
  color: rgba(205, 230, 236, 0.72);
  background: rgba(2, 8, 12, 0.8);
}

.vector-map-stage :deep(.maplibregl-ctrl-attrib a) {
  color: var(--map-accent-soft);
}
</style>
