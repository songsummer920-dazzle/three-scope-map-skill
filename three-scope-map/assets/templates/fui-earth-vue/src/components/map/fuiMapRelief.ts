// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
export type FuiReliefBounds=[number,number,number,number];
const cache=new Map<string,THREE.DataTexture>();
export function requestFuiMapRelief(bbox:FuiReliefBounds,signal:AbortSignal):Promise<THREE.DataTexture>{
  const key=bbox.map(v=>v.toFixed(5)).join(',');const existing=cache.get(key);
  if(existing)return Promise.resolve(existing);
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const worker=new Worker(new URL('./fuiMapRelief.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{worker.terminate();clearTimeout(timeout);signal.removeEventListener('abort',cancel);};
    const cancel=()=>{cleanup();reject(new DOMException('Aborted','AbortError'));};
    const timeout=setTimeout(()=>{cleanup();reject(new Error('Regional terrain timeout'));},60000);
    signal.addEventListener('abort',cancel,{once:true});
    worker.onmessage=({data}:MessageEvent<{bytes:Uint8Array;size:number;error?:string}>)=>{
      cleanup();if(data.error){reject(new Error(data.error));return;}
      const texture=new THREE.DataTexture(data.bytes,data.size,data.size,THREE.RGBAFormat);
      texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=16;
      texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
      cache.set(key,texture);
      while(cache.size>4){const oldest=cache.keys().next().value!;cache.get(oldest)?.dispose();cache.delete(oldest);}
      resolve(texture);
    };
    worker.onerror=event=>{cleanup();reject(new Error(event.message));};worker.postMessage({bbox:[...bbox]});
  });
}
export function disposeFuiMapReliefCache(){cache.forEach(texture=>texture.dispose());cache.clear();}
