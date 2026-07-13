import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAdminMutation, assertSupabaseResponses } from '../src/lib/supabaseResults.js';

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

test('admin mutations require the exact expected affected row count', () => {
  assert.deepEqual(
    assertAdminMutation({ data: [{ id: 'one' }], error: null }, 'Member update'),
    [{ id: 'one' }]
  );
  assert.deepEqual(
    assertAdminMutation({ data: [{ id: 'one' }, { id: 'two' }], error: null }, 'Bulk update', 2),
    [{ id: 'one' }, { id: 'two' }]
  );
  assert.throws(
    () => assertAdminMutation({ data: [], error: null }, 'Member update'),
    /changed 0 of 1 expected records.*refresh/i
  );
  assert.throws(
    () => assertAdminMutation({ data: [{ id: 'one' }], error: null }, 'Bulk update', 2),
    /changed 1 of 2 expected records.*refresh/i
  );
  assert.throws(
    () => assertAdminMutation({ data: null, error: { message: 'permission denied' } }, 'Member update'),
    /permission denied/i
  );
});
