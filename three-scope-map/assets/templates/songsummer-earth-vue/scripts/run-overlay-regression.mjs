#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const directory=await mkdtemp(path.join(tmpdir(),'map-overlay-tests-'));
try{
  const outfile=path.join(directory,'overlay.test.mjs');
  await build({entryPoints:['tests/overlay.test.ts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'warning'});
  process.exitCode=Number(await new Promise(resolve=>spawn(process.execPath,['--test',outfile],{stdio:'inherit'}).on('exit',resolve))??1);
}finally{await rm(directory,{recursive:true,force:true});}
