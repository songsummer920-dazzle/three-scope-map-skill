// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import type { FuiEarthSkinId } from './fuiEarthTheme';
import { getFuiMapMaterialPalette } from './fuiMapMaterial';
import {drainFuiMapBuild,runFuiMapBuild,type FuiMapBuildOptions} from './fuiMapBuildStages';

export const FUI_MAP_EDGE_RANGE=64;
export type FuiMapEdgeField={texture:THREE.DataTexture;bounds:THREE.Vector4};

// Exact separable Euclidean distance transform. Cost depends on raster size,
// not the number of borders; no nearest-edge searches in a frame or pointer event.
export function* fuiMapDistanceTransformStages(mask:Uint8ClampedArray,width:number,height:number):Generator<void,Float32Array,void>{
  const squared=new Float32Array(width*height);
  const length=Math.max(width,height),f=new Float64Array(length),d=new Float64Array(length);
  const sites=new Int32Array(length),limits=new Float64Array(length+1);
  const line=(count:number)=>{
    let k=0;sites[0]=0;limits[0]=-Infinity;limits[1]=Infinity;
    for(let q=1;q<count;q++){
      let s=((f[q]+q*q)-(f[sites[k]]+sites[k]*sites[k]))/(2*(q-sites[k]));
      while(s<=limits[k]){
        k--;s=((f[q]+q*q)-(f[sites[k]]+sites[k]*sites[k]))/(2*(q-sites[k]));
      }
      sites[++k]=q;limits[k]=s;limits[k+1]=Infinity;
    }
    k=0;
    for(let q=0;q<count;q++){
      while(limits[k+1]<q)k++;
      d[q]=(q-sites[k])*(q-sites[k])+f[sites[k]];
    }
  };
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++)f[x]=mask[(y*width+x)*4+3]>64?0:1e12;
    line(width);for(let x=0;x<width;x++)squared[y*width+x]=d[x];
    if((y&63)===63)yield;
  }
  for(let x=0;x<width;x++){
    for(let y=0;y<height;y++)f[y]=squared[y*width+x];
    line(height);for(let y=0;y<height;y++)squared[y*width+x]=Math.sqrt(d[y]);
    if((x&63)===63)yield;
  }
  return squared;
}

export function* createFuiMapEdgeFieldStages(shapes:THREE.Shape[],regions:{rings:THREE.Vector2[][]}[]):Generator<void,FuiMapEdgeField,void>{
  const exterior=shapes.flatMap(shape=>[shape.getPoints(),...shape.holes.map(hole=>hole.getPoints())]);
  const box=new THREE.Box2().setFromPoints(exterior.flat());
  box.expandByScalar(FUI_MAP_EDGE_RANGE);
  const span=box.getSize(new THREE.Vector2()),scale=1024/Math.max(span.x,span.y,1);
  const width=Math.max(2,Math.ceil(span.x*scale)),height=Math.max(2,Math.ceil(span.y*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Map edge field requires a 2D raster context');
  const raster=function*(rings:THREE.Vector2[][]):Generator<void,Float32Array,void>{
    context.clearRect(0,0,width,height);context.strokeStyle='#fff';context.lineWidth=1;
    context.beginPath();
    let ringCount=0;
    for(const ring of rings){
      if(!ring.length)continue;
      ring.forEach((p,index)=>{
        const x=(p.x-box.min.x)*scale,y=(p.y-box.min.y)*scale;
        if(index===0)context.moveTo(x,y);else context.lineTo(x,y);
      });context.closePath();
      if((++ringCount&31)===0)yield;
    }
    context.stroke();yield;
    return yield* fuiMapDistanceTransformStages(context.getImageData(0,0,width,height).data,width,height);
  };
  // Subpixel differences between adjacent administrative source rings are not
  // national coastline. Close just one raster pixel, then flood the outside:
  // tiny seams and enclosed internal voids must never light as country edges.
  context.fillStyle='#fff';context.clearRect(0,0,width,height);
  let shapeCount=0;
  for(const shape of shapes){
    context.beginPath();
    shape.getPoints().forEach((p,index)=>{
      const x=(p.x-box.min.x)*scale,y=(p.y-box.min.y)*scale;
      if(index===0)context.moveTo(x,y);else context.lineTo(x,y);
    });context.closePath();context.fill();
    if((++shapeCount&15)===0)yield;
  }
  const image=context.getImageData(0,0,width,height).data,count=width*height;
  const land=new Uint8Array(count),dilated=new Uint8Array(count),closed=new Uint8Array(count);
  for(let i=0;i<count;i++){land[i]=image[i*4+3]>96?1:0;if((i&32767)===32767)yield;}
  for(let y=1;y<height-1;y++){for(let x=1;x<width-1;x++){
    const i=y*width+x;
    for(let dy=-1;dy<=1&&!dilated[i];dy++)for(let dx=-1;dx<=1;dx++)
      if(land[i+dy*width+dx]){dilated[i]=1;break;}
  }if((y&31)===31)yield;}
  for(let y=1;y<height-1;y++){for(let x=1;x<width-1;x++){
    const i=y*width+x;let filled=1;
    for(let dy=-1;dy<=1&&filled;dy++)for(let dx=-1;dx<=1;dx++)
      if(!dilated[i+dy*width+dx]){filled=0;break;}
    closed[i]=filled;
  }if((y&31)===31)yield;}
  const outside=new Uint8Array(count),queue=new Int32Array(count);let head=0,tail=1;outside[0]=1;
  while(head<tail){
    const i=queue[head++],x=i%width,y=Math.floor(i/width);
    for(const next of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1]){
      if(next<0||closed[next]||outside[next])continue;
      outside[next]=1;queue[tail++]=next;
    }
    if((head&16383)===0)yield;
  }
  const coast=new Uint8ClampedArray(count*4);
  for(let y=1;y<height-1;y++){for(let x=1;x<width-1;x++){
    const i=y*width+x;
    if(closed[i]&&(outside[i-1]||outside[i+1]||outside[i-width]||outside[i+width]))coast[i*4+3]=255;
  }if((y&31)===31)yield;}
  const outer=yield* fuiMapDistanceTransformStages(coast,width,height);
  const regional=yield* raster(regions.flatMap(region=>region.rings));
  const pixels=new Uint8Array(width*height*4);
  for(let i=0;i<outer.length;i++){
    pixels[i*4]=Math.round(Math.min(1,outer[i]/scale/FUI_MAP_EDGE_RANGE)*255);
    pixels[i*4+1]=Math.round(Math.min(1,regional[i]/scale/FUI_MAP_EDGE_RANGE)*255);
    pixels[i*4+3]=255;
    if((i&32767)===32767)yield;
  }
  const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);
  texture.name='fui-map-geographic-edge-distances';texture.colorSpace=THREE.NoColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;texture.needsUpdate=true;
  return {texture,bounds:new THREE.Vector4(box.min.x,box.min.y,width/scale,height/scale)};
}

