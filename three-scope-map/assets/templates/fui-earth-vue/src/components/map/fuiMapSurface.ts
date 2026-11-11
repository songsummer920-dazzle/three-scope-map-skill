// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import photographUrl from '../../assets/textures/map/world/earth-photographic.jpg';
import reliefUrl from '../../assets/textures/map/world/earth-relief.png';
import {createFuiEarthTheme,isFuiThemeColorId,resolveFuiEarthThemeId,type FuiEarthSkinId} from './fuiEarthTheme';
import {applyFuiPhotographicTheme} from './fuiPhotographicOptics';
import { getFuiMapMaterialPalette } from './fuiMapMaterial';
import { FUI_MAP_RELIEF_INSET } from './fuiMapGlass';
import { FUI_TERRAIN_GLSL,type FuiTerrainState } from './fuiMapTerrain';
import overviewMetadata from '../../assets/textures/map/world/earth-map-overview.json';
import mapPhotographUrl from '../../assets/textures/map/world/earth-map-photograph.png';
import mapReliefUrl from '../../assets/textures/map/world/earth-map-relief.png';
export type FuiMapTextures={photograph:THREE.Texture;relief:THREE.Texture;photographBounds:THREE.Vector4;reliefBounds:THREE.Vector4;ready:Promise<void>;scope:string};
const terrainColors=new Map<FuiEarthSkinId,Readonly<{tone:THREE.Color;ridge:THREE.Color}>>();
const terrainTone=new THREE.Color().setRGB(.40,.56,.74),terrainRidge=new THREE.Color().setRGB(.45,.60,.80);
const luminance=(color:THREE.Color)=>color.r*.2126+color.g*.7152+color.b*.0722;
/** Match the entered entity map to the globe's China reflectance while keeping
 * the existing relief energy, key lighting and glass cover independent. */
