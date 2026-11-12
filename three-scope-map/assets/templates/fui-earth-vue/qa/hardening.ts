// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Isolated real-WebGL integration entry. No native input or product test hooks.
import {createApp,defineComponent,h,onMounted,ref,nextTick} from 'vue';
import * as THREE from 'three';
import VectorMap from '../src/components/map/VectorMap.vue';
import ZhejiangThreeMap from '../src/components/map/ZhejiangThreeMap.vue';
import FuiEarth from '../src/components/map/FuiEarth.vue';
import {FuiGlassHdrPass} from '../src/components/map/fuiGlassHdrPass';
import {FUI_GLASS_CAPABILITIES} from '../src/components/map/fuiGlassCapabilities';
import {FUI_SCENE_PRESETS} from '../src/components/map/fuiMapPresentation';
import {initialMapState} from '../src/components/map/mapDataAdapter';
import {getFuiVectorMapPalette} from '../src/components/map/fuiEarthTheme';
import type {MapQuality} from '../src/components/map/mapQuality';
import type {MapNavigationPath} from '../src/components/map/mapNavigation';
import type {OverlayDiagnostics} from '../src/components/map/vectorMap3dLayer';
import type {GeoFeatureCollection} from '../src/types/geo';
import china from '../src/assets/maps/china.json';
import zhejiang from '../src/assets/maps/zhejiang.json';
import world from '../src/assets/maps/world.earth-render.json';

type OverlayApi={getCanvas:()=>HTMLCanvasElement|undefined;getOverlayDiagnostics:()=>OverlayDiagnostics|undefined;highlightFeature:(key:string)=>void};
type RegionalApi={syncNavigation:(path:MapNavigationPath)=>Promise<void>};
type EarthApi={enterChina:()=>void;returnToEarth:()=>void;getDiagnostics:()=>{phase:string;lighting:{outputMode:string;hologramEnvironment:string;bloom:{enabled:boolean}}}};
type Probe={probeCapabilities:()=>{halfFloat:boolean;samples:number[]};framebufferComplete:()=>boolean};
const probe=FuiGlassHdrPass.prototype as unknown as Probe;
const originalProbe=probe.probeCapabilities,originalComplete=probe.framebufferComplete;
const originalFloatSupport=FUI_GLASS_CAPABILITIES.supportsHalfFloat;
let currentMapScene:THREE.Scene|undefined;
const originalAdd=THREE.Scene.prototype.add;
THREE.Scene.prototype.add=function(...objects:THREE.Object3D[]){
  if(objects.some(object=>object.userData.fuiMapCode))currentMapScene=this;
  return originalAdd.apply(this,objects);
};
const query=new URLSearchParams(location.search),scenario=query.get('case')??'all';
const status=ref('preparing'),scene=ref<'overlay'|'region'|'earth'|'off'>('overlay'),generation=ref(0);
const quality=ref<MapQuality>('high'),vector=ref<OverlayApi>(),regional=ref<RegionalApi>();
const earth=ref<EarthApi>(),earthMode=ref<'earth'|'china'>('earth');
const path=ref<MapNavigationPath>([{scope:'country',regionName:'中国',code:'100000'}]);
const results=ref<{name:string;status:'pass'|'fail';detail:unknown}[]>([]),errors:string[]=[];
const originalState={...initialMapState};
window.addEventListener('error',event=>errors.push(event.message));
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
const originalError=console.error;console.error=(...values)=>{errors.push(values.map(String).join(' '));originalError(...values);};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(value:unknown,message:string)=>{if(!value)throw Error(message);};
const wait=async(test:()=>boolean,label:string)=>{const start=performance.now();while(!test()){
  if(performance.now()-start>60000)throw Error('Timeout: '+label);await sleep(30);
}await nextTick();};
const diag=()=>vector.value?.getOverlayDiagnostics();
const drawn=()=>Boolean(diag()?.buildPhase==='ready'&&diag()!.renderFrames>0&&diag()!.features>0);
const host=()=>document.querySelector<HTMLElement>('.map-host');
const report=()=>({status:status.value,scenario,results:results.value,errors,
  platform:{userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,devicePixelRatio:devicePixelRatio},
  overlay:diag(),map:host()?{...host()!.dataset}:undefined});
