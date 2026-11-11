# FUI runtime, resources and regression

Use this reference when changing FUI loading, skin switching, material inputs, failure recovery or generated caches. Keep the visual parameters in `fui-earth.md`; this reference owns the runtime contract.

## One resource contract

`fuiEarthResources.ts` owns `EARTH_SAMPLERS`, texture policies, resource loading, deduplication, timeout, retry, bitmap cleanup and diagnostics. `globe`, `china` and `contours` declare their actual samplers for the `original` and shared `reference` families. First-frame dependencies and material texture uniforms derive from those same declarations. Do not add a second hand-maintained warm-up list or per-texture required flags.

- `original` retains the silver globe and its original day/normal/night maps.
- `reference` includes amber, glacier, alert and custom photographic colors. World/China bind required `uReliefMap: photoRelief` to the dedicated `world/earth-relief-photographic.jpg` RGB normal/elevation input; its byte hash/provenance are in `earth-relief-photographic-source.json`. The separate RGBA `earth-relief.png` remains independent for its existing map/other consumers and must not replace this calibrated input. Terrain and optional polar enhancement use the same high-resolution photograph. Both world/China bind required `uNightMap: lights` (`world/earth-lights.png`); VIIRS `earth-night-detail.png` is retained history, not active/required. Clouds and China caches retain their own semantic roles.
- Entity surface and its gradient wall do not sample `glassEdges`, so it is excluded from required photographic acquisition/upload. Retain the existing asset/cache and other consumers' fields; hologram glass still owns its own geographic field. Removing an unused first-frame dependency does not require deleting shared data or altering visual pixels.
- The generated China contact raster is registered in the same store and uploaded before the hidden frame.
- Preserve native pixel dimensions, color space, filtering and image orientation. The glass-edge data raster uses `flipY=false`; the other image bitmaps are decoded with the existing vertical flip. Never apply sRGB conversion to height, normal, distance or opacity data.

`earthPresentation="hologram"` (regular fine dots) and `earthPresentation="hologram-hex"` (regular honeycomb) use the same verified original-pixel RGBA geography cache, baked from real GeoJSON; China hit geometry still uses real polygons. Both skip surface-image family acquisition, image upload and speculative prefetch. The decoded geographic `DataTexture` remains renderer-owned data, distinct from image families; prepare and release it with the hologram. Startup does not import/parse the world GeoJSON or run its Canvas mask rasterization. The existing image resource contract remains authoritative for `surface`. The fixed geographic China base cap, raised smooth glass cover, union boundary walls, upper edge, dark bottom rim and picking clone are renderer-owned geographic buffers. Retain them through pending shader polls and dispose them with the scene. The top has its own fade/intro uniform objects; its base, wall and rims share those objects so the complete body fades together, while the upper cover and wall rise over the fixed base. World-China suppression prevents a duplicate regular hologram pattern beneath the intended glass backing. The glass helper owns its local geographic distance field; EarthView owns one generated studio PMREM target. Release both only after pending shader polls drain, alongside the renderer. No external surface image is acquired for this glass. Public hologram diagnostics include glass surface/province-boundary presence, real base/top topology and the current coupled focus radius; browser regression verifies it survives palette and presentation changes.

Earth uses the same pre-PMREM capability boundary. On a no-float device its composer uses RGBA8 and disables Bloom; hologram glass binds one owned black RGBA8 CubeUV environment rather than generating PMREM. The direct key and glass shader remain intact. Validate the actual-sized RGBA8 composer targets; an unusable byte target reports preparation error/retry rather than claiming a completed scene. Earth diagnostics expose output mode and `hologramEnvironment`, with startup `loadOutputMode`, `loadBloom` and `loadEnvironment` timings. This path degrades reflection/dynamic range and is not identical HDR output.

Start only the active family before constructing the surface scene. A missing or undecodable required image rejects readiness. Do not mark a failed image ready merely because its request ended. Requests have a 15-second timeout; a native image fallback decodes the same fetched blob rather than repeating an unsuccessful HTTP request. Late or cancelled bitmaps are closed.

