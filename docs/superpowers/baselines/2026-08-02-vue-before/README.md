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

**稳定复用路径**（仓库内，但 `.superpowers/` 已被 `.gitignore` 忽略，不会被提交，也不随会话 scratchpad 失效）：

```
.superpowers/sdd/2026-08-02-react-support/capture.cjs
```

> 注意：早期版本曾把脚本放在某次会话专属的 `/private/tmp/claude-501/.../scratchpad/` 目录下——那个路径只在产生它的那次会话里可达，**不要**依赖它。上面这条仓库内路径才是 Task 3/4/5/7 应该使用的。

脚本本身已经把输出目录做成命令行参数（`process.argv[2]`），不同任务截图到不同目录即可，互不覆盖。

用法（先在另一个终端/后台启动 `smart-mine-vue` 的 `npm run dev`）：

```bash
# 1. 启动 dev server（后台）
cd /Users/lijiaxi/prj/skills/three-scope-map-skill/three-scope-map/assets/templates/smart-mine-vue
npm run dev

# 2. 跑截图脚本，输出到你自己的目录（不要覆盖本基线目录）
NODE_PATH=/private/tmp/claude-501/-Users-lijiaxi-prj-skills-three-scope-map-skill/c6bb05b9-bc96-4420-a2f6-60c229c28b79/scratchpad/node_modules \
  node /Users/lijiaxi/prj/skills/three-scope-map-skill/.superpowers/sdd/2026-08-02-react-support/capture.cjs <输出目录> [http://127.0.0.1:5173/]
```

`playwright` 本身没有装进仓库（不能新增依赖），当前借用的是上面那次会话 scratchpad 里已经装好的 `node_modules`（同一目录下还装了 `pngjs`，供亮度判据用），通过 `NODE_PATH` 指给 Node 用。**这个 scratchpad 目录同样不保证长期存在** —— 如果 `NODE_PATH` 指向的路径已经失效（报 `Cannot find module 'playwright'` 或 `'pngjs'`），就地在任意可写目录下 `npm install playwright pngjs`，再把 `NODE_PATH` 换成新目录的 `node_modules` 路径即可，脚本本身不用改。

启动浏览器必须用 `channel: 'chrome'`（脚本里已经这样写死，见 `chromium.launch` 调用）：本机缓存的 Playwright 自带 Chromium 版本与系统不匹配，headless 用自带 Chromium 会报 `Executable doesn't exist`；改用系统安装的 Chrome 后一切正常。

脚本要点（后续任务复用时需要知道的坑）：

1. **两个 `<canvas>`**：`EarthChinaMap.vue` 的模板顺序是先渲染（可能隐藏的）`ChinaMap`/`ZhejiangThreeMap` 的画布容器 `.china-map-stage`，再渲染 `EarthView`，所以 `document.querySelector('canvas')`（不加限定）拿到的是**中国地图的画布**，不是地球画布。脚本里区分用 `.earth-view canvas`（地球状态）和 `.map-host canvas`（中国/省级状态）。
2. **地球点击命中检测**：`EarthView.vue` 的 `enterChina` 要求鼠标事件精确落在 `chinaMesh`（通过 `raycaster.intersectObject`）上，随手点屏幕中心大概率落空。脚本用"移动鼠标 + 读取 `canvas.style.cursor === 'pointer'`"的网格搜索来找到真正命中中国大陆的屏幕坐标，而不是猜测固定坐标。
3. **省份标签 ≠ 精确点击点**：`浙江省` 等标签是 CSS2DRenderer 生成的 `.city-label` 挂在零尺寸的 `.city-label-anchor` 上；直接点标签的可视文字框中心，实测会因 3D 透视下省份边界重叠而误触邻省（第一次尝试点在"浙江省"标签上，实际命中的是江苏省）。脚本改用同样的"移动鼠标 + 读取 `.city-label.is-selected` 文本"网格搜索，围绕标签锚点小范围扩展直到命中目标省份的 hover 高亮，再点击该精确坐标。

### 确定性契约：每张截图都等到"真的到达目标状态"才拍，绝不定时硬睡

