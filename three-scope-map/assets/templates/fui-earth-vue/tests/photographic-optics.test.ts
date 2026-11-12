// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyFuiPhotographicTheme,getFuiPhotographicMaterial,FUI_ENTITY_VISUAL_BASELINE} from '../src/components/map/fuiPhotographicOptics';
import {createFuiEarthTheme,getFuiSkinMaterial,type FuiEarthSkinId} from '../src/components/map/fuiEarthTheme';
const serialize=(theme:ReturnType<typeof createFuiEarthTheme>)=>JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(theme).map(([key,value])=>[key,value instanceof THREE.Color?value.toArray():value]))));
const preservedRoles=['primary','polarTint','background'] as const;

test('photographic role adaptation keeps polar treatment, public primary and unrelated renderer themes isolated',()=>{
  for(const skin of ['amber','glacier','alert','#a75fff'] as FuiEarthSkinId[]){
    const theme=createFuiEarthTheme(skin),before=serialize(theme),independent=serialize(createFuiEarthTheme(skin));
    applyFuiPhotographicTheme(theme,skin);const after=serialize(theme);
    for(const role of preservedRoles)assert.deepEqual(after[role],before[role],`${skin}:${role}`);
    assert.deepEqual(theme.css,before.css);
    assert.deepEqual(serialize(createFuiEarthTheme(skin)),independent,'A photo instance mutated the shared theme factory');
    const base=getFuiSkinMaterial(skin),photo=getFuiPhotographicMaterial(skin);
    for(const key of ['polarGain','environmentGain'] as const)assert.equal(photo[key],base[key],`${skin}:${key}`);
    assert.notDeepEqual(after.chinaSurface,before.chinaSurface,'Selected photo face lost its own reflectance');
  }
});
test('original silver and neutral custom themes preserve their independent contracts',()=>{
  const original=createFuiEarthTheme('original'),before=serialize(original);applyFuiPhotographicTheme(original,'original');
  assert.deepEqual(serialize(original),before);assert.deepEqual(getFuiPhotographicMaterial('original'),getFuiSkinMaterial('original'));
  for(const skin of ['#000000','#808080','#ffffff'] as FuiEarthSkinId[]){
    const theme=createFuiEarthTheme(skin);applyFuiPhotographicTheme(theme,skin);
    for(const [role,color] of Object.entries(theme))if(color instanceof THREE.Color){
      assert(color.toArray().every(Number.isFinite),role);assert(Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b)<1e-7,role);
    }
  }
});
test('one photographic material and bounded hue-derived roles support presets and arbitrary colors',()=>{
  let first:ReturnType<typeof getFuiPhotographicMaterial>|undefined;
  for(const skin of ['amber','glacier','alert','#a75fff','#22e680','#ff0000'] as FuiEarthSkinId[]){
    const theme=createFuiEarthTheme(skin);applyFuiPhotographicTheme(theme,skin);
    const material=getFuiPhotographicMaterial(skin);if(first)assert.deepEqual(material,first);else first=material;
    for(const color of Object.values(theme))if(color instanceof THREE.Color)assert(color.toArray().every(x=>Number.isFinite(x)&&x>=0&&x<=1.00000001));
    const face=theme.chinaSurface,primary=theme.primary;
    const top=primary.toArray().indexOf(Math.max(...primary.toArray()));
    assert.equal(face.toArray().indexOf(Math.max(...face.toArray())),top,'Photo pigment switched to an unrelated hue');
    assert(theme.earthCityLight.r+theme.earthCityLight.g+theme.earthCityLight.b>0,'No geographic city radiance');
  }
});

test('approved entity keeps full China volume and the original fine-light response',()=>{
  assert.deepEqual(FUI_ENTITY_VISUAL_BASELINE,{id:'entity-20261016-cap-off',chinaRadialScale:1,nodeCoreScale:1,nodeOpacity:1,trackOpacity:1,rippleOpacity:1,rippleScale:1,contourFlow:1});
  assert(Object.isFrozen(FUI_ENTITY_VISUAL_BASELINE));
});
test('default entity retains the approved amber pigments and photographic material',()=>{
  const theme=createFuiEarthTheme('amber');applyFuiPhotographicTheme(theme,'amber');
  const expected={chinaSurface:'d4a060',chinaRidge:'ffe2b3',chinaInnerOutline:'edb96e',earthCityLight:'ffa528',chinaCityLight:'ffc878',wallBottom:'100f0b',wallMiddle:'544329',wallTop:'caa773',nodeHub:'ffe0a1',node:'d3a75e',flyTrail:'eea447',flyHead:'ffe4b4'} as const;
  for(const [role,hex] of Object.entries(expected))assert.equal((theme[role as keyof typeof expected] as THREE.Color).getHexString(),hex,role);
  const material=getFuiPhotographicMaterial('amber');
  for(const [key,value] of Object.entries({exposure:1.13,bloom:.28,bloomRadius:.36,bloomThreshold:.93,roughness:.43,metalness:.72,surfaceGain:1.16,albedoTint:.65,worldGain:1,oceanBase:.06,oceanDarken:.38,cityGain:1.75,atmosphereGain:2.6,edgeGain:1.15,reliefContrast:1.34,innerGlowGain:.35,chinaAmbient:.01}))assert.equal(material[key as keyof typeof material],value,key);
});
