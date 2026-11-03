'use client';

import { useEffect, useRef, useState } from 'react';
import { applyMotionPreferences, DEFAULT_MOTION_PREFERENCES, type MotionPreferences, normalizeMotionPreferences } from '@/lib/motion-preferences';
import { loadSetting, saveSetting } from '@/lib/personal-store';

const labels: { key: keyof Omit<MotionPreferences, 'intensity' | 'reducedMotion'>; title: string; detail: string }[] = [
  { key: 'backgroundAnimations', title: 'Ambient background', detail: 'Subtle blue and violet lighting behind the workspace.' },
  { key: 'interactiveCards', title: 'Interactive card effects', detail: 'Gentle hover lift and light on dashboard cards.' },
  { key: 'pageTransitions', title: 'Page transitions', detail: 'Soft entrances when moving between workspaces.' }
];

export default function MotionPreferencesPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [preferences, setPreferences] = useState<MotionPreferences>(DEFAULT_MOTION_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    let active = true;
    void loadSetting(userId, 'motionPreferences').then(value => {
      if (!active) return;
      setPreferences(normalizeMotionPreferences(value));
      setReady(true);
    }).catch(() => { if (active) { setPreferences(DEFAULT_MOTION_PREFERENCES); setReady(true); } });
    return () => { active = false; };
  }, [userId]);

  async function update(next: MotionPreferences) {
    setPreferences(next);
    setError('');
    applyMotionPreferences(next);
    try { await saveSetting(userId, 'motionPreferences', next); }
    catch { setError('Could not save this preference. Your current choice will apply until you leave this page.'); }
  }

  useEffect(() => {
    if (!ready) return;
    applyMotionPreferences(preferences);
  }, [ready, preferences]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? [])];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, []);

  return <div className="motion-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="motion-dialog" role="dialog" aria-modal="true" aria-labelledby="motion-title">
      <div className="motion-dialog-head"><div><span className="eyebrow">YOUR WORKSPACE</span><h2 id="motion-title">Motion preferences</h2></div><button autoFocus className="module-icon-button" onClick={onClose} aria-label="Close motion preferences">×</button></div>
      <p className="motion-dialog-intro">Choose how much movement AURA uses. Your settings are saved to your account.</p>
      {!ready ? <p className="motion-loading" role="status">Loading preferences…</p> : <>
        <fieldset className="motion-intensity"><legend>Animation intensity</legend>{(['reduced', 'balanced', 'rich'] as const).map(value => <button key={value} type="button" aria-pressed={preferences.intensity === value} className={preferences.intensity === value ? 'selected' : ''} onClick={() => void update({ ...preferences, intensity: value })}>{value[0].toUpperCase() + value.slice(1)}</button>)}</fieldset>
        <div className="motion-options">{labels.map(item => <label key={item.key} className="motion-option"><span><strong>{item.title}</strong><small>{item.detail}</small></span><input type="checkbox" checked={preferences[item.key]} onChange={event => void update({ ...preferences, [item.key]: event.target.checked })}/></label>)}</div>
        <label className="motion-option motion-reduced-option"><span><strong>Reduced motion</strong><small>Follow system preference by default, or always reduce movement.</small></span><select value={preferences.reducedMotion === null ? 'system' : String(preferences.reducedMotion)} onChange={event => void update({ ...preferences, reducedMotion: event.target.value === 'system' ? null : event.target.value === 'true' })}><option value="system">Follow system</option><option value="true">On</option><option value="false">Off</option></select></label>
      </>}
      {error && <p className="motion-error" role="alert">{error}</p>}
    </section>
  </div>;
}
