import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/config';
import { OutlookSetupError, getOutlookConfig } from './config';
import { decryptTokenCache, encryptTokenCache } from './crypto';

export async function requireOutlookUser() {
  if (!hasSupabaseConfig()) throw new OutlookSetupError('Outlook notice sync is unavailable with local file accounts. Configure Supabase Auth and sign in with a Supabase account first.');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new OutlookSetupError('Outlook notice sync needs the server-only SUPABASE_SERVICE_ROLE_KEY for protected encrypted credential storage.');
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('AUTH_REQUIRED');
  return { user: data.user, db: serviceClient() };
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new OutlookSetupError();
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function msalClient() {
  const config = getOutlookConfig();
  return new ConfidentialClientApplication({ auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, clientSecret: config.clientSecret } });
}

export async function saveConnection(db: ReturnType<typeof serviceClient>, userId: string, identity: { id: string; email: string; displayName: string; tenantId: string }, tokenCache: string) {
  const { error } = await db.from('microsoft_mailbox_connections').upsert({ user_id: userId, microsoft_user_id: identity.id, microsoft_tenant_id: identity.tenantId, email: identity.email, display_name: identity.displayName, encrypted_token_cache: encryptTokenCache(tokenCache, userId), connected_at: new Date().toISOString(), status: 'connected' }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function getConnection(db: ReturnType<typeof serviceClient>, userId: string) {
  const { data, error } = await db.from('microsoft_mailbox_connections').select('microsoft_user_id,microsoft_tenant_id,email,display_name,encrypted_token_cache,status,last_synced_at,sync_status,sync_error,delta_link').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function graphAccessToken(db: ReturnType<typeof serviceClient>, userId: string) {
  const connection = await getConnection(db, userId);
  if (!connection || connection.status !== 'connected') throw new Error('OUTLOOK_NOT_CONNECTED');
  const app = msalClient();
  const cache = app.getTokenCache();
  await cache.deserialize(decryptTokenCache(connection.encrypted_token_cache, userId));
  const account = (await cache.getAllAccounts()).find(a => a.tenantId === connection.microsoft_tenant_id && a.localAccountId === connection.microsoft_user_id);
  if (!account) throw new Error('OUTLOOK_RECONNECT_REQUIRED');
  try {
    const result = await app.acquireTokenSilent({ account, scopes: ['User.Read', 'Mail.Read', 'offline_access'] });
    const { error } = await db.from('microsoft_mailbox_connections').update({ encrypted_token_cache: encryptTokenCache(cache.serialize(), userId) }).eq('user_id', userId);
    if (error) throw error;
    return result.accessToken;
  } catch (error) {
    const code = (error as { errorCode?: string })?.errorCode;
    if (code === 'interaction_required' || code === 'invalid_grant') throw new Error('OUTLOOK_RECONNECT_REQUIRED');
    throw error;
  }
}

export function outlookError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return { status: 401, message: 'Sign in to AURA before using Outlook notices.' };
  if (message === 'OUTLOOK_NOT_CONNECTED') return { status: 409, message: 'Connect your college Outlook account first.' };
  if (message === 'OUTLOOK_RECONNECT_REQUIRED') return { status: 401, message: 'Outlook access needs renewed consent. Disconnect and connect Outlook again.' };
  if (error instanceof OutlookSetupError || message.includes('MICROSOFT_') || message.includes('SUPABASE_SERVICE_ROLE_KEY')) return { status: 503, message };
  return { status: 500, message: 'Could not complete the Outlook request. Try again later.' };
}
