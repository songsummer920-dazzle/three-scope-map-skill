// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import china from '../src/assets/maps/china.json';
import southSeaContext from '../src/assets/maps/south-sea-context.json';
import type {GeoFeatureCollection,Position} from '../src/types/geo';
import {resolveFuiMapOpticalRegion,wrapFuiOpticalLongitude,isFuiChinaCountry,isFuiHainanFeature,resolveFuiHainanOwner} from '../src/components/map/fuiMapRegion';
import {FUI_MAP_CAP_CENTER,createFuiMapCapOpticsUniforms,fuiMapCapNormalENU} from '../src/components/map/fuiMapCapOptics';
import {getFuiSouthSeaData,createFuiSouthSeaMap,updateFuiSouthSeaMap,FUI_SOUTH_SEA_LEVELS,FUI_SOUTH_SEA_GLASS_LEVELS} from '../src/components/map/fuiSouthSeaMap';
import {createSouthSeaInset} from '../src/components/map/fuiSouthSeaInset';
import {createFuiMapSideGradientMaterial} from '../src/components/map/fuiMapSideMaterial';
import {drainFuiMapBuild,runFuiMapBuild} from '../src/components/map/fuiMapBuildStages';
import {fuiMapDistanceTransformStages} from '../src/components/map/fuiMapGlow';
import {createFuiMapGlassFootprint,createFuiMapGlassFootprintAsync,FUI_MAP_GLASS_LEVELS} from '../src/components/map/fuiMapGlass';
import {createFuiMapGeographicGlassAsync} from '../src/components/map/fuiMapGeographicGlass';
import {createFuiFlatTerrainState} from '../src/components/map/fuiMapTerrain';
import {createFuiMapHologramSurface} from '../src/components/map/fuiMapHologramSurface';
import {createFuiMapSurface,type FuiMapTextures} from '../src/components/map/fuiMapSurface';
import {createFuiMapGlassMaterial} from '../src/components/map/fuiMapGlass';
import {FUI_HOLOGRAM_GLASS_OPTICS_GLSL} from '../src/components/map/fuiHologramGlassOptics';
import {canCreateFuiMapReflection,createFuiMapReflection} from '../src/components/map/fuiMapReflection';
import type {FuiMapEdgeField} from '../src/components/map/fuiMapGlow';
const source=china as unknown as GeoFeatureCollection;
const empty:GeoFeatureCollection={type:'FeatureCollection',features:[]};
const feature=(coordinates:Position[][],code='test')=>({type:'Feature' as const,properties:{adcode:code},geometry:{type:'Polygon' as const,coordinates}});
function data(outer:Position[]):GeoFeatureCollection{return{type:'FeatureCollection',features:[feature([outer])]};}
function disposeRoot(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();}

