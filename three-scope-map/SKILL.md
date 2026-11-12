---
name: three-scope-map
description: Build, migrate, theme, drill down, and validate reusable Vue or native React maps using the bundled Three.js administrative 3D renderer, MapLibre 2D basemap, Earth entrance (defaulting to the 3.0 entity/photographic FUI style for new projects), a default 3D/2D/2D+3D view switch, or a MapLibre basemap with a shared-context 3D geographic overlay. Use for geographic map rendering and provider integration, not ordinary dashboard charts.
---

# Three Scope Map

## Framework Selection

Support both Vue and native React. Preserve an existing project's framework; never migrate it implicitly. For new projects pass `--framework vue` or `--framework react` to `scripts/create_map_project.py`; omitting it preserves the existing Vue default. Both `--preset fui` and `--preset classic` support both frameworks. React output uses native TSX components, React DOM and the shared renderer/data/assets, with no Vue runtime or iframe.

For React, read [references/react-integration.md](references/react-integration.md). References below name canonical `.vue` files; their native React counterparts have the same component names with `.tsx`, camelCase props and `onEvent` callbacks. The generator combines `assets/react/<preset>/` with the selected family's shared assets. Do not copy that partial React directory alone. Preserve the same style pairings, three-view selector, navigation, attribution, resource cleanup and renderer verification in either framework.

## Style Selection

Users can select a complete style with these phrases. Apply the matching Earth and 3D destination together; do not ask them to select a separate map material or learn API names.

Use these public style names consistently: **3.0 实体地球**, **3.0 全息地球**, **纹理玻璃 3D 地图** (`terrain-glass`) and **纯玻璃 3D 地图** (`smooth-glass`). Technical API values stay unchanged; recognize “写实地球” as a legacy alias for 3.0 实体地球.

**New Earth or administrative-3D project with no requested style: use 3.0 实体地球 (entity FUI Earth) with its paired 纹理玻璃 3D 地图 (`terrain-glass`). Explicit style requests override this default. Preserve an existing project's style unless a replacement is requested.**

| User request | Template and complete pairing |
| --- | --- |
| “用 2.0 风格” / “2.0 地球” | `songsummer-earth-vue`: original Earth entrance → original classic 3D map. |
| “用 3.0 实体地球” / “实体地球” / “用 3.0 写实地球” / “3.0 写实风格” / “用 3.0 风格” | `fui-earth-vue`: `FUI_SCENE_PRESETS.surface` → 3.0 实体地球 + 纹理玻璃 3D 地图 (`terrain-glass`). |
| “用 3.0 全息地球” / “全息地球” | `fui-earth-vue`: `FUI_SCENE_PRESETS.hologram` → 3.0 全息地球 (regular dots) + 纯玻璃 3D 地图 (`smooth-glass`). An explicit honeycomb globe/蜂窝纹理 request selects `FUI_SCENE_PRESETS['hologram-hex']`, with the same 纯玻璃 3D 地图 (`smooth-glass`) destination; a honeycomb scan request changes only `scanStyle`. |

- Style selection configures the project. Add runtime style/color controls only when requested; keep geographic back/drilldown and Earth-return controls available.
- Both templates' `src/App.vue` files are demonstration shells; integrate reusable components into business layouts instead of copying their optional style/color/material/effect toolbar. Earth and administrative-3D integrations **retain the `3D 地图 / 2D 地图 / 2D + 3D` selector by default**, including ordinary business integrations. Hide it only when the user explicitly asks to hide/remove switching or requests a single view such as “只要 2D”; an ordinary “做 3D 地图” request does not hide it. Preserve existing explicit choices and geographic navigation. FUI already enables `show-view-switch` in `EarthChinaMap.vue`; keep it enabled unless that explicit exception applies. Use the selected family's `ChinaMap.vue` host for a map-only integration with the selector, rather than mounting only its raw Three.js renderer.
- “实体地球” and “写实地球” select the same `surface` API value. Preserve its matched terrain data, lighting, China material/lift, fine geographic and route lights, HUD, and floating transparent sweep shell as one visual profile. Other map materials and renderer modes retain their own contracts.
- For a new FUI project without a color request, retain the demo's starting palette: photographic `amber`, hologram `glacier`. Existing primary colors and explicit color/preset requests take priority. A request such as “用 3.0 全息地球，整体紫色” sets one complete style plus its independent primary color.
- “改成蓝色” changes only the shared theme through the existing one-color workflow. Preserve the selected style, material, animation, region and navigation. Do not reopen style selection or replace the renderer for a color-only request.
- A style change preserves project data, geographic scope, navigation, quality, current 2D/3D/overlay composition and primary color unless the user requests otherwise. An existing map-only project stays map-only and receives the selected style's paired map material; do not add an Earth entrance implicitly. Follow the template-family migration guidance instead of mixing classic and FUI renderer files.
- Pairing supplies defaults, not a restriction on customization: explicit requests to change the destination material, dot/hex pattern, HUD, wave or 2D+3D composition override the paired default. Do not silently revert such customization during an unrelated edit.
- Standalone 2D requests retain their own renderer defaults.

