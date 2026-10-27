export class SupabaseSetupError extends Error {
  constructor() {
    super('Account storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your environment (NEXT_PUBLIC_SUPABASE_ANON_KEY is supported as a legacy fallback), then restart locally or rebuild and redeploy.');
    this.name = 'SupabaseSetupError';
  }
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && publishableKey ? { url, publishableKey } : null;
}

export function hasSupabaseConfig() {
  return getSupabaseConfig() !== null;
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) throw new SupabaseSetupError();
  return config;
}
