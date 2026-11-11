# Three-Dimensional Contour Terrain

Use this reference when the selected renderer is `contour`, or when a hybrid delivery explicitly includes contour beside 3D or 2D. Contour is a peer mode with its own scene and lifecycle. It is not a material effect on the administrative 3D map and not an overlay inside MapLibre.

## Rendering Contract

The authoritative component is `assets/templates/songsummer-earth-vue/src/components/map/ContourMap.vue`. It owns a standalone Three.js WebGL scene:

- `contourMapRenderer.ts` owns the DEM `BufferGeometry`, vertex elevation colors, lighting, edge feather, contour rendering, raycasting, camera, and `OrbitControls`. District uses surface-shader contours; other scopes use `LineSegments`.
- `contourDataAdapter.ts` owns bundle loading, validation, caching, and the visibly disclosed relative-elevation fallback.
- `contourTerrainSource.ts`, `contourTerrain.worker.ts`, and `contourTerrainMath.ts` provide real Terrarium terrain for province/city/district. The worker decodes elevation, resamples and gently smooths it, intersects the actual mesh triangles, and joins the resulting contour paths before publishing a patch.
- `contourMapConfig.ts` owns elevation scale, camera limits, line styles, and the environment.
- `contourMapDiagnostics.ts` owns the browser verification contract.
- `ContourMap.vue` owns UI, loading, navigation, pointer click discrimination, and lifecycle.

The renderer may import Three.js, but it must not reuse or patch `ZhejiangThreeMap.vue`, `mapTerrainMaterial.ts`, `VectorMap.vue`, or MapLibre. Sharing Three.js as a dependency does not make the two 3D scenes the same renderer.

## Pure Elevation Means No Administrative Silhouette

The default visible surface is the complete DEM bbox. Do not clip it to a country, province, city, mine permit, or other administrative polygon. Do not draw administrative borders, names, hover fills, or outlines unless the user explicitly asks for a thematic boundary layer.

Administrative GeoJSON may remain invisible and may be used only to map a raycast longitude/latitude to the next drilldown code. Exclude `*_JD` helper features from hit testing. The user should see terrain, elevation color, and contour lines—not a familiar political outline framing the data.

A rectangular DEM raster must not look like a pasted screenshot. The robust production layout uses two geographic extents in the same projection:

- `bundle.json` contains the focused elevation grid and precomputed contour geometry;
- optional `surface.json` contains a larger real DEM grid, with no duplicated contour geometry, that keeps the entire orbit-camera view inside known elevation coverage.

Render both meshes: the higher-density focused grid remains the primary visible terrain, while `surface.json` sits underneath as a quieter, smoother distance field. Feather the focused mesh into the overscan mesh and fade contour-line vertices before the focused bbox edge with a shader. Feather only the outer edge of `surface.json`, keep that edge beyond the camera's reachable view, and keep the environment and fog visually continuous. Do not invent a CSS/canvas rectangle or choose its dimensions from the viewport. The focused bbox establishes geographic scale; both surfaces are positioned from longitude/latitude using the same midpoint-latitude correction. The finite source coverage remains explicit in diagnostics through separate `contourBbox` and `surfaceBbox` fields.

Never let a low-density overscan grid replace the focused mesh. That shortcut removes the rectangle but also destroys local terrain detail. If raw DEM noise makes a requested level look jagged, use restrained Gaussian preprocessing only for that scope, regenerate its contours from the processed grid, and record the operation in `metadata.processing`. Do not smooth or regenerate the country bundle in response to a district/county request.

## Local Terrain Presentation And Streaming

Province, city, and district use real Terrarium tiles by default, independently of the preprocessed country baseline. `terrainTileUrl` is configurable; the bundled provider is the public Mapzen/Tilezen Terrarium service. Preserve source attribution and metre units. Network failure must show an actionable retry and must never route these three scopes to `demoGrid`. A remote provider is required on first use; this is not an offline national DEM archive and tile zoom must not be advertised as survey accuracy.

The initial local `referenceBbox` is a geographically square frame around the navigation region with 12% context. It fixes the metres-to-world scale, not a permanent display boundary. The focused patch uses a 321×321 grid and a 193×193 surrounding patch covers five times its span. On completed zoom or pan gestures, request a new focus only after the view exceeds the existing detail threshold. Keep the old terrain visible while processing, cancel superseded requests, and preserve camera, reference projection, elevation scale, and color range when replacing a patch. Country never enters this streaming path.

The provider can contain isolated anomalous height pixels. Before interpolation, replace a native pixel only when its deviation from the neighbour median exceeds `max(80 m, 8 MAD)` and at least six neighbours agree. Record this cartographic cleanup in `metadata.processing`, alongside smoothing/resampling; do not clamp all negative heights or apply it to the country data. Validate flat/depressed terrain and triangle-contour alignment with `node scripts/test-contour-terrain.mjs` from the template directory.

