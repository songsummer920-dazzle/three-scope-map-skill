// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {getFuiSkinMaterial,type FuiEarthSkinId} from './fuiEarthTheme';
import {browserMapQualityBudget,type MapQuality,type ResolvedMapQuality} from './mapQuality';
import {supportsFuiGlassHalfFloat,supportedFuiGlassSamples,fuiGlassFramebufferComplete} from './fuiGlassCapabilities';

type GlassOutputMode='hdr'|'ldr'|'direct';
/** Geography-only linear composition. High/balanced retain the Earth cap's
 * display chain. Low disables bloom/MSAA and lowers the target budget. Every
 * allocation is checked: unsupported half-float falls back to linear RGBA8,
 * then to the existing locally mapped materials without clearing the caller.
 * The caller owns renderer, camera, context and frame scheduling. */
export class FuiGlassHdrPass{
  private composer:EffectComposer;
  private source:RenderPass;
  private bloom:UnrealBloomPass;
  private output:OutputPass;
  private exposure=1.19;
  private disposed=false;
  private width=0;
  private height=0;
  private quality:ResolvedMapQuality;
  private budget:ReturnType<typeof browserMapQualityBudget>;
  private halfFloat:boolean;
  private supportedSamples:number[];
  readonly diagnostics:{active:boolean;mode:GlassOutputMode;source:string;output:string;quality:ResolvedMapQuality;
    width:number;height:number;samples:number;frames:number;exposure:number;bloomStrength:number;bloomRadius:number;bloomThreshold:number;
    bloomEnabled:boolean;fallbackReason:string}={active:true,mode:'hdr',source:'earth-cap-linear-hdr',output:'single-aces-srgb',quality:'high',
      width:0,height:0,samples:0,frames:0,exposure:1.19,bloomStrength:0,bloomRadius:0,bloomThreshold:0,bloomEnabled:true,fallbackReason:''};

