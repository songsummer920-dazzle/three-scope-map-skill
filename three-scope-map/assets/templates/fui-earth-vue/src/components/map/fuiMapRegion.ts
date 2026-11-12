// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import type {GeoFeature,GeoFeatureCollection,Position} from '../../types/geo';
import {FUI_MAP_CAP_CENTER,type FuiMapCapCenter} from './fuiMapCapOptics';
export type FuiMapRegionContext={scope?:string;code?:string};
const wrap=(longitude:number)=>((longitude+180)%360+360)%360-180;
export function isFuiChinaCountry(data:GeoFeatureCollection,context:FuiMapRegionContext={}){
  if(context.scope!==undefined||context.code!==undefined)return context.scope==='country'&&String(context.code)==='100000';
  // Low-level factories have no navigation path. Recognize the bundled
  // province collection, never infer China from one provincial/city feature.
  const keys=new Set(data.features.map(feature=>String(feature.properties.adcode??feature.properties.code??'')));
  return keys.has('110000')&&keys.has('460000')&&keys.has('650000');
}
/** Stable administrative identity, with the legacy Chinese label as fallback. */
export function isFuiHainanFeature(feature:GeoFeature){
  const p=feature.properties,code=String(p.adcode??p.code??p.id??'');
  return code==='460000'||[p.fullname,p.name].some(name=>name==='海南省'||name==='海南');
}
export function resolveFuiHainanOwner(data:GeoFeatureCollection){
  const feature=data.features.find(isFuiHainanFeature);if(!feature)return undefined;
  const p=feature.properties;
  const name=String(p.fullname??p.name??p.ADMIN??p.NAME??p.name_en??p.adcode??p.code??'海南省');
  return{feature,name};
}
/** Geographic shading frame only; source coordinates/holes are not rewritten. */
export function resolveFuiMapOpticalRegion(data:GeoFeatureCollection,context:FuiMapRegionContext={}){
  if(isFuiChinaCountry(data,context))return{center:{...FUI_MAP_CAP_CENTER},angularScale:1,world:false};
  const longitudes:number[]=[];let south=Infinity,north=-Infinity;
  for(const feature of data.features){
    const code=String(feature.properties.adcode??feature.properties.code??'');if(code.includes('_JD')||feature.properties.adchar==='JD')continue;
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates as Position[][]]:feature.geometry.coordinates as Position[][][];
    for(const polygon of polygons)for(const point of polygon[0]??[]){
      if(!Number.isFinite(point[0])||!Number.isFinite(point[1]))continue;
      longitudes.push(((point[0]%360)+360)%360);south=Math.min(south,point[1]);north=Math.max(north,point[1]);
    }
  }
  if(!longitudes.length)return{center:{longitude:0,latitude:0},angularScale:1,world:context.scope==='world'};
  longitudes.sort((a,b)=>a-b);let gap=-1,start=longitudes[0];
  for(let index=0;index<longitudes.length;index++){
    const a=longitudes[index],b=index+1<longitudes.length?longitudes[index+1]:longitudes[0]+360;
    if(b-a>gap){gap=b-a;start=b%360;}
  }
  const span=Math.max(0,360-gap),world=context.scope==='world'||span>=300;
  const center:FuiMapCapCenter=world?{longitude:0,latitude:0}:{longitude:wrap(start+span/2),latitude:Math.max(-85,Math.min(85,(south+north)/2))};
  // A planar world map cannot use a full spherical hemisphere as its optical
  // normal. Compress only large-area shading angles, without touching XY.
  return{center,angularScale:Math.min(1,60/(world?360:Math.max(span,north-south,1))),world};
}
export function wrapFuiOpticalLongitude(longitude:number,near:number){return longitude+360*Math.round((near-longitude)/360);}
