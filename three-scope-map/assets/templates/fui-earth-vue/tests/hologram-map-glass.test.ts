// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createFuiMapHologramSurface,
  createFuiMapHologramBacking,
  updateFuiMapHologramSurface,
  setFuiMapHologramBackdrop,
} from '../src/components/map/fuiMapHologramSurface';
import {createFuiFlatTerrainState} from '../src/components/map/fuiMapTerrain';
import {createFuiHologramPigment,type FuiEarthSkinId} from '../src/components/map/fuiEarthTheme';
import {FUI_HOLOGRAM_GLASS_OPTICS_GLSL} from '../src/components/map/fuiHologramGlassOptics';

type Pair={coat:THREE.ShaderMaterial;backing:THREE.ShaderMaterial};
function fixture(t:TestContext){
  const edges=new THREE.DataTexture(new Uint8Array([255,255,0,255]),1,1);
  const terrain=createFuiFlatTerrainState({texture:edges,bounds:new THREE.Vector4(-20,-10,40,20)},new THREE.Vector4(.001,.002,.5,.5));
  const environment=new THREE.Texture();environment.image={height:1024,width:768};
  const materials=new Set<THREE.ShaderMaterial>();
  const pair=(skin:FuiEarthSkinId='glacier'):Pair=>{
    const coat=createFuiMapHologramSurface(skin,terrain,environment);
    const backing=createFuiMapHologramBacking(coat);
    materials.add(coat);materials.add(backing);return{coat,backing};
  };
  const disposePair=({coat,backing}:Pair)=>{
    for(const material of [coat,backing])if(materials.delete(material))material.dispose();
  };
  t.after(()=>{
    for(const material of materials)material.dispose();
    terrain.heightTexture!.dispose();edges.dispose();environment.dispose();
  });
  return{edges,terrain,environment,pair,disposePair};
}

test('a province shares live optical uniforms across its two layers without sharing selection or pigment with another province',(t)=>{
  const f=fixture(t),first=f.pair(),second=f.pair();
  assert.notEqual(first.coat,first.backing);
  assert.notEqual(first.coat.uniforms,first.backing.uniforms);
  for(const key of ['uPigment','uCorePigment','uSelection','uOpacity','uGlassDepth','uEngravingDepth','uGlassExposure','uGlassLightDirection','uBoundaryImageStrength']){
    assert.equal(first.coat.uniforms[key],first.backing.uniforms[key],`${key} stopped following its regional coat`);
    assert.notEqual(first.coat.uniforms[key],second.coat.uniforms[key],`${key} leaked across provinces`);
  }
  for(const material of [first.coat,first.backing,second.coat,second.backing]){
    assert.equal(material.uniforms.uFuiTerrainEdges.value,f.edges);
    assert.equal(material.uniforms.uGlassEnvironment.value,f.environment);
  }
  const secondPigment=second.coat.uniforms.uPigment.value.clone();
  updateFuiMapHologramSurface(first.coat,'#9f42e6',1);
  first.coat.uniforms.uGlassDepth.value=48;
  assert.equal(first.backing.uniforms.uSelection.value,1);
  assert.equal(first.backing.uniforms.uGlassDepth.value,48);
  assert.equal(first.backing.uniforms.uEngravingDepth.value,2.6,'Hover thickness changed the engraving gap');
  assert.equal(second.coat.uniforms.uSelection.value,0);
  assert.equal(second.coat.uniforms.uGlassDepth.value,32);
  assert(second.coat.uniforms.uPigment.value.equals(secondPigment));
});

test('entrance opacity updates never turn the intrinsic transparent coat opaque or change the backing depth contract',(t)=>{
  const {pair}=fixture(t),{coat,backing}=pair();
  for(const opacity of [1,.24,0,1]){
    coat.opacity=backing.opacity=opacity;
    updateFuiMapHologramSurface(coat,'glacier',.7);
    updateFuiMapHologramSurface(backing,'glacier');
    for(const material of [coat,backing]){
      assert.equal(material.transparent,true);
      assert.equal(material.uniforms.uOpacity.value,opacity);
      assert.equal(material.depthTest,true);
      assert.equal(material.blending,THREE.NormalBlending);
      assert.equal(material.side,THREE.FrontSide);
      assert.equal(material.toneMapped,false,'Global renderer mapping must not remap this local ACES surface');
    }
    assert.equal(coat.depthWrite,false,'The clear coat occludes its own lower engraving');
    assert.equal(backing.depthWrite,true,'The lower layer stopped participating in real map occlusion');
  }
});

