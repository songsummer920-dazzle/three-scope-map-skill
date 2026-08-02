# ThreeScopeMap Component Template

Use this as the structural template for a reusable Three.js map that can switch between world, country, province, city, and district scopes, including click drilldown.

## Core API

The renderer lives in the framework-agnostic core (`assets/templates/map-core/core/`), shared by both the Vue and React templates. Each factory function mounts into a container element and returns a handle with `destroy()`:

```ts
// map-core/core/scopeMapCore.ts
export type ScopeMapHandle = {
  readonly element: HTMLElement;
  setActive(value: boolean): void;
  destroy(): void;
};
export function createScopeMap(
  container: HTMLElement,
  opts?: { active?: boolean; onReady?(): void },
): ScopeMapHandle;

// map-core/core/earthViewCore.ts
export type EarthViewHandle = {
  readonly element: HTMLElement;
  setStartIntro(value: boolean): void;
  destroy(): void;
};
export function createEarthView(
  container: HTMLElement,
  opts?: {
    onSceneReady?(): void;
    onIntroReady?(): void;
    onHandoffStart?(): void;
    onEnterChina?(): void;
  },
): EarthViewHandle;

// map-core/core/earthChinaMapCore.ts
export type EarthChinaMapMode = 'earth' | 'china';
export type EarthChinaMapHandle = { destroy(): void };
export function createEarthChinaMap(
  container: HTMLElement,
  opts?: { onModeChange?(mode: EarthChinaMapMode): void },
): EarthChinaMapHandle;
```

`createEarthChinaMap` internally owns `createEarthView` and lazy-loads `createScopeMap` (via a dynamic `import('./scopeMapCore')`) once the Earth scene reaches `scene-ready`, then coordinates the Earth-to-China handoff. All Three.js/GSAP resources are disposed in `destroy()`, including a `renderer?.forceContextLoss()` call, so a host component can safely mount and unmount the map repeatedly without exhausting WebGL context budget.

Never rebuild this rendering logic per-framework. Both shells below are thin adapters that call the same core functions.

## Vue Shell

```vue
<template>
  <div ref="host" class="map-mount" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createScopeMap, type ScopeMapHandle } from './core/scopeMapCore';

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const emit = defineEmits<{ ready: [] }>();

const host = ref<HTMLElement>();
let instance: ScopeMapHandle | undefined;

onMounted(() => {
  if (!host.value) return;
  instance = createScopeMap(host.value, {
    active: props.active,
    onReady: () => emit('ready'),
  });
});

watch(() => props.active, (value) => instance?.setActive(value));

onBeforeUnmount(() => {
  instance?.destroy();
  instance = undefined;
});
</script>
```

This is the actual `smart-mine-vue/src/components/map/ChinaMap.vue` shell. `EarthView.vue` and `EarthChinaMap.vue` follow the same shape: mount the matching `create*` core function in `onMounted`, forward its callbacks to `emit`, and call `destroy()` in `onBeforeUnmount`.

## React Shell

```tsx
import { useEffect, useRef } from 'react';
import { createScopeMap, type ScopeMapHandle } from './core/scopeMapCore';

export default function ChinaMap({
  active = true,
  onReady,
}: {
  active?: boolean;
  onReady?: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const instance = useRef<ScopeMapHandle | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const initialActive = useRef(active);

  useEffect(() => {
    if (!mount.current) return;
    instance.current = createScopeMap(mount.current, {
      active: initialActive.current,
      onReady: () => onReadyRef.current?.(),
    });
    return () => {
      instance.current?.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setActive(active);
  }, [active]);

  return <div ref={mount} className="map-mount" />;
}
```

This is the actual `smart-mine-react/src/components/map/ChinaMap.tsx` shell. It mirrors the Vue shell exactly: mount once in an empty-dependency `useEffect`, store live callback props in a ref to avoid stale closures, and always destroy the instance in the cleanup function — this is what keeps React 18 StrictMode's mount/unmount/mount cycle from creating duplicate canvases or leaking a WebGL context.

## Implementation Notes

- Keep `scope` explicit inside the core; do not infer world/country/province/city/district from feature count alone in rendering code.
- Keep projection, camera, geometry scale, and texture config scope-aware.
- Dispose all Three.js resources (including `forceContextLoss()`) when a handle's `destroy()` runs.
- Keep labels and scatter points data-driven so old province points do not survive a country switch.
- For drilldown, the core keeps a drill stack internally and swaps GeoJSON, labels, scatter points, fly lines, terrain, and camera together on click.
- Only edit rendering logic in `assets/templates/map-core/`; run `python3 <skill>/scripts/sync_map_templates.py` afterward to propagate the change into both runnable templates.

## Next.js 接入

技能不提供 Next.js 模板。要在 Next.js App Router 里使用：

1. 把 `smart-mine-react/src/components/map/`、`src/types/`、`src/assets/`、`src/style.css` 复制进项目。
2. 地图组件必须只在客户端运行 —— Three.js 与 GSAP 都需要 `window`：

    ```tsx
    'use client';
    import dynamic from 'next/dynamic';

    const EarthChinaMap = dynamic(() => import('@/components/map/EarthChinaMap'), { ssr: false });

    export default function MapPage() {
      return <main className="map-page"><EarthChinaMap /></main>;
    }
    ```

3. 贴图与 GeoJSON 用 import 引入（如模板所做），不要改成 `/public` 下的裸路径 —— 核心依赖打包器把它们解析成带 hash 的 URL。
4. `src/style.css` 里的 `#app` 选择器要改成 Next.js 的根容器选择器（通常是 `body > div:first-child` 或你自己给 layout 加的 id）。
