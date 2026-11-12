// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MercatorCoordinate} from 'maplibre-gl';
import china from '../src/assets/maps/china.json';
import type {GeoFeature,GeoFeatureCollection,Position} from '../src/types/geo';
import {createFuiGeographicGlassProjection} from '../src/components/map/fuiMapGeographicGlass';
import {cleanOverlayRing} from '../src/components/map/vectorMap3dGeometry';
import {fuiTerrainGeoUv} from '../src/components/map/fuiMapTerrain';

const feature=(rings:Position[][],code:string):GeoFeature=>({type:'Feature',properties:{adcode:code,name:code},geometry:{type:'Polygon',coordinates:rings}});
const collection=(features:GeoFeature[]):GeoFeatureCollection=>({type:'FeatureCollection',features});
const ring:Position[]=[[100,30],[102,30],[102,32],[100,32],[100,30]];
function adapter(projection:ReturnType<typeof createFuiGeographicGlassProjection>){
  return new THREE.Matrix4().makeTranslation(projection.anchor.x,projection.anchor.y,0).multiply(new THREE.Matrix4().makeScale(projection.scale,-projection.scale,projection.scale));
}
const close=(a:number,b:number,epsilon=1e-12)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('actual China native rings round-trip to MapLibre Mercator while retaining administrative owners and excluding JD',()=>{
  const data=china as unknown as GeoFeatureCollection,before=JSON.stringify(data),projection=createFuiGeographicGlassProjection(data),matrix=adapter(projection);
  const expected=data.features.filter((f,i)=>!String(f.properties.adcode??f.properties.code??f.properties.id??f.properties.fullname??f.properties.name??i).endsWith('_JD'));
  assert.equal(projection.regions.length,expected.length);
  let vertices=0,holes=0;
  projection.regions.forEach((region,index)=>{
    const source=expected[index];assert.equal(region.feature,source);
    assert.equal(region.key,String(source.properties.adcode??source.properties.code??source.properties.id??source.properties.fullname??source.properties.name??index));
    const polygons=source.geometry.type==='Polygon'?[source.geometry.coordinates as Position[][]]:source.geometry.coordinates as Position[][][];
    assert.equal(region.polygons.length,polygons.length);
    region.polygons.forEach((polygon,p)=>{
      holes+=polygon.length-1;
      polygon.forEach((points,r)=>{
        const cleaned=cleanOverlayRing(polygons[p][r]);assert.equal(points.length,cleaned.length);
        const outer=cleanOverlayRing(polygons[p][0]);
        const shift=r?Math.round((outer[0][0]-cleaned[0][0])/360)*360:0;
        points.forEach((point,i)=>{
          const geographic=MercatorCoordinate.fromLngLat([cleaned[i][0]+shift,cleaned[i][1]]);
          const world=new THREE.Vector3(point.x,point.y,0).applyMatrix4(matrix);
          close(world.x,geographic.x);close(world.y,geographic.y);vertices++;
        });
      });
    });
  });
  assert(vertices>1000,'Actual national geometry was replaced by a coarse proxy');
  assert.equal(JSON.stringify(data),before,'Projection mutated the geographic source');
  const expectedHoles=expected.reduce((count,source)=>count+(source.geometry.type==='Polygon'?[source.geometry.coordinates as Position[][]]:source.geometry.coordinates as Position[][][]).reduce((sum,polygon)=>sum+polygon.length-1,0),0);
  assert.equal(holes,expectedHoles,'Projection changed the real administrative hole count');
});

test('projected holes remain empty in actual ShapeGeometry raycasts and separate regions keep their owners',()=>{
  const hole:Position[]=[[100.5,30.5],[100.5,31.5],[101.5,31.5],[101.5,30.5],[100.5,30.5]];
  const first=feature([ring,hole],'region-one'),second=feature([ring.map(([x,y])=>[x+4,y] as Position)],'region-two');
  const jd=feature([ring.map(([x,y])=>[x-90,y] as Position)],'100000_JD');
  const projection=createFuiGeographicGlassProjection(collection([first,second,jd]));
  assert.deepEqual(projection.regions.map(region=>region.key),['region-one','region-two']);
  const polygon=projection.regions[0].polygons[0],shape=new THREE.Shape(polygon[0]);
  for(const points of polygon.slice(1))shape.holes.push(new THREE.Path(points));
  const geometry=new THREE.ShapeGeometry(shape),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material),ray=new THREE.Raycaster();
  const hit=(point:Position)=>{const p=projection.project(point);ray.ray.set(new THREE.Vector3(p.x,p.y,1),new THREE.Vector3(0,0,-1));return ray.intersectObject(mesh,false);};
  assert.equal(hit([101,31]).length,0,'Projection filled an actual geographic hole');
  assert(hit([100.2,31]).length>0,'Projection removed valid regional land');
  assert.equal(projection.regions[0].feature,first);assert.equal(projection.regions[1].feature,second);
  geometry.dispose();material.dispose();
});

