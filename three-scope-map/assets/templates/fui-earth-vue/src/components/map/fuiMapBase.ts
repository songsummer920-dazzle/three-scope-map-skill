// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { type FuiEarthSkinId, type FuiHudPalette } from './fuiEarthTheme';
import {getFuiMapHudPalette,type FuiMapPaletteFamily} from './fuiMapMaterial';
import { FUI_MAP_HUD_LAYOUT as layout, type FuiMapPresentation } from './fuiMapPresentation';

const vertex = /* glsl */ `
  varying vec2 vGround;
  void main() {
    vGround = position.xy;
    gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`;
const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uGridMode;
  uniform float uOpacity;
  uniform float uVisibility;
  uniform vec3 uColor;
  varying vec2 vGround;
  void main() {
    float radius = length(vGround);
    float disc = 1.0-smoothstep(444.0,450.0,radius);
    if(disc<=0.0) discard;
    // A 3.8s outward sweep followed by 8.2s of quiet ground.
    float cycle = mod(max(uTime-1.2,0.0),12.0);
    float progress = clamp(cycle/3.8,0.0,1.0);
    float sweepVisible = (1.0-smoothstep(3.6,4.15,cycle))*smoothstep(.0,.18,cycle);
    float front = mix(0.0,454.0,progress);
    float delta = radius-front;
    float head = exp(-pow(delta/15.0,2.0));
    float trail = (1.0-smoothstep(-4.0,1.0,delta))*exp(-max(-delta,0.0)/48.0);
    vec2 p = vGround/21.0;
    vec2 lattice = vec2(1.0,1.732050808);
    vec2 a = mod(p,lattice)-.5*lattice;
    vec2 b = mod(p-.5*lattice,lattice)-.5*lattice;
    vec2 local = dot(a,a)<dot(b,b)?a:b;
    float edge = .5-max(abs(local.x),dot(abs(local),vec2(.5,.866025404)));
    float aa = max(fwidth(edge),.004);
    float hex = 1.0-smoothstep(.006,.006+aa,edge);
    vec2 grid = abs(fract(p-.5)-.5)/max(fwidth(p),vec2(.001));
    float wire = 1.0-smoothstep(.30,1.05,min(grid.x,grid.y));
    float pattern = mix(hex,wire,uGridMode);
    float alpha = (pattern*(head*.62+trail*.19)+head*.018)*disc*sweepVisible*uOpacity*uVisibility;
    if(alpha<.002) discard;
    gl_FragColor=vec4(uColor,alpha);
    #include <colorspace_fragment>
  }