### Natural-language effect names

- “地球网格扫光” selects `scanStyle="ribbon"`; retain “柔光扫掠” as a legacy alias. “地球蜂窝扫光” / “蜂窝扫描” selects `scanStyle="honeycomb"`. Both entity and hologram Earth support these scan choices through the existing transparent sweep shell. Preserve the current Earth presentation and its dot/hex texture. In an ongoing scan discussion, “换成蜂窝” changes only the scan, not the globe's texture or destination material. Keep `ribbon` as the default.
- “全息地球蜂窝纹理” selects `earthPresentation="hologram-hex"` and its matching smooth-glass destination; a plain hologram request stays regular dots.
- “3D地图底部蜂窝扩散” / “网格扩散” / “关闭底部扩散” selects `mapWave="hex"` / `"grid"` / `"none"` while preserving Earth presentation, map material, primary color and navigation. This ground effect belongs to standalone 3D; the geographic 2D+3D overlay intentionally has no ground/HUD plane.

## Select The Operating Mode

Choose one mode before copying files or validating the project. Apply only that mode's renderer requirements; shared navigation, data, attribution, and regression rules still apply.

- `3d`: regional Three.js map without an Earth entrance, starting in 3D with the default three-view selector. Read the relevant 3D style, scope, drilldown, or migration reference. An explicit single-view request may omit the selector.
- `earth`: authoritative Earth entrance followed by the validated 3D destination. Apply the one-sentence style pairing above first. New projects default to the photographic FUI preset and `references/fui-earth.md`. Use the original green template and `references/earth-view.md` for an explicit 2.0/classic request or an existing classic project that is not being restyled.
- `hybrid`: user-controlled switching with one navigation path. Earth and administrative-3D integrations retain `3d`, `2d`, and geographic `overlay` by default. Read the references for every included renderer. Explicit single-view requests take precedence.
- `overlay`: real 2D basemap and geographic 3D blocks in one MapLibre camera/WebGL context. Read `references/map-3d-overlay.md`; do not stack independently controlled canvases.
- `2d`: standalone recolorable MapLibre basemap with administrative drilldown. Read `references/map-2d-switching.md`; do not require Three.js effects, Earth assets, terrain textures, or a 3D fallback.

If the request does not say which renderer to use, preserve the renderer already present in the target project. Do not interpret a conventional map request as a 3D request merely because this skill also supports Three.js.

## FUI Earth Preset

Use `assets/templates/fui-earth-vue/` for the FUI globe. Its `FuiEarth.vue` wraps the preserved renderer with responsive orbital rings and crosshairs. The FUI globe composition excludes small external labels, satellite tags, and continent cards. Read [references/fui-earth.md](references/fui-earth.md) before copying. Preserve the original `songsummer-earth-vue` appearance; choose one complete preset per target project rather than mixing Earth files from both.

FUI includes runtime `original`, `amber` (琥珀黑金), `glacier` (青蓝冰川), and `alert` (红色警戒) skins on the same renderer. Use the complete scene recipes above for new projects; the low-level component's omitted-prop defaults stay backward compatible. Set `<FuiEarth skin="amber" />` or use the `alert` prop for an override that restores the previous normal skin when cleared. Read `references/fui-earth.md` for the palette and API. The runtime `original` silver FUI skin alone retains its cool blue-gray surface and silver China relief. The 3.0 entity skins instead share the photographic geometry, material and lighting response, continuously derived from the resolved primary; use that shared optical model rather than separate physical tables per skin. Holograms retain their own glass and emitter response. An explicit primary override follows the version-3 semantic color contract without changing appearance or destination material. Keep relevant renderer, data and attribution rules.