test('hot theme and common opacity changes reach both layers without replacing borrowed geographic or environment textures',(t)=>{
  const f=fixture(t),{coat,backing}=f.pair();
  for(const [skin,opacity] of [['#9f42e6',.35],['#22e680',.7],['#808080',1],['glacier',1]] as const){
    coat.opacity=backing.opacity=opacity;
    updateFuiMapHologramSurface(coat,skin,.8);
    updateFuiMapHologramSurface(backing,skin);
    const pigment=createFuiHologramPigment(skin);
    pigment.multiplyScalar(1/Math.max(pigment.r,pigment.g,pigment.b,.001));
    const core=pigment.clone().lerp(new THREE.Color(1,1,1),.30);
    for(const material of [coat,backing]){
      assert(material.uniforms.uPigment.value.equals(pigment));
      assert(material.uniforms.uCorePigment.value.equals(core));
      assert.equal(material.uniforms.uOpacity.value,opacity);
      assert.equal(material.uniforms.uFuiTerrainEdges.value,f.edges);
      assert.equal(material.uniforms.uGlassEnvironment.value,f.environment);
    }
  }
});

test('updating the backing with its default selection argument cannot cancel the selected coat',(t)=>{
  const {pair}=fixture(t),{coat,backing}=pair();
  updateFuiMapHologramSurface(coat,'glacier',.97);
  updateFuiMapHologramSurface(backing,'glacier');
  assert.equal(coat.uniforms.uSelection.value,.97);
  updateFuiMapHologramSurface(backing,'#9f42e6',0);
  assert.equal(backing.uniforms.uSelection.value,.97);
  updateFuiMapHologramSurface(coat,'#9f42e6',0);
  assert.equal(coat.uniforms.uSelection.value,0);
  assert.equal(backing.uniforms.uSelection.value,0);
});

test('disposing one province releases its two material owners while borrowed textures and another live province remain usable',(t)=>{
  const f=fixture(t),first=f.pair(),second=f.pair();
  let materialDisposals=0,textureDisposals=0;
  for(const material of [first.coat,first.backing])material.addEventListener('dispose',()=>materialDisposals++);
  for(const texture of [f.edges,f.environment,f.terrain.heightTexture!])texture.addEventListener('dispose',()=>textureDisposals++);
  f.disposePair(first);
  assert.equal(materialDisposals,2);
  assert.equal(textureDisposals,0,'A regional material took ownership of a shared texture');
  updateFuiMapHologramSurface(second.coat,'#22e680',1);
  assert.equal(second.backing.uniforms.uSelection.value,1);
  assert.equal(second.backing.uniforms.uFuiTerrainEdges.value,f.edges);
  assert.equal(second.backing.uniforms.uGlassEnvironment.value,f.environment);
  f.disposePair(second);
  assert.equal(textureDisposals,0,'The final regional material disposed a parent-owned resource');
});

