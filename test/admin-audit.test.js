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
  requestChanges: [
    {
      id: 'request-change-1', request_type: 'private_session', request_id: 'pt-1', changed_by: 'admin-1',
      previous_status: 'requested', new_status: 'approved', previous_admin_notes: null,
      new_admin_notes: 'Called member', subject_label: 'Taylor Athlete', subject_email: 'taylor@example.com',
      created_at: '2026-07-13T12:00:00Z',
    },
  ],
  announcementEvents: [
    {
      id: 'notice-event-1', announcement_id: 'notice-1', announcement_title: 'Weekend session',
      action: 'archived', actor_id: 'admin-1', created_at: '2026-07-13T18:00:00Z',
    },
  ],
  leadChanges: [
    {
      id: 'lead-change-1', lead_type: 'trainer', lead_id: 'trainer-1', changed_by: 'admin-1',
      previous_status: 'reviewing', new_status: 'interview', previous_admin_notes: null,
      new_admin_notes: 'Interview booked', subject_label: 'Jordan Coach', subject_email: 'jordan@example.com',
      created_at: '2026-07-13T19:00:00Z',
    },
  ],
};

test('builds a newest-first audit ledger with resolved and durable fallback identities', () => {
  const events = buildAdminAuditEvents(records);
  assert.deepEqual(events.map(event => event.id), ['lead:lead-change-1', 'announcement:notice-event-1', 'request:request-change-1', 'credit:credit-1', 'role:role-1', 'credit:credit-2']);
  assert.equal(events[0].actor, 'Dene Palmer');
  assert.equal(events[0].subject, 'Jordan Coach');
  assert.match(events[0].summary, /Trainer lead changed from reviewing to interview/);
  assert.equal(events[1].subject, 'Weekend session');
  assert.match(events[1].summary, /notice archived/);
  assert.equal(events[2].subject, 'Taylor Athlete');
  assert.match(events[2].summary, /PT request changed from requested to approved/);
  assert.equal(events[5].actor, 'Deleted user');
  assert.equal(events[5].subject, 'User deleted-');
});

test('filters by action, rolling range, and searchable reason or identity', () => {
  const events = buildAdminAuditEvents(records);
  const now = new Date('2026-07-14T00:00:00Z');
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'role', days: '30' }, now).map(event => event.id), ['role:role-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'request', days: '30' }, now).map(event => event.id), ['request:request-change-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'announcement', days: '30' }, now).map(event => event.id), ['announcement:notice-event-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'lead', days: '30' }, now).map(event => event.id), ['lead:lead-change-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { search: 'competition', days: 'all' }, now).map(event => event.id), ['credit:credit-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { search: 'alex', days: 'all' }, now).map(event => event.id), ['credit:credit-1', 'role:role-1']);
});

test('summarises the filtered ledger and exports traceable IDs', () => {
  const events = buildAdminAuditEvents(records);
  assert.deepEqual(summarizeAdminAuditEvents(events), {
    total: 6,
    roleChanges: 1,
    creditGrants: 2,
    requestChanges: 1,
    announcementChanges: 1,
    leadChanges: 1,
    creditsGranted: 5,
    activeAdmins: 1,
  });
  const csv = adminAuditCsvRows(events);
  assert.equal(csv[0].administrator_id, 'admin-1');
  const requestRow = csv.find(row => row.action === 'Request change');
  assert.equal(requestRow.member_id, 'pt-1');
  const noticeRow = csv.find(row => row.action === 'Announcement change');
  assert.equal(noticeRow.member_id, 'notice-1');
  const leadRow = csv.find(row => row.action === 'Lead change');
  assert.equal(leadRow.member_id, 'trainer-1');
  const creditRow = csv.find(row => row.action === 'Credit grant' && row.member_id === 'member-1');
  assert.equal(creditRow.detail, 'Competition prize');
});

test('admin audit loader pages every immutable source and resolves profiles in bounded batches', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function getAdminAuditRecords');
  const end = source.indexOf('// ─── Class rosters', start);
  const body = source.slice(start, end);
  assert.match(body, /collectAdminBatches/);
  assert.match(body, /admin_role_changes/);
  assert.match(body, /admin_credit_grants/);
  assert.match(body, /admin_request_status_changes/);
  assert.match(body, /member_announcement_admin_events/);
  assert.match(body, /admin_lead_changes/);
  assert.match(body, /Promise\.allSettled/);
  assert.match(body, /getAuditProfiles/);
});
