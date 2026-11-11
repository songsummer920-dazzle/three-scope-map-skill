// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
/** CPU preparation only. A stage must never retain borrowed WebGL state. */
export type FuiMapBuildOptions={signal?:AbortSignal;yieldControl?:()=>Promise<void>};
export function drainFuiMapBuild<T>(steps:Generator<void,T,void>):T{
  let next=steps.next();while(!next.done)next=steps.next();return next.value;
}
export async function runFuiMapBuild<T>(steps:Generator<void,T,void>,options:FuiMapBuildOptions={}):Promise<T>{
  let complete=false;
  const check=()=>{if(options.signal?.aborted)throw new DOMException('Map preparation aborted','AbortError');};
  try{
    check();
    let deadline=performance.now()+6;
    for(;;){
      const next=steps.next();if(next.done){complete=true;return next.value;}
      check();
      // Keep explicit stage observers deterministic. The browser default drains
      // several tiny raster stages in one bounded turn instead of paying a
      // nested setTimeout clamp for every row/pixel chunk.
      if(options.yieldControl){await options.yieldControl();deadline=performance.now()+6;}
      else if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));deadline=performance.now()+6;}
      check();
    }
  }finally{if(!complete)steps.return(undefined as never);}
}
