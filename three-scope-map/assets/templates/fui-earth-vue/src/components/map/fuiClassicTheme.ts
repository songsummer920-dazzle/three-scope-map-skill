// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import {MAP_THEME_PRIMARY,deriveThemeHsl,mapTheme,mapThemeStyle} from './mapTheme';
import {isFuiThemeColorId,normalizeFuiPrimaryColor,type FuiEarthSkinId,type FuiThemeColorId} from './fuiEarthTheme';

const themes=new Map<FuiThemeColorId,Map<string,THREE.Color>>();
const sourcePrimary=new THREE.Color(MAP_THEME_PRIMARY),sourcePrimaryHsl=sourcePrimary.getHSL({h:0,s:0,l:0});
export function recolorFuiClassicColor(source:THREE.Color,skin:FuiThemeColorId):THREE.Color{
  const id=normalizeFuiPrimaryColor(skin);let colors=themes.get(id);
  if(!colors){
    if(themes.size>=64)themes.delete(themes.keys().next().value!);
    colors=new Map();themes.set(id,colors);
  }
  const key=source.getHexString();let result=colors.get(key);
  if(!result){
    // A CLI-generated mapTheme is already in its new hue. Anchor to that
    // build's primary, so a runtime HEX does not rotate the theme twice.
    if(id===normalizeFuiPrimaryColor(MAP_THEME_PRIMARY))result=source.clone();
    else{
      const primaryHsl=new THREE.Color(id).getHSL({h:0,s:0,l:0});
      const roleHsl=source.getHSL({h:0,s:0,l:0});
      const derived=deriveThemeHsl(primaryHsl,sourcePrimaryHsl,roleHsl);
      result=new THREE.Color().setHSL(derived.h,derived.s,derived.l);
    }
    Object.freeze(result);colors.set(key,result);
  }
  return result;
}

type ColorState={color?:THREE.Color;emissive?:THREE.Color;uniforms:Record<string,THREE.Color>;active:boolean};
const states=new WeakMap<THREE.Material|THREE.Light,ColorState>();
const terrainBindings=new WeakMap<THREE.Material,THREE.IUniform<number>>();
const selectedClassicColor=new THREE.Color(mapTheme.accent);
/** Explicitly rebind after Material.clone(): Three does not clone compile hooks. */
export function bindFuiClassicTerrainMaterial(material:THREE.MeshStandardMaterial|THREE.MeshBasicMaterial){
  const existing=terrainBindings.get(material);if(existing)return existing;
  const enabled={value:0};terrainBindings.set(material,enabled);
  const previous=material.onBeforeCompile,programKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);shader.uniforms.uFuiClassicRecolor=enabled;
    shader.fragmentShader='uniform float uFuiClassicRecolor;\n'+shader.fragmentShader;
    const mapFragment=THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',`
      // Native color texture still supplies its real local albedo/relief.
      // Custom theme hue is applied to luminance, never blue times green RGB.
      float fuiTerrainLuminance=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
      sampledDiffuseColor.rgb=mix(sampledDiffuseColor.rgb,vec3(fuiTerrainLuminance),uFuiClassicRecolor);
      diffuseColor *= sampledDiffuseColor;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',mapFragment);
  };
  material.customProgramCacheKey=()=>programKey+'|fui-classic-luminance-v1';
  material.needsUpdate=true;
  return enabled;
}

/** Only custom classic maps call this with a HEX. Other presets restore the
 * exact per-instance colors captured before the first custom-theme frame. */
export function updateFuiClassicColors(target:THREE.Material|THREE.Light,skin?:FuiEarthSkinId,selected=false){
  const id=isFuiThemeColorId(skin)?normalizeFuiPrimaryColor(skin):undefined;
  const material=target as THREE.Material&{color?:THREE.Color;emissive?:THREE.Color;uniforms?:Record<string,THREE.IUniform>};
  let state=states.get(target);
  if(!state){
    if(!id)return;
    const uniforms:Record<string,THREE.Color>={};
    if(!target.userData.fuiSide)for(const [name,uniform] of Object.entries(material.uniforms??{}))
      if(uniform.value instanceof THREE.Color)uniforms[name]=uniform.value.clone();
    state={color:material.color?.clone(),emissive:material.emissive?.clone(),uniforms,active:false};states.set(target,state);
  }
  if(!id&&!state.active)return;
  const color=(source:THREE.Color)=>id?recolorFuiClassicColor(source,id):source;
  const terrain=target instanceof THREE.MeshStandardMaterial&&target.userData.terrainConfig;
  const selectedColor=selected&&terrain?selectedClassicColor:undefined;
  if(state.color&&material.color)material.color.copy(color(selectedColor??state.color));
  if(state.emissive&&material.emissive)material.emissive.copy(color(selectedColor??state.emissive));
  for(const [name,source] of Object.entries(state.uniforms))material.uniforms![name].value.copy(color(source));
  if(terrain){
    const top=target as THREE.MeshStandardMaterial;
    // Existing pointer handlers retain their opacity/lift behavior. Their
    // saved base colors must follow this instance and restore correctly too.
    if(state.color)top.userData.baseColor='#'+color(state.color).getHexString();
    if(state.emissive)top.userData.baseEmissive='#'+color(state.emissive).getHexString();
  }
  if((target instanceof THREE.MeshStandardMaterial||target instanceof THREE.MeshBasicMaterial)&&target.map)
    bindFuiClassicTerrainMaterial(target).value=id?1:0;
  state.active=!!id;
}

const styles=new Map<FuiThemeColorId,Record<string,string>>();
export function getFuiClassicStyle(skin:FuiEarthSkinId):Record<string,string>{
  if(!isFuiThemeColorId(skin))return mapThemeStyle;
  const id=normalizeFuiPrimaryColor(skin),cached=styles.get(id);if(cached)return cached;
  const hex=(value:string)=>'#'+recolorFuiClassicColor(new THREE.Color(value),id).getHexString();
  const recolor=(value:string)=>value.replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi,hex).replace(/rgba?\(([^)]+)\)/g,(source,channels:string)=>{
    const parts=channels.split(',').map(Number);if(parts.length<3||!parts.every(Number.isFinite))return source;
    const original=new THREE.Color().setRGB(parts[0]/255,parts[1]/255,parts[2]/255,THREE.SRGBColorSpace);
    const color=recolorFuiClassicColor(original,id).clone().convertLinearToSRGB();
    const rgb=[color.r,color.g,color.b].map(channel=>Math.round(channel*255)).join(',');
    return parts.length===4?`rgba(${rgb},${parts[3]})`:`rgb(${rgb})`;
  });
  const result=Object.fromEntries(Object.entries(mapThemeStyle).map(([key,value])=>{
    const svg=value.match(/^url\("data:image\/svg\+xml,(.*)"\)$/);
    return [key,svg?`url("data:image/svg+xml,${encodeURIComponent(recolor(decodeURIComponent(svg[1])))}")`:recolor(value)];
  }));
  if(styles.size>=64)styles.delete(styles.keys().next().value!);
  Object.freeze(result);styles.set(id,result);return result;
}
