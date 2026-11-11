// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {Position} from '../../types/geo';
import {createFuiEarthChinaGlass} from './fuiEarthChinaGlass';
import {FUI_HOLOGRAM_GLASS_OPTICS_GLSL} from './fuiHologramGlassOptics';

const vertexShader=/* glsl */`
  uniform float uFocusLift;
  uniform float uFocusHoverLift;
  uniform float uHover;
  uniform float uIntroReveal;
  varying vec3 vLocal;
  varying vec3 vWorldRadial;
  varying vec3 vWorldPosition;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  void main(){
    vec3 radial=normalize(position);
    vec3 east=normalize(cross(vec3(0.0,1.0,0.0),radial));
    vec3 north=normalize(cross(radial,east));
    float lift=(uFocusLift+uFocusHoverLift*clamp(uHover,0.0,1.0))*clamp(uIntroReveal,0.0,1.0);
    // The internal backing is a real second surface at the original globe
    // radius. Only the clear upper coat follows the shared focus lift.
    #ifdef FUI_GLASS_BASE
      vec4 worldPosition=modelMatrix*vec4(radial*2.0,1.0);
    #else
      vec4 worldPosition=modelMatrix*vec4(radial*(2.0+lift),1.0);
    #endif
    vLocal=radial;
    vWorldRadial=normalize(mat3(modelMatrix)*radial);
    vWorldPosition=worldPosition.xyz;
    vWorldEast=normalize(mat3(modelMatrix)*east);
    vWorldNorth=normalize(mat3(modelMatrix)*north);
    gl_Position=projectionMatrix*viewMatrix*worldPosition;
  }
`;

