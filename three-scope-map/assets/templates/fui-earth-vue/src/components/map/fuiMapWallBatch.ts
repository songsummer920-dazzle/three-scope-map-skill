// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';

type Wall=THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
type DrawRange={start:number;count:number;z:number;index:number};
type Entry={wall:Wall;geometryId:number;instanceId:number;sphere:THREE.Sphere;lift:number;selection:number;opacity:number};

/** One sorted draw list for every normal-blended wall, including disconnected
 * islands from different owners. The original meshes remain hidden state
 * proxies so the established region/material update code stays authoritative.
 * Three uses WEBGL_multi_draw when available and its shared-buffer fallback
 * otherwise. Neither path changes individual triangle order or geography. */
export function createFuiMapWallBatch(walls:Wall[]){
  if(!walls.length)return undefined;
  const material=walls[0].material.clone();
  material.userData={...material.userData,fuiWallBatch:true};
  // The instance matrix is translation only. Preserve the original anchored
  // foot deformation and normal equation before applying the owner's lift.
  material.vertexShader='#include <batching_pars_vertex>\nvarying float vFuiBatchSelection;varying float vFuiBatchOpacity;\n'+material.vertexShader
    .replace('uniform float uLift;','')
    .replace(/\buLift\b/g,'fuiBatchLift')
    .replace('void main(){',`void main(){
      #include <batching_vertex>
      vec3 fuiBatchState=getBatchingColor(getIndirectIndex(gl_DrawID));
      float fuiBatchLift=fuiBatchState.r;
      vFuiBatchSelection=fuiBatchState.g;vFuiBatchOpacity=fuiBatchState.b;`)
    .replace('modelViewMatrix*vec4(stretched,1.0)','modelViewMatrix*batchingMatrix*vec4(stretched,1.0)');
  material.fragmentShader='varying float vFuiBatchSelection;varying float vFuiBatchOpacity;\n'+material.fragmentShader
    .replace('uniform float uSelection;','').replace('uniform float uOpacity;','')
    .replace(/\buSelection\b/g,'vFuiBatchSelection').replace(/\buOpacity\b/g,'vFuiBatchOpacity');
  const vertices=walls.reduce((n,wall)=>n+wall.geometry.getAttribute('position').count,0);
  const indices=walls.reduce((n,wall)=>n+(wall.geometry.index?.count??wall.geometry.getAttribute('position').count),0);
  const batch=new THREE.BatchedMesh(walls.length,vertices,indices,material);
  batch.name='fui-glass-sorted-wall-cores';batch.renderOrder=5;
  batch.perObjectFrustumCulled=true;batch.sortObjects=true;
  // The individual padded spheres are authoritative. Avoid an extra aggregate
  // object-level sphere whose bounds could omit a selected owner's fixed foot.
  batch.frustumCulled=false;
  const entries:Entry[]=[],matrix=new THREE.Matrix4(),metadata=new THREE.Color();
  for(const wall of walls){
    const geometryId=batch.addGeometry(wall.geometry),instanceId=batch.addInstance(geometryId);
    const sphere=batch.getBoundingSphereAt(geometryId,new THREE.Sphere())!;
    entries.push({wall,geometryId,instanceId,sphere,lift:NaN,selection:NaN,opacity:NaN});
    wall.visible=false;wall.userData.fuiRenderProxy=true;
  }
  const sync=()=>{
    // Only pigment/energy are shared. Lift, selection and entrance opacity
    // are per owner and travel as float metadata, never as a display color.
    const source=walls[0].material;
    for(const key of ['topColor','midColor','bottomColor'])material.uniforms[key].value.copy(source.uniforms[key].value);
    for(const key of ['alpha','topZ','bottomZ','uGlass'])if(material.uniforms[key]&&source.uniforms[key])material.uniforms[key].value=source.uniforms[key].value;
    for(const entry of entries){
      const uniforms=entry.wall.material.uniforms;
      const lift=Number(uniforms.uLift?.value??0),selection=Number(uniforms.uSelection?.value??0),opacity=Number(uniforms.uOpacity?.value??1);
      if(lift!==entry.lift){batch.setMatrixAt(entry.instanceId,matrix.makeTranslation(0,0,lift));entry.lift=lift;}
      if(selection!==entry.selection||opacity!==entry.opacity||Number.isNaN(entry.selection)||Number.isNaN(entry.opacity)||entry.wall.userData.fuiBatchLift!==lift){
        batch.setColorAt(entry.instanceId,metadata.setRGB(lift,selection,opacity));
        entry.selection=selection;entry.opacity=opacity;entry.wall.userData.fuiBatchLift=lift;
      }
    }
  };
  // The legacy renderer sorts Mesh centers after P*V*matrixWorld, not by the
  // nearest triangle or a merged owner's center. Recompute that exact depth
  // and use creation order for ties, preserving cross-owner island interleave.
  const clip=new THREE.Matrix4(),point=new THREE.Vector3();
  batch.setCustomSort(function(list,camera){
    clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(this.matrixWorld);
    const ranges=list as DrawRange[];
    for(const range of ranges){const entry=entries[range.index];point.copy(entry.sphere.center);point.z+=entry.lift;range.z=point.applyMatrix4(clip).z;}
    ranges.sort((a,b)=>b.z-a.z||a.index-b.index);
  });
  sync();
  const render=batch.onBeforeRender;
  batch.onBeforeRender=function(...args){sync();render.apply(this,args);};
  batch.userData.fuiSyncWallState=sync;
  batch.userData.fuiWallInstances=entries.map(({wall,geometryId,instanceId})=>({wall,geometryId,instanceId}));
  return batch;
}
