// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

// Three r176 compileAsync polls material program objects in timer callbacks.
// Disposing those programs mid-poll can throw outside its returned promise.
// Stop visible work immediately, but retain GPU program owners until drained.
export class FuiRendererJobs{
  private pending=new Set<Promise<unknown>>();
  private closing=false;
  private disposal:Promise<void>|undefined;
  run<T>(work:()=>Promise<T>):Promise<T>{
    if(this.closing)return Promise.reject(new Error('Renderer is closing'));
    // Invoke synchronously: callers may have temporarily selected the exact
    // render target/color-space variant which compilation needs to observe.
    let promise:Promise<T>;try{promise=Promise.resolve(work());}catch(error){return Promise.reject(error);}
    this.pending.add(promise);void promise.then(()=>this.pending.delete(promise),()=>this.pending.delete(promise));return promise;
  }
  get busy(){return this.pending.size>0;}
  async afterPending(cleanup:()=>void){await Promise.allSettled([...this.pending]);cleanup();}
  dispose(cleanup:()=>void):Promise<void>{
    if(this.disposal)return this.disposal;
    this.closing=true;this.disposal=this.afterPending(cleanup);return this.disposal;
  }
}
