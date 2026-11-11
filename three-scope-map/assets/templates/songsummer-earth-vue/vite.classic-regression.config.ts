// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import {defineConfig,mergeConfig} from 'vite';
import base from './vite.config';

export default mergeConfig(base,defineConfig({
  build:{outDir:'dist-classic-qa',emptyOutDir:true,rollupOptions:{input:'classic-regression.html'}},
}));
