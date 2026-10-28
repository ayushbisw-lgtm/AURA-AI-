import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOutlookConfig } from '@/lib/outlook/config';
import { msalClient, requireOutlookUser, outlookError } from '@/lib/outlook/server';
import { createOAuthState } from '@/lib/outlook/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireOutlookUser();
    const config = getOutlookConfig();
    const { state, cookie } = createOAuthState(user.id, config.encryptionKey);
    const authUrl = await msalClient().getAuthCodeUrl({ scopes: ['User.Read', 'Mail.Read', 'offline_access'], redirectUri: config.redirectUri, state, prompt: 'select_account' });
    (await cookies()).set('aura_outlook_oauth_state', cookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/outlook', maxAge: 600 });
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const result = outlookError(error);
    return NextResponse.redirect(new URL(`/api/outlook/result?error=${encodeURIComponent(result.message)}`, process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
  }
}
