# Performance Pipeline

Use this reference to preserve the selected visual style while improving administrative drilldown, renderer handoff and resource scheduling.

## Runtime Layers

Keep these concerns separate:

- Data adapter: loads GeoJSON by `{ scope, code }`, owns local seed data, network fallback, request de-duplication, and prefetch.
- Preprocessor: creates small render-ready GeoJSON files with simplified rings, bbox, center, feature count, and point count metadata.
- Renderer: consumes normalized GeoJSON and keeps the visual preset unchanged.
- Interaction: hover highlight, drilldown stack, fly-line source rules, labels, and ripple rules.
- Contour renderer: loads precomputed DEM bundles through its own adapter and repaints only on data, viewport, resize, or hover changes. It does not share the Three.js or MapLibre render loop.

Do not move material colors, side gradients, chase-light styling, label images, or scatter assets into the data adapter. The adapter must not change visual output.

## Data Adapter Contract

For Vue + Three.js dashboards, prefer a small adapter beside the map component:

```ts
export type MapScope = 'world' | 'country' | 'province' | 'city' | 'district';

export type MapState = {
  scope: MapScope;
  regionName: string;
  code: string;
  geoData: GeoFeatureCollection;
};

export const initialMapState: MapState;
export function loadMapLevel(scope: MapScope, code: string): Promise<GeoFeatureCollection>;
export function prefetchMapLevel(scope: MapScope, code: string): void;
```

Rules:

- Seed the first visible level locally so first paint does not depend on the network.
- Cache by `${scope}:${code}`.
- De-duplicate in-flight requests with a `pending` map.
- Prefetch the next level's administrative JSON on intentional hover, but do not rebuild the map until click. The FUI vector overlay uses a short dwell and cancels stale intent; hover must not request DEM or begin GPU/model preparation.
- Keep a drill stack of full `MapState` objects and cache their data for back navigation. Cached JSON avoids refetching; a renderer may still need to prepare and draw the restored scope.

## Offline Preprocessing

Use a preprocessing script before publishing or before shipping many levels:

```bash
npm run map:preprocess -- --input src/assets/maps/china.json --output src/assets/maps/preprocessed/china.preprocessed.json --scope country --max-points 220
npm run map:preprocess -- --input src/assets/maps/zhejiang.json --output src/assets/maps/preprocessed/zhejiang.preprocessed.json --scope province --max-points 420
```

The generated data should include:

- Simplified rings for rendering.
- Feature bbox and center metadata.
- Source/render point counts for debugging.
- Dataset bbox and feature count metadata.

Keep the raw GeoJSON too. The preprocessed file is a render cache, not the source of truth.

## Drilldown Performance Rules

- Build only the requested replacement level. Keep the previous scene visible during preparation; in the shared-context FUI overlay, retain its GPU resources through the new first draw and camera transition, then retire them in bounded resource steps inside later borrowed-context draws. Cancellation, removal and context loss also release stale/retired resources.
- Precompute projection bounds before creating meshes.
- Split very large geometry creation across frames when a level has many features.
- Disable expensive chase-light paths on all-China level unless the user explicitly asks for it.
- Keep texture opacity and material parameters in the renderer preset so preprocessing never changes the look.
- Keep top texture UVs clamped to the map bounds to avoid texture bleeding outside the boundary.

### Native FUI overlay preparation

Keep the existing visual inputs and default high quality. The geometry worker performs the same footprint union and beveled body construction as the native renderer, transferring positions, normals, topology, bounds and region ownership rather than simplifying geography or reducing detail. It creates no renderer, material or GL resource. Terminate obsolete workers on cancellation; use cooperative construction when workers are unavailable. Main-thread atlas/material stages share a short yield budget between stages, not a separate continuous render loop. A budget does not guarantee that every individual CPU stage or GPU first use fits within one frame.

Resolve the geographic projection first and start the target DEM request immediately, alongside geometry and native texture preparation. Apply an already available regional height field and its picking proxies before the replacement's first draw. If detail is still loading, the new scope may first draw its correctly scoped overview. After height and picking endpoints are prepared, the visible overlay mixes detail over 380 ms through its existing shared terrain uniform. Surface height, normals and color use that progress; CPU raycasts interpolate cached endpoint heights during picking, without per-frame dense geometry updates. Preserve the original overview endpoint across repeated detail preparation and use bounds covering both endpoints. Hidden/pre-first-frame detail is complete at reveal. Preserve the overview on a DEM failure; smooth glass never requests unused DEM or terrain photographs.

For an established MapLibre overlay, finish the matching target scope's first real draw before fitting the destination camera or emitting its navigation event. Keep the previous camera while construction is pending, and cancel an obsolete draw wait when a newer request arrives. This avoids flying through the old scope's texture. Standalone 2D retains its existing navigation behavior.

