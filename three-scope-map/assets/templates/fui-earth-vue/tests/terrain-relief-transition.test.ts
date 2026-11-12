// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bindFuiTerrainRaycast,prepareFuiTerrainRegional,updateFuiTerrainHitProxies,startFuiTerrainRegionalBlend,advanceFuiTerrainRegionalBlend,FUI_TERRAIN_REGIONAL_BLEND_MS,type FuiTerrainState} from '../src/components/map/fuiMapTerrain';
import {createFuiMapGeographicGlassAsync} from '../src/components/map/fuiMapGeographicGlass';
import type {FuiMapTextures} from '../src/components/map/fuiMapSurface';
import type {GeoFeatureCollection} from '../src/types/geo';

function texture(blue:number|((x:number,y:number)=>number)){
  const data=new Uint8Array(8*8*4);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const p=(y*8+x)*4;data[p]=128;data[p+1]=128;data[p+2]=typeof blue==='number'?blue:blue(x,y);data[p+3]=255;
  }
  const result=new THREE.DataTexture(data,8,8);result.needsUpdate=true;return result;
}
function fixture(){
  const overview=texture(64),detail=texture(255),edge=new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1);
  const state:FuiTerrainState={uniforms:{uRelief:{value:overview},uRegional:{value:overview},uFuiHeightMap:{value:overview},uRegionalBounds:{value:new THREE.Vector4()},uHasRegional:{value:0},uFuiTerrainScale:{value:10},uFuiTerrainEnabled:{value:1}},
    field:{texture:edge,bounds:new THREE.Vector4(-2,-2,4,4)},projection:new THREE.Vector4(.01,.01,.5,.5),overview:{data:overview.image.data,width:8,height:8},overviewOrigin:new THREE.Vector2(0,0),overviewSize:new THREE.Vector2(1,1),proxies:[]};
  const meshes:THREE.Mesh[]=[];
  const mesh=()=>{const geometry=new THREE.PlaneGeometry(2,2,2,2),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));meshes.push(mesh);bindFuiTerrainRaycast(mesh,geometry,state);mesh.updateMatrixWorld(true);return mesh;};
  const pick=(mesh:THREE.Mesh,x=0,y=0)=>{mesh.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(x,y,30),new THREE.Vector3(0,0,-1)).intersectObject(mesh,false)[0];};
  const cleanup=()=>{for(const mesh of meshes){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}for(const hit of state.proxies){hit.proxy.geometry.dispose();(hit.proxy.material as THREE.Material).dispose();}state.heightTexture?.dispose();overview.dispose();detail.dispose();edge.dispose();};
  return{state,overview,detail,mesh,pick,cleanup};
}

test('late regional relief advances continuously and CPU picking uses the exact intermediate surface without vertex rewrites',()=>{
  const f=fixture();try{
    const mesh=f.mesh(),positions=f.state.proxies[0].positions,base=positions.getZ(4),original=positions.array.slice();
    prepareFuiTerrainRegional(f.state,f.detail,[-10,-10,10,10]);updateFuiTerrainHitProxies(f.state);
    f.state.uniforms.uHasRegional.value=1;const end=f.pick(mesh).point.z;
    startFuiTerrainRegionalBlend(f.state,true,1000);
    const heights:number[]=[];
    for(const fraction of [0,.25,.5,.75,1]){
      const moving=advanceFuiTerrainRegionalBlend(f.state,1000+FUI_TERRAIN_REGIONAL_BLEND_MS*fraction),blend=f.state.uniforms.uHasRegional.value;
      const hit=f.pick(mesh);assert(hit);heights.push(hit.point.z);
      assert(Math.abs(hit.point.z-THREE.MathUtils.lerp(base,end,blend))<1e-5);
      assert.equal(moving,fraction<1);
      assert(f.state.proxies[0].proxy.geometry.boundingBox!.containsPoint(hit.point));
      assert.deepEqual(positions.array,original,'A frame/pick rebuilt the dense proxy position buffer');
    }
    assert(heights.every((height,i)=>i===0||height>heights[i-1]));
    assert.equal(f.state.uniforms.uHasRegional.value,1);assert.equal(f.state.regionalBlend,undefined);
  }finally{f.cleanup();}
});

test('shared blend remains correct for separate region proxies and pre-reveal detail snaps to its final surface',()=>{
  const f=fixture();try{
    const first=f.mesh(),second=f.mesh();second.position.set(3,0,2);second.updateMatrixWorld(true);
    prepareFuiTerrainRegional(f.state,f.detail,[-10,-10,10,10]);updateFuiTerrainHitProxies(f.state);
    startFuiTerrainRegionalBlend(f.state,true,2000);advanceFuiTerrainRegionalBlend(f.state,2000+FUI_TERRAIN_REGIONAL_BLEND_MS/2);
    const a=f.pick(first),b=f.pick(second,3,0);assert(a&&b);assert(Math.abs(b.point.z-a.point.z-2)<1e-5);
    startFuiTerrainRegionalBlend(f.state,false,2010);assert.equal(f.state.uniforms.uHasRegional.value,1);assert.equal(advanceFuiTerrainRegionalBlend(f.state,2010),false);
    assert(f.pick(first).point.z>a.point.z);assert.equal(f.state.regionalBlend,undefined);
  }finally{f.cleanup();}
});

