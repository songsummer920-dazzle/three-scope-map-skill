// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import type {GeoFeature,GeoFeatureCollection,Position} from '../../types/geo';
import type {FuiEarthSkinId} from './fuiEarthTheme';
import type {MapQuality} from './mapQuality';
import {browserMapQualityBudget} from './mapQuality';
import {mapTheme} from './mapTheme';
import {cleanOverlayRing,overlayLatitude,overlayMercator} from './vectorMap3dGeometry';
import {createFuiMapGlassFootprintStages,createFuiMapGlassBodyGeometryStages,createFuiMapGlassBodyFromGeometry,createFuiMapGlassMaterial,createFuiGlassWallOwnerLookup,FUI_MAP_GLASS_LEVELS} from './fuiMapGlass';
import {createFuiMapEdgeFieldStages,bindFuiMapGlassGlow,updateFuiMapGlassGlow,type FuiMapEdgeField} from './fuiMapGlow';
import {createFuiFlatTerrainState,createFuiTerrainState,refineFuiMapGeometry,fuiTerrainGeoUv,bindFuiTerrainGlass,bindFuiTerrainRaycast,prepareFuiTerrainRegional,updateFuiTerrainHitProxies,bindFuiTerrainSideWall,bindFuiTerrainLine,startFuiTerrainRegionalBlend,advanceFuiTerrainRegionalBlend,type FuiTerrainState} from './fuiMapTerrain';
import {createFuiMapSurface,updateFuiMapSurface,waitForFuiMapTexturesReady,type FuiMapTextures} from './fuiMapSurface';
import {createFuiMapHologramSurface,createFuiMapHologramBacking,updateFuiMapHologramSurface,setFuiMapHologramBackdrop} from './fuiMapHologramSurface';
import {createFuiMapCapOpticsUniforms,setFuiMapCapRestView} from './fuiMapCapOptics';
import {createFuiMapSideGradientMaterial} from './fuiMapSideMaterial';
import {getFuiMapMaterialPalette,getFuiMapOuterContourColor} from './fuiMapMaterial';
import {createFuiMapReflection,resizeFuiMapReflection,FUI_MAP_REFLECTION_LAYER} from './fuiMapReflection';
import {drainFuiMapBuild,runFuiMapBuild,type FuiMapBuildOptions} from './fuiMapBuildStages';
import {isFuiChinaCountry,isFuiHainanFeature,resolveFuiMapOpticalRegion,wrapFuiOpticalLongitude,type FuiMapRegionContext} from './fuiMapRegion';
import {packFuiMapGeometryInput,runFuiMapGeometryWorker,unpackFuiMapGeometry,disposeFuiMapGeometry,type FuiPreparedMapGeometry} from './fuiMapGeometry';
import {getFuiSouthSeaData,createFuiSouthSeaMap,updateFuiSouthSeaMap,FUI_SOUTH_SEA_GLASS_LEVELS} from './fuiSouthSeaMap';

export type FuiGeographicGlassOptions=FuiMapBuildOptions&FuiMapRegionContext&{floatTargets?:boolean;reflectionSamples?:number;surface?:'smooth-glass'|'terrain-glass';textures?:FuiMapTextures;onProjectionReady?:(bounds:readonly[number,number,number,number])=>void};
type LocalPolygon=THREE.Vector2[][];
type PreparedRegion={key:string;feature:GeoFeature;polygons:LocalPolygon[]};
export type FuiGeographicGlassRegion={
  key:string;feature:GeoFeature;group:THREE.Group;
  coat:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  interactive:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  clearCoat?:THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial>;
};

/** Reuse the standalone 860x530/28-padding longitude unit so its 32-unit slab
 * and 2.6-unit engraving keep their original regional proportions. The adapter
 * still maps XY exactly to conformal Mercator, without a dashboard camera/pose. */
