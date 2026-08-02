# Vue 模板抽取前视觉基线（2026-08-02）

本目录固化了 `three-scope-map/assets/templates/smart-mine-vue` 在"把渲染逻辑抽取进框架无关 TypeScript 核心"重构开始前的视觉状态。后续 Task 3/4/5/7 的每一次抽取都需要用同样的操作序列重新截图，并与本目录逐张对比，确认像素级视觉无回归。

## 元数据

- **截图日期**：2026-08-02
- **Vue 模板 git commit hash**：`f26b407734da9a59d40f4dcf138c14f1f6edd790`（分支 `react-support`，截图时的仓库 HEAD，早于本次基线提交本身）
- **浏览器**：系统安装的 Chrome，通过 Playwright `chromium.launch({ channel: 'chrome', headless: true })` 驱动，启动参数 `--use-gl=angle --use-angle=metal --enable-unsafe-swiftshader`（ANGLE Metal 后端，真实 GPU，非 software fallback）。实测 `WEBGL RENDERER = ANGLE (Apple, ANGLE Metal Renderer: Apple M2)`。
- **窗口尺寸**：1920 × 1080（CSS 像素，`devicePixelRatio` 由系统默认）
- **dev server**：`npm run dev`（Vite），`http://127.0.0.1:5173/`

## 第 6 张图：南海插图实测像素宽度

`.south-sea-inset` 的 `getBoundingClientRect().width`：

| 时机 | 实测宽度 | 高度 |
| --- | --- | --- |
| 回到国家层级、滚轮推近前 | 80.5px | 130.03px |
| 滚轮推近 40 次（约 1.5–4s 持续推近）后，相机已到最近 | **92px**（10 次滚轮后即饱和，此后不再变化） | 148.61px |

这与 `check_three_map_project.py --strict` 报告的 "South China Sea SVG camera-distance clamp found: 62-92px" 一致：92px 是相机推到最近时的钳制上限。

## 截图清单

| 文件名 | 操作 | 实际观察 |
| --- | --- | --- |
| `01-earth-first-paint.png` | 加载页面后 ~0.5s | 画面几乎全黑，仅中心有极淡的暗绿色光晕，地球模型尚未显现（intro 刚开始的淡入阶段）。 |
| `02-earth-intro-done.png` | 加载后 ~6s | 地球完整显现：绿色描边地形网格、中国大陆高亮凸起、多条国际飞线弧线、极地扫描环纹清晰可见。 |
| `03-cloud-handoff.png` | 在地球中国大陆区域点击后 ~1.5s | 画面大部分转黑，云层俯冲遮罩覆盖大半屏幕，隐约可见中国轮廓线条透出（云雾中的中国地图预览帧）。 |
| `04-china-settled.png` | 承上，点击后 ~4s | 中国 3D 地图完成落位：省级标签、涟漪点、国际飞线、追光轮廓线均可见；顶部"返回上级 / 国家·中国 / 保存…"控制条出现；右下角南海插图可见。 |
| `05-province-drilldown.png` | 点击浙江省标签后 ~2s | 成功下钻至浙江省：省内地级市标签（杭州市、宁波市、温州市等）、追光线、控制条文案变为"省级 / 浙江省"，"返回上级"按钮可点击。 |
| `06-south-sea-inset-zoomed.png` | 返回国家层级后滚轮推近 | 相机推到最近，南海插图放大到实测 92px 宽（见上表）；地图整体缩放范围有限，主要变化体现在南海插图的钳制放大上。 |

## 截图脚本

复用位置（不在仓库内，不提交）：

```
/private/tmp/claude-501/-Users-lijiaxi-prj-skills-three-scope-map-skill/c6bb05b9-bc96-4420-a2f6-60c229c28b79/scratchpad/capture.cjs
```

用法：

```bash
cd /private/tmp/claude-501/-Users-lijiaxi-prj-skills-three-scope-map-skill/c6bb05b9-bc96-4420-a2f6-60c229c28b79/scratchpad
node capture.cjs <输出目录> [http://127.0.0.1:5173/]
```

前提：该目录下已 `npm install playwright`；目标 dev server 已在后台运行；使用系统 Chrome（`channel: 'chrome'`），因为该环境下 Playwright 自带的 Chromium 版本与本机缓存不匹配，headless 启动会报 `Executable doesn't exist`。

脚本要点（后续任务复用时需要知道的坑）：

1. **两个 `<canvas>`**：`EarthChinaMap.vue` 的模板顺序是先渲染（可能隐藏的）`ChinaMap`/`ZhejiangThreeMap` 的画布容器 `.china-map-stage`，再渲染 `EarthView`，所以 `document.querySelector('canvas')`（不加限定）拿到的是**中国地图的画布**，不是地球画布。脚本里区分用 `.earth-view canvas`（地球状态）和 `.map-host canvas`（中国/省级状态）。
2. **地球点击命中检测**：`EarthView.vue` 的 `enterChina` 要求鼠标事件精确落在 `chinaMesh`（通过 `raycaster.intersectObject`）上，随手点屏幕中心大概率落空。脚本用"移动鼠标 + 读取 `canvas.style.cursor === 'pointer'`"的网格搜索来找到真正命中中国大陆的屏幕坐标，而不是猜测固定坐标。
3. **省份标签 ≠ 精确点击点**：`浙江省` 等标签是 CSS2DRenderer 生成的 `.city-label` 挂在零尺寸的 `.city-label-anchor` 上；直接点标签的可视文字框中心，实测会因 3D 透视下省份边界重叠而误触邻省（第一次尝试点在"浙江省"标签上，实际命中的是江苏省）。脚本改用同样的"移动鼠标 + 读取 `.city-label.is-selected` 文本"网格搜索，围绕标签锚点小范围扩展直到命中目标省份的 hover 高亮，再点击该精确坐标。
4. **状态断言**：脚本在每个关键节点用 DOM 而非纯计时判断状态是否真的切换了：`.china-map-stage.is-active` 是否出现、`.map-drill-control span` 文本是否变为 `省级 / 浙江省` / `国家 / 中国`。如果状态没到位会 `pollUntil` 重试，最终仍不满足则整体失败退出（不会静默截一张错误状态的图）。
5. 每张截图前都会检查对应 canvas 存在且 `width/height` 非零；截图完成后本任务人工用 Read 工具查看了全部 6 张 PNG，确认均能看到地球/地图内容，非纯黑/纯灰的失败截图。

## 质量闸门（截图前确认）

```
python3 three-scope-map/scripts/verify_template_integrity.py
# -> Bundled template integrity check passed: 31 files

python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict
# -> PASS, BLOCKERS: None
```

两条均为绿色后才开始截图。
