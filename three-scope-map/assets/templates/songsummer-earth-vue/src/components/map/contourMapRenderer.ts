// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GeoFeature, GeoFeatureCollection, Position } from '../../types/geo';
import type { ContourBundle, ContourGrid } from './contourDataAdapter';
import type { ContourMapConfig } from './contourMapConfig';
import { resolveContourScopeStyle } from './contourMapConfig';
import { mapTheme } from './mapTheme';
import { createContourSurveyOverlay, type SurveyAnchor } from './contourSurveyOverlay';
import { centredBounds, isLocalTerrain, type TerrainBounds } from './contourTerrainMath';

export type ContourTerrainStats = {
  meshVertexCount: number;
  meshTriangleCount: number;
  contourFeatureCount: number;
  contourBbox: [number, number, number, number];
  surfaceBbox: [number, number, number, number];
  overscanSurface: boolean;
};

export type ContourCameraState = {
  position: [number, number, number];
  target: [number, number, number];
  canvasWidth: number;
  canvasHeight: number;
};

export type ContourTerrainRuntime = {
  setData: (bundle: ContourBundle, geoData: GeoFeatureCollection, preserveCamera?: boolean) => ContourTerrainStats;
  setActive: (active: boolean) => void;
  resize: () => void;
  render: () => void;
  resetView: () => void;
  pickCoordinate: (clientX: number, clientY: number) => Position | undefined;
  cameraState: () => ContourCameraState;
  dispose: () => void;
};

type TerrainProjection = {
  bbox: [number, number, number, number];
  centerLongitude: number;
  centerLatitude: number;
  longitudeCosine: number;
  horizontalScale: number;
  worldWidth: number;
  worldDepth: number;
  elevationScale: number;
};

type TerrainSurface = {
  metadata: {
    bbox: [number, number, number, number];
    elevationUnit: 'm' | 'relative';
    minElevation: number;
    maxElevation: number;
  };
  grid: ContourGrid;
};

type TerrainMeshOptions = {
  edgeFeather: number;
  name: string;
  polygonOffset?: boolean;
  local?: boolean;
  colorRange?: [number, number];
  surround?: TerrainSurface;
  survey?: { interval: number; majorEvery: number; drawLines: boolean };
};

type ResolvedContourScopeStyle = ReturnType<typeof resolveContourScopeStyle>;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp01((value - edge0) / Math.max(edge1 - edge0, Number.EPSILON));
  return progress * progress * (3 - 2 * progress);
}

function elevationColor(value: number, min: number, max: number) {
  const low = new THREE.Color(mapTheme.contour.lowElevation);
  const middle = new THREE.Color(mapTheme.contour.midElevation);
  const high = new THREE.Color(mapTheme.contour.highElevation);
  const progress = clamp01((value - min) / Math.max(max - min, Number.EPSILON));
  return progress < 0.56
    ? low.lerp(middle, progress / 0.56)
    : middle.lerp(high, (progress - 0.56) / 0.44);
}

function localElevationColor(value: number, min: number, max: number) {
  // Local terrain uses a cool-valley to sunlit-ridge ramp. Keeping the stops
  // theme-derived preserves recolouring without washing the relief toward grey.
  const stops = [
    new THREE.Color(mapTheme.contour.localValley),
    new THREE.Color(mapTheme.contour.localLow),
    new THREE.Color(mapTheme.contour.localMid),
    new THREE.Color(mapTheme.contour.localHigh),
    new THREE.Color(mapTheme.contour.localPeak),
  ];
  const breakpoints = [0, 0.24, 0.58, 0.86, 1];
  const progress = Math.pow(clamp01((value - min) / Math.max(max - min, 1)), 0.82);
  const upperIndex = breakpoints.findIndex((breakpoint) => progress <= breakpoint);
  const toIndex = Math.max(1, upperIndex < 0 ? stops.length - 1 : upperIndex);
  const fromIndex = toIndex - 1;
  return stops[fromIndex].lerp(
    stops[toIndex],
    smoothstep(breakpoints[fromIndex], breakpoints[toIndex], progress),
  );
}

