// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import type {FuiEarthSkinId} from './fuiEarthTheme';

export type FuiMapPresentation = 'standard' | 'textured-hex' | 'textured-grid';
export type FuiMapSurfaceVariant = 'terrain' | 'hologram-glass';
export type FuiMapSurfaceChoice = 'auto' | FuiMapSurfaceVariant;
export type FuiMapViewMode = '3d' | '2d' | 'overlay';
export type FuiMapStyle='classic'|'terrain-glass'|'smooth-glass';
export type FuiMapWave='none'|'hex'|'grid';
/** Complete scene recipes for new integrations. Legacy component defaults stay
 * compatible; copying a recipe always chooses the destination explicitly. */
export const FUI_SCENE_PRESETS={
  surface:Object.freeze({earthPresentation:'surface',mapStyle:'terrain-glass',mapWave:'hex',mapView:'3d'} as const),
  hologram:Object.freeze({earthPresentation:'hologram',mapStyle:'smooth-glass',mapWave:'hex',mapView:'3d'} as const),
  'hologram-hex':Object.freeze({earthPresentation:'hologram-hex',mapStyle:'smooth-glass',mapWave:'hex',mapView:'3d'} as const),
} as const;
export function resolveFuiMapLook(options:{style?:FuiMapStyle;wave?:FuiMapWave;presentation?:FuiMapPresentation;surface?:FuiMapSurfaceChoice;preset?:FuiEarthSkinId;earthPresentation?:'surface'|'hologram'|'hologram-hex'}={}){
  const legacy=options.presentation??'standard';
  const presentation:FuiMapPresentation=options.style==='classic'?'standard'
    :options.style?options.wave==='grid'?'textured-grid':'textured-hex'
    :legacy==='standard'?'standard':options.wave==='grid'?'textured-grid':options.wave==='hex'?'textured-hex':legacy;
  const surface:FuiMapSurfaceVariant=options.style==='smooth-glass'?'hologram-glass'
    :options.style?'terrain':resolveFuiDestinationSurface(options.surface,options.preset,options.earthPresentation);
  return {presentation,surface,waveEnabled:options.wave!=='none'};
}
// Auto preserves the existing preset pairing; explicit material choice is
// independent of hue, including custom HEX colors.
export function resolveFuiDestinationSurface(
  choice:FuiMapSurfaceChoice='auto',
  preset:FuiEarthSkinId='original',
  earthPresentation:'surface'|'hologram'|'hologram-hex'='surface',
):FuiMapSurfaceVariant{
  return choice==='auto'?(preset==='glacier'&&earthPresentation!=='surface'?'hologram-glass':'terrain'):choice;
}
export function resolveFuiMapSurfaceVariant(
  requested:FuiMapSurfaceVariant='terrain',
  _skin:FuiEarthSkinId='original',
  presentation:FuiMapPresentation='standard',
):FuiMapSurfaceVariant{
  return requested==='hologram-glass'&&presentation!=='standard'?'hologram-glass':'terrain';
}
export const FUI_MAP_PRESENTATIONS = [
  { id: 'standard', name: '原版 3D' },
  { id: 'textured-hex', name: '地形 · 蜂窝扩散' },
  { id: 'textured-grid', name: '地形 · 网格扩散' },
] as const;
export function isFuiMapPresentation(value: unknown): value is FuiMapPresentation {
  return FUI_MAP_PRESENTATIONS.some(item => item.id === value);
}
// Shared instrument dimensions: Earth screen space and map-local ground plane.
export const FUI_HUD_LAYOUT = {
  tickInner: 422, tickMidInner: 425, tickMinorInner: 429, tickOuter: 436,
  rail: 450, ring: 468, outer: 492, headingOuter: 483,
  width: { ring: .80, rail: .48, fineRail: .45, tickMajor: 1.05,
    tickMid: .85, tickMinor: .65, segment: .65, mark: 1.10 },
} as const;

// Earth-like fine graduation, retaining the geographic heading anchors.
// Keep the spherical HUD and all cardinal positions unchanged.
export const FUI_MAP_HUD_LAYOUT = {
  tickInner:430,tickMidInner:433,tickMinorInner:437,tickOuter:444,
  rail:466,ring:488,outer:510,headingOuter:500,
  width:{ring:.80,rail:.48,fineRail:.40,tickMajor:1.05,tickMid:.85,
    tickMinor:.58,segment:.75,mark:1.80},
} as const;
