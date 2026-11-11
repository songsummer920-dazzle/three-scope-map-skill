// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import {createFuiMapWallBatch} from './fuiMapWallBatch';
import polygonClipping, {type Polygon} from 'polygon-clipping';
import {mergeGeometries,mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {drainFuiMapBuild,runFuiMapBuild,type FuiMapBuildOptions} from './fuiMapBuildStages';

// A smooth optical cover above the geographic engraving, shared by all palettes.
export const FUI_MAP_GLASS_DEPTH=2.6;
// Geographic engraving belongs immediately under the polished upper face.
// Optical ray thickness must not lower actual terrain into a separate shelf.
export const FUI_MAP_RELIEF_INSET=.3;
// Native administrative slab. Remote cartographic models share its upper
// datum and use the shallower explicit LOD levels in fuiSouthSeaMap.ts.
export const FUI_MAP_GLASS_LEVELS=Object.freeze({bottom:12,top:44});

/** Union actual projected administrative polygons into a single glass body.
 * Regional meshes remain separate for raycasting and the original hover lift. */
export function* createFuiMapGlassFootprintStages(polygons:Polygon[]):Generator<void,THREE.Shape[],void>{
  if(!polygons.length)return [];
  let merged=polygonClipping.union(polygons[0],...polygons.slice(1,8));yield;
  for(let offset=8;offset<polygons.length;offset+=8){
    merged=polygonClipping.union(merged,...polygons.slice(offset,offset+8));yield;
  }
  return shapesFromFuiMapGlassUnion(merged);
}

/** The worker can union all input polygons once without blocking the main thread. */
export function createFuiMapGlassFootprintOneShot(polygons:Polygon[]){
  return polygons.length?shapesFromFuiMapGlassUnion(polygonClipping.union(polygons[0],...polygons.slice(1))):[];
}
function shapesFromFuiMapGlassUnion(merged:ReturnType<typeof polygonClipping.union>){
  return merged.map(polygon=>{
    const rings=polygon.map(ring=>ring.map(p=>new THREE.Vector2(p[0],p[1])));
    if(!THREE.ShapeUtils.isClockWise(rings[0]))rings[0].reverse();
    const shape=new THREE.Shape(rings[0]);
    for(const ring of rings.slice(1)){
      if(THREE.ShapeUtils.isClockWise(ring))ring.reverse();
      shape.holes.push(new THREE.Path(ring));
    }
    return shape;
  });
}

export function createFuiMapGlassFootprint(polygons:Polygon[]){return drainFuiMapBuild(createFuiMapGlassFootprintStages(polygons));}
export function createFuiMapGlassFootprintAsync(polygons:Polygon[],options:FuiMapBuildOptions={}){
  return runFuiMapBuild(createFuiMapGlassFootprintStages(polygons),options);
}

export interface FuiGlassWallRegion {name:string;rings:THREE.Vector2[][]}

/** Nearest real administrative boundary, using a local spatial index. This is
 * shared by exterior walls, silhouette segments and the existing chase path. */
export function createFuiGlassWallOwnerLookup(regions:FuiGlassWallRegion[]){
  type Edge={ax:number;ay:number;bx:number;by:number;name:string};
  const edges:Edge[]=[];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const region of regions)for(const ring of region.rings){
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      if(!a||!b||a.distanceToSquared(b)<1e-16)continue;
      edges.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,name:region.name});
      minX=Math.min(minX,a.x,b.x);maxX=Math.max(maxX,a.x,b.x);
      minY=Math.min(minY,a.y,b.y);maxY=Math.max(maxY,a.y,b.y);
    }
  }
  if(!edges.length)return (_x:number,_y:number)=>regions[0]?.name??'';
  const cellSize=Math.max(2,Math.min(24,Math.sqrt(Math.max(1,(maxX-minX)*(maxY-minY))/edges.length)*5));
  const grid=new Map<string,number[]>();
  const key=(x:number,y:number)=>`${x},${y}`;
  for(let i=0;i<edges.length;i++){
    const e=edges[i];
    const x0=Math.floor(Math.min(e.ax,e.bx)/cellSize),x1=Math.floor(Math.max(e.ax,e.bx)/cellSize);
    const y0=Math.floor(Math.min(e.ay,e.by)/cellSize),y1=Math.floor(Math.max(e.ay,e.by)/cellSize);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
      const k=key(x,y),bucket=grid.get(k);if(bucket)bucket.push(i);else grid.set(k,[i]);
    }
  }
  const minCellX=Math.floor(minX/cellSize),maxCellX=Math.floor(maxX/cellSize);
  const minCellY=Math.floor(minY/cellSize),maxCellY=Math.floor(maxY/cellSize);
  return (x:number,y:number)=>{
    if(!Number.isFinite(x)||!Number.isFinite(y))return regions[0]?.name??'';
    const cx=THREE.MathUtils.clamp(Math.floor(x/cellSize),minCellX,maxCellX);
    const cy=THREE.MathUtils.clamp(Math.floor(y/cellSize),minCellY,maxCellY),seen=new Set<number>();
    const maxRadius=Math.max(cx-minCellX,maxCellX-cx,cy-minCellY,maxCellY-cy);
    let best=Infinity,owner=regions[0]?.name??'';
    for(let radius=0;radius<=maxRadius;radius++){
      for(let ix=cx-radius;ix<=cx+radius;ix++)for(let iy=cy-radius;iy<=cy+radius;iy++){
        if(radius&&ix>cx-radius&&ix<cx+radius&&iy>cy-radius&&iy<cy+radius)continue;
        for(const index of grid.get(key(ix,iy))??[]){
          if(seen.has(index))continue;seen.add(index);
          const e=edges[index],dx=e.bx-e.ax,dy=e.by-e.ay;
          const t=THREE.MathUtils.clamp(((x-e.ax)*dx+(y-e.ay)*dy)/(dx*dx+dy*dy),0,1);
          const distance=(x-e.ax-t*dx)**2+(y-e.ay-t*dy)**2;
          if(distance<best){best=distance;owner=e.name;}
        }
      }
      // Every unvisited edge is outside this square. Stop only once none can
      // be closer, including queries beside a cell boundary or a sharp bevel.
      const outside=Math.max(0,Math.min(x-(cx-radius)*cellSize,(cx+radius+1)*cellSize-x,
        y-(cy-radius)*cellSize,(cy+radius+1)*cellSize-y));
      if(best<=outside*outside)return owner;
    }
    return owner;
  };
}

