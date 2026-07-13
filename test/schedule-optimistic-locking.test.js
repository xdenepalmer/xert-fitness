import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sources = [
  '../src/supabase/availability_schema.sql',
  '../src/supabase/schedule_optimistic_locking_upgrade.sql',
  '../supabase/migrations/20260714018000_schedule_optimistic_locking.sql',
].map(path => ({ path, sql: readFileSync(new URL(path, import.meta.url), 'utf8') }));

test('fresh and upgrade schemas maintain schedule row versions', () => {
  for (const { path, sql } of sources) {
    assert.match(sql, /availability_blocks[\s\S]*updated_at timestamptz not null default now\(\)/i, path);
    assert.match(sql, /blackout_periods[\s\S]*updated_at timestamptz not null default now\(\)/i, path);
    assert.match(sql, /create or replace function public\.touch_availability_updated_at\(\)/i, path);
    assert.match(sql, /availability_blocks_touch_updated_at/i, path);
    assert.match(sql, /blackout_periods_touch_updated_at/i, path);
    assert.match(sql, /values \('schedule_optimistic_locking'\)/i, path);
  }
});

test('upgrade paths do not expose the trigger function as an authenticated RPC', () => {
  for (const { path, sql } of sources.slice(1)) {
    assert.match(sql, /revoke execute on function public\.touch_availability_updated_at\(\) from public, anon, authenticated/i, path);
  }
});