export function createFuiGeographicGlassProjection(data:GeoFeatureCollection){
  const sources=data.features.flatMap((feature,index)=>{
    const key=String(feature.properties.adcode??feature.properties.code??feature.properties.id??feature.properties.fullname??feature.properties.name??index);
    if(key.endsWith('_JD'))return[];
    const source=feature.geometry.type==='Polygon'?[feature.geometry.coordinates as Position[][]]:feature.geometry.coordinates as Position[][][];
    const polygons=source.flatMap(rings=>{
      const outer=cleanOverlayRing(rings[0]??[]);if(outer.length<3)return[];
      const holes=rings.slice(1).map(cleanOverlayRing).filter(ring=>ring.length>=3).map(ring=>{
        const shift=Math.round((outer[0][0]-ring[0][0])/360)*360;
        return ring.map(([x,y])=>[x+shift,y] as Position);
      });
      return[[outer,...holes]];
    });
    return polygons.length?[{key,feature,polygons}]:[];
  });
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  let minLon=Infinity,minLat=Infinity,maxLon=-Infinity,maxLat=-Infinity;
  for(const region of sources)for(const polygon of region.polygons)for(const point of polygon[0]){
    const m=overlayMercator(point);minX=Math.min(minX,m.x);maxX=Math.max(maxX,m.x);minY=Math.min(minY,m.y);maxY=Math.max(maxY,m.y);
    minLon=Math.min(minLon,point[0]);maxLon=Math.max(maxLon,point[0]);minLat=Math.min(minLat,point[1]);maxLat=Math.max(maxLat,point[1]);
  }
  if(!sources.length){minX=maxX=minY=maxY=.5;minLon=minLat=0;maxLon=maxLat=1;}
  const anchor={x:(minX+maxX)/2,y:(minY+maxY)/2};
  // Cleaned outer longitudes already follow each polygon's short dateline arc.
  // The denominator floor is the original standalone degenerate-span policy.
  const mapScale=Math.min((860-56)/Math.max(.0001,maxLon-minLon),(530-56)/Math.max(.0001,maxLat-minLat));
  const scale=1/(360*mapScale);
  const project=(position:Position)=>{
    const m=overlayMercator(position);return new THREE.Vector2((m.x-anchor.x)/scale,(anchor.y-m.y)/scale);
  };
  const regions:PreparedRegion[]=sources.map(region=>({...region,polygons:region.polygons.map(polygon=>polygon.map(ring=>ring.map(project)))}));
  const metresPerUnit=scale/overlayMercator([0,overlayLatitude(anchor.y)]).metersToMercator;
  return{anchor,scale,regions,project,geographicBounds:[minLon,minLat,maxLon,maxLat] as const,depthMeters:(FUI_MAP_GLASS_LEVELS.top-FUI_MAP_GLASS_LEVELS.bottom)*metresPerUnit};
}

function makeShape(rings:LocalPolygon){
  const outer=rings[0].map(point=>point.clone());
  if(!THREE.ShapeUtils.isClockWise(outer))outer.reverse();
  const shape=new THREE.Shape(outer);
  for(const source of rings.slice(1)){
    const ring=source.map(point=>point.clone());
    if(THREE.ShapeUtils.isClockWise(ring))ring.reverse();
    shape.holes.push(new THREE.Path(ring));
  }
  return shape;
}
function pointInRing(x:number,y:number,ring:THREE.Vector2[]){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
function internalEdgePredicate(regions:PreparedRegion[]){
  const cell=32,grid=new Map<string,LocalPolygon[]>(),counts=new Map<string,number>(),cache=new Map<string,boolean>();
  const key=(a:THREE.Vector2,b:THREE.Vector2)=>{
    const from=`${a.x.toFixed(5)},${a.y.toFixed(5)}`,to=`${b.x.toFixed(5)},${b.y.toFixed(5)}`;
    return from<to?`${from}|${to}`:`${to}|${from}`;
  };
  for(const region of regions)for(const polygon of region.polygons){
    const bounds=new THREE.Box2().setFromPoints(polygon[0]);
    for(let x=Math.floor(bounds.min.x/cell);x<=Math.floor(bounds.max.x/cell);x++)for(let y=Math.floor(bounds.min.y/cell);y<=Math.floor(bounds.max.y/cell);y++){
      const id=`${x},${y}`,list=grid.get(id);if(list)list.push(polygon);else grid.set(id,[polygon]);
    }
    for(const ring of polygon)for(let i=0;i<ring.length;i++){
      const id=key(ring[i],ring[(i+1)%ring.length]);counts.set(id,(counts.get(id)??0)+1);
    }
  }
  const onLand=(x:number,y:number)=>(grid.get(`${Math.floor(x/cell)},${Math.floor(y/cell)}`)??[])
    .some(polygon=>pointInRing(x,y,polygon[0])&&!polygon.slice(1).some(ring=>pointInRing(x,y,ring)));
  return(a:THREE.Vector2,b:THREE.Vector2)=>{
    const id=key(a,b),cached=cache.get(id);if(cached!==undefined)return cached;
    if((counts.get(id)??0)>1){cache.set(id,true);return true;}
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<.001){cache.set(id,false);return false;}
    const offset=Math.min(.05,length*.2),mx=(a.x+b.x)/2,my=(a.y+b.y)/2,nx=-dy/length*offset,ny=dx/length*offset;
    const shared=onLand(mx+nx,my+ny)&&onLand(mx-nx,my-ny);cache.set(id,shared);return shared;
  };
}

