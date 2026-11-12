// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFuiEarthTheme,getFuiHudPalette,getFuiThemePrimary,type FuiEarthSkinId} from '../src/components/map/fuiEarthTheme';
import {applyFuiPhotographicTheme} from '../src/components/map/fuiPhotographicOptics';
import {createFuiMapSurface,updateFuiMapSurface,getFuiMapTerrainColors,type FuiMapTextures} from '../src/components/map/fuiMapSurface';
import {getFuiMapMaterialPalette,getFuiMapHudPalette,getFuiMapOuterContourColor} from '../src/components/map/fuiMapMaterial';
import {createFuiMapBase,updateFuiMapBase} from '../src/components/map/fuiMapBase';
import type {FuiTerrainState} from '../src/components/map/fuiMapTerrain';
const sampler=new THREE.DataTexture(new Uint8Array([128,128,0,255]),1,1);
after(()=>sampler.dispose());
const terrain=()=>({uniforms:{uRelief:{value:sampler}}} as FuiTerrainState);
const textures:FuiMapTextures={photograph:sampler,relief:sampler,photographBounds:new THREE.Vector4(0,0,1,1),reliefBounds:new THREE.Vector4(0,0,1,1),ready:Promise.resolve(),scope:'test'};
const luminance=(color:THREE.Color)=>color.r*.2126+color.g*.7152+color.b*.0722;
const normalized=(color:THREE.Color)=>color.clone().multiplyScalar(1/luminance(color));
const distance=(a:THREE.Color,b:THREE.Color)=>Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);

test('entity map face and ridge use the globe China pigment with unchanged relief luminance',()=>{
  const base=new THREE.Color().setRGB(.40,.56,.74),ridge=new THREE.Color().setRGB(.45,.60,.80);
  for(const skin of ['amber','glacier','alert','#a75fff','#22e680'] as FuiEarthSkinId[]){
    const globe=createFuiEarthTheme(skin);applyFuiPhotographicTheme(globe,skin);
    const material=createFuiMapSurface(skin,terrain(),textures);
    for(const [uniform,source,reference] of [['uTerrainTone',globe.chinaSurface,base],['uTerrainRidgeTone',globe.chinaRidge,ridge]] as const){
      const actual=material.uniforms[uniform].value as THREE.Color;
      assert(distance(normalized(actual),normalized(source))<1e-10,`${skin}:${uniform} changed the globe pigment`);
      assert(Math.abs(luminance(actual)-luminance(reference))<1e-12,`${skin}:${uniform} changed the relief light energy`);
    }
    assert.equal(material.uniforms.uPhotograph.value,sampler);assert.equal(material.uniforms.uRelief.value,sampler);
    assert(material.fragmentShader.includes('uTerrainTone*albedo'));
    assert(material.fragmentShader.includes('uTerrainRidgeTone*max(curvature'));
    material.dispose();
  }
});

test('the original map keeps its established tone and neutral custom themes stay neutral',()=>{
  const original=getFuiMapTerrainColors('original');
  assert.deepEqual(original.tone.toArray(),[.40,.56,.74]);assert.deepEqual(original.ridge.toArray(),[.45,.60,.80]);
  for(const skin of ['#000000','#808080','#ffffff'] as const){
    const material=createFuiMapSurface(skin,terrain(),textures);
    for(const uniform of ['uTerrainTone','uTerrainRidgeTone']){
      const values=(material.uniforms[uniform].value as THREE.Color).toArray();
      assert(values.every(value=>Number.isFinite(value)&&value>=0));
      assert(Math.max(...values)-Math.min(...values)<1e-10,`${skin}:${uniform} gained a color cast`);
    }
    material.dispose();
  }
});

test('live map recoloring updates existing uniforms without mutating another instance or its cache',()=>{
  const first=createFuiMapSurface('amber',terrain(),textures),second=createFuiMapSurface('glacier',terrain(),textures);
  const secondTone=second.uniforms.uTerrainTone.value.clone(),firstTone=first.uniforms.uTerrainTone.value,version=first.version;
  const uniforms=first.uniforms,photo=first.uniforms.uPhotograph.value;
  for(const skin of ['alert','#a75fff','#abc','amber','glacier'] as FuiEarthSkinId[]){
    updateFuiMapSurface(first,skin,.65);
    assert.equal(first.uniforms,uniforms);assert.equal(first.uniforms.uTerrainTone.value,firstTone);
    assert.equal(first.uniforms.uPhotograph.value,photo);assert.equal(first.version,version,'Recoloring recompiled the surface shader');
    assert(firstTone.equals(getFuiMapTerrainColors(skin).tone));
    assert.equal(first.uniforms.uSelection.value,.65);assert(second.uniforms.uTerrainTone.value.equals(secondTone));
  }
  assert.equal(getFuiMapTerrainColors('#abc'),getFuiMapTerrainColors('#aabbcc'));
  const cached=getFuiMapTerrainColors('glacier');firstTone.set('#ff0000');assert(cached.tone.equals(secondTone));
  assert(Object.isFrozen(cached)&&Object.isFrozen(cached.tone));
  first.dispose();second.dispose();
});

