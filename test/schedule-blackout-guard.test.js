import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260714004000_schedule_blackout_guard.sql', import.meta.url), 'utf8');
const freshSchema = readFileSync(new URL('../src/supabase/availability_schema.sql', import.meta.url), 'utf8');

test('migration refuses to hide existing future schedule conflicts', () => {
  assert.match(migration, /EXISTING_SCHEDULE_BLACKOUT_CONFLICTS/);
  assert.match(migration, /session\.status in \('published', 'full'\)/i);
  assert.match(migration, /blackout\.end_time > now\(\)/i);
});

test('fresh and upgrade schemas enforce both sides of the schedule contract', () => {
  for (const sql of [migration, freshSchema]) {
    assert.match(sql, /hashtextextended\('xert_group_schedule', 0\)/i);
    assert.match(sql, /class_sessions_blackout_conflict_guard/i);
    assert.match(sql, /blackout_periods_class_conflict_guard/i);
    assert.match(sql, /SESSION_OVERLAPS_BLACKOUT/);
    assert.match(sql, /BLACKOUT_OVERLAPS_PUBLISHED_CLASS/);
    assert.match(sql, /blackout\.affects in \('all', 'group_classes', 'facility_only'\)/i);
    assert.match(sql, /blackout\.start_time < v_end[\s\S]*blackout\.end_time > new\.start_time/i);
    assert.match(sql, /session\.start_time < new\.end_time[\s\S]*> new\.start_time/i);
    assert.match(sql, /revoke execute on function public\.enforce_class_blackout_conflict\(\) from public, anon, authenticated/i);
    assert.match(sql, /revoke execute on function public\.enforce_blackout_class_conflict\(\) from public, anon, authenticated/i);
  }
});

test('admin mutations translate database schedule conflicts', () => {
  const source = readFileSync(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  assert.match(source, /createClassSession[\s\S]*classSessionUpdateRpcError\(error\.message\)/);
  assert.match(source, /createClassSessions[\s\S]*classSessionUpdateRpcError\(error\.message\)/);
  assert.match(source, /createBlackoutPeriod[\s\S]*blackoutPeriodMutationError\(error\.message\)/);
  assert.match(source, /updateBlackoutPeriod[\s\S]*blackoutPeriodMutationError\(result\.error\.message\)/);
});
