// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EarthResources,EarthResourceError,requiredEarthResources,type EarthFileId,type EarthImageLoader,type EarthResourceUrls} from '../src/components/map/fuiEarthResources';
import {EarthTimeline,LatestEarthRequest} from '../src/components/map/fuiEarthLifecycle';
import {FuiRendererJobs} from '../src/components/map/fuiRendererJobs';
import {FUI_EARTH_PRESENTATIONS,isFuiEarthPresentation,sampleHologramLand,hologramAtlasIndex,unwrapHologramRing,type HologramAtlas} from '../src/components/map/fuiEarthHologram';
import {createFuiHologramFocusGeometry,createFuiHologramFocusSides,FUI_HOLOGRAM_FOCUS} from '../src/components/map/fuiEarthHologramFocus';
import type {Position} from '../src/types/geo';
import {resolveFuiMapSurfaceVariant} from '../src/components/map/fuiMapPresentation';
const ids:EarthFileId[]=['height','chinaNormal','day','normal','specular','relief','photoRelief','photograph','clouds','lights','nightDetail','innerGlow','glassEdges'];
const urls=Object.fromEntries(ids.map(id=>[id,id])) as EarthResourceUrls;
const fakeImage=()=>({width:2,height:2,close(){}} as unknown as ImageBitmap);
const loader:EarthImageLoader=async()=>({image:fakeImage(),bitmap:true});
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('destination glass requires an explicit non-standard material request',()=>{
  assert.equal(resolveFuiMapSurfaceVariant(),'terrain');
  for(const requested of ['terrain','hologram-glass'] as const)
    for(const skin of ['original','amber','glacier','alert'] as const)
      for(const presentation of ['standard','textured-hex','textured-grid'] as const){
        const expected=requested==='hologram-glass'&&presentation!=='standard'?'hologram-glass':'terrain';
        assert.equal(resolveFuiMapSurfaceVariant(requested,skin,presentation),expected,`${requested}/${skin}/${presentation}`);
      }
});

