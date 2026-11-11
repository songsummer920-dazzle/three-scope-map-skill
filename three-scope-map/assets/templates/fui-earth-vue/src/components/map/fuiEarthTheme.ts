// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {VectorMapPalette} from './vectorMapConfig';
import { MAP_THEME_PRIMARY, deriveThemeHsl, isLegacyMapThemePrimary } from './mapTheme';
import {isFuiAchromaticColor,isFuiThemeColorId,normalizeFuiPrimaryColor,type FuiThemeColorId} from './fuiThemeColor';
export {isFuiAchromaticColor,isFuiThemeColorId,normalizeFuiPrimaryColor,type FuiThemeColorId} from './fuiThemeColor';

export type FuiEarthPresetId = 'original' | 'amber' | 'glacier' | 'alert';
export type FuiEarthSkinId = FuiEarthPresetId | FuiThemeColorId;
// Optional generated build default. Factories never read this value: only the
// public wrapper applies it beneath each instance's explicit primaryColor.
export const FUI_THEME_PRIMARY_OVERRIDE:string|undefined=undefined;
export type FuiEarthScanStyle = 'ribbon' | 'honeycomb';
export const FUI_EARTH_SCAN_STYLES = [
  { id: 'ribbon', name: '网格扫光' },
  { id: 'honeycomb', name: '蜂窝扫描' },
] as const;
export function isFuiEarthScanStyle(value: unknown): value is FuiEarthScanStyle {
  return FUI_EARTH_SCAN_STYLES.some((style) => style.id === value);
}

const skinAccents: Record<Exclude<FuiEarthPresetId, 'original'>, string> = {
  amber: '#ffb31c', glacier: '#00bfff', alert: '#ff392b',
};
export const FUI_EARTH_SKINS = [
  { id: 'original', name: '原版银灰', subtitle: '银灰地形 · 暖橙灯光', accent: '#8da7bc' },
  { id: 'amber', name: '琥珀黑金', subtitle: '石墨地形 · 琥珀辉光', accent: skinAccents.amber },
  { id: 'glacier', name: '青蓝冰川', subtitle: '石墨地形 · 冰蓝辉光', accent: skinAccents.glacier },
  { id: 'alert', name: '红色警戒', subtitle: '石墨地形 · 警戒红光', accent: skinAccents.alert },
] as const;

export function isFuiEarthSkin(value: unknown): value is FuiEarthSkinId {
  return FUI_EARTH_SKINS.some((skin) => skin.id === value)||isFuiThemeColorId(value);
}
/** Named presets remain intact; a normalized HEX is a self-contained theme ID. */
export function resolveFuiEarthThemeId(skin:FuiEarthSkinId='original',primaryColor?:string,alert=false):FuiEarthSkinId{
  if(alert)return 'alert';
  if(primaryColor!==undefined)return normalizeFuiPrimaryColor(primaryColor);
  if(isFuiThemeColorId(skin))return normalizeFuiPrimaryColor(skin);
  if(!isFuiEarthSkin(skin))throw new Error(`Invalid FUI skin: ${skin}`);
  return skin;
}
export function getFuiThemePrimary(skin:FuiEarthSkinId):string{
  if(isFuiThemeColorId(skin))return normalizeFuiPrimaryColor(skin);
  return FUI_EARTH_SKINS.find(item=>item.id===skin)?.accent??FUI_EARTH_SKINS[0].accent;
}

