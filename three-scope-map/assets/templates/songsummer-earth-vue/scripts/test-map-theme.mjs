// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const themePath = new URL('../src/components/map/mapTheme.ts', import.meta.url);
const earthPath = new URL('../src/components/map/EarthView.vue', import.meta.url);
const source = fs.readFileSync(themePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleRecord = { exports: {} };
vm.runInNewContext(transpiled, {
  module: moduleRecord,
  exports: moduleRecord.exports,
  console,
});

const {
  deriveThemeHsl,
  deriveLegacyThemeColorForPrimary,
} = moduleRecord.exports;

function rgbToHsl(channels) {
  const [red, green, blue] = channels;
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = ((hue / 6) + 1) % 1;
  }
  return { h: hue, s: saturation, l: lightness };
}

function hexToHsl(value) {
  const raw = value.replace('#', '');
  return rgbToHsl(
    [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16) / 255),
  );
}

const legacyRoles = [
  '#e8ff4f',
  '#d4f56a',
  '#a8bc38',
  '#07100b',
  '#24351d',
  '#f2ffd6',
];

for (const role of legacyRoles) {
  assert.equal(
    deriveLegacyThemeColorForPrimary('#9fc53a', role),
    role,
    `Default green must preserve ${role} exactly`,
  );
}

for (const primary of ['#000000', '#808080', '#ffffff']) {
  for (const role of legacyRoles) {
    const derived = deriveLegacyThemeColorForPrimary(primary, role);
    assert.ok(
      hexToHsl(derived).s <= 0.001,
      `${primary} generated chroma in ${derived}`,
    );
  }
}

for (const role of legacyRoles) {
  const derived = deriveLegacyThemeColorForPrimary('#777a7d', role);
  assert.ok(
    hexToHsl(derived).s <= 0.08,
    `Near-gray generated excessive chroma in ${derived}`,
  );
}

const chinaRegionalRoles = [
  [0.12, 0.34, 0.052],
  [0.27, 0.45, 0.095],
  [0.29, 0.39, 0.085],
  [0.085, 0.3, 0.04],
  [0.075, 0.255, 0.035],
];
const legacyPrimaryHsl = hexToHsl('#9fc53a');
for (const primary of ['#000000', '#808080', '#ffffff', '#777a7d']) {
  const maximumSaturation = primary === '#777a7d' ? 0.08 : 0.001;
  const sourceHsl = hexToHsl(primary);
  for (const regionalRole of chinaRegionalRoles) {
    const derived = deriveThemeHsl(
      sourceHsl,
      legacyPrimaryHsl,
      rgbToHsl(regionalRole),
    );
    assert.ok(
      derived.s <= maximumSaturation,
      `${primary} left chroma in an Earth China regional role: ${derived.s}`,
    );
  }
}

const cyanAccent = deriveLegacyThemeColorForPrimary('#2af7ff', '#e8ff4f');
assert.ok(hexToHsl(cyanAccent).s >= 0.75, 'Chromatic themes must remain vivid');
assert.ok(
  hexToHsl(cyanAccent).h > 0.42 && hexToHsl(cyanAccent).h < 0.58,
  `Cyan theme hue drifted to ${cyanAccent}`,
);

const earthSource = fs.readFileSync(earthPath, 'utf8');
for (const requiredFragment of [
  'uSurfaceRecolorAmount',
  'uPlainTone',
  'uPlateauTone',
  'uDrylandTone',
  'uForestTone',
  'uNortheastTone',
  'themedDaySurface',
]) {
  assert.ok(
    earthSource.includes(requiredFragment),
    `Earth theme surface pipeline is missing ${requiredFragment}`,
  );
}
assert.ok(
  !earthSource.includes('vec3 plainTone = vec3(surfaceLuma'),
  'China regional tones are still hard-coded green',
);

console.log('Theme runtime regression checks passed');