For a pure emissive globe without a photographic substrate, use `<FuiEarth skin="glacier" earth-presentation="hologram" map-style="smooth-glass" map-wave="hex" />` for regular fine dots or `earth-presentation="hologram-hex"` for regular honeycomb cells. Both patterns follow the spherical geography, derive visible land from real geographic polygons, leave the oceans empty, and reuse the existing Earth lighting, renderer, controls and country-map handoff. Use the complete `FUI_SCENE_PRESETS` recipes in `fuiMapPresentation.ts` for new integrations; a globe-only presentation prop does not choose a destination material. Read the hologram section in `references/fui-earth.md`; keep legacy omitted-prop defaults and the original green preset intact.

## Version 3 Configuration

Read `references/v3-api.md` for the capability matrix and public API. Preserve existing defaults. Theme color, Earth appearance, map material, bottom wave and renderer composition are separate choices: changing the primary color must not change the material or navigation. Named FUI skins remain presets; `primary-color="#a75fff"` overrides hue per instance. The shared theme script supports both template families. For a pure 2D provider, semantic vector layers follow the theme; raster imagery and explicit source-style mode retain their provider-specific limitations.

Use the complete selected template family. Classic, FUI and overlay have different geometry/light contracts; their common invariants are real geography, attribution, theme semantics, navigation, resource ownership and background-safe verification. References scoped to the classic preset do not override FUI timing or materials. Default `quality="high"` preserves existing output; `balanced`, `low` and `auto` expose explicit performance budgets.

## Core Workflow