The visible breadcrumb describes the last rendered scope while a replacement is pending. Keep its loading feedback beside the navigation path, with a delayed spinner/pending-region label and accessible busy/live state, rather than a centered box over the map. Resume the normal breadcrumb after the matching model draws. While the camera is dragging or easing, skip refined-terrain hover raycasts; preserve settled click accuracy and administrative navigation.

Do not delete all retired geometry and programs in the replacement's first render callback. The shared layer keeps a 900 ms first-draw grace period and waits for the camera to settle, then consumes disposal steps within an approximately 4 ms per-draw budget. Request only bounded cleanup repaints; timers do no GL work. A synchronous disposer must finish any partially consumed iterator on removal or context replacement. This manages resource release timing without changing the selected material, reflection, geometry or quality.

Batch order-independent additive wall coats by administrative owner with exact geometry and lift. Normal-blended wall cores use a global `THREE.BatchedMesh` list with original per-chunk padded spheres, individual frustum culling and projected-center depth ordering across owners. Retain exact lift/selection/opacity state and anchored-foot equations; hidden original cores are state proxies, not extra rendered geometry. Use Three's multi-draw support or its shared-buffer fallback without changing the material. Dispose batch-owned metadata textures and aggregate geometry exactly once. Reducing draw submission must not simplify coastal geography, drop islets, remove reflection or reduce the existing high-quality optical recipe.

For South China Sea islands, opaque caps and transparent walls can share one ordered index range per material because their original render queues already separate them. Preserve triangle order within each queue. Do not apply that regrouping to maritime cap/side materials that are both transparent; retain their interleaved order.

Measure administrative JSON, model preparation, first new draw and regional relief separately. Native overlay diagnostics expose `buildStartedAtMs`, `modelPreparedAtMs`, `firstFrameAtMs`, `regionalRequestStartedAtMs`, `regionalReadyAtMs`, `terrainBlend` and `regionalAppliedBeforeFirstFrame`. Detail readiness follows the completed visible blend; a cached-detail first draw and an overview-first draw are different workloads. For drill/back performance validation, measure the real MapLibre `movestart` through `moveend` and a post-flight tail of at least 500 ms in addition to first-ready latency. Record phase-specific long tasks, RAF intervals and native render/draw-call observations with unchanged quality. Retain every regression, document cache/network conditions, and do not treat RAF cadence as GPU presentation time or display FPS. First-ready speed alone is not evidence of a smooth full transition.

## Earth-To-Map Render Handoff

The numbered sequence below is the classic preset’s serial warm-up contract. FUI uses a different gate: let Earth render and finish its complete intro independently, then permit the destination’s second WebGL context, PMREM generation, compilation and texture uploads. Measure all those GPU operations, not only the last warm-up function. Inactive views and hidden pages stop their continuous loops. Preserve a prepared destination frame for handoff, without letting destination readiness gate FUI Earth visibility.

For smooth holographic maps, prepare only the edge field, geographic face and side volume. Do not request unused photographs, DEM, legacy terrain maps, terrain subdivision or CPU height readback. Prepare a different material family on demand, retain the current scene until its replacement is ready, and preserve scope/camera/HUD phase. Explicit quality budgets cap DPR and reflection targets; low quality omits the live reflection. Shared-context overlay uses MapLibre’s own repaint lifecycle and has no independent RAF.

### FUI renderer-view handoff

Keep the committed view visible until the requested 3D, 2D or overlay destination has drawn the matching administrative scope and composition. Seed a cold standalone renderer with the current navigation before construction, avoiding an unused country build. Its real footprint/body geometry uses the existing worker algorithms with a cooperative fallback; textured side bodies reuse the ordered native wall batches without reducing detail or changing materials.

A hidden standalone host may have no layout. Pass the shared host's actual viewport into preparation, use the active-quality DPR, settle the existing entrance and draw/flush the complete final target variants before reveal. Center the actual projected administrative body by translating the camera and orbit target together; preserve angle, zoom distance and field of view. Reuse the mounted model/canvas and linked variants on an unchanged return switch rather than rebuilding them or replacing the ready buffer with a delayed resolution upgrade.

The MapLibre destination uses an explicit one-shot preparation permit, including when an inactive cached layer has already drawn. Retain that permit across an asynchronous scope build and release it after the requested ready model draws at the resized viewport. Complete hidden regional blending before that draw, with no independent RAF or persistent inactive repaint. Cancel obsolete reveal waits on a newer view request, navigation change or removal. Verify cold scope handoff, actual final-viewport drawing, cancellation and cached model identity separately from drill-camera performance; timings for these checks do not establish display FPS or cross-device smoothness.

