// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

/** A resolved color travels with its component; no process-wide override. */
export type FuiThemeColorId=`#${string}`;
export function normalizeFuiPrimaryColor(value:string):FuiThemeColorId{
  let hex=value.trim().replace(/^#/,'');
  if(/^[0-9a-f]{3}$/i.test(hex))hex=hex.split('').map(channel=>channel+channel).join('');
  if(!/^[0-9a-f]{6}$/i.test(hex))throw new Error(`Invalid FUI primary color: ${value}`);
  return `#${hex.toLowerCase()}`;
}
export function isFuiThemeColorId(value:unknown):value is FuiThemeColorId{
  return typeof value==='string'&&/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}
export function isFuiAchromaticColor(value:string):boolean{
  const hex=normalizeFuiPrimaryColor(value);
  return hex.slice(1,3)===hex.slice(3,5)&&hex.slice(3,5)===hex.slice(5,7);
}
