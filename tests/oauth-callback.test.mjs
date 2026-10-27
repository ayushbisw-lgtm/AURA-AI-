import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOAuthCallback, getOAuthCallbackDestination, resolveOAuthCallback } from '../lib/oauth-callback.ts';

test('callback accepts an authorization code and exchanges it before returning to workspace', async () => {
  let exchanged = '';
  const destination = await resolveOAuthCallback(
    'https://aura.example/auth/callback?code=pkce-code',
    new URLSearchParams('code=pkce-code'),
    async code => { exchanged = code; return {}; }
  );
  assert.equal(exchanged, 'pkce-code');
  assert.equal(destination.href, 'https://aura.example/');
});

test('provider cancellation and callback failures are classified safely', async () => {
  assert.equal(classifyOAuthCallback(new URLSearchParams('error=access_denied')), 'cancelled');
  assert.equal(classifyOAuthCallback(new URLSearchParams('error=server_error')), 'failed');
  assert.equal(classifyOAuthCallback(new URLSearchParams()), 'failed');

  let exchanged = false;
  const cancelled = await resolveOAuthCallback(
    'https://aura.example/auth/callback?error=access_denied',
    new URLSearchParams('error=access_denied'),
    async () => { exchanged = true; return {}; }
  );
  assert.equal(exchanged, false);
  assert.equal(cancelled.href, 'https://aura.example/?authError=cancelled');

  const failedExchange = await resolveOAuthCallback(
    'https://aura.example/auth/callback?code=bad-code',
    new URLSearchParams('code=bad-code'),
    async () => ({ error: new Error('private provider details') })
  );
  assert.equal(failedExchange.href, 'https://aura.example/?authError=failed');

  const thrownExchange = await resolveOAuthCallback(
    'https://aura.example/auth/callback?code=bad-code',
    new URLSearchParams('code=bad-code'),
    async () => { throw new Error('private provider details'); }
  );
  assert.equal(thrownExchange.href, 'https://aura.example/?authError=failed');
});

test('callback destination ignores arbitrary redirect parameters and uses only the request origin', () => {
  const destination = getOAuthCallbackDestination(
    'https://aura.example/auth/callback?next=https%3A%2F%2Fevil.example&redirect=%2F%2Fevil.example',
    null
  );
  assert.equal(destination.origin, 'https://aura.example');
  assert.equal(destination.pathname, '/');
  assert.equal(destination.search, '');
});
