// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {GeoFeature,GeoFeatureCollection,Position} from '../../types/geo';

// MapLibre's mercator_coordinate.ts uses the mean Earth radius, not WGS84's
// equatorial circumference. Matching it also matches conformal metre heights.
const circumference=2*Math.PI*6371008.8;
export const OVERLAY_MERCATOR_LATITUDE_LIMIT=85.0511287798066;
export type OverlaySurface='smooth-glass'|'terrain-glass'|'classic';
export type OverlayAnchor={x:number;y:number;metersToMercator:number};
export type OverlayFeatureGeometry={feature:GeoFeature;key:string;top:THREE.BufferGeometry;wall:THREE.BufferGeometry;edges:THREE.BufferGeometry;pick:THREE.Mesh;};
export type OverlayGeometry={anchor:OverlayAnchor;depthMeters:number;features:OverlayFeatureGeometry[];dispose:()=>void};

export function overlayMercator([longitude,latitude]:readonly number[]){
  const lat=Math.max(-OVERLAY_MERCATOR_LATITUDE_LIMIT,Math.min(OVERLAY_MERCATOR_LATITUDE_LIMIT,latitude));
  const radians=lat*Math.PI/180;
  return{x:(longitude+180)/360,y:(1-Math.log(Math.tan(Math.PI/4+radians/2))/Math.PI)/2,metersToMercator:1/(circumference*Math.cos(radians))};
}
export function overlayLatitude(y:number){return Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI;}
export function cleanOverlayRing(source:Position[]):Position[]{
  const result:Position[]=[];
  for(const point of source){
    if(!Number.isFinite(point[0])||!Number.isFinite(point[1]))continue;
    let longitude=point[0];const previous=result[result.length-1];
    if(previous){while(longitude-previous[0]>180)longitude-=360;while(longitude-previous[0]<-180)longitude+=360;}
    if(!previous||Math.abs(longitude-previous[0])+Math.abs(point[1]-previous[1])>1e-10)result.push([longitude,point[1]]);
  }
  if(result.length>1){const first=result[0],last=result[result.length-1];if(Math.abs(first[0]-last[0])+Math.abs(first[1]-last[1])<1e-9)result.pop();}
  return result;
}
function featureKey(feature:GeoFeature,index:number){return String(feature.properties.adcode??feature.properties.code??feature.properties.id??feature.properties.name??index);}
function polygons(feature:GeoFeature){return feature.geometry.type==='Polygon'?[feature.geometry.coordinates as Position[][]]:feature.geometry.coordinates as Position[][][];}
function arraysGeometry(positions:number[],normals:number[],depths:number[],meters:number[]){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('depth',new THREE.Float32BufferAttribute(depths,1));
  geometry.setAttribute('meterScale',new THREE.Float32BufferAttribute(meters,1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Geographic Mercator XY and conformal altitude; heights are disclosed display
 * extrusions, not terrain elevations. One shared anchor keeps Float32 buffers
 * precise while MapLibre supplies the complete live world-to-clip matrix. */
export function createOverlayGeometry(data:GeoFeatureCollection):OverlayGeometry{
  const sources=data.features.filter((feature,index)=>!featureKey(feature,index).endsWith('_JD'));
  const prepared=sources.map((feature,index)=>({feature,key:featureKey(feature,index),polygons:polygons(feature).flatMap(rings=>{
    const outer=cleanOverlayRing(rings[0]??[]);if(outer.length<3)return[];
    const holes=rings.slice(1).map(cleanOverlayRing).filter(r=>r.length>=3).map(r=>{const shift=Math.round((outer[0][0]-r[0][0])/360)*360;return r.map(([x,y])=>[x+shift,y] as Position);});
    return[[outer,...holes]];
  })}));
  const points=prepared.flatMap(p=>p.polygons.flatMap(rings=>rings[0].map(overlayMercator)));
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const point of points){minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
  if(!points.length){minX=maxX=minY=maxY=.5;}
  const anchorXY={x:(minX+maxX)/2,y:(minY+maxY)/2};
  const metersToMercator=overlayMercator([0,overlayLatitude(anchorXY.y)]).metersToMercator;
  const anchor={...anchorXY,metersToMercator};
  const spanMeters=Math.max(maxX-minX,maxY-minY)/metersToMercator;
  const depthMeters=Math.max(80,Math.min(80000,spanMeters*.024));
  const pickMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const members:OverlayFeatureGeometry[]=[];
  for(const source of prepared){
    const topP:number[]=[],topN:number[]=[],topD:number[]=[],topM:number[]=[];
    const wallP:number[]=[],wallN:number[]=[],wallD:number[]=[],wallM:number[]=[];
    const edgeP:number[]=[],edgeN:number[]=[],edgeD:number[]=[],edgeM:number[]=[];
    for(const rings of source.polygons){
      const projected=rings.map(r=>r.map(p=>{const m=overlayMercator(p);return new THREE.Vector2(m.x-anchor.x,m.y-anchor.y);}));
      const shape=new THREE.Shape(projected[0]);projected.slice(1).forEach(r=>shape.holes.push(new THREE.Path(r)));
      const raw=new THREE.ShapeGeometry(shape);const expanded=raw.index?raw.toNonIndexed():raw;
      const position=expanded.getAttribute('position');
      for(let i=0;i<position.count;i++){
        const x=position.getX(i),y=position.getY(i),scale=overlayMercator([0,overlayLatitude(y+anchor.y)]).metersToMercator;
        topP.push(x,y,depthMeters*scale);topN.push(0,0,1);topD.push(1);topM.push(scale);
      }
      if(expanded!==raw)expanded.dispose();raw.dispose();
      projected.forEach((ring,ringIndex)=>{
        const signedArea=THREE.ShapeUtils.area(ring),orientation=(signedArea>=0?1:-1)*(ringIndex? -1:1);
        for(let i=0;i<ring.length;i++){
          const a=ring[i],b=ring[(i+1)%ring.length],length=a.distanceTo(b);if(length<1e-12)continue;
          const nx=(b.y-a.y)/length*orientation,ny=-(b.x-a.x)/length*orientation;
          const sa=overlayMercator([0,overlayLatitude(a.y+anchor.y)]).metersToMercator,sb=overlayMercator([0,overlayLatitude(b.y+anchor.y)]).metersToMercator;
          for(const [point,depth,scale] of [[a,0,sa],[b,0,sb],[a,1,sa],[b,0,sb],[b,1,sb],[a,1,sa]] as const){wallP.push(point.x,point.y,depth*depthMeters*scale);wallN.push(nx,ny,0);wallD.push(depth);wallM.push(scale);}
          for(const depth of [0,1])for(const [point,scale] of [[a,sa],[b,sb]] as const){edgeP.push(point.x,point.y,depth*depthMeters*scale);edgeN.push(0,0,1);edgeD.push(depth);edgeM.push(scale);}
        }
      });
    }
    if(!topP.length)continue;
    const top=arraysGeometry(topP,topN,topD,topM),wall=arraysGeometry(wallP,wallN,wallD,wallM),edges=arraysGeometry(edgeP,edgeN,edgeD,edgeM);
    const pick=new THREE.Mesh(top,pickMaterial);pick.userData.overlayKey=source.key;
    members.push({feature:source.feature,key:source.key,top,wall,edges,pick});
  }
  return{anchor,depthMeters,features:members,dispose(){members.forEach(m=>{m.top.dispose();m.wall.dispose();m.edges.dispose();});pickMaterial.dispose();}};
}
