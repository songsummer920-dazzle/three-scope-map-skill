#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Run with a template whose npm dependencies have been installed, then open
// the generated baker.html through a local HTTP server. Its three downloads
// belong in src/assets/textures/map/china/. No geographic simplification.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decodeRgbaPng} from './png-rgba.mjs';
import {checkEarthGeographyCache} from './fui-earth-geography-cache.mjs';

export async function runFuiEarthCache(args=process.argv.slice(2)){
const [templateArg,outputArg]=args;
if(!templateArg||!outputArg)throw new Error('Usage: prepare_fui_earth_cache.mjs <template-root> <output-dir>');
const root=path.resolve(templateArg),out=path.resolve(outputArg);
const require=createRequire(path.join(root,'package.json'));
const ts=require('typescript'),esbuild=require('esbuild');
const file=path.join(root,'src/components/map/EarthView.vue');
const vue=await fs.readFile(file,'utf8'),source=vue.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const ast=ts.createSourceFile('EarthView.ts',source,ts.ScriptTarget.Latest,true);
const names=['isDecorativeChinaInset','getPolygonRings','chinaBoundaryPixelKey','simplifyChinaBoundaryRing',
  'getBoundaryRingSignedArea','getChinaOuterRings','getBoundaryRingBounds','isTaiwanMainBoundaryRing',
  'getTaiwanMainBoundaryRing','getChinaExtrusionRings','createChinaInnerGlowTexture'];
const functions=names.map(name=>{
  const node=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  if(!node)throw new Error(`Missing original builder: ${name}`);
  return node.getText(ast);
}).join('\n');
const bounds=ast.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='chinaBoundaryBounds')).getText(ast);
const geoPath=path.join(root,'src/assets/maps/china.json'),geo=await fs.readFile(geoPath,'utf8');
const edgePath=path.join(root,'src/components/map/fuiMapGlow.ts');
const sha=value=>createHash('sha256').update(value).digest('hex');
const sourceHash=sha(JSON.stringify(JSON.parse(geo))),builderHash=sha(functions+bounds+await fs.readFile(edgePath,'utf8'));
if(outputArg==='--check'){
  const dir=path.join(root,'src/assets/textures/map/china');
  const meta=JSON.parse(await fs.readFile(path.join(dir,'earth-china-cache.json'),'utf8'));
  if(meta.sourceSha256!==sourceHash||meta.builderSha256!==builderHash)throw new Error('FUI Earth cache is stale; regenerate from the current geographic source/builders.');
  for(const [name,key] of [['earth-china-inner-glow.png','glow'],['earth-china-glass-edges.png','edge']]){
    const png=await fs.readFile(path.join(dir,name));
    const decoded=decodeRgbaPng(png);
    if(decoded.width!==meta[key].width||decoded.height!==meta[key].height||!meta[key].pngRoundTripExact||sha(decoded.rgba)!==meta[key].rgbaSha256)throw new Error('Invalid cache pixels: '+name);
  }
  console.log('FUI Earth cache matches the geographic source, original builders and verified native dimensions.');
  await checkEarthGeographyCache(root);
  return;
}
const entry=`
import * as THREE from 'three';
import chinaGeoJson from ${JSON.stringify(geoPath)};
import {createFuiMapEdgeField} from ${JSON.stringify(edgePath)};
let chinaOuterRingsCache,taiwanMainRingCache;
${bounds}
${functions}
const project=([lon,lat])=>new THREE.Vector2((lon-70)*12,(lat-15)*12);
const rings=getChinaExtrusionRings();
const field=createFuiMapEdgeField(rings.map(ring=>new THREE.Shape(ring.map(project))),getPolygonRings().map(rings=>({rings:rings.map(ring=>ring.map(project))})));
const glow=createChinaInnerGlowTexture().image;
const glowPixels=glow.getContext('2d',{willReadFrequently:true}).getImageData(0,0,glow.width,glow.height).data;
const edge=field.texture.image;
const hash=async pixels=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),v=>v.toString(16).padStart(2,'0')).join('');
const verify=async (name,pixels,width,height)=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
  const url=canvas.toDataURL('image/png');
  const bitmap=await createImageBitmap(await(await fetch(url)).blob(),{premultiplyAlpha:'none'});
  const check=document.createElement('canvas');check.width=width;check.height=height;
  check.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0);bitmap.close();
  const decoded=check.getContext('2d').getImageData(0,0,width,height).data;
  const originalHash=await hash(pixels),decodedHash=await hash(decoded);
  if(originalHash!==decodedHash)throw new Error(name+' PNG round-trip changed pixels');
  const a=document.createElement('a');a.download=name;a.href=url;a.textContent=name;document.body.append(a,document.createElement('br'));
  return {width,height,rgbaSha256:originalHash,pngRoundTripExact:true};
};
const metadata={version:1,sourceSha256:${JSON.stringify(sourceHash)},builderSha256:${JSON.stringify(builderHash)},
  outerRings:getChinaOuterRings(),edgeBounds:field.bounds.toArray(),
  glow:await verify('earth-china-inner-glow.png',glowPixels,glow.width,glow.height),
  edge:await verify('earth-china-glass-edges.png',edge.data,edge.width,edge.height)};
const json=JSON.stringify(metadata),a=document.createElement('a');a.download='earth-china-cache.json';
a.href='data:application/json;base64,'+btoa(json);a.textContent=a.download;document.body.append(a);
document.querySelector('h1').textContent='Ready: original geographic pixels verified';
document.body.dataset.cacheReady='true';
`;
await fs.mkdir(out,{recursive:true});
const built=await esbuild.build({stdin:{contents:entry,loader:'ts',resolveDir:root},bundle:true,format:'esm',write:false,minify:true});
const code=built.outputFiles[0].text.replaceAll('</script','<\\/script');
await fs.writeFile(path.join(out,'baker.html'),`<!doctype html><html><meta charset="utf-8"><title>FUI geographic cache baker</title><style>body{font:16px system-ui;padding:32px;background:#101820;color:#e0f4ff}a{display:inline-block;margin:12px;color:#70cfff}</style><h1>Building original geographic fields…</h1><script type="module">${code}</script></html>`);
console.log(`Created ${path.join(out,'baker.html')}. Serve/open it and save the three verified assets.`);

}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  runFuiEarthCache().catch(error=>{console.error(error.message);process.exitCode=1;});
}
