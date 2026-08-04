// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
//
// Baseline screenshot capture script for three-scope-map-skill's smart-mine-vue
// template. Produces (and lets anyone reproduce) the 6 visual-regression
// screenshots checked in under docs/superpowers/baselines/*/*.png — the safety
// net for the Vue-to-framework-agnostic-core refactor. See the README in
// docs/superpowers/baselines/2026-08-02-vue-before/ for what each screenshot
// shows and why.
//
// Dependencies: `playwright` and `pngjs`. Install them OUTSIDE this repo (e.g.
// in a scratch directory) to avoid adding unrelated dependencies to the skill
// template, then point Node at them via NODE_PATH:
//
//   mkdir -p /tmp/capture-deps && cd /tmp/capture-deps && npm init -y
//   npm install playwright pngjs
//
// Usage (with smart-mine-vue's `npm run dev` already running):
//
//   NODE_PATH=/tmp/capture-deps/node_modules node capture.cjs <outputDir> [devServerUrl]
//
// Must launch with `channel: 'chrome'` (the system-installed Chrome), NOT
// Playwright's bundled Chromium: the locally cached Chromium build can be
// version-mismatched and fails headless launch with "Executable doesn't
// exist". System Chrome via `channel: 'chrome'` works reliably.
//
// DETERMINISM CONTRACT: every one of the 6 screenshots is gated on an actual
// DOM/pixel readiness condition, never a bare `sleep(fixedMs)`. If a condition
// isn't met within its timeout, the script throws (and exits non-zero) naming
// which screenshot failed and what it was waiting for. It must never silently
// save a screenshot of the wrong (e.g. still-transitioning, or pre-render)
// state -- a flaky "looks black sometimes" capture defeats the entire purpose
// of these baselines (Task 3/4/5/7 diff against them pixel-by-pixel).

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const outDir = process.argv[2] || __dirname;
const url = process.argv[3] || 'http://127.0.0.1:5173/';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntil(fn, predicate, { timeoutMs = 8000, intervalMs = 200, label = '' } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (predicate(last)) return last;
    await sleep(intervalMs);
  }
  throw new Error(`[${label}] condition not met within ${timeoutMs}ms, last state: ${JSON.stringify(last)}`);
}

// ---------------------------------------------------------------------------
// Pixel-based readiness (only used where no reliable DOM/state flag exists --
// see waitForEarthIntroDone below for why the earth intro needs this).
// ---------------------------------------------------------------------------

async function screenshotBrightness(target) {
  const buf = await target.screenshot({ type: 'png' });
  const png = PNG.sync.read(buf);
  const { data, width, height } = png;
  const strideX = 4;
  const strideY = 4;
  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y += strideY) {
    for (let x = 0; x < width; x += strideX) {
      const idx = (width * y + x) << 2;
      sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

// ---------------------------------------------------------------------------
// Canvas / DOM helpers
// ---------------------------------------------------------------------------

// NOTE: EarthChinaMap.vue renders `.china-map-stage` (which contains ChinaMap's
// own <canvas>) BEFORE `<EarthView>` in the DOM. So a bare
// `document.querySelector('canvas')` picks up the (possibly hidden/inactive)
// China map canvas, not the earth globe's canvas. Always scope canvas lookups
// with `.earth-view canvas` when we specifically mean the globe.
async function getCanvasInfo(page, scopeSelector) {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    if (!canvas) return { hasCanvas: false };
    return { hasCanvas: true, width: canvas.width, height: canvas.height };
  }, scopeSelector);
}

async function assertCanvasRendering(page, label, scopeSelector = 'canvas') {
  const info = await getCanvasInfo(page, scopeSelector);
  if (!info.hasCanvas) {
    throw new Error(`[${label}] no <canvas> matching "${scopeSelector}" found in DOM`);
  }
  if (!info.width || !info.height) {
    throw new Error(`[${label}] canvas has zero size: ${JSON.stringify(info)}`);
  }
  return info;
}

