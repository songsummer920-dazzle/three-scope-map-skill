// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FuiGlassHdrPass} from '../src/components/map/fuiGlassHdrPass';
import {getFuiSkinMaterial,type FuiEarthSkinId} from '../src/components/map/fuiEarthTheme';
import type {MapQuality} from '../src/components/map/mapQuality';
import {supportsFuiGlassHalfFloat,supportedFuiGlassSamples} from '../src/components/map/fuiGlassCapabilities';
import {createFuiMapReflection} from '../src/components/map/fuiMapReflection';

// Exercise CPU-side target ownership and compile submission only. Rendering
// remains covered by the real WebGL regression; no GL draws are simulated.
function fixture(t:TestContext,samples:readonly number[]|null=[8,4,2],options:{halfFloat?:boolean;statuses?:number[];quality?:MapQuality;colorRenderable?:boolean}={}){
  const borrowedTarget=new THREE.WebGLRenderTarget(37,23);
  let target:THREE.WebGLRenderTarget|null=borrowedTarget;
  const calls={rendererDispose:0,contextLoss:0,borrowedTargetDispose:0};
  borrowedTarget.addEventListener('dispose',()=>calls.borrowedTargetDispose++);
  const viewport=new THREE.Vector4(4,7,37,23),scissor=new THREE.Vector4(2,3,11,13);let scissorTest=true;
  const statuses=[...(options.statuses??[])];let sampleQueries=0;
  const originalDraw={borrowed:'draw'},originalRead={borrowed:'read'},originalRenderbuffer={borrowed:'renderbuffer'};
  let draw:object|null=originalDraw,read:object|null=originalRead,renderbuffer:object|null=originalRenderbuffer;
  const owned=new Set<object>(),probes={framebuffers:0,renderbuffers:0,deletedFramebuffers:0,deletedRenderbuffers:0};
  const gl={RENDERBUFFER:0x8d41,RGBA16F:0x881a,SAMPLES:0x80a9,FRAMEBUFFER:0x8d40,FRAMEBUFFER_COMPLETE:0x8cd5,
    DRAW_FRAMEBUFFER:0x8ca9,READ_FRAMEBUFFER:0x8ca8,DRAW_FRAMEBUFFER_BINDING:0x8ca6,READ_FRAMEBUFFER_BINDING:0x8caa,RENDERBUFFER_BINDING:0x8ca7,COLOR_ATTACHMENT0:0x8ce0,
    getParameter:(parameter:number)=>parameter===0x8ca6?draw:parameter===0x8caa?read:parameter===0x8ca7?renderbuffer:null,
    createFramebuffer:()=>{const value={owned:'framebuffer'};owned.add(value);probes.framebuffers++;return value;},
    createRenderbuffer:()=>{probes.renderbuffers++;return {owned:'renderbuffer'};},
    bindFramebuffer:(kind:number,value:object|null)=>{if(kind===0x8d40||kind===0x8ca9)draw=value;if(kind===0x8d40||kind===0x8ca8)read=value;},
    bindRenderbuffer:(_kind:number,value:object|null)=>{renderbuffer=value;},
    renderbufferStorage:()=>{},framebufferRenderbuffer:()=>{},
    deleteFramebuffer:()=>{probes.deletedFramebuffers++;},deleteRenderbuffer:()=>{probes.deletedRenderbuffers++;},
    checkFramebufferStatus:()=>owned.has(draw!)?(options.colorRenderable===false?0x8cd6:0x8cd5):statuses.shift()??0x8cd5,
    getInternalformatParameter(formatTarget:number,format:number,parameter:number){
      sampleQueries++;
      assert.deepEqual([formatTarget,format,parameter],[0x8d41,0x881a,0x80a9]);
      return samples===null?null:new Int32Array(samples);
    },
  };
  const renderer={
    toneMapping:THREE.ReinhardToneMapping,
    extensions:{has:(name:string)=>(options.halfFloat??true)&&name==='EXT_color_buffer_float',get:()=>({})},
    getViewport:(value:THREE.Vector4)=>value.copy(viewport),setViewport:(value:THREE.Vector4)=>{viewport.copy(value);},
    getScissor:(value:THREE.Vector4)=>value.copy(scissor),setScissor:(value:THREE.Vector4)=>{scissor.copy(value);},
    getScissorTest:()=>scissorTest,setScissorTest:(value:boolean)=>{scissorTest=value;},
    getContext:()=>gl,
    getPixelRatio:()=>2,
    getSize:(size:THREE.Vector2)=>size.set(640,360),
    getRenderTarget:()=>target,
    setRenderTarget:(next:THREE.WebGLRenderTarget|null)=>{target=next;if(next)viewport.set(0,0,next.width,next.height);},
    dispose:()=>{calls.rendererDispose++;},
    forceContextLoss:()=>{calls.contextLoss++;},
  };
  const pass=new FuiGlassHdrPass(renderer as unknown as THREE.WebGLRenderer,'glacier',options.quality);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  camera.layers.enable(2);
  t.after(()=>{pass.dispose();borrowedTarget.dispose();});
  return{pass,renderer,gl,scene,camera,borrowedTarget,calls,viewport,scissor,statuses,probes,originalDraw,originalRead,originalRenderbuffer,sampleQueries:()=>sampleQueries};
}

