import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const paths = [
  '../src/supabase/rls_policies.sql',
  '../src/supabase/rls_hardening.sql',
  '../src/supabase/public_form_integrity_upgrade.sql',
];

const policyExpectations = [
  ['member_interest', "status = 'new'"],
  ['trainer_interest', "status = 'new'"],
  ['partner_interest', "status = 'new'"],
  ['class_bookings', "status = 'requested'"],
  ['private_session_requests', "status = 'requested'"],
];

test('every public-form policy path enforces initial state and contact consent', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    for (const [table, statusCheck] of policyExpectations) {
      const start = sql.indexOf(`create policy "public_insert_${table}"`);
      const end = sql.indexOf(';', start);
      const policy = sql.slice(start, end);
      assert.ok(start >= 0 && end > start, `${path} must recreate ${table} public insert policy`);
      assert.match(policy, new RegExp(statusCheck.replace(/[()]/g, '\\$&'), 'i'));
      assert.match(policy, /consent_to_contact is true/i);
    }
  }
});

test('the production integrity upgrade registers a release capability', async () => {
  const sql = await readFile(new URL('../src/supabase/public_form_integrity_upgrade.sql', import.meta.url), 'utf8');
  assert.match(sql, /values \('public_form_integrity'\)/i);
  assert.match(sql, /xert_public_capabilities/i);
});
