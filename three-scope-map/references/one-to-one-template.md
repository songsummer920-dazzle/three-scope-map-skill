# Songsummer 3D Map Template

Use this reference when the user asks for the 3D map to match the validated map as closely as possible, or says "一比一", "same as the reference", "do not freestyle", "use the existing map style", or "copy the current 3D map effect".

## Required Behavior

Do not rebuild the map from scratch when this template is available. Start by copying the bundled template files, then adapt paths and project structure.

This template is the default baseline for every generated 3D map, not only Zhejiang. For any requested region, keep the same renderer, material system, side-wall gradient, theme-generated original SVG label skin, ripple/fly-line behavior, chase light, terrain texture stack, camera controls, hover lift, and drilldown architecture. Change the region data and generated configuration, not the visual language.

Template location:

```txt
assets/templates/smart-mine-vue/src/
```

It includes:

```txt
components/map/ZhejiangThreeMap.vue
components/map/EarthView.vue
components/map/EarthChinaMap.vue
components/map/ChinaMap.vue
components/map/mapTheme.ts
components/map/mapDataAdapter.ts
components/map/mapTerrainMaterial.ts
types/geo.ts
assets/maps/china.json
assets/maps/world.json
assets/maps/zhejiang.json
assets/textures/map/china/china-height-legacy.png
assets/textures/map/china/china-normal-legacy.png
assets/textures/map/terrain-diffuse.jpg
assets/textures/map/terrain-height.jpg
assets/textures/map/terrain-normal.jpg
assets/textures/map/terrain-roughness.jpg
assets/textures/map/world/earth-day.jpg
assets/textures/map/world/earth-lights.png
assets/textures/map/world/earth-normal.jpg
assets/textures/map/world/earth-specular.jpg
components/map/mapTerrainMaterial.ts  # original four-layer regional terrain texture stack
App.vue                               # mounts EarthChinaMap by default
main.ts
style.css
```

## Integration Steps

1. Inspect the target project stack and aliases.
2. If it is Vue 3 + Vite + TypeScript, copy the template `src/` files into matching locations.
3. Install missing dependencies:

```bash
npm install three
npm install gsap
npm install -D @types/three
```

4. Mount `ZhejiangThreeMap.vue` for a direct regional map, or mount `EarthChinaMap.vue` when Earth View should be the entry. The runnable template already mounts `EarthChinaMap.vue`. Both fill the parent container; do not hardcode the map host to `1920px x 1080px`.
5. Preserve relative asset paths unless the target project has a different alias convention.
6. Keep the camera, materials, terrain config, label CSS, chase light, fly lines, and hover logic intact for the first pass.
7. Add drilldown data for every non-terminal visible scope before delivery:
   - `world -> country`
   - `country -> province`
   - `province -> city`
   - `city -> district/county`
   - `district` is terminal unless lower-level data is explicitly supplied.
   If public data cannot provide the required next level, report the blocker instead of shipping a fake or non-drillable level.
8. Run the project and visually verify the map before making optional changes.
9. Run the project readiness check before delivery:

```bash
python3 <skill>/scripts/check_three_map_project.py <target-project> --strict
```
10. For any color request, change only the shared primary through `scripts/apply_map_theme.py`. Never separately recolor Earth and the destination map.

## What Can Be Changed After First Render

After the template renders successfully, it is safe to adapt:

- container size and z-index
- initial scope
- GeoJSON files
- city labels and fly-line source/targets
- theme color through the theme workflow
- only `MAP_THEME_PRIMARY` for theme changes; all material/CSS/shader roles remain derived
- CSS label pointer color and glow should follow the same derived theme color
- camera presets through the camera preset controller
- GeoJSON resolver registry for additional countries/provinces/cities

## What Not To Change In A One-To-One Pass

Do not rewrite these unless the user asks for a variant:

- side-wall shader gradient
- terrain material helper
- chase-light path rules
- Earth renderer, camera/orientation, texture stack, China tessellation/extrusion, Taiwan wall, scan/grid, atmospheric rim, international routes, intro timing, and cloud handoff
- hover lift and side-wall lift coupling
- label image sizing rules
- ripple/scatter cleanup logic
- chunked map rebuild pattern
- drilldown stack and transition pattern
- region-bound terrain material binding; do not reintroduce a full `mapWidth x mapHeight` transparent `PlaneGeometry` texture overlay for non-world maps
- line-segment chase light implementation; do not reintroduce a transparent filled ribbon mesh for the outer-contour chase light

## Unacceptable One-To-One Results

Reject and keep fixing these outcomes:

- screenshot, exported image, SVG fallback, or CSS-only imitation instead of real Three.js
- flat 2D GeoJSON fill without extrusion thickness
- bright solid-green top surface instead of the dark translucent terrain surface
- missing side-wall gradient, terrain texture, outer contour, internal boundaries, labels, fly lines, ripple, hover lift, or chase light
- `.map-host` fixed to `1920px x 1080px` inside a responsive container
- build success without browser visual verification
- canvas blank with no diagnosis

If WebGL creation fails, do not replace the map with SVG. Check browser WebGL support, GPU/driver blocking, `new THREE.WebGLRenderer` errors, container size, Vite asset paths, GeoJSON parsing, texture imports, and console runtime errors. Only report failure when WebGL is genuinely unavailable on the user's browser/device.

## Validation Checklist

- The map is real Three.js geometry, not a screenshot.
- `.map-host` fills the parent container and renderer size follows `ResizeObserver`; 16:9 scaling belongs to the outer dashboard shell, not the map component itself.
- Terrain texture is applied through the real region `ShapeGeometry` material. Non-world maps must not add a full-map transparent `PlaneGeometry(mapWidth, mapHeight)` texture layer because it can flash triangular artifacts during drilldown and transparent-depth sorting.
- Outer-contour chase light is built from short `THREE.Line` segments, not a filled ribbon mesh or indexed triangle strip.
- Run the project through the Vite dev server and visually verify the map. Do not validate a Vite app by opening `index.html` with `file://`.
- The delivered map must be the Three.js canvas version. Do not accept an SVG/image fallback as a successful one-to-one delivery; if the canvas is blank, debug until the Three.js renderer is visible.
- `scripts/check_three_map_project.py <target-project> --strict` reports no blockers, or any blocker is explicitly tied to a true environment limitation.
- `scripts/verify_template_integrity.py` passes before copying the bundled template.
- Top surface is dark, not bright green.
- Side thickness uses the validated green gradient.
- Top and bottom outer contours align with the side thickness start/end.
- Internal city boundaries are thin and do not create side thickness.
- Hover lift has no gap between the top surface and side thickness.
- Only intended ripple/scatter points render.
- Country-scope ripple and fly lines use 北京市 as source.
- Province-scope ripple and fly lines use the province capital as source; Zhejiang defaults to 杭州市.
- City-scope ripple and fly lines use the same stable random district/county source.
- All non-district scopes can click into the next level.
- District/county scope is terminal by default and should not recurse into fake data.
- Labels use the theme-generated original SVG HUD geometry in `ZhejiangThreeMap.vue`; keep the pointer inside the exported `68px x 41px` frame instead of appending extra height.
- If the theme color changes, the label pointer triangle and glow should use the same derived theme color instead of staying green.
- Camera controls support unified and per-scope saved views.
