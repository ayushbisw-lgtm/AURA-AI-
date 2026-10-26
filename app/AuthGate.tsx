'use client';

import { FormEvent, useState } from 'react';
import type { PublicUser } from '@/lib/auth';
import { migrateLegacyChatHistory } from '@/lib/chat-history-store';
import { migrateLegacyAcademicData } from '@/lib/academic-store';

export default function AuthGate({ onAuthenticated }: { onAuthenticated: (user: PublicUser) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, name, email, password })
      });
      const data = await response.json();
      if (response.status === 202 && data.needsEmailConfirmation) {
        setNotice('Check your email to confirm your account, then sign in.');
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Could not sign in.');
      if (response.headers.get('X-AURA-Migrate-Legacy') === '1') {
        await Promise.allSettled([migrateLegacyChatHistory(data.user.id), migrateLegacyAcademicData(data.user.id)]);
      }
      onAuthenticated(data.user as PublicUser);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The account service is unavailable.');
    } finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-mark">A</span><div><strong>AURA</strong><small>PERSONAL AI</small></div></div>
      <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
      <h1>{mode === 'signin' ? 'Welcome back.' : 'Create your account.'}</h1>
      <p className="auth-intro">{mode === 'signin' ? 'Sign in to continue to your chats and academic workspace.' : 'Create a private account for your AURA workspace.'}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <label>Your name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>}
        <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 10 : 1} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />{mode === 'signup' && <small>Use at least 10 characters.</small>}</label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}<span>↗</span></button>
      </form>
      <p className="auth-switch">{mode === 'signin' ? 'New to AURA?' : 'Already have an account?'} <button onClick={() => { setError(''); setMode(mode === 'signin' ? 'signup' : 'signin'); }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
      <p className="auth-local-note">Your workspace is private to your account.</p>
    </section>
  </main>;
}