/** Boolean union removes collinear administrative junctions. Restore the real
 * source vertices before extrusion so one wall strip never spans two owners. */
function restoreFuiGlassBoundaryJunctions(shapes:THREE.Shape[],regions:FuiGlassWallRegion[]){
  if(!regions.length)return shapes;
  const cellSize=4,epsilon=1e-5,grid=new Map<string,THREE.Vector2[]>(),seen=new Set<string>();
  for(const region of regions)for(const ring of region.rings)for(const point of ring){
    const coordinate=`${point.x},${point.y}`;if(seen.has(coordinate))continue;seen.add(coordinate);
    const k=`${Math.floor(point.x/cellSize)},${Math.floor(point.y/cellSize)}`;
    const bucket=grid.get(k);if(bucket)bucket.push(point);else grid.set(k,[point]);
  }
  const restore=(source:THREE.Vector2[])=>{
    const ring=source.slice();if(ring.length>1&&ring[0].distanceToSquared(ring[ring.length-1])<1e-16)ring.pop();
    const result:THREE.Vector2[]=[];
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
      result.push(a.clone());if(length2<1e-16)continue;
      const inserted:{t:number;point:THREE.Vector2}[]=[];
      const x0=Math.floor((Math.min(a.x,b.x)-epsilon)/cellSize),x1=Math.floor((Math.max(a.x,b.x)+epsilon)/cellSize);
      const y0=Math.floor((Math.min(a.y,b.y)-epsilon)/cellSize),y1=Math.floor((Math.max(a.y,b.y)+epsilon)/cellSize);
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const point of grid.get(`${x},${y}`)??[]){
        const t=((point.x-a.x)*dx+(point.y-a.y)*dy)/length2;
        if(t<=1e-8||t>=1-1e-8)continue;
        const px=a.x+t*dx,py=a.y+t*dy;
        if((point.x-px)**2+(point.y-py)**2<=epsilon*epsilon)inserted.push({t,point});
      }
      inserted.sort((a,b)=>a.t-b.t);
      for(const candidate of inserted){
        if(result[result.length-1].distanceToSquared(candidate.point)>1e-16)result.push(candidate.point.clone());
      }
    }
    return result;
  };
  return shapes.map(shape=>{
    const restored=new THREE.Shape(restore(shape.getPoints()));
    for(const hole of shape.holes)restored.holes.push(new THREE.Path(restore(hole.getPoints())));
    return restored;
  });
}

