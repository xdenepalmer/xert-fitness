import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('linked migration exactly installs the canonical schedule audit contract', () => {
  const source = read('../src/supabase/schedule_change_audit_upgrade.sql').replace(/\r\n/g, '\n');
  const migration = read('../supabase/migrations/20260714012000_schedule_change_audit.sql').replace(/\r\n/g, '\n');
  assert.equal(migration, source);
});

for (const path of [
  '../src/supabase/schedule_change_audit_upgrade.sql',
  '../supabase/migrations/20260714012000_schedule_change_audit.sql',
]) {
  test(`${path} preserves immutable operational schedule history`, () => {
    const sql = read(path);
    assert.match(sql, /create table if not exists public\.admin_schedule_changes/i);
    assert.match(sql, /resource_type in \('class_session', 'availability_block', 'blackout_period'\)/i);
    assert.match(sql, /action in \('created', 'updated', 'cancelled', 'completed', 'deleted'\)/i);
    assert.match(sql, /class_sessions_audit_admin_change/i);
    assert.match(sql, /availability_blocks_audit_admin_change/i);
    assert.match(sql, /blackout_periods_audit_admin_change/i);
    assert.match(sql, /SCHEDULE_AUDIT_IMMUTABLE/i);
    assert.match(sql, /v_previous - 'updated_at'\) = \(v_new - 'updated_at'/i);
    assert.match(sql, /using \(\(select public\.is_admin\(\)\)\)/i);
    assert.match(sql, /revoke all on table public\.admin_schedule_changes from public, anon, authenticated/i);
    assert.match(sql, /revoke execute on function public\.audit_admin_schedule_change\(\) from public, anon, authenticated/i);
    assert.match(sql, /values \('schedule_change_audit'\)/i);
  });
}

test('schedule lifecycle events appear in the permanent Admin Audit ledger', () => {
  const data = read('../src/lib/adminData.js');
  const audit = read('../src/lib/adminAudit.js');
  const view = read('../src/components/admin/AdminAuditLog.jsx');
  assert.match(data, /loadTable\('admin_schedule_changes'/);
  assert.match(audit, /type: 'schedule'/);
  assert.match(audit, /scheduleChanges/);
  assert.match(view, /Schedule changes/);
  assert.match(view, /summary\.scheduleChanges/);
  assert.match(view, /value="schedule"/);
});
