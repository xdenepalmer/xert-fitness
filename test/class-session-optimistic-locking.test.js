import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classSessionUpdateRpcError } from '../src/lib/scheduling.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260726104000_class_session_optimistic_locking.sql');
const upgrade = read('../src/supabase/class_session_optimistic_locking_upgrade.sql');
const adminCms = read('../src/supabase/admin_cms_schema.sql');
const adminData = read('../src/lib/adminData.js');
const calendar = read('../src/components/admin/ClassCalendarAdmin.jsx');
const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');

test('class session optimistic-locking migration and upgrade stay identical', () => {
  assert.equal(migration.trim(), upgrade.trim());
});

test('class session update RPC rejects stale versions and retires the unguarded overload', () => {
  for (const sql of [migration, upgrade, adminCms]) {
    assert.match(sql, /admin_update_class_session\([\s\S]*p_expected_updated_at timestamptz/i);
    assert.match(sql, /for update;[\s\S]*SESSION_STALE/i);
    assert.match(sql, /SESSION_VERSION_REQUIRED/i);
    assert.match(sql, /grant execute on function public\.admin_update_class_session\(uuid, jsonb, timestamptz\) to authenticated/i);
  }
  assert.match(migration, /values \('class_session_optimistic_locking'\)/i);
  assert.match(upgrade, /values \('class_session_optimistic_locking'\)/i);
  assert.match(adminCms, /values \('class_session_optimistic_locking'\)/i);
  assert.match(migration, /to_regprocedure\('public\.admin_update_class_session\(uuid, jsonb\)'\)/i);
});

test('web admin threads the loaded class version into every save', () => {
  const start = adminData.indexOf('export async function updateClassSession');
  const end = adminData.indexOf('\nexport async function ', start + 1);
  const body = adminData.slice(start, end);
  assert.match(body, /expectedUpdatedAt/);
  assert.match(body, /p_expected_updated_at: expectedUpdatedAt/);
  assert.match(body, /\.eq\('updated_at', expectedUpdatedAt\)/);
  assert.match(body, /assertAdminMutationVersion/);
  assert.match(calendar, /updateClassSession\(session\.id, form, session\.updated_at\)/);
});

test('SESSION_STALE maps to an actionable refresh message', () => {
  assert.match(
    classSessionUpdateRpcError('SESSION_STALE'),
    /changed since you opened it/i,
  );
  assert.match(
    classSessionUpdateRpcError('SESSION_VERSION_REQUIRED'),
    /changed since you opened it/i,
  );
});

test('native admin class updates carry the loaded version', () => {
  assert.match(api, /p_expected_updated_at: expectedUpdatedAt/);
  assert.match(api, /AdminClassUpdateRequest[\s\S]*p_expected_updated_at/);
  assert.match(api, /select", value: "[^"]*updated_at/);
  assert.match(api, /SESSION_STALE/);
});
