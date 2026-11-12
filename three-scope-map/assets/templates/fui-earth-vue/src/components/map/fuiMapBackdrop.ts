// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';

type ColorTarget={framebuffer:WebGLFramebuffer;renderbuffer:WebGLRenderbuffer;width:number;height:number;format:number};
type CapturePhase='source'|'resolve'|'scale'|'copy';

/** Preserve normalized screen UVs while limiting the sampled backdrop's cost. */
export function getFuiMapBackdropSize(width:number,height:number,maxSide=2048){
  width=Math.max(1,Math.floor(width));height=Math.max(1,Math.floor(height));
  const ratio=Math.min(1,Math.max(1,Math.floor(maxSide))/Math.max(width,height));
  return{width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio))};
}

/** GPU-only snapshot of the provider layers already drawn under the glass.
 * Owns only its snapshot/resolve resources, never the MapLibre framebuffer.
 * A multisampled source is resolved at exactly its original size before any
 * scaling; resolving and scaling in one blit is invalid in WebGL 2. */
export class FuiMapBackdrop{
  readonly diagnostics={active:false,captures:0,width:0,height:0,sourceEncoding:'unknown',sourceSamples:0,probeError:0,
    probePhase:'pending',phaseErrors:{source:0,resolve:0,scale:0,copy:0}};
  private texture?:THREE.FramebufferTexture;
  private resolve?:ColorTarget;
  private scaled?:ColorTarget;
  private origin=new THREE.Vector2();
  private failedWidth=0;
  private failedHeight=0;
  constructor(private gl:WebGL2RenderingContext){}

  private checkPhase(phase:CapturePhase){
    const error=this.gl.getError();
    this.diagnostics.phaseErrors[phase]=error;this.diagnostics.probeError=error;this.diagnostics.probePhase=phase;
    if(error!==this.gl.NO_ERROR)throw new Error(`Glass backdrop ${phase} failed (WebGL 0x${error.toString(16)}, ${this.diagnostics.sourceEncoding}, samples ${this.diagnostics.sourceSamples})`);
  }

