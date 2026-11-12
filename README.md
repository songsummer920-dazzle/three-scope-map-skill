# Three Scope Map 3.0 · Earth and Geographic Map Skill

A geographic visualization skill with runnable Vue and native React projects for Three.js Earth,
administrative 3D maps, MapLibre 2D maps, and 2D + 3D overlays.

Choose Vue or native React independently of the Earth style. The project generator
accepts `--framework vue` or `--framework react`; Vue remains the default and
existing Vue and React projects retain their framework. Both reuse the geographic data,
materials, themes, workers and textures.

> **原始项目与源码署名：** 本仓库是 **宋夏天Dazzle** 的原始项目来源。
> 相应源码中的作者署名、版权、许可证/SPDX标识及来源必须保留，不得删除、
> 遮蔽、篡改或替换；README、文档或关于页面的署名不能替代源码声明。
> Fork、二创及修改版须说明原始来源和修改版身份，不得冒称完全原创或作者官方发布。
> 完整条件以 [LICENSE](LICENSE) 为准。

> **授权提示：未经作者事先书面许可，不得将本项目的 Skill、代码、模板、
> 组件或其修改版封装、集成或托管到自有或第三方平台，作为可复用的地球/地图
> 能力对外收费提供。** 收费整体中的免费功能、会员订阅、付费积分、按次调用、
> 捆绑或安排其他主体代收费用，均适用限制；不交源码、改名换皮或AI辅助改写后
> 仍含本项目受保护内容的，不自动获得豁免。
> 普通业务项目及客户定制开发、交付可按 [LICENSE](LICENSE) 使用；以定制开发
> 名义建设收费地图平台仍须另行获得书面许可。

## 效果预览 / Motion previews

作者全平台ID：宋夏天Dazzle  
公众号：送你整个夏天

以下动图录制自内置模板的实际运行效果，支持循环播放。

| 地球效果 | 地图效果 |
| --- | --- |
| **3.0 实体地球** | **纹理玻璃 3D 地图** |
| ![3.0 实体地球](three-scope-map/assets/readme/entity-earth-watermarked.gif) | ![纹理玻璃 3D 地图](three-scope-map/assets/readme/terrain-glass-map-watermarked.gif) |
| **点阵全息地球 · 蜂窝扫描** | **纯玻璃 3D 地图** |
| ![点阵全息地球 · 蜂窝扫描](three-scope-map/assets/readme/hologram-dots-watermarked.gif) | ![纯玻璃 3D 地图](three-scope-map/assets/readme/smooth-glass-map-watermarked.gif) |
| **蜂窝全息地球 · 网格扫描** | **2D + 3D 地理叠加** |
| ![蜂窝全息地球 · 网格扫描](three-scope-map/assets/readme/hologram-hex-watermarked.gif) | ![2D + 3D 地理叠加](three-scope-map/assets/readme/map-overlay-watermarked.gif) |

## 默认体验 / Default experience

新建项目未指定样式时，默认使用 **3.0 实体地球 + 纹理玻璃 3D 地图**：

```text
地球入场 → 点击中国 → 中国 3D 地图 → 省 → 市 → 区县
```

下钻范围取决于可用行政数据；保留返回上级、返回地球，以及
**3D 地图 / 2D 地图 / 2D + 3D** 切换。选择全息风格时，自动配套纯玻璃 3D 地图。
本包提供独立地球、地图 Skill 和可运行模板，不包含完整业务大屏、业务面板或指标数据。

## 快速使用 / Quick start

已安装 Skill 时，可以直接说：

```text
使用 three-scope-map，帮我创建并启动默认的 3.0 实体地球项目。
```

切换样式可说 `用 3.0 全息地球` 或 `用 2.0 风格`；换色只需说 `整体改成 #2AF7FF`。

## Vue 与 React / Framework selection

框架与地球样式分别选择：**Vue 和原生 React 均支持 3.0 实体、全息及 2.0 经典风格**。
已有 Vue / React 项目保留原框架；新建项目未指定框架时默认 Vue，未指定样式时默认 3.0 实体地球。

| 目标框架 | 可直接使用的指令 |
| --- | --- |
| Vue | `使用 three-scope-map，用 Vue 创建 3.0 实体地球，整体蓝色。` |
| React | `使用 three-scope-map，用原生 React 创建 3.0 实体地球，整体蓝色。` |

接入已有 React 项目可以说：`使用 three-scope-map，把 3.0 全息地球接入当前 React 页面，保留现有框架和主色。`

