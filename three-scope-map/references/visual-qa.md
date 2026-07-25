# Visual QA For Three Scope Map

Use this checklist before final delivery and after any user-reported visual fix. The goal is to catch regressions early, especially unintended changes to the 3D map, map assets, labels, camera behavior, or animation bounds.

## Required Screenshots

Capture these when possible:

1. Initial 3D map state in the target container.
2. Current user viewport if the map is embedded in a larger page.
3. One map hover state, showing lifted block, label, side thickness, and no geometry gap.
4. One drilldown state and one return-to-parent state.
5. One animation state for fly lines, ripples, HUD base ring, or chase light.

## Layout Checks

- Body background is dark, never default white.
- No page scrollbar appears.
- Map host fills its parent container instead of using fixed `1920px x 1080px`.
- If the map is placed inside a 16:9 dashboard, the outer shell owns the scaling.
- Map controls, labels, and HUD decoration do not overlap awkwardly.

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
- At country scope, the South China Sea SVG stays fixed in screen space while its width follows camera distance and remains within approximately `62–92px`.
- Drilldown click swaps to the correct next scope and back navigation restores the exact previous scope.
- While drilling or returning, navigation/camera buttons are temporarily disabled so repeated clicks cannot desync the drill stack and rendered scene.
- Camera controls behave as specified: `保存统一` applies one default to all scopes, `保存本层` only affects the current scope, `恢复本层` restores the current scope to the skill built-in camera even when a unified default exists, and `恢复全部` clears every saved camera view.
- After drilldown, no parent-scope labels, scatter points, fly lines, ripples, or chase-light paths remain.

## Earth Handoff Checks

- The complete staged Earth intro still plays before the globe becomes interactive.
- Earth `*_JD` appears only as spherical dashed line geometry; it is absent from China fill, terrain, thickness walls, and bottom edges.
- Destination precompile produces one fully opaque static WebGL/CSS2D frame while the destination is inactive.
- `handoff-start` reveals that static frame without starting the destination continuous RAF loop.
- `enter-china` starts the destination normal animation only after Earth fade/postprocessing is effectively complete.
- No blank frame, transparent map reset, or overlapping pair of full render loops appears during the handoff.

## Regression Guardrail

When the user comments on one area:

1. Identify the exact map layer, helper, asset, or component if possible.
2. Read only the files needed for that component plus direct shared helpers.
3. Patch only that component unless the defect is caused by shared code.
4. Run build.
5. Re-check the changed map layer and one nearby unaffected map behavior.
6. State whether the change touched map textures, labels, GeoJSON, camera presets, or shared rendering helpers.

## Browser/Build Checks

- Run `python3 <skill>/scripts/check_three_map_project.py <target-project> --strict` before final delivery and fix all blockers that are not true environment limitations.
- Run the project build command.
- Open the app through the Vite dev server URL, not `file://`.
- Visually verify rendering in the browser; build success alone is not enough.
- Verify the visible map is the Three.js canvas version. If the canvas is blank, keep debugging renderer creation, asset paths, container size, GeoJSON loading, and console errors until the Three.js map is visible.
- Do not accept screenshot, SVG, CSS, or 2D GeoJSON substitutes as a successful map render.
- If WebGL is unavailable, capture the concrete failure reason and suggested fix instead of substituting a fake map.
- Prefer browser screenshots for visual claims; use command-line checks only for build/server status.
