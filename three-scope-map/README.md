# Three Scope Map 3.0 · 中文快速说明

这是可安装的 Codex 地球与地理地图 Skill，支持 Vue 3 或原生 React，使用
TypeScript + Vite：地球入口、行政区 3D 地图、MapLibre 2D 和 2D + 3D 叠加。
React 生成原生 TSX 组件，不依赖 Vue 运行时。省略框架参数时默认 Vue；已有项目
保留原框架。两套复用对应家族的地图数据、材质、主题、Worker 和纹理。

> **原始项目与源码署名：** 本仓库是 **宋夏天Dazzle** 的原始项目来源。
> 相应源码中的作者署名、版权、许可证/SPDX标识及来源必须保留，不得删除、
> 遮蔽、篡改或替换；README、文档或关于页面的署名不能替代源码声明。
> Fork、二创及修改版须说明原始来源和修改版身份，不得冒称完全原创或作者官方发布。
> 完整条件以 [LICENSE](LICENSE) 为准。

## 效果预览

作者全平台ID：宋夏天Dazzle  
公众号：送你整个夏天

以下动图录制自内置模板的实际运行效果，支持循环播放。

| 地球效果 | 地图效果 |
| --- | --- |
| **3.0 实体地球** | **纹理玻璃 3D 地图** |
| ![3.0 实体地球](assets/readme/entity-earth-watermarked.gif) | ![纹理玻璃 3D 地图](assets/readme/terrain-glass-map-watermarked.gif) |
| **点阵全息地球 · 蜂窝扫描** | **纯玻璃 3D 地图** |
| ![点阵全息地球 · 蜂窝扫描](assets/readme/hologram-dots-watermarked.gif) | ![纯玻璃 3D 地图](assets/readme/smooth-glass-map-watermarked.gif) |
| **蜂窝全息地球 · 网格扫描** | **2D + 3D 地理叠加** |
| ![蜂窝全息地球 · 网格扫描](assets/readme/hologram-hex-watermarked.gif) | ![2D + 3D 地理叠加](assets/readme/map-overlay-watermarked.gif) |

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
完整框架接入方式见 [Vue / React 接入文档](references/react-integration.md)。

## 安装或升级 Skill

解压 ZIP 后，在 `three-scope-map/` 目录执行；需 Python **3.9 或更新版本**：

```bash
python3 scripts/install_skill.py
```

默认安装到 `~/.codex/skills/three-scope-map`。升级时先完整备份到 skills 目录之外的
`~/.codex/skill-backups/`，再整目录替换；不要用 `cp -R` 合并升级。旧定制保留在
备份中，不会自动迁回。自定义位置用 `--source`、`--target` 和 `--backup-dir`。

## 样式与颜色配置

| 调用示例 | 地球与配套 3D 地图 |
| --- | --- |
| `使用 three-scope-map，用 3.0 实体地球。` | 3.0 实体地球 + 纹理玻璃 3D 地图，默认琥珀色。 |
| `使用 three-scope-map，用 3.0 全息地球。` | 规则细点全息地球 + 纯玻璃 3D 地图，默认冰蓝色；明确指定蜂窝地球或蜂窝纹理时切换地球图案。 |
| `使用 three-scope-map，用 2.0 风格。` | 经典地球 + 经典 3D 地图。 |

新地球或行政 3D 项目未指定风格时使用 3.0 实体；已有项目保持原风格和主色，
地图单独使用时无需添加地球入口。换色示例：`整体改成 #2AF7FF。`
换色保留当前风格、材质、数据和导航。
实体与全息均支持 `扫光改成蜂窝扫描。`；该指令仅切换扫描效果，保留地球原有纹理。

## 创建并运行项目

要求 Python **3.9 或更新版本**，以及 Node.js **`^20.19.0` 或 `>=22.12.0`**。
在本 Skill 目录中执行：

```bash
python3 scripts/create_map_project.py ../my-map --preset fui
cd ../my-map
npm ci
npm run build
npm run dev
```

原生 React 项目使用：

```bash
python3 scripts/create_map_project.py ../my-react-map --preset fui --framework react
cd ../my-react-map
npm install
npm run build
npm run dev
```

