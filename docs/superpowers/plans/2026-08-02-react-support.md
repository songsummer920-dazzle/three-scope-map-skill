# three-scope-map React 支持 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 three-scope-map 技能里约 5300 行 Three.js 渲染逻辑从 Vue 单文件组件里抽成框架无关的 TypeScript 核心，让技能能同时交付 Vue 和 React（Vite + React 19，纯 CSR）两套可运行模板。

**Architecture:** 三个核心工厂函数（`createEarthView` / `createScopeMap` / `createEarthChinaMap`）用纯 TS + 原生 DOM 承载全部渲染逻辑、装饰 DOM 与 CSS；每个框架只保留三个约 25 行的薄壳组件。核心代码真源放 `assets/templates/map-core/`，由 `sync_map_templates.py` 同步到两个可运行模板；21MB 地图/贴图资产真源留在 `smart-mine-vue/src/assets/`，同样由该脚本同步到 React 模板。

**Tech Stack:** TypeScript 5.9、Three.js 0.176、GSAP 3.15、Vite 7、Vue 3.5、React 19、Python 3（技能校验脚本）

## Global Constraints

以下约束对每个任务都生效：

- **不修改任何 Three.js 渲染逻辑、着色器源码、视觉参数、相机行为、动效时序。** 本次改动是搬运，不是重写。搬运时不重排语句、不重命名局部变量、不"顺手优化"。
- **所有 CSS 类名保持原样**：`.earth-view`、`.earth-backdrop`、`.dive-atmosphere`、`.dive-cloudscape`、`.cloud-bank`、`.dive-cloud-texture`、`.dive-cloud-haze`、`.dive-vignette`、`.earth-china-map`、`.china-map-stage`、`.map-stage`、`.map-host`、`.map-label-layer`、`.map-drill-control`、`.south-sea-inset`、`.south-sea-inset__frame`、`.south-sea-inset__glow`、`.south-sea-inset__line`、`.is-active`、`.is-handoff`、`.is-ready`、`.is-transitioning`、`.is-visible`、`.map-page`。JS 会引用它们，检查脚本也按类名做正则匹配。
- **每个新建或修改的源文件顶部必须保留归属信息**，格式与现有文件一致：
  ```ts
  // SPDX-License-Identifier: GPL-3.0-or-later
  // Copyright (c) 2026 宋夏天Dazzle
  // 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  // Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
  ```
  归属信息只能出现在注释/元数据里，**不得**渲染进 UI（不加 DOM 元素、canvas 文字、sprite、CSS 伪元素）。CSS 文件用 `/* */` 形式。不支持注释的配置文件（`package.json`、`tsconfig.json`、`index.html`）不加 —— 与现有 Vue 模板保持一致。
- **核心代码唯一真源是 `assets/templates/map-core/`。** 任何核心改动必须改 `map-core/` 里的文件，然后运行 `python3 three-scope-map/scripts/sync_map_templates.py`。绝不直接编辑两个模板里 `src/components/map/core/` 下的副本。
- **资产唯一真源是 `assets/templates/smart-mine-vue/src/assets/`**（16MB maps + 4.8MB textures）。React 模板的资产由 sync 脚本生成。
- **每个任务的最后一步都要跑** `python3 three-scope-map/scripts/verify_template_integrity.py --update` 重算 manifest，并把 manifest 一起提交。
- 版本下限：Node `^20.19.0 || >=22.12.0`；React `^19`；`react-dom` `^19`；`three` `^0.176.0`；`gsap` `^3.15.0`；`typescript` `^5.9.3`；`vite` `^7.3.6`。
- 所有命令的工作目录若无特别说明，均为仓库根目录 `/Users/lijiaxi/prj/skills/three-scope-map-skill`。

---

## 文件结构

**新建：**

| 路径 | 职责 |
| --- | --- |
| `three-scope-map/assets/templates/map-core/core/scopeMapCore.ts` | 省/国/世界级 3D 地图渲染核心，导出 `createScopeMap` |
| `three-scope-map/assets/templates/map-core/core/scopeMapCore.css` | 上者的样式（原 `ZhejiangThreeMap.vue` 的 `<style scoped>`） |
| `three-scope-map/assets/templates/map-core/core/earthViewCore.ts` | 地球入口渲染核心，导出 `createEarthView` |
| `three-scope-map/assets/templates/map-core/core/earthViewCore.css` | 上者的样式 |
| `three-scope-map/assets/templates/map-core/core/earthChinaMapCore.ts` | 地球→中国图的握手状态机与舞台 DOM，导出 `createEarthChinaMap` |
| `three-scope-map/assets/templates/map-core/core/earthChinaMapCore.css` | 上者的样式 |
| `three-scope-map/assets/templates/map-core/shared/mapTheme.ts` | 主题（从 vue 模板原样移入） |
| `three-scope-map/assets/templates/map-core/shared/mapDataAdapter.ts` | 数据适配器（原样移入） |
| `three-scope-map/assets/templates/map-core/shared/mapTerrainMaterial.ts` | 地形材质（原样移入） |
| `three-scope-map/assets/templates/map-core/shared/style.css` | 全局基础样式（原 `src/style.css` + `.map-page`） |
| `three-scope-map/assets/templates/map-core/shared/types/geo.ts` | GeoJSON 类型（原样移入） |
| `three-scope-map/scripts/sync_map_templates.py` | 把 map-core 与资产同步到两个模板；`--check` 只校验 |
| `three-scope-map/assets/templates/smart-mine-react/**` | React 19 + Vite 可运行模板 |

**修改：**

| 路径 | 改动 |
| --- | --- |
| `three-scope-map/assets/templates/smart-mine-vue/src/components/map/EarthChinaMap.vue` | 收敛为约 25 行薄壳 |
| `.../smart-mine-vue/src/components/map/EarthView.vue` | 收敛为约 25 行薄壳 |
| `.../smart-mine-vue/src/components/map/ChinaMap.vue` | 收敛为约 25 行薄壳 |
| `.../smart-mine-vue/src/App.vue` | 去掉 scoped 样式（`.map-page` 移入共享 `style.css`） |
| `three-scope-map/scripts/verify_template_integrity.py` | 单根改三根扫描 |
| `three-scope-map/scripts/check_three_map_project.py` | 框架自适应 + 检查目标改指 core |
| `three-scope-map/SKILL.md` | 框架选择规则、文件名、脚本、命令、交付清单 |
| `three-scope-map/references/{one-to-one-template,earth-view,performance-pipeline,three-scope-map-template,map-migration-playbook}.md` | 25 处 Vue 措辞 |
| `README.md` | 13 处 Vue 措辞 + React 快速开始 |
| `three-scope-map/agents/openai.yaml` | `default_prompt` 去掉硬编码 Vue |

**删除：**

| 路径 | 原因 |
| --- | --- |
| `.../smart-mine-vue/src/components/map/ZhejiangThreeMap.vue` | 逻辑迁入 `core/scopeMapCore.ts`，壳由 `ChinaMap.vue` 承担 |
| `.../smart-mine-vue/src/style.css`、`src/types/geo.ts`、`src/components/map/{mapTheme,mapDataAdapter,mapTerrainMaterial}.ts` | 不再手写，改由 sync 从 map-core 生成（路径与内容不变） |

---

### Task 1: 建立抽取前的 Vue 视觉基线

抽取 5300 行代码的唯一安全网是"改动前后截图逐张对比"。这个任务不写业务代码，只固化基线。

**Files:**
- Create: `docs/superpowers/baselines/2026-08-02-vue-before/*.png`（6 张截图）
- Create: `docs/superpowers/baselines/2026-08-02-vue-before/README.md`

**Interfaces:**
- Consumes: 无
- Produces: 6 张基准截图，文件名固定为 `01-earth-first-paint.png`、`02-earth-intro-done.png`、`03-cloud-handoff.png`、`04-china-settled.png`、`05-province-drilldown.png`、`06-south-sea-inset-zoomed.png`。Task 3/4/5/7 的验证步骤按这些文件名逐张对比。

- [ ] **Step 1: 安装模板依赖**

```bash
cd three-scope-map/assets/templates/smart-mine-vue
npm install
```

Expected: 安装成功，无 `ERESOLVE` 错误。

- [ ] **Step 2: 确认改动前两条质量闸门是绿的**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/verify_template_integrity.py
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict
```

Expected: 前者打印 `Bundled template integrity check passed: 31 files`；后者退出码 0，`BLOCKERS` 一节只有 `None`。

如果这里就已经失败，**停下来报告**，不要继续 —— 说明基线本身有问题，后续对比会失去意义。

- [ ] **Step 3: 启动 dev server**

```bash
cd three-scope-map/assets/templates/smart-mine-vue
npm run dev
```

Expected: 输出 `http://127.0.0.1:5173/`。让它在后台持续运行。

- [ ] **Step 4: 逐个状态截图**

用 `claude-in-chrome` 技能打开 `http://127.0.0.1:5173/`，按下表操作并截图；若浏览器自动化不可用，请人工截图并放到同一目录。

| 文件名 | 操作 | 时机 |
| --- | --- | --- |
| `01-earth-first-paint.png` | 加载页面 | 加载后约 0.5s，地球尚在 intro 中 |
| `02-earth-intro-done.png` | 等待 intro 结束 | 加载后约 6s，地球完全显现、国际飞线运行、扫描带可见 |
| `03-cloud-handoff.png` | 在地球上点击一次 | 点击后约 1.5s，云层俯冲中 |
| `04-china-settled.png` | 承上 | 点击后约 4s，中国地图完成落位，标签/涟漪/飞线/追光可见 |
| `05-province-drilldown.png` | 点击浙江省 | 下钻后约 2s，省级地图与下钻返回按钮可见 |
| `06-south-sea-inset-zoomed.png` | 回到国家层级后，滚轮把相机推到最近 | 南海插图可见，记录其像素宽度 |

- [ ] **Step 5: 记录基线元数据**

