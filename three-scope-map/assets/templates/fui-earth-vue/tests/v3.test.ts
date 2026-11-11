// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import {FUI_SCENE_PRESETS,resolveFuiDestinationSurface,resolveFuiMapSurfaceVariant,resolveFuiMapLook} from '../src/components/map/fuiMapPresentation';
import {mapQualityBudget,resolveMapQuality} from '../src/components/map/mapQuality';

test('automatic surface pairing preserves every existing preset',()=>{
  for(const skin of ['original','amber','glacier','alert'] as const){
    for(const earth of ['surface','hologram','hologram-hex'] as const){
      assert.equal(resolveFuiDestinationSurface('auto',skin,earth),skin==='glacier'&&earth!=='surface'?'hologram-glass':'terrain');
    }
  }
});
test('explicit material choice survives arbitrary palette changes',()=>{
  for(const skin of ['original','amber','glacier','alert','#a75fff','#14c98c','#808080'] as const){
    assert.equal(resolveFuiDestinationSurface('hologram-glass',skin,'surface'),'hologram-glass');
    assert.equal(resolveFuiDestinationSurface('terrain',skin,'hologram'),'terrain');
    for(const presentation of ['textured-hex','textured-grid'] as const)
      assert.equal(resolveFuiMapSurfaceVariant('hologram-glass',skin,presentation),'hologram-glass');
    assert.equal(resolveFuiMapSurfaceVariant('hologram-glass',skin,'standard'),'terrain');
  }
});
test('quality budgets keep legacy high quality and bound expensive targets',()=>{
  assert.equal(mapQualityBudget('high').maxPixelRatio,2.5);
  assert.equal(mapQualityBudget('high').reflectionMaxSize,2048);
  assert.equal(mapQualityBudget('balanced').maxPixelRatio,1.5);
  assert.equal(mapQualityBudget('balanced').reflectionMaxSize,1024);
  assert.equal(mapQualityBudget('low').reflection,false);
  assert.equal(resolveMapQuality('auto',{memory:4,cores:8}),'low');
  assert.equal(resolveMapQuality('auto',{memory:8,cores:8}),'balanced');
  assert.equal(resolveMapQuality('auto',{memory:16,cores:12}),'high');
  assert.equal(resolveMapQuality('high',{memory:2,cores:2}),'high');
});
test('material and wave selection are independent while legacy callers remain stable',()=>{
  assert.deepEqual(resolveFuiMapLook(),{presentation:'standard',surface:'terrain',waveEnabled:true});
  assert.deepEqual(resolveFuiMapLook({presentation:'textured-grid',preset:'glacier',earthPresentation:'hologram'}),{presentation:'textured-grid',surface:'hologram-glass',waveEnabled:true});
  for(const style of ['terrain-glass','smooth-glass'] as const){
    for(const wave of ['hex','grid','none'] as const){
      const result=resolveFuiMapLook({style,wave,preset:'#a75fff'});
      assert.equal(result.surface,style==='smooth-glass'?'hologram-glass':'terrain');
      assert.equal(result.presentation,wave==='grid'?'textured-grid':'textured-hex');
      assert.equal(result.waveEnabled,wave!=='none');
    }
  }
});
test('complete scene recipes enter their declared map material in every named and custom color',()=>{
  for(const recipe of Object.values(FUI_SCENE_PRESETS)){
    for(const preset of ['original','amber','glacier','alert','#a75fff','#808080'] as const){
      const look=resolveFuiMapLook({style:recipe.mapStyle,wave:recipe.mapWave,preset,earthPresentation:recipe.earthPresentation});
      assert.equal(resolveFuiMapSurfaceVariant(look.surface,preset,look.presentation),recipe.mapStyle==='smooth-glass'?'hologram-glass':'terrain');
      assert.equal(look.presentation,'textured-hex');
      assert.equal(look.waveEnabled,true);
    }
  }
});
