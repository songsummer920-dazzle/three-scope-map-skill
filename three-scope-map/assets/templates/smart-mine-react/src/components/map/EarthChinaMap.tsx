// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import { useEffect, useRef } from 'react';
import {
  createEarthChinaMap,
  type EarthChinaMapMode,
} from './core/earthChinaMapCore';

export type { EarthChinaMapMode };

export default function EarthChinaMap({
  onModeChange,
}: {
  onModeChange?: (mode: EarthChinaMapMode) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const onModeChangeRef = useRef(onModeChange);
  onModeChangeRef.current = onModeChange;

  useEffect(() => {
    if (!mount.current) return;
    const instance = createEarthChinaMap(mount.current, {
      onModeChange: (mode) => onModeChangeRef.current?.(mode),
    });
    return () => instance.destroy();
  }, []);

  return <div ref={mount} className="earth-china-mount" />;
}