第一版脚本对 6 张图里的每一张都用固定 `sleep(fixedMs)` 起拍，实测在这个 headless 环境下 WebGL/纹理加载耗时抖动很大（同一张图不同次运行需要等待的真实时长可以从 ~6s 抖动到 ~25s），导致固定延时有时截到"还没到目标状态"的半途画面（最明显的是 `02-earth-intro-done` 偶尔截成接近纯黑，和 `01` 状态混淆）。这会让 Task 3/4/5/7 的像素对比失去意义——没法区分"搬运搞坏了渲染"还是"这次运气不好又抖动了"。

现在每张截图都由一个明确的、可轮询的就绪判据来门控，判据不满足就持续轮询（间隔数百毫秒），超时（每张给足 8–30s）仍不满足则**直接抛错、非零退出码**，并在错误信息里写明是哪一张截图、卡在等什么条件——绝不会静默保存一张状态不对的图。各张图的判据：

| 文件名 | 就绪判据 | 为什么选这个 |
| --- | --- | --- |
| `01-earth-first-paint` | `.earth-view canvas` 存在且 `width/height` 非零，再等两个 `requestAnimationFrame` | 这张图**本来就该暗**（intro 刚开始），不能用"够亮"当判据；只确认画布已经真正画过至少一帧 |
| `02-earth-intro-done` | 对 `.earth-view canvas` 连续采样平均亮度（用 `pngjs` 解码 `canvas.screenshot()`），直到最近 3 次采样都比一开始测到的暗基线亮出至少一个阈值、且彼此波动 < 6% | `EarthView.vue` 里驱动 intro 的 `introValue` 是纯内部闭包变量，没有暴露到 DOM/`window`（也不允许改 `three-scope-map/` 源码去加调试钩子），亮度是唯一能从外部观察到的、随 intro 单调上升再趋于平台期的信号 |
| `03-cloud-handoff` | `.china-map-stage` 同时满足 `classList.contains('is-handoff')` 为真、`is-active` 为假 | 对应 `EarthChinaMap.vue` 里 `beginChinaHandoff()`（云层揭幕开始）与 `showChinaMap()`（完全落位）之间的窗口，是精确的状态标志而非猜测的毫秒偏移 |
| `04-china-settled` | `.china-map-stage.is-active` 为真，且 `document.querySelectorAll('.city-label').length` 连续 3 次采样不变 | 标签是 CSS2DObject 逐帧插入的，数量不再增长即代表标签层渲染完毕 |
| `05-province-drilldown` | `.map-drill-control span` 文本包含"省级"，且确认包含"浙江"（否则直接抛错，不静默截错省份），随后同样等 `.city-label` 数量稳定 | 沿用已验证可靠的下钻状态断言，并补上标签稳定判据覆盖地级市标签渲染 |
| `06-south-sea-inset-zoomed` | `.south-sea-inset` 的 `getBoundingClientRect()` 宽高连续两次采样不变 | 相机被钳制到最近距离、OrbitControls 阻尼平息后，插图尺寸才会真正停止变化 |

**验证**：改完后连续跑了 3 次（各输出到独立临时目录），3 次全部以退出码 0 结束；用 Read 工具检查了 3 次各自的 `02-earth-intro-done.png` 和 `05-province-drilldown.png`（共 6 张），全部是完整显现的地球（球体、中国高亮、国际飞线清晰可见）和正确的浙江省下钻画面，没有一次出现黑屏或误触邻省。3 次运行里 `02` 实际等待时长分别是 ~6.9s / ~24.9s / ~7.5s——抖动依然存在，但脚本会一直等到真正就绪，而不是提前掐点截图。

将新脚本的输出与仓库里现有基线（`01`–`06`）逐张目视比对：构图、控制条、标签、南海插图尺寸均一致，未发现系统性差异（仅有国际飞线高亮点位置、云南省悬停高亮等预期内的动画相位差异，这在原脚本自身多次运行之间也同样存在）。因此**未重截基线**，`docs/superpowers/baselines/2026-08-02-vue-before/` 下的 6 张 PNG 保持原样。

## 质量闸门（截图前确认）

```
python3 three-scope-map/scripts/verify_template_integrity.py
# -> Bundled template integrity check passed: 31 files

python3 three-scope-map/scripts/check_three_map_project.py three-scope-map/assets/templates/smart-mine-vue --strict
# -> PASS, BLOCKERS: None
```

两条均为绿色后才开始截图。