export type FuiMapGlassBodyGeometry={
  wallFootprint:THREE.Shape[];bottom:THREE.BufferGeometry;
  walls:{owner:string;geometry:THREE.BufferGeometry}[];
};

/** Geometry only: the worker and synchronous renderer use the same extrusion,
 * normals, administrative ownership and bounds without changing optical data. */
export function* createFuiMapGlassBodyGeometryStages(shapes:THREE.Shape[],regions:FuiGlassWallRegion[]=[]):Generator<void,FuiMapGlassBodyGeometry,void>{
  const ownerAt=createFuiGlassWallOwnerLookup(regions);
  const wallFootprint=restoreFuiGlassBoundaryJunctions(shapes,regions);
  const bottom=new THREE.ShapeGeometry(wallFootprint),walls:FuiMapGlassBodyGeometry['walls']=[];
  let delivered=false;
  try{
  for(const shape of wallFootprint){
    const area=Math.abs(THREE.ShapeUtils.area(shape.getPoints()));
    const bevel=area>=120;
    const raw=new THREE.ExtrudeGeometry(shape,{depth:bevel?19.2:20,
      steps:1,bevelEnabled:bevel,bevelThickness:.4,bevelSize:.4,bevelSegments:3,curveSegments:1});
    raw.deleteAttribute('normal');raw.deleteAttribute('uv');
    const geometry=mergeVertices(raw,.0001);raw.dispose();geometry.computeVertexNormals();
    geometry.translate(0,0,bevel?24.4:24);
    const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
    for(let i=0;i<position.count;i++){
      if(position.getZ(i)>43.999)normal.setXYZ(i,0,0,1);
      else if(position.getZ(i)<24.001)normal.setXYZ(i,0,0,-1);
    }
    // Extrude material 0 holds both caps. Only the real union's material-1
    // exterior/bevel survives here: regional optical caps move with their own
    // tops, so no stationary national cap cuts across a lifted region.
    const byOwner=new Map<string,number[]>(),index=geometry.getIndex();
    const stripSize=6*(bevel?7:1);
    for(const part of geometry.groups){
      if(part.materialIndex!==1)continue;
      // ExtrudeGeometry emits all layers of one boundary edge consecutively.
      // Give its complete side quad and bevel strip one owner, rather than
      // assigning its two triangles separately across a diagonal.
      for(let offset=part.start;offset<part.start+part.count;offset+=stripSize){
        const strip:number[]=[];
        for(let i=offset;i<Math.min(offset+stripSize,part.start+part.count);i++)strip.push(index?index.getX(i):i);
        const bottom=[...new Set(strip.filter(i=>Math.abs(position.getZ(i)-24)<1e-4))];
        const source=bottom.length?bottom:strip;
        let x=0,y=0;for(const i of source){x+=position.getX(i);y+=position.getY(i);}
        const name=ownerAt(x/source.length,y/source.length),list=byOwner.get(name);
        if(list)list.push(...strip);else byOwner.set(name,strip);
      }
    }
    for(const [name,indices] of byOwner){
      const remap=new Map<number,number>(),vertices:number[]=[],normals:number[]=[],subset:number[]=[];
      for(const source of indices){
        let target=remap.get(source);
        if(target===undefined){target=remap.size;remap.set(source,target);
          vertices.push(position.getX(source),position.getY(source),position.getZ(source));
          normals.push(normal.getX(source),normal.getY(source),normal.getZ(source));}
        subset.push(target);
      }
      const wall=new THREE.BufferGeometry();wall.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      wall.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));wall.setIndex(subset);
      wall.computeBoundingBox();
      // The shader anchors the foot while its owner rises by the current
      // sixteen-unit hover lift. Include that local downward stretch in CPU
      // bounds so a grazing camera cannot cull a still-visible lower wall.
      wall.boundingBox!.min.z-=28;
      wall.boundingSphere=wall.boundingBox!.getBoundingSphere(new THREE.Sphere());
      walls.push({owner:name,geometry:wall});
    }
    geometry.dispose();yield;
  }
  delivered=true;return{wallFootprint,bottom,walls};
  }finally{if(!delivered){bottom.dispose();for(const wall of walls)wall.geometry.dispose();}}
}
export function createFuiMapGlassBodyGeometry(shapes:THREE.Shape[],regions:FuiGlassWallRegion[]=[]){
  return drainFuiMapBuild(createFuiMapGlassBodyGeometryStages(shapes,regions));
}

