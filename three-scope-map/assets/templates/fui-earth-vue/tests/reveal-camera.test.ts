// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {centerFuiMapProjection} from '../src/components/map/fuiMapRevealCamera';

test('renderer reveal centers the projected body at the real viewport without changing orbit or zoom',()=>{
  const points=[[-340,-180,12],[350,-220,12],[430,200,44],[-290,270,44],[-350,40,44],[110,-260,44]].map(p=>new THREE.Vector3().fromArray(p));
  for(const viewport of [{width:1280,height:720},{width:920,height:640},{width:680,height:900}]){
    const camera=new THREE.PerspectiveCamera(24,viewport.width/viewport.height,1,3000),target=new THREE.Vector3(-18,-77,7);
    camera.position.set(130,-1250,1100);camera.lookAt(target);camera.updateMatrixWorld(true);
    const before=camera.position.clone().sub(target),fov=camera.fov;
    const result=centerFuiMapProjection(camera,target,points,viewport);
    assert(Math.abs(result.projectedCenter[0]-viewport.width/2)<.3);
    assert(Math.abs(result.projectedCenter[1]-viewport.height/2)<.3);
    assert(camera.position.clone().sub(target).distanceTo(before)<1e-9);assert.equal(camera.fov,fov);
  }
});

test('already centered revealed geometry does not drift on repeated preparation',()=>{
  const camera=new THREE.PerspectiveCamera(30,16/9,1,3000),target=new THREE.Vector3(0,0,0);
  camera.position.set(0,-1200,800);camera.lookAt(target);
  const points=[[-200,-100,12],[240,-100,12],[240,180,44],[-200,180,44]].map(p=>new THREE.Vector3().fromArray(p));
  centerFuiMapProjection(camera,target,points,{width:1280,height:720});
  const eye=camera.position.clone(),focus=target.clone();
  centerFuiMapProjection(camera,target,points,{width:1280,height:720});
  assert(camera.position.distanceTo(eye)<1e-9);assert(target.distanceTo(focus)<1e-9);
});
