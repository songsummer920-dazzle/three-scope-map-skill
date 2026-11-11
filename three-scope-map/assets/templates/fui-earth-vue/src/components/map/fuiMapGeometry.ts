// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {Polygon} from 'polygon-clipping';
import {createFuiMapGlassFootprintOneShot,createFuiMapGlassBodyGeometry,type FuiMapGlassBodyGeometry} from './fuiMapGlass';

type PackedRing=Float64Array;
type PackedShape=PackedRing[];
type GeometryArray=Float32Array|Uint16Array|Uint32Array;
type PackedAttribute={array:GeometryArray;itemSize:number;normalized:boolean};
type PackedGeometry={attributes:Record<string,PackedAttribute>;index:PackedAttribute|null;groups:THREE.BufferGeometry['groups'];box:number[]|null;sphere:number[]|null};
export type FuiMapGeometryInput={regions:{name:string;polygons:PackedShape[]}[]};
export type FuiMapGeometryOutput={footprint:PackedShape[];wallFootprint:PackedShape[];bottom:PackedGeometry;walls:{owner:string;geometry:PackedGeometry}[]};
export type FuiPreparedMapGeometry={footprint:THREE.Shape[];body:FuiMapGlassBodyGeometry};

function packRing(ring:THREE.Vector2[]){const data=new Float64Array(ring.length*2);for(let i=0;i<ring.length;i++){data[i*2]=ring[i].x;data[i*2+1]=ring[i].y;}return data;}
function unpackRing(ring:PackedRing){const points:THREE.Vector2[]=[];for(let i=0;i<ring.length;i+=2)points.push(new THREE.Vector2(ring[i],ring[i+1]));return points;}
function packShapes(shapes:THREE.Shape[]){return shapes.map(shape=>[packRing(shape.getPoints()),...shape.holes.map(hole=>packRing(hole.getPoints()))]);}
function unpackShapes(shapes:PackedShape[]){return shapes.map(rings=>{const shape=new THREE.Shape(unpackRing(rings[0]));for(const ring of rings.slice(1))shape.holes.push(new THREE.Path(unpackRing(ring)));return shape;});}
function packGeometry(geometry:THREE.BufferGeometry):PackedGeometry{
  const pack=(attribute:THREE.BufferAttribute):PackedAttribute=>({array:attribute.array as GeometryArray,itemSize:attribute.itemSize,normalized:attribute.normalized});
  return{attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute])=>[name,pack(attribute as THREE.BufferAttribute)])),index:geometry.index?pack(geometry.index):null,groups:geometry.groups.map(group=>({...group})),box:geometry.boundingBox?[...geometry.boundingBox.min.toArray(),...geometry.boundingBox.max.toArray()]:null,sphere:geometry.boundingSphere?[...geometry.boundingSphere.center.toArray(),geometry.boundingSphere.radius]:null};
}
function unpackGeometry(packed:PackedGeometry){
  const geometry=new THREE.BufferGeometry();for(const [name,attribute]of Object.entries(packed.attributes))geometry.setAttribute(name,new THREE.BufferAttribute(attribute.array,attribute.itemSize,attribute.normalized));
  if(packed.index)geometry.setIndex(new THREE.BufferAttribute(packed.index.array,packed.index.itemSize,packed.index.normalized));
  for(const group of packed.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
  if(packed.box)geometry.boundingBox=new THREE.Box3(new THREE.Vector3().fromArray(packed.box),new THREE.Vector3().fromArray(packed.box,3));
  if(packed.sphere)geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3().fromArray(packed.sphere),packed.sphere[3]);
  return geometry;
}
export function packFuiMapGeometryInput(regions:{key:string;polygons:THREE.Vector2[][][]}[]):FuiMapGeometryInput{
  return{regions:regions.map(region=>({name:region.key,polygons:region.polygons.map(polygon=>polygon.map(packRing))}))};
}
export function packFuiMapGeometry(footprint:THREE.Shape[],body:FuiMapGlassBodyGeometry):FuiMapGeometryOutput{
  return{footprint:packShapes(footprint),wallFootprint:packShapes(body.wallFootprint),bottom:packGeometry(body.bottom),walls:body.walls.map(wall=>({owner:wall.owner,geometry:packGeometry(wall.geometry)}))};
}
export function unpackFuiMapGeometry(output:FuiMapGeometryOutput):FuiPreparedMapGeometry{
  return{footprint:unpackShapes(output.footprint),body:{wallFootprint:unpackShapes(output.wallFootprint),bottom:unpackGeometry(output.bottom),walls:output.walls.map(wall=>({owner:wall.owner,geometry:unpackGeometry(wall.geometry)}))}};
}
export function disposeFuiMapGeometry(prepared:FuiPreparedMapGeometry){prepared.body.bottom.dispose();for(const wall of prepared.body.walls)wall.geometry.dispose();}
/** Uses the accepted geometry algorithm without creating materials, textures,
 * renderers or DOM objects. Only dedicated workers call this expensive path. */
export function prepareFuiMapGeometry(input:FuiMapGeometryInput):FuiMapGeometryOutput{
  const regions=input.regions.map(region=>({name:region.name,polygons:region.polygons.map(polygon=>polygon.map(unpackRing))}));
  const polygons=regions.flatMap(region=>region.polygons.map(polygon=>polygon.map(ring=>ring.map(point=>[point.x,point.y] as [number,number])))) as Polygon[];
  const footprint=createFuiMapGlassFootprintOneShot(polygons);
  const body=createFuiMapGlassBodyGeometry(footprint,regions.map(region=>({name:region.name,rings:region.polygons.flat()})));
  const output=packFuiMapGeometry(footprint,body);
  // CPU geometry has no GPU allocations, but dispatch disposal consistently.
  body.bottom.dispose();for(const wall of body.walls)wall.geometry.dispose();return output;
}
export function fuiMapGeometryTransfers(value:FuiMapGeometryInput|FuiMapGeometryOutput){
  const buffers=new Set<ArrayBuffer>();const visit=(item:unknown)=>{if(ArrayBuffer.isView(item)){if(item.buffer instanceof ArrayBuffer)buffers.add(item.buffer);}else if(Array.isArray(item))for(const child of item)visit(child);else if(item&&typeof item==='object')for(const child of Object.values(item))visit(child);};visit(value);return[...buffers];
}
/** Unsupported workers fall back to cooperative construction. Cancellation is
 * terminal: it tears down an in-flight union/extrusion immediately. */
export async function runFuiMapGeometryWorker(input:FuiMapGeometryInput,signal:AbortSignal|undefined,createWorker:()=>Worker):Promise<FuiMapGeometryOutput|undefined>{
  if(signal?.aborted)throw new DOMException('Map preparation aborted','AbortError');
  let worker:Worker;try{worker=createWorker();}catch{return undefined;}
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(output:FuiMapGeometryOutput|undefined,error?:Error)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);worker.onmessage=null;worker.onerror=null;worker.terminate();if(error)reject(error);else resolve(output);};
    const abort=()=>finish(undefined,new DOMException('Map preparation aborted','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=event=>{const message=event.data as {geometry?:FuiMapGeometryOutput;error?:string};finish(message.geometry,message.error?new Error(message.error):undefined);};
    worker.onerror=event=>{event.preventDefault();finish(undefined);};
    if(signal?.aborted){abort();return;}
    try{worker.postMessage(input,fuiMapGeometryTransfers(input));}catch{finish(undefined);}
  });
}
