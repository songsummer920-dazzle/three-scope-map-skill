// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {CustomLayerInterface,CustomRenderMethodInput,Map as MapLibreMap} from 'maplibre-gl';
import type {GeoFeature,GeoFeatureCollection} from '../../types/geo';
import type {VectorMapPalette} from './vectorMapConfig';
import type {OverlayDiagnostics,OverlaySurface} from './vectorMap3dLayer';
import {resolveFuiEarthThemeId,type FuiEarthSkinId} from './fuiEarthTheme';
import {createFuiMapGlassEnvironment} from './fuiMapGlass';
import {createFuiMapGeographicGlassAsync} from './fuiMapGeographicGlass';
import {requestFuiMapRelief,type FuiReliefBounds} from './fuiMapRelief';
import {browserMapQualityBudget,type MapQuality} from './mapQuality';
import {syncVectorMapSharedCamera} from './vectorMapSharedCamera';
import {FuiMapBackdrop} from './fuiMapBackdrop';
import {FuiGlassHdrPass} from './fuiGlassHdrPass';
import {supportsFuiGlassHalfFloat,supportedFuiGlassSamples} from './fuiGlassCapabilities';

type GlassScene=Awaited<ReturnType<typeof createFuiMapGeographicGlassAsync>>;
type ReliefJob={version:number;controller:AbortController;promise?:Promise<THREE.DataTexture|undefined>;texture?:THREE.DataTexture;failed?:boolean};

/** The existing map's native glass materials, drawn on MapLibre's canvas.
 * This Three renderer is only a state adapter around the borrowed context:
 * MapLibre still owns canvas sizing, camera, framebuffer and frame scheduling.
 * No extra canvas, WebGL context, controls, HUD or animation loop is created. */
export class FuiMapSharedGlassLayer implements CustomLayerInterface{
  readonly id='administrative-geographic-3d';
  readonly type='custom' as const;
  readonly renderingMode='3d' as const;
  readonly diagnostics:OverlayDiagnostics;
  private map?:MapLibreMap;
  private renderer?:THREE.WebGLRenderer;
  private environment?:THREE.WebGLRenderTarget;
  private environmentPrepared=false;
  private floatTargetsSupported=false;
  private reflectionSamples=0;
  private backdrop?:FuiMapBackdrop;
  private hdr?:FuiGlassHdrPass;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera();
  private glass?:GlassScene;
  private data:GeoFeatureCollection;
  private surface:'smooth-glass'|'terrain-glass';
  private skin:FuiEarthSkinId;
  private dirty=true;
  private requestedNavigationKey='';
  private buildVersion=0;
  private buildController?:AbortController;
  private buildHandle?:ReturnType<typeof setTimeout>;
  private reliefController?:AbortController;
  private reliefHandle?:ReturnType<typeof setTimeout>;
  private reliefJob?:ReliefJob;
  private prepared?:{glass:GlassScene;version:number;navigationKey:string};
  private buildGlass=createFuiMapGeographicGlassAsync;
  private requestRelief=requestFuiMapRelief;
  private retired:GlassScene[]=[];
  private retirementStages?:Iterator<void>;
  private retirementNotBefore=0;
  private retirementHandle?:ReturnType<typeof setTimeout>;
  private committedVersion=-1;
  private presentedVersion=-1;
  private opticalViewConfigured=false;
  private active=true;
  private preparationRequested=false;
  private removed=false;
  private lost=false;
  private hovered='';
  private progress=new Map<string,number>();
  private lastTime=0;
  private matrixReady=false;
  private matrix=new THREE.Matrix4();
  private inverse=new THREE.Matrix4();
  private localToMercator=new THREE.Matrix4();
  private projectionView=new THREE.Matrix4();
  private raycaster=new THREE.Raycaster();

