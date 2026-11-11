// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import {inflateSync} from 'node:zlib';

// The browser baker exports non-interlaced RGBA8 PNGs. Decode actual pixels
// during every build, rather than trusting dimensions or a mutable manifest.
export function decodeRgbaPng(png){
  if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG signature');
  let width,height;const parts=[];
  for(let offset=8;offset+12<=png.length;){
    const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+length);
    if(offset+12+length>png.length)throw new Error('Truncated PNG');
    if(type==='IHDR'){
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      if(data[8]!==8||data[9]!==6||data[10]||data[11]||data[12])throw new Error('Cache requires non-interlaced RGBA8');
      if(!width||!height||width*height>16777216)throw new Error('Invalid cache dimensions');
    }
    if(type==='IDAT')parts.push(data);offset+=length+12;if(type==='IEND')break;
  }
  if(!width||!height||!parts.length)throw new Error('Missing PNG data');
  const raw=inflateSync(Buffer.concat(parts)),stride=width*4,rgba=Buffer.alloc(stride*height);
  if(raw.length!==(stride+1)*height)throw new Error('Invalid PNG raster length');
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const source=y*(stride+1),filter=raw[source];if(filter>4)throw new Error('Invalid PNG row filter');
    for(let x=0;x<stride;x++){
      const i=y*stride+x,a=x>=4?rgba[i-4]:0,b=y?rgba[i-stride]:0,c=y&&x>=4?rgba[i-stride-4]:0;
      const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);
      rgba[i]=(raw[source+1+x]+predictor)&255;
    }
  }
  return {width,height,rgba};
}
