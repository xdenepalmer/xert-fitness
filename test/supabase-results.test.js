import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSupabaseResponses } from '../src/lib/supabaseResults.js';

test('returns successful Supabase responses unchanged', () => {
  const responses = [{ data: [], error: null }, { count: 3, error: null }];
  assert.strictEqual(assertSupabaseResponses(responses), responses);
});

test('turns a failed Supabase response into a useful thrown error', () => {
  assert.throws(
    () => assertSupabaseResponses([{ data: null, error: { message: 'permission denied' } }]),
    /permission denied/
  );
});
