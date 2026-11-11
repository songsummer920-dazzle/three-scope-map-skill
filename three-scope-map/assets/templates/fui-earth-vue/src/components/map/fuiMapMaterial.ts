// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import { createFuiEarthTheme, getFuiHudPalette, getFuiThemePrimary, isFuiAchromaticColor, isFuiThemeColorId, resolveFuiEarthThemeId, type FuiEarthSkinId, type FuiHudPalette } from './fuiEarthTheme';
import {applyFuiPhotographicTheme} from './fuiPhotographicOptics';
export type FuiMapPaletteFamily='shared'|'entity';
const palettes=new Map<string,ReturnType<typeof buildPalette>>();
/** Move only the pigment hue into the matching optical role. Retain the
 * destination's saturation and linear-energy/channel ceilings, so geographic
 * glass keeps its existing depth/contrast instead of acquiring a metal coat. */
function opticalHue(source:THREE.Color,budget:THREE.Color){
  const sourceHsl=source.getHSL({h:0,s:0,l:0});
  const energy=(c:THREE.Color)=>c.r*.2126+c.g*.7152+c.b*.0722;
  const peak=(c:THREE.Color)=>Math.max(c.r,c.g,c.b);
  // A normalized white fraction survives energy scaling; HSL saturation does
  // not when the old role crosses half lightness (notably the polished rim).
  const white=Math.min(budget.r,budget.g,budget.b)/Math.max(peak(budget),1e-12);
  const color=sourceHsl.s<1e-8?new THREE.Color(1,1,1):new THREE.Color().setHSL(sourceHsl.h,1,.5).lerp(new THREE.Color(1,1,1),white);
  return color.multiplyScalar(Math.min(energy(budget)/Math.max(energy(color),1e-12),peak(budget)/Math.max(peak(color),1e-12)));
}
function buildPalette(skin:FuiEarthSkinId){
  const theme=createFuiEarthTheme(skin);
  // One chromatic glass recipe for every skin; reserve neutral light for the
  // polished silhouette rather than bleaching the full vertical wall.
  const pigment=theme.primary.clone();
  pigment.multiplyScalar(1/Math.max(pigment.r,pigment.g,pigment.b,.001));
  // The same absorption curve deepens the dominant theme hue through the
  // body, instead of letting neutral reflection turn its middle gray.
  const bodyPigment=new THREE.Color().setRGB(pigment.r**2.4,pigment.g**2.4,pigment.b**2.4);
  const result={
    accent:theme.wallEdge.clone(),
    sideTop:pigment.clone().multiplyScalar(.94),
    sideMid:bodyPigment.multiplyScalar(.58).lerp(new THREE.Color('#07101c'),.08),
    sideBottom:pigment.clone().multiplyScalar(.004).add(new THREE.Color('#020408')),
    outer:pigment.clone().lerp(new THREE.Color('#d5edff'),.18),
    inner:pigment.clone().multiplyScalar(.74),
    bottom:theme.bottomEdge.clone(),
    base:new THREE.Color('#080c10'),
  };
  if(isFuiThemeColorId(skin)&&isFuiAchromaticColor(skin))for(const color of Object.values(result)){
    const gray=color.r*.2126+color.g*.7152+color.b*.0722;color.setRGB(gray,gray,gray);
  }
  return result;
}
export function getFuiMapMaterialPalette(skin:FuiEarthSkinId,family:FuiMapPaletteFamily='shared'){
  const id=resolveFuiEarthThemeId(skin);
  const key=family==='entity'&&id!=='original'?`${family}:${id}`:id;
  let result=palettes.get(key);
  if(!result){
    result=buildPalette(id);
    if(family==='entity'&&id!=='original'){
      const optical=createFuiEarthTheme(id);applyFuiPhotographicTheme(optical,id);
      const roles={accent:optical.chinaSurface,sideTop:optical.wallTop,sideMid:optical.wallMiddle,
        sideBottom:optical.wallBottom,outer:optical.chinaOuterGlow,inner:optical.chinaInnerOutline,bottom:optical.bottomEdge};
      for(const role of Object.keys(roles) as (keyof typeof roles)[])result[role]=opticalHue(roles[role],result[role]);
    }
    if(isFuiThemeColorId(id)){
      const customKeys=[...palettes.keys()].filter(value=>value.startsWith('entity:#')||isFuiThemeColorId(value));
      if(customKeys.length>=64)palettes.delete(customKeys[0]);
      for(const color of Object.values(result))Object.freeze(color);
      Object.freeze(result);
    }
    palettes.set(key,result);
  }
  // Immutable custom tokens are safe to share without allocating nine Colors
  // for every region on every animation frame. Clone a token before editing.
  return result;
}

const outerContours=new Map<string,THREE.Color>();
export function getFuiMapOuterContourColor(skin:FuiEarthSkinId,family:FuiMapPaletteFamily='shared'){
  const id=resolveFuiEarthThemeId(skin),key=family==='entity'&&id!=='original'?`entity:${id}`:id;
  let color=outerContours.get(key);if(color)return color;
  color=getFuiMapMaterialPalette(id).outer.clone().lerp(new THREE.Color('#eff8ff'),.32);
  if(family==='entity'&&id!=='original'){
    const optical=createFuiEarthTheme(id);applyFuiPhotographicTheme(optical,id);
    color=opticalHue(optical.chinaOuterGlow,color);
  }
  if(isFuiThemeColorId(id)){
    const custom=[...outerContours.keys()].filter(value=>value.startsWith('entity:#')||isFuiThemeColorId(value));if(custom.length>=64)outerContours.delete(custom[0]);
  }
  Object.freeze(color);outerContours.set(key,color);return color;
}

const entityHudPalettes=new Map<FuiEarthSkinId,FuiHudPalette>();
/** Photographic Earth's existing #d08a32 instrument ink, rotated from its
 * #ffb31c primary. Each native map HUD role retains its own brightness. */
export function getFuiMapHudPalette(skin:FuiEarthSkinId,family:FuiMapPaletteFamily='shared'):FuiHudPalette{
  const id=resolveFuiEarthThemeId(skin),base=getFuiHudPalette(id);
  if(family!=='entity'||id==='original')return base;
  let result=entityHudPalettes.get(id);if(result)return result;
  const primary=new THREE.Color(getFuiThemePrimary(id)).getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace);
  const seed=new THREE.Color('#ffb31c').getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace);
  const ink=new THREE.Color('#d08a32').getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace);
  const source=new THREE.Color().setHSL(primary.h+ink.h-seed.h,primary.s*ink.s,
    Math.min(1,Math.max(.08,primary.l*ink.l/seed.l)),THREE.SRGBColorSpace);
  result=Object.fromEntries(Object.entries(base).map(([role,color])=>{
    // THREE.Color stores RGB only. Preserve transparent/alpha-bearing CSS
    // roles verbatim instead of turning an absent underlay into opaque ink.
    const css=color.trim().toLowerCase();
    return [role,css==='transparent'||/^(rgba|hsla)\(/.test(css)||css.includes('/')?color:opticalHue(source,new THREE.Color(color)).getStyle()];
  })) as FuiHudPalette;
  if(isFuiThemeColorId(id)){
    const custom=[...entityHudPalettes.keys()].filter(isFuiThemeColorId);if(custom.length>=64)entityHudPalettes.delete(custom[0]);
  }
  Object.freeze(result);entityHudPalettes.set(id,result);return result;
}
