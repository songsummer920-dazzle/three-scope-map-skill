// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import {FUI_HOLOGRAM_FOCUS,createFuiHologramFocusSides} from './fuiEarthHologramFocus';
import {createFuiHologramGlassSurface} from './fuiEarthHologramGlass';
import type {GeoFeatureCollection,Position} from '../../types/geo';
import {createFuiHologramPigment,type FuiEarthSkinId} from './fuiEarthTheme';

export type FuiEarthPresentation='surface'|'hologram'|'hologram-hex';
export type FuiHologramPattern='dots'|'hex';
export type FuiHologramOptics={glsl:string;uniforms:Record<string,THREE.IUniform>;environment?:THREE.Texture};
export const FUI_EARTH_PRESENTATIONS=[{id:'surface',name:'实体地球'},{id:'hologram',name:'规则点阵'},{id:'hologram-hex',name:'规则蜂窝'}] as const;
export function isFuiEarthPresentation(value:unknown):value is FuiEarthPresentation{return value==='surface'||value==='hologram'||value==='hologram-hex';}
export type HologramAtlas={width:number;height:number;land:Uint8Array;china:Uint8Array;structure?:Uint8Array;innerGlow?:Uint8Array};
// Verified offline output of the same Canvas atlas builder, in original RGBA
// channel order. A prepared mask avoids rebuilding geographic pixels on mount.
export type HologramMaskPixels={width:number;height:number;pixels:Uint8Array};
type Samples={positions:Float32Array;details:Float32Array;count:number};
const tau=Math.PI*2;
function random(index:number){let n=(index+1)|0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;}
export function hologramAtlasIndex(atlas:Pick<HologramAtlas,'width'|'height'>,lon:number,lat:number){
  const x=((Math.floor((lon+180)/360*atlas.width)%atlas.width)+atlas.width)%atlas.width;
  const y=Math.min(atlas.height-1,Math.max(0,Math.floor((90-lat)/180*atlas.height)));
  return y*atlas.width+x;
}
// Unwrap before drawing and repeat at the antimeridian. A polygon crossing
// 180 degrees must not paint a spurious band across the whole globe.
export function unwrapHologramRing(ring:Position[]):Position[]{
  const result:Position[]=[];let previous=ring[0]?.[0]??0;
  for(const [longitude,latitude] of ring){let lon=longitude;while(lon-previous>180)lon-=360;while(lon-previous< -180)lon+=360;result.push([lon,latitude]);previous=lon;}
  return result;
}
function polygons(data:GeoFeatureCollection){return data.features.filter(feature=>!String(feature.properties.adcode??feature.properties.code??'').endsWith('_JD')).flatMap(feature=>feature.geometry.type==='Polygon'?[feature.geometry.coordinates as Position[][]]:feature.geometry.coordinates as Position[][][]);}
export function createHologramAtlas(world:GeoFeatureCollection,china:GeoFeatureCollection):HologramAtlas{
  const width=3072,height=1536,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Cannot prepare geographic hologram mask');
  const draw=(data:GeoFeatureCollection,color:string,stroke=false)=>{
    context.fillStyle=color;context.strokeStyle=color;
    for(const polygon of polygons(data)){
      const outer=unwrapHologramRing(polygon[0]??[]);if(outer.length<3)continue;
      const anchor=outer[0][0];
      for(const offset of [-360,0,360]){
        context.beginPath();
        for(const [index,source] of polygon.entries()){
          const ring=index===0?outer:unwrapHologramRing(source);if(ring.length<3)continue;
          const align=index===0?0:Math.round((anchor-ring[0][0])/360)*360;
          ring.forEach(([lon,lat],i)=>{const x=(lon+align+offset+180)/360*width,y=(90-lat)/180*height;i?context.lineTo(x,y):context.moveTo(x,y);});context.closePath();
        }
        if(stroke)context.stroke();else context.fill('evenodd');
      }
    }
  };
  draw(world,'#ff0000');draw(china,'#ffff00');
  const rgba=context.getImageData(0,0,width,height).data,land=new Uint8Array(width*height),region=new Uint8Array(width*height);
  for(let i=0;i<land.length;i++){land[i]=rgba[i*4]>127&&rgba[i*4+3]>127?1:0;region[i]=rgba[i*4+1]>127?1:0;}
  // The emission field follows actual coasts and administrative paths.
  // It is sampled once on the CPU, never shown as a surface/GPU texture.
  rgba.fill(0);
  for(let y=1;y<height-1;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(land[i]&&(!land[y*width+(x+1)%width]||!land[y*width+(x-1+width)%width]||!land[i-width]||!land[i+width])){
      rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=rgba[i*4+3]=255;
    }
  }
  context.putImageData(new ImageData(rgba,width,height),0,0);
  context.lineWidth=.65;draw(world,'rgba(255,255,255,.12)',true);
  context.lineWidth=.85;draw(china,'rgba(255,255,255,.22)',true);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=width;glowCanvas.height=height;
  const glowContext=glowCanvas.getContext('2d',{willReadFrequently:true});if(!glowContext)throw new Error('Cannot prepare geographic point emission');
  glowContext.filter='blur(12px)';
  for(const offset of [-width,0,width])glowContext.drawImage(canvas,offset,0);
  const blurred=glowContext.getImageData(0,0,width,height).data,structure=new Uint8Array(width*height);
  for(let i=0;i<structure.length;i++)structure[i]=Math.min(255,blurred[i*4+3]*18);
  canvas.width=canvas.height=glowCanvas.width=glowCanvas.height=1;
  return{width,height,land,china:region,structure,innerGlow:chinaInteriorGlow(region,width,height)};
}
// Approximate Euclidean distance inside the actual China union. The field is
// zero outside it and decays inwards; it never fills the entire region with a
// flat accent-color plate or changes the regular pattern geometry.
function chinaInteriorGlow(region:Uint8Array,width:number,height:number){
  const distance=new Uint16Array(region.length),glow=new Uint8Array(region.length);
  for(let i=0;i<region.length;i++)if(region[i])distance[i]=60000;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(!region[i])continue;let d=distance[i];
    if(x)d=Math.min(d,distance[i-1]+10);else d=0;
    if(y){d=Math.min(d,distance[i-width]+10);if(x)d=Math.min(d,distance[i-width-1]+14);if(x+1<width)d=Math.min(d,distance[i-width+1]+14);}else d=0;
    distance[i]=d;
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;if(!region[i])continue;let d=distance[i];
    if(x+1<width)d=Math.min(d,distance[i+1]+10);else d=0;
    if(y+1<height){d=Math.min(d,distance[i+width]+10);if(x)d=Math.min(d,distance[i+width-1]+14);if(x+1<width)d=Math.min(d,distance[i+width+1]+14);}else d=0;
    distance[i]=d;glow[i]=Math.round(255*(.68*Math.exp(-d/220)+.32*Math.exp(-d/50)));
  }
  return glow;
}
export function sampleHologramLand(atlas:HologramAtlas,candidates=140000,radius=2):Samples{
  const positions=new Float32Array(candidates*3),details=new Float32Array(candidates*4);let count=0;
  // Deterministic random sphere proposals with a minimum separation. The grid
  // only accelerates proximity tests; no point is placed on its cell centers.
  // This removes the visible spiral/diagonal rows of a jittered Fibonacci shell.
  const separation=radius*Math.sqrt(4*Math.PI/Math.max(1,candidates))*.42,separation2=separation*separation;
  const stride=Math.ceil(2*radius/separation)+3,bins=new Map<number,number[]>();
  const key=(x:number,y:number,z:number)=>(x*stride+y)*stride+z;
  for(let i=0;i<candidates;i++){
    const y=1-2*random(i+1048583),theta=random(i+2097169)*tau-Math.PI;
    const lat=Math.asin(y)*180/Math.PI,lon=theta*180/Math.PI,index=hologramAtlasIndex(atlas,lon,lat);
    if(!atlas.land[index])continue;
    const horizontal=Math.sqrt(Math.max(0,1-y*y)),px=radius*horizontal*Math.cos(theta),py=radius*y,pz=-radius*horizontal*Math.sin(theta);
    const gx=Math.floor((px+radius)/separation),gy=Math.floor((py+radius)/separation),gz=Math.floor((pz+radius)/separation);
    let crowded=false;
    for(let dx=-1;dx<=1&&!crowded;dx++)for(let dy=-1;dy<=1&&!crowded;dy++)for(let dz=-1;dz<=1&&!crowded;dz++){
      for(const neighbor of bins.get(key(gx+dx,gy+dy,gz+dz))??[]){
        const p=neighbor*3,x=px-positions[p],y=py-positions[p+1],z=pz-positions[p+2];
        if(x*x+y*y+z*z<separation2){crowded=true;break;}
      }
    }
    if(crowded)continue;
    const p=count*3,d=count*4;positions[p]=px;positions[p+1]=py;positions[p+2]=pz;
    const binKey=key(gx,gy,gz),bin=bins.get(binKey);if(bin)bin.push(count);else bins.set(binKey,[count]);
    const x=index%atlas.width,row=Math.floor(index/atlas.width);
    const coast=atlas.land[row*atlas.width+(x+2)%atlas.width]===0||atlas.land[row*atlas.width+(x-2+atlas.width)%atlas.width]===0||atlas.land[Math.max(0,row-2)*atlas.width+x]===0||atlas.land[Math.min(atlas.height-1,row+2)*atlas.width+x]===0;
    const structure=(atlas.structure?.[index]??(coast?255:0))/255;
    const grain=.40+Math.pow(random(i+917),3);
    details[d]=grain*(.72+.65*structure);
    details[d+1]=.55+random(i+8173)*.56;details[d+2]=atlas.china[index];details[d+3]=coast?1:0;count++;
  }
  return{positions:positions.slice(0,count*3),details:details.slice(0,count*4),count};
}