`;

// Monoline international cardinal glyphs in a shared 14×14 design grid. These are
// real line geometry, so they remain crisp without font atlases or billboards.
const cardinalGlyphs = {
  N: [
    [[2,12.5],[2,1.5],[12,12.5],[12,1.5]],
  ],
  E: [
    [[2,1.5],[2,12.5]], [[2,1.5],[12,1.5]],
    [[2,7],[10,7]], [[2,12.5],[12,12.5]],
  ],
  S: [
    [[12,1.5],[4,1.5],[2,3.5],[2,5.2],[4,7],[10,7],[12,8.8],[12,10.5],[10,12.5],[2,12.5]],
  ],
  W: [
    [[1,1.5],[3.5,12.5],[7,6],[10.5,12.5],[13,1.5]],
  ],
} as const;

function createFuiMapCompass() {
  const radius=layout.outer+22;
  const glyphSize=26;
  const positions:number[]=[];
  // Geographic map-local axes: east is +x and north is +y. The same upright
  // glyph orientation is used on all four sides; no decorative rotor owns it.
  const headings=[['N',0,radius],['E',radius,0],['S',0,-radius],['W',-radius,0]] as const;
  for(const [label,x,y] of headings){
    for(const stroke of cardinalGlyphs[label]){
      for(let i=0;i<stroke.length-1;i++){
        for(const point of [stroke[i],stroke[i+1]]){
          positions.push(x+(point[0]-7)*glyphSize/14,y+(7-point[1])*glyphSize/14,.35);
        }
      }
    }
  }
  const geometry=new LineSegmentsGeometry();geometry.setPositions(positions);
  const material=new LineMaterial({
    linewidth:layout.width.mark,worldUnits:false,alphaToCoverage:true,
    transparent:true,opacity:.94,depthWrite:false,depthTest:true,
  });
  material.userData.fuiHudRole='mark';
  const compass=new LineSegments2(geometry,material);
  compass.name='fui-map-compass';compass.renderOrder=-4;
  return compass;
}

function createHudRotor(name:string,radius:number,arcs:ReadonlyArray<readonly[number,number]>,speed:number,role:keyof FuiHudPalette,width:number,opacity:number){
  const positions:number[]=[];
  for(const [from,to] of arcs){
    const start=from*Math.PI/180,end=to*Math.PI/180,count=Math.ceil((end-start)*radius/5);
    for(let i=0;i<count;i++){
      const a=start+(end-start)*i/count,b=start+(end-start)*(i+1)/count;
      positions.push(Math.sin(a)*radius,Math.cos(a)*radius,.2,Math.sin(b)*radius,Math.cos(b)*radius,.2);
    }
  }
  const geometry=new LineSegmentsGeometry();geometry.setPositions(positions);
  const material=new LineMaterial({linewidth:width,worldUnits:false,alphaToCoverage:false,transparent:true,opacity,depthWrite:false,depthTest:true});
  material.userData.fuiHudRole=role;
  const rotor=new LineSegments2(geometry,material);rotor.name=name;
  rotor.userData.fuiHudAngularSpeed=speed;rotor.renderOrder=-4;
  return rotor;
}

export function createFuiMapBase() {
  const group = new THREE.Group();
  group.name = 'fui-map-ground';
  group.position.z = 7; // Below the geographic glass foot at z=12.
  group.userData.fuiHudMotion=typeof window==='undefined'||!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layers = new Map<keyof FuiHudPalette, number[]>();
  const segment = (role: keyof FuiHudPalette, x1:number,y1:number,x2:number,y2:number) => {
    const points=layers.get(role)??[];points.push(x1,y1,0,x2,y2,0);layers.set(role,points);
  };
  const arc = (role:keyof FuiHudPalette,r:number,start:number,end:number) => {
    const count=Math.max(2,Math.ceil((end-start)*r/5));
    for(let i=0;i<count;i++){
      const a=start+(end-start)*i/count,b=start+(end-start)*(i+1)/count;
      segment(role,Math.sin(a)*r,Math.cos(a)*r,Math.sin(b)*r,Math.cos(b)*r);
    }
  };
  const radial = (role:keyof FuiHudPalette,angle:number,inner:number,outer:number) => {
    segment(role,Math.sin(angle)*inner,Math.cos(angle)*inner,Math.sin(angle)*outer,Math.cos(angle)*outer);
  };
  // One primary rail and a single fine graduation, matching the Earth HUD's
  // rhythm. Avoid stacking parallel full circles in the compressed perspective.
  for(let i=0;i<4;i++)arc('ring',layout.ring,(i*90+.55)*Math.PI/180,((i+1)*90-.55)*Math.PI/180);
  for(let i=0;i<180;i++){
    const angle=i*Math.PI/90;
    const role=i%15===0?'tickMajor':i%5===0?'tickMid':'tickMinor';
    const inner=role==='tickMajor'?layout.tickInner:role==='tickMid'?layout.tickMidInner:layout.tickMinorInner;
    radial(role,angle,inner,layout.tickOuter);
  }
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    // Twin rails with short outward shoulders: precise open brackets rather
    // than a single crosshair stroke piled over an unbroken circle.
    const basis=(radius:number,tangent:number):[number,number]=>[
      Math.sin(a)*radius+Math.cos(a)*tangent,
      Math.cos(a)*radius-Math.sin(a)*tangent,
    ];
    for(const side of [-1,1]){
      const p=basis(layout.ring-6,side*3.5),q=basis(layout.headingOuter+2,side*3.5);
      segment('mark',...p,...q);
      const shoulder=basis(layout.headingOuter+2,side*8);
      segment('mark',...q,...shoulder);
    }
    radial('tickMid',a,layout.outer-1,layout.outer+5);
  }
  // Separated fine cross axes; no globe reticles or dashboard labels on the ground.
  for(const sign of [-1,1]){
    segment('axis',sign*20,0,sign*436,0);segment('axis',0,sign*20,0,sign*436);
  }
  for(const [role,points] of layers){
    const widths:Partial<Record<keyof FuiHudPalette,number>>={...layout.width,outer:layout.width.segment,axis:.55};
    const geometry=new LineSegmentsGeometry();geometry.setPositions(points);
    const material=new LineMaterial({linewidth:widths[role]??layout.width.segment,worldUnits:false,alphaToCoverage:false,transparent:true,opacity:role==='axis'?.10:role==='tickMinor'?.64:role==='tickMid'?.82:role==='tickMajor'?.96:.90,depthWrite:false,depthTest:true});
    material.userData.fuiHudRole=role;
    const line=new LineSegments2(geometry,material);line.renderOrder=-5;group.add(line);
  }
  group.add(createFuiMapCompass());
  // Rotate each circular geometry BEFORE the parent's geographic ellipse scale.
  // Rotating the scaled base itself would make the instrument wobble off-axis.
  group.add(createHudRotor('fui-map-inner-rotor',466,[[12,46],[192,216]],-.065,'ring',.80,.72));
  group.add(createHudRotor('fui-map-outer-rotor',510,[[72,108],[252,272]],.040,'outer',.75,.66));
  const material=new THREE.ShaderMaterial({
    uniforms:{uVisibility:{value:1},uTime:{value:0},uGridMode:{value:0},uOpacity:{value:1},uColor:{value:new THREE.Color()}},
    vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:true,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  });
  material.userData.fuiOpacityUniform=true;
  material.userData.fuiGroundPulse=true;
  const pulse=new THREE.Mesh(new THREE.PlaneGeometry(900,900),material);
  pulse.name='fui-ground-pulse';pulse.position.z=-.5;pulse.renderOrder=-6;group.add(pulse);
  return group;
}

export function updateFuiMapBase(group: THREE.Group, skin:FuiEarthSkinId,presentation:FuiMapPresentation,time:number,visibility=1,waveEnabled=true,family:FuiMapPaletteFamily='shared') {
  const palette=getFuiMapHudPalette(skin,family);
  group.visible=presentation!=='standard'&&visibility>.001;
  // The wave clock can restart on a presentation change. Keep the rotors on
  // their own accumulated active time, without jumping after a hidden tab/stall.
  const now=performance.now()/1000,previous=group.userData.fuiHudLastUpdate as number|undefined;
  group.userData.fuiHudLastUpdate=now;
  group.userData.fuiHudMotionTime=(group.userData.fuiHudMotionTime??0)+
    (group.visible&&group.userData.fuiHudMotion?Math.min(.1,Math.max(0,now-(previous??now))):0);
  group.traverse(object=>{
    const speed=object.userData.fuiHudAngularSpeed as number|undefined;
    if(speed!==undefined)object.rotation.z=group.userData.fuiHudMotionTime*speed;
    if(object instanceof LineSegments2){
      const material=object.material as LineMaterial;
      const role=material.userData.fuiHudRole as keyof FuiHudPalette;
      if(role)material.color.set(role==='axis'?palette.ring:palette[role]).multiplyScalar(visibility);
    }
    if(object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial && object.material.userData.fuiGroundPulse){
      object.visible=waveEnabled;
      const u=object.material.uniforms;
      u.uVisibility.value=visibility;u.uTime.value=time;u.uGridMode.value=presentation==='textured-grid'?1:0;
      u.uColor.value.set(palette.ring);u.uOpacity.value=object.material.opacity;
    }
  });
}
