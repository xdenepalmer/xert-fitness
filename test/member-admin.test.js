import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { creditGrantValidationError, filterMembers } from '../src/lib/memberAdmin.js';

test('validates audited credit grant inputs before calling Supabase', () => {
  assert.equal(creditGrantValidationError({ sessions: 4, validityDays: 28, note: 'Cash sale' }), null);
  assert.match(creditGrantValidationError({ sessions: 0, validityDays: 28, note: 'Cash sale' }), /between 1 and 100/);
  assert.match(creditGrantValidationError({ sessions: 4, validityDays: -1, note: 'Cash sale' }), /0 to 3650/);
  assert.match(creditGrantValidationError({ sessions: 4, validityDays: 28, note: '' }), /reason/);
});

test('filters members by contact text, role, and available credits', () => {
  const members = [
    { id: 'a', full_name: 'Alex Runner', email: 'alex@example.com', phone: '0400', role: 'member', credits_remaining: 4 },
    { id: 'b', full_name: 'Sam Coach', email: 'sam@example.com', phone: '0500', role: 'admin', credits_remaining: 0 },
  ];
  assert.deepEqual(filterMembers(members, { search: '0400' }).map(member => member.id), ['a']);
  assert.deepEqual(filterMembers(members, { role: 'admin' }).map(member => member.id), ['b']);
  assert.deepEqual(filterMembers(members, { credit: 'available' }).map(member => member.id), ['a']);
});

test('credit grant migration keeps retries idempotent and grants auditable', () => {
  const sql = readFileSync(new URL('../src/supabase/credit_grant_audit_upgrade.sql', import.meta.url), 'utf8');
  assert.match(sql, /request_id uuid not null unique/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /if not public\.is_admin\(\)/i);
  assert.match(sql, /granted_by, sessions, validity_days, note, credit_batch_id/i);
  assert.match(sql, /grant execute on function public\.admin_grant_credits_v2/i);
});
