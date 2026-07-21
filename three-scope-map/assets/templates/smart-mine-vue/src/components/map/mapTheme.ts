// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

/**
 * The only editable visual color entry for both EarthView and the flat 3D map.
 * Keep every role below derived from the validated legacy palette so changing this
 * single value preserves the original contrast hierarchy and animation texture.
 */
export const MAP_THEME_PRIMARY = '#9fc53a';

const LEGACY_THEME_PRIMARY = '#9fc53a';

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

function normalizeHex(value: string) {
  const normalized = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized.split('').map((item) => item + item).join('').toLowerCase()}`;
  }
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    throw new Error(`Invalid map theme color: ${value}`);
  }
  return `#${normalized.toLowerCase()}`;
}

function hexToRgb(value: string): Rgb {
  const hex = normalizeHex(value).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  const channel = (value: number) => Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = ((h % 1) + 1) % 1;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = hue * 6;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) [red, green] = [chroma, x];
  else if (section < 2) [red, green] = [x, chroma];
  else if (section < 3) [green, blue] = [chroma, x];
  else if (section < 4) [green, blue] = [x, chroma];
  else if (section < 5) [red, blue] = [x, chroma];
  else [red, blue] = [chroma, x];

  const match = l - chroma / 2;
  return { r: (red + match) * 255, g: (green + match) * 255, b: (blue + match) * 255 };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function deriveLegacyThemeColor(legacyValue: string) {
  const source = normalizeHex(MAP_THEME_PRIMARY);
  const legacySource = normalizeHex(LEGACY_THEME_PRIMARY);
  const legacyRole = normalizeHex(legacyValue);
  if (source === legacySource) return legacyRole;

  const sourceHsl = rgbToHsl(hexToRgb(source));
  const legacySourceHsl = rgbToHsl(hexToRgb(legacySource));
  const roleHsl = rgbToHsl(hexToRgb(legacyRole));
  return rgbToHex(hslToRgb({
    h: roleHsl.h + sourceHsl.h - legacySourceHsl.h,
    s: clamp(roleHsl.s + sourceHsl.s - legacySourceHsl.s),
    l: clamp(roleHsl.l + sourceHsl.l - legacySourceHsl.l),
  }));
}

export function themeRgba(legacyValue: string, alpha: number) {
  const { r, g, b } = hexToRgb(deriveLegacyThemeColor(legacyValue));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function themeRgb(legacyValue: string): [number, number, number] {
  const { r, g, b } = hexToRgb(deriveLegacyThemeColor(legacyValue));
  return [r, g, b];
}

export const mapTheme = {
  sourcePrimary: normalizeHex(MAP_THEME_PRIMARY),
  accent: deriveLegacyThemeColor('#E8FF4F'),
  accentSoft: deriveLegacyThemeColor('#D4F56A'),
  flyHead: deriveLegacyThemeColor('#F6FFD9'),
  sideMid: deriveLegacyThemeColor('#a8bc38'),
  sideBottom: deriveLegacyThemeColor('#101304'),
  ringDim: deriveLegacyThemeColor('#a4b83a'),
  arcDim: deriveLegacyThemeColor('#b5ca40'),
  mapBase: deriveLegacyThemeColor('#07100b'),
  baseLine: deriveLegacyThemeColor('#24351d'),
  hoverMid: deriveLegacyThemeColor('#b6c53d'),
  hoverBottom: deriveLegacyThemeColor('#1a2105'),
  surfaceBase: deriveLegacyThemeColor('#050b05'),
  surfaceEmissive: deriveLegacyThemeColor('#0d1708'),
  terrainColor: deriveLegacyThemeColor('#0a1607'),
  terrainEmissive: deriveLegacyThemeColor('#101d08'),
  ambientLight: deriveLegacyThemeColor('#baff78'),
  directionalLight: deriveLegacyThemeColor('#f2ffb1'),
  labelText: deriveLegacyThemeColor('#f2ffd6'),
  drillText: deriveLegacyThemeColor('#e8ffca'),
  chaseLight: '#ffffff',
  worldShadow: themeRgba('#e8ff4f', 0.7),
  worldChinaFill: themeRgba('#2d4e0f', 0.92),
  worldLandFill: themeRgba('#09150b', 0.84),
  worldChinaStroke: themeRgba('#e8ff4f', 0.96),
  worldLandStroke: themeRgba('#caff54', 0.42),
  css: {
    stageShadow: themeRgba('#c7ff3d', 0.34),
    drillText: themeRgba('#e8ffca', 0.86),
    drillGlow: themeRgba('#e8ff4f', 0.42),
    drillBorder: themeRgba('#d4f56a', 0.5),
    drillBackground: themeRgba('#081709', 0.62),
    drillBoxInner: themeRgba('#caff54', 0.18),
    drillBoxOuter: themeRgba('#caff54', 0.14),
    labelBorder: 'rgba(255, 255, 255, 0.82)',
    labelSheen: 'rgba(255, 255, 255, 0.08)',
    labelDarkA: themeRgba('#050706', 0.92),
    labelDarkB: themeRgba('#020302', 0.92),
    labelDarkC: themeRgba('#131b12', 0.82),
    labelGlow: themeRgba('#e8ff4f', 0.18),
    labelTextGlow: themeRgba('#ccff3d', 0.9),
    labelPointerGlow: themeRgba('#e8ff4f', 0.55),
    rippleBorder: themeRgba('#e8ff4f', 0.54),
    rippleCenter: themeRgba('#e8ff4f', 0.18),
    rippleMiddle: themeRgba('#e8ff4f', 0.04),
    rippleGlow: themeRgba('#e8ff4f', 0.22),
  },
} as const;

export const mapThemeStyle = {
  '--map-accent': mapTheme.accent,
  '--map-accent-soft': mapTheme.accentSoft,
  '--map-label-text': mapTheme.labelText,
  '--map-drill-text': mapTheme.drillText,
  '--map-stage-shadow': mapTheme.css.stageShadow,
  '--map-drill-text-alpha': mapTheme.css.drillText,
  '--map-drill-glow': mapTheme.css.drillGlow,
  '--map-drill-border': mapTheme.css.drillBorder,
  '--map-drill-background': mapTheme.css.drillBackground,
  '--map-drill-box-inner': mapTheme.css.drillBoxInner,
  '--map-drill-box-outer': mapTheme.css.drillBoxOuter,
  '--map-label-border': mapTheme.css.labelBorder,
  '--map-label-sheen': mapTheme.css.labelSheen,
  '--map-label-dark-a': mapTheme.css.labelDarkA,
  '--map-label-dark-b': mapTheme.css.labelDarkB,
  '--map-label-dark-c': mapTheme.css.labelDarkC,
  '--map-label-glow': mapTheme.css.labelGlow,
  '--map-label-text-glow': mapTheme.css.labelTextGlow,
  '--map-label-pointer-glow': mapTheme.css.labelPointerGlow,
  '--map-ripple-border': mapTheme.css.rippleBorder,
  '--map-ripple-center': mapTheme.css.rippleCenter,
  '--map-ripple-middle': mapTheme.css.rippleMiddle,
  '--map-ripple-glow': mapTheme.css.rippleGlow,
} as Record<string, string>;