const fragmentShader=/* glsl */`
  #include <common>
  #include <cube_uv_reflection_fragment>
  ${FUI_HOLOGRAM_GLASS_OPTICS_GLSL}
  uniform sampler2D uChinaGlassEdges;
  uniform vec4 uChinaGlassBounds;
  uniform sampler2D uChinaGlassEnvironment;
  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform vec3 uLightDirection;
  uniform float uFade;
  uniform float uIntroReveal;
  uniform float uHover;
  uniform float uFocusLift;
  uniform float uFocusHoverLift;
  varying vec3 vLocal;
  varying vec3 vWorldRadial;
  varying vec3 vWorldPosition;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  void main(){
    vec3 local=normalize(vLocal);
    vec3 normal=normalize(vWorldRadial);
    vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
    float facing=dot(normal,viewDirection);
    float front=smoothstep(0.015,0.14,facing);
    float reveal=clamp(uIntroReveal,0.0,1.0);
    if(front*reveal*uFade<0.001)discard;

    vec2 geography=vec2(atan(-local.z,local.x),asin(clamp(local.y,-1.0,1.0)))*(180.0/PI);
    vec2 point=(geography-vec2(70.0,15.0))*12.0;
    vec2 edgeUv=(point-uChinaGlassBounds.xy)/uChinaGlassBounds.zw;
    vec2 distanceToEdge=texture2D(uChinaGlassEdges,edgeUv).rg*64.0;
    float interior=smoothstep(2.0,7.0,distanceToEdge.r);

    vec3 light=normalize(uLightDirection);
    float illumination=max(dot(normal,light),0.0);
    float hover=clamp(uHover,0.0,1.0);
    float thickness=max((uFocusLift+uFocusHoverLift*hover)*reveal,0.0);
    vec3 east=normalize(vWorldEast);
    vec3 north=normalize(vWorldNorth);
    vec2 lightAcross=vec2(dot(normalize(vWorldEast),light),dot(normalize(vWorldNorth),light));
    // Convert local spherical displacement to the geographic distance field's
    // 12-units-per-degree coordinates. Real thickness drives both optical path
    // and the lower projected boundary depth; these do not drift independently.
    float longitudeScale=max(sqrt(1.0-local.y*local.y),0.35);
    vec2 geographicScale=vec2(1.0/longitudeScale,1.0)*(12.0*180.0/(2.0*PI));
    vec2 fieldStep=vec2(1.4)/uChinaGlassBounds.zw;
    vec2 edgeGradient=vec2(
      texture2D(uChinaGlassEdges,edgeUv+vec2(fieldStep.x,0.0)).g-texture2D(uChinaGlassEdges,edgeUv-vec2(fieldStep.x,0.0)).g,
      texture2D(uChinaGlassEdges,edgeUv+vec2(0.0,fieldStep.y)).g-texture2D(uChinaGlassEdges,edgeUv-vec2(0.0,fieldStep.y)).g
    )*(64.0/2.8);
    vec3 bevelTangent=east*edgeGradient.x/longitudeScale+north*edgeGradient.y;
    vec3 bevelDirection=-bevelTangent*inversesqrt(max(dot(bevelTangent,bevelTangent),0.0001));
    float keyFacingLip=dot(bevelDirection,light);
    vec2 shadowOffset=lightAcross/max(dot(normal,light),0.35)*thickness*geographicScale*0.36;
    shadowOffset*=min(1.0,9.0/max(length(shadowOffset),0.001));
    float projectedDistance=texture2D(uChinaGlassEdges,edgeUv+shadowOffset/uChinaGlassBounds.zw).g*64.0;
    float shadowWidth=sqrt(1.44+pow(fwidth(projectedDistance),2.0)/12.0);
    float projectedShadow=fuiGlassProjectedShadow(projectedDistance,shadowWidth,keyFacingLip);
    float contactShadow=fuiGlassContactShadow(distanceToEdge.g);
    float seamShadow=max(projectedShadow,contactShadow)*interior;

    // Shared emitter hue is normalized before any glass response. No skin has
    // its own gain or pale fallback, and no pattern/terrain is stamped here.
    vec3 pigment=fuiGlassNormalizePigment(uColor);
    vec3 corePigment=fuiGlassNormalizePigment(uCoreColor);
    vec3 faceRadiance=fuiGlassFaceRadiance(pigment);
    float noV=clamp(facing,0.0,1.0);
    float fresnel=fuiGlassFresnel(noV);
    float seamAa=max(fwidth(distanceToEdge.g),0.65);
    float seamCore=1.0-smoothstep(0.08,0.08+seamAa,distanceToEdge.g);
    float edgeCore=exp(-pow(distanceToEdge.r/0.95,1.5));

    #ifdef FUI_GLASS_BASE
      // The backing supplies a deep foot and receives the short projection.
      // Most chromatic volume belongs to the raised glass, not a bright sheet
      // underneath it. Keep the combined front-view pigment energy stable.
      vec3 backing=fuiGlassBacking(faceRadiance,corePigment,illumination,seamShadow,distanceToEdge,interior,hover);
      gl_FragColor=vec4(backing,0.87*front*reveal*uFade);
      return;
    #endif

    // A tiny rolled lip changes the polish at the seam. There are no internal
    // extruded walls and no repeated luminous province network above/below.
    float bevelBand=(1.0-smoothstep(0.3,2.1,distanceToEdge.g))*interior;
    vec3 coatNormal=normalize(normal-bevelTangent*0.13*bevelBand);
    float raisedLipLight=smoothstep(-0.10,0.70,keyFacingLip);

    // Snell's transmitted ray supplies actual view-dependent path length.
    // Beer-Lambert attenuation is stronger away from the pigment wavelength;
    // the cover gains chromatic depth at grazing views instead of going gray.
    vec3 transmittedRay=refract(-viewDirection,normal,1.0/1.46);
    float opticalPath=thickness/max(-dot(transmittedRay,normal),0.32);
    vec3 transmittance=fuiGlassTransmittance(pigment,opticalPath);
    float absorptionAmount=1.0-average(transmittance);
    vec2 refractedOffset=vec2(dot(transmittedRay,east),dot(transmittedRay,north))*opticalPath*geographicScale;
    float refractedSeam=texture2D(uChinaGlassEdges,edgeUv+refractedOffset/uChinaGlassBounds.zw).g*64.0;
    // The refracted boundary removes a little light within the cover; its
    // actual dark line and projection are drawn only by the lower surface.
    float refractedShadow=exp(-0.5*pow(refractedSeam/1.4,2.0))*interior*0.035;
    // Put the blue volume in the actual raised cover while the lower backing
    // stays dark. Reflection/coverage remain independent of this redistribution.
    // A volume source centered in the upper half travels half the full optical
    // path; full-depth attenuation would push its color back onto the base.
    vec3 body=fuiGlassBody(faceRadiance,illumination,transmittance,absorptionAmount,refractedShadow);

    // Continuous polished coat: existing PMREM plus the existing world's small
    // key. This reflection spans provinces; it is not a moving screen sweep.
    vec3 reflected=reflect(-viewDirection,coatNormal);
    vec3 environment=textureCubeUV(uChinaGlassEnvironment,reflected,0.07).rgb;
    vec3 reflection=fuiGlassReflection(pigment,environment,fresnel,coatNormal,light,viewDirection,illumination);
    // A rounded raised face catches the key on its upper/light-facing lip;
    // the displaced shadow belongs to the lower backing, not a dark top groove.
    vec3 lip=fuiGlassLip(pigment,corePigment,faceRadiance,distanceToEdge,interior,seamCore,raisedLipLight);

    // Preserve the lower surface through the coat. Reflection is converted
    // from covered radiance into normal-blend RGB, so reducing opacity makes
    // glass clearer without also erasing its local specular highlight.
    float coverage=fuiGlassCoverage(absorptionAmount,fresnel,hover);
    vec3 coveredRadiance=body*coverage+reflection+lip;
    gl_FragColor=vec4(coveredRadiance/coverage,coverage*front*reveal*uFade);
  }
`;

