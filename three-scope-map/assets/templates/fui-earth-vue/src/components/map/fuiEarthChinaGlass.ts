// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {Position} from '../../types/geo';
import type {FuiEarthSkinId} from './fuiEarthTheme';
import {createFuiMapEdgeField} from './fuiMapGlow';
import {getFuiMapMaterialPalette} from './fuiMapMaterial';

// Register the existing geographic boundaries in map-like units. The rendered
// geometry remains the authoritative spherical China mesh, with its own DEM.
export function createFuiEarthChinaGlass(exterior:Position[][],regions:Position[][][],skin:FuiEarthSkinId,cachedField?:{texture:THREE.Texture;bounds:THREE.Vector4}){
  const project=([lon,lat]:Position)=>new THREE.Vector2((lon-70)*12,(lat-15)*12);
  const field=cachedField??createFuiMapEdgeField(exterior.map(ring=>new THREE.Shape(ring.map(project))),regions.map(rings=>({rings:rings.map(ring=>ring.map(project))})));
  const palette=getFuiMapMaterialPalette(skin);
  const uniforms={
    uChinaGlassEdges:{value:field.texture},uChinaGlassBounds:{value:field.bounds},
    uChinaGlassTint:{value:palette.inner.clone()},uChinaGlassRim:{value:palette.outer.clone()},
    uChinaGlassWallTop:{value:palette.sideTop.clone()},uChinaGlassWallMid:{value:palette.sideMid.clone()},
    uChinaGlassWallBottom:{value:palette.sideBottom.clone()},
  };
  return {field,uniforms};
}
export function updateFuiEarthChinaGlass(state:ReturnType<typeof createFuiEarthChinaGlass>,skin:FuiEarthSkinId){
  const p=getFuiMapMaterialPalette(skin),u=state.uniforms;
  u.uChinaGlassTint.value.copy(p.inner);u.uChinaGlassRim.value.copy(p.outer);
  u.uChinaGlassWallTop.value.copy(p.sideTop);u.uChinaGlassWallMid.value.copy(p.sideMid);u.uChinaGlassWallBottom.value.copy(p.sideBottom);
}

export const FUI_EARTH_CHINA_GLASS_GLSL=/* glsl */`
  uniform sampler2D uChinaGlassEdges;uniform vec4 uChinaGlassBounds;
  uniform vec3 uChinaGlassTint;uniform vec3 uChinaGlassRim;
  vec3 fuiChinaGlassSurface(vec3 terrain,vec2 geoUv,vec3 normal,vec3 radial,vec3 view){
    vec2 point=(geoUv*vec2(360.0,180.0)-vec2(250.0,105.0))*12.0;
    vec2 edgeUv=(point-uChinaGlassBounds.xy)/uChinaGlassBounds.zw;
    vec2 distanceToEdge=texture2D(uChinaGlassEdges,edgeUv).rg*64.0;
    float shadowDistance=texture2D(uChinaGlassEdges,edgeUv-vec2(2.6,-2.0)/uChinaGlassBounds.zw).g*64.0;
    float interior=smoothstep(2.0,7.0,distanceToEdge.r);
    float seamShade=max(.10*exp(-distanceToEdge.g/1.1),.20*exp(-.5*pow(shadowDistance/1.8,2.0)))*interior;
    float insetShade=.22*smoothstep(.6,2.7,distanceToEdge.r)*exp(-distanceToEdge.r/9.0);
    // The photographic terrain already contains its material pigment,
    // directional diffuse, local ridge highlights and geographic shadows.
    // Preserve their contrast; a constant face-light wash flattens the metal.
    vec3 pigment=uChinaGlassTint/max(max(uChinaGlassTint.r,uChinaGlassTint.g),max(uChinaGlassTint.b,.001));
    vec3 body=terrain*(1.0-max(seamShade,insetShade));
    // A clear, restrained coat catches the existing light rig and camera view.
    // Smooth macro normals prevent polished DEM pixels from becoming glitter.
    vec3 coatNormal=normalize(mix(radial,normal,.22));
    vec3 key=normalize(vec3(-.68,.58,.55));
    float keyReflection=pow(max(dot(coatNormal,normalize(key+view)),0.0),64.0);
    vec3 reflected=reflect(-view,coatNormal);
    float softReflection=pow(max(dot(reflected,normalize(vec3(-.35,.75,.56))),0.0),20.0);
    float fresnel=.04+.28*pow(1.0-max(dot(coatNormal,view),0.0),4.0);
    vec3 coatColor=mix(vec3(.72),pigment,.18);
    body+=coatColor*(keyReflection*.085+softReflection*.035)+uChinaGlassTint*fresnel*.018;
    // Fine luminous bevel and an inward glow, rather than a pale surface wash.
    float outerCore=exp(-pow(distanceToEdge.r/1.0,1.5));
    float outerFalloff=exp(-distanceToEdge.r/4.6);
    float seamAa=max(fwidth(distanceToEdge.g),.7);
    float seamCore=1.0-smoothstep(.12,.12+seamAa,distanceToEdge.g);
    body+=uChinaGlassRim*outerCore*.15+uChinaGlassTint*outerFalloff*.075;
    body+=uChinaGlassTint*seamCore*.045*interior;
    return body;
  }
`;
