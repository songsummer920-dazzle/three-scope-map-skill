// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Reflector} from 'three/examples/jsm/objects/Reflector.js';
import {MercatorTransform} from '../node_modules/maplibre-gl/src/geo/projection/mercator_transform';
import {LngLat} from '../node_modules/maplibre-gl/src/geo/lng_lat';
import {MercatorCoordinate} from '../node_modules/maplibre-gl/src/geo/mercator_coordinate';
import {syncVectorMapSharedCamera,type VectorMapSharedCameraInput} from '../src/components/map/vectorMapSharedCamera';

function fixture(zoom=5,pitch=45,bearing=30,roll=0,longitude=103.6){
  const transform=new MercatorTransform({minZoom:0,maxZoom:22,minPitch:0,maxPitch:85,renderWorldCopies:true});
  transform.resize(1280,850);transform.setCenter(new LngLat(longitude,35.2));transform.setZoom(zoom);
  transform.setPitch(pitch);transform.setBearing(bearing);transform.setRoll(roll);
  transform.setPadding({left:170,right:35,top:60,bottom:20});
  const anchor=MercatorCoordinate.fromLngLat(new LngLat(longitude,35.2));
  const local=new THREE.Matrix4().makeTranslation(anchor.x,anchor.y,0).multiply(new THREE.Matrix4().makeScale(.00002,-.00002,.00002));
  const input:VectorMapSharedCameraInput={projectionMatrix:transform.projectionMatrix,defaultProjectionData:transform.getProjectionDataForCustomLayer(),nearZ:transform.nearZ,farZ:transform.farZ,fov:transform.fov*Math.PI/180};
  return{input,local,transform};
}
function close(a:number,b:number,tolerance=1e-7){assert(Math.abs(a-b)<=tolerance*(1+Math.max(Math.abs(a),Math.abs(b))),`${a} != ${b}`);}
function ndc(matrix:THREE.Matrix4,point:THREE.Vector3){const result=new THREE.Vector4(point.x,point.y,point.z,1).applyMatrix4(matrix);return result.multiplyScalar(1/result.w);}

test('real MapLibre matrices retain exact clip XY/Z across pan, bearing, pitch, roll and asymmetric padding',()=>{
  for(const zoom of [2,6,11])for(const pitch of [0,35,67])for(const bearing of [-80,0,137]){
    const {input,local}=fixture(zoom,pitch,bearing,9,bearing===137?181:103.6),camera=new THREE.PerspectiveCamera();
    const scale=syncVectorMapSharedCamera(camera,input,local);
    const expected=new THREE.Matrix4().fromArray(input.defaultProjectionData.mainMatrix).multiply(local);
    const actual=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    for(const point of [new THREE.Vector3(),new THREE.Vector3(-120,80,0),new THREE.Vector3(70,-90,32),new THREE.Vector3(20,40,48)]){
      const a=ndc(actual,point),b=ndc(expected,point);close(a.x,b.x);close(a.y,b.y);close(a.z,b.z);
    }
    close(camera.near,input.nearZ/scale);close(camera.far,input.farZ/scale);
    close(camera.matrixWorld.determinant(),1);
    const worldScale=new THREE.Vector3();camera.matrixWorld.decompose(new THREE.Vector3(),new THREE.Quaternion(),worldScale);
    close(worldScale.x,1);close(worldScale.y,1);close(worldScale.z,1);
  }
});

test('the camera eye and ray direction come from the actual projective eye, not the near-plane point or identity view',()=>{
  const {input,local}=fixture(7,58,-35,12),camera=new THREE.PerspectiveCamera();syncVectorMapSharedCamera(camera,input,local);
  const inverse=new THREE.Matrix4().fromArray(input.defaultProjectionData.mainMatrix).multiply(local).invert();
  const eye=new THREE.Vector4(0,0,1,0).applyMatrix4(inverse).multiplyScalar(1/new THREE.Vector4(0,0,1,0).applyMatrix4(inverse).w);
  close(camera.position.x,eye.x);close(camera.position.y,eye.y);close(camera.position.z,eye.z);
  assert(camera.position.length()>1,'Identity camera accidentally survived shared-view synchronization');
  for(const pixel of [new THREE.Vector2(0,0),new THREE.Vector2(.4,-.2)]){
    const ray=new THREE.Raycaster();ray.setFromCamera(pixel,camera);
    const far=new THREE.Vector3(pixel.x,pixel.y,1).applyMatrix4(inverse).sub(camera.position).normalize();
    assert(ray.ray.origin.distanceTo(camera.position)<1e-8);assert(ray.ray.direction.dot(far)>.999999999);
  }
});