// Readiness for 01-earth-first-paint: this frame is SUPPOSED to be dark (the
// earth intro has barely started), so brightness cannot be the gate. The only
// thing we assert is that the canvas exists, is sized, and has painted at
// least one real frame (two rAF ticks after it appears). We then capture
// immediately -- no magic "~500ms" sleep.
async function waitForEarthCanvasFirstFrame(page, { timeoutMs = 10000 } = {}) {
  await pollUntil(
    () => getCanvasInfo(page, '.earth-view canvas'),
    (info) => info.hasCanvas && info.width > 0 && info.height > 0,
    { timeoutMs, intervalMs: 50, label: '01-earth-first-paint: waiting for .earth-view canvas to be sized' },
  );
  // Let two animation frames elapse so the renderer has actually drawn into
  // the sized canvas (as opposed to catching it the instant it was resized).
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

// Readiness for 02-earth-intro-done: EarthView.vue drives its intro off an
// internal `introValue` (0..1) local variable that is never exposed on the
// DOM/window (and we're not allowed to modify three-scope-map/ to add a debug
// hook). What *is* observable from outside is the rendered brightness of the
// globe canvas: as introValue climbs, the earth fades in / grows / lights up,
// so average pixel brightness rises monotonically then plateaus once the
// intro settles (matches `controls.enabled = introValue >= 0.98` internally).
// We measure a dark baseline right after the canvas first paints (~ same
// frame as 01), then poll brightness until 3 consecutive samples are both (a)
// meaningfully brighter than that baseline and (b) mutually stable (varying
// by less than a small fraction of their mean) -- i.e. no longer fading in.
async function waitForEarthIntroDone(page, { timeoutMs = 30000, intervalMs = 350 } = {}) {
  const canvas = await page.$('.earth-view canvas');
  if (!canvas) throw new Error('[02-earth-intro-done] .earth-view canvas not found');

  const baseline = await screenshotBrightness(canvas);
  const minDelta = 4; // must brighten by at least this many levels (0-255) past the dark baseline
  const stableRelTol = 0.06; // last 3 samples must vary by < 6% of their mean to call it "settled"

  const history = [];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const b = await screenshotBrightness(canvas);
    history.push(b);
    if (history.length > 3) history.shift();
    if (history.length === 3) {
      const mean = history.reduce((a, c) => a + c, 0) / 3;
      const spread = Math.max(...history) - Math.min(...history);
      const relSpread = mean > 0 ? spread / mean : spread;
      if (mean > baseline + minDelta && relSpread < stableRelTol) {
        return { baseline, brightness: mean, history: [...history] };
      }
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `[02-earth-intro-done] brightness never stabilized above baseline within ${timeoutMs}ms. ` +
      `baseline=${baseline.toFixed(2)}, last samples=${JSON.stringify(history.map((v) => Number(v.toFixed(2))))}`,
  );
}

async function findChinaHitPoint(page) {
  const cxs = [780, 820, 860, 900, 940, 980, 1020, 1060, 1100, 1140];
  const cys = [320, 360, 400, 440, 480, 520, 560, 600];
  for (const y of cys) {
    for (const x of cxs) {
      await page.mouse.move(x, y);
      await sleep(40);
      const cursor = await page.evaluate(() => {
        const c = document.querySelector('.earth-view canvas');
        return c ? c.style.cursor : null;
      });
      if (cursor === 'pointer') return { x, y };
    }
  }
  return null;
}

// Readiness for 03-cloud-handoff: EarthChinaMap.vue toggles `.is-handoff` onto
// `.china-map-stage` (see beginChinaHandoff(), driven by EarthView's
// `handoff-start` emit ~0.72 into its internal GSAP timeline) well before
// `.is-active` flips (which only happens once the full camera flight
// timeline completes and `enter-china` fires). So "is-handoff true AND
// is-active still false" unambiguously identifies the cloud-dive-in-progress
// window, without guessing a millisecond offset from the click.
async function waitForCloudHandoff(page, { timeoutMs = 10000 } = {}) {
  return pollUntil(
    () =>
      page.evaluate(() => {
        const stage = document.querySelector('.china-map-stage');
        return {
          hasHandoff: !!stage && stage.classList.contains('is-handoff'),
          isActive: !!stage && stage.classList.contains('is-active'),
        };
      }),
    (s) => s.hasHandoff && !s.isActive,
    { timeoutMs, intervalMs: 60, label: '03-cloud-handoff: waiting for .china-map-stage.is-handoff (pre is-active)' },
  );
}

async function getDrillState(page) {
  return page.evaluate(() => {
    const stageActive = !!document.querySelector('.china-map-stage.is-active');
    const span = document.querySelector('.map-drill-control span');
    const backBtn = document.querySelector('[data-map-action="back"]');
    return {
      chinaStageActive: stageActive,
      drillLabel: span ? span.textContent : null,
      backDisabled: backBtn ? backBtn.disabled : null,
    };
  });
}

async function getCityLabelCount(page) {
  return page.evaluate(() => document.querySelectorAll('.city-label').length);
}

// Shared "the label layer has stopped growing" gate, used for both
// 04-china-settled (province labels for the whole country) and
// 05-province-drilldown (city labels within the drilled-into province).
// CSS2DObjects for labels get appended over a few frames as the map rebuilds;
// counting is cheap and avoids guessing how long that takes.
async function waitForLabelCountStable(page, { label, timeoutMs = 8000, intervalMs = 250, stableReads = 3 } = {}) {
  const history = [];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await getCityLabelCount(page);
    history.push(count);
    if (history.length > stableReads) history.shift();
    if (history.length === stableReads && history.every((c) => c === history[0]) && history[0] > 0) {
      return history[0];
    }
    await sleep(intervalMs);
  }
  throw new Error(`[${label}] .city-label count never stabilized within ${timeoutMs}ms, last samples: ${JSON.stringify(history)}`);
}

