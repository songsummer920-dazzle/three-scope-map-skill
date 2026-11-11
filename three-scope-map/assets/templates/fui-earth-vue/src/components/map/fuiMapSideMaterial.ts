// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';

export type FuiMapSideColors={
  accent:THREE.ColorRepresentation;
  sideMid:THREE.ColorRepresentation;
  sideBottom:THREE.ColorRepresentation;
};

// Shared native side material. The caller owns the palette, lift uniforms and
// material lifetime; this factory does not create a scene or renderer.
export function createFuiMapSideGradientMaterial(colors:FuiMapSideColors, alpha = 0.86, topZ = 44, bottomZ = 24) {
  const material=new THREE.ShaderMaterial({
    transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.NormalBlending,
    uniforms:{topColor:{value:new THREE.Color(colors.accent)},midColor:{value:new THREE.Color(colors.sideMid)},bottomColor:{value:new THREE.Color(colors.sideBottom)},alpha:{value:alpha},topZ:{value:topZ},bottomZ:{value:bottomZ},uOpacity:{value:1},uGlass:{value:0},uLift:{value:0},uSelection:{value:0}},
    vertexShader:`
      uniform float topZ;uniform float bottomZ;uniform float uLift;uniform float uGlass;
      varying float vDepth;varying vec3 vNormal;varying vec3 vEye;
      void main(){
        vDepth=clamp((position.z-bottomZ)/max(.001,topZ-bottomZ),0.0,1.0);
        vec3 stretched=position;
        stretched.z=uGlass>.5?12.0+vDepth*32.0-uLift*(1.0-vDepth):position.z-uLift*(1.0-vDepth);
        vec4 view=modelViewMatrix*vec4(stretched,1.0);
        vec3 stretchedNormal=normal;stretchedNormal.z/=(uGlass>.5?1.6:1.0)+uLift/20.0;
        vNormal=normalize(normalMatrix*stretchedNormal);vEye=-view.xyz;
        gl_Position=projectionMatrix*view;
      }
    `,
    fragmentShader:`
      uniform vec3 topColor;uniform vec3 midColor;uniform vec3 bottomColor;
      uniform float alpha;uniform float uOpacity;uniform float uGlass;uniform float uSelection;
      varying float vDepth;varying vec3 vNormal;varying vec3 vEye;
      void main(){
        vec3 lower=mix(bottomColor,midColor,smoothstep(0.0,.24,vDepth));
        vec3 color=mix(lower,topColor,smoothstep(.34,1.0,vDepth));
        float edgeGlow=smoothstep(.48,1.0,vDepth);
        gl_FragColor=vec4(color+edgeGlow*topColor*.24,alpha*(.46+vDepth*.54)*uOpacity);
        if(uGlass>.5){
          float fresnel=pow(1.0-abs(dot(normalize(vNormal),normalize(vEye))),3.0);
          // Smooth colored upper shoulder, deeper middle and translucent dark
          // foot: shared by all palettes, with no ribbed wall texture.
          vec3 body=mix(bottomColor,midColor,smoothstep(.04,.56,vDepth));
          body=mix(body,topColor,pow(smoothstep(.42,1.0,vDepth),1.6));
          // Color and light intensify smoothly toward the upper rim. Keep
          // white in the separate fine contour, not across the colored wall.
          float saturation=mix(.92,1.0,smoothstep(.20,.98,vDepth));
          body=mix(vec3(dot(body,vec3(.2126,.7152,.0722))),body,saturation);
          float rimApproach=pow(smoothstep(.68,1.0,vDepth),1.35);
          float bevel=pow(smoothstep(.96,1.0,vDepth),3.0);
          body+=topColor*(rimApproach*.18+bevel*.18+fresnel*.04);
          body*=1.0+.30*uSelection;
          float peak=max(max(body.r,body.g),body.b);
          body*=min(1.0,.98/max(peak,.001));
          gl_FragColor=vec4(body,alpha*(.72+.26*vDepth+.02*fresnel)*uOpacity);
          #include <colorspace_fragment>
        }
      }
    `,
  });
  material.userData.fuiSide=true;material.userData.fuiOpacityUniform=true;
  return material;
}