function surveyElevationColor(value: number, min: number, max: number) {
  const stops = [
    new THREE.Color(mapTheme.contour.surveyLow),
    new THREE.Color(mapTheme.contour.surveyFoothill),
    new THREE.Color(mapTheme.contour.surveyMid),
    new THREE.Color(mapTheme.contour.surveyUpland),
    new THREE.Color(mapTheme.contour.surveyHigh),
    new THREE.Color(mapTheme.contour.surveyPeak),
  ];
  const breakpoints = [0, 0.18, 0.42, 0.68, 0.88, 1];
  const progress = Math.pow(clamp01((value - min) / Math.max(max - min, 1)), 0.9);
  const upperIndex = breakpoints.findIndex((breakpoint) => progress <= breakpoint);
  const toIndex = Math.max(1, upperIndex < 0 ? stops.length - 1 : upperIndex);
  const fromIndex = toIndex - 1;
  return stops[fromIndex].lerp(
    stops[toIndex],
    smoothstep(breakpoints[fromIndex], breakpoints[toIndex], progress),
  );
}

export function contourLegendGradient(local: boolean, survey = false) {
  const stops = Array.from({ length: 11 }, (_, i) =>
    `#${(survey ? surveyElevationColor : local ? localElevationColor : elevationColor)(i / 10, 0, 1).getHexString()} ${i * 10}%`);
  return `linear-gradient(90deg, ${stops.join(',')})`;
}

function sampleSurface(surface: TerrainSurface, lon: number, lat: number) {
  const [w, s, e, n] = surface.metadata.bbox;
  const { width, height, values } = surface.grid;
  const x = clamp01((lon - w) / (e - w)) * (width - 1);
  const y = clamp01((n - lat) / (n - s)) * (height - 1);
  const col = Math.min(width - 2, Math.floor(x)), row = Math.min(height - 2, Math.floor(y));
  const u = x - col, v = y - row, i = row * width + col;
  // Interpolate the same diagonal used by the indexed terrain triangles.
  return u + v <= 1 ? values[i] * (1 - u - v) + values[i + 1] * u + values[i + width] * v
    : values[i + 1] * (1 - v) + values[i + width] * (1 - u) + values[i + width + 1] * (u + v - 1);
}

function createEdgeFeatherTexture(feather: number) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const u = column / (size - 1);
      const v = row / (size - 1);
      const edgeDistance = Math.min(u, 1 - u, v, 1 - v);
      const alpha = Math.round(smoothstep(0, feather, edgeDistance) * 255);
      const offset = (row * size + column) * 4;
      data[offset] = alpha;
      data[offset + 1] = alpha;
      data[offset + 2] = alpha;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function projectionFor(
  bundle: ContourBundle,
  surface: TerrainSurface,
  config: ContourMapConfig,
  style: ResolvedContourScopeStyle,
): TerrainProjection {
  const [referenceMinLongitude, referenceMinLatitude, referenceMaxLongitude, referenceMaxLatitude] = bundle.referenceBbox ?? bundle.metadata.bbox;
  const [surfaceMinLongitude, surfaceMinLatitude, surfaceMaxLongitude, surfaceMaxLatitude] = surface.metadata.bbox;
  const centerLongitude = (referenceMinLongitude + referenceMaxLongitude) / 2;
  const centerLatitude = (referenceMinLatitude + referenceMaxLatitude) / 2;
  const longitudeCosine = Math.cos(centerLatitude * Math.PI / 180);
  const referenceLongitudeSpan = Math.max((referenceMaxLongitude - referenceMinLongitude) * longitudeCosine, 1e-6);
  const horizontalScale = config.terrain.width / referenceLongitudeSpan;
  return {
    bbox: surface.metadata.bbox,
    centerLongitude,
    centerLatitude,
    longitudeCosine,
    horizontalScale,
    worldWidth: (surfaceMaxLongitude - surfaceMinLongitude) * longitudeCosine * horizontalScale,
    worldDepth: (surfaceMaxLatitude - surfaceMinLatitude) * horizontalScale,
    elevationScale: style.elevationScale,
  };
}

