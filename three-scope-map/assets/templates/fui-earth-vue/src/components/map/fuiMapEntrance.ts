// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';

export const FUI_EARTH_FLIGHT_DURATION=1.05;
export const FUI_MAP_ENTRANCE_DURATION=.78;

export function createFuiEntrancePose(group:THREE.Group,pivot:THREE.Vector3){
  group.updateMatrix();
  return {position:group.position.clone(),scale:group.scale.clone(),rotation:group.rotation.z,
    pivot:pivot.clone(),worldPivot:pivot.clone().applyMatrix4(group.matrix),offset:new THREE.Vector3()};
}
export type FuiEntrancePose=ReturnType<typeof createFuiEntrancePose>;

// Rotate around the geographic instrument's center, not the projection origin.
// Latitude correction stays intact throughout the motion, including its first frame.
export function applyFuiEntrancePose(group:THREE.Group,pose:FuiEntrancePose,progress:number){
  const p=THREE.MathUtils.clamp(progress,0,1),eased=1-(1-p)**3;
  group.scale.copy(pose.scale).multiplyScalar(.56+.44*eased);
  group.rotation.z=pose.rotation-.22*(1-eased);
  pose.offset.copy(pose.pivot).multiply(group.scale).applyEuler(group.rotation);
  group.position.copy(pose.worldPivot).sub(pose.offset);
  group.position.z-=22*(1-eased);
  if(p===1){group.position.copy(pose.position);group.scale.copy(pose.scale);group.rotation.z=pose.rotation;}
}