1. When the selected mode includes 3D, use the bundled validated style chosen by the one-sentence selection above; preserve existing style when no replacement was requested. For a new runnable project, use `python3 <skill>/scripts/create_map_project.py <target-project> --preset fui` (default) or `--preset classic`; it refuses non-empty destinations and copies the complete template with license notices without running npm. For an existing project, integrate the selected family's components and required assets before editing. Do not independently rebuild the renderer, globe, color system, label style, side-wall effect, chase light, ripple, fly line, terrain material, camera behavior, or transition when the template can be copied and adapted.
2. Identify map scope first: `world`, `country`, `province`, `city`, or `district`. Do not treat world/country/province/city data as the same geometry scaled up or down.
3. Resolve and validate GeoJSON before styling. Use real geographic data with the correct subdivision level.
4. Every non-terminal scope must support drilldown by default: `world -> country`, `country -> province`, `province -> city`, and `city -> district/county`. `district` is terminal unless the user supplies lower-level data.
5. For drilldown, keep a stack of `{ scope, regionName, code, geoJsonPath, cameraPreset }`, then swap GeoJSON, labels, scatter points, fly lines, hover targets, outer contour, chase-light paths, texture scope, and camera together on click.
6. Keep the visual style parameterized: theme colors, extrusion depth, side gradient, top opacity, line widths, hover lift, terrain material config, label scale, ripple settings, fly-line settings, and chase-light settings.
7. Validate texture scope. Do not stretch a province texture across China or a China texture across one province without explicit approval.
8. Preserve the selected material baseline: classic/terrain faces remain dark and readable; smooth glass retains its colored volume and polished cover. Derive outline, side gradient, glow, labels and HUD colors from the same theme without changing material families.
9. When fixing a specific map issue, do not touch unrelated charts, panel assets, or business data.
10. Source attribution is mandatory in generated or adapted map code and skill scripts: preserve `作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天`, existing copyright, license/SPDX and origin notices in the corresponding source. Do not delete, conceal, replace or move them solely into a README or other documentation. Keep these notices in source comments or source metadata; UI attribution remains optional.
11. For publishable drilldown maps, split data loading from rendering. Use a map data adapter for cache/prefetch/network fallback and an offline preprocessing script for large GeoJSON, while keeping the existing renderer preset unchanged.
12. Preserve `SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1`, the author attribution and original repository URL for this 3.0 distribution’s author-owned code. Both complete templates include `LICENSE`, `NOTICE`, `LICENSES/` and `THIRD_PARTY_NOTICES.md`; preserve these in generated projects, integrations and derivative Skill distributions. Follow LICENSE for ordinary business projects and client delivery. Reusable Earth/map capability in a paid platform, SaaS, API, Skill, plugin/SDK/component/template library or resource offering requires prior written author permission, including free tiers within a paid offering, hosted use without source delivery, bundled fees and arranged third-party fee collection. A custom-development contract does not authorize a restricted platform; ordinary business SaaS remains permitted under LICENSE's conditions. Rewriting or combining code does not alone exempt retained protected content. Historical GPL copies and third-party materials keep their own rights; do not rewrite their notices or describe this restricted 3.0 grant as GPL/OSI open source. The author-owned grant does not include commercial rights to third-party maps, basemap services or textures. Users/deployers must obtain permissions required for their own use, deployment and redistribution. Source records and publicly accessible downloads do not establish permission; keep bundle redistribution clearance separate from user-specific commercial authorization.
13. Do not ship a blank or substitute renderer. In 3D or Earth mode, the selected Vue or React template must render the real Three.js administrative map canvas. In 2D mode, MapLibre must render the configured basemap plus the local administrative overlay.
14. Before delivery, run `scripts/check_three_map_project.py <target-project> --strict` for modes containing 3D, `scripts/check_vector_map_project.py <target-project> --strict` for modes containing 2D. Treat blockers as work items to fix before claiming success.
15. When the user requests an Earth View entrance, choose the requested preset first, then copy its bundled `EarthView.vue`, `EarthChinaMap.vue`, `ChinaMap.vue`, `mapTheme.ts`, maps, and Earth/China texture assets as one unit. Do not reconstruct Earth View from prose or keep an alternate/legacy Earth implementation. Keep the existing country-scope component as the destination.
16. For a new default Earth or administrative-3D project, copy the complete `assets/templates/fui-earth-vue/` family and apply `FUI_SCENE_PRESETS.surface`; a map-only host starts at the paired map. For explicit 2.0/classic delivery, use the complete runnable `assets/templates/songsummer-earth-vue/` family instead. Hybrid composition follows the requested renderers and selected appearance, rather than implicitly selecting the classic family. For standalone 2D integration, copy `VectorMap.vue`, `vectorMap*.ts`, `mapNavigation.ts`, `mapDataAdapter.ts`, `maplibreWorker.ts`, the administrative data/types, and the relevant host styles; do not require Earth or terrain assets.
17. For a one-sentence color request, use the selected template’s theme entry through `scripts/apply_map_theme.py <hex> <target-project> --no-backup`. Classic Earth/3D/2D derive from `MAP_THEME_PRIMARY`; FUI adds the generated default override and accepts per-instance `primaryColor`. Its HUD, glass and 2D palette consume the resolved theme ID. Achromatic black/white/gray must remain achromatic, near-gray input must stay muted, and chromatic input must preserve its hue. Do not perform broad search-and-replace on shader, CSS, or material colors.
18. Preserve the complete Earth intro timeline when optimizing the Earth-to-map handoff. For FUI, follow `references/fui-earth.md`: give Earth first-frame priority, mount the hidden destination after `first-visible`, hold its GPU warm-up until `intro-complete`, and start the complete Earth intro as soon as its own first frame is prepared; do not make `chinaReady` gate Earth visibility. The inactive destination may perform sliced construction and one-shot GPU preparation, never a second continuous render loop. The following serial gate applies only to the original green preset. On a cold start, warm the Earth scene while its canvas is hidden, emit `scene-ready`, build and render one complete inactive destination frame, and release the Earth `start-intro` gate only after `chinaReady`. Keep the neutral starfield/backdrop visible while warming so the page never appears blank. For that original green preset, once Earth becomes visible, no destination geometry, renderer creation, texture upload or shader compilation may begin until the intro finishes.
19. Treat the Earth and destination map as two coordinated render phases. Never run both full continuous render loops during preload or handoff; one-shot compile/upload/static renders are allowed while Earth owns the active loop.
20. Batch same-material geographic outlines into `THREE.LineSegments`. Do not create thousands of separate `LineLoop` draw calls for world coastlines or administrative rings; this can stall the visible China-rise phase even when destination preloading is correct.
21. Keep raw high-resolution GeoJSON as source data, but do not import a multi-megabyte raw world file directly into the Earth first-paint bundle. Classic Earth uses the bundled `world.earth-render.json` render cache; FUI lazily loads the verified binary geographic caches derived from that same source. Keep raw/render GeoJSON for regeneration, not in the FUI first-paint JS. `ChinaMap.vue` remains an async component. Mount it after `scene-ready` for the original green preset; FUI mounts after `first-visible` and releases destination GPU warm-up at `intro-complete`; destination readiness never gates the Earth intro.
22. Keep the default `3D 地图 / 2D 地图 / 2D + 3D` selector in Earth and administrative-3D integrations; hide it only on an explicit user request. Renderer selection remains user-controlled and never changes automatically at a drilldown level. Share only the administrative navigation path; each renderer owns its camera or viewport. Explicit standalone 2D tasks do not require unrelated renderers or a selector. The 2D and overlay views require a replaceable style URL, raster, MVT, or PMTiles provider and a complete basemap.

