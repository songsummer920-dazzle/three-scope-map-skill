// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import {createFuiHologramPigment,isFuiThemeColorId,resolveFuiEarthThemeId,type FuiEarthSkinId} from './fuiEarthTheme';
import type {FuiTerrainState} from './fuiMapTerrain';
import {FUI_HOLOGRAM_GLASS_OPTICS_GLSL} from './fuiHologramGlassOptics';
import {FUI_MAP_CAP_OPTICS_GLSL,createFuiMapCapOpticsUniforms} from './fuiMapCapOptics';

// Only the smooth destination uses this pair. Reuse Three's installed ACES
// implementation locally; the other map materials and global renderer keep
// their current output pipeline. Per-layer mapping is not whole-frame HDR/Bloom.
const toneMappingChunk=THREE.ShaderChunk.tonemapping_pars_fragment;
const acesStart=toneMappingChunk.indexOf('vec3 RRTAndODTFit'),acesEnd=toneMappingChunk.indexOf('const mat3 LINEAR_REC2020_TO_LINEAR_SRGB');
if(acesStart<0||acesEnd<=acesStart)throw new Error('Smooth glass requires the installed Three.js RRT/ACES tone-mapping chunk; its layout has changed.');
const localAces=toneMappingChunk.slice(acesStart,acesEnd)
  .replaceAll('RRTAndODTFit','fuiGlassRRTAndODTFit').replaceAll('ACESFilmicToneMapping','fuiGlassACES').replaceAll('toneMappingExposure','uGlassExposure');