test('reference first frame loads one surface source, not the deferred original day map',async()=>{
  const requests:string[]=[];const r=new EarthResources({urls,loadImage:async(url,options)=>{requests.push(url);return loader(url,options);}});
  r.addGenerated('contact',new THREE.Texture());await r.ensureFamily('reference');
  assert(requests.includes('photograph'));assert(!requests.includes('day'));assert(!requests.includes('normal'));
  assert(!requests.includes('glassEdges'),'Entity first frame requested the unused glass-edge atlas');assert(!requiredEarthResources('reference').includes('glassEdges'));
  const bindings=r.uniforms('globe');assert.equal(bindings.uPhotographicMap.value,r.get('photograph'));
  for(const {id,texture} of r.required('reference')){assert(texture.image||id==='contact');r.upload(id,{initTexture(){}});}
  assert(r.diagnostics().photograph.uploaded);r.dispose();
});
test('original and reference families reuse shared decoded resources',async()=>{
  const requests:string[]=[];const r=new EarthResources({urls,loadImage:async(url,options)=>{requests.push(url);return loader(url,options);}});
  await Promise.all([r.ensureFamily('reference'),r.ensureFamily('reference')]);await r.ensureFamily('original');
  assert(requests.includes('day'));assert(requests.includes('chinaNormal'));assert.equal(requests.filter(id=>id==='height').length,1);r.dispose();
});
test('required failure rejects the first-frame gate and cannot be marked uploaded',async()=>{
  const r=new EarthResources({urls,loadImage:async(url,options)=>{if(url==='photograph')throw new Error('404');return loader(url,options);}});
  await assert.rejects(r.ensureFamily('reference'),(error:unknown)=>error instanceof EarthResourceError&&error.id==='photograph');
  assert.equal(r.diagnostics().photograph.status,'error');assert.throws(()=>r.upload('photograph',{initTexture(){}}));r.dispose();
});
test('retry fetches the failed resource without rebuilding successful textures',async()=>{
  let fail=true;const requests:string[]=[];const r=new EarthResources({urls,loadImage:async(url,options)=>{requests.push(url);if(url==='photograph'&&fail)throw new Error('offline');return loader(url,options);}});
  await assert.rejects(r.ensureFamily('reference'));await new Promise(resolve=>setTimeout(resolve,0));const height=r.get('height');fail=false;await r.ensureFamily('reference');
  assert.equal(r.get('height'),height);assert.equal(requests.filter(id=>id==='height').length,1);assert.equal(requests.filter(id=>id==='photograph').length,2);r.dispose();
});
test('failed optional family does not invalidate the active family',async()=>{
  const r=new EarthResources({urls,loadImage:async(url,options)=>{if(url==='day')throw new Error('offline');return loader(url,options);}});
  await r.ensureFamily('reference');const photograph=r.get('photograph');await assert.rejects(r.ensureFamily('original'));await r.ensureFamily('reference');assert.equal(r.get('photograph'),photograph);r.dispose();
});
test('timeout rejects even a decoder that ignores abort, and closes late bitmaps',{timeout:1000},async()=>{
  const image=deferred<{image:ImageBitmap;bitmap:boolean}>();let closed=0;
  const r=new EarthResources({urls,timeoutMs:10,loadImage:async(url,options)=>url==='photograph'?image.promise:loader(url,options)});
  await assert.rejects(r.ensureFamily('reference'));image.resolve({image:{width:2,height:2,close(){closed++;}} as ImageBitmap,bitmap:true});
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(closed,1);r.dispose();
});
test('unmount cancels pending work and closes a late bitmap',{timeout:1000},async()=>{
  const image=deferred<{image:ImageBitmap;bitmap:boolean}>();let closed=0;
  const r=new EarthResources({urls,loadImage:async(url,options)=>url==='photograph'?image.promise:loader(url,options)});const ready=r.ensureFamily('reference');await Promise.resolve();r.dispose();
  await assert.rejects(ready);image.resolve({image:{width:2,height:2,close(){closed++;}} as ImageBitmap,bitmap:true});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(closed,1);
});
test('data edge fields retain their orientation/filter policy and sRGB imagery stays sRGB',()=>{
  const r=new EarthResources({urls});assert.equal(r.get('glassEdges').flipY,false);assert.equal(r.get('glassEdges').generateMipmaps,false);assert.equal(r.get('photograph').colorSpace,THREE.SRGBColorSpace);assert.equal(r.get('innerGlow').colorSpace,THREE.NoColorSpace);r.dispose();
});
test('latest rapid skin request wins even when an older family finishes last',async()=>{
  const q=new LatestEarthRequest<string>(),old=deferred<void>(),recent=deferred<void>(),commits:string[]=[];
  const a=q.run('original',()=>old.promise,v=>commits.push(v)),b=q.run('alert',()=>recent.promise,v=>commits.push(v));recent.resolve();await b;old.resolve();await a;assert.deepEqual(commits,['alert']);
});
test('a failed skin request preserves the previously committed skin',async()=>{
  const q=new LatestEarthRequest<string>();let skin='glacier';await assert.rejects(q.run('original',async()=>{throw new Error('404');},v=>{skin=v;}));assert.equal(skin,'glacier');
});
test('a stale failed request cannot roll back a newer successful skin',async()=>{
  const q=new LatestEarthRequest<string>(),old=deferred<void>();let skin='glacier';const a=q.run('original',()=>old.promise,v=>{skin=v;});await q.run('amber',async()=>{},v=>{skin=v;});old.reject(new Error('404'));await a;assert.equal(skin,'amber');
});
test('foreground stalls do not stretch the 4.2-second animation clock',()=>{
  const time=new EarthTimeline();time.tick(1000);time.tick(1016);time.tick(1600);assert.equal(time.tick(5200),4.2);
});
test('background or inactive time does not skip the preserved entrance',()=>{
  const time=new EarthTimeline();time.tick(1000);time.tick(2000);time.pause();time.tick(100000);assert.equal(time.tick(100500),1.5);
});
test('renderer/program disposal waits for outstanding shader polls',async()=>{
  const jobs=new FuiRendererJobs(),compiled=deferred<void>();let alive=true;
  const work=jobs.run(()=>compiled.promise.then(()=>{assert(alive,'Program owner was disposed mid-compile');}));
  const disposal=jobs.dispose(()=>{alive=false;});assert(alive);compiled.resolve();await work;await disposal;assert.equal(alive,false);
});
test('closing a renderer prevents new compilation and disposes once',async()=>{
  const jobs=new FuiRendererJobs();let started=false,disposed=0;
  await jobs.dispose(()=>disposed++);await assert.rejects(jobs.run(async()=>{started=true;}));await jobs.dispose(()=>disposed++);
  assert.equal(started,false);assert.equal(disposed,1);
});
test('shader submission observes the callers current target synchronously',async()=>{
  const jobs=new FuiRendererJobs();let target='linear',observed='';const work=jobs.run(async()=>{observed=target;});target='screen';await work;assert.equal(observed,'linear');
});