// Readiness for 04-china-settled: `.china-map-stage.is-active` (mode flipped
// to 'china') AND the label layer has stopped growing.
async function waitForChinaSettled(page, { timeoutMs = 12000 } = {}) {
  await pollUntil(() => getDrillState(page), (s) => s.chinaStageActive, {
    timeoutMs,
    label: '04-china-settled: waiting for .china-map-stage.is-active',
  });
  await waitForLabelCountStable(page, { label: '04-china-settled', timeoutMs: 8000 });
}

// Labels are `.city-label` boxes (position: absolute; left:0; bottom:0;
// transform: translateX(-50%)) hung off a zero-size `.city-label-anchor` div
// that CSS2DRenderer positions exactly at the province's geo-projected screen
// point. Using the *visible box's* center (as opposed to the anchor) can be
// off by ~half the label height/width, enough to land a click in a
// neighboring, geographically-adjacent province. So: locate the matching text,
// then walk up to the `.city-label-anchor` ancestor and use its rect (which
// has zero width/height, so left/top *is* the true anchor point) instead.
async function findLabelCenter(page, text) {
  return page.evaluate((needle) => {
    function anchorPointFor(el) {
      const anchor = el.closest('.city-label-anchor') || el;
      const r = anchor.getBoundingClientRect();
      return { x: r.left, y: r.top + 2 };
    }
    const layers = document.querySelectorAll('.map-label-layer');
    for (const layer of layers) {
      const all = layer.querySelectorAll('*');
      for (const el of all) {
        const t = (el.textContent || '').trim();
        if (t === needle) {
          return { ...anchorPointFor(el), text: t };
        }
      }
    }
    for (const layer of layers) {
      const all = layer.querySelectorAll('*');
      for (const el of all) {
        const t = (el.textContent || '').trim();
        if (t.includes(needle)) {
          return { ...anchorPointFor(el), text: t };
        }
      }
    }
    return null;
  }, text);
}

// Hovering a province on the China map toggles `.city-label.is-selected` onto
// that province's label (see setCityLabelSelected/setFeatureHighlight in
// ZhejiangThreeMap.vue). The label's anchor point can sit close to a
// geographically-adjacent province's actual polygon in this 3D perspective
// (observed: clicking directly on the "浙江省" label anchor raycast-hit
// Jiangsu instead). So do the same "move mouse, read hover state" grid search
// used for the earth/China hit-test, searching outward from the label anchor
// until the hovered feature's label text matches what we want.
async function findFeatureHitPoint(page, targetSubstr, centerX, centerY, { maxRadius = 140, step = 12 } = {}) {
  const offsets = [[0, 0]];
  for (let r = step; r <= maxRadius; r += step) {
    const circumference = 2 * Math.PI * r;
    const samples = Math.max(8, Math.round(circumference / step));
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * 2 * Math.PI;
      offsets.push([Math.round(r * Math.cos(angle)), Math.round(r * Math.sin(angle))]);
    }
  }
  for (const [dx, dy] of offsets) {
    const x = centerX + dx;
    const y = centerY + dy;
    if (x < 0 || y < 0) continue;
    await page.mouse.move(x, y);
    await sleep(35);
    const selectedText = await page.evaluate(() => {
      const el = document.querySelector('.city-label.is-selected');
      return el ? el.textContent.trim() : null;
    });
    if (selectedText && selectedText.includes(targetSubstr)) {
      return { x, y, matchedText: selectedText };
    }
  }
  return null;
}

