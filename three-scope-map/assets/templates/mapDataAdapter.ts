import type { GeoFeatureCollection } from '../../types/geo';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

export type MapScope = 'world' | 'country' | 'province' | 'city' | 'district';

export type MapState = {
  scope: MapScope;
  regionName: string;
  code: string;
  geoData: GeoFeatureCollection;
};

export type SeedMapLevel = {
  scope: MapScope;
  regionName: string;
  code: string;
  geoData: GeoFeatureCollection;
};

const geoJsonCache = new Map<string, GeoFeatureCollection>();
const pendingGeoJsonLoads = new Map<string, Promise<GeoFeatureCollection>>();

export function installSeedLevels(levels: SeedMapLevel[]) {
  levels.forEach((level) => {
    geoJsonCache.set(getGeoJsonCacheKey(level.scope, level.code), level.geoData);
  });
}

export function getGeoJsonCacheKey(scope: MapScope, code: string) {
  return `${scope}:${code}`;
}

function datavUrls(adcode: string, scope: MapScope) {
  if (scope === 'district') {
    return [
      `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`,
      `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}.json`,
    ];
  }
  return [`https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`];
}

export function hasCachedMapLevel(scope: MapScope, code: string) {
  const cacheKey = getGeoJsonCacheKey(scope, code);
  return geoJsonCache.has(cacheKey) || pendingGeoJsonLoads.has(cacheKey);
}

export async function loadMapLevel(scope: MapScope, code: string) {
  const cacheKey = getGeoJsonCacheKey(scope, code);
  const cachedGeoJson = geoJsonCache.get(cacheKey);
  if (cachedGeoJson) return cachedGeoJson;
  const pendingLoad = pendingGeoJsonLoads.get(cacheKey);
  if (pendingLoad) return pendingLoad;

  const loadPromise = (async () => {
    let lastError: unknown;
    for (const url of datavUrls(code, scope)) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const geoJson = await response.json() as GeoFeatureCollection;
        geoJsonCache.set(cacheKey, geoJson);
        return geoJson;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('GeoJSON load failed');
  })();

  pendingGeoJsonLoads.set(cacheKey, loadPromise);
  try {
    return await loadPromise;
  } finally {
    pendingGeoJsonLoads.delete(cacheKey);
  }
}

export function prefetchMapLevel(scope: MapScope, code: string) {
  if (hasCachedMapLevel(scope, code)) return;
  void loadMapLevel(scope, code).catch(() => undefined);
}