test('raised focus walls and top edge close the same resampled geographic ring',()=>{
  const open:Position[]=[[100,30],[102,30],[102,32],[100,32]];
  const clean=createFuiHologramFocusGeometry([open]);
  const duplicated=createFuiHologramFocusGeometry([[...open,open[0],[460,30]],[],[[1,2]]]);
  assert.equal(clean.ringCount,1);assert(clean.segments>open.length);
  assert.deepEqual(duplicated.wall.getAttribute('position').array,clean.wall.getAttribute('position').array);
  assert.deepEqual(duplicated.wall.index!.array,clean.wall.index!.array);
  const wall=clean.wall.getAttribute('position'),edge=clean.edge.getAttribute('position'),depth=clean.wall.getAttribute('aDepth');
  assert.equal(wall.count,clean.segments*2);assert.equal(edge.count,clean.segments*2);
  for(let i=0;i<clean.segments;i++){
    const next=(i+1)%clean.segments;
    assert.equal(depth.getX(i*2),0);assert.equal(depth.getX(i*2+1),1);
    for(let axis=0;axis<3;axis++){
      assert.equal(wall.getComponent(i*2,axis),wall.getComponent(i*2+1,axis));
      assert.equal(edge.getComponent(i*2,axis),wall.getComponent(i*2+1,axis));
      assert.equal(edge.getComponent(i*2+1,axis),wall.getComponent(next*2+1,axis));
    }
    assert.deepEqual(Array.from(clean.wall.index!.array.slice(i*6,i*6+6)),[i*2,next*2,i*2+1,next*2,next*2+1,i*2+1]);
  }
  for(const geometry of [clean.wall,clean.edge,duplicated.wall,duplicated.edge])geometry.dispose();
});

test('focus exterior islands stay separate and dateline edges use the short arc',()=>{
  const mainland:Position[]=[[100,30],[103,30],[103,33],[100,33]];
  const island:Position[]=[[179,12],[-179,12],[-179,13],[179,13],[179,12]];
  const geometry=createFuiHologramFocusGeometry([mainland,island]);
  assert.equal(geometry.ringCount,2);assert.equal(geometry.wall.index!.count,geometry.segments*6);
  const edge=geometry.edge.getAttribute('position'),wall=geometry.wall.getAttribute('position');
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(let i=0;i<edge.count;i+=2){
    a.fromBufferAttribute(edge,i);b.fromBufferAttribute(edge,i+1);
    assert(Math.abs(a.length()-2)<1e-6&&Math.abs(b.length()-2)<1e-6);
    assert(THREE.MathUtils.radToDeg(a.angleTo(b))<=.35005,'Exterior sampling bridged an island or crossed the long dateline arc');
  }
  const indices=geometry.wall.index!;
  for(let i=0;i<indices.count;i+=3){
    for(let j=0;j<3;j++){
      a.fromBufferAttribute(wall,indices.getX(i+j));b.fromBufferAttribute(wall,indices.getX(i+(j+1)%3));
      assert(THREE.MathUtils.radToDeg(a.angleTo(b))<=.35005,'A wall triangle crossed between separate exteriors');
    }
  }
  geometry.wall.dispose();geometry.edge.dispose();
});

test('focus optical side normals stay tangent to the sphere and face outward for either ring winding',()=>{
  const ring:Position[]=[[100,30],[102,30],[102,32],[100,32]];
  const forward=createFuiHologramFocusGeometry([ring],1),reverse=createFuiHologramFocusGeometry([[...ring].reverse()],1);
  const position=forward.wall.getAttribute('position'),normal=forward.wall.getAttribute('aSideNormal');
  const reversePosition=reverse.wall.getAttribute('position'),reverseNormal=reverse.wall.getAttribute('aSideNormal');
  const p=new THREE.Vector3(),n=new THREE.Vector3(),other=new THREE.Vector3(),otherNormal=new THREE.Vector3();
  for(let i=0;i<position.count;i+=2){
    p.fromBufferAttribute(position,i);n.fromBufferAttribute(normal,i);
    assert(Math.abs(n.length()-1)<1e-6,'Side normal is not normalized');
    assert(Math.abs(n.dot(p))<1e-6,'Side normal is not tangent to the sphere');
    otherNormal.fromBufferAttribute(normal,i+1);assert(n.equals(otherNormal),'Top and foot must share one continuous side normal');
    let matched=false;
    for(let j=0;j<reversePosition.count;j+=2){
      other.fromBufferAttribute(reversePosition,j);
      if(p.distanceToSquared(other)<1e-12){
        otherNormal.fromBufferAttribute(reverseNormal,j);
        assert(n.dot(otherNormal)>.999999,'Reversing an exterior turned the optical normal inward');matched=true;break;
      }
    }
    assert(matched,'Reversing an exterior changed its radial wall path');
    if(Math.abs(THREE.MathUtils.radToDeg(Math.asin(p.y/p.length()))-30)<1e-5&&Math.abs(THREE.MathUtils.radToDeg(Math.atan2(-p.z,p.x))-101)<1e-5){
      assert(n.y<0,'The south-facing coast normal must point outside the union');
    }
  }
  for(const geometry of [forward.wall,forward.edge,reverse.wall,reverse.edge])geometry.dispose();
});

