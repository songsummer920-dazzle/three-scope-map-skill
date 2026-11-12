// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

export {};

// Real DEM is resampled in a worker; no geographic processing on pointer/frame handlers.
type Bounds=[number,number,number,number];
function tile(lon:number,lat:number,z:number){const n=2**z;const r=lat*Math.PI/180;return [(lon+180)/360*n,(1-Math.asinh(Math.tan(r))/Math.PI)/2*n];}
async function build(bbox:Bounds){
  const size=bbox[2]-bbox[0]>20?1536:1024;
  let zoom=Math.max(0,Math.min(14,Math.ceil(Math.log2(size*2*360/(256*(bbox[2]-bbox[0]))))));
  const extent=(z:number)=>{const a=tile(bbox[0],bbox[3],z),b=tile(bbox[2],bbox[1],z);return [Math.floor(a[0]),Math.floor(a[1]),Math.floor(b[0]),Math.floor(b[1])];};
  let limits=extent(zoom);
  while((limits[2]-limits[0]+1)*(limits[3]-limits[1]+1)>64&&zoom>0)limits=extent(--zoom);
  const keys:number[][]=[];const tiles=new Map<string,Uint8ClampedArray>();
  for(let y=limits[1];y<=limits[3];y++)for(let x=limits[0];x<=limits[2];x++)keys.push([x,y]);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(6,keys.length)},async()=>{
    while(cursor<keys.length){const [x,y]=keys[cursor++];
      const response=await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`,{signal:AbortSignal.timeout(18000)});
      if(!response.ok)throw new Error('DEM '+response.status);
      const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
      const context=new OffscreenCanvas(256,256).getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('DEM decoder unavailable');
      context.drawImage(bitmap,0,0);bitmap.close();tiles.set(`${x}/${y}`,context.getImageData(0,0,256,256).data);
    }
  }));
  const pixel=(x:number,y:number)=>{x=Math.max(limits[0]*256,Math.min((limits[2]+1)*256-1,x));y=Math.max(limits[1]*256,Math.min((limits[3]+1)*256-1,y));const rgba=tiles.get(`${Math.floor(x/256)}/${Math.floor(y/256)}`)!;const i=(y%256*256+x%256)*4;return rgba[i]*256+rgba[i+1]+rgba[i+2]/256-32768;};
  const heights=new Float32Array(size*size);
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
    // Output rows run south -> north, matching global geographic UV.
    const lat=bbox[1]+row/(size-1)*(bbox[3]-bbox[1]);
    const [tx,ty]=tile(bbox[0]+col/(size-1)*(bbox[2]-bbox[0]),lat,zoom);
    const px=tx*256,py=ty*256,x=Math.floor(px),y=Math.floor(py),u=px-x,v=py-y;
    heights[row*size+col]=(pixel(x,y)*(1-u)+pixel(x+1,y)*u)*(1-v)+(pixel(x,y+1)*(1-u)+pixel(x+1,y+1)*u)*v;
  }
  // Gentle 3x3 averaging prevents single-pixel DEM speckles becoming specular needles.
  const h=new Float32Array(heights.length);
  const at=(x:number,y:number)=>heights[Math.max(0,Math.min(size-1,y))*size+Math.max(0,Math.min(size-1,x))];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)h[y*size+x]=(at(x,y)*4+(at(x-1,y)+at(x+1,y)+at(x,y-1)+at(x,y+1))*2+at(x-1,y-1)+at(x+1,y-1)+at(x-1,y+1)+at(x+1,y+1))/16;
  const sample=(x:number,y:number)=>h[Math.max(0,Math.min(size-1,y))*size+Math.max(0,Math.min(size-1,x))];
  const bytes=new Uint8Array(size*size*4);
  const dy=(bbox[3]-bbox[1])*111320/(size-1);
  for(let y=0;y<size;y++){
    const dx=(bbox[2]-bbox[0])*111320*Math.cos((bbox[1]+y/(size-1)*(bbox[3]-bbox[1]))*Math.PI/180)/(size-1);
    for(let x=0;x<size;x++){
      // At country scale a kilometre of relief occupies only a few pixels.
      // Scale the cartographic exaggeration with real sampling distance, not skin.
      const exaggeration=3.5+Math.max(0,Math.min(6,Math.log2(Math.max(dx,dy)/90)))*1.25;
      const east=((sample(x+1,y)-sample(x-1,y))*.70+(sample(x+3,y)-sample(x-3,y))/3*.30)/(2*dx)*exaggeration;
      const north=((sample(x,y+1)-sample(x,y-1))*.70+(sample(x,y+3)-sample(x,y-3))/3*.30)/(2*dy)*exaggeration;
      const length=Math.hypot(east,north,1);const center=sample(x,y);
      const cavity=(sample(x-1,y)+sample(x+1,y)+sample(x,y-1)+sample(x,y+1))*.25-center;
      const i=(y*size+x)*4;
      bytes[i]=Math.round((-.5*east/length+.5)*255);bytes[i+1]=Math.round((-.5*north/length+.5)*255);
      bytes[i+2]=Math.round(Math.max(0,Math.min(1,center/9000))*255);
      bytes[i+3]=Math.round(Math.max(0,Math.min(1,.5-cavity*.003))*255);
    }
  }
  return {bytes,size,zoom};
}
self.onmessage=async({data}:MessageEvent<{bbox:Bounds}>)=>{try{const result=await build(data.bbox);self.postMessage(result);}catch(error){self.postMessage({error:String(error)});}};