  constructor(private renderer:THREE.WebGLRenderer,skin:FuiEarthSkinId,quality:MapQuality='high'){
    this.budget=browserMapQualityBudget(quality);this.quality=this.budget.quality;
    const capabilities=this.probeCapabilities();this.halfFloat=capabilities.halfFloat;this.supportedSamples=capabilities.samples;
    const target=new THREE.WebGLRenderTarget(1,1,{type:this.halfFloat?THREE.HalfFloatType:THREE.UnsignedByteType,format:THREE.RGBAFormat,
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false,generateMipmaps:false,
      samples:this.budget.glassSamples?this.supportedSamples[0]??0:0});
    target.texture.name='fui-glass-linear-source';target.texture.colorSpace=THREE.LinearSRGBColorSpace;
    this.composer=new EffectComposer(renderer,target);this.composer.setPixelRatio(1);this.composer.renderToScreen=false;
    this.source=new RenderPass(new THREE.Scene(),new THREE.Camera(),undefined,new THREE.Color(0,0,0),0);this.composer.addPass(this.source);
    this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.26,.16,.44);
    Object.assign(this.bloom.blendMaterial,{blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,
      blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendEquationAlpha:THREE.AddEquation,
      blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
    this.composer.addPass(this.bloom);
    this.output=new OutputPass();this.output.renderToScreen=true;
    this.output.material.fragmentShader=this.output.material.fragmentShader.replace(/}\s*$/,`
      gl_FragColor.a=clamp(max(gl_FragColor.a,max(max(gl_FragColor.r,gl_FragColor.g),gl_FragColor.b)),0.0,1.0);
    }`);
    Object.assign(this.output.material,{transparent:true,depthTest:false,depthWrite:false,
      blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
    this.selectMode(this.halfFloat?'hdr':'ldr',target.samples,this.halfFloat?'':'Half-float color targets are unsupported');
    this.setSkin(skin);
  }
  /** A renderer-local capability boundary. Isolated integration fixtures may
   * override this method; ordinary instances always interrogate their real GL. */
  protected probeCapabilities(){
    const renderer=this.renderer;
    const halfFloat=supportsFuiGlassHalfFloat(renderer);
    let samples:number[]=[];
    if(halfFloat){
      samples=[4,3,2,1].map(value=>supportedFuiGlassSamples(renderer,value)).filter(value=>value>0);
    }
    return{halfFloat,samples};
  }
  protected framebufferComplete(){
    return fuiGlassFramebufferComplete(this.renderer);
  }
  private selectMode(mode:GlassOutputMode,samples:number,reason=''){
    Object.assign(this.diagnostics,{mode,source:mode==='hdr'?'earth-cap-linear-hdr':mode==='ldr'?'earth-cap-linear-ldr':'earth-cap-direct',
      output:mode==='direct'?'local-aces-srgb':'single-aces-srgb',samples,quality:this.quality,fallbackReason:reason});
    this.bloom.enabled=mode==='hdr'&&this.budget.glassBloom;this.diagnostics.bloomEnabled=this.bloom.enabled;
    if(mode!=='direct')for(const target of [this.composer.renderTarget1,this.composer.renderTarget2]){
      const type=mode==='hdr'?THREE.HalfFloatType:THREE.UnsignedByteType;
      if(target.texture.type!==type||target.samples!==samples){target.dispose();target.texture.type=type;target.samples=samples;}
    }
  }
  setQuality(quality:MapQuality){
    const budget=browserMapQualityBudget(quality);if(budget.quality===this.quality)return;
    this.budget=budget;this.quality=budget.quality;this.width=0;this.height=0;
    this.selectMode(this.halfFloat?'hdr':'ldr',this.budget.glassSamples?this.supportedSamples[0]??0:0,
      this.halfFloat?'':'Half-float color targets are unsupported');
  }
  setSkin(skin:FuiEarthSkinId){
    const material=getFuiSkinMaterial(skin);this.exposure=material.exposure;
    this.bloom.strength=material.bloom;this.bloom.radius=material.bloomRadius;this.bloom.threshold=material.bloomThreshold;
    Object.assign(this.diagnostics,{exposure:this.exposure,bloomStrength:this.bloom.strength,bloomRadius:this.bloom.radius,bloomThreshold:this.bloom.threshold});
  }
  private checkTargets(){
    const renderer=this.renderer,previous=renderer.getRenderTarget();
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
    try{
      for(const target of [this.composer.renderTarget1,this.composer.renderTarget2]){
        renderer.setRenderTarget(target);
        if(!this.framebufferComplete())return false;
      }
      return true;
    }catch{return false;}
    finally{renderer.setRenderTarget(previous);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);}
  }
  setSize(width:number,height:number,pixelRatio:number){
    const ratio=Math.min(Math.max(.5,pixelRatio),this.budget.glassPixelRatio,this.budget.glassMaxSize/Math.max(1,width,height));
    const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
    if(w===this.width&&h===this.height)return;
    this.width=w;this.height=h;this.composer.setSize(w,h);Object.assign(this.diagnostics,{width:w,height:h});
    if(this.diagnostics.mode==='direct')return;
    if(this.checkTargets())return;
    if(this.diagnostics.mode==='hdr'&&this.diagnostics.samples>0){
      this.selectMode('hdr',0,'Multisampled half-float framebuffer is incomplete');if(this.checkTargets())return;
    }
    if(this.diagnostics.mode==='hdr'){
      this.selectMode('ldr',0,'Half-float framebuffer is incomplete; using linear RGBA8');if(this.checkTargets())return;
    }
    this.selectMode('direct',0,'Linear RGBA8 framebuffer is incomplete; using direct mapped glass');
    this.composer.renderTarget1.dispose();this.composer.renderTarget2.dispose();
  }
  private directInputs(scene:THREE.Scene){
    const changed=new Map<THREE.IUniform,unknown>();
    scene.traverse(object=>{
      const value=(object as THREE.Mesh).material;
      for(const material of value?(Array.isArray(value)?value:[value]):[])if(material instanceof THREE.ShaderMaterial){
        for(const [name,next] of [['uGlassLinearOutput',0],['uGlassExposure',this.exposure]] as const){
          const uniform=material.uniforms[name];if(uniform&&!changed.has(uniform)){changed.set(uniform,uniform.value);uniform.value=next;}
        }
      }
    });
    return()=>{for(const [uniform,value] of changed)uniform.value=value;};
  }
  private suspendFloatTargets(scene:THREE.Scene){
    if(this.diagnostics.mode==='hdr')return;
    const hidden:THREE.Object3D[]=[];
    scene.traverse(object=>{if(object.name==='fui-map-live-reflection'&&object.visible){hidden.push(object);object.visible=false;}});
    return()=>{for(const object of hidden)object.visible=true;};
  }
  compile<T>(scene:THREE.Scene,camera:THREE.Camera,width:number,height:number,pixelRatio:number,
    sourceLayer:number|undefined,compileVisible:(scene:THREE.Scene,camera:THREE.Camera)=>Promise<T>):Promise<T>{
    if(this.disposed)return Promise.reject(new Error('Cannot compile a retired glass HDR pass'));
    this.setSize(width,height,pixelRatio);
    const target=this.renderer.getRenderTarget(),mask=camera.layers.mask,tone=this.renderer.toneMapping;
    const viewport=this.renderer.getViewport(new THREE.Vector4());
    const restore=this.diagnostics.mode==='direct'?this.directInputs(scene):undefined;
    const restoreFloatTargets=this.suspendFloatTargets(scene);
    try{
      if(sourceLayer!==undefined)camera.layers.set(sourceLayer);
      this.renderer.toneMapping=THREE.NoToneMapping;if(this.diagnostics.mode!=='direct')this.renderer.setRenderTarget(this.composer.readBuffer);
      return compileVisible(scene,camera);
    }finally{restore?.();restoreFloatTargets?.();this.renderer.setRenderTarget(target);this.renderer.setViewport(viewport);this.renderer.toneMapping=tone;camera.layers.mask=mask;}
  }
  render(scene:THREE.Scene,camera:THREE.Camera,width:number,height:number,pixelRatio:number,sourceLayer?:number){
    if(this.disposed)return;this.setSize(width,height,pixelRatio);
    const renderer=this.renderer,target=renderer.getRenderTarget(),mask=camera.layers.mask;
    const tone=renderer.toneMapping,exposure=renderer.toneMappingExposure,colorSpace=renderer.outputColorSpace;
    const autoClear=renderer.autoClear,viewport=renderer.getViewport(new THREE.Vector4());
    let restore:(()=>void)|undefined;
    const restoreFloatTargets=this.suspendFloatTargets(scene);
    try{
      if(sourceLayer!==undefined)camera.layers.set(sourceLayer);renderer.autoClear=false;renderer.toneMapping=THREE.NoToneMapping;
      if(this.diagnostics.mode==='direct'){restore=this.directInputs(scene);renderer.render(scene,camera);}
      else{
        this.source.scene=scene;this.source.camera=camera;this.composer.render(0);
        renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=this.exposure;renderer.outputColorSpace=THREE.SRGBColorSpace;
        this.output.render(renderer,this.composer.writeBuffer,this.composer.readBuffer,0,false);
      }
      this.diagnostics.frames++;
    }finally{
      restore?.();restoreFloatTargets?.();renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.autoClear=autoClear;
      renderer.toneMapping=tone;renderer.toneMappingExposure=exposure;renderer.outputColorSpace=colorSpace;camera.layers.mask=mask;
    }
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.diagnostics.active=false;
    this.bloom.dispose();this.source.dispose();this.output.dispose();this.composer.dispose();
  }
}
