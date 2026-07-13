import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260714007000_rls_policy_performance.sql');

const optimizedPolicies = [
  'profiles_select_own_or_admin',
  'profiles_update_own_or_admin',
  'orders_select_own_or_admin',
  'announcement_receipts_select_own_or_admin',
  'credit_batches_select_own_or_admin',
  'session_bookings_select_own_or_admin',
  'member_event_goals_select_own_or_admin',
  'member_event_goals_insert_own',
  'member_event_goals_delete_own_or_admin',
  'public_insert_private_session_requests',
  'members_read_own_private_session_requests',
];

test('production migration optimizes every advisor-reported auth policy', () => {
  for (const policy of optimizedPolicies) {
    assert.match(migration, new RegExp(`create policy "${policy}"`, 'i'));
  }

  assert.match(migration, /\(select auth\.uid\(\)\)/i);
  assert.match(migration, /\(select public\.is_admin\(\)\)/i);
  assert.doesNotMatch(migration, /(?<!select )auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /(?<!select )public\.is_admin\(\)/i);
  assert.match(migration, /values \('rls_policy_performance'\)/i);
});

test('canonical SQL sources retain optimized request identity checks', () => {
  const sources = [
    '../src/supabase/booking_schema.sql',
    '../src/supabase/event_goals_upgrade.sql',
    '../src/supabase/member_pt_request_tracking.sql',
    '../src/supabase/public_form_integrity_upgrade.sql',
    '../src/supabase/rls_hardening.sql',
    '../src/supabase/rls_policies.sql',
  ];

  for (const source of sources) {
    const sql = read(source);
    assert.match(sql, /\(select auth\.uid\(\)\)/i, `${source} must cache auth.uid()`);
  }

  assert.match(read('../src/supabase/booking_schema.sql'), /\(select public\.is_admin\(\)\)/i);
  assert.match(read('../src/supabase/event_goals_upgrade.sql'), /\(select public\.is_admin\(\)\)/i);
});