React 输出为原生 `.tsx` 组件，复用对应家族的地理数据、材质、主题、Worker 和纹理；
无需 Vue 运行时或 iframe。换样式、换色、三视图切换与源码署名要求同样适用。
完整框架接入方式见 [Vue / React integration](three-scope-map/references/react-integration.md)。

## Install or upgrade / 安装与升级

The installation and project-copy tools require Python **3.9 or newer** and use
only the Python standard library.

Run from this repository root, or from the directory containing the extracted
`three-scope-map/` folder:

```bash
python3 three-scope-map/scripts/install_skill.py
```

默认安装到 `~/.codex/skills/three-scope-map`。升级时，脚本先将旧 Skill 完整备份到
skills 目录之外的 `~/.codex/skill-backups/`，再整目录替换，避免合并残留旧文件。
旧版本的定制保留在备份中，不会自动迁回；需要时先比较，再按新版本接口迁移。
不要用 `cp -R` 向已有 Skill 目录合并升级。

自定义位置可使用 `--source <skill-folder>`、`--target <destination>` 和
`--backup-dir <external-backup-parent>`。ZIP 内的
[中文快速说明](three-scope-map/README.md)可独立阅读。

## Choose a style and color

| Request | Earth and matching 3D map |
| --- | --- |
| `用 2.0 风格` | 2.0 经典地球 + 经典 3D 地图。 |
| `用 3.0 实体地球` | 3.0 实体地球 + 纹理玻璃 3D 地图。 |
| `用 3.0 全息地球` | 3.0 全息地球（默认点阵）+ 纯玻璃 3D 地图；明确指定蜂窝纹理时切换地球图案。 |

New Earth or administrative-3D projects default to **3.0 实体地球**, with an amber palette.
Hologram projects start with a glacier-blue palette. Existing projects keep their
current style and color unless a change is requested.

Specify a color by name or HEX value. Recoloring preserves the selected style,
materials, geographic data and navigation.
Entity and hologram Earth both support grid or honeycomb scans independently of
the globe texture: `扫光改成蜂窝扫描` retains the current dot/hex pattern.

### Create a project

Create a complete, runnable FUI project in a new or empty directory:

```bash
python3 three-scope-map/scripts/create_map_project.py ./my-map
cd my-map
npm ci
npm run dev
```

For a native React project:

```bash
python3 three-scope-map/scripts/create_map_project.py ./my-react-map --preset fui --framework react
cd my-react-map
npm install
npm run build
npm run dev
```

`--preset fui` is the default; `--preset classic` selects the complete 2.0 family.
Both presets accept `--framework vue` and `--framework react`; omission keeps Vue.
The bundled Vue projects include lockfiles, so their initial install uses
`npm ci`. Generated React projects currently have no React lockfile: run
`npm install` once and retain the resulting `package-lock.json`; later installs
can use `npm ci`. The script refuses a non-empty destination, copies the complete
project and license notices, and does not run npm automatically.

Natural-language invocation:

```txt
使用 three-scope-map，创建一个 3.0 实体地球项目，整体蓝色。
```

### Change an existing project

```txt
使用 three-scope-map，把当前地图换成 3.0 全息风格，保留主色和数据。
```

The matching 3D map follows the chosen Earth style. Map-only projects can use the
same map materials without adding an Earth entrance.

### More examples

```txt
整体改成 #2AF7FF。
在现有 2D 底图上叠加 3D 地图，保留下钻和返回。
把地图范围从浙江切到江苏，保留配色和交互。
```

## Features

- **Earth entrances:** 2.0 classic, 3.0 entity and 3.0 hologram styles, with HUD,
  lighting, animated scans and Earth-to-map navigation.
- **Administrative 3D maps:** 纹理玻璃 3D 地图 and 纯玻璃 3D 地图, extruded
  geometry, province boundaries, reflections and region selection.
- **2D maps and overlays:** MapLibre basemaps, standalone renderer switching,
  and geographic 3D overlays sharing the basemap camera and WebGL context.
- **Geographic navigation:** world, country, province, city and district/county
  levels, subject to available administrative data. China scope includes a fixed
  screen-space South China Sea inset.
- **Theme control:** one primary color across Earth, maps, HUD and interaction
  effects, with separate controls for map materials and scan effects.

## Templates and integration

| Style | Canonical Vue source |
| --- | --- |
| 3.0 entity / hologram | [fui-earth-vue](three-scope-map/assets/templates/fui-earth-vue/README.md) |
| 2.0 classic | [songsummer-earth-vue](three-scope-map/assets/templates/songsummer-earth-vue/README.md) |