/** Sync consumers and background preparation drain the exact same raster work. */
export function createFuiMapEdgeField(shapes:THREE.Shape[],regions:{rings:THREE.Vector2[][]}[]):FuiMapEdgeField{
  return drainFuiMapBuild(createFuiMapEdgeFieldStages(shapes,regions));
}
export function createFuiMapEdgeFieldAsync(shapes:THREE.Shape[],regions:{rings:THREE.Vector2[][]}[],options:FuiMapBuildOptions={}){
  return runFuiMapBuild(createFuiMapEdgeFieldStages(shapes,regions),options);
}

export function bindFuiMapGlassGlow(material:THREE.MeshPhysicalMaterial,field:FuiMapEdgeField,skin:FuiEarthSkinId){
  const uniforms={
    uFuiEdgeField:{value:field.texture},uFuiEdgeBounds:{value:field.bounds},
    uFuiGlowColor:{value:getFuiMapMaterialPalette(skin,'entity').inner.clone()},
    uFuiSelection:{value:0},uFuiGlowFade:{value:1},
  };
  material.userData.fuiGlassGlow=uniforms;
  const original=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    original.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec2 vFuiMapPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvFuiMapPosition=position.xy;');
    shader.fragmentShader=`
      uniform sampler2D uFuiEdgeField;uniform vec4 uFuiEdgeBounds;
      uniform vec3 uFuiGlowColor;uniform float uFuiSelection;uniform float uFuiGlowFade;
      varying vec2 vFuiMapPosition;
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec2 fuiEdgeUv=(vFuiMapPosition-uFuiEdgeBounds.xy)/uFuiEdgeBounds.zw;
      vec2 fuiDistance=texture2D(uFuiEdgeField,fuiEdgeUv).rg*${FUI_MAP_EDGE_RANGE.toFixed(1)};
      float fuiOuter=.24*exp(-fuiDistance.r/2.8)+.10*exp(-fuiDistance.r/8.5);
      float fuiSelected=uFuiSelection*(.16+.38*exp(-fuiDistance.g/2.3)+.18*exp(-fuiDistance.g/8.0));
      totalEmissiveRadiance+=uFuiGlowColor*(fuiOuter+fuiSelected)*uFuiGlowFade;
    `);
  };
  material.customProgramCacheKey=()=>key+'|fui-geographic-inner-glow-v1';
}

export function updateFuiMapGlassGlow(material:THREE.MeshPhysicalMaterial,skin:FuiEarthSkinId,selection:number,fade:number){
  const uniforms=material.userData.fuiGlassGlow;
  if(!uniforms)return;
  uniforms.uFuiSelection.value=selection;uniforms.uFuiGlowFade.value=fade;
  uniforms.uFuiGlowColor.value.copy(getFuiMapMaterialPalette(skin,'entity').inner);
}