test('terrain face preparation leaves shared Earth and glass palettes untouched',()=>{
  const snapshot=(skin:FuiEarthSkinId)=>JSON.stringify({earth:createFuiEarthTheme(skin),glass:getFuiMapMaterialPalette(skin)});
  for(const skin of ['original','amber','glacier','alert','#a75fff'] as FuiEarthSkinId[]){
    const before=snapshot(skin);getFuiMapTerrainColors(skin);
    const surface=createFuiMapSurface(skin,terrain(),textures);updateFuiMapSurface(surface,skin);surface.dispose();
    assert.equal(snapshot(skin),before,'Terrain adaptation mutated a shared Earth or smooth-glass palette');
  }
});

test('entity wall, boundaries and selection follow photographic optical hues within the existing light and chroma budgets',()=>{
  const hue=(color:THREE.Color)=>color.getHSL({h:0,s:0,l:0}).h;
  const peak=(color:THREE.Color)=>Math.max(color.r,color.g,color.b);
  const white=(color:THREE.Color)=>Math.min(color.r,color.g,color.b)/peak(color);
  const roles={accent:'chinaSurface',sideTop:'wallTop',sideMid:'wallMiddle',sideBottom:'wallBottom',outer:'chinaOuterGlow',inner:'chinaInnerOutline',bottom:'bottomEdge'} as const;
  for(const skin of ['amber','glacier','alert','#a75fff','#22e680','#52616a','#a9a2b5','#112a31','#000000','#808080','#ffffff'] as FuiEarthSkinId[]){
    const optical=createFuiEarthTheme(skin);applyFuiPhotographicTheme(optical,skin);
    const shared=getFuiMapMaterialPalette(skin),before=JSON.stringify(shared),entity=getFuiMapMaterialPalette(skin,'entity');
    for(const [role,sourceRole] of Object.entries(roles) as [keyof typeof roles,typeof roles[keyof typeof roles]][]){
      const actual=entity[role],source=optical[sourceRole],budget=shared[role];
      const sourceChroma=source.getHSL({h:0,s:0,l:0}).s;
      if(sourceChroma>1e-8){
        const delta=Math.abs(hue(actual)-hue(source));assert(Math.min(delta,1-delta)<1e-10,`${skin}:${role} uses another optical hue`);
        assert(Math.abs(white(actual)-white(budget))<1e-10,`${skin}:${role} changed its normalized white fraction`);
      }else assert(Math.max(...actual.toArray())-Math.min(...actual.toArray())<1e-10,`${skin}:${role} gained a color cast`);
      assert(luminance(actual)<=luminance(budget)+1e-12,`${skin}:${role} exceeded its light budget`);
      assert(peak(actual)<=peak(budget)+1e-12,`${skin}:${role} exceeded its channel ceiling`);
      assert(Math.max(luminance(actual)/luminance(budget),peak(actual)/peak(budget))>1-1e-10,`${skin}:${role} unnecessarily dimmed both budgets`);
    }
    assert(entity.base.equals(shared.base),'The neutral stage acquired a theme tint');
    const contour=getFuiMapOuterContourColor(skin,'entity'),oldContour=shared.outer.clone().lerp(new THREE.Color('#eff8ff'),.32);
    if(optical.chinaOuterGlow.getHSL({h:0,s:0,l:0}).s>1e-8){const delta=Math.abs(hue(contour)-hue(optical.chinaOuterGlow));assert(Math.min(delta,1-delta)<1e-10,'The final polished contour regained a blue cast');}
    assert(luminance(contour)<=luminance(oldContour)+1e-12&&peak(contour)<=peak(oldContour)+1e-12);
    assert.equal(JSON.stringify(shared),before,'Entity derivation mutated hologram/classic colors');
  }
  assert.equal(getFuiMapMaterialPalette('original','entity'),getFuiMapMaterialPalette('original'));
});

