'use client';

import { useEffect, useState } from 'react';

export type AuraState = 'idle' | 'thinking' | 'responding' | 'listening' | 'success' | 'error';

export function AuraCore({ state = 'idle', size = 'regular' }: { state?: AuraState; size?: 'small' | 'regular' | 'large' }) {
  return <span className={`aura-core aura-core-${size} aura-core-${state}`} role="img" aria-label={`AURA ${state}`} data-state={state}>
    <span className="aura-core-halo" aria-hidden="true"/>
    <span className="aura-core-orbit aura-core-orbit-one" aria-hidden="true"/>
    <span className="aura-core-orbit aura-core-orbit-two" aria-hidden="true"/>
    <span className="aura-core-sphere" aria-hidden="true">
      <span className="aura-core-surface"/>
      <span className="aura-core-mesh"/>
      <span className="aura-core-specular"/>
      <span className="aura-core-heart"/>
    </span>
  </span>;
}

export default function MotionFoundation() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div className={`ambient-scene ${visible ? 'is-visible' : ''}`} aria-hidden="true"><span className="ambient-bloom ambient-bloom-blue"/><span className="ambient-bloom ambient-bloom-violet"/><span className="ambient-particle particle-one"/><span className="ambient-particle particle-two"/><span className="ambient-particle particle-three"/><span className="ambient-grain"/></div>;
}
