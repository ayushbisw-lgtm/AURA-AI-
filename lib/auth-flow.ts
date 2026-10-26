export type AuthInput = { action?: unknown; name?: unknown; email?: unknown; password?: unknown };
export type AuthUser = { id: string; name: string; email: string };
export type AuthFlowDependencies = {
  signUp: (name: string, email: string, password: string) => Promise<{ user: AuthUser | null; sessionToken?: string; needsEmailConfirmation?: boolean; migrateLegacyData?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ user: AuthUser | null; sessionToken?: string }>;
};

export function validateAuthInput(body: AuthInput): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Send a valid account request.';
  if (body.action !== 'signup' && body.action !== 'signin') return 'Choose sign in or account creation.';
  if (typeof body.email !== 'string' || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return 'Enter a valid email address.';
  if (typeof body.password !== 'string' || body.password.length > 256 || (body.action === 'signup' && body.password.length < 10) || (body.action === 'signin' && body.password.length < 1)) return body.action === 'signup' ? 'Password must be between 10 and 256 characters.' : 'Enter your password.';
  if (body.action === 'signup' && (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 80)) return 'Name must be between 2 and 80 characters.';
  return null;
}

export function classifyAuthFailure(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '';
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
  if (error instanceof Error && error.name === 'SupabaseSetupError') return { status: 503, message };
  if (code === 'user_already_exists' || /already registered|already exists/i.test(message)) return { status: 409, message: 'An account with this email already exists.' };
  if (code === 'invalid_credentials' || status === 400 && /invalid login credentials/i.test(message)) return { status: 401, message: 'Email or password is incorrect.' };
  if (code === 'weak_password' || code === 'validation_failed' || status === 422) return { status: 400, message: 'The account details are invalid. Check your email and password and try again.' };
  return { status: 503, message: 'The account service is temporarily unavailable. Please try again later.' };
}

export async function processAuthInput(body: AuthInput, dependencies: AuthFlowDependencies) {
  const validationError = validateAuthInput(body);
  if (validationError) return { status: 400, body: { error: validationError } };
  try {
    if (body.action === 'signup') {
      const result = await dependencies.signUp((body.name as string).trim(), (body.email as string).trim().toLowerCase(), body.password as string);
      if (!result.user && !result.needsEmailConfirmation) return { status: 503, body: { error: 'Account creation did not complete. Please try again.' } };
      if (result.needsEmailConfirmation) return { status: 202, body: { user: null, needsEmailConfirmation: true } };
      return { status: 200, body: { user: result.user }, sessionToken: result.sessionToken, migrateLegacyData: result.migrateLegacyData };
    }
    const result = await dependencies.signIn((body.email as string).trim().toLowerCase(), body.password as string);
    if (!result.user) return { status: 401, body: { error: 'Email or password is incorrect.' } };
    return { status: 200, body: { user: result.user }, sessionToken: result.sessionToken };
  } catch (error) {
    const failure = classifyAuthFailure(error);
    const diagnostic = error instanceof Error ? {
      name: error.name,
      code: typeof error === 'object' && 'code' in error ? String(error.code) : undefined,
      status: typeof error === 'object' && 'status' in error ? Number(error.status) : undefined
    } : { name: 'UnknownError' };
    return { ...failure, diagnostic, body: { error: failure.message } };
  }
}
