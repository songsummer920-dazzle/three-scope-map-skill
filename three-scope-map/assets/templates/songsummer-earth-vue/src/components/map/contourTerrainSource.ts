// SPDX-License-Identifier: LicenseRef-Summer-Platform-Restriction-1.0
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import type { TerrainRequest } from './contourTerrain.worker';
import type { ContourBundle } from './contourDataAdapter';

export function requestTerrain(request: TerrainRequest, signal?: AbortSignal): Promise<ContourBundle> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const worker = new Worker(new URL('./contourTerrain.worker.ts', import.meta.url), { type: 'module' });
    const clean = () => { worker.terminate(); signal?.removeEventListener('abort', cancel); clearTimeout(timeout); };
    const cancel = () => { clean(); reject(new DOMException('Aborted', 'AbortError')); };
    const timeout = setTimeout(() => { clean(); reject(new Error('真实高程加载超时，请检查网络后重试')); }, 60000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ bundle?: ContourBundle; error?: string }>) => {
      clean();
      if (data.bundle) resolve(data.bundle);
      else reject(new Error(data.error || '真实高程数据不可用'));
    };
    worker.onerror = event => { clean(); reject(new Error(event.message || '地形处理失败')); };
    // Vue navigation items can be proxies; only send the explicit scalar contract.
    try {
      worker.postMessage({ item: { scope: request.item.scope, code: request.item.code, regionName: request.item.regionName },
        bbox: [...request.bbox], referenceBbox: [...request.referenceBbox], tileUrl: request.tileUrl });
    } catch (error) { clean(); reject(error); }
  });
}
