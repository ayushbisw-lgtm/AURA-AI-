import { NextResponse } from 'next/server';
import {
  authenticateAccount, createAccount, getSessionUser, isLocalFileAuthAllowed,
  makeSession, SESSION_COOKIE, SESSION_SECONDS, signInWithSupabase,
  signOutSupabase, signUpWithSupabase
} from '@/lib/auth';
import { classifyAuthFailure, processAuthInput, type AuthFlowDependencies } from '@/lib/auth-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function logAuthFailure(context: string, error: unknown) {
  const detail = error instanceof Error ? {
    name: error.name,
    code: typeof error === 'object' && 'code' in error ? String(error.code) : undefined,
    status: typeof error === 'object' && 'status' in error ? Number(error.status) : undefined
  } : { name: 'UnknownError' };
  console.error(`[auth] ${context}`, detail);
}

export async function GET() {
  try {
    return NextResponse.json({ user: await getSessionUser() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logAuthFailure('session lookup failed', error);
    const result = classifyAuthFailure(error);
    return NextResponse.json({ error: result.message }, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 10_000) {
    return NextResponse.json({ error: 'The account request is too large.' }, { status: 413 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Send a valid JSON request.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Send a valid account request.' }, { status: 400 });
  }
  const input = body as { action?: unknown; name?: unknown; email?: unknown; password?: unknown };
  if (input.action === 'signout') {
    try {
      if (isLocalFileAuthAllowed()) {
        const response = NextResponse.json({ ok: true });
        response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
        return response;
      }
      await signOutSupabase();
      return NextResponse.json({ ok: true });
    } catch (error) {
      logAuthFailure('sign-out failed', error);
      const result = classifyAuthFailure(error);
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
  }

  const dependencies: AuthFlowDependencies = isLocalFileAuthAllowed() ? {
    signUp: async (name, email, password) => {
      const result = await createAccount(name, email, password);
      return { user: result.user, migrateLegacyData: result.migrateLegacyData, sessionToken: await makeSession(result.user) };
    },
    signIn: async (email, password) => {
      const user = await authenticateAccount(email, password);
      return user ? { user, sessionToken: await makeSession(user) } : { user: null };
    }
  } : {
    signUp: signUpWithSupabase,
    signIn: async (email, password) => ({ user: await signInWithSupabase(email, password) })
  };

  const result = await processAuthInput(input, dependencies);
  if (result.status === 503 && !isSetupErrorFromMessage(result.body.error)) {
    console.error('[auth] account operation failed', 'diagnostic' in result ? result.diagnostic : { name: 'BackendError' });
  }
  const response = NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  if (result.sessionToken) {
    response.cookies.set(SESSION_COOKIE, result.sessionToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS
    });
  }
  if (result.migrateLegacyData) response.headers.set('X-AURA-Migrate-Legacy', '1');
  return response;
}

function isSetupErrorFromMessage(message: unknown) {
  return typeof message === 'string' && message.startsWith('Account storage is not configured.');
}
