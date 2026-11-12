// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {CustomRenderMethodInput} from 'maplibre-gl';

export type VectorMapSharedCameraInput=Pick<CustomRenderMethodInput,'projectionMatrix'|'nearZ'|'farZ'|'fov'>&{
  defaultProjectionData:Pick<CustomRenderMethodInput['defaultProjectionData'],'mainMatrix'>;
};
type Scratch={projection:THREE.Matrix4;clip:THREE.Matrix4;view:THREE.Matrix4;world:THREE.Matrix4;eye:THREE.Vector4;x:THREE.Vector3;y:THREE.Vector3;z:THREE.Vector3};
const scratch=new WeakMap<THREE.PerspectiveCamera,Scratch>();
const finiteMatrix=(value:ArrayLike<number>)=>{
  if(value.length!==16)return false;
  for(let i=0;i<16;i++)if(!Number.isFinite(value[i]))return false;
  return true;
};

/** MapLibre owns the view and canvas. localToMercator is normally
 * T(anchor+wrap)*S(scale,-scale,scale), mapping native north-up map units to
 * conformal Mercator. No DOM, GL, controls, RAF or camera approximation here.
 *
 * P^-1*M*L contains MapLibre's uniform world/pixel scale. Strip that scale
 * from the view, and compensate the projection/near/far, so Three sees a real
 * rigid camera (also required by Reflector's copied virtual camera). P'*V'
 * then equals M*L up to one positive homogeneous scalar, including clip Z.
 * Recompute P' from that rigid eye/view because MapLibre exposes P in Float32
 * but its custom-layer M in Float64; their tiny residual must not become camera
 * scale or an incorrect cameraPosition in the glass/reflection shaders.
 * Returns the stripped view scale; all camera matrices are updated in place.
 */
export function syncVectorMapSharedCamera(camera:THREE.PerspectiveCamera,input:VectorMapSharedCameraInput,localToMercator:THREE.Matrix4):number{
  if(!finiteMatrix(input.projectionMatrix)||!finiteMatrix(input.defaultProjectionData.mainMatrix)||!finiteMatrix(localToMercator.elements))throw new Error('Shared map camera requires finite 4x4 matrices');
  if(!Number.isFinite(input.nearZ)||!Number.isFinite(input.farZ)||input.nearZ<=0||input.farZ<=input.nearZ||!Number.isFinite(input.fov)||input.fov<=0||input.fov>=Math.PI)throw new Error('Shared map camera requires valid perspective clipping and FOV');
  let work=scratch.get(camera);
  if(!work){work={projection:new THREE.Matrix4(),clip:new THREE.Matrix4(),view:new THREE.Matrix4(),world:new THREE.Matrix4(),eye:new THREE.Vector4(),x:new THREE.Vector3(),y:new THREE.Vector3(),z:new THREE.Vector3()};scratch.set(camera,work);}
  const {projection,clip,view,world,eye,x,y,z}=work;
  projection.fromArray(input.projectionMatrix);
  if(projection.determinant()===0)throw new Error('Shared map camera projection is singular');
  // MapLibre publishes P as Float32, but its clipping distances and M retain
  // double precision. With a small near plane, inverting rounded depth terms
  // against a large world translation creates a false projective view residue.
  // Recover only the known perspective depth terms, after proving the supplied
  // terms differ by no more than Float32 rounding. XY and padding remain intact.
  const pe=projection.elements,depth=(input.farZ+input.nearZ)/(input.nearZ-input.farZ),offset=2*input.farZ*input.nearZ/(input.nearZ-input.farZ);
  const float32Roundoff=(value:number)=>Math.max(Math.abs(value)*2**-23,2**-149);
  if(pe[3]!==0||pe[7]!==0||pe[11]!==-1||pe[15]!==0||
    Math.abs(pe[10]-depth)>float32Roundoff(depth)||Math.abs(pe[14]-offset)>float32Roundoff(offset))throw new Error('Shared map camera projection does not match its perspective clipping');
  pe[10]=depth;pe[14]=offset;
  clip.fromArray(input.defaultProjectionData.mainMatrix).multiply(localToMercator);
  view.copy(projection).invert().multiply(clip);
  const e=view.elements,w=e[15];
  if(!Number.isFinite(w)||w<=0)throw new Error('Shared map camera view must be affine');
  view.multiplyScalar(1/w);
  const sx=Math.hypot(e[0],e[1],e[2]),sy=Math.hypot(e[4],e[5],e[6]),sz=Math.hypot(e[8],e[9],e[10]);
  const approximateScale=(sx+sy+sz)/3;
  if(!Number.isFinite(approximateScale)||approximateScale<=0||Math.max(Math.abs(sx-approximateScale),Math.abs(sy-approximateScale),Math.abs(sz-approximateScale))>approximateScale*2e-6)throw new Error('Shared map camera requires a uniform local geographic scale');
  const dot=(a:number,b:number)=>e[a]*e[b]+e[a+1]*e[b+1]+e[a+2]*e[b+2];
  if(Math.max(Math.abs(dot(0,4)),Math.abs(dot(0,8)),Math.abs(dot(4,8)))>approximateScale*approximateScale*2e-6||view.determinant()<=0)throw new Error('Shared map camera requires a north-up, non-sheared local transform');
  if((Math.abs(e[3])+Math.abs(e[7])+Math.abs(e[11]))/approximateScale>1e-6)throw new Error('Shared map camera view must be affine');
  world.copy(view).invert();
  // The perspective eye maps to clip [0,0,z,0], regardless of padding/shift.
  eye.set(0,0,1,0).applyMatrix4(projection.copy(clip).invert());
  if(!Number.isFinite(eye.w)||Math.abs(eye.w)<1e-20)throw new Error('Shared map camera has no finite perspective eye');
  eye.multiplyScalar(1/eye.w);
  z.setFromMatrixColumn(world,2).normalize();x.setFromMatrixColumn(world,0);x.addScaledVector(z,-x.dot(z)).normalize();y.crossVectors(z,x).normalize();
  world.makeBasis(x,y,z).setPosition(eye.x,eye.y,eye.z);view.copy(world).invert();
  projection.multiplyMatrices(clip,world);
  const viewScale=-projection.elements[11];
  if(!Number.isFinite(viewScale)||viewScale<=0)throw new Error('Shared map camera projection has invalid forward scale');
  projection.multiplyScalar(1/viewScale);
  camera.matrixAutoUpdate=false;camera.matrixWorldAutoUpdate=false;
  camera.matrix.copy(world);camera.matrixWorld.copy(world);camera.matrixWorldInverse.copy(view);camera.matrixWorldNeedsUpdate=false;
  camera.position.setFromMatrixPosition(world);camera.quaternion.setFromRotationMatrix(world).normalize();camera.scale.set(1,1,1);
  camera.projectionMatrix.copy(projection);camera.projectionMatrixInverse.copy(projection).invert();
  camera.near=input.nearZ/viewScale;camera.far=input.farZ/viewScale;camera.fov=THREE.MathUtils.radToDeg(input.fov);
  camera.aspect=Math.abs(projection.elements[5]/projection.elements[0]);camera.zoom=1;
  return viewScale;
}