test('country China keeps the accepted optical frame while another current region receives its own stable center',()=>{
 const before=JSON.stringify(source),mainland=resolveFuiMapOpticalRegion(source,{scope:'country',code:'100000'});
 assert.deepEqual(mainland,{center:{...FUI_MAP_CAP_CENTER},angularScale:1,world:false});assert.deepEqual(resolveFuiMapOpticalRegion(source),mainland);
 const usa=data([[-125,25],[-67,25],[-67,49],[-125,49],[-125,25]]),frame=resolveFuiMapOpticalRegion(usa,{scope:'country',code:'USA'});
 assert.deepEqual(frame.center,{longitude:-96,latitude:37});assert.equal(frame.angularScale,1);assert(fuiMapCapNormalENU(-96,37,frame.center).z>.999999);
 assert.equal(JSON.stringify(source),before);assert(!isFuiChinaCountry(usa,{scope:'country',code:'USA'}));
});
test('dateline regions use their short circular extent and world shading stays on the front cap without changing geography',()=>{
 const crossing=data([[179,-12],[-178,-12],[-178,-8],[179,-8],[179,-12]]),before=JSON.stringify(crossing),frame=resolveFuiMapOpticalRegion(crossing,{scope:'country',code:'FJI'});
 assert(Math.abs(frame.center.longitude+179.5)<1e-9);assert.equal(frame.center.latitude,-10);assert.equal(frame.angularScale,1);assert.equal(wrapFuiOpticalLongitude(frame.center.longitude,180),180.5);
 const world=resolveFuiMapOpticalRegion(data([[-180,-80],[-90,-80],[0,-80],[90,-80],[180,-80],[180,80],[-180,80],[-180,-80]]),{scope:'world'});
 assert.deepEqual(world.center,{longitude:0,latitude:0});assert(world.angularScale>0&&world.angularScale<.3);
 for(const longitude of [-179,-100,0,120,179])assert(fuiMapCapNormalENU(longitude*world.angularScale,70*world.angularScale,world.center).z>.75);
 assert.equal(createFuiMapCapOpticsUniforms('mercator',frame.center,frame.angularScale).uCapAngularScale.value,1);assert.equal(JSON.stringify(crossing),before);
});
test('maritime and inset data follow the current China country identity, including a province-first return',()=>{
 const province=data([[120,29],[121,29],[121,30],[120,30],[120,29]]);assert.equal(getFuiSouthSeaData(province,{scope:'province',code:'330000'}).islands.length,0);
 const national=getFuiSouthSeaData(source,{scope:'country',code:'100000'});assert(national.islands.length>100&&national.segments.length>0);assert.equal(getFuiSouthSeaData(source,{scope:'country',code:'USA'}).fitPoints.length,0);
 const context=southSeaContext as unknown as GeoFeatureCollection;assert(createSouthSeaInset(source,context,{scope:'country',code:'100000'}).islets.length>0);
 assert.deepEqual(createSouthSeaInset(source,context,{scope:'country',code:'USA'}),{land:[],islets:[],segments:[],context:[]});assert.equal(getFuiSouthSeaData(source,{scope:'country',code:'100000'}).islands.length,national.islands.length);
});
test('native overlay retains separate maritime segments without adding JD as an administrative pick target',async()=>{
 const collection:GeoFeatureCollection={type:'FeatureCollection',features:[
  feature([[[100,30],[104,30],[104,34],[100,34],[100,30]]],'110000'),
  {type:'Feature',properties:{adcode:'460000',name:'海南省'},geometry:{type:'MultiPolygon',coordinates:[
   [[[110,19],[111,19],[111,20],[110,20],[110,19]]],
   [[[112,10],[112.2,10],[112.2,10.2],[112,10.2],[112,10]]],
  ]}},
  feature([[[109,8],[109.2,8],[109.2,8.1],[109,8.1],[109,8]]],'100000_JD'),
 ]};
 // Stub only atlas raster allocation; geometry and pick ownership are real.
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 const raster={beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},clearRect(){},getImageData:(_x:number,_y:number,width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)})};
 Object.defineProperty(globalThis,'document',{value:{createElement:()=>({width:1,height:1,getContext:()=>raster})},configurable:true});
 try{
 const model=await createFuiMapGeographicGlassAsync(collection,'glacier',undefined,{width:800,height:600},'low',{scope:'country',code:'100000',floatTargets:false,yieldControl:async()=>{}});
 try{
  assert.deepEqual(model.southSeaCounts,{islands:1,segments:1});
  assert.equal(model.regions.length,2);assert(model.regions.every(region=>!region.key.endsWith('_JD')));
  assert(model.pickMeshes.every(mesh=>!String(mesh.userData.overlayKey??'').endsWith('_JD')));
  const maritime=model.root.getObjectByName('fui-south-sea-geography')!;assert(maritime);
  const state=maritime.userData.fuiSouthSea;
  assert(state.maritimeInk.geometry.getAttribute('position').count>0);
  assert(state.maritimeEdge.geometry.getAttribute('instanceStart').count>0);
  const p=state.maritimeInk.geometry.getAttribute('position');let bottom=Infinity,top=-Infinity;
  for(let i=0;i<p.count;i++){bottom=Math.min(bottom,p.getZ(i));top=Math.max(top,p.getZ(i));}
  assert(Math.abs(bottom-FUI_SOUTH_SEA_GLASS_LEVELS.maritime.bottom)<1e-4);
  assert(Math.abs(top-FUI_SOUTH_SEA_GLASS_LEVELS.maritime.top)<1e-4);
 }finally{model.dispose();}
 const province=await createFuiMapGeographicGlassAsync(collection,'glacier',undefined,{width:800,height:600},'low',{scope:'province',code:'460000',floatTargets:false,yieldControl:async()=>{}});
 try{assert.deepEqual(province.southSeaCounts,{islands:0,segments:0});assert.equal(province.root.getObjectByName('fui-south-sea-geography'),undefined);}
 finally{province.dispose();}
 }finally{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
});
test('Hainan identity follows adcode through renamed providers and preserves the actual owner label, with legacy fullname fallback',()=>{
 const renamed=structuredClone(source),feature=renamed.features.find(feature=>String(feature.properties.adcode)==='460000')!;
 feature.properties.fullname='Hainan';feature.properties.name='Hainan';
 const owner=resolveFuiHainanOwner(renamed);assert(owner);assert.equal(owner.feature,feature);assert.equal(owner.name,'Hainan');assert(isFuiHainanFeature(feature));
 const count=getFuiSouthSeaData(source,{scope:'country',code:'100000'}).islands.length;
 assert.equal(getFuiSouthSeaData(renamed,{scope:'country',code:'100000'}).islands.length,count);
 const legacy=structuredClone(feature);delete legacy.properties.adcode;legacy.properties.fullname='海南省';legacy.properties.name='海南';
 assert(isFuiHainanFeature(legacy));assert.equal(resolveFuiHainanOwner({type:'FeatureCollection',features:[legacy]})?.name,'海南省');
 assert.equal(getFuiSouthSeaData({type:'FeatureCollection',features:[legacy]},{scope:'country',code:'100000'}).islands.length,count);
 assert.equal(source.features.find(feature=>String(feature.properties.adcode)==='460000')!.properties.name,'海南省');
});
test('standard cartographic plaques retain shallow geometry with upper and foot strokes on the actual datums',()=>{
 const sea={islands:[[[[110,10],[110.001,10],[110.001,10.001],[110,10.001],[110,10]] as Position[]]],segments:[[[[112,8],[112.01,8],[112.01,8.2],[112,8.2],[112,8]] as Position[]]],fitPoints:[] as Position[]};
 const side=createFuiMapSideGradientMaterial({accent:'#00aaff',sideMid:'#005599',sideBottom:'#001122'}),group=createFuiSouthSeaMap(sea,([x,y])=>new THREE.Vector3(x,y,0),undefined,{width:800,height:600},side);
 try{const state=group.userData.fuiSouthSea;
  for(const [mesh,datum]of [[state.islandBody,FUI_SOUTH_SEA_LEVELS.islands],[state.maritimeInk,FUI_SOUTH_SEA_LEVELS.maritime]] as const){const p=mesh.geometry.getAttribute('position');let low=Infinity,high=-Infinity;for(let i=0;i<p.count;i++){low=Math.min(low,p.getZ(i));high=Math.max(high,p.getZ(i));}assert(Math.abs(low-datum.bottom)<1e-4&&Math.abs(high-datum.top)<1e-4);assert(high-low<6);}
  assert(state.side.vertexShader.includes('bottomZ+vDepth*(topZ-bottomZ)-uLift*(1.0-vDepth)'));assert.equal(state.side.uniforms.bottomZ.value,FUI_SOUTH_SEA_LEVELS.islands.bottom);assert.equal(state.islandBottom.position.z,FUI_SOUTH_SEA_LEVELS.islands.bottom);
  state.islandGroup.position.z=16;updateFuiSouthSeaMap(group,'glacier',true);assert.equal(state.side.uniforms.uLift.value,16);const foot=state.islandFoot.geometry.getAttribute('instanceStart');assert(Math.abs(foot.getZ(0)-(FUI_SOUTH_SEA_LEVELS.islands.bottom+.08))<1e-4);
 }finally{disposeRoot(group);side.dispose();}
});
test('glass islands and maritime strokes share the mainland slab top, bottom and fixed feet during lift',()=>{
 const sea={islands:[[[[110,10],[110.001,10],[110.001,10.001],[110,10.001],[110,10]] as Position[]]],segments:[[[[112,8],[112.01,8],[112.01,8.2],[112,8.2],[112,8]] as Position[]]],fitPoints:[] as Position[]};
 const side=createFuiMapSideGradientMaterial({accent:'#00aaff',sideMid:'#005599',sideBottom:'#001122'}),group=createFuiSouthSeaMap(sea,([x,y])=>new THREE.Vector3(x,y,0),undefined,{width:800,height:600},side,undefined,FUI_SOUTH_SEA_GLASS_LEVELS);
 try{
  const state=group.userData.fuiSouthSea;
  for(const [mesh,wall,edge,foot,bottom]of [[state.islandBody,state.side,state.islandEdge,state.islandFoot,state.islandBottom],[state.maritimeInk,state.maritimeSide,state.maritimeEdge,state.maritimeFoot,state.maritimeBottom]] as const){
   const p=mesh.geometry.getAttribute('position');let low=Infinity,high=-Infinity;
   for(let i=0;i<p.count;i++){low=Math.min(low,p.getZ(i));high=Math.max(high,p.getZ(i));}
   assert.equal(low,FUI_MAP_GLASS_LEVELS.bottom);assert.equal(high,FUI_MAP_GLASS_LEVELS.top);
   assert.equal(high-low,FUI_MAP_GLASS_LEVELS.top-FUI_MAP_GLASS_LEVELS.bottom);
   assert.equal(wall.uniforms.bottomZ.value,low);assert.equal(wall.uniforms.topZ.value,high);
   assert.equal(bottom.position.z,low);
   assert(Math.abs(edge.geometry.getAttribute('instanceStart').getZ(0)-(high+.18))<1e-4);
   assert(Math.abs(foot.geometry.getAttribute('instanceStart').getZ(0)-(low+.08))<1e-4);
  }
  state.islandGroup.position.z=16;updateFuiSouthSeaMap(group,'glacier',true);
  assert.equal(state.side.uniforms.uLift.value,16);
  assert.equal(state.islandFoot.parent,group);assert.equal(state.islandBottom.parent,group);
  assert.equal(state.islandEdge.parent,state.islandGroup);assert.equal(state.islandBody.parent,state.islandGroup);
  assert.equal(state.maritimeSide.uniforms.uLift.value,0);
 }finally{disposeRoot(group);side.dispose();}
});
test('South China Sea island batching preserves exact per-material triangles and attributes, while transparent maritime groups keep their order',()=>{
 const sea=getFuiSouthSeaData(source),side=createFuiMapSideGradientMaterial({accent:'#00aaff',sideMid:'#005599',sideBottom:'#001122'});
 const edges=new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1),terrain=createFuiFlatTerrainState({texture:edges,bounds:new THREE.Vector4(0,0,200,100)},new THREE.Vector4(.001,.002,.5,.5));
 const reference=createFuiMapHologramSurface('glacier',terrain,undefined);
 const streams=(geometry:THREE.BufferGeometry)=>{
  const index=geometry.getIndex()!,result=new Map<number,number[]>();
  for(const part of geometry.groups){const material=part.materialIndex??0,target=result.get(material)??[];for(let i=part.start;i<part.start+part.count;i++)target.push(index.getX(i));if(target.length)result.set(material,target);}
  return result;
 };
 try{for(const [levels,smooth]of [[FUI_SOUTH_SEA_LEVELS,false],[FUI_SOUTH_SEA_GLASS_LEVELS,false],[FUI_SOUTH_SEA_GLASS_LEVELS,true]] as const){
  const group=createFuiSouthSeaMap(sea,([x,y])=>new THREE.Vector3(x*20,y*20,0),undefined,{width:800,height:600},side,smooth?{terrain,skin:'glacier',reference}:undefined,levels);
  try{
   const state=group.userData.fuiSouthSea;
   // Only island tops are opaque. Maritime cap/side ranges deliberately stay
   // interleaved because both of their materials use the transparent queue.
   assert.equal(state.islandBody.material[0].transparent,false);assert.equal(state.islandBody.material[1].transparent,true);
   assert.equal(state.maritimeInk.material[0].transparent,true);assert.equal(state.maritimeInk.material[1].transparent,true);
   for(const [mesh,datum,openTop,batched]of [[state.islandBody,levels.islands,smooth,true],[state.maritimeInk,levels.maritime,false,false]] as const){
    const geometry=mesh.geometry as THREE.ExtrudeGeometry;
    const original=new THREE.ExtrudeGeometry(geometry.parameters.shapes,geometry.parameters.options);original.translate(0,0,datum.bottom);
    try{
     for(const name of Object.keys(original.attributes))assert.deepEqual(geometry.getAttribute(name).array,original.getAttribute(name).array,`${name} was changed by draw grouping`);
     const position=original.getAttribute('position'),indices:number[]=[],groups:THREE.BufferGeometry['groups']=[];
     for(const part of original.groups){const start=indices.length;for(let i=part.start;i<part.start+part.count;i+=3){if(part.materialIndex===0&&([i,i+1,i+2].every(j=>Math.abs(position.getZ(j)-datum.bottom)<1e-5)||openTop))continue;indices.push(i,i+1,i+2);}groups.push({...part,start,count:indices.length-start});}
     original.clearGroups();for(const part of groups)original.addGroup(part.start,part.count,part.materialIndex);original.setIndex(indices);
     assert.deepEqual(streams(geometry),streams(original),'A triangle or its material/order changed');
     assert.equal(geometry.getIndex()!.count,original.getIndex()!.count);
     if(batched){assert.equal(geometry.groups.length,openTop?1:2);assert(original.groups.length>200,'Fixture no longer covers the real archipelago');assert(geometry.groups.every(part=>part.count>0));}
     else{assert.deepEqual(geometry.groups,original.groups);assert.deepEqual(geometry.getIndex()!.array,original.getIndex()!.array);}
     const bounds=geometry.boundingBox!;original.computeBoundingBox();original.boundingBox!.min.z-=28;
     assert.deepEqual(bounds,original.boundingBox);assert.deepEqual(geometry.boundingSphere,original.boundingBox!.getBoundingSphere(new THREE.Sphere()));
    }finally{original.dispose();}
   }
  }finally{disposeRoot(group);}
 }}finally{side.dispose();reference.dispose();edges.dispose();terrain.heightTexture!.dispose();}
});
test('smooth maritime tops share the accepted coat/backing recipe and Hainan selection while borrowing cap and terrain state',()=>{
 const edges=new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1),environment=new THREE.Texture();environment.image={height:1024,width:768};
 const terrain=createFuiFlatTerrainState({texture:edges,bounds:new THREE.Vector4(0,0,200,100)},new THREE.Vector4(.001,.002,.5,.5));
 const reference=createFuiMapHologramSurface('glacier',terrain,environment);reference.uniforms.uGlassLinearOutput.value=1;
 const side=createFuiMapSideGradientMaterial({accent:'#00aaff',sideMid:'#005599',sideBottom:'#001122'});
 const sea={islands:[[[[110,10],[110.001,10],[110.001,10.001],[110,10.001],[110,10]] as Position[]]],segments:[],fitPoints:[] as Position[]};
 let borrowedDisposals=0;for(const texture of [edges,environment,terrain.heightTexture!])texture.addEventListener('dispose',()=>borrowedDisposals++);
 const group=createFuiSouthSeaMap(sea,([x,y])=>new THREE.Vector3(x,y,0),environment,{width:800,height:600},side,{terrain,skin:'glacier',reference},FUI_SOUTH_SEA_GLASS_LEVELS);
 try{
  const state=group.userData.fuiSouthSea,c=state.coat.material as THREE.ShaderMaterial,b=state.backing.material as THREE.ShaderMaterial;
  assert.equal(state.islandMesh,state.coat);assert(c.fragmentShader.includes(FUI_HOLOGRAM_GLASS_OPTICS_GLSL));assert.equal(c.uniforms.uCapRestFrame,reference.uniforms.uCapRestFrame);assert.equal(c.uniforms.uGlassLinearOutput,reference.uniforms.uGlassLinearOutput);assert.equal(c.uniforms.uFuiTerrainEdges.value,edges);
  assert.equal(c.uniforms.uSelection,b.uniforms.uSelection);assert.notEqual(c.uniforms.uSelection,reference.uniforms.uSelection);state.islandGroup.position.z=16;updateFuiSouthSeaMap(group,'#9f42e6',true);
  assert.equal(c.uniforms.uSelection.value,1);assert.equal(b.uniforms.uSelection.value,1);assert.equal(c.uniforms.uGlassDepth.value,FUI_MAP_GLASS_LEVELS.top-FUI_MAP_GLASS_LEVELS.bottom+16);assert.equal(c.uniforms.uEngravingDepth.value,1.9);assert.equal(reference.uniforms.uSelection.value,0);
 }finally{disposeRoot(group);side.dispose();reference.dispose();assert.equal(borrowedDisposals,0);edges.dispose();environment.dispose();terrain.heightTexture!.dispose();}
});

