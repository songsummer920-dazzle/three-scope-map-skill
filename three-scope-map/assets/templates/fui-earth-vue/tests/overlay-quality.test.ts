// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type {Map as MapLibreMap} from 'maplibre-gl';
import type {GeoFeatureCollection} from '../src/types/geo';
import {FuiMapSharedGlassLayer} from '../src/components/map/fuiMapSharedGlassLayer';
import {VectorMap3dLayer} from '../src/components/map/vectorMap3dLayer';
import type {createFuiMapGeographicGlassAsync} from '../src/components/map/fuiMapGeographicGlass';
import {getFuiVectorMapPalette} from '../src/components/map/fuiEarthTheme';
import {mapQualityBudget} from '../src/components/map/mapQuality';
import type {requestFuiMapRelief} from '../src/components/map/fuiMapRelief';
type Scene=Awaited<ReturnType<typeof createFuiMapGeographicGlassAsync>>;
type Internal={map?:MapLibreMap;environment?:THREE.WebGLRenderTarget;environmentPrepared:boolean;floatTargetsSupported:boolean;glass?:Scene;scene:THREE.Scene;
  prepared?:{glass:Scene};buildGlass:typeof createFuiMapGeographicGlassAsync;requestRelief:typeof requestFuiMapRelief;
  queueBuild:()=>void;commitPrepared:()=>void;finishSuccessfulDraw:()=>void;retirementNotBefore:number};
const empty:GeoFeatureCollection={type:'FeatureCollection',features:[]};
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
function fixture(t:TestContext){
  const canvas={clientWidth:800,clientHeight:600,addEventListener(){},removeEventListener(){}};
  let repaints=0,moving=false;
  const map={getCanvas:()=>canvas,triggerRepaint:()=>{repaints++;},isMoving:()=>moving} as unknown as MapLibreMap;
  const gl={getContextAttributes:()=>({antialias:true})} as unknown as WebGL2RenderingContext;
  const layer=new FuiMapSharedGlassLayer(empty,getFuiVectorMapPalette('glacier'),'smooth-glass',undefined,'glacier','balanced');
  layer.onAdd(map,gl);layer.diagnostics.navigationKey='country:100000';
  const internals=layer as unknown as Internal;
  internals.environment=new THREE.WebGLRenderTarget(1,1);internals.environmentPrepared=true;internals.floatTargetsSupported=true;
  const made:{scene:Scene;disposed:number;skin:string;quality:string}[]=[];
  const scene=()=>{
    const record={scene:undefined as unknown as Scene,disposed:0,skin:'',quality:''};
    record.scene={root:new THREE.Group(),regions:[],southSeaCounts:{islands:0,segments:0},anchor:{x:.7,y:.4},scale:1,depthMeters:100,
      updateSkin:(skin:string)=>{record.skin=skin;},setQuality:(quality:string)=>{record.quality=quality;},setFloatTargets:()=>{},dispose:()=>{record.disposed++;}} as unknown as Scene;
    made.push(record);return record;
  };
  t.after(()=>{layer.onRemove(map,gl);});
  return{layer,internals,scene,made,map,gl,repaints:()=>repaints,setMoving:(value:boolean)=>{moving=value;}};
}

test('glass quality budgets preserve high/balanced output while low removes the expensive offscreen features',()=>{
  for(const quality of ['high','balanced'] as const){
    const budget=mapQualityBudget(quality);
    assert.equal(budget.glassMaxSize,2048);assert.equal(budget.glassPixelRatio,1.5);assert.equal(budget.glassSamples,4);assert.equal(budget.glassBloom,true);
  }
  const low=mapQualityBudget('auto',{memory:4,cores:8});
  assert.equal(low.quality,'low');assert.equal(low.reflection,false);assert.equal(low.glassSamples,0);assert.equal(low.glassBloom,false);
  assert.equal(low.glassMaxSize,1024);assert.equal(low.glassPixelRatio,1);
});

test('the shared geographic layer retains its legacy balanced default and forwards an explicit quality update',()=>{
  const layer=new FuiMapSharedGlassLayer(empty,getFuiVectorMapPalette('glacier'),'smooth-glass');
  assert.equal(layer.diagnostics.quality,'balanced');
  layer.setQuality('low');assert.equal(layer.diagnostics.quality,'low');
  layer.setQuality('high');assert.equal(layer.diagnostics.quality,'high');
});

