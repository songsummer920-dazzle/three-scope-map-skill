// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {CustomLayerInterface,CustomRenderMethodInput,Map as MapLibreMap} from 'maplibre-gl';
import type {GeoFeature,GeoFeatureCollection} from '../../types/geo';
import type {VectorMapPalette} from './vectorMapConfig';
import {createOverlayGeometry,type OverlayGeometry,type OverlaySurface} from './vectorMap3dGeometry';
import terrainReliefUrl from '../../assets/textures/map/world/earth-relief.png';
import {FuiMapSharedGlassLayer} from './fuiMapSharedGlassLayer';
import type {FuiEarthSkinId} from './fuiEarthTheme';
import type {MapQuality} from './mapQuality';

export type {OverlaySurface} from './vectorMap3dGeometry';
export type OverlayDiagnostics={
  renderer:'maplibre-geographic-3d';cameraSource:'maplibre';canvasShared:true;contextShared:true;
  active:boolean;surface:OverlaySurface;navigationKey:string;features:number;triangles:number;
  displayExtrusionMeters:number;heightMeaning:'display-extrusion-not-DEM';renderFrames:number;drawCalls:number;
  hoveredKey:string;hoverProgress:number;selectionLiftMeters:number;geometryVersion:number;projectionMatrix:number[];mercatorAnchor:number[];
  terrainSource:'none'|'NASA-GEBCO-global-geographic-relief';terrainReady:boolean;terrainDetail?:'none'|'loading'|'overview'|'regional';terrainResolution?:number;terrainBlend?:number;errors:string[];
  materialSource?:'fui-native-smooth-glass'|'fui-native-terrain-glass';hud?:false;pairedSurfaces?:number;
  contextAntialias?:boolean;contextPreserveDrawingBuffer?:boolean;contextSamples?:number;
  southSeaIslands?:number;southSeaSegments?:number;
  backdropActive?:boolean;backdropSize?:number[];backdropCaptures?:number;
  backdropSourceEncoding?:string;backdropSourceSamples?:number;backdropProbeError?:number;
  backdropProbePhase?:string;backdropPhaseErrors?:Record<string,number>;
  hdrActive?:boolean;hdrSource?:string;hdrSize?:number[];hdrSamples?:number;hdrOutput?:string;
  quality?:string;floatTargetsSupported?:boolean;pmremActive?:boolean;reflectionEnabled?:boolean;glassMode?:'hdr'|'ldr'|'direct';glassBloom?:boolean;glassFallbackReason?:string;
  buildPhase?:'idle'|'queued'|'building'|'ready'|'error';pendingNavigationKey?:string;
  buildStartedAtMs?:number;modelPreparedAtMs?:number;firstFrameAtMs?:number;
  regionalRequestStartedAtMs?:number;regionalReadyAtMs?:number;regionalAppliedBeforeFirstFrame?:boolean;
};
type GPUBuffer={vao:WebGLVertexArrayObject;buffer:WebGLBuffer;count:number};
type GPUFeature={key:string;top:GPUBuffer;wall:GPUBuffer;edges:GPUBuffer;hover:number};

