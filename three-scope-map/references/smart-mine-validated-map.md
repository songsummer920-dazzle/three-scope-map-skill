# Smart Mine Validated Map Preset

Use this reference when recreating or migrating the validated smart-mine 3D Zhejiang map style from this project. It captures the map-specific fixes and decisions from the iterative restoration work.

## Style Identity

- Main map color: `#E8FF4F`.
- Outer contour color: `#D4F56A`.
- Top surface: dark black-green, not bright green. Keep terrain visible but restrained.
- Side thickness: vertical green gradient using the main color at the top and a very dark green/black at the bottom.
- Internal prefecture/city boundaries: thin, subdued green lines.
- Outer top and bottom contours: slightly stronger than internal boundaries and aligned with the side thickness start/end.
- Keep the map as real Three.js geometry. Do not replace it with a screenshot or static image.

## Geometry Layers

Build layers in this order:

1. Dark base/top fill for each feature.
2. Terrain-textured top mesh.
3. Internal boundary lines on the top start plane.
4. Province/country/city outer side wall only.
5. Top outer contour at side-wall start height.
6. Bottom outer contour at side-wall end height.
7. Hover/highlight mesh.
8. Fly lines, scatter points, labels, and chase light.
9. Perspective HUD ring behind the map.

Rules:

- Internal city/prefecture boundaries should not create independent side thickness.
- Hover lift must move the top surface and side thickness together. There must be no gap between lifted surface and side wall.
- Top surface can have controlled transparency, but only enough for the outer side gradient to read through. Do not make internal block side thickness transparent.
- Remove side-wall vertical seam artifacts and random glowing fragments. These usually come from duplicate rings, unfiltered tiny polygons, or accidental marker/ripple layers.

## Terrain And Texture

Use a material helper with:

```ts
type TerrainMaterialConfig = {
  elevationScale: number;
  normalStrength: number;
  roughness: number;
  textureOpacity: number;
};
```

Current validated behavior:

- Use `diffuseMap`, `normalMap`, `roughnessMap`, and `displacementMap` where available.
- Clamp texture UVs to the map bounds.
- Use `alphaTest` or clipping so texture does not bleed outside the GeoJSON boundary.
- For China/country scope, reduce terrain intensity compared with province scope.
- Do not expose a visible `bg-map-texture.png` layer behind the map if it conflicts with the 3D terrain. The 3D map should own the visible surface texture.

## Labels And Scatter Points

Use the exported label-background image/SVG when available.

Validated label rules:

- Default label frame: image at `0.5x`, text `10px`.
- Hover/selected label frame: image at `0.7x`, text `14px`.
- Text must stay inside the label frame.
- The label anchor/arrow tip should align with the city coordinate.
- Only intentional data points should render.
- If the user requests a single ripple, only that point should ripple.

Validated ripple source rules:

- Country scope: ripple follows 北京市, matching the China-level fly-line source.
- Province scope: ripple follows the province capital, so Zhejiang defaults to 杭州市.
- City scope: ripple follows the same stable random district/county source used by fly lines.
- District scope: no default ripple unless the user provides explicit point data.
- Align the ripple center to the bottom arrow/point under the source label, not to the label center.
- Do not leave inactive green dots at other city coordinates.
- If stray dots appear, disable scatter/ripple/label anchor layers separately to find the real source before deleting the wrong layer.

## Hover And Drilldown

Hover rules:

- No feature should be highlighted by default.
- Hovered block uses one consistent highlight style across every region.
- Hover lift moves surface and side gradient together.
- Hover reset must cleanly restore label scale, highlight opacity, and side material opacity.

Click/downlevel rules:

- Keep hover and click separate.
- On hover, prefetch the next level only.
- On click, load and render the next level.
- Disable or ignore repeated clicks during one drill transition.
- Keep a stack of full map state for back navigation.

## User-Saved Camera Angle

For user-friendly angle adjustment, save the OrbitControls camera view instead of asking users to edit raw radians.