After the complete intro, prefetch the other family without blocking the active scene. An explicit family switch may start that family immediately. Prepare its required resources before committing its palette/defines. Only the newest request can commit; a stale failure cannot roll back a newer success. On failure, retain the rendered skin and show retry. Keep HUD paint aligned with `skin-applied`, not an unfulfilled requested skin.

## Observable states and time

`loading` reports `{ phase, switching }` through `FuiEarth`. The phases are:

Use the established 78 px circular loading instrument for normal acquisition and preparation: a rotating outer arc, a counter-rotating dashed inner ring and a central diamond, with the current short status label below. Earth and destination preparation share this component. Keep its background transparent so a ready scene remains visible while waiting. Reduced-motion mode keeps the rings stationary. Failures retain a readable error and the existing retry action.

| Phase | Meaning |
| --- | --- |
| `loading` | The selected geographic binary and any required surface images are being acquired/decoded. |
| `warming` | Required textures, programs and a complete hidden frame are being prepared. |
| `entering` | The visible native entrance is playing; interaction remains disabled. |
| `ready` | The entrance has finished and interaction is available. |
| `error` | A required preparation step failed; a retry action is available. |

Earth keeps separate `scene-ready`, `first-visible` and `intro-complete` internal events. `first-visible` means an actual draw reached at least .5 surface reveal; it is not a physical screen-paint measurement. Public `ready` is emitted at full entrance completion. The destination's internal ready event still denotes its prepared static frame; its public loading state becomes ready after the native map entrance completes.

The original 4.2-second Earth animation clock follows real foreground time through `EarthTimeline`. Clamp damping deltas independently; never discard elapsed animation time to hide slow frames. Pause the clock and RAF while inactive or while the document is hidden. A busy GPU can still delay actual presentation, so do not promise exact wall-clock readiness or compare differently sized/cached runs as controlled benchmarks.

Mount the inactive map after the first visible Earth draw. Slice CPU construction, and hold destination GPU compilation, texture uploads and its hidden render behind `FUI_EARTH_WARMUP_GATE` until Earth intro completion. Direct-China routes release the gate immediately. The destination must never run a continuous hidden RAF. Existing pending entry/handoff behavior waits for the prepared map when an early click arrives.

Startup retry remounts the failed Earth renderer with full resource/context cleanup. `FuiRendererJobs` stops new submissions and retains program owners until outstanding Three.js compilation polls finish; destroying them mid-poll can throw from a timer outside the compile promise. On final teardown, stop visible work and lose the retired context before the drain, then destroy program owners only after it settles. KHR_parallel_shader_compile completion is unconditionally true after context loss; this cancels obsolete GPU work without deleting the objects its pending callbacks still inspect. Per-group retirement on a live renderer remains behind the drain. During hidden preparation there is no RAF frame boundary: explicitly flush after submitting the asynchronous compile jobs and before awaiting them. Do not use a blocking finish or raise timeouts to mask a stalled queue. Consume the submitted programs with the required hidden composer frame before awaiting all asynchronous completion polls; keep both that complete frame and the drained compile batch as readiness gates. Record frame time and before/after program status so a queue stall remains distinguishable from image loading or actual shader compilation. Skin retry retains the existing usable globe. Direct-map retry remounts the failed map. Do not turn these recovery paths into a page refresh requirement.

## Surface configuration and public integration

“3.0 实体地球” and “写实地球” select the `surface` presentation. Its photographic shaders, relief sampler, raised China, city/route lights and HUD are defined in [fui-earth.md](fui-earth.md). `themeForPresentation` and `materialForPresentation` select the same photographic response during creation, hot commit, frame exposure and shell updates. The primary rotates a fresh renderer-owned pigment set; it does not mutate global palettes, use per-skin gain tables or change destination materials.

`polarStyle="natural"` samples ice/snow from the main photograph. `enhanced` adds gray grading from the same source and shared palette, without another mesh, texture or reveal phase. Photographic and holographic China retain geometry-specific optical adapters; the photo-free hologram and smooth maps share `fuiHologramGlassOptics.ts` without sharing sphere/plane hit geometry.