test('the actual Three Reflector receives a rigid eye and keeps its shared plane registered',()=>{
  const {input,local}=fixture(5,55,24,8),camera=new THREE.PerspectiveCamera();syncVectorMapSharedCamera(camera,input,local);
  const reflector=new Reflector(new THREE.PlaneGeometry(1000,1000),{textureWidth:8,textureHeight:8,multisample:0});
  reflector.position.z=12;reflector.updateMatrixWorld(true);
  let reflected:THREE.PerspectiveCamera|undefined;
  const renderer={xr:{enabled:false},shadowMap:{autoUpdate:false},autoClear:false,state:{buffers:{depth:{setMask(){}}}},getRenderTarget:()=>null,setRenderTarget(){},clear(){},render(_scene:THREE.Scene,virtual:THREE.PerspectiveCamera){reflected=virtual.clone();}};
  reflector.onBeforeRender(renderer as unknown as THREE.WebGLRenderer,new THREE.Scene(),camera,reflector.geometry,reflector.material,null as never);
  assert(reflected,'Actual Reflector skipped a valid front-facing plane');
  close(reflected.position.x,camera.position.x);close(reflected.position.y,camera.position.y);close(reflected.position.z,24-camera.position.z);
  const actual=new THREE.Matrix4().multiplyMatrices(reflected.projectionMatrix,reflected.matrixWorldInverse);
  const expectedDirection=camera.getWorldDirection(new THREE.Vector3()).reflect(new THREE.Vector3(0,0,1));
  assert(reflected.getWorldDirection(new THREE.Vector3()).dot(expectedDirection)>.999999999);
  close(reflected.matrixWorld.determinant(),1);close(reflected.far,camera.far);
  // Reflector preserves the supplied projection's screen rows while replacing
  // only the depth row with its real oblique clipping plane.
  for(const index of [0,1,4,5,8,9,12,13])close(reflected.projectionMatrix.elements[index],camera.projectionMatrix.elements[index]);
  for(const point of [new THREE.Vector3(0,0,12),new THREE.Vector3(80,-20,12)]){
    const a=ndc(actual,point);assert(Number.isFinite(a.x)&&Number.isFinite(a.y));close(a.z,-1,1e-6);
  }
  reflector.getRenderTarget().dispose();reflector.geometry.dispose();reflector.material.dispose();
});

test('synchronization preserves input matrices and updates the same camera across geographic state changes',()=>{
  const first=fixture(4,40,0),second=fixture(9,70,120),camera=new THREE.PerspectiveCamera();
  const projection=[...first.input.projectionMatrix],main=[...first.input.defaultProjectionData.mainMatrix],local=first.local.elements.slice();
  syncVectorMapSharedCamera(camera,first.input,first.local);const before=camera.position.clone();
  syncVectorMapSharedCamera(camera,second.input,second.local);
  assert(camera.position.distanceTo(before)>1);assert.equal(camera.matrixAutoUpdate,false);assert.equal(camera.matrixWorldAutoUpdate,false);
  assert.deepEqual([...first.input.projectionMatrix],projection);assert.deepEqual([...first.input.defaultProjectionData.mainMatrix],main);assert.deepEqual(first.local.elements,local);
});

test('small near planes retain a rigid camera when provider Float32 depth rounding meets a large world translation',()=>{
  const input:VectorMapSharedCameraInput={
    projectionMatrix:[3,0,0,0,0,3,0,0,0,0,-1.0160417556762695,-1,0,0,-.04032083600759506,0],
    defaultProjectionData:{mainMatrix:[10940.970861348718,615.2833181627184,248.3430057624843,244.42203496123528,957.2109183354769,-7032.720507616421,-2838.573544890157,-2793.7566435542813,0,8413.285020204918,-2390.9442794159067,-2353.194785814427,-9015.310425692249,2241.689707516323,906.2831139955539,892.0139208046803]},
    nearZ:.02,farZ:2.5134848776060927,fov:.6435011087932844,
  };
  const local=new THREE.Matrix4().makeTranslation(.7897194791666666,.40625293563153186,0).multiply(new THREE.Matrix4().makeScale(.0002914890178152836,-.0002914890178152836,.0002914890178152836));
  const camera=new THREE.PerspectiveCamera(),scale=syncVectorMapSharedCamera(camera,input,local);
  const expected=new THREE.Matrix4().fromArray(input.defaultProjectionData.mainMatrix).multiply(local);
  const actual=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  close(camera.matrixWorld.determinant(),1);close(camera.near,input.nearZ/scale);close(camera.far,input.farZ/scale);
  for(const point of [new THREE.Vector3(),new THREE.Vector3(-120,80,0),new THREE.Vector3(70,-90,32),new THREE.Vector3(20,40,48)]){
    const a=ndc(actual,point),b=ndc(expected,point);close(a.x,b.x);close(a.y,b.y);close(a.z,b.z);
  }
  const mismatched={...input,projectionMatrix:[...input.projectionMatrix]};mismatched.projectionMatrix[10]+=.0001;
  assert.throws(()=>syncVectorMapSharedCamera(camera,mismatched,local),/perspective clipping/);
});

test('invalid perspective or nonuniform adapters fail instead of silently creating a false reflection camera',()=>{
  const {input,local}=fixture();
  assert.throws(()=>syncVectorMapSharedCamera(new THREE.PerspectiveCamera(),{...input,nearZ:0},local),/perspective/);
  assert.throws(()=>syncVectorMapSharedCamera(new THREE.PerspectiveCamera(),input,new THREE.Matrix4().makeScale(1,2,1)),/uniform/);
  assert.throws(()=>syncVectorMapSharedCamera(new THREE.PerspectiveCamera(),input,new THREE.Matrix4()),/north-up/);
});