function createInternalWalls(rings:THREE.Vector2[][],material:THREE.ShaderMaterial,keep:(a:THREE.Vector2,b:THREE.Vector2)=>boolean){
  const positions:number[]=[],indices:number[]=[];
  for(const ring of rings)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];if(!keep(a,b))continue;
    const offset=positions.length/3;
    positions.push(a.x,a.y,44,b.x,b.y,44,b.x,b.y,24,a.x,a.y,24);
    indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  if(positions.length){geometry.boundingBox!.min.z-=28;geometry.boundingBox!.max.z+=26;geometry.boundingSphere=geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());}
  const mesh=new THREE.Mesh(geometry,material);mesh.name='fui-glass-internal-wall';mesh.renderOrder=6;mesh.visible=false;return mesh;
}
function createRegionEdges(rings:THREE.Vector2[][],terrain:FuiTerrainState,skin:FuiEarthSkinId,smooth=true){
  const points:number[]=[];
  for(const ring of rings)for(let i=0;i<ring.length;i++)for(const p of [ring[i],ring[(i+1)%ring.length]])points.push(p.x,p.y,44.65);
  const geometry=new LineSegmentsGeometry();geometry.setPositions(points);
  const group=new THREE.Group();group.name='fui-glass-region-edges';group.userData.fuiSmoothBoundary=smooth;
  const coreMaterial=new LineMaterial({color:getFuiMapMaterialPalette(skin,smooth?'shared':'entity').inner,linewidth:smooth?1.15:1.25,worldUnits:false,transparent:true,opacity:.92,alphaToCoverage:true,depthTest:true,depthWrite:false});
  bindFuiTerrainLine(coreMaterial,terrain);
  const core=new LineSegments2(geometry,coreMaterial);core.name='fui-glass-region-edge-core';core.renderOrder=10;
  const haloMaterial=new LineMaterial({color:getFuiMapMaterialPalette(skin,smooth?'shared':'entity').inner,linewidth:3.4,worldUnits:false,transparent:true,opacity:0,blending:THREE.AdditiveBlending,alphaToCoverage:false,depthTest:true,depthWrite:false});
  bindFuiTerrainLine(haloMaterial,terrain);
  const halo=new LineSegments2(geometry,haloMaterial);halo.name='fui-glass-region-edge-halo';halo.renderOrder=9;halo.visible=false;
  group.add(halo,core);return group;
}
function createOuterRims(shapes:THREE.Shape[],ownerAt:(x:number,y:number)=>string){
  const byOwner=new Map<string,number[]>(),rims=new Map<string,THREE.Group>();
  for(const shape of shapes){
    if(Math.abs(THREE.ShapeUtils.area(shape.getPoints()))<120)continue;
    const ring=shape.getPoints();
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],key=ownerAt((a.x+b.x)/2,(a.y+b.y)/2),points=byOwner.get(key)??[];
      points.push(a.x,a.y,44.18,b.x,b.y,44.18);byOwner.set(key,points);
    }
  }
  for(const [key,points]of byOwner){
    const geometry=new LineSegmentsGeometry();geometry.setPositions(points);
    const coreMaterial=new LineMaterial({color:0xffffff,linewidth:1.65,worldUnits:false,transparent:true,opacity:.98,depthTest:true,depthWrite:false});
    const core=new LineSegments2(geometry,coreMaterial);core.name='fui-glass-outer-rim';core.renderOrder=10;
    const haloMaterial=new LineMaterial({color:0xffffff,linewidth:3.4,worldUnits:false,transparent:true,opacity:.18,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const halo=new LineSegments2(geometry,haloMaterial);halo.name='fui-glass-outer-halo';halo.renderOrder=9;
    const group=new THREE.Group();group.name='fui-glass-outer-edge';group.add(halo,core);rims.set(key,group);
  }
  return rims;
}
function createBottomRim(shapes:THREE.Shape[]){
  const points:number[]=[];
  for(const shape of shapes){
    if(Math.abs(THREE.ShapeUtils.area(shape.getPoints()))<120)continue;
    for(const ring of [shape.getPoints(),...shape.holes.map(hole=>hole.getPoints())])for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];points.push(a.x,a.y,12.08,b.x,b.y,12.08);
    }
  }
  const geometry=new LineSegmentsGeometry();geometry.setPositions(points);
  const material=new LineMaterial({linewidth:.9,worldUnits:false,transparent:true,opacity:.78,depthTest:true,depthWrite:false});
  const rim=new LineSegments2(geometry,material);rim.name='fui-glass-bottom-rim';rim.renderOrder=7;return rim;
}

