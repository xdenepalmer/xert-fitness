import assert from 'node:assert/strict';
import test from 'node:test';

import { leadMutationError, normalizeLeadPage, normalizeLeadSearch, normalizeLeadUpdate, selectedLeadIds, validateLeadMutation } from '../src/lib/adminLeads.js';
import { collectAdminBatches, collectAdminPages } from '../src/lib/adminPagination.js';

test('normalizes lead search text before building a PostgREST or filter', () => {
  assert.equal(normalizeLeadSearch('  Alex, (Runner)  '), 'Alex Runner');
  assert.equal(normalizeLeadSearch("coach+one@example.com"), 'coach+one@example.com');
  assert.equal(normalizeLeadSearch('a'.repeat(120)).length, 100);
});

test('collects count-less RPC batches until the first short page', async () => {
  const requested = [];
  const rows = await collectAdminBatches(async (page, size) => {
    requested.push([page, size]);
    return page === 1 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'c' }];
  }, 2);

  assert.deepEqual(requested, [[1, 2], [2, 2]]);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c']);
  await assert.rejects(() => collectAdminBatches(async () => null, 2), /invalid batch/);
});

test('normalizes bounded one-based lead pages into Supabase ranges', () => {
  assert.deepEqual(normalizeLeadPage(3, 50), { page: 3, pageSize: 50, from: 100, to: 149 });
  assert.deepEqual(normalizeLeadPage(), { page: 1, pageSize: 50, from: 0, to: 49 });
  assert.throws(() => normalizeLeadPage(0, 50), /positive number/);
  assert.throws(() => normalizeLeadPage(1, 101), /between 1 and 100/);
});

test('collects every filtered lead page for a complete CSV export', async () => {
  const pages = [
    { rows: [{ id: 'a' }, { id: 'b' }], total: 3 },
    { rows: [{ id: 'c' }], total: 3 },
  ];
  const requested = [];
  const rows = await collectAdminPages(async page => {
    requested.push(page);
    return pages[page - 1];
  });

  assert.deepEqual(requested, [1, 2]);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c']);
  await assert.rejects(() => collectAdminPages(async () => ({ rows: null, total: 1 })), /invalid page/);
  await assert.rejects(() => collectAdminPages(async () => ({ rows: [], total: 1 })), /stopped after 0 of 1/);
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

test('turns atomic lead workflow failures into actionable admin messages', () => {
  assert.match(leadMutationError({ code: 'PGRST202', message: 'admin_update_lead not found' }).message, /migration/);
  assert.match(leadMutationError({ message: 'LEAD_SELECTION_STALE' }).message, /Refresh/);
  assert.match(leadMutationError({ message: 'LEAD_NOT_FOUND' }).message, /no longer exists/);
  assert.match(leadMutationError({ message: 'ADMIN_REQUIRED' }).message, /session has expired/);
});
