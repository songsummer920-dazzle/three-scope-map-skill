# Map Scope Switching

Use this reference when the user asks to switch the Three.js map scope, such as "change Zhejiang to all China", "switch to national map", "turn the map into China", "switch to world map", "switch to city/district level", or "use a different country/province/world/city boundary while keeping the same style".

## Scope Types

Support at least these scopes:

```ts
type MapScope = 'world' | 'country' | 'province' | 'city' | 'district';

type MapScopeConfig = {
  scope: MapScope;
  regionName: string;
  geoJsonPath: string;
  subdivisionLevel: 'country' | 'province' | 'city' | 'district' | 'boundary';
  labelLevel: 'country' | 'province' | 'city' | 'district' | 'key-country' | 'key-city';
  textureScope: 'world' | 'country' | 'province' | 'city' | 'district';
  parentCode?: string;
  code?: string;
};
```

## Province Scope

Use when the map shows one province, municipality, autonomous region, or similar subnational unit.

- Main boundary: target province outer contour.
- Internal boundaries: prefecture-level city boundaries when available.
- Labels: prefecture-level city names.
- Hover targets: prefecture/city features.
- Terrain/texture extent: target province plus enough surrounding context if the design shows a dim basemap.
- Camera: tighter framing, stronger visual depth is acceptable.
- Chase light: one segment around the province outer contour.

## City Scope

Use when the map shows one prefecture-level city or equivalent region after drilling into a province.

- Main boundary: target city outer contour.
- Internal boundaries: district/county-level boundaries when available.
- Labels: districts and counties, with density control for compact urban areas.
- Hover targets: district/county features.
- Terrain/texture extent: city-level texture if available; otherwise use the parent province texture with conservative opacity and clear metadata.
- Camera: tighter than province scope; reduce label scale and hover lift to avoid overlap.
- Chase light: one segment around the city outer contour only.

## District Scope

Use when the map shows one district/county as a terminal drilldown.

- Main boundary: target district/county outer contour.
- Internal boundaries: none unless the source provides lower-level township/street features and the user explicitly wants them.
- Labels: one selected label or sparse subregion labels if available.
- Hover targets: terminal boundary or lower-level features only if valid.
- Texture extent: district texture if available; otherwise parent city/province texture with lowered opacity.
- Camera: tight framing with shallow extrusion.
- Chase light: optional; keep subtle because the outline may be small.

## Country Scope: China

Use when the map shows all of China.

- Main boundary: China national outer contour.
- Internal boundaries: province-level boundaries, not city boundaries by default.
- Labels: provinces, autonomous regions, municipalities, and special administrative regions only if density permits. Otherwise label key regions or user-requested points.
- Hover targets: province-level features.
- Terrain/texture extent: China-wide terrain/diffuse/normal/roughness maps, not province-cropped textures.
- Camera: wider framing, less extrusion depth than a province map to avoid bulky side walls.
- Chase light: one segment around the complete China outer contour only.
- Fly lines/scatter: recompute from user data; do not keep province-city fly lines.

## World Scope

Use when the map shows the whole world.

- Main boundary: world land/country outer geography from country-level GeoJSON.
- Internal boundaries: country boundaries by default.
- Labels: countries only when density permits; otherwise key countries, regions, or user-requested points.
- Hover targets: country-level features.
- Terrain/texture extent: world-wide terrain/diffuse/normal/roughness maps, not China/province-cropped textures.
- Camera: widest framing, shallow extrusion, reduced hover lift, and careful label density control.
- Projection: prefer a projection suitable for a flat dashboard map, such as Mercator, Equal Earth, Winkel Tripel, or a project-specific projection. Recompute projection bounds from data.
- Chase light: one segment around the outer visible world land contour only if it reads clearly; for dense multi-continent outlines, consider disabling chase light or limiting it to a highlighted region with user approval.
- Fly lines/scatter: recompute from global data; do not keep China/province points unless they are intentional global points.

## Required Data Swap

When switching scope, replace these together:

1. `geoJson`: world GeoJSON -> China/country GeoJSON -> province GeoJSON -> city GeoJSON -> district GeoJSON, or back to the requested scope.
2. `featureNameKey`: match the chosen GeoJSON properties, such as `name`, `fullname`, or `adcode`.
3. `subdivisionLevel`: country boundaries for world scope, province boundaries for China scope, city boundaries for province scope, district/county boundaries for city scope, terminal boundary for district scope.
4. `labelData`: country/key-country labels for world scope, province/key-city labels for China scope, city labels for province scope, district labels for city scope.
5. `scatterPoints`: coordinates relevant to the new map extent.
6. `flyLines`: source/target points relevant to the new scope.
7. `terrainTextures`: replace or regenerate diffuse, normal, roughness, and height/displacement maps for the new geographic extent.
8. `projectionBounds`: recompute from the new GeoJSON.
9. `cameraPreset`: recompute position, target, zoom, tilt, and map scale.
10. `outerContour`: recompute top outline, bottom outline, glow, and chase-light path.

Before replacing renderer data, run the map data helper:

```bash
python3 <skill>/scripts/resolve_map_data.py --validate src/assets/maps/zhejiang.json --scope province
python3 <skill>/scripts/resolve_map_data.py --region 中国 --scope country --out src/assets/maps/china.json --download
python3 <skill>/scripts/resolve_map_data.py --region 世界 --scope world --out src/assets/maps/world.json --download
python3 <skill>/scripts/resolve_map_data.py --region 江苏省 --scope province --out src/assets/maps/jiangsu.json --download
python3 <skill>/scripts/resolve_map_data.py --adcode 330100 --scope city --out src/assets/maps/china/330100.json --download
python3 <skill>/scripts/resolve_map_data.py --adcode 330106 --scope district --out src/assets/maps/china/330106.json --download
```