function createBaselineTheme(primaryValue: THREE.ColorRepresentation) {
  const primary = new THREE.Color(primaryValue);
  const legacyPrimary = new THREE.Color('#9fc53a');
  const usesLegacySurface = typeof primaryValue === 'string'
    && isLegacyMapThemePrimary(primaryValue);
  const mix = (target: THREE.ColorRepresentation, amount: number) => (
    primary.clone().lerp(new THREE.Color(target), amount)
  );
  const deriveLegacyRole = (legacyValue: THREE.ColorRepresentation) => {
    if (usesLegacySurface) return new THREE.Color(legacyValue);
    const primaryHsl = { h: 0, s: 0, l: 0 };
    const legacyPrimaryHsl = { h: 0, s: 0, l: 0 };
    const roleHsl = { h: 0, s: 0, l: 0 };
    primary.getHSL(primaryHsl);
    legacyPrimary.getHSL(legacyPrimaryHsl);
    new THREE.Color(legacyValue).getHSL(roleHsl);
    const derived = deriveThemeHsl(primaryHsl, legacyPrimaryHsl, roleHsl);
    return new THREE.Color().setHSL(derived.h, derived.s, derived.l);
  };
  const deriveShaderRole = (r: number, g: number, b: number) => {
    const legacyRole = new THREE.Color().setRGB(r, g, b);
    if (usesLegacySurface) return legacyRole;
    const primaryHsl = { h: 0, s: 0, l: 0 };
    const legacyPrimaryHsl = { h: 0, s: 0, l: 0 };
    const roleHsl = { h: 0, s: 0, l: 0 };
    primary.getHSL(primaryHsl);
    legacyPrimary.getHSL(legacyPrimaryHsl);
    legacyRole.getHSL(roleHsl);
    const derived = deriveThemeHsl(primaryHsl, legacyPrimaryHsl, roleHsl);
    return new THREE.Color().setHSL(derived.h, derived.s, derived.l);
  };
  const rgb = (color: THREE.Color, alpha: number) => {
    const srgb = color.clone();
    return `rgba(${Math.round(srgb.r * 255)}, ${Math.round(srgb.g * 255)}, ${Math.round(srgb.b * 255)}, ${alpha})`;
  };
  return {
    primary,
    outline: deriveLegacyRole('#9fc53a'),
    highlight: deriveLegacyRole('#d3ff62'),
    worldLandDark: deriveLegacyRole('#020806'),
    worldLandLight: deriveLegacyRole('#283b25'),
    worldOutline: deriveLegacyRole('#61772d'),
    chinaSurface: new THREE.Color('#788690'),
    chinaInnerOutline: new THREE.Color('#a9bac7'),
    chinaOuterGlow: new THREE.Color('#7d92a3'),
    bottomEdge: deriveLegacyRole('#8faf2f'),
    star: deriveLegacyRole('#d9ffe0'),
    nodeHub: deriveLegacyRole('#d7ff6b'),
    node: deriveLegacyRole('#a7d94a'),
    ringHub: deriveLegacyRole('#cfff58'),
    ring: deriveLegacyRole('#8fbd37'),
    flyTrack: new THREE.Color('#45647c'),
    flyTrail: new THREE.Color('#557f9d'),
    flyHead: new THREE.Color('#8db7d3'),
    grid: deriveLegacyRole('#587822'),
    atmosphere: deriveLegacyRole('#9fcf6b'),
    outerAtmosphere: deriveLegacyRole('#4f7e2b'),
    atmosphereFill: new THREE.Color('#425a70'),
    sweep: deriveLegacyRole('#86bd43'),
    flowTail: deriveShaderRole(0.27, 0.54, 0.045),
    flowHead: deriveShaderRole(0.78, 1, 0.31),
    wallBottom: deriveShaderRole(0.035, 0.1, 0.006),
    wallMiddle: deriveShaderRole(0.16, 0.36, 0.018),
    wallTop: deriveShaderRole(0.58, 0.82, 0.11),
    wallEdge: deriveShaderRole(0.42, 0.82, 0.075),
    earthTint: new THREE.Color('#40566c'),
    earthGrade: new THREE.Color('#b6c0c9'),
    oceanHighlight: new THREE.Color('#8fa6bb'),
    // The dashboard reference keeps the globe cool, but lets coastlines and
    // populated areas retain a restrained tungsten glow.
    earthShadowFloor: new THREE.Color('#172330'),
    // Reference-sampled low-saturation blue-grey illumination. The upper
    // hemisphere receives a broad cool-white wash, while the lower half
    // settles gradually into the dashboard's navy background.
    earthTopLight: new THREE.Color('#71889f'),
    earthMidTone: new THREE.Color('#2b3948'),
    earthBottomShade: new THREE.Color('#142130'),
    earthCityLight: new THREE.Color('#ff9a52'),
    earthCoastGlow: new THREE.Color('#d78349'),
    chinaFocus: deriveShaderRole(0.15, 0.4, 0.038),
    sweepSurface: new THREE.Color('#709ab3'),
    gridDot: deriveShaderRole(0.46, 0.62, 0.15),
    gridDotSweep: new THREE.Color('#93b9cd'),
    landGrid: deriveShaderRole(0.27, 0.39, 0.11),
    landGridDot: deriveShaderRole(0.38, 0.54, 0.13),
    atmosphereSweep: new THREE.Color('#789fb7'),
    rimCore: new THREE.Color('#e9f6ff'),
    polarTint: new THREE.Color('#ffffff'),
    chinaRidge: new THREE.Color('#9eacb6'),
    chinaSweep: new THREE.Color('#668ba3'),
    chinaInnerGlow: new THREE.Color('#91a6b6'),
    chinaCityLight: new THREE.Color('#e7a46e'),
    chinaSlopeLight: new THREE.Color('#aebbc5'),
    chinaFlatTone: new THREE.Color('#4f5d68'),
    chinaPlainTone: new THREE.Color('#687681'),
    chinaPlateauTone: new THREE.Color('#7e8992'),
    chinaDrylandTone: new THREE.Color('#717e88'),
    chinaForestTone: new THREE.Color('#586773'),
    chinaNortheastTone: new THREE.Color('#606f7a'),
    surfaceRecolorAmount: usesLegacySurface ? 0 : 1,
    // 大屏参考图采样背景：深蓝黑，不参与地图主题换色。
    background: new THREE.Color('#111b26'),
    css: {
      background: '#111b26',
      ambient: rgb(mix('#ffffff', 0.12), 0.1),
      grid: rgb(mix('#ffffff', 0.28), 0.009),
      cloudShadow: rgb(mix('#1b281e', 0.5), 0.82),
      cloudBody: rgb(mix('#647261', 0.55), 0.9),
      cloudMid: rgb(mix('#a2ae97', 0.68), 0.8),
      cloudLight: rgb(mix('#e6eddb', 0.84), 0.72),
      cloudGlow: rgb(mix('#f2f8e9', 0.86), 0.52),
    },
  };
}