function nativeGlassRegions(projection:ReturnType<typeof createFuiGeographicGlassProjection>,chinaCountry:boolean){
  const {anchor,scale}=projection;
  return chinaCountry?projection.regions.map(region=>isFuiHainanFeature(region.feature)?{...region,polygons:region.polygons.filter(polygon=>polygon[0].some(point=>overlayLatitude(anchor.y-point.y*scale)>=17.5))}:region):projection.regions;
}
type FuiPreparedGeographicGeometry={projection:ReturnType<typeof createFuiGeographicGlassProjection>;geometry?:FuiPreparedMapGeometry;consumed:boolean};

/** Same native optical materials, geometry levels, outlines and selection body
 * as the standalone terrain or smooth map. The caller owns camera/context/repaint and the
 * borrowed PMREM. This factory owns only its geometry/materials/local atlases. */
function* createFuiMapGeographicGlassStages(data:GeoFeatureCollection,initialSkin:FuiEarthSkinId,environment:THREE.Texture|undefined,viewport:{width:number;height:number},quality:MapQuality='balanced',context:FuiGeographicGlassOptions={},prepared?:FuiPreparedGeographicGeometry){
  const projection=prepared?.projection??createFuiGeographicGlassProjection(data),{anchor,scale}=projection;
  const textured=context.surface==='terrain-glass';
  if(textured&&!context.textures)throw new Error('Terrain glass requires prepared native textures; use createFuiMapGeographicGlassAsync or supply textures');
  const chinaCountry=isFuiChinaCountry(data,context);
  // Keep the original geographic transform and mainland scale. The remote
  // archipelago is modeled separately at the same native 12–44 glass levels.
  const nativeRegions=nativeGlassRegions(projection,chinaCountry);
  const optics=resolveFuiMapOpticalRegion(data,context);
  const opticalPosition=projection.project([wrapFuiOpticalLongitude(optics.center.longitude,anchor.x*360-180),optics.center.latitude]);
  const opticalCenter=new THREE.Vector3(opticalPosition.x,opticalPosition.y,FUI_MAP_GLASS_LEVELS.top);
  let skin=initialSkin,disposed=false,viewportWidth=0,viewportHeight=0;
  let floatTargetsAllowed=context.floatTargets??Boolean(environment);
  const root=new THREE.Group();root.name='fui-geographic-native-glass';root.userData.fuiSurfaceFamily=textured?'terrain':'hologram';root.userData.fuiMaterialSource=textured?'fui-native-terrain-glass':'fui-native-smooth-glass';
  let edgeFieldOwned:FuiMapEdgeField|undefined,terrainOwned:FuiTerrainState|undefined,reflectionOwned:ReturnType<typeof createFuiMapReflection>|undefined;
  let delivered=false;
  try{
  yield;
  const ownerRegions=nativeRegions.map(region=>({name:region.key,rings:region.polygons.flat()}));
  const footprint=prepared?.geometry?.footprint??(yield* createFuiMapGlassFootprintStages(nativeRegions.flatMap(region=>region.polygons.map(polygon=>polygon.map(ring=>ring.map(point=>[point.x,point.y] as [number,number]))))));
  // Only an empty real data set uses an empty atlas; no placeholder geography.
  const edgeField:FuiMapEdgeField=footprint.length?(yield* createFuiMapEdgeFieldStages(footprint,ownerRegions)):{
    texture:new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1),bounds:new THREE.Vector4(-.5,-.5,1,1),
  };
  edgeFieldOwned=edgeField;
  if(!footprint.length){edgeField.texture.colorSpace=THREE.NoColorSpace;edgeField.texture.needsUpdate=true;}
  // Smooth glass remains DEM-free. Terrain borrows the original relief and
  // photograph with an explicit inverse-Mercator transform in shader and CPU
  // raycasts, so the shared geographic camera cannot distort latitude sampling.
  const geoTransform=new THREE.Vector4(scale,-scale,anchor.x,anchor.y);
  const terrain=textured?createFuiTerrainState(edgeField,geoTransform,context.textures!.relief,chinaCountry||context.scope==='country',context.textures!.reliefBounds,true):createFuiFlatTerrainState(edgeField,geoTransform);
  terrainOwned=terrain;yield;
  root.userData.fuiEdgeField=edgeField;root.userData.fuiTerrain=terrain;
  const palette=getFuiMapMaterialPalette(skin,textured?'entity':'shared');
  const bodyGeometry=prepared?.geometry?.body??(yield* createFuiMapGlassBodyGeometryStages(footprint,ownerRegions));
  const sideMaterial=createFuiMapSideGradientMaterial({accent:palette.sideTop,sideMid:palette.sideMid,sideBottom:palette.sideBottom});sideMaterial.uniforms.uGlass.value=1;
  const body=createFuiMapGlassBodyFromGeometry(bodyGeometry,sideMaterial,environment,{batchAdditiveCoats:true,batchSortedCores:true});root.add(body);if(prepared)prepared.consumed=true;sideMaterial.dispose();yield;
  const wallFootprint=body.userData.fuiWallFootprint??footprint;
  const ownerAt=createFuiGlassWallOwnerLookup(ownerRegions),rims=createOuterRims(wallFootprint,ownerAt);
  const bottomRim=createBottomRim(wallFootprint);root.add(bottomRim);
  const keepInternal=internalEdgePredicate(nativeRegions),regions:FuiGeographicGlassRegion[]=[];
  const pickMeshes:THREE.Mesh[]=[];let maritime:THREE.Group|undefined;
  const southSeaCounts={islands:0,segments:0};
  const lifts=new Map<string,number>();
  const lightCenter=new THREE.Vector3(edgeField.bounds.x+edgeField.bounds.z*.5,edgeField.bounds.y+edgeField.bounds.w*.5,44);
  const lightPosition=lightCenter.clone().add(new THREE.Vector3(-edgeField.bounds.z*.65,edgeField.bounds.w*.45,edgeField.bounds.z*.70));
  const lightReferenceDistance=lightCenter.distanceTo(lightPosition);yield;
  for(const source of nativeRegions){
    const group=new THREE.Group();group.userData.featureName=String(source.feature.properties.fullname??source.feature.properties.name??source.key);group.userData.baseZ=0;group.userData.targetZ=0;
    root.add(group);lifts.set(source.key,0);
    for(const wall of [...body.children])if(wall.userData.fuiWallOwner===source.key)group.add(wall);
    const rim=rims.get(source.key);if(rim)group.add(rim);
    const innerMaterial=createFuiMapSideGradientMaterial({accent:palette.sideTop,sideMid:palette.sideMid,sideBottom:palette.sideBottom},0);innerMaterial.uniforms.uGlass.value=1;
    bindFuiTerrainSideWall(innerMaterial,terrain);group.add(createInternalWalls(source.polygons.flat(),innerMaterial,keepInternal));
    const shape=new THREE.ShapeGeometry(source.polygons.map(makeShape));
    const geometry=textured?refineFuiMapGeometry(shape,3.2):shape;
    if(textured){
      shape.dispose();
      const positions=geometry.getAttribute('position'),uv=new Float32Array(positions.count*2);
      for(let i=0;i<positions.count;i++){const p=fuiTerrainGeoUv(geoTransform,positions.getX(i),positions.getY(i),true);uv[i*2]=p.x;uv[i*2+1]=p.y;}
      geometry.setAttribute('geoUv',new THREE.BufferAttribute(uv,2));
    }else{geometry.computeBoundingBox();geometry.boundingBox!.min.z-=2.6;geometry.boundingSphere=geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());}
    const material=textured?createFuiMapSurface(skin,terrain,context.textures!):createFuiMapHologramSurface(skin,terrain,environment);
    let clearCoat:FuiGeographicGlassRegion['clearCoat'];
    if(textured){
      const glassMaterial=createFuiMapGlassMaterial(environment);bindFuiMapGlassGlow(glassMaterial,edgeField,skin);bindFuiTerrainGlass(glassMaterial,terrain);
      clearCoat=new THREE.Mesh(geometry,glassMaterial);clearCoat.name='fui-glass-clear-coat';clearCoat.position.z=44.12;clearCoat.renderOrder=8;group.add(clearCoat);
    }else{
      // Shared-context XY is true Mercator; configure the optical frame before
      // cloning the backing so both surfaces retain the same uniform objects.
      Object.assign(material.uniforms,createFuiMapCapOpticsUniforms('mercator',optics.center,optics.angularScale));
      material.uniforms.uMapScale.value=1/(360*scale);material.uniforms.uGlassLightPosition.value.copy(lightPosition);material.uniforms.uGlassLightReferenceDistance.value=lightReferenceDistance;
      const backing=new THREE.Mesh(geometry,createFuiMapHologramBacking(material));backing.name='fui-hologram-region-backing';backing.position.z=44;backing.renderOrder=4.5;group.add(backing);
    }
    const coat=new THREE.Mesh(geometry,material);coat.name=textured?'fui-terrain-region-surface':'fui-hologram-region-coat';coat.position.z=44;coat.renderOrder=6;
    coat.userData.overlayKey=source.key;coat.userData.featureCode=source.key;coat.userData.featureName=group.userData.featureName;coat.userData[textured?'texturedSurface':'hologramSurface']=material;coat.userData.baseZ=44;
    if(textured)bindFuiTerrainRaycast(coat,geometry,terrain);
    group.add(coat,createRegionEdges(source.polygons.flat(),terrain,skin,!textured));regions.push({key:source.key,feature:source.feature,group,coat,interactive:coat,clearCoat});pickMeshes.push(coat);
    yield;
  }
  if(chinaCountry){
    const hainan=regions.find(region=>isFuiHainanFeature(region.feature));
    if(hainan){
      const seaData=getFuiSouthSeaData(data,context);
      const seaSide=createFuiMapSideGradientMaterial({accent:palette.sideTop,sideMid:palette.sideMid,sideBottom:palette.sideBottom});
      try{maritime=createFuiSouthSeaMap(seaData,coord=>{const p=projection.project(coord);return new THREE.Vector3(p.x,p.y,0);},environment,viewport,seaSide,textured?undefined:{terrain,skin,reference:hainan.coat.material},FUI_SOUTH_SEA_GLASS_LEVELS);}
      finally{seaSide.dispose();}
      southSeaCounts.islands=seaData.islands.length;southSeaCounts.segments=seaData.segments.length;
      root.add(maritime);const island=maritime.userData.fuiSouthSea.islandMesh as THREE.Mesh;island.userData.overlayKey=hainan.key;pickMeshes.push(island);yield;
    }
  }
  const ambient=new THREE.AmbientLight(mapTheme.ambientLight,1.45);root.add(ambient);
  const directional=new THREE.DirectionalLight(mapTheme.directionalLight,2.4);directional.position.set(120,-240,420);directional.castShadow=false;root.add(directional);
  let reflection:ReturnType<typeof createFuiMapReflection>;
  function configureReflection(){
    const enabled=footprint.length>0&&floatTargetsAllowed&&browserMapQualityBudget(quality).reflection;
    if(!enabled){
      if(reflection){
        reflection.removeFromParent();reflection.getRenderTarget().dispose();reflection.geometry.dispose();for(const material of Array.isArray(reflection.material)?reflection.material:[reflection.material])material.dispose();
        reflection=undefined;reflectionOwned=undefined;
      }
      return;
    }
    if(!reflection){
      const next=createFuiMapReflection(edgeField,viewportWidth||viewport.width,viewportHeight||viewport.height,1,quality,floatTargetsAllowed,context.reflectionSamples??0);
      if(!next)return;reflection=next;reflectionOwned=next;root.add(next);
      // A virtual camera has its own pixels. Never sample the main basemap
      // through that camera, including a mirror lazily enabled after low mode.
      const renderReflection=next.onBeforeRender;
      next.onBeforeRender=(...args)=>{
        const states=textured?[]:regions.map(region=>region.coat.material.uniforms.uHasGlassBackdrop.value as number);
        if(!textured)for(const region of regions)region.coat.material.uniforms.uHasGlassBackdrop.value=0;
        try{renderReflection.apply(next,args);}
        finally{if(!textured)regions.forEach((region,index)=>{region.coat.material.uniforms.uHasGlassBackdrop.value=states[index];});}
      };
    }
    reflection.visible=true;
    resizeFuiMapReflection(reflection,viewportWidth||viewport.width,viewportHeight||viewport.height,1,quality);
  }
  configureReflection();
  root.traverse(object=>{if(object!==reflection)object.layers.enable(FUI_MAP_REFLECTION_LAYER);});

  function updateRegion(region:FuiGeographicGlassRegion){
    const lift=(lifts.get(region.key)??0)*16,selected=THREE.MathUtils.smoothstep(lift,0,12),colors=getFuiMapMaterialPalette(skin,textured?'entity':'shared');
    region.group.position.z=lift;region.group.userData.targetZ=lift;
    if(maritime&&region.key===String(maritime.userData.fuiSouthSea.islandMesh.userData.overlayKey)){maritime.userData.fuiSouthSea.islandGroup.position.z=lift;updateFuiSouthSeaMap(maritime,skin,true,textured?'entity':'shared');}
    if(textured){updateFuiMapSurface(region.coat.material,skin,selected);if(region.clearCoat)updateFuiMapGlassGlow(region.clearCoat.material,skin,selected,1);}
    else{region.coat.material.uniforms.uGlassDepth.value=32+lift;updateFuiMapHologramSurface(region.coat.material,skin,selected);}
    region.group.traverse(object=>{
      if(object.userData.fuiWallLift)object.userData.fuiWallLift.value=lift;
      if(object.name==='fui-glass-internal-wall'){
        object.visible=lift>.005;const material=(object as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>).material;
        material.uniforms.uLift.value=lift;material.uniforms.alpha.value=.9*THREE.MathUtils.smoothstep(lift,0,.3);
      }
      if(object instanceof THREE.Mesh&&object.material instanceof THREE.ShaderMaterial&&object.material.userData.fuiSide){
        const uniforms=object.material.uniforms;uniforms.uGlass.value=1;uniforms.uSelection.value=selected;
        uniforms.topColor.value.copy(colors.sideTop);uniforms.midColor.value.copy(colors.sideMid);uniforms.bottomColor.value.copy(colors.sideBottom);
      }
      if(object instanceof LineSegments2){
        const material=object.material;
        if(object.name==='fui-glass-region-edge-core'){
          material.color.copy(colors.inner).lerp(colors.outer,selected).multiplyScalar(textured?1:THREE.MathUtils.lerp(1.25,1,selected));material.linewidth=textured?THREE.MathUtils.lerp(1.25,1.75,selected):THREE.MathUtils.lerp(1.15,1.55,selected);
        }else if(object.name==='fui-glass-region-edge-halo'){
          object.visible=selected>.001;material.color.copy(colors.inner);material.linewidth=3.4;material.opacity=.18*selected;
        }else if(object.name==='fui-glass-outer-rim'){
          material.color.copy(getFuiMapOuterContourColor(skin,textured?'entity':'shared'));material.linewidth=THREE.MathUtils.lerp(1.65,1.85,selected);
        }else if(object.name==='fui-glass-outer-halo'){
          material.color.copy(colors.inner);material.linewidth=THREE.MathUtils.lerp(3.4,3.8,selected);material.opacity=THREE.MathUtils.lerp(.18,.23,selected);
        }
      }
    });
    region.group.updateMatrixWorld(true);
  }
  function updateSkin(next:FuiEarthSkinId){
    if(disposed)return;skin=next;
    for(const region of regions)updateRegion(region);
    bottomRim.material.color.copy(getFuiMapMaterialPalette(skin,textured?'entity':'shared').inner).multiplyScalar(.70);
  }
  function updateHover(key:string,normalized:number){
    if(disposed)return;
    if(!key){for(const region of regions){lifts.set(region.key,0);updateRegion(region);}return;}
    const region=regions.find(region=>region.key===key);if(!region)return;
    const value=THREE.MathUtils.clamp(Number.isFinite(normalized)?normalized:0,0,1);
    if(lifts.get(key)===value)return;
    lifts.set(key,value);updateRegion(region);
  }
  function setViewport(width:number,height:number){
    if(disposed)return;
    width=Math.max(1,width);height=Math.max(1,height);
    if(viewportWidth===width&&viewportHeight===height)return;
    viewportWidth=width;viewportHeight=height;
    root.traverse(object=>{if(object instanceof LineSegments2)object.material.resolution.set(width,height);});
    resizeFuiMapReflection(reflection,width,height,1,quality);
  }
  function setQuality(next:MapQuality){
    if(disposed||quality===next)return;quality=next;
    configureReflection();
  }
  function setFloatTargets(allowed:boolean){
    if(disposed||floatTargetsAllowed===allowed)return;floatTargetsAllowed=allowed;configureReflection();
  }
  function setBackdrop(texture:THREE.Texture|undefined,width:number,height:number,projection:THREE.Matrix4){
    if(disposed)return;
    if(!textured)for(const region of regions)setFuiMapHologramBackdrop(region.coat.material,texture,width,height,projection);
  }
  function setOpticalView(direction:THREE.Vector3){
    if(disposed)return;
    if(!textured)for(const region of regions)setFuiMapCapRestView(region.coat.material,direction);
  }
  async function prepareRegionalRelief(texture:THREE.DataTexture,signal?:AbortSignal,options:{blend?:boolean}={}){
    if(disposed||!textured||signal?.aborted)return false;
    prepareFuiTerrainRegional(terrain,texture,projection.geographicBounds);
    // Rebuild CPU hit proxies between cooperative tasks, never in a borrowed
    // draw callback. Publish the detailed GPU relief only after picking agrees.
    for(const hit of terrain.proxies){
      if(disposed||signal?.aborted)return false;
      updateFuiTerrainHitProxies({...terrain,proxies:[hit]});
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    if(disposed||signal?.aborted)return false;
    startFuiTerrainRegionalBlend(terrain,options.blend??false);
    root.userData.fuiReliefReady=true;root.userData.fuiReliefSize=texture.image.width;
    root.userData.fuiReliefBlend=terrain.uniforms.uHasRegional.value;
    return true;
  }
  function updateRegionalRelief(now:number,finishHidden=false){
    if(disposed)return false;
    if(finishHidden&&terrain.regionalBlend)startFuiTerrainRegionalBlend(terrain,false,now);
    const blending=advanceFuiTerrainRegionalBlend(terrain,now);
    root.userData.fuiReliefBlend=terrain.uniforms.uHasRegional.value;
    return blending;
  }
  let disposalStages:Generator<void,void,void>|undefined;
  function disposeStages():Generator<void,void,void>{
    if(!disposalStages){disposed=true;disposalStages=disposeFuiPreparedGeographicGlassStages(root,edgeField,terrain,reflection);}
    return disposalStages;
  }
  function dispose(){drainFuiMapBuild(disposeStages());}
  updateSkin(skin);setViewport(viewport.width,viewport.height);root.updateMatrixWorld(true);
  delivered=true;
  return{root,anchor,scale,regions,pickMeshes,southSeaCounts,opticalCenter,geographicBounds:projection.geographicBounds,prepareRegionalRelief,updateRegionalRelief,depthMeters:projection.depthMeters,edgeField,terrain,get reflection(){return reflection;},updateSkin,updateHover,setViewport,setQuality,setFloatTargets,setBackdrop,setOpticalView,dispose,disposeStages};
  }finally{if(!delivered)disposeFuiPreparedGeographicGlass(root,edgeFieldOwned,terrainOwned,reflectionOwned);}
}

