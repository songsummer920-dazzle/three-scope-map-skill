// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import presets from './fixtures/fui-theme-presets.json';
import {createFuiEarthTheme,createFuiHologramPigment,getFuiHudPalette,getFuiSkinMaterial,getFuiSkinStyle,getFuiThemePrimary,getFuiVectorMapPalette,isFuiEarthSkin,normalizeFuiPrimaryColor,resolveFuiEarthThemeId,type FuiEarthSkinId,type FuiThemeColorId} from '../src/components/map/fuiEarthTheme';
import {getFuiMapMaterialPalette} from '../src/components/map/fuiMapMaterial';
import {createFuiMapHologramSurface,updateFuiMapHologramSurface} from '../src/components/map/fuiMapHologramSurface';
import type {FuiTerrainState} from '../src/components/map/fuiMapTerrain';
const neutralSampler=new THREE.DataTexture(new Uint8Array([128,128,0,255]),1,1);
after(()=>neutralSampler.dispose());
const terrain=()=>({uniforms:{uRelief:{value:neutralSampler}}} as FuiTerrainState);
const serialize=(value:unknown)=>JSON.parse(JSON.stringify(value,(_key,value)=>value?.isColor?value.toArray():value));
const colorDistance=(a:THREE.Color,b:THREE.Color)=>Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);
const neutral=(color:THREE.Color)=>{
  assert(color.toArray().every(Number.isFinite),'A color contains a non-finite component');
  assert(Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b)<1e-7,'An achromatic theme gained a hue');
};
test('four established presets retain their complete pre-v3 token and glass outputs',()=>{
  for(const skin of ['original','amber','glacier','alert'] as const){
    const glass=createFuiMapHologramSurface(skin,terrain());
    const value={theme:serialize(createFuiEarthTheme(skin)),hud:getFuiHudPalette(skin),style:getFuiSkinStyle(skin),vector:getFuiVectorMapPalette(skin),material:getFuiSkinMaterial(skin),map:getFuiMapMaterialPalette(skin),glass:{body:glass.uniforms.uPigment.value.toArray(),core:glass.uniforms.uCorePigment.value.toArray()}};
    assert.equal(createHash('sha256').update(JSON.stringify(value)).digest('hex'),presets[skin],skin);
    glass.dispose();
  }
});
test('one normalized HEX theme ID works across theme, HUD, CSS, 2D and both glass systems',()=>{
  assert.equal(normalizeFuiPrimaryColor(' #AbC '),'#aabbcc');
  assert.equal(resolveFuiEarthThemeId('amber','#9F42E6'),'#9f42e6');
  assert.equal(resolveFuiEarthThemeId('#AbC'),'#aabbcc');
  for(const invalid of ['', '#12','#00000000','purple','rgb(0,0,0)'])assert.throws(()=>normalizeFuiPrimaryColor(invalid));
  for(const input of ['#9f42e6','#22e680'] as const){
    const id=resolveFuiEarthThemeId('glacier',input);assert(isFuiEarthSkin(id));
    const expected=new THREE.Color(input);expected.multiplyScalar(1/Math.max(expected.r,expected.g,expected.b));
    const actual=createFuiEarthTheme(id).primary;actual.multiplyScalar(1/Math.max(actual.r,actual.g,actual.b));
    assert(colorDistance(actual,expected)<1e-10,'The common theme changed input hue');
    assert.equal(getFuiThemePrimary(id),input);assert.equal(getFuiSkinStyle(id)['--earth-accent'],input);
    assert.notEqual(getFuiVectorMapPalette(id),getFuiVectorMapPalette('glacier'));
    assert.deepEqual(getFuiSkinMaterial(id),getFuiSkinMaterial('glacier'));
    const glass=createFuiMapHologramSurface(id,terrain());
    const emitter=createFuiHologramPigment(id);emitter.multiplyScalar(1/Math.max(emitter.r,emitter.g,emitter.b));
    assert(colorDistance(glass.uniforms.uPigment.value,emitter)<1e-10,'Map and globe emitter hue diverged');
    glass.dispose();
  }
});
test('black, white and gray produce finite, achromatic materials and readable HUD tokens',()=>{
  for(const id of ['#000000','#808080','#ffffff'] as const){
    const theme=createFuiEarthTheme(id);
    for(const color of Object.values(theme))if(color instanceof THREE.Color)neutral(color);
    for(const [role,color] of Object.entries(getFuiHudPalette(id)))if(role!=='underlay')neutral(new THREE.Color(color));
    for(const color of Object.values(getFuiMapMaterialPalette(id)))neutral(color);
    for(const color of Object.values(getFuiVectorMapPalette(id)))neutral(new THREE.Color(color));
    neutral(createFuiHologramPigment(id));
    assert(!JSON.stringify(theme.css).includes('NaN'));
    const glass=createFuiMapHologramSurface(id,terrain());neutral(glass.uniforms.uPigment.value);neutral(glass.uniforms.uCorePigment.value);glass.dispose();
  }
});
test('a generated primary default never overrides alert or an independent instance theme',()=>{
  const generatedDefault='#9f42e6';
  const first=resolveFuiEarthThemeId('glacier',generatedDefault);
  const second=resolveFuiEarthThemeId('amber','#22e680');
  assert.equal(first,generatedDefault);assert.equal(second,'#22e680');
  assert.equal(resolveFuiEarthThemeId('glacier',generatedDefault,true),'alert');
  assert.equal(resolveFuiEarthThemeId('amber','#22e680',true),'alert');
  assert.equal(resolveFuiEarthThemeId('glacier',generatedDefault,false),first,'Clearing alert did not restore the generated default');
  assert.equal(resolveFuiEarthThemeId('amber','#22e680',false),second,'One instance changed another instance primary');
  assert.equal(getFuiThemePrimary('alert'),'#ff392b');
});
test('rapid hot color changes do not reuse stale cache entries or mutate a second instance',()=>{
  const a=createFuiMapHologramSurface('#9f42e6',terrain()),b=createFuiMapHologramSurface('#22e680',terrain());
  const bPigment=b.uniforms.uPigment.value.clone();
  const environment=new THREE.Texture();environment.image={height:1024,width:768};
  const c=createFuiMapHologramSurface('#abc',terrain(),environment);
  assert.equal(c.uniforms.uGlassEnvironment.value,environment,'PMREM was cloned away from its owning renderer');
  for(let i=0;i<200;i++){
    const id=normalizeFuiPrimaryColor('#'+((i*9307+12413)%0xffffff).toString(16).padStart(6,'0'));
    updateFuiMapHologramSurface(a,id,i%2);
    const pigment=createFuiHologramPigment(id);pigment.multiplyScalar(1/Math.max(pigment.r,pigment.g,pigment.b));
    assert(colorDistance(a.uniforms.uPigment.value,pigment)<1e-10);
    assert(b.uniforms.uPigment.value.equals(bPigment));
  }
  a.uniforms.uPigment.value.set('#ff0000');assert(b.uniforms.uPigment.value.equals(bPigment));
  const palette=getFuiMapMaterialPalette('#9f42e6'),expected=getFuiMapMaterialPalette('#9f42e6').inner.clone();
  assert.throws(()=>palette.inner.set('#ff0000'));assert(getFuiMapMaterialPalette('#9f42e6').inner.equals(expected));
  const first=createFuiEarthTheme('#abc');first.primary.set('#ff0000');assert(!createFuiEarthTheme('#abc').primary.equals(first.primary));
  assert(Object.isFrozen(getFuiHudPalette('#abc')));
  for(const material of [a,b,c])material.dispose();environment.dispose();
});
