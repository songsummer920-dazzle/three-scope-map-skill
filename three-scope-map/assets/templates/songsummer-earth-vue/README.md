# Three Scope Map · 2.0 经典 Vue 模板

完整 Vue 3 + TypeScript + Vite 项目，保留 2.0 经典地球与配套行政 3D 地图，默认
经典绿色。它随 3.0 Skill 提供；新项目未指定风格时由 Skill 选择 3.0 实体，明确
指定 `用 2.0 风格` 时选择本模板。本模板随 3.0.0 源码版于 2026-11-12 分发。

## 运行

需要 Node.js **`^20.19.0` 或 `>=22.12.0`**。本目录包含依赖锁文件和完整许可声明：

```bash
npm ci
npm run build
npm run dev
```

`npm ci` 需访问配置的 npm 包源或准备好的本地缓存。保留完整数据、纹理、辅助
代码与声明文件，不要只拷贝 Vue 文件。

## 业务接入

`src/App.vue` 是挂载 `EarthChinaMap.vue` 的演示入口。业务项目将
`src/components/map/EarthChinaMap.vue` 接入自己的布局；直接行政 3D 地图使用
`ChinaMap.vue` 宿主，内部使用 `ZhejiangThreeMap.vue`。该名称不限制地区，范围与
数据通过同一套组件配置。
2D 和独立等高线分别使用 `VectorMap.vue`、`ContourMap.vue` 及对应依赖。
组件宿主需要非零宽高，保留原样式代码和地理导航。

地球或行政 3D 地图接入默认保留「3D 地图 / 2D 地图 / 2D + 3D」切换按钮；只有
明确要求隐藏切换控件或保留单一视图时才关闭。风格、颜色、材质和效果等
演示控件仅在明确要求时添加，不默认集成演示工具条。明确的独立 2D/等高线任务
无需添加无关渲染器。
Skill 调用示例：`用 2.0 风格`；换色示例：`整体改成 #2AF7FF`。换色保留材质、
数据和导航。不要将经典与 FUI 两套渲染文件零散混用。

## 联网与数据

默认 2D / 2D + 3D 底图使用在线 **OpenFreeMap**，样式、瓦片、字形、图标需要联网。
`src/components/map/mapDataAdapter.ts` 内置中国、浙江，其他行政层级默认按需访问
`geo.datav.aliyun.com`；默认模板仍需联网。离线/内网部署需配置
`vectorMapConfig.ts` / `vectorMapProvider.ts` 的底图与配套资源，并提供所需行政数据。

## 授权与署名

本次分发的自有内容采用 [Summer Platform Restriction License 1.0](LICENSE)。允许
普通业务项目和客户定制开发、交付；将可复用地球/地图能力用于收费平台、SaaS、
API、Skill、插件、SDK、组件或模板等用途，须事先取得作者书面许可，具体以
LICENSE 为准。普通业务应用不因收费、订阅或多租户就自动属于禁止范围。
历史 GPL 已授予的权利和第三方条款继续有效。保留 [NOTICE](NOTICE)、
[LICENSES/](LICENSES/) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
部分随包地理数据与历史纹理的再分发来源记录仍待补齐。

分享、教程及再分发保留作者与原项目链接：**宋夏天Dazzle**；公众号：**送你整个夏天**；
[原项目 three-scope-map-skill](https://github.com/songsummer920-dazzle/three-scope-map-skill)。
无需在最终界面常驻水印。

第三方地图数据、底图服务和贴图的商业授权不包含在自有代码许可中。使用者应按
实际使用及分发场景自行核实并取得所需许可，保留上游要求的署名；详见
[第三方说明](THIRD_PARTY_NOTICES.md)。来源记录不构成商业使用或再分发授权。
