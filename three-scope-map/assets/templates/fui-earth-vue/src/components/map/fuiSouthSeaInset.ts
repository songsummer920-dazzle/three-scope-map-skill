// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import type {GeoFeature,GeoFeatureCollection,Position} from '../../types/geo';
import {isFuiChinaCountry,type FuiMapRegionContext} from './fuiMapRegion';

// Fixed geographic viewport shared by land, islands and the original JD rods.
// Never fit or redistribute the individual maritime segments independently.
export const SOUTH_SEA_VIEWPORT=[105,2.5,124,24.8] as const;
const mercator=(latitude:number)=>Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360))*180/Math.PI;
const [west,south,east,north]=SOUTH_SEA_VIEWPORT;
const scale=Math.min(82/(east-west),108/(mercator(north)-mercator(south)));
const offsetX=5+(82-(east-west)*scale)/2;
const offsetY=5+(108-(mercator(north)-mercator(south))*scale)/2;
const project=([lon,lat]:Position):Position=>[offsetX+(lon-west)*scale,offsetY+(mercator(north)-mercator(lat))*scale];
const polygons=(feature:GeoFeature)=>feature.geometry.type==='Polygon'
  ? [feature.geometry.coordinates as Position[][]]
  : feature.geometry.coordinates as Position[][][];
const path=(rings:Position[][])=>rings.map(ring=>ring.map((point,i)=>{
  const [x,y]=project(point);return `${i?'L':'M'}${x.toFixed(3)} ${y.toFixed(3)}`;
}).join(' ')+' Z').join(' ');
function inViewport(ring:Position[]){
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
  return Math.max(...xs)>=west&&Math.min(...xs)<=east&&Math.max(...ys)>=south&&Math.min(...ys)<=north;
}
function ringArea(ring:Position[]){
  let sum=0;for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];sum+=a[0]*b[1]-b[0]*a[1];
  }return Math.abs(sum)/2;
}
export function createSouthSeaInset(china:GeoFeatureCollection,context:GeoFeatureCollection,region:FuiMapRegionContext={scope:'country',code:'100000'}){
  if(!isFuiChinaCountry(china,region))return{land:[] as string[],islets:[] as string[],segments:[] as string[],context:[] as string[]};
  const land:string[]=[],islets:string[]=[],segments:string[]=[];
  for(const feature of china.features){
    const props=feature.properties;
    const jd=props.adchar==='JD'||String(props.adcode??'').includes('_JD');
    for(const polygon of polygons(feature)){
      if(!polygon[0]?.length||!inViewport(polygon[0]))continue;
      if(jd)segments.push(path(polygon));
      else (ringArea(polygon[0])<.06?islets:land).push(path(polygon));
    }
  }
  return {land,islets,segments,context:context.features.flatMap(f=>polygons(f).map(path))};
}
