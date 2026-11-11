// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import type { MapScope, MapState } from './mapDataAdapter';

export type MapNavigationItem = Pick<MapState, 'scope' | 'regionName' | 'code'>;
export type MapNavigationPath = MapNavigationItem[];

export const initialMapNavigationPath: MapNavigationPath = [{
  scope: 'country',
  regionName: '中国',
  code: '100000',
}];

export const mapScopeLabel: Record<MapScope, string> = {
  world: '全球',
  country: '国家',
  province: '省级',
  city: '市级',
  district: '区县',
};

export function mapNavigationKey(path: readonly MapNavigationItem[]) {
  return path.map((item) => `${item.scope}:${item.code}`).join('/');
}

export function mapStateToNavigationItem(state: MapState): MapNavigationItem {
  return {
    scope: state.scope,
    regionName: state.regionName,
    code: state.code,
  };
}

export function nextMapScope(scope: MapScope): MapScope | undefined {
  const scopeMap: Record<MapScope, MapScope | undefined> = {
    world: 'country',
    country: 'province',
    province: 'city',
    city: 'district',
    district: undefined,
  };
  return scopeMap[scope];
}
