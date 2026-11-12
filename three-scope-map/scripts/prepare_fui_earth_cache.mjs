#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import {runFuiEarthCache} from '../assets/templates/fui-earth-vue/scripts/fui-earth-cache.mjs';
runFuiEarthCache().catch(error=>{console.error(error.message);process.exitCode=1;});
