# three-scope-map 技能增加 React 支持 · 设计文档

日期：2026-08-02
状态：已确认，待编写实施计划

## 1. 背景与问题

`three-scope-map` 技能当前只交付 Vue 模板。核心资产是 `assets/templates/smart-mine-vue/` 下两个巨型单文件组件：

- `EarthView.vue`：3199 行（`<script setup>` 2770 行）
- `ZhejiangThreeMap.vue`：2763 行（`<script setup>` 2500 行）

技能的全部价值集中在这约 5300 行经过视觉验证的 Three.js 逻辑上，SKILL.md 用 21 条规则 + 一节「非协商 one-to-one 规则」把它锁定为唯一视觉基线，并由 `verify_template_integrity.py` + `assets/template-manifest.json` 做哈希校验。

调查发现这两个文件对 Vue 的耦合极薄，只用到 5 个 API：`ref`、`watch`、`onMounted`、`onBeforeUnmount`、`defineProps/defineEmits`。全部响应式状态只有 5 处：

| 原 Vue 响应式 | 实际作用 |
| --- | --- |
| `isTransitioning`（EarthView） | 切换宿主元素 `is-transitioning` 类 |
| `southSeaInsetWidth`（ZhejiangThreeMap） | 设置南海插图 SVG 的 px 宽度 |
| `activeScope` + `props.active` | 切换南海插图 `is-visible` 类 |
| `props.active` / `props.startIntro` | 被普通函数读取的布尔开关 |
| `emit(...)` | `ready` / `scene-ready` / `intro-ready` / `handoff-start` / `enter-china` / `mode-change` |

标签层、下钻按钮等运行时 DOM 本来就是 `document.createElement` 创建的；`<style scoped>` 里的 `:deep()` 也全部包在这些 JS 创建的元素上（canvas、`.map-label-layer`、`.map-drill-control`、`.south-sea-inset`）。

结论：把渲染逻辑抽成框架无关的核心是机械操作，不是重写。

## 2. 目标与非目标

### 目标

- 技能能按目标框架交付 Vue 或 React（Vite + React 19，纯 CSR）的 3D 地图项目。
- Vue 与 React 两边的渲染输出物理上不可能漂移。
- 保留现有交付路径：整目录复制模板即可 `npm run dev`。
- `check_three_map_project.py` / `verify_template_integrity.py` 两条质量闸门对两个框架同样有效。

### 非目标

- 不修改任何 Three.js 渲染逻辑、着色器、视觉参数、相机行为、动效时序。
- 不新增 Next.js 模板（只在文档补一节接入说明）。
- 不重构与框架无关的 references（如 `map-migration-playbook.md` 的迁移步骤本身）。
- 不改动 `assets/templates/` 下三个独立助手模板（`mapDataAdapter.ts`、`frameChunkedRebuild.ts`、`cameraPresetController.ts`）。

## 3. 已决策的选型

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| React 运行环境 | Vite + React 19，纯 CSR | 与现有 Vue 模板对称，交付流程一致 |
| 实现方案 | 抽出框架无关核心 + Vue/React 双薄壳 | 5300 行逻辑只存在一份，是长期兑现「两框架一致」的唯一做法；当前 Vue 耦合薄到只有 5 个 API |
| 模板形态 | 双可运行模板，代码真源在 `map-core/`，sync 脚本同步 | agent 照旧整目录复制，SKILL.md 交付流程几乎不变；漂移风险由脚本兜住 |

被否决的方案：

- **并行 React 模板（Vue 一字不动）**：5300 行逻辑 + 21MB 资产双份，之后每个视觉修复要改两遍，对以 one-to-one 保真为纲领的技能是慢性中毒。
- **React 壳内 `createApp` 挂载 Vue 组件**：React 用户需安装 `vue` + `@vitejs/plugin-vue`，不算真正的 React 支持。

## 4. 架构

### 4.1 核心模块 API

三个模块，纯 TypeScript + 原生 DOM，零框架依赖：

```ts
// map-core/core/earthViewCore.ts
export function createEarthView(
  container: HTMLElement,
  opts?: {
    onSceneReady?(): void;
    onIntroReady?(): void;
    onHandoffStart?(): void;
    onEnterChina?(): void;
  },
): {
  setStartIntro(value: boolean): void;
  destroy(): void;
};

// map-core/core/scopeMapCore.ts
export function createScopeMap(
  container: HTMLElement,
  opts?: { onReady?(): void },
): {
  setActive(value: boolean): void;
  destroy(): void;
};

// map-core/core/earthChinaMapCore.ts
export function createEarthChinaMap(
  container: HTMLElement,
  opts?: { onModeChange?(mode: 'earth' | 'china'): void },
): {
  destroy(): void;
};
```

