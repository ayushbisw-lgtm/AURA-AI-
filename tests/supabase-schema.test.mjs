import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Supabase records schema enforces ownership for every operation', async () => {
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /enable row level security/i);
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(schema, new RegExp(`for ${operation} to authenticated`, 'i'));
  }
  assert.match(schema, /using\s*\(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(schema, /with check\s*\(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(schema, /references auth\.users \(id\) on delete cascade/i);
});