// Both regular patterns use one actual sphere. This is geographic data, not a
// photographic surface: red=land membership, green=China, blue=coast/admin structure,
// alpha=China-union inward glow. No channel contains photographed terrain.
function geographicMask(atlas:HologramAtlas|HologramMaskPixels){
  const pixels='pixels' in atlas?atlas.pixels:new Uint8Array(atlas.width*atlas.height*4);
  if(pixels.length!==atlas.width*atlas.height*4)throw new Error('Invalid prepared hologram mask dimensions');
  if(!('pixels' in atlas))for(let i=0;i<atlas.land.length;i++){
    pixels[i*4]=atlas.land[i]*255;pixels[i*4+1]=atlas.china[i]*255;
    pixels[i*4+2]=atlas.structure?.[i]??0;pixels[i*4+3]=atlas.innerGlow?.[i]??0;
  }
  const texture=new THREE.DataTexture(pixels,atlas.width,atlas.height,THREE.RGBAFormat,THREE.UnsignedByteType);
  texture.name='hologram-geographic-membership';texture.colorSpace=THREE.NoColorSpace;
  texture.flipY=false;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return texture;
}

const regularVertex=/*glsl*/`
  uniform vec3 uLightDirection;
  #ifdef FUI_CHINA_SURFACE
  uniform float uFocusLift; uniform float uFocusHoverLift;
  uniform float uHover; uniform float uIntroReveal;
  #endif
  varying vec3 vLocal; varying vec3 vWorldPosition; varying vec3 vWorldRadial;
  varying float vFacing; varying float vIllumination; varying float vDirectLight;
  void main(){
    vec3 surfacePosition=position;
    #ifdef FUI_CHINA_SURFACE
    float lift=(uFocusLift+uFocusHoverLift*clamp(uHover,0.0,1.0))*clamp(uIntroReveal,0.0,1.0);
    surfacePosition=normalize(position)*(2.0+lift);
    #endif
    vLocal=normalize(position);
    vWorldPosition=(modelMatrix*vec4(surfacePosition,1.0)).xyz;
    vWorldRadial=normalize(mat3(modelMatrix)*surfacePosition);
    vec4 viewPosition=modelViewMatrix*vec4(surfacePosition,1.0);
    vec3 viewNormal=normalize(normalMatrix*normal);
    vec3 worldNormal=normalize(mat3(modelMatrix)*normal);
    vFacing=dot(viewNormal,normalize(-viewPosition.xyz));
    vDirectLight=max(0.0,dot(worldNormal,normalize(uLightDirection)));
    // The same animated world light shapes both patterns. Keep a real
    // highlight-to-shadow interval instead of a nearly constant dark net.
    vIllumination=.24+1.80*pow(vDirectLight,.85);
    gl_Position=projectionMatrix*viewPosition;
  }
`;
const regularFragment=/*glsl*/`
  uniform sampler2D uGeography;
  uniform vec2 uMaskTexel;
  uniform mat3 uPatternFrame;
  uniform vec3 uColor; uniform vec3 uCoreColor;
  uniform float uPattern; uniform float uPatternScale;
  uniform float uFade; uniform float uIntroReveal; uniform float uHover;
  uniform float uTime; uniform float uSweepProgress;
  #ifdef FUI_CHINA_SURFACE
  uniform float uFocusLift; uniform float uFocusHoverLift;
  #endif
  #ifdef FUI_SHARED_AERIAL
  uniform vec3 uSkinRimColor;
  uniform vec3 uSkinFillColor;
  uniform vec3 uSkinRimCore;
  uniform float uSkinEdgeGain;
  uniform float uSkinEnvironmentGain;
  #endif
  varying vec3 vLocal; varying vec3 vWorldPosition; varying vec3 vWorldRadial;
  varying float vFacing; varying float vIllumination; varying float vDirectLight;
  const float PI=3.141592653589793;
  const float TAU=6.283185307179586;
  // The two rows surrounding p contain the nearest center of this triangular
  // lattice. Its Voronoi cells are regular six-sided honeycombs.
  vec2 hexLocal(vec2 p){
    const float rowHeight=.866025403784;
    float row=floor(p.y/rowHeight);
    float shift=.5*mod(row,2.0),nextShift=.5*mod(row+1.0,2.0);
    vec2 a=vec2(floor(p.x-shift+.5)+shift,row*rowHeight);
    vec2 b=vec2(floor(p.x-nextShift+.5)+nextShift,(row+1.0)*rowHeight);
    vec2 da=p-a,db=p-b;
    return dot(da,da)<dot(db,db)?da:db;
  }
  void main(){
    vec3 local=normalize(vLocal);
    vec2 uv=vec2(atan(-local.z,local.x)/TAU+.5,.5-asin(clamp(local.y,-1.0,1.0))/PI);
    vec4 geography=texture2D(uGeography,uv);
    #ifdef FUI_RAISED_WORLD
    // The geographic region exists only on its raised surface, never twice.
    if(geography.g>.01)discard;
    #endif
    #ifdef FUI_CHINA_SURFACE
    geography.g=1.0;
    #endif
    float land=smoothstep(.34,.66,geography.r);
    if(land<.005)discard;
    // Fixed in object coordinates. China lies near this pattern's equator,
    // keeping its cells even instead of compressing a latitude grid at 35 N.
    vec3 frame=normalize(uPatternFrame*local);
    vec2 p=vec2(atan(frame.z,frame.x),asin(clamp(frame.y,-1.0,1.0)))*uPatternScale;
    float ink;
    float core;
    if(uPattern<.5){
      vec2 cell=fract(p+.5)-.5;
      // A filtered Gaussian light core, rather than a hard circular lamp.
      // Its energy is normalized as the regular point lattice recedes.
      float pixel=max(length(dFdx(p)),length(dFdy(p)));
      const float sourceVariance=.0081;
      float variance=sourceVariance+pixel*pixel/12.0;
      core=(sourceVariance/variance)*exp(-dot(cell,cell)/(2.0*variance));
      float nearHalo=exp(-dot(cell,cell)/.032)*.025;
      ink=core+nearHalo;
    }else{
      vec2 cell=abs(hexLocal(p));
      float edgeDistance=.5-max(cell.x,dot(cell,vec2(.5,.866025403784)));
      float footprint=max(fwidth(edgeDistance),.001);
      // Integrate a genuinely fine line over the pixel footprint, including
      // both sides of the shared edge; this avoids a uniformly heavy net.
      const float halfWidth=.028;
      core=clamp((halfWidth+.5*footprint-edgeDistance)/footprint,0.0,1.0)
          -clamp((-halfWidth+.5*footprint-edgeDistance)/footprint,0.0,1.0);
      float nearHalo=exp(-edgeDistance*edgeDistance/.0064)*.035;
      ink=core*.92+nearHalo;
    }
    vec2 offset=uMaskTexel*2.5;
    vec3 east=texture2D(uGeography,uv+vec2(offset.x,0.0)).rgb;
    vec3 west=texture2D(uGeography,uv-vec2(offset.x,0.0)).rgb;
    vec3 north=texture2D(uGeography,uv-vec2(0.0,offset.y)).rgb;
    vec3 south=texture2D(uGeography,uv+vec2(0.0,offset.y)).rgb;
    vec2 neighbor=min(min(east.rg,west.rg),min(north.rg,south.rg));
    float coast=max(0.0,geography.r-neighbor.r);
    float chinaEdge=max(0.0,geography.g-neighbor.g);
    // Keep global coasts quiet. A separate fine geographic China edge makes
    // the focus recognizable without filling the transparent texture gaps.
    ink+=coast*.035;
    #ifndef FUI_CHINA_SURFACE
    ink+=chinaEdge*.30;
    #endif
    float front=smoothstep(-.025,.10,vFacing);
    float facing=mix(.006,1.0,front)*mix(.66,1.0,smoothstep(0.0,.45,vFacing));
    float rim=pow(1.0-clamp(vFacing,0.0,1.0),3.2)*front;
    float illuminatedRim=rim*sqrt(vDirectLight);
    float structure=pow(clamp(geography.b,0.0,1.0),.72);
    float inward=geography.a*geography.g;
    // Both geometries use this same spatial radiance field and the original
    // light vector. Only the regular cell profile above differs between them.
    float focusLight=smoothstep(.12,.90,vDirectLight);
    // The focus remains legible in shadow, but its ordinary emitters inherit
    // the same directional light instead of forming a uniformly pale badge.
    // Hex interiors need a little more focus contrast than isolated dot cores.
    float focusBoost=(.60+.65*focusLight)*mix(1.0,1.35,step(.5,uPattern));
    float energy=(.72+structure*.40+inward*.50)
        *(1.0+geography.g*(focusBoost+uHover*.44))*vIllumination;
    // A thin hex network covers more pixels than separated point cores.
    // Normalize only that coverage, leaving the common spatial light intact.
    energy*=mix(1.65,.80,step(.5,uPattern));
    #ifndef FUI_SHARED_AERIAL
    // Isolated emitter preview fallback. The integrated Earth passes its
    // original optical-depth/aerial GLSL instead of using this approximation.
    energy*=1.0+rim*.95+illuminatedRim*1.35;
    #endif
    energy*=mix(.68,1.0,smoothstep(.40,.90,vDirectLight));
    // Neutral hot cores belong only to the narrowest structured emitters.
    // The regular wires and ordinary dots keep their chromatic headroom.
    float grazing=pow(1.0-clamp(vFacing,0.0,1.0),1.2);
    float hotCore=clamp(core*core*smoothstep(.30,.90,vDirectLight)*(.10+.80*grazing)
        +core*core*(structure*.06+geography.g*(.025+.11*focusLight)),0.0,.76);
    // Reserve the geographic edge's original radiance. Inside it, give the
    // existing world key enough HDR headroom to survive tone mapping as a
    // visible spherical gradient rather than a uniformly near-white plate.
    float focusInterior=geography.g*(1.0-smoothstep(.04,.30,chinaEdge));
    float focusKey=smoothstep(.08,.62,vDirectLight);
    hotCore*=mix(1.0,.18+.82*focusKey,focusInterior);
    vec3 color=mix(uColor,uCoreColor,hotCore);
    // Inward light changes the existing emitters above; it never fills
    // the transparent cell interiors or the gaps between regular dots.
    float alpha=clamp(ink,0.0,1.0)*land*facing*uFade*uIntroReveal;
    if(alpha<.0015)discard;
    color*=energy*mix(1.0,.58+.42*focusKey,focusInterior);
    #ifdef FUI_SHARED_AERIAL
    // Exact optical implementation and live palette uniforms supplied by the
    // parent Earth surface. Alpha is still the actual geographic pattern;
    // the aerial radiance never paints empty ocean or a full opaque sphere.
    vec3 radial=normalize(vWorldRadial),viewDirection=normalize(cameraPosition-vWorldPosition);
    float surfaceRadius=2.0;
    #ifdef FUI_CHINA_SURFACE
    surfaceRadius+=(uFocusLift+uFocusHoverLift*clamp(uHover,0.0,1.0))*clamp(uIntroReveal,0.0,1.0);
    #endif
    vec3 airPoint=radial*surfaceRadius;
    float along=dot(airPoint,viewDirection);
    float distance=-along+sqrt(max(along*along+2.09*2.09-surfaceRadius*surfaceRadius,0.0));
    // The same surface optical depth attenuates the emitters. Its emitted
    // radiance now lives in the shared continuous shell, including ocean gaps,
    // rather than being stamped a second time only onto each dot or wire.
    color*=exp(-referenceOpticalDepth(airPoint,viewDirection,distance).x*.7);
    #endif
    gl_FragColor=vec4(color,alpha);
  }
`;

