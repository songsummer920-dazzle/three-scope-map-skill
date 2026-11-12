# Three Scope Map · 3.0 实体与全息 Vue 模板

完整 Vue 3 + TypeScript + Vite 项目，提供 3.0 实体地球、规则细点/蜂窝全息地球及
配套行政地图：实体配套纹理玻璃 3D 地图，全息配套纯玻璃 3D 地图。
实体默认琥珀色；全息默认冰蓝色。地球与配套 3D 地图一起选择，
主色可独立调整。随 3.0.0 源码版于 2026-11-12 发布。

## 运行

需要 Node.js **`^20.19.0` 或 `>=22.12.0`**。本目录已包含依赖锁文件和完整许可声明：

```bash
npm ci
npm run build
npm run dev
```

`npm ci` 需访问配置的 npm 包源或准备好的本地缓存。保留整个模板，不要仅拷贝
Vue 文件而漏掉地图数据、纹理、缓存、辅助代码或声明文件。

## 业务接入

`src/App.vue` 是包含样式、颜色、材质和效果控件的演示入口。业务项目从
`src/components/map/FuiEarth.vue` 接入组件，并使用 `fuiMapPresentation.ts` 的
`FUI_SCENE_PRESETS.surface` / `.hologram` 配置实体/细点全息及配套地图；明确要求
蜂窝时使用 `FUI_SCENE_PRESETS['hologram-hex']`。组件宿主需要非零宽高。

仅集成地图时使用 `ChinaMap.vue` 宿主，不必添加地球入口。按业务布局集成并保留原样式
代码，默认保留「3D 地图 / 2D 地图 / 2D + 3D」切换按钮。`EarthChinaMap.vue` 已开启
目的地图 `show-view-switch`，业务接入时保持开启；仅在明确要求隐藏切换控件
或保留单一视图时关闭。模板、颜色、材质、扫光等演示控件仍只在明确要求时添加，
保留下钻、返回上级和返回地球。明确的独立 2D 任务无需添加无关渲染器。

Skill 调用示例：`用 3.0 实体地球`、`用 3.0 全息地球`，或
`整体改成 #2AF7FF`。单独换色保留已有项目的风格、材质、数据和导航。

## 联网与数据

默认 2D / 2D + 3D 底图使用在线 **OpenFreeMap**，样式、瓦片、字形、图标需要联网。
`src/components/map/mapDataAdapter.ts` 内置中国、浙江，其他行政层级默认按需访问
`geo.datav.aliyun.com`；默认模板仍需联网。离线/内网部署需配置
`vectorMapConfig.ts` / `vectorMapProvider.ts` 的底图与配套资源，并提供所需行政数据。

## 授权与署名

自有内容采用 [Summer Platform Restriction License 1.1](LICENSE)。允许普通业务
项目和客户定制开发、交付；将可复用地球/地图能力用于收费平台、SaaS、API、
Skill、插件、SDK、组件或模板等用途，须事先取得作者书面许可，具体以 LICENSE
为准。普通业务应用不因收费、订阅或多租户就自动属于禁止范围。历史 GPL 权利
和第三方条款继续有效。保留 [NOTICE](NOTICE)、
[LICENSES/](LICENSES/) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
部分随包地理数据与历史纹理的再分发来源记录仍待补齐。

源码署名必须保留：相应源码中的作者版权、署名、许可证/SPDX标识及来源不得
删除、遮蔽、篡改或以他人署名替代；含受保护内容的拆分、合并、迁移及改写同样
适用。README、文档或关于页面中的署名只能补充，不能替代源码声明。
作者：**宋夏天Dazzle**；公众号：**送你整个夏天**；
[原项目 three-scope-map-skill](https://github.com/songsummer920-dazzle/three-scope-map-skill)。
最终界面不强制常驻水印。

第三方地图数据、底图服务和贴图的商业授权不包含在自有代码许可中。使用者应按
实际使用及分发场景自行核实并取得所需许可，保留上游要求的署名；详见
[第三方说明](THIRD_PARTY_NOTICES.md)。来源记录不构成商业使用或再分发授权。