test('a second regional field keeps the original overview endpoint and releases only its previous owned filtered height texture',()=>{
  const f=fixture(),replacement=texture(128);try{
    const mesh=f.mesh(),base=f.pick(mesh).point.z;
    let borrowedDisposals=0;f.detail.addEventListener('dispose',()=>borrowedDisposals++);replacement.addEventListener('dispose',()=>borrowedDisposals++);
    prepareFuiTerrainRegional(f.state,f.detail,[-10,-10,10,10]);updateFuiTerrainHitProxies(f.state);
    const owned=f.state.heightTexture!;let ownedDisposals=0;owned.addEventListener('dispose',()=>ownedDisposals++);
    f.state.uniforms.uHasRegional.value=.7;
    prepareFuiTerrainRegional(f.state,replacement,[-10,-10,10,10]);updateFuiTerrainHitProxies(f.state);
    assert.equal(ownedDisposals,1);assert.equal(borrowedDisposals,0);
    f.state.uniforms.uHasRegional.value=1;const end=f.pick(mesh).point.z;
    f.state.uniforms.uHasRegional.value=.25;
    assert(Math.abs(f.pick(mesh).point.z-THREE.MathUtils.lerp(base,end,.25))<1e-5,'Previous intermediate blend replaced the overview baseline');
  }finally{f.cleanup();replacement.dispose();}
});

test('oblique regional triangles keep interpolated geometric normals and conservative endpoint bounds',()=>{
  const f=fixture(),gradient=texture((x,y)=>Math.min(255,32+x*21+y*8));try{
    const mesh=f.mesh();prepareFuiTerrainRegional(f.state,gradient,[-10,-10,10,10]);updateFuiTerrainHitProxies(f.state);
    const normalAt=(blend:number)=>{f.state.uniforms.uHasRegional.value=blend;const hit=f.pick(mesh,.2,.15);assert(hit);return hit.face!.normal.clone();};
    const start=normalAt(0),middle=normalAt(.5),end=normalAt(1);
    assert(start.z>.99999);assert(Math.abs(middle.x)>1e-3&&Math.abs(end.x)>Math.abs(middle.x));
    assert(Math.abs(middle.length()-1)<1e-8&&Math.abs(end.length()-1)<1e-8);
    for(const blend of [0,.1,.5,.9,1]){f.state.uniforms.uHasRegional.value=blend;assert(f.pick(mesh,.8,.8));}
  }finally{f.cleanup();gradient.dispose();}
});

test('the real geographic model fades late detail, completes hidden preparation without an animation loop and owns only its filtered texture',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  const raster={beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},clearRect(){},drawImage(){},getImageData:(_x:number,_y:number,width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4).fill(128)})};
  Object.defineProperty(globalThis,'document',{value:{createElement:()=>({width:1,height:1,getContext:()=>raster})},configurable:true});
  const photograph=texture(128),overview=texture(64),detail=texture(255);
  const textures:FuiMapTextures={photograph,relief:overview,photographBounds:new THREE.Vector4(0,0,1,1),reliefBounds:new THREE.Vector4(0,0,1,1),ready:Promise.resolve(),scope:'fixture'};
  const data:GeoFeatureCollection={type:'FeatureCollection',features:[{type:'Feature',properties:{adcode:'fixture'},geometry:{type:'Polygon',coordinates:[[[100,30],[101,30],[101,31],[100,31],[100,30]]]}}]};
  let model:Awaited<ReturnType<typeof createFuiMapGeographicGlassAsync>>|undefined;
  try{
    let borrowedDisposals=0;for(const value of [photograph,overview,detail])value.addEventListener('dispose',()=>borrowedDisposals++);
    model=await createFuiMapGeographicGlassAsync(data,'glacier',undefined,{width:800,height:600},'low',{surface:'terrain-glass',textures,floatTargets:false,yieldControl:async()=>{}});
    assert.equal(await model.prepareRegionalRelief(detail,undefined,{blend:true}),true);
    assert.equal(model.terrain.uniforms.uHasRegional.value,0);assert.equal(model.root.userData.fuiReliefBlend,0);
    const started=model.terrain.regionalBlend!.startedAt;
    assert.equal(model.updateRegionalRelief(started+FUI_TERRAIN_REGIONAL_BLEND_MS/2),true);
    assert(Math.abs(model.root.userData.fuiReliefBlend-.5)<1e-12,'Half-time blend must remain one half within timestamp precision');
    assert.equal(model.updateRegionalRelief(started+FUI_TERRAIN_REGIONAL_BLEND_MS/2,true),false);
    assert.equal(model.terrain.uniforms.uHasRegional.value,1);assert.equal(model.root.userData.fuiReliefBlend,1);
    const height=model.terrain.heightTexture!;let ownedDisposals=0;height.addEventListener('dispose',()=>ownedDisposals++);
    model.dispose();assert.equal(ownedDisposals,1);assert.equal(borrowedDisposals,0);
    assert.equal(model.updateRegionalRelief(started+FUI_TERRAIN_REGIONAL_BLEND_MS),false);
  }finally{model?.dispose();photograph.dispose();overview.dispose();detail.dispose();if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
});