  private releaseTarget(target:ColorTarget|undefined,lost=false){
    if(!target||lost)return;
    this.gl.deleteFramebuffer(target.framebuffer);this.gl.deleteRenderbuffer(target.renderbuffer);
  }
  private target(previous:ColorTarget|undefined,width:number,height:number,format:number):ColorTarget{
    if(previous?.width===width&&previous.height===height&&previous.format===format)return previous;
    const gl=this.gl,framebuffer=gl.createFramebuffer(),renderbuffer=gl.createRenderbuffer();
    if(!framebuffer||!renderbuffer){
      if(framebuffer)gl.deleteFramebuffer(framebuffer);if(renderbuffer)gl.deleteRenderbuffer(renderbuffer);
      throw new Error('Cannot allocate glass backdrop resolve target');
    }
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,framebuffer);gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER,format,width,height);
    gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,renderbuffer);
    if(gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
      gl.deleteFramebuffer(framebuffer);gl.deleteRenderbuffer(renderbuffer);
      throw new Error('Incomplete glass backdrop resolve target');
    }
    this.releaseTarget(previous);
    return{framebuffer,renderbuffer,width,height,format};
  }

  capture(renderer:THREE.WebGLRenderer,source:WebGLFramebuffer|null,width:number,height:number):THREE.FramebufferTexture|undefined{
    this.diagnostics.active=false;
    const gl=this.gl;if(gl.isContextLost()||width<1||height<1)return;
    // Keep the native scene visible after an unsupported GPU copy. Retry only
    // after resize (or a new helper/context), rather than failing every frame.
    if(this.failedWidth===width&&this.failedHeight===height)return;
    const size=getFuiMapBackdropSize(width,height);
    const resized=this.texture?.image.width!==size.width||this.texture.image.height!==size.height;
    const state={draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      renderbuffer:gl.getParameter(gl.RENDERBUFFER_BINDING),unpack:gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING),
      scissor:gl.isEnabled(gl.SCISSOR_TEST)};
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,source);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,source);
    const sourceReadBuffer=gl.getParameter(gl.READ_BUFFER) as number;
    try{
      gl.readBuffer(source===null?gl.BACK:gl.COLOR_ATTACHMENT0);
      // MapLibre uses 8-bit RGBA color. Match the source transfer encoding for
      // an exact-format MSAA resolve, including an sRGB borrowed framebuffer.
      const encoding=gl.getFramebufferAttachmentParameter(gl.READ_FRAMEBUFFER,source===null?gl.BACK:gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING);
      const format=encoding===gl.SRGB?gl.SRGB8_ALPHA8:gl.RGBA8;
      const samples=gl.getParameter(gl.SAMPLES) as number;
      const probe=resized||this.diagnostics.sourceEncoding!==(encoding===gl.SRGB?'srgb':'linear')||this.diagnostics.sourceSamples!==samples;
      this.diagnostics.sourceEncoding=encoding===gl.SRGB?'srgb':'linear';this.diagnostics.sourceSamples=samples;
      if(probe)this.checkPhase('source');
      gl.disable(gl.SCISSOR_TEST);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);
      let readable=source;
      if(samples>0){
        this.resolve=this.target(this.resolve,width,height,format);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,source);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.resolve.framebuffer);
        gl.blitFramebuffer(0,0,width,height,0,0,width,height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
        if(probe)this.checkPhase('resolve');
        readable=this.resolve.framebuffer;
      }else{this.releaseTarget(this.resolve);this.resolve=undefined;}
      if(size.width!==width||size.height!==height){
        this.scaled=this.target(this.scaled,size.width,size.height,format);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,readable);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.scaled.framebuffer);
        gl.blitFramebuffer(0,0,width,height,0,0,size.width,size.height,gl.COLOR_BUFFER_BIT,gl.LINEAR);
        if(probe)this.checkPhase('scale');
        readable=this.scaled.framebuffer;
      }else{this.releaseTarget(this.scaled);this.scaled=undefined;}
      if(resized){
        this.texture?.dispose();this.texture=new THREE.FramebufferTexture(size.width,size.height);
        // The provider framebuffer contains display-encoded bytes in RGBA8.
        // Copy into the same RGBA8 format; marking it sRGB allocates SRGB8_ALPHA8
        // and WebGL rejects that cross-format copy. The coat explicitly decodes
        // these sampled bytes to linear light before its optical calculation.
        this.texture.name='fui-map-provider-backdrop';this.texture.colorSpace=THREE.NoColorSpace;
        this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;
        this.texture.wrapS=THREE.ClampToEdgeWrapping;this.texture.wrapT=THREE.ClampToEdgeWrapping;
        this.texture.generateMipmaps=false;this.texture.flipY=false;
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,readable);
      renderer.copyFramebufferToTexture(this.texture!,this.origin);
      // Probe each allocation/source-format change once, including the blits.
      // A rejected encoded copy must not become a silently sampled black map.
      if(probe){this.checkPhase('copy');this.diagnostics.probePhase='complete';}
      this.failedWidth=0;this.failedHeight=0;
      Object.assign(this.diagnostics,{active:true,captures:this.diagnostics.captures+1,width:size.width,height:size.height});
      return this.texture;
    }catch(error){
      this.failedWidth=width;this.failedHeight=height;this.texture?.dispose();this.texture=undefined;
      throw error;
    }finally{
      // READ_BUFFER belongs to its framebuffer. Restore the borrowed source's
      // selector before restoring the caller's possibly different read target.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,source);gl.readBuffer(sourceReadBuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,state.draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,state.read);
      gl.bindRenderbuffer(gl.RENDERBUFFER,state.renderbuffer);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,state.unpack);
      if(state.scissor)gl.enable(gl.SCISSOR_TEST);else gl.disable(gl.SCISSOR_TEST);
    }
  }

  dispose(lost=false){
    this.diagnostics.active=false;
    this.failedWidth=0;this.failedHeight=0;
    this.texture?.dispose();this.texture=undefined;
    this.releaseTarget(this.resolve,lost);this.resolve=undefined;
    this.releaseTarget(this.scaled,lost);this.scaled=undefined;
  }
}
