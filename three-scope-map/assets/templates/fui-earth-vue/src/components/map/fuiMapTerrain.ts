// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { FuiMapEdgeField } from './fuiMapGlow';

// Subdivide actual ShapeGeometry triangles; never replace the geographic
// footprint with a rectangle, independent terrain tile or generated artwork.
export function refineFuiMapGeometry(source:THREE.BufferGeometry,step=4.5){
  const attribute=source.getAttribute('position'),index=source.getIndex();
  const vertices:number[]=Array.from(attribute.array),triangles:number[]=[],pending:number[]=[];
  for(let i=0;i<(index?.count??attribute.count);i++)pending.push(index?index.getX(i):i);
  const midpoints=new Map<string,number>(),limit=step*step;
  const length=(a:number,b:number)=>{
    const x=vertices[a*3]-vertices[b*3],y=vertices[a*3+1]-vertices[b*3+1];return x*x+y*y;
  };
  const midpoint=(a:number,b:number)=>{
    const key=a<b?`${a}:${b}`:`${b}:${a}`;let m=midpoints.get(key);
    if(m!==undefined)return m;
    m=vertices.length/3;for(let axis=0;axis<3;axis++)vertices.push((vertices[a*3+axis]+vertices[b*3+axis])*.5);
    midpoints.set(key,m);return m;
  };
  while(pending.length){
    const c=pending.pop()!,b=pending.pop()!,a=pending.pop()!;
    const ab=length(a,b),bc=length(b,c),ca=length(c,a),largest=Math.max(ab,bc,ca);
    if(largest<=limit||vertices.length/3>=180000){triangles.push(a,b,c);continue;}
    if(ab===largest){const m=midpoint(a,b);pending.push(a,m,c,m,b,c);}
    else if(bc===largest){const m=midpoint(b,c);pending.push(a,b,m,a,m,c);}
    else{const m=midpoint(c,a);pending.push(a,b,m,m,b,c);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(triangles);
  geometry.computeVertexNormals();geometry.computeBoundingBox();
  geometry.boundingBox!.min.z=-.3;geometry.boundingBox!.max.z=26;
  geometry.boundingSphere=geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

export const FUI_TERRAIN_GLSL=/* glsl */`
  uniform sampler2D uRelief;uniform sampler2D uRegional;uniform sampler2D uFuiHeightMap;
  uniform vec4 uFuiOverviewBounds;
  uniform vec4 uRegionalBounds;uniform float uHasRegional;
  uniform vec4 uFuiGeoTransform;uniform float uFuiMercator;uniform sampler2D uFuiTerrainEdges;
  uniform vec4 uFuiTerrainBounds;uniform float uFuiTerrainScale;uniform float uFuiTerrainEnabled;
  vec2 fuiGeoUv(vec2 p){
    vec2 uv=p*uFuiGeoTransform.xy+uFuiGeoTransform.zw;
    if(uFuiMercator>.5)uv.y=.5+(2.0*atan(exp((1.0-2.0*uv.y)*3.141592653589793))-1.570796326794897)/3.141592653589793;
    return uv;
  }
  vec4 fuiOverview(vec2 uv){return texture2D(uRelief,clamp((uv-uFuiOverviewBounds.xy)/uFuiOverviewBounds.zw,0.0,1.0));}
  vec4 fuiTerrainSample(vec2 p){
    vec2 uv=fuiGeoUv(p);vec4 overview=fuiOverview(uv);overview.b*=6400.0/9000.0;
    if(uHasRegional<.001)return overview;
    vec2 lngLat=uv*vec2(360.0,180.0)-vec2(180.0,90.0);
    vec2 local=(lngLat-uRegionalBounds.xy)/(uRegionalBounds.zw-uRegionalBounds.xy);
    vec4 detail=texture2D(uRegional,clamp(local,0.0,1.0));
    return mix(overview,detail,uHasRegional);
  }
  float fuiTerrainHeight(vec2 p){
    vec2 edgeUv=(p-uFuiTerrainBounds.xy)/uFuiTerrainBounds.zw;
    float distance=texture2D(uFuiTerrainEdges,edgeUv).r*64.0;
    vec2 uv=fuiGeoUv(p);float elevation=fuiOverview(uv).b*6400.0/9000.0;
    if(uHasRegional>.001){
      vec2 lngLat=uv*vec2(360.0,180.0)-vec2(180.0,90.0);
      vec2 local=(lngLat-uRegionalBounds.xy)/(uRegionalBounds.zw-uRegionalBounds.xy);
      elevation=mix(elevation,texture2D(uFuiHeightMap,clamp(local,0.0,1.0)).b,uHasRegional);
    }
    return elevation*uFuiTerrainScale*smoothstep(1.25,6.0,distance)*uFuiTerrainEnabled;
  }
  vec3 fuiTerrainNormal(vec2 p){
    float h=fuiTerrainHeight(p),e=2.6;
    return normalize(vec3(-(fuiTerrainHeight(p+vec2(e,0.0))-h)/e,
                          -(fuiTerrainHeight(p+vec2(0.0,e))-h)/e,1.0));
  }
`;

type PixelField={data:ArrayLike<number>;width:number;height:number;scale?:number};
type HitProxy={mesh:THREE.Mesh;proxy:THREE.Mesh;positions:THREE.BufferAttribute;overviewZ:Float32Array;regionalZ?:Float32Array};
export type FuiTerrainState={
  uniforms:Record<string,THREE.IUniform>;
  field:FuiMapEdgeField;projection:THREE.Vector4;mercator?:boolean;
  overview:PixelField;overviewOrigin:THREE.Vector2;overviewSize:THREE.Vector2;
  proxies:HitProxy[];
  regionalHeight?:PixelField;heightTexture?:THREE.DataTexture;
  regionalBlend?:{startedAt:number;duration:number};
};

export const FUI_TERRAIN_REGIONAL_BLEND_MS=380;
/** The owning renderer advances this value from its existing frame callback.
 * A hidden/prepared map can accept detail at full strength before first reveal. */
export function startFuiTerrainRegionalBlend(state:FuiTerrainState,animate:boolean,now=performance.now()){
  state.regionalBlend=animate?{startedAt:now,duration:FUI_TERRAIN_REGIONAL_BLEND_MS}:undefined;
  state.uniforms.uHasRegional!.value=animate?0:1;
}
export function advanceFuiTerrainRegionalBlend(state:FuiTerrainState,now=performance.now()){
  const transition=state.regionalBlend;if(!transition)return false;
  const elapsed=THREE.MathUtils.clamp((now-transition.startedAt)/transition.duration,0,1);
  state.uniforms.uHasRegional!.value=elapsed*elapsed*(3-2*elapsed);
  if(elapsed===1)state.regionalBlend=undefined;
  return elapsed<1;
}

// Smooth glass has no DEM. Keep the shared wall/line shader bindings valid
// with one owned neutral texel, without images, Canvas readback or hit proxies.
export function createFuiFlatTerrainState(field:FuiMapEdgeField,projection:THREE.Vector4):FuiTerrainState{
  const data=new Uint8Array([128,128,0,255]);
  const neutral=new THREE.DataTexture(data,1,1,THREE.RGBAFormat);
  neutral.generateMipmaps=false;neutral.minFilter=neutral.magFilter=THREE.NearestFilter;
  neutral.colorSpace=THREE.NoColorSpace;neutral.needsUpdate=true;
  return {
    uniforms:{uRelief:{value:neutral},uRegional:{value:neutral},uFuiHeightMap:{value:neutral},uRegionalBounds:{value:new THREE.Vector4()},uHasRegional:{value:0},
      uFuiOverviewBounds:{value:new THREE.Vector4(0,0,1,1)},uFuiMercator:{value:0},uFuiGeoTransform:{value:projection},uFuiTerrainEdges:{value:field.texture},uFuiTerrainBounds:{value:field.bounds},
      uFuiTerrainScale:{value:0},uFuiTerrainEnabled:{value:0}},
    field,projection,overview:{data,width:1,height:1},overviewOrigin:new THREE.Vector2(),overviewSize:new THREE.Vector2(1,1),proxies:[],heightTexture:neutral,
  };
}

function bilinear(field:PixelField,u:number,v:number,channel:number){
  const x=THREE.MathUtils.clamp(u*field.width-.5,0,field.width-1),y=THREE.MathUtils.clamp(v*field.height-.5,0,field.height-1);
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,field.width-1),y1=Math.min(y0+1,field.height-1),fx=x-x0,fy=y-y0;
  const at=(a:number,b:number)=>field.data[(b*field.width+a)*4+channel]*(field.scale??1/255);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(x0,y0),at(x1,y0),fx),THREE.MathUtils.lerp(at(x0,y1),at(x1,y1),fx),fy);
}

