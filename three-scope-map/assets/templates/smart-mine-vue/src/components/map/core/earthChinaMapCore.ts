// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
//
// 本文件是框架无关的渲染核心，真源位于 assets/templates/map-core/。
// 不要直接编辑模板里的副本；改动后请运行 scripts/sync_map_templates.py。
import { createEarthView, type EarthViewHandle } from './earthViewCore';
import type { ScopeMapHandle } from './scopeMapCore';
import './earthChinaMapCore.css';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

export type EarthChinaMapMode = 'earth' | 'china';
export type EarthChinaMapHandle = { destroy(): void };

export function createEarthChinaMap(
  container: HTMLElement,
  opts: { onModeChange?(mode: EarthChinaMapMode): void } = {},
): EarthChinaMapHandle {
  const root = document.createElement('div');
  root.className = 'earth-china-map';
  container.appendChild(root);

  let mode: EarthChinaMapMode = 'earth';
  let chinaMounted = false;
  let chinaReady = false;
  let handoffActive = false;
  let pendingChinaEntry = false;
  let pendingHandoff = false;
  let destroyed = false;
  let handoffCleanupHandle: number | undefined;
  let chinaStage: HTMLDivElement | undefined;
  let chinaMap: ScopeMapHandle | undefined;

  function syncStageClasses() {
    if (!chinaStage) return;
    chinaStage.classList.toggle('is-active', mode === 'china');
    chinaStage.classList.toggle('is-handoff', handoffActive);
    chinaStage.classList.toggle('is-ready', chinaReady);
  }

  function showChinaMap() {
    if (!chinaReady) {
      pendingChinaEntry = true;
      void prepareChinaMap();
      return;
    }
    mode = 'china';
    chinaMap?.setActive(true);
    syncStageClasses();
    syncEarthVisibility();
    opts.onModeChange?.(mode);
    handoffCleanupHandle = globalThis.setTimeout(() => {
      handoffActive = false;
      syncStageClasses();
    }, 920);
  }

  function beginChinaHandoff() {
    if (!chinaReady) {
      pendingHandoff = true;
      void prepareChinaMap();
      return;
    }
    handoffActive = true;
    syncStageClasses();
  }

  function onChinaReady() {
    chinaReady = true;
    // 等价于原 template 的 :start-intro="chinaReady" —— 目标地图静态帧就绪后才放行地球 intro
    earth.setStartIntro(true);
    syncStageClasses();
    if (pendingHandoff) {
      pendingHandoff = false;
      beginChinaHandoff();
    }
    if (!pendingChinaEntry) return;
    pendingChinaEntry = false;
    showChinaMap();
  }

  async function prepareChinaMap() {
    if (chinaMounted) return;
    chinaMounted = true;
    chinaStage = document.createElement('div');
    chinaStage.className = 'china-map-stage';
    root.insertBefore(chinaStage, root.firstChild);
    syncStageClasses();
    const { createScopeMap } = await import('./scopeMapCore');
    if (destroyed) return;
    // active: false 等价于原 template 的 <ChinaMap :active="mode === 'china'">，挂载时 mode 还是 'earth'
    chinaMap = createScopeMap(chinaStage, { active: false, onReady: onChinaReady });
  }

  function syncEarthVisibility() {
    earth.element.style.display = mode === 'earth' ? '' : 'none';
  }

  const earth: EarthViewHandle = createEarthView(root, {
    onSceneReady: () => void prepareChinaMap(),
    onHandoffStart: beginChinaHandoff,
    onEnterChina: showChinaMap,
  });
  // createEarthView 的 startIntro 初值是 true，这里立刻关门，等 onChinaReady 再放行
  earth.setStartIntro(false);

  function destroy() {
    destroyed = true;
    if (handoffCleanupHandle !== undefined) globalThis.clearTimeout(handoffCleanupHandle);
    chinaMap?.destroy();
    chinaMap = undefined;
    earth.destroy();
    root.remove();
  }

  return { destroy };
}