test('HDR compile submits to a linear half-float source synchronously and restores borrowed state before its promise settles',async t=>{
  const f=fixture(t),mask=f.camera.layers.mask,tone=f.renderer.toneMapping;
  let finish!:(value:string)=>void,entered=false,settled=false;
  const compilation=new Promise<string>(resolve=>{finish=resolve;});
  const pending=f.pass.compile(f.scene,f.camera,1280,720,1,3,(scene,camera)=>{
    entered=true;
    assert.equal(scene,f.scene);assert.equal(camera,f.camera);
    assert.equal(camera.layers.mask,1<<3);
    assert.equal(f.renderer.toneMapping,THREE.NoToneMapping);
    const source=f.renderer.getRenderTarget();
    assert(source);assert.notEqual(source,f.borrowedTarget);
    assert.equal(source.texture.type,THREE.HalfFloatType);
    assert.equal(source.texture.colorSpace,THREE.LinearSRGBColorSpace);
    assert.equal(source.depthBuffer,true);
    assert.deepEqual([source.width,source.height],[1280,720]);
    return compilation;
  });
  void pending.then(()=>{settled=true;});
  assert(entered,'Compile submission was deferred beyond the temporary target binding');
  assert.equal(pending,compilation);
  assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget);
  assert.equal(f.camera.layers.mask,mask);assert.equal(f.renderer.toneMapping,tone);
  await Promise.resolve();assert.equal(settled,false);
  finish('compiled');assert.equal(await pending,'compiled');
  assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget);assert.equal(f.camera.layers.mask,mask);
});

test('a synchronous compile failure restores target, camera layers and tone mapping',t=>{
  const f=fixture(t),mask=f.camera.layers.mask,tone=f.renderer.toneMapping,error=new Error('compile submission failed');
  assert.throws(()=>f.pass.compile(f.scene,f.camera,800,600,1,3,()=>{
    assert.notEqual(f.renderer.getRenderTarget(),f.borrowedTarget);
    assert.equal(f.camera.layers.mask,1<<3);
    throw error;
  }),error);
  assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget);
  assert.equal(f.camera.layers.mask,mask);assert.equal(f.renderer.toneMapping,tone);
});

test('shared-camera compilation preserves its supplied layer mask when no source layer is requested',async t=>{
  const f=fixture(t),mask=f.camera.layers.mask;
  await f.pass.compile(f.scene,f.camera,320,240,1,undefined,(_scene,camera)=>{
    assert.equal(camera.layers.mask,mask);return Promise.resolve();
  });
  assert.equal(f.camera.layers.mask,mask);assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget);
});

test('every skin uses the exact Earth exposure and bloom contract without replacing the HDR pass',t=>{
  const {pass}=fixture(t),diagnostics=pass.diagnostics;
  const skins:FuiEarthSkinId[]=['original','amber','glacier','alert','#9f42e6','#808080'];
  for(const skin of skins){
    pass.setSkin(skin);const earth=getFuiSkinMaterial(skin);
    assert.equal(pass.diagnostics,diagnostics);
    assert.deepEqual([diagnostics.exposure,diagnostics.bloomStrength,diagnostics.bloomRadius,diagnostics.bloomThreshold],
      [earth.exposure,earth.bloom,earth.bloomRadius,earth.bloomThreshold]);
  }
});

test('HDR target uses a bounded aspect-preserving size and only samples reported as supported',async t=>{
  for(const [supported,expected] of [[[8,2,4],4],[[8,3,1],3],[[8,2],2],[[8],0],[[0],0],[null,0]] as const){
    const f=fixture(t,supported);
    assert.equal(f.pass.diagnostics.samples,expected);
    await f.pass.compile(f.scene,f.camera,7680,4320,3,3,()=>{
      const source=f.renderer.getRenderTarget()!;
      assert.equal(source.samples,expected);
      assert.equal(source.width,2048);assert.equal(source.height,1152);
      assert.deepEqual([source.width,source.height],[f.pass.diagnostics.width,f.pass.diagnostics.height]);
      return Promise.resolve();
    });
    f.pass.setSize(1,1,.1);
    assert.deepEqual([f.pass.diagnostics.width,f.pass.diagnostics.height],[1,1]);
  }
});

