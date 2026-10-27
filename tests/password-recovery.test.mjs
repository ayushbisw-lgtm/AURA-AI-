import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRecoveryPassword,
  canResendRecoveryOtp,
  getPasswordValidationError,
  isValidRecoveryOtp,
  normalizeRecoveryEmail,
  normalizeRecoveryOtp,
  recoveryErrorMessage,
  RECOVERY_RESEND_COOLDOWN_MS
} from '../lib/password-recovery.ts';
import { SupabaseSetupError } from '../lib/supabase/config.ts';

test('normalizes valid email addresses and rejects invalid ones', () => {
  assert.equal(normalizeRecoveryEmail('  PERSON@Example.com '), 'person@example.com');
  assert.equal(normalizeRecoveryEmail('not-an-email'), null);
});

test('accepts a six-digit recovery code and rejects malformed codes', () => {
  assert.equal(normalizeRecoveryOtp('12 34-56'), '123456');
  assert.equal(isValidRecoveryOtp('123456'), true);
  assert.equal(isValidRecoveryOtp('12345'), false);
  assert.equal(isValidRecoveryOtp('12345a'), false);
});

test('expired and invalid recovery OTPs receive a safe message', () => {
  assert.match(recoveryErrorMessage(Object.assign(new Error('otp_expired'), { code: 'otp_expired' }), 'verify'), /invalid or expired/i);
  assert.doesNotMatch(recoveryErrorMessage(new Error('otp_expired'), 'verify'), /otp_expired/);
});

test('password validation rejects short and mismatched values', () => {
  assert.match(getPasswordValidationError('short', 'short') ?? '', /between 10 and 256/i);
  assert.match(getPasswordValidationError('long-enough-password', 'different-password') ?? '', /do not match/i);
  assert.equal(getPasswordValidationError('long-enough-password', 'long-enough-password'), null);
});

test('resend cooldown blocks attempts until its deadline', () => {
  const sentAt = 100_000;
  const resendAt = sentAt + RECOVERY_RESEND_COOLDOWN_MS;
  assert.equal(canResendRecoveryOtp(resendAt, resendAt - 1), false);
  assert.equal(canResendRecoveryOtp(resendAt, resendAt), true);
});

test('missing Supabase configuration gets a safe recovery message', () => {
  assert.match(recoveryErrorMessage(new SupabaseSetupError(), 'send'), /temporarily unavailable/i);
});

test('password update requires a verified recovery session and matching passwords', async () => {
  let updates = 0;
  const updatePassword = async () => { updates += 1; };
  await assert.rejects(applyRecoveryPassword({
    recoveryVerified: false,
    password: 'long-enough-password',
    confirmation: 'long-enough-password',
    updatePassword
  }), /verify the recovery code/i);
  await assert.rejects(applyRecoveryPassword({
    recoveryVerified: true,
    password: 'long-enough-password',
    confirmation: 'not-the-same-password',
    updatePassword
  }), /passwords do not match/i);
  assert.equal(updates, 0);
});

test('verified recovery updates the password once', async () => {
  let updatedPassword = '';
  await applyRecoveryPassword({
    recoveryVerified: true,
    password: 'new-secure-password',
    confirmation: 'new-secure-password',
    updatePassword: async password => { updatedPassword = password; }
  });
  assert.equal(updatedPassword, 'new-secure-password');
});