## Installation and Network Boundary

Install or upgrade with `python3 <skill>/scripts/install_skill.py`. It defaults to `~/.codex/skills/three-scope-map`, fully backs up an existing Skill outside the skills directory under `~/.codex/skill-backups/`, then replaces the directory. Do not merge-upgrade with `cp -R` or automatically restore old customized files. The backup retains those files for comparison and intentional migration. Custom locations use `--source`, `--target` and `--backup-dir`.

Both runnable templates require Node.js `^20.19.0` or `>=22.12.0`. Vue templates include lockfiles and use `npm ci`; generated React projects first use `npm install`, retain the resulting React lockfile, then use `npm ci` for subsequent clean installs. The default 2D/overlay basemap uses online OpenFreeMap styles, tiles, glyphs and sprites. The administrative adapter bundles China and Zhejiang; other administrative drilldown levels load on demand from `geo.datav.aliyun.com`. For offline/internal-network delivery, configure the basemap provider and its supporting resources and supply all required administrative data. Do not describe the default project as fully offline. See [README.md](README.md) for portable installation and project-creation instructions.

## 3D And Earth Non-Negotiable Rules

- For the classic regional 3D preset, start from `assets/templates/songsummer-earth-vue/src/`; for FUI use `assets/templates/fui-earth-vue/src/`. Adapt data, scope and theme within that complete family. Do not generate an unrelated Three.js map from memory.
- In the classic default palette, preserve the validated dark translucent top surface, `#E8FF4F` side-wall gradient family, `#D4F56A` outer contour accents, theme-generated original SVG HUD label geometry, terrain texture stack, rotating base ring, outer-contour chase light, hover lift coupling, fly lines, and drilldown transition behavior.
- Terrain textures must bind to the real region `ShapeGeometry` surfaces. Do not add a full `mapWidth x mapHeight` transparent `PlaneGeometry` texture overlay for non-world maps; it can expose white/gray triangle artifacts during drilldown and transparent-depth sorting.
- The outer-contour chase light must reuse the bundled narrow segmented-ribbon implementation: one smoothed outer silhouette, subdivided per-edge quads, the validated fixed ribbon width and segment length, one additive `ShaderMaterial`, disabled depth test/write, and a per-vertex alpha tail. Do not replace it with a generic wide ribbon, an unsanitized continuous triangle strip, multiple contour bands, or a filled glow surface; those variants can self-intersect or flash large white triangles. If the bundled implementation genuinely cannot be reused in another renderer, fall back to short animated `THREE.Line` segments instead of inventing a new ribbon.
- Province-level ripple and fly lines start from the province capital, such as 浙江省 -> 杭州市. Country-level China starts from 北京市. City-level source defaults to a stable random district/county unless the user specifies another source.
- Country-level China maps must preserve the GeoJSON `*_JD` South China Sea line feature as a fixed screen-space inset with a thin solid outer frame and the original segmented internal lines in the lower-right of the map stage. Keep it outside the main projection bounds so the mainland scale does not shrink; In FUI views, orbiting or zooming the 3D camera must not move, rotate, tilt or resize it; its SVG width responds only to container dimensions and stays clamped to approximately `62–92px`. The original green preset retains its existing camera-distance width response. In textured FUI views, derive the fixed right-edge anchor from the built-in default HUD main-ring envelope, independently of the live or saved camera. Hide it below country scope.
- If the requested target data is missing, resolve/download/preprocess the required GeoJSON and texture scope first. Do not silently replace the requested region with Zhejiang, China, or an abstract placeholder.
- In `3d` or `earth` mode, unacceptable results include an image screenshot, flat SVG substitute, plain 2D GeoJSON substitute, missing extrusion depth or side-wall gradient, missing required effects, or a build-only report without browser visual verification. This rule does not prohibit the intentional MapLibre renderer in `2d` or `hybrid` mode.
- If WebGL fails, do not silently substitute SVG or canvas art. Diagnose and report the concrete cause: browser WebGL support, GPU/driver block, renderer creation error, container size `0x0`, missing assets, GeoJSON parse failure, import path error, or console runtime error. Keep fixing the project when the environment supports WebGL; only stop when WebGL is genuinely unavailable on the device/browser.
- Earth View is an entrance mode, not a replacement `world` scope. It must use `SphereGeometry`, `ShaderMaterial`, a separate spherical China mesh, atmospheric glow, scan/grid motion, hover/click raycasting, and the selected preset’s validated GSAP camera transition into the existing China map. FUI uses its shared 1.05-second flight and .78-second native map entrance constants; the original green preset retains its existing timing.
- The authoritative Earth implementation is `EarthView.vue` inside the selected complete preset (`songsummer-earth-vue` for classic, `fui-earth-vue` for FUI). Preserve its texture imports, exact camera/orientation, postprocessing, China tessellation/extrusion, Taiwan wall handling, grid intersections, scan band, atmospheric rim, synchronized international fly lines, persistent node ripples, idle drift, intro sequence, and cloud dive handoff. Do not replace any of these with a shorter approximation.
- On Earth, exclude GeoJSON `*_JD` from China surface tessellation, fill, extrusion walls, bottom edges, and terrain relief. Generate it separately as spherical dashed line geometry that follows the globe and participates in the existing China intro/fade timing.
- Do not add `EarthViewLegacy.vue`, URL query switches such as `earthVersion`, screenshots, generated stand-in textures, or a second Earth renderer. Use the selected template's Earth implementation as the visual baseline.
- Keep the space background neutral black with subtle stars. Theme changes affect Earth/map lighting and effects, not the background hue.
- Preserve the natural satellite/highland/forest texture only for the validated default green. For every non-default theme, sample Earth and China day textures as luminance, derive all China regional terrain tones from the shared theme, and never leave fixed green RGB multipliers in the visible surface.