function pixelField(texture:THREE.DataTexture):PixelField{
  return {data:texture.image.data as Uint8Array,width:texture.image.width,height:texture.image.height};
}

/** Convert local XY into the original equirectangular texture UVs. The native
 * map keeps its affine contract; geographic overlays explicitly invert Mercator. */
export function fuiTerrainGeoUv(projection:THREE.Vector4,x:number,y:number,mercator=false){
  const u=x*projection.x+projection.z,v=y*projection.y+projection.w;
  return new THREE.Vector2(u,mercator ? .5+(2*Math.atan(Math.exp((1-2*v)*Math.PI))-Math.PI/2)/Math.PI:v);
}

export function createFuiTerrainState(field:FuiMapEdgeField,projection:THREE.Vector4,overview:THREE.Texture,country:boolean,overviewBounds=new THREE.Vector4(0,0,1,1),mercator=false):FuiTerrainState{
  // A small native-resolution geographic crop supports accurate CPU raycasts.
  // The rendered terrain continues to sample the original linear data textures.
  const image=overview.image as HTMLImageElement,b=field.bounds;
  const start=fuiTerrainGeoUv(projection,b.x,b.y,mercator),end=fuiTerrainGeoUv(projection,b.x+b.z,b.y+b.w,mercator);
  const u0=THREE.MathUtils.clamp(Math.min(start.x,end.x),0,1),v0=THREE.MathUtils.clamp(Math.min(start.y,end.y),0,1);
  const u1=THREE.MathUtils.clamp(Math.max(start.x,end.x),0,1),v1=THREE.MathUtils.clamp(Math.max(start.y,end.y),0,1);
  const localU0=(u0-overviewBounds.x)/overviewBounds.z,localU1=(u1-overviewBounds.x)/overviewBounds.z;
  const localV0=(v0-overviewBounds.y)/overviewBounds.w,localV1=(v1-overviewBounds.y)/overviewBounds.w;
  const x=Math.max(0,Math.floor(localU0*image.width)),y=Math.max(0,Math.floor((1-localV1)*image.height));
  const width=Math.max(1,Math.min(image.width-x,Math.ceil(localU1*image.width)-x+1));
  const height=Math.max(1,Math.min(image.height-y,Math.ceil((1-localV0)*image.height)-y+1));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Terrain hit-test decoder unavailable');
  context.drawImage(image,x,y,width,height,0,0,width,height);
  return {
    uniforms:{uRelief:{value:overview},uRegional:{value:overview},uFuiHeightMap:{value:overview},uRegionalBounds:{value:new THREE.Vector4()},uHasRegional:{value:0},
      uFuiOverviewBounds:{value:overviewBounds},uFuiMercator:{value:mercator?1:0},uFuiGeoTransform:{value:projection},uFuiTerrainEdges:{value:field.texture},uFuiTerrainBounds:{value:field.bounds},
      uFuiTerrainScale:{value:country?16:20},uFuiTerrainEnabled:{value:1}},
    field,projection,mercator,overview:{data:context.getImageData(0,0,width,height).data,width,height},
    overviewOrigin:new THREE.Vector2(overviewBounds.x+x/image.width*overviewBounds.z,1-overviewBounds.y-overviewBounds.w+y/image.height*overviewBounds.w),overviewSize:new THREE.Vector2(width/image.width*overviewBounds.z,height/image.height*overviewBounds.w),proxies:[],
  };
}

