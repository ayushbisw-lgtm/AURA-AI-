'use client';

import { createBrowserClient } from '@supabase/ssr';
import { requireSupabaseConfig } from './config.ts';

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = requireSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