## Hybrid And 2D Non-Negotiable Rules

- Keep 2D basemap data, administrative GeoJSON, and business overlays independent. Treat MapLibre as the renderer, not as the licensed data source, and keep WGS84 as the internal source-of-truth coordinate system.
- Use `vectorMapProvider.ts` as the provider boundary. Provider URL rewriting, headers/query credentials, glyphs, attribution, semantic layer hints, and WGS84/GCJ02/BD09 projection must not leak into the map component or mutate shared GeoJSON.
- Use `vectorMapTheme.ts` to classify provider layers into semantic roles before applying palette values. Do not accumulate provider-specific string checks inside `VectorMap.vue`.
- Keep the MapLibre control offsets configurable through runtime configuration and CSS variables; do not treat one dashboard's fixed panel widths as a universal layout.
- Bundle the MapLibre 6 worker together with its shared module, pre-resolve remote style TileJSON when embedded browsers stall third-party tile requests, and visually verify actual roads and labels before delivery.
- Publish `window.__SUMMER_MAP_2D_DIAGNOSTICS__` and verify first idle, source loading, classified road/label layers, camera state, navigation state, and runtime errors. A static source-code check is not a substitute for this browser snapshot.

## Code Attribution

Use this attribution in generated code comments and script metadata:

```text
作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
```

Rules:

- Preserve `SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1` near the top of this 3.0 distribution’s author-owned reusable map source files; third-party source retains its own identifier.
- Add it near the top of generated map components, helper files, and map-related scripts.
- Keep it non-visual by default.
- Do not add DOM elements, canvas text, sprites, labels, CSS pseudo-elements, or HUD overlays for this attribution unless explicitly requested.
- Preserve original source attribution, copyright, license/SPDX and origin notices when refactoring, splitting, combining, relocating or rewriting code retaining the project’s protected content. If the original location cannot remain, carry equivalent complete notices into the corresponding source file headers. README or other documentation is supplementary, never a substitute for code attribution. Modifier credits may be added without replacing the original author.
- Preserve repository-level `LICENSE`, `NOTICE`, `LICENSES/`, `THIRD_PARTY_NOTICES.md`, and `CITATION.cff` when packaging or publishing derivative skills. The no-platform-resale condition belongs to this distribution’s new author-owned grant, never an added condition on a historical GPL copy.

## References

Read only what the task needs:

- `references/react-integration.md`: Framework selection, native React component APIs, shared source maintenance, StrictMode lifecycle and verification.

- `references/three-map-style.md`: Core 3D map style rules: geometry, material, labels, hover, chase light, fly lines, and artifact debugging.
- `references/map-scope-switching.md`: Province/country scope switching, China national maps, texture scope, and visual scaling.
- `references/map-drilldown.md`: Hierarchical drilldown workflow from world -> country -> province -> city -> district/county, including data commands and Vue runtime API.
- `references/map-migration-playbook.md`: Step-by-step playbook for province-to-province, province-to-China, China-to-province, theme-only, texture-only, and combined migrations.
- `references/performance-pipeline.md`: Data adapter, offline preprocessing, caching, prefetching, and drilldown performance rules that preserve the visual style.
- `references/one-to-one-template.md`: Mandatory template-first workflow for one-to-one validated map replication.
- `references/smart-mine-validated-map.md`: Classic 3D map preset: geometry, material, interaction, camera and performance contracts.
- `references/three-scope-map-template.md`: Vue + Three.js component structure for a scope-aware map component.
- `references/visual-qa.md`: Required visual checks and screenshots after map edits.
- `references/regression-guard.md`: Guardrails to avoid unrelated regressions.
- `references/fui-earth.md`: FUI appearance, skins, HUD and destination visual invariants.
- `references/fui-earth-runtime.md`: FUI sampler/resource contract, phase and skin events, retry, shared surface input, cache build gate and regression workflow.
- `references/earth-view.md`: Pure Three.js globe entrance, spherical China GeoJSON highlight, GSAP camera flight, and reuse of the existing China map.
- `references/v3-api.md`: Version 3 theme/material/effect/composition API and compatibility matrix.
- `references/map-3d-overlay.md`: Shared-context MapLibre 2D + 3D overlay, real projection, interaction and cleanup.
- `references/map-2d-switching.md`: Manual 3D / 2D switching, shared navigation state, MapLibre provider replacement, coordinates, and QA.

## Scripts

- `scripts/resolve_map_data.py`: Validate local GeoJSON or download world/country/province/city/district candidate GeoJSON. Use `--adcode` for drilldown levels.
- `scripts/resolve_map_textures.py`: Validate or generate fallback `diffuse`, `height`, `normal`, and `roughness` terrain texture sets.
- `scripts/generate_map_theme.py <hex>`: Generate a full map theme from one main color.
- `scripts/apply_map_theme.py <hex> <target-project-or-mapTheme.ts>`: Set the classic shared primary or the paired FUI generated default; keep named presets and per-instance overrides available.
- `scripts/recolor_label_asset.py <hex> <svg>`: Legacy helper for older local projects that still use an SVG label pointer.
- `scripts/preprocess_map_data.py`: Create render-ready GeoJSON with simplified rings, bbox, center, and point-count metadata.
- `scripts/check_three_map_project.py`: Check a target project for Vue or React/Vite/Three dependencies, copied template files, assets, fixed-size host mistakes, SVG substitutes, and required one-to-one Three.js effects.
- `scripts/check_vector_map_project.py`: Check a standalone or hybrid 2D project for the provider, semantic theme, coordinate, worker, interaction, responsive-control, and diagnostics contracts.
- `scripts/check_vector_map_diagnostics.py`: Validate a JSON snapshot exported from `window.__SUMMER_MAP_2D_DIAGNOSTICS__` after browser QA.
- `scripts/verify_template_integrity.py --preset fui`: Verify the FUI template against its separate manifest.
- `scripts/verify_template_integrity.py`: Verify every bundled template file and binary texture against `assets/template-manifest.json`. Never claim one-to-one fidelity when this check fails.
- `assets/templates/mapDataAdapter.ts`: Reusable cache/prefetch/network fallback adapter template.
- `assets/templates/frameChunkedRebuild.ts`: Reusable chunked map rebuild and resource-disposal helper template.
- `assets/templates/cameraPresetController.ts`: Reusable camera angle preset, localStorage persistence, and OrbitControls save/apply helper.
- `assets/templates/songsummer-earth-vue/src/`: One-to-one Vue 3 template component, map data, original four-layer terrain textures, and theme-generated original SVG label skin from the validated 3D map.