Use the complete template, including its data, textures, helpers and configuration.
Vue and React projects require Node.js `^20.19.0` or `>=22.12.0`. The two
bundled Vue templates include dependency lockfiles; generated React projects
create their own lockfile on the first `npm install`.
Each template already includes `LICENSE`, `NOTICE`, `LICENSES/` and
`THIRD_PARTY_NOTICES.md`; preserve them with the project.

Build a generated project with `npm run build`.

Vue uses `src/App.vue`; generated React projects use `src/App.tsx`. These are
demonstration shells. Integrate the selected family's maintained component into
the business layout:

| Purpose | Vue | Native React |
| --- | --- | --- |
| 3.0 entity / hologram Earth | `FuiEarth.vue` | `FuiEarth.tsx` |
| 2.0 classic Earth | `EarthChinaMap.vue` | `EarthChinaMap.tsx` |
| Administrative map host | `ChinaMap.vue` | `ChinaMap.tsx` |

React source under `assets/react/{fui,classic}/` is one part of the project;
use `create_map_project.py --framework react` to combine it with the complete
shared modules and assets. Do not copy only that directory. React props use
camelCase and event callbacks such as `primaryColor` and `onReady`; details are
in [React integration](three-scope-map/references/react-integration.md). SSR hosts
must mount these WebGL components through a client-only boundary.
Keep the `3D 地图 / 2D 地图 / 2D + 3D` selector by default; hide it only on an
explicit request to remove switching or keep a single view. Geographic drilldown,
back and Earth-return controls remain available. Style, color, material and effect
toolbars are opt-in. Standalone 2D tasks do not need unrelated renderers.
See the template READMEs for component entry points.

2D 底图及部分行政区下钻数据需要联网；离线部署可按[2D 接入文档](three-scope-map/references/map-2d-switching.md)配置。

Third-party maps, basemaps and textures follow their own licenses. Users must
verify and obtain the permissions required for their intended use; this project's
license does not replace them. See [third-party notices](THIRD_PARTY_NOTICES.md).

## License and attribution / 授权与署名

本版本提供的自有代码、Skill、模板和文档采用
[Summer Platform Restriction License 1.1](LICENSE)，属于带用途限制的源码可用授权，
不宣称为 GPL 或 OSI 开源许可证。

- **允许：** 学习、企业内部使用、普通商业业务项目及客户定制开发、交付，并可为
  开发、部署、维护等服务收费；不包括下述受限平台用途。
- **未经作者事先书面许可，禁止：** 将本项目全部、部分或修改版作为可复用的
  地球/地图能力，封装、集成或托管到收费平台、SaaS、低代码/可视化平台、
  AI/Agent 平台、API，或作为 Skill、插件、SDK、组件、模板、资源包销售及提供
  付费访问。独立销售的渲染、展示组件同样适用。
- **限制不因以下方式自动豁免：** 托管但不交源码、收费整体中的免费功能、捆绑
  收费、代收费用、改名换皮，或改写后仍保留受保护内容。普通业务应用不因收费
  或订阅制就自动成为受限平台；完整判断标准以 [LICENSE](LICENSE) 为准。
- **源码署名强制保留：** 使用、复制、修改、集成、交付或分发时，必须保留
  相应源码中的作者版权、署名、许可证/SPDX标识和来源；不得删除、遮蔽、
  篡改或以他人署名替代。含受保护内容的拆分、合并、迁移及改写同样适用。
  README等文档署名只能补充，不能代替源码署名。分发时还须保留
  [LICENSE](LICENSE)、[NOTICE](NOTICE)、[LICENSES/](LICENSES/) 和
  [第三方声明](THIRD_PARTY_NOTICES.md)，明确标注修改版。
  此前按1.0、GPL或其他有效授权取得的副本继续遵循原授权，第三方条款保持独立。

The author-owned material supplied in this distribution uses a source-available license with a platform-resale
restriction. Ordinary business use and client-specific delivery are permitted;
paid reusable Earth/map platforms and resource offerings require prior written
author permission. Hosted use, bundling and renamed or modified distributions do
not automatically avoid that requirement. The complete scope is defined by
[LICENSE](LICENSE); it does not revoke historical GPL grants or replace
third-party terms.

This is the original repository by **宋夏天Dazzle**. Attribution in source code
is mandatory: retain original copyright, author, license/SPDX and source notices
in the corresponding retained or adapted source. Do not remove, conceal, alter
or replace them. README, documentation, about-page or release-note credits may
supplement source notices but cannot replace them. No permanent application
watermark is required. Keep this author and origin information in source comments:

```txt
Based on three-scope-map-skill by 宋夏天Dazzle.
作者全平台ID：宋夏天Dazzle
公众号：送你整个夏天
Original repository: https://github.com/songsummer920-dazzle/three-scope-map-skill
```
