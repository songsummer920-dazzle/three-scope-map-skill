// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
const root=process.cwd(),command=path.join(root,'scripts/fui-earth-geography-cache.mjs'),asset='src/assets/maps/earth-geography/';
const check=dir=>spawnSync(process.execPath,[command,dir,'--check'],{encoding:'utf8'});
const fixture=async()=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'earth-geography-test-'));
 for(const name of ['package.json','src/components/map/fuiEarthHologram.ts','src/assets/maps/china.json','src/assets/maps/world.earth-render.json',asset+'earth-geography-cache.json',asset+'world-outlines.f32.gz',asset+'hologram-mask.rgba.gz']){
  await fs.mkdir(path.dirname(path.join(dir,name)),{recursive:true});await fs.copyFile(path.join(root,name),path.join(dir,name));
 }
 await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');return dir;
};
test('both geographic cache payloads pass the actual source, builder, dimensions and decompressed SHA build gate',()=>{
 const result=check(root);assert.equal(result.status,0,result.stderr);
});
test('GPU coast positions exactly match every original geographic ring and original Three.js longitude conversion',async()=>{
 const world=JSON.parse(await fs.readFile(path.join(root,'src/assets/maps/world.earth-render.json'),'utf8'));
 const raw=gunzipSync(await fs.readFile(path.join(root,asset+'world-outlines.f32.gz'))),actual=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
 let index=0;const expected=new THREE.Vector3(),next=new THREE.Vector3();
 const project=(p,out)=>{const phi=THREE.MathUtils.degToRad(90-p[1]),theta=THREE.MathUtils.degToRad(p[0]+180);return out.set(-2.012*Math.sin(phi)*Math.cos(theta),2.012*Math.cos(phi),2.012*Math.sin(phi)*Math.sin(theta));};
 for(const feature of world.features){
  if(String(feature.properties?.adcode??feature.properties?.code??'').endsWith('_JD'))continue;
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  for(const rings of polygons)for(const ring of rings){if(ring.length<2)continue;
   for(let i=0;i<ring.length;i++)for(const point of [project(ring[i],expected),project(ring[(i+1)%ring.length],next)])for(const value of point.toArray())assert.equal(actual[index++],Math.fround(value));
  }
 }
 assert.equal(index,actual.length);assert.equal(index/3,291142);
});
test('changing world geography without rebaking is rejected',async()=>{
 const dir=await fixture();try{
  const filename=path.join(dir,'src/assets/maps/world.earth-render.json'),data=JSON.parse(await fs.readFile(filename,'utf8'));
  data.features[0].properties.cacheRegression='changed';await fs.writeFile(filename,JSON.stringify(data));
  const result=check(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/stale/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('changing the geographic raster builder without rebaking is rejected',async()=>{
 const dir=await fixture();try{
  const filename=path.join(dir,'src/components/map/fuiEarthHologram.ts');await fs.writeFile(filename,(await fs.readFile(filename,'utf8')).replace('const width=3072,height=1536','const width=3070,height=1536'));
  const result=check(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/stale/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('same-size hologram payload metadata with an incorrect decoded pixel hash is rejected',async()=>{
 const dir=await fixture();try{
  const filename=path.join(dir,asset+'earth-geography-cache.json'),meta=JSON.parse(await fs.readFile(filename,'utf8'));meta.hologram.sha256='0'.repeat(64);await fs.writeFile(filename,JSON.stringify(meta));
  const result=check(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/payload/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