const vertexSource=`#version 300 es
  precision highp float;
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in float aDepth;
  layout(location=3) in float aMeterScale;
  uniform mat4 uMatrix;
  uniform vec2 uAnchor;
  uniform float uLiftMeters;
  out vec3 vPosition;out vec3 vNormal;out float vDepth;out vec2 vMercator;
  void main(){
    vec3 position=aPosition;position.z+=uLiftMeters*aMeterScale*aDepth;
    vPosition=position;vNormal=aNormal;vDepth=aDepth;vMercator=position.xy+uAnchor;
    gl_Position=uMatrix*vec4(position,1.0);
  }
`;
const fragmentSource=`#version 300 es
  precision highp float;
  uniform vec3 uPigment;uniform vec3 uEdge;uniform vec3 uCamera;
  uniform float uHover;uniform int uPart;uniform int uSurface;uniform bool uTerrainReady;
  uniform sampler2D uRelief;
  in vec3 vPosition;in vec3 vNormal;in float vDepth;in vec2 vMercator;
  out vec4 fragColor;
  vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
  void main(){
    vec3 n=normalize(vNormal);vec3 light=normalize(vec3(-.55,-.48,.72));
    float elevation=0.0;
    if(uPart==0&&uSurface==1&&uTerrainReady){
      float latitude=2.0*atan(exp((1.0-2.0*vMercator.y)*3.14159265359))-1.57079632679;
      vec2 uv=vec2(fract(vMercator.x),.5-latitude/3.14159265359);
      vec4 relief=texture(uRelief,uv);elevation=relief.b;
      n=normalize(vec3((relief.r*2.0-1.0)*.65,-(relief.g*2.0-1.0)*.65,1.0));
    }
    vec3 view=normalize(uCamera-vPosition);float key=max(dot(n,light),0.0);
    float fresnel=pow(1.0-clamp(abs(dot(n,view)),0.0,1.0),4.0);
    vec3 color;float alpha;
    if(uPart==2){
      color=mix(uPigment*.16,uEdge*.95,vDepth)*(1.0+uHover*.45);
      alpha=mix(.46,.95,vDepth);
    }else if(uPart==1){
      float shoulder=smoothstep(.2,.95,vDepth);
      color=uPigment*mix(.025,.48,shoulder)*(.48+.52*key);
      color+=uEdge*pow(vDepth,10.0)*.30;
      color+=uPigment*uHover*.17;alpha=.82;
    }else{
      // One continuous polished face; geographic relief is sampled only for
      // the explicit terrain style, from the bundled real global data atlas.
      vec3 halfway=normalize(light+view);
      float specular=pow(max(dot(n,halfway),0.0),48.0);
      float grain=uSurface==1?(.75+elevation*.45):1.0;
      color=pow(uPigment,vec3(1.15))*(.16+.20*key)*grain;
      color+=mix(uPigment,uEdge,.22)*(specular*.25+fresnel*.10);
      color+=uPigment*uHover*.29;
      alpha=(uSurface==2?.88:uSurface==1?.76:.62)+uHover*.20;
    }
    alpha=clamp(alpha,0.0,.98);
    fragColor=vec4(srgb(clamp(color,0.0,1.0))*alpha,alpha);
  }
`;

function compile(gl:WebGL2RenderingContext,type:number,source:string){
  const shader=gl.createShader(type);if(!shader)throw new Error('Overlay shader allocation failed');
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(`Overlay shader: ${error}`);}return shader;
}

/** MapLibre 6 custom-layer contract is authoritative: mainMatrix consumes
 * conformal Mercator XYZ, and MapLibre marks/restores its GL state after render.
 * This layer additionally restores every state it changes, owns no canvas,
 * renderer, OrbitControls or RAF, and never clears the shared framebuffer. */
