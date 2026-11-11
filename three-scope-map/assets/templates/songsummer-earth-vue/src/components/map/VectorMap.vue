<!--
  SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="vector-map-stage" :class="{ 'is-active': props.active }" :style="mapStageStyle" :data-theme-accent="palette.administrativeFill" :data-theme-water="palette.water" :data-composition="props.overlay?'overlay':'single'" :data-overlay-surface="props.overlay?props.overlaySurface:undefined" :aria-hidden="!props.active" :inert="!props.active">
    <div ref="host" class="vector-map-host" />
    <div class="vector-map-drill-control">
      <button type="button" :disabled="currentPath.length <= 1 || loading" @click="goBack">
        返回上级
      </button>
      <span>{{ currentScopeLabel }} / {{ currentItem.regionName }}</span>
    </div>
    <div v-if="loading || errorMessage" class="vector-map-status" :class="{ 'is-error': errorMessage }">
      {{ errorMessage || '正在加载二维矢量地图…' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as maplibregl from 'maplibre-gl';
import type { ErrorEvent as MapErrorEvent, GeoJSONSource, MapLayerMouseEvent, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from './maplibreWorker.ts?worker&url';
import { Protocol } from 'pmtiles';
import type { GeoJSON as GeoJSONValue } from 'geojson';
import type { GeoFeature, GeoFeatureCollection, Position } from '../../types/geo';
import { loadMapLevel } from './mapDataAdapter';
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
}>(), {
  active: false,
  navigation: () => [...initialMapNavigationPath],
  overlay:false,
  overlaySurface:'smooth-glass',
});

const emit = defineEmits<{
  ready: [];
  'navigation-change': [path: MapNavigationPath];
}>();

const host = ref<HTMLDivElement>();
const currentPath = ref<MapNavigationPath>([...props.navigation]);
const loading = ref(true);
const errorMessage = ref('');
const config = getVectorMapConfig();
const palette=computed(()=>({...config.palette,...(props.primaryColor?createVectorMapPalette(props.primaryColor):{}),...props.palette}));
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
const currentScopeLabel = computed(() => mapScopeLabel[currentItem.value.scope]);
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
let protocol: Protocol | undefined;
let cameraInitialized = false;
let readyEmitted = false;
let overlayLayer:VectorMap3dLayer|undefined;
let disposed=false;
let overlayProjection:ReturnType<maplibregl.Map['getProjection']>|undefined;
let revealPreparation:Promise<void>|undefined;
let lastRevealPreparedAt=0;
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
      : { top: 205, right: 470, bottom: 145, left: 470 },
    duration: animate ? 680 : 0,
    maxZoom: currentItem.value.scope === 'district' ? 11.5 : 9.5,
    pitch,
    bearing,
  });
  cameraInitialized = true;
}

function ensureRegionLayers(animate = true) {
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
  fitGeoData(currentGeoData, animate);
}

function publishOverlay(diagnostics:OverlayDiagnostics){
  if(disposed)return;
  if(props.overlay&&diagnostics.errors.length)errorMessage.value=`三维叠加失败：${diagnostics.errors[diagnostics.errors.length-1]}`;
  const snapshot={...diagnostics,viewport:map?{width:map.getCanvas().clientWidth,height:map.getCanvas().clientHeight}:undefined};
  (window as unknown as {__SUMMER_MAP_OVERLAY_DIAGNOSTICS__?:unknown}).__SUMMER_MAP_OVERLAY_DIAGNOSTICS__=snapshot;
  host.value?.setAttribute('data-overlay-diagnostics',JSON.stringify(snapshot));
}
function syncOverlay(){
  if(!map||!mapLoaded||!currentGeoData)return;
  if(!props.overlay){
    if(overlayLayer&&map.getLayer(overlayLayer.id))map.removeLayer(overlayLayer.id);
    overlayLayer=undefined;
    if(overlayProjection){const previous=overlayProjection;overlayProjection=undefined;map.setProjection(previous);}
    if(errorMessage.value.startsWith('三维叠加失败：'))errorMessage.value='';
  }else if(!overlayLayer||!map.getLayer(overlayLayer.id)){
    // A style may omit projection: MapLibre 6 then returns undefined despite
    // its public return type, and the actual projection defaults to Mercator.
    const projection=map.getProjection()??{type:'mercator' as const};
    if(!overlayProjection)overlayProjection=structuredClone(projection);
    if(projection.type!=='mercator')map.setProjection({type:'mercator'});
    overlayLayer=new VectorMap3dLayer(visibleGeoData(currentGeoData),palette.value,props.overlaySurface,publishOverlay);
    overlayLayer.diagnostics.navigationKey=mapNavigationKey(currentPath.value);
    // Keep provider label layers above the geographic volume. Roads, water
    // and land remain in the same style/framebuffer underneath its clear face.
    const before=map.getStyle().layers.find(layer=>layer.type==='symbol')?.id;
    map.addLayer(overlayLayer,before);overlayLayer.setActive(props.active);
  }else{
    overlayLayer.setData(visibleGeoData(currentGeoData),mapNavigationKey(currentPath.value));
    overlayLayer.setStyle(palette.value,props.overlaySurface);overlayLayer.setActive(props.active);
  }
  for(const id of [regionFillLayerId,regionHoverLayerId,regionLineLayerId])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',props.overlay?'none':'visible');
  if(!props.overlay){hoveredFeatureName='';map.getCanvas().style.cursor='';}
}

