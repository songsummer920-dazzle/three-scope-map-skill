// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MercatorCoordinate} from 'maplibre-gl';
import china from '../src/assets/maps/china.json';
import type {GeoFeatureCollection,Position} from '../src/types/geo';
import {createFuiGeographicGlassProjection} from '../src/components/map/fuiMapGeographicGlass';
import {FUI_MAP_CAP_CENTER,createFuiMapCapOpticsUniforms,fuiMapCapLngLat,fuiMapCapNormalENU,fuiMapCapReferenceLightENU,fuiMapCapEarthReferenceFrame,setFuiMapCapRestView} from '../src/components/map/fuiMapCapOptics';

const close=(actual:number,expected:number,epsilon=1e-10)=>assert(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
function earthBasis(longitude:number,latitude:number){
  const lon=longitude*Math.PI/180,lat=latitude*Math.PI/180;
  return{
    radial:new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),-Math.cos(lat)*Math.sin(lon)),
    east:new THREE.Vector3(-Math.sin(lon),0,-Math.cos(lon)),
    north:new THREE.Vector3(-Math.sin(lat)*Math.cos(lon),Math.cos(lat),Math.sin(lat)*Math.sin(lon)),
  };
}

test('the two explicit geographic modes recover the same real longitude/latitude, including high latitudes and dateline',()=>{
  const mapScale=13,equirect=new THREE.Vector4(1/(360*mapScale),1/(180*mapScale),(103.6+180)/360,(35.2+90)/180);
  for(const [longitude,latitude] of [[73.5,39],[103.6,35.2],[135,48],[110,3],[181,62],[-179,-70]]){
    const p=new THREE.Vector2((longitude-103.6)*mapScale,(latitude-35.2)*mapScale),before=p.clone(),transform=equirect.clone();
    const flat=fuiMapCapLngLat(p,equirect,'equirect');close(flat.x,longitude);close(flat.y,latitude);
    const projected=MercatorCoordinate.fromLngLat([longitude,latitude]);
    const mercator=fuiMapCapLngLat(new THREE.Vector2(projected.x,projected.y),new THREE.Vector4(1,1,0,0),'mercator');
    close(mercator.x,longitude);close(mercator.y,latitude);
    assert(p.equals(before));assert(equirect.equals(transform));
  }
});

test('actual China cap optics invert the existing Mercator positions without moving geography or ownership',()=>{
  const source=china as unknown as GeoFeatureCollection,before=JSON.stringify(source),projection=createFuiGeographicGlassProjection(source);
  const transform=new THREE.Vector4(projection.scale,-projection.scale,projection.anchor.x,projection.anchor.y),saved=transform.clone();
  let checked=0;
  for(const region of projection.regions){
    const polygons=region.feature.geometry.type==='Polygon'?[region.feature.geometry.coordinates as Position[][]]:region.feature.geometry.coordinates as Position[][][];
    for(const polygon of polygons)for(const ring of polygon)for(const coordinate of ring.slice(0,3)){
      const point=projection.project(coordinate),oldPoint=point.clone(),actual=fuiMapCapLngLat(point,transform,'mercator');
      close(actual.x,coordinate[0]);close(actual.y,coordinate[1]);assert(point.equals(oldPoint));
      const world=new THREE.Vector2(point.x*projection.scale+projection.anchor.x,-point.y*projection.scale+projection.anchor.y);
      const expected=MercatorCoordinate.fromLngLat(coordinate);close(world.x,expected.x,1e-12);close(world.y,expected.y,1e-12);
      checked++;
    }
    assert(!region.key.endsWith('_JD'));
  }
  assert(checked>100);assert(transform.equals(saved));assert.equal(JSON.stringify(source),before);
});

test('the continuous cap normal is geographic north-up, unit length and dateline-periodic',()=>{
  const center=fuiMapCapNormalENU(103.6,35.2);assert(center.distanceTo(new THREE.Vector3(0,0,1))<1e-12);
  const west=fuiMapCapNormalENU(75,35.2),east=fuiMapCapNormalENU(130,35.2),north=fuiMapCapNormalENU(103.6,50),south=fuiMapCapNormalENU(103.6,20);
  assert(west.x<0&&east.x>0&&north.y>0&&south.y<0);
  assert(west.distanceTo(east)>.6,'A constant plane normal lost the reference cap curvature');
  for(const normal of [center,west,east,north,south])close(normal.length(),1,1e-12);
  assert(fuiMapCapNormalENU(181,35,{longitude:180,latitude:35}).distanceTo(fuiMapCapNormalENU(-179,35,{longitude:180,latitude:35}))<1e-12);
});

