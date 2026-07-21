# Three.js Province Map Style

Use this reference when implementing the center province map or migrating the Zhejiang style to another province. If the user asks to switch to all-China or world scope, also read `map-scope-switching.md`.

## Data Inputs

Required:

- Province GeoJSON with prefecture/city features.
- City label list from the target province.
- City point coordinates in `[lng, lat]`.
- Optional surrounding basemap texture or dark regional map background.

Do not use unrelated provinces, full China data, or abstract hand-drawn outlines.

For all-China maps, use `map-scope-switching.md`; do not force country data through province-only assumptions.

## Migration Steps For Another Province

1. Replace `src/assets/maps/<province>.json`.
2. Replace city labels and point coordinates in dashboard data.
3. Recompute projection bounds from the new GeoJSON instead of hardcoding Zhejiang extents.
4. Keep material, lighting, label, hover, chase-light, ripple, and fly-line style constants.
5. Re-tune only:
   - map scale
   - camera position
   - initial rotation
   - label offsets for crowded cities
6. Verify all labels belong to the new province.

For province-to-country or country-to-province changes, switch the whole map scope package together: GeoJSON, subdivision level, texture extent, labels, camera, hover targets, scatter points, fly lines, and chase-light contour.

## Visual Style Constants

Use the bundled shared theme instead of declaring local colors:

```ts
import { mapTheme, mapThemeStyle } from './mapTheme';
```

`MAP_THEME_PRIMARY` in `mapTheme.ts` is the only editable color entry. Do not create a second theme object inside a component.

## Terrain Texture Binding

For province, city, and district maps, apply terrain textures through the actual region `ShapeGeometry` material. Do not place an extra transparent `PlaneGeometry(mapWidth, mapHeight)` texture mesh over the whole projected map. That full rectangle is split into triangles by WebGL and can flash white/gray triangular artifacts during drilldown, camera movement, or transparent-depth sorting.

## Chase Light Geometry

Render the outer-contour chase light with short animated `THREE.Line` segments sampled along the province/city outer loop. Do not use a transparent filled ribbon mesh, indexed triangle strip, or wide alpha shader mesh for the chase light. Filled chase geometry can self-intersect or sort incorrectly and produce large white triangular flashes.

## Theme Color Switching

When the user provides a main color, apply it to the shared theme entry so Earth and every flat 3D map layer change together.

Example:

```bash
python3 <skill>/scripts/apply_map_theme.py '#2AF7FF' <target-project> --no-backup
```

The generated theme should feed these layers:

- `primary`: main glow color, side-gradient top, active scatter, fly-line accent.
- `outline`: province outer top/bottom outline and thicker edge glow.
- `internalLine`: city/prefecture boundary lines with reduced alpha.
- `topFill`: dark tinted surface; keep it dark even for bright main colors.
- `sideTop` / `sideMid` / `sideBottom`: vertical side thickness gradient.
- `labelBorder`, `labelGlow`, `labelText`: label frame and text glow.
- `ripple`, `flyLine`, `hudRing`, `chaseLight`: secondary effects.

Color derivation rules:

1. Normalize the input to a valid six-digit hex.
2. Keep hue close to the input color.
3. Raise saturation slightly for outlines and glow.
4. Keep top fill very dark with only a small hue tint.
5. Use alpha for depth instead of making the map uniformly bright.
6. Keep chase light white unless the user explicitly asks for colored chase light.
7. Preserve readable label text by mixing the main color with near-white.

The bundled `mapTheme.ts` already supplies the required role groups:

```ts
type ProvinceMapTheme = {
  primary: string;
  outline: string;
  internalLine: string;
  topFill: string;
  topOpacity: number;
  sideTop: string;
  sideMid: string;
  sideBottom: string;
  labelText: string;
  labelBorder: string;
  labelGlow: string;
  labelPointer: string;
  scatter: string;
  ripple: string;
  flyLine: string;
  hudRing: string;
  chaseLightHead: string;
  chaseLightTail: string;
};
```

When applying a new theme:

- Change only `MAP_THEME_PRIMARY` through `apply_map_theme.py`; do not manually replace individual shader/CSS/material colors.
- Confirm canvas-generated textures, sprite materials, line materials, shader uniforms, CSS custom properties, and CSS label colors still consume `mapTheme` roles.
- Keep the CSS label pointer triangle and glow on the shared accent roles.
- Keep unrelated panel colors unchanged unless the user asks for the whole dashboard theme to change.
- After applying, verify top surface remains dark, outer thickness still has visible gradient, internal boundaries remain thin, and labels stay readable.

## Geometry Rules

- Build real 3D geometry from GeoJSON polygons.
- Top surface should be dark and slightly transparent only where the outer side gradient should read through.
- Internal district/city boundaries should not show independent side thickness.
- Outer province side thickness uses a vertical green gradient.
- Top outer outline and bottom outer outline should align with thickness start and end.
- Internal boundary stroke is thinner than province outer outline.
- Avoid vertical stray lines and interior glowing dots unless they are intentional data marks.

## Terrain Texture

Use a configurable material helper, not inline magic numbers:

```ts
type TerrainMaterialConfig = {
  elevationScale: number;
  normalStrength: number;
  roughness: number;
  textureOpacity: number;
};
```

Use `diffuseMap`, `normalMap`, `roughnessMap`, and `displacementMap` where supported. Keep the final style low-saturation and B-end: dark, clean, restrained, with terrain detail visible but not noisy.

## Camera And Interaction

- Initial view should match the Figma/reference angle before enabling free mouse control.
- Enable pointer controls if requested, but start from the approved camera pose.
- Hovering a city/prefecture should:
  - highlight only the hovered block
  - lift top and side geometry together, with no gap between surface and thickness
  - use a uniform highlight material for every block
  - reset cleanly when leaving

## Labels And Scatter Points

- Use exported Figma label background when available.
- Default labels: 0.5 scale, 10px text.
- Hovered/selected labels: 0.7 scale unless the user gives another size, 14px text.
- Keep text inside the label frame.
- Only intentional points should have ripple effects. By default, country scope uses 北京市, province scope uses the province capital as the ripple/fly-line source, and city scope uses the same stable random district/county source as fly lines. If one region gets a ripple, verify no stray inactive point remains elsewhere.

## Effects

- HUD base ring: place behind the map, match map perspective, do not cover the map.
- Fly lines: use named source/target city coordinates and keep them above the map but below labels if labels must remain readable.
- Chase light:
  - one segment only
  - white head, transparent tail
  - runs along the complete outer province contour
  - no internal city-boundary chase light
  - segment should be smooth and narrow enough to avoid white flooding

## Debugging Visual Artifacts

If stray dots or lines appear:

1. Search for all city point, ripple, marker, and sprite creation paths.
2. Confirm inactive markers are not rendered with opacity.
3. Confirm label anchor, point sprite, and ripple use separate coordinates.
4. Temporarily disable layers in this order: ripple, scatter points, labels, internal lines, chase light, terrain texture.
5. Remove the offending object, then restore only the intended layer.

If outlines look jagged:

- Increase sampled path points or use curve interpolation for the effect path.
- Avoid drawing multiple partially overlapping outlines with different z offsets.
- Keep outer top and bottom outline separate from internal boundaries.