The entity scan uses the radius-2.14 sweep sphere above radius-2.0 ground, with `BackSide`, additive blending, depth testing, no depth write and render order 2. Its zero-intensity material retains `sweepAlpha` and one .16 strength for all entity colors and both scan modes. The photographic static-air override applies only when `uIntensity > 0.0`; creation and hot color commit use the same `sweepStrengthForPresentation`. The hologram scan uses the same .16 photographic carrier strength, with near-side visibility handling; its two static atmospheric shells keep their original optical integration. Only the original silver surface retains its `.137 * scanGain` response.

The photographic wrapper retains a 1020 × 975 artboard, fitting the full 1019.9-unit symmetric HUD envelope with 4 CSS pixels of safety space. Original/hologram fits 1052 × 1080. All geographic canvases remain full-host. The photographic near-black background applies only while that Earth is visible. Preserve first-frame resource gates, native entrance timing, return state and scene ownership when changing these adapters.

For smooth destinations, each administrative region owns a coat/backing material pair on one ShapeGeometry and lifted parent. The backing uses `uEngravingDepth=2.6` below the z44 coat; `uGlassDepth` follows the separate z12–44 body’s 32-unit depth plus eased lift. `createFuiMapHologramBacking(coat)` shares live uniforms by identity, including theme, entrance, selection, depth, engraving gap and fixed optical frame. Keep the coat as the pick target, with no photograph/DEM acquisition, terrain refinement or flat hit proxy. Geometry and optical parameters are specified in [fui-earth.md](fui-earth.md).

Smooth standalone and overlay share `FuiGlassHdrPass` and the quality/capability policy. Standalone source geography uses layer 3, reflection layer 2 and instrument layer 0; raycasting includes layer 3. Compile actual main/HDR/reflection target variants, draw the complete hidden composed frame and flush before awaiting `FuiRendererJobs`. Regions borrow shared atlases and PMREM; retain their owned material pairs and passes until pending work drains. Color changes preserve uniform, geometry and canvas identities.

`createFuiMapGeographicGlassAsync` yields between union batches, edge-field blocks and regional stages. `FuiMapSharedGlassLayer` owns a version and AbortController for those CPU jobs, keeps the previous scene until a completed replacement commits inside a draw, and disposes stale/partial results. Pending/error geography is not picked as the new scope. PMREM, target changes and GPU work stay in the borrowed-context callback. Initial inactive preparation may draw one static frame; readiness waits for the basemap and an actual overlay frame. Settled/inactive views request no continuous frames. Sliced CPU work does not eliminate driver/program first-use cost.

The overlay owns its PMREM, reflection, HDR passes and optional backdrop resources; MapLibre owns the canvas, context, framebuffer, camera and repaint lifecycle. Preserve caller GL state and the non-null-FBO return bridge, including allocation probes and fallback. Cancel CPU tasks on replacement/removal/context loss and retire the old scene only after draw commit. `uGlassBackdropStrength` defaults to 0, with zero captures; opt-in transmission follows the encoding, MSAA resolve and cleanup contract in [map-3d-overlay.md](map-3d-overlay.md). That reference also defines exact Mercator units, rigid-camera reconstruction, layer order and capability fallbacks.

Useful `FuiEarth` events:

- `ready`: current entrance completed.
- `loading`: phase and whether a skin request is pending.
- `skin-applied`: the actual committed skin; reflect it in application controls.
- `skin-error`: `{ requested, rendered, message }`; preserve the rendered skin and expose recovery.
- Existing `mode-change`, `handoff-start` and geographic telemetry remain available.

Hologram diagnostics expose `sharedAerial` and the current optical fill policy. The integration regression checks that both patterns use the original surface aerial contribution, that hue exchange preserves fill luminance, and that the fill continues to follow each committed palette. Numeric exposure/Bloom equality alone does not establish this optical integration.

The current-view `retry()` chooses Earth or map recovery according to the active mode. The exposed API includes `enterChina()`, `returnToEarth()`, `replayEntrance()`, `retry()`, `retrySkin()` and read-only `getDiagnostics()`. `syncNavigation(path)` prepares an explicit destination path; `getNavigation()` returns the requested path and `getMapDiagnostics()` reports the renderer preparation and actual drawn scope. Globe entry still resets to national China. Pointer and public entry share the same asynchronous preparation gate before the existing flight starts. Keep technical diagnostics in tests or developer tooling rather than product controls.