export function createFuiEarthHologram(world:GeoFeatureCollection|undefined,china:GeoFeatureCollection,skin:FuiEarthSkinId,_exterior:Position[][],lightDirection:THREE.Vector3,pattern:FuiHologramPattern='dots',optics?:FuiHologramOptics,focusGeometry?:THREE.BufferGeometry,preparedMask?:HologramMaskPixels){
  if(!preparedMask&&!world)throw new Error('Holographic Earth requires real geographic data or its verified mask');
  const atlas=preparedMask??createHologramAtlas(world!,china),mask=geographicMask(atlas);
  const color=new THREE.Color(),core=new THREE.Color();
  const lon=103.6*Math.PI/180,lat=35.2*Math.PI/180;
  const center=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),-Math.cos(lat)*Math.sin(lon));
  const north=new THREE.Vector3(-Math.sin(lat)*Math.cos(lon),Math.cos(lat),Math.sin(lat)*Math.sin(lon));
  const east=new THREE.Vector3(-Math.sin(lon),0,-Math.cos(lon));
  const patternFrame=new THREE.Matrix3().set(center.x,center.y,center.z,north.x,north.y,north.z,east.x,east.y,east.z);
  // Integer columns close the longitude seam when the globe is rotated.
  const scale=(pattern==='dots'?400:264)/tau;
  const uniforms={...optics?.uniforms,uFocusLift:{value:FUI_HOLOGRAM_FOCUS.lift},uFocusHoverLift:{value:FUI_HOLOGRAM_FOCUS.hoverLift},uLightDirection:{value:lightDirection},uColor:{value:color},uCoreColor:{value:core},uGeography:{value:mask},uMaskTexel:{value:new THREE.Vector2(1/atlas.width,1/atlas.height)},uPatternFrame:{value:patternFrame},uPattern:{value:pattern==='hex'?1:0},uPatternScale:{value:scale},uPointScale:{value:1},uHover:{value:0},uTime:{value:0},uFade:{value:1},uIntroReveal:{value:0},uSweepProgress:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:regularVertex,fragmentShader:(optics?'#define FUI_SHARED_AERIAL\n'+optics.glsl+'\n':'')+regularFragment,side:THREE.DoubleSide,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending});
  if(focusGeometry)material.defines={FUI_RAISED_WORLD:1};
  material.name=`hologram-regular-${pattern}`;material.userData.introLayer='earth';material.forceSinglePass=true;
  const group=new THREE.Group();group.name='fui-geographic-hologram';
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(2,192,128),material);mesh.name=`hologram-${pattern}-sphere`;mesh.frustumCulled=false;group.add(mesh);
  const materials=[material];
  let glass:ReturnType<typeof createFuiHologramGlassSurface>|undefined;
  let focusDiagnostics:{surface:'glass';provinceBoundaries:number;lift:number;hoverLift:number;topVertices:number;baseVertices:number;wallVertices:number;edgeVertices:number;baseSuppressed:boolean}|undefined;
  if(focusGeometry){
    if(!optics?.environment)throw new Error('China hologram glass requires the shared studio environment');
    const focusUniforms={...uniforms,uFade:{value:1},uIntroReveal:{value:0}};
    glass=createFuiHologramGlassSurface(_exterior,polygons(china),focusUniforms,optics.environment);
    const focusMaterial=glass.material;
    const baseMesh=new THREE.Mesh(focusGeometry.clone(),glass.baseMaterial);baseMesh.name='hologram-China-glass-interior';baseMesh.frustumCulled=false;baseMesh.renderOrder=.5;
    const focusMesh=new THREE.Mesh(focusGeometry,focusMaterial);focusMesh.name='hologram-China-raised-surface';focusMesh.frustumCulled=false;focusMesh.renderOrder=2;
    const sides=createFuiHologramFocusSides(_exterior,focusUniforms);group.add(baseMesh,focusMesh,sides.group);materials.push(focusMaterial);
    focusDiagnostics={...glass.diagnostics,lift:FUI_HOLOGRAM_FOCUS.lift,hoverLift:FUI_HOLOGRAM_FOCUS.hoverLift,topVertices:focusGeometry.getAttribute('position').count,baseVertices:baseMesh.geometry.getAttribute('position').count,...sides.diagnostics,baseSuppressed:true};
  }
  // The top, sides, border and geographic hit proxy consume this one radius.
  const getFocusRadius=()=>focusGeometry?FUI_HOLOGRAM_FOCUS.baseRadius+(uniforms.uFocusLift.value+uniforms.uFocusHoverLift.value*Math.max(0,Math.min(1,uniforms.uHover.value)))*Math.max(0,Math.min(1,uniforms.uIntroReveal.value)):2;
  const setSkin=(next:FuiEarthSkinId)=>{
    color.copy(createFuiHologramPigment(next));
    // Pigment/radiance of the regular pattern only. Both presentations keep
    // the original shared atmosphere, world light, exposure and Bloom.
    color.multiplyScalar(3.2);
    core.copy(color).lerp(new THREE.Color('#ffffff').multiplyScalar(3.2),.30).multiplyScalar(1.32);
  };setSkin(skin);
  return{group,material,materials,uniforms,setSkin,getFocusRadius,resize:(height:number,pixelRatio:number)=>{uniforms.uPointScale.value=height/850*pixelRatio;},dispose:()=>{mask.dispose();glass?.dispose();},diagnostics:{pattern,focus:focusDiagnostics,sharedAerial:Boolean(optics),patternCells:Math.round(tau*scale)*Math.round(Math.PI*scale/(pattern==='hex'?.866025403784:1)),oceanFill:false,rendering:'procedural-sphere',landPoints:0,coastPoints:0,boundaryPoints:0,oceanPoints:0,radius:2,atmosphere:'shared-earth',atlasSize:`${atlas.width}x${atlas.height}`}};
}
