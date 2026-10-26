import { NextResponse } from 'next/server';
import { authenticateAccount, createAccount, makeSession, SESSION_COOKIE, SESSION_SECONDS, getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ user: await getSessionUser() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Account storage is unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 10_000) {
    return NextResponse.json({ error: 'The account request is too large.' }, { status: 413 });
  }
  let body: { action?: unknown; name?: unknown; email?: unknown; password?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Send a valid JSON request.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Send a valid account request.' }, { status: 400 });
  }
  if (body.action === 'signout') {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  }
  if ((body.action !== 'signup' && body.action !== 'signin') || typeof body.email !== 'string' ||
      typeof body.password !== 'string' || body.password.length > 256 ||
      (body.action === 'signup' && typeof body.name !== 'string')) {
    return NextResponse.json({ error: 'Provide a valid sign-in or sign-up request.' }, { status: 400 });
  }
  try {
    const result = body.action === 'signup' ? await createAccount(body.name as string, body.email, body.password) : null;
    const user = result?.user ?? (body.action === 'signin' ? await authenticateAccount(body.email, body.password) : null);
    if (!user) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    const response = NextResponse.json({ user });
    if (result) response.headers.set('X-AURA-Migrate-Legacy', result.migrateLegacyData ? '1' : '0');
    response.cookies.set(SESSION_COOKIE, await makeSession(user), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not access local account storage.';
    const status = message.startsWith('An account') || message.includes('must be') || message.startsWith('Enter a valid') ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