function* disposeFuiPreparedGeographicGlassStages(root:THREE.Group,edgeField?:FuiMapEdgeField,terrain?:FuiTerrainState,reflection?:ReturnType<typeof createFuiMapReflection>):Generator<void,void,void>{
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),batches=new Set<THREE.BatchedMesh>();
  root.traverse(object=>{
    if(object instanceof THREE.BatchedMesh)batches.add(object);
    if(object instanceof THREE.Mesh||object instanceof THREE.Line){if(!(object instanceof THREE.BatchedMesh))geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}
  });
  if(reflection){reflection.getRenderTarget().dispose();yield;}
  for(const batch of batches){batch.dispose();yield;}
  for(const geometry of geometries){geometry.dispose();yield;}
  for(const material of materials){material.dispose();yield;}
  for(const hit of terrain?.proxies??[]){hit.proxy.geometry.dispose();yield;(hit.proxy.material as THREE.Material).dispose();yield;}
  if(edgeField){edgeField.texture.dispose();yield;}
  if(terrain?.heightTexture){terrain.heightTexture.dispose();yield;}
  root.removeFromParent();root.clear();
}
function disposeFuiPreparedGeographicGlass(root:THREE.Group,edgeField?:FuiMapEdgeField,terrain?:FuiTerrainState,reflection?:ReturnType<typeof createFuiMapReflection>){
  drainFuiMapBuild(disposeFuiPreparedGeographicGlassStages(root,edgeField,terrain,reflection));
}
/** Synchronous low-level API retained for already prepared/testing consumers. */
export function createFuiMapGeographicGlass(data:GeoFeatureCollection,skin:FuiEarthSkinId,environment:THREE.Texture|undefined,viewport:{width:number;height:number},quality:MapQuality='balanced',context:FuiGeographicGlassOptions={}){
  return drainFuiMapBuild(createFuiMapGeographicGlassStages(data,skin,environment,viewport,quality,context));
}
/** Worker geometry and native texture acquisition run together. Main-thread
 * material/atlas work remains cooperative; no GL state spans an await. */
