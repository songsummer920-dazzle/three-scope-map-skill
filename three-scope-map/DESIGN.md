---
name: Three Scope Map
description: 精致、克制、可信的多模式地图可视化系统
colors:
  primary: "#9fc53a"
  accent: "#e8ff4f"
  accent-soft: "#d4f56a"
  background: "#030907"
  surface: "#07120d"
  terrain-mid: "#203119"
  terrain-high: "#9eae68"
  text: "#f2ffd6"
typography:
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "2px"
  panel: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
components:
  mode-button:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
---

# Design System: Three Scope Map

## Overview

**视觉方向：精密地形模型**

界面像一台在暗室中使用的地理测绘仪器。真实地形或当前行政地理是主角，控件退居边缘；强调色承担层次与选中状态，低亮度环境提供稳定对比。下方绿色 token 是经典/等高线默认预设，不能覆盖 FUI 或调用方选择的主色。

视觉必须拒绝粗糙噪声、矩形截图感和过量荧光。精致来自连续曲面、清晰层级和准确交互，不来自效果堆叠。

**Key Characteristics:**

- 低亮度环境与清晰的语义颜色层次
- 平滑曲面和克制的纵向夸张
- 主要等高线清晰，次要线安静
- 控件紧凑、熟悉、状态明确

## Colors

经典默认以暗绿色地形承载大面积信息，荧光黄绿用于主要线条、选中状态和焦点。FUI 与自定义 HEX 使用各自已解析的语义色阶；统一输入和对比层次，不要求不同材质输出同一 RGB。切换主色不切换材质、波纹或渲染器。

### Primary

- **测绘绿**：经典默认来源色，通过主色脚本配置；FUI 实例可用 `primaryColor` 覆盖；保留命名皮肤作为预设，并从同一已解析主色派生 HUD、地表、玻璃、2D 与叠加层的角色色。

### Secondary

- **高程亮绿**：经典/等高线默认的主要线和激活角色；其他主题使用对应强调色。
- **柔和标高绿**：经典默认的次级强调角色；保留对应材质的高光与衰减关系。

### Neutral

- **深林背景**：经典/等高线默认环境；FUI 保留其深色中性环境。
- **暗部地形**：低海拔与远景。
- **标注白绿**：文字与关键刻度。

静止、未选中的地形以低亮度为主，强调色区分线条和交互状态。选中的玻璃区域可以整面高亮，并保留体积与边界层次。

## Typography

**Display Font:** system-ui
**Body Font:** system-ui
**Label/Mono Font:** system-ui

**Character:** 使用熟悉的系统无衬线字体，保持工程工具的清晰和低干扰。

### Hierarchy

- **Body**：14px，用于状态和说明。
- **Label**：12px，中等字重，用于刻度、图例与控制标签。

地图标签的亮度和尺寸应保持地理主体清晰。

## Elevation

系统不使用装饰性卡片阴影。地形模式的深度来自真实地形法线、方向光、环境雾与有限高程色差；玻璃模式来自真实地理网格、显示挤出厚度、反射和内部边界投影。显示厚度与 hover 抬升不得标成真实高程。

地形曲面的法线和细节应先保持连续，再叠加线条与光效。

## Components

### Buttons

- **Shape:** 轻微圆角（2px），紧凑矩形。
- **Primary:** 深色底与高对比文字，激活时使用已解析的主题强调色。
- **Hover / Focus:** 150–200ms 状态过渡，键盘焦点清晰可见。

### Cards / Containers

- **Corner Style:** 小圆角（4px）。
- **Background:** 与当前材质匹配的半透明深色，仅用于图例和状态。
- **Shadow Strategy:** 无宽大柔光阴影。
- **Internal Padding:** 12px。

### Navigation

模式切换保持标准按钮语义；当前模式清晰，未激活项保持低亮度，不添加装饰动画。

### Contour Terrain

主地形使用真实 DEM；轻度平滑必须写入处理元数据。主要等高线承担读图，次要线控制密度和不透明度。外围真实 DEM 只用于消除覆盖边缘，不得降低中心数据精度。

## Do's and Don'ts

### Do:

- **Do** 使用真实高程数据并显示来源、单位和处理方式。
- **Do** 保持中心高精度与外围连续覆盖的多分辨率结构。
- **Do** 使用平滑法线、克制色差和有限纵向夸张建立地形层次。

### Don't:

- **Don't** 使用粗糙噪声或尖刺地形伪装细节。
- **Don't** 让行政轮廓伪装成高程边界。
- **Don't** 显示矩形截图感或整齐截断的数据边缘。
- **Don't** 使用过量荧光或无意义科技效果。
