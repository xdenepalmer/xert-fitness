import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stripComments = sql => sql
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

const migration = readFileSync(
  new URL('../supabase/migrations/20260726105000_audit_subject_pii_redaction.sql', import.meta.url),
  'utf8',
);
const upgrade = readFileSync(
  new URL('../src/supabase/audit_subject_pii_redaction_upgrade.sql', import.meta.url),
  'utf8',
);

test('upgrade keeps redaction guards and skips replacing a newer delete_member_account', () => {
  const body = stripComments(upgrade);
  assert.match(body, /create or replace function public\.guard_admin_request_status_change\(\)/i);
  assert.match(body, /subject_label/);
  assert.match(body, /install_delete_member_account/);
  assert.match(body, /keeping newer delete_member_account/);
  assert.match(body, /member_interest/);
  assert.match(migration, /perform public\.redact_audit_subject_pii\(v_email\)/);
  // Historical migration re-run must not strip public-lead cleanup.
  assert.match(stripComments(migration), /keeping newer delete_member_account/);
  assert.match(stripComments(migration), /member_interest/);
});

test('guards keep SET NULL and add a narrow subject-PII nulling allowance', () => {
  for (const guard of ['guard_admin_request_status_change', 'guard_admin_lead_change']) {
    assert.match(migration, new RegExp(`create or replace function public\\.${guard}\\(\\)`, 'i'));
  }
  assert.match(migration, /to_jsonb\(new\) - 'changed_by' = to_jsonb\(old\) - 'changed_by'/);
  assert.match(migration, /new\.subject_label is null/);
  assert.match(migration, /new\.subject_email is null/);
  assert.match(migration, /previous_admin_notes/);
  assert.match(migration, /new_admin_notes/);
  assert.match(migration, /raise exception 'REQUEST_AUDIT_IMMUTABLE'/);
  assert.match(migration, /raise exception 'LEAD_AUDIT_IMMUTABLE'/);
});

test('redaction RPC is gated and account deletion calls the ungated helper', () => {
  assert.match(migration, /create or replace function public\.redact_audit_subject_pii\(p_subject_email text\)/i);
  assert.match(migration, /create or replace function public\.admin_redact_audit_subject_pii\(p_subject_email text\)/i);
  assert.match(migration, /raise exception 'ADMIN_ONLY'/);
  assert.match(migration, /grant execute on function public\.admin_redact_audit_subject_pii\(text\)[\s\S]*to authenticated, service_role/i);
  assert.match(
    migration,
    /revoke all on function public\.redact_audit_subject_pii\(text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /perform public\.redact_audit_subject_pii\(v_email\)/);
  assert.match(migration, /values \('audit_subject_pii_redaction'\)/i);
});