async function perform(name:string,run:()=>Promise<unknown>){
  const start=performance.now();try{results.value.push({name,status:'pass',detail:{...await run() as object,wallMs:Math.round(performance.now()-start)}});}
  catch(error){results.value.push({name,status:'fail',detail:String(error)});throw error;}
}
async function mount(next:'overlay'|'region'|'earth'){
  scene.value='off';await nextTick();await sleep(80);generation.value++;scene.value=next;await nextTick();
}
function center(){
  let value:number[]|undefined;
  currentMapScene?.traverse(object=>{
    if(value||object.name!=='fui-hologram-region-coat')return;
    const material=(object as THREE.Mesh).material as THREE.ShaderMaterial;
    const c=material.uniforms.uCapCenter.value as THREE.Vector2;value=[c.x*180/Math.PI,c.y*180/Math.PI];
  });return value;
}
async function run(){
  status.value='running';
  try{
    if(scenario==='all'||scenario==='quality'){
      await perform('高低质量切换贯通同一叠加画布',async()=>{
        await wait(drawn,'initial overlay');const canvas=vector.value!.getCanvas(),version=diag()!.geometryVersion;
        check(diag()!.quality==='high'&&diag()!.reflectionEnabled===true,'High budget missing live reflection');
        const highFrames=diag()!.renderFrames;
        quality.value='low';await nextTick();await wait(()=>drawn()&&diag()!.quality==='low'&&diag()!.renderFrames>highFrames,'low quality frame');
        const low=diag()!;check(low.reflectionEnabled===false&&low.glassBloom===false&&low.hdrSamples===0,'Low retains expensive reflection/Bloom/MSAA');
        check(Math.max(...low.hdrSize!)<=1024,'Low target exceeds budget');
        check(vector.value!.getCanvas()===canvas&&low.geometryVersion===version,'Quality rebuilt geography or canvas');
        const lowFrames=diag()!.renderFrames;
        quality.value='high';await nextTick();await wait(()=>drawn()&&diag()!.quality==='high'&&diag()!.renderFrames>lowFrames&&diag()!.reflectionEnabled===true,'restored high');
        return{low,high:diag(),sameCanvas:true};
      });
      await perform('取消准备只提交最新行政范围',async()=>{
        path.value=[...path.value,{scope:'province',regionName:'浙江省',code:'330000'}];await nextTick();
        await wait(()=>diag()?.buildPhase==='building'&&diag()?.pendingNavigationKey?.endsWith('330000')===true,'province preparation');
        path.value=path.value.slice(0,1);await nextTick();
        await wait(()=>drawn()&&diag()!.navigationKey==='country:100000'&&!diag()!.pendingNavigationKey,'latest China');
        check(diag()!.features===34,'Stale provincial scene committed');
        vector.value!.highlightFeature('330000');await wait(()=>Number(diag()?.hoverProgress)>.95,'selected lift');
        vector.value!.highlightFeature('');await wait(()=>Number(diag()?.hoverProgress)<.01,'resting lift');
        await sleep(200);const frames=diag()!.renderFrames;await sleep(300);
        check(diag()!.renderFrames-frames<=2,'Settled layer repaints continuously');return{features:34,idleFrames:diag()!.renderFrames-frames};
      });
    }
    if(scenario==='all'||scenario==='fallback'){
      for(const mode of ['ldr','direct'] as const)await perform('真实 WebGL '+mode+' 降级绘制',async()=>{
        FUI_GLASS_CAPABILITIES.supportsHalfFloat=()=>false;
        probe.probeCapabilities=()=>({halfFloat:false,samples:[]});
        probe.framebufferComplete=mode==='direct'?()=>false:originalComplete;
        quality.value='balanced';await mount('overlay');await wait(drawn,mode+' frame');
        const d=diag()!;check(d.glassMode===mode&&!d.hdrActive&&!d.glassBloom&&d.hdrSamples===0,'Fallback mode did not reach actual renderer');
        check(d.pmremActive===false&&d.reflectionEnabled===false,'A no-float scene retained PMREM/Reflector targets');
        check(!d.errors.length,'Fallback diagnostics contain errors');
        const canvas=vector.value!.getCanvas()!,gl=canvas.getContext('webgl2')!;
        check(gl.getError()===gl.NO_ERROR,'Fallback leaves a WebGL error');return{mode,diagnostics:d,actualGpuRender:true};
      });
      probe.probeCapabilities=originalProbe;probe.framebufferComplete=originalComplete;
      FUI_GLASS_CAPABILITIES.supportsHalfFloat=originalFloatSupport;
    }
    if(scenario==='all'||scenario==='scopes'){
      await perform('外国范围无中国附图且光学中心随地区变化',async()=>{
        const foreign=(world as unknown as GeoFeatureCollection).features.find(feature=>feature.properties.name==='Germany')!;
        check(foreign,'Bundled real Germany geography missing');
        Object.assign(initialMapState,{scope:'country',regionName:'德国',code:'DEU',geoData:{type:'FeatureCollection',features:[foreign]}});
        await mount('region');await wait(()=>host()?.dataset.loadPhase==='ready','foreign map');
        check(document.querySelectorAll('.south-sea-inset.is-visible').length===0,'China inset remained visible on Germany');
        const opticalCenter=center();check(opticalCenter&&opticalCenter[0]>5&&opticalCenter[0]<16&&opticalCenter[1]>45,'Optics still centered on China');
        return{code:host()!.dataset.mapCode,opticalCenter,inset:false};
      });
      await perform('省级初始地图返回全国恢复南海与中国光学基线',async()=>{
        Object.assign(initialMapState,{scope:'province',regionName:'浙江省',code:'330000',geoData:zhejiang});
        await mount('region');await wait(()=>host()?.dataset.loadPhase==='ready','initial province');
        check(document.querySelectorAll('.south-sea-inset.is-visible').length===0,'Province displays country inset');
        await regional.value!.syncNavigation([{scope:'country',regionName:'中国',code:'100000'}]);
        await wait(()=>host()?.dataset.loadPhase==='ready'&&host()?.dataset.mapCode==='100000','returned China');
        check(document.querySelectorAll('.south-sea-inset.is-visible').length===1,'China inset did not rebuild from current scope');
        const opticalCenter=center();check(opticalCenter&&Math.abs(opticalCenter[0]-103.6)<.001&&Math.abs(opticalCenter[1]-35.2)<.001,'China optical baseline changed');
        return{code:'100000',opticalCenter,islands:host()!.dataset.southSeaIslands,segments:host()!.dataset.southSeaSegments};
      });
    }
    if(scenario==='all'||scenario==='earth-fallback'){
      await perform('无浮点目标的全息地球进入地图并返回',async()=>{
        Object.assign(initialMapState,originalState);FUI_GLASS_CAPABILITIES.supportsHalfFloat=()=>false;
        earthMode.value='earth';await mount('earth');await wait(()=>earth.value?.getDiagnostics()?.phase==='ready','LDR hologram ready');
        const before=earth.value!.getDiagnostics(),element=document.querySelector<HTMLElement>('.earth-view')!;
        check(before.lighting.outputMode==='ldr'&&!before.lighting.bloom.enabled,'Earth still needs HalfFloat/Bloom');
        check(element.dataset.loadEnvironment==='neutral-rgba8','Earth still prepared a floating environment');
        const canvas=element.querySelector('canvas')!,gl=canvas.getContext('webgl2')!;
        check(gl.getError()===gl.NO_ERROR,'LDR Earth leaves a GPU error');
        earth.value!.enterChina();await wait(()=>earthMode.value==='china'&&host()?.dataset.loadPhase==='ready','LDR China handoff');
        check(host()?.dataset.glassMode==='ldr'&&host()?.dataset.glassPmrem==='false','Destination did not retain the no-float budget');
        earth.value!.returnToEarth();await wait(()=>earthMode.value==='earth'&&earth.value?.getDiagnostics()?.phase==='ready','LDR Earth return');
        return{earth:before.lighting,destination:'ldr',returned:true,forcedCapabilityBranch:true};
      });
    }
    check(!errors.length,errors.join('\n'));status.value='passed';
  }catch{status.value='failed';}
  finally{probe.probeCapabilities=originalProbe;probe.framebufferComplete=originalComplete;FUI_GLASS_CAPABILITIES.supportsHalfFloat=originalFloatSupport;Object.assign(initialMapState,originalState);}
}
createApp(defineComponent({setup(){onMounted(()=>void run());return()=>h('main',{'data-hardening-status':status.value},[
  h('section',{class:'scene'},[scene.value==='overlay'?h(VectorMap,{ref:vector,key:generation.value,active:true,overlay:true,overlaySurface:'smooth-glass',overlaySkin:'glacier',quality:quality.value,palette:getFuiVectorMapPalette('glacier'),navigation:path.value}):scene.value==='region'?h(ZhejiangThreeMap,{ref:regional,key:generation.value,active:true,skin:'glacier',mapPresentation:'textured-hex',surfaceVariant:'hologram-glass',quality:'balanced',useInternalHudRing:true}):scene.value==='earth'?h(FuiEarth,{...FUI_SCENE_PRESETS.hologram,ref:earth,key:generation.value,skin:'glacier',quality:'low',onModeChange:(mode:'earth'|'china')=>{earthMode.value=mode;}}):null]),
  h('pre',{id:'hardening-report'},JSON.stringify(report(),null,2)),
]);}})).mount('#app');
const style=document.createElement('style');style.textContent='html,body,#app,main{margin:0;width:100%;height:100%;background:#060b10}.scene{position:absolute;inset:0 0 90px}#hardening-report{position:absolute;bottom:0;left:0;right:0;height:86px;overflow:auto;margin:0;color:#9ab6ca;font:10px monospace}.map-label-layer{display:none!important}';document.head.append(style);
