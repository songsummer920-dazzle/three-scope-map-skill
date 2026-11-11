# Three Scope Map 3.0 · Earth and Geographic Map Skill

A geographic visualization skill with runnable Vue templates for Three.js Earth,
administrative 3D maps, MapLibre 2D maps, 2D + 3D overlays, and contour terrain.

> **3.0 授权提示：未经作者事先书面许可，不得将本项目的 Skill、代码、模板、
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
| **3.0 实体地球** | **地形玻璃 3D 地图** |
| ![3.0 实体地球](three-scope-map/assets/readme/entity-earth-watermarked.gif) | ![地形玻璃 3D 地图](three-scope-map/assets/readme/terrain-glass-map-watermarked.gif) |
| **点阵全息地球 · 蜂窝扫描** | **纯玻璃 3D 地图** |
| ![点阵全息地球 · 蜂窝扫描](three-scope-map/assets/readme/hologram-dots-watermarked.gif) | ![纯玻璃 3D 地图](three-scope-map/assets/readme/smooth-glass-map-watermarked.gif) |
| **蜂窝全息地球 · 网格扫描** | **2D + 3D 地理叠加** |
| ![蜂窝全息地球 · 网格扫描](three-scope-map/assets/readme/hologram-hex-watermarked.gif) | ![2D + 3D 地理叠加](three-scope-map/assets/readme/map-overlay-watermarked.gif) |

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
| `用 2.0 风格` | Classic Earth and classic 3D map. |
| `用 3.0 实体地球` | Photographic FUI Earth and textured terrain-glass map. |
| `用 3.0 全息地球` | Regular-dot hologram Earth and smooth-glass map. Request a honeycomb globe explicitly to change its texture. |

New Earth or administrative-3D projects default to **3.0 entity Earth / 实体地球**, with an amber palette.
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

