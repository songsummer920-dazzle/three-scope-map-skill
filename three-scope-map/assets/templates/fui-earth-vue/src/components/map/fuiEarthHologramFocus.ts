// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import type {Position} from '../../types/geo';

export const FUI_HOLOGRAM_FOCUS=Object.freeze({baseRadius:2,lift:.07,hoverLift:.015});

const degrees=Math.PI/180;
const samePosition=(a:Position,b:Position)=>{
  const longitudeDelta=((a[0]-b[0]+180)%360+360)%360-180;
  return Math.abs(longitudeDelta)<1e-9&&Math.abs(a[1]-b[1])<1e-9;
};
const radial=(longitude:number,latitude:number)=>{
  const lon=longitude*degrees,lat=latitude*degrees,across=Math.cos(lat);
  return [across*Math.cos(lon),Math.sin(lat),-across*Math.sin(lon)] as const;
};

// Country-union rings only: one closed strip per actual exterior/island.
// Attribute positions stay at the base sphere; shared uniforms lift the top
// wall vertices and upper edge together without regenerating either buffer.
export function createFuiHologramFocusGeometry(rings:Position[][],maxStepDegrees=.35){
  if(!Number.isFinite(maxStepDegrees)||maxStepDegrees<=0)throw new Error('Focus boundary step must be positive');
  const wallPositions:number[]=[],wallNormals:number[]=[],depths:number[]=[],indices:number[]=[],edgePositions:number[]=[];
  let ringCount=0,segments=0;
  for(const source of rings){
    const ring:Position[]=[];
    for(const [lon,lat] of source){
      if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
      const point:Position=[lon,lat];
      if(!ring.length||!samePosition(ring[ring.length-1],point))ring.push(point);
    }
    if(ring.length>1&&samePosition(ring[0],ring[ring.length-1]))ring.pop();
    if(ring.length<3)continue;
    const samples:Position[]=[];
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      let longitudeDelta=b[0]-a[0];
      while(longitudeDelta>180)longitudeDelta-=360;
      while(longitudeDelta< -180)longitudeDelta+=360;
      const latitudeDelta=b[1]-a[1];
      const steps=Math.max(1,Math.ceil(Math.hypot(longitudeDelta,latitudeDelta)/maxStepDegrees));
      for(let step=0;step<steps;step++){
        const t=step/steps;samples.push([a[0]+longitudeDelta*t,a[1]+latitudeDelta*t]);
      }
    }
    const start=wallPositions.length/3;
    const points=samples.map(([lon,lat])=>radial(lon,lat).map(value=>value*FUI_HOLOGRAM_FOCUS.baseRadius));
    // The union can arrive in either winding. Orient its side normals outwards
    // using the signed spherical area, without inserting any provincial walls.
    const area=new THREE.Vector3(),center=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),normal=new THREE.Vector3();
    for(let i=0;i<points.length;i++){
      a.fromArray(points[i]);b.fromArray(points[(i+1)%points.length]);
      area.add(normal.crossVectors(a,b));center.add(a);
    }
    const winding=area.dot(center)<0?-1:1;
    for(let i=0;i<points.length;i++){
      const p=points[i],previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
      a.fromArray(next).sub(b.fromArray(previous));b.fromArray(p);
      normal.crossVectors(a,b).normalize().multiplyScalar(winding);
      wallPositions.push(...p,...p);wallNormals.push(normal.x,normal.y,normal.z,normal.x,normal.y,normal.z);depths.push(0,1);
    }
    for(let i=0;i<points.length;i++){
      const next=(i+1)%points.length,bottom=start+i*2,top=bottom+1;
      const nextBottom=start+next*2,nextTop=nextBottom+1;
      indices.push(bottom,nextBottom,top,nextBottom,nextTop,top);
      edgePositions.push(...points[i],...points[next]);
    }
    ringCount++;segments+=points.length;
  }
  const wall=new THREE.BufferGeometry();
  wall.setAttribute('position',new THREE.Float32BufferAttribute(wallPositions,3));
  wall.setAttribute('aSideNormal',new THREE.Float32BufferAttribute(wallNormals,3));
  wall.setAttribute('aDepth',new THREE.Float32BufferAttribute(depths,1));wall.setIndex(indices);wall.computeBoundingSphere();
  const edge=new THREE.BufferGeometry();
  edge.setAttribute('position',new THREE.Float32BufferAttribute(edgePositions,3));
  edge.setAttribute('aDepth',new THREE.Float32BufferAttribute(new Float32Array(edgePositions.length/3).fill(1),1));
  edge.computeBoundingSphere();
  return{wall,edge,ringCount,segments};
}

