# Map Drilldown

Use this when the user wants hierarchical map navigation, such as clicking China on a world map, clicking a province on a China map, clicking a city on a province map, or clicking a district/county on a city map.

## Drilldown Levels

```ts
type MapScope = 'world' | 'country' | 'province' | 'city' | 'district';

type DrillTarget = {
  scope: MapScope;
  regionName: string;
  code: string;
  parentCode?: string;
  geoJsonPath: string;
  textureScope: MapScope | 'global';
};

type DrillStackItem = DrillTarget & {
  cameraPreset?: string;
};
```

| Current scope | Click target | Next scope | Typical data |
| --- | --- | --- | --- |
| `world` | China/country | `country` | national subdivisions, e.g. China provinces |
| `country` | province | `province` | prefecture/city subdivisions |
| `province` | city | `city` | district/county subdivisions |
| `city` | district/county | `district` | terminal district boundary or lower-level source if available |
| `district` | boundary | `district` | terminal; show selected state, do not recurse unless data is explicitly available |

## Data Resolution

Prefer direct codes for Chinese administrative drilldown. Do not infer the next level from display names alone when an `adcode`, `code`, or `id` exists on the clicked feature.

```bash
# World countries
python3 <skill>/scripts/resolve_map_data.py --region 世界 --scope world --out src/assets/maps/world.json --download

# China provinces
python3 <skill>/scripts/resolve_map_data.py --adcode 100000 --scope country --out src/assets/maps/china.json --download

# Zhejiang cities
python3 <skill>/scripts/resolve_map_data.py --adcode 330000 --scope province --out src/assets/maps/china/330000.json --download

# Hangzhou districts/counties
python3 <skill>/scripts/resolve_map_data.py --adcode 330100 --scope city --out src/assets/maps/china/330100.json --download

# Xihu district terminal boundary, if the source exposes it
python3 <skill>/scripts/resolve_map_data.py --adcode 330106 --scope district --out src/assets/maps/china/330106.json --download
```

Use the script report:

- `subdivisionHint` should move in order: `world-country`, `country-province`, `province-city`, `city-district`, `district-boundary`.
- `sampleCodes` should expose the next click keys when possible.
- `bbox` must match the requested region and projection.
- If the source fails for district-level data, keep the clicked district highlighted and treat it as terminal.

## Runtime Behavior

- Keep hover and click separate: hover previews a feature; click triggers drilldown only if a next target is available.
- On click, load the next GeoJSON, then rebuild map geometry, labels, scatter points, fly lines, outer contour, chase-light path, and camera in one transaction.
- Push the previous map state into a breadcrumb/back stack before swapping.
- Back navigation pops the stack and restores the previous scope, data, camera, labels, points, and effects.
- Clear stale labels, scatter points, fly lines, ripples, and hover state before rendering the next level.
- Disable or debounce clicks while the next GeoJSON is loading.

## Target Resolver

Use a resolver layer instead of hardcoding one province:

```ts
function getFeatureCode(feature: GeoJSON.Feature): string | undefined {
  const props = feature.properties ?? {};
  return String(props.adcode ?? props.code ?? props.id ?? props.ISO_A3 ?? '');
}

function getNextScope(scope: MapScope): MapScope | undefined {
  return {
    world: 'country',
    country: 'province',
    province: 'city',
    city: 'district',
  }[scope] as MapScope | undefined;
}

function resolveDrillTarget(currentScope: MapScope, feature: GeoJSON.Feature): DrillTarget | undefined {
  const code = getFeatureCode(feature);
  const nextScope = getNextScope(currentScope);
  if (!code || !nextScope) return undefined;

  const name = String(feature.properties?.fullname ?? feature.properties?.name ?? feature.properties?.ADMIN ?? code);
  if (currentScope === 'world' && !['CHN', 'CN', 'China', '中国'].includes(code) && name !== 'China' && name !== '中国') {
    return undefined; // Add country-specific registries before enabling non-China drilldown.
  }

  return {
    scope: nextScope,
    regionName: name,
    code: currentScope === 'world' ? '100000' : code,
    geoJsonPath: currentScope === 'world' ? '/src/assets/maps/china.json' : `/src/assets/maps/china/${code}.json`,
    textureScope: nextScope,
  };
}
```

For world maps, maintain a manual registry for countries whose national subdivision datasets are available. Do not pretend every country can be downloaded from the China administrative source.

## Visual Continuity

- Keep theme color derived from the same map theme unless the user asks for a scope-specific color.
- Retune extrusion depth by scope: deeper for province/city, shallower for country/world.
- Labels should scale down at higher levels and grow only for active/hovered targets.
- Chase light follows only the current scope's outer contour, never stale parent contours.
- Scatter/fly-line datasets must be regenerated for the current scope.
- Texture scope should follow the displayed area: world textures for `world`, China textures for `country`, region textures for `province/city/district` when available.

## QA Checklist

- Click China on world enters China-level map.
- Click a province on China enters that province with city boundaries.
- Click a city on a province enters district/county boundaries.
- Click a district/county either enters a valid terminal boundary or stays selected without breaking.
- Back returns the exact previous scope and camera.
- Hover highlight lifts top and side geometry together without a gap after every drilldown.
- No labels, fly lines, scatter points, or chase lights from the previous scope remain.