async function getSouthSeaInsetWidth(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.south-sea-inset');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, visible: getComputedStyle(el).opacity !== '0' };
  });
}

// Readiness for 06-south-sea-inset-zoomed: keep wheel-zooming until the inset
// width itself reports the same value on 2 consecutive reads (i.e. the
// camera-distance clamp has been hit and OrbitControls damping has settled),
// instead of guessing a fixed wheel-tick count + fixed settle sleep.
async function waitForSouthSeaInsetStable(page, { timeoutMs = 15000, intervalMs = 200, epsilon = 0.5 } = {}) {
  let last = null;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await getSouthSeaInsetWidth(page);
    if (!info) throw new Error('06-south-sea-inset-zoomed: .south-sea-inset not found in DOM');
    if (last !== null && Math.abs(info.width - last.width) < epsilon && Math.abs(info.height - last.height) < epsilon) {
      return info;
    }
    last = info;
    await sleep(intervalMs);
  }
  throw new Error(`[06-south-sea-inset-zoomed] inset size never stabilized within ${timeoutMs}ms, last=${JSON.stringify(last)}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('[browser console error]', msg.text());
    }
  });
  page.on('pageerror', (err) => {
    console.log('[browser page error]', err.message);
  });

  console.log('Navigating to', url);
  const navStart = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // ---- 01: earth canvas has painted its first real frame, intro barely started ----
  await waitForEarthCanvasFirstFrame(page);
  await assertCanvasRendering(page, '01-earth-first-paint', '.earth-view canvas');
  await page.screenshot({ path: path.join(outDir, '01-earth-first-paint.png') });
  console.log('Captured 01-earth-first-paint.png at t=', Date.now() - navStart, 'ms');

  // ---- 02: earth intro's brightness has risen and plateaued (settled) ----
  const introState = await waitForEarthIntroDone(page);
  console.log('Earth intro brightness settled:', introState);
  await assertCanvasRendering(page, '02-earth-intro-done', '.earth-view canvas');
  await page.screenshot({ path: path.join(outDir, '02-earth-intro-done.png') });
  console.log('Captured 02-earth-intro-done.png at t=', Date.now() - navStart, 'ms');

  // ---- find a screen point that actually raycasts onto the China mesh on the globe ----
  const hitPoint = await findChinaHitPoint(page);
  if (!hitPoint) {
    throw new Error('Could not find a screen point where cursor becomes "pointer" over the China landmass on the globe');
  }
  console.log('Found China hit point on globe:', hitPoint);

  // ---- click earth (on China) to trigger handoff ----
  await page.mouse.click(hitPoint.x, hitPoint.y);
  const clickStart = Date.now();
  console.log('Clicked earth at', hitPoint);

  // ---- 03: cloud dive in progress (is-handoff true, is-active still false) ----
  await waitForCloudHandoff(page);
  await assertCanvasRendering(page, '03-cloud-handoff', '.earth-view canvas');
  await page.screenshot({ path: path.join(outDir, '03-cloud-handoff.png') });
  console.log('Captured 03-cloud-handoff.png at t+click=', Date.now() - clickStart, 'ms');

  // ---- 04: china settled (is-active true, label layer stopped growing) ----
  await waitForChinaSettled(page);
  await assertCanvasRendering(page, '04-china-settled', '.map-host canvas');
  const state04 = await getDrillState(page);
  console.log('Drill state at 04:', state04);
  await page.screenshot({ path: path.join(outDir, '04-china-settled.png') });
  console.log('Captured 04-china-settled.png at t+click=', Date.now() - clickStart, 'ms');

  // ---- find Zhejiang label and click it ----
  let zhejiang = await findLabelCenter(page, '浙江');
  if (!zhejiang || (zhejiang.x === 0 && zhejiang.y === 0)) {
    await sleep(1000);
    zhejiang = await findLabelCenter(page, '浙江');
  }
  if (!zhejiang || (zhejiang.x === 0 && zhejiang.y === 0)) {
    const allLabels = await page.evaluate(() => {
      const layers = document.querySelectorAll('.map-label-layer');
      const texts = [];
      layers.forEach((layer) => {
        layer.querySelectorAll('*').forEach((el) => {
          const t = (el.textContent || '').trim();
          if (t) texts.push(t);
        });
      });
      return texts;
    });
    throw new Error('Could not find a valid (non-zero) 浙江 label position. Found labels: ' + JSON.stringify(allLabels) + ' last result: ' + JSON.stringify(zhejiang));
  }
  console.log('Found 浙江 label anchor (approx) at', zhejiang);

  const zhejiangHit = await findFeatureHitPoint(page, '浙江', zhejiang.x, zhejiang.y);
  if (!zhejiangHit) {
    throw new Error(`Could not find a screen point that hovers/selects 浙江省 near anchor ${JSON.stringify(zhejiang)}`);
  }
  console.log('Confirmed 浙江 hit point via hover:', zhejiangHit);
  await page.mouse.click(zhejiangHit.x, zhejiangHit.y);
  const drillStart = Date.now();
  console.log('Clicked 浙江 at', zhejiangHit);

  // ---- 05: drilled down to province level, and it's the RIGHT province ----
  await pollUntil(() => getDrillState(page), (s) => s.drillLabel && s.drillLabel.includes('省级'), {
    timeoutMs: 8000,
    label: '05-province-drilldown: waiting for 省级 scope',
  });
  const finalState05 = await getDrillState(page);
  if (!finalState05.drillLabel || !finalState05.drillLabel.includes('浙江')) {
    throw new Error(
      `Drilldown landed on the wrong province. Expected drillLabel to include "浙江", got: ${JSON.stringify(finalState05)}. Clicked label anchor at ${JSON.stringify(zhejiang)}`,
    );
  }
  await waitForLabelCountStable(page, { label: '05-province-drilldown', timeoutMs: 8000 });
  await assertCanvasRendering(page, '05-province-drilldown', '.map-host canvas');
  await page.screenshot({ path: path.join(outDir, '05-province-drilldown.png') });
  console.log('Captured 05-province-drilldown.png at t+drill=', Date.now() - drillStart, 'ms');

  // ---- go back to country level via back button ----
  const backClicked = await page.evaluate(() => {
    const btn = document.querySelector('[data-map-action="back"]');
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked back-to-country button:', backClicked);
  if (!backClicked) {
    throw new Error('Could not find/click [data-map-action="back"] button to return to country level');
  }
  await pollUntil(() => getDrillState(page), (s) => s.drillLabel && s.drillLabel.includes('国家'), {
    timeoutMs: 5000,
    label: 'waiting for back-to-country scope (国家)',
  });
  await waitForLabelCountStable(page, { label: 'back-to-country', timeoutMs: 8000 });

  const insetBeforeZoom = await getSouthSeaInsetWidth(page);
  console.log('South sea inset rect BEFORE zoom:', insetBeforeZoom);

  // ---- wheel-zoom camera as close as possible ----
  await page.mouse.move(960, 540);
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -400);
    await sleep(80);
  }

  // ---- 06: keep waiting until the inset's rect stops changing size ----
  const insetInfo = await waitForSouthSeaInsetStable(page);
  console.log('South sea inset rect (stable):', insetInfo);
  await assertCanvasRendering(page, '06-south-sea-inset-zoomed', '.map-host canvas');
  await page.screenshot({ path: path.join(outDir, '06-south-sea-inset-zoomed.png') });
  console.log('Captured 06-south-sea-inset-zoomed.png');

  fs.writeFileSync(
    path.join(outDir, '_capture-meta.json'),
    JSON.stringify(
      {
        url,
        capturedAt: new Date().toISOString(),
        introState,
        zhejiangLabel: zhejiang,
        southSeaInset: insetInfo,
      },
      null,
      2,
    ),
  );

  await browser.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('CAPTURE FAILED:', err);
  process.exit(1);
});
