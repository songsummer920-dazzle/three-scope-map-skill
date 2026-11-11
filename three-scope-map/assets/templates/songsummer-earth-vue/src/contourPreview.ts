// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
// Standalone development preview of the SAME production ContourMap component.
import { createApp, defineComponent, h, shallowRef } from 'vue';
import ContourMap from './components/map/ContourMap.vue';
import type { MapNavigationPath } from './components/map/mapNavigation';

const country = { scope: 'country' as const, code: '100000', regionName: '中国' };
const province = { scope: 'province' as const, code: '430000', regionName: '湖南省' };
const city = { scope: 'city' as const, code: '430100', regionName: '长沙市' };
const district = { scope: 'district' as const, code: '430104', regionName: '岳麓区' };
const paths: Record<string, MapNavigationPath> = { country: [country], province: [country, province],
  city: [country, province, city], district: [country, province, city, district] };
createApp(defineComponent({
  setup() {
    const selected = shallowRef('province');
    const navigation = shallowRef(paths.province);
    return () => h('main', { style: 'position:fixed;inset:0;font-family:system-ui,sans-serif' }, [
      h(ContourMap, { active: true, navigation: navigation.value,
        'onNavigation-change': (path: MapNavigationPath) => { navigation.value = path; selected.value = ''; } }),
      h('label', { style: 'position:absolute;z-index:10;top:32px;left:32px;color:#c5cfb7;font-size:13px' }, [
        '分级预览 ', h('select', { 'aria-label': '分级预览', value: selected.value,
          style: 'padding:6px 12px;background:#182219;color:#d9e2cd;border:1px solid #66765b;border-radius:3px',
          onChange: (event: Event) => {
            selected.value = (event.target as HTMLSelectElement).value;
            navigation.value = paths[selected.value];
          } }, [h('option', { value: '', disabled: true }, '切换参考地区'), h('option', { value: 'country' }, '中国 · 原有效果'), h('option', { value: 'province' }, '湖南省'),
            h('option', { value: 'city' }, '长沙市'), h('option', { value: 'district' }, '岳麓区')]),
      ]),
    ]);
  },
})).mount('#app');