test('entity and hologram overlay styles use the same native shared renderer while preserving their material identity',()=>{
 const palette=getFuiVectorMapPalette('glacier');
 for(const surface of ['terrain-glass','smooth-glass'] as const){
  const layer=new VectorMap3dLayer(empty,palette,surface,undefined,'glacier','low');
  const internal=layer as unknown as {implementation:unknown};
  assert(internal.implementation instanceof FuiMapSharedGlassLayer,'FUI overlay fell back to the old thin extrusion');
  assert.equal(layer.diagnostics.materialSource,surface==='terrain-glass'?'fui-native-terrain-glass':'fui-native-smooth-glass');
  assert.equal(layer.diagnostics.surface,surface);assert.equal(layer.diagnostics.hud,false);
  const renderer=internal.implementation;
  layer.diagnostics.navigationKey='country:100000/province:330000';
  layer.setStyle(palette,surface==='terrain-glass'?'smooth-glass':'terrain-glass','glacier');
  assert.equal(internal.implementation,renderer,'FUI material switch replaced the shared renderer');
  assert.equal(layer.diagnostics.navigationKey,'country:100000/province:330000');
 }
});

test('cold geographic construction is scheduled outside the synchronous render/prepare caller',async t=>{
  const f=fixture(t),record=f.scene();let called=false;
  f.internals.buildGlass=async()=>{called=true;return record.scene;};
  f.internals.queueBuild();assert.equal(called,false);assert.equal(f.layer.diagnostics.buildPhase,'queued');
  await tick();assert.equal(called,true);assert.equal(f.internals.glass,undefined,'The background task committed a scene outside the draw boundary');
  f.internals.commitPrepared();assert.equal(f.internals.glass,record.scene);assert.equal(f.layer.diagnostics.buildPhase,'ready');
  assert.equal(f.layer.diagnostics.navigationKey,'country:100000');assert(f.repaints()>0);
});

test('a newer navigation aborts an old build, keeps the old visible scene and never commits a late result',async t=>{
  const f=fixture(t),visible=f.scene(),obsolete=f.scene(),replacement=f.scene();
  f.internals.glass=visible.scene;f.internals.scene.add(visible.scene.root);
  const calls:{signal:AbortSignal;resolve:(value:Scene)=>void}[]=[];
  f.internals.buildGlass=(_data,_skin,_environment,_viewport,_quality,options)=>new Promise(resolve=>{calls.push({signal:options!.signal!,resolve});});
  f.layer.setData(empty,'country:100000/province:330000');f.internals.queueBuild();await tick();
  assert.equal(f.internals.glass,visible.scene);assert.equal(visible.disposed,0);
  assert.equal(f.layer.pick({x:0,y:0}),undefined,'The outdated scene remained interactive during navigation');
  f.layer.setData(empty,'country:100000/province:510000');assert.equal(calls[0].signal.aborted,true);
  f.internals.queueBuild();await tick();
  calls[0].resolve(obsolete.scene);await tick();assert.equal(obsolete.disposed,1);assert.equal(f.internals.glass,visible.scene);
  f.layer.setQuality('low');
  calls[1].resolve(replacement.scene);await tick();assert.equal(visible.disposed,0);
  f.internals.commitPrepared();assert.equal(f.internals.glass,replacement.scene);assert.equal(visible.disposed,0,'Shared GPU programs were released before the new materials acquired them');
  f.internals.finishSuccessfulDraw();assert.equal(visible.disposed,0,'Resource retirement ran in the first replacement frame');
  f.internals.retirementNotBefore=-1;f.internals.finishSuccessfulDraw();assert.equal(visible.disposed,1);
  assert.equal(f.layer.diagnostics.navigationKey,'country:100000/province:510000');assert.equal(f.layer.diagnostics.pendingNavigationKey,'');
  assert.equal(replacement.quality,'low','A completed task lost the current live quality');
});

test('removal releases the retired scene even when no replacement draw succeeds',async t=>{
  const f=fixture(t),old=f.scene(),next=f.scene();f.internals.glass=old.scene;f.internals.scene.add(old.scene.root);
  f.internals.buildGlass=async()=>next.scene;
  f.layer.setData(empty,'country:100000/province:330000');f.internals.queueBuild();await tick();f.internals.commitPrepared();
  assert.equal(old.disposed,0);f.layer.onRemove(f.map,f.gl);assert.equal(old.disposed,1);assert.equal(next.disposed,1);
});

