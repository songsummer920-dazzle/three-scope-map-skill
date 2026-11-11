# Renderer Switching, 2D Vector Mode And Geographic 3D Overlay

Use this when a map must include the conventional, recolorable 2D basemap, either standalone, in an explicit renderer switch, or with geographic 3D administrative volumes in the same MapLibre scene. A renderer switch and a shared-context overlay are distinct compositions. When the switch also includes the standalone contour renderer, read `contour-map.md`; contour is not a MapLibre layer.

## Interaction Contract

- Normal Earth and administrative-3D integrations retain `3D 地图 / 2D 地图 / 2D + 3D` controls by default. Hide the selector only for an explicit request to hide switching or keep a single renderer; a plain “3D map” request selects the initial view and does not disable it. Add `等高线地图` only when contour is requested. Never switch renderers automatically at a scope boundary. Explicit standalone 2D or standalone contour tasks do not acquire unrelated renderers or their switches.
- Keep one navigation path of `{ scope, regionName, code }` items.
- In hybrid mode, entering 2D preserves the current country/province/city/district.
- Drilldown and back in 2D update the shared path in both standalone and hybrid modes.
- In hybrid mode, returning to 3D rebuilds the Three.js renderer at the same path before revealing it.
- In hybrid mode, stop the inactive Three.js animation loop and keep hidden controls out of keyboard navigation.
- Initialize 2D with a visible perspective camera, not a forced `pitch: 0` top-down view.
- Keep native right-drag / Ctrl+left-drag rotation, compass drag, and touch pitch enabled by default; rotation must never require entering a separate mode.
- Preserve ordinary left-drag panning, remove redundant free-rotate mode buttons, set `bearingSnap: 0`, and allow pitch up to MapLibre's stable 85-degree limit. Keep the native compass as the north-facing reset.
- On scaled dashboards, do not bury the compass under the zoom buttons. Mount a compass-only `NavigationControl` separately, keep zoom controls in their own group, and give the compass a clearly visible circular treatment and north marker without changing its native drag/reset behavior.
- Preserve the current bearing and pitch across administrative drilldown and back navigation.
- For a 3D-first switch, mount and warm 2D only after the destination 3D map is active. An explicitly requested initial 2D/overlay view may prepare that renderer directly without constructing the standalone 3D scene first. Never overlap either destination path with the visible Earth intro.
- Emit 2D readiness from MapLibre's first `load` event, which represents the first visually complete frame, and keep the current renderer visible before that point. Continue recording the first `idle` event separately for source diagnostics; do not make renderer switching wait for every in-flight tile or glyph request to become idle.
- Before revealing a ready 2D renderer, call `resize()`, request a repaint while it is still hidden, and wait for that render frame. On fixed-resolution scaled dashboards, or whenever profiling shows dual-WebGL compositing pressure, use an opaque map-local mask: cover the outgoing renderer, swap visibility at full cover so only one WebGL canvas is composited, render one destination frame, then reveal it. Do not cross-fade two high-resolution WebGL canvases, and do not use `v-show`/`display: none` before the mask is fully opaque.
- Cap MapLibre's `pixelRatio` independently from the Three.js renderer on fixed-resolution scaled dashboards. Default `maxPixelRatio` to `1.5`, allow customers to override it through `window.__SUMMER_MAP_2D_CONFIG__` or `VITE_MAP_2D_MAX_PIXEL_RATIO`, and verify the actual canvas width/height in the browser. Do not lower the Three.js renderer DPR as part of a 2D-only optimization.
- Apply provider palette changes to the hydrated style JSON before constructing MapLibre instead of issuing dozens of runtime paint/layout mutations.
- Use a non-animated initial bounds fit, then retain animated fits for user-initiated drilldown.

## True Geographic 3D Overlay

For the FUI wrapper, select `mapView="overlay"` with an independent `mapStyle="classic"`, `"terrain-glass"` or `"smooth-glass"` and optional `primaryColor`. Direct `VectorMap` integration exposes `overlay: boolean = false`, `overlaySurface: 'classic' | 'terrain-glass' | 'smooth-glass' = 'smooth-glass'`, `primaryColor?: string`, and semantic `palette` overrides. For example:

```vue
<FuiEarth primary-color="#9f42e6" map-style="smooth-glass" map-view="overlay" />
<VectorMap primary-color="#22e680" :overlay="true" overlay-surface="terrain-glass" />
```

`vectorMap3dGeometry.ts` derives tops, walls, edges, polygon holes and picking geometry from the current real administrative GeoJSON. It registers longitude/latitude in Mercator coordinates around a local anchor, with the latitude-aware metre scale. `VectorMap3dLayer` is a MapLibre custom layer with `renderingMode="3d"`; it consumes the current MapLibre projection matrix and shares the map canvas, WebGL context and depth buffer. The camera is MapLibre's camera. Do not mount another Three.js renderer/OrbitControls/RAF above the map or synchronize two canvases by approximate CSS transforms. The custom layer never clears the shared framebuffer and restores the GL state it changes.

Keep the basemap's roads, water and land below the volume and provider label layers above it. Hide the duplicate flat administrative overlay while the volume is active; restore it when returning to ordinary 2D. The standalone 3D renderer remains inactive while this composition is visible. Overlay temporarily selects Mercator projection and restores the prior projection when removed. Native map pan/zoom/bearing/pitch and attribution remain available.

Hover uses inverse projection and the actual geographic mesh, not a screen rectangle or unrelated flat hit plane. A lifted feature moves its visible top, side shoulder, boundary and hit geometry together; click/back updates the shared administrative path. Display extrusion depth and hover lift are intentionally exaggerated and must be reported as display geometry, not DEM elevation or literal coast/island thickness. `terrain-glass` samples the bundled NASA/GEBCO geographic relief atlas for surface shading; it does not turn the displayed extrusion into the standalone regional DEM or contour terrain. Smooth glass acquires no terrain atlas. FUI overlays reuse the selected native geographic material implementation within the shared MapLibre context. Smooth glass retains its owned PMREM, reflection and HDR resources when supported, without another canvas, OrbitControls or animation loop; follow the resource and framebuffer contracts in [map-3d-overlay.md](map-3d-overlay.md).

On deactivation, stop layer-driven repaints. On removal or context loss, release/recreate the layer's buffers, shader program and owned relief texture; preserve the MapLibre context and other layers. Abort stale texture/data requests. A basemap or custom-layer failure must produce the existing actionable error state, never a screenshot or a flat polygon advertised as successful 3D.

## Renderer And Data Boundary

MapLibre GL JS is the 2D renderer, not the commercial map-data license. Keep these concerns separate:

1. Basemap: roads, water, buildings, land use, and labels.
2. Administrative overlay: the existing drilldown GeoJSON.
3. Business overlays: customer-owned points, lines, polygons, or heat layers.

The bundled template defaults to the complete OpenFreeMap street basemap for development. It must visibly render roads, water, buildings, land use, and place labels; an administrative polygon-only view is not an acceptable substitute. `vectorMapConfig.ts` keeps backward-compatible `basemap` and `coordinateSystem` overrides, but new integrations should configure one `provider` object. The provider exposes four replacement forms:

- `style-url`: a complete provider style JSON URL.
- `raster`: XYZ or WMTS-compatible raster tile templates.
- `vector-tiles`: OpenMapTiles-compatible MVT templates.
- `pmtiles`: a self-hosted PMTiles archive.

Customers may set `VITE_MAP_2D_STYLE_URL` or assign `window.__SUMMER_MAP_2D_CONFIG__` before the Vue app mounts. Provider configuration owns its ID, basemap, coordinate system, attribution, glyphs URL, semantic layer hints, request headers/query parameters, optional URL rewrite, and optional development proxy. Do not hardcode provider tokens in reusable components. During Vite development, proxy OpenFreeMap through `/openfreemap` so embedded preview browsers do not stall third-party vector-tile requests. Production deployments may connect directly, route through the customer's gateway, or use a self-hosted provider.

Use this shape for provider replacement:

```ts
window.__SUMMER_MAP_2D_CONFIG__ = {
  provider: {
    id: 'customer-mvt',
    basemap: {
      type: 'vector-tiles',
      tiles: ['https://maps.example.com/{z}/{x}/{y}.pbf'],
      attribution: 'Customer map data',
      glyphsUrl: 'https://maps.example.com/fonts/{fontstack}/{range}.pbf',
    },
    coordinateSystem: 'WGS84',
    request: { query: { token: 'injected-by-the-host' } },
    layerRoleHints: {
      'road-major': ['expressway', 'highway-primary'],
      vegetation: ['forest-area', 'green-space'],
    },
  },
};
```

Inject real credentials from the host or deployment environment. Never place reusable tokens in the template or skill.

## Attribution presentation

Retain the basemap's required source names and licence links. The FUI control shows its first populated attribution for five seconds while the map is actually active and the page visible, then collapses to MapLibre's native information control. Hidden preparation must not consume that exposure time. Keep keyboard and pointer access to the full attribution; a later manual expansion must remain open until dismissed. Do not remove required credits or repeatedly force a user's opened control closed. Follow the [OpenStreetMap interactive-map attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines#Interactive_maps). OpenFreeMap's own brand credit is optional, while OpenMapTiles and OpenStreetMap attribution remains required under the [provider's published terms](https://openfreemap.org/).

Open-source renderer code, basemap data and hosted service terms are separate permissions. Commercial use permission does not certify map content or jurisdiction-specific publication requirements. Static exports and videos follow their own attribution guidance; a compact runtime control is not permission to remove credits from exported maps.

## Coordinate Contract

- Keep internal administrative and business coordinates in WGS84.
- Set the provider boundary to `WGS84`, `GCJ02`, or `BD09`. The bundled adapter transforms an immutable copy of administrative GeoJSON and feature centers only when rendering against a shifted provider.
- Do not transform shared GeoJSON in place and do not let provider coordinates enter the shared drilldown state.

## Styling

- Preserve provider attribution.
- A single `primaryColor` accepts `#RGB`/`#RRGGBB` and derives the dashboard semantic palette. Standalone classic projects also consume the shared `MAP_THEME_PRIMARY`; the untouched default retains its established blue-gray 2D palette. An explicit custom primary, including an explicit green, is a color request and does not change renderer/material/view. `getVectorMapConfig(primaryColor)` and `getVectorMapConfig({ primaryColor, palette })` support instance-local configuration; no mutable global color override is required.
- Use `palette` in `window.__SUMMER_MAP_2D_CONFIG__` to recolor land, water, parks, buildings, road classes, rail, labels, and administrative overlays independently.
- Compile the provider style through semantic roles such as land, vegetation, water, building, road hierarchy, rail, boundary, place label, road label, and POI label. Add provider-specific regex hints in `provider.layerRoleHints`; do not add provider names to `VectorMap.vue`.
- The bundled dark dashboard preset intentionally gives all vegetation-related layers—including parks, forests, grass, scrub, wetlands, cemeteries, pitches, and provider-specific vegetation filters—the same base color as ordinary land use. Remove provider vegetation patterns and green fill outlines as well as recoloring the fill, so no green fragments survive at any zoom. Providers may still override `palette.park` when a distinct vegetation treatment is required.
- In the untouched dashboard preset, keep the road hierarchy in a very low-contrast blue-gray range and the local administrative overlay cyan-white. A custom primary derives the corresponding semantic hues while preserving that brightness/opacity hierarchy. Road casings and rail hatching remain dimmer than their center lines, so dense road networks do not compete with administrative boundaries.
- A dashboard may add a non-interactive vignette above the 2D renderer: keep the central map fully clear, fade the outer 25–30% gradually, and make the lower edge slightly darker so the map blends into side panels and bottom navigation. The vignette must use `pointer-events: none` and stay below all map controls.
- The default dashboard theme recolors a third-party style at runtime, but `theme: 'source'` must preserve the provider's original style.
- A live color change updates changed semantic paint values and the custom layer's material uniforms on the existing map. Preserve sources, loaded tiles, camera, navigation and attribution; reapply the latest palette after asynchronous style setup. Explicit role overrides take precedence over the generated palette. Source-style opt-out still preserves provider paint, and raster tiles support the existing saturation/brightness treatment rather than arbitrary per-feature vector recoloring.
- Prefer `name:zh-Hans`, then `name:zh`, then the provider's default name for place, road, water, and POI labels.
- Keep administrative boundaries above the basemap and below future business overlays.
- Keep the administrative fill nearly transparent so it never hides the street basemap.
- A remote basemap failure must not erase the local administrative overlay.
- Configure compass/zoom offsets through `controls.top`, `controls.right`, and `controls.bottom`. The component exposes those values as CSS variables, so a new dashboard shell does not require editing MapLibre internals.

## Runtime Diagnostics

`VectorMap.vue` publishes `window.__SUMMER_MAP_2D_DIAGNOSTICS__` and mirrors the same JSON to `document.documentElement.dataset.summerMap2dDiagnostics` for browser harnesses that evaluate scripts in an isolated world. Inspect either snapshot after the first `idle` event. A valid vector result has:

- `styleLoaded: true` and `firstIdle: true`.
- `basemapSourceLoaded: true` with each source state visible.
- Positive `roadLayerCount` and `labelLayerCount` for vector providers.
- The expected provider ID, coordinate system, navigation key, bearing, pitch, and zoom.
- No recorded MapLibre errors.

Export the object as JSON and run:

```bash
python3 <skill>/scripts/check_vector_map_diagnostics.py /tmp/vector-map-diagnostics.json
```

Overlay also publishes `window.__SUMMER_MAP_OVERLAY_DIAGNOSTICS__` and the vector host's `data-overlay-diagnostics`. Require `renderer: 'maplibre-geographic-3d'`, `cameraSource: 'maplibre'`, shared canvas/context flags, the expected surface and navigation key, positive feature/triangle/draw/frame counts, and no shader/context errors. Record `displayExtrusionMeters` with `heightMeaning: 'display-extrusion-not-DEM'`, hovered key/progress/lift, the geographic anchor/projection matrix, and terrain source/readiness when applicable. Successful geometry tests or a loaded basemap do not prove that the volume was drawn, correctly registered or visually polished.

## Validation

- Enter the China 3D map and switch to 2D without changing scope.
- Drill to one province in 2D, then switch to 3D and confirm the same province appears.
- Return to China in 2D, then switch back to 3D and confirm the country scope.
- Confirm the MapLibre worker is bundled with its required `maplibre-gl-shared.mjs` dependency; copying only the worker entry is incomplete.
- Confirm the vector source reaches `source loaded: true` and visually renders roads and labels, not only the local GeoJSON boundary.
- Confirm style URL, raster, MVT, and PMTiles configurations build.
- Confirm attribution remains visible and no hidden 3D control remains keyboard-focusable in 2D mode.
- Confirm ordinary left-drag pans, right-drag / Ctrl+left-drag changes both bearing and pitch without entering a mode, compass drag rotates, wheel zoom remains available, and compass click resets north.
- Confirm a cold 2D switch waits only for the first visually complete `load` frame, a warm switch is immediate, first-idle diagnostics still complete in the background, and no 2D preload work starts during the visible Earth entrance.
- Run `scripts/check_vector_map_project.py <target-project> --strict` for every standalone or hybrid 2D delivery.
- Inspect and validate `window.__SUMMER_MAP_2D_DIAGNOSTICS__`; source-code regex checks alone do not prove that tiles, labels, or interactions work.
- For overlay, inspect the same location at multiple zooms, bearings and pitches: geography must remain registered with roads/coastlines, side depth must remain present, hover/click must select the visible raised region, and provider labels/attribution must remain readable. Verify context cleanup and ordinary-2D restoration.
- Check a primary-color-only switch, separate style/wave changes, black/white/gray finite values, and two simultaneous instances with different colors. A palette switch must not silently select smooth glass or rebuild the basemap. Keep default named-preset comparisons separate from explicit custom-color comparisons.