type Baseline = ReturnType<typeof createBaselineTheme>;
type ColorRole = { [K in keyof Baseline]: Baseline[K] extends THREE.Color ? K : never }[keyof Baseline];
export type FuiSkinMaterial = {
  exposure: number; bloom: number; bloomRadius: number; bloomThreshold: number; roughness: number; metalness: number;
  surfaceGain: number; albedoTint: number; oceanShininess: number;
  oceanReflection: number; oceanDarken: number; cityGain: number; scanGain: number;
  atmosphereGain: number; environmentGain: number; edgeGain: number; reliefContrast: number; innerGlowGain: number; polarGain: number; chinaAmbient: number; worldGain: number; oceanBase: number;
};
const originalMaterial: FuiSkinMaterial = {
  exposure: 1.16, bloom: 0.1, bloomRadius: 0.16, bloomThreshold: 0.93, roughness: 0.65, metalness: 0,
  surfaceGain: 1, albedoTint: 0, oceanShininess: 88,
  oceanReflection: 1, oceanDarken: 0, cityGain: 1, scanGain: 1, atmosphereGain: 1, environmentGain: 1, edgeGain: 0, reliefContrast: 1, innerGlowGain: 1, polarGain: 1, chinaAmbient: 0, worldGain: 1, oceanBase: 0.06,
};
// One detail response, shared by every additional skin.
const sharedDetailMaterial = {
  exposure: 1.19,
  surfaceGain: 1.24,
  worldGain: 1.20,
  oceanBase: 0.25,
  oceanDarken: 0.10,
  chinaAmbient: 0.026,
  reliefContrast: 1.16,
  scanGain: 0.50,
} satisfies Partial<FuiSkinMaterial>;
// One lighting/material response. All additional palettes are generated from
// a single accent using the common neutral roles and energy budgets below.
const sharedReferenceMaterial: FuiSkinMaterial = {
  ...originalMaterial, ...sharedDetailMaterial,
  bloom: 0.26, bloomRadius: 0.16, bloomThreshold: 0.44,
  roughness: 0.54, metalness: 0.42, albedoTint: 0.09,
  oceanShininess: 100, oceanReflection: 0.8, cityGain: 1.45,
  innerGlowGain: 1.20, atmosphereGain: 2.5,
  environmentGain: 0.90, edgeGain: 1.10, polarGain: 0.90,
};
const skinMaterials: Record<FuiEarthPresetId, FuiSkinMaterial> = {
  original: originalMaterial,
  amber: { ...sharedReferenceMaterial },
  glacier: { ...sharedReferenceMaterial },
  alert: { ...sharedReferenceMaterial },
};
// Every additional skin is one accent input to the same material/color model.
// No skin ID selects a light gain, albedo table, spill amount or role recipe.
export const FUI_REFERENCE_LIGHTING = Object.freeze({
  surfaceColorMix: .32,
  environmentColorMix: .16,
  waterColorMix: .07,
  cloudColorMix: .10,
});
export function getFuiSkinMaterial(skin: FuiEarthSkinId): FuiSkinMaterial {
  if(isFuiThemeColorId(skin))return {...sharedReferenceMaterial};
  return skinMaterials[skin] ?? originalMaterial;
}
const linearLuminance = (color: THREE.Color) => color.r * .2126 + color.g * .7152 + color.b * .0722;

