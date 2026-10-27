import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseConfig, hasSupabaseConfig, requireSupabaseConfig } from '../lib/supabase/config.ts';

const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

function withEnv(values, run) {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  try { return run(); }
  finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('Supabase configuration requires URL and publishable key', () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }, () => {
    assert.equal(hasSupabaseConfig(), false);
    assert.throws(requireSupabaseConfig, error => error.name === 'SupabaseSetupError' && /PUBLISHABLE_KEY/.test(error.message));
  });
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-placeholder' }, () => {
    assert.equal(hasSupabaseConfig(), true);
    assert.equal(requireSupabaseConfig().publishableKey, 'test-publishable-placeholder');
  });
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-legacy-placeholder' }, () => {
    assert.equal(getSupabaseConfig().publishableKey, 'test-legacy-placeholder');
  });
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-placeholder', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-legacy-placeholder' }, () => {
    assert.equal(getSupabaseConfig().publishableKey, 'test-publishable-placeholder');
  });
});