test('retirement releases the owned source once and never disposes the borrowed renderer, target, camera or context',async t=>{
  const f=fixture(t),mask=f.camera.layers.mask,position=f.camera.position.clone();
  let sourceDisposals=0,cameraDisposals=0;
  Object.assign(f.camera,{dispose:()=>{cameraDisposals++;}});
  await f.pass.compile(f.scene,f.camera,320,180,1,3,()=>{
    f.renderer.getRenderTarget()!.addEventListener('dispose',()=>sourceDisposals++);
    return Promise.resolve();
  });
  f.pass.dispose();f.pass.dispose();
  assert.equal(sourceDisposals,1);assert.equal(f.pass.diagnostics.active,false);
  assert.deepEqual(f.calls,{rendererDispose:0,contextLoss:0,borrowedTargetDispose:0});
  assert.equal(cameraDisposals,0);assert.equal(f.renderer.getContext(),f.gl);
  assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget);
  assert.equal(f.camera.layers.mask,mask);assert(f.camera.position.equals(position));
  await assert.rejects(f.pass.compile(f.scene,f.camera,320,180,1,3,()=>Promise.resolve()),/retired/);
  assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget);
});


test('low quality reduces target area and removes multisampling and bloom; switching back preserves the calibrated high pipeline',async t=>{
  const f=fixture(t),pass=f.pass;
  pass.setQuality('low');
  await pass.compile(f.scene,f.camera,7680,4320,3,3,()=>{
    const target=f.renderer.getRenderTarget()!;
    assert.deepEqual([target.width,target.height,target.samples],[1024,576,0]);
    assert.equal(target.texture.type,THREE.HalfFloatType);return Promise.resolve();
  });
  assert.equal(pass.diagnostics.quality,'low');assert.equal(pass.diagnostics.bloomEnabled,false);
  pass.setQuality('high');
  await pass.compile(f.scene,f.camera,7680,4320,3,3,()=>{
    const target=f.renderer.getRenderTarget()!;
    assert.deepEqual([target.width,target.height,target.samples],[2048,1152,4]);return Promise.resolve();
  });
  assert.equal(pass.diagnostics.mode,'hdr');assert.equal(pass.diagnostics.bloomEnabled,true);
  assert.equal(pass.diagnostics.exposure,getFuiSkinMaterial('glacier').exposure);
});

test('missing half-float color support selects a real linear RGBA8 source and does not run half-float bloom',async t=>{
  const f=fixture(t,[8,4,2],{halfFloat:false});
  await f.pass.compile(f.scene,f.camera,640,360,1,3,()=>{
    const target=f.renderer.getRenderTarget()!;
    assert.equal(target.texture.type,THREE.UnsignedByteType);assert.equal(target.texture.colorSpace,THREE.LinearSRGBColorSpace);
    assert.equal(target.samples,0);return Promise.resolve();
  });
  assert.equal(f.pass.diagnostics.mode,'ldr');assert.equal(f.pass.diagnostics.bloomEnabled,false);
  assert.match(f.pass.diagnostics.fallbackReason,/unsupported/);
  assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget);
});

test('an incomplete multisampled target retries half-float without MSAA before changing the glass color pipeline',async t=>{
  const f=fixture(t,[4,2],{statuses:[0x8cd6,0x8cd5,0x8cd5]});
  await f.pass.compile(f.scene,f.camera,800,600,1,3,()=>{
    assert.equal(f.renderer.getRenderTarget()!.samples,0);
    assert.equal(f.renderer.getRenderTarget()!.texture.type,THREE.HalfFloatType);return Promise.resolve();
  });
  assert.equal(f.pass.diagnostics.mode,'hdr');assert.equal(f.pass.diagnostics.bloomEnabled,true);
  assert.match(f.pass.diagnostics.fallbackReason,/Multisampled/);
});

test('failed half-float allocations fall back to RGBA8 without clearing or losing the borrowed viewport/scissor',async t=>{
  const f=fixture(t,[4],{statuses:[0x8cd6,0x8cd6,0x8cd5,0x8cd5]});
  const viewport=f.viewport.clone(),scissor=f.scissor.clone();
  f.pass.setSize(1200,800,1);
  assert.equal(f.pass.diagnostics.mode,'ldr');assert.equal(f.pass.diagnostics.samples,0);assert.equal(f.pass.diagnostics.bloomEnabled,false);
  assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget);
  assert(f.viewport.equals(viewport));assert(f.scissor.equals(scissor));assert.equal(f.renderer.getScissorTest(),true);
  await f.pass.compile(f.scene,f.camera,1200,800,1,3,()=>{
    assert.equal(f.renderer.getRenderTarget()!.texture.type,THREE.UnsignedByteType);return Promise.resolve();
  });
});

