// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

/** Linear radiance of the original raised China glass cap. Geometry adapters
 * supply their own field coordinates, true/optical normals and optical path.
 * Neither exposure, color-space conversion nor a renderer belongs in this core.
 * Keep the arithmetic order of the Earth cap when sharing it with flat maps. */
export const FUI_HOLOGRAM_GLASS_OPTICS_GLSL=/*glsl*/`
  vec3 fuiGlassNormalizePigment(vec3 color){
    return color/max(max3(color),0.001);
  }
  vec3 fuiGlassFaceRadiance(vec3 pigment){
    return pow(pigment,vec3(1.15));
  }
  float fuiGlassFresnel(float noV){
    return 0.035+0.965*pow(1.0-noV,5.0);
  }
  float fuiGlassProjectedShadow(float projectedDistance,float shadowWidth,float keyFacingLip){
    float projectedShadow=(1.2/shadowWidth)*exp(-0.5*pow(projectedDistance/shadowWidth,2.0))*0.28;
    projectedShadow*=smoothstep(0.05,0.60,keyFacingLip);
    return projectedShadow;
  }
  float fuiGlassContactShadow(float distance){
    return exp(-distance/0.75)*0.07;
  }
  vec3 fuiGlassBacking(vec3 faceRadiance,vec3 corePigment,float illumination,float seamShadow,vec2 distanceToEdge,float interior,float hover){
    vec3 backing=faceRadiance*(0.13+0.09*pow(illumination,0.85));
    backing*=1.0-seamShadow;
    float boundaryShoulder=exp(-distanceToEdge.g/1.8)*interior;
    backing+=mix(faceRadiance,corePigment,0.06)*boundaryShoulder*0.055;
    backing+=faceRadiance*exp(-distanceToEdge.r/6.0)*0.045;
    backing*=1.0+hover*0.06;
    return backing;
  }
  vec3 fuiGlassTransmittance(vec3 pigment,float opticalPath){
    vec3 absorption=vec3(1.65)+(vec3(1.0)-pigment)*13.0;
    return exp(-absorption*opticalPath);
  }
  vec3 fuiGlassBody(vec3 faceRadiance,float illumination,vec3 transmittance,float absorptionAmount,float refractedShadow){
    vec3 body=faceRadiance*(0.42+0.20*pow(illumination,0.85))*sqrt(transmittance);
    body+=faceRadiance*absorptionAmount*0.14;
    body*=1.0-refractedShadow;
    return body;
  }
  vec3 fuiGlassReflection(vec3 pigment,vec3 environment,float fresnel,vec3 coatNormal,vec3 light,vec3 viewDirection,float illumination){
    vec3 reflectionTint=mix(pow(pigment,vec3(0.65)),vec3(1.0),0.52);
    vec3 halfway=normalize(light+viewDirection);
    float coatAlignment=max(dot(coatNormal,halfway),0.0);
    float keyReflection=pow(coatAlignment,36.0)*illumination;
    float keyShoulder=pow(coatAlignment,20.0)*illumination;
    vec3 reflection=environment*reflectionTint*(0.20+0.80*fresnel);
    reflection+=reflectionTint*(keyReflection*0.95+keyShoulder*0.075);
    reflection=min(reflection,vec3(0.90));
    return reflection;
  }
  vec3 fuiGlassLip(vec3 pigment,vec3 corePigment,vec3 faceRadiance,vec2 distanceToEdge,float interior,float seamCore,float raisedLipLight){
    float edgeCore=exp(-pow(distanceToEdge.r/0.95,1.5));
    vec3 lip=mix(pigment,corePigment,0.08)*seamCore*0.065*interior;
    lip+=mix(pigment,corePigment,0.16)*exp(-distanceToEdge.g/1.5)*raisedLipLight*0.30*interior;
    lip+=pigment*exp(-distanceToEdge.g/3.5)*interior*0.015;
    lip+=mix(pigment,corePigment,0.20)*edgeCore*0.12;
    lip+=faceRadiance*exp(-distanceToEdge.r/5.0)*0.075;
    return lip;
  }
  float fuiGlassCoverage(float absorptionAmount,float fresnel,float hover){
    return clamp(0.26+absorptionAmount*0.30+fresnel*0.32+hover*0.015,0.26,0.78);
  }
`;
