// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { FUI_MAP_EDGE_RANGE,type FuiMapEdgeField } from './fuiMapGlow';
import {browserMapQualityBudget,type MapQuality} from './mapQuality';

// The mirror camera sees geographic meshes and lights only. Neither the HUD
// nor the mirror itself participates, so there is no recursive instrument image.
export const FUI_MAP_REFLECTION_LAYER=2;

function targetSize(width:number,height:number,pixelRatio:number,quality:MapQuality){
  const budget=browserMapQualityBudget(quality);
  const scale=Math.min(pixelRatio,budget.reflectionPixelRatio,budget.reflectionMaxSize/Math.max(width,height));
  return [Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale))] as const;
}

export function canCreateFuiMapReflection(quality:MapQuality='high',floatTargets=true){return floatTargets&&browserMapQualityBudget(quality).reflection;}

export function createFuiMapReflection(field:FuiMapEdgeField,width:number,height:number,pixelRatio:number,quality:MapQuality='high',floatTargets=true,supportedSamples=0){
  // A disabled budget/capability must not instantiate a HalfFloat Reflector
  // first: even an invisible mirror owns an otherwise unnecessary target.
  if(!canCreateFuiMapReflection(quality,floatTargets))return undefined;
  const bounds=field.bounds,center=new THREE.Vector2(bounds.x+bounds.z/2,bounds.y+bounds.w/2);
  const [textureWidth,textureHeight]=targetSize(width,height,pixelRatio,quality);
  const reflection=new Reflector(new THREE.PlaneGeometry(bounds.z,bounds.w),{
    textureWidth,textureHeight,multisample:supportedSamples===2?2:0,clipBias:.001,
    shader:{
      name:'FuiMapReflection',
      uniforms:{color:{value:new THREE.Color(1,1,1)},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},
        uEdgeField:{value:field.texture},uEdgeBounds:{value:bounds},uCenter:{value:center},uOpacity:{value:1}},
      vertexShader:`
        uniform mat4 textureMatrix;uniform vec2 uCenter;
        varying vec4 vMirrorUv;varying vec2 vMapPosition;
        void main(){
          vMirrorUv=textureMatrix*vec4(position,1.0);vMapPosition=position.xy+uCenter;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader:`
        uniform sampler2D tDiffuse;uniform sampler2D uEdgeField;
        uniform vec4 uEdgeBounds;uniform float uOpacity;
        varying vec4 vMirrorUv;varying vec2 vMapPosition;
        void main(){
          vec2 uv=(vMapPosition-uEdgeBounds.xy)/uEdgeBounds.zw;
          float distanceToCoast=texture2D(uEdgeField,uv).r*${FUI_MAP_EDGE_RANGE.toFixed(1)};
          float roughness=smoothstep(2.0,40.0,distanceToCoast);
          vec4 reflected=textureLod(tDiffuse,vMirrorUv.xy/vMirrorUv.w,roughness*3.0);
          float falloff=exp(-distanceToCoast/18.0)*(1.0-smoothstep(32.0,56.0,distanceToCoast));
          float alpha=reflected.a*.38*falloff*uOpacity;
          if(alpha<.002)discard;
          vec3 reflectedColor=reflected.rgb/max(reflected.a,.015);
          gl_FragColor=vec4(reflectedColor*mix(1.0,.72,roughness),alpha);
          #include <colorspace_fragment>
        }
      `,
    },
  });
  reflection.name='fui-map-live-reflection';reflection.position.set(center.x,center.y,11.6);
  const material=reflection.material as THREE.ShaderMaterial;
  material.uniforms.uEdgeField.value=field.texture;
  material.uniforms.uEdgeBounds.value=field.bounds;
  reflection.renderOrder=-8;reflection.camera.layers.set(FUI_MAP_REFLECTION_LAYER);
  material.transparent=true;material.depthWrite=false;material.depthTest=true;
  material.toneMapped=false;
  reflection.getRenderTarget().texture.generateMipmaps=true;
  reflection.getRenderTarget().texture.minFilter=THREE.LinearMipmapLinearFilter;
  reflection.userData.fuiReflectionTarget=reflection.getRenderTarget();
  // No diffuse floor color, lighting, shadow receiver or filled background:
  // only actual reflected map pixels survive the transparent render target.
  return reflection;
}

export function updateFuiMapReflection(reflection:THREE.Object3D|undefined,visible:boolean,fade:number){
  if(!(reflection instanceof Reflector))return;
  reflection.visible=visible&&fade>0;
  const material=reflection.material as THREE.ShaderMaterial;
  material.uniforms.uOpacity.value=fade*material.opacity;
}

export function resizeFuiMapReflection(reflection:THREE.Object3D|undefined,width:number,height:number,pixelRatio:number,quality:MapQuality='high'){
  if(!(reflection instanceof Reflector))return;
  const [w,h]=targetSize(width,height,pixelRatio,quality),target=reflection.getRenderTarget();
  if(target.width!==w||target.height!==h)target.setSize(w,h);
}
