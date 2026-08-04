# Exact Earth View Entrance

Use this reference only when the user asks for the bundled Earth entrance, its transition, or synchronized theming. The source file is authoritative; this document is not a recipe for recreating it.

## Copy Contract

Resolve the target framework first (see `SKILL.md` Core Workflow rule 1). Copy these files together without rewriting the renderer:

```text
src/components/map/core/earthViewCore.ts
src/components/map/core/earthViewCore.css
src/components/map/core/earthChinaMapCore.ts
src/components/map/core/earthChinaMapCore.css
src/components/map/core/scopeMapCore.ts
src/components/map/core/scopeMapCore.css
src/components/map/EarthView.vue        # or EarthView.tsx for a React target
src/components/map/EarthChinaMap.vue    # or EarthChinaMap.tsx
src/components/map/ChinaMap.vue         # or ChinaMap.tsx
src/components/map/mapTheme.ts
src/components/map/mapDataAdapter.ts
src/components/map/mapTerrainMaterial.ts
src/assets/maps/china.json
src/assets/maps/world.json
src/assets/maps/world.earth-render.json
src/assets/textures/map/china/china-height-legacy.png
src/assets/textures/map/china/china-normal-legacy.png
src/assets/textures/map/world/earth-day.jpg
src/assets/textures/map/world/earth-lights.png
src/assets/textures/map/world/earth-normal.jpg
src/assets/textures/map/world/earth-specular.jpg
src/types/geo.ts
```

Do not shorten `earthViewCore.ts`, reconstruct it from these notes, rename it to an `EarthViewLegacy` variant, add an `earthVersion` query switch, or keep a competing globe implementation.

## Preserved Visual Baseline

The approved Earth source includes all of the following as one composed effect:

- Real Earth day, normal, specular, and city-light textures under a dark green grade.
- Fine spherical latitude/longitude grid with intersection dots and scan-linked highlights.
- World land geometry and outlines projected from real GeoJSON.
- Separate China surface generated from real GeoJSON, textured with China height and normal maps.
- GeoJSON `*_JD` generated separately as spherical dashed lines; it never enters China fill, terrain tessellation, or extrusion geometry.
- Tessellated China terrain, inner/outer boundary glow, visible extrusion walls, bottom edge, and explicit Taiwan main-island wall handling.
- Restrained bloom, directional upper-left lighting, layered atmospheric Fresnel rims, and neutral black star field.
- Persistent international route tracks, synchronized fly-line heads, stable node ripples, idle drift, breathing, surface scan, and boundary flow.
- Staged first load: Earth establishes first, China thickness/surface resolves next, then regular motion starts without a dead pause.
- Click handoff: camera dives toward China through layered atmosphere/clouds while the already-preloaded 3D China map reveals underneath.

Never replace these with screenshots, SVG/canvas globes, flat fills, generic gradients, procedural stand-in Earth textures, or a shorter ShaderMaterial demo.

## Component Responsibilities

The authoritative implementation lives in `map-core/core/`; the Vue/React files below are thin framework shells that call these core factory functions and forward their callbacks as emits/props (see `references/three-scope-map-template.md` for the shell shape).

- `earthViewCore.ts` (`createEarthView`, mounted by `EarthView.vue` / `EarthView.tsx`): own the globe renderer, textures, shaders, spherical China geometry, intro, idle effects, hover/click raycasting, and cloud dive. Warm the hidden canvas, emit `scene-ready` (`onSceneReady`), wait for `start-intro` (`setStartIntro`), then emit `intro-ready`, `handoff-start`, and `enter-china` at the existing visible-timeline timings.
- `earthChinaMapCore.ts` (`createEarthChinaMap`, mounted by `EarthChinaMap.vue` / `EarthChinaMap.tsx`): own the `earth | china` state, lazy-load `scopeMapCore.ts` via a dynamic `import('./scopeMapCore')` once `scene-ready` fires, prepare the inactive destination, release `start-intro` only after its completed static frame exists, reveal that frame during handoff, keep the destination animation inactive until `enter-china`, and unexpose Earth only when the transition completes.
- `scopeMapCore.ts` (`createScopeMap`, mounted by `ChinaMap.vue` / `ChinaMap.tsx`): the actual China/province/city/district renderer. The framework shell is a thin adapter; it does not duplicate the renderer or own any Three.js state itself.
- `mapTheme.ts`: remain the only color entry. `MAP_THEME_PRIMARY` feeds both Earth and the 3D map.
- `scopeMapCore.ts` and `earthViewCore.ts` each call `renderer?.forceContextLoss()` inside their own `destroy()`. `earthChinaMapCore.ts`'s `destroy()` holds no `renderer` of its own; it delegates to `earth.destroy()` and `chinaMap?.destroy()`, which is where those calls actually happen. Net effect: a shell can be mounted and unmounted repeatedly (React 18 StrictMode's double-invoke included) without leaking WebGL contexts.

## Theme Contract

Apply user color requests with:

```bash
python3 <skill>/scripts/apply_map_theme.py '#2AF7FF' <target-project> --no-backup
```

Do not hand-replace individual hex/RGB values in Earth shaders. The shared theme keeps the approved relative luminance, saturation, dark-surface contrast, scan hierarchy, fly-line hierarchy, wall depth, and label readability. Keep the space background neutral black.

## Integration Contract

- For a new Vue project, copy the complete `assets/templates/smart-mine-vue/` directory. Its `App.vue` mounts `EarthChinaMap.vue`, so Earth is the first visible view. For a new React project, copy `assets/templates/smart-mine-react/` instead; its `App.tsx` mounts `EarthChinaMap.tsx` the same way.
- For an existing project, mount `<EarthChinaMap />` (Vue) or `<EarthChinaMap />` (React) in a positioned container with non-zero width and height.
- Vue target: install `vue`, `three`, `gsap`, and `@types/three`. React target: install `react`, `react-dom`, `three`, `gsap`, and `@types/three`. Either way, do not introduce Cesium or Globe.gl.
- Keep the bundled relative asset paths unless the target build system requires a mechanical alias adjustment.
- Keep `world.json` as source data, use `world.earth-render.json` for Earth rendering, and keep `earthChinaMapCore.ts`'s dynamic `import('./scopeMapCore')` (triggered on `scene-ready`) so the destination renderer chunk is not parsed before Earth first paint.
- Do not copy dashboard panels, charts, business metrics, Figma frames, absolute paths, local URLs, or temporary chat assets.

## Required Validation

1. Run `python3 <skill>/scripts/verify_template_integrity.py` before copying.
2. Run `python3 <skill>/scripts/check_three_map_project.py <target-project> --strict` after integration; the script auto-detects Vue vs React from the target `package.json`.
3. Run the target build.
4. Open the Vite URL and capture the initial Earth, steady Earth, click handoff, and destination China map.
5. Repeat with one non-green `MAP_THEME_PRIMARY`; confirm Earth, 3D map, labels, fly lines, walls, scan, atmosphere, and ripples change together while the background stays neutral.
6. Inspect Earth `*_JD`: confirm it is a spherical dashed line layer and does not appear in surface fill or wall geometry.
7. Confirm the visible Earth intro begins only after destination preload is complete, then during handoff confirm the destination is a fully rendered static frame and that its continuous animation begins only after Earth fade/postprocessing finishes.
8. Confirm world outlines are batched into `THREE.LineSegments`; separate `LineLoop` objects for every world ring are a performance blocker.
9. Treat missing texture relief, missing Taiwan wall, missing grid dots, missing route tracks, abrupt handoff, blank canvas, a missing/static `*_JD` line, or any substitute renderer as a blocker.