Use the report to confirm:

- `scope` matches the user request.
- `featureCount` is plausible for that scope.
- `nameKeys` contains usable region names.
- `bbox` is not empty or wildly outside China.
- `subdivisionHint` matches scope expectations: `world-country`, `country-province`, `province-city`, `city-district`, or `district-boundary`.

## Texture Scope

Do not stretch a province texture over China/world, or a China/world texture over a province, without explicit user approval.

Before wiring Three.js terrain material, run the texture helper:

```bash
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/zhejiang --scope province --check
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/china --scope country --theme '#E8FF4F' --generate-missing
python3 <skill>/scripts/resolve_map_textures.py --dir src/assets/textures/map/world --scope world --theme '#E8FF4F' --generate-missing
```

Use `--check` when real terrain assets already exist. Use `--generate-missing` only as a B-end fallback texture set so development can continue while real SRTM/OpenTopography/USGS/public terrain textures are being prepared.

For country scope:

- Store country textures under `src/assets/textures/map/china/` or `src/assets/textures/map/country/`.
- Keep existing province textures under `src/assets/textures/map/<province>/` when possible.
- Store world textures under `src/assets/textures/map/world/` or `src/assets/textures/map/global/`.
- Use the same material config shape:

```ts
type TerrainMaterialConfig = {
  elevationScale: number;
  normalStrength: number;
  roughness: number;
  textureOpacity: number;
  diffuseMap: string;
  normalMap: string;
  roughnessMap: string;
  displacementMap: string;
};
```

Use lower `elevationScale` for country/world maps than province maps because the visible extent is larger.

Suggested defaults:

```ts
const terrainByScope = {
  province: {
    elevationScale: 0.9,
    normalStrength: 0.7,
    roughness: 0.86,
    textureOpacity: 0.34,
  },
  country: {
    elevationScale: 0.42,
    normalStrength: 0.48,
    roughness: 0.9,
    textureOpacity: 0.28,
  },
  world: {
    elevationScale: 0.18,
    normalStrength: 0.32,
    roughness: 0.92,
    textureOpacity: 0.24,
  },
  city: {
    elevationScale: 0.72,
    normalStrength: 0.6,
    roughness: 0.88,
    textureOpacity: 0.3,
  },
  district: {
    elevationScale: 0.58,
    normalStrength: 0.52,
    roughness: 0.9,
    textureOpacity: 0.26,
  },
};
```

Texture QA:

- All four maps should exist: `terrain-diffuse`, `terrain-height`, `terrain-normal`, `terrain-roughness`.
- Dimensions should match within a texture set.
- Province and country texture directories should be separate.
- Country textures should cover China-wide geography or be marked as procedural fallback.
- World textures should cover global geography or be marked as procedural fallback.
- Generated fallback textures are acceptable for layout/interaction work, but replace them with real terrain assets before final delivery when the user explicitly asks for real terrain data.

## Geometry And Visual Scaling

Use scope-aware visual constants:

```ts
const geometryByScope = {
  province: {
    extrusionDepth: 0.5,
    outerLineWidth: 1.8,
    internalLineWidth: 0.7,
    hoverLift: 0.12,
    labelScale: 0.5,
    activeLabelScale: 0.7,
  },
  country: {
    extrusionDepth: 0.22,
    outerLineWidth: 1.4,
    internalLineWidth: 0.45,
    hoverLift: 0.06,
    labelScale: 0.42,
    activeLabelScale: 0.58,
  },
  world: {
    extrusionDepth: 0.1,
    outerLineWidth: 1.0,
    internalLineWidth: 0.32,
    hoverLift: 0.035,
    labelScale: 0.34,
    activeLabelScale: 0.48,
  },
  city: {
    extrusionDepth: 0.34,
    outerLineWidth: 1.4,
    internalLineWidth: 0.5,
    hoverLift: 0.075,
    labelScale: 0.4,
    activeLabelScale: 0.56,
  },
  district: {
    extrusionDepth: 0.24,
    outerLineWidth: 1.15,
    internalLineWidth: 0.34,
    hoverLift: 0.045,
    labelScale: 0.34,
    activeLabelScale: 0.5,
  },
};
```

Tune these after visual QA; they are starting points, not immutable values.

## Component API Recommendation

Design map components so scope can change without rewriting rendering logic:

```ts
type ThreeScopeMapProps = {
  scope: 'world' | 'country' | 'province' | 'city' | 'district';
  regionName: string;
  geoJson: GeoJSON.FeatureCollection;
  labels: MapLabel[];
  scatterPoints: MapPoint[];
  flyLines?: FlyLine[];
  theme: ProvinceMapTheme;
  terrain: TerrainMaterialConfig;
};
```

Avoid component names or data variable names that hardcode one province if the user expects reuse.

## Validation Checklist

- China scope shows the national outline, not a province outline scaled up.
- World scope shows country-level world geography, not China scaled down or a decorative abstract world.
- China scope internal lines are province boundaries unless the user explicitly asks for city-level detail.
- World scope internal lines are country boundaries unless the user explicitly asks for subdivisions.
- Province scope still uses prefecture/city boundaries.
- City scope uses district/county boundaries.
- District scope is terminal unless lower-level data is intentionally supplied.
- Texture extent matches map extent.
- Labels belong to the current scope.
- Hover highlight lifts the selected feature and side thickness together with no gap.
- Chase light follows only the current scope's outer contour.
- Fly lines and scatter points are meaningful for the current scope.
- Camera initial view frames the full map without clipping side thickness, labels, or HUD base ring.