test('retirement waits through the camera flight, runs in bounded resource steps and removal drains a partial owner',async t=>{
  const f=fixture(t),old=f.scene(),next=f.scene();f.internals.glass=old.scene;f.internals.scene.add(old.scene.root);
  f.internals.buildGlass=async()=>next.scene;
  f.layer.setData(empty,'country:100000/province:330000');f.internals.queueBuild();await tick();f.internals.commitPrepared();
  let clock=100,steps=0,started=false;
  t.mock.method(performance,'now',()=>clock);
  function* disposeStages(){
    if(started)return;started=true;
    for(let i=0;i<5;i++){steps++;clock+=3;yield;}
    old.disposed++;
  }
  Object.assign(old.scene,{disposeStages,dispose:()=>{const stages=disposeStages();while(!stages.next().done){/* drain */}}});
  f.internals.finishSuccessfulDraw();assert.equal(steps,0);
  clock=999;f.internals.finishSuccessfulDraw();assert.equal(steps,0,'Resources retired before the camera grace period');
  clock=1001;f.setMoving(true);f.internals.finishSuccessfulDraw();assert.equal(steps,0,'Resources retired during an active map flight');
  f.setMoving(false);f.internals.finishSuccessfulDraw();assert.equal(steps,2,'A draw ignored the resource-time budget');assert.equal(old.disposed,0);
  f.layer.onRemove(f.map,f.gl);assert.equal(steps,5);assert.equal(old.disposed,1);assert.equal(next.disposed,1);
});

test('a new replacement gets a fresh retirement grace period while an older owner is partially retired',async t=>{
  const f=fixture(t),old=f.scene(),middle=f.scene(),next=f.scene();f.internals.glass=old.scene;f.internals.scene.add(old.scene.root);
  f.internals.buildGlass=async()=>middle.scene;
  f.layer.setData(empty,'country:100000/province:330000');f.internals.queueBuild();await tick();f.internals.commitPrepared();
  let clock=100,steps=0,started=false;
  t.mock.method(performance,'now',()=>clock);
  function* disposeStages(){if(started)return;started=true;for(let i=0;i<5;i++){steps++;clock+=3;yield;}old.disposed++;}
  Object.assign(old.scene,{disposeStages,dispose:()=>{const stages=disposeStages();while(!stages.next().done){/* drain */}}});
  f.internals.finishSuccessfulDraw();clock=1001;f.internals.finishSuccessfulDraw();assert.equal(steps,2);
  f.internals.buildGlass=async()=>next.scene;
  f.layer.setData(empty,'country:100000/province:510000');f.internals.queueBuild();await tick();f.internals.commitPrepared();
  f.internals.finishSuccessfulDraw();assert.equal(steps,2);assert.equal(middle.disposed,0);
  clock+=899;f.internals.finishSuccessfulDraw();assert.equal(steps,2);assert.equal(middle.disposed,0);
  f.layer.onRemove(f.map,f.gl);assert.equal(old.disposed,1);assert.equal(middle.disposed,1);assert.equal(next.disposed,1);
});

test('regional height preparation overlaps geometry and cached terrain joins the first prepared model',async t=>{
  const f=fixture(t),next=f.scene(),texture=new THREE.DataTexture(new Uint8Array(16),2,2);
  const bounds:[number,number,number,number]=[118,27,123,32];let requestCount=0,resolveGeometry!:(model:Scene)=>void,prepared=0;
  f.layer.setStyle(getFuiVectorMapPalette('glacier'),'terrain-glass');
  next.scene.root.userData.fuiSurfaceFamily='terrain';
  Object.assign(next.scene,{geographicBounds:bounds,prepareRegionalRelief:async(value:THREE.DataTexture)=>{
    assert.equal(value,texture);prepared++;next.scene.root.userData.fuiReliefReady=true;next.scene.root.userData.fuiReliefSize=2;return true;
  }});
  f.internals.requestRelief=async requested=>{requestCount++;assert.deepEqual(requested,bounds);return texture;};
  f.internals.buildGlass=(_data,_skin,_environment,_viewport,_quality,options)=>{
    options!.onProjectionReady!(bounds);return new Promise(resolve=>{resolveGeometry=resolve;});
  };
  f.internals.queueBuild();await tick();assert.equal(requestCount,1);assert.equal(f.internals.prepared,undefined);
  resolveGeometry(next.scene);await tick();assert.equal(prepared,1);assert.equal(f.internals.prepared?.glass,next.scene);
  f.internals.commitPrepared();await tick();assert.equal(requestCount,1,'Terrain was requested twice for one navigation');
  assert.equal(f.layer.diagnostics.terrainDetail,'regional');assert.equal(f.layer.diagnostics.terrainResolution,2);texture.dispose();
});

