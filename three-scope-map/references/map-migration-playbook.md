# Map Migration Playbook

Use this when the user asks to reuse the current 3D map style for another province, switch to all-China, switch to world map, add drilldown, change the map theme color, or replace terrain textures. Follow the order; do not jump straight into material tweaks before data/scope is correct.

## Preflight

1. Read `regression-guard.md`.
2. Identify requested migration type:
   - province -> province
   - province -> country
   - province/country -> world
   - world -> province/country
   - country -> province
   - drilldown world -> country -> province -> city -> district
   - theme color only
   - texture only
   - combined migration
3. List files likely to change:
   - map GeoJSON/data constants
   - map component
   - terrain material/config
   - texture assets
   - map theme constants
   - label/scatter/fly-line data
4. Do not edit unrelated app modules or static assets unless the user asks for a whole-screen theme/layout change.

## Province To Province

Example: Zhejiang -> Jiangsu.

1. Resolve GeoJSON:

```bash
python3 <skill>/scripts/resolve_map_data.py --region 江苏省 --scope province --out src/assets/maps/jiangsu.json --download
python3 <skill>/scripts/resolve_map_data.py --validate src/assets/maps/jiangsu.json --scope province
```

2. Replace city labels and point data with the target province's prefecture-level cities.
3. Recompute projection bounds from the new GeoJSON.
4. Keep the existing `mapTheme` unless the user also asks for a color change.
5. Use province texture directory, e.g. `src/assets/textures/map/jiangsu/`. If no real textures exist, generate a fallback set:

```bash
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/jiangsu --scope province --theme '#E8FF4F' --generate-missing
```

6. Retune camera, scale, label offsets, and hover raycast targets.
7. Verify all old province labels, fly lines, and scatter points are gone.

## Province To All-China

Example: Zhejiang -> China.

1. Read `map-scope-switching.md`.
2. Resolve China GeoJSON:

```bash
python3 <skill>/scripts/resolve_map_data.py --region 中国 --scope country --out src/assets/maps/china.json --download
python3 <skill>/scripts/resolve_map_data.py --validate src/assets/maps/china.json --scope country
```

3. Change scope config:

```ts
scope: 'country'
regionName: '中国'
subdivisionLevel: 'province'
labelLevel: 'province' // or key-city if dense
textureScope: 'country'
```

4. Replace city labels with province/key-region labels.
5. Replace city hover targets with province-level feature hover targets.
6. Remove province-specific fly lines and scatter points unless they are still meaningful.
7. Use China texture directory:

```bash
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/china --scope country --theme '#E8FF4F' --generate-missing
```

8. Reduce extrusion depth, hover lift, and internal boundary width using `map-scope-switching.md` starting values.
9. Recompute outer contour and chase-light path for the full China outline only.
10. Retune camera to frame the whole national boundary without clipping side thickness or labels.

## Province Or China To World

Example: China -> World.

1. Read `map-scope-switching.md`.
2. Resolve world GeoJSON:

```bash
python3 <skill>/scripts/resolve_map_data.py --region 世界 --scope world --out src/assets/maps/world.json --download
python3 <skill>/scripts/resolve_map_data.py --validate src/assets/maps/world.json --scope world
```

3. Change scope config:

```ts
scope: 'world'
regionName: '世界'
subdivisionLevel: 'country'
labelLevel: 'key-country' // or country if density permits
textureScope: 'world'
```

4. Replace province/city labels with country or key-country labels.
5. Replace hover targets with country-level features.
6. Remove old China/province scatter points and fly lines unless they are intentional global points.
7. Use world texture directory:

```bash
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/world --scope world --theme '#E8FF4F' --generate-missing
```

8. Reduce extrusion depth, hover lift, internal boundary width, and label scale using `map-scope-switching.md` world starting values.
9. Choose a projection suitable for the dashboard design and recompute projection bounds.
10. Retune camera to frame the entire world map without clipping side thickness or labels.
11. Reconsider chase light: use only if a single outer land-contour segment reads clearly; otherwise disable or ask whether to highlight a region.

## World To China Or Province

