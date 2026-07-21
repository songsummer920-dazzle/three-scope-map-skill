<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div ref="host" class="earth-view" :class="{ 'is-transitioning': isTransitioning }" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { gsap } from 'gsap';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import chinaGeoJson from '../../assets/maps/china.json';
import type { GeoFeatureCollection, Position } from '../../types/geo';

// ThreeScopeMap attribution: 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Code-only attribution. Do not render it in the UI.

const emit = defineEmits<{
  'enter-china': [];
}>();

type PolygonRings = Position[][];

const host = ref<HTMLElement>();
const isTransitioning = ref(false);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const chinaCenter = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();

let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let controls: OrbitControls | undefined;
let resizeObserver: ResizeObserver | undefined;
let raf = 0;
let spinGroup: THREE.Group | undefined;
let globeOrientation: THREE.Group | undefined;
let chinaMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;
let chinaOutlineGroup: THREE.Group | undefined;
let transitionTimeline: gsap.core.Timeline | undefined;
let hoverTarget = 0;
let hoverValue = 0;

const animatedMaterials: THREE.ShaderMaterial[] = [];
const fadeMaterials: THREE.Material[] = [];

const earthVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const earthFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform vec3 uBaseColor;
  uniform vec3 uGridColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  float gridLine(float value, float count, float width) {
    float wave = abs(sin(value * 3.14159265 * count));
    return 1.0 - smoothstep(0.0, width, wave);
  }

  void main() {
    float longitude = gridLine(vUv.x, 36.0, 0.12);
    float latitude = gridLine(vUv.y, 18.0, 0.12);
    float grid = max(longitude, latitude);
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDirection)), 0.0), 2.4);
    float scanPosition = fract(uTime * 0.075);
    float scan = 1.0 - smoothstep(0.0, 0.055, abs(vUv.y - scanPosition));
    float micro = 0.5 + 0.5 * sin(vUv.x * 170.0 + vUv.y * 95.0 + uTime * 0.42);

    vec3 color = uBaseColor;
    color += uGridColor * grid * 0.56;
    color += uGridColor * scan * 1.05;
    color += uGridColor * fresnel * 0.68;
    color += uGridColor * micro * 0.035;
    float alpha = (0.34 + grid * 0.28 + scan * 0.24 + fresnel * 0.3) * uFade;
    gl_FragColor = vec4(color, alpha);
  }
`;

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDirection)), 3.0);
    gl_FragColor = vec4(uColor, fresnel * 0.56 * uFade);
  }
`;

const chinaVertexShader = /* glsl */ `
  varying float vFacing;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 radialNormal = normalize(mat3(modelMatrix) * normalize(position));
    vFacing = max(dot(radialNormal, normalize(cameraPosition - worldPosition.xyz)), 0.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const chinaFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uFade;
  uniform vec3 uColor;
  varying float vFacing;

  void main() {
    float breath = 0.5 + 0.5 * sin(uTime * 2.0);
    float strength = 0.66 + breath * 0.18 + uHover * 0.42;
    vec3 color = uColor * (1.0 + breath * 0.22 + uHover * 0.58);
    float alpha = strength * mix(0.76, 1.0, vFacing) * uFade;
    gl_FragColor = vec4(color, alpha);
  }
`;