class LegacyVectorMap3dLayer implements CustomLayerInterface{
  readonly id='administrative-geographic-3d';readonly type='custom' as const;readonly renderingMode='3d' as const;
  private map?:MapLibreMap;private gl?:WebGL2RenderingContext;private program?:WebGLProgram;
  private texture?:WebGLTexture;private image?:ImageBitmap;private terrainBlob?:Blob;private terrainRequest?:AbortController;private pendingImage=false;private removed=false;private lost=false;
  private geometry:OverlayGeometry;private gpu:GPUFeature[]=[];private pendingGeometry=true;
  private palette:VectorMapPalette;private surface:OverlaySurface;private active=true;private hovered='';private preparationRequested=false;
  private matrix=new THREE.Matrix4();private inverse=new THREE.Matrix4();private raycaster=new THREE.Raycaster();
  private lastTime=0;private matrixReady=false;private uniforms:Record<string,WebGLUniformLocation|null>={};
  readonly diagnostics:OverlayDiagnostics;
  constructor(data:GeoFeatureCollection,palette:VectorMapPalette,surface:OverlaySurface='smooth-glass',private publish?:(d:OverlayDiagnostics)=>void){
    this.geometry=createOverlayGeometry(data);this.palette=palette;this.surface=surface;
    this.diagnostics={renderer:'maplibre-geographic-3d',cameraSource:'maplibre',canvasShared:true,contextShared:true,active:true,surface,navigationKey:'',features:0,triangles:0,displayExtrusionMeters:0,heightMeaning:'display-extrusion-not-DEM',renderFrames:0,drawCalls:0,hoveredKey:'',hoverProgress:0,selectionLiftMeters:0,geometryVersion:1,projectionMatrix:[],mercatorAnchor:[],terrainSource:'none',terrainReady:false,errors:[]};
    this.updateGeometryDiagnostics();
  }
  private notify(){this.publish?.({...this.diagnostics,errors:[...this.diagnostics.errors]});}
  private fail(error:unknown){const message=error instanceof Error?error.message:String(error);this.diagnostics.errors=[...this.diagnostics.errors,message].slice(-10);this.notify();}
  private updateGeometryDiagnostics(){const g=this.geometry;Object.assign(this.diagnostics,{features:g.features.length,triangles:g.features.reduce((n,f)=>n+(f.top.getAttribute('position').count+f.wall.getAttribute('position').count)/3,0),displayExtrusionMeters:g.depthMeters,mercatorAnchor:[g.anchor.x,g.anchor.y]});}
  setData(data:GeoFeatureCollection,navigationKey=''){
    const replacement=createOverlayGeometry(data);this.geometry.dispose();this.geometry=replacement;this.pendingGeometry=true;this.hovered='';this.matrixReady=false;
    this.diagnostics.geometryVersion++;this.diagnostics.navigationKey=navigationKey;this.diagnostics.hoveredKey='';this.diagnostics.hoverProgress=0;this.diagnostics.selectionLiftMeters=0;this.updateGeometryDiagnostics();this.notify();this.repaint();
  }
  setStyle(palette:VectorMapPalette,surface:OverlaySurface=this.surface){this.palette=palette;this.surface=surface;this.diagnostics.surface=surface;this.diagnostics.terrainSource=surface==='terrain-glass'?'NASA-GEBCO-global-geographic-relief':'none';if(surface!=='terrain-glass'){this.terrainRequest?.abort();this.terrainRequest=undefined;this.image?.close();this.image=undefined;this.pendingImage=false;}this.ensureTerrain();this.notify();this.repaint();}
  setActive(active:boolean){this.active=active;this.diagnostics.active=active;if(active)this.repaint();this.notify();}
  requestPreparationFrame(){this.preparationRequested=true;if(!this.removed&&!this.lost)this.map?.triggerRepaint();}
  setHovered(key:string){if(key===this.hovered)return;this.hovered=key;this.diagnostics.hoveredKey=key;this.notify();this.repaint();}
  private repaint(){if(this.active&&!this.removed&&!this.lost)this.map?.triggerRepaint();}
  pick(point:{x:number;y:number}):GeoFeature|undefined{
    if(!this.matrixReady||!this.map||!this.active)return;
    const canvas=this.map.getCanvas(),width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    const x=point.x/width*2-1,y=1-point.y/height*2;
    const near=new THREE.Vector3(x,y,-1).applyMatrix4(this.inverse),far=new THREE.Vector3(x,y,1).applyMatrix4(this.inverse);
    this.raycaster.ray.set(near,far.sub(near).normalize());
    const hits=this.raycaster.intersectObjects(this.geometry.features.map(f=>f.pick),false);
    return hits[0]?this.geometry.features.find(f=>f.pick===hits[0].object)?.feature:undefined;
  }
  private contextLost=()=>{this.lost=true;this.matrixReady=false;};
  private contextRestored=()=>{this.lost=false;this.program=undefined;this.texture=undefined;this.gpu=[];this.pendingGeometry=true;this.diagnostics.terrainReady=false;this.pendingImage=Boolean(this.image?.width);this.ensureTerrain();this.repaint();};
  onAdd(map:MapLibreMap,gl:WebGL2RenderingContext){
    this.map=map;this.gl=gl;this.removed=false;map.getCanvas().addEventListener('webglcontextlost',this.contextLost);map.getCanvas().addEventListener('webglcontextrestored',this.contextRestored);this.ensureTerrain();this.notify();
  }
  private ensureTerrain(){
    if(this.surface!=='terrain-glass'||this.image||this.terrainRequest||this.diagnostics.terrainReady||typeof createImageBitmap==='undefined')return;
    this.diagnostics.terrainSource='NASA-GEBCO-global-geographic-relief';
    const request=new AbortController();this.terrainRequest=request;
    const source=this.terrainBlob?Promise.resolve(this.terrainBlob):fetch(terrainReliefUrl,{signal:request.signal}).then(response=>{if(!response.ok)throw new Error(`Geographic terrain-relief atlas: HTTP ${response.status}`);return response.blob();});
    void source.then(async blob=>{
      if(request.signal.aborted||this.removed)return;
      this.terrainBlob=blob;
      const image=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none'});
      if(request.signal.aborted||this.removed){image.close();return;}
      this.image=image;this.pendingImage=true;this.repaint();
    }).catch(error=>{if(!request.signal.aborted&&!this.removed)this.fail(error);}).finally(()=>{if(this.terrainRequest===request)this.terrainRequest=undefined;});
  }
  private initialize(gl:WebGL2RenderingContext){
    const vertex=compile(gl,gl.VERTEX_SHADER,vertexSource),fragment=compile(gl,gl.FRAGMENT_SHADER,fragmentSource);
    const program=gl.createProgram();if(!program)throw new Error('Overlay program allocation failed');
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const error=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error(`Overlay linking: ${error}`);}
    this.program=program;
    for(const name of ['uMatrix','uAnchor','uLiftMeters','uPigment','uEdge','uCamera','uHover','uPart','uSurface','uTerrainReady','uRelief'])this.uniforms[name]=gl.getUniformLocation(program,name);
    const texture=gl.createTexture();if(!texture)throw new Error('Overlay texture allocation failed');this.texture=texture;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,0,128]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  private buffer(gl:WebGL2RenderingContext,geometry:THREE.BufferGeometry):GPUBuffer{
    const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),depth=geometry.getAttribute('depth'),scale=geometry.getAttribute('meterScale');
    const data=new Float32Array(position.count*8);
    for(let i=0;i<position.count;i++)data.set([position.getX(i),position.getY(i),position.getZ(i),normal.getX(i),normal.getY(i),normal.getZ(i),depth.getX(i),scale.getX(i)],i*8);
    const vao=gl.createVertexArray(),buffer=gl.createBuffer();if(!vao||!buffer)throw new Error('Overlay geometry allocation failed');
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    for(const [index,size,offset] of [[0,3,0],[1,3,12],[2,1,24],[3,1,28]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,32,offset);}
    return{vao,buffer,count:position.count};
  }
  private deleteBuffers(gl:WebGL2RenderingContext){for(const f of this.gpu)for(const b of [f.top,f.wall,f.edges]){gl.deleteVertexArray(b.vao);gl.deleteBuffer(b.buffer);}this.gpu=[];}
  render(gl:WebGL2RenderingContext,options:CustomRenderMethodInput){
    if((!this.active&&this.diagnostics.renderFrames>0&&!this.preparationRequested)||this.removed||this.lost)return;
    if((this.map?.getProjection()?.type??'mercator')!=='mercator'){if(!this.diagnostics.errors.includes('Overlay requires Mercator map projection'))this.fail('Overlay requires Mercator map projection');return;}
    // Own VAOs isolate all attribute bindings. Preserve the MapLibre state
    // touched here; framebuffer, viewport, stencil and depth range stay intact.
    const state={program:gl.getParameter(gl.CURRENT_PROGRAM),vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),buffer:gl.getParameter(gl.ARRAY_BUFFER_BINDING),activeTexture:gl.getParameter(gl.ACTIVE_TEXTURE),blend:gl.isEnabled(gl.BLEND),depth:gl.isEnabled(gl.DEPTH_TEST),cull:gl.isEnabled(gl.CULL_FACE),depthMask:gl.getParameter(gl.DEPTH_WRITEMASK),depthFunc:gl.getParameter(gl.DEPTH_FUNC),srcRGB:gl.getParameter(gl.BLEND_SRC_RGB),dstRGB:gl.getParameter(gl.BLEND_DST_RGB),srcAlpha:gl.getParameter(gl.BLEND_SRC_ALPHA),dstAlpha:gl.getParameter(gl.BLEND_DST_ALPHA),eqRGB:gl.getParameter(gl.BLEND_EQUATION_RGB),eqAlpha:gl.getParameter(gl.BLEND_EQUATION_ALPHA),lineWidth:gl.getParameter(gl.LINE_WIDTH),viewport:gl.getParameter(gl.VIEWPORT),colorMask:gl.getParameter(gl.COLOR_WRITEMASK),scissor:gl.isEnabled(gl.SCISSOR_TEST),stencil:gl.isEnabled(gl.STENCIL_TEST),polygonOffset:gl.isEnabled(gl.POLYGON_OFFSET_FILL),sampleAlpha:gl.isEnabled(gl.SAMPLE_ALPHA_TO_COVERAGE),discard:gl.isEnabled(gl.RASTERIZER_DISCARD),unpackBuffer:gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),colorspace:gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL)};
    gl.activeTexture(gl.TEXTURE0);const previousTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);
    try{
      gl.disable(gl.SCISSOR_TEST);gl.disable(gl.STENCIL_TEST);gl.disable(gl.POLYGON_OFFSET_FILL);gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);gl.disable(gl.RASTERIZER_DISCARD);gl.colorMask(true,true,true,true);gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,null);
      if(!this.program)this.initialize(gl);
      if(this.pendingGeometry){this.deleteBuffers(gl);this.gpu=this.geometry.features.map(f=>({key:f.key,top:this.buffer(gl,f.top),wall:this.buffer(gl,f.wall),edges:this.buffer(gl,f.edges),hover:0}));this.pendingGeometry=false;}
      gl.bindTexture(gl.TEXTURE_2D,this.texture!);
      if(this.pendingImage&&this.image?.width){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image);this.image.close();this.image=undefined;this.pendingImage=false;this.diagnostics.terrainReady=true;}
      const anchor=this.geometry.anchor,worldWrap=Math.round(((this.map!.getCenter().lng+180)/360)-anchor.x);
      this.matrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(new THREE.Matrix4().makeTranslation(anchor.x+worldWrap,anchor.y,0));this.inverse.copy(this.matrix).invert();this.matrixReady=true;
      const camera=new THREE.Vector3(0,0,-1).applyMatrix4(this.inverse);
      const pigment=new THREE.Color(this.palette.administrativeFill),edge=new THREE.Color(this.palette.administrativeLine);
      const peak=Math.max(pigment.r,pigment.g,pigment.b,.001);pigment.multiplyScalar(1/peak);
      gl.useProgram(this.program!);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(this.uniforms.uMatrix,false,new Float32Array(this.matrix.elements));gl.uniform2f(this.uniforms.uAnchor,anchor.x,anchor.y);
      gl.uniform3f(this.uniforms.uPigment,pigment.r,pigment.g,pigment.b);gl.uniform3f(this.uniforms.uEdge,edge.r,edge.g,edge.b);gl.uniform3f(this.uniforms.uCamera,camera.x,camera.y,camera.z);
      gl.uniform1i(this.uniforms.uSurface,this.surface==='terrain-glass'?1:this.surface==='classic'?2:0);gl.uniform1i(this.uniforms.uTerrainReady,this.diagnostics.terrainReady?1:0);gl.uniform1i(this.uniforms.uRelief,0);
      const now=performance.now(),delta=this.lastTime?Math.min(100,now-this.lastTime):16;this.lastTime=now;let moving=false,drawCalls=0;
      for(let i=0;i<this.gpu.length;i++){
        const f=this.gpu[i],target=f.key===this.hovered?1:0;f.hover+=(target-f.hover)*(1-Math.exp(-delta/55));if(Math.abs(f.hover-target)<.003)f.hover=target;else moving=true;
        const mesh=this.geometry.features[i].pick;mesh.position.z=f.hover*this.geometry.depthMeters*.28*anchor.metersToMercator;mesh.updateMatrixWorld(true);
      }
      const hoverProgress=this.gpu.reduce((maximum,f)=>Math.max(maximum,f.hover),0);
      this.diagnostics.hoverProgress=hoverProgress;this.diagnostics.selectionLiftMeters=hoverProgress*this.geometry.depthMeters*.28;
      for(const part of [1,0,2]){
        gl.uniform1i(this.uniforms.uPart,part);gl.depthMask(part!==2);if(part===2)gl.lineWidth(1);
        for(const f of this.gpu){gl.uniform1f(this.uniforms.uHover,f.hover);gl.uniform1f(this.uniforms.uLiftMeters,f.hover*this.geometry.depthMeters*.28);const b=part===0?f.top:part===1?f.wall:f.edges;gl.bindVertexArray(b.vao);gl.drawArrays(part===2?gl.LINES:gl.TRIANGLES,0,b.count);drawCalls++;}
      }
      this.preparationRequested=false;
      Object.assign(this.diagnostics,{renderFrames:this.diagnostics.renderFrames+1,drawCalls,projectionMatrix:Array.from(options.defaultProjectionData.mainMatrix)});this.notify();if(moving)this.repaint();
    }catch(error){this.fail(error);}
    finally{
      gl.bindVertexArray(state.vao);gl.bindBuffer(gl.ARRAY_BUFFER,state.buffer);gl.useProgram(state.program);gl.bindTexture(gl.TEXTURE_2D,previousTexture);gl.activeTexture(state.activeTexture);
      (state.blend?gl.enable:gl.disable).call(gl,gl.BLEND);(state.depth?gl.enable:gl.disable).call(gl,gl.DEPTH_TEST);(state.cull?gl.enable:gl.disable).call(gl,gl.CULL_FACE);
      for(const [enabled,capability] of [[state.scissor,gl.SCISSOR_TEST],[state.stencil,gl.STENCIL_TEST],[state.polygonOffset,gl.POLYGON_OFFSET_FILL],[state.sampleAlpha,gl.SAMPLE_ALPHA_TO_COVERAGE],[state.discard,gl.RASTERIZER_DISCARD]] as const)(enabled?gl.enable:gl.disable).call(gl,capability);
      gl.viewport(state.viewport[0],state.viewport[1],state.viewport[2],state.viewport[3]);gl.colorMask(state.colorMask[0],state.colorMask[1],state.colorMask[2],state.colorMask[3]);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER,state.unpackBuffer);
      gl.depthMask(state.depthMask);gl.depthFunc(state.depthFunc);gl.blendFuncSeparate(state.srcRGB,state.dstRGB,state.srcAlpha,state.dstAlpha);gl.blendEquationSeparate(state.eqRGB,state.eqAlpha);gl.lineWidth(state.lineWidth);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,state.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,state.premultiply);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,state.colorspace);
    }
  }
  onRemove(map:MapLibreMap,gl:WebGL2RenderingContext){
    this.removed=true;this.matrixReady=false;this.diagnostics.active=false;this.notify();map.getCanvas().removeEventListener('webglcontextlost',this.contextLost);map.getCanvas().removeEventListener('webglcontextrestored',this.contextRestored);
    this.terrainRequest?.abort();this.terrainRequest=undefined;this.image?.close();this.image=undefined;this.terrainBlob=undefined;
    this.deleteBuffers(gl);if(this.texture)gl.deleteTexture(this.texture);if(this.program)gl.deleteProgram(this.program);this.texture=undefined;this.program=undefined;this.geometry.dispose();this.map=undefined;this.gl=undefined;
  }
}