test('focus side and upper edge retain the same live hover and entrance bindings',()=>{
  const uniforms:Record<string,THREE.IUniform>={
    uFocusLift:{value:FUI_HOLOGRAM_FOCUS.lift},uFocusHoverLift:{value:FUI_HOLOGRAM_FOCUS.hoverLift},
    uHover:{value:0},uIntroReveal:{value:1},uFade:{value:1},
    uColor:{value:new THREE.Color('#00bfff')},uCoreColor:{value:new THREE.Color('#e9f6ff')},uLightDirection:{value:new THREE.Vector3(-.68,.62,.31).normalize()},
  };
  const focus=createFuiHologramFocusSides([[[100,30],[102,30],[102,32],[100,32]]],uniforms);
  const geometryArrays=focus.group.children.map(child=>(child as THREE.Mesh).geometry.getAttribute('position').array);
  const foot=focus.group.getObjectByName('hologram-China-bottom-rim') as THREE.LineSegments;
  const upper=focus.group.getObjectByName('hologram-China-upper-edge') as THREE.LineSegments;
  const wall=focus.group.getObjectByName('hologram-China-radial-wall') as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  assert(foot&&upper,'The thin side needs both an anchored foot and a moving upper edge');
  assert.equal(wall.material.blending,THREE.NormalBlending,'The optical wall must absorb and reflect rather than add uniform neon');
  assert.deepEqual(foot.geometry.getAttribute('position').array,upper.geometry.getAttribute('position').array);
  assert(Array.from(foot.geometry.getAttribute('aDepth').array).every(depth=>depth===0),'Bottom rim must stay on the base sphere while the top rises');
  for(const material of focus.materials)for(const key of ['uHover','uFocusLift','uFocusHoverLift','uIntroReveal','uFade','uColor'])assert.equal(material.uniforms[key],uniforms[key]);
  uniforms.uHover.value=1;uniforms.uIntroReveal.value=.5;
  const raisedRadius=2+(uniforms.uFocusLift.value+uniforms.uFocusHoverLift.value)*uniforms.uIntroReveal.value;
  for(const child of focus.group.children){
    const drawable=child as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
    const depth=drawable.geometry.getAttribute('aDepth');
    for(let i=0;i<depth.count;i++){
      const radius=2+depth.getX(i)*(drawable.material.uniforms.uFocusLift.value+drawable.material.uniforms.uFocusHoverLift.value*drawable.material.uniforms.uHover.value)*drawable.material.uniforms.uIntroReveal.value;
      assert.equal(radius,depth.getX(i)===1?raisedRadius:2);
    }
  }
  focus.group.children.forEach((child,i)=>{
    assert.equal((child as THREE.Mesh).geometry.getAttribute('position').array,geometryArrays[i]);
    (child as THREE.Mesh).geometry.dispose();
  });focus.materials.forEach(material=>material.dispose());
});

