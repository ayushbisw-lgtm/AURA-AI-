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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (mode !== 'recovery-otp' || resendAt === 0) return;
    const updateCountdown = () => setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [mode, resendAt]);

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