// One achromatic mineral surface and one neutral light rig. The satellite
// albedo and shared DEM supply all geographic contrast before accent response.
const neutralRoles = {
  worldLandDark: '#0a0d12', worldLandLight: '#43494f',
  earthTint: '#a3a8b1', earthGrade: '#c3c8cf', earthShadowFloor: '#13171e',
  earthTopLight: '#bcc8d5', earthMidTone: '#373b45', earthBottomShade: '#0e121a',
  oceanHighlight: '#8293a3', atmosphereFill: '#778694', polarTint: '#9198a0',
  chinaSurface: '#989b9f', chinaRidge: '#f0f0f5', chinaSlopeLight: '#c7c9ce',
  chinaFlatTone: '#4a494c', chinaPlainTone: '#6b6d74', chinaPlateauTone: '#9a9b9f',
  chinaDrylandTone: '#7a7d81', chinaForestTone: '#4b515b', chinaNortheastTone: '#666b75',
  star: '#c5c9d2', background: '#04090d',
} satisfies Partial<Record<ColorRole, string>>;

// [linear luminance budget, channel ceiling, neutral highlight fraction].
// The same hue-preserving energy/peak constraint applies to any input color.
// Only a few hot point/core roles mix neutral white; colored rails stay vivid.
const accentRoles = {
  primary: [.20,.86,0], outline: [.22,1,0], highlight: [.65,1,.72],
  worldOutline: [.10,.42,.50], earthCityLight: [.24,1,0], earthCoastGlow: [.20,.90,0],
  chinaInnerOutline: [.20,.85,0], chinaOuterGlow: [.21,.90,0],
  chinaSweep: [.22,1,0], chinaInnerGlow: [.24,1,0], chinaCityLight: [.24,1,0],
  wallBottom: [.004,.02,.10], wallMiddle: [.024,.12,.10],
  wallTop: [.19,.80,.10], wallEdge: [.22,1,.10], bottomEdge: [.09,.38,.10],
  flyTrack: [.06,.32,0], flyTrail: [.22,1,0], flyHead: [.62,1,.70],
  nodeHub: [.62,1,.60], node: [.22,1,0], ringHub: [.22,1,0], ring: [.10,.48,0],
  atmosphere: [.2393,1,0], outerAtmosphere: [.1047,.46,0], rimCore: [.839,1,.85],
  sweep: [.22,1,0], sweepSurface: [.20,.85,0], atmosphereSweep: [.22,1,0],
  grid: [.045,.20,.25], gridDot: [.16,.65,.25], gridDotSweep: [.22,1,0],
  landGrid: [.035,.15,.25], landGridDot: [.09,.38,.25], chinaFocus: [.06,.26,0],
  flowTail: [.08,.38,0], flowHead: [.50,1,.70],
} satisfies Partial<Record<ColorRole, readonly [number, number, number]>>;

