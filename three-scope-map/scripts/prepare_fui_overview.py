#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
# 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
"""Crop native map overview texels without resampling packed DEM channels."""
import argparse,hashlib,json,math
from pathlib import Path
from PIL import Image

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('project',type=Path);args=parser.parse_args()
 folder=args.project/'src/assets/textures/map/world';bounds=[60,-10,150,65];records={}
 for kind,name in [('photograph','earth-photographic.jpg'),('relief','earth-relief.png')]:
  source=folder/name;image=Image.open(source);width,height=image.size;west,south,east,north=bounds
  box=[math.floor((west+180)/360*width),math.floor((90-north)/180*height),math.ceil((east+180)/360*width),math.ceil((90-south)/180*height)]
  crop=image.crop(box);target=folder/f'earth-map-{kind}.png';crop.save(target,optimize=True)
  # Packed RGBA is data: never composite, resize or quantize its channels.
  assert Image.open(target).tobytes()==image.crop(box).tobytes()
  x0,y0,x1,y1=box
  records[kind]={'source':name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'file':target.name,'pixel_box':box,'source_size':[width,height],'size':[x1-x0,y1-y0],'uv_bounds':[x0/width,1-y1/height,(x1-x0)/width,(y1-y0)/height],'pixel_verified':True}
 metadata={'geographic_bounds':bounds,'method':'Native pixel crop; no resampling or channel conversion. Photograph crop is lossless PNG of decoded source RGB.','textures':records}
 (folder/'earth-map-overview.json').write_text(json.dumps(metadata,indent=2)+'\n')
 print(json.dumps({k:{'full_pixels':v['source_size'][0]*v['source_size'][1],'map_pixels':v['size'][0]*v['size'][1],'size':v['size']} for k,v in records.items()},indent=2))
if __name__=='__main__':main()
