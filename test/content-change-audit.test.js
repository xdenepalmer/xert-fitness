import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('operator upgrade stays re-run safe without matching the historical migration byte-for-byte', () => {
  const source = read('../src/supabase/content_change_audit_upgrade.sql').replace(/\r\n/g, '\n');
  const migration = read('../supabase/migrations/20260714013000_content_change_audit.sql').replace(/\r\n/g, '\n');
  assert.match(source, /install_guard_admin_content_change/);
  assert.match(source, /keeping newer guard_admin_content_change/);
  assert.match(migration, /create or replace function public\.guard_admin_content_change\(\)/i);
  assert.match(migration, /raise exception 'CONTENT_AUDIT_IMMUTABLE'/);
});


for (const path of [
  '../src/supabase/content_change_audit_upgrade.sql',
  '../supabase/migrations/20260714013000_content_change_audit.sql',
]) {
  test(`${path} preserves immutable content and configuration history`, () => {
    const sql = read(path);
    assert.match(sql, /create table if not exists public\.admin_content_changes/i);
    assert.match(sql, /resource_type in \('site_content', 'coach', 'event', 'product', 'launch_settings'\)/i);
    assert.match(sql, /site_content_audit_admin_change/i);
    assert.match(sql, /coaches_audit_admin_change/i);
    assert.match(sql, /events_audit_admin_change/i);
    assert.match(sql, /products_audit_admin_change/i);
    assert.match(sql, /admin_settings_audit_admin_change/i);
    assert.match(sql, /CONTENT_AUDIT_IMMUTABLE/i);
    assert.match(sql, /v_previous - 'updated_at'\) = \(v_new - 'updated_at'/i);
    assert.match(sql, /using \(\(select public\.is_admin\(\)\)\)/i);
    assert.match(sql, /revoke all on table public\.admin_content_changes from public, anon, authenticated/i);
    assert.match(sql, /values \('content_change_audit'\)/i);
  });
}

test('content lifecycle events appear in the permanent Admin Audit ledger', () => {
  const data = read('../src/lib/adminData.js');
  const audit = read('../src/lib/adminAudit.js');
  const view = read('../src/components/admin/AdminAuditLog.jsx');
  assert.match(data, /loadTable\('admin_content_changes'/);
  assert.match(audit, /type: 'content'/);
  assert.match(audit, /contentChanges/);
  assert.match(view, /Content changes/);
  assert.match(view, /summary\.contentChanges/);
  assert.match(view, /value="content"/);
});
