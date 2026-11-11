// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MercatorCoordinate} from 'maplibre-gl';
import china from '../src/assets/maps/china.json';
import type {GeoFeature,GeoFeatureCollection,Position} from '../src/types/geo';
import {overlayMercator,overlayLatitude,cleanOverlayRing,createOverlayGeometry} from '../src/components/map/vectorMap3dGeometry';

const feature=(coordinates:Position[][],code='test'):GeoFeature=>({type:'Feature',properties:{name:code,adcode:code},geometry:{type:'Polygon',coordinates}});
const collection=(features:GeoFeature[]):GeoFeatureCollection=>({type:'FeatureCollection',features});
const square:Position[]=[[100,30],[102,30],[102,32],[100,32],[100,30]];

test('overlay XY and conformal metre heights match actual MapLibre Mercator coordinates',()=>{
  for(const longitude of [-179,0,103.6,179])for(const latitude of [-75,0,35.2,75]){
    const expected=MercatorCoordinate.fromLngLat([longitude,latitude],137),actual=overlayMercator([longitude,latitude]);
    assert(Math.abs(actual.x-expected.x)<1e-14);assert(Math.abs(actual.y-expected.y)<1e-14);
    assert(Math.abs(actual.metersToMercator*137-expected.z)<1e-14,'Altitude used a different Earth radius than MapLibre');
    assert(Math.abs(overlayLatitude(actual.y)-latitude)<1e-10);
  }
  assert(Number.isFinite(overlayMercator([0,90]).y));assert(Number.isFinite(overlayMercator([0,-90]).y));
});

test('raised administrative tops and wall feet share the exact same anchored geography',()=>{
  const source=collection([feature([square])]),before=JSON.stringify(source),geometry=createOverlayGeometry(source),member=geometry.features[0];
  assert.equal(JSON.stringify(source),before);assert.equal(geometry.features.length,1);assert(geometry.depthMeters>0);
  const top=member.top.getAttribute('position'),wall=member.wall.getAttribute('position'),depth=member.wall.getAttribute('depth'),scale=member.wall.getAttribute('meterScale');
  const controls=square.slice(0,-1).map(overlayMercator);
  for(let i=0;i<top.count;i++)assert(controls.some(p=>Math.hypot(top.getX(i)+geometry.anchor.x-p.x,top.getY(i)+geometry.anchor.y-p.y)<1e-8));
  for(let i=0;i<wall.count;i++)assert(Math.abs(wall.getZ(i)-depth.getX(i)*geometry.depthMeters*scale.getX(i))<1e-8,'Side thickness detached from its geographical top');
  assert(Array.from(depth.array).includes(0));assert(Array.from(depth.array).includes(1));geometry.dispose();
});

test('polygon holes remain empty in the actual 3D top raycast',()=>{
  const hole:Position[]=[[100.5,30.5],[100.5,31.5],[101.5,31.5],[101.5,30.5],[100.5,30.5]];
  const geometry=createOverlayGeometry(collection([feature([square,hole])]));
  const ray=new THREE.Raycaster(),mesh=geometry.features[0].pick;
  const hits=(p:Position)=>{const m=overlayMercator(p);ray.ray.set(new THREE.Vector3(m.x-geometry.anchor.x,m.y-geometry.anchor.y,1),new THREE.Vector3(0,0,-1));return ray.intersectObject(mesh,false);};
  assert.equal(hits([101,31]).length,0,'A province hole was filled by the raised top');
  assert(hits([100.2,31]).length>0,'Valid province land could not be picked');geometry.dispose();
});

test('antimeridian polygons keep a short span and their wrapped holes remain registered',()=>{
  const outer:Position[]=[[179,-1],[-179,-1],[-179,1],[179,1],[179,-1]];
  const hole:Position[]=[[-179.6,-.4],[-179.6,.4],[179.6,.4],[179.6,-.4],[-179.6,-.4]];
  const cleaned=cleanOverlayRing(outer);assert(Math.max(...cleaned.map(p=>p[0]))-Math.min(...cleaned.map(p=>p[0]))<3);
  const geometry=createOverlayGeometry(collection([feature([outer,hole])]));const position=geometry.features[0].top.getAttribute('position');
  const xs=Array.from({length:position.count},(_,i)=>position.getX(i));assert(Math.max(...xs)-Math.min(...xs)<.006);
  const ray=new THREE.Raycaster();ray.ray.set(new THREE.Vector3(1-geometry.anchor.x,.5-geometry.anchor.y,1),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(geometry.features[0].pick,false).length,0);geometry.dispose();
});

test('actual China preserves all administrative owners while excluding JD decoration',()=>{
  const source=china as unknown as GeoFeatureCollection;
  const expected=source.features.filter(f=>!String(f.properties.adcode??f.properties.code??'').endsWith('_JD'));
  const geometry=createOverlayGeometry(source);assert.equal(geometry.features.length,expected.length);
  assert(geometry.features.every(f=>f.top.getAttribute('position').count>0&&f.wall.getAttribute('position').count>0));
  assert(geometry.features.reduce((n,f)=>n+f.top.getAttribute('position').count,0)>1000);geometry.dispose();
});

test('empty data produces no substitute geography or invalid anchor',()=>{
  const geometry=createOverlayGeometry(collection([]));assert.equal(geometry.features.length,0);
  assert(Number.isFinite(geometry.anchor.x)&&Number.isFinite(geometry.anchor.y));geometry.dispose();
});
