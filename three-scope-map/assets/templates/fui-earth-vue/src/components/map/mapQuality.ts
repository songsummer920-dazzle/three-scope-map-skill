// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
export type MapQuality='auto'|'high'|'balanced'|'low';
export type ResolvedMapQuality=Exclude<MapQuality,'auto'>;
export function resolveMapQuality(value:MapQuality='high',device?:{memory?:number;cores?:number}):ResolvedMapQuality{
  if(value!=='auto')return value;
  if(device?.memory!==undefined&&device.memory<=4)return 'low';
  if((device?.cores!==undefined&&device.cores<=4)||(device?.memory!==undefined&&device.memory<=8))return 'balanced';
  return 'high';
}
export function mapQualityBudget(value:MapQuality='high',device?:{memory?:number;cores?:number}){
  const quality=resolveMapQuality(value,device);
  return {quality,maxPixelRatio:quality==='high'?2.5:quality==='balanced'?1.5:1,
    earthPixelRatio:quality==='high'?1.5:quality==='balanced'?1.25:1,
    reflection:quality!=='low',reflectionMaxSize:quality==='high'?2048:quality==='balanced'?1024:512,
    reflectionPixelRatio:quality==='high'?1.5:1,
    glassPixelRatio:quality==='low'?1:1.5,glassMaxSize:quality==='low'?1024:2048,
    glassSamples:quality==='low'?0:4,glassBloom:quality!=='low'} as const;
}
export function browserMapQualityBudget(value:MapQuality='high'){
  const device=typeof navigator==='undefined'?undefined:navigator as Navigator&{deviceMemory?:number};
  return mapQualityBudget(value,{memory:device?.deviceMemory,cores:device?.hardwareConcurrency});
}
