# Three Scope Map Skill

A Codex skill for building, migrating, theming, drilling down, and optimizing reusable Three.js 3D geographic maps for Vue/web dashboards.

> **Original project notice:** This repository is the original public source of
> `three-scope-map-skill` by **宋夏天Dazzle**. Forks, derivative works,
> tutorials, public showcases, and redistributed versions must retain the
> original attribution and must not imply that modified versions are original
> or official releases by the original author.
>
> **原始项目声明：** 本仓库是 **宋夏天Dazzle** 发布的
> `three-scope-map-skill` 原始公开来源。任何 fork、二创、教程、
> 公开展示或再分发版本都必须保留原作者署名，不得暗示修改版是完全原创
> 或原作者官方发布。

This repository intentionally contains only the standalone 3D map skill, not the full dashboard project.

## What It Supports

- Province, country, city, district, and world map scopes.
- Real GeoJSON-driven Three.js 3D map geometry.
- Dark HUD/B-end visualization style.
- Theme color generation from one main color.
- Terrain texture configuration: diffuse, height/displacement, normal, roughness.
- Labels, scatter points, ripple effects, fly lines, hover lift, HUD base ring, and outer-contour chase light.
- Hierarchical drilldown for every non-terminal scope: world -> country -> province -> city -> district.
- Data adapter pattern for local seed data, network fallback, cache, request de-duplication, and hover prefetch.
- GeoJSON preprocessing for smoother runtime rendering.
- Chunked map rebuild and Three.js resource disposal for reduced click jank.
- User camera angle save/reset with unified defaults and optional per-scope overrides.
- A one-to-one Vue 3 smart-mine map template with component code, GeoJSON, terrain textures, and label asset.

## Repository Layout

```txt
three-scope-map-skill/
  README.md
  LICENSE
  three-scope-map/
    SKILL.md
    agents/openai.yaml
    references/
    scripts/
    assets/templates/
```

## One-To-One Smart Mine Template

If you want the generated map to match the validated smart-mine 3D map as closely as possible, tell Codex to use the bundled template first instead of rebuilding from scratch:

```txt
Use three-scope-map skill and use the bundled one-to-one smart-mine Vue template first. Do not recreate the 3D map from scratch. Copy and adapt assets/templates/smart-mine-vue/src, then run the project and verify the map.
```

For one-to-one output on any requested region, keep this sentence in your prompt:

```txt
No matter which region I ask for, preserve the bundled smart-mine 3D map style one-to-one; only replace GeoJSON, labels, texture scope, fly-line source/targets, drilldown registry, and camera config.
```

The template includes the validated Vue component, map data, terrain textures, and label asset under:

```txt
three-scope-map/assets/templates/smart-mine-vue/src/
```

## Install

Copy the `three-scope-map` folder into your Codex skills directory:

```bash
cp -R three-scope-map ~/.codex/skills/
```

Or install it from this GitHub repository with the skill installer if your Codex environment supports GitHub skill installation.

## Example Prompts

### No Existing Project Prompt

Use this when the current folder is empty or is not yet a frontend project:

```txt
这是我要使用的 skill：
https://github.com/songsummer920-dazzle/three-scope-map-skill

请你自动完成全部操作，我不懂开发。

要求：
1. 先从这个 GitHub 链接安装或读取 three-scope-map skill。
2. 检查当前工作目录。
3. 如果当前目录不是前端项目，请自动初始化 Vue 3 + Vite + TypeScript 项目。
4. 安装需要的依赖，包括 three。
5. 使用真实 GeoJSON 数据创建一个 3D 地图。
6. 默认做浙江省地图。
7. 地图风格必须优先使用 skill 内置 one-to-one smart-mine Vue 模板，不要自由重画样式。
8. 必须先复制 skill 内置 assets/templates/smart-mine-vue/src 模板到当前项目并挂载组件，不要从零重写地图组件。
9. 地图风格使用暗色 HUD 风格，主色 #E8FF4F。
10. 需要包含地图挤出厚度、侧边渐变、地形纹理、外轮廓描边、内部边界、城市标签、hover 高亮凸起、飞线、追光、HUD 底座环、视角保存和恢复。
11. 地图组件填满父容器，不要把 .map-host 写死成 1920px x 1080px；如果需要 16:9，由外层大屏容器控制。
12. 除区县级外，每个层级都要支持下钻；浙江省级的涟漪和飞线从省会杭州市出发。
13. 完成后运行 skill 里的 scripts/check_three_map_project.py 对当前项目做严格自检，并修复所有非环境限制类 blocker。
14. 完成后必须通过 Vite dev server 打开页面做视觉检查；如果看不到真实 Three.js 地图，请自动检查依赖、挂载点、容器尺寸、GeoJSON、纹理路径、WebGL/控制台报错并修复到地图可见后再结束，不要只告诉我构建成功。
15. 不要用截图、SVG、CSS 或 2D 平面 GeoJSON 替代 Three.js 地图；如果 WebGL 真不可用，请明确告诉我具体原因和解决建议。
16. 完成后启动项目，并告诉我本地访问地址。
17. 如果中途需要我确认，只问我必须确认的问题；能自动决定的请直接完成。
```

### Existing Project Prompt

Use this when the current folder is already an app or website:

```txt
这是我要使用的 skill：
https://github.com/songsummer920-dazzle/three-scope-map-skill

请你自动安装或读取这个 three-scope-map skill，并把 3D 地图能力接入当前项目。

我不懂开发，请你自动完成：
1. 检查当前项目技术栈和目录结构。
2. 如果缺少 three 或相关依赖，请安装。
3. 如果当前项目不是 Vue 项目，请根据现有技术栈给出最小适配实现。
4. 使用真实 GeoJSON 数据。
5. 地图风格必须优先使用 skill 内置 one-to-one smart-mine Vue 模板，不要自由重画样式。
6. 必须先复制 skill 内置 assets/templates/smart-mine-vue/src 模板到当前项目并挂载组件，不要从零重写地图组件。
7. 创建暗色 HUD 风格 3D 地图，主色 #E8FF4F，包含 3D 挤出、侧边渐变、地形纹理、外轮廓描边、内部边界、标签、hover 高亮、飞线、追光、HUD 底座环、视角保存和恢复。
8. 地图组件填满父容器，不要把 .map-host 写死成 1920px x 1080px；如果项目是 16:9 大屏，由外层容器负责缩放。
9. 除区县级外，每个层级都要支持下钻；浙江省级的涟漪和飞线从省会杭州市出发。
10. 完成后运行 skill 里的 scripts/check_three_map_project.py 对当前项目做严格自检，并修复所有非环境限制类 blocker。
11. 完成后必须通过 Vite dev server 打开页面做视觉检查；如果看不到真实 Three.js 地图，请自动检查依赖、挂载点、容器尺寸、GeoJSON、纹理路径、WebGL/控制台报错并修复到地图可见后再结束，不要只告诉我构建成功。
12. 不要用截图、SVG、CSS 或 2D 平面 GeoJSON 替代 Three.js 地图；如果 WebGL 真不可用，请明确告诉我具体原因和解决建议。
13. 完成后运行项目，并告诉我本地访问地址。
```

### Specific Task Prompts

```txt
Use three-scope-map to build a dark HUD-style Three.js Zhejiang province map with city boundaries, labels, fly lines, hover lift, and chase light.
```

```txt
Use three-scope-map to switch this 3D map from Zhejiang to Jiangsu while keeping the same visual style.
```

```txt
Use three-scope-map to add China -> province -> city -> district drilldown and optimize click performance.
```

```txt
Use three-scope-map to change the map theme color to #2AF7FF and derive the full map color system.
```

```txt
Use three-scope-map to add user camera angle save/reset controls with unified default and per-scope override support.
```

## Scripts

The skill includes helper scripts under `three-scope-map/scripts/`:

- `resolve_map_data.py`: validate/download GeoJSON candidates.
- `resolve_map_textures.py`: validate or generate terrain texture sets.
- `generate_map_theme.py`: derive a full map theme from one color.
- `apply_map_theme.py`: apply a generated theme to a standard map theme file and optionally recolor the bundled label SVG pointer.
- `recolor_label_asset.py`: recolor only the `map-label-bg.svg` pointer triangle.
- `preprocess_map_data.py`: simplify GeoJSON and add render metadata.
- `check_three_map_project.py`: check a target project for required Vue/Vite/Three setup, copied map template files, map assets, one-to-one Three.js effects, fixed-size host mistakes, and SVG/image substitutes.

## Notes

- Confirm GeoJSON and texture data licenses before using them in commercial projects.
- Generated fallback textures are useful for development, but replace them with approved terrain assets when final accuracy matters.
- Performance improvements reduce main-thread jank but cannot guarantee zero stutter on every device.

## License

This project is licensed under **GPL-3.0-or-later**. If you copy, modify, fork,
redistribute, publish a derivative skill, or package this code into another
project, keep the license and source attribution with your distribution.

Required files and notices to preserve:

- `LICENSE`
- `NOTICE`
- `CITATION.cff`
- Source-code attribution comments and SPDX headers
- Third-party GeoJSON or texture metadata and license notices

GPL protects redistribution of this code, but it cannot stop every kind of
copying on its own. If you need stricter commercial restrictions, use a custom
source-available license instead of publishing as open source.

## Attribution / 二创署名

When using, modifying, redistributing, forking, publishing tutorials based on,
or creating derivative skills from this project, credit the original source:

```txt
Based on three-scope-map-skill by 宋夏天Dazzle.
作者全平台ID：宋夏天Dazzle
公众号：送你整个夏天
Original repository: https://github.com/songsummer920-dazzle/three-scope-map-skill
```

Do not remove `LICENSE`, `NOTICE`, `CITATION.cff`, code attribution comments, or
documentation attribution sections from modified versions. Do not imply that
forks, tutorials, packaged distributions, or derivative skills are official
releases by the original author unless you have explicit permission.

The attribution is intended for comments, metadata, README, documentation,
release notes, tutorial pages, or marketplace descriptions. It is not rendered
in generated UI unless explicitly requested.

## Attribution and Misrepresentation Notice / 署名与禁止误导声明

If you modify, fork, redistribute, publish tutorials based on, publicly
showcase, or create derivative skills/projects from this repository, you must
preserve the original author attribution and clearly mark your version as
modified from this project.

You must not remove `LICENSE`, `NOTICE`, `CITATION.cff`, README attribution
sections, SPDX headers, or source-code attribution comments.

You must not misrepresent the origin of this project, imply that a modified
version is your original work, or imply that a fork, derivative, tutorial,
packaged distribution, or derivative skill is an official release by the
original author without explicit permission.

Required attribution:

```txt
Based on three-scope-map-skill by 宋夏天Dazzle
作者全平台ID：宋夏天Dazzle
公众号：送你整个夏天
Original repository: https://github.com/songsummer920-dazzle/three-scope-map-skill
```

中文说明：

如果你基于本项目进行修改、二创、fork、分发、教程录制、公开展示、
插件/skill 发布或衍生项目发布，必须保留原作者署名，并明确标注
你的版本是基于本项目修改而来。

不得删除 `LICENSE`、`NOTICE`、`CITATION.cff`、README 署名说明、SPDX 头信息
或源码中的作者署名注释。

不得误导他人认为该项目或其二创版本是你的完全原创作品；未经明确许可，
不得暗示二创版本、教程、分发包或衍生 skill 是原作者官方发布。

必须保留署名：

```txt
基于 three-scope-map-skill 修改
作者全平台ID：宋夏天Dazzle
公众号：送你整个夏天
原始仓库：https://github.com/songsummer920-dazzle/three-scope-map-skill
```

## Citation

GitHub can read `CITATION.cff` and show citation metadata for this repository.
For papers, articles, tutorials, courseware, or public demos, cite the original
repository and author information above.