Recommended preset shape:

```ts
type CameraViewPreset = {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
};
```

Validated default from this project:

```ts
const cameraViewConfig = {
  default: {
    fov: 31,
    position: [72, -760, 500],
    target: [-18, -42, 8],
  },
  byScope: {
    country: undefined,
    province: undefined,
    city: undefined,
    district: undefined,
  },
};
```

Resolution order:

```ts
const view =
  savedUserView.byScope?.[currentScope]
  ?? savedUserView.default
  ?? cameraViewConfig.byScope?.[currentScope]
  ?? cameraViewConfig.default;
```

Rules:

- Let users rotate/zoom the map with `OrbitControls`.
- Use one unified default view by default; add per-scope overrides only when a specific level needs a different angle.
- Add `保存统一` and `保存本层` buttons outside the WebGL canvas interaction path.
- Add matching `恢复本层` and `恢复全部` actions.
- On save, persist `camera.fov`, `camera.position`, and `controls.target`.
- On page setup, apply the saved camera view after creating `OrbitControls`.
- On scope changes, resolve the current view from the order above and apply it.
- On reset, remove only the camera-view storage key or current scope override; do not clear drilldown data, theme, or user business data.
- Store by a stable key, such as `three-scope-map:<project-or-map-id>:camera-view:v1`.
- If the saved payload is invalid, fall back to the curated default.
- Do not save transient map hover state, drill stack, highlighted feature, fly-line animation time, or label scale.

## Fly Lines

Default drilldown fly-line source rules:

- Country scope: 北京 -> provinces.
- Province scope: province capital -> cities.
- City scope: a stable configurable district/county -> other districts/counties.
- District scope: no default fly lines unless the user provides data.

Fly-line rules:

- Use named coordinates from the current map level.
- Clear old fly lines when changing scope.
- Keep fly lines above the map surface and below labels when labels must stay readable.

## Chase Light

Validated chase-light rules:

- One line segment globally, not multiple segments.
- White head with transparent tail.
- Runs on the complete current outer contour, from a point back to the same point in a loop.
- Do not apply chase light to internal city/prefecture boundaries.
- Smooth the path before rendering; avoid pixelated turns and noisy multi-line artifacts.
- Keep the line narrow enough to avoid white flooding. In this project the final requested width was about `0.6x` of the earlier wide version.

If the light appears to jump around:

- Verify the path is the assembled outer loop, not all boundary edges.
- Verify only one chase-light mesh/material is active.
- Verify internal boundary loops are not included.

## HUD Ring Base

- The base ring is a front-facing HUD style decoration transformed into the same perspective as the map.
- Place it behind/under the map and keep it centered to the map group.
- It must not cover the map body.
- Remove unrelated bottom glow images or static map-background textures that visually compete with the Three.js map.

## Performance Pattern

Use the project-validated pattern:

- Data adapter owns initial data, cache, request de-duplication, and hover prefetch.
- Click waits one animation frame before heavy work.
- Build large maps across multiple animation frames.
- Keep the old map visible while the next map is built.
- Swap only after the next map is complete.
- Dispose old geometries and materials after swapping.
- Use a build-version token so an older async build cannot overwrite a newer map state.

This reduces click jank but does not guarantee zero stutter on low-end devices. For public skill reuse, pair it with GeoJSON preprocessing and optional LOD.

## Common Bugs From This Project

- Stray green dot: usually an inactive scatter/ripple/label-anchor visual still being rendered. Remove the unintended object, not the intended source ripple.
- Hover gap: top geometry lifted but side-wall gradient stayed at base height. Animate both together.
- Texture bleed: terrain/canvas texture not clipped or alpha-tested to GeoJSON boundaries.
- Jagged chase light: path assembled from unsorted edges or too few samples.
- Internal chase light: using all boundary loops instead of the outer province/country loop.
- Scope leakage: labels/fly lines/scatter points from the previous level were not cleared.