const vertexShader=/*glsl*/`
  uniform float uEngravingDepth;
  varying vec2 vMapPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  varying vec2 vTangentScale;
  varying float vGlassWorldScale;
  void main(){
    vMapPosition=position.xy;
    vec3 localPosition=position;
    #ifdef FUI_MAP_GLASS_BACKING
      localPosition.z-=uEngravingDepth;
    #endif
    vec4 world=modelMatrix*vec4(localPosition,1.0);
    vWorldPosition=world.xyz;
    vWorldNormal=normalize(mat3(modelMatrix)*vec3(0.0,0.0,1.0));
    vWorldEast=normalize(mat3(modelMatrix)*vec3(1.0,0.0,0.0));
    vWorldNorth=normalize(mat3(modelMatrix)*vec3(0.0,1.0,0.0));
    float normalScale=length(modelMatrix[2].xyz);
    vGlassWorldScale=normalScale;
    vTangentScale=vec2(normalScale/max(length(modelMatrix[0].xyz),.0001),normalScale/max(length(modelMatrix[1].xyz),.0001));
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;

const fragmentShader=/*glsl*/`
  #include <common>
  #include <cube_uv_reflection_fragment>
  uniform sampler2D uFuiTerrainEdges;
  uniform vec4 uFuiTerrainBounds;
  uniform vec4 uFuiGeoTransform;
  uniform sampler2D uGlassEnvironment;
  uniform float uHasEnvironment;
  uniform vec3 uPigment;
  uniform vec3 uCorePigment;
  uniform float uSelection;
  uniform float uOpacity;
  uniform float uGlassDepth;
  uniform float uEngravingDepth;
  uniform float uMapScale;
  uniform float uGlassExposure;
  uniform float uGlassLinearOutput;
  uniform float uGlassBackdropStrength;
  uniform float uBoundaryImageStrength;
  uniform vec3 uGlassLightDirection;
  uniform vec3 uGlassLightPosition;
  uniform float uGlassLightReferenceDistance;
  uniform sampler2D uGlassBackdrop;
  uniform float uHasGlassBackdrop;
  uniform vec2 uGlassBackdropViewport;
  uniform mat4 uGlassBackdropProjection;
  varying vec2 vMapPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  varying vec2 vTangentScale;
  varying float vGlassWorldScale;
  ${FUI_HOLOGRAM_GLASS_OPTICS_GLSL}
  ${FUI_MAP_CAP_OPTICS_GLSL}
  ${localAces}
  vec3 fuiTransmittedBackdrop(vec3 ray,vec3 normal,float depth,out float valid){
    valid=0.0;
    if(uHasGlassBackdrop<.5)return vec3(0.0);
    vec3 exitPoint=vWorldPosition+ray*(max(depth,0.0)*vGlassWorldScale/max(-dot(ray,normal),.32));
    vec4 entryClip=uGlassBackdropProjection*vec4(vWorldPosition,1.0);
    vec4 exitClip=uGlassBackdropProjection*vec4(exitPoint,1.0);
    if(entryClip.w<=.0001||exitClip.w<=.0001)return vec3(0.0);
    vec2 offset=(exitClip.xy/exitClip.w-entryClip.xy/entryClip.w)*.5;
    vec2 uv=gl_FragCoord.xy/uGlassBackdropViewport+offset;
    if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))return vec3(0.0);
    valid=1.0;
    // Preserve framebuffer bytes in RGBA8: WebGL rejects a linear default
    // framebuffer copy into SRGB8_ALPHA8. Decode its displayed sRGB values
    // explicitly before optical absorption and this material's ACES output.
    vec3 encoded=texture2D(uGlassBackdrop,uv).rgb;
    return mix(encoded/12.92,pow((encoded+.055)/1.055,vec3(2.4)),step(vec3(.04045),encoded));
  }
  void main(){
    vec2 uv=(vMapPosition-uFuiTerrainBounds.xy)/uFuiTerrainBounds.zw;
    vec2 distanceToEdge=texture2D(uFuiTerrainEdges,uv).rg*64.0;
    float interior=smoothstep(2.0,7.0,distanceToEdge.r);
    vec3 geometryNormal=normalize(vWorldNormal);
    vec3 east=normalize(vWorldEast),north=normalize(vWorldNorth);
    // Match the globe's continuous optical normal and reference light while
    // retaining the real planar normal for Snell exit and slab projection.
    vec3 normal,light;
    fuiMapCapOptics(vMapPosition,uFuiGeoTransform,east,north,geometryNormal,normal,light);
    vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
    float noV=clamp(dot(normal,viewDirection),0.0,1.0);
    vec3 transmitted=refract(-viewDirection,geometryNormal,1.0/1.46);
    float opticalDepth=max(uGlassDepth,0.0)*(.07/32.0);
    float opticalPath=opticalDepth/max(-dot(transmitted,geometryNormal),.32);
    vec3 pigment=fuiGlassNormalizePigment(uPigment);
    vec3 corePigment=fuiGlassNormalizePigment(uCorePigment);
    vec3 transmittance=fuiGlassTransmittance(pigment,opticalPath);
    float fresnel=fuiGlassFresnel(noV);
    float illumination=max(dot(normal,light),0.0);
    float selected=clamp(uSelection,0.0,1.0);
    vec2 stepUv=vec2(1.4)/uFuiTerrainBounds.zw;
    vec2 gradient=vec2(
      texture2D(uFuiTerrainEdges,uv+vec2(stepUv.x,0.0)).g-texture2D(uFuiTerrainEdges,uv-vec2(stepUv.x,0.0)).g,
      texture2D(uFuiTerrainEdges,uv+vec2(0.0,stepUv.y)).g-texture2D(uFuiTerrainEdges,uv-vec2(0.0,stepUv.y)).g
    )*(64.0/2.8);
    vec3 tangent=east*gradient.x+north*gradient.y;
    vec3 bevelDirection=-tangent*inversesqrt(max(dot(tangent,tangent),.0001));
    float keyFacing=dot(bevelDirection,light);
    float bevelBand=(1.0-smoothstep(.3,2.1,distanceToEdge.g))*interior;
    vec3 coatNormal=normalize(normal-tangent*.13*bevelBand);

    // The lower province projection stays narrow and directional. An inward
    // national black channel would turn this convex glass into a recessed map.
    float engravingDepth=max(uEngravingDepth,0.0);
    vec2 lightAcross=vec2(dot(east,light),dot(north,light));
    vec2 shadowOffset=lightAcross/max(dot(geometryNormal,light),.35)*engravingDepth*vTangentScale;
    // Convert the reference's short angular reach to this projection, then
    // bound it in native units so a city scope cannot acquire a huge shadow.
    float shadowLimit=clamp(abs(uMapScale)*.75,3.0,12.0);
    shadowOffset*=min(1.0,shadowLimit/max(length(shadowOffset),.001));
    float projected=texture2D(uFuiTerrainEdges,uv+shadowOffset/uFuiTerrainBounds.zw).g*64.0;
    float width=sqrt(1.44+pow(fwidth(projected),2.0)/12.0);
    float projection=fuiGlassProjectedShadow(projected,width,keyFacing);
    float contact=fuiGlassContactShadow(distanceToEdge.g);
    vec3 faceRadiance=fuiGlassFaceRadiance(pigment);
    float seamShadow=max(projection,contact)*interior;
    float backingVisibility=1.0-seamShadow;
    vec3 backing=fuiGlassBacking(faceRadiance,corePigment,illumination,seamShadow,distanceToEdge,interior,selected);
    #ifdef FUI_MAP_GLASS_BACKING
      // Real light from the basemap passes through the same pigmented body.
      // Refraction follows the actual slab depth, IOR and projective camera;
      // it does not move the mesh, outline or geographic hit target.
      if(uGlassBackdropStrength>0.0){
        float backdropValid;
        vec3 backdrop=fuiTransmittedBackdrop(transmitted,geometryNormal,max(uGlassDepth-uEngravingDepth,0.0),backdropValid);
        float transmittedCoverage=backdropValid*average(transmittance)*(1.0-fresnel)*clamp(uGlassBackdropStrength,0.0,1.0);
        backing=mix(backing,backdrop*transmittance*backingVisibility,transmittedCoverage);
      }
      // A single attenuated image of the upper provincial lip lives inside
      // the glass, below this real backing. Its virtual plane is inside the
      // slab and separated from the coat's bloom. Follow the refracted view ray
      // in native map units, so it separates while orbiting and registers at
      // normal incidence. The country rim must not acquire a second contour.
      float imageDepth=min(engravingDepth*3.0,max(uGlassDepth-engravingDepth,0.0));
      float imagePath=imageDepth/max(-dot(transmitted,geometryNormal),.32);
      vec2 imageOffset=vec2(dot(transmitted,east),dot(transmitted,north))*imagePath*vTangentScale;
      vec2 imageDistance=texture2D(uFuiTerrainEdges,uv+imageOffset/uFuiTerrainBounds.zw).rg*64.0;
      float imageInterior=interior*smoothstep(2.0,7.0,imageDistance.r);
      float imageWidth=sqrt(.36+pow(fwidth(imageDistance.g),2.0)/12.0);
      float imageCore=(.60/imageWidth)*exp(-.5*pow(imageDistance.g/imageWidth,2.0));
      float imageShoulder=exp(-imageDistance.g/1.65)*.01;
      vec3 imageTint=mix(faceRadiance,corePigment,.12)*transmittance*transmittance;
      float imageVisibility=(.60+.12*(1.0-noV))*(.75+.25*illumination);
      backing+=imageTint*(imageCore*imageVisibility+imageShoulder)*imageInterior*clamp(uBoundaryImageStrength,0.0,1.0);
      // Actual regional surface just below the coat: its projection moves
      // with geometry/view parallax, rather than being precomposed on top.
      if(uGlassLinearOutput>.5){gl_FragColor=vec4(backing,.87*uOpacity);return;}
      gl_FragColor=vec4(fuiGlassACES(max(backing,vec3(0.0))),.87*uOpacity);
      #include <colorspace_fragment>
      return;
    #endif

    // Match the globe's blue volume and upper-half optical path. The map's
    // actual z12–44 slab stays in the existing country body, not a new plane.
    float absorption=1.0-average(transmittance);
    float engravingPath=engravingDepth/max(-dot(transmitted,geometryNormal),.32);
    vec2 refractedOffset=vec2(dot(transmitted,east),dot(transmitted,north))*engravingPath*vTangentScale;
    float refractedBoundary=texture2D(uFuiTerrainEdges,uv+refractedOffset/uFuiTerrainBounds.zw).g*64.0;
    float refractedShadow=.035*exp(-.5*pow(refractedBoundary/1.4,2.0))*interior;
    vec3 body=fuiGlassBody(faceRadiance,illumination,transmittance,absorption,refractedShadow);
    float coverage=fuiGlassCoverage(absorption,fresnel,selected);

    vec3 reflected=reflect(-viewDirection,coatNormal);
    vec3 environment=vec3(0.0);
    if(uHasEnvironment>.5)environment=textureCubeUV(uGlassEnvironment,fuiMapCapEnvironment(reflected,east,north,geometryNormal),.07).rgb;
    vec3 reflection=fuiGlassReflection(pigment,environment,fresnel,coatNormal,light,viewDirection,illumination);

    float aa=max(fwidth(distanceToEdge.g),.65);
    float seam=1.0-smoothstep(.08,.08+aa,distanceToEdge.g);
    vec3 lip=fuiGlassLip(pigment,corePigment,faceRadiance,distanceToEdge,interior,seam,smoothstep(-.10,.70,keyFacing));
    // Selection belongs to the raised coat only, at its existing covered
    // energy. Dividing by coverage supplies straight RGB for NormalBlending;
    // premultiplying it again would darken the volume and the selected face.
    vec3 coveredRadiance=body*coverage+reflection+lip;
    coveredRadiance+=faceRadiance*selected*(.36+.10*exp(-distanceToEdge.g/4.0));
    vec3 straightColor=max(coveredRadiance/coverage,vec3(0.0));
    if(uGlassLinearOutput>.5){gl_FragColor=vec4(straightColor,coverage*uOpacity);return;}
    gl_FragColor=vec4(fuiGlassACES(straightColor),coverage*uOpacity);
    #include <colorspace_fragment>
  }
