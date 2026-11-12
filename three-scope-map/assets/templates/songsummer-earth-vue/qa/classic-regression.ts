// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// An isolated real-WebGL QA entry. It never sends native input or changes
// the normal app entry. Visibility simulation is confined to this harness.
import {createApp,defineComponent,h,nextTick,onMounted,ref} from 'vue';
import EarthView from '../src/components/map/EarthView.vue';

type Result={name:string;status:'pass'|'fail';detail:unknown};
const app=defineComponent({setup(){
  const mounted=ref(false),active=ref(false),startIntro=ref(false),generation=ref(0);
  const running=ref(false),done=ref(false),sceneReady=ref(false),introReady=ref(false),results=ref<Result[]>([]);
  const exceptions:string[]=[];
  const initialVisibility=document.visibilityState;
  const originalHidden=Object.getOwnPropertyDescriptor(document,'hidden');
  let visibilityOverridden=false,simulatedHidden=false;
  const originalError=console.error;
  console.error=(...args)=>{exceptions.push(args.map(String).join(' '));originalError(...args);};
  window.addEventListener('error',event=>exceptions.push(event.message));
  window.addEventListener('unhandledrejection',event=>exceptions.push(String(event.reason)));
  const host=()=>document.querySelector<HTMLElement>('.classic-stage .earth-view');
  const canvas=()=>document.querySelector<HTMLCanvasElement>('.classic-stage .earth-view canvas');
  const frames=()=>Number(host()?.dataset.frameCount??0);
  const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
  const check=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
  async function wait(predicate:()=>boolean,label:string,timeout=90000){
    const begin=performance.now();
    while(!predicate()){
      if(performance.now()-begin>timeout)throw new Error('Timeout: '+label);
      await pause(25);
    }
    await nextTick();
  }
  async function perform(name:string,work:()=>Promise<unknown>){
    try{results.value.push({name,status:'pass',detail:await work()});}
    catch(error){results.value.push({name,status:'fail',detail:String(error)});throw error;}
  }
  function simulateVisibility(hidden:boolean){
    if(!visibilityOverridden){
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>simulatedHidden});visibilityOverridden=true;
    }
    simulatedHidden=hidden;document.dispatchEvent(new Event('visibilitychange'));
  }
  function restoreVisibility(){
    if(!visibilityOverridden)return;
    if(originalHidden)Object.defineProperty(document,'hidden',originalHidden);
    else Reflect.deleteProperty(document,'hidden');
    visibilityOverridden=false;document.dispatchEvent(new Event('visibilitychange'));
  }
  async function mount(preparedOnly:boolean){
    sceneReady.value=false;introReady.value=false;active.value=!preparedOnly;startIntro.value=!preparedOnly;
    generation.value++;mounted.value=true;await nextTick();
  }
  async function run(){
    if(running.value)return;
    running.value=true;done.value=false;results.value=[];exceptions.length=0;
    try{
      // A browser surface can remain unfocused while document-visible. An
      // actually background-frozen RAF is waited on, never activated via OS UI.
      await wait(()=>!document.hidden,'a document-visible browser surface');
      if(mounted.value){mounted.value=false;await nextTick();}
      await mount(true);
      await perform('隐藏预热保持静止',async()=>{
        await wait(()=>sceneReady.value&&!!canvas(),'scene-ready and hidden prepared canvas');
        const before=frames();await pause(100);
        check(frames()===before,'Prepared Earth advanced before startIntro');
        check(host()?.dataset.renderActive==='false','Prepared-only Earth reports an active loop');
        return {before,after:frames(),sceneReady:true};
      });
      await perform('公开属性启动真实帧',async()=>{
        const before=frames();startIntro.value=true;active.value=true;await nextTick();
        await wait(()=>frames()>before+1&&host()?.dataset.renderActive==='true','active frames grow');
        return {before,after:frames()};
      });
      await perform('active=false 停止渲染',async()=>{
        active.value=false;await nextTick();
        await wait(()=>host()?.dataset.renderActive==='false','inactive loop diagnostic');
        const before=frames();await pause(250);const after=frames();
        check(after===before,'Hidden Earth kept rendering');return {before,after,intervalMs:250};
      });
      await perform('active=true 恢复原画布',async()=>{
        const existing=canvas(),before=frames();active.value=true;await nextTick();
        await wait(()=>frames()>before+1&&host()?.dataset.renderActive==='true','resumed frames');
        check(canvas()===existing,'Resume replaced the prepared WebGL canvas');return {before,after:frames(),sameCanvas:true};
      });
      await perform('页面可见性分支暂停和恢复',async()=>{
        simulateVisibility(true);await wait(()=>host()?.dataset.renderActive==='false','visibility pause');
        const before=frames();await pause(250);const paused=frames();
        check(paused===before,'Visibility-hidden Earth kept rendering');
        simulateVisibility(false);await wait(()=>frames()>paused+1&&host()?.dataset.renderActive==='true','visibility resume');
        const after=frames();restoreVisibility();
        return {before,paused,after,intervalMs:250,visibilityEvent:'simulated in isolated QA; actual WebGL frame counter'};
      });
      await perform('卸载释放画布且无异常',async()=>{
        const existing=canvas();check(existing,'Missing canvas before unmount');
        mounted.value=false;await nextTick();await pause(75);
        check(!existing!.isConnected&&canvas()===null,'Unmount retained a WebGL canvas in the DOM');
        check(exceptions.length===0,exceptions.join('\n'));return {oldCanvasConnected:existing!.isConnected,remainingCanvases:document.querySelectorAll('.classic-stage canvas').length,exceptions:[...exceptions]};
      });
      await perform('保留完整地球供截图',async()=>{
        await mount(false);await wait(()=>sceneReady.value&&introReady.value&&frames()>1,'restored full Earth entrance');
        await pause(1600);active.value=false;await nextTick();
        check(exceptions.length===0,exceptions.join('\n'));
        return {frameCount:frames(),renderActive:host()?.dataset.renderActive,restoredForScreenshot:true};
      });
    }catch(error){
      if(results.value.at(-1)?.status!=='fail')results.value.push({name:'核验运行',status:'fail',detail:String(error)});
    }
    finally{
      restoreVisibility();active.value=false;await nextTick();running.value=false;done.value=true;
    }
  }
  const status=()=>done.value?(results.value.some(result=>result.status==='fail')||exceptions.length?'failed':'passed'):running.value?'running':'idle';
  const report=()=>({status:status(),initialVisibility,results:results.value,exceptions,final:{mounted:mounted.value,frameCount:frames(),renderActive:host()?.dataset.renderActive}});
  onMounted(()=>{if(new URLSearchParams(location.search).get('autorun')==='1')void run();});
  return()=>h('main',{class:'classic-qa','data-status':status()},[
    h('aside',[h('h1','经典地球 · 生命周期核验'),h('p','真实 WebGL，公开 props，无桌面输入。可见性事件只在此 QA 页面内模拟。'),
      h('button',{disabled:running.value,onClick:run},running.value?'核验中…':'运行核验'),
      h('ol',results.value.map(result=>h('li',{'data-result':result.status},[h('strong',`${result.status==='pass'?'✓':'✕'} ${result.name}`),h('small',JSON.stringify(result.detail))]))),
      h('pre',{id:'classic-report'},JSON.stringify(report(),null,2))]),
    h('section',{class:'classic-stage'},mounted.value?h(EarthView,{key:generation.value,active:active.value,startIntro:startIntro.value,onSceneReady:()=>{sceneReady.value=true;},onIntroReady:()=>{introReady.value=true;}}):h('span','等待开始')),
  ]);
}});
createApp(app).mount('#app');
const style=document.createElement('style');style.textContent=`html,body,#app{margin:0;width:100%;height:100%;background:#080b09;color:#d1dbc9;font:13px/1.5 system-ui}*{box-sizing:border-box}.classic-qa{height:100%;display:grid;grid-template-columns:310px 1fr}aside{padding:20px;overflow:auto;border-right:1px solid #324029}h1{font-size:18px;margin:0 0 14px}p,small{color:#9ca991}button{padding:9px 16px;border:1px solid #819b59;background:#131c0d;color:#dfedcc}ol{padding:0;list-style:none}li{margin:16px 0}strong,small{display:block}li[data-result=pass] strong{color:#b4df79}li[data-result=fail] strong{color:#ffaf91}small{font-size:10px;overflow-wrap:anywhere}.classic-stage{position:relative;min-width:0;min-height:0}#classic-report{font-size:10px;max-height:220px;overflow:auto;white-space:pre-wrap;color:#9aab88}`;document.head.append(style);
