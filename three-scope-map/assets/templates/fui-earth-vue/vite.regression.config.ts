// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import {defineConfig,mergeConfig} from 'vite';
import base from './vite.config';
export default mergeConfig(base,defineConfig({build:{rollupOptions:{input:{regression:'qa/index.html',v3:'qa/v3.html',hardening:'qa/hardening.html',optical:'qa/optical.html'}}}}));