function coordinateToWorld(
  projection: TerrainProjection,
  coordinate: Position,
  elevation: number,
  lift = 0,
) {
  return new THREE.Vector3(
    (coordinate[0] - projection.centerLongitude) * projection.longitudeCosine * projection.horizontalScale,
    elevation * projection.elevationScale + lift,
    (projection.centerLatitude - coordinate[1]) * projection.horizontalScale,
  );
}

function createTerrainMesh(
  surface: TerrainSurface,
  config: ContourMapConfig,
  projection: TerrainProjection,
  options: TerrainMeshOptions,
) {
  const { width, height, values } = surface.grid;
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = surface.metadata.bbox;
  const positions = new Float32Array(width * height * 3);
  const colors = new Float32Array(width * height * 3);
  const uvs = new Float32Array(width * height * 2);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const positionOffset = index * 3;
      const uvOffset = index * 2;
      const u = column / Math.max(width - 1, 1);
      const v = 1 - row / Math.max(height - 1, 1);
      let elevation = values[index];
      const lon = minLongitude + u * (maxLongitude - minLongitude);
      const lat = minLatitude + v * (maxLatitude - minLatitude);
      if (options.local && options.surround) {
        const blend = smoothstep(0, options.edgeFeather, Math.min(u, 1 - u, v, 1 - v));
        elevation = THREE.MathUtils.lerp(sampleSurface(options.surround, lon, lat), elevation, blend);
      }
      const color = (options.survey ? surveyElevationColor : options.local ? localElevationColor : elevationColor)(
        elevation,
        options.colorRange?.[0] ?? surface.metadata.minElevation,
        options.colorRange?.[1] ?? surface.metadata.maxElevation,
      );
      const worldPosition = coordinateToWorld(
        projection,
        [lon, lat],
        elevation,
      );
      positions[positionOffset] = worldPosition.x;
      positions[positionOffset + 1] = worldPosition.y;
      positions[positionOffset + 2] = worldPosition.z;
      colors[positionOffset] = color.r;
      colors[positionOffset + 1] = color.g;
      colors[positionOffset + 2] = color.b;
      uvs[uvOffset] = u;
      uvs[uvOffset + 1] = v;
    }
  }

  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < height - 1; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const topLeft = row * width + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + width;
      const bottomRight = bottomLeft + 1;
      indices[cursor++] = topLeft;
      indices[cursor++] = bottomLeft;
      indices[cursor++] = topRight;
      indices[cursor++] = topRight;
      indices[cursor++] = bottomLeft;
      indices[cursor++] = bottomRight;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: config.terrain.roughness,
    metalness: config.terrain.metalness,
    alphaMap: createEdgeFeatherTexture(options.edgeFeather),
    transparent: true,
    alphaTest: 0.025,
    side: THREE.DoubleSide,
    // The coarse surround must never hide higher-resolution valleys underneath it.
    depthWrite: !(options.local && options.name === 'contour-dem-overscan'),
    polygonOffset: Boolean(options.polygonOffset),
    polygonOffsetFactor: options.polygonOffset ? -1 : 0,
    polygonOffsetUnits: options.polygonOffset ? -1 : 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  if (options.survey) {
    material.roughness = 1;
    material.metalness = 0;
    if (options.survey.drawLines) {
      const { interval, majorEvery } = options.survey;
      // Contours are intersections of the rendered triangles with horizontal
      // elevation planes, so they cannot float above or fight the terrain depth.
      material.onBeforeCompile = shader => {
        shader.uniforms.surveyInterval = { value: interval };
        shader.uniforms.surveyMajorEvery = { value: majorEvery };
        shader.uniforms.surveyScale = { value: projection.elevationScale };
        shader.uniforms.surveyMinorColor = { value: new THREE.Color(mapTheme.contour.surveyMinorLine) };
        shader.uniforms.surveyMajorColor = { value: new THREE.Color(mapTheme.contour.surveyMajorLine) };
        shader.vertexShader = 'varying float vSurveyHeight; varying vec2 vSurveyUv; uniform float surveyScale;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurveyHeight = position.y / surveyScale; vSurveyUv = uv;');
        shader.fragmentShader = 'varying float vSurveyHeight; varying vec2 vSurveyUv; uniform float surveyInterval; uniform float surveyMajorEvery; uniform vec3 surveyMinorColor; uniform vec3 surveyMajorColor;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
          float level = vSurveyHeight / surveyInterval;
          float slopePresence = smoothstep(0.00001, 0.0001, fwidth(level));
          float derivative = max(fwidth(level), 0.00001);
          float minorDistance = abs(fract(level + 0.5) - 0.5) / derivative;
          float majorDistance = abs(fract(level / surveyMajorEvery + 0.5) - 0.5) * surveyMajorEvery / derivative;
          float minorInk = (1.0 - smoothstep(0.25, 1.05, minorDistance)) * slopePresence;
          float majorInk = (1.0 - smoothstep(0.55, 1.35, majorDistance)) * slopePresence;
          float edge = smoothstep(0.0, 0.05, min(min(vSurveyUv.x, 1.0-vSurveyUv.x), min(vSurveyUv.y, 1.0-vSurveyUv.y)));
          outgoingLight = mix(outgoingLight, surveyMinorColor, minorInk * edge * 0.72);
          outgoingLight = mix(outgoingLight, surveyMajorColor, majorInk * edge * 0.9);
          #include <opaque_fragment>
        `);
      };
      material.customProgramCacheKey = () => 'district-survey-contours-v2';
    }
  }
  mesh.name = options.name;
  mesh.receiveShadow = true;
  return mesh;
}

function createContourLines(
  bundle: ContourBundle,
  projection: TerrainProjection,
  style: ResolvedContourScopeStyle,
) {
  const minorPositions: number[] = [];
  const majorPositions: number[] = [];
  const minorOpacities: number[] = [];
  const majorOpacities: number[] = [];
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = bundle.metadata.bbox;
  const lineOpacityAt = ([longitude, latitude]: Position) => {
    const u = (longitude - minLongitude) / Math.max(maxLongitude - minLongitude, 1e-6);
    const v = (latitude - minLatitude) / Math.max(maxLatitude - minLatitude, 1e-6);
    return smoothstep(0, style.contourEdgeFeather, Math.min(u, 1 - u, v, 1 - v));
  };
  bundle.contours.forEach((line) => {
    const isSeaLevel = Math.abs(line.elevation) < 1e-6;
    const positions = line.major && !isSeaLevel ? majorPositions : minorPositions;
    const opacities = line.major && !isSeaLevel ? majorOpacities : minorOpacities;
    for (let index = 1; index < line.coordinates.length; index += 1) {
      const previousCoordinate = line.coordinates[index - 1];
      const currentCoordinate = line.coordinates[index];
      const previous = coordinateToWorld(projection, previousCoordinate, line.elevation, style.contourLift);
      const current = coordinateToWorld(projection, currentCoordinate, line.elevation, style.contourLift);
      positions.push(previous.x, previous.y, previous.z, current.x, current.y, current.z);
      opacities.push(lineOpacityAt(previousCoordinate), lineOpacityAt(currentCoordinate));
    }
  });

  const group = new THREE.Group();
  group.name = 'contour-lines';
  const addLines = (positions: number[], opacities: number[], color: string, opacity: number, name: string) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aOpacity', new THREE.Float32BufferAttribute(opacities, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
      vertexShader: `
        attribute float aOpacity;
        varying float vOpacity;
        void main() {
          vOpacity = aOpacity;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vOpacity;
        void main() {
          float alpha = uOpacity * vOpacity;
          if (alpha <= 0.01) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = name;
    lines.renderOrder = name.includes('major') ? 3 : 2;
    group.add(lines);
  };
  addLines(minorPositions, minorOpacities, style.lineStyle.minorColor, style.lineStyle.minorOpacity, 'minor-contours');
  addLines(majorPositions, majorOpacities, style.lineStyle.majorColor, style.lineStyle.majorOpacity, 'major-contours');
  return group;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const renderable = child as THREE.Mesh | THREE.LineSegments;
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    materials.filter(Boolean).forEach((material) => {
      const alphaMap = (material as THREE.MeshStandardMaterial).alphaMap;
      alphaMap?.dispose();
      material.dispose();
    });
  });
}