// The geographic point cloud must remain spherical and never fill the sea.
test('hologram land sampling keeps geographic membership, China ownership and one radius',()=>{
  const atlas:HologramAtlas={width:72,height:36,land:new Uint8Array(72*36),china:new Uint8Array(72*36)};
  for(let y=8;y<21;y++)for(let x=38;x<59;x++){atlas.land[y*72+x]=1;if(x>48)atlas.china[y*72+x]=1;}
  const points=sampleHologramLand(atlas,16000);
  assert(points.count>400);assert.deepEqual(sampleHologramLand(atlas,16000),points);
  for(let i=0;i<points.count;i++){
    const [x,y,z]=points.positions.subarray(i*3,i*3+3),radius=Math.hypot(x,y,z);
    assert(Math.abs(radius-2)<.000001);
    const lon=Math.atan2(-z,x)*180/Math.PI,lat=Math.asin(y/radius)*180/Math.PI,index=hologramAtlasIndex(atlas,lon,lat);
    assert.equal(atlas.land[index],1,'A particle filled an ocean pixel');assert.equal(points.details[i*4+2],atlas.china[index]);
  }
});
test('an empty ocean creates zero particles and a complete mask produces equal spherical axes',()=>{
  const atlas:HologramAtlas={width:72,height:36,land:new Uint8Array(72*36),china:new Uint8Array(72*36)};
  assert.equal(sampleHologramLand(atlas,8000).count,0);atlas.land.fill(1);
  const points=sampleHologramLand(atlas,8000);assert(points.count>6000&&points.count<8000);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<points.positions.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],points.positions[i]);max[axis]=Math.max(max[axis],points.positions[i]);}
  const extents=max.map((n,i)=>n-min[i]);assert(Math.max(...extents)-Math.min(...extents)<.004,'Globe was stretched into an ellipsoid');
});
test('antimeridian polygons stay narrow and mask lookup wraps longitude without wrapping latitude',()=>{
  const ring=unwrapHologramRing([[179,10],[-179,10],[-178,15],[179,10]]);
  assert.deepEqual(ring.map(p=>p[0]),[179,181,182,179]);
  const atlas={width:360,height:180};assert.equal(hologramAtlasIndex(atlas,181,10),hologramAtlasIndex(atlas,-179,10));
  assert.equal(hologramAtlasIndex(atlas,0,100),180);assert.equal(hologramAtlasIndex(atlas,0,-100),179*360+180);
});

test('geographic emission structure brightens particles without moving or adding them',()=>{
  const atlas:HologramAtlas={width:72,height:36,land:new Uint8Array(72*36).fill(1),china:new Uint8Array(72*36),structure:new Uint8Array(72*36)};
  const quiet=sampleHologramLand(atlas,8000);atlas.structure!.fill(255);
  const structured=sampleHologramLand(atlas,8000);
  assert.deepEqual(structured.positions,quiet.positions);assert.equal(structured.count,quiet.count);
  let low=0,high=0;
  for(let i=0;i<quiet.count;i++){
    low+=quiet.details[i*4];high+=structured.details[i*4];
    assert.equal(structured.details[i*4+1],quiet.details[i*4+1],'Geographic emphasis enlarged the points');
    assert(Number.isFinite(structured.details[i*4])&&structured.details[i*4]<2.1,'Emission escaped the bounded material response');
  }
  assert(high>low*1.4,'Geographic structure had no meaningful emission response');
});

test('irregular spherical sampling avoids clumps and latitude scan rows',()=>{
  const atlas:HologramAtlas={width:72,height:36,land:new Uint8Array(72*36).fill(1),china:new Uint8Array(72*36)};
  const samples=sampleHologramLand(atlas,8000);let minimum2=Infinity,largeLatitudeSteps=0;
  for(let i=0;i<samples.count;i++){
    const p=i*3;
    if(i&&Math.abs(samples.positions[p+1]-samples.positions[p-2])>.25)largeLatitudeSteps++;
    for(let j=0;j<i;j++){
      const q=j*3,x=samples.positions[p]-samples.positions[q],y=samples.positions[p+1]-samples.positions[q+1],z=samples.positions[p+2]-samples.positions[q+2];
      minimum2=Math.min(minimum2,x*x+y*y+z*z);
    }
  }
  assert(minimum2>.03*.03,'Bright particles can collapse into the same local clump');
  assert(largeLatitudeSteps>samples.count*.6,'Point order retained the latitude rows of a spiral shell');
});

// Public style selection must distinguish the new regular patterns and reject typos.
test('Earth presentation selection exposes separate regular dots and honeycomb',()=>{
  assert.deepEqual(new Set(FUI_EARTH_PRESENTATIONS.map(item=>item.id)),new Set(['surface','hologram','hologram-hex']));
  for(const value of ['surface','hologram','hologram-hex'])assert(isFuiEarthPresentation(value));
  for(const value of ['hologram-hexx','hex','dots','',undefined,null,1])assert.equal(isFuiEarthPresentation(value),false);
});