`--preset fui` is the default; `--preset classic` selects the complete 2.0 family.
The script refuses a non-empty destination, copies the complete template and its
license notices, and does not install packages or access npm automatically.

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
```

```txt
在现有 2D 底图上叠加 3D 地图，保留下钻和返回。
```

```txt
把地图范围从浙江切到江苏，保留配色和交互。
```

```txt
增加独立等高线模式，使用真实 DEM。
```

## Features

- **Earth entrances:** classic, photographic and holographic styles, with HUD,
  lighting, animated scans and Earth-to-map navigation.
- **Administrative 3D maps:** terrain-glass and smooth-glass surfaces, extruded
  geometry, province boundaries, reflections and region selection.
- **2D maps and overlays:** MapLibre basemaps, standalone renderer switching,
  and geographic 3D overlays sharing the basemap camera and WebGL context.
- **Contour terrain:** an independent terrain mode built from elevation data.
- **Geographic navigation:** world, country, province, city and district/county
  levels, subject to available administrative data. China scope includes a fixed
  screen-space South China Sea inset.
- **Theme control:** one primary color across Earth, maps, HUD and interaction
  effects, with separate controls for map materials and scan effects.

## Templates and integration

| Style | Complete Vue template |
| --- | --- |
| 3.0 entity / hologram | [fui-earth-vue](three-scope-map/assets/templates/fui-earth-vue/README.md) |
| 2.0 classic | [songsummer-earth-vue](three-scope-map/assets/templates/songsummer-earth-vue/README.md) |

Use the complete template, including its data, textures, helpers and configuration.
Both templates require Node.js `^20.19.0` or `>=22.12.0` and include dependency lockfiles.
Each template already includes `LICENSE`, `NOTICE`, `LICENSES/` and
`THIRD_PARTY_NOTICES.md`; preserve them with the project.

From a copied template or generated project:

```bash
npm ci
npm run build
npm run dev
```

Both templates' `src/App.vue` files are demonstration shells. The FUI shell
includes style and effect buttons for previewing capabilities. In a business
project, integrate `FuiEarth.vue`, `EarthChinaMap.vue` or the selected map component
into the business layout. Earth and administrative-3D integrations retain the
`3D 地图 / 2D 地图 / 2D + 3D` selector by default, including business layouts.
Hide it only on an explicit request to remove switching or keep a single view.
Style, color, material and effect demo controls remain opt-in; preserve the
selected renderer's style code and geographic navigation. Explicit standalone
2D or contour tasks do not need unrelated renderers. See each template's README
for entry points.

## Network and data / 联网范围

The default 2D and 2D + 3D basemap uses **OpenFreeMap** online, including its style,
tiles, glyphs and sprites. The administrative data adapter bundles China and
Zhejiang; other provinces and deeper city/district drilldown load from
`geo.datav.aliyun.com` on demand. Earth textures and the bundled geographic files
are local assets, but the default project is not a fully offline map.

For an offline or internal-network deployment, configure an available basemap
provider and its supporting resources in `vectorMapConfig.ts` /
`vectorMapProvider.ts`, and supply the required administrative levels through
`mapDataAdapter.ts`. Retain each provider's attribution and applicable data terms.
`npm ci` also needs access to the configured package registry or a prepared local cache.

Further documentation:

- [3.0 API and capability matrix](three-scope-map/references/v3-api.md)
- [2D + 3D overlay integration](three-scope-map/references/map-3d-overlay.md)
- [Performance and validation](three-scope-map/references/performance-pipeline.md)
- [Changelog](CHANGELOG.md)

## Version status

3.0.0 source release: **2026-11-12**. Local technical verification is complete.
Bundled geographic data and legacy textures still have unresolved upstream reuse
rights; see the [current asset review](three-scope-map/validation/3.0.0/asset-clearance-current.json).
The author-owned code license does not include commercial rights to third-party
maps, basemap services, imagery or textures. Users must check upstream terms and
obtain any permissions required for their own use, deployment or redistribution,
including attribution, fees and usage limits. Public download or a working demo
does not establish those rights. User-specific commercial authorization and the
right to distribute assets in this bundle are separate checks; provenance
records grant neither. Third-party permission does not replace the written
permission required for this project's restricted platform resale.
Citation metadata records version 3.0.0, the release date, public author attribution
and the license URL for the `v3.0.0` tag. Source publication does not establish
commercial or redistribution rights for third-party assets.

Clean installs, builds and WebGL regressions were tested on macOS with Chromium.
Other operating systems, browsers and physical GPUs have not been verified.
Detailed evidence and performance measurements are in the
[3.0 validation record](three-scope-map/validation/3.0.0/record.json).

## License and attribution / 授权与署名

3.0 自有代码、Skill 指令、模板和文档采用
[Summer Platform Restriction License 1.0](LICENSE)。

- **允许：** 个人学习、教育、企业内部使用、普通商业项目、客户定制开发及交付。
- **未经作者事先书面许可，禁止：** 将本项目全部、部分或修改版作为可复用的
  地球/地图能力，封装、集成或托管到自有或第三方收费平台、SaaS、
  低代码/可视化搭建平台、AI/Agent 平台、API，或作为 Skill、插件、SDK、组件、
  模板、资源包出售或提供付费访问；独立销售的渲染、展示组件同样包括在内。
- **收费方式：** 收费整体中的免费入口、试用、基础额度或部分免费功能均不
  自动豁免；会员、订阅、付费积分、按次收费、费用并入其他服务、捆绑销售及
  安排关联方或合作方代收同一服务费用，都按实际提供的能力和收费安排判断。
- **源码及改写：** 仅在服务器运行、不交付源码或只返回渲染结果，不自动豁免。
  改名、换皮、拆分、换语言/框架或AI辅助改写后，仍含本项目受保护内容或构成
  对其改编的，继续适用限制。
- **普通业务应用：** 地图仅承载自身具体业务信息或操作，不向使用者提供通用
  地球/地图开发、生成、调用、嵌入或复用能力的，不因收费、多租户或订阅制就
  自动属于禁止范围。普通业务查询、缩放、筛选、标注及报表操作依LICENSE使用。
- **客户定制：** 普通业务项目可以收费开发及交付；为客户建设、交付、运营或
  维护受限收费平台，不因单独签约、一次性交付或收开发服务费而获得豁免。
- **署名与许可：** 署名、原项目链接、公开可下载、一般技术答复或作者未提出
  异议，均不单独构成平台许可。书面许可须明确允许相应主体开展受限用途，
  不因委托开发或项目交付自动取得转授权。符合许可的分享和源码分发须保留
  授权、署名及适用声明；不要求在最终界面常驻水印。
- **适用范围：** 这是带用途限制的源码可用授权。历史已授予的 GPL 权利继续
  有效，第三方软件和素材遵循各自原有条款。完整授权以 [LICENSE](LICENSE) 为准。

The author's own material in this distribution uses
[Summer Platform Restriction License 1.0](LICENSE), a source-available license
with a platform-resale restriction; it is not GPL or OSI-approved open source.

- Personal, educational, internal and ordinary commercial projects, including
  client-specific development and delivery, are permitted.
- **Prior written permission is required to sell the Skill, templates or reusable
  map capability through paid platforms, SaaS, APIs, plugins, SDKs, component or
  template libraries, subscriptions or paid downloads.** Renaming and bundling
  do not remove this restriction. An ordinary business application is not
  prohibited merely because it uses a map and is sold.
- Free tiers within a paid offering, hosted use without source delivery,
  bundled fees, arranged third-party fee collection and rewrites retaining
  protected content do not automatically avoid the restriction. Custom-client
  contracts do not authorize restricted platforms. Ordinary business SaaS is
  permitted under LICENSE's conditions; author silence is not platform permission.
- Free sharing, tutorials and demonstrations are permitted with attribution.
  Retain the license and notices when distributing source, identify modified
  versions, and do not imply official authorship or endorsement. No permanent
  application watermark is required.
- Historical GPL grants remain valid. Third-party software, geographic data and
  imagery retain their own terms; this license grants no additional rights to them.

Retain [LICENSE](LICENSE), [NOTICE](NOTICE), [LICENSES/](LICENSES/),
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), source attribution and applicable
asset metadata when copying or distributing the templates.

This is the original repository by **宋夏天Dazzle**. Use the following attribution
for forks, derivatives, tutorials and redistribution:

```txt
Based on three-scope-map-skill by 宋夏天Dazzle.
作者全平台ID：宋夏天Dazzle
公众号：送你整个夏天
Original repository: https://github.com/songsummer920-dazzle/three-scope-map-skill
```

Attribution may be placed in code or documentation. Citation metadata is available
in [CITATION.cff](CITATION.cff).