test('cooperative exact distance transforms retain all Float32 distances and yield between CPU chunks',async()=>{
 const width=137,height=79,mask=new Uint8ClampedArray(width*height*4),sites:Array<[number,number]>=[[1,1],[80,42],[136,78],[5,75]];for(const [x,y]of sites)mask[(y*width+x)*4+3]=255;
 const sync=drainFuiMapBuild(fuiMapDistanceTransformStages(mask,width,height));let yields=0;const actual=await runFuiMapBuild(fuiMapDistanceTransformStages(mask,width,height),{yieldControl:async()=>{yields++;}});
 assert(yields>=3);assert.deepEqual(new Uint8Array(actual.buffer),new Uint8Array(sync.buffer));for(let y=0;y<height;y++)for(let x=0;x<width;x++)assert.equal(sync[y*width+x],Math.fround(Math.min(...sites.map(([sx,sy])=>Math.hypot(x-sx,y-sy)))));
});
test('incremental union keeps disjoint components and holes, with sync/async identical geometry',async()=>{
 const polygons:Array<Array<Array<[number,number]>>>=[];for(let i=0;i<20;i++){const x=i*5;polygons.push([[[x,0],[x+4,0],[x+4,4],[x,4],[x,0]],[[x+1,1],[x+1,2],[x+2,2],[x+2,1],[x+1,1]]]);}
 let yields=0;const sync=createFuiMapGlassFootprint(polygons),actual=await createFuiMapGlassFootprintAsync(polygons,{yieldControl:async()=>{yields++;}});assert(yields>=3);assert.equal(sync.length,20);assert.equal(actual.length,20);
 const points=(shapes:THREE.Shape[])=>shapes.map(s=>[s.getPoints().map(p=>p.toArray()),...s.holes.map(h=>h.getPoints().map(p=>p.toArray()))]);assert.deepEqual(points(sync),points(actual));assert.equal(sync.reduce((sum,s)=>sum+Math.abs(THREE.ShapeUtils.area(s.getPoints()))-s.holes.reduce((v,h)=>v+Math.abs(THREE.ShapeUtils.area(h.getPoints())),0),0),300);
});
test('cancelled geographic preparation releases owned atlas/neutral and geometry while retaining its borrowed environment',async()=>{
 const environment=new THREE.Texture(),controller=new AbortController();let borrowed=0,disposedTextures=0,yields=0;environment.addEventListener('dispose',()=>borrowed++);
 const native=THREE.DataTexture.prototype.dispose;THREE.DataTexture.prototype.dispose=function(){disposedTextures++;native.call(this);};
 try{await assert.rejects(createFuiMapGeographicGlassAsync(empty,'glacier',environment,{width:800,height:600},'balanced',{signal:controller.signal,yieldControl:async()=>{if(++yields===3)controller.abort();}}),{name:'AbortError'});assert(yields>=3);assert(disposedTextures>=2);assert.equal(borrowed,0);}
 finally{THREE.DataTexture.prototype.dispose=native;environment.dispose();}
});