test('a backdrop binding updates both layers in place, copies the live projective state and leaves another province independent',(t)=>{
  const f=fixture(t),first=f.pair(),second=f.pair();
  const texture=new THREE.FramebufferTexture(1280,720);t.after(()=>texture.dispose());
  const source=new THREE.Matrix4().makePerspective(-.2,.3,.16,-.14,.1,2000)
    .multiply(new THREE.Matrix4().makeTranslation(10,-20,-400));
  const before=source.clone(),stored=first.coat.uniforms.uGlassBackdropProjection.value;
  const viewport=first.coat.uniforms.uGlassBackdropViewport.value;
  for(const key of ['uGlassBackdrop','uHasGlassBackdrop','uGlassBackdropViewport','uGlassBackdropProjection']){
    assert.equal(first.coat.uniforms[key],first.backing.uniforms[key],`${key} stopped following the regional pair`);
    assert.notEqual(first.coat.uniforms[key],second.coat.uniforms[key],`${key} leaked into another province`);
  }
  setFuiMapHologramBackdrop(first.coat,texture,1280,720,source);
  assert(source.equals(before),'Binding mutated its caller-owned camera projection');
  assert.equal(first.coat.uniforms.uGlassBackdropProjection.value,stored);
  assert.notEqual(stored,source,'A camera matrix was borrowed by mutable reference');
  assert(stored.equals(before));
  assert.equal(first.backing.uniforms.uGlassBackdrop.value,texture);
  assert.equal(first.backing.uniforms.uHasGlassBackdrop.value,1);
  assert.equal(first.backing.uniforms.uGlassBackdropViewport.value,viewport);
  assert.deepEqual(viewport.toArray(),[1280,720]);
  source.elements[12]+=100;
  assert(stored.equals(before),'A later camera update changed an already-bound frame projection');
  assert.equal(second.coat.uniforms.uHasGlassBackdrop.value,0);
  assert.equal(second.coat.uniforms.uGlassBackdrop.value,f.terrain.heightTexture);

  const resized=new THREE.Matrix4().makePerspective(-.15,.15,.1,-.1,.2,4000);
  setFuiMapHologramBackdrop(first.backing,texture,640,360,resized);
  assert.equal(first.coat.uniforms.uGlassBackdropProjection.value,stored);
  assert(stored.equals(resized));
  assert.deepEqual(viewport.toArray(),[640,360]);
});

test('hot skin, opacity and selection updates retain the currently captured backdrop and camera',(t)=>{
  const {pair}=fixture(t),{coat,backing}=pair();
  const texture=new THREE.FramebufferTexture(960,540);t.after(()=>texture.dispose());
  const projection=new THREE.Matrix4().makePerspective(-.1,.1,.08,-.08,.1,3000);
  setFuiMapHologramBackdrop(coat,texture,960,540,projection);
  for(const skin of ['#9f42e6','#22e680','#808080','glacier'] as const){
    coat.opacity=backing.opacity=.65;
    updateFuiMapHologramSurface(coat,skin,.85);
    updateFuiMapHologramSurface(backing,skin);
    for(const material of [coat,backing]){
      assert.equal(material.uniforms.uGlassBackdrop.value,texture);
      assert.equal(material.uniforms.uHasGlassBackdrop.value,1);
      assert.deepEqual(material.uniforms.uGlassBackdropViewport.value.toArray(),[960,540]);
      assert(material.uniforms.uGlassBackdropProjection.value.equals(projection));
      assert.equal(material.uniforms.uSelection.value,.85);
      assert.equal(material.uniforms.uOpacity.value,.65);
    }
  }
});

test('disabling transmission through either layer restores the owned neutral sampler without disposing or reconfiguring the borrowed image',(t)=>{
  const f=fixture(t),{coat,backing}=f.pair();
  const texture=new THREE.FramebufferTexture(400,300);texture.colorSpace=THREE.SRGBColorSpace;
  const filtering=[texture.minFilter,texture.magFilter],image=texture.image;
  let borrowedDisposals=0;texture.addEventListener('dispose',()=>borrowedDisposals++);
  t.after(()=>texture.dispose());
  const projection=new THREE.Matrix4().makePerspective(-.2,.2,.15,-.15,.5,1000);
  for(const layer of [coat,backing]){
    setFuiMapHologramBackdrop(layer,texture,400,300,projection);
    setFuiMapHologramBackdrop(layer,undefined,0,-3,projection);
    for(const material of [coat,backing]){
      assert.equal(material.uniforms.uHasGlassBackdrop.value,0);
      assert.equal(material.uniforms.uGlassBackdrop.value,f.terrain.heightTexture,'Disabled transmission lost its valid neutral sampler');
      assert.deepEqual(material.uniforms.uGlassBackdropViewport.value.toArray(),[1,1]);
    }
    assert.equal(borrowedDisposals,0);
    assert.equal(texture.image,image);
    assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
    assert.deepEqual([texture.minFilter,texture.magFilter],filtering);
  }
});

