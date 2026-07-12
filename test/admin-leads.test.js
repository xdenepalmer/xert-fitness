import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeLeadSearch, normalizeLeadUpdate, selectedLeadIds, validateLeadMutation } from '../src/lib/adminLeads.js';

test('normalizes lead search text before building a PostgREST or filter', () => {
  assert.equal(normalizeLeadSearch('  Alex, (Runner)  '), 'Alex Runner');
  assert.equal(normalizeLeadSearch("coach+one@example.com"), 'coach+one@example.com');
  assert.equal(normalizeLeadSearch('a'.repeat(120)).length, 100);
});

test('allows only known lead tables and statuses for CRM mutations', () => {
  assert.deepEqual(validateLeadMutation('member_interest', 'joined', [' lead-a ', 'lead-a']), {
    table: 'member_interest', status: 'joined', ids: ['lead-a'],
  });
  assert.throws(() => validateLeadMutation('profiles', 'admin', ['user-a']), /Unsupported lead type/);
  assert.throws(() => validateLeadMutation('trainer_interest', 'joined', ['lead-a']), /Invalid trainer lead status/);
  assert.throws(() => validateLeadMutation('partner_interest', 'approved', ['']), /invalid ID/);
});

test('creates an explicit bounded lead update payload', () => {
  assert.deepEqual(normalizeLeadUpdate('partner_interest', {
    status: 'meeting', admin_notes: ' Follow up Tuesday. ', role: 'admin',
  }), {
    table: 'partner_interest',
    updates: { status: 'meeting', admin_notes: 'Follow up Tuesday.' },
  });
  assert.throws(() => normalizeLeadUpdate('member_interest', {
    status: 'warm', admin_notes: 'x'.repeat(5001),
  }), /5,000 characters/);
});

test('adds and removes lead selections without mutating the current set', () => {
  const current = new Set(['lead-a']);
  const added = selectedLeadIds(current, 'lead-b', true);
  const removed = selectedLeadIds(added, 'lead-a', false);

  assert.deepEqual([...current], ['lead-a']);
  assert.deepEqual([...added], ['lead-a', 'lead-b']);
  assert.deepEqual([...removed], ['lead-b']);
});