export function getFuiMapTerrainColors(skin:FuiEarthSkinId){
  const id=resolveFuiEarthThemeId(skin),cached=terrainColors.get(id);if(cached)return cached;
  let tone=terrainTone.clone(),ridge=terrainRidge.clone();
  if(id!=='original'){
    const theme=createFuiEarthTheme(id);applyFuiPhotographicTheme(theme,id);
    const atEnergy=(source:THREE.Color,reference:THREE.Color)=>source.clone().multiplyScalar(luminance(reference)/Math.max(luminance(source),.000001));
    tone=atEnergy(theme.chinaSurface,terrainTone);ridge=atEnergy(theme.chinaRidge,terrainRidge);
  }
  const result=Object.freeze({tone:Object.freeze(tone) as THREE.Color,ridge:Object.freeze(ridge) as THREE.Color});
  if(isFuiThemeColorId(id)){
    const custom=[...terrainColors.keys()].filter(isFuiThemeColorId);if(custom.length>=64)terrainColors.delete(custom[0]);
  }
  terrainColors.set(id,result);return result;
}
const textureSets=new Map<string,FuiMapTextures>();
function loadTextures(bounds?:readonly number[]){
  const crop=overviewMetadata.geographic_bounds;
  const local=!!bounds&&bounds[0]-8>=crop[0]&&bounds[1]-8>=crop[1]&&bounds[2]+8<=crop[2]&&bounds[3]+8<=crop[3];
  const key=local?'china-native-crop':'global';const cached=textureSets.get(key);if(cached)return cached;
  const loader=new THREE.TextureLoader();let pending=2;
  let resolve:()=>void=()=>{},reject:(e:unknown)=>void=()=>{};
  const ready=new Promise<void>((a,b)=>{resolve=a;reject=b;});
  const done=()=>{if(--pending===0)resolve();};
  const load=(url:string,color:boolean)=>{
    const texture=loader.load(url,done,undefined,reject);
    texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=local?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
    texture.anisotropy=16;return texture;
  };
  const result={photograph:load(local?mapPhotographUrl:photographUrl,true),relief:load(local?mapReliefUrl:reliefUrl,false),
    photographBounds:local?new THREE.Vector4().fromArray(overviewMetadata.textures.photograph.uv_bounds):new THREE.Vector4(0,0,1,1),
    reliefBounds:local?new THREE.Vector4().fromArray(overviewMetadata.textures.relief.uv_bounds):new THREE.Vector4(0,0,1,1),ready,scope:key};
  textureSets.set(key,result);return result;
}
export async function waitForFuiMapTexturesReady(bounds?:readonly number[]){const t=loadTextures(bounds);await t.ready;return t;}
export function createFuiMapSurface(skin:FuiEarthSkinId,terrain:FuiTerrainState,t:FuiMapTextures){
  const colors=getFuiMapTerrainColors(skin);
  const material=new THREE.ShaderMaterial({
    uniforms:{...terrain.uniforms,uPhotograph:{value:t.photograph},uPhotographBounds:{value:t.photographBounds},uTerrainTone:{value:colors.tone.clone()},uTerrainRidgeTone:{value:colors.ridge.clone()},uAccent:{value:getFuiMapMaterialPalette(skin,'entity').accent.clone()},uOpacity:{value:1},uSelection:{value:0},uSelectionColor:{value:getFuiMapMaterialPalette(skin,'entity').inner.clone()},uGlassDepth:{value:FUI_MAP_RELIEF_INSET}},
    vertexShader:FUI_TERRAIN_GLSL+/* glsl */ `
      attribute vec2 geoUv;
      uniform float uGlassDepth;
      varying vec2 vGeoUv;
      varying vec3 vViewLocal;
      varying vec2 vMapPosition;
      void main(){
        vGeoUv=geoUv;
        vMapPosition=position.xy;
        // Keep the engraving just under the cover, aligned with the moving wall top.
        vec4 world=modelMatrix*vec4(position+vec3(0.0,0.0,fuiTerrainHeight(position.xy)-uGlassDepth),1.0);
        vec3 eye=cameraPosition-world.xyz;
        vViewLocal=vec3(dot(eye,modelMatrix[0].xyz),dot(eye,modelMatrix[1].xyz),dot(eye,modelMatrix[2].xyz));
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader:FUI_TERRAIN_GLSL+/* glsl */ `
      uniform sampler2D uPhotograph;uniform vec4 uPhotographBounds;
      uniform vec3 uAccent;
      uniform vec3 uTerrainTone;
      uniform vec3 uTerrainRidgeTone;
      uniform float uOpacity;
      uniform float uSelection;
      uniform vec3 uSelectionColor;
      varying vec2 vGeoUv;
      varying vec3 vViewLocal;
      varying vec2 vMapPosition;
      float fuiBoundaryOcclusion(vec2 point){
        vec2 edgeUv=(point-uFuiTerrainBounds.xy)/uFuiTerrainBounds.zw;
        vec2 edgeDistance=texture2D(uFuiTerrainEdges,edgeUv).rg*64.0;
        // The raised luminous seam casts toward the southeast, opposite the
        // same northwest key used by the geographic relief. Sample the real
        // distance field at a shifted point, never a floating duplicate line.
        vec2 shadowOffset=vec2(2.6,-2.0);
        float projected=texture2D(uFuiTerrainEdges,edgeUv-shadowOffset/uFuiTerrainBounds.zw).g*64.0;
        float contact=.23*exp(-edgeDistance.g/1.1);
        float projectedShadow=.46*exp(-.5*pow(projected/1.8,2.0));
        // Regional rings also include coast segments. Let the national inset
        // shadow own that zone instead of doubling its darkness at the coast.
        float regionalMask=smoothstep(2.0,6.0,edgeDistance.r);
        float border=max(contact,projectedShadow)*regionalMask;
        // Leave the fine illuminated bevel intact; a recessed dark shoulder
        // then decays inward over the actual terrain and geographic holes.
        float inset=.58*smoothstep(.65,2.7,edgeDistance.r)*exp(-edgeDistance.r/9.0);
        return 1.0-max(border,inset);
      }
      void main(){
        vec4 relief=fuiTerrainSample(vMapPosition);
        vec2 slope=relief.rg*2.0-1.0;
        vec3 n=normalize(vec3(slope*1.05,sqrt(max(1.0-dot(slope,slope),.035))));
        vec3 key=normalize(vec3(-.60,.48,.64));
        float sun=max(dot(n,key),0.0);
        float curvature=relief.a*2.0-1.0;
        float occlusion=clamp(.86+curvature*1.5,.55,1.15);
        float h=fuiTerrainHeight(vMapPosition);
        vec2 lightDirection=normalize(key.xy);
        float horizon=max((fuiTerrainHeight(vMapPosition+lightDirection*3.0)-h)/3.0,
                          (fuiTerrainHeight(vMapPosition+lightDirection*8.0)-h)/8.0);
        float shade=1.0-.58*smoothstep(key.z/length(key.xy)-.12,key.z/length(key.xy)+.16,horizon);
        vec3 satellite=texture2D(uPhotograph,clamp((vGeoUv-uPhotographBounds.xy)/uPhotographBounds.zw,0.0,1.0)).rgb;
        float photo=dot(satellite,vec3(.2126,.7152,.0722));
        float albedo=.034+pow(max(photo,0.0),.65)*.078+relief.b*.09;
        vec3 color=uTerrainTone*albedo*(.30+pow(sun,1.2)*1.90)*occlusion*shade;
        float energy=dot(color,vec3(.2126,.7152,.0722));
        vec3 pigment=uAccent*energy/max(dot(uAccent,vec3(.2126,.7152,.0722)),.001);
        color=mix(color,pigment,.10+.08*sun);
        color+=uTerrainRidgeTone*max(curvature,0.0)*.028;
        // Fill the entire selected geographic surface in the same theme hue.
        // Keep its relief shading and occlusion; this is not an elevated plane.
        vec3 selected=color*.85+uSelectionColor*(.26+.34*sun)*occlusion*(.55+.45*shade);
        color=mix(color,selected,clamp(uSelection,0.0,1.0));
        // Attenuate the embedded terrain in linear light so its real relief
        // and selection stay readable through the independently lit cover.
        color*=fuiBoundaryOcclusion(vMapPosition);
        // The real MeshPhysicalMaterial coat above this region supplies
        // the view-dependent studio reflection; keep geographic relief crisp.
        gl_FragColor=vec4(color,uOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent:false,opacity:1,depthWrite:true,side:THREE.DoubleSide,
  });
  material.userData.fuiGeoSurface=true;material.userData.fuiOpacityUniform=true;
  return material;
}
export function updateFuiMapSurface(material:THREE.ShaderMaterial,skin:FuiEarthSkinId,selection=0){
  const colors=getFuiMapTerrainColors(skin);
  material.uniforms.uTerrainTone.value.copy(colors.tone);
  material.uniforms.uTerrainRidgeTone.value.copy(colors.ridge);
  material.uniforms.uAccent.value.copy(getFuiMapMaterialPalette(skin,'entity').accent);
  material.uniforms.uSelectionColor.value.copy(getFuiMapMaterialPalette(skin,'entity').inner);
  material.uniforms.uSelection.value=selection;
  material.uniforms.uOpacity.value=material.opacity;
  // Three's physical transmission samples the opaque pass. Keep the embedded
  // relief there after the original entrance fade, instead of refracting blank sky.
  material.transparent=material.opacity<.999;
}