function lonLatToVector3(lon: number, lat: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function getPolygonRings() {
  const polygons: PolygonRings[] = [];
  const features = (chinaGeoJson as unknown as GeoFeatureCollection).features;
  features.forEach((feature) => {
    const geometry = feature.geometry as unknown as {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: Position[][] | Position[][][];
    };
    if (geometry.type === 'Polygon') {
      polygons.push(geometry.coordinates as Position[][]);
      return;
    }
    (geometry.coordinates as Position[][][]).forEach((polygon) => polygons.push(polygon));
  });
  return polygons;
}

function createSphericalShapeGeometry(rings: PolygonRings, radius: number) {
  const outer = rings[0];
  if (!outer || outer.length < 3) return undefined;
  const shape = new THREE.Shape(outer.map(([lon, lat]) => new THREE.Vector2(lon, lat)));
  rings.slice(1).forEach((ring) => {
    if (ring.length < 3) return;
    shape.holes.push(new THREE.Path(ring.map(([lon, lat]) => new THREE.Vector2(lon, lat))));
  });

  const geometry = new THREE.ShapeGeometry(shape);
  const positions = geometry.getAttribute('position');
  const normals = new Float32Array(positions.count * 3);
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.copy(lonLatToVector3(positions.getX(index), positions.getY(index), radius));
    positions.setXYZ(index, point.x, point.y, point.z);
    point.normalize();
    normals[index * 3] = point.x;
    normals[index * 3 + 1] = point.y;
    normals[index * 3 + 2] = point.z;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function createChinaRegion(radius: number) {
  const polygons = getPolygonRings();
  const geometries = polygons
    .map((rings) => createSphericalShapeGeometry(rings, radius))
    .filter((geometry): geometry is THREE.ShapeGeometry => Boolean(geometry));
  const mergedGeometry = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHover: { value: 0 },
      uFade: { value: 1 },
      uColor: { value: new THREE.Color('#65f4d2') },
    },
    vertexShader: chinaVertexShader,
    fragmentShader: chinaFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  animatedMaterials.push(material);
  const mesh = new THREE.Mesh(mergedGeometry, material);
  mesh.renderOrder = 5;

  const outlineGroup = new THREE.Group();
  polygons.forEach((rings) => {
    rings.forEach((ring) => {
      if (ring.length < 2) return;
      const points = ring.map(([lon, lat]) => lonLatToVector3(lon, lat, radius + 0.018));
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const glowLine = new THREE.LineLoop(lineGeometry, new THREE.LineBasicMaterial({
        color: '#9dffe8',
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      glowLine.renderOrder = 6;
      outlineGroup.add(glowLine);
      fadeMaterials.push(glowLine.material);
    });
  });

  return { mesh, outlineGroup };
}

function createStars() {
  const count = 1300;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = THREE.MathUtils.randFloat(11, 34);
    const direction = new THREE.Vector3().randomDirection().multiplyScalar(radius);
    positions[index * 3] = direction.x;
    positions[index * 3 + 1] = direction.y;
    positions[index * 3 + 2] = direction.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#80d9cf',
    size: 0.025,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  fadeMaterials.push(material);
  return new THREE.Points(geometry, material);
}

function createEarthScene() {
  if (!scene) return;
  scene.add(createStars());

  spinGroup = new THREE.Group();
  globeOrientation = new THREE.Group();
  spinGroup.add(globeOrientation);
  scene.add(spinGroup);

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 1 },
      uBaseColor: { value: new THREE.Color('#031a1d') },
      uGridColor: { value: new THREE.Color('#59ead1') },
    },
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  animatedMaterials.push(earthMaterial);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(2, 128, 96), earthMaterial);
  globeOrientation.add(earth);

  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: '#4cd9c4',
    wireframe: true,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  fadeMaterials.push(wireframeMaterial);
  globeOrientation.add(new THREE.Mesh(new THREE.SphereGeometry(2.025, 48, 32), wireframeMaterial));

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#63f5da') },
      uFade: { value: 1 },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  animatedMaterials.push(atmosphereMaterial);
  globeOrientation.add(new THREE.Mesh(new THREE.SphereGeometry(2.19, 96, 64), atmosphereMaterial));

  const china = createChinaRegion(2.045);
  chinaMesh = china.mesh;
  chinaOutlineGroup = china.outlineGroup;
  globeOrientation.add(chinaMesh, chinaOutlineGroup);

  const chinaDirection = lonLatToVector3(104.2, 35.7, 1).normalize();
  const displayDirection = new THREE.Vector3(0.12, 0.08, 1).normalize();
  globeOrientation.quaternion.setFromUnitVectors(chinaDirection, displayDirection);
}

function updatePointer(event: PointerEvent) {
  if (!renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function hitChina(event: PointerEvent) {
  if (!camera || !chinaMesh) return false;
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(chinaMesh, false).length > 0;
}

function onPointerMove(event: PointerEvent) {
  if (isTransitioning.value) return;
  hoverTarget = hitChina(event) ? 1 : 0;
  if (renderer?.domElement) renderer.domElement.style.cursor = hoverTarget ? 'pointer' : 'grab';
}

function onPointerLeave() {
  hoverTarget = 0;
  if (renderer?.domElement) renderer.domElement.style.cursor = 'grab';
}

function enterChina(event: PointerEvent) {
  const hostElement = host.value;
  if (isTransitioning.value || !hostElement || !hitChina(event) || !camera || !spinGroup || !globeOrientation) return;
  isTransitioning.value = true;
  controls?.saveState();
  if (controls) controls.enabled = false;
  hoverTarget = 1;

  chinaCenter.copy(lonLatToVector3(104.2, 35.7, 2.045));
  globeOrientation.localToWorld(chinaCenter);
  const flightDirection = chinaCenter.clone().normalize();
  const flightEnd = flightDirection.multiplyScalar(3.05);
  const lookTarget = chinaCenter.clone().multiplyScalar(0.74);
  const startTarget = cameraTarget.clone();
  const targetProgress = { value: 0 };

  transitionTimeline?.kill();
  transitionTimeline = gsap.timeline({
    defaults: { ease: 'power3.inOut' },
    onComplete: () => emit('enter-china'),
  });
  transitionTimeline
    .to(camera.position, {
      x: flightEnd.x,
      y: flightEnd.y,
      z: flightEnd.z,
      duration: 2.6,
      onUpdate: () => camera?.lookAt(cameraTarget),
    }, 0)
    .to(targetProgress, {
      value: 1,
      duration: 2.3,
      onUpdate: () => cameraTarget.lerpVectors(startTarget, lookTarget, targetProgress.value),
    }, 0)
    .to(spinGroup.scale, { x: 1.72, y: 1.72, z: 1.72, duration: 2.6 }, 0)
    .to(animatedMaterials.map((material) => material.uniforms.uFade), {
      value: 0,
      duration: 0.72,
      stagger: 0.025,
    }, 1.86)
    .to(fadeMaterials, { opacity: 0, duration: 0.68, stagger: 0.012 }, 1.9)
    .to(hostElement, { opacity: 0, duration: 0.5 }, 2.08);
}

function resize() {
  if (!host.value || !camera || !renderer) return;
  const width = Math.max(host.value.clientWidth, 1);
  const height = Math.max(host.value.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function animate() {
  raf = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  const elapsed = clock.getElapsedTime();
  const delta = Math.min(clock.getDelta(), 0.05);
  animatedMaterials.forEach((material) => {
    if (material.uniforms.uTime) material.uniforms.uTime.value = elapsed;
  });
  hoverValue = THREE.MathUtils.damp(hoverValue, hoverTarget, 7, delta);
  if (chinaMesh) chinaMesh.material.uniforms.uHover.value = hoverValue;
  if (chinaOutlineGroup) {
    chinaOutlineGroup.children.forEach((child) => {
      const material = (child as THREE.Line).material as THREE.LineBasicMaterial;
      material.opacity = (0.58 + hoverValue * 0.36) * (0.88 + Math.sin(elapsed * 2) * 0.12);
    });
  }
  if (spinGroup && !isTransitioning.value && !hoverTarget) spinGroup.rotation.y += delta * 0.035;
  controls?.update();
  renderer.render(scene, camera);
}

function setup() {
  if (!host.value) return;
  const width = Math.max(host.value.clientWidth, 1);
  const height = Math.max(host.value.clientHeight, 1);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#01070a');
  scene.fog = new THREE.FogExp2('#01070a', 0.027);

  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(0, 0.15, 6.75);
  cameraTarget.set(0, 0, 0);
  camera.lookAt(cameraTarget);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  host.value.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 4.6;
  controls.maxDistance = 9;
  controls.rotateSpeed = 0.38;
  controls.target.copy(cameraTarget);

  createEarthScene();
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('pointerdown', enterChina);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host.value);
  animate();
}

onMounted(setup);

onBeforeUnmount(() => {
  transitionTimeline?.kill();
  cancelAnimationFrame(raf);
  resizeObserver?.disconnect();
  controls?.dispose();
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
    renderer.domElement.removeEventListener('pointerdown', enterChina);
  }
  if (scene) disposeObject(scene);
  renderer?.dispose();
  renderer?.domElement.remove();
  animatedMaterials.length = 0;
  fadeMaterials.length = 0;
});
</script>

<style scoped>
.earth-view {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 48%, rgba(39, 138, 128, 0.12), transparent 31%),
    #01070a;
  opacity: 1;
  pointer-events: auto;
  animation: earth-view-in 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.earth-view::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(rgba(76, 217, 196, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(76, 217, 196, 0.018) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at center, black, transparent 72%);
}

.earth-view :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}

.earth-view.is-transitioning {
  pointer-events: none;
}

@keyframes earth-view-in {
  from {
    opacity: 0;
    transform: scale(0.94);
    filter: blur(10px);
  }

  to {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
}
</style>