test('low and unsupported mirror budgets return before inspecting a field or constructing any target',()=>{
 const poison={get bounds(){throw new Error('Disabled reflection tried to construct geometry/target');}} as unknown as FuiMapEdgeField;
 assert.equal(canCreateFuiMapReflection('low',true),false);assert.equal(canCreateFuiMapReflection('high',false),false);
 assert.equal(createFuiMapReflection(poison,800,600,1,'low',true),undefined);assert.equal(createFuiMapReflection(poison,800,600,1,'high',false),undefined);
});
test('a geographic build can complete without a borrowed environment instead of waiting forever for PMREM',async()=>{
 let yields=0;const glass=await createFuiMapGeographicGlassAsync(empty,'glacier',undefined,{width:800,height:600},'high',{floatTargets:false,yieldControl:async()=>{yields++;}});
 try{assert(yields>0);assert.equal(glass.reflection,undefined);assert.equal(glass.regions.length,0);}finally{glass.dispose();}
});
test('no-float geography has no mirror; later supported quality/capability transitions create and retire only owned targets',async()=>{
 // A raster stub is sufficient for allocation/lifecycle assertions. No pixel
 // or visual-quality assertion uses this fixture.
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 const documentStub={createElement:()=>({width:1,height:1,getContext:()=>({beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},clearRect(){},getImageData:(_x:number,_y:number,width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)})})})};
 Object.defineProperty(globalThis,'document',{value:documentStub,configurable:true});
 let glass:Awaited<ReturnType<typeof createFuiMapGeographicGlassAsync>>|undefined;
 try{
  glass=await createFuiMapGeographicGlassAsync(data([[120,30],[121,30],[121,31],[120,31],[120,30]]),'glacier',undefined,{width:800,height:600},'low',{floatTargets:false,yieldControl:async()=>{}});
  assert.equal(glass.reflection,undefined);assert.equal(glass.root.getObjectByName('fui-map-live-reflection'),undefined);assert.equal(glass.regions[0].coat.material.uniforms.uHasEnvironment.value,0);
  glass.setQuality('high');assert.equal(glass.reflection,undefined);glass.setFloatTargets(true);
  const mirror=glass.reflection;assert(mirror);const target=mirror.getRenderTarget();let disposed=0;target.addEventListener('dispose',()=>disposed++);
  glass.setFloatTargets(false);assert.equal(glass.reflection,undefined);assert.equal(disposed,1);assert.equal(glass.root.getObjectByName('fui-map-live-reflection'),undefined);
  glass.setQuality('low');glass.setFloatTargets(true);assert.equal(glass.reflection,undefined);glass.setQuality('balanced');assert(glass.reflection);assert.notEqual(glass.reflection,mirror);
 }finally{glass?.dispose();if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
});