### 4.2 原 SFC 各块的去向

| 原位置 | 新位置 |
| --- | --- |
| `EarthView.vue` `<script setup>` | `core/earthViewCore.ts` 工厂函数体（原样搬运） |
| `EarthView.vue` `<template>` 的静态装饰 DOM（`earth-backdrop`、`dive-atmosphere`、`dive-cloudscape` + 5 层 `cloud-bank` + `dive-cloud-texture`、`dive-cloud-haze`、`dive-vignette`） | `core/earthViewCore.ts` 内用 `document.createElement` 构建 |
| `EarthView.vue` `<style scoped>` | `core/earthViewCore.css` |
| `ZhejiangThreeMap.vue` `<script setup>` | `core/scopeMapCore.ts`（原样搬运） |
| `ZhejiangThreeMap.vue` `<template>`（`.map-stage`、`.map-host`、南海插图 SVG 及其 `southSeaInsetPaths` 循环） | `core/scopeMapCore.ts` 内构建 |
| `ZhejiangThreeMap.vue` `<style scoped>` | `core/scopeMapCore.css` |
| `EarthChinaMap.vue` 握手状态机 + 舞台 DOM | `core/earthChinaMapCore.ts` |
| `EarthChinaMap.vue` `<style scoped>` | `core/earthChinaMapCore.css` |
| `mapTheme.ts` / `mapDataAdapter.ts` / `mapTerrainMaterial.ts` / `types/geo.ts` | `map-core/shared/` 原样 |

`ChinaMap.vue` 当前只是 `ZhejiangThreeMap` 的透传壳，抽取后由各框架的 `ChinaMap` 壳承担同一角色，文件名保留以维持 SKILL.md 与检查脚本的连续性。`ZhejiangThreeMap.vue` 在抽取后不再存在，其身份由 `core/scopeMapCore.ts` 承接。

### 4.3 响应式状态的等价实现

| 原实现 | 核心内实现 |
| --- | --- |
| `isTransitioning.value = true` | `hostEl.classList.toggle('is-transitioning', v)`，内部保留 `let isTransitioning` 供逻辑判断 |
| `southSeaInsetWidth.value = n` | `svgEl.style.width = ` + px |
| `activeScope` / `props.active` 组合 | `svgEl.classList.toggle('is-visible', active && scope === 'country')` |
| `props.active` | 模块内 `let active`，由 `setActive()` 写入 |
| `props.startIntro` + `watch` | 模块内 `let startIntro`，由 `setStartIntro()` 写入并触发 `requestIntroStart?.()` |
| `emit('x')` | 调用 `opts.onX?.()` |

`props.active` 在 async 循环里于 `await waitForNextFrame()` 之后被读取，普通可变变量的读取时机与 `.value` 完全一致，语义不变。

### 4.4 CSS 作用域

`<style scoped>` 变为普通 CSS 文件，由核心模块 `import './xxx.css'` 引入。三点说明：

- `:deep(...)` 直接去壳变成普通后代选择器 —— 它包裹的全是 JS 动态创建的元素，原本就不带 scoped 属性。
- `EarthChinaMap.vue` 的 `.china-map-stage:not(.is-active) :deep(.map-host)` 同理。
- 类名全部保持原样（`.earth-view`、`.map-stage`、`.map-host`、`.south-sea-inset`、`.cloud-bank` 等），因为部分类名被 JS 引用，且检查脚本按类名做正则匹配。

这是本次改动中唯一的真实行为变化（scoped → 全局），必须靠截图对比验证。

### 4.5 异步分包

`earthChinaMapCore.ts` 内用 `await import('./scopeMapCore')` 替代 `defineAsyncComponent(() => import('./ChinaMap.vue'))`。Vite 对动态 import 照样拆 chunk，首屏收益与现状等价：Earth 先绘制，目标地图核心在 `scene-ready` 后才加载。

### 4.6 框架薄壳

每框架 3 个组件，每个约 25 行。React 示例：

```tsx
export function EarthChinaMap({ onModeChange }: { onModeChange?(m: 'earth' | 'china'): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const instance = createEarthChinaMap(ref.current!, { onModeChange });
    return () => instance.destroy();
  }, []);
  return <div ref={ref} className="earth-china-map" />;
}
```

React 18/19 的 `StrictMode` 会让 effect 挂载两次，因此 `destroy()` 必须真正清干净（现有 `onBeforeUnmount` 已覆盖 renderer / composer / controls / texture / 事件监听 / DOM 节点，需逐项确认可重入）。这是 React 侧的专项验证点。

## 5. 目录结构

