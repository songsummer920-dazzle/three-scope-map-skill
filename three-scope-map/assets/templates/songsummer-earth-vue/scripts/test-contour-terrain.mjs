// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/map/contourTerrainMath.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { terrainContours, smoothGrid, despikeElevations, terrainReferenceBounds, contourInterval, tilePosition } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

// A saddle is the case where bilinear contours float above/below a triangular mesh.
const saddle = { width: 2, height: 2, values: [0, 100, 100, 0] };
const lines = terrainContours(saddle, [0, 0, 1, 1], 25);
assert(lines.length > 0);
for (const line of lines) for (const [x, lat] of line.coordinates) {
  const y = 1 - lat;
  const height = x + y <= 1 ? 100 * (x + y) : 100 * (2 - x - y);
  assert(Math.abs(height - line.elevation) < 1e-8, 'Contour endpoint must lie on the actual triangle');
}
assert.deepEqual(terrainContours({ width: 2, height: 2, values: [23, 23, 23, 23] }, [0, 0, 1, 1], 5), [], 'Flat land must not acquire invented contours');
assert(smoothGrid({ width: 3, height: 3, values: Array(9).fill(42) }).values.every(v => v === 42));
assert(terrainContours({ width: 2, height: 2, values: [-100, 0, -100, 0] }, [0, 0, 1, 1], 25).some(l => l.elevation < 0), 'Preserve elevations below sea level');
const bounds = terrainReferenceBounds([110, 26, 113, 29]);
assert(bounds[0] < 110 && bounds[1] < 26 && bounds[2] > 113 && bounds[3] > 29);
assert(Math.abs((bounds[2] - bounds[0]) * Math.cos(27.5 * Math.PI / 180) - (bounds[3] - bounds[1])) < 1e-9);
assert(contourInterval(800, 'district', 0.3) <= contourInterval(800, 'province'));
assert.deepEqual(tilePosition(0, 0, 1), [1, 1]);
assert.equal(despikeElevations(new Float32Array([30, 30, 30, 30, -459, 30, 30, 30, 30]), 3, 3)[4], 30);
assert(despikeElevations(new Float32Array(9).fill(-200), 3, 3).every(v => v === -200), 'A genuine depression must retain negative elevations');
assert.equal(despikeElevations(new Float32Array([0, 100, 200, 0, 100, 200, 0, 100, 200]), 3, 3)[4], 100, 'Preserve coherent slopes');

// The existing manifest is the pre-change national baseline; never regenerate those assets here.
const manifest = JSON.parse(readFileSync(new URL('../../../template-manifest.json', import.meta.url), 'utf8'));
for (const name of ['bundle.json', 'surface.json']) {
  const path = `public/maps/contours/country/100000/${name}`;
  const digest = createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
  assert.equal(digest, manifest[path], `Country ${name} must be byte-for-byte unchanged`);
}
console.log('Contour terrain tests passed: triangle alignment, flat/negative elevations, geographic bounds, adaptive intervals, national data preservation');