Use the local muted elevation palette and neutral multi-direction lighting. Recommended vertical exaggeration is 10× for province, 5× for city, and 2.5× for district; disclose the actual ratio and allow the user to select 1/2/4/8/12×. Contour interval adapts to real relief and view span; minor-line opacity increases as the camera approaches. Flat terrain may legitimately have no contour crossings—do not invent relief.

Keep the coarse local surrounding mesh from writing depth over the focused terrain. Blend focused edge elevations toward the surrounding mesh, use the same color range for both, and fade contour lines before the blend zone. Match contour extraction to the rendered triangle diagonals to avoid floating or buried lines. Administration is only navigation and invisible picking; the region selector is a navigation control, never a boundary layer.

Heavy preprocessing runs only in the dedicated worker after a debounced view change, never in an orbit/pointer event or frame render. Limit fetch concurrency to six, cap source tiles per patch, bound caches, and terminate workers on supersession/unmount. Published offline country bundles retain their existing preprocessing and visuals.

## 3D Camera And Interaction

### District Cartographic Presentation

District terrain uses a dedicated hypsometric palette from teal lowlands through green foothills and ochre uplands to pale rocky peaks. Its reduced ambient light, warm directional key and lower oblique camera make slope direction readable without changing the DEM or exaggeration. Keep this presentation scoped to district; country, province and city retain their own settings. Its contours are analytic intersections of the rendered triangle height field with metric elevation planes in the terrain shader, rather than lifted `LineSegments`. Screen derivatives provide anti-aliasing, and a flat-slope guard avoids coloring an entire constant-height plane as a contour. Every fifth contour is a warm major line by the configured `majorEvery`; intervening contours use dark ink, so emphasis is deterministic rather than randomly assigned.

`contourSurveyOverlay.ts` adds screen-sized major-elevation labels with bounded collision and terrain-occlusion checks, a projected north indicator and a scale measured on the horizontal plane through the camera target. Labels use real contour elevations, stay inside the unblended detail area and do not imply survey-grade accuracy. The legend discloses interval, major interval and vertical exaggeration. Outside the focused detail patch, the existing coarse terrain remains context only; do not invent detailed contours there. Province/city/country retain their existing line geometry and presentation.

Contour mode must open at an oblique perspective that makes relief immediately visible. Use a perspective camera and `OrbitControls` with:

- left-drag/touch rotation and pitch;
- wheel/pinch dolly zoom;
- right-drag/two-finger pan;
- bounded minimum/maximum distance and polar angle;
- a reset-view action returning to the built-in camera and target.

Do not translate 3D administrative-map camera coordinates or MapLibre bearing/pitch into contour state. A hybrid switch preserves only `{ scope, regionName, code }`; each renderer owns its camera.

The terrain is static, so render on resize, data change, camera-control change, switch reveal, and reset. Keep damping disabled unless an animation loop is scoped strictly to the short damping period. Do not leave a continuous idle loop running.

Resolve visual parameters by scope. Keep the country defaults unchanged, then place local-level changes under `scopeStyles.district` or the exact requested level. Use a target vertical-exaggeration ratio for metric district data because one fixed metres-to-world scale cannot suit both a continental bbox and a county bbox.

## DEM Bundle Contract

Production elevation data must carry:

- `crs: EPSG:4326` for the published bundle;
- `elevationUnit: m` only for genuine metric height data;
- bbox, grid width/height, min/max elevation, contour interval, and `majorEvery`;
- source and attribution/license identifiers;
- whether coverage is the complete bbox or an explicitly requested clipped variant;
- preprocessing notes such as clamping, resampling, or void filling.

Never describe a decorative height texture, procedural surface, synthetic demo, or unknown grayscale image as metres. The bundled fallback uses `elevationUnit: relative`, a `demo` flag, and the visible text `相对高程演示 · 非真实海拔`.

The bundle layout is:

```text
public/maps/contours/
  country/100000/bundle.json
  country/100000/surface.json  # optional larger real DEM, no contour array
  province/330000/bundle.json
  city/330100/bundle.json
  district/330106/bundle.json
```

Keep a level small enough to decode and create geometry without blocking. Offline country bundles retain their existing bounded grids. Local streamed patches use the bounded sizes above, join triangle segments into paths in a worker, and batch them into two line draws. Precompute each patch before revealing it; do not run contour extraction in pointer handlers or the render loop.

`surface.json` uses the same truthful source/CRS/unit/bbox metadata plus `grid`, but omits `interval`, `majorEvery`, and `contours`. Generate it with `--surface-only`; it is not a synthetic skirt and must not be rescaled independently of the focused bundle.

## Geometry And Visual Hierarchy