function heightCpu(state:FuiTerrainState,x:number,y:number,blend:number){
  const b=state.field.bounds,uv=fuiTerrainGeoUv(state.projection,x,y,state.mercator),u=uv.x,v=uv.y;
  const base=bilinear(state.overview,(u-state.overviewOrigin.x)/state.overviewSize.x,(1-v-state.overviewOrigin.y)/state.overviewSize.y,2)*6400/9000;
  let elevation=base;
  if(blend>0){
    const texture=state.uniforms.uRegional!.value as THREE.DataTexture,r=state.uniforms.uRegionalBounds!.value as THREE.Vector4;
    if(texture.isDataTexture)elevation=THREE.MathUtils.lerp(base,bilinear(state.regionalHeight??pixelField(texture),(u*360-180-r.x)/(r.z-r.x),(v*180-90-r.y)/(r.w-r.y),2),blend);
  }
  const edge=bilinear(pixelField(state.field.texture),(x-b.x)/b.z,(y-b.y)/b.w,0)*64;
  return elevation*state.uniforms.uFuiTerrainScale!.value*THREE.MathUtils.smoothstep(edge,1.25,6);
}

function updateProxy(state:FuiTerrainState,hit:HitProxy,blend:number){
  const a=hit.positions;
  const heights=blend===0?hit.overviewZ:new Float32Array(a.count);
  const bounds=new THREE.Box3(),point=new THREE.Vector3();
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),y=a.getY(i),height=heightCpu(state,x,y,blend)-.3;
    heights[i]=height;
    if(blend===0)a.setZ(i,height);
    bounds.expandByPoint(point.set(x,y,height));
    if(blend!==0)bounds.expandByPoint(point.set(x,y,hit.overviewZ[i]));
  }
  if(blend!==0)hit.regionalZ=heights;
  // A convex blend stays within the union of both endpoint bounds. Picking
  // reads interpolated Z lazily, without rewriting dense geometry each frame.
  hit.proxy.geometry.boundingBox=bounds;
  hit.proxy.geometry.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
}

