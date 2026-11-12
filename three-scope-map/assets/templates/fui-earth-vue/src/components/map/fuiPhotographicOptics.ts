// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Photographic optical baseline recovered from the preserved 2026-10-16 build.
// One pigment response and one material are shared by every requested hue.
import * as THREE from 'three';
import {createFuiEarthTheme,getFuiSkinMaterial,getFuiThemePrimary,type FuiEarthSkinId,type FuiSkinMaterial} from './fuiEarthTheme';
/** Approved entity geometry/effect scales. Keep runtime work independent
 * from this visual profile; the archived renderer is the comparison baseline. */
export const FUI_ENTITY_VISUAL_BASELINE=Object.freeze({
  id:'entity-20261016-cap-off',chinaRadialScale:1,nodeCoreScale:1,
  nodeOpacity:1,trackOpacity:1,rippleOpacity:1,rippleScale:1,contourFlow:1,
});
type PhotographicTheme=ReturnType<typeof createFuiEarthTheme>;
type ColorRole={ [K in keyof PhotographicTheme]:PhotographicTheme[K] extends THREE.Color?K:never }[keyof PhotographicTheme];
const referencePrimary=new THREE.Color('#ffb31c');
const opticalPigments={
  "outline": "#dca04e",
  "highlight": "#ffe0a7",
  "worldLandDark": "#0b0b0a",
  "worldLandLight": "#49453e",
  "worldOutline": "#76664d",
  "earthTint": "#a69b8d",
  "earthGrade": "#d0c9bc",
  "earthShadowFloor": "#13181f",
  "earthTopLight": "#8c9198",
  "earthMidTone": "#303238",
  "earthBottomShade": "#10151b",
  "oceanHighlight": "#c8b48c",
  "earthCityLight": "#ffa528",
  "earthCoastGlow": "#d99136",
  "chinaSurface": "#d4a060",
  "chinaInnerOutline": "#edb96e",
  "chinaOuterGlow": "#e5a144",
  "chinaRidge": "#ffe2b3",
  "chinaSweep": "#c28b46",
  "chinaInnerGlow": "#d8a461",
  "chinaCityLight": "#ffc878",
  "chinaSlopeLight": "#e6b779",
  "chinaFlatTone": "#70502e",
  "chinaPlainTone": "#9f733f",
  "chinaPlateauTone": "#cfa26c",
  "chinaDrylandTone": "#ad8149",
  "chinaForestTone": "#6b5439",
  "chinaNortheastTone": "#947345",
  "wallBottom": "#100f0b",
  "wallMiddle": "#544329",
  "wallTop": "#caa773",
  "wallEdge": "#dabb81",
  "bottomEdge": "#977d48",
  "flyTrack": "#b57b32",
  "flyTrail": "#eea447",
  "flyHead": "#ffe4b4",
  "nodeHub": "#ffe0a1",
  "node": "#d3a75e",
  "ringHub": "#d9b679",
  "ring": "#9c7943",
  "atmosphere": "#ffad4d",
  "outerAtmosphere": "#ba6523",
  "atmosphereSweep": "#d4b279",
  "rimCore": "#ffe8b3",
  "sweep": "#c4a36e",
  "sweepSurface": "#a18b69",
  "grid": "#6a5d42",
  "gridDot": "#b29660",
  "gridDotSweep": "#d5ba80",
  "landGrid": "#60543c",
  "landGridDot": "#968058",
  "chinaFocus": "#79603b",
  "flowTail": "#795e30",
  "flowHead": "#ffdfa0"
} as const;
const emissionRoles=new Set(['outline','highlight','chinaInnerOutline','chinaOuterGlow','earthCityLight','earthCoastGlow','chinaSweep','chinaInnerGlow','chinaCityLight','flyTrack','flyTrail','flyHead','nodeHub','node','ringHub','ring','atmosphere','outerAtmosphere','atmosphereSweep','rimCore','sweep','sweepSurface','grid','gridDot','gridDotSweep','landGrid','landGridDot','chinaFocus','flowTail','flowHead','wallBottom','wallMiddle','wallTop','wallEdge','bottomEdge']);
const smooth=(a:number,b:number,x:number)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
/** The adapter owns only its fresh surface theme. Polar treatment, shared
 * factories/caches, hologram/map palettes and public primary remain independent. */
export function applyFuiPhotographicTheme(theme:PhotographicTheme,skin:FuiEarthSkinId):void{
  if(skin==='original')return;
  const target={h:0,s:0,l:0},reference={h:0,s:0,l:0};
  // Derive pigment from the requested primary, before the shared emitter
  // budget scales it. HSL of an energy-scaled linear color changes saturation.
  const sourcePrimary=new THREE.Color(getFuiThemePrimary(skin));
  sourcePrimary.getHSL(target,THREE.SRGBColorSpace);referencePrimary.getHSL(reference,THREE.SRGBColorSpace);
  const peak=Math.max(sourcePrimary.r,sourcePrimary.g,sourcePrimary.b);
  const pigment=peak>.000001?sourcePrimary.clone().multiplyScalar(1/peak):new THREE.Color(0,0,0);
  const energy=pigment.r*.2126+pigment.g*.7152+pigment.b*.0722;
  const chromaticity=target.s;
  const reflectanceChroma=chromaticity*smooth(.20,.50,energy);
  for(const [role,hex] of Object.entries(opticalPigments)){
    const color=new THREE.Color(hex),hsl={h:0,s:0,l:0};color.getHSL(hsl,THREE.SRGBColorSpace);
    const warmPigment=hsl.s>.08&&Math.min(Math.abs(hsl.h-.10),1-Math.abs(hsl.h-.10))<.22;
    if(emissionRoles.has(role)||warmPigment){
      hsl.h=THREE.MathUtils.euclideanModulo(hsl.h+target.h-reference.h,1);
      hsl.s*=emissionRoles.has(role)?chromaticity:reflectanceChroma;
    }else hsl.s*=chromaticity;
    color.setHSL(hsl.h,hsl.s,hsl.l,THREE.SRGBColorSpace);
    (theme[role as ColorRole] as THREE.Color).copy(color);
  }
}
/** Exact early photographic response, uniformly applied across hues. */
export function getFuiPhotographicMaterial(skin:FuiEarthSkinId):FuiSkinMaterial{
  const base={...getFuiSkinMaterial(skin)};
  if(skin==='original')return base;
  return{...base,exposure:1.13,bloom:.28,bloomRadius:.36,bloomThreshold:.93,
    roughness:.43,metalness:.72,surfaceGain:1.16,albedoTint:.65,
    oceanShininess:126,oceanReflection:.8,oceanDarken:.38,cityGain:1.75,
    atmosphereGain:2.6,edgeGain:1.15,reliefContrast:1.34,innerGlowGain:.35,
    chinaAmbient:.01,worldGain:1,oceanBase:.06};
}
