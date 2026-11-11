// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';

export type FuiMapCapProjectionMode='equirect'|'mercator';
export type FuiMapCapCenter={longitude:number;latitude:number};
export const FUI_MAP_CAP_CENTER=Object.freeze({longitude:103.6,latitude:35.2});
const radians=Math.PI/180;

function basis(center:FuiMapCapCenter){
  if(!Number.isFinite(center.longitude)||!Number.isFinite(center.latitude)||Math.abs(center.latitude)>90)throw new Error('Cap optical center requires finite geographic coordinates');
  const lon=center.longitude*radians,lat=center.latitude*radians,sinLon=Math.sin(lon),cosLon=Math.cos(lon),sinLat=Math.sin(lat),cosLat=Math.cos(lat);
  return{
    radial:new THREE.Vector3(cosLat*cosLon,sinLat,-cosLat*sinLon),
    east:new THREE.Vector3(-sinLon,0,-cosLon),
    north:new THREE.Vector3(-sinLat*cosLon,cosLat,sinLat*sinLon),
  };
}

/** Pure geographic inverse for the CPU regression/reference path. The same
 * transform uniforms mean equirectangular UV in standalone and Mercator UV in
 * the shared-context map; mode must be explicit, never inferred from color. */
export function fuiMapCapLngLat(position:THREE.Vector2Like,geoTransform:THREE.Vector4Like,mode:FuiMapCapProjectionMode,target=new THREE.Vector2()){
  const x=position.x*geoTransform.x+geoTransform.z,y=position.y*geoTransform.y+geoTransform.w;
  const latitude=mode==='mercator'
    ?2*Math.atan(Math.exp(THREE.MathUtils.clamp((.5-y)*2*Math.PI,-20,20)))-Math.PI*.5
    :y*Math.PI-Math.PI*.5;
  return target.set(x*360-180,latitude/radians);
}

/** A spherical optical normal in the fixed center's east/north/up frame.
 * This returns shading data only; it never changes a vertex, matrix or hit. */
export function fuiMapCapNormalENU(longitude:number,latitude:number,center:FuiMapCapCenter=FUI_MAP_CAP_CENTER,target=new THREE.Vector3()){
  const frame=basis(center),lon=longitude*radians,lat=latitude*radians;
  const radial=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),-Math.cos(lat)*Math.sin(lon));
  return target.set(radial.dot(frame.east),radial.dot(frame.north),radial.dot(frame.radial)).normalize();
}

/** Exact reference-frame conversion of EarthView.orientGlobeToView:
 * reference camera (0,.1,7.22), original world key (-.68,.62,.31), north-up.
 * This is instance preparation, never a light following the current camera. */
export function fuiMapCapReferenceLightENU(center:FuiMapCapCenter=FUI_MAP_CAP_CENTER,target=new THREE.Vector3()){
  const frame=basis(center),direction=new THREE.Vector3(0,.1,7.22).normalize();
  const alignment=new THREE.Quaternion().setFromUnitVectors(frame.radial,direction);
  const rotatedNorth=new THREE.Vector3(0,1,0).applyQuaternion(alignment).projectOnPlane(direction);
  if(rotatedNorth.lengthSq()<1e-20)rotatedNorth.copy(frame.north).applyQuaternion(alignment).projectOnPlane(direction);
  rotatedNorth.normalize();
  const screenNorth=new THREE.Vector3(0,1,0).projectOnPlane(direction).normalize();
  const roll=Math.atan2(direction.dot(rotatedNorth.clone().cross(screenNorth)),THREE.MathUtils.clamp(rotatedNorth.dot(screenNorth),-1,1));
  const orientation=new THREE.Quaternion().setFromAxisAngle(direction,roll).multiply(alignment);
  const light=new THREE.Vector3(-.68,.62,.31).normalize();
  return target.set(light.dot(frame.east.applyQuaternion(orientation)),light.dot(frame.north.applyQuaternion(orientation)),light.dot(frame.radial.applyQuaternion(orientation))).normalize();
}

/** ENU→Earth world after the reference north-up orientGlobeToView. This frame
 * is independent of the geographic center: east is screen-right, north is
 * projected world-up, and cap up points at the fixed reference camera. */
export function fuiMapCapEarthReferenceFrame(target=new THREE.Matrix3()){
  const up=new THREE.Vector3(0,.1,7.22).normalize();
  const north=new THREE.Vector3(0,1,0).projectOnPlane(up).normalize();
  const east=new THREE.Vector3().crossVectors(north,up).normalize();
  return target.set(east.x,north.x,up.x,east.y,north.y,up.y,east.z,north.z,up.z);
}

