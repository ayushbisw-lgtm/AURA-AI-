import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getOutlookConfig } from '@/lib/outlook/config';
import { msalClient, requireOutlookUser, saveConnection, outlookError } from '@/lib/outlook/server';
import { validateOAuthState } from '@/lib/outlook/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const expected = cookieStore.get('aura_outlook_oauth_state')?.value ?? '';
  const supplied = request.nextUrl.searchParams.get('state') ?? '';
  cookieStore.delete('aura_outlook_oauth_state');
  try {
    if (request.nextUrl.searchParams.has('error')) throw new Error('Microsoft authorization was denied or failed. No mailbox was connected.');
    const config = getOutlookConfig();
    const { user, db } = await requireOutlookUser();
    if (!validateOAuthState(expected, supplied, user.id, config.encryptionKey)) throw new Error('Outlook authorization could not be validated for this AURA account. Restart the connection flow.');
    const code = request.nextUrl.searchParams.get('code');
    if (!code) throw new Error('Microsoft did not return an authorization code.');
    const app = msalClient();
    const result = await app.acquireTokenByCode({ code, scopes: ['User.Read', 'Mail.Read', 'offline_access'], redirectUri: config.redirectUri });
    const account = result.account;
    if (!account || (config.tenantId !== 'common' && config.tenantId !== 'organizations' && account.tenantId.toLowerCase() !== config.tenantId.toLowerCase())) throw new Error('The Microsoft account belongs to a different tenant than the configured college tenant.');
    const meResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${result.accessToken}` }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!meResponse.ok) throw new Error('Microsoft identity verification failed. Check the delegated User.Read permission and tenant consent.');
    const me = await meResponse.json() as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string };
    const email = me.mail || me.userPrincipalName || account.username;
    if (!me.id || !email || account.localAccountId !== me.id) throw new Error('Microsoft account verification did not match the authorized account.');
    await saveConnection(db, user.id, { id: me.id, email, displayName: me.displayName || email, tenantId: account.tenantId }, app.getTokenCache().serialize());
    return NextResponse.redirect(new URL('/api/outlook/result?connected=1', config.redirectUri));
  } catch (error) {
    const result = outlookError(error);
    return NextResponse.redirect(new URL(`/api/outlook/result?error=${encodeURIComponent(result.message)}`, process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
  }
}
