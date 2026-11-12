// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
export type FuiEarthPhase='loading'|'warming'|'entering'|'ready'|'error';
export type FuiPolarStyle='natural'|'enhanced';
export type FuiEarthLoading={phase:FuiEarthPhase;switching:boolean};
export type FuiSkinFailure={requested:string;rendered:string;message:string};
export const FUI_EARTH_WARMUP_GATE=Symbol('fui-earth-warmup-gate');

// Animation time follows actual foreground time. Damping can clamp its own
// delta, but dropping timeline time stretches a 4.2-second intro indefinitely.
export class EarthTimeline{
  elapsed=0;private last:number|undefined;
  tick(now:number){if(this.last!==undefined)this.elapsed+=Math.max(0,now-this.last)/1000;this.last=now;return this.elapsed;}
  pause(){this.last=undefined;}
  reset(){this.elapsed=0;this.last=undefined;}
}

// Coalesce rapid requests. Load/prepare are allowed to finish, but only the
// newest request can commit. A failure leaves the previous committed value.
export class LatestEarthRequest<T>{
  private version=0;
  async run(value:T,prepare:(value:T)=>Promise<void>,commit:(value:T)=>void){
    const version=++this.version;
    try{await prepare(value);}catch(error){if(version===this.version)throw error;return false;}
    if(version!==this.version)return false;commit(value);return true;
  }
  cancel(){this.version++;}
}