test('navigation cancellation aborts concurrent regional preparation and ignores its late height field',async t=>{
  const f=fixture(t),stale=f.scene();let signal!:AbortSignal,resolveRelief!:(texture:THREE.DataTexture)=>void,resolveGeometry!:(model:Scene)=>void;
  f.layer.setStyle(getFuiVectorMapPalette('glacier'),'terrain-glass');
  f.internals.requestRelief=(_bounds,requestSignal)=>{signal=requestSignal!;return new Promise(resolve=>{resolveRelief=resolve;});};
  f.internals.buildGlass=(_data,_skin,_environment,_viewport,_quality,options)=>{
    options!.onProjectionReady!([118,27,123,32]);return new Promise(resolve=>{resolveGeometry=resolve;});
  };
  f.internals.queueBuild();await tick();assert.equal(signal.aborted,false);
  f.layer.setData(empty,'country:100000/province:510000');assert.equal(signal.aborted,true);
  const texture=new THREE.DataTexture(new Uint8Array(4),1,1);resolveRelief(texture);resolveGeometry(stale.scene);await tick();
  assert.equal(stale.disposed,1);assert.equal(f.internals.prepared,undefined);texture.dispose();
});

test('an early regional preparation failure retains native overview and still commits the new geography',async t=>{
  const f=fixture(t),next=f.scene(),texture=new THREE.DataTexture(new Uint8Array(4),1,1);let resolveGeometry!:(model:Scene)=>void;
  f.layer.setStyle(getFuiVectorMapPalette('glacier'),'terrain-glass');next.scene.root.userData.fuiSurfaceFamily='terrain';
  Object.assign(next.scene,{geographicBounds:[118,27,123,32],prepareRegionalRelief:async()=>{throw new Error('Regional preparation failed');}});
  f.internals.requestRelief=async()=>texture;
  f.internals.buildGlass=(_data,_skin,_environment,_viewport,_quality,options)=>{
    options!.onProjectionReady!([118,27,123,32]);return new Promise(resolve=>{resolveGeometry=resolve;});
  };
  f.internals.queueBuild();await tick();resolveGeometry(next.scene);await tick();f.internals.commitPrepared();await tick();
  assert.equal(f.internals.glass,next.scene);assert.equal(f.layer.diagnostics.buildPhase,'ready');
  assert.equal(f.layer.diagnostics.terrainDetail,'overview');assert.deepEqual(f.layer.diagnostics.errors,[]);texture.dispose();
});

test('removal cancels queued and pending builds and releases any result which arrives afterward',async t=>{
  const f=fixture(t);let calls=0,resolve!:(scene:Scene)=>void,signal:AbortSignal|undefined;
  f.internals.buildGlass=(_data,_skin,_environment,_viewport,_quality,options)=>{calls++;signal=options!.signal;return new Promise(r=>{resolve=r;});};
  f.internals.queueBuild();f.layer.onRemove(f.map,f.gl);await tick();assert.equal(calls,0);
  const g=fixture(t),late=g.scene();
  g.internals.buildGlass=(_data,_skin,_environment,_viewport,_quality,options)=>{signal=options!.signal;return new Promise(r=>{resolve=r;});};
  g.internals.queueBuild();await tick();g.layer.onRemove(g.map,g.gl);assert.equal(signal!.aborted,true);
  resolve(late.scene);await tick();assert.equal(late.disposed,1);assert.equal(g.internals.glass,undefined);
});

test('a failed replacement reports an error and leaves the previous scene intact',async t=>{
  const f=fixture(t),visible=f.scene();f.internals.glass=visible.scene;f.internals.scene.add(visible.scene.root);
  f.internals.buildGlass=async()=>{throw new Error('Invalid geographic source');};
  f.layer.setData(empty,'country:100000/province:330000');f.internals.queueBuild();await tick();
  assert.equal(f.layer.diagnostics.buildPhase,'error');assert.match(f.layer.diagnostics.errors[0],/Invalid geographic source/);
  assert.equal(f.internals.glass,visible.scene);assert.equal(visible.disposed,0);assert.equal(f.layer.pick({x:0,y:0}),undefined);
});

test('a no-float build proceeds without a PMREM texture and keeps float-dependent features disabled',async t=>{
  const f=fixture(t),record=f.scene();f.internals.environment?.dispose();f.internals.environment=undefined;f.internals.floatTargetsSupported=false;
  let called=false,allowFloat=true;
  record.scene.setFloatTargets=(value:boolean)=>{allowFloat=value;};
  f.internals.buildGlass=async(_data,_skin,environment,_viewport,_quality,options)=>{
    called=true;assert.equal(environment,undefined);assert.equal(options!.floatTargets,false);return record.scene;
  };
  f.internals.queueBuild();await tick();f.internals.commitPrepared();
  assert.equal(called,true);assert.equal(allowFloat,false);assert.equal(f.layer.diagnostics.buildPhase,'ready');
});
