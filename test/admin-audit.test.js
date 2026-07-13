import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  adminAuditCsvRows,
  buildAdminAuditEvents,
  filterAdminAuditEvents,
  summarizeAdminAuditEvents,
} from '../src/lib/adminAudit.js';

const records = {
  profiles: [
    { id: 'admin-1', full_name: 'Dene Palmer', email: 'dene@example.com' },
    { id: 'member-1', full_name: 'Alex Member', email: 'alex@example.com' },
  ],
  roleChanges: [
    { id: 'role-1', target_user_id: 'member-1', changed_by: 'admin-1', previous_role: 'member', new_role: 'admin', created_at: '2026-07-12T00:00:00Z' },
  ],
  creditGrants: [
    { id: 'credit-1', user_id: 'member-1', granted_by: 'admin-1', sessions: 4, note: 'Competition prize', created_at: '2026-07-13T00:00:00Z' },
    { id: 'credit-2', user_id: 'deleted-member', granted_by: null, sessions: 1, note: 'Service recovery', created_at: '2026-05-01T00:00:00Z' },
  ],
};

test('builds a newest-first audit ledger with resolved and durable fallback identities', () => {
  const events = buildAdminAuditEvents(records);
  assert.deepEqual(events.map(event => event.id), ['credit:credit-1', 'role:role-1', 'credit:credit-2']);
  assert.equal(events[0].actor, 'Dene Palmer');
  assert.equal(events[0].subject, 'Alex Member');
  assert.equal(events[2].actor, 'Deleted user');
  assert.equal(events[2].subject, 'User deleted-');
});

test('filters by action, rolling range, and searchable reason or identity', () => {
  const events = buildAdminAuditEvents(records);
  const now = new Date('2026-07-14T00:00:00Z');
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'role', days: '30' }, now).map(event => event.id), ['role:role-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { search: 'competition', days: 'all' }, now).map(event => event.id), ['credit:credit-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { search: 'alex', days: 'all' }, now).map(event => event.id), ['credit:credit-1', 'role:role-1']);
});

test('summarises the filtered ledger and exports traceable IDs', () => {
  const events = buildAdminAuditEvents(records);
  assert.deepEqual(summarizeAdminAuditEvents(events), {
    total: 3,
    roleChanges: 1,
    creditGrants: 2,
    creditsGranted: 5,
    activeAdmins: 1,
  });
  const csv = adminAuditCsvRows(events);
  assert.equal(csv[0].administrator_id, 'admin-1');
  assert.equal(csv[0].member_id, 'member-1');
  assert.equal(csv[0].detail, 'Competition prize');
});

test('admin audit loader pages both immutable sources and resolves profiles in bounded batches', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function getAdminAuditRecords');
  const end = source.indexOf('// ─── Class rosters', start);
  const body = source.slice(start, end);
  assert.match(body, /collectAdminBatches/);
  assert.match(body, /admin_role_changes/);
  assert.match(body, /admin_credit_grants/);
  assert.match(body, /Promise\.allSettled/);
  assert.match(body, /getAuditProfiles/);
});
