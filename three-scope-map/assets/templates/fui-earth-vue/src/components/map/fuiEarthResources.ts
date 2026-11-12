// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {InjectionKey} from 'vue';

export type EarthFamily='original'|'reference';
export type EarthResourceId='height'|'chinaNormal'|'day'|'normal'|'specular'|'relief'|'photoRelief'|'photograph'|'clouds'|'lights'|'nightDetail'|'innerGlow'|'glassEdges'|'contact';
export type EarthFileId=Exclude<EarthResourceId,'contact'>;
export type EarthResourceUrls=Record<EarthFileId,string>;

// Shader sampler bindings are also the first-frame dependency contract.
// Reference terrain and optional polar enhancement both use photograph.
export const EARTH_SAMPLERS={
  globe:{
    original:{uDayMap:'day',uNormalMap:'normal',uSpecularMap:'specular',uNightMap:'lights',uChinaMask:'contact'},
    reference:{uPhotographicMap:'photograph',uReliefMap:'photoRelief',uSpecularMap:'specular',uCloudMap:'clouds',uNightMap:'lights',uChinaMask:'contact'},
  },
  china:{
    original:{uHeightMap:'height',uNormalMap:'chinaNormal',uDayMap:'day',uNightMap:'lights',uInnerGlowMap:'innerGlow'},
    reference:{uHeightMap:'height',uPhotographicMap:'photograph',uReliefMap:'photoRelief',uNightMap:'lights',uInnerGlowMap:'innerGlow'},
  },
  contours:{original:{uHeightMap:'height'},reference:{uHeightMap:'height'}},
} as const;
export const earthFamily=(skin:string):EarthFamily=>skin==='original'?'original':'reference';
export function requiredEarthResources(family:EarthFamily):EarthResourceId[]{
  return [...new Set(Object.values(EARTH_SAMPLERS).flatMap(role=>Object.values(role[family])))] as EarthResourceId[];
}
type ImageSource=ImageBitmap|HTMLImageElement;
export type EarthImageLoader=(url:string,options:{signal:AbortSignal;flipY:boolean})=>Promise<{image:ImageSource;bitmap:boolean}>;
export const FUI_EARTH_IMAGE_LOADER:InjectionKey<EarthImageLoader>=Symbol('fui-earth-image-loader');
export type EarthResourceOptions={
  urls:EarthResourceUrls;loadImage?:EarthImageLoader;timeoutMs?:number;
  onTexture?:(id:EarthFileId,texture:THREE.Texture)=>void;
};
export class EarthResourceError extends Error{
  constructor(public readonly id:EarthResourceId,public readonly reason:unknown){super(`Earth resource failed: ${id}`);this.name='EarthResourceError';}
}

// A failed fetch, a decoder failure and an abort have distinct outcomes. The
// native image fallback reads the same fetched blob and never repeats a 404.
export const loadEarthImage:EarthImageLoader=async(url,{signal,flipY})=>{
  const response=await fetch(url,{signal});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const blob=await response.blob();
  if(signal.aborted)throw signal.reason;
  if(typeof createImageBitmap!=='undefined'){
    try{
      const image=await createImageBitmap(blob,{imageOrientation:flipY?'flipY':'none',premultiplyAlpha:'none'});
      if(signal.aborted){image.close();throw signal.reason;}
      return {image,bitmap:true};
    }catch(error){if(signal.aborted)throw error;}
  }
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob),image=new Image();
    const clean=()=>{URL.revokeObjectURL(url);signal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;};
    const abort=()=>{clean();image.src='';reject(signal.reason);};
    image.onload=()=>{clean();resolve({image,bitmap:false});};
    image.onerror=()=>{clean();reject(new Error('Image decode failed'));};
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}image.src=url;
  });
};