function featureName(feature: GeoFeature) {
  return String(feature.properties.fullname ?? feature.properties.name ?? '');
}

function featureCode(feature: GeoFeature) {
  return String(feature.properties.adcode ?? feature.properties.code ?? feature.properties.id ?? '');
}

function pointInRing(point: Position, ring: Position[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const verticalSpan = previousY - y;
    const crosses = (y > point[1]) !== (previousY > point[1])
      && point[0] < (previousX - x) * (point[1] - y) / (Math.abs(verticalSpan) < Number.EPSILON ? Number.EPSILON : verticalSpan) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Position, rings: Position[][]) {
  if (!rings[0] || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

export function findContourFeatureAtCoordinate(geoData: GeoFeatureCollection, coordinate: Position) {
  const feature = geoData.features.find((candidate) => {
    if (!featureName(candidate) || featureCode(candidate).endsWith('_JD')) return false;
    const polygons = candidate.geometry.type === 'Polygon'
      ? [candidate.geometry.coordinates as Position[][]]
      : candidate.geometry.coordinates as Position[][][];
    return polygons.some((polygon) => pointInPolygon(coordinate, polygon));
  });
  return feature ? { feature, name: featureName(feature), code: featureCode(feature) } : undefined;
}

export function createContourTerrainRenderer(
  container: HTMLElement,
  config: ContourMapConfig,
  onRender?: (state: ContourCameraState) => void,
  onViewChange?: (bbox: TerrainBounds) => void,
): ContourTerrainRuntime {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.environment.background);
  scene.fog = new THREE.FogExp2(config.environment.background, config.environment.fogDensity);

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, config.camera.near, config.camera.far);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.className = 'contour-terrain-canvas';
  renderer.domElement.setAttribute('aria-label', '可旋转的三维等高线高程地形');
  container.appendChild(renderer.domElement);
  const surveyOverlay = createContourSurveyOverlay(container);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.minDistance = config.camera.minDistance;
  controls.maxDistance = config.camera.maxDistance;
  controls.minPolarAngle = config.camera.minPolarAngle;
  controls.maxPolarAngle = config.camera.maxPolarAngle;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

  const ambientLight = new THREE.HemisphereLight(mapTheme.ambientLight, config.environment.ground, 1.45);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(mapTheme.directionalLight, 2.3);
  keyLight.position.set(-9, 15, 11);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(mapTheme.contour.midElevation, 0.85);
  rimLight.position.set(12, 7, -10);
  scene.add(rimLight);
  const fillLight = new THREE.DirectionalLight('#d9e4ef', 0);
  fillLight.position.set(-10, 8, -6);
  scene.add(fillLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: config.environment.ground, roughness: 1, metalness: 0 }),
  );
  ground.name = 'terrain-environment-ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  scene.add(ground);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let terrainRoot: THREE.Group | undefined;
  let terrainMesh: THREE.Mesh | undefined;
  let currentProjection: TerrainProjection | undefined;
  let currentBundle: ContourBundle | undefined;
  let local = false;
  let survey = false;
  let localTargetHeight = 0;
  let localColorRange: [number, number] | undefined;
  let resetting = false;
  const localInitialDistance = Math.hypot(14, 12);

  const cameraState = (): ContourCameraState => ({
    position: camera.position.toArray() as [number, number, number],
    target: controls.target.toArray() as [number, number, number],
    canvasWidth: renderer.domElement.width,
    canvasHeight: renderer.domElement.height,
  });

  const render = () => {
    renderer.render(scene, camera);
    surveyOverlay.update(camera, controls.target, currentProjection ? 111_320 / currentProjection.horizontalScale : 1,
      survey, position => {
        if (!currentBundle || !currentProjection) return true;
        // A bounded height-field visibility check avoids labels showing through hills.
        for (let i = 1; i < 40; i++) {
          const p = position.clone().lerp(camera.position, i / 40);
          const lon = currentProjection.centerLongitude + p.x / currentProjection.horizontalScale / currentProjection.longitudeCosine;
          const lat = currentProjection.centerLatitude - p.z / currentProjection.horizontalScale;
          const [w, s, e, n] = currentBundle.metadata.bbox;
          const source = lon >= w && lon <= e && lat >= s && lat <= n ? currentBundle : currentBundle.surface;
          if (source && sampleSurface(source, lon, lat) * currentProjection.elevationScale > p.y + 0.012) return true;
        }
        return false;
      });
    onRender?.(cameraState());
  };
  const renderAfterControlsChange = () => {
    if (resetting) { render(); return; }
    const bounds = local && currentBundle && currentProjection ? currentBundle.metadata.bbox : undefined;
    const west = bounds ? coordinateToWorld(currentProjection!, [bounds[0], bounds[3]], 0) : undefined;
    const east = bounds ? coordinateToWorld(currentProjection!, [bounds[2], bounds[1]], 0) : undefined;
    const clampedX = THREE.MathUtils.clamp(controls.target.x, west?.x ?? -config.camera.maxPanOffset, east?.x ?? config.camera.maxPanOffset);
    const clampedZ = THREE.MathUtils.clamp(controls.target.z, west?.z ?? -config.camera.maxPanOffset, east?.z ?? config.camera.maxPanOffset);
    camera.position.x += clampedX - controls.target.x;
    camera.position.z += clampedZ - controls.target.z;
    controls.target.x = clampedX;
    controls.target.z = clampedZ;
    render();
  };
  controls.addEventListener('change', renderAfterControlsChange);
  const requestVisibleTerrain = () => {
    if (!local || !currentBundle?.referenceBbox || !currentProjection) return;
    const reference = currentBundle.referenceBbox;
    const lon = currentProjection.centerLongitude + controls.target.x / currentProjection.horizontalScale / currentProjection.longitudeCosine;
    const lat = currentProjection.centerLatitude - controls.target.z / currentProjection.horizontalScale;
    const span = (reference[2] - reference[0]) * THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / localInitialDistance, 0.16, 2);
    const current = currentBundle.metadata.bbox;
    const ratio = span / (current[2] - current[0]);
    const offset = Math.max(Math.abs(lon - (current[0] + current[2]) / 2), Math.abs(lat - (current[1] + current[3]) / 2) / currentProjection.longitudeCosine);
    if (ratio < 0.72 || ratio > 1.4 || offset > (current[2] - current[0]) * 0.18)
      onViewChange?.(centredBounds(lon, lat, span));
  };
  controls.addEventListener('end', requestVisibleTerrain);

  const resize = () => {
    const bounds = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };

  const resetView = () => {
    resetting = true;
    if (local) {
      camera.position.set(survey ? 4.8 : 0, localTargetHeight + (survey ? 8.7 : 14), survey ? 14 : 12);
      controls.target.set(0, localTargetHeight, 0);
    } else {
      camera.position.fromArray(config.camera.position);
      controls.target.fromArray(config.camera.target);
    }
    controls.update();
    resetting = false;
    render();
    requestVisibleTerrain();
  };

  const setData = (bundle: ContourBundle, _geoData: GeoFeatureCollection, preserveCamera = false) => {
    if (terrainRoot) {
      scene.remove(terrainRoot);
      disposeObject(terrainRoot);
    }
    currentBundle = bundle;
    local = isLocalTerrain(bundle.metadata.scope);
    survey = bundle.metadata.scope === 'district';
    if (!preserveCamera) localColorRange = bundle.colorRange ?? [Math.min(0, bundle.metadata.minElevation), bundle.metadata.maxElevation];
    ambientLight.color.set(local ? mapTheme.contour.localAmbientLight : mapTheme.ambientLight);
    ambientLight.intensity = local ? 1.02 : 1.45;
    keyLight.color.set(local ? '#ffe7b5' : mapTheme.directionalLight);
    keyLight.intensity = local ? 1.94 : 2.3;
    rimLight.color.set(local ? mapTheme.contour.localRimLight : mapTheme.contour.midElevation);
    rimLight.intensity = local ? 0.68 : 0.85;
    fillLight.color.set(local ? mapTheme.contour.localFillLight : '#d9e4ef');
    fillLight.intensity = local ? 0.4 : 0;
    if (survey) {
      ambientLight.color.set('#91aca6'); ambientLight.intensity = 0.46;
      keyLight.color.set('#fff0cf'); keyLight.intensity = 3.35;
      rimLight.color.set('#79b9c1'); rimLight.intensity = 0.4;
      fillLight.color.set('#d39d5c'); fillLight.intensity = 0.16;
    }
    keyLight.position.set(survey ? -14 : -9, survey ? 11 : 15, survey ? -9 : 11);
    renderer.toneMappingExposure = survey ? 1.17 : 1.08;
    controls.minDistance = local ? 3.5 : config.camera.minDistance;
    controls.maxDistance = local ? 25 : config.camera.maxDistance;
    controls.maxPolarAngle = local ? 1.15 : config.camera.maxPolarAngle;
    const environmentColor = survey ? mapTheme.contour.surveyBackground : config.environment.background;
    (scene.background as THREE.Color).set(environmentColor);
    (scene.fog as THREE.FogExp2).color.set(environmentColor);
    (scene.fog as THREE.FogExp2).density = survey ? 0.0055 : local ? 0.0085 : config.environment.fogDensity;
    (ground.material as THREE.MeshStandardMaterial).color.set(
      survey ? mapTheme.contour.surveyBackground : config.environment.ground,
    );
    const surface: TerrainSurface = bundle.surface ?? bundle;
    const scopeStyle = resolveContourScopeStyle(
      config,
      bundle.metadata.scope,
      bundle.referenceBbox ?? bundle.metadata.bbox,
      bundle.metadata.elevationUnit,
    );
    currentProjection = projectionFor(bundle, surface, config, scopeStyle);
    terrainRoot = new THREE.Group();
    terrainRoot.name = 'contour-dem-root';
    if (bundle.surface) {
      const overscanMesh = createTerrainMesh(surface, config, currentProjection, {
        edgeFeather: config.terrain.edgeFeather,
        name: 'contour-dem-overscan',
        local,
        colorRange: local ? localColorRange : undefined,
        survey: survey ? { interval: bundle.metadata.interval, majorEvery: bundle.metadata.majorEvery, drawLines: false } : undefined,
      });
      overscanMesh.renderOrder = 0;
      terrainRoot.add(overscanMesh);
    }
    terrainMesh = createTerrainMesh(bundle, config, currentProjection, {
      edgeFeather: bundle.surface ? scopeStyle.detailEdgeFeather : config.terrain.edgeFeather,
      name: 'contour-dem-detail',
      polygonOffset: Boolean(bundle.surface) && !local,
      local,
      colorRange: local ? localColorRange : undefined,
      surround: bundle.surface,
      survey: survey ? { interval: bundle.metadata.interval, majorEvery: bundle.metadata.majorEvery, drawLines: true } : undefined,
    });
    terrainMesh.renderOrder = 1;
    terrainRoot.add(terrainMesh);
    if (!survey) terrainRoot.add(createContourLines(bundle, currentProjection, scopeStyle));
    const anchors: SurveyAnchor[] = [];
    if (survey) {
      const [w, s, e, n] = bundle.metadata.bbox;
      const byElevation = new Map<number, typeof bundle.contours>();
      bundle.contours.filter(line => line.major && line.coordinates.length > 20).forEach(line => {
        const paths = byElevation.get(line.elevation) ?? [];
        paths.push(line);
        byElevation.set(line.elevation, paths);
      });
      const majorPaths = [...byElevation.entries()].sort(([a], [b]) => a - b)
        .flatMap(([, paths]) => paths.sort((a, b) => b.coordinates.length - a.coordinates.length).slice(0, 2));
      for (const line of majorPaths) for (const fraction of [0.35, 0.7]) {
        const coordinate = line.coordinates[Math.floor((line.coordinates.length - 1) * fraction)];
        const u = (coordinate[0] - w) / (e - w), v = (coordinate[1] - s) / (n - s);
        if (Math.min(u, 1-u, v, 1-v) < scopeStyle.detailEdgeFeather) continue;
        anchors.push({ position: coordinateToWorld(currentProjection, coordinate, line.elevation, 0.006), elevation: line.elevation });
      }
    }
    surveyOverlay.set(anchors);
    scene.add(terrainRoot);
    const minTerrainY = surface.metadata.minElevation * currentProjection.elevationScale;
    ground.position.y = Math.min(-0.25, minTerrainY - 0.18);
    if (!preserveCamera) {
      localTargetHeight = sampleSurface(bundle, currentProjection.centerLongitude, currentProjection.centerLatitude) * currentProjection.elevationScale;
      resetView();
    } else render();
    return {
      meshVertexCount: surface.grid.width * surface.grid.height
        + (bundle.surface ? bundle.grid.width * bundle.grid.height : 0),
      meshTriangleCount: (surface.grid.width - 1) * (surface.grid.height - 1) * 2
        + (bundle.surface ? (bundle.grid.width - 1) * (bundle.grid.height - 1) * 2 : 0),
      contourFeatureCount: bundle.contours.length,
      contourBbox: [...bundle.metadata.bbox] as [number, number, number, number],
      surfaceBbox: [...surface.metadata.bbox] as [number, number, number, number],
      overscanSurface: Boolean(bundle.surface),
    };
  };

  const pickCoordinate = (clientX: number, clientY: number): Position | undefined => {
    if (!terrainMesh || !currentProjection || !currentBundle) return undefined;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      (clientX - bounds.left) / Math.max(bounds.width, 1) * 2 - 1,
      -((clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(terrainMesh, false)[0];
    if (!hit?.uv) return undefined;
    const [minLongitude, minLatitude, maxLongitude, maxLatitude] = currentBundle.metadata.bbox;
    return [
      minLongitude + hit.uv.x * (maxLongitude - minLongitude),
      minLatitude + hit.uv.y * (maxLatitude - minLatitude),
    ];
  };

  resetView();
  resize();
  return {
    setData,
    setActive: (active) => { controls.enabled = active; },
    resize,
    render,
    resetView,
    pickCoordinate,
    cameraState,
    dispose: () => {
      controls.removeEventListener('change', renderAfterControlsChange);
      controls.removeEventListener('end', requestVisibleTerrain);
      controls.dispose();
      if (terrainRoot) disposeObject(terrainRoot);
      disposeObject(ground);
      renderer.dispose();
      renderer.domElement.remove();
      surveyOverlay.dispose();
    },
  };
}
