#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const dir=await mkdtemp(path.join(tmpdir(),'fui-theme-tests-'));
try{
  const outfile=path.join(dir,'theme.test.mjs');
  await build({stdin:{contents:"import './tests/theme.test.ts';import './tests/classic-theme.test.ts';",resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'esm',logLevel:'warning'});
  process.exitCode=await new Promise(resolve=>spawn(process.execPath,['--test',outfile],{stdio:'inherit'}).on('exit',resolve));
}finally{await rm(dir,{recursive:true,force:true});}
