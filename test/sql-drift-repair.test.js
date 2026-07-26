import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const bookingSchema = read('../src/supabase/booking_schema.sql');
const archivalUpgrade = read('../src/supabase/announcement_archival_upgrade.sql');
const migrationPath = new URL('../supabase/migrations/20260726070214_sql_drift_repair.sql', import.meta.url);
const reusableRepairPath = new URL('../src/supabase/sql_drift_repair.sql', import.meta.url);

test('every reusable announcement policy preserves targeted recipient access', () => {
  for (const sql of [bookingSchema, archivalUpgrade]) {
    assert.match(sql, /audience = 'all'[\s\S]*audience = 'targeted'/i);
    assert.match(sql, /member_announcement_targets target[\s\S]*target\.user_id = \(select auth\.uid\(\)\)/i);
  }
});

test('the reusable profile guard prevents members changing email', () => {
  assert.match(bookingSchema, /new\.email is distinct from old\.email[\s\S]*PROFILE_EMAIL_MANAGED_BY_AUTH/i);
});

test('reusable setup does not restore insecure private-notice functions', () => {
  for (const sql of [bookingSchema, archivalUpgrade]) {
    assert.doesNotMatch(sql, /create(?:\s+or\s+replace)?\s+function public\.my_member_announcements/i);
    assert.doesNotMatch(sql, /create(?:\s+or\s+replace)?\s+function public\.dismiss_member_announcement/i);
  }
});

test('the deployed repair and reusable copy are identical and protect both gaps', () => {
  assert.ok(existsSync(migrationPath), 'missing deployed database repair');
  assert.ok(existsSync(reusableRepairPath), 'missing reusable database repair');

  const migration = read('../supabase/migrations/20260726070214_sql_drift_repair.sql');
  const reusableRepair = read('../src/supabase/sql_drift_repair.sql');

  assert.equal(migration.replace(/\r\n/g, '\n'), reusableRepair.replace(/\r\n/g, '\n'));
  assert.match(migration, /drop policy if exists "member_announcements_select_live_or_admin"/i);
  assert.match(migration, /audience = 'targeted'[\s\S]*target\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /new\.email is distinct from old\.email[\s\S]*PROFILE_EMAIL_MANAGED_BY_AUTH/i);
  assert.match(migration, /my_member_announcements[\s\S]*announcement\.audience = 'targeted'[\s\S]*target\.user_id = v_user_id/i);
  assert.match(migration, /dismiss_member_announcement[\s\S]*announcement\.audience = 'targeted'[\s\S]*target\.user_id = v_user_id/i);
});
