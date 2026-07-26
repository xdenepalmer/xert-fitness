import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim();
const source = read('../src/supabase/admin_request_status_audit_upgrade.sql');
const migration = read('../supabase/migrations/20260714008000_admin_request_status_audit.sql');
const adminData = read('../src/lib/adminData.js');
const auditView = read('../src/components/admin/AdminAuditLog.jsx');

test('operator request audit upgrade is re-run safe; migration keeps the historical contract', () => {
  assert.match(source, /install_guard_admin_request_status_change/);
  assert.match(source, /keeping newer guard_admin_request_status_change/);
  assert.match(migration, /create table if not exists public\.admin_request_status_changes/i);
  assert.match(migration, /request_type in \('class_booking', 'private_session'\)/i);
  assert.match(migration, /before update or delete on public\.admin_request_status_changes/i);
  assert.match(migration, /raise exception 'REQUEST_AUDIT_IMMUTABLE'/i);
  assert.match(migration, /for select to authenticated using \(\(select public\.is_admin\(\)\)\)/i);
  assert.match(migration, /revoke insert, update, delete on table public\.admin_request_status_changes from authenticated/i);
});

test('request mutation RPC is admin-only, row-locked, bounded and auditable', () => {
  assert.match(migration, /create or replace function public\.admin_update_request/i);
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(migration, /v_actor is null or not public\.is_admin\(\)/i);
  assert.match(migration, /from public\.class_bookings request[\s\S]*for update/i);
  assert.match(migration, /from public\.private_session_requests request[\s\S]*for update/i);
  assert.match(migration, /length\(coalesce\(p_admin_notes, ''\)\) > 5000/i);
  assert.match(migration, /insert into public\.admin_request_status_changes/i);
  assert.match(migration, /values \('request_status_audit'\)/i);
  assert.match(migration, /revoke execute on function public\.admin_update_request[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_update_request[\s\S]*to authenticated/i);
});

test('admin queues and audit UI use the durable request history', () => {
  for (const name of ['updateLegacyBookingNotes', 'updateBookingStatus', 'updatePTRequestStatus']) {
    const start = adminData.indexOf(`export async function ${name}`);
    const end = adminData.indexOf('\nexport async function ', start + 1);
    const body = adminData.slice(start, end === -1 ? adminData.length : end);
    assert.match(body, /\.rpc\('admin_update_request'/);
    assert.doesNotMatch(body, /\.update\(/);
  }
  assert.match(adminData, /loadTable\('admin_request_status_changes'/);
  assert.match(auditView, /Booking & PT changes/);
  assert.match(auditView, /summary\.requestChanges/);
});
