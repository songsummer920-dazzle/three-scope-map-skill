// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFuiFlatTerrainState} from '../src/components/map/fuiMapTerrain';

test('smooth glass prepares a flat geographic binding without browser image or Canvas APIs',()=>{
  // Node has no document, Image, WebGL or Canvas implementation: an accidental
  // DEM readback or image-based initialization fails this real preparation.
  const edgeTexture=new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1);
  const field={texture:edgeTexture,bounds:new THREE.Vector4(-20,-10,40,20)};
  const projection=new THREE.Vector4(.001,.002,.5,.5);
  const state=createFuiFlatTerrainState(field,projection);
  assert.equal(state.field,field);assert.equal(state.projection,projection);
  assert.equal(state.uniforms.uFuiTerrainEdges.value,edgeTexture);
  assert.equal(state.uniforms.uFuiTerrainBounds.value,field.bounds);
  assert.equal(state.uniforms.uFuiTerrainEnabled.value,0);
  assert.equal(state.uniforms.uFuiTerrainScale.value,0);
  assert.equal(state.proxies.length,0);
  const neutral=state.heightTexture!;
  assert.equal(neutral.image.width,1);assert.equal(neutral.image.height,1);
  assert.deepEqual(Array.from(neutral.image.data),[128,128,0,255]);
  for(const key of ['uRelief','uRegional','uFuiHeightMap'])assert.equal(state.uniforms[key].value,neutral);
  assert.equal(neutral.generateMipmaps,false);
  neutral.dispose();edgeTexture.dispose();
});

test('each smooth-glass level owns its neutral texture while sharing only its geographic edge field',()=>{
  const texture=new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1);
  const field={texture,bounds:new THREE.Vector4(0,0,100,80)};
  const first=createFuiFlatTerrainState(field,new THREE.Vector4(1,1,0,0));
  const second=createFuiFlatTerrainState(field,new THREE.Vector4(2,2,0,0));
  assert.notEqual(first.heightTexture,second.heightTexture);
  assert.notEqual(first.overview.data,second.overview.data);
  let neutralDisposals=0,edgeDisposals=0;
  first.heightTexture!.addEventListener('dispose',()=>neutralDisposals++);
  texture.addEventListener('dispose',()=>edgeDisposals++);
  first.heightTexture!.dispose();
  assert.equal(neutralDisposals,1);assert.equal(edgeDisposals,0);
  assert.equal(second.uniforms.uRelief.value,second.heightTexture);
  second.heightTexture!.dispose();texture.dispose();
});