With the default-enabled FUI view selector available, an active, visible, ready 3D/overlay source may prepare its alternate view once after 150 ms and `requestIdleCallback` (500 ms callback timeout). The standalone entrance must finish before scheduling; a plain 2D source does not trigger this work. Use the same worker and bounded one-shot draw path, with a 30-second optional request timeout and no visible pending/error UI. Cancel idle requests on navigation, an explicit switch, deactivation, explicit selector removal or unmount. Cache the target navigation/skin/presentation/surface/quality signature and bound navigation rescheduling. Retained alternate renderers add context, geometry, texture/target and memory costs; do not prewarm unused renderers for an explicitly single-renderer map without the selector. A first switch may still wait if idle preparation has not completed.

### Classic serial sequence

Preserve the authoritative Earth intro and its existing event timings. Optimize only ownership of the destination render loop:

1. Warm the Earth scene and postprocessing targets while its WebGL canvas remains hidden; keep the CSS starfield/backdrop visible.
2. Emit `scene-ready` once after hidden Earth GPU warm-up, and hold the visible intro behind a `start-intro` prop.
3. Keep the raw high-resolution world GeoJSON as source data, but import the simplified `world.earth-render.json` cache in `EarthView.vue` so first paint does not parse the raw multi-megabyte file.
4. Define `ChinaMap.vue` as an async component, then mount it immediately from `scene-ready` with `active=false`.
5. Split inactive destination geometry construction into cooperative idle slices of roughly 4 ms or less. Yield within complex regional features as well as between features.
6. Load textures, run `compileAsync`, initialize one texture per idle slice, settle all transition materials to their final opacity, and render exactly one complete WebGL frame plus one CSS2D label frame.
7. When the destination emits `ready`, release `start-intro`; from this point until Earth intro completion, perform no destination initialization or GPU upload.
8. Keep the destination static canvas mounted and hidden. Do not leave an inactive `requestAnimationFrame` chain running.
9. At `handoff-start`, reveal the already-rendered static canvas underneath Earth while Earth remains the only continuous renderer.
10. When `enter-china` fires after Earth postprocessing/fade is effectively complete, set the destination map active and start its normal animation loop without replaying a transparent entrance over the static frame.

Batch all same-material world outlines into one `THREE.LineSegments` geometry. Thousands of individual `LineLoop` objects create thousands of draw calls per frame and can make the visible China-rise animation run at half speed even though the destination map is inactive.

Do not remove, shorten, or bypass the Earth intro to gain performance. A short warm-up before the visible intro is intentional; hide it behind the existing backdrop instead of starting Earth and destination work together. Do not activate the destination map merely because the handoff stage is visible.

## Publishing Checklist

- Include the data adapter file.
- Include the preprocessing script.
- Include sample commands for country/province/city/district data.
- Document where local seed files live.
- Document the expected GeoJSON properties: `name`, `fullname`, `adcode`, `center`.
- Classic: confirm Earth remains hidden until destination readiness. FUI: confirm Earth starts independently and destination context/PMREM/upload timestamps follow intro completion.
- Confirm the raw world GeoJSON is not in the Earth first-paint bundle and the destination renderer is a separate async chunk.
- Confirm geometry work yields in short slices and texture uploads are separated. Only classic releases `start-intro` from destination `ready`; FUI follows its separate gate above.
- Confirm the destination map has no continuous RAF while inactive and that its precompiled static handoff frame is fully opaque.
- Preserve code-only attribution: `作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天`.
- For contour mode, keep the grid bounded, preprocess line extraction offline, render only the current level, avoid a continuous idle RAF, and do not start contour decoding during the visible Earth intro.

## 3.0 measured technical baseline

These are historical baseline measurements. Targeted functional validation does not constitute a repeat of the complete performance measurement set; consult the current validation record for execution scope.

Preserve rendering inputs and default high quality when measuring performance. The [3.0 performance summary](../validation/3.0.0/performance-summary.json) records three HTTP-resource cold/reload
pairs, low/hologram first-ready cycles, and entity plus hologram cycles after
normal destination prewarm completes. Initial prewarm long frames remain in the
data. Do not label first-ready and steady measurements as the same workload or
disable normal destination preparation for a benchmark.

The measured platform is one MacIntel/Chromium157/AMD5500M WebGL2 environment.
HTTP cache isolation does not clear shader caches. Local loopback startup timings
are not network-delivery guarantees; RAF cadence is not GPU present-time. Memory
is the optional Chromium JavaScript-heap estimate, not process RAM/VRAM or a leak
proof. No Windows/mobile/other-GPU coverage is inferred from forced LDR/direct or
quality-budget branches. See the current record for exact values and limitations.
