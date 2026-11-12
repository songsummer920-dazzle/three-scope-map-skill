// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bindFuiClassicTerrainMaterial,getFuiClassicStyle,recolorFuiClassicColor,updateFuiClassicColors} from '../src/components/map/fuiClassicTheme';
import {mapThemeStyle} from '../src/components/map/mapTheme';

test('classic terrain clones explicitly keep the optional luminance hook and native textures',()=>{
  const map=new THREE.Texture(),normal=new THREE.Texture(),height=new THREE.Texture();
  const original=new THREE.MeshStandardMaterial({color:'#0a1607',emissive:'#101d08',map,normalMap:normal,displacementMap:height,displacementScale:5.6,opacity:.84});
  original.userData.terrainConfig={elevationScale:5.6};
  const base=bindFuiClassicTerrainMaterial(original),clone=original.clone();
  const binding=bindFuiClassicTerrainMaterial(clone);assert.notEqual(binding,base);assert.equal(binding.value,0);
  const shader={uniforms:{},fragmentShader:'#include <map_fragment>',vertexShader:''} as unknown as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
  clone.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  assert.equal(shader.uniforms.uFuiClassicRecolor,binding);
  assert(shader.fragmentShader.includes('fuiTerrainLuminance'));
  assert(shader.fragmentShader.includes('diffuseColor *= sampledDiffuseColor'));
  const color=clone.color.clone(),emissive=clone.emissive.clone();
  updateFuiClassicColors(clone,'#9f42e6');assert.equal(binding.value,1);assert(!clone.color.equals(color));
  assert.equal(clone.map,map);assert.equal(clone.normalMap,normal);assert.equal(clone.displacementMap,height);
  assert.equal(clone.displacementScale,5.6);assert.equal(clone.opacity,.84);
  updateFuiClassicColors(clone,'glacier');assert.equal(binding.value,0);
  assert(clone.color.equals(color));assert(clone.emissive.equals(emissive));
  original.dispose();clone.dispose();map.dispose();normal.dispose();height.dispose();
});
test('classic HEX changes recolor ordinary colors, emission, lights and shader Color uniforms without cross-instance state',()=>{
  const a=new THREE.MeshStandardMaterial({color:'#e8ff4f',emissive:'#101d08'}),b=a.clone();
  const initial=a.color.clone(),initialEmission=a.emissive.clone(),other=b.color.clone();
  const shader=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color('#f6ffd9')},uTime:{value:3.7}}});
  const shaderColor=shader.uniforms.uColor.value.clone(),uniform=shader.uniforms.uColor;
  const light=new THREE.DirectionalLight('#f2ffb1',2.4),lightColor=light.color.clone();light.position.set(120,-240,420);
  for(const id of ['#9f42e6','#22e680','#000000','#ffffff','#808080'] as const){
    updateFuiClassicColors(a,id);updateFuiClassicColors(shader,id);updateFuiClassicColors(light,id);
    assert(b.color.equals(other));assert.equal(shader.uniforms.uColor,uniform);assert.equal(shader.uniforms.uTime.value,3.7);
    assert(a.color.toArray().every(Number.isFinite));assert.equal(light.intensity,2.4);assert.deepEqual(light.position.toArray(),[120,-240,420]);
  }
  updateFuiClassicColors(a,undefined);updateFuiClassicColors(shader,undefined);updateFuiClassicColors(light,undefined);
  assert(a.color.equals(initial));assert(a.emissive.equals(initialEmission));assert(shader.uniforms.uColor.value.equals(shaderColor));assert(light.color.equals(lightColor));
  a.dispose();b.dispose();shader.dispose();
});
test('classic CSS and the original SVG pointer recolor per instance and restore the untouched default style',()=>{
  assert.equal(getFuiClassicStyle('original'),mapThemeStyle);assert.equal(getFuiClassicStyle('amber'),mapThemeStyle);
  const purple=getFuiClassicStyle('#9f42e6'),green=getFuiClassicStyle('#22e680');
  assert.notEqual(purple['--map-accent'],green['--map-accent']);
  assert.notEqual(purple['--map-label-background-image'],mapThemeStyle['--map-label-background-image']);
  assert(Object.isFrozen(purple));assert.equal(getFuiClassicStyle('original'),mapThemeStyle);
  for(const id of ['#000000','#808080','#ffffff'] as const){
    const color=recolorFuiClassicColor(new THREE.Color('#e8ff4f'),id);
    assert(Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b)<1e-8);
  }
});
