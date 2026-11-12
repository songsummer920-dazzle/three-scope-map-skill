// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Background integration entry. No native desktop input is used.
import {createApp,defineComponent,h,ref,nextTick,onMounted} from 'vue';
import FuiEarth from '../src/components/map/FuiEarth.vue';
import VectorMap from '../src/components/map/VectorMap.vue';
import ChinaMap from '../src/components/map/ChinaMap.vue';
import FuiSceneLoader from '../src/components/map/FuiSceneLoader.vue';
import type {FuiMapStyle,FuiMapViewMode} from '../src/components/map/fuiMapPresentation';
import {mapNavigationKey,type MapNavigationPath} from '../src/components/map/mapNavigation';
import type {OverlayDiagnostics} from '../src/components/map/vectorMap3dLayer';
import {getFuiVectorMapPalette,resolveFuiEarthThemeId} from '../src/components/map/fuiEarthTheme';
import chinaSource from '../src/assets/maps/china.json';
const chinaMaritime=chinaSource.features.filter(feature=>String(feature.properties.adcode??'').endsWith('_JD'));
const expectedMaritimeSegments=chinaMaritime.reduce((sum,feature)=>sum+(feature.geometry.type==='Polygon'?1:feature.geometry.coordinates.length),0);
const expectedChinaRegions=chinaSource.features.length-chinaMaritime.length;
type VectorApi={getCanvas:()=>HTMLCanvasElement|undefined;getOverlayDiagnostics:()=>OverlayDiagnostics|undefined;highlightFeature:(key:string)=>void;setCamera:(options:{pitch?:number;bearing?:number})=>void;goBack:()=>void};
type Result={name:string;status:'pass'|'fail';detail:unknown};
type HybridDiagnostics={view:FuiMapViewMode;pending?:FuiMapViewMode;navigationKey:string;idle?:{state:'scheduled'|'preparing'|'ready';pending:boolean;target:FuiMapViewMode;ready:boolean;navigationKey:string};threeNavigationKey?:string;three?:{modelId?:string;navigationKey?:string};overlay?:OverlayDiagnostics;vector?:{navigationKey:string;overlay:boolean;renderFrames:number;preparedAt:number;entrance?:{phase:string;startedAt:number;endedAt:number;plays:number;cameraSource:string;target?:{bearing:number;pitch:number;zoom:number};camera?:{bearing:number;pitch:number;zoom:number}};attribution?:{collapsed:boolean;visibleMs:number;manual:boolean}}};
type HybridApi={switchView:(view:FuiMapViewMode)=>Promise<boolean>;syncNavigation:(path:MapNavigationPath)=>Promise<boolean>;resetToCountry:()=>Promise<boolean>;getNavigation:()=>MapNavigationPath;getView:()=>FuiMapViewMode;getRevealDiagnostics:()=>HybridDiagnostics};
declare global{interface Window{__SUMMER_MAP_OVERLAY_DIAGNOSTICS__?:OverlayDiagnostics;}}
const app=defineComponent({setup(){
  const query=new URLSearchParams(location.search),scene=ref<'overlay'|'map'|'hybrid'|'loader'|'off'>(query.get('scene')==='map'?'map':'overlay');
  const material=ref<FuiMapStyle>('smooth-glass');
  const color=ref('#a75fff'),view=ref<FuiMapViewMode>('overlay'),vector=ref<VectorApi>(),overlay=ref(true),ready=ref(false);
  const path=ref<MapNavigationPath>([{scope:'country',regionName:'中国',code:'100000'}]);
  const hybrid=ref<HybridApi>(),hybridView=ref<FuiMapViewMode>('overlay'),hybridPath=ref<MapNavigationPath>([...path.value]),hybridShowSwitch=ref(true);
  const results=ref<Result[]>([]),running=ref(false),status=ref('preparing'),errors:string[]=[];
  const navigationEvents:{key:string;drawnKey?:string;phase?:string;frames?:number}[]=[];
  window.addEventListener('error',event=>errors.push(event.message));window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
  const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(predicate:()=>boolean,label:string,timeout=60000)=>{const start=performance.now();while(!predicate()){if(performance.now()-start>timeout)throw new Error('Timeout: '+label);await sleep(35);}await nextTick();};
  const check=(value:unknown,message:string)=>{if(!value)throw new Error(message);};
  const diag=()=>vector.value?.getOverlayDiagnostics(),host=()=>document.querySelector<HTMLElement>('.map-host');
  const drawn=()=>Boolean(diag()?.active&&Number(diag()?.drawCalls)>0&&Number(diag()?.features)>0);
  const perform=async(name:string,run:()=>Promise<unknown>)=>{status.value=name;try{results.value.push({name,status:'pass',detail:await run()});}catch(error){results.value.push({name,status:'fail',detail:String(error)});throw error;}};
  const mount=async(next:'overlay'|'map'|'hybrid'|'loader')=>{ready.value=false;scene.value='off';await nextTick();await sleep(50);scene.value=next;await nextTick();};
  const report=()=>({status:running.value?'running':results.value.some(r=>r.status==='fail')?'failed':results.value.length?'passed':'idle',results:results.value,errors,overlay:diag(),hybrid:hybrid.value?.getRevealDiagnostics(),twoD:window.__SUMMER_MAP_2D_DIAGNOSTICS__,map:host()?{...host()!.dataset}:undefined});
  async function run(){
    if(running.value)return;running.value=true;results.value=[];errors.length=0;
    try{
      await perform('同一底图、相机、画布与真实3D几何',async()=>{
        await wait(()=>ready.value&&drawn(),'overlay first frame');const d=diag()!;
        check(d.contextShared&&d.canvasShared&&d.cameraSource==='maplibre','Independent renderer used');
        check(d.contextPreserveDrawingBuffer===true,'Shared native canvas does not retain settled frames');
        check(d.materialSource==='fui-native-smooth-glass'&&d.pairedSurfaces===d.features*2&&d.hud===false,'Native glass scene or HUD exclusion regressed');
        check(expectedMaritimeSegments>0&&d.southSeaSegments===expectedMaritimeSegments&&Number(d.southSeaIslands)>0,'Original maritime JD segments were lost before the native overlay builder');
        check(d.features===expectedChinaRegions,'JD maritime geometry was added as an administrative filled/pickable region');
        check(d.hdrActive===true&&d.hdrSource==='earth-cap-linear-hdr'&&d.hdrOutput==='single-aces-srgb','Earth cap linear composition/display chain is missing');
        check(d.backdropCaptures===0,'Reference cap mode captures an unused basemap');
        check(d.projectionMatrix.length===16&&d.projectionMatrix.every(Number.isFinite),'Invalid shared projection');
        check(!document.querySelector('.map-host canvas'),'Standalone 3D initialized for overlay');
        await wait(()=>Boolean(window.__SUMMER_MAP_2D_DIAGNOSTICS__?.firstIdle),'basemap idle');
        const base=window.__SUMMER_MAP_2D_DIAGNOSTICS__!;check(base.roadLayerCount>0&&base.labelLayerCount>0,'Basemap roads/labels missing');
        check(base.styleLoaded&&base.basemapSourceLoaded&&!base.errors.length,'Provider basemap did not load cleanly');check(!d.errors.length,d.errors.join('\n'));
        return {...d,roads:base.roadLayerCount,labels:base.labelLayerCount};
      });
      const canvas=vector.value!.getCanvas();
      await perform('地图旋转使用实时共享投影',async()=>{
        const before=JSON.stringify(diag()!.projectionMatrix),camera={...window.__SUMMER_MAP_2D_DIAGNOSTICS__!.camera};
        vector.value!.setCamera({pitch:48,bearing:16});await wait(()=>JSON.stringify(diag()!.projectionMatrix)!==before,'map camera projection update');
        check(Math.abs(window.__SUMMER_MAP_2D_DIAGNOSTICS__!.camera.bearing-16)<.01,'Basemap camera and custom layer diverged');
        vector.value!.setCamera({pitch:camera.pitch,bearing:camera.bearing});await sleep(120);return {sharedCamera:true};
      });
      await perform('换色保留底图、行政路径与相机',async()=>{
        const camera=JSON.stringify(window.__SUMMER_MAP_2D_DIAGNOSTICS__?.camera),nav=diag()!.navigationKey;
        for(const next of ['#14c98c','#808080','#a75fff']){color.value=next;await nextTick();await sleep(100);check(vector.value!.getCanvas()===canvas,'Color rebuilt canvas');}
        check(JSON.stringify(window.__SUMMER_MAP_2D_DIAGNOSTICS__?.camera)===camera,'Color reset camera');check(diag()!.navigationKey===nav,'Color reset navigation');return {sameCanvas:true,sameCamera:true,nav};
      });
      await perform('整块抬升高亮与有界重绘',async()=>{
        vector.value!.highlightFeature('330000');await wait(()=>Number(diag()?.hoverProgress)>.95,'feature lift');check(Number(diag()?.selectionLiftMeters)>0,'Missing actual lift');
        const lifted={progress:diag()!.hoverProgress,meters:diag()!.selectionLiftMeters};vector.value!.highlightFeature('');await wait(()=>Number(diag()?.hoverProgress)<.01,'feature descent');
        await sleep(250);const before=diag()!.renderFrames;await sleep(350);check(diag()!.renderFrames-before<=2,'Settled layer repaints continuously');return {lifted,idleFrames:diag()!.renderFrames-before};
      });
      await perform('真实地理下钻与返回',async()=>{
        const before=diag()!.renderFrames,projection=JSON.stringify(diag()!.projectionMatrix),started=performance.now();
        const observations:{phase?:string;key:string;frames:number;projection:string}[]=[];
        const observer=new MutationObserver(()=>{
          const d=diag();if(d)observations.push({phase:d.buildPhase,key:d.navigationKey,frames:d.renderFrames,projection:JSON.stringify(d.projectionMatrix)});
        });
        observer.observe(document.querySelector('.vector-map-host')!,{attributes:true,attributeFilter:['data-overlay-diagnostics']});
        try{
          path.value=[...path.value,{scope:'province',regionName:'浙江省',code:'330000'}];await nextTick();
          await wait(()=>Boolean(diag()?.pendingNavigationKey?.endsWith('province:330000')),'province pending');
          check(Boolean(document.querySelector('.vector-map-status')),'Navigation released its pending UI before the new model drew');
          await wait(()=>Boolean(diag()?.navigationKey.endsWith('province:330000')&&diag()?.buildPhase==='ready'&&diag()?.features&&diag()!.renderFrames>before&&!document.querySelector('.vector-map-status')),'province');
        }finally{observer.disconnect();}
        const pending=observations.filter(value=>value.phase==='queued'||value.phase==='building');
        check(pending.length>0,'The asynchronous model build was not observed');
        check(pending.every(value=>value.projection===projection),'Navigation zoomed the old country model before the new volume was drawable');
        check(vector.value!.getCanvas()===canvas,'Navigation rebuilt map');check(diag()!.southSeaSegments===0&&diag()!.southSeaIslands===0,'China maritime models leaked into a province');
        const province={features:diag()!.features,triangles:diag()!.triangles,firstDrawMs:Math.round(performance.now()-started)},frames=diag()!.renderFrames;
        await sleep(750);
        const eventCount=navigationEvents.length;vector.value!.goBack();
        await wait(()=>diag()?.navigationKey==='country:100000'&&diag()!.buildPhase==='ready'&&diag()!.renderFrames>frames&&navigationEvents.length>eventCount&&!document.querySelector('.vector-map-status'),'country return');
        const event=navigationEvents.at(-1)!;
        check(event.key==='country:100000'&&event.drawnKey===event.key&&event.phase==='ready'&&Number(event.frames)>frames,'Navigation event preceded the matching successful overlay frame');
        check(diag()!.southSeaSegments===expectedMaritimeSegments,'Country return lost original maritime segments');await sleep(750);
        return {province,pendingSamples:pending.length,returned:diag()!.navigationKey,event};
      });
      await perform('快速切换行政路径取消过期构建',async()=>{
        const country=[...path.value],before=diag()!.renderFrames;
        path.value=[...country,{scope:'province',regionName:'浙江省',code:'330000'}];await nextTick();
        // Cancel even when the JSON promise has not yet installed its path.
        path.value=country;await nextTick();
        await wait(()=>Boolean(diag()?.navigationKey==='country:100000'&&diag()?.buildPhase==='ready'&&diag()!.renderFrames>before&&!document.querySelector('.vector-map-status')),'latest navigation draw');
        check(vector.value!.getCanvas()===canvas,'Cancelled navigation rebuilt the map');
        check(diag()!.southSeaSegments===expectedMaritimeSegments,'The obsolete province replaced the latest country scene');await sleep(750);
        return {latest:diag()!.navigationKey,pending:diag()!.pendingNavigationKey,loaderReleased:true};
      });
      await perform('2D与叠加切换复用画布',async()=>{
        overlay.value=false;await nextTick();await sleep(100);check(!diag(),'Layer not removed');check(vector.value!.getCanvas()===canvas,'2D rebuilt map');
        overlay.value=true;await nextTick();await wait(drawn,'overlay return');check(vector.value!.getCanvas()===canvas,'Overlay return rebuilt map');return {sameCanvas:true};
      });
      await perform('实体与全息叠加复用原生厚度和各自材质',async()=>{
        const smooth=diag()!,depth=smooth.displayExtrusionMeters,camera=JSON.stringify(window.__SUMMER_MAP_2D_DIAGNOSTICS__?.camera),navigation=smooth.navigationKey;
        material.value='terrain-glass';await nextTick();
        await wait(()=>Boolean(drawn()&&diag()?.materialSource==='fui-native-terrain-glass'&&diag()?.terrainReady),'native terrain overlay');
        await wait(()=>Boolean(diag()?.terrainDetail==='regional'&&Number(diag()?.terrainResolution)>0),'native regional terrain relief');
        const terrain=diag()!;
        check(terrain.surface==='terrain-glass'&&terrain.terrainSource!=='none','Terrain presentation lost its real geographic relief');
        check(terrain.contextPreserveDrawingBuffer===true,'Native terrain lost the retained shared canvas');
        check(terrain.southSeaSegments===expectedMaritimeSegments,'Terrain overlay lost the original maritime geometry');
        check(Math.abs(terrain.displayExtrusionMeters-depth)<Math.max(1e-6,depth*1e-8),'Entity overlay uses a different slab depth');
        check(terrain.hud===false&&terrain.pairedSurfaces===terrain.features*2,'Entity native coat/backing or HUD exclusion missing');
        check(vector.value!.getCanvas()===canvas&&JSON.stringify(window.__SUMMER_MAP_2D_DIAGNOSTICS__?.camera)===camera,'Material switch replaced the shared canvas or camera');
        check(terrain.navigationKey===navigation,'Material switch reset navigation');
        vector.value!.highlightFeature('330000');await wait(()=>Number(diag()?.hoverProgress)>.95,'terrain feature lift');check(Number(diag()?.selectionLiftMeters)>0,'Terrain region did not lift');
        vector.value!.highlightFeature('');await wait(()=>Number(diag()?.hoverProgress)<.01,'terrain feature descent');
        const entity={material:terrain.materialSource,depth:terrain.displayExtrusionMeters,source:terrain.terrainSource,features:terrain.features,detail:terrain.terrainDetail,resolution:terrain.terrainResolution};
        material.value='smooth-glass';await nextTick();
        await wait(()=>Boolean(drawn()&&diag()?.materialSource==='fui-native-smooth-glass'&&diag()?.terrainSource==='none'&&!diag()?.terrainReady),'smooth overlay return');
        check(diag()?.terrainDetail==='none'&&Number(diag()?.terrainResolution??0)===0,'Smooth presentation retained regional terrain preparation');
        check(vector.value!.getCanvas()===canvas&&diag()!.navigationKey===navigation,'Smooth return replaced canvas or navigation');
        return {sameCanvas:true,sameCamera:true,sameDepth:true,entity,hologram:diag()!.materialSource};
      });
      await perform('初始叠加模式不创建独立3D场景',async()=>{
        view.value='overlay';await mount('map');await wait(()=>{
          const value=document.querySelector('.vector-map-host')?.getAttribute('data-overlay-diagnostics');if(!value)return false;
          const d=JSON.parse(value) as OverlayDiagnostics;return d.active&&d.renderFrames>0&&d.navigationKey==='country:100000';
        },'cold wrapper overlay');await wait(()=>document.querySelector('.fui-earth-host')?.getAttribute('data-ready')==='true','cold wrapper ready bridge');check(!document.querySelector('.map-host canvas'),'Initial overlay created a second renderer');return {standaloneRenderer:false,readyBridge:true};
      });
      await perform('平滑玻璃目的地零地形准备',async()=>{
        const start=performance.now();view.value='3d';await nextTick();await wait(()=>host()?.dataset.loadPhase==='ready','smooth map');const d=host()!.dataset;
        check(d.resourceFamily==='hologram'&&d.overviewScope==='none'&&d.overviewPixels==='0','Unused geographic textures prepared');check(d.terrainHitProxies==='0'&&d.surfaceVariants==='hologram','Unused DEM/variants prepared');
        const requests=performance.getEntriesByType('resource').filter(entry=>entry.startTime>=start&&/earth-photographic|earth-map-photograph|earth-relief|earth-map-relief|terrain-diffuse|terrain-height|terrain-normal/.test(entry.name)).map(entry=>entry.name);check(!requests.length,'Unused surface images requested');
        return {family:d.resourceFamily,pixels:d.overviewPixels,variants:d.surfaceVariants,proxies:d.terrainHitProxies,unusedRequests:requests};
      });
      await perform('材质切换按需准备且保留导航',async()=>{
        const canvas=host()!.querySelector('canvas'),code=host()!.dataset.mapCode;
        for(const style of ['terrain-glass','classic','smooth-glass'] as FuiMapStyle[]){
          material.value=style;await nextTick();
          await wait(()=>host()?.dataset.resourceFamily===(style==='smooth-glass'?'hologram':'terrain')&&host()?.dataset.loadPhase==='ready','material '+style);
          await sleep(200);check(host()!.querySelector('canvas')===canvas,'Material change replaced renderer');check(host()!.dataset.mapCode===code,'Material change reset scope');
        }
        return {sameCanvas:true,scope:code,styles:['terrain-glass','classic','smooth-glass']};
      });
      await perform('3D与叠加模式往返保留行政层级',async()=>{
        view.value='overlay';await nextTick();await wait(()=>{const value=document.querySelector('.vector-map-host')?.getAttribute('data-overlay-diagnostics');if(!value)return false;const d=JSON.parse(value) as OverlayDiagnostics;return d.active&&d.renderFrames>0&&d.navigationKey==='country:100000';},'wrapper overlay');
        check(window.__SUMMER_MAP_OVERLAY_DIAGNOSTICS__?.navigationKey==='country:100000','Overlay lost navigation');view.value='3d';await nextTick();await wait(()=>host()?.dataset.loadPhase==='ready','3D return');check(host()!.dataset.mapCode==='100000','3D return lost scope');return {scope:host()!.dataset.mapCode};
      });
      await perform('冷启动省级视图切换等待目标真实首帧',async()=>{
        hybridPath.value=[{scope:'country',regionName:'中国',code:'100000'},{scope:'province',regionName:'浙江省',code:'330000'}];hybridView.value='overlay';
        await mount('hybrid');const key=mapNavigationKey(hybridPath.value);
        await wait(()=>Boolean(ready.value&&hybrid.value?.getRevealDiagnostics().overlay?.navigationKey===key),'cold province overlay');
        check(!host()?.querySelector('canvas'),'The cold overlay eagerly created a standalone country renderer');
        const operation=hybrid.value!.switchView('3d');await nextTick();
        check(document.querySelector('.hybrid-map')?.getAttribute('data-current-view')==='overlay','The source was hidden before the destination was prepared');
        check(document.querySelector('.hybrid-map')?.getAttribute('data-pending-view')==='3d','The requested target was not tracked');
        check(await operation,'Cold province 3D preparation failed');await nextTick();
        const result=hybrid.value!.getRevealDiagnostics();
        check(result.view==='3d'&&!result.pending&&result.threeNavigationKey===key,'The visible 3D destination used the wrong administrative scope');
        check(host()?.dataset.mapCode==='330000'&&host()?.dataset.loadPhase==='ready','The parent revealed a not-yet-drawn 3D map');
        check(Boolean(result.three?.modelId),'Missing actual standalone model identity');
        return {navigationKey:key,visible:result.view,modelId:result.three?.modelId};
      });
      await perform('缓存视图往返复用已准备的模型与材质',async()=>{
        const initial=hybrid.value!.getRevealDiagnostics(),threeModel=initial.three!.modelId,threeCanvas=host()!.querySelector('canvas');
        const overlayCreatedAt=initial.overlay!.firstFrameAtMs,overlayVersion=initial.overlay!.geometryVersion;
        check(typeof overlayCreatedAt==='number','Missing original overlay frame identity');
        check(await hybrid.value!.switchView('overlay'),'Warm overlay preparation failed');await nextTick();
        const overlayReady=hybrid.value!.getRevealDiagnostics();
        check(overlayReady.view==='overlay'&&overlayReady.overlay?.navigationKey===initial.navigationKey,'Overlay committed before the matching geographic model');
        check(overlayReady.overlay?.firstFrameAtMs===overlayCreatedAt&&overlayReady.overlay?.geometryVersion===overlayVersion,'Returning to overlay rebuilt an unchanged model');
        check(overlayReady.vector?.navigationKey===initial.navigationKey&&overlayReady.vector.overlay&&overlayReady.vector.renderFrames>0,'Overlay was revealed before its explicit warm frame');
        check(await hybrid.value!.switchView('3d'),'Warm 3D preparation failed');await nextTick();
        const returned=hybrid.value!.getRevealDiagnostics();
        check(returned.three?.modelId===threeModel&&host()!.querySelector('canvas')===threeCanvas,'Returning to 3D rebuilt an unchanged model or renderer');
        const obsolete=hybrid.value!.switchView('overlay');const cancel=hybrid.value!.switchView('3d');await Promise.all([obsolete,cancel]);await nextTick();
        check(hybrid.value!.getView()==='3d'&&!hybrid.value!.getRevealDiagnostics().pending,'An obsolete warm request revealed itself after cancellation');
        check(await hybrid.value!.switchView('overlay'),'Overlay preparation before vector-mode cancellation failed');await nextTick();
        const toPlain=hybrid.value!.switchView('2d');await nextTick();
        check(document.querySelector('.vector-map-stage')?.getAttribute('data-composition')==='overlay','Plain 2D removed the committed overlay before its view commit');
        await Promise.all([toPlain,hybrid.value!.switchView('overlay')]);await nextTick();
        check(hybrid.value!.getView()==='overlay'&&document.querySelector('.vector-map-stage')?.getAttribute('data-composition')==='overlay','Cancelling plain 2D left an overlay label on a plain map');
        check(await hybrid.value!.switchView('2d'),'Plain 2D commit failed');await nextTick();
        const toOverlay=hybrid.value!.switchView('overlay');await nextTick();await hybrid.value!.switchView('2d');await toOverlay;await nextTick();
        check(hybrid.value!.getView()==='2d'&&document.querySelector('.vector-map-stage')?.getAttribute('data-composition')==='single','Cancelling overlay did not restore the committed plain composition');
        check(await hybrid.value!.switchView('3d'),'3D restore failed');hybridView.value='3d';await nextTick();
        hybridView.value='overlay';await nextTick();hybridView.value='3d';await nextTick();
        await wait(()=>hybrid.value!.getView()==='3d'&&!hybrid.value!.getRevealDiagnostics().pending,'prop switch cancellation');
        return {navigationKey:initial.navigationKey,threeModel,overlayCreatedAt,overlayVersion,cancelledTargetRetainedSource:true,vectorCompositionRestored:true,propCancellation:true};
      });
      await perform('无切换器保持单渲染器，空闲时按需预备目标',async()=>{
        hybridShowSwitch.value=false;hybridView.value='overlay';await mount('hybrid');await wait(()=>ready.value,'no-switcher overlay');await sleep(1500);
        check(!host()?.querySelector('canvas')&&!hybrid.value!.getRevealDiagnostics().idle,'Overlay without a view switcher eagerly prepared a standalone renderer');
        hybridShowSwitch.value=true;hybridView.value='3d';await mount('hybrid');await wait(()=>ready.value&&host()?.dataset.loadPhase==='ready','idle source entrance');
        check(hybrid.value!.getView()==='3d'&&!document.querySelector('.vector-map-host'),'Idle preparation competed with the visible source entrance');
        await wait(()=>hybrid.value!.getRevealDiagnostics().idle?.ready===true,'idle alternate warm');
        const before=hybrid.value!.getRevealDiagnostics(),identity=before.overlay!.firstFrameAtMs;
        check(before.view==='3d'&&!before.pending&&before.idle?.target==='overlay'&&before.idle.navigationKey===before.navigationKey&&!before.overlay?.active,'Idle warming changed the visible view or navigation');
        check(await hybrid.value!.switchView('overlay'),'Prepared idle overlay switch failed');await nextTick();
        const after=hybrid.value!.getRevealDiagnostics();
        check(after.navigationKey===before.navigationKey&&after.overlay?.firstFrameAtMs===identity,'The first switch discarded its idle-prepared geographic model');
        return {noSwitcherStandalone:false,idleTarget:before.idle?.target,navigationKey:after.navigationKey,modelReused:true};
      });
      await perform('全国重置取消过期路径并保留当前渲染器',async()=>{
        const current=hybrid.value!.getView(),canvas=document.querySelector('.vector-map-host canvas');
        const obsolete=hybrid.value!.syncNavigation([{scope:'country',code:'100000',regionName:'中国'},{scope:'province',code:'330000',regionName:'浙江省'}]);
        const reset=hybrid.value!.resetToCountry();check(await reset,'Country reset did not produce a matching drawn frame');await obsolete;await nextTick();
        const result=hybrid.value!.getRevealDiagnostics();
        check(mapNavigationKey(hybrid.value!.getNavigation())==='country:100000'&&result.navigationKey==='country:100000'&&result.overlay?.navigationKey==='country:100000','An obsolete drill replaced the national reset');
        check(hybrid.value!.getView()===current&&document.querySelector('.vector-map-host canvas')===canvas,'Country reset changed renderer selection or recreated the canvas');
        return {navigationKey:result.navigationKey,view:current,sameCanvas:true,stalePathCancelled:true};
      });
      await perform('叠加入场共享相机，署名可收起并重新展开',async()=>{
        hybridShowSwitch.value=false;hybridView.value='overlay';await mount('hybrid');await wait(()=>ready.value,'motion overlay ready');
        const before=hybrid.value!.getRevealDiagnostics(),canvas=document.querySelector('.vector-map-host canvas'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        check(before.vector?.entrance?.cameraSource==='maplibre'&&before.overlay?.cameraSource==='maplibre','Entrance uses an independent camera');
        const bearing=before.vector!.entrance!.camera?.bearing,projection=JSON.stringify(before.overlay!.projectionMatrix);
        if(!reduced){await sleep(100);const moving=hybrid.value!.getRevealDiagnostics();check(moving.vector?.entrance?.camera?.bearing!==bearing&&JSON.stringify(moving.overlay!.projectionMatrix)!==projection,'Entrance does not move the actual shared geographic camera');}
        await wait(()=>hybrid.value!.getRevealDiagnostics().vector?.entrance?.phase==='done','camera entrance completion');
        const motion=hybrid.value!.getRevealDiagnostics().vector!.entrance!;
        check(reduced?motion.plays===0:motion.endedAt-motion.startedAt>=650,'Entrance timing or reduced-motion behavior changed');
        check(Math.abs(motion.camera!.bearing-motion.target!.bearing)<.01&&Math.abs(motion.camera!.pitch-motion.target!.pitch)<.01&&hybrid.value!.getRevealDiagnostics().navigationKey===before.navigationKey,'Entrance did not restore the exact camera/navigation target');
        check(document.querySelector('.vector-map-host canvas')===canvas,'Entrance created a second canvas');
        const control=document.querySelector<HTMLElement>('.maplibregl-ctrl-attrib')!,inner=control.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-inner')!;
        check(Boolean(inner.querySelector('a[href*="openstreetmap.org"]'))&&Boolean(inner.querySelector('a[href*="openmaptiles.org"]')),'Required attribution links are missing');
        check(control.classList.contains('maplibregl-compact-show'),'Attribution was hidden before its visible exposure period');
        await wait(()=>hybrid.value!.getRevealDiagnostics().vector?.attribution?.collapsed===true,'five-second attribution collapse');
        check(Number(hybrid.value!.getRevealDiagnostics().vector?.attribution?.visibleMs)>=5000&&getComputedStyle(inner).display==='none','Attribution collapsed before five visible seconds');
        control.querySelector<HTMLElement>('summary')!.click();await nextTick();await sleep(150);
        check(control.classList.contains('maplibregl-compact-show')&&getComputedStyle(inner).display!=='none','The native information control cannot reopen its retained credits');
        check(hybrid.value!.getRevealDiagnostics().vector?.attribution?.manual===true&&!hybrid.value!.getRevealDiagnostics().vector?.attribution?.collapsed,'Manual attribution reopening is not retained');
        return {sharedCamera:true,durationMs:Math.round(motion.endedAt-motion.startedAt),reducedMotion:reduced,visibleCreditMs:hybrid.value!.getRevealDiagnostics().vector?.attribution?.visibleMs,attributionToggle:true};
      });
      await perform('环形加载保留可读提示和旋转动效',async()=>{
        await mount('loader');const loader=document.querySelector<HTMLElement>('.scene-loader')!,instrument=loader.querySelector<HTMLElement>('.scene-loader__instrument')!,rings=[...loader.querySelectorAll<HTMLElement>('.scene-loader__instrument i')],label=loader.querySelector<HTMLElement>('span')!;
        check(loader.getAttribute('role')==='status'&&label.textContent?.includes('地图加载中')&&rings.length===2&&Boolean(instrument.querySelector('b')),'Loading status has no accessible label or two-ring instrument');
        await sleep(450);
        check(Math.abs(instrument.getBoundingClientRect().width-78)<1,'The circular loading instrument is too small to read');
        const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,animations=rings.map(ring=>getComputedStyle(ring).animationName),before=getComputedStyle(rings[0]).transform;
        check(animations.every(name=>reduced?name==='none':name.startsWith('loader-orbit')),'The rendered loading rotation does not honor reduced motion');
        if(!reduced){await sleep(100);check(getComputedStyle(rings[0]).transform!==before,'The circular loading rings do not actually rotate');}
        check(label.getBoundingClientRect().width>20&&label.getBoundingClientRect().height>=12&&getComputedStyle(label).clipPath==='none','The loading label is not visibly readable');
        check(getComputedStyle(loader).backgroundColor==='rgba(0, 0, 0, 0)','The loader covers the visible globe with an opaque background');
        return {rings:rings.length,animations,reducedMotion:reduced,readableLabel:true,transparentBackdrop:true};
      });
      await perform('无未处理异常或着色器错误',async()=>{check(!errors.length,errors.join('\n'));check(!window.__SUMMER_MAP_2D_DIAGNOSTICS__?.errors.length,'Provider errors');check(!window.__SUMMER_MAP_OVERLAY_DIAGNOSTICS__?.errors.length,'Custom layer errors');return {errors};});
    }catch{ /* Leave the failing case and live frame available. */ }
    finally{try{if(!results.value.some(r=>r.status==='fail')){overlay.value=true;path.value=[{scope:'country',regionName:'中国',code:'100000'}];await mount('overlay');await wait(drawn,'final overlay frame');await wait(()=>Boolean(window.__SUMMER_MAP_2D_DIAGNOSTICS__?.firstIdle),'final basemap idle');}}catch(error){results.value.push({name:'最终预览首帧',status:'fail',detail:String(error)});}running.value=false;status.value=results.value.some(r=>r.status==='fail')?'failed':'passed';}
  }
  onMounted(()=>{if(query.get('autorun')==='1')void run();});
  return()=>h('main',{'data-v3-status':status.value},[
    h('section',{class:'scene'},[scene.value==='overlay'?h(VectorMap,{ref:vector,active:true,overlay:overlay.value,overlaySurface:material.value,primaryColor:color.value,palette:getFuiVectorMapPalette(resolveFuiEarthThemeId('glacier',color.value)),navigation:path.value,onReady:()=>{ready.value=true;},onNavigationChange:(next:MapNavigationPath)=>{const d=diag();navigationEvents.push({key:mapNavigationKey(next),drawnKey:d?.navigationKey,phase:d?.buildPhase,frames:d?.renderFrames});path.value=next;}}):scene.value==='map'?h(FuiEarth,{initialMode:'china',earthPresentation:'hologram',skin:'glacier',primaryColor:color.value,mapStyle:material.value,mapWave:'hex',mapView:view.value,quality:'balanced'}):scene.value==='hybrid'?h(ChinaMap,{ref:hybrid,active:true,showViewSwitch:hybridShowSwitch.value,skin:resolveFuiEarthThemeId('glacier',color.value),mapPresentation:'textured-hex',surfaceVariant:'hologram-glass',initialView:hybridView.value,initialNavigation:hybridPath.value,quality:'balanced',onReady:()=>{ready.value=true;}}):scene.value==='loader'?h(FuiSceneLoader,{label:'地图加载中'}):null]),
    h('aside',[h('strong','Three Scope Map 3.0 · 后台回归'),h('span',status.value),h('button',{onClick:run,disabled:running.value},'运行回归'),h('pre',{id:'v3-report'},JSON.stringify(report(),null,2))])
  ]);
}});
window.__SUMMER_MAP_2D_CONFIG__={controls:{top:'20px',right:'24px',bottom:'24px'}};
createApp(app).mount('#app');
const css=document.createElement('style');css.textContent=`html,body,#app,main{margin:0;width:100%;height:100%;font:12px system-ui;background:#070d14;color:#d8e8ef}*{box-sizing:border-box}.scene{position:absolute;inset:0 0 94px;overflow:hidden}.scene>.vector-map-stage,.scene>.fui-earth-host{position:absolute;inset:0}aside{position:absolute;bottom:0;left:0;right:0;height:94px;border-top:1px solid #264050;padding:12px 18px;display:flex;gap:20px;align-items:flex-start;background:#09121b}aside pre{margin:0;height:70px;flex:1;overflow:auto;color:#819ba9;font-size:10px}button{background:#112c40;color:#baddf2;border:1px solid #39627e;padding:6px 10px}`;document.head.append(css);