test('native longitude units and glass thickness match the original standalone easting ratio',()=>{
  const projection=createFuiGeographicGlassProjection(collection([feature([ring],'region')]));
  // The original 860x530 map reserves 28 units on each side. A 2x2-degree
  // region therefore uses min(804/2,474/2)=237 native units per longitude degree.
  const legacyMapScale=Math.min((860-56)/2,(530-56)/2);
  close(projection.scale,1/(360*legacyMapScale));
  const west=projection.project([100,31]),east=projection.project([102,31]);
  close(east.x-west.x,2*legacyMapScale,1e-8);
  close(32/(east.x-west.x),32/(2*legacyMapScale));
  close(2.6/(east.x-west.x),2.6/(2*legacyMapScale));
  const matrix=adapter(projection),top=new THREE.Vector3(0,0,44).applyMatrix4(matrix),foot=new THREE.Vector3(0,0,12).applyMatrix4(matrix);
  close(top.z-foot.z,32*projection.scale);
  const altitude=new MercatorCoordinate(projection.anchor.x,projection.anchor.y,top.z-foot.z).toAltitude();
  close(altitude,projection.depthMeters,1e-7);
  assert(projection.depthMeters>0&&Number.isFinite(projection.depthMeters));
  const north=projection.project([101,31.5]),south=projection.project([101,30.5]);
  assert(north.y>south.y,'Native map Y must remain geographic north before the Mercator adapter flips it');
});

test('actual China uses the original longitude scale for the same non-JD geographic bounds',()=>{
  const data=china as unknown as GeoFeatureCollection,projection=createFuiGeographicGlassProjection(data);
  let minLon=Infinity,maxLon=-Infinity,minLat=Infinity,maxLat=-Infinity;
  for(const source of data.features){
    if(String(source.properties.adcode??source.properties.code??'').endsWith('_JD'))continue;
    const polygons=source.geometry.type==='Polygon'?[source.geometry.coordinates as Position[][]]:source.geometry.coordinates as Position[][][];
    for(const polygon of polygons)for(const [lon,lat] of polygon[0]){minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);}
  }
  const legacyMapScale=Math.min((860-56)/(maxLon-minLon),(530-56)/(maxLat-minLat));
  const west=projection.project([minLon,35]),east=projection.project([maxLon,35]);
  close(1/(360*projection.scale),legacyMapScale,1e-10);
  close(east.x-west.x,(maxLon-minLon)*legacyMapScale,1e-8);
  const slabMetres=new MercatorCoordinate(projection.anchor.x,projection.anchor.y,32/(360*legacyMapScale)).toAltitude();
  close(projection.depthMeters,slabMetres,1e-7);
});

test('antimeridian holes stay registered to their short unwrapped native footprint',()=>{
  const outer:Position[]=[[179,-1],[-179,-1],[-179,1],[179,1],[179,-1]];
  const hole:Position[]=[[-179.6,-.4],[-179.6,.4],[179.6,.4],[179.6,-.4],[-179.6,-.4]];
  const projection=createFuiGeographicGlassProjection(collection([feature([outer,hole],'dateline')])),polygon=projection.regions[0].polygons[0],matrix=adapter(projection);
  const outerBounds=new THREE.Box2().setFromPoints(polygon[0]),holeBounds=new THREE.Box2().setFromPoints(polygon[1]);
  assert(outerBounds.containsBox(holeBounds),'Hole wrapped to the opposite side of the world');
  assert((outerBounds.max.x-outerBounds.min.x)*projection.scale<.006,'Dateline region spanned the long Mercator arc');
  close(outerBounds.max.x-outerBounds.min.x,2*Math.min(804/2,474/2),1e-8);
  for(const point of polygon.flat()){
    const world=new THREE.Vector3(point.x,point.y,0).applyMatrix4(matrix);
    assert(world.x>.99&&world.x<1.01,'Wrapped data lost its geographic world copy');
  }
});

test('empty geographic input creates no substitute owners and a finite adapter',()=>{
  const projection=createFuiGeographicGlassProjection(collection([]));
  assert.equal(projection.regions.length,0);
  assert(projection.scale>0&&Number.isFinite(projection.scale));
  assert(adapter(projection).elements.every(Number.isFinite));
});

test('native terrain texture UVs invert actual MapLibre Mercator latitude without changing the standalone affine path',()=>{
 const projection=createFuiGeographicGlassProjection(china as unknown as GeoFeatureCollection);
 const geographicTransform=new THREE.Vector4(projection.scale,-projection.scale,projection.anchor.x,projection.anchor.y);
 for(const latitude of [-75,-45,0,20,35,50,75])for(const longitude of [-150,-30,80,110,160]){
  const point=projection.project([longitude,latitude]);
  const uv=fuiTerrainGeoUv(geographicTransform,point.x,point.y,true);
  close(uv.x,(longitude+180)/360,1e-12);close(uv.y,(latitude+90)/180,1e-12);
 }
 const affine=new THREE.Vector4(.001,.002,.43,.6),x=123,y=-57;
 const uv=fuiTerrainGeoUv(affine,x,y);
 close(uv.x,x*affine.x+affine.z);close(uv.y,y*affine.y+affine.w);
});
