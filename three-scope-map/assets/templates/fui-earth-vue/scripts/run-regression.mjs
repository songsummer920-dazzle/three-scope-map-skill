#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import {build} from 'esbuild';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const dir=await mkdtemp(path.join(tmpdir(),'fui-earth-tests-'));
try{
  const entries=(await readdir('tests')).filter(name=>name.endsWith('.test.ts')).sort();
  // CPU material tests supply their own tiny textures. Production asset URLs
  // are irrelevant here and must not trigger image decoding or network I/O.
  await build({entryPoints:entries.map(name=>'tests/'+name),outdir:dir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',loader:{'.jpg':'empty','.png':'empty'},logLevel:'warning'});
  const native=(await readdir('tests')).filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name);
  const code=await new Promise(resolve=>spawn(process.execPath,['--test',...entries.map(name=>path.join(dir,name.replace(/\.ts$/,'.mjs'))),...native],{stdio:'inherit'}).on('exit',resolve));
  process.exitCode=Number(code??1);
}finally{await rm(dir,{recursive:true,force:true});}