test('entity recoloring reaches actual surface accent, selected face and inner glow without changing shared glass pigments',()=>{
  const material=createFuiMapSurface('glacier',terrain(),textures),uniforms=material.uniforms;
  const tone=uniforms.uTerrainTone.value,accent=uniforms.uAccent.value,selection=uniforms.uSelectionColor.value;
  for(const skin of ['amber','glacier','alert','#a75fff','#52616a','#808080'] as FuiEarthSkinId[]){
    const shared=JSON.stringify(getFuiMapMaterialPalette(skin)),palette=getFuiMapMaterialPalette(skin,'entity');
    updateFuiMapSurface(material,skin,.7);
    assert.equal(material.uniforms,uniforms);assert.equal(uniforms.uTerrainTone.value,tone);assert.equal(uniforms.uAccent.value,accent);assert.equal(uniforms.uSelectionColor.value,selection);
    assert(accent.equals(palette.accent));assert(selection.equals(palette.inner));assert.equal(uniforms.uSelection.value,.7);
    assert.equal(JSON.stringify(getFuiMapMaterialPalette(skin)),shared);
    assert.equal(getFuiMapHudPalette(skin,'shared'),getFuiHudPalette(skin));
  }
  material.dispose();
});

test('native entity HUD uses the globe instrument hue while preserving its real geometry, line weights and brightness hierarchy',()=>{
  const group=createFuiMapBase(),lines:any[]=[];
  group.traverse(object=>{if((object as any).material?.userData.fuiHudRole)lines.push(object);});
  const geometry=lines.map(line=>line.geometry),widths=lines.map(line=>line.material.linewidth),opacity=lines.map(line=>line.material.opacity);
  for(const skin of ['amber','glacier','alert','#a75fff','#52616a','#808080'] as FuiEarthSkinId[]){
    updateFuiMapBase(group,skin,'textured-hex',0,1,true,'entity');
    const palette=getFuiMapHudPalette(skin,'entity'),shared=getFuiHudPalette(skin);
    const primary=new THREE.Color(getFuiThemePrimary(skin)).getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace),seed=new THREE.Color('#ffb31c').getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace),ink=new THREE.Color('#d08a32').getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace);
    const source=new THREE.Color().setHSL(primary.h+ink.h-seed.h,primary.s*ink.s,Math.min(1,Math.max(.08,primary.l*ink.l/seed.l)),THREE.SRGBColorSpace);
    for(const role of ['ring','mark','tickMajor'] as const){
      const actual=new THREE.Color(palette[role]),budget=new THREE.Color(shared[role]);
      if(primary.s>.01){
        const a=actual.getHSL({h:0,s:0,l:0}).h,b=source.getHSL({h:0,s:0,l:0}).h,d=Math.abs(a-b);
        assert(Math.min(d,1-d)<.012,`${skin}:${role} diverged from the photographic instrument hue`);
      }else assert.equal(actual.r,actual.g);
      assert(luminance(actual)<=luminance(budget)+.004,'HUD color exceeded its preexisting brightness budget');
    }
    lines.forEach((line,index)=>{
      assert.equal(line.geometry,geometry[index]);assert.equal(line.material.linewidth,widths[index]);assert.equal(line.material.opacity,opacity[index]);
      const role=line.material.userData.fuiHudRole as keyof typeof palette;assert(line.material.color.equals(new THREE.Color(role==='axis'?palette.ring:palette[role])));
    });
  }
  assert.equal(getFuiMapHudPalette('original','entity'),getFuiHudPalette('original'));
  group.traverse(object=>{const mesh=object as THREE.Mesh;mesh.geometry?.dispose();if(mesh.material&&!Array.isArray(mesh.material))mesh.material.dispose();});
});

test('entity HUD keeps its absent underlay transparent and preserves original legacy alpha roles',()=>{
  for(const skin of ['amber','glacier','alert','#a75fff','#52616a','#000000','#808080','#ffffff'] as FuiEarthSkinId[]){
    const shared=getFuiHudPalette(skin),entity=getFuiMapHudPalette(skin,'entity');
    assert.equal(shared.underlay,'transparent');assert.equal(entity.underlay,shared.underlay,`${skin} acquired an opaque HUD backdrop`);
  }
  const legacy=getFuiMapHudPalette('original','entity');
  assert.equal(legacy.axis,'rgba(141,167,188,.17)');assert.equal(legacy.underlay,'rgba(141,167,188,.018)');
  assert.equal(legacy,getFuiHudPalette('original'));
});