export function createFuiMapCapOpticsUniforms(mode:FuiMapCapProjectionMode='equirect',center:FuiMapCapCenter=FUI_MAP_CAP_CENTER,angularScale=1){
  const light=fuiMapCapReferenceLightENU(center);
  return{
    uCapProjectionMode:{value:mode==='mercator'?1:0},
    uCapAngularScale:{value:Math.max(.01,Math.min(1,Number.isFinite(angularScale)?angularScale:1))},
    uCapCenter:{value:new THREE.Vector2(center.longitude*radians,center.latitude*radians)},
    uCapLightENU:{value:light},
    uCapRestFrame:{value:new THREE.Matrix3()},
    uCapEnvironmentToEarth:{value:fuiMapCapEarthReferenceFrame()},
  };
}

/** Set once for a newly prepared instance's rest view. Mutate existing matrix
 * values so its coat/backing keep their shared uniform identities. No camera
 * is retained and later orbit/pitch changes do not alter this optical frame. */
export function setFuiMapCapRestView(material:THREE.ShaderMaterial,viewDirectionInLocalENUBasis:THREE.Vector3Like){
  const direction=new THREE.Vector3().copy(viewDirectionInLocalENUBasis);
  if(!Number.isFinite(direction.x)||!Number.isFinite(direction.y)||!Number.isFinite(direction.z)||direction.lengthSq()<1e-20)throw new Error('Cap rest view requires a finite nonzero local ENU direction');
  const rest=material.uniforms.uCapRestFrame?.value as THREE.Matrix3|undefined;
  const environment=material.uniforms.uCapEnvironmentToEarth?.value as THREE.Matrix3|undefined;
  if(!rest?.isMatrix3||!environment?.isMatrix3)throw new Error('Cap rest view requires cap optics uniforms');
  const orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction.normalize());
  rest.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(orientation));
  fuiMapCapEarthReferenceFrame(environment).multiply(rest.clone().invert());
}

/** Fragment-only geometry→optics adapter. The geometric plane normal remains
 * authoritative for Snell exit/P*V backdrop sampling, front/back and picking.
 * The virtual cap normal is for illumination, Fresnel, polish and bevel only. */
export const FUI_MAP_CAP_OPTICS_GLSL=/*glsl*/`
  uniform float uCapProjectionMode;
  uniform float uCapAngularScale;
  uniform vec2 uCapCenter;
  uniform vec3 uCapLightENU;
  uniform mat3 uCapRestFrame;
  uniform mat3 uCapEnvironmentToEarth;
  vec2 fuiMapCapLngLat(vec2 mapPosition,vec4 geoTransform){
    vec2 geographic=mapPosition*geoTransform.xy+geoTransform.zw;
    float longitude=geographic.x*6.283185307179586-3.141592653589793;
    float latitude=uCapProjectionMode>.5
      ?2.0*atan(exp(clamp((.5-geographic.y)*6.283185307179586,-20.0,20.0)))-1.570796326794897
      :geographic.y*3.141592653589793-1.570796326794897;
    return vec2(longitude,latitude);
  }
  void fuiMapCapOptics(vec2 mapPosition,vec4 geoTransform,vec3 east,vec3 north,vec3 geometryNormal,out vec3 shadingNormal,out vec3 opticalLight){
    vec2 geographic=fuiMapCapLngLat(mapPosition,geoTransform);
    if(uCapAngularScale<.99999){
      vec2 delta=geographic-uCapCenter;
      geographic=uCapCenter+vec2(atan(sin(delta.x),cos(delta.x)),delta.y)*uCapAngularScale;
    }
    float sinLon=sin(geographic.x),cosLon=cos(geographic.x),sinLat=sin(geographic.y),cosLat=cos(geographic.y);
    vec3 radial=vec3(cosLat*cosLon,sinLat,-cosLat*sinLon);
    float sinCenterLon=sin(uCapCenter.x),cosCenterLon=cos(uCapCenter.x),sinCenterLat=sin(uCapCenter.y),cosCenterLat=cos(uCapCenter.y);
    vec3 capEast=vec3(-sinCenterLon,0.0,-cosCenterLon);
    vec3 capNorth=vec3(-sinCenterLat*cosCenterLon,cosCenterLat,sinCenterLat*sinCenterLon);
    vec3 capUp=vec3(cosCenterLat*cosCenterLon,sinCenterLat,-cosCenterLat*sinCenterLon);
    vec3 normalENU=uCapRestFrame*vec3(dot(radial,capEast),dot(radial,capNorth),dot(radial,capUp));
    vec3 lightENU=uCapRestFrame*uCapLightENU;
    vec3 worldEast=normalize(east),worldNorth=normalize(north),worldUp=normalize(geometryNormal);
    shadingNormal=normalize(worldEast*normalENU.x+worldNorth*normalENU.y+worldUp*normalENU.z);
    opticalLight=normalize(worldEast*lightENU.x+worldNorth*lightENU.y+worldUp*lightENU.z);
  }
  vec3 fuiMapCapEnvironment(vec3 reflected,vec3 east,vec3 north,vec3 geometryNormal){
    vec3 directionENU=vec3(dot(reflected,normalize(east)),dot(reflected,normalize(north)),dot(reflected,normalize(geometryNormal)));
    return normalize(uCapEnvironmentToEarth*directionENU);
  }
`;