export function bindFuiTerrainRaycast(mesh:THREE.Mesh,geometry:THREE.BufferGeometry,state:FuiTerrainState){
  const proxy=new THREE.Mesh(geometry.clone(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const positions=proxy.geometry.getAttribute('position') as THREE.BufferAttribute;
  const hit:HitProxy={mesh,proxy,positions,overviewZ:new Float32Array(positions.count)};
  state.proxies.push(hit);updateProxy(state,hit,0);mesh.userData.fuiTerrainHitProxy=proxy;
  let pickingBlend:number|undefined;
  positions.getZ=(index:number)=>{
    const blend=pickingBlend??THREE.MathUtils.clamp(Number(state.uniforms.uHasRegional!.value),0,1);
    if(!hit.regionalZ||blend===0)return hit.overviewZ[index];
    return blend===1?hit.regionalZ[index]:THREE.MathUtils.lerp(hit.overviewZ[index],hit.regionalZ[index],blend);
  };
  const flatRaycast=mesh.raycast.bind(mesh);
  mesh.raycast=(raycaster,intersections)=>{
    if(!state.uniforms.uFuiTerrainEnabled!.value){flatRaycast(raycaster,intersections);return;}
    proxy.matrixWorld.copy(mesh.matrixWorld);const hits:THREE.Intersection[]=[];
    pickingBlend=THREE.MathUtils.clamp(Number(state.uniforms.uHasRegional!.value),0,1);
    try{proxy.raycast(raycaster,hits);}finally{pickingBlend=undefined;}
    for(const result of hits){result.object=mesh;intersections.push(result);}
  };
}

export function updateFuiTerrainHitProxies(state:FuiTerrainState){for(const hit of state.proxies)updateProxy(state,hit,1);}

export function prepareFuiTerrainRegional(state:FuiTerrainState,texture:THREE.DataTexture,bounds:readonly number[]){
  state.uniforms.uRegional!.value=texture;state.uniforms.uRegionalBounds!.value.set(...bounds);
  const source=pixelField(texture),width=Math.max(2,Math.floor(source.width/4)),height=Math.max(2,Math.floor(source.height/4));
  const elevation=new Float32Array(width*height),smoothed=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let sum=0;
    for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)sum+=source.data[(((y*4+dy)*source.width+x*4+dx)*4)+2]/255;
    elevation[y*width+x]=sum/16;
  }
  const at=(x:number,y:number)=>elevation[Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x))];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    smoothed[y*width+x]=(at(x,y)*4+(at(x-1,y)+at(x+1,y)+at(x,y-1)+at(x,y+1))*2+at(x-1,y-1)+at(x+1,y-1)+at(x-1,y+1)+at(x+1,y+1))/16;
  const packed=new Uint16Array(width*height*4),cpu=new Float32Array(width*height*4);
  for(let i=0;i<smoothed.length;i++){
    packed[i*4+2]=THREE.DataUtils.toHalfFloat(smoothed[i]);packed[i*4+3]=THREE.DataUtils.toHalfFloat(1);
    cpu[i*4+2]=THREE.DataUtils.fromHalfFloat(packed[i*4+2]);cpu[i*4+3]=1;
  }
  state.heightTexture?.dispose();
  const heightMap=new THREE.DataTexture(packed,width,height,THREE.RGBAFormat,THREE.HalfFloatType);
  heightMap.minFilter=THREE.LinearFilter;heightMap.magFilter=THREE.LinearFilter;heightMap.colorSpace=THREE.NoColorSpace;heightMap.needsUpdate=true;
  state.heightTexture=heightMap;state.regionalHeight={data:cpu,width,height,scale:1};state.uniforms.uFuiHeightMap!.value=heightMap;
}