test('fixed ENU light reproduces the reference Earth camera/orientation illumination across the cap',()=>{
  const {radial,east,north}=earthBasis(103.6,35.2),view=new THREE.Vector3(0,.1,7.22).normalize();
  // Independently reconstruct the reference north-up camera frame.
  const screenNorth=new THREE.Vector3(0,1,0).projectOnPlane(view).normalize();
  const screenEast=new THREE.Vector3().crossVectors(screenNorth,view).normalize();
  const earthFrame=new THREE.Matrix4().makeBasis(east,north,radial),displayFrame=new THREE.Matrix4().makeBasis(screenEast,screenNorth,view);
  const orientation=displayFrame.multiply(earthFrame.invert());
  const key=new THREE.Vector3(-.68,.62,.31).normalize(),enu=fuiMapCapReferenceLightENU();
  const restored=screenEast.clone().multiplyScalar(enu.x).addScaledVector(screenNorth,enu.y).addScaledVector(view,enu.z);
  assert(restored.distanceTo(key)<1e-12);close(enu.length(),1,1e-12);
  for(const [longitude,latitude] of [[75,40],[103.6,35.2],[130,48],[115,22]]){
    const physicalEarthNormal=earthBasis(longitude,latitude).radial.transformDirection(orientation);
    const opticalMapNormal=fuiMapCapNormalENU(longitude,latitude);
    close(physicalEarthNormal.dot(key),opticalMapNormal.dot(enu),1e-12);
  }
  // The studio is fixed to the chosen north-up frame, not a live camera input.
  assert(fuiMapCapReferenceLightENU({longitude:12,latitude:48}).distanceTo(enu)<1e-12);
});

test('instance uniforms keep explicit projection and configurable cap centers isolated',()=>{
  const first=createFuiMapCapOpticsUniforms(),second=createFuiMapCapOpticsUniforms('mercator',{longitude:120,latitude:30});
  assert.equal(first.uCapProjectionMode.value,0);assert.equal(second.uCapProjectionMode.value,1);
  close(first.uCapCenter.value.x,FUI_MAP_CAP_CENTER.longitude*Math.PI/180);close(second.uCapCenter.value.y,30*Math.PI/180);
  assert.notEqual(first.uCapCenter,second.uCapCenter);assert.notEqual(first.uCapLightENU.value,second.uCapLightENU.value);
  second.uCapCenter.value.set(0,0);second.uCapLightENU.value.set(0,0,0);
  close(first.uCapLightENU.value.length(),1,1e-12);close(first.uCapCenter.value.y,35.2*Math.PI/180);
});

test('a fixed rest view rotates cap normals and light together without retaining a camera or moving geographic data',()=>{
  const uniforms=createFuiMapCapOpticsUniforms('mercator'),coat=new THREE.ShaderMaterial({uniforms});
  const backingUniforms={...uniforms},rest=uniforms.uCapRestFrame.value,environment=uniforms.uCapEnvironmentToEarth.value;
  const view=new THREE.Vector3(.2,-.766,.643),original=view.clone(),point=new THREE.Vector3(120,-240,44),position=point.clone();
  setFuiMapCapRestView(coat,view);
  assert(view.equals(original));assert(point.equals(position));
  assert.equal(uniforms.uCapRestFrame.value,rest);assert.equal(backingUniforms.uCapEnvironmentToEarth.value,environment);
  assert(new THREE.Vector3(0,0,1).applyMatrix3(rest).distanceTo(view.clone().normalize())<1e-12);
  const normal=fuiMapCapNormalENU(78,42),key=uniforms.uCapLightENU.value;
  close(normal.clone().applyMatrix3(rest).dot(key.clone().applyMatrix3(rest)),normal.dot(key),1e-12);
  close(rest.determinant(),1,1e-12);
  const saved=rest.clone(),savedEnvironment=environment.clone();view.set(1,0,0);
  assert(rest.equals(saved));assert(environment.equals(savedEnvironment),'A live camera reference leaked into the fixed rest frame');
  assert.throws(()=>setFuiMapCapRestView(coat,new THREE.Vector3()),/nonzero/);assert(rest.equals(saved));
  coat.dispose();
});

test('environment lookup cancels the fixed rest frame and matches the reference Earth PMREM directions',()=>{
  const reference=fuiMapCapEarthReferenceFrame(),worldRotation=new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.3,-.5,.2)));
  const worldEast=new THREE.Vector3(1,0,0).applyMatrix3(worldRotation),worldNorth=new THREE.Vector3(0,1,0).applyMatrix3(worldRotation),geometryNormal=new THREE.Vector3(0,0,1).applyMatrix3(worldRotation);
  for(const view of [new THREE.Vector3(0,0,1),new THREE.Vector3(0,-.766,.643),new THREE.Vector3(.4,.5,.76)]){
    const uniforms=createFuiMapCapOpticsUniforms(),material=new THREE.ShaderMaterial({uniforms});setFuiMapCapRestView(material,view);
    const rest=uniforms.uCapRestFrame.value,toEarth=uniforms.uCapEnvironmentToEarth.value;
    for(const [longitude,latitude] of [[103.6,35.2],[78,42],[130,48],[115,22]]){
      const capNormal=fuiMapCapNormalENU(longitude,latitude),normalAtRest=capNormal.clone().applyMatrix3(rest);
      const reflected=new THREE.Vector3(0,0,-1).applyMatrix3(rest).reflect(normalAtRest);
      const reflectedWorld=reflected.clone().applyMatrix3(worldRotation);
      // This dot-basis inverse is the fragment helper's world→local ENU step.
      const local=new THREE.Vector3(reflectedWorld.dot(worldEast),reflectedWorld.dot(worldNorth),reflectedWorld.dot(geometryNormal));
      const actual=local.applyMatrix3(toEarth).normalize();
      const expected=new THREE.Vector3(0,0,-1).applyMatrix3(reference).reflect(capNormal.applyMatrix3(reference)).normalize();
      assert(actual.distanceTo(expected)<1e-12,'PMREM lookup retained the tilted map view instead of the reference Earth frame');
    }
    material.dispose();
  }
});