test('when both offscreen formats fail, direct compilation uses local mapping temporarily and restores paired uniforms and caller state',async t=>{
  const f=fixture(t,[4],{statuses:[0x8cd6,0x8cd6,0x8cd6]});
  const linear={value:1},exposure={value:.73};
  const material=new THREE.ShaderMaterial({uniforms:{uGlassLinearOutput:linear,uGlassExposure:exposure}});
  const geometry=new THREE.PlaneGeometry(1,1);f.scene.add(new THREE.Mesh(geometry,material));
  t.after(()=>{material.dispose();geometry.dispose();});
  let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
  const mask=f.camera.layers.mask,tone=f.renderer.toneMapping;
  const result=f.pass.compile(f.scene,f.camera,800,600,1,3,()=>{
    assert.equal(f.renderer.getRenderTarget(),f.borrowedTarget,'Direct mode bound an unusable owned target');
    assert.equal(linear.value,0);assert.equal(exposure.value,getFuiSkinMaterial('glacier').exposure);
    return pending;
  });
  assert.equal(result,pending);assert.equal(f.pass.diagnostics.mode,'direct');assert.equal(f.pass.diagnostics.bloomEnabled,false);
  assert.equal(linear.value,1);assert.equal(exposure.value,.73);
  assert.equal(f.camera.layers.mask,mask);assert.equal(f.renderer.toneMapping,tone);
  finish();await pending;
});


test('half-float capability checks real color completeness once and restores independent borrowed bindings',t=>{
  const f=fixture(t);
  assert.equal(supportsFuiGlassHalfFloat(f.renderer as unknown as THREE.WebGLRenderer),true);
  assert.deepEqual(f.probes,{framebuffers:1,renderbuffers:1,deletedFramebuffers:1,deletedRenderbuffers:1});
  assert.equal(f.gl.getParameter(f.gl.DRAW_FRAMEBUFFER_BINDING),f.originalDraw);
  assert.equal(f.gl.getParameter(f.gl.READ_FRAMEBUFFER_BINDING),f.originalRead);
  assert.equal(f.gl.getParameter(f.gl.RENDERBUFFER_BINDING),f.originalRenderbuffer);
});

test('a reported extension with an incomplete half-float color attachment is rejected before dependent targets',t=>{
  const f=fixture(t,[4],{colorRenderable:false});
  assert.equal(f.pass.diagnostics.mode,'ldr');assert.equal(f.pass.diagnostics.bloomEnabled,false);
  assert.equal(supportsFuiGlassHalfFloat(f.renderer as unknown as THREE.WebGLRenderer),false);
  assert.deepEqual(f.probes,{framebuffers:1,renderbuffers:1,deletedFramebuffers:1,deletedRenderbuffers:1});
});

test('non-HDR compile excludes any remaining float reflector without mutating its owner visibility',async t=>{
  const f=fixture(t,[4],{halfFloat:false}),reflector=new THREE.Object3D();reflector.name='fui-map-live-reflection';f.scene.add(reflector);
  await f.pass.compile(f.scene,f.camera,640,360,1,3,()=>{
    assert.equal(reflector.visible,false,'A float reflection remained in the fallback draw/compile source');return Promise.resolve();
  });
  assert.equal(reflector.visible,true,'A temporary compilation mask changed owner visibility');
});


test('the mirror uses two samples only when RGBA16F explicitly reports two, independently of single-sample float support',t=>{
  const texture=new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1);t.after(()=>texture.dispose());
  const field={texture,bounds:new THREE.Vector4(-10,-5,20,10)};
  for(const [reported,expected] of [[[4,2],2],[[4],0],[[8,3,1],0],[[2],2],[null,0]] as const){
    const f=fixture(t,reported),renderer=f.renderer as unknown as THREE.WebGLRenderer;
    assert.equal(supportsFuiGlassHalfFloat(renderer),true,'A valid single-sample target was incorrectly rejected');
    const requested=supportedFuiGlassSamples(renderer,2);assert.equal(requested,expected);
    const mirror=createFuiMapReflection(field,800,600,1,'high',true,requested)!;
    assert.equal(mirror.getRenderTarget().samples,expected,'The mirror silently assumed format-specific MSAA support');
    assert.equal(f.sampleQueries(),1,'HDR and mirror repeated the same driver capability query');
    t.after(()=>{mirror.dispose();mirror.geometry.dispose();});
  }
});