const focusVertex=/*glsl*/`
  uniform float uFocusLift;
  uniform float uFocusHoverLift;
  uniform float uHover;
  uniform float uIntroReveal;
  attribute float aDepth;
  varying float vDepth;
  varying vec3 vWorldRadial;
  varying vec3 vWorldPosition;
  #if !defined(FUI_FOCUS_EDGE) && !defined(FUI_FOCUS_FOOT)
    attribute vec3 aSideNormal;
    varying vec3 vWorldSideNormal;
  #endif
  void main(){
    vec3 radial=normalize(position);
    float lift=(uFocusLift+uFocusHoverLift*clamp(uHover,0.0,1.0))*clamp(uIntroReveal,0.0,1.0);
    vec3 displaced=radial*(2.0+aDepth*lift);
    vec4 worldPosition=modelMatrix*vec4(displaced,1.0);
    vDepth=aDepth;vWorldRadial=normalize(mat3(modelMatrix)*radial);vWorldPosition=worldPosition.xyz;
    #if !defined(FUI_FOCUS_EDGE) && !defined(FUI_FOCUS_FOOT)
      vWorldSideNormal=normalize(mat3(modelMatrix)*aSideNormal);
    #endif
    gl_Position=projectionMatrix*viewMatrix*worldPosition;
  }
`;

const focusFragment=/*glsl*/`
  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform vec3 uLightDirection;
  uniform float uFade;
  uniform float uIntroReveal;
  uniform float uHover;
  varying float vDepth;
  varying vec3 vWorldRadial;
  varying vec3 vWorldPosition;
  #if !defined(FUI_FOCUS_EDGE) && !defined(FUI_FOCUS_FOOT)
    varying vec3 vWorldSideNormal;
  #endif
  void main(){
    vec3 radial=normalize(vWorldRadial);
    float facing=dot(radial,normalize(cameraPosition-vWorldPosition));
    float front=smoothstep(-.015,.12,facing);
    float key=max(dot(radial,normalize(uLightDirection)),0.0);
    float alpha;
    vec3 color;
    #ifdef FUI_FOCUS_FOOT
      // A dark chromatic hairline anchors the radial wall to the globe.
      // Normal blending gives a foot rather than another luminous outline.
      vec3 pigment=uColor/max(max(uColor.r,uColor.g),max(uColor.b,.0001));
      color=pigment*.006+vec3(.0008);
      alpha=.72*front;
    #elif defined(FUI_FOCUS_EDGE)
      color=mix(uColor,uCoreColor,.32)*(.58+.54*pow(key,.85));
      alpha=.80*front;
    #else
      // A joined optical side, not an additive strip: absorbing dark foot,
      // saturated glass body, then a narrow polished shoulder. Real boundary
      // normals give the shared key light and view a continuous response.
      vec3 pigment=uColor/max(max(uColor.r,uColor.g),max(uColor.b,.0001));
      vec3 core=uCoreColor/max(max(uCoreColor.r,uCoreColor.g),max(uCoreColor.b,.0001));
      vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
      vec3 sideNormal=normalize(vWorldSideNormal);
      // A far wall is hidden by the raised cover. Drawing/flipping it over the
      // coat makes the country look inset, despite its positive radial lift.
      float sideFacing=dot(sideNormal,viewDirection);
      if(sideFacing<=0.0)discard;
      vec3 lightDirection=normalize(uLightDirection);
      float sideKey=max(dot(sideNormal,lightDirection),0.0);
      float diffuse=.16+.84*sideKey;
      vec3 halfway=lightDirection+viewDirection;
      halfway*=inversesqrt(max(dot(halfway,halfway),.0001));
      float reflection=pow(max(dot(sideNormal,halfway),0.0),42.0);
      float fresnel=pow(1.0-clamp(abs(dot(sideNormal,viewDirection)),0.0,1.0),3.0);
      float depth=clamp(vDepth,0.0,1.0);
      float body=smoothstep(.01,.12,depth);
      float shoulder=smoothstep(.30,.86,depth);
      float polish=smoothstep(.93,.995,depth);
      vec3 absorbingFoot=pigment*.006+vec3(.0008);
      vec3 glassBody=pigment*(.065+.16*diffuse+.035*fresnel);
      color=mix(absorbingFoot,glassBody,body);
      color+=pigment*(.075+.12*diffuse)*shoulder*(1.0-.45*polish);
      color+=mix(pigment,core,.25)*polish*(.16+.20*diffuse+.65*reflection);
      color+=mix(pigment,core,.45)*reflection*(.035+.16*body);
      alpha=(.90-.17*body+.12*polish+.05*fresnel)*front;
      alpha*=smoothstep(0.0,.04,sideFacing);
    #endif
    alpha*=uFade*clamp(uIntroReveal,0.0,1.0)*(1.0+.10*clamp(uHover,0.0,1.0));
    if(alpha<.001)discard;
    gl_FragColor=vec4(color,alpha);
  }
`;