/** Preserve the geographic custom-layer API while both FUI destinations
 * use the actual FUI map scene instead of the earlier approximate shader. */
export class VectorMap3dLayer implements CustomLayerInterface{
  readonly id='administrative-geographic-3d';readonly type='custom' as const;readonly renderingMode='3d' as const;
  private implementation:LegacyVectorMap3dLayer|FuiMapSharedGlassLayer;
  private map?:MapLibreMap;private gl?:WebGL2RenderingContext;private active=true;private hovered='';
  constructor(private data:GeoFeatureCollection,private palette:VectorMapPalette,private surface:OverlaySurface='smooth-glass',
    private publish?:(d:OverlayDiagnostics)=>void,private skin?:FuiEarthSkinId,private quality:MapQuality='balanced'){this.implementation=this.create();}
  get diagnostics(){return this.implementation.diagnostics;}
  private create(){return this.surface!=='classic'
    ?new FuiMapSharedGlassLayer(this.data,this.palette,this.surface,this.publish,this.skin,this.quality)
    :new LegacyVectorMap3dLayer(this.data,this.palette,this.surface,this.publish);}
  setData(data:GeoFeatureCollection,navigationKey=''){this.data=data;this.implementation.setData(data,navigationKey);}
  setStyle(palette:VectorMapPalette,surface:OverlaySurface=this.surface,skin?:FuiEarthSkinId){
    const replace=(surface==='classic')!==(this.surface==='classic');
    this.palette=palette;this.surface=surface;this.skin=skin;
    if(replace){
      const navigationKey=this.diagnostics.navigationKey;
      if(this.map&&this.gl)this.implementation.onRemove(this.map,this.gl);
      this.implementation=this.create();this.diagnostics.navigationKey=navigationKey;
      if(this.map&&this.gl)this.implementation.onAdd(this.map,this.gl);
      this.implementation.setActive(this.active);this.implementation.setHovered(this.hovered);
    }else if(this.implementation instanceof FuiMapSharedGlassLayer)this.implementation.setStyle(palette,surface,skin);
    else this.implementation.setStyle(palette,surface);
  }
  setActive(active:boolean){this.active=active;this.implementation.setActive(active);}
  requestPreparationFrame(){this.implementation.requestPreparationFrame();}
  setQuality(quality:MapQuality){this.quality=quality;if(this.implementation instanceof FuiMapSharedGlassLayer)this.implementation.setQuality(quality);}
  setHovered(key:string){this.hovered=key;this.implementation.setHovered(key);}
  pick(point:{x:number;y:number}){return this.implementation.pick(point);}
  onAdd(map:MapLibreMap,gl:WebGL2RenderingContext){this.map=map;this.gl=gl;this.implementation.onAdd(map,gl);}
  render(gl:WebGL2RenderingContext,options:CustomRenderMethodInput){this.implementation.render(gl,options);}
  onRemove(map:MapLibreMap,gl:WebGL2RenderingContext){this.implementation.onRemove(map,gl);this.map=undefined;this.gl=undefined;}
}
