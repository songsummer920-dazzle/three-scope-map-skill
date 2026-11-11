// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import type {HologramMaskPixels,FuiEarthPresentation} from './fuiEarthHologram';

type Payload={bytes:number;sha256:string;gzipBytes:number};
export type EarthGeographyManifest={version:number;outlines:Payload&{vertices:number;radius:number};hologram:Payload&{width:number;height:number}};
export type EarthGeographyUrls={outlines:string;hologram:string};
export type PreparedEarthGeography={kind:'surface';outlines:Float32Array;radius:number;diagnostics:GeographyTimings}
  |{kind:'hologram';mask:HologramMaskPixels;diagnostics:GeographyTimings};
type GeographyTimings={kind:'surface'|'hologram';source:'verified-geographic-cache';integrity:'sha256'|'build-verified-gzip-crc';downloadBytes:number;decodedBytes:number;fetchMs:number;decodeMs:number;totalMs:number};
const abort=(signal:AbortSignal)=>{if(signal.aborted)throw signal.reason??new DOMException('Earth geography cancelled','AbortError');};
const hash=async(buffer:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),value=>value.toString(16).padStart(2,'0')).join('');

/** Inflate binary geographic data through the browser's native stream, rather
 * than parsing a multi-megabyte JavaScript/JSON object graph on the main thread.
 * Some servers already apply Content-Encoding to .gz files; accept that decoded
 * body too, but verify the identical original bytes in either case. */
export async function decodeEarthGeographyPayload(bytes:ArrayBuffer,entry:Payload,signal:AbortSignal){
  abort(signal);
  const magic=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
  let raw=bytes;
  if(magic[0]===0x1f&&magic[1]===0x8b){
    if(typeof DecompressionStream==='undefined')throw new Error('Earth geographic cache requires a browser with native gzip streams');
    raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'),{signal})).arrayBuffer();
  }
  abort(signal);
  if(raw.byteLength!==entry.bytes)throw new Error('Earth geographic cache has invalid dimensions');
  // Ordinary LAN HTTP does not expose WebCrypto. Its generated cache still
  // passed the mandatory source/builder/payload build gate and native gzip CRC;
  // HTTPS/localhost additionally verify its decoded SHA at runtime.
  if(globalThis.crypto?.subtle&&await hash(raw)!==entry.sha256)throw new Error('Earth geographic cache checksum failed');
  abort(signal);return raw;
}

/** Per-mount request ownership: abort on removal and start a new request on
 * retry. Only the selected presentation's cache is fetched. No texture, scene,
 * global RAF, geographic JSON or borrowed renderer is created by this loader. */
async function prepareEarthGeography(presentation:FuiEarthPresentation,urls:EarthGeographyUrls,manifest:EarthGeographyManifest,signal:AbortSignal,fetcher:typeof fetch):Promise<PreparedEarthGeography>{
  if(manifest.version!==1)throw new Error('Unsupported Earth geographic cache version');
  const kind=presentation==='surface'?'surface':'hologram',entry=kind==='surface'?manifest.outlines:manifest.hologram;
  const started=performance.now();abort(signal);
  const response=await fetcher(kind==='surface'?urls.outlines:urls.hologram,{signal});
  if(!response.ok)throw new Error(`Earth geographic cache failed: HTTP ${response.status}`);
  const bytes=await response.arrayBuffer();abort(signal);const received=performance.now();
  const raw=await decodeEarthGeographyPayload(bytes,entry,signal),finished=performance.now();
  const diagnostics:GeographyTimings={kind,source:'verified-geographic-cache',integrity:globalThis.crypto?.subtle?'sha256':'build-verified-gzip-crc',downloadBytes:bytes.byteLength,decodedBytes:raw.byteLength,
    fetchMs:+(received-started).toFixed(1),decodeMs:+(finished-received).toFixed(1),totalMs:+(finished-started).toFixed(1)};
  if(kind==='hologram'){
    if(manifest.hologram.bytes!==manifest.hologram.width*manifest.hologram.height*4)throw new Error('Invalid Earth hologram cache layout');
    return{kind,mask:{width:manifest.hologram.width,height:manifest.hologram.height,pixels:new Uint8Array(raw)},diagnostics};
  }
  if(manifest.outlines.bytes!==manifest.outlines.vertices*3*4)throw new Error('Invalid Earth coastline cache layout');
  // Float32 data is already in the exact GPU order produced by the original
  // lonLatToVector3/LineSegments builder. The common LE host uses zero copies.
  const outlines=new Float32Array(raw);
  if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1){
    const littleEndian=new DataView(raw);for(let i=0;i<outlines.length;i++)outlines[i]=littleEndian.getFloat32(i*4,true);
  }
  return{kind,outlines,radius:manifest.outlines.radius,diagnostics};
}

/** Keep failed/ignored fetches bounded and cancel native decompression when
 * the component retires. A retry creates a fresh owner and fresh request. */
export async function loadEarthGeography(presentation:FuiEarthPresentation,urls:EarthGeographyUrls,manifest:EarthGeographyManifest,signal:AbortSignal,fetcher:typeof fetch=fetch,timeoutMs=15000):Promise<PreparedEarthGeography>{
  abort(signal);const request=new AbortController();
  const relay=()=>request.abort(signal.reason);signal.addEventListener('abort',relay,{once:true});
  const timer=setTimeout(()=>request.abort(new Error('Earth geographic cache load timed out')),timeoutMs);
  let rejectAbort:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(request.signal.reason);request.signal.addEventListener('abort',rejectAbort,{once:true});});
  try{return await Promise.race([prepareEarthGeography(presentation,urls,manifest,request.signal,fetcher),cancelled]);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',relay);request.signal.removeEventListener('abort',rejectAbort!);}
}