`--preset fui` 可省略；2.0 使用 `--preset classic`。两种风格均支持
`--framework vue` / `--framework react`，省略时默认 Vue。内置 Vue 模板带锁文件，
首次可用 `npm ci`；React 生成项目目前不带 React 锁文件，首次应执行 `npm install`，
保留新生成的 `package-lock.json` 后再用 `npm ci`。
脚本拒绝非空目标目录，复制完整实现及 `LICENSE`、`NOTICE`、`LICENSES/`、
`THIRD_PARTY_NOTICES.md`，不会自动执行 npm 或下载依赖。也可用
`--source <skill目录>` 指定模板来源。

## 业务项目接入

Vue 的 `src/App.vue` 与 React 的 `src/App.tsx` 都是演示入口；业务项目应使用
所选家族的完整组件、数据、纹理和辅助模块：

| 用途 | Vue | 原生 React |
| --- | --- | --- |
| 3.0 实体 / 全息地球 | `FuiEarth.vue` | `FuiEarth.tsx` |
| 2.0 经典地球 | `EarthChinaMap.vue` | `EarthChinaMap.tsx` |
| 单独行政地图宿主 | `ChinaMap.vue` | `ChinaMap.tsx` |

`assets/react/{fui,classic}/` 仅是原生 React 项目的组成部分，不能单独复制当作
完整项目；应通过生成器组合共享模块和资源。React 属性使用 camelCase，事件使用
`onReady` 等回调。SSR 项目应在客户端组件边界挂载 WebGL 地图。具体见
[Vue / React 接入](references/react-integration.md)、
[FUI README](assets/templates/fui-earth-vue/README.md)和
[2.0 README](assets/templates/songsummer-earth-vue/README.md)。

默认保留「3D 地图 / 2D 地图 / 2D + 3D」切换按钮；只有明确要求隐藏切换或保留
单一视图时才关闭，仅指定初始 3D 视图不关闭切换。FUI 的 `show-view-switch`
默认开启。样式、颜色、材质和效果演示工具条只在明确要求时添加；保留下钻、
返回上级和返回地球。独立 2D 任务无需加入无关渲染器。

详细集成见 [3.0 API](references/v3-api.md)、[FUI](references/fui-earth.md)和
[2.0 模板](references/one-to-one-template.md)。

2D 底图及部分行政区下钻数据需要联网；离线部署可按[2D 接入文档](references/map-2d-switching.md)配置。

## 授权、署名与当前状态

本版本提供的自有代码、Skill、模板和文档采用
[Summer Platform Restriction License 1.1](LICENSE)，属于带用途限制的源码可用授权。

- **允许：** 学习、内部使用、普通商业业务项目及客户定制开发、交付。
- **未经作者事先书面许可，禁止：** 将本项目或修改版作为可复用的地球/地图能力，
  在收费平台、SaaS、AI/Agent 平台、API、Skill、插件、SDK、组件、模板或资源包
  中销售或提供付费访问。收费整体中的免费入口、托管不交源码、捆绑收费及
  保留受保护内容的改写不自动豁免；普通业务应用不因收费或订阅制就自动属于
  受限平台。完整范围以 [LICENSE](LICENSE) 为准。
- **源码署名强制保留：** 使用、复制、修改、集成、交付或分发时，必须保留
  相应源码中的作者版权、署名、许可证/SPDX标识和来源，不得删除、遮蔽、
  篡改或以他人署名替代。含受保护内容的拆分、合并、迁移及改写同样适用。
  README等文档署名只能补充，不能替代源码署名。分发还须保留
  [LICENSE](LICENSE)、[NOTICE](NOTICE)、[LICENSES/](LICENSES/) 和
  [第三方声明](THIRD_PARTY_NOTICES.md)，明确标注修改版。
  此前按1.0、GPL或其他有效授权取得的副本继续遵循原授权；第三方条款独立适用。

第三方地图、底图及纹理遵循各自授权。使用者须按实际用途核对并取得所需许可；
本项目许可不代替第三方授权。详见 [第三方声明](THIRD_PARTY_NOTICES.md)。

以下作者及来源信息必须保留在相应源码的注释或源码内元数据中，不能只放在
README、项目文档或关于页面。文档中可以另作补充；最终界面不强制常驻水印：

```text
Based on three-scope-map-skill by 宋夏天Dazzle.
作者全平台ID：宋夏天Dazzle
公众号：送你整个夏天
Original repository: https://github.com/songsummer920-dazzle/three-scope-map-skill
```
