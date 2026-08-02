// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
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
