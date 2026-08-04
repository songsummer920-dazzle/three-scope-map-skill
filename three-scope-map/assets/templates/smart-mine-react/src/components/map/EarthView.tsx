// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 宋夏天Dazzle
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
import { useEffect, useRef } from 'react';
import { createEarthView, type EarthViewHandle } from './core/earthViewCore';

export default function EarthView({
  startIntro = true,
  onSceneReady,
  onIntroReady,
  onHandoffStart,
  onEnterChina,
}: {
  startIntro?: boolean;
  onSceneReady?: () => void;
  onIntroReady?: () => void;
  onHandoffStart?: () => void;
  onEnterChina?: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const instance = useRef<EarthViewHandle | null>(null);
  const callbacks = useRef({ onSceneReady, onIntroReady, onHandoffStart, onEnterChina });
  callbacks.current = { onSceneReady, onIntroReady, onHandoffStart, onEnterChina };
  const initialStartIntro = useRef(startIntro);

  useEffect(() => {
    if (!mount.current) return;
    instance.current = createEarthView(mount.current, {
      onSceneReady: () => callbacks.current.onSceneReady?.(),
      onIntroReady: () => callbacks.current.onIntroReady?.(),
      onHandoffStart: () => callbacks.current.onHandoffStart?.(),
      onEnterChina: () => callbacks.current.onEnterChina?.(),
    });
    instance.current.setStartIntro(initialStartIntro.current);
    return () => {
      instance.current?.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setStartIntro(startIntro);
  }, [startIntro]);

  return <div ref={mount} className="earth-mount" />;
}