```
assets/
  template-manifest.json          # 键以 assets/templates/ 为根，覆盖三个目录
  templates/
    map-core/                     # 代码唯一真源，不可独立运行
      core/earthViewCore.ts
      core/earthViewCore.css
      core/scopeMapCore.ts
      core/scopeMapCore.css
      core/earthChinaMapCore.ts
      core/earthChinaMapCore.css
      shared/mapTheme.ts
      shared/mapDataAdapter.ts
      shared/mapTerrainMaterial.ts
      shared/types/geo.ts
    smart-mine-vue/               # 可运行；同时是 21MB 资产的真源
      src/components/map/core/*           <- sync 生成
      src/components/map/{mapTheme,mapDataAdapter,mapTerrainMaterial}.ts   <- sync 生成
      src/components/map/{EarthChinaMap,EarthView,ChinaMap}.vue            <- 手写壳
      src/types/geo.ts                     <- sync 生成
      src/{App.vue,main.ts,style.css}
      src/assets/{maps,textures}/**        <- 真源，哈希不变
      index.html package.json tsconfig.json vite.config.ts
    smart-mine-react/             # 可运行，与 vue 同构
      src/components/map/core/*           <- sync 生成
      src/components/map/{mapTheme,mapDataAdapter,mapTerrainMaterial}.ts   <- sync 生成
      src/components/map/{EarthChinaMap,EarthView,ChinaMap}.tsx            <- 手写壳
      src/types/geo.ts                     <- sync 生成
      src/{App.tsx,main.tsx,style.css}
      src/assets/{maps,textures}/**        <- 从 vue 模板 sync
      index.html package.json tsconfig.json tsconfig.node.json vite.config.ts
    mapDataAdapter.ts             # 现有独立助手模板，不动
    frameChunkedRebuild.ts
    cameraPresetController.ts
```

资产真源保持在 `smart-mine-vue/src/assets/`，其 21MB 文件哈希不变，降低 manifest 变更面。仓库体积从约 68MB 增至约 89MB。

React 模板依赖：`react` ^19、`react-dom` ^19、`three` ^0.176、`gsap` ^3.15；devDeps `@vitejs/plugin-react`、`@types/react`、`@types/react-dom`、`@types/three`、`typescript`、`vite`。构建脚本 `tsc --noEmit && vite build`（Vue 侧是 `vue-tsc --noEmit && vite build`）。

## 6. 脚本改动

### 6.1 新增 `scripts/sync_map_templates.py`

职责：

1. 把 `map-core/core/*` 与 `map-core/shared/*` 复制到两个模板的对应位置（`shared/types/geo.ts` → `src/types/geo.ts`，其余 `shared/*` → `src/components/map/`）。
2. 把 `smart-mine-vue/src/assets/` 同步到 `smart-mine-react/src/assets/`。

参数：默认写入；`--check` 只比对并在不同步时以退出码 1 报告差异文件列表。

约定：任何核心改动只改 `map-core/`，随后跑一次 sync。

### 6.2 `verify_template_integrity.py`

- `TEMPLATE_ROOT` 单目录改为三个根：`map-core/`、`smart-mine-vue/`、`smart-mine-react/`。
- manifest 键改为相对 `assets/templates/` 的路径。
- 镜像一致性不在此脚本内断言，由 `sync_map_templates.py --check` 负责，两个脚本职责不重叠。

### 6.3 `check_three_map_project.py` 框架自适应

- 新增框架判定：读目标 `package.json`，含 `react` 判为 react，含 `vue` 判为 vue；两者皆无则报 blocker。
- `package_status()`：必需依赖由固定的 `vue/vite/three` 改为 `three` + `vite` + 框架对应依赖（vue，或 react + react-dom）。
- `REQUIRED_EARTH_FILES`：`src/components/map/EarthView.vue` 等三个 `.vue` 换成
  `src/components/map/core/earthViewCore.ts`、`core/earthChinaMapCore.ts`、`core/scopeMapCore.ts`
  加上框架对应的三个壳（`.vue` 或 `.tsx`）。资产与 `mapTheme.ts` 条目不变。
- `map_components` 的 glob：改为定位 `src/components/map/core/scopeMapCore.ts` 与框架壳，兼容 `.tsx`。
- `EARTH_EFFECT_PATTERNS` 扫描目标由 `EarthView.vue` 改为 `core/earthViewCore.ts`；其中
  `Earth handoff events` 正则 `intro-ready[\s\S]*handoff-start[\s\S]*enter-china`
  → `onIntroReady[\s\S]*onHandoffStart[\s\S]*onEnterChina`。
