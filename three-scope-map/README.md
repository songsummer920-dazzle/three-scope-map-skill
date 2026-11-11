# Three Scope Map 3.0 · 中文快速说明

这是可安装的 Codex 地球与地理地图 Skill，内含完整 Vue 3 + TypeScript + Vite
模板：地球入口、行政区 3D 地图、MapLibre 2D、2D + 3D 叠加和独立等高线地形。
**3.0.0 源码发布：2026-11-12。**

## 效果预览

作者全平台ID：宋夏天Dazzle  
公众号：送你整个夏天

以下动图录制自内置模板的实际运行效果，支持循环播放。

| 地球效果 | 地图效果 |
| --- | --- |
| **3.0 实体地球** | **地形玻璃 3D 地图** |
| ![3.0 实体地球](assets/readme/entity-earth-watermarked.gif) | ![地形玻璃 3D 地图](assets/readme/terrain-glass-map-watermarked.gif) |
| **点阵全息地球 · 蜂窝扫描** | **纯玻璃 3D 地图** |
| ![点阵全息地球 · 蜂窝扫描](assets/readme/hologram-dots-watermarked.gif) | ![纯玻璃 3D 地图](assets/readme/smooth-glass-map-watermarked.gif) |
| **蜂窝全息地球 · 网格扫描** | **2D + 3D 地理叠加** |
| ![蜂窝全息地球 · 网格扫描](assets/readme/hologram-hex-watermarked.gif) | ![2D + 3D 地理叠加](assets/readme/map-overlay-watermarked.gif) |

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
| `使用 three-scope-map，用 3.0 实体地球。` | 实体/写实 FUI 地球 + 地形玻璃地图，默认琥珀色。 |
| `使用 three-scope-map，用 3.0 全息地球。` | 规则细点全息地球 + 光滑玻璃地图，默认冰蓝色；明确指定蜂窝地球或蜂窝纹理时切换地球图案。 |
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

`--preset fui` 可省略；2.0 使用 `--preset classic`。脚本拒绝非空目标目录，复制
完整模板及 `LICENSE`、`NOTICE`、`LICENSES/`、`THIRD_PARTY_NOTICES.md`，不会自动
执行 npm 或下载依赖。也可用 `--source <skill目录>` 指定模板来源。

## 业务项目接入

`src/App.vue` 是演示入口，业务项目应使用所选模板家族的完整组件、数据、纹理和
辅助模块：3.0 地球使用 `FuiEarth.vue`，2.0 地球使用 `EarthChinaMap.vue`；
单独行政地图优先使用 `ChinaMap.vue` 宿主。具体入口见
[FUI README](assets/templates/fui-earth-vue/README.md)和
[2.0 README](assets/templates/songsummer-earth-vue/README.md)。

默认保留「3D 地图 / 2D 地图 / 2D + 3D」切换按钮；只有明确要求隐藏切换或保留
单一视图时才关闭，仅指定初始 3D 视图不关闭切换。FUI 的 `show-view-switch`
默认开启。样式、颜色、材质和效果演示工具条只在明确要求时添加；保留下钻、
返回上级和返回地球。独立 2D 或等高线任务无需加入无关渲染器。

详细集成见 [3.0 API](references/v3-api.md)、[FUI](references/fui-earth.md)和
[2.0 模板](references/one-to-one-template.md)。

## 联网范围与离线部署

默认 2D/2D + 3D 使用 **OpenFreeMap** 在线底图，行政数据内置中国和浙江，其他
省、市及区县按需请求 `geo.datav.aliyun.com`。地球纹理和随包地理文件可本地
加载，但默认项目仍需联网。

离线或内网部署需在 `vectorMapConfig.ts` / `vectorMapProvider.ts` 更换底图及其
配套资源，并在 `mapDataAdapter.ts` 提供所需行政层级数据。保留对应署名与条款；
`npm ci` 需要可用包源或本地依赖缓存。

## 授权、署名与当前状态

自有代码、Skill、模板和文档采用
[Summer Platform Restriction License 1.0](LICENSE)，属于带用途限制的源码可用授权。

- **允许：** 学习、内部使用、普通商业业务项目及客户定制开发、交付。
- **未经作者事先书面许可，禁止：** 将本项目或修改版作为可复用的地球/地图能力，
  在收费平台、SaaS、AI/Agent 平台、API、Skill、插件、SDK、组件、模板或资源包
  中销售或提供付费访问。收费整体中的免费入口、托管不交源码、捆绑收费及
  保留受保护内容的改写不自动豁免；普通业务应用不因收费或订阅制就自动属于
  受限平台。完整范围以 [LICENSE](LICENSE) 为准。
- 分发源码时保留 [NOTICE](NOTICE)、[LICENSES/](LICENSES/)、
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)和作者署名，明确标注修改版。
  历史已合法授予的 GPL 权利继续有效，第三方材料遵循各自条款。

自有代码许可不包含第三方地图数据、底图服务、影像或纹理的商业授权。使用者须按
实际使用、部署及分发场景取得所需许可并履行署名、费用和使用范围要求。
当前仍有 [部分素材再分发权利待核实](validation/3.0.0/asset-clearance-current.json)；
公开下载或示例可运行不代表取得商业或再分发许可，也不替代本项目受限平台用途
所需的书面许可。详见 [第三方声明](THIRD_PARTY_NOTICES.md)。

分享、教程、衍生及再分发请保留以下署名；不要求最终界面常驻水印：

```text
Based on three-scope-map-skill by 宋夏天Dazzle.
作者全平台ID：宋夏天Dazzle
公众号：送你整个夏天
Original repository: https://github.com/songsummer920-dazzle/three-scope-map-skill
```

本版已完成 macOS + Chromium 本地技术验证，详见
[验证记录](validation/3.0.0/record.json)。[引用元数据](CITATION.cff)记录版本、作者、
发布日期和 `v3.0.0` 标签许可 URL。