Build one indexed grid mesh from the published elevation samples. Correct longitude/latitude aspect with the cosine of the bbox midpoint latitude, convert elevation with an explicit vertical scale, compute vertex normals, and use restrained vertex colors derived from the map theme.

Outside the district cartographic presentation described above, draw minor and major contours as separate batched `THREE.LineSegments` slightly above the sampled elevation surface. Major contours are brighter; minor contours remain subordinate. Do not use contour paths to draw coastlines or administrative borders.

The zero-metre contour can visually resemble a coastline or political outline at country scale. Keep it at minor-line strength by default unless the user explicitly requests sea-level emphasis.

Use hemispheric plus directional lighting, high roughness, low metalness, a dark ground plane, background fog, and edge feathering. Vertical exaggeration should reveal relief without turning ordinary 30 km DEM cells into needles or vertical columns. Prefer reducing the elevation scale over hiding artifacts with bloom.

Metric terrain must visibly disclose the active vertical-exaggeration ratio and publish it in diagnostics. At country scale, keep the default restrained enough to avoid spike-like relief; use higher local-site exaggeration only when the user needs subtle metre-level variation to remain visible.

## Picking And Drilldown

Raycast the visible terrain mesh. Convert the intersection UV to longitude/latitude using the bundle bbox, then query the invisible administrative polygons to obtain the next `{ scope, regionName, code }`. Distinguish a click from an orbit drag using pointer travel; never trigger drilldown after a camera rotation.

Preserve `world -> country -> province -> city -> district/county` where data exists. A missing real DEM bundle may use the disclosed relative demo only when `allowDemoFallback` is enabled. `requireRealDem` must fail rather than silently downgrade.

## Preprocessing

Metric Terrarium example:

```bash
python3 <skill>/scripts/preprocess_contour_map.py \
  --terrarium-zoom 5 \
  --boundary src/assets/maps/china.json \
  --bbox 73 18 135 54 \
  --scope country \
  --code 100000 \
  --region-name 中国 \
  --interval 500 \
  --major-every 5 \
  --max-grid 256 \
  --clamp-min-elevation -200 \
  --source 'Mapzen Terrain Tiles Terrarium z5 (GMTED2010 land; ETOPO1 ocean)' \
  --attribution 'Mapzen; GMTED2010 terrain data courtesy of the U.S. Geological Survey; ETOPO1 terrain data courtesy of NOAA' \
  --out public/maps/contours/country/100000
```

The boundary argument identifies the navigation region and provides a default bbox. It does not imply clipping. Pass `--clip-to-boundary` only when the user explicitly requests a bounded thematic variant.

Overscan surface example:

```bash
python3 <skill>/scripts/preprocess_contour_map.py \
  --terrarium-zoom 5 --surface-only \
  --boundary src/assets/maps/china.json \
  --bbox 40 -15 170 80 \
  --scope country --code 100000 --region-name 中国 \
  --max-grid 384 --clamp-min-elevation -200 \
  --source 'Mapzen Terrain Tiles Terrarium z5 (GMTED2010 land; ETOPO1 ocean)' \
  --attribution 'Mapzen; GMTED2010 terrain data courtesy of the U.S. Geological Survey; ETOPO1 terrain data courtesy of NOAA' \
  --out public/maps/contours/country/100000
```

## Switching And Earth Entrance

When hybrid includes contour, use explicit peer buttons such as `3D 地图 / 2D 地图 / 等高线地图`. Keep the source renderer visible until the contour scene has loaded data and rendered its first hidden frame, then reveal it behind the existing opaque switch mask.

Do not mount or decode contour terrain during the visible Earth intro. Earth remains the entrance to its paired administrative 3D destination; contour becomes available after the destination is active.

## Diagnostics And QA

`window.__SUMMER_MAP_CONTOUR_DIAGNOSTICS__` must report:

- `renderer: three-contour-terrain`;
- `rotatable: true`;
- source, demo state, elevation unit, bbox coverage, and navigation key;
- positive WebGL canvas dimensions, mesh vertex count, triangle count, contour count, and the disclosed vertical-exaggeration ratio;
- first-frame completion, camera position/target, and runtime errors.

Before delivery:

1. Run `scripts/test_contour_preprocess.py`.
2. Run `scripts/check_contour_map_project.py <project> --strict`.
3. Build the target project.
4. Open the dev-server URL and select `等高线地图`.
5. Confirm the initial oblique relief, rotate/pitch, zoom, pan, reset, click drilldown, and return.
6. Confirm the camera position changes after drag and that clicks do not fire after drag.
7. Confirm no administrative outline or framed screenshot edge is visible.
8. Export diagnostics and run:

```bash
python3 <skill>/scripts/check_contour_map_diagnostics.py /tmp/contour-map-diagnostics.json --require-real-dem --require-bbox-coverage --require-overscan-surface
```
