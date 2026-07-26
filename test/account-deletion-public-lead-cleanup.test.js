import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260726108000_account_deletion_public_lead_cleanup.sql', import.meta.url),
  'utf8',
);
const upgrade = readFileSync(
  new URL('../src/supabase/account_deletion_public_lead_cleanup.sql', import.meta.url),
  'utf8',
);
const account = readFileSync(new URL('../src/pages/Account.jsx', import.meta.url), 'utf8');
const privacy = readFileSync(new URL('../src/pages/Privacy.jsx', import.meta.url), 'utf8');

test('operator mirror matches the lead-cleanup migration', () => {
  assert.equal(upgrade, migration);
});

test('delete_member_account removes email-matched leads and anonymous PT', () => {
  assert.match(migration, /create or replace function public\.delete_member_account\(p_user_id uuid\)/i);
  assert.match(migration, /member_interest/);
  assert.match(migration, /trainer_interest/);
  assert.match(migration, /partner_interest/);
  assert.match(migration, /delete from public\.private_session_requests\s+where lower\(btrim\(email\)\) = v_email/i);
  assert.match(migration, /redact_audit_subject_pii/);
  assert.match(migration, /values \('account_deletion_public_lead_cleanup'\)/i);
});

test('Account dialog and Privacy retention copy mention public leads and anonymous PT', () => {
  assert.match(account, /public interest or enquiry records matched to your email/);
  assert.match(account, /anonymous PT requests/);
  assert.match(privacy, /public interest or enquiry records matched to your account email/);
  assert.match(privacy, /anonymous PT requests/);
  assert.match(privacy, /notification device tokens/);
});