`;

const pigments=new Map<FuiEarthSkinId,{body:THREE.Color;core:THREE.Color}>();
function glassPigments(skin:FuiEarthSkinId){
  const id=resolveFuiEarthThemeId(skin);
  let result=pigments.get(id);if(result)return result;
  const body=createFuiHologramPigment(id);
  body.multiplyScalar(1/Math.max(body.r,body.g,body.b,.001));
  const core=body.clone().lerp(new THREE.Color(1,1,1),.30);
  result={body,core};
  if(isFuiThemeColorId(id)){
    const customKeys=[...pigments.keys()].filter(isFuiThemeColorId);
    if(customKeys.length>=64)pigments.delete(customKeys[0]);
  }
  pigments.set(id,result);return result;
}

export function createFuiMapHologramSurface(skin:FuiEarthSkinId,terrain:FuiTerrainState,environment?:THREE.Texture){
  const height=(environment?.image as {height?:number}|undefined)?.height??1024;
  const maxMip=Math.log2(height)-2,color=glassPigments(skin);
  const material=new THREE.ShaderMaterial({
    uniforms:{...terrain.uniforms,...createFuiMapCapOpticsUniforms(),uGlassEnvironment:{value:environment??null},uHasEnvironment:{value:environment?1:0},
      uPigment:{value:color.body.clone()},uCorePigment:{value:color.core.clone()},uSelection:{value:0},uOpacity:{value:1},
      uGlassDepth:{value:32},uEngravingDepth:{value:2.6},uMapScale:{value:1},uGlassExposure:{value:1.19},uGlassLinearOutput:{value:0},uGlassBackdropStrength:{value:0},uBoundaryImageStrength:{value:1},
      uGlassLightDirection:{value:new THREE.Vector3(-.60,.48,.64).normalize()},
      uGlassLightPosition:{value:new THREE.Vector3()},uGlassLightReferenceDistance:{value:0},
      uGlassBackdrop:{value:terrain.uniforms.uRelief.value},uHasGlassBackdrop:{value:0},
      uGlassBackdropViewport:{value:new THREE.Vector2(1,1)},uGlassBackdropProjection:{value:new THREE.Matrix4()}},
    defines:{ENVMAP_TYPE_CUBE_UV:1,CUBEUV_TEXEL_WIDTH:1/(3*Math.max(2**maxMip,7*16)),CUBEUV_TEXEL_HEIGHT:1/height,CUBEUV_MAX_MIP:maxMip.toFixed(1)},
    vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,side:THREE.FrontSide,blending:THREE.NormalBlending,toneMapped:false,
  });
  material.name='fui-hologram-map-smooth-glass';
  material.userData.fuiGeoSurface=true;material.userData.fuiOpacityUniform=true;
  material.userData.fuiGlassLayer='coat';material.forceSinglePass=true;
  material.userData.fuiGlassBackdropFallback=terrain.uniforms.uRelief.value;
  return material;
}

/** Geometry and mesh.z match the coat. The vertex shader alone lowers this
 * face by uEngravingDepth; parent owns both materials and the shared PMREM. */
export function createFuiMapHologramBacking(coat:THREE.ShaderMaterial){
  if(!coat.uniforms.uEngravingDepth||!coat.uniforms.uPigment)throw new Error('A smooth-glass coat is required for its backing');
  const material=new THREE.ShaderMaterial({
    uniforms:{...coat.uniforms},defines:{...coat.defines,FUI_MAP_GLASS_BACKING:1},
    vertexShader,fragmentShader,transparent:true,depthWrite:true,depthTest:true,side:THREE.FrontSide,blending:THREE.NormalBlending,toneMapped:false,
  });
  material.name='fui-hologram-map-glass-backing';material.userData.fuiGeoSurface=true;material.userData.fuiOpacityUniform=true;
  material.userData.fuiGlassBackdropFallback=coat.userData.fuiGlassBackdropFallback;
  material.userData.fuiGlassLayer='backing';material.forceSinglePass=true;return material;
}

/** A pair borrows its backdrop just like its edge atlas and studio PMREM. */
export function setFuiMapHologramBackdrop(material:THREE.ShaderMaterial,texture:THREE.Texture|undefined,width:number,height:number,projection:THREE.Matrix4){
  material.uniforms.uGlassBackdrop.value=texture??material.userData.fuiGlassBackdropFallback;
  material.uniforms.uHasGlassBackdrop.value=texture?1:0;
  material.uniforms.uGlassBackdropViewport.value.set(Math.max(1,width),Math.max(1,height));
  material.uniforms.uGlassBackdropProjection.value.copy(projection);
}

export function updateFuiMapHologramSurface(material:THREE.ShaderMaterial,skin:FuiEarthSkinId,selection=0){
  const color=glassPigments(skin);
  material.uniforms.uPigment.value.copy(color.body);material.uniforms.uCorePigment.value.copy(color.core);
  if(material.userData.fuiGlassLayer!=='backing')material.uniforms.uSelection.value=selection;
  material.uniforms.uOpacity.value=material.opacity;
  // Intrinsic glass coverage stays transparent even after the entrance ends.
  material.transparent=true;
}
