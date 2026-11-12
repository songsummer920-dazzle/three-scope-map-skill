#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const sha=data=>createHash('sha256').update(data).digest('hex');
const assetPath='src/assets/maps/earth-geography';
export function deriveWorldOutlinePositions(world,radius=2.012){
  const values=[];
  const vector=([lon,lat])=>{
    const phi=(90-lat)*(Math.PI/180),theta=(lon+180)*(Math.PI/180);
    return[-radius*Math.sin(phi)*Math.cos(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.sin(theta)];
  };
  for(const feature of world.features){
    if(String(feature.properties?.adcode??feature.properties?.code??'').endsWith('_JD'))continue;
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const rings of polygons)for(const ring of rings){
      if(ring.length<2)continue;
      for(let i=0;i<ring.length;i++)values.push(...vector(ring[i]),...vector(ring[(i+1)%ring.length]));
    }
  }
  const floats=new Float32Array(values);
  // The GPU cache is explicitly little endian, independent of baker host.
  const bytes=Buffer.alloc(floats.byteLength);
  for(let i=0;i<floats.length;i++)bytes.writeFloatLE(floats[i],i*4);
  return bytes;
}
async function inputs(root){
  const require=createRequire(path.join(root,'package.json')),ts=require('typescript');
  const world=await fs.readFile(path.join(root,'src/assets/maps/world.earth-render.json'),'utf8');
  const china=await fs.readFile(path.join(root,'src/assets/maps/china.json'),'utf8');
  const holo=await fs.readFile(path.join(root,'src/components/map/fuiEarthHologram.ts'),'utf8');
  const ast=ts.createSourceFile('hologram.ts',holo,ts.ScriptTarget.Latest,true);
  const builder=['unwrapHologramRing','polygons','createHologramAtlas','chinaInteriorGlow'].map(name=>{
    const node=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    if(!node)throw new Error('Missing original geographic atlas builder: '+name);return node.getText(ast);
  }).join('\n');
  return{world,china,source:{worldSha256:sha(JSON.stringify(JSON.parse(world))),chinaSha256:sha(JSON.stringify(JSON.parse(china)))},
    outlineBuilderSha256:sha(deriveWorldOutlinePositions.toString()),atlasBuilderSha256:sha(builder+'|original-rgba-packing-v1')};
}
export async function checkEarthGeographyCache(root){
  root=path.resolve(root);const input=await inputs(root),dir=path.join(root,assetPath);
  const meta=JSON.parse(await fs.readFile(path.join(dir,'earth-geography-cache.json'),'utf8'));
  if(meta.version!==1||meta.source.worldSha256!==input.source.worldSha256||meta.source.chinaSha256!==input.source.chinaSha256
    ||meta.outlines.builderSha256!==input.outlineBuilderSha256||meta.hologram.builderSha256!==input.atlasBuilderSha256)throw new Error('FUI Earth geography cache is stale; rebake the original geographic builders.');
  for(const [key,name]of [['outlines','world-outlines.f32.gz'],['hologram','hologram-mask.rgba.gz']]){
    const compressed=await fs.readFile(path.join(dir,name)),raw=gunzipSync(compressed),entry=meta[key];
    if(compressed.length!==entry.gzipBytes||sha(compressed)!==entry.gzipSha256||raw.length!==entry.bytes||sha(raw)!==entry.sha256)throw new Error('Invalid Earth geographic cache payload: '+name);
  }
  if(meta.outlines.radius!==2.012||meta.outlines.bytes!==meta.outlines.vertices*3*4||meta.hologram.width!==3072||meta.hologram.height!==1536||meta.hologram.bytes!==3072*1536*4)throw new Error('Invalid Earth geographic cache dimensions');
  console.log('FUI Earth geography cache matches real sources, original builders and exact decoded payloads.');return meta;
}
export async function bakeEarthGeography(root,output){
  root=path.resolve(root);output=path.resolve(output);const input=await inputs(root),dir=path.join(root,assetPath);
  const raw=deriveWorldOutlinePositions(JSON.parse(input.world)),compressed=gzipSync(raw,{level:9,mtime:0});
  await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'world-outlines.f32.gz'),compressed);
  const metadata={version:1,source:input.source,outlines:{radius:2.012,vertices:raw.length/12,bytes:raw.length,sha256:sha(raw),gzipBytes:compressed.length,gzipSha256:sha(compressed),builderSha256:input.outlineBuilderSha256}};
  const require=createRequire(path.join(root,'package.json')),esbuild=require('esbuild');
  const entry=`
import {createHologramAtlas} from ${JSON.stringify(path.join(root,'src/components/map/fuiEarthHologram.ts'))};
import world from ${JSON.stringify(path.join(root,'src/assets/maps/world.earth-render.json'))};
import china from ${JSON.stringify(path.join(root,'src/assets/maps/china.json'))};
const started=performance.now(),atlas=createHologramAtlas(world,china),pixels=new Uint8Array(atlas.width*atlas.height*4);
for(let i=0;i<atlas.land.length;i++){pixels[i*4]=atlas.land[i]*255;pixels[i*4+1]=atlas.china[i]*255;pixels[i*4+2]=atlas.structure?.[i]??0;pixels[i*4+3]=atlas.innerGlow?.[i]??0;}
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
const gzip=new Uint8Array(await new Response(new Blob([pixels]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const restored=new Uint8Array(await new Response(new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
const originalHash=await hash(pixels),roundTripHash=await hash(restored);if(originalHash!==roundTripHash)throw Error('Atlas gzip changed original pixels');
let binary='';for(let i=0;i<gzip.length;i+=8192)binary+=String.fromCharCode(...gzip.subarray(i,i+8192));
const metadata=${JSON.stringify(metadata)};metadata.hologram={width:atlas.width,height:atlas.height,bytes:pixels.length,sha256:originalHash,gzipBytes:gzip.length,gzipSha256:await hash(gzip),builderSha256:${JSON.stringify(input.atlasBuilderSha256)},roundTripExact:true};
document.querySelector('#bake-output').textContent=JSON.stringify({metadata,hologramGzipBase64:btoa(binary)});
document.querySelector('#status').textContent='Verified original atlas pixels; '+Math.round(performance.now()-started)+' ms';document.body.dataset.status='passed';
`;
  const built=await esbuild.build({stdin:{contents:entry,loader:'ts',resolveDir:root},bundle:true,format:'esm',write:false,minify:true});
  await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'baker.html'),`<!doctype html><html><meta charset="utf-8"><title>Original Earth geography cache baker</title><style>body{font:16px system-ui;color:#a9d8ed;background:#09121b;padding:32px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:50vh;overflow:auto}</style><h1>Original geographic atlas</h1><p id="status">Building…</p><pre id="bake-output"></pre><script type="module">${built.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></html>`);
  console.log('Created original-Canvas baker: '+path.join(output,'baker.html'));
}
export async function runEarthGeographyCache(args=process.argv.slice(2)){
  const [root,operation]=args;if(!root||!operation)throw new Error('Usage: fui-earth-geography-cache.mjs <template> <--check|baker-output-dir>');
  return operation==='--check'?checkEarthGeographyCache(root):bakeEarthGeography(root,operation);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)runEarthGeographyCache().catch(error=>{console.error(error.message);process.exitCode=1;});
