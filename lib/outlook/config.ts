export class OutlookSetupError extends Error {
  constructor(message = 'Outlook notice sync needs Supabase authentication and its server-only service role key configured.') { super(message); this.name = 'OutlookSetupError'; }
}

export function getOutlookConfig() {
  const { MICROSOFT_CLIENT_ID: clientId, MICROSOFT_TENANT_ID: tenantId, MICROSOFT_CLIENT_SECRET: clientSecret, MICROSOFT_REDIRECT_URI: redirectUri, MICROSOFT_TOKEN_ENCRYPTION_KEY: encryptionKey } = process.env;
  const missing = [!clientId && 'MICROSOFT_CLIENT_ID', !tenantId && 'MICROSOFT_TENANT_ID', !clientSecret && 'MICROSOFT_CLIENT_SECRET', !redirectUri && 'MICROSOFT_REDIRECT_URI', !encryptionKey && 'MICROSOFT_TOKEN_ENCRYPTION_KEY'].filter(Boolean);
  if (missing.length) throw new OutlookSetupError(`Outlook integration is not configured. Missing: ${missing.join(', ')}.`);
  if (!/^[0-9a-f]{64}$/i.test(encryptionKey!)) throw new OutlookSetupError('MICROSOFT_TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as 64 hexadecimal characters.');
  let redirect: URL;
  try { redirect = new URL(redirectUri!); } catch { throw new OutlookSetupError('MICROSOFT_REDIRECT_URI must be a valid absolute URL.'); }
  if (process.env.NODE_ENV === 'production' && redirect.protocol !== 'https:') throw new OutlookSetupError('MICROSOFT_REDIRECT_URI must use HTTPS in production.');
  return { clientId: clientId!, tenantId: tenantId!, clientSecret: clientSecret!, redirectUri: redirect.toString(), encryptionKey: Buffer.from(encryptionKey!, 'hex') };
}
