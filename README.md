# Three Scope Map Skill

A Codex skill for building, migrating, theming, drilling down, and optimizing reusable Three.js 3D geographic maps for Vue/web dashboards.

This repository intentionally contains only the standalone 3D map skill, not the full dashboard project.

## What It Supports

- Province, country, city, district, and world map scopes.
- Real GeoJSON-driven Three.js 3D map geometry.
- Dark HUD/B-end visualization style.
- Theme color generation from one main color.
- Terrain texture configuration: diffuse, height/displacement, normal, roughness.
- Labels, scatter points, ripple effects, fly lines, hover lift, HUD base ring, and outer-contour chase light.
- Hierarchical drilldown: country -> province -> city -> district.
- Data adapter pattern for local seed data, network fallback, cache, request de-duplication, and hover prefetch.
- GeoJSON preprocessing for smoother runtime rendering.
- Chunked map rebuild and Three.js resource disposal for reduced click jank.
- User camera angle save/reset with unified defaults and optional per-scope overrides.

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

## Install

Copy the `three-scope-map` folder into your Codex skills directory:

```bash
cp -R three-scope-map ~/.codex/skills/
```

Or install it from this GitHub repository with the skill installer if your Codex environment supports GitHub skill installation.

## Example Prompts

### First Use Prompt

Use this when starting from an empty folder or an unknown project:

```txt
Use three-scope-map skill to create or integrate a reusable Three.js 3D map.

First inspect the current folder:
- If it is not a frontend project, scaffold a Vue 3 + Vite + TypeScript project.
- If it is already a frontend project, adapt to its existing structure.
- Install missing dependencies such as three.
- Use real GeoJSON data.
- Build a dark HUD-style 3D map with extrusion, side gradient, terrain texture, outer contour, internal boundaries, labels, hover lift, fly lines, chase light, and camera save/reset controls.
- Run the project and provide the local URL.
```

Chinese version:

```txt
使用 three-scope-map skill，帮我创建或接入一个可复用的 Three.js 3D 地图。

请先检查当前目录：
- 如果当前目录还不是前端项目，请先初始化 Vue 3 + Vite + TypeScript 项目。
- 如果已经是前端项目，请先检查项目结构后再接入。
- 如果缺少 three 等依赖，请安装。
- 使用真实 GeoJSON 数据。
- 创建暗色 HUD 风格 3D 地图，包含地图挤出厚度、侧边渐变、地形纹理、外轮廓描边、内部边界、标签、hover 凸起、飞线、追光、视角保存和恢复。
- 完成后运行项目并告诉我本地访问地址。
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
- `apply_map_theme.py`: apply a generated theme to a standard map theme file.
- `preprocess_map_data.py`: simplify GeoJSON and add render metadata.

## Notes

- Confirm GeoJSON and texture data licenses before using them in commercial projects.
- Generated fallback textures are useful for development, but replace them with approved terrain assets when final accuracy matters.
- Performance improvements reduce main-thread jank but cannot guarantee zero stutter on every device.

## Attribution

Code-only attribution embedded in the skill:

```txt
作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
```

The attribution is intended for comments/metadata only and is not rendered in generated UI unless explicitly requested.