async function syncNavigation(path: MapNavigationPath, emitChange = false) {
  const item = path[path.length - 1];
  if (!item) return;
  const version = ++navigationVersion;
  loading.value = true;
  errorMessage.value = '';
  try {
    const geoData = await loadMapLevel(item.scope, item.code);
    if (version !== navigationVersion) return;
    currentPath.value = path.map((entry) => ({ ...entry }));
    currentGeoData = geoData;
    publishVectorMapDiagnostics(diagnostics, {
      navigationKey: mapNavigationKey(currentPath.value),
    });
    ensureRegionLayers();
    if (emitChange) emit('navigation-change', [...currentPath.value]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? `地图数据加载失败：${error.message}` : '地图数据加载失败';
    publishVectorMapDiagnostics(diagnostics, {
      phase: 'error',
      errors: [...diagnostics.errors, errorMessage.value].slice(-20),
    });
  } finally {
    if (version === navigationVersion && mapLoaded) loading.value = false;
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
  const nextName = String(event.features?.[0]?.properties?.name ?? '');
  if (nextName === hoveredFeatureName) return;
  hoveredFeatureName = nextName;
  map.setFilter(regionHoverLayerId, ['==', ['get', 'name'], hoveredFeatureName]);
  map.getCanvas().style.cursor = nextMapScope(currentItem.value.scope) && nextName ? 'pointer' : '';
}

function onRegionLeave() {
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
  const feature=overlayLayer.pick(event.point);
  const key=feature?featureCode(feature)||featureName(feature):'';
  overlayLayer.setHovered(key);map.getCanvas().style.cursor=feature&&nextMapScope(currentItem.value.scope)?'pointer':'';
}
function onOverlayLeave(){if(props.overlay){overlayLayer?.setHovered('');if(map)map.getCanvas().style.cursor='';}}
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
  await syncNavigation(currentPath.value);
  if (!host.value||disposed) return;
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  const sourceStyle = await createVectorMapStyle(config.provider, palette.value);
  const hydratedStyle = await hydrateVectorStyle(sourceStyle, config.provider);
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
    pixelRatio: Math.min(window.devicePixelRatio||1,Math.max(1,config.maxPixelRatio)),
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
    transformRequest,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false, visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.once('style.load', () => {
    mapLoaded = true;
    publishVectorMapDiagnostics(diagnostics, { phase: 'style-loaded', styleLoaded: true });
    try {
      ensureRegionLayers(false);
      applyLivePalette();
      loading.value = false;
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
    if (readyEmitted) return;
    readyEmitted = true;
    emit('ready');
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
watch(palette,()=>overlayLayer?.setStyle(palette.value,props.overlaySurface));
watch(()=>props.overlay,()=>{syncOverlay();applyLivePalette();});
watch(()=>props.overlaySurface,()=>overlayLayer?.setStyle(palette.value,props.overlaySurface));

watch(
  () => mapNavigationKey(props.navigation),
  () => {
    if (mapNavigationKey(props.navigation) === mapNavigationKey(currentPath.value)) return;
    void syncNavigation(props.navigation);
  },
);

watch(() => props.active, (active) => {
  overlayLayer?.setActive(active);
  if(!active||performance.now()-lastRevealPreparedAt<300)return;
  void prepareForReveal();
});

onMounted(() => {
  publishVectorMapDiagnostics(diagnostics, {
    navigationKey: mapNavigationKey(currentPath.value),
  });
  void setupMap();
});

onBeforeUnmount(() => {
  overlayLayer?.setActive(false);
  disposed=true;
  navigationVersion += 1;
  publishVectorMapDiagnostics(diagnostics, { phase: 'destroyed' });
  map?.remove();
  map = undefined;
  overlayLayer=undefined;
  mapLoaded = false;
  cameraInitialized = false;
  readyEmitted = false;
  if (protocol) maplibregl.removeProtocol('pmtiles');
  protocol = undefined;
});
function prepareForReveal() {
  if (!map || !mapLoaded) return Promise.resolve();
  if (revealPreparation) return revealPreparation;
  revealPreparation = new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      lastRevealPreparedAt = performance.now();
      revealPreparation = undefined;
      resolve();
    };
    const timeout = window.setTimeout(finish, 120);
    map?.once('render', finish);
    map?.resize();
    map?.triggerRepaint();
  });
  return revealPreparation;
}

// Public linking API: an unavailable map/layer returns void; these methods do
// not synthesize pointer input or create a second camera/renderer.
defineExpose({
  goBack,prepareForReveal,
  highlightFeature:(key:string)=>overlayLayer?.setHovered(key),
  setCamera:(camera:{center?:[number,number];zoom?:number;pitch?:number;bearing?:number})=>{map?.jumpTo(camera);},
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
}

.vector-map-stage.is-active {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
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
      rgba(0, 0, 0, 0) 50%,
      rgba(1, 6, 9, 0.1) 64%,
      rgba(1, 6, 9, 0.32) 82%,
      rgba(0, 3, 6, 0.68) 100%
    ),
    linear-gradient(
      90deg,
      rgba(0, 4, 7, 0.3) 0%,
      rgba(0, 4, 7, 0.08) 12%,
      rgba(0, 4, 7, 0) 26%,
      rgba(0, 4, 7, 0) 74%,
      rgba(0, 4, 7, 0.08) 88%,
      rgba(0, 4, 7, 0.3) 100%
    ),
    linear-gradient(
      180deg,
      rgba(0, 3, 6, 0.14) 0%,
      rgba(0, 3, 6, 0) 24%,
      rgba(0, 3, 6, 0) 68%,
      rgba(0, 3, 6, 0.38) 100%
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
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 6;
  padding: 10px 16px;
  border: 1px solid var(--map-drill-border);
  background: rgba(2, 10, 15, 0.86);
  color: var(--map-drill-text);
  font-size: 13px;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 20px var(--map-drill-box-outer);
}

.vector-map-status.is-error {
  color: #ffb3a8;
  border-color: rgba(255, 120, 104, 0.58);
}

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
  border-color: rgba(126, 224, 237, 0.62);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(12, 42, 50, 0.94) 0%, rgba(2, 11, 16, 0.94) 72%);
  box-shadow:
    inset 0 0 16px rgba(94, 224, 238, 0.14),
    0 0 16px rgba(67, 213, 231, 0.18);
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
  color: rgba(180, 239, 245, 0.9);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.04em;
  content: 'N';
  transform: translateX(-50%);
  text-shadow: 0 0 7px rgba(90, 224, 238, 0.64);
  pointer-events: none;
}

.vector-map-stage :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass-arrow) {
  background-size: 36px 36px;
  filter: invert(1) hue-rotate(165deg) saturate(0.62) brightness(1.35);
}

.vector-map-stage :deep(.maplibregl-ctrl-attrib) {
  color: rgba(205, 230, 236, 0.72);
  background: rgba(2, 8, 12, 0.8);
}

.vector-map-stage :deep(.maplibregl-ctrl-attrib a) {
  color: var(--map-accent-soft);
}
</style>
