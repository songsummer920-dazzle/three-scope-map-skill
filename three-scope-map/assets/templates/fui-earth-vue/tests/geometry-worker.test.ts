// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFuiMapGlassFootprint,createFuiMapGlassBodyGeometry,createFuiMapGlassBodyFromGeometry} from '../src/components/map/fuiMapGlass';
import {packFuiMapGeometryInput,packFuiMapGeometry,unpackFuiMapGeometry,prepareFuiMapGeometry,fuiMapGeometryTransfers,runFuiMapGeometryWorker,disposeFuiMapGeometry,type FuiMapGeometryInput} from '../src/components/map/fuiMapGeometry';
import {runFuiMapBuild} from '../src/components/map/fuiMapBuildStages';
import {createFuiMapSideGradientMaterial} from '../src/components/map/fuiMapSideMaterial';

const ring=(points:number[][])=>points.map(([x,y])=>new THREE.Vector2(x,y));
const regions=[{key:'west',polygons:[[ring([[0,0],[20,0],[20,30],[0,30],[0,0]]),ring([[5,5],[5,10],[10,10],[10,5],[5,5]])]]},{key:'east',polygons:[[ring([[20,0],[40,0],[40,30],[20,30],[20,0]])],[ring([[50,0],[54,0],[54,4],[50,4],[50,0]])]]}];
const owners=regions.map(region=>({name:region.key,rings:region.polygons.flat()}));
function footprint(){return createFuiMapGlassFootprint(regions.flatMap(region=>region.polygons.map(polygon=>polygon.map(ring=>ring.map(point=>[point.x,point.y] as [number,number])))));}
function describe(geometry:THREE.BufferGeometry){return{attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute])=>[name,{array:Array.from(attribute.array),itemSize:attribute.itemSize,normalized:attribute.normalized}])),index:geometry.index?Array.from(geometry.index.array):null,groups:geometry.groups,box:geometry.boundingBox?[...geometry.boundingBox.min.toArray(),...geometry.boundingBox.max.toArray()]:undefined,sphere:geometry.boundingSphere?[...geometry.boundingSphere.center.toArray(),geometry.boundingSphere.radius]:undefined};}
function area(shapes:THREE.Shape[]){return shapes.reduce((sum,shape)=>sum+Math.abs(THREE.ShapeUtils.area(shape.getPoints()))-shape.holes.reduce((value,hole)=>value+Math.abs(THREE.ShapeUtils.area(hole.getPoints())),0),0);}

test('transfer round trip preserves exact positions, normals, topology, bounds, ownership and lift uniforms',()=>{
 const shapes=footprint(),body=createFuiMapGlassBodyGeometry(shapes,owners),packed=packFuiMapGeometry(shapes,body),roundTrip=unpackFuiMapGeometry(structuredClone(packed,{transfer:fuiMapGeometryTransfers(packed)}));
 // structuredClone transfers the original body arrays. The second independent
 // build is the synchronous reference, not an approximation of its buffers.
 const expected=createFuiMapGlassBodyGeometry(footprint(),owners);
 assert.deepEqual(describe(roundTrip.body.bottom),describe(expected.bottom));assert.equal(roundTrip.body.walls.length,expected.walls.length);
 for(let i=0;i<expected.walls.length;i++){assert.equal(roundTrip.body.walls[i].owner,expected.walls[i].owner);assert.deepEqual(describe(roundTrip.body.walls[i].geometry),describe(expected.walls[i].geometry));}
 const material=new THREE.ShaderMaterial({uniforms:{topColor:{value:new THREE.Color('#00aaff')}}}),group=createFuiMapGlassBodyFromGeometry(roundTrip.body,material);
 try{
  assert.equal(group.getObjectByName('fui-glass-geographic-bottom')!.position.z,12);
  for(const owner of group.children.filter(child=>child.name==='fui-glass-owner-wall')){
   assert(['west','east'].includes(owner.userData.fuiWallOwner));const core=owner.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
   assert.equal(core.material.uniforms.uLift,owner.userData.fuiWallLift);owner.userData.fuiWallLift.value=16;assert.equal(core.material.uniforms.uLift.value,16);
   assert(core.geometry.boundingBox!.min.z<=-4);assert.equal(core.geometry.boundingBox!.max.z,44);
  }
 }finally{disposeFuiMapGeometry(roundTrip);expected.bottom.dispose();for(const wall of expected.walls)wall.geometry.dispose();material.dispose();group.traverse(object=>{if(object instanceof THREE.Mesh)(object.material as THREE.Material).dispose();});}
});