export function createFuiAccentTheme(accent: THREE.ColorRepresentation) {
  const theme = createBaselineTheme(MAP_THEME_PRIMARY);
  const pigment = new THREE.Color(accent);
  const pigmentPeak = Math.max(pigment.r,pigment.g,pigment.b);
  if (pigmentPeak > 0) pigment.multiplyScalar(1/pigmentPeak);
  else pigment.setRGB(.08,.08,.08); // Black still needs neutral, readable emissive roles.
  for (const [role, color] of Object.entries(neutralRoles)) {
    (theme[role as ColorRole] as THREE.Color).set(color);
  }
  for (const [role, [energy, ceiling, whiteMix]] of Object.entries(accentRoles)) {
    const color = pigment.clone().lerp(new THREE.Color(1,1,1),whiteMix);
    const energyScale = energy/Math.max(linearLuminance(color),.0001);
    const peakScale = ceiling/Math.max(color.r,color.g,color.b,.0001);
    color.multiplyScalar(Math.min(energyScale,peakScale));
    (theme[role as ColorRole] as THREE.Color).copy(color);
  }
  theme.surfaceRecolorAmount = 1;
  theme.css.background = theme.background.getStyle();
  theme.css.cloudShadow = theme.background.clone().lerp(theme.primary,.12).getStyle();
  theme.css.cloudBody = theme.atmosphereFill.clone().multiplyScalar(.36).getStyle();
  theme.css.cloudMid = theme.atmosphereFill.getStyle();
  theme.css.cloudLight = theme.chinaRidge.getStyle();
  theme.css.cloudGlow = theme.highlight.getStyle();
  return theme;
}

export function createFuiEarthTheme(skin: FuiEarthSkinId = 'original') {
  if(isFuiThemeColorId(skin)){
    const primary=normalizeFuiPrimaryColor(skin),theme=createFuiAccentTheme(primary);
    if(isFuiAchromaticColor(primary)){
      for(const color of Object.values(theme))if(color instanceof THREE.Color){
        const gray=linearLuminance(color);color.setRGB(gray,gray,gray);
      }
      theme.css.background=theme.background.getStyle();
      theme.css.cloudShadow=theme.background.clone().lerp(theme.primary,.12).getStyle();
      theme.css.cloudBody=theme.atmosphereFill.clone().multiplyScalar(.36).getStyle();
      theme.css.cloudMid=theme.atmosphereFill.getStyle();theme.css.cloudLight=theme.chinaRidge.getStyle();
      theme.css.cloudGlow=theme.highlight.getStyle();
    }
    const rgba=(color:THREE.Color,alpha:number)=>{
      const rgb=color.clone().convertLinearToSRGB();
      return `rgba(${[rgb.r,rgb.g,rgb.b].map(value=>Math.round(Math.max(0,Math.min(1,value))*255)).join(', ')}, ${alpha})`;
    };
    theme.css.ambient=rgba(theme.primary.clone().lerp(new THREE.Color(1,1,1),.12),.1);
    theme.css.grid=rgba(theme.primary.clone().lerp(new THREE.Color(1,1,1),.28),.009);
    return theme;
  }
  if (skin === 'original' || !skinAccents[skin]) return createBaselineTheme(MAP_THEME_PRIMARY);
  return createFuiAccentTheme(skinAccents[skin]);
}

