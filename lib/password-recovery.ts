export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;
export const RECOVERY_OTP_LENGTH = 6;
export const RECOVERY_RESEND_COOLDOWN_MS = 60_000;

export function normalizeRecoveryEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

export function normalizeRecoveryOtp(value: string): string {
  return value.replace(/\D/g, '').slice(0, RECOVERY_OTP_LENGTH);
}

export function isValidRecoveryOtp(value: string): boolean {
  return new RegExp(`^\\d{${RECOVERY_OTP_LENGTH}}$`).test(value);
}

export function getPasswordValidationError(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `Use a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (password !== confirmation) return 'The passwords do not match.';
  return null;
}

export function canResendRecoveryOtp(resendAt: number, now = Date.now()): boolean {
  return now >= resendAt;
}

export async function applyRecoveryPassword(options: {
  recoveryVerified: boolean;
  password: string;
  confirmation: string;
  updatePassword: (password: string) => Promise<void>;
}): Promise<void> {
  if (!options.recoveryVerified) throw new Error('Verify the recovery code before changing the password.');
  const validationError = getPasswordValidationError(options.password, options.confirmation);
  if (validationError) throw new Error(validationError);
  await options.updatePassword(options.password);
}

export function recoveryErrorMessage(error: unknown, stage: 'send' | 'verify' | 'update'): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
  const name = error instanceof Error ? error.name : '';

  if (name === 'SupabaseSetupError') return 'Password reset is temporarily unavailable. Please try again later.';
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'Too many attempts. Wait a little while, then try again.';
  }
  if (stage === 'verify') return 'That code is invalid or expired. Request a new code and try again.';
  if (stage === 'update' && (code === 'weak_password' || status === 422)) {
    return 'Choose a stronger password and try again.';
  }
  if (stage === 'update' && (status === 401 || code === 'session_not_found' || code === 'bad_jwt' || name === 'AuthSessionMissingError')) {
    return 'Your recovery session expired. Request a new code and try again.';
  }
  return stage === 'send'
    ? 'We could not send a recovery code right now. Please try again shortly.'
    : 'We could not update your password. Please try again.';
}
