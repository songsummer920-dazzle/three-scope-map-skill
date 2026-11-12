// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),command=path.join(root,'scripts/fui-earth-cache.mjs');
const check=dir=>spawnSync(process.execPath,[command,dir,'--check'],{encoding:'utf8'});
const fixture=async()=>{
  const dir=await fs.mkdtemp(path.join(tmpdir(),'fui-cache-test-'));
  for(const file of ['package.json','src/components/map/EarthView.vue','src/components/map/fuiMapGlow.ts','src/assets/maps/china.json','src/assets/textures/map/china/earth-china-cache.json','src/assets/textures/map/china/earth-china-inner-glow.png','src/assets/textures/map/china/earth-china-glass-edges.png']){
    await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true});await fs.copyFile(path.join(root,file),path.join(dir,file));
  }await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');return dir;
};
test('current original geographic raster caches pass the real build gate',()=>{const result=check(root);assert.equal(result.status,0,result.stderr);});
test('changing geographic data without rebuilding caches is blocked',async()=>{
  const dir=await fixture();try{const p=path.join(dir,'src/assets/maps/china.json'),data=JSON.parse(await fs.readFile(p,'utf8'));data.cacheRegression='changed';await fs.writeFile(p,JSON.stringify(data));const result=check(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/stale/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('same-size cache with an incorrect pixel hash is blocked',async()=>{
  const dir=await fixture();try{const p=path.join(dir,'src/assets/textures/map/china/earth-china-cache.json'),data=JSON.parse(await fs.readFile(p,'utf8'));data.glow.rgbaSha256='0'.repeat(64);await fs.writeFile(p,JSON.stringify(data));const result=check(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/pixels/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
