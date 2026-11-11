// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=name=>fs.readFileSync(new URL(`../src/components/map/${name}.ts`,import.meta.url),'utf8');
const load=(text,imports={})=>{
  const module={exports:{}};
  const compiled=ts.transpileModule(text.replaceAll('import.meta.env','({})'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{module,exports:module.exports,console,require:key=>{
    if(key in imports)return imports[key];throw Error('Unexpected dependency: '+key);
  }});return module.exports;
};
const theme=load(source('mapTheme')),vector=load(source('vectorMapConfig'),{'./mapTheme':theme});
assert(theme.mapTheme.contour,'The existing contour roles were lost');
assert.deepEqual(vector.getVectorMapConfig().palette,vector.defaultVectorMapPalette);
assert.equal(vector.getVectorMapConfig('#9F42E6').primaryColor,'#9f42e6');
const purple=vector.getVectorMapConfig({primaryColor:'#9f42e6'}),green=vector.getVectorMapConfig({primaryColor:'#22e680'});
assert.notEqual(purple.palette.administrativeFill,green.palette.administrativeFill);
assert.equal(purple.palette.administrativeFill,'#9f42e6');
assert.equal(green.palette.administrativeFill,'#22e680');
assert.equal(vector.getVectorMapConfig('#9fc53a').palette.administrativeFill,'#9fc53a','An explicit green request must not be mistaken for the untouched legacy preset');
const before=green.palette.administrativeLine;purple.palette.administrativeLine='#fff';assert.equal(green.palette.administrativeLine,before);
for(const primary of ['#000000','#808080','#ffffff'])for(const color of Object.values(vector.createVectorMapPalette(primary))){
  assert.equal(color.slice(1,3),color.slice(3,5));assert.equal(color.slice(3,5),color.slice(5,7));
}
for(let i=0;i<200;i++){
  const primary='#'+((i*9307+12413)%0xffffff).toString(16).padStart(6,'0');
  assert.equal(vector.createVectorMapPalette(primary).administrativeFill,primary);
}
assert.equal(vector.getVectorMapConfig({primaryColor:'#abc',palette:{water:'#112233'}}).palette.water,'#112233');
console.log('Vector theme: legacy palette, custom HEX, neutral colors, hot changes and two-instance isolation passed');
