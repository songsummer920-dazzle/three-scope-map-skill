// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import type {WebGLRenderer} from 'three';
const floatSupport=new WeakMap<WebGLRenderer,boolean>();
const sampleSupport=new WeakMap<WebGLRenderer,number[]>();

function probeHalfFloat(renderer:WebGLRenderer){
  const cached=floatSupport.get(renderer);if(cached!==undefined)return cached;
  const names=['EXT_color_buffer_float','EXT_color_buffer_half_float'];
  if(!names.some(name=>renderer.extensions.has(name))){floatSupport.set(renderer,false);return false;}
  for(const name of names)if(renderer.extensions.has(name))renderer.extensions.get(name);
  const gl=renderer.getContext() as WebGL2RenderingContext;
  // A tiny owned renderbuffer verifies actual color renderability before any
  // PMREM/Reflector is created. Restore raw bindings exactly; Three's target
  // cache is never touched and the caller's framebuffer is never cleared.
  const draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer|null;
  const read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer|null;
  const renderbuffer=gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer|null;
  const framebuffer=gl.createFramebuffer(),color=gl.createRenderbuffer();let supported=false;
  try{
    if(framebuffer&&color){
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.bindRenderbuffer(gl.RENDERBUFFER,color);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.RGBA16F,1,1);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,color);
      supported=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    }
  }catch{supported=false;}
  finally{
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);
    if(framebuffer)gl.deleteFramebuffer(framebuffer);if(color)gl.deleteRenderbuffer(color);
  }
  floatSupport.set(renderer,supported);return supported;
}

/** Renderer-local capability boundary. Isolated real-WebGL fixtures may
 * override these methods before mounting a scene; there is no product flag. */
export const FUI_GLASS_CAPABILITIES={
  supportsHalfFloat:probeHalfFloat,
  sampleCounts(renderer:WebGLRenderer){
    if(!supportsFuiGlassHalfFloat(renderer))return [];
    const cached=sampleSupport.get(renderer);if(cached)return cached;
    const gl=renderer.getContext() as WebGL2RenderingContext;
    let samples:number[]=[];
    try{
      const values=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES) as Int32Array|null;
      samples=values?Array.from(values).filter(value=>Number.isInteger(value)&&value>0):[];
    }catch{ /* A rejected format query leaves the verified single-sample path. */ }
    sampleSupport.set(renderer,samples);return samples;
  },
  framebufferComplete(renderer:WebGLRenderer){
    const gl=renderer.getContext() as WebGL2RenderingContext;
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  },
};
export const supportsFuiGlassHalfFloat=(renderer:WebGLRenderer)=>FUI_GLASS_CAPABILITIES.supportsHalfFloat(renderer);
export const fuiGlassFramebufferComplete=(renderer:WebGLRenderer)=>FUI_GLASS_CAPABILITIES.framebufferComplete(renderer);
/** Never assume MAX_SAMPLES applies to RGBA16F. Mirrors request exactly two
 * samples; if that count is absent, use the verified non-MSAA float target. */
export const supportedFuiGlassSamples=(renderer:WebGLRenderer,requested:number)=>supportsFuiGlassHalfFloat(renderer)
  &&Number.isInteger(requested)&&requested>0&&FUI_GLASS_CAPABILITIES.sampleCounts(renderer).includes(requested)?requested:0;