/** A smooth spherical glass cap; environment ownership remains with EarthView. */
export function createFuiHologramGlassSurface(
  exterior:Position[][],
  regions:Position[][][],
  uniforms:Record<string,THREE.IUniform>,
  environment:THREE.Texture,
){
  // Only the shared geographic distance field is reused. Its skin palette is
  // deliberately not installed: pigment comes from the live parent uniforms.
  const {field}=createFuiEarthChinaGlass(exterior,regions,'glacier');
  const image=environment.image as {height?:number}|undefined;
  const height=image?.height??1024;
  // Match Three's WebGLProgram.generateCubeUVSize exactly, including the
  // extra packed tiles used by PMREM's roughest mip levels.
  const maxMip=Math.log2(height)-2;
  const glassUniforms={
      ...uniforms,
      uChinaGlassEdges:{value:field.texture},
      uChinaGlassBounds:{value:field.bounds},
      uChinaGlassEnvironment:{value:environment},
  };
  const cubeUvDefines={
      ENVMAP_TYPE_CUBE_UV:1,
      CUBEUV_TEXEL_WIDTH:1/(3*Math.max(2**maxMip,7*16)),
      CUBEUV_TEXEL_HEIGHT:1/height,
      CUBEUV_MAX_MIP:maxMip.toFixed(1),
  };
  const createMaterial=(base=false)=>{
    const result=new THREE.ShaderMaterial({
      uniforms:{...glassUniforms},
      defines:base?{...cubeUvDefines,FUI_GLASS_BASE:1}:{...cubeUvDefines},
      vertexShader,fragmentShader,
      transparent:true,depthWrite:false,depthTest:false,
      side:THREE.DoubleSide,blending:THREE.NormalBlending,
    });
    result.name=base?'hologram-China-glass-interior':'hologram-China-smooth-glass';
    result.forceSinglePass=true;
    result.userData.introLayer='earth';
    return result;
  };
  const material=createMaterial(),baseMaterial=createMaterial(true);
  return{
    material,baseMaterial,
    dispose:()=>field.texture.dispose(),
    diagnostics:{surface:'glass' as const,provinceBoundaries:regions.length,volume:'dual-surface' as const,ior:1.46},
  };
}