Each entry from the globe opens national China, regardless of the previous destination drill level. Prepare the matching national frame before the handoff becomes visible; cancel obsolete renderer switches and suppress stale drill completion events. Preserve the chosen renderer composition, material and primary color. Switching between 3D, 2D and 2D+3D while inside the destination continues to preserve the current administrative path.

## Cache generation and build gate

The maintained `scripts/fui-earth-cache.mjs` checks both cache families. The skill-level wrapper delegates to it. Run with the selected template’s installed dependencies:

```bash
node scripts/fui-earth-cache.mjs . --check
node scripts/fui-earth-cache.mjs . /tmp/fui-china-cache-bake
node scripts/fui-earth-geography-cache.mjs . /tmp/fui-geography-cache-bake
```

The China baker retains the original Canvas builders, complete derived rings, native-size glow/glass-edge PNGs and exact decoded RGBA hashes. The geography baker derives original Float32 world-coast positions and the original 3072×1536 hologram RGBA atlas, then verifies gzip round trips without resampling or geographic simplification. Keep `earth-geography-cache.json`, `world-outlines.f32.gz` and `hologram-mask.rgba.gz` together. Source, builder, compressed-byte and decoded-byte hashes are part of this contract; never repair a failed gate by editing a stamp alone.

`npm run build` runs both checks through `prebuild`. Missing/stale source or builder hashes, wrong dimensions or altered decoded pixels/positions block the build. Rebuild the affected family from its original builder, establish output equivalence and run visual checks before updating template manifests.

`fuiEarthGeography.ts` fetches only the selected presentation’s binary per mount: outline positions for surface, the shared RGBA mask for either hologram. It runs alongside that presentation’s image dependencies and does not request destination data or every cache eagerly. Native `DecompressionStream('gzip')` decodes a compressed body; an already HTTP-decoded body is also accepted. The loader checks decoded dimensions and, on HTTPS/localhost with WebCrypto, SHA-256. Ordinary LAN HTTP reports `integrity='build-verified-gzip-crc'`: it retains the mandatory build-verified payload, runtime dimensions and native gzip checking when decoding a compressed body, but performs no runtime SHA. An already decoded body follows the same dimension policy; do not describe this as cryptographic runtime verification. Unsupported native gzip decoding, HTTP/decode errors and the 15-second timeout fail preparation with retry. Removal aborts fetch/decompression; retry creates a fresh owner. `loadGeography` diagnostics report source, downloaded/decoded bytes and fetch/decode times. Moving work from JS parsing/Canvas to a binary fetch does not eliminate network latency, shader compilation or all synchronous China geometry work.

## Regression workflow

Run `npm test` for resource/geography timeout, cancellation, retry and disposal; source/builder/payload corruption; original outline/mask round-trip equivalence; skin ordering; sliced replacement ownership; quality budgets and HDR/LDR/direct state restoration. The tests use temporary isolated fixtures and never mutate the shipping geographic files.

Run `npm run build:regression`, serve that output, open `/qa/`, and click **运行完整回归**. The explicit QA entry exercises the public component API on real WebGL: initial sampler readiness, failed optional/explicit skin loads, retry, rapid skin switching, the destination warm-up barrier, Earth→China→Earth, direct-China entry/retry without mounting Earth, required first-frame failure/retry, the shared-source polar option, photo-free land-only startup for both regular hologram patterns, live hologram palette changes, and presentation switching with native map entry/return. Missing-resource cases intentionally produce 404 requests; unhandled exceptions and shader errors are separate failures. Download its structured report and capture actual rendered states. The normal application build does not include this QA entry. Explicit regression builds enable shader diagnostics; normal production uses the no-readback setting.

Also run the strict Three.js project validator, inspect all four palettes and both Earth/map entrances in the actual browser, and retain the original green preset's manifest. Inspect overlay `quality`, `floatTargetsSupported`, `pmremActive`, `reflectionEnabled`, `glassMode`, `glassBloom`, `glassFallbackReason`, `hdrSamples`, `hdrSize`, `buildPhase` and `pendingNavigationKey`. High/balanced, low and forced capability/fbo-failure fixtures must be checked on actual WebGL, including non-null borrowed framebuffers. Node tests, hashes and a successful TypeScript build do not establish visual fidelity, universal GPU compatibility or frame rates.
