# Vue and native React integration

Preserve the framework of an existing project. New projects accept either framework; the generator keeps Vue as its backward-compatible default. Ask only when the target framework is genuinely unspecified and affects the delivery.

```bash
python3 <skill>/scripts/create_map_project.py <project> --preset fui --framework react
python3 <skill>/scripts/create_map_project.py <project> --preset classic --framework react
python3 <skill>/scripts/create_map_project.py <project> --preset fui --framework vue
```

The React output uses React, React DOM, TypeScript, and Vite. It contains native `.tsx` components and no Vue runtime, Vue compiler, SFC, iframe or Vue application mount. The canonical Three.js/MapLibre modules, geographic data, materials, workers, textures and legal bundle are reused. Native React source lives in `assets/react/{fui,classic}/`; the generator combines it with the selected family's shared assets. Do not copy that partial directory alone as a complete project.

## Component API

Vue callers keep their existing kebab-case props and emitted events. React callers use camelCase props and callback events, for example `primaryColor`, `earthPresentation`, `onReady`, `onModeChange`, `onNavigationChange`, `onSkinError`. The source `.vue` paths in the visual and renderer references correspond to `.tsx` paths in React projects. Keep each selected style family intact.

```tsx
import { useRef } from 'react';
import FuiEarth from './components/map/FuiEarth';

export default function MapPanel() {
  const map = useRef<any>(null);
  return <div style={{ position: 'relative', height: 720 }}>
    <FuiEarth ref={map} skin="amber" earthPresentation="surface"
      mapStyle="terrain-glass" mapWave="hex" primaryColor="#a75fff"
      onModeChange={mode => console.log(mode)} />
  </div>;
}
```

For a map-only FUI integration, use `ChinaMap` with `skin="amber"`, `mapPresentation="textured-hex"`, `surfaceVariant="terrain"`, and `showViewSwitch`. `FuiEarth initialMode="china"` also starts directly in the destination. Preserve the default `3D 地图 / 2D 地图 / 2D + 3D` selector, administrative navigation and Earth return where present.

React refs expose the same maintained operations as their Vue counterparts. `FuiEarth` exposes `retry`, `retrySkin`, `replayEntrance`, `enterChina`, `returnToEarth`, `syncNavigation`, `getNavigation`, `getMapDiagnostics`, and `getDiagnostics`. Map navigation methods remain asynchronous. Do not replace the renderer or recreate the scene on ordinary theme/active prop changes.

## Resource ownership

`mapRuntime.tsx` is a small framework-neutral state/lifecycle adapter for the imperative renderer bodies. React owns the DOM, event callbacks, component tree and context. It creates each renderer scope after commit, mounts after refs attach, subscribes through `useSyncExternalStore`, and disposes watchers plus the renderer's original cleanup on unmount. Three.js animation data stays outside React state. Preserve StrictMode support and the original exclusive animation-loop, async cancellation and Earth warm-up contracts.

These WebGL components are client components. In an SSR application, integrate them through its client-only boundary; provide a positioned host with nonzero dimensions. Do not access WebGL during server rendering or module evaluation.

## Maintenance and verification

The authoring script `scripts/sync_react_templates.mjs <installed-vue-template-project>` uses that project's TypeScript and Vue compiler packages **only to maintain source**. It emits native React JSX/CSS and preserves the renderer bodies. End users and generated React projects do not need those compilers. This is a converter for the bundled components, not a general Vue-to-React migration tool.

When changing a shared renderer body or its template, regenerate both native source families and validate them. `source-baselines.json` binds each generated React host to the exact canonical SFC; project generation rejects stale native source. Do not bypass that guard or silently generate a Vue bridge. Shared `.ts` helpers and data are copied directly from the selected canonical family.

Run the same strict 3D/2D project checks for Vue and React, then install dependencies and run the target build. Also inspect HTTP-served WebGL output in a headless browser: initial Earth, handoff, destination readiness, theme updates, hierarchical drilldown/back, view switching, resizing, unmount/remount under StrictMode, and browser errors. A build alone establishes neither visual parity nor correct resource ownership. Keep all checks in the background.