  constructor(data:GeoFeatureCollection,palette:VectorMapPalette,surface:OverlaySurface,
    private publish?:(d:OverlayDiagnostics)=>void,skin?:FuiEarthSkinId,private quality:MapQuality='balanced'){
    this.surface=surface==='terrain-glass'?'terrain-glass':'smooth-glass';
    this.data=data;this.skin=skin??resolveFuiEarthThemeId('glacier',palette.administrativeFill);
    this.camera.matrixAutoUpdate=false;
    this.diagnostics={renderer:'maplibre-geographic-3d',cameraSource:'maplibre',canvasShared:true,contextShared:true,
      active:true,surface:this.surface,navigationKey:'',features:0,triangles:0,displayExtrusionMeters:0,
      heightMeaning:'display-extrusion-not-DEM',renderFrames:0,drawCalls:0,hoveredKey:'',hoverProgress:0,
      selectionLiftMeters:0,geometryVersion:1,projectionMatrix:[],mercatorAnchor:[],terrainSource:'none',terrainReady:false,errors:[],
      materialSource:this.surface==='terrain-glass'?'fui-native-terrain-glass':'fui-native-smooth-glass',hud:false,pairedSurfaces:0,quality:browserMapQualityBudget(quality).quality,buildPhase:'queued',pendingNavigationKey:''};
  }
  private notify(){this.publish?.({...this.diagnostics,errors:[...this.diagnostics.errors]});}
  private fail(error:unknown){const message=error instanceof Error?error.message:String(error);this.diagnostics.errors=[...this.diagnostics.errors,message].slice(-10);this.notify();}
  private repaint(){if((this.active||this.preparationRequested||this.diagnostics.renderFrames===0)&&!this.removed&&!this.lost)this.map?.triggerRepaint();}
  private cancelBuild(){
    this.buildVersion++;
    if(this.reliefHandle!==undefined)clearTimeout(this.reliefHandle);this.reliefHandle=undefined;
    this.reliefController?.abort();this.reliefController=undefined;
    this.reliefJob=undefined;
    if(this.buildHandle!==undefined)clearTimeout(this.buildHandle);this.buildHandle=undefined;
    this.buildController?.abort();this.buildController=undefined;
    this.prepared?.glass.dispose();this.prepared=undefined;
  }
  setData(data:GeoFeatureCollection,navigationKey=''){
    this.cancelBuild();this.data=data;this.requestedNavigationKey=navigationKey;this.dirty=true;this.hovered='';
    Object.assign(this.diagnostics,{buildPhase:'queued',pendingNavigationKey:navigationKey,hoveredKey:'',hoverProgress:0,selectionLiftMeters:0,
      buildStartedAtMs:undefined,modelPreparedAtMs:undefined,firstFrameAtMs:undefined,regionalRequestStartedAtMs:undefined,regionalReadyAtMs:undefined,regionalAppliedBeforeFirstFrame:undefined,terrainBlend:undefined});
    this.notify();this.repaint();
  }
  setQuality(quality:MapQuality){
    // Apply target resizing/retirement inside the next borrowed-context draw,
    // never in Vue's watcher while MapLibre may own other GL state.
    this.quality=quality;
    this.diagnostics.quality=browserMapQualityBudget(quality).quality;this.notify();this.repaint();
  }
  setStyle(palette:VectorMapPalette,surface:OverlaySurface=this.surface,skin?:FuiEarthSkinId){
    this.skin=skin??resolveFuiEarthThemeId('glacier',palette.administrativeFill);
    const next=surface==='terrain-glass'?'terrain-glass':'smooth-glass';
    if(next!==this.surface){this.surface=next;this.diagnostics.surface=next;this.setData(this.data,this.requestedNavigationKey||this.diagnostics.navigationKey);}
    else{this.glass?.updateSkin(this.skin);this.repaint();}
    this.hdr?.setSkin(this.skin);
  }
  setActive(active:boolean){this.active=active;this.diagnostics.active=active;this.lastTime=0;this.notify();if(active)this.repaint();}
  requestPreparationFrame(){this.preparationRequested=true;this.repaint();}
  setHovered(key:string){if(this.hovered===key)return;this.hovered=key;this.diagnostics.hoveredKey=key;this.notify();this.repaint();}
  pick(point:{x:number;y:number}):GeoFeature|undefined{
    if(!this.matrixReady||!this.map||!this.glass||!this.active||this.diagnostics.buildPhase!=='ready'||this.dirty||this.buildController||this.prepared)return;
    const canvas=this.map.getCanvas(),width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    const x=point.x/width*2-1,y=1-point.y/height*2;
    const near=new THREE.Vector3(x,y,-1).applyMatrix4(this.inverse),far=new THREE.Vector3(x,y,1).applyMatrix4(this.inverse);
    this.raycaster.ray.set(near,far.sub(near).normalize());this.glass.root.updateMatrixWorld(true);
    const hit=this.raycaster.intersectObjects(this.glass.pickMeshes,false)[0];
    return hit?this.glass.regions.find(region=>region.coat===hit.object||region.key===String(hit.object.userData.overlayKey??''))?.feature:undefined;
  }
  private contextLost=()=>{this.lost=true;this.matrixReady=false;this.cancelBuild();this.dirty=true;this.backdrop?.dispose(true);this.backdrop=undefined;Object.assign(this.diagnostics,{backdropActive:false});};
  private cameraSettled=()=>{if(this.retired.length||this.retirementStages)this.repaint();};
  private contextRestored=()=>{this.lost=false;this.releaseScene();this.renderer?.dispose();this.renderer=undefined;this.dirty=true;this.lastTime=0;this.repaint();};
  onAdd(map:MapLibreMap,_gl:WebGL2RenderingContext){
    this.map=map;this.removed=false;
    this.diagnostics.contextAntialias=Boolean(_gl.getContextAttributes()?.antialias);
    this.diagnostics.contextPreserveDrawingBuffer=Boolean(_gl.getContextAttributes()?.preserveDrawingBuffer);
    map.getCanvas().addEventListener('webglcontextlost',this.contextLost);
    map.getCanvas().addEventListener('webglcontextrestored',this.contextRestored);
    map.on?.('moveend',this.cameraSettled);
  }
  private releaseScene(){
    this.cancelBuild();
    this.backdrop?.dispose();this.backdrop=undefined;
    this.hdr?.dispose();this.hdr=undefined;
    if(this.glass){this.scene.remove(this.glass.root);this.glass.dispose();this.glass=undefined;}
    this.disposeRetired();
    this.environment?.dispose();this.environment=undefined;
    this.environmentPrepared=false;this.floatTargetsSupported=false;this.reflectionSamples=0;
  }
  private disposeRetired(){
    if(this.retirementHandle!==undefined)clearTimeout(this.retirementHandle);this.retirementHandle=undefined;
    // Removal/context replacement must release every owner, including a model
    // whose staged disposal has already marked it as retired.
    if(this.retirementStages){while(!this.retirementStages.next().done){/* drain */}this.retirementStages=undefined;}
    for(const model of this.retired.splice(0))model.dispose();
    this.retirementNotBefore=0;
  }
  private finishSuccessfulDraw(){
    if(!this.retired.length&&!this.retirementStages)return;
    if(!this.retirementNotBefore){
      // The navigation waiter starts its camera in the next microtask. Keep
      // old GPU owners through that flight instead of deleting buffers in the
      // replacement's first draw and stalling its immediately following frames.
      this.retirementNotBefore=performance.now()+900;
      this.retirementHandle=setTimeout(()=>{this.retirementHandle=undefined;this.repaint();},900);
      return;
    }
    if(performance.now()<this.retirementNotBefore||this.map?.isMoving?.())return;
    const started=performance.now();
    do{
      if(!this.retirementStages){
        const model=this.retired.shift();if(!model)break;
        // Production scenes expose resource-sized steps; retain compatibility
        // with lower-level consumers that only supply a synchronous disposer.
        this.retirementStages=typeof model.disposeStages==='function'?model.disposeStages():
          (function*(){model.dispose();})();
      }
      if(this.retirementStages.next().done)this.retirementStages=undefined;
    }while(performance.now()-started<4);
    if(this.retired.length||this.retirementStages)this.repaint();
    else this.retirementNotBefore=0;
  }
  private prepare(gl:WebGL2RenderingContext){
    if(!this.map)return;
    if(!this.renderer){
      this.renderer=new THREE.WebGLRenderer({canvas:this.map.getCanvas(),context:gl,alpha:true,antialias:true});
      this.renderer.autoClear=false;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.NoToneMapping;
      this.renderer.info.autoReset=false;
      this.backdrop=new FuiMapBackdrop(gl);
    }
    if(!this.hdr)this.hdr=new FuiGlassHdrPass(this.renderer,this.skin,this.quality);
    if(!this.environmentPrepared){
      // Probe before PMREM: unsupported float devices must not attempt its
      // HalfFloat targets and fail before the compositor can select RGBA8.
      this.floatTargetsSupported=supportsFuiGlassHalfFloat(this.renderer)&&this.hdr.diagnostics.mode==='hdr';
      this.reflectionSamples=this.floatTargetsSupported?supportedFuiGlassSamples(this.renderer,2):0;
      if(this.floatTargetsSupported)this.environment=createFuiMapGlassEnvironment(this.renderer);
      this.environmentPrepared=true;
      Object.assign(this.diagnostics,{floatTargetsSupported:this.floatTargetsSupported,pmremActive:Boolean(this.environment)});
    }
    this.hdr.setQuality(this.quality);this.glass?.setQuality(this.quality);
    if(this.dirty&&!this.buildController&&this.buildHandle===undefined)this.queueBuild();
    this.commitPrepared();
  }
  private queueBuild(){
    if(!this.map||!this.environmentPrepared||this.removed||this.lost)return;
    const version=this.buildVersion,controller=new AbortController();this.buildController=controller;
    const data=this.data,environment=this.environment?.texture,canvas=this.map.getCanvas(),floatTargets=this.floatTargetsSupported,reflectionSamples=this.reflectionSamples;
    const viewport={width:canvas.clientWidth,height:canvas.clientHeight};
    const navigationKey=this.requestedNavigationKey||this.diagnostics.navigationKey;
    const [scope,code]=(navigationKey.split('/').pop()??'').split(':');
    this.diagnostics.buildPhase='queued';this.diagnostics.pendingNavigationKey=navigationKey;
    // CPU geometry/atlas construction belongs to sliced background tasks, not
    // MapLibre's synchronous draw callback. GL preparation remains in prepare.
    this.buildHandle=setTimeout(()=>{
      this.buildHandle=undefined;
      if(this.removed||this.lost||version!==this.buildVersion||controller.signal.aborted)return;
      this.diagnostics.buildPhase='building';this.diagnostics.buildStartedAtMs=performance.now();this.notify();
      const reliefJob=this.surface==='terrain-glass'?{version,controller:new AbortController()} as ReliefJob:undefined;
      if(reliefJob){this.reliefJob=reliefJob;this.reliefController=reliefJob.controller;}
      const onProjectionReady=(bounds:Readonly<FuiReliefBounds>)=>{if(reliefJob)this.startRegionalRequest(reliefJob,bounds);};
      void this.buildGlass(data,this.skin,environment,viewport,this.quality,{signal:controller.signal,scope,code,floatTargets,reflectionSamples,surface:this.surface,onProjectionReady}).then(async glass=>{
        if(this.removed||this.lost||version!==this.buildVersion||controller.signal.aborted){glass.dispose();return;}
        // A cached or already downloaded height field can accompany the first
        // visible scope frame instead of replacing its texture afterwards.
        if(reliefJob?.texture){
          try{await glass.prepareRegionalRelief(reliefJob.texture,controller.signal);}
          catch(error){
            if(controller.signal.aborted){glass.dispose();throw error;}
            // Optional regional detail has the same overview fallback whether
            // it finishes before or after the first geography frame.
            reliefJob.texture=undefined;reliefJob.promise=Promise.resolve(undefined);reliefJob.failed=true;
          }
          if(this.removed||this.lost||version!==this.buildVersion||controller.signal.aborted){glass.dispose();return;}
        }
        this.diagnostics.modelPreparedAtMs=performance.now();
        this.prepared={glass,version,navigationKey};this.buildController=undefined;this.dirty=false;this.repaint();
      }).catch(error=>{
        if(this.removed||this.lost||version!==this.buildVersion||controller.signal.aborted)return;
        reliefJob?.controller.abort();
        this.buildController=undefined;this.dirty=false;this.diagnostics.buildPhase='error';this.fail(error);
      });
    },0);
  }
  private startRegionalRequest(job:ReliefJob,bounds:Readonly<FuiReliefBounds>){
    if(job.promise||job.controller.signal.aborted||job.version!==this.buildVersion||this.removed||this.lost)return;
    this.diagnostics.regionalRequestStartedAtMs=performance.now();
    // Start network/worker preparation alongside model construction. Always
    // attach the rejection handler now, even if geometry is still in flight.
    job.promise=this.requestRelief([...bounds],job.controller.signal).then(texture=>{
      if(job.controller.signal.aborted||job.version!==this.buildVersion)return undefined;
      job.texture=texture;return texture;
    },()=>{job.failed=true;return undefined;});
  }
  private queueRegionalRelief(model:GlassScene){
    if(model.root.userData.fuiSurfaceFamily!=='terrain')return;
    const job=this.reliefJob??{version:this.buildVersion,controller:new AbortController()};
    this.reliefJob=job;this.reliefController=job.controller;
    this.startRegionalRequest(job,[...model.geographicBounds]);
    if(model.root.userData.fuiReliefReady){
      this.diagnostics.terrainDetail='regional';this.diagnostics.terrainResolution=model.root.userData.fuiReliefSize;
      this.diagnostics.terrainBlend=Number(model.root.userData.fuiReliefBlend??1);
      this.diagnostics.regionalReadyAtMs=performance.now();return;
    }
    const controller=job.controller;
    this.diagnostics.terrainDetail='loading';this.diagnostics.terrainResolution=0;
    this.reliefHandle=setTimeout(()=>{
      this.reliefHandle=undefined;
      if(controller.signal.aborted||this.glass!==model||this.removed||this.lost)return;
      void job.promise!.then(async texture=>{
        if(controller.signal.aborted||this.glass!==model||this.removed||this.lost)return;
        if(!texture){this.diagnostics.terrainDetail='overview';this.notify();return;}
        if(!await model.prepareRegionalRelief(texture,controller.signal,{blend:this.active&&this.presentedVersion===this.committedVersion}))return;
        if(controller.signal.aborted||this.glass!==model)return;
        const blend=Number(model.root.userData.fuiReliefBlend??1);
        this.diagnostics.terrainBlend=blend;
        this.diagnostics.terrainDetail=blend<1?'loading':'regional';this.diagnostics.terrainResolution=blend<1?0:texture.image.width;
        if(blend>=1)this.diagnostics.regionalReadyAtMs=performance.now();this.notify();this.repaint();
      }).catch(error=>{
        if(controller.signal.aborted||this.glass!==model||this.removed||this.lost)return;
        // The bundled native overview remains a real geographic fallback,
        // just as in the standalone map; a missing network DEM is non-fatal.
        this.diagnostics.terrainDetail='overview';this.notify();this.repaint();
      }).finally(()=>{if(this.reliefController===controller)this.reliefController=undefined;});
    },0);
  }
  private commitPrepared(){
    const pending=this.prepared;if(!pending)return;this.prepared=undefined;
    if(pending.version!==this.buildVersion){pending.glass.dispose();return;}
    const previous=this.glass;
    this.committedVersion=pending.version;
    this.glass=pending.glass;this.glass.updateSkin(this.skin);this.glass.setQuality(this.quality);
    this.glass.setFloatTargets(this.floatTargetsSupported&&this.hdr?.diagnostics.mode==='hdr');
    this.scene.add(this.glass.root);this.opticalViewConfigured=false;
    this.progress.clear();this.matrixReady=false;
    for(const region of this.glass.regions)if(region.coat.material.uniforms.uGlassLinearOutput)region.coat.material.uniforms.uGlassLinearOutput.value=1;
    let triangles=0;this.glass.root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.fuiRenderProxy){const g=object.geometry;triangles+=(g.index?.count??g.getAttribute('position').count)/3;}});
    Object.assign(this.diagnostics,{navigationKey:pending.navigationKey,pendingNavigationKey:'',buildPhase:'ready',
      geometryVersion:this.diagnostics.geometryVersion+1,features:this.glass.regions.length,pairedSurfaces:this.glass.regions.length*2,triangles,
      displayExtrusionMeters:this.glass.depthMeters,mercatorAnchor:[this.glass.anchor.x,this.glass.anchor.y],
      southSeaIslands:this.glass.southSeaCounts.islands,southSeaSegments:this.glass.southSeaCounts.segments,
      surface:this.surface,materialSource:this.surface==='terrain-glass'?'fui-native-terrain-glass':'fui-native-smooth-glass',terrainReady:this.surface==='terrain-glass',terrainSource:this.surface==='terrain-glass'?'NASA-GEBCO-global-geographic-relief':'none',terrainDetail:this.surface==='terrain-glass'?'loading':'none',terrainResolution:0});
    if(previous){
      this.scene.remove(previous.root);this.retired.push(previous);
      // A second navigation may begin while an older retirement is sliced.
      // Its newly replaced GPU owners get their own post-flight grace period.
      if(this.retirementHandle!==undefined)clearTimeout(this.retirementHandle);this.retirementHandle=undefined;
      this.retirementNotBefore=0;
    }
    this.queueRegionalRelief(this.glass);
  }
  render(gl:WebGL2RenderingContext,options:CustomRenderMethodInput){
    if(this.removed||this.lost||!this.map||(!this.active&&!this.preparationRequested&&this.diagnostics.renderFrames>0&&!this.prepared))return;
    if(this.diagnostics.contextSamples===undefined)this.diagnostics.contextSamples=gl.getParameter(gl.SAMPLES) as number;
    if((this.map.getProjection()?.type??'mercator')!=='mercator'){this.fail('Overlay requires Mercator map projection');return;}
    // MapLibre marks its GL cache dirty after a custom draw. Preserve the
    // shared target and pixel transfer state across Three's PMREM/Reflector.
    const state={draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      renderbuffer:gl.getParameter(gl.RENDERBUFFER_BINDING),viewport:gl.getParameter(gl.VIEWPORT),
      unpack:gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
      premultiply:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),colorspace:gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL)};
    let restoreTargetMethod:(()=>void)|undefined;
    try{
      this.prepare(gl);if(!this.glass||!this.renderer)return;
      const {anchor,scale}=this.glass,wrap=Math.round(((this.map.getCenter().lng+180)/360)-anchor.x);
      this.localToMercator.makeTranslation(anchor.x+wrap,anchor.y,0).multiply(new THREE.Matrix4().makeScale(scale,-scale,scale));
      this.matrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(this.localToMercator);
      this.inverse.copy(this.matrix).invert();this.matrixReady=true;
      syncVectorMapSharedCamera(this.camera,options,this.localToMercator);
      if(!this.opticalViewConfigured){
        this.glass.setOpticalView(this.camera.position.clone().sub(this.glass.opticalCenter));
        this.opticalViewConfigured=true;
      }
      const canvas=this.map.getCanvas();this.glass.setViewport(canvas.clientWidth,canvas.clientHeight);
      const now=performance.now(),delta=this.lastTime?Math.min(100,now-this.lastTime):16;this.lastTime=now;
      let moving=this.glass.updateRegionalRelief?.(now,!this.active)??false,maximum=0;
      const terrainBlend=Number(this.glass.root.userData.fuiReliefBlend??0);
      if(this.glass.root.userData.fuiReliefReady&&terrainBlend>=1&&this.diagnostics.terrainDetail!=='regional'){
        this.diagnostics.terrainDetail='regional';this.diagnostics.terrainResolution=this.glass.root.userData.fuiReliefSize;
        this.diagnostics.regionalReadyAtMs=now;
      }
      for(const region of this.glass.regions){
        const target=region.key===this.hovered?1:0;let value=this.progress.get(region.key)??0;
        value+=(target-value)*(1-Math.exp(-delta/55));if(Math.abs(value-target)<.003)value=target;else moving=true;
        this.progress.set(region.key,value);maximum=Math.max(maximum,value);this.glass.updateHover(region.key,value);
      }
      this.renderer.resetState();gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,state.draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,state.read);
      this.renderer.setViewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
      this.renderer.info.reset();
      // Cover allocation probes as well as Reflector/OutputPass returns. A
      // failed HDR allocation can switch straight to direct drawing, which
      // must start on the borrowed framebuffer even without another bind.
      const renderer=this.renderer,setTarget=renderer.setRenderTarget;
      if(state.draw!==null){
        renderer.setRenderTarget=(target,face,mip)=>{
          setTarget.call(renderer,target,face,mip);
          if(target===null)renderer.state.bindFramebuffer(gl.FRAMEBUFFER,state.draw);
        };
        restoreTargetMethod=()=>{renderer.setRenderTarget=setTarget;};
      }
      // PMREM preparation above may have changed targets. Snapshot the actual
      // restored provider framebuffer before drawing any native glass, using
      // the original canvas viewport even when its texture is downsampled.
      const directTerrain=this.glass.root.userData.fuiSurfaceFamily==='terrain';
      if(!directTerrain)this.hdr!.setSize(canvas.clientWidth,canvas.clientHeight,gl.drawingBufferWidth/Math.max(1,canvas.clientWidth));
      this.glass.setFloatTargets(this.floatTargetsSupported&&this.hdr!.diagnostics.mode==='hdr');
      const useBackdrop=this.glass.regions.some(region=>Number(region.coat.material.uniforms.uGlassBackdropStrength?.value??0)>0);
      let backdrop:THREE.Texture|undefined;
      try{if(useBackdrop)backdrop=this.backdrop?.capture(this.renderer,state.draw,gl.drawingBufferWidth,gl.drawingBufferHeight);}
      catch(error){this.fail(error);}
      finally{
        const snapshot=this.backdrop?.diagnostics;
        Object.assign(this.diagnostics,{backdropActive:snapshot?.active??false,backdropCaptures:snapshot?.captures??0,
          backdropSize:[snapshot?.width??0,snapshot?.height??0],backdropSourceEncoding:snapshot?.sourceEncoding??'unknown',
          backdropSourceSamples:snapshot?.sourceSamples??0,backdropProbeError:snapshot?.probeError??0,
          backdropProbePhase:snapshot?.probePhase??'pending',backdropPhaseErrors:snapshot?.phaseErrors});
      }
      this.projectionView.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
      this.glass.setBackdrop(backdrop,this.hdr!.diagnostics.width,this.hdr!.diagnostics.height,this.projectionView);
      // Match the standalone material pipeline: terrain's physical clear coat
      // refracts its opaque relief directly; the pure hologram alone uses HDR/Bloom.
      if(directTerrain)this.renderer.render(this.scene,this.camera);
      else this.hdr!.render(this.scene,this.camera,canvas.clientWidth,canvas.clientHeight,gl.drawingBufferWidth/Math.max(1,canvas.clientWidth));
      if(this.presentedVersion!==this.committedVersion){
        this.presentedVersion=this.committedVersion;
        this.diagnostics.firstFrameAtMs=performance.now();
        this.diagnostics.regionalAppliedBeforeFirstFrame=Boolean(this.glass.root.userData.fuiReliefReady&&terrainBlend>=1);
      }
      this.finishSuccessfulDraw();
      Object.assign(this.diagnostics,{renderFrames:this.diagnostics.renderFrames+1,drawCalls:this.renderer.info.render.calls,
        hdrActive:!directTerrain&&this.hdr!.diagnostics.mode==='hdr',glassMode:directTerrain?'direct':this.hdr!.diagnostics.mode,glassBloom:!directTerrain&&this.hdr!.diagnostics.bloomEnabled,glassFallbackReason:this.hdr!.diagnostics.fallbackReason,quality:this.hdr!.diagnostics.quality,reflectionEnabled:this.glass.reflection?.visible??false,hdrSource:directTerrain?'fui-native-terrain-direct':this.hdr!.diagnostics.source,hdrSize:directTerrain?[0,0]:[this.hdr!.diagnostics.width,this.hdr!.diagnostics.height],
        hdrSamples:directTerrain?0:this.hdr!.diagnostics.samples,hdrOutput:directTerrain?'native-srgb':this.hdr!.diagnostics.output,
        hoverProgress:maximum,selectionLiftMeters:maximum*this.glass.depthMeters*.5,terrainBlend,
        projectionMatrix:Array.from(options.defaultProjectionData.mainMatrix)});
      if(this.preparationRequested&&this.diagnostics.buildPhase==='ready'&&!this.dirty&&!this.buildController&&!this.prepared&&this.diagnostics.navigationKey===(this.requestedNavigationKey||this.diagnostics.navigationKey))this.preparationRequested=false;
      this.notify();if(moving&&this.active)this.repaint();
    }catch(error){this.fail(error);}
    finally{
      restoreTargetMethod?.();
      this.renderer?.resetState();
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,state.draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,state.read);gl.bindRenderbuffer(gl.RENDERBUFFER,state.renderbuffer);
      gl.viewport(state.viewport[0],state.viewport[1],state.viewport[2],state.viewport[3]);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,state.unpack);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,state.flip);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,state.premultiply);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,state.colorspace);
    }
  }
  onRemove(map:MapLibreMap,_gl:WebGL2RenderingContext){
    this.removed=true;this.preparationRequested=false;this.matrixReady=false;this.diagnostics.active=false;this.notify();
    map.getCanvas().removeEventListener('webglcontextlost',this.contextLost);map.getCanvas().removeEventListener('webglcontextrestored',this.contextRestored);
    map.off?.('moveend',this.cameraSettled);
    this.releaseScene();this.renderer?.dispose();this.renderer=undefined;this.map=undefined;this.progress.clear();
  }
}