1. Resolve target China/province GeoJSON with the correct `--scope`.
2. Change subdivision level from country to province or city/prefecture.
3. Replace world labels with province/key-city or city labels.
4. Replace global scatter/fly-line data with target-scope data.
5. Switch terrain textures from `world/` to `china/` or target province directory.
6. Increase extrusion depth and hover lift to the target scope defaults.
7. Recompute outer contour and chase-light path for the target scope only.

## All-China To Province

1. Resolve target province GeoJSON with `--scope province`.
2. Change subdivision level back to city/prefecture.
3. Replace province labels with city labels.
4. Replace national scatter/fly-line data with province-specific data.
5. Switch terrain textures from `china/` to the target province directory.
6. Increase extrusion depth and hover lift back to province defaults.
7. Recompute province outer contour and chase-light path.

## Add Drilldown

1. Read `map-drilldown.md`.
2. Add explicit scope state:

```ts
type MapScope = 'world' | 'country' | 'province' | 'city' | 'district';
```

3. Add a breadcrumb/back stack storing the previous `scope`, region name, GeoJSON path, labels, scatter points, fly lines, terrain scope, and camera preset.
4. Resolve next-level GeoJSON with codes from clicked features:

```bash
python3 <skill>/scripts/resolve_map_data.py --adcode 100000 --scope country --out src/assets/maps/china.json --download
python3 <skill>/scripts/resolve_map_data.py --adcode 330000 --scope province --out src/assets/maps/china/330000.json --download
python3 <skill>/scripts/resolve_map_data.py --adcode 330100 --scope city --out src/assets/maps/china/330100.json --download
```

5. Implement `resolveDrillTarget(feature, currentScope)` so hover remains preview-only and click triggers navigation.
6. On every drilldown, rebuild map geometry, outer contour, bottom contour, chase-light path, labels, scatter points, fly lines, and camera together.
7. Treat district/county as terminal unless a verified lower-level GeoJSON exists.
8. Validate that old parent-scope labels, scatter points, fly lines, and chase lights are fully removed after each click.

## Theme Color Only

1. Apply the main color to the shared Earth/3D map theme entry:

```bash
python3 <skill>/scripts/apply_map_theme.py '#2AF7FF' <target-project> --no-backup
```

For older local projects that still use an SVG label pointer, recolor only the label pointer:

```bash
python3 <skill>/scripts/recolor_label_asset.py '#2AF7FF' src/assets/figma/map-label-bg.svg
```

2. Confirm Earth (`earthViewCore.ts`) and the destination map renderer (`scopeMapCore.ts`) both import the bundled `mapTheme.ts`; do not add per-component theme constants.

3. Search for hardcoded old colors in map files:

```bash
rg '#E8FF4F|#D4F56A|232,255,79|212,245,106' src/components/map src/assets
```

5. Replace only map-related hardcoded colors. Do not change unrelated app modules or static assets unless requested.
6. Verify dark top surface, side gradient, labels, scatter/ripple, fly lines, HUD ring, and chase light.

## Texture Only

1. Determine texture scope: world, country, province, city, or district.
2. Validate existing textures:

```bash
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/<scope-name> --scope province --check
```

3. Generate fallback only when real textures are missing:

```bash
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/<scope-name> --scope province --theme '#E8FF4F' --generate-missing
```

4. Update terrain material paths/config only.
5. Do not edit labels, scatter points, fly lines, or GeoJSON.
6. Run visual QA to confirm top surface is dark and texture does not wash out outlines.

## Combined Migration

Use this order:

1. Scope and GeoJSON.
2. Labels, scatter points, and fly lines.
3. Projection, scale, and camera.
4. Texture scope and terrain material.
5. Theme color.
6. Hover, ripple, chase light, and fly-line effects.
7. Build and visual QA.

## Final QA

Read `visual-qa.md` and capture:

- full initial state
- map initial state
- map hover state
- chase-light/fly-line state if changed
- chart/panel unaffected state if the task was map-only

Then report:

- files changed
- map scope
- GeoJSON feature count and subdivision hint
- texture directory and texture sizes
- theme color if changed
- any intentional differences from the previous map
