// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import type {GeoFeatureCollection,Position} from '../../types/geo';
import type {FuiEarthSkinId} from './fuiEarthTheme';
import {getFuiMapMaterialPalette,type FuiMapPaletteFamily} from './fuiMapMaterial';
import {FUI_MAP_GLASS_LEVELS} from './fuiMapGlass';
import {isFuiChinaCountry,isFuiHainanFeature,type FuiMapRegionContext} from './fuiMapRegion';
import {createFuiMapHologramSurface,createFuiMapHologramBacking,updateFuiMapHologramSurface} from './fuiMapHologramSurface';
import type {FuiTerrainState} from './fuiMapTerrain';

/** Standard-map plaques retain their compact legacy datums. Glass maps use
 * the mainland slab levels for both geography and every upper/foot stroke. */
export const FUI_SOUTH_SEA_LEVELS=Object.freeze({
  islands:Object.freeze({top:FUI_MAP_GLASS_LEVELS.top,bottom:FUI_MAP_GLASS_LEVELS.top-5.5}),
  maritime:Object.freeze({top:FUI_MAP_GLASS_LEVELS.top,bottom:FUI_MAP_GLASS_LEVELS.top-2.8}),
});
export const FUI_SOUTH_SEA_GLASS_LEVELS=Object.freeze({
  islands:FUI_MAP_GLASS_LEVELS,
  maritime:FUI_MAP_GLASS_LEVELS,
});
type FuiSouthSeaLevels={islands:{top:number;bottom:number};maritime:{top:number;bottom:number}};
export function getFuiSouthSeaData(data:GeoFeatureCollection,context:FuiMapRegionContext={scope:'country',code:'100000'}){
  const islands:Position[][][]=[],segments:Position[][][]=[];
  if(!isFuiChinaCountry(data,context))return{islands,segments,fitPoints:[] as Position[]};
  for(const feature of data.features){
    const p=feature.properties;
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates as Position[][]]:feature.geometry.coordinates as Position[][][];
    if(p.adchar==='JD'||String(p.adcode??'').includes('_JD'))segments.push(...polygons);
    else if(isFuiHainanFeature(feature))islands.push(...polygons.filter(polygon=>polygon[0]?.length&&polygon[0].every(point=>point[1]<17.5)));
  }
  return {islands,segments,fitPoints:[...islands,...segments].flat(2)};
}
export type FuiSouthSeaSurface={terrain:FuiTerrainState;skin:FuiEarthSkinId;reference:THREE.ShaderMaterial};
export function createFuiSouthSeaMap(data:ReturnType<typeof getFuiSouthSeaData>,project:(coord:Position)=>THREE.Vector3,environment:THREE.Texture|undefined,viewport:{width:number;height:number},sideTemplate:THREE.ShaderMaterial,surface?:FuiSouthSeaSurface,levels:FuiSouthSeaLevels=FUI_SOUTH_SEA_LEVELS){
  const group=new THREE.Group();group.name='fui-south-sea-geography';
  const projectRings=(rings:Position[][])=>rings.map(ring=>ring.map(coord=>{const p=project(coord);return new THREE.Vector2(p.x,p.y);}));
  const shape=(paths:THREE.Vector2[][])=>{const result=new THREE.Shape(paths[0]);result.holes=paths.slice(1).map(points=>new THREE.Path(points));return result;};
  const islandPaths=data.islands.map(rings=>{
    const paths=projectRings(rings),box=new THREE.Box2().setFromPoints(paths[0]);
    const span=box.getSize(new THREE.Vector2()),center=box.getCenter(new THREE.Vector2());
    const factor=Math.max(1,4.5/Math.max(span.x,span.y,.001));
    return paths.map(ring=>ring.map(p=>p.clone().sub(center).multiplyScalar(factor).add(center)));
  });
  const maritimePaths=data.segments.map(projectRings),islandGroup=new THREE.Group();group.add(islandGroup);
  const top=new THREE.MeshPhysicalMaterial({color:'#101c27',roughness:.24,metalness:.12,clearcoat:1,...(environment?{envMap:environment}:{}),envMapIntensity:.22,emissiveIntensity:.15});
  const createSide=(alpha:number,datum:{top:number;bottom:number})=>{
    const material=sideTemplate.clone();
    material.uniforms.topZ.value=datum.top;material.uniforms.bottomZ.value=datum.bottom;
    material.uniforms.uGlass.value=1;material.uniforms.uLift.value=0;material.uniforms.alpha.value=alpha;
    // These meshes already contain final display levels, unlike the
    // mainland shader's legacy z24–44 input. Apply only their actual lift.
    material.vertexShader=material.vertexShader.replace('12.0+vDepth*32.0-uLift*(1.0-vDepth)','bottomZ+vDepth*(topZ-bottomZ)-uLift*(1.0-vDepth)');
    return material;
  };
  const side=createSide(.86,levels.islands),maritimeSide=createSide(.60,levels.maritime);
  const bodyGeometry=(polygons:THREE.Vector2[][][],datum:{top:number;bottom:number},openTop=false,consolidateOpaqueTop=false)=>{
    const geometry=new THREE.ExtrudeGeometry(polygons.map(shape),{depth:datum.top-datum.bottom,bevelEnabled:false,steps:1});geometry.translate(0,0,datum.bottom);
    const position=geometry.getAttribute('position'),indices:number[]=[],parts=[...geometry.groups],byMaterial=new Map<number,number[]>();geometry.clearGroups();
    for(const part of parts){
      const target=consolidateOpaqueTop?(byMaterial.get(part.materialIndex??0)??[]):indices,start=target.length;
      for(let i=part.start;i<part.start+part.count;i+=3){
        if(part.materialIndex===0&&([i,i+1,i+2].every(j=>Math.abs(position.getZ(j)-datum.bottom)<1e-5)||openTop))continue;
        target.push(i,i+1,i+2);
      }
      if(consolidateOpaqueTop)byMaterial.set(part.materialIndex??0,target);
      else geometry.addGroup(start,indices.length-start,part.materialIndex);
    }
    // Island caps are opaque and walls transparent, so Three already renders
    // them in separate queues. Preserve each queue's exact triangle order and
    // issue one range per material instead of one range per small island.
    // Maritime caps and walls are both transparent: keep their interleaving.
    for(const [materialIndex,range]of byMaterial){
      if(!range.length)continue;
      const start=indices.length;for(const index of range)indices.push(index);
      geometry.addGroup(start,range.length,materialIndex);
    }
    geometry.setIndex(indices);geometry.computeBoundingBox();geometry.boundingBox!.min.z-=28;geometry.boundingSphere=geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());return geometry;
  };
  const bottomMaterial=new THREE.MeshPhysicalMaterial({color:'#02060c',roughness:.12,clearcoat:.6,...(environment?{envMap:environment}:{}),envMapIntensity:.18,side:THREE.DoubleSide});
  const addBottom=(polygons:THREE.Vector2[][][],datum:{bottom:number})=>{const mesh=new THREE.Mesh(new THREE.ShapeGeometry(polygons.map(shape)),bottomMaterial);mesh.position.z=datum.bottom;group.add(mesh);return mesh;};
  const islandBottom=addBottom(islandPaths,levels.islands),maritimeBottom=addBottom(maritimePaths,levels.maritime);
  const islandBody=new THREE.Mesh(bodyGeometry(islandPaths,levels.islands,Boolean(surface),true),[top,side]);islandGroup.add(islandBody);
  let coat:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>|undefined,backing:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>|undefined;
  if(surface){
    const material=createFuiMapHologramSurface(surface.skin,surface.terrain,environment);
    for(const [key,uniform]of Object.entries(surface.reference.uniforms))if(key.startsWith('uCap')||key.startsWith('uGlassBackdrop')||key==='uHasGlassBackdrop'||key==='uMapScale'||key==='uGlassLinearOutput')material.uniforms[key]=uniform;
    material.uniforms.uGlassDepth.value=levels.islands.top-levels.islands.bottom;material.uniforms.uEngravingDepth.value=1.9;
    const geometry=new THREE.ShapeGeometry(islandPaths.map(shape));geometry.computeBoundingBox();geometry.boundingBox!.min.z-=1.9;geometry.boundingSphere=geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
    backing=new THREE.Mesh(geometry,createFuiMapHologramBacking(material));backing.position.z=levels.islands.top;backing.renderOrder=4.5;
    coat=new THREE.Mesh(geometry,material);coat.position.z=levels.islands.top;coat.renderOrder=6;islandGroup.add(backing,coat);
  }
  const islandMesh=coat??islandBody;islandMesh.userData.featureName='海南省';islandMesh.userData.featureCode='460000';
  const islandRaycast=islandMesh.raycast;islandMesh.raycast=function(raycaster,hits){if(group.visible)islandRaycast.call(this,raycaster,hits);};
  const outline=(polygons:THREE.Vector2[][][],z:number,opacity:number,width:number)=>{
    const positions:number[]=[];for(const polygon of polygons)for(const ring of polygon)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];positions.push(a.x,a.y,z,b.x,b.y,z);}
    const geometry=new LineSegmentsGeometry();geometry.setPositions(positions);
    const material=new LineMaterial({linewidth:width,worldUnits:false,transparent:true,opacity,depthWrite:false,depthTest:true,alphaToCoverage:false});material.resolution.set(viewport.width,viewport.height);return new LineSegments2(geometry,material);
  };
  const islandEdge=outline(islandPaths,levels.islands.top+.18,.96,.85);islandGroup.add(islandEdge);
  const islandFoot=outline(islandPaths,levels.islands.bottom+.08,.70,.55);group.add(islandFoot);
  const maritimeInk=new THREE.Mesh(bodyGeometry(maritimePaths,levels.maritime),[new THREE.MeshBasicMaterial({transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}),maritimeSide]);group.add(maritimeInk);
  const maritimeEdge=outline(maritimePaths,levels.maritime.top+.18,.88,1.05);group.add(maritimeEdge);
  const maritimeFoot=outline(maritimePaths,levels.maritime.bottom+.08,.50,.55);group.add(maritimeFoot);
  group.userData.fuiSouthSea={islandGroup,islandMesh,islandBody,coat,backing,top,side,islandEdge,islandFoot,islandBottom,maritimeInk,maritimeSide,maritimeEdge,maritimeFoot,maritimeBottom,levels};
  return group;
}
export function updateFuiSouthSeaMap(group:THREE.Group,skin:FuiEarthSkinId,visible:boolean,family:FuiMapPaletteFamily='shared'){
  group.visible=visible;
  const state=group.userData.fuiSouthSea as {islandGroup:THREE.Group;top:THREE.MeshPhysicalMaterial;side:THREE.ShaderMaterial;maritimeSide:THREE.ShaderMaterial;islandEdge:LineSegments2;islandFoot:LineSegments2;maritimeInk:THREE.Mesh<THREE.ExtrudeGeometry,[THREE.MeshBasicMaterial,THREE.ShaderMaterial]>;maritimeEdge:LineSegments2;maritimeFoot:LineSegments2;coat?:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;backing?:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;levels:FuiSouthSeaLevels};
  const lift=Math.max(0,state.islandGroup.position.z),selection=THREE.MathUtils.smoothstep(lift,0,12);
  state.side.uniforms.uLift.value=lift;state.side.uniforms.uSelection.value=selection;
  if(state.coat){
    state.coat.material.uniforms.uGlassDepth.value=state.levels.islands.top-state.levels.islands.bottom+lift;
    if(state.backing)state.backing.material.opacity=state.coat.material.opacity;
    updateFuiMapHologramSurface(state.coat.material,skin,selection);
    if(state.backing)updateFuiMapHologramSurface(state.backing.material,skin);
  }
  const selected=lift>.1;if(group.userData.fuiLastSkin===skin&&group.userData.fuiLastSelected===selected&&group.userData.fuiLastPaletteFamily===family)return;
  group.userData.fuiLastSkin=skin;group.userData.fuiLastSelected=selected;group.userData.fuiLastPaletteFamily=family;
  const palette=getFuiMapMaterialPalette(skin,family);state.top.color.copy(palette.base).lerp(palette.inner,selected?.32:.16);state.top.emissive.copy(palette.inner);
  for(const material of [state.side,state.maritimeSide]){material.uniforms.topColor.value.copy(palette.sideTop);material.uniforms.midColor.value.copy(palette.sideMid);material.uniforms.bottomColor.value.copy(palette.sideBottom);}
  state.islandEdge.material.color.copy(palette.outer);state.islandFoot.material.color.copy(palette.inner).multiplyScalar(.52);
  state.maritimeInk.material[0].color.copy(palette.inner);state.maritimeEdge.material.color.copy(palette.outer);state.maritimeFoot.material.color.copy(palette.inner).multiplyScalar(.52);
}
