# Earth View Entrance

Use this reference when the user asks for a 3D globe that enters the existing China map.

## Architecture

- `EarthView.vue` owns only the globe renderer, Earth shaders, spherical China highlight, hover/click raycasting, and camera flight.
- `ChinaMap.vue` is a thin adapter around the existing country-scope map component. Do not duplicate or rewrite the China renderer.
- `EarthChinaMap.vue` owns the `earth | china` mode state. Mount the China component only after the Earth transition completes so two heavy WebGL scenes do not run together.
- Earth View is an entrance mode, not another drilldown scope. Existing `country -> province -> city -> district` behavior remains unchanged after entry.

## Required Visuals

- Pure Three.js `SphereGeometry`; do not use Cesium or Globe.gl.
- Shader-driven dark translucent Earth surface with blue-green HUD grid lines.
- Atmospheric Fresnel glow on a slightly larger back-face sphere.
- Animated surface scan band and slow rotation.
- Subtle procedural star field and dark space background.
- China GeoJSON converted to a separate spherical mesh at a slightly larger radius than Earth.
- China fill breathes continuously; hover strengthens fill and outline without changing geometry.

## GeoJSON On A Sphere

1. Reuse the bundled China GeoJSON.
2. Convert each Polygon/MultiPolygon ring into a `THREE.ShapeGeometry` in longitude/latitude space.
3. Remap every generated vertex to the sphere with a lon/lat-to-vector transform.
4. Merge polygon geometries into one independent China mesh for raycasting.
5. Draw province/outer rings as `THREE.LineLoop` geometry slightly above the fill radius to avoid z-fighting.

## Transition Contract

- Clicking outside China does nothing.
- Hover China sets a pointer cursor and increases the China shader intensity.
- Clicking China disables controls and auto-rotation.
- Use a 2-3 second GSAP timeline to move the camera along the China surface direction, enlarge the globe, move the camera target toward China, and fade Earth materials near the end.
- Emit `enter-china` only after the Earth transition finishes.
- The controller then unmounts Earth View and mounts the existing China map with a short fade/scale entrance.
- Do not rebuild China geometry inside Earth View and do not keep both render loops alive after the transition.

## Validation

- Earth is a real Three.js sphere and remains visible without image textures.
- China is a separate mesh generated from real GeoJSON and is clickable only at its true spherical location.
- Hover and breathing effects remain coherent while the globe rotates.
- Camera movement feels spatially continuous and lasts 2-3 seconds.
- The destination is the existing China map implementation, not a second China map.
- Existing China drilldown, labels, fly lines, hover lift, chase light, and camera controls still work after entry.
- ResizeObserver keeps the Earth renderer matched to its parent container.
- All Three.js resources, GSAP timelines, event listeners, controls, and animation frames are disposed on unmount.
