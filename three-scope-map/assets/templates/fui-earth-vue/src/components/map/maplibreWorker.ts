// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill

// Vite must bundle MapLibre's worker and its shared module as one worker graph.
// Importing the published worker through `?url` copies only the entry module,
// which leaves vector-tile parsing unavailable at runtime.
// @ts-expect-error MapLibre publishes the worker runtime without a declaration file.
import MapLibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs';

// Referencing the export prevents Rollup from tree-shaking the worker entry as
// a side-effect-free empty chunk. The published module normally initializes
// itself; the guarded fallback also covers constrained embedded browsers whose
// WorkerGlobalScope detection is incomplete.
const workerScope = self as unknown as { worker?: unknown; MapLibreWorker?: unknown };
if (!workerScope.worker) workerScope.worker = new MapLibreWorker(self);
workerScope.MapLibreWorker = MapLibreWorker;