export function bindFuiTerrainUniforms(material:THREE.ShaderMaterial,state:FuiTerrainState){Object.assign(material.uniforms,state.uniforms);}

export function bindFuiTerrainSideWall(material:THREE.ShaderMaterial,state:FuiTerrainState){
  bindFuiTerrainUniforms(material,state);
  material.vertexShader=FUI_TERRAIN_GLSL+material.vertexShader.replace(
    'vec4 view=modelViewMatrix*vec4(stretched,1.0);',
    'if(uGlass>.5)stretched.z+=(fuiTerrainHeight(position.xy)+.12)*vDepth;\nvec4 view=modelViewMatrix*vec4(stretched,1.0);');
}

export function bindFuiTerrainGlass(material:THREE.MeshPhysicalMaterial,state:FuiTerrainState){
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);Object.assign(shader.uniforms,state.uniforms);
    shader.vertexShader=FUI_TERRAIN_GLSL+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nobjectNormal=fuiTerrainNormal(position.xy);');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.z+=fuiTerrainHeight(position.xy);');
  };
  material.customProgramCacheKey=()=>key+'|fui-conformal-dem-v1';
}

export function bindFuiTerrainLine(material:LineMaterial,state:FuiTerrainState){
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,state.uniforms);shader.vertexShader=FUI_TERRAIN_GLSL+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );',
      'vec4 start = modelViewMatrix * vec4(instanceStart+vec3(0.0,0.0,fuiTerrainHeight(instanceStart.xy)),1.0);');
    shader.vertexShader=shader.vertexShader.replace('vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );',
      'vec4 end = modelViewMatrix * vec4(instanceEnd+vec3(0.0,0.0,fuiTerrainHeight(instanceEnd.xy)),1.0);');
  };
  material.customProgramCacheKey=()=> 'fui-dem-draped-boundary-v1';
}
