// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Browser integration tests exercise the public component API on real WebGL.
// This page is an explicit QA build and is absent from the normal app entry.
import {createApp,defineComponent,h,nextTick,ref,provide,onMounted} from 'vue';
import FuiEarth from '../src/components/map/FuiEarth.vue';
import {FUI_EARTH_IMAGE_LOADER,loadEarthImage,type EarthImageLoader} from '../src/components/map/fuiEarthResources';
import type {FuiEarthLoading,FuiSkinFailure,FuiPolarStyle} from '../src/components/map/fuiEarthLifecycle';
import type {FuiEarthPresentation} from '../src/components/map/fuiEarthHologram';
import {getFuiSkinMaterial,type FuiEarthSkinId} from '../src/components/map/fuiEarthTheme';
import {getFuiPhotographicMaterial} from '../src/components/map/fuiPhotographicOptics';

type Lighting={outputMode:'hdr'|'ldr';targetType:number;hologramEnvironment:'none'|'pmrem'|'neutral-rgba8';toneMapping:number;exposure:number;bloom:{enabled:boolean;strength?:number;radius?:number;threshold?:number};atmosphere:{radius:number;base:number}[]};
type SharedOpticalLighting=Omit<Lighting,'hologramEnvironment'>;
// Compare the shared optical response, not presentation-specific resource
// dependencies (surface has no PMREM while the glass cap intentionally does).
function sharedOpticalLighting(lighting:Lighting):SharedOpticalLighting{
  return{outputMode:lighting.outputMode,targetType:lighting.targetType,toneMapping:lighting.toneMapping,exposure:lighting.exposure,
    bloom:{enabled:lighting.bloom.enabled,strength:lighting.bloom.strength,radius:lighting.bloom.radius,threshold:lighting.bloom.threshold},
    atmosphere:lighting.atmosphere.map(({radius,base})=>({radius,base}))};
}
type Diagnostics={lighting:Lighting;optics:{fill:number[];scatter:number[];fillEnergy:number;fillPolicy:string};presentation:FuiEarthPresentation;hologram?:{pattern:'dots'|'hex';patternCells:number;oceanFill:boolean;radius:number;sharedAerial:boolean;focusRadius:number;focus?:{surface:'glass';provinceBoundaries:number;lift:number;hoverLift:number;topVertices:number;baseVertices:number;wallVertices:number;edgeVertices:number;baseSuppressed:boolean}};phase:string;skin:FuiEarthSkinId;requested:FuiEarthSkinId;required:string[];resources:Record<string,{status:string;uploaded:boolean;attempt:number}>;timings:Record<string,string>;ready:boolean};
type PublicEarth={getDiagnostics:()=>Diagnostics;enterChina:()=>void;returnToEarth:()=>void;retrySkin:()=>void;retry:()=>void};
type Result={name:string;status:'pass'|'fail';detail:string};
const app=defineComponent({setup(){
  const earth=ref<PublicEarth>(),skin=ref<FuiEarthSkinId>('glacier'),polar=ref<FuiPolarStyle>('natural');
  const initialMode=ref<'earth'|'china'>('earth'),presentation=ref<FuiEarthPresentation>('surface');
  const generation=ref(0),mounted=ref(false),running=ref(false),done=ref(false),results=ref<Result[]>([]),mode=ref('earth');
  let referenceLighting:SharedOpticalLighting|undefined;
  let referenceFillEnergy=0;
  let telemetry:{longitude:number;latitude:number;heading:number}|undefined;
  let fail:'day'|'photograph'|undefined,skinErrors:FuiSkinFailure[]=[],phaseHistory:{phase:string;at:number}[]=[],expectedFailures=0;
  const exceptions:string[]=[];
  window.addEventListener('error',e=>exceptions.push(e.message));window.addEventListener('unhandledrejection',e=>exceptions.push(String(e.reason)));
  const originalError=console.error;console.error=(...args)=>{exceptions.push(args.map(String).join(' '));originalError(...args);};
  const imageLoader:EarthImageLoader=(url,options)=>{
    if(fail&&(fail==='day'?url.includes('earth-day'):url.includes('earth-photographic'))){expectedFailures++;return loadEarthImage('./fixtures/missing-texture.png',options);}
    return loadEarthImage(url,options);
  };
  provide(FUI_EARTH_IMAGE_LOADER,imageLoader);
  const diagnose=()=>earth.value?.getDiagnostics();
  const check=(condition:unknown,detail:string)=>{if(!condition)throw new Error(detail);};
  const checkHologramOptics=(d:Diagnostics)=>{
    const focus=d.hologram?.focus;
    check(focus?.surface==='glass'&&focus.provinceBoundaries>30&&focus.baseVertices>100,'China glass or its province boundaries are missing');
    check(!!focus&&focus.baseSuppressed&&focus.topVertices>100&&focus.wallVertices>0&&focus.edgeVertices>0,'Raised China is missing its surface, sides, edge or base suppression');
    check(d.hologram!.focusRadius>=2+focus!.lift-.00001&&d.hologram!.focusRadius<=2+focus!.lift+focus!.hoverLift+.00001,'The geographic focus did not retain its raised radius');
    check(d.optics.fillPolicy==='emissive-equal-energy','Hologram retained a neutral isolated rim');
    check(Math.abs(d.optics.fillEnergy-referenceFillEnergy)<.000001,'Hologram tint added atmospheric energy');
    const fill=d.optics.fill,scatter=d.optics.scatter;
    const cross=[fill[1]*scatter[2]-fill[2]*scatter[1],fill[2]*scatter[0]-fill[0]*scatter[2],fill[0]*scatter[1]-fill[1]*scatter[0]];
    check(Math.hypot(...cross)<.000001,'Atmospheric fill stopped following the current emission hue');
  };
  const wait=async(predicate:()=>boolean,label:string,timeout=60000)=>{
    const start=performance.now();while(!predicate()){
      if(performance.now()-start>timeout)throw new Error('Timeout: '+label);
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    await nextTick();
  };
  const perform=async(name:string,run:()=>Promise<string>)=>{
    try{results.value.push({name,status:'pass',detail:await run()});}catch(error){results.value.push({name,status:'fail',detail:String(error)});throw error;}
  };
  const mount=async()=>{mounted.value=false;await nextTick();generation.value++;mode.value=initialMode.value;telemetry=undefined;phaseHistory=[];skinErrors=[];mounted.value=true;await nextTick();};
  async function run(){
    if(running.value)return;running.value=true;done.value=false;results.value=[];exceptions.length=0;expectedFailures=0;
    try{
      presentation.value='surface';initialMode.value='earth';fail='day';skin.value='glacier';polar.value='natural';await mount();
      await perform('完整首屏依赖与明确的就绪状态',async()=>{
        await wait(()=>diagnose()?.phase==='ready','initial ready');const d=diagnose()!;
        referenceLighting=sharedOpticalLighting(d.lighting);referenceFillEnergy=d.optics.fillEnergy;
        const photo=getFuiPhotographicMaterial('glacier');
        check(d.lighting.exposure===photo.exposure&&d.lighting.bloom.strength===photo.bloom&&d.lighting.bloom.radius===photo.bloomRadius&&d.lighting.bloom.threshold===photo.bloomThreshold,'Photographic first frame did not use its complete optical baseline');
        check(d.required.includes('photoRelief')&&d.resources.photoRelief?.uploaded,'Photographic first frame lost its paired historical relief');
        check(!d.required.includes('glassEdges')&&d.resources.glassEdges?.status!=='ready','Entity first frame acquired the unused glass-edge atlas');
        check(d.required.every(id=>d.resources[id]?.status==='ready'&&d.resources[id]?.uploaded),'Visible sampler was not prepared');
        check(d.resources.day?.status!=='ready','Original day map unexpectedly gated photographic terrain');
        const phases=phaseHistory.map(e=>e.phase);check(phases.includes('loading')&&phases.includes('warming')&&phases.includes('entering')&&phases.includes('ready'),'Missing loading phase');
        check(Number(d.timings.loadReadyAtMs)>=Number(d.timings.loadIntroEndAtMs)-20,'Ready was emitted before the intro completed');
        return JSON.stringify({introStart:d.timings.loadIntroAtMs,visible:d.timings.loadVisibleAtMs,ready:d.timings.loadReadyAtMs,required:d.required});
      });
      const canvas=document.querySelector('.earth-view canvas');
      await perform('换肤失败保留原画面',async()=>{
        await wait(()=>diagnose()?.resources.day?.status==='error','optional failure');skin.value='original';await nextTick();
        await wait(()=>skinErrors.length>0,'skin failure');check(diagnose()?.skin==='glacier','Failed skin replaced current skin');check(document.querySelector('.earth-view canvas')===canvas,'Failed skin rebuilt canvas');
        return 'Injected missing day image; glacier stayed visible on the same WebGL canvas';
      });
      await perform('换肤重试与快速连续切换',async()=>{
        fail=undefined;earth.value!.retrySkin();await wait(()=>diagnose()?.skin==='original','retry original');
        for(const next of ['amber','alert','original','glacier'] as FuiEarthSkinId[]){skin.value=next;await nextTick();}
        await wait(()=>diagnose()?.skin==='glacier'&&diagnose()?.requested==='glacier','latest skin');
        check(document.querySelector('.earth-view canvas')===canvas,'Skin switch rebuilt canvas');return 'Retry succeeded; the newest request won without remounting';
      });
      await perform('地图 GPU 预热避开地球入场',async()=>{
        await wait(()=>document.querySelector<HTMLElement>('.map-host')?.dataset.hasFrame==='true','map prepared');
        const data=document.querySelector<HTMLElement>('.map-host')!.dataset,end=Number(diagnose()!.timings.loadIntroEndAtMs);
        const gpu=Number(data.gpuWarmStartedAtMs),context=Number(data.rendererCreateStartedAtMs),pmrem=Number(data.pmremStartedAtMs);
        check(gpu>=end&&context>=end&&pmrem>=end,'Destination context/PMREM/GPU preparation overlapped the Earth intro');
        return JSON.stringify({rendererStartedAtMs:context,pmremStartedAtMs:pmrem,gpuStartedAtMs:gpu,introEndedAtMs:end});
      });
      await perform('点击下钻与返回保留状态',async()=>{
        earth.value!.enterChina();await wait(()=>mode.value==='china','China entry');
        await wait(()=>document.querySelector<HTMLElement>('.map-host')?.dataset.entryProgress==='1.000','map entrance');
        check(document.querySelector<HTMLElement>('.map-host')?.dataset.mapCode==='100000','Wrong geographic destination');
        earth.value!.returnToEarth();await wait(()=>mode.value==='earth','return Earth');check(diagnose()?.skin==='glacier','Return lost selected skin');check(document.querySelector('.earth-view canvas')===canvas,'Return rebuilt globe');return 'Country map and native entrance completed; returned to the preserved globe';
      });
      await perform('地图直达与当前视图重试',async()=>{
        initialMode.value='china';fail=undefined;await mount();
        await wait(()=>document.querySelector<HTMLElement>('.map-host')?.dataset.entryProgress==='1.000','direct map ready');
        check(!document.querySelector('.earth-view canvas'),'Direct map initialized an unnecessary Earth renderer');
        const previous=document.querySelector('.map-host canvas');earth.value!.retry();
        await wait(()=>!!document.querySelector('.map-host canvas')&&document.querySelector('.map-host canvas')!==previous&&document.querySelector<HTMLElement>('.map-host')?.dataset.entryProgress==='1.000','direct map retry');
        check(!document.querySelector('.earth-view canvas'),'Map retry initialized Earth');initialMode.value='earth';return 'Direct China and retry both completed the native map entrance without mounting Earth';
      });
      await perform('首屏失败可恢复',async()=>{
        fail='photograph';skin.value='glacier';await mount();await wait(()=>diagnose()?.phase==='error','startup failure');
        check(!diagnose()?.timings.loadIntroAtMs,'Failed required resource started the intro');check(document.querySelector('.scene-loader[data-error="true"]'),'Missing actionable failure UI');
        fail=undefined;earth.value!.retry();await wait(()=>diagnose()?.phase==='ready','startup retry');
        check(diagnose()!.required.every(id=>diagnose()!.resources[id]?.status==='ready'),'Retry retained missing textures');return 'Missing required image blocked the intro; retry rebuilt a complete usable scene';
      });
      await perform('冰雪增强使用同一主贴图',async()=>{
        const d=diagnose()!,attempt=d.resources.photograph.attempt;polar.value='enhanced';await nextTick();await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));
        check(diagnose()!.resources.photograph.attempt===attempt,'Polar option fetched another surface');check(!d.required.includes('day'),'Polar option depends on the original family');polar.value='natural';return 'Natural/enhanced changed only the shared material option';
      });
      await perform('全息首屏不依赖地表贴图且海洋留空',async()=>{
        // Compare independent presentations after the previous hidden map's
        // one-shot GPU work settles, rather than timing a competing teardown.
        await wait(()=>document.querySelector<HTMLElement>('.map-host')?.dataset.hasFrame==='true','previous destination preparation');
        const failuresBefore=expectedFailures;fail='photograph';presentation.value='hologram';skin.value='glacier';await mount();
        await wait(()=>diagnose()?.phase==='ready','hologram ready');const d=diagnose()!;
        check(d.presentation==='hologram'&&d.required.length===0,'Hologram retained surface dependencies');
        check(d.hologram?.sharedAerial===true,'Hologram omitted the original Earth surface aerial-light contribution');checkHologramOptics(d);
        const preserved=getFuiSkinMaterial('glacier');
        check(d.lighting.exposure===preserved.exposure&&d.lighting.bloom.strength===preserved.bloom&&d.lighting.bloom.radius===preserved.bloomRadius&&d.lighting.bloom.threshold===preserved.bloomThreshold,'Photographic restoration changed hologram exposure/Bloom');
        check(JSON.stringify(d.lighting.atmosphere)===JSON.stringify(referenceLighting!.atmosphere),'Presentation changed the shared shell geometry');
        referenceLighting=sharedOpticalLighting(d.lighting);
        check(d.hologram?.pattern==='dots'&&Number.isInteger(d.hologram.patternCells)&&d.hologram.patternCells>1000&&d.hologram.oceanFill===false&&d.hologram.radius===2,'Incorrect regular dot pattern or hollow-ocean geometry');
        await wait(()=>!!telemetry&&Math.abs(telemetry.longitude-103.6)<.15&&Math.abs(telemetry.latitude-35.2)<.15,'China facing the camera');
        check(Math.min(telemetry!.heading,360-telemetry!.heading)<.3,'China view is rolled away from north-up');
        check(Object.values(d.resources).every(item=>item.status==='idle'),'Hologram requested surface textures');
        check(expectedFailures===failuresBefore,'Hologram fetched the deliberately missing surface image');
        return JSON.stringify({geometry:d.hologram,view:telemetry,lighting:d.lighting});
      });
      await perform('规则点阵换肤保留球面与 WebGL 画布',async()=>{
        const canvas=document.querySelector('.earth-view canvas'),failuresBefore=expectedFailures;
        for(const next of ['amber','alert','glacier'] as FuiEarthSkinId[]){skin.value=next;await nextTick();await wait(()=>diagnose()?.skin===next,'hologram '+next);checkHologramOptics(diagnose()!);}
        check(document.querySelector('.earth-view canvas')===canvas,'Hologram palette switch rebuilt renderer');
        check(expectedFailures===failuresBefore,'Hologram skin requested surface image');return 'All three palette changes used the same patterned sphere and canvas, without image requests';
      });
      await perform('全息下钻返回与样式切换',async()=>{
        const canvas=document.querySelector('.earth-view canvas');earth.value!.enterChina();await wait(()=>mode.value==='china','hologram China');
        await wait(()=>document.querySelector<HTMLElement>('.map-host')?.dataset.entryProgress==='1.000','hologram destination entrance');
        const map=document.querySelector<HTMLElement>('.map-host')!.dataset;
        check(map.resourceFamily==='hologram'&&map.overviewScope==='none'&&map.overviewPixels==='0'&&map.terrainHitProxies==='0'&&map.surfaceVariants==='hologram','Smooth-glass destination prepared photographic terrain or unused material variants');
        earth.value!.returnToEarth();await wait(()=>mode.value==='earth','hologram return');check(document.querySelector('.earth-view canvas')===canvas,'Hologram return rebuilt renderer');
        fail=undefined;presentation.value='surface';await nextTick();await wait(()=>diagnose()?.presentation==='surface'&&diagnose()?.phase==='ready','surface restored');
        check(diagnose()!.required.every(id=>diagnose()!.resources[id]?.status==='ready'),'Surface style did not restore textures');
        presentation.value='hologram';await nextTick();await wait(()=>diagnose()?.presentation==='hologram'&&diagnose()?.phase==='ready','hologram restored');
        return 'Native country entrance and return preserved the hologram; explicit style changes restored each complete presentation';
      });
      await perform('规则蜂窝与点阵使用独立球面纹样',async()=>{
        await wait(()=>document.querySelector<HTMLElement>('.map-host')?.dataset.hasFrame==='true','previous patterned destination preparation');
        const dotsCanvas=document.querySelector('.earth-view canvas'),dots=diagnose()!.hologram!,failuresBefore=expectedFailures;
        check(dots.pattern==='dots','The dot presentation did not expose its regular pattern');
        presentation.value='hologram-hex';await nextTick();
        await wait(()=>diagnose()?.presentation==='hologram-hex'&&diagnose()?.phase==='ready'&&diagnose()?.hologram?.pattern==='hex'&&document.querySelector('.earth-view canvas')!==dotsCanvas,'regular honeycomb ready');
        const d=diagnose()!;
        check(Number.isInteger(d.hologram!.patternCells)&&d.hologram!.patternCells>1000,'Honeycomb pattern has no defined cell population');
        check(d.hologram!.patternCells!==dots.patternCells,'Honeycomb retained the dot pattern scale');
        check(d.hologram!.oceanFill===false&&d.hologram!.radius===2,'Honeycomb filled the sea or changed the globe radius');
        check(d.hologram!.sharedAerial===true,'Honeycomb omitted the original Earth surface aerial-light contribution');checkHologramOptics(d);
        check(d.required.length===0&&Object.values(d.resources).every(item=>item.status==='idle'),'Honeycomb acquired surface images');
        check(JSON.stringify(sharedOpticalLighting(d.lighting))===JSON.stringify(referenceLighting),'Honeycomb replaced the shared Earth lighting');
        check(expectedFailures===failuresBefore,'Honeycomb fetched an injected missing image');
        return JSON.stringify({dots,honeycomb:d.hologram,lighting:d.lighting});
      });
      await perform('蜂窝换肤、下钻返回与点阵恢复',async()=>{
        const hexCanvas=document.querySelector('.earth-view canvas'),failuresBefore=expectedFailures;
        for(const next of ['amber','alert','glacier'] as FuiEarthSkinId[]){skin.value=next;await nextTick();await wait(()=>diagnose()?.skin===next,'honeycomb '+next);checkHologramOptics(diagnose()!);}
        check(document.querySelector('.earth-view canvas')===hexCanvas&&diagnose()?.hologram?.pattern==='hex','Honeycomb palette rebuilt or replaced the pattern');
        check(expectedFailures===failuresBefore,'Honeycomb palette acquired surface images');
        earth.value!.enterChina();await wait(()=>mode.value==='china','honeycomb China');
        await wait(()=>document.querySelector<HTMLElement>('.map-host')?.dataset.entryProgress==='1.000','honeycomb destination entrance');
        check(document.querySelector<HTMLElement>('.map-host')?.dataset.mapCode==='100000','Honeycomb opened the wrong geographic destination');
        earth.value!.returnToEarth();await wait(()=>mode.value==='earth','honeycomb return');
        check(document.querySelector('.earth-view canvas')===hexCanvas&&diagnose()?.hologram?.pattern==='hex','Country return lost the live honeycomb');
        presentation.value='hologram';await nextTick();
        await wait(()=>diagnose()?.presentation==='hologram'&&diagnose()?.phase==='ready'&&diagnose()?.hologram?.pattern==='dots'&&document.querySelector('.earth-view canvas')!==hexCanvas,'regular dots restored');
        return 'Three hues reused the honeycomb canvas; native country entrance/return preserved it; switching restored regular dots';
      });
      await perform('无未处理异常或着色器错误',async()=>{check(!exceptions.length,exceptions.join('\n'));return JSON.stringify({expectedMissingRequests:expectedFailures,unhandledErrors:exceptions});});
    }catch{ /* A failed row remains visible and the report is downloadable. */ }
    finally{running.value=false;done.value=true;}
  }
  onMounted(()=>{if(new URLSearchParams(location.search).get('autorun')==='1')void run();});
  return()=>h('main',{class:'regression', 'data-status':done.value?(results.value.some(r=>r.status==='fail')?'failed':'passed'):running.value?'running':'idle'},[
    h('aside',[h('h1','FUI · WebGL 回归核验'),h('p','使用真实组件、公开接口和实际 GPU 渲染。缺图用例会产生预期的 404。'),
      h('button',{disabled:running.value,onClick:run},running.value?'核验中…':'运行完整回归'),
      h('ol',results.value.map(r=>h('li',{'data-result':r.status},[h('strong',`${r.status==='pass'?'✓':'✕'} ${r.name}`),h('small',r.detail)]))),
      done.value?h('a',{download:'fui-webgl-regression.json',href:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({results:results.value,exceptions,expectedFailures,diagnostics:diagnose()},null,2))},'下载核验记录'):null,
      h('pre',{id:'regression-report'},JSON.stringify({status:done.value?(results.value.some(r=>r.status==='fail')?'failed':'passed'):running.value?'running':'idle',results:results.value,exceptions,expectedFailures,diagnostics:done.value?diagnose():undefined},null,2))]),
    h('section',{class:'stage'},mounted.value?h(FuiEarth,{ref:earth,key:generation.value,initialMode:initialMode.value,earthPresentation:presentation.value,skin:skin.value,polarStyle:polar.value,mapPresentation:'textured-hex',onLoading:(state:FuiEarthLoading)=>phaseHistory.push({phase:state.phase,at:performance.now()}),onSkinError:(e:FuiSkinFailure)=>skinErrors.push(e),onEarthTelemetry:(pose:{longitude:number;latitude:number;heading:number})=>{telemetry=pose;},onModeChange:(next:string)=>{mode.value=next;}}):h('span','点击运行开始核验')),
  ]);
}});
createApp(app).mount('#app');
const style=document.createElement('style');style.textContent=`html,body,#app{margin:0;width:100%;height:100%;background:#060b10;color:#c9d7e1;font:13px/1.5 system-ui}*{box-sizing:border-box}.regression{height:100%;display:grid;grid-template-columns:340px 1fr}aside{padding:22px;overflow:auto;border-right:1px solid #263846}h1{font-size:19px;margin:0 0 14px}p,small{color:#91a5b4}button{padding:10px 18px;border:1px solid #528ca6;background:#0c1b25;color:#d5efff;cursor:pointer}ol{padding:0;list-style:none}li{margin:18px 0}li strong,li small{display:block}li[data-result=pass] strong{color:#84d9bd}li[data-result=fail] strong{color:#f39689}small{font-size:11px;overflow-wrap:anywhere}a{color:#80c9ed}.stage{position:relative;min-width:0;min-height:0}#regression-report{max-height:160px;overflow:auto;font-size:10px;color:#7091a4}@media(max-width:800px){.regression{grid-template-columns:270px 1fr}}`;document.head.append(style);
