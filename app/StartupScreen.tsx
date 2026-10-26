'use client';

import { useEffect, useRef, useState } from 'react';
import ThinkingCompanion from './ThinkingCompanion';
import { getStartupIntroDelay, STARTUP_FADE_DURATION_MS } from '@/lib/startup-timing';

export default function StartupScreen({ ready, greeting, status, onComplete }: { ready: boolean; greeting: string; status: string; onComplete: () => void }) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const introStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (introStartedAt.current === null) introStartedAt.current = performance.now();
    if (!ready) {
      setExiting(false);
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setExiting(true);
      setVisible(false);
      onComplete();
      return;
    }

    const elapsed = performance.now() - introStartedAt.current;
    let exitTimer: number | undefined;
    const introTimer = window.setTimeout(() => {
      setExiting(true);
      exitTimer = window.setTimeout(() => {
        setVisible(false);
        onComplete();
      }, STARTUP_FADE_DURATION_MS);
    }, getStartupIntroDelay(elapsed, reducedMotion));
    return () => {
      window.clearTimeout(introTimer);
      if (exitTimer !== undefined) window.clearTimeout(exitTimer);
    };
  }, [ready, onComplete]);

  if (!visible) return null;

  return <div className={`startup-screen ${exiting ? 'is-ready' : ''}`} aria-busy={!ready}>
    <header className="startup-brand"><span className="startup-mark" aria-hidden="true">A</span><span className="startup-wordmark">AURA</span><span className="startup-brand-divider"/><span className="startup-label">YOUR PERSONAL AI</span></header>
    <main className="startup-center">
      <div className="startup-illustration"><ThinkingCompanion/></div>
      <section className="startup-copy" aria-label="AURA startup status">
        <p className="startup-greeting">{greeting}</p>
        <p className="startup-support">Getting everything ready for you...</p>
        <div className="startup-readiness"><span className="startup-indicator" aria-hidden="true"/><span role="status" aria-live="polite">{status}</span></div>
      </section>
    </main>
    <footer className="startup-footer">A little intelligence, a lot of possibility.</footer>
  </div>;
}