## Common Commands

```bash
# Generate a complete native React project, or retain Vue explicitly
python3 <skill>/scripts/create_map_project.py <target-project> --preset fui --framework react
python3 <skill>/scripts/create_map_project.py <target-project> --preset classic --framework react
python3 <skill>/scripts/create_map_project.py <target-project> --preset fui --framework vue

# Validate existing province data
python3 <skill>/scripts/resolve_map_data.py --validate src/assets/maps/zhejiang.json --scope province

# Download and validate China scope data
python3 <skill>/scripts/resolve_map_data.py --region 中国 --scope country --out src/assets/maps/china.json --download

# Download and validate world countries data
python3 <skill>/scripts/resolve_map_data.py --region 世界 --scope world --out src/assets/maps/world.json --download

# Download drilldown data by administrative code
python3 <skill>/scripts/resolve_map_data.py --adcode 330000 --scope province --out src/assets/maps/china/330000.json --download
python3 <skill>/scripts/resolve_map_data.py --adcode 330100 --scope city --out src/assets/maps/china/330100.json --download
python3 <skill>/scripts/resolve_map_data.py --adcode 330106 --scope district --out src/assets/maps/china/330106.json --download

# Generate a full cyan map theme
python3 <skill>/scripts/generate_map_theme.py '#2AF7FF'

# Apply one color to both Earth and the 3D map
python3 <skill>/scripts/apply_map_theme.py '#2AF7FF' <target-project> --no-backup

# Validate texture set
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/china --scope country --check

# Preprocess GeoJSON from the skill itself
python3 <skill>/scripts/preprocess_map_data.py --input src/assets/maps/china.json --output src/assets/maps/preprocessed/china.preprocessed.json --scope country --max-points 220

# Preprocess local GeoJSON for smoother runtime drilldown
npm run map:preprocess -- --input src/assets/maps/china.json --output src/assets/maps/preprocessed/china.preprocessed.json --scope country --max-points 220
npm run map:preprocess -- --input src/assets/maps/zhejiang.json --output src/assets/maps/preprocessed/zhejiang.preprocessed.json --scope province --max-points 420

# Check that a generated target project is ready for one-to-one Three.js delivery
python3 <skill>/scripts/check_three_map_project.py <target-project> --strict

# Check a standalone or hybrid MapLibre implementation without requiring Earth/3D assets
python3 <skill>/scripts/check_vector_map_project.py <target-project> --strict

# After browser QA, validate the exported runtime snapshot
python3 <skill>/scripts/check_vector_map_diagnostics.py /tmp/vector-map-diagnostics.json

# Verify the bundled source/asset baseline has not drifted
python3 <skill>/scripts/verify_template_integrity.py
```

## Delivery Checklist

- Run template integrity verification for the chosen family before copying, the strict validator for every included renderer, and the target project's build.
- Inspect actual HTTP-served WebGL output and runtime errors using `references/visual-qa.md`; report the checks performed and any concrete environment limitation.
- Verify the requested scope/data, theme, selected material, interaction, administrative drilldown/back and Earth return where present. Keep data sources, texture scope and displayed elevation units accurate.
- For Earth, verify the selected family's intro/prewarm gates, asynchronous destination, static handoff frame and exclusive continuous-loop ownership described above.
- For FUI China, verify the inset remains fixed during map orbit/zoom and that the globe's `*_JD` decoration stays separate from China fill/extrusion.
- For 2D/overlay, verify provider roads/labels and attribution, camera registration, semantic theme, shared navigation, worker loading, diagnostics and cleanup.
- Keep paths portable, attribution non-visual, and unrelated app content outside the map integration. Report relevant data, color and verification results without a build-only visual-fidelity claim.
