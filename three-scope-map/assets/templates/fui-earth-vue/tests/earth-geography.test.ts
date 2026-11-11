// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import {loadEarthGeography,type EarthGeographyManifest} from '../src/components/map/fuiEarthGeography';
import {createFuiEarthHologram} from '../src/components/map/fuiEarthHologram';
import type {GeoFeatureCollection} from '../src/types/geo';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const outline=new Float32Array([1,2,3,4,5,6]),outlineBytes=new Uint8Array(outline.buffer),mask=new Uint8Array([255,0,12,0]);
const urls={outlines:'coast-cache',hologram:'atlas-cache'};
const metadata:EarthGeographyManifest={version:1,outlines:{bytes:outlineBytes.length,sha256:sha(outlineBytes),gzipBytes:gzipSync(outlineBytes).length,vertices:2,radius:2.012},hologram:{bytes:4,sha256:sha(mask),gzipBytes:gzipSync(mask).length,width:1,height:1}};
const response=(bytes:Uint8Array,status=200)=>new Response(new Uint8Array(bytes),{status});
const empty:GeoFeatureCollection={type:'FeatureCollection',features:[]};

test('surface loads only the verified native coastline bytes and preserves exact GPU coordinates',async()=>{
 const requests:string[]=[],signal=new AbortController().signal;
 const result=await loadEarthGeography('surface',urls,metadata,signal,async url=>{requests.push(String(url));return response(gzipSync(outlineBytes));});
 assert.deepEqual(requests,['coast-cache']);assert.equal(result.kind,'surface');if(result.kind!=='surface')return;
 assert.deepEqual(result.outlines,outline);assert.equal(result.radius,2.012);assert.equal(result.diagnostics.decodedBytes,24);
});
test('both hologram presentations request only the packed atlas, without world JSON or coastline dependencies',async()=>{
 for(const style of ['hologram','hologram-hex'] as const){const requests:string[]=[];
  const result=await loadEarthGeography(style,urls,metadata,new AbortController().signal,async url=>{requests.push(String(url));return response(gzipSync(mask));});
  assert.deepEqual(requests,['atlas-cache']);assert.equal(result.kind,'hologram');if(result.kind==='hologram')assert.deepEqual(result.mask.pixels,mask);
 }
});
test('HTTP failures, malformed payloads and supported runtime checksum mismatches reject the first-frame dependency',async()=>{
 await assert.rejects(loadEarthGeography('surface',urls,metadata,new AbortController().signal,async()=>response(new Uint8Array(),404)),/HTTP 404/);
 await assert.rejects(loadEarthGeography('surface',urls,metadata,new AbortController().signal,async()=>response(gzipSync(mask))),/dimensions/);
 if(globalThis.crypto?.subtle)await assert.rejects(loadEarthGeography('surface',urls,{...metadata,outlines:{...metadata.outlines,sha256:'0'.repeat(64)}},new AbortController().signal,async()=>response(gzipSync(outlineBytes))),/checksum/);
});
test('an already aborted owner performs no fetch and a new retry can load the same asset',async()=>{
 const controller=new AbortController();controller.abort(new Error('retired'));let calls=0;
 const fetcher:typeof fetch=async()=>{calls++;return response(outlineBytes);};
 await assert.rejects(loadEarthGeography('surface',urls,metadata,controller.signal,fetcher),/retired/);assert.equal(calls,0);
 const result=await loadEarthGeography('surface',urls,metadata,new AbortController().signal,fetcher);assert.equal(result.kind,'surface');assert.equal(calls,1);
});
test('retirement and timeout reject even when an underlying fetch ignores its abort signal',{timeout:1000},async()=>{
 const retired=new AbortController();let requestSignal:AbortSignal|undefined;
 const pending=loadEarthGeography('hologram',urls,metadata,retired.signal,async(_url,options)=>{requestSignal=options?.signal??undefined;return new Promise<Response>(()=>{});});
 retired.abort(new Error('unmounted'));await assert.rejects(pending,/unmounted/);assert.equal(requestSignal?.aborted,true);
 await assert.rejects(loadEarthGeography('hologram',urls,metadata,new AbortController().signal,async()=>new Promise<Response>(()=>{}),10),/timed out/);
});
test('a prepared hologram mask is borrowed in the original DataTexture layout without any runtime Canvas geographic builder',()=>{
 const pixels=new Uint8Array([255,0,12,0]);
 const holo=createFuiEarthHologram(undefined,empty,'glacier',[],new THREE.Vector3(1,1,1),'dots',undefined,undefined,{width:1,height:1,pixels});
 const texture=holo.uniforms.uGeography.value as THREE.DataTexture;
 assert.equal(texture.image.data,pixels);assert.equal(texture.flipY,false);assert.equal(texture.colorSpace,THREE.NoColorSpace);assert.equal(texture.minFilter,THREE.LinearFilter);assert.equal(texture.generateMipmaps,false);
 assert.equal(holo.diagnostics.atlasSize,'1x1');assert.equal(holo.diagnostics.pattern,'dots');
 holo.dispose();holo.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();object.material instanceof THREE.Material&&object.material.dispose();}});
});
