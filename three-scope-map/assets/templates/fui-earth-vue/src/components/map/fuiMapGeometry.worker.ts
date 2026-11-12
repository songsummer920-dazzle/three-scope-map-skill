// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.1
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import {prepareFuiMapGeometry,fuiMapGeometryTransfers,type FuiMapGeometryInput} from './fuiMapGeometry';
const scope=self as unknown as {onmessage:((event:MessageEvent<FuiMapGeometryInput>)=>void)|null;postMessage:(message:unknown,transfer:ArrayBuffer[])=>void};
scope.onmessage=event=>{
  try{const geometry=prepareFuiMapGeometry(event.data);scope.postMessage({geometry},fuiMapGeometryTransfers(geometry));}
  catch(error){scope.postMessage({error:error instanceof Error?error.message:String(error)},[]);}
};
