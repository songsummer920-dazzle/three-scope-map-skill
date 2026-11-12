# Visual QA For Three Scope Map

Use the checks relevant to the selected renderer and the changed behavior. Verify actual WebGL output, interaction and runtime errors before delivery.

## Required Screenshots

Capture these when possible:

1. Initial 3D map state in the target container.
2. Current user viewport if the map is embedded in a larger page.
3. One map hover state, showing lifted block, label, side thickness, and no geometry gap.
4. One drilldown state and one return-to-parent state.
5. One animation state for fly lines, ripples, HUD base ring, or chase light.
6. When 2D is selected, one country view and one drilled province/city view showing roads, labels, administrative boundaries, compass, and attribution.

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
- At China country scope, the South China Sea inset stays fixed in screen space. FUI width follows the container and remains approximately `62–92px`; the classic renderer retains its camera-distance width response.
- Drilldown click swaps to the correct next scope and back navigation restores the exact previous scope.
- While drilling or returning, navigation/camera buttons are temporarily disabled so repeated clicks cannot desync the drill stack and rendered scene.
- Camera controls behave as specified: `保存统一` applies one default to all scopes, `保存本层` only affects the current scope, `恢复本层` restores the current scope to the skill built-in camera even when a unified default exists, and `恢复全部` clears every saved camera view.
- After drilldown, no parent-scope labels, scatter points, fly lines, ripples, or chase-light paths remain.

## 2D And Hybrid Map Checks

- The basemap visibly contains roads and labels; a local administrative fill by itself is not sufficient.
- Provider data, administrative GeoJSON, and future business overlays remain separate layers.
- The provider ID, coordinate system, attribution, request handling, and semantic role hints come from configuration rather than component-specific branches.
- Vegetation, road hierarchy, rail, provider boundaries, and administrative boundaries use their intended semantic roles at low and high zoom.
- Left drag pans, right drag or Ctrl+left drag rotates/tilts, wheel zoom works, compass drag rotates, and compass click resets north.
- Compass and zoom controls remain visible at the current dashboard size and their offsets can be changed without editing component CSS.
- Drilldown and return preserve bearing and pitch; switching to 3D preserves the same administrative path.
- `window.__SUMMER_MAP_2D_DIAGNOSTICS__` reports style loaded, first idle, loaded basemap sources, positive road/label counts for vector styles, finite camera values, and no runtime errors.

## Earth Handoff Checks

- The complete staged Earth intro still plays before the globe becomes interactive.
- Earth `*_JD` appears only as spherical dashed line geometry; it is absent from China fill, terrain, thickness walls, and bottom edges.
- Destination precompile produces one fully opaque static WebGL/CSS2D frame while the destination is inactive.
- `handoff-start` reveals that static frame without starting the destination continuous RAF loop.
- `enter-china` starts the destination normal animation only after Earth fade/postprocessing is effectively complete.
- No blank frame, transparent map reset, or overlapping pair of full render loops appears during the handoff.

## Scoped Regression Checks

Follow `regression-guard.md`. Recheck the changed layer and one adjacent unaffected behavior; report any changes to textures, labels, GeoJSON, camera presets or shared rendering helpers.

## Browser/Build Checks

- Run `python3 <skill>/scripts/check_three_map_project.py <target-project> --strict` when the selected mode includes 3D and `python3 <skill>/scripts/check_vector_map_project.py <target-project> --strict` when it includes 2D.
- Run the project build command.
- Open the app through the Vite dev server URL, not `file://`.
- Visually verify rendering in the browser; build success alone is not enough.
- Verify the selected renderer is genuinely active. In administrative 3D/Earth mode this is the primary Three.js canvas; in 2D mode this is MapLibre with a loaded provider basemap and administrative overlay.
- Do not accept screenshot, SVG, CSS, or a plain administrative GeoJSON fill as a substitute for the selected renderer.
- If WebGL is unavailable, capture the concrete failure reason and suggested fix instead of substituting a fake map.
- Prefer browser screenshots for visual claims; use command-line checks only for build/server status.