test('worker one-shot union retains exact covered area, holes, islands and exterior owners',()=>{
 const input=packFuiMapGeometryInput(regions),before=structuredClone(input),prepared=unpackFuiMapGeometry(prepareFuiMapGeometry(input)),reference=footprint();
 try{assert.deepEqual(input,before);assert.equal(area(prepared.footprint),1191);assert.equal(area(prepared.footprint),area(reference));assert.equal(prepared.footprint.length,2);assert.equal(prepared.footprint.reduce((sum,shape)=>sum+shape.holes.length,0),1);assert.deepEqual([...new Set(prepared.body.walls.map(wall=>wall.owner))].sort(),['east','west']);}
 finally{disposeFuiMapGeometry(prepared);}
});

test('overlay batches only additive owner coats while retaining every exact wall triangle and sorted color core',()=>{
 const material=new THREE.ShaderMaterial({uniforms:{topColor:{value:new THREE.Color('#00aaff')}}});
 const build=(batchAdditiveCoats:boolean)=>createFuiMapGlassBodyFromGeometry(createFuiMapGlassBodyGeometry(footprint(),owners),material,undefined,{batchAdditiveCoats});
 const before=build(false),after=build(true);
 const triangles=(meshes:THREE.Mesh[])=>meshes.flatMap(mesh=>{
  const g=mesh.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),index=g.getIndex(),values:string[]=[];
  for(let i=0;i<(index?.count??p.count);i+=3){
   const points=[];for(let j=0;j<3;j++){const v=index?index.getX(i+j):i+j;points.push([p.getX(v),p.getY(v),p.getZ(v),n.getX(v),n.getY(v),n.getZ(v)]);}
   values.push(JSON.stringify(points));
  }
  return values;
 }).sort();
 const children=(group:THREE.Object3D,name:string)=>group.children.filter(child=>child.name===name) as THREE.Mesh[];
 const dispose=(group:THREE.Object3D)=>{
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const item of Array.isArray(object.material)?object.material:[object.material])materials.add(item);}});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
 };
 try{
  for(const owner of after.children.filter(child=>child.name==='fui-glass-owner-wall')){
   const old=before.children.find(child=>child.userData.fuiWallOwner===owner.userData.fuiWallOwner)!;
   const oldCore=children(old,'fui-glass-exterior-core'),newCore=children(owner,'fui-glass-exterior-core');
   assert.equal(newCore.length,oldCore.length,'Normal-blended island cores lost independent sorting/culling');
   for(let i=0;i<oldCore.length;i++){assert.deepEqual(describe(newCore[i].geometry),describe(oldCore[i].geometry));assert.equal(newCore[i].renderOrder,5);assert.equal(newCore[i].frustumCulled,oldCore[i].frustumCulled);}
   const coats=children(owner,'fui-glass-continuous-shell');assert.equal(coats.length,1);
   assert.deepEqual(triangles(coats),triangles(children(old,'fui-glass-continuous-shell')),'Indexed coat concatenation changed vertices, normals or topology');
   const coat=coats[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial>;
   assert.equal(coat.material.blending,THREE.AdditiveBlending);assert.equal(coat.material.depthWrite,false);assert.equal(coat.renderOrder,8);
   assert(coat.geometry.boundingBox!.min.z<=-4&&coat.geometry.boundingBox!.max.z===44,'Merged bounds lost the anchored foot or lifted upper wall');
   const reference=(children(old,'fui-glass-continuous-shell')[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial>).material;
   for(const key of ['roughness','clearcoat','clearcoatRoughness','specularIntensity','envMapIntensity','opacity','side','depthTest','depthWrite','blending'] as const)assert.equal(coat.material[key],reference[key]);
   assert.equal(coat.material.customProgramCacheKey(),reference.customProgramCacheKey());
   type Shader=Parameters<typeof coat.material.onBeforeCompile>[0];
   const shader={uniforms:{},vertexShader:'#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:'#include <opaque_fragment>'} as Shader;
   coat.material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
   assert.equal(shader.uniforms.uLift,owner.userData.fuiWallLift);owner.userData.fuiWallLift.value=16;assert.equal(shader.uniforms.uLift.value,16);
   assert.equal(shader.uniforms.uFuiWallTint,(newCore[0].material as THREE.ShaderMaterial).uniforms.topColor);
  }
  const count=(group:THREE.Object3D)=>{let value=0;group.traverse(object=>{if(object.name==='fui-glass-continuous-shell')value++;});return value;};
  assert(count(after)<count(before),'Fixture did not reduce repeated island coats');
 }finally{dispose(before);dispose(after);material.dispose();}
});

test('sorted wall batch preserves indexed geometry, padded per-island bounds and owner state without rendering proxies',()=>{
 const material=createFuiMapSideGradientMaterial({accent:'#00bfff',sideMid:'#005599',sideBottom:'#01080d'});material.uniforms.uGlass.value=1;
 const group=createFuiMapGlassBodyFromGeometry(createFuiMapGlassBodyGeometry(footprint(),owners),material,undefined,{batchAdditiveCoats:true,batchSortedCores:true});
 const batch=group.getObjectByName('fui-glass-sorted-wall-cores') as THREE.BatchedMesh;
 const entries=batch.userData.fuiWallInstances as {wall:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;geometryId:number;instanceId:number}[];
 try{
  assert(batch instanceof THREE.BatchedMesh);assert.equal(batch.perObjectFrustumCulled,true);assert.equal(batch.sortObjects,true);assert.equal(batch.frustumCulled,false);assert.equal(batch.renderOrder,5);
  assert.equal(batch.instanceCount,entries.length);assert(entries.length>owners.length);
  for(const entry of entries){
   assert.equal(entry.wall.visible,false);assert.equal(entry.wall.userData.fuiRenderProxy,true);
   const source=entry.wall.geometry,range=batch.getGeometryRangeAt(entry.geometryId)!,sourceIndex=source.index!,index=batch.geometry.index!,p=source.getAttribute('position'),n=source.getAttribute('normal'),bp=batch.geometry.getAttribute('position'),bn=batch.geometry.getAttribute('normal');
   assert.equal(range.indexCount,sourceIndex.count);
   for(let i=0;i<sourceIndex.count;i++){
    const before=sourceIndex.getX(i),after=index.getX(range.indexStart+i);
    assert.deepEqual([bp.getX(after),bp.getY(after),bp.getZ(after),bn.getX(after),bn.getY(after),bn.getZ(after)],
      [p.getX(before),p.getY(before),p.getZ(before),n.getX(before),n.getY(before),n.getZ(before)]);
   }
   assert.deepEqual(batch.getBoundingSphereAt(entry.geometryId,new THREE.Sphere()),source.boundingSphere);
   entry.wall.material.uniforms.uLift.value=16;entry.wall.material.uniforms.uSelection.value=.75;entry.wall.material.uniforms.uOpacity.value=.6;
  }
  batch.userData.fuiSyncWallState();
  for(const entry of entries){
   const matrix=batch.getMatrixAt(entry.instanceId,new THREE.Matrix4()),color=new THREE.Color();batch.getColorAt(entry.instanceId,color);
   assert.deepEqual(matrix.elements,new THREE.Matrix4().makeTranslation(0,0,16).elements);assert.equal(color.r,16);assert.equal(color.g,.75);assert(Math.abs(color.b-.6)<1e-6);
   for(const z of [24,28,36,44]){
    const t=(z-24)/20,original=12+t*32-16*(1-t)+16;
    const point=new THREE.Vector3(0,0,12+t*32-color.r*(1-t)).applyMatrix4(matrix);assert(Math.abs(point.z-original)<1e-9);
   }
  }
  const shader=batch.material as THREE.ShaderMaterial;
  assert.equal(shader.blending,THREE.NormalBlending);assert.equal(shader.side,THREE.FrontSide);assert.equal(shader.depthWrite,false);
  assert(shader.vertexShader.includes('#include <batching_pars_vertex>')&&shader.vertexShader.includes('#include <batching_vertex>'));
  assert(shader.vertexShader.includes('modelViewMatrix*batchingMatrix*vec4(stretched,1.0)'));
  assert(shader.vertexShader.includes('stretchedNormal.z/=(uGlass>.5?1.6:1.0)+fuiBatchLift/20.0'));
  assert(shader.fragmentShader.includes('body*=1.0+.30*vFuiBatchSelection'));
 }finally{batch.dispose();group.traverse(object=>{if(object instanceof THREE.Mesh&&object!==batch){object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();}});(batch.material as THREE.Material).dispose();material.dispose();}
});

test('sorted transparent wall batch keeps the legacy cross-owner projected-center ordering at rotated views',()=>{
 const material=createFuiMapSideGradientMaterial({accent:'#00bfff',sideMid:'#005599',sideBottom:'#01080d'}),group=createFuiMapGlassBodyFromGeometry(createFuiMapGlassBodyGeometry(footprint(),owners),material,undefined,{batchSortedCores:true});
 const batch=group.getObjectByName('fui-glass-sorted-wall-cores') as THREE.BatchedMesh;
 const entries=batch.userData.fuiWallInstances as {wall:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;geometryId:number;instanceId:number}[];
 try{
  entries.forEach((entry,i)=>{entry.wall.material.uniforms.uLift.value=i%2?16:0;});batch.userData.fuiSyncWallState();
  group.position.set(200,-100,30);group.rotation.z=.3;group.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(45,1.5,.1,2000);
  for(const eye of [[350,-300,500],[-200,100,220],[200,450,60]]){
   camera.position.fromArray(eye);camera.lookAt(220,-80,45);camera.updateMatrixWorld(true);
   const clip=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(batch.matrixWorld);
   const expected=entries.map((entry,index)=>({index,z:entry.wall.geometry.boundingSphere!.center.clone().add(new THREE.Vector3(0,0,entry.wall.material.uniforms.uLift.value)).applyMatrix4(clip).z})).sort((a,b)=>b.z-a.z||a.index-b.index).map(value=>value.index);
   const ranges=entries.map((entry,index)=>({start:batch.getGeometryRangeAt(entry.geometryId)!.start,count:1,z:0,index}));
   batch.customSort!.call(batch,ranges,camera);assert.deepEqual(ranges.map(value=>value.index),expected);
  }
 }finally{batch.dispose();group.traverse(object=>{if(object instanceof THREE.Mesh&&object!==batch){object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();}});(batch.material as THREE.Material).dispose();material.dispose();}
});

class WorkerFixture{
 onmessage:((event:MessageEvent)=>void)|null=null;onerror:((event:ErrorEvent)=>void)|null=null;terminated=0;input?:FuiMapGeometryInput;transfers:Transferable[]=[];
 postMessage(input:FuiMapGeometryInput,transfers:Transferable[]){this.input=input;this.transfers=transfers;}
 terminate(){this.terminated++;}
}
test('cancelling an in-flight geometry worker terminates it and rejects instead of publishing stale geometry',async()=>{
 const worker=new WorkerFixture(),controller=new AbortController(),request=runFuiMapGeometryWorker(packFuiMapGeometryInput(regions),controller.signal,()=>worker as unknown as Worker);
 assert(worker.transfers.length>0);assert(worker.input);controller.abort();await assert.rejects(request,{name:'AbortError'});assert.equal(worker.terminated,1);assert.equal(worker.onmessage,null);
 let constructed=false;await assert.rejects(runFuiMapGeometryWorker(packFuiMapGeometryInput(regions),controller.signal,()=>{constructed=true;return worker as unknown as Worker;}),{name:'AbortError'});assert.equal(constructed,false);
});
test('worker completion and unsupported workers release their own resources and preserve cooperative fallback',async()=>{
 const worker=new WorkerFixture(),request=runFuiMapGeometryWorker(packFuiMapGeometryInput(regions),undefined,()=>worker as unknown as Worker),geometry=prepareFuiMapGeometry(worker.input!);
 worker.onmessage!({data:{geometry}} as MessageEvent);assert.equal(await request,geometry);assert.equal(worker.terminated,1);
 assert.equal(await runFuiMapGeometryWorker(packFuiMapGeometryInput(regions),undefined,()=>{throw new Error('Worker unavailable');}),undefined);
});
test('budgeted construction yields to pending cancellation and always closes the active generator',async()=>{
 const controller=new AbortController();let closed=false,stages=0;
 function* work(){try{for(let i=0;i<10000;i++){const until=performance.now()+.1;while(performance.now()<until){}stages++;yield;}}finally{closed=true;}}
 const timer=setTimeout(()=>controller.abort(),0);
 try{await assert.rejects(runFuiMapBuild(work(),{signal:controller.signal}),{name:'AbortError'});assert(closed);assert(stages>1&&stages<10000);}
 finally{clearTimeout(timer);}
 let observed=0;function* deterministic(){yield;yield;return 42;}
 assert.equal(await runFuiMapBuild(deterministic(),{yieldControl:async()=>{observed++;}}),42);assert.equal(observed,2);
});