export function createFuiMapGlassBody(shapes:THREE.Shape[],wallMaterial:THREE.ShaderMaterial,
  environment?:THREE.Texture,regions:FuiGlassWallRegion[]=[]){
  return createFuiMapGlassBodyFromGeometry(createFuiMapGlassBodyGeometry(shapes,regions),wallMaterial,environment);
}

export function createFuiMapGlassBodyFromGeometry(prepared:FuiMapGlassBodyGeometry,wallMaterial:THREE.ShaderMaterial,
  environment?:THREE.Texture,options:{batchAdditiveCoats?:boolean;batchSortedCores?:boolean}={}){
  const group=new THREE.Group();group.name='fui-glass-continuous-body';
  const wallFootprint=prepared.wallFootprint;
  group.userData.fuiWallFootprint=wallFootprint;
  // Close only the actual geographic footprint. This is the map's own dark
  // underside, not a receiving floor or a rectangle beneath the HUD.
  const bottomMaterial=new THREE.MeshPhysicalMaterial({color:'#02060c',metalness:0,
    roughness:.12,clearcoat:.6,clearcoatRoughness:.04,
    ...(environment?{envMap:environment}:{}),envMapIntensity:.18,
    transparent:false,opacity:1,alphaTest:.01,depthWrite:true,side:THREE.DoubleSide});
  const bottom=new THREE.Mesh(prepared.bottom,bottomMaterial);
  bottom.name='fui-glass-geographic-bottom';bottom.position.z=FUI_MAP_GLASS_LEVELS.bottom;bottom.renderOrder=4;
  group.add(bottom);
  const owners=new Map<string,{group:THREE.Group;core:THREE.ShaderMaterial;coat:THREE.MeshPhysicalMaterial}>();
  const getOwner=(name:string)=>{
    let entry=owners.get(name);if(entry)return entry;
    const ownerGroup=new THREE.Group();ownerGroup.name='fui-glass-owner-wall';
    const lift={value:0};ownerGroup.userData.fuiWallOwner=name;ownerGroup.userData.fuiWallLift=lift;
    const core=wallMaterial.clone();core.transparent=true;core.side=THREE.FrontSide;
    core.uniforms.uLift=lift;
    // Reflection follows the same anchored-bottom deformation as its color
    // core. Add the optical glint without darkening the emissive gradient.
    // The map parent supplies the owner's actual, eased vertical lift.
    const coat=new THREE.MeshPhysicalMaterial({color:'#02060c',metalness:0,
      roughness:.02,clearcoat:1,clearcoatRoughness:.01,specularIntensity:1.3,
      ...(environment?{envMap:environment}:{}),envMapIntensity:1.3,
      transparent:true,opacity:.36,depthWrite:false,side:THREE.FrontSide,blending:THREE.AdditiveBlending});
    coat.userData.fuiLayerOpacity=.36;
    coat.onBeforeCompile=shader=>{
      shader.uniforms.uLift=lift;
      shader.uniforms.uFuiWallTint=core.uniforms.topColor;
      shader.vertexShader='uniform float uLift;varying float vFuiWallDepth;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal.z /= 1.6 + uLift / 20.0;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvFuiWallDepth=clamp((position.z-24.0)/20.0,0.0,1.0);\ntransformed.z=12.0+vFuiWallDepth*32.0-uLift*(1.0-vFuiWallDepth);');
      shader.fragmentShader='uniform vec3 uFuiWallTint;varying float vFuiWallDepth;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        float fuiShoulder=smoothstep(.60,.97,vFuiWallDepth);
        float fuiReflectance=mix(.08,.50,fuiShoulder);
        vec3 fuiVolumeTint=mix(uFuiWallTint,vec3(1.0),.06*smoothstep(.94,1.0,vFuiWallDepth));
        outgoingLight*=fuiVolumeTint*fuiReflectance;
        #include <opaque_fragment>
      `);
    };
    coat.customProgramCacheKey=()=> 'fui-owner-wall-depth32-v4';
    entry={group:ownerGroup,core,coat};owners.set(name,entry);group.add(ownerGroup);return entry;
  };
  const coatChunks=new Map<string,THREE.BufferGeometry[]>(),cores:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>[]=[];
  for(const {owner:name,geometry:wall} of prepared.walls){
    const owner=getOwner(name),core=new THREE.Mesh(wall,owner.core);core.renderOrder=5;
    core.name='fui-glass-exterior-core';owner.group.add(core);
    cores.push(core);
    if(options.batchAdditiveCoats){
      const chunks=coatChunks.get(name);if(chunks)chunks.push(wall);else coatChunks.set(name,[wall]);
    }else{
      const coat=new THREE.Mesh(wall,owner.coat);coat.renderOrder=8;
      coat.name='fui-glass-continuous-shell';coat.castShadow=false;owner.group.add(coat);
    }
  }
  for(const [name,chunks]of coatChunks){
    // Only the additive glint is order independent. Keep the normal-blended
    // colored cores as separate objects with their existing depth sort/culling.
    // Concatenate exact indexed triangles; never simplify small coastal islands.
    const geometry=chunks.length===1?chunks[0]:mergeGeometries(chunks,false);
    const owner=getOwner(name);
    if(geometry){
      if(chunks.length>1){
        geometry.computeBoundingBox();geometry.boundingBox!.min.z-=28;
        geometry.boundingSphere=geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
      }
      const coat=new THREE.Mesh(geometry,owner.coat);coat.renderOrder=8;
      coat.name='fui-glass-continuous-shell';coat.castShadow=false;owner.group.add(coat);
    }else{
      // A future attribute layout must keep the accepted optical path even if
      // it cannot share a buffer with another chunk.
      for(const wall of chunks){
        const coat=new THREE.Mesh(wall,owner.coat);coat.renderOrder=8;
        coat.name='fui-glass-continuous-shell';coat.castShadow=false;owner.group.add(coat);
      }
    }
  }
  if(options.batchSortedCores){const batch=createFuiMapWallBatch(cores);if(batch)group.add(batch);}
  return group;
}

export function createFuiMapGlassEnvironment(renderer:THREE.WebGLRenderer){
  const studio=new THREE.Scene();
  // A continuous, low-energy surround gives glass a gentle grazing sheen.
  // Rectangular softboxes reflected as an intrusive white sweep across the map.
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,toneMapped:false,
    vertexShader:`
      varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
    `,
    fragmentShader:`
      varying vec3 vDirection;
      void main(){
        vec3 direction=normalize(vDirection);
        float surround=mix(.008,.035,smoothstep(-.35,.9,direction.z));
        float fill=pow(max(dot(direction,normalize(vec3(-.6,.3,.85))),0.0),2.0)*.02;
        float key=pow(max(dot(direction,normalize(vec3(-.38,.78,.50))),0.0),96.0)*1.6;
        gl_FragColor=vec4(vec3(surround+fill+key),1.0);
      }
    `,
  });
  const dome=new THREE.Mesh(new THREE.SphereGeometry(40,32,16),material);studio.add(dome);
  const generator=new THREE.PMREMGenerator(renderer);
  const target=generator.fromScene(studio,.02);
  dome.geometry.dispose();material.dispose();
  generator.dispose();return target;
}

export function createFuiMapGlassMaterial(environment?:THREE.Texture){
  const material=new THREE.MeshPhysicalMaterial({
    color:'#9dc4df',metalness:0,roughness:.12,
    transmission:1,thickness:FUI_MAP_GLASS_DEPTH,ior:1.46,
    attenuationColor:'#223c4a',attenuationDistance:120,
    clearcoat:1,clearcoatRoughness:.08,specularIntensity:.8,
    ...(environment?{envMap:environment}:{}),envMapIntensity:.22,
    transparent:true,opacity:1,depthWrite:false,side:THREE.FrontSide,
  });
  // An optically clear cover refracts the native-resolution image directly.
  // Three's bicubic B-spline filter softens fine geography even at zero roughness.
  material.onBeforeCompile=shader=>{
    const transmission=THREE.ShaderChunk.transmission_pars_fragment.replace(
      'return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );',
      'return textureLod( transmissionSamplerMap, fragCoord.xy, 0.0 );',
    );
    shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_pars_fragment>',transmission);
  };
  material.customProgramCacheKey=()=> 'fui-clear-transmission-lod0-v1';
  return material;
}