在 `docs/superpowers/baselines/2026-08-02-vue-before/README.md` 里写明：截图日期、Vue 模板的 git commit hash、浏览器与窗口尺寸、第 6 张图里南海插图的实测像素宽度。

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
git rev-parse HEAD
```

- [ ] **Step 6: 提交**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
git add docs/superpowers/baselines
git commit -m "chore: 归档 Vue 模板抽取前的视觉基线截图"
```

---

### Task 2: 建立 map-core 与同步脚本

先把低风险的基础设施跑通再动大文件。这个任务只搬运 4 个已经是纯 TS 的共享文件和 `style.css`，内容零改动 —— 用它来验证 sync 机制与多根完整性校验是否正确。

**Files:**
- Create: `three-scope-map/assets/templates/map-core/shared/{mapTheme.ts,mapDataAdapter.ts,mapTerrainMaterial.ts,style.css}`
- Create: `three-scope-map/assets/templates/map-core/shared/types/geo.ts`
- Create: `three-scope-map/scripts/sync_map_templates.py`
- Modify: `three-scope-map/scripts/verify_template_integrity.py`
- Modify: `three-scope-map/assets/templates/smart-mine-vue/src/App.vue`
- Modify: `three-scope-map/assets/template-manifest.json`

**Interfaces:**
- Consumes: 无
- Produces:
  - `sync_map_templates.py` 的 CLI：无参数 = 写入同步；`--check` = 只比对，不同步时打印差异文件列表并以退出码 1 结束。
  - 同步映射表（后续任务新增核心文件时按此表放置，无需改脚本）：
    - `map-core/core/*` → `<template>/src/components/map/core/*`
    - `map-core/shared/types/*` → `<template>/src/types/*`
    - `map-core/shared/style.css` → `<template>/src/style.css`
    - `map-core/shared/*.ts` → `<template>/src/components/map/*.ts`
    - `smart-mine-vue/src/assets/**` → `smart-mine-react/src/assets/**`
  - `verify_template_integrity.py` 的 manifest 键格式：相对 `three-scope-map/assets/templates/` 的 POSIX 路径，例如 `smart-mine-vue/src/main.ts`、`map-core/core/scopeMapCore.ts`。

- [ ] **Step 1: 移动共享文件到 map-core**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill/three-scope-map/assets/templates
mkdir -p map-core/core map-core/shared/types
git mv smart-mine-vue/src/components/map/mapTheme.ts          map-core/shared/mapTheme.ts
git mv smart-mine-vue/src/components/map/mapDataAdapter.ts    map-core/shared/mapDataAdapter.ts
git mv smart-mine-vue/src/components/map/mapTerrainMaterial.ts map-core/shared/mapTerrainMaterial.ts
git mv smart-mine-vue/src/types/geo.ts                        map-core/shared/types/geo.ts
git mv smart-mine-vue/src/style.css                           map-core/shared/style.css
```

**内容一个字符都不要改**（除下一步往 `style.css` 追加 `.map-page`）。这几个文件里的相对 import（例如 `mapTerrainMaterial.ts` 引用贴图、`mapDataAdapter.ts` 引用 maps）在同步落位后路径与今天完全一致，因此不需要调整。

- [ ] **Step 2: 把 `.map-page` 并入共享 style.css**

`App.vue` 的 scoped 样式要挪成共享全局样式，两个框架才能共用。在 `map-core/shared/style.css` 末尾追加：

```css
.map-page {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000201;
}
```

然后把 `smart-mine-vue/src/App.vue` 的 `<style scoped>` 整块删掉，只留：

```vue
<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
-->
<template>
  <main class="map-page">
    <EarthChinaMap />
  </main>
</template>

