'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { PublicUser } from '@/lib/auth';
import { migrateLegacyChatHistory } from '@/lib/chat-history-store';
import { migrateLegacyAcademicData } from '@/lib/academic-store';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  applyRecoveryPassword,
  canResendRecoveryOtp,
  getPasswordValidationError,
  isValidRecoveryOtp,
  normalizeRecoveryEmail,
  normalizeRecoveryOtp,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RECOVERY_RESEND_COOLDOWN_MS,
  recoveryErrorMessage
} from '@/lib/password-recovery';

type AuthMode = 'signin' | 'signup' | 'recovery-email' | 'recovery-otp' | 'recovery-password' | 'recovery-success';

export default function AuthGate({ onAuthenticated }: { onAuthenticated: (user: PublicUser) => void }) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [otp, setOtp] = useState('');
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<'google' | 'github' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (mode !== 'recovery-otp' || resendAt === 0) return;
    const updateCountdown = () => setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [mode, resendAt]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('authError');
    if (result === 'cancelled') setError('Sign-in was cancelled. You can try again or use your email and password.');
    if (result === 'failed') setError('Social sign-in could not be completed. Please try again or use your email and password.');
    if (result === 'cancelled' || result === 'failed') {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);

  function clearFeedback() {
    setError('');
    setNotice('');
  }

  async function returnToSignIn() {
    if (recoveryVerified) {
      if (busy) return;
      setBusy(true);
      try {
        const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut({ scope: 'local' });
        if (signOutError) {
          setError('Could not close the recovery session. Please try again.');
          return;
        }
      } catch {
        setError('Could not close the recovery session. Please try again.');
        return;
      } finally { setBusy(false); }
    }
    clearFeedback();
    setPassword('');
    setPasswordConfirmation('');
    setOtp('');
    setRecoveryVerified(false);
    setResendAt(0);
    setMode('signin');
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    clearFeedback();
    setBusy(true);
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

  async function startOAuth(provider: 'google' | 'github') {
    if (busy) return;
    clearFeedback();
    setBusy(true);
    setOauthProvider(provider);
    try {
      const { error: oauthError } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: new URL('/auth/callback', window.location.origin).toString() }
      });
      if (oauthError) throw oauthError;
    } catch (reason) {
      const providerName = provider === 'google' ? 'Google' : 'GitHub';
      setError(reason instanceof Error && reason.name === 'SupabaseSetupError'
        ? reason.message
        : `${providerName} sign-in could not be started. Please try again or use your email and password.`);
      setBusy(false);
      setOauthProvider(null);
    }
  }

  async function sendRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    clearFeedback();
    const normalizedEmail = normalizeRecoveryEmail(email);
    if (!normalizedEmail) {
      setError('Enter a valid email address.');
      return;
    }
    setEmail(normalizedEmail);
    setBusy(true);
    try {
      const { error: requestError } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(normalizedEmail);
      if (requestError) throw requestError;
      setResendAt(Date.now() + RECOVERY_RESEND_COOLDOWN_MS);
      setOtp('');
      setMode('recovery-otp');
      setNotice('If an account exists for that email, a recovery code will arrive shortly.');
    } catch (reason) {
      setError(recoveryErrorMessage(reason, 'send'));
    } finally { setBusy(false); }
  }

  async function resendRecoveryCode() {
    if (busy || !canResendRecoveryOtp(resendAt)) return;
    clearFeedback();
    setBusy(true);
    try {
      const { error: requestError } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(email);
      if (requestError) throw requestError;
      setResendAt(Date.now() + RECOVERY_RESEND_COOLDOWN_MS);
      setNotice('If an account exists for that email, a new recovery code will arrive shortly.');
    } catch (reason) {
      setError(recoveryErrorMessage(reason, 'send'));
    } finally { setBusy(false); }
  }

  async function verifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    clearFeedback();
    const cleanOtp = normalizeRecoveryOtp(otp);
    if (!isValidRecoveryOtp(cleanOtp)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    try {
      const { data, error: verifyError } = await createSupabaseBrowserClient().auth.verifyOtp({
        email,
        token: cleanOtp,
        type: 'recovery'
      });
      if (verifyError) throw verifyError;
      if (!data.session || !data.user) throw new Error('Recovery verification did not create a session.');
      setRecoveryVerified(true);
      setMode('recovery-password');
      setNotice('Code verified. Choose a new password.');
    } catch (reason) {
      setError(recoveryErrorMessage(reason, 'verify'));
    } finally { setBusy(false); }
  }

  async function updateRecoveryPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    clearFeedback();
    const validationError = getPasswordValidationError(password, passwordConfirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await applyRecoveryPassword({
        recoveryVerified,
        password,
        confirmation: passwordConfirmation,
        updatePassword: async nextPassword => {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (!session) throw Object.assign(new Error('Recovery session is missing.'), { code: 'session_not_found' });
          const { error: updateError } = await supabase.auth.updateUser({ password: nextPassword });
          if (updateError) throw updateError;
        }
      });
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      setPassword('');
      setPasswordConfirmation('');
      setRecoveryVerified(Boolean(signOutError));
      setMode('recovery-success');
    } catch (reason) {
      setError(reason instanceof Error && /passwords do not match|between \d+ and \d+ characters|verify the recovery code/i.test(reason.message)
        ? reason.message
        : recoveryErrorMessage(reason, 'update'));
    } finally { setBusy(false); }
  }

  const title = mode === 'signup' ? 'Create your account.'
    : mode === 'recovery-email' ? 'Reset your password.'
      : mode === 'recovery-otp' ? 'Check your email.'
        : mode === 'recovery-password' ? 'Choose a new password.'
          : mode === 'recovery-success' ? 'Password updated.' : 'Welcome back.';
  const intro = mode === 'signup' ? 'Create a private account for your AURA workspace.'
    : mode === 'recovery-email' ? 'Enter the email address on your AURA account and we’ll send a recovery code.'
      : mode === 'recovery-otp' ? `Enter the 6-digit recovery code sent to ${email}.`
        : mode === 'recovery-password' ? 'Your code is verified. Set a new password for your account.'
          : mode === 'recovery-success' ? 'Your password has been changed. You can now sign in with it.'
            : 'Sign in to continue to your chats and academic workspace.';

  return <main className="auth-shell">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand"><span className="brand-mark">A</span><div><strong>AURA</strong><small>PERSONAL AI</small></div></div>
      <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
      <h1 id="auth-title">{title}</h1>
      <p className="auth-intro">{intro}</p>

      {mode === 'signin' || mode === 'signup' ? <form onSubmit={event => void submitAuth(event)} className="auth-form">
        {mode === 'signup' && <label>Your name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>}
        <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? PASSWORD_MIN_LENGTH : 1} maxLength={PASSWORD_MAX_LENGTH} value={password} onChange={event => setPassword(event.target.value)} />{mode === 'signup' && <small>Use at least {PASSWORD_MIN_LENGTH} characters.</small>}</label>
        {mode === 'signin' && <div className="auth-forgot-row"><button type="button" onClick={() => { clearFeedback(); setMode('recovery-email'); }}>Forgot password?</button></div>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}<span>↗</span></button>
      </form> : null}

      {mode === 'signin' || mode === 'signup' ? <div className="auth-oauth">
        <div className="auth-oauth-divider"><span>OR CONTINUE WITH</span></div>
        <button type="button" className="auth-oauth-button" onClick={() => void startOAuth('google')} disabled={busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.42-.18-2.1H12v3.97h5.38a4.6 4.6 0 0 1-2 3.02v2.47h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.41l-3.24-2.47c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.55A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.96a6 6 0 0 1 0-3.92V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.55Z"/><path fill="#EA4335" d="M12 5.92c1.47 0 2.79.5 3.83 1.52l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49L6.4 10.04c.8-2.36 3-4.12 5.6-4.12Z"/></svg>
          {busy && oauthProvider === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
        </button>
        <button type="button" className="auth-oauth-button" onClick={() => void startOAuth('github')} disabled={busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.08c-3.1.67-3.76-1.32-3.76-1.32-.5-1.29-1.24-1.63-1.24-1.63-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.7-1.49-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.11-1.44 3.05-1.14 3.05-1.14.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.29-2.62 5.24-5.11 5.51.4.35.75 1.03.75 2.08V22c0 .29.2.63.77.52A11.1 11.1 0 0 0 12 .9Z"/></svg>
          {busy && oauthProvider === 'github' ? 'Connecting to GitHub…' : 'Continue with GitHub'}
        </button>
      </div> : null}

      {mode === 'recovery-email' && <form onSubmit={event => void sendRecoveryCode(event)} className="auth-form">
        <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Sending code…' : 'Send recovery code'}<span>↗</span></button>
      </form>}

      {mode === 'recovery-otp' && <form onSubmit={event => void verifyRecoveryCode(event)} className="auth-form">
        <label>6-digit code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={event => setOtp(normalizeRecoveryOtp(event.target.value))} aria-label="6-digit recovery code" /></label>
        {notice && <div className="auth-notice" role="status">{notice}</div>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify code'}<span>↗</span></button>
        <div className="auth-resend-row"><span>Didn’t receive a code?</span><button type="button" onClick={() => void resendRecoveryCode()} disabled={busy || !canResendRecoveryOtp(resendAt)}>{busy ? 'Please wait…' : resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}</button></div>
      </form>}

      {mode === 'recovery-password' && <form onSubmit={event => void updateRecoveryPassword(event)} className="auth-form">
        <label>New password<input type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required value={password} onChange={event => setPassword(event.target.value)} /><small>Use {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters.</small></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy || !recoveryVerified}>{busy ? 'Updating password…' : 'Update password'}<span>↗</span></button>
      </form>}

      {mode === 'recovery-success' && <div className="auth-form">
        <div className="auth-notice" role="status">Your password was updated successfully.</div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" onClick={() => void returnToSignIn()} disabled={busy}>{busy ? 'Closing recovery session…' : 'Return to sign in'}<span>↗</span></button>
      </div>}

      {notice && mode !== 'signin' && mode !== 'signup' && mode !== 'recovery-otp' && mode !== 'recovery-success' && <div className="auth-notice" role="status">{notice}</div>}

      {mode === 'signin' || mode === 'signup' ? <p className="auth-switch">{mode === 'signin' ? 'New to AURA?' : 'Already have an account?'} <button type="button" onClick={() => { clearFeedback(); setMode(mode === 'signin' ? 'signup' : 'signin'); }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
        : mode !== 'recovery-success' ? <p className="auth-switch"><button type="button" disabled={busy} onClick={() => void returnToSignIn()}>Back to sign in</button></p> : null}
      <p className="auth-local-note">Your workspace is private to your account.</p>
    </section>
  </main>;
}
