# Visual QA For Figma Dashboard Restoration

Use this checklist before final delivery and after any user-reported visual fix. The goal is to catch regressions early, especially unintended changes to the 3D map, Figma assets, chart legends, or animation bounds.

## Required Screenshots

Capture these when possible:

1. `1920x1080` full dashboard initial state.
2. Current user viewport, especially if the user is reviewing in the in-app browser.
3. Center 3D map initial state.
4. One map hover state, showing lifted block, label, side thickness, and no geometry gap.
5. One chart hover state for every changed chart type.
6. One animation/scrolling state when changing carousels, table scrolls, fly lines, ripples, or chase lights.

## Layout Checks

- Body background is dark, never default white.
- No page scrollbar appears.
- Whole stage remains 16:9 and uniformly scaled.
- Map host fills its parent container instead of using fixed `1920px x 1080px`; the outer shell owns any 16:9 scaling.
- Title HUD, panel frames, and bottom navigation still align with Figma assets.
- Frosted glass and translucent fills stay below `panel-frame.png`.
- No panel content overlaps exported frame corners or header bars.

## 3D Map Checks

- Map uses real current-scope GeoJSON.
- Texture scope matches boundary scope: world texture for world maps, China texture for China maps, province/city/district texture for lower drilldown maps when available.
- Top surface remains dark; side thickness keeps the themed gradient.
- Top outer outline aligns with thickness start; bottom outline aligns with thickness end.
- Internal boundaries are thinner than the outer contour.
- Hover lift moves top and side geometry together with no visible gap.
- Only intended scatter/ripple points are visible.
- Chase light is one segment on the outer contour only.
- Labels remain inside their exported/background frames.
- Drilldown click swaps to the correct next scope and back navigation restores the exact previous scope.
- After drilldown, no parent-scope labels, scatter points, fly lines, ripples, or chase-light paths remain.

## Chart Checks

- ECharts legend colors match visible series.
- Axis labels and ticks stay inside the panel.
- Bar, bubble, line, funnel, gauge/ring, and table animations do not create blank gaps or duplicated labels.
- If animation is removed, remove custom overlay layers too; do not leave invisible ECharts bars under SVG bars.
- Table scroll content is clipped below the header and never overlaps column titles.

## Regression Guardrail

When the user comments on one area:

1. Identify the exact component and selector if possible.
2. Read only the files needed for that component plus direct shared helpers.
3. Patch only that component unless the defect is caused by shared code.
4. Run build.
5. Re-check the changed area and one nearby unaffected area.
6. Tell the user if a requested change required touching map textures, labels, Figma assets, or shared chart code.

## Browser/Build Checks

- Run the project build command.
- Confirm the dev server URL and port match the user's browser.
- If the port belongs to another project, start this project on a different explicit port and report it.
- Prefer browser screenshots for visual claims; use command-line checks only for build/server status.