// HUD paint is display-referred sRGB, independent of the HDR globe palette.
// Separate the subdued rails from readable ticks and the few hot markers.
// A single accent with different opacity reverses the reference hierarchy.
export type FuiHudPalette = {
  ring: string; rail: string; fineRail: string;
  tickMajor: string; tickMid: string; tickMinor: string; mark: string;
  outer: string; reticle: string; axis: string; underlay: string;
};
// Shared role hierarchy in linear RGB: markers > major ticks > minor ticks
// > main rail > sparse perimeter > base rail > fine outer rail. Only ink varies.
function createHudPalette(ink: string): FuiHudPalette {
  const color = new THREE.Color(ink);
  // A black input has no emitted energy. Use achromatic graphite contrast,
  // rather than dividing by a zero peak or introducing an arbitrary blue hue.
  if(Math.max(color.r,color.g,color.b)<.000001)color.setRGB(.012,.012,.012);
  // Anchor visibility to the full amber ink. The former blue target dimmed
  // gold by almost half its linear energy and made every fine HUD too quiet.
  const baseline = linearLuminance(new THREE.Color('#c99463'));
  color.multiplyScalar(baseline / Math.max(linearLuminance(color),.0001));
  const peak = Math.max(color.r,color.g,color.b);
  // Keep a little chromatic headroom even for red, whose display gamut has a
  // lower maximum luminance. Clipping every bright role separately flattens
  // the tick hierarchy; adding white would turn the signal red pink again.
  if (peak > .86) color.multiplyScalar(.86 / peak);
  const inkPeak = Math.max(color.r,color.g,color.b);
  const shade = (energy: number) => color.clone().multiplyScalar(energy).getStyle();
  // Spend the remaining display headroom along the same RGB ray. All skins
  // share this role curve; the brightest datum reaches the pigment's gamut edge.
  const light = (lift: number) => color.clone()
    .multiplyScalar(1 + (lift / .40) * (1 / inkPeak - 1)).getStyle();
  return {
    ring: color.getStyle(), rail: shade(.45), fineRail: shade(.16),
    tickMajor: light(.22), tickMid: light(.13), tickMinor: light(.09), mark: light(.40),
    outer: shade(.80), reticle: light(.26), axis: color.getStyle(),
    underlay: 'transparent',
  };
}
const hudPalettes: Record<FuiEarthPresetId, FuiHudPalette> = {
  original: {
    ring:'#8da7bc', rail:'#526779', fineRail:'#344653',
    tickMajor:'#8da7bc', tickMid:'#798fa3', tickMinor:'#647d91', mark:'#b0c9dc',
    outer:'#526779', reticle:'#8da7bc', axis:'rgba(141,167,188,.17)', underlay:'rgba(141,167,188,.018)',
  },
  amber: createHudPalette(skinAccents.amber),
  glacier: createHudPalette(skinAccents.glacier),
  alert: createHudPalette(skinAccents.alert),
};
const customHudPalettes=new Map<FuiThemeColorId,FuiHudPalette>();
export function getFuiHudPalette(skin: FuiEarthSkinId): FuiHudPalette {
  if(isFuiThemeColorId(skin)){
    const id=normalizeFuiPrimaryColor(skin);let palette=customHudPalettes.get(id);
    if(!palette){
      palette=Object.freeze(createHudPalette(id));
      if(customHudPalettes.size>=64)customHudPalettes.delete(customHudPalettes.keys().next().value!);
      customHudPalettes.set(id,palette);
    }
    return palette;
  }
  return hudPalettes[skin] ?? hudPalettes.original;
}
/** Shared emitter pigment for globe and entered glass; caller owns the Color. */
export function createFuiHologramPigment(skin:FuiEarthSkinId){
  const color=new THREE.Color(getFuiHudPalette(resolveFuiEarthThemeId(skin)).mark);
  return color.setRGB(color.r**.85,color.g**.85,color.b**.85);
}

export function getFuiSkinStyle(skin: FuiEarthSkinId) {
  const theme = createFuiEarthTheme(skin);
  const primary=getFuiThemePrimary(skin);
  const hex = primary.slice(1);
  return {
    '--fui-background': theme.css.background,
    '--fui-hud-rgb': `${parseInt(hex.slice(0,2),16)} ${parseInt(hex.slice(2,4),16)} ${parseInt(hex.slice(4,6),16)}`,
    '--earth-accent': primary,
    '--fui-instrument-color': getFuiHudPalette(skin).ring,
  };
}

// Reuse the 3D skin pigment for every 2D semantic role. Roads stay subordinate
// to administrative boundaries; live changes never replace the map/provider.
export function getFuiVectorMapPalette(skin:FuiEarthSkinId):VectorMapPalette{
  const pigment=createFuiEarthTheme(skin).primary;
  const neutral=isFuiThemeColorId(skin)&&isFuiAchromaticColor(skin);
  const tint=(base:string,amount:number)=>{
    const color=new THREE.Color(base);
    if(neutral){const gray=linearLuminance(color);color.setRGB(gray,gray,gray);}
    return '#'+color.lerp(pigment,amount).getHexString();
  };
  const background=tint('#05090e',.004);
  const landuse=tint('#17212b',.023);
  return {
    background,land:tint('#101820',.018),landuse,park:landuse,
    water:tint('#050d18',.008),waterway:tint('#18323d',.13),
    building:tint('#27333f',.055),boundary:tint('#364655',.21),
    roadMajor:tint('#27333e',.07),roadSecondary:tint('#222d37',.045),
    roadMinor:tint('#1b252f',.025),rail:tint('#242d37',.035),
    label:tint('#cfdae5',.08),labelHalo:background,
    administrativeFill:'#'+pigment.getHexString(),
    administrativeLine:tint('#d5edff',.82),
  };
}
