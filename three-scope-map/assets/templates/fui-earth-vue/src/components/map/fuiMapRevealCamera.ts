// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';

export type FuiRevealViewport={width:number;height:number};
/** Reframe the actual projected administrative body, not a fixed dashboard
 * gutter or its distant cartographic inset. Translate eye and target together
 * so the user's orbit angle, field of view and zoom distance remain intact. */
export function centerFuiMapProjection(camera:THREE.PerspectiveCamera,target:THREE.Vector3,points:readonly THREE.Vector3[],viewport:FuiRevealViewport){
  const width=Math.max(1,viewport.width),height=Math.max(1,viewport.height);
  const projected=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(),shift=new THREE.Vector3();
  const bounds=()=>{
    camera.updateMatrixWorld(true);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const point of points){projected.copy(point).project(camera);if(!Number.isFinite(projected.x)||!Number.isFinite(projected.y))continue;
      minX=Math.min(minX,projected.x);maxX=Math.max(maxX,projected.x);minY=Math.min(minY,projected.y);maxY=Math.max(maxY,projected.y);}
    return{minX,minY,maxX,maxY};
  };
  let box=bounds();
  for(let i=0;i<12&&Number.isFinite(box.minX);i++){
    const x=(box.minX+box.maxX)*.5,y=(box.minY+box.maxY)*.5;
    if(Math.abs(x)*width*.5<.2&&Math.abs(y)*height*.5<.2)break;
    const distance=Math.max(.001,camera.position.distanceTo(target)),halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5)*distance/camera.zoom;
    right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
    shift.copy(right).multiplyScalar(x*halfHeight*camera.aspect).addScaledVector(up,y*halfHeight);
    camera.position.add(shift);target.add(shift);camera.lookAt(target);box=bounds();
  }
  return{viewport:[width,height],projectedCenter:[(box.minX+box.maxX+2)*width*.25,(2-box.minY-box.maxY)*height*.25],
    projectedBounds:[(box.minX+1)*width*.5,(1-box.maxY)*height*.5,(box.maxX+1)*width*.5,(1-box.minY)*height*.5]};
}