<script setup lang="ts">
import EarthChinaMap from './components/map/EarthChinaMap.vue';
</script>
```

- [ ] **Step 3: 写同步脚本**

创建 `three-scope-map/scripts/sync_map_templates.py`：

```python
#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 宋夏天Dazzle
"""Sync the map-core source of truth into the runnable Vue/React templates.

作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""

from __future__ import annotations

import argparse
import filecmp
import shutil
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = SKILL_ROOT / "assets/templates"
CORE = TEMPLATES / "map-core"
VUE = TEMPLATES / "smart-mine-vue"
REACT = TEMPLATES / "smart-mine-react"
TARGETS = (VUE, REACT)
IGNORED_NAMES = {"node_modules", "dist", ".DS_Store"}


def core_pairs(target: Path) -> list[tuple[Path, Path]]:
    """(source, destination) for every file map-core owns in `target`."""
    pairs: list[tuple[Path, Path]] = []
    for source in sorted((CORE / "core").rglob("*")):
        if source.is_file():
            pairs.append((source, target / "src/components/map/core" / source.relative_to(CORE / "core")))
    for source in sorted((CORE / "shared/types").rglob("*")):
        if source.is_file():
            pairs.append((source, target / "src/types" / source.relative_to(CORE / "shared/types")))
    for source in sorted((CORE / "shared").glob("*")):
        if not source.is_file():
            continue
        if source.name == "style.css":
            pairs.append((source, target / "src/style.css"))
        else:
            pairs.append((source, target / "src/components/map" / source.name))
    return pairs


def asset_pairs() -> list[tuple[Path, Path]]:
    """Vue template assets are the source of truth for the React template."""
    source_root = VUE / "src/assets"
    pairs: list[tuple[Path, Path]] = []
    if not REACT.exists():
        return pairs
    for source in sorted(source_root.rglob("*")):
        if source.is_file() and not any(part in IGNORED_NAMES for part in source.parts):
            pairs.append((source, REACT / "src/assets" / source.relative_to(source_root)))
    return pairs


def all_pairs() -> list[tuple[Path, Path]]:
    pairs: list[tuple[Path, Path]] = []
    for target in TARGETS:
        if target.exists():
            pairs.extend(core_pairs(target))
    pairs.extend(asset_pairs())
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only report drift; do not write. Exit 1 when any file is out of sync.",
    )
    args = parser.parse_args()

    pairs = all_pairs()
    drifted = [
        (source, destination)
        for source, destination in pairs
        if not destination.exists() or not filecmp.cmp(source, destination, shallow=False)
    ]

    if args.check:
        if drifted:
            print(f"Template sync check failed: {len(drifted)} file(s) out of sync")
            for source, destination in drifted:
                print(f"  - {destination.relative_to(TEMPLATES).as_posix()}")
            print("\nRun: python3 three-scope-map/scripts/sync_map_templates.py")
            return 1
        print(f"Template sync check passed: {len(pairs)} files")
        return 0

    for source, destination in drifted:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    print(f"Synced {len(drifted)} file(s) of {len(pairs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: 跑同步，确认 Vue 模板文件回到原位且内容不变**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/sync_map_templates.py
git status --short three-scope-map/assets/templates/smart-mine-vue
```

Expected: 同步 5 个文件；`git status` 显示这 5 个路径是 untracked（因为上一步用 `git mv` 移走了）。用 diff 确认内容与移走前一致：

```bash
git diff HEAD -- three-scope-map/assets/templates/smart-mine-vue/src/components/map/mapTheme.ts
```

Expected: 无输出（内容完全一致）。`style.css` 会有 `.map-page` 的新增，这是预期内的唯一差异。

- [ ] **Step 5: 让 sync --check 通过**

```bash
python3 three-scope-map/scripts/sync_map_templates.py --check
```

Expected: `Template sync check passed: 5 files`，退出码 0。

- [ ] **Step 6: 改造完整性校验脚本支持三根**

把 `three-scope-map/scripts/verify_template_integrity.py` 里的 `TEMPLATE_ROOT` 与 `template_files()` / `current_manifest()` 换成多根版本：

```python
TEMPLATES_ROOT = SKILL_ROOT / "assets/templates"
TEMPLATE_ROOTS = (
    TEMPLATES_ROOT / "map-core",
    TEMPLATES_ROOT / "smart-mine-vue",
    TEMPLATES_ROOT / "smart-mine-react",
)
MANIFEST_PATH = SKILL_ROOT / "assets/template-manifest.json"
IGNORED_NAMES = {"node_modules", "dist", ".DS_Store"}


def template_files() -> list[Path]:
    files: list[Path] = []
    for root in TEMPLATE_ROOTS:
        if not root.exists():
            continue
        files.extend(
            path
            for path in root.rglob("*")
            if path.is_file() and not any(part in IGNORED_NAMES for part in path.parts)
        )
    return sorted(files)


def current_manifest() -> dict[str, str]:
    return {
        path.relative_to(TEMPLATES_ROOT).as_posix(): digest(path)
        for path in template_files()
    }
```

`main()`、`digest()`、`--update` 的逻辑不动。注意 `TEMPLATE_ROOTS` 里的 `smart-mine-react` 此刻还不存在 —— `if not root.exists(): continue` 让脚本在 Task 7 之前照常工作。

- [ ] **Step 7: 重算 manifest 并验证**

```bash
python3 three-scope-map/scripts/verify_template_integrity.py --update
python3 three-scope-map/scripts/verify_template_integrity.py
```

Expected: 第一条打印 `Updated ... with 36 files`（原 31 个 vue 文件 - 5 个移走 + 5 个同步回来 + 5 个 map-core 源 = 36）；第二条打印 `Bundled template integrity check passed: 36 files`。若数字对不上，先 `git status` 排查有没有漏掉或多出的文件，再继续。

- [ ] **Step 8: 确认 Vue 模板仍能构建**

```bash
cd three-scope-map/assets/templates/smart-mine-vue
npm run build
```

Expected: 构建成功。这一步证明 `git mv` 后的相对 import 全部仍然正确。

- [ ] **Step 9: 把同步产物排除出 git 追踪之外的判断**

同步产物**要**提交到 git（技能是靠"整目录复制"交付的，副本必须在仓库里）。确认 `.gitignore` 没有把它们排除：

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
git check-ignore -v three-scope-map/assets/templates/smart-mine-vue/src/components/map/mapTheme.ts
```

Expected: 无输出（未被忽略）。

- [ ] **Step 10: 提交**

```bash
git add -A three-scope-map/assets/templates three-scope-map/scripts three-scope-map/assets/template-manifest.json
git commit -m "refactor: 建立 map-core 共享源与模板同步脚本"
```

---

### Task 3: 抽取 scopeMapCore

把 `ZhejiangThreeMap.vue`（2763 行）变成 `core/scopeMapCore.ts` + `core/scopeMapCore.css`，`ChinaMap.vue` 收敛为薄壳。这是本计划里最大的一次搬运。

**Files:**
- Create: `three-scope-map/assets/templates/map-core/core/scopeMapCore.ts`
- Create: `three-scope-map/assets/templates/map-core/core/scopeMapCore.css`
- Modify: `three-scope-map/assets/templates/smart-mine-vue/src/components/map/ChinaMap.vue`
- Delete: `three-scope-map/assets/templates/smart-mine-vue/src/components/map/ZhejiangThreeMap.vue`
- Modify: `three-scope-map/scripts/check_three_map_project.py`

**Interfaces:**
- Consumes: Task 2 的同步映射表（`map-core/core/*` → `src/components/map/core/*`）
- Produces:
  ```ts
  export type ScopeMapHandle = {
    /** 核心创建的 .map-stage 元素，供父级做显隐/类名控制 */
    readonly element: HTMLElement;
    setActive(value: boolean): void;
    destroy(): void;
  };

  export function createScopeMap(
    container: HTMLElement,
    opts?: { active?: boolean; onReady?(): void },
  ): ScopeMapHandle;
  ```
  两处对设计文档 §4.1 的补充，Task 4、Task 5、Task 7 都依赖：
  - `element`：父级需要它做 `v-show` 等价的显隐控制，避免引入会破坏 `position:absolute; inset:0` 链条的包裹 div。
  - `opts.active`（默认 `true`）：`setActive` 有「值未变则早退」的语义（与 Vue `watch` 一致），所以初始值只能在创建时给，不能靠创建后再调 `setActive(false)`。`EarthChinaMap` 挂载中国图时初始就是非激活态。

- [ ] **Step 1: 记录原文件的块边界**

```bash
cd three-scope-map/assets/templates/smart-mine-vue/src/components/map
grep -n '^<template>\|^</template>\|^<script setup\|^</script>\|^<style scoped>\|^</style>' ZhejiangThreeMap.vue
```

Expected: `8/33`（template）、`35/2539`（script）、`2541/2763`（style）。搬运时严格按这三段切。

- [ ] **Step 2: 生成 CSS 文件**

把第 2542–2762 行（`<style scoped>` 的内容，不含标签本身）原样写入 `map-core/core/scopeMapCore.css`，只做两处机械处理：

1. 顶部加归属注释（用 `/* */` 形式，见 Global Constraints）。
2. 把所有 `:deep(X)` 替换为 `X`。共 6 处，替换后形如：

```css
.map-host canvas,
.map-host .map-label-layer {
  position: absolute;
  inset: 0;
}

.map-host .map-label-layer {
  pointer-events: none;
}

.map-host .map-drill-control {
  /* ...原有属性原样保留... */
}
```

**其余每一条规则、每一个数值、每一个 `@keyframes` 都不要动。**

- [ ] **Step 3: 生成核心 TS 骨架**

创建 `map-core/core/scopeMapCore.ts`，先写外层结构，中间留出搬运位：

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
//
// 本文件是框架无关的渲染核心，真源位于 assets/templates/map-core/。
// 不要直接编辑模板里的副本；改动后请运行 scripts/sync_map_templates.py。
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GeoFeatureCollection, Position } from '../../types/geo';
import { initialMapState, loadMapLevel, prefetchMapLevel, type MapScope, type MapState } from '../mapDataAdapter';
import { createMapTerrainMaterial, waitForTerrainTexturesReady } from '../mapTerrainMaterial';
import { mapTheme, mapThemeStyle } from '../mapTheme';
import './scopeMapCore.css';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

export type ScopeMapHandle = {
  readonly element: HTMLElement;
  setActive(value: boolean): void;
  destroy(): void;
};

export function createScopeMap(
  container: HTMLElement,
  opts: { active?: boolean; onReady?(): void } = {},
): ScopeMapHandle {
  let active = opts.active ?? true;
  // ↓↓↓ 此处放置 ZhejiangThreeMap.vue 第 46–2538 行的原样搬运内容 ↓↓↓
  // ↑↑↑ 搬运结束 ↑↑↑
}
```

注意 import 路径的相对层级变了：核心文件在 `src/components/map/core/`，所以 `../../types/geo`（原来是 `../../types/geo`，因为原文件在 `src/components/map/`）—— 原路径 `../../types/geo` 从 `map/` 出发指向 `src/types/geo`；新位置在 `map/core/`，指向同一目标应写 `../../../types/geo`。**逐条重算，不要照抄。** 正确的一组是：

```ts
import type { GeoFeatureCollection, Position } from '../../../types/geo';
import { ... } from '../mapDataAdapter';
import { ... } from '../mapTerrainMaterial';
import { ... } from '../mapTheme';
```

- [ ] **Step 4: 搬运 script 主体**

把 `ZhejiangThreeMap.vue` 第 46–2538 行（跳过第 36–43 行的 import 和第 44–45 行的归属注释，它们已在骨架里）原样贴进工厂函数体，然后只做下表这 8 类替换，**不做任何其他修改**：

| 原写法 | 改成 |
| --- | --- |
| `const host = ref<HTMLElement>();` | `let host: HTMLElement \| undefined;` |
| `host.value` | `host` |
| `const southSeaInsetWidth = ref(78);` | 删除（宽度直接写 DOM，见 Step 5） |
| `if (nextWidth !== southSeaInsetWidth.value) southSeaInsetWidth.value = nextWidth;`（第 402 行） | `if (southSeaInsetEl && nextWidth !== lastSouthSeaInsetWidth) { lastSouthSeaInsetWidth = nextWidth; southSeaInsetEl.style.width = \`${nextWidth}px\`; }` |
| `const activeScope = ref<MapScope>(initialMapState.scope);` | `let activeScope: MapScope = initialMapState.scope;` |
| `activeScope.value = currentState.scope;`（第 2240 行） | `activeScope = currentState.scope; updateSouthSeaInsetVisibility();` |
| `props.active` | `active`（骨架里已声明为 `let active = opts.active ?? true;`） |
| `emit('ready')`（第 2235 行） | `opts.onReady?.()` |

`withDefaults(defineProps...)` 与 `defineEmits` 两个声明整块删除。

- [ ] **Step 5: 用原生 DOM 重建 template**

在工厂函数里新增下面的 DOM 构建代码。**放置位置很关键**：`southSeaInsetPaths` 在原文件第 716 行才被计算出来，所以 `buildDom()` 只能*定义*在任意位置、但必须*调用*在原 `onMounted` 的位置（Step 6）。

```ts
const SVG_NS = 'http://www.w3.org/2000/svg';
let stage: HTMLDivElement | undefined;
let southSeaInsetEl: SVGSVGElement | undefined;
let lastSouthSeaInsetWidth = 78;

function createSouthSeaPath(className: string, d: string) {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', className);
  path.setAttribute('d', d);
  return path;
}

function updateSouthSeaInsetVisibility() {
  southSeaInsetEl?.classList.toggle('is-visible', active && activeScope === 'country');
}

function buildDom() {
  stage = document.createElement('div');
  stage.className = 'map-stage';
  Object.entries(mapThemeStyle).forEach(([key, value]) => stage!.style.setProperty(key, value));

  host = document.createElement('div');
  host.className = 'map-host';
  stage.appendChild(host);

  southSeaInsetEl = document.createElementNS(SVG_NS, 'svg');
  southSeaInsetEl.setAttribute('class', 'south-sea-inset');
  southSeaInsetEl.setAttribute('viewBox', '0 0 78 126');
  southSeaInsetEl.setAttribute('aria-hidden', 'true');
  southSeaInsetEl.style.width = `${lastSouthSeaInsetWidth}px`;

  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'south-sea-inset__frame');
  frame.setAttribute('x', '1.5');
  frame.setAttribute('y', '1.5');
  frame.setAttribute('width', '75');
  frame.setAttribute('height', '123');
  frame.setAttribute('rx', '2');
  southSeaInsetEl.appendChild(frame);

  southSeaInsetPaths.forEach((d) => southSeaInsetEl!.appendChild(createSouthSeaPath('south-sea-inset__glow', d)));
  southSeaInsetPaths.forEach((d) => southSeaInsetEl!.appendChild(createSouthSeaPath('south-sea-inset__line', d)));

  stage.appendChild(southSeaInsetEl);
  container.appendChild(stage);
  updateSouthSeaInsetVisibility();
}
```

DOM 顺序必须与原 template 一致：`rect` 在前，全部 `__glow` 路径其次，全部 `__line` 路径最后 —— 这决定描边的叠加顺序，改了会让发光盖住实线。

- [ ] **Step 6: 替换生命周期与 watch**

原第 2514–2537 行的 `onMounted` / `onBeforeUnmount` 和第 2268 行的 `watch`，改成：

```ts
function setActive(value: boolean) {
  const wasActive = active;
  if (value === wasActive) return;
  active = value;
  updateSouthSeaInsetVisibility();
  // ↓ 原 watch 回调体原样搬入，把 `active`/`wasActive` 当作两个参数用
}

function destroy() {
  // 原 onBeforeUnmount 回调体原样搬入
  stage?.remove();
  stage = undefined;
  host = undefined;
  southSeaInsetEl = undefined;
}

// 原 onMounted 回调体：
buildDom();
setup();
window.addEventListener('resize', resize);
if (host && 'ResizeObserver' in window) {
  resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);
}

return { element: stage!, setActive, destroy };
```

原 `watch` 有 `if (value === wasActive) return;` 的等价语义 —— Vue 的 `watch` 只在值变化时触发，所以 `setActive` 必须自己加这个早退，否则重复调用会重复启动动画循环。

- [ ] **Step 7: 收敛 ChinaMap.vue 为薄壳**

```vue
<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div ref="host" class="map-mount" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createScopeMap, type ScopeMapHandle } from './core/scopeMapCore';

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const emit = defineEmits<{ ready: [] }>();

const host = ref<HTMLElement>();
let instance: ScopeMapHandle | undefined;

onMounted(() => {
  if (!host.value) return;
  instance = createScopeMap(host.value, {
    active: props.active,
    onReady: () => emit('ready'),
  });
});

watch(() => props.active, (value) => instance?.setActive(value));

onBeforeUnmount(() => {
  instance?.destroy();
  instance = undefined;
});
</script>
```

在 `scopeMapCore.css` 末尾追加壳所需的一条规则（这是新增的框架中立样式，不影响既有类）：

```css
.map-mount {
  position: absolute;
  inset: 0;
}
```

初始激活态通过 `opts.active` 传入而不是创建后调 `setActive` —— `setActive` 有「值未变则早退」的语义，创建后再调无效。`watch` 只处理后续变化，与原组件行为一致。

- [ ] **Step 8: 更新 EarthChinaMap.vue 的 `:deep` 选择器**

`EarthChinaMap.vue` 的 scoped 样式里有 4 处 `:deep(...)` 指向现在由核心创建的元素。scoped 属性只打在自己模板的元素上，核心创建的元素本来就在 `:deep` 里，因此这 4 条规则**不需要改**。只需确认 `.china-map-stage:not(.is-active) :deep(.map-host)` 仍能命中 —— 现在 `.map-host` 比原来多一层 `.map-mount`？不会：`EarthChinaMap.vue` 用的是 `<ChinaMap>`，而 `ChinaMap` 现在多了一层 `.map-mount`。后代选择器不受层级影响，仍然命中。本步骤只需跑一遍确认，无代码改动。

- [ ] **Step 9: 删除旧组件并同步**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
git rm three-scope-map/assets/templates/smart-mine-vue/src/components/map/ZhejiangThreeMap.vue
python3 three-scope-map/scripts/sync_map_templates.py
python3 three-scope-map/scripts/sync_map_templates.py --check
```

Expected: 同步 2 个新文件；`--check` 通过。

- [ ] **Step 10: 构建**

```bash
cd three-scope-map/assets/templates/smart-mine-vue
npm run build
```

Expected: 构建成功。若报 TS 错误，最常见原因是 Step 3 的相对路径层级、或搬运时漏掉某个 `host.value` → `host`。

- [ ] **Step 11: 视觉回归对比**

```bash
npm run dev
```

按 Task 1 Step 4 的同样操作截取 `04-china-settled.png`、`05-province-drilldown.png`、`06-south-sea-inset-zoomed.png` 三张，与 `docs/superpowers/baselines/2026-08-02-vue-before/` 对应文件逐张对比。

Expected: 肉眼无差异。**重点核对历史上最易回归的三处**：
1. 外轮廓追光缎带没有三角形闪白、没有自交；
2. 下钻过渡时地形贴图没有白/灰三角（透明深度排序）；
3. 南海插图的实测像素宽度与基线 README 里记录的一致，且在 62–92px 之间。

发现差异就停下来排查搬运，不要带着差异继续。

- [ ] **Step 12: 适配检查脚本中与 scope map 相关的部分**

改 `three-scope-map/scripts/check_three_map_project.py`：

1. `map_components` 的 glob 改为定位核心与壳：

```python
    map_components = find_any(
        root,
        [
            "src/components/map/core/scopeMapCore.ts",
            "src/components/map/ChinaMap.vue",
            "src/components/map/ChinaMap.tsx",
        ],
    )
```

2. **`static_handoff_ok` 本任务不动。** 它里面的 `file_contains(earth_china_sources, r':active="mode\s*===\s*[\'"]china[\'"]"')` 仍指向未改动的 `EarthChinaMap.vue`，此刻依然成立。这一条要等 Task 5 把 `earth_china_sources` 换成核心文件时再一起改 —— 现在就改会让 Step 13 的 `--strict` 直接失败。

3. 主题连线检查里 `map_theme_ok` 的正则由 `from './mapTheme'` 改为兼容核心的上一级路径：

```python
        map_theme_ok = file_contains(map_components, r"import\s*\{[^}]*mapTheme[^}]*\}\s*from\s*['\"]\.\.?/mapTheme['\"]")
```

追光缎带 11 条正则、南海 62–92px、`.map-host` 固定尺寸检查的**逻辑一个字都不改**，它们现在自动作用于 `core/scopeMapCore.ts`。

- [ ] **Step 13: 验证检查脚本仍能通过、也仍能拦截**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict
```

Expected: 退出码 0。此刻 `EarthView.vue` 相关检查仍应通过（尚未改动）。

再构造一次反例，确认闸门没有失效：

```bash
cp three-scope-map/assets/templates/smart-mine-vue/src/components/map/core/scopeMapCore.ts /tmp/scopeMapCore.bak
sed -i '' 's/const provinceChaseRibbonWidth = 2.02/const provinceChaseRibbonWidth = 6.0/' \
  three-scope-map/assets/templates/smart-mine-vue/src/components/map/core/scopeMapCore.ts
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict; echo "exit=$?"
cp /tmp/scopeMapCore.bak three-scope-map/assets/templates/smart-mine-vue/src/components/map/core/scopeMapCore.ts
```

Expected: 中间那条打印 `exit=1`，且 BLOCKERS 里出现 `Unapproved chase-light ribbon detected`。恢复后再跑一次应回到 `exit=0`。

- [ ] **Step 14: 重算 manifest 并提交**

```bash
python3 three-scope-map/scripts/verify_template_integrity.py --update
python3 three-scope-map/scripts/verify_template_integrity.py
git add -A three-scope-map
git commit -m "refactor: 把 3D 地图渲染逻辑抽成框架无关的 scopeMapCore"
```

---

### Task 4: 抽取 earthViewCore

把 `EarthView.vue`（3199 行）变成 `core/earthViewCore.ts` + `core/earthViewCore.css`，`EarthView.vue` 收敛为薄壳。步骤与 Task 3 同构，但装饰 DOM 更多、回调有 4 个。

**Files:**
- Create: `three-scope-map/assets/templates/map-core/core/earthViewCore.ts`
- Create: `three-scope-map/assets/templates/map-core/core/earthViewCore.css`
- Modify: `three-scope-map/assets/templates/smart-mine-vue/src/components/map/EarthView.vue`
- Modify: `three-scope-map/scripts/check_three_map_project.py`

**Interfaces:**
- Consumes: Task 3 建立的 `element` 返回值约定
- Produces:
  ```ts
  export type EarthViewHandle = {
    /** 核心创建的 .earth-view 元素；父级用它做 v-show 等价的显隐 */
    readonly element: HTMLElement;
    setStartIntro(value: boolean): void;
    destroy(): void;
  };

  export function createEarthView(
    container: HTMLElement,
    opts?: {
      onSceneReady?(): void;
      onIntroReady?(): void;
      onHandoffStart?(): void;
      onEnterChina?(): void;
    },
  ): EarthViewHandle;
  ```
  `.earth-view` 必须是 `container` 的**直接子元素**（它靠 `position:absolute; inset:0` 相对 `.earth-china-map` 定位），因此核心不得再包一层 div。Task 5 依赖这一点。

- [ ] **Step 1: 记录块边界**

```bash
cd three-scope-map/assets/templates/smart-mine-vue/src/components/map
grep -n '^<template>\|^</template>\|^<script setup\|^</script>\|^<style scoped>\|^</style>' EarthView.vue
```

Expected: `9/29`、`31/2803`、`2805/3199`。

- [ ] **Step 2: 生成 CSS 文件**

把第 2806–3198 行原样写入 `map-core/core/earthViewCore.css`，加归属注释，并把唯一一处 `:deep(canvas)` 改为 `canvas`：

```css
.earth-view canvas {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
```

其余规则、`@keyframes`、数值全部不动。

- [ ] **Step 3: 生成核心 TS 骨架**

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
//
// 本文件是框架无关的渲染核心，真源位于 assets/templates/map-core/。
// 不要直接编辑模板里的副本；改动后请运行 scripts/sync_map_templates.py。
import { gsap } from 'gsap';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import chinaGeoJson from '../../../assets/maps/china.json';
import worldGeoJson from '../../../assets/maps/world.earth-render.json';
// Cropped 70–140°E / 15–55°N from NASA BMNG topography (0–6400 m scale).
// https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/
import chinaHeightUrl from '../../../assets/textures/map/china/china-height-legacy.png';
import chinaNormalUrl from '../../../assets/textures/map/china/china-normal-legacy.png';
import earthDayUrl from '../../../assets/textures/map/world/earth-day.jpg';
import earthNormalUrl from '../../../assets/textures/map/world/earth-normal.jpg';
import earthSpecularUrl from '../../../assets/textures/map/world/earth-specular.jpg';
import earthLightsUrl from '../../../assets/textures/map/world/earth-lights.png';
import type { GeoFeatureCollection, Position } from '../../../types/geo';
import { MAP_THEME_PRIMARY } from '../mapTheme';
import './earthViewCore.css';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

export type EarthViewHandle = {
  readonly element: HTMLElement;
  setStartIntro(value: boolean): void;
  destroy(): void;
};

export function createEarthView(
  container: HTMLElement,
  opts: {
    onSceneReady?(): void;
    onIntroReady?(): void;
    onHandoffStart?(): void;
    onEnterChina?(): void;
  } = {},
): EarthViewHandle {
  // ↓↓↓ EarthView.vue 第 57–2802 行的原样搬运内容 ↓↓↓
  // ↑↑↑ 搬运结束 ↑↑↑
}
```

注意 asset import 全部从 `../../` 变成 `../../../`（核心多了一层 `core/` 目录），`mapTheme` 从 `./mapTheme` 变成 `../mapTheme`。**注释里的 NASA 出处链接必须保留** —— 它是贴图的署名来源。

- [ ] **Step 4: 搬运 script 主体**

把第 57–2802 行（跳过 import 与归属注释）原样贴进工厂体，只做这 7 类替换：

| 原写法 | 改成 |
| --- | --- |
| `const host = ref<HTMLElement>();` | `let host: HTMLElement \| undefined;` |
| `host.value` | `host` |
| `const isTransitioning = ref(false);` | `let isTransitioning = false;` |
| `isTransitioning.value`（读） | `isTransitioning` |
| `isTransitioning.value = true;`（第 2241 行，唯一一处写） | `isTransitioning = true; host?.classList.add('is-transitioning');` |
| `emit('scene-ready')` / `emit('intro-ready')` / `emit('handoff-start')` / `emit('enter-china')` | `opts.onSceneReady?.()` / `opts.onIntroReady?.()` / `opts.onHandoffStart?.()` / `opts.onEnterChina?.()` |
| `props.startIntro` | `startIntro`（工厂内 `let startIntro = true;`） |

`isTransitioning` 只被写入一次且永不复位（进入过渡后组件即将卸载），所以 class 只需 `add`，不需要 `toggle`。这与原 `:class="{ 'is-transitioning': isTransitioning }"` 的实际行为一致。

`defineEmits` 与 `withDefaults(defineProps...)` 两个声明整块删除。

- [ ] **Step 5: 用原生 DOM 重建 template**

`earthThemeStyle` 在原文件第 176 行就已算出（早于任何使用），所以这段可以直接放在工厂体靠前的位置，紧跟 `earthThemeStyle` 定义之后：

```ts
function createLayer(className: string) {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function buildDom() {
  host = document.createElement('div');
  host.className = 'earth-view';
  Object.entries(earthThemeStyle).forEach(([key, value]) => host!.style.setProperty(key, value));

  const backdrop = createLayer('earth-backdrop');
  const atmosphere = createLayer('dive-atmosphere');
  const cloudscape = createLayer('dive-cloudscape');
  [
    'cloud-bank cloud-bank--far',
    'cloud-bank cloud-bank--left',
    'cloud-bank cloud-bank--right',
    'cloud-bank cloud-bank--near-left',
    'cloud-bank cloud-bank--near-right',
    'dive-cloud-texture',
  ].forEach((className) => cloudscape.appendChild(createLayer(className)));
  const haze = createLayer('dive-cloud-haze');
  const vignette = createLayer('dive-vignette');

  [backdrop, atmosphere, cloudscape, haze, vignette].forEach((el) => {
    el.setAttribute('aria-hidden', 'true');
    host!.appendChild(el);
  });

  container.appendChild(host);
}
```

`aria-hidden` 只加在这 5 个直接子层上，**不要**加到 6 个 `cloud-bank`/`dive-cloud-texture` 子元素上 —— 与原 template 一致。5 个子层的插入顺序也必须一致，它们靠 DOM 顺序 + `z-index` 叠加。

- [ ] **Step 6: 替换生命周期与 watch**

```ts
function setStartIntro(value: boolean) {
  if (value === startIntro) return;
  startIntro = value;
  if (value) requestIntroStart?.();
}

function destroy() {
  // 原第 2771–2802 行 onBeforeUnmount 回调体原样搬入
  host?.remove();
  host = undefined;
}

buildDom();
void setup();

return { element: host!, setStartIntro, destroy };
```

原 `onMounted(setup)`；`setup` 是 async 函数，原来靠 Vue 忽略返回值，这里显式 `void`。`buildDom()` 必须在 `setup()` 之前 —— `setup()` 第 2664 行第一句就是 `if (!host) return;`。

`startIntro` 初值为 `true`（对应 `withDefaults` 的默认值）。Task 5 里 `earthChinaMapCore` 会在创建时立刻 `setStartIntro(false)`，与原 `:start-intro="chinaReady"`（初值 `false`）等价 —— 见 Task 5 Step 3。

- [ ] **Step 7: 收敛 EarthView.vue 为薄壳**

```vue
<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div ref="mount" class="earth-mount" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createEarthView, type EarthViewHandle } from './core/earthViewCore';

const props = withDefaults(defineProps<{ startIntro?: boolean }>(), { startIntro: true });
const emit = defineEmits<{
  'scene-ready': [];
  'intro-ready': [];
  'handoff-start': [];
  'enter-china': [];
}>();

const mount = ref<HTMLElement>();
let instance: EarthViewHandle | undefined;

onMounted(() => {
  if (!mount.value) return;
  instance = createEarthView(mount.value, {
    onSceneReady: () => emit('scene-ready'),
    onIntroReady: () => emit('intro-ready'),
    onHandoffStart: () => emit('handoff-start'),
    onEnterChina: () => emit('enter-china'),
  });
  instance.setStartIntro(props.startIntro);
});

watch(() => props.startIntro, (value) => instance?.setStartIntro(value));

onBeforeUnmount(() => {
  instance?.destroy();
  instance = undefined;
});
</script>
```

在 `earthViewCore.css` 末尾追加：

```css
.earth-mount {
  position: absolute;
  inset: 0;
}
```

- [ ] **Step 8: 同步并构建**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/sync_map_templates.py && python3 three-scope-map/scripts/sync_map_templates.py --check
cd three-scope-map/assets/templates/smart-mine-vue && npm run build
```

Expected: sync check 通过，构建成功。

- [ ] **Step 9: 视觉回归对比**

```bash
npm run dev
```

截取 `01-earth-first-paint.png`、`02-earth-intro-done.png`、`03-cloud-handoff.png` 与基线对比。

Expected: 肉眼无差异。**重点核对**：地球的大气辉光与网格扫描带、国际飞线的同步节奏、intro 时长（从加载到地球完全显现约 6s）、云层俯冲时 5 层 `cloud-bank` 的层次与视差、南海虚线（`*_JD`）仍是球面虚线且无填充/墙体。

- [ ] **Step 10: 适配检查脚本中与 Earth 相关的部分**

改 `check_three_map_project.py`：

1. `EARTH_EFFECT_PATTERNS` 的扫描源由 `EarthView.vue` 改为核心文件：

```python
        earth_view = root / "src/components/map/core/earthViewCore.ts"
        earth_sources = [earth_view] if earth_view.exists() else []
```

2. `EARTH_EFFECT_PATTERNS` 里 `"Earth handoff events"` 一条：

```python
    "Earth handoff events": r"onIntroReady[\s\S]*onHandoffStart[\s\S]*onEnterChina",
```

其余 9 条模式（SphereGeometry、postprocessing、TessellateModifier、chinaWallVertexShader、atmosphere、grid scan、fly lines、batched world outlines、spherical JD dashed line）**原样不动**。

3. 主题连线检查里 `earth_theme_ok` 的 import 路径：

```python
        earth_theme_ok = file_contains(earth_sources, r"import\s*\{\s*MAP_THEME_PRIMARY\s*\}\s*from\s*['\"]\.\.?/mapTheme['\"]")
```

4. `isolated_preload_ok` 里两条与 Earth 有关的：`emit\(['\"]scene-ready['\"]\)` → `onSceneReady`；`startIntro` 保持不变（核心里同名变量仍在）。`world.earth-render.json` 与排除 `world.json` 两条不动。其余与 `EarthChinaMap` 有关的正则在 Task 5 处理。

- [ ] **Step 11: 验证检查脚本**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict
```

Expected: 退出码 0。（`isolated_preload_ok` 里 `EarthChinaMap` 那几条仍指向 `.vue` 且尚未改动，此时仍应通过。）

- [ ] **Step 12: 重算 manifest 并提交**

```bash
python3 three-scope-map/scripts/verify_template_integrity.py --update
python3 three-scope-map/scripts/verify_template_integrity.py
git add -A three-scope-map
git commit -m "refactor: 把地球入口渲染逻辑抽成框架无关的 earthViewCore"
```

---

### Task 5: 抽取 earthChinaMapCore 并收敛 Vue 壳

**Files:**
- Create: `three-scope-map/assets/templates/map-core/core/earthChinaMapCore.ts`
- Create: `three-scope-map/assets/templates/map-core/core/earthChinaMapCore.css`
- Modify: `three-scope-map/assets/templates/smart-mine-vue/src/components/map/EarthChinaMap.vue`
- Modify: `three-scope-map/scripts/check_three_map_project.py`

**Interfaces:**
- Consumes: `createEarthView`（Task 4）、`createScopeMap`（Task 3），含两者的 `element` 返回值
- Produces:
  ```ts
  export type EarthChinaMapHandle = { destroy(): void };

  export function createEarthChinaMap(
    container: HTMLElement,
    opts?: { onModeChange?(mode: 'earth' | 'china'): void },
  ): EarthChinaMapHandle;
  ```
  Task 7 的 React 壳直接消费这个签名。

- [ ] **Step 1: 生成 CSS 文件**

把 `EarthChinaMap.vue` 第 99–165 行（`<style scoped>` 内容）写入 `map-core/core/earthChinaMapCore.css`，加归属注释，把 4 处 `:deep(...)` 去壳：

```css
.china-map-stage:not(.is-active) .map-host {
  filter: none;
}

.china-map-stage:not(.is-active) .map-label-layer,
.china-map-stage:not(.is-active) .map-drill-control,
.china-map-stage:not(.is-active) .south-sea-inset {
  display: none;
}
```

`.earth-china-map`、`.china-map-stage`（含 `.is-handoff` / `.is-active`）、`@keyframes china-cloud-reveal` 的每一条属性、时长、缓动曲线原样保留。

- [ ] **Step 2: 写核心**

创建 `map-core/core/earthChinaMapCore.ts`。这是唯一一个需要重新组织（而非纯搬运）的核心，因为它把 Vue 的条件渲染与异步组件换成了命令式 DOM 与动态 import：

```ts
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
```

**三处容易写错的语义等价，实现后逐条核对：**

1. **`chinaReady` 门控 intro。** 原 template 是 `:start-intro="chinaReady"`，`chinaReady` 初值 `false`；核心里 `createEarthView` 的 `startIntro` 初值是 `true`。所以创建后立刻 `earth.setStartIntro(false)` 关门，`onChinaReady` 里 `earth.setStartIntro(true)` 开门。少任何一句，地球 intro 都会在目标地图静态帧就绪之前就开始转 —— 这正是 SKILL.md 规则 18 明令禁止的。（`earth` 是 `const`，声明在 `onChinaReady` 之后；`onChinaReady` 只在运行时被调用，闭包引用成立，TypeScript 不会报错。）
2. **中国图的初始非激活态。** 原 `<ChinaMap :active="mode === 'china'">` 在挂载时 `mode` 是 `'earth'`。因为 `setActive` 有「值未变则早退」的语义，初始值只能走 `createScopeMap(chinaStage, { active: false, ... })`，不能创建后再调 `setActive(false)`。
3. **DOM 顺序。** 原 template 里 `.china-map-stage` 在 `<EarthView>` **之前**。核心里 `createEarthView` 先执行、`prepareChinaMap` 后执行，所以用 `root.insertBefore(chinaStage, root.firstChild)` 把舞台插到最前，保持与原 DOM 一致的层叠顺序。

- [ ] **Step 3: 核对 scopeMapCore 的 active 选项已就绪**

```bash
grep -n "opts.active ?? true" three-scope-map/assets/templates/map-core/core/scopeMapCore.ts
```

Expected: 命中一行。若没有，说明 Task 3 Step 3 的骨架漏写了 `let active = opts.active ?? true;` —— 补上后重跑 `sync_map_templates.py`，否则本任务 Step 2 的 `{ active: false }` 会被静默忽略，中国图会在地球还没交接时就跑起连续渲染循环。

- [ ] **Step 4: 收敛 EarthChinaMap.vue 为薄壳**

```vue
<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div ref="mount" class="earth-china-mount" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  createEarthChinaMap,
  type EarthChinaMapHandle,
  type EarthChinaMapMode,
} from './core/earthChinaMapCore';

const emit = defineEmits<{ 'mode-change': [mode: EarthChinaMapMode] }>();

const mount = ref<HTMLElement>();
let instance: EarthChinaMapHandle | undefined;

onMounted(() => {
  if (!mount.value) return;
  instance = createEarthChinaMap(mount.value, {
    onModeChange: (mode) => emit('mode-change', mode),
  });
});

onBeforeUnmount(() => {
  instance?.destroy();
  instance = undefined;
});
</script>
```

在 `earthChinaMapCore.css` 末尾追加：

```css
.earth-china-mount {
  position: absolute;
  inset: 0;
}
```

- [ ] **Step 5: 同步并构建**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/sync_map_templates.py && python3 three-scope-map/scripts/sync_map_templates.py --check
cd three-scope-map/assets/templates/smart-mine-vue && npm run build
```

Expected: sync check 通过，构建成功。构建产物里应能看到 `scopeMapCore` 被拆成独立 chunk（动态 import 生效）：

```bash
ls -la dist/assets/ | head -20
```

Expected: 除主 chunk 外还有一个体积可观的独立 JS chunk。

- [ ] **Step 6: 全流程视觉回归**

```bash
npm run dev
```

截取全部 6 张与基线对比。

Expected: 肉眼无差异。**这一步是整个抽取阶段的总验收**，重点核对时序类的行为：
1. 冷启动时页面不空白（星空/背景先在）；
2. 地球 intro 只在目标地图静态帧就绪后才开始（不会一加载就转）；
3. 交接时先露出已编译的静态帧，再开始地图连续动画；
4. `.china-map-stage` 的 `china-cloud-reveal` 动画完整播放 1.44s；
5. 进入中国图后地球元素完全隐藏。

- [ ] **Step 7: 适配检查脚本中与 EarthChinaMap 相关的部分**

改 `check_three_map_project.py`：

1. `earth_china_sources` 指向核心：

```python
        earth_china_map = root / "src/components/map/core/earthChinaMapCore.ts"
        earth_china_sources = [earth_china_map] if earth_china_map.exists() else []
```

2. `static_handoff_ok` 里指向 Vue 模板语法的那条改为核心调用（这一条是 Task 3 Step 12 刻意推迟到现在的）：

```python
        static_handoff_ok = (
            file_contains(map_components, r"settleMapForStaticFrame")
            and file_contains(map_components, r"startMapAnimation[\s\S]*stopMapAnimation")
            and file_contains(earth_china_sources, r"createScopeMap\([\s\S]*active:\s*false")
        )
```

用 `createScopeMap(... active: false ...)` 而不是宽泛的 `setActive\(` —— 前者才真正断言了「目标地图挂载时处于非激活态」这个 SKILL.md 规则 18 要求的行为。

3. `isolated_preload_ok` 的三条 Vue 语法正则替换：

```python
        isolated_preload_ok = (
            file_contains(earth_sources, r"onSceneReady")
            and file_contains(earth_sources, r"startIntro")
            and file_contains(earth_china_sources, r"setStartIntro\(")
            and file_contains(earth_china_sources, r"prepareChinaMap[\s\S]*chinaMounted\s*=\s*true")
            and file_contains(earth_china_sources, r"await\s+import\(['\"]\./scopeMapCore['\"]\)")
            and file_contains(earth_sources, r"world\.earth-render\.json")
            and not file_contains(earth_sources, r"from\s*['\"][^'\"]*/world\.json['\"]")
            and file_contains(map_components, r"waitForPreloadSlice[\s\S]*compileAsync[\s\S]*initTexture")
        )
```

4. `REQUIRED_EARTH_FILES` 里三个 `.vue` 换成核心文件（框架壳在 Task 6 按框架追加）：

```python
REQUIRED_EARTH_FILES = (
    "src/components/map/core/earthViewCore.ts",
    "src/components/map/core/earthChinaMapCore.ts",
    "src/components/map/core/scopeMapCore.ts",
    "src/components/map/mapTheme.ts",
    "src/assets/maps/china.json",
    "src/assets/maps/world.json",
    "src/assets/maps/world.earth-render.json",
    "src/assets/textures/map/china/china-height-legacy.png",
    "src/assets/textures/map/china/china-normal-legacy.png",
    "src/assets/textures/map/world/earth-day.jpg",
    "src/assets/textures/map/world/earth-lights.png",
    "src/assets/textures/map/world/earth-normal.jpg",
    "src/assets/textures/map/world/earth-specular.jpg",
)
```

- [ ] **Step 8: 验证检查脚本通过并仍能拦截**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict; echo "exit=$?"
```

Expected: `exit=0`。

反例验证预热隔离闸门：

```bash
CORE=three-scope-map/assets/templates/smart-mine-vue/src/components/map/core/earthChinaMapCore.ts
cp "$CORE" /tmp/earthChinaMapCore.bak
sed -i '' "s|await import('./scopeMapCore')|await import('./scopeMapCoreXX')|" "$CORE"
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict; echo "exit=$?"
cp /tmp/earthChinaMapCore.bak "$CORE"
```

Expected: 中间打印 `exit=1`，BLOCKERS 出现 `Earth visible intro must start only after the inactive destination static frame is ready.`；恢复后回到 `exit=0`。

- [ ] **Step 9: 重算 manifest 并提交**

```bash
python3 three-scope-map/scripts/verify_template_integrity.py --update
python3 three-scope-map/scripts/verify_template_integrity.py
git add -A three-scope-map
git commit -m "refactor: 把地球到中国的握手逻辑抽成 earthChinaMapCore，Vue 组件收敛为薄壳"
```

---

### Task 6: 检查脚本框架自适应

到这一步 Vue 侧已经完全跑在核心上。这个任务让 `check_three_map_project.py` 能同时判定并检查 React 项目，为 Task 7 准备好闸门。

**Files:**
- Modify: `three-scope-map/scripts/check_three_map_project.py`

**Interfaces:**
- Consumes: Task 5 定稿的 `REQUIRED_EARTH_FILES` 与各正则
- Produces: `detect_framework(root) -> str`，返回 `"vue"` / `"react"` / `"unknown"`。Task 7 的验证依赖它对 React 模板返回 `"react"`。

- [ ] **Step 1: 加框架判定**

在 `package_status` 上方新增：

```python
FRAMEWORK_SHELL_FILES = {
    "vue": (
        "src/components/map/EarthView.vue",
        "src/components/map/EarthChinaMap.vue",
        "src/components/map/ChinaMap.vue",
    ),
    "react": (
        "src/components/map/EarthView.tsx",
        "src/components/map/EarthChinaMap.tsx",
        "src/components/map/ChinaMap.tsx",
    ),
}

FRAMEWORK_DEPENDENCIES = {
    "vue": ("vue",),
    "react": ("react", "react-dom"),
}


def detect_framework(root: Path) -> str:
    package = read_json(root / "package.json")
    deps = {}
    deps.update(package.get("dependencies", {}))
    deps.update(package.get("devDependencies", {}))
    if "react" in deps:
        return "react"
    if "vue" in deps:
        return "vue"
    return "unknown"
```

- [ ] **Step 2: 让依赖检查随框架变化**

把 `package_status` 改成接收框架：

```python
def package_status(root: Path, framework: str) -> tuple[list[str], list[str]]:
    package_path = root / "package.json"
    if not package_path.exists():
        return ["package.json missing"], []

    package = read_json(package_path)
    deps = {}
    deps.update(package.get("dependencies", {}))
    deps.update(package.get("devDependencies", {}))

    required = ("vite", "three") + FRAMEWORK_DEPENDENCIES.get(framework, ())
    optional = ("@types/three",)
    missing = [name for name in required if name not in deps]
    present = [name for name in required + optional if name in deps]
    return [f"{name} dependency missing" for name in missing], present
```

- [ ] **Step 3: 在 main() 里接线**

在 `dependency_problems, present_deps = package_status(root)` 之前插入：

```python
    framework = detect_framework(root)
    if framework == "unknown":
        problems.append(
            "Could not detect the target framework; package.json must depend on vue or react."
        )
    else:
        passes.append(f"Target framework detected: {framework}")
```

并把调用改为 `package_status(root, framework)`。

在 `REQUIRED_EARTH_FILES` 循环之后追加框架壳检查：

```python
    for relative_path in FRAMEWORK_SHELL_FILES.get(framework, ()):
        path = root / relative_path
        if path.exists():
            passes.append(f"Framework shell found: {relative_path}")
        else:
            problems.append(f"Framework shell missing: {relative_path}")
```

- [ ] **Step 4: 让 map_components 随框架取壳**

把 Task 3 Step 12 写死的三条 glob 改成：

```python
    map_components = find_any(
        root,
        [
            "src/components/map/core/scopeMapCore.ts",
            *(f"{path}" for path in FRAMEWORK_SHELL_FILES.get(framework, ()) if "ChinaMap" in path and "Earth" not in path),
        ],
    )
```

- [ ] **Step 5: 让源文件扫描包含 .tsx**

`list_source_files` 的 `suffixes` 已包含 `.tsx`，无需改动。确认一遍：

```bash
grep -n 'suffixes = ' three-scope-map/scripts/check_three_map_project.py
```

Expected: 输出里含 `".tsx"`。

- [ ] **Step 6: 验证 Vue 模板仍然通过**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict; echo "exit=$?"
```

Expected: `exit=0`，且 PASS 里出现 `Target framework detected: vue` 与 3 条 `Framework shell found`。

- [ ] **Step 7: 验证未知框架会被拦截**

```bash
mkdir -p /tmp/no-fw/src && echo '{"dependencies":{"three":"^0.176.0"},"devDependencies":{"vite":"^7.3.6"}}' > /tmp/no-fw/package.json
python3 three-scope-map/scripts/check_three_map_project.py /tmp/no-fw --strict; echo "exit=$?"
rm -rf /tmp/no-fw
```

Expected: `exit=1`，BLOCKERS 含 `Could not detect the target framework`。

- [ ] **Step 8: 提交**

```bash
git add three-scope-map/scripts/check_three_map_project.py
git commit -m "feat: 让项目检查脚本按目标框架自适应 vue/react"
```

---

### Task 7: 新建 smart-mine-react 模板

**Files:**
- Create: `three-scope-map/assets/templates/smart-mine-react/{index.html,package.json,tsconfig.json,vite.config.ts}`
- Create: `three-scope-map/assets/templates/smart-mine-react/src/{main.tsx,App.tsx}`
- Create: `three-scope-map/assets/templates/smart-mine-react/src/components/map/{EarthChinaMap.tsx,EarthView.tsx,ChinaMap.tsx}`
- Modify: `three-scope-map/assets/template-manifest.json`（由脚本重算）

**Interfaces:**
- Consumes: `createEarthChinaMap` / `createEarthView` / `createScopeMap` 三个签名（Task 3/4/5）
- Produces: 一个可 `npm run dev` 的 React 19 模板，`src/` 结构与 Vue 模板逐目录对应

- [ ] **Step 1: 建脚手架配置**

`index.html` —— 挂载点保持 `#app`（不用 React 惯例的 `#root`），这样 `style.css` 里的 `html, body, #app` 规则可以两个框架共用：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Three Scope Map</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`package.json`：

```json
{
  "name": "three-scope-map-earth-react-template",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  },
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "gsap": "^3.15.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "three": "^0.176.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@types/three": "^0.176.0",
    "@vitejs/plugin-react": "^5.1.0",
    "typescript": "^5.9.3",
    "vite": "^7.3.6"
  }
}
```

`vite.config.ts`：

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

`tsconfig.json` —— 与 Vue 版逐项对齐，只改 `jsx` 与 `include`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

刻意不建 `tsconfig.node.json`：`vite.config.ts` 不在 `include` 里，`tsc --noEmit` 不会检查它，Vue 模板也没有对应文件，两边保持对称。

- [ ] **Step 2: 写入口与 App**

`src/main.tsx`：

```tsx
// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

保留 `StrictMode`：它会让 effect 双挂载，正好是 Step 5 要验证的场景，不应为了图省事去掉。

`src/App.tsx`：

```tsx
// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import EarthChinaMap from './components/map/EarthChinaMap';

export default function App() {
  return (
    <main className="map-page">
      <EarthChinaMap />
    </main>
  );
}
```

- [ ] **Step 3: 写三个薄壳**

`src/components/map/EarthChinaMap.tsx`：

```tsx
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import { useEffect, useRef } from 'react';
import {
  createEarthChinaMap,
  type EarthChinaMapMode,
} from './core/earthChinaMapCore';

export type { EarthChinaMapMode };

export default function EarthChinaMap({
  onModeChange,
}: {
  onModeChange?: (mode: EarthChinaMapMode) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const onModeChangeRef = useRef(onModeChange);
  onModeChangeRef.current = onModeChange;

  useEffect(() => {
    if (!mount.current) return;
    const instance = createEarthChinaMap(mount.current, {
      onModeChange: (mode) => onModeChangeRef.current?.(mode),
    });
    return () => instance.destroy();
  }, []);

  return <div ref={mount} className="earth-china-mount" />;
}
```

用 ref 转发回调，避免 `onModeChange` 变化触发 effect 重建（重建会重新初始化整个 WebGL 场景）。

`src/components/map/ChinaMap.tsx`：

```tsx
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import { useEffect, useRef } from 'react';
import { createScopeMap, type ScopeMapHandle } from './core/scopeMapCore';

export default function ChinaMap({
  active = true,
  onReady,
}: {
  active?: boolean;
  onReady?: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const instance = useRef<ScopeMapHandle | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const initialActive = useRef(active);

  useEffect(() => {
    if (!mount.current) return;
    instance.current = createScopeMap(mount.current, {
      active: initialActive.current,
      onReady: () => onReadyRef.current?.(),
    });
    return () => {
      instance.current?.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setActive(active);
  }, [active]);

  return <div ref={mount} className="map-mount" />;
}
```

`src/components/map/EarthView.tsx`：

```tsx
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import { useEffect, useRef } from 'react';
import { createEarthView, type EarthViewHandle } from './core/earthViewCore';

export default function EarthView({
  startIntro = true,
  onSceneReady,
  onIntroReady,
  onHandoffStart,
  onEnterChina,
}: {
  startIntro?: boolean;
  onSceneReady?: () => void;
  onIntroReady?: () => void;
  onHandoffStart?: () => void;
  onEnterChina?: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const instance = useRef<EarthViewHandle | null>(null);
  const callbacks = useRef({ onSceneReady, onIntroReady, onHandoffStart, onEnterChina });
  callbacks.current = { onSceneReady, onIntroReady, onHandoffStart, onEnterChina };
  const initialStartIntro = useRef(startIntro);

  useEffect(() => {
    if (!mount.current) return;
    instance.current = createEarthView(mount.current, {
      onSceneReady: () => callbacks.current.onSceneReady?.(),
      onIntroReady: () => callbacks.current.onIntroReady?.(),
      onHandoffStart: () => callbacks.current.onHandoffStart?.(),
      onEnterChina: () => callbacks.current.onEnterChina?.(),
    });
    instance.current.setStartIntro(initialStartIntro.current);
    return () => {
      instance.current?.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setStartIntro(startIntro);
  }, [startIntro]);

  return <div ref={mount} className="earth-mount" />;
}
```

- [ ] **Step 4: 同步核心与资产，安装、构建**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/sync_map_templates.py
python3 three-scope-map/scripts/sync_map_templates.py --check
cd three-scope-map/assets/templates/smart-mine-react
npm install
npm run build
```

Expected: sync 复制核心 6 个文件 + 共享 4 个文件 + 全部资产；`--check` 通过；构建成功且产物里有独立的 `scopeMapCore` chunk。

若 `tsc --noEmit` 报 `Property 'current' is read-only` 或 `Expected 1 arguments, but got 0`，说明 `@types/react` 版本与 React 19 的 `useRef` 签名不匹配 —— 确认 `@types/react` 是 `^19.2.0` 而不是 18.x，`npm ls @types/react` 检查有没有被传递依赖降级。

- [ ] **Step 5: React StrictMode 双挂载验证**

```bash
npm run dev
```

打开 `http://127.0.0.1:5173/`，打开浏览器 DevTools Console，然后：

```js
document.querySelectorAll('canvas').length
```

Expected: `2`（一个 WebGL canvas + 一个 CSS2DRenderer 的 div 不算 canvas；实际预期是 Earth 的 1 个 + 中国图挂载后的 1 个）。**关键是这个数字不随时间增长**，且不出现同一个视图有两个重叠 canvas。

再检查：

- Console 中无 `THREE.WebGLRenderer: Context Lost` 或 `Too many active WebGL contexts` 警告；
- Console 中无未捕获异常；
- `document.querySelectorAll('.earth-view').length` 为 `1`，`document.querySelectorAll('.map-stage').length` 为 `1`。

若出现重复元素，说明 `destroy()` 没把 DOM 清干净 —— 回到对应核心的 `destroy()` 补 `element.remove()`，并在核心里加幂等保护：

```ts
let destroyed = false;
function destroy() {
  if (destroyed) return;
  destroyed = true;
  // ...
}
```

- [ ] **Step 6: React 视觉对比**

按 Task 1 Step 4 的操作截取全部 6 张，与 `docs/superpowers/baselines/2026-08-02-vue-before/` 逐张对比。

Expected: 肉眼无差异。这一步同时验证了 Vue 与 React 输出一致（因为两边都对同一份基线负责）。

把 React 的 6 张截图存到 `docs/superpowers/baselines/2026-08-02-react-after/`，作为交付证据。

- [ ] **Step 7: 检查脚本对 React 模板通过**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-react --strict; echo "exit=$?"
```

Expected: `exit=0`，PASS 里出现 `Target framework detected: react` 与 3 条 `Framework shell found: src/components/map/*.tsx`。

- [ ] **Step 8: 忽略 node_modules，重算 manifest 并提交**

```bash
cat .gitignore
```

确认 `node_modules` 与 `dist` 已被忽略；若没有，追加。然后：

```bash
python3 three-scope-map/scripts/verify_template_integrity.py --update
python3 three-scope-map/scripts/verify_template_integrity.py
git add -A three-scope-map docs/superpowers/baselines
git commit -m "feat: 新增 smart-mine-react 可运行模板"
```

---

### Task 8: 更新技能文档

代码已经能跑，但技能是靠 SKILL.md 驱动 agent 的 —— 文档不更新，React 支持就等于不存在。

**Files:**
- Modify: `three-scope-map/SKILL.md`
- Modify: `three-scope-map/references/three-scope-map-template.md`
- Modify: `three-scope-map/references/one-to-one-template.md`
- Modify: `three-scope-map/references/earth-view.md`
- Modify: `three-scope-map/references/performance-pipeline.md`
- Modify: `three-scope-map/references/map-migration-playbook.md`
- Modify: `README.md`
- Modify: `three-scope-map/agents/openai.yaml`

**Interfaces:**
- Consumes: 前七个任务定稿的文件路径、脚本名与 CLI
- Produces: 无代码接口

- [ ] **Step 1: SKILL.md — description 加 React**

把 frontmatter 的 `description` 里 `for Vue or web dashboards` 改为 `for Vue or React web dashboards`，并在句尾追加 `; scaffold either the bundled Vue or React template from the same framework-agnostic rendering core`。

- [ ] **Step 2: SKILL.md — 新增框架选择规则**

在 Core Workflow 现有第 1 条**之前**插入新的第 1 条（后续条目顺延，全文引用编号处一并调整）：

```markdown
1. Resolve the target framework before touching any file. If the target project has a `package.json`, detect it: `react` dependency means React, `vue` means Vue. If there is no target project, default to Vue and tell the user that a React template is also available. Never mix the two shells in one project.
```

- [ ] **Step 3: SKILL.md — 替换所有 Vue 文件名**

把全文中的组件文件名引用改为「核心 + 壳」表述：

| 原文 | 改为 |
| --- | --- |
| `EarthView.vue` | `core/earthViewCore.ts` |
| `EarthChinaMap.vue` | `core/earthChinaMapCore.ts` |
| `ChinaMap.vue` | `core/scopeMapCore.ts` 与框架壳 `ChinaMap.vue` / `ChinaMap.tsx` |
| `ZhejiangThreeMap.vue` | `core/scopeMapCore.ts` |
| `assets/templates/smart-mine-vue/src/` | `assets/templates/smart-mine-vue/src/` 或 `assets/templates/smart-mine-react/src/`（按目标框架） |

具体到规则 15、16、以及「Non-Negotiable One-To-One Rules」里点名 `EarthView.vue` 的两条。规则 16 改为：

```markdown
16. Treat `assets/templates/smart-mine-vue/` and `assets/templates/smart-mine-react/` as runnable minimal projects. When there is no target app, copy the whole template for the resolved framework; it mounts the Earth-to-China map and displays Earth immediately. When integrating into an existing app, copy only `src/components/map/` (core plus that framework's shells), map data, map textures, `src/types/geo.ts`, and `src/style.css`, then mount the `EarthChinaMap` shell in the requested route/container.
```

- [ ] **Step 4: SKILL.md — Scripts 与 Common Commands**

在 Scripts 一节追加：

```markdown
- `scripts/sync_map_templates.py`: Sync `assets/templates/map-core/` and the Vue template's assets into both runnable templates. Use `--check` to verify no drift. Core code must only be edited in `map-core/`.
- `assets/templates/map-core/`: Framework-agnostic rendering core (`createEarthView`, `createScopeMap`, `createEarthChinaMap`) plus shared theme/adapter/material/type modules. Single source of truth for all map logic.
- `assets/templates/smart-mine-react/src/`: React 19 + Vite one-to-one template with the same core and assets as the Vue template.
```

在 Common Commands 追加：

```bash
# Verify the bundled core has not drifted from the two runnable templates
python3 <skill>/scripts/sync_map_templates.py --check

# Re-sync after editing assets/templates/map-core/
python3 <skill>/scripts/sync_map_templates.py

# Check a React target project
python3 <skill>/scripts/check_three_map_project.py <target-react-project> --strict
```

- [ ] **Step 5: SKILL.md — Delivery Checklist**

追加两条：

```markdown
- State the resolved target framework (Vue or React) and which template was copied.
- Confirm `scripts/sync_map_templates.py --check` passes before claiming one-to-one fidelity.
```

- [ ] **Step 6: references/three-scope-map-template.md — 补 React 与 Next.js**

该文档现在描述 Vue 组件结构。改为先描述核心 API（三个工厂函数签名，从本计划 Task 3/4/5 的 Interfaces 块抄），再给 Vue 与 React 两段等价薄壳示例（从 Task 5 Step 4 与 Task 7 Step 3 抄）。末尾新增一节：

```markdown
## Next.js 接入

技能不提供 Next.js 模板。要在 Next.js App Router 里使用：

1. 把 `smart-mine-react/src/components/map/`、`src/types/`、`src/assets/`、`src/style.css` 复制进项目。
2. 地图组件必须只在客户端运行 —— Three.js 与 GSAP 都需要 `window`：

    ```tsx
    'use client';
    import dynamic from 'next/dynamic';

    const EarthChinaMap = dynamic(() => import('@/components/map/EarthChinaMap'), { ssr: false });

    export default function MapPage() {
      return <main className="map-page"><EarthChinaMap /></main>;
    }
    ```

3. 贴图与 GeoJSON 用 import 引入（如模板所做），不要改成 `/public` 下的裸路径 —— 核心依赖打包器把它们解析成带 hash 的 URL。
4. `src/style.css` 里的 `#app` 选择器要改成 Next.js 的根容器选择器（通常是 `body > div:first-child` 或你自己给 layout 加的 id）。
```

- [ ] **Step 7: 其余 references 的 Vue 措辞**

逐个文件把 Vue 专属表述改为框架无关表述，需要举例时给双框架示例：

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
grep -n -i "vue" three-scope-map/references/one-to-one-template.md
grep -n -i "vue" three-scope-map/references/earth-view.md
grep -n -i "vue" three-scope-map/references/performance-pipeline.md
grep -n -i "map-migration-playbook.md" -l three-scope-map/references/
grep -n -i "vue" three-scope-map/references/map-migration-playbook.md
```

对每一处：如果只是文件名引用，按 Step 3 的映射表替换；如果是「Vue runtime API」这类描述，改为「core API」并给出对应工厂函数名。`earth-view.md` 里描述 EarthView 实现细节的部分，把 `EarthView.vue` 改为 `map-core/core/earthViewCore.ts`。

- [ ] **Step 8: README.md**

```bash
grep -n -i "vue" README.md
```

改动要点：
- 项目简介里 "Vue" 改为 "Vue / React"；
- 新增一节「两套模板」，说明 `smart-mine-vue` 与 `smart-mine-react` 共用 `map-core` 渲染核心；
- 快速开始给两条命令：
    ```bash
    cd three-scope-map/assets/templates/smart-mine-vue && npm install && npm run dev
    cd three-scope-map/assets/templates/smart-mine-react && npm install && npm run dev
    ```
- 新增「贡献」提示：核心代码只改 `assets/templates/map-core/`，改完跑 `python3 three-scope-map/scripts/sync_map_templates.py`。

- [ ] **Step 9: agents/openai.yaml**

```yaml
interface:
  display_name: "Three Scope Map"
  short_description: "Build exact Earth-to-China Three.js maps for Vue or React with shared one-color theming"
  default_prompt: "Use $three-scope-map to detect the target framework, copy the matching bundled exact Earth-to-China template (Vue or React), mount it as the default view, and preserve its renderer, assets, motion, drilldown, and shared one-color theme without redesigning it."
```

- [ ] **Step 10: 全量闸门复跑**

```bash
cd /Users/lijiaxi/prj/skills/three-scope-map-skill
python3 three-scope-map/scripts/sync_map_templates.py --check
python3 three-scope-map/scripts/verify_template_integrity.py
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict
python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-react --strict
```

Expected: 四条全部退出码 0。

- [ ] **Step 11: 确认文档里没有残留的失效路径**

```bash
grep -rn "ZhejiangThreeMap\|EarthView\.vue\|EarthChinaMap\.vue\|ChinaMap\.vue" \
  three-scope-map/SKILL.md three-scope-map/references README.md three-scope-map/agents
```

Expected: 只剩「框架壳」语境下合法的 `EarthChinaMap.vue` / `ChinaMap.vue` / `EarthView.vue`（Vue 壳确实叫这个名字），**不应再有任何 `ZhejiangThreeMap`**。若出现 `ZhejiangThreeMap`，改掉。

- [ ] **Step 12: 提交**

```bash
git add -A
git commit -m "docs: 技能文档全面支持 Vue/React 双框架交付"
```

---

## 完成标准

全部 8 个任务完成后，下列条件必须同时成立：

1. `python3 three-scope-map/scripts/sync_map_templates.py --check` 退出码 0。
2. `python3 three-scope-map/scripts/verify_template_integrity.py` 退出码 0。
3. `check_three_map_project.py --strict` 对两个模板都退出码 0。
4. 两个模板各自 `npm install && npm run build` 成功。
5. `docs/superpowers/baselines/2026-08-02-react-after/` 下 6 张截图与 `2026-08-02-vue-before/` 逐张肉眼一致。
6. React StrictMode 下无重复 canvas、无 WebGL context 泄漏、Console 无异常。
7. `grep -rn "ZhejiangThreeMap" three-scope-map README.md` 无输出。