test('entity geographic overlay reuses the standalone terrain shader, clear coat and full slab instead of a thin substitute',async()=>{
 // The synthetic rasters are allocation fixtures. The test checks geometry,
 // resource ownership and material identity; real imagery is verified in QA.
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 const raster={beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},clearRect(){},drawImage(){},getImageData:(_x:number,_y:number,width:number,height:number)=>{const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([128,128,160,255],i);return{data};}};
 Object.defineProperty(globalThis,'document',{value:{createElement:()=>({width:1,height:1,getContext:()=>raster})},configurable:true});
 const photograph=new THREE.DataTexture(new Uint8Array(16).fill(128),2,2),relief=new THREE.DataTexture(new Uint8Array(16).fill(160),2,2),regional=new THREE.DataTexture(new Uint8Array(8*8*4).fill(255),8,8),environment=new THREE.Texture();
 environment.image={height:1024,width:768};
 const textures:FuiMapTextures={photograph,relief,photographBounds:new THREE.Vector4(0,0,1,1),reliefBounds:new THREE.Vector4(0,0,1,1),ready:Promise.resolve(),scope:'fixture'};
 let borrowedDisposals=0;for(const texture of [photograph,relief,regional,environment])texture.addEventListener('dispose',()=>borrowedDisposals++);
 let model:Awaited<ReturnType<typeof createFuiMapGeographicGlassAsync>>|undefined,reference:THREE.ShaderMaterial|undefined,coatReference:THREE.MeshPhysicalMaterial|undefined;
 try{
  model=await createFuiMapGeographicGlassAsync(data([[100,30],[102,30],[102,32],[100,32],[100,30]]),'glacier',environment,{width:800,height:600},'low',{surface:'terrain-glass',textures,floatTargets:false,yieldControl:async()=>{}});
  assert.equal(model.terrain.uniforms.uFuiTerrainEnabled.value,1);assert.equal(model.terrain.uniforms.uRelief.value,relief);
  assert.equal(model.reflection,undefined);assert.equal(model.regions.length,1);
  const surfaces:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>[]=[],coats:THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial>[]=[];
  model.root.traverse(object=>{if(object instanceof THREE.Mesh){if(object.material instanceof THREE.ShaderMaterial&&object.material.uniforms.uPhotograph?.value===photograph)surfaces.push(object);if(object.name==='fui-glass-clear-coat'&&object.material instanceof THREE.MeshPhysicalMaterial)coats.push(object);}});
  assert.equal(surfaces.length,1,'Native geographic terrain face is absent or duplicated');assert.equal(coats.length,1,'Standalone glass cover was replaced');
  const surface=surfaces[0];reference=createFuiMapSurface('glacier',model.terrain,textures);
  assert.equal(surface.material.vertexShader,reference.vertexShader);assert.equal(surface.material.fragmentShader,reference.fragmentShader);
  assert.equal(surface.material.uniforms.uFuiTerrainEdges.value,model.edgeField.texture);
  assert.equal(surface.position.z,FUI_MAP_GLASS_LEVELS.top);assert(surface.geometry.getAttribute('position').count>100,'The terrain face lost its actual refined topology');
  assert.equal(surface.geometry.getAttribute('geoUv').count,surface.geometry.getAttribute('position').count);
  coatReference=createFuiMapGlassMaterial(environment);
  for(const key of ['roughness','metalness','transmission','thickness','clearcoat','clearcoatRoughness','ior','opacity'] as const)assert.equal(coats[0].material[key],coatReference[key],`The native cover changed ${key}`);
  assert.equal(coats[0].geometry,surface.geometry);assert.equal(coats[0].material.envMap,environment);
  assert(Math.abs(coats[0].position.z-(FUI_MAP_GLASS_LEVELS.top+.12))<1e-8);
  const walls:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>[]=[];
  model.root.traverse(object=>{if(object instanceof THREE.Mesh&&object.material instanceof THREE.ShaderMaterial&&object.material.userData.fuiSide)walls.push(object);});
  assert(walls.length>0,'Actual native side walls missing');
  for(const wall of walls){assert.equal(wall.material.uniforms.uGlass.value,1);assert.equal(wall.material.uniforms.topZ.value,FUI_MAP_GLASS_LEVELS.top);}
  assert.equal(model.root.getObjectByName('fui-glass-geographic-bottom')!.position.z,FUI_MAP_GLASS_LEVELS.bottom);
  model.updateHover(model.regions[0].key,1);assert.equal(model.regions[0].group.position.z,16);assert.equal(surface.material.uniforms.uSelection.value,1);
  assert.equal(surface.parent,model.regions[0].group);assert.equal(coats[0].parent,model.regions[0].group);
  model.updateHover('',0);assert.equal(model.regions[0].group.position.z,0);assert.equal(surface.material.uniforms.uSelection.value,0);
  assert.equal(model.terrain.uniforms.uHasRegional.value,0);
  const detailed=model.prepareRegionalRelief(regional);assert.equal(model.terrain.uniforms.uHasRegional.value,0,'Detailed GPU elevation appeared before CPU proxies were rebuilt');
  assert.equal(await detailed,true);assert.equal(model.terrain.uniforms.uHasRegional.value,1);assert.equal(model.terrain.uniforms.uRegional.value,regional);
  assert.equal(model.terrain.proxies.length,1);assert(model.terrain.heightTexture,'Regional filtered height atlas missing');
  const positions=model.terrain.proxies[0].positions;let peak=-Infinity;
  for(let i=0;i<positions.count;i++)peak=Math.max(peak,positions.getZ(i));
  assert(Math.abs(peak-(model.terrain.uniforms.uFuiTerrainScale.value-.3))<1e-4,'CPU pick geometry did not reach the detailed regional elevation');
  let ownedHeightDisposed=0;model.terrain.heightTexture.addEventListener('dispose',()=>ownedHeightDisposed++);
  let surfaceDisposed=0;surface.geometry.addEventListener('dispose',()=>surfaceDisposed++);
  const retirement=model.disposeStages();assert.equal(retirement.next().done,false);
  assert.equal(ownedHeightDisposed,0,'Resource-sized retirement released the later height atlas eagerly');
  assert(model.root.children.length>0,'The staged owner was cleared before its resources drained');
  // A synchronous final removal can take over an already started retirement;
  // it must drain that same iterator rather than losing the marked owner.
  model.dispose();assert.equal(ownedHeightDisposed,1,'Owned regional height atlas leaked');
  assert.equal(surfaceDisposed,1,'The shared terrain/cover geometry was disposed twice');assert.equal(model.root.children.length,0);
  assert.equal(retirement.next().done,true);
 }finally{model?.dispose();reference?.dispose();coatReference?.dispose();assert.equal(borrowedDisposals,0,'Model disposed borrowed image or environment textures');photograph.dispose();relief.dispose();regional.dispose();environment.dispose();if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
});