- 预热隔离检查（`isolated_preload_ok`）的 Vue 语法正则替换为核心等价物：
  - `emit('scene-ready')` → `onSceneReady`
  - `:start-intro="chinaReady"` → `setStartIntro(`
  - `defineAsyncComponent(() => import('./ChinaMap.vue'))` → `await import\(['"]\./scopeMapCore['"]\)`
  - `prepareChinaMap[\s\S]*chinaMounted\.value\s*=\s*true` → `prepareChinaMap[\s\S]*chinaMounted\s*=\s*true`（核心内保留 `prepareChinaMap` 函数名与 `chinaMounted` 变量名，仅去掉 `.value`）
  - `world.earth-render.json` 与排除 `world.json` 的断言不变。
- 静态帧交接检查（`static_handoff_ok`）：`:active="mode === 'china'"` → 核心内 `setActive(`；其余 `settleMapForStaticFrame` / `startMapAnimation` / `stopMapAnimation` 不变。
- 主题连线检查：`mapTheme` import 的扫描目标改到 core 文件。
- 与框架无关的检查（追光缎带 11 条正则、南海 62–92px、`.map-host` 固定尺寸、SVG 兜底、全图透明贴图面、隐私/看板内容、`EarthViewLegacy`/`earthVersion` 分叉）逻辑不变，仅扩大扫描后缀到 `.tsx` 并指向 core 路径。

### 6.4 `apply_map_theme.py`

无需改动。已确认该脚本只接受 `mapTheme.ts` 路径或项目目录（后者拼接固定路径 `src/components/map/mapTheme.ts`），并只按 `MAP_THEME_PRIMARY` / `mapTheme` 对象正则改写，不依赖任何 `.vue` 文件。两个模板中该路径一致。

## 7. 文档改动

- **SKILL.md**
  - `description` 增加 React。
  - 新增一条核心规则：先确认目标框架 —— 按目标项目 `package.json` 判定；无目标项目时默认 Vue，并主动告知可选 React。
  - 规则 15、16 及全文中的 `EarthView.vue` / `EarthChinaMap.vue` / `ChinaMap.vue` / `ZhejiangThreeMap.vue` 文件名，改为「core 模块 + 对应框架壳」表述。
  - Scripts 一节增加 `sync_map_templates.py` 与 `smart-mine-react` 模板条目。
  - Common Commands 增加 React 模板相关命令与 sync 命令。
  - Delivery Checklist 增加两项：声明目标框架；`sync_map_templates.py --check` 通过。
- **references**（共 25 处 Vue 措辞）：`one-to-one-template.md`(9)、`earth-view.md`(10)、`performance-pipeline.md`(3)、`three-scope-map-template.md`(2)、`map-migration-playbook.md`(1)。`three-scope-map-template.md` 补 React 组件结构；其余改为框架无关表述并在需要处给出双框架示例。Next.js 接入说明（`'use client'` + `dynamic(..., { ssr: false })` + 静态资源路径）作为一节加入 `three-scope-map-template.md`。
- **README.md**（13 处 Vue 措辞）：补 React 快速开始与两个模板的说明。
- **agents/openai.yaml**：`default_prompt` 去掉硬编码的 "Vue template"，改为按目标框架选择模板。

## 8. 验证标准

全部通过才算完成：

1. `smart-mine-vue` 与 `smart-mine-react` 各自 `npm install && npm run build` 成功。
2. 两边 `npm run dev` 打开并截图对比以下 6 个状态，视觉一致：Earth 首屏、intro 结束、云层交接、中国图落位、省级下钻、南海插图（含相机拉远/推近时的 62–92px 宽度变化）。
3. 对两个模板自身运行 `check_three_map_project.py <template> --strict`，无 blocker。
4. `sync_map_templates.py --check` 通过。
5. `verify_template_integrity.py` 在 `--update` 重算后通过。
6. React `StrictMode` 下双挂载：无重复 canvas、无 WebGL context 泄漏（浏览器控制台无 context lost 警告）、`destroy()` 可重入。
7. Vue 侧回归：抽取前后截图逐项对比，确认 scoped → 全局 CSS 未产生样式泄漏或丢失。

## 9. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| scoped CSS 变全局后样式泄漏或被覆盖 | 类名全部保持原样、核心自带 CSS 一起引入；逐状态截图对比；模板本身是全屏应用，外部选择器冲突面小 |
| 5300 行搬运过程中引入笔误 | 逐块搬运，不重排、不重命名局部变量；搬运后先跑 Vue 侧回归截图，确认与抽取前一致，再做 React 壳 |
| React StrictMode 双挂载导致资源泄漏 | 专项验证项 6；必要时在核心内加幂等 `destroyed` 标记 |
| 检查脚本正则改写后失去原有拦截力 | 每条改写的正则都在改造后的模板上验证「应通过」，并人工构造一次「应拦截」的反例 |
| 两个模板的 core 副本被误改 | `sync_map_templates.py --check` 纳入交付清单；core 文件顶部加注释说明真源在 `map-core/` |
