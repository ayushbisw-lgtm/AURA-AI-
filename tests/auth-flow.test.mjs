import test from 'node:test';
import assert from 'node:assert/strict';
import { processAuthInput } from '../lib/auth-flow.ts';
import { SupabaseSetupError } from '../lib/supabase/config.ts';

const input = { action: 'signup', name: 'AURA User', email: 'USER@example.com', password: 'a-strong-password' };

test('successful signup returns the account without exposing credentials', async () => {
  const result = await processAuthInput(input, {
    signUp: async (name, email) => ({ user: { id: 'user-1', name, email } }),
    signIn: async () => ({ user: null })
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { user: { id: 'user-1', name: 'AURA User', email: 'user@example.com' } });
  assert.equal(JSON.stringify(result).includes(input.password), false);
});

test('duplicate email returns conflict', async () => {
  const duplicate = Object.assign(new Error('User already registered'), { code: 'user_already_exists' });
  const result = await processAuthInput(input, {
    signUp: async () => { throw duplicate; },
    signIn: async () => ({ user: null })
  });
  assert.equal(result.status, 409);
  assert.match(result.body.error, /already exists/i);
});

test('invalid signup input is rejected before storage is called', async () => {
  let called = false;
  const result = await processAuthInput({ ...input, email: 'bad-address' }, {
    signUp: async () => { called = true; return { user: null }; },
    signIn: async () => ({ user: null })
  });
  assert.equal(result.status, 400);
  assert.equal(called, false);
});

test('missing Supabase config returns a clear setup response', async () => {
  const setup = new SupabaseSetupError();
  const result = await processAuthInput(input, {
    signUp: async () => { throw setup; },
    signIn: async () => ({ user: null })
  });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /not configured/i);
});

test('database failures return a safe temporary-unavailable response', async () => {
  const result = await processAuthInput(input, {
    signUp: async () => { throw Object.assign(new Error('private database details'), { code: 'XX000' }); },
    signIn: async () => ({ user: null })
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'The account service is temporarily unavailable. Please try again later.');
  assert.equal(JSON.stringify(result.body).includes('private database details'), false);
  assert.equal(result.diagnostic.code, 'XX000');
});