export async function createFuiMapGeographicGlassAsync(data:GeoFeatureCollection,skin:FuiEarthSkinId,environment:THREE.Texture|undefined,viewport:{width:number;height:number},quality:MapQuality='balanced',options:FuiGeographicGlassOptions={}){
  const check=()=>{if(options.signal?.aborted)throw new DOMException('Map preparation aborted','AbortError');};check();
  const projection=createFuiGeographicGlassProjection(data);
  options.onProjectionReady?.(projection.geographicBounds);check();
  const texturesReady=options.surface==='terrain-glass'&&!options.textures?waitForFuiMapTexturesReady(projection.geographicBounds):Promise.resolve(options.textures);
  const geometryReady=typeof Worker==='undefined'?Promise.resolve(undefined):runFuiMapGeometryWorker(
    packFuiMapGeometryInput(nativeGlassRegions(projection,isFuiChinaCountry(data,options))),options.signal,
    ()=>new Worker(new URL('./fuiMapGeometry.worker.ts',import.meta.url),{type:'module'}));
  const [textures,packed]=await Promise.all([texturesReady,geometryReady]);check();
  const prepared:FuiPreparedGeographicGeometry={projection,geometry:packed?unpackFuiMapGeometry(packed):undefined,consumed:false};
  try{
    const result=await runFuiMapBuild(createFuiMapGeographicGlassStages(data,skin,environment,viewport,quality,{...options,textures},prepared),options);
    if(options.signal?.aborted){result.dispose();check();}
    return result;
  }finally{if(prepared.geometry&&!prepared.consumed)disposeFuiMapGeometry(prepared.geometry);}
}