test('material-pair disposal leaves a captured framebuffer texture owned by its capture backend',(t)=>{
  const f=fixture(t),first=f.pair(),second=f.pair();
  const texture=new THREE.FramebufferTexture(512,256),projection=new THREE.Matrix4();
  let borrowedDisposals=0;texture.addEventListener('dispose',()=>borrowedDisposals++);
  setFuiMapHologramBackdrop(first.coat,texture,512,256,projection);
  setFuiMapHologramBackdrop(second.coat,texture,512,256,projection);
  f.disposePair(first);
  assert.equal(borrowedDisposals,0);
  assert.equal(second.backing.uniforms.uGlassBackdrop.value,texture);
  assert.equal(second.backing.uniforms.uHasGlassBackdrop.value,1);
  f.disposePair(second);
  assert.equal(borrowedDisposals,0,'The final glass material released the external framebuffer capture');
  texture.dispose();
  assert.equal(borrowedDisposals,1,'The capture backend could not release its own texture exactly once');
});

test('the paired surface embeds shared linear cap optics and exposes an independent live HDR output policy',(t)=>{
  const f=fixture(t),first=f.pair(),second=f.pair();
  for(const pair of [first,second])for(const material of [pair.coat,pair.backing]){
    assert(material.fragmentShader.includes(FUI_HOLOGRAM_GLASS_OPTICS_GLSL),'A glass variant stopped compiling the shared Earth-cap radiance core');
    assert.equal(material.uniforms.uGlassLinearOutput.value,0,'Legacy direct rendering unexpectedly changed output policy');
    assert.equal(material.uniforms.uGlassBackdropStrength.value,0,'An optional basemap changed the reference cap energy by default');
  }
  assert.equal(first.coat.uniforms.uGlassLinearOutput,first.backing.uniforms.uGlassLinearOutput);
  assert.notEqual(first.coat.uniforms.uGlassLinearOutput,second.coat.uniforms.uGlassLinearOutput);
  first.coat.uniforms.uGlassLinearOutput.value=1;
  updateFuiMapHologramSurface(first.coat,'#9f42e6',.9);
  updateFuiMapHologramSurface(first.backing,'#9f42e6');
  assert.equal(first.backing.uniforms.uGlassLinearOutput.value,1,'A material update disabled the caller-owned HDR pass');
  assert.equal(second.coat.uniforms.uGlassLinearOutput.value,0,'A different province inherited the HDR flag by reference');
  assert.equal(first.coat.uniforms.uSelection.value,.9);
});

test('capturing or disabling a backdrop never opts the glass into transmission or resets its HDR output policy',(t)=>{
  const f=fixture(t),{coat,backing}=f.pair();
  const texture=new THREE.FramebufferTexture(640,360);t.after(()=>texture.dispose());
  const projection=new THREE.Matrix4().makePerspective(-.2,.2,.1,-.1,.1,3000);
  coat.uniforms.uGlassLinearOutput.value=1;
  setFuiMapHologramBackdrop(coat,texture,640,360,projection);
  assert.equal(backing.uniforms.uHasGlassBackdrop.value,1);
  assert.equal(backing.uniforms.uGlassBackdropStrength.value,0,'A captured frame silently replaced the cap backing');
  coat.uniforms.uGlassBackdropStrength.value=1;
  updateFuiMapHologramSurface(coat,'#22e680',.6);
  updateFuiMapHologramSurface(backing,'#22e680');
  assert.equal(backing.uniforms.uGlassBackdropStrength.value,1,'A hot theme discarded an explicit transmission choice');
  setFuiMapHologramBackdrop(backing,undefined,640,360,projection);
  assert.equal(coat.uniforms.uHasGlassBackdrop.value,0);
  assert.equal(coat.uniforms.uGlassBackdrop.value,f.terrain.heightTexture);
  assert.equal(coat.uniforms.uGlassBackdropStrength.value,1,'Disabling a borrowed source mutated caller policy');
  assert.equal(coat.uniforms.uGlassLinearOutput.value,1);
});
