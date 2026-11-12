// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Fixed document size matches the preserved optical reference without resizing
// any browser window. Capture the owned QA page with fullPage:true.
import {createApp,defineComponent,h,ref} from 'vue';
import FuiEarth from '../src/components/map/FuiEarth.vue';
import {FUI_SCENE_PRESETS} from '../src/components/map/fuiMapPresentation';
import {isFuiEarthSkin,type FuiEarthSkinId} from '../src/components/map/fuiEarthTheme';
import type {FuiEarthLoading} from '../src/components/map/fuiEarthLifecycle';
const query=new URLSearchParams(location.search);
const requested=query.get('skin');const skin:FuiEarthSkinId=isFuiEarthSkin(requested)?requested:'amber';
const presentation=query.get('earth')==='hologram'?'hologram':query.get('earth')==='hologram-hex'?'hologram-hex':'surface';
const scanStyle=query.get('scan')==='honeycomb'?'honeycomb':'ribbon';
const phase=ref('loading'),errors=ref<string[]>([]),earth=ref<{getDiagnostics:()=>unknown}>();
window.addEventListener('error',event=>errors.value.push(event.message));
window.addEventListener('unhandledrejection',event=>errors.value.push(String(event.reason)));
const originalError=console.error;console.error=(...values)=>{errors.value.push(values.map(String).join(' '));originalError(...values);};
createApp(defineComponent({setup(){return()=>h('main',{'data-optical-phase':phase.value},[
 h(FuiEarth,{...FUI_SCENE_PRESETS[presentation],ref:earth,skin,scanStyle,primaryColor:query.get('primary')??undefined,onLoading:(state:FuiEarthLoading)=>{phase.value=state.phase;}}),
 h('pre',{id:'optical-report'},JSON.stringify({status:errors.value.length||phase.value==='error'?'failed':phase.value==='ready'?'passed':'running',skin,presentation,scanStyle,phase:phase.value,errors:errors.value,diagnostics:earth.value?.getDiagnostics(),frame:[1672,941]},null,2)),
]);}})).mount('#app');
const style=document.createElement('style');style.textContent='html,body,#app,main{margin:0;width:1672px;height:941px;background:#060b10}main{position:relative}#optical-report{position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;margin:0}.map-view-switch,.dashboard-map-back{display:none!important}';document.head.append(style);
