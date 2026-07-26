import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('operator upgrade stays re-run safe without matching the historical migration byte-for-byte', () => {
  const source = read('../src/supabase/lead_pipeline_audit_upgrade.sql').replace(/\r\n/g, '\n');
  const migration = read('../supabase/migrations/20260714011000_lead_pipeline_audit.sql').replace(/\r\n/g, '\n');
  assert.match(source, /install_guard_admin_lead_change/);
  assert.match(source, /keeping newer guard_admin_lead_change/);
  assert.match(migration, /create or replace function public\.guard_admin_lead_change\(\)/i);
  assert.match(migration, /raise exception 'LEAD_AUDIT_IMMUTABLE'/);
});


for (const path of [
  '../src/supabase/lead_pipeline_audit_upgrade.sql',
  '../supabase/migrations/20260714011000_lead_pipeline_audit.sql',
]) {
  test(`${path} atomically audits every supported lead pipeline`, () => {
    const sql = read(path);
    assert.match(sql, /create table if not exists public\.admin_lead_changes/i);
    assert.match(sql, /lead_type in \('member', 'trainer', 'partner'\)/i);
    assert.match(sql, /member_interest_audit_admin_change/i);
    assert.match(sql, /trainer_interest_audit_admin_change/i);
    assert.match(sql, /partner_interest_audit_admin_change/i);
    assert.match(sql, /LEAD_AUDIT_IMMUTABLE/i);
    assert.match(sql, /function public\.admin_update_lead\([\s\S]*p_lead_id text/i);
    assert.match(sql, /function public\.admin_update_lead_statuses\([\s\S]*p_lead_ids text\[\]/i);
    assert.match(sql, /cardinality\(coalesce\(p_lead_ids[\s\S]*> 100/i);
    assert.match(sql, /v_updated <> v_expected[\s\S]*LEAD_SELECTION_STALE/i);
    assert.match(sql, /revoke all on table public\.admin_lead_changes from public, anon, authenticated/i);
    assert.match(sql, /revoke execute on function public\.audit_admin_lead_change\(\) from public, anon, authenticated/i);
    assert.match(sql, /values \('lead_pipeline_audit'\)/i);
  });
}

test('admin lead saves and bulk moves use the audited RPC contract', () => {
  const data = read('../src/lib/adminData.js');
  const start = data.indexOf('export async function updateLeadStatus');
  const end = data.indexOf('export async function updateLegacyBookingNotes', start);
  const mutations = data.slice(start, end);
  assert.match(mutations, /rpc\('admin_update_lead'/);
  assert.match(mutations, /rpc\('admin_update_lead_statuses'/);
  assert.match(mutations, /p_admin_notes: mutation\.updates\.admin_notes/);
  assert.match(mutations, /Number\(data\) !== mutation\.ids\.length/);
  assert.doesNotMatch(mutations, /supabase\.from\(mutation\.table\)\.update/);
});

test('lead pipeline events are available in the permanent Admin Audit ledger', () => {
  const data = read('../src/lib/adminData.js');
  const audit = read('../src/lib/adminAudit.js');
  const view = read('../src/components/admin/AdminAuditLog.jsx');
  assert.match(data, /loadTable\('admin_lead_changes'/);
  assert.match(audit, /type: 'lead'/);
  assert.match(audit, /leadChanges/);
  assert.match(view, /Lead pipeline changes/);
  assert.match(view, /summary\.leadChanges/);
});
