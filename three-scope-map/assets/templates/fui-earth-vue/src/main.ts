// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

// The bundled demo is a full-page stage. Embedded dashboards can keep their
// existing runtime control insets when reusing VectorMap.
const vectorConfig=window.__SUMMER_MAP_2D_CONFIG__;
window.__SUMMER_MAP_2D_CONFIG__={...vectorConfig,controls:{top:'24px',right:'24px',bottom:'24px',...vectorConfig?.controls}};
createApp(App).mount('#app');