export function createFuiHologramFocusSides(rings:Position[][],uniforms:Record<string,THREE.IUniform>){
  const geometry=createFuiHologramFocusGeometry(rings);
  const makeMaterial=(kind:'wall'|'edge'|'foot'='wall')=>{
    const defines=kind==='edge'?{FUI_FOCUS_EDGE:1}:kind==='foot'?{FUI_FOCUS_FOOT:1}:{};
    const material=new THREE.ShaderMaterial({
      uniforms:{...uniforms},defines,vertexShader:focusVertex,fragmentShader:focusFragment,
      transparent:true,depthWrite:false,depthTest:false,side:THREE.DoubleSide,
      blending:kind==='edge'?THREE.AdditiveBlending:THREE.NormalBlending,
    });
    material.name=kind==='edge'?'hologram-China-upper-edge':kind==='foot'?'hologram-China-bottom-rim':'hologram-China-radial-wall';
    material.forceSinglePass=true;material.userData.introLayer='earth';return material;
  };
  const wallMaterial=makeMaterial(),edgeMaterial=makeMaterial('edge'),footMaterial=makeMaterial('foot');
  const wall=new THREE.Mesh(geometry.wall,wallMaterial);wall.name='hologram-China-radial-wall';wall.frustumCulled=false;wall.renderOrder=1.5;
  const edge=new THREE.LineSegments(geometry.edge,edgeMaterial);edge.name='hologram-China-upper-edge';edge.frustumCulled=false;edge.renderOrder=4;
  const footGeometry=geometry.edge.clone();
  footGeometry.setAttribute('aDepth',new THREE.Float32BufferAttribute(new Float32Array(geometry.edge.getAttribute('position').count),1));
  const foot=new THREE.LineSegments(footGeometry,footMaterial);foot.name='hologram-China-bottom-rim';foot.frustumCulled=false;foot.renderOrder=1;
  const group=new THREE.Group();group.name='hologram-China-thin-sides';group.add(wall,edge,foot);
  return{group,materials:[wallMaterial,edgeMaterial,footMaterial],diagnostics:{wallVertices:geometry.wall.getAttribute('position').count,edgeVertices:geometry.edge.getAttribute('position').count,footVertices:footGeometry.getAttribute('position').count}};
}