type Entry={texture:THREE.Texture;status:'idle'|'loading'|'ready'|'error';attempt:number;promise?:Promise<void>;abort?:AbortController;error?:unknown;uploadMs?:number;uploaded:boolean};
export class EarthResources{
  private entries=new Map<EarthResourceId,Entry>();
  private disposed=false;
  private anisotropy=1;
  constructor(private options:EarthResourceOptions){}
  get(id:EarthResourceId):THREE.Texture{
    let entry=this.entries.get(id);if(entry)return entry.texture;
    const texture=new THREE.Texture();texture.userData.fuiResource=id;
    texture.userData.fuiSource=id==='contact'?'geographic-contact':this.options.urls[id];
    texture.colorSpace=['day','photograph','lights','nightDetail'].includes(id)?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.minFilter=id==='glassEdges'?THREE.LinearFilter:THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=id!=='glassEdges';
    texture.anisotropy=id==='glassEdges'?1:this.anisotropy;
    texture.flipY=id!=='glassEdges';
    entry={texture,status:'idle',attempt:0,uploaded:false};this.entries.set(id,entry);return texture;
  }
  addGenerated(id:'contact',texture:THREE.Texture){
    texture.anisotropy=this.anisotropy;texture.userData.fuiResource=id;texture.userData.fuiSource='geographic-contact';
    this.entries.set(id,{texture,status:'ready',attempt:0,uploaded:false});return texture;
  }
  setAnisotropy(value:number){
    this.anisotropy=value;for(const [id,entry] of this.entries)if(id!=='glassEdges')entry.texture.anisotropy=value;
  }
  uniforms(role:keyof typeof EARTH_SAMPLERS):Record<string,{value:THREE.Texture}>{
    const bindings={...EARTH_SAMPLERS[role].original,...EARTH_SAMPLERS[role].reference};
    return Object.fromEntries(Object.entries(bindings).map(([sampler,id])=>[sampler,{value:this.get(id as EarthResourceId)}]));
  }
  async ensureFamily(family:EarthFamily):Promise<void>{
    if(this.disposed)throw new Error('Earth resources disposed');
    await Promise.all(requiredEarthResources(family).filter((id):id is EarthFileId=>id!=='contact').map(id=>this.load(id)));
  }
  private load(id:EarthFileId):Promise<void>{
    this.get(id);const entry=this.entries.get(id)!;
    if(entry.status==='ready')return Promise.resolve();
    if(entry.status==='loading')return entry.promise!;
    const attempt=++entry.attempt,abort=new AbortController();entry.abort=abort;entry.status='loading';entry.error=undefined;
    const timer=setTimeout(()=>abort.abort(new Error('Resource load timed out')),this.options.timeoutMs??15000);
    let rejectAbort:()=>void;
    const aborted=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(abort.signal.reason);abort.signal.addEventListener('abort',rejectAbort,{once:true});});
    const decoded=Promise.resolve().then(()=>(this.options.loadImage??loadEarthImage)(this.options.urls[id],{signal:abort.signal,flipY:id!=='glassEdges'})).then(result=>{
      if(this.disposed||attempt!==entry.attempt||abort.signal.aborted){if(result.bitmap)(result.image as ImageBitmap).close();throw new Error('Resource load cancelled');}return result;
    });
    entry.promise=Promise.race([decoded,aborted]).then(({image,bitmap})=>{
      if(this.disposed||attempt!==entry.attempt||abort.signal.aborted){if(bitmap)(image as ImageBitmap).close();throw new Error('Resource load cancelled');}
      entry.texture.image?.close?.();entry.uploaded=false;entry.texture.image=image;entry.texture.flipY=!bitmap&&id!=='glassEdges';entry.texture.needsUpdate=true;
      this.options.onTexture?.(id,entry.texture);entry.status='ready';
    }).catch(reason=>{
      entry.status='error';entry.error=reason;throw new EarthResourceError(id,reason);
    }).finally(()=>{clearTimeout(timer);abort.signal.removeEventListener('abort',rejectAbort!);});
    return entry.promise;
  }
  upload(id:EarthResourceId,renderer:Pick<THREE.WebGLRenderer,'initTexture'>){
    const entry=this.entries.get(id);
    if(!entry||entry.status!=='ready'&&entry.status!=='loading')throw new EarthResourceError(id,'not ready');
    if(entry.uploaded)return;
    const started=performance.now();renderer.initTexture(entry.texture);entry.uploadMs=performance.now()-started;entry.uploaded=true;
  }
  required(family:EarthFamily){return requiredEarthResources(family).map(id=>({id,texture:this.get(id)}));}
  diagnostics(){return Object.fromEntries([...this.entries].map(([id,e])=>[id,{status:e.status,uploaded:e.uploaded,uploadMs:e.uploadMs??0,attempt:e.attempt}]));}
  dispose(){
    this.disposed=true;for(const entry of this.entries.values()){
      entry.attempt++;entry.abort?.abort();entry.texture.dispose();entry.texture.image?.close?.();
    }this.entries.clear();
  }
}
