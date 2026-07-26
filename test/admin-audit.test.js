import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  adminAuditCsvRows,
  adminAuditRangeStart,
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
  scheduleChanges: [
    {
      id: 'schedule-change-1', resource_type: 'class_session', resource_id: 'class-1',
      action: 'cancelled', changed_by: 'admin-1', subject_label: 'XERT Engine',
      previous_snapshot: { status: 'published', start_time: '2026-07-15T08:30:00Z' },
      new_snapshot: { status: 'cancelled', start_time: '2026-07-15T08:30:00Z' },
      created_at: '2026-07-13T20:00:00Z',
    },
  ],
  contentChanges: [
    {
      id: 'content-change-1', resource_type: 'site_content', resource_id: 'hero',
      action: 'updated', changed_by: 'admin-1', subject_label: 'hero',
      previous_snapshot: { key: 'hero', data: { headline: 'Train together', photos: ['old.jpg'] } },
      new_snapshot: { key: 'hero', data: { headline: 'Beat your best', photos: ['new.jpg'] } },
      created_at: '2026-07-13T21:00:00Z',
    },
  ],
  bookingChanges: [
    {
      id: 'booking-change-1', booking_id: 'booking-1', class_session_id: 'class-1', member_id: 'member-1',
      changed_by: 'admin-1', actor_role: 'admin', action: 'promoted', class_label: 'XERT Engine',
      previous_snapshot: { status: 'waitlisted', credit_batch_id: null },
      new_snapshot: { status: 'confirmed', credit_batch_id: 'batch-1' },
      created_at: '2026-07-13T22:00:00Z',
    },
  ],
};

test('computes a bounded server range while preserving explicit all-time history', () => {
  const now = new Date('2026-07-14T00:00:00Z');
  assert.equal(adminAuditRangeStart('30', now), '2026-06-14T00:00:00.000Z');
  assert.equal(adminAuditRangeStart('90', now), '2026-04-15T00:00:00.000Z');
  assert.equal(adminAuditRangeStart('all', now), null);
  assert.equal(adminAuditRangeStart('999999', now), '2016-07-16T00:00:00.000Z');
});

test('builds a newest-first audit ledger with resolved and durable fallback identities', () => {
  const events = buildAdminAuditEvents(records);
  assert.deepEqual(events.map(event => event.id), ['booking:booking-change-1', 'content:content-change-1', 'schedule:schedule-change-1', 'lead:lead-change-1', 'announcement:notice-event-1', 'request:request-change-1', 'credit:credit-1', 'role:role-1', 'credit:credit-2']);
  assert.equal(events[0].actor, 'Dene Palmer');
  assert.equal(events[0].subject, 'Alex Member');
  assert.match(events[0].summary, /Waitlist place promoted/);
  assert.match(events[0].detail, /waitlisted -> confirmed · Credit linked/);
  assert.equal(events[1].subject, 'hero');
  assert.match(events[1].summary, /Site content updated/);
  assert.match(events[1].detail, /headline, photos/);
  assert.equal(events[2].subject, 'XERT Engine');
  assert.match(events[2].summary, /Class session cancelled/);
  assert.equal(events[3].subject, 'Jordan Coach');
  assert.match(events[3].summary, /Trainer lead changed from reviewing to interview/);
  assert.equal(events[4].subject, 'Weekend session');
  assert.match(events[4].summary, /notice archived/);
  assert.equal(events[5].subject, 'Taylor Athlete');
  assert.match(events[5].summary, /PT request changed from requested to approved/);
  assert.equal(events[8].actor, 'Deleted user');
  assert.equal(events[8].subject, 'User deleted-');
});

test('filters by action, rolling range, and searchable reason or identity', () => {
  const events = buildAdminAuditEvents(records);
  const now = new Date('2026-07-14T00:00:00Z');
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'role', days: '30' }, now).map(event => event.id), ['role:role-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'request', days: '30' }, now).map(event => event.id), ['request:request-change-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'announcement', days: '30' }, now).map(event => event.id), ['announcement:notice-event-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'lead', days: '30' }, now).map(event => event.id), ['lead:lead-change-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'schedule', days: '30' }, now).map(event => event.id), ['schedule:schedule-change-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'content', days: '30' }, now).map(event => event.id), ['content:content-change-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { type: 'booking', days: '30' }, now).map(event => event.id), ['booking:booking-change-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { search: 'competition', days: 'all' }, now).map(event => event.id), ['credit:credit-1']);
  assert.deepEqual(filterAdminAuditEvents(events, { search: 'alex', days: 'all' }, now).map(event => event.id), ['booking:booking-change-1', 'credit:credit-1', 'role:role-1']);
});

test('labels service-driven booking lifecycle actions as system activity', () => {
  const events = buildAdminAuditEvents({
    bookingChanges: [{
      id: 'system-booking-change', booking_id: 'booking-2', member_id: 'member-1',
      changed_by: null, actor_role: 'system', action: 'cancelled', class_label: 'XERT Strength',
      previous_snapshot: { status: 'confirmed' }, new_snapshot: { status: 'cancelled' },
      created_at: '2026-07-13T23:00:00Z',
    }],
    profiles: records.profiles,
  });
  assert.equal(events[0].actor, 'System');
  assert.equal(events[0].subject, 'Alex Member');
});

test('summarises the filtered ledger and exports traceable IDs', () => {
  const events = buildAdminAuditEvents(records);
  assert.deepEqual(summarizeAdminAuditEvents(events), {
    total: 9,
    roleChanges: 1,
    creditGrants: 2,
    requestChanges: 1,
    announcementChanges: 1,
    leadChanges: 1,
    scheduleChanges: 1,
    contentChanges: 1,
    bookingChanges: 1,
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
  const scheduleRow = csv.find(row => row.action === 'Schedule change');
  assert.equal(scheduleRow.member_id, 'class-1');
  const contentRow = csv.find(row => row.action === 'Content change');
  assert.equal(contentRow.member_id, 'hero');
  const bookingRow = csv.find(row => row.action === 'Booking change');
  assert.equal(bookingRow.member_id, 'member-1');
  const creditRow = csv.find(row => row.action === 'Credit grant' && row.member_id === 'member-1');
  assert.equal(creditRow.detail, 'Competition prize');
});

test('admin audit loader pages every immutable source and resolves profiles in bounded batches', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function getAdminAuditRecords');
  const end = source.indexOf('// ─── Class rosters', start);
  const body = source.slice(start, end);
  assert.match(body, /collectAdminBatches/);
  assert.match(body, /adminAuditRangeStart\(days\)/);
  assert.match(body, /query\.gte\('created_at', cutoffIso\)/);
  assert.match(body, /admin_role_changes/);
  assert.match(body, /admin_credit_grants/);
  assert.match(body, /admin_request_status_changes/);
  assert.match(body, /member_announcement_admin_events/);
  assert.match(body, /admin_lead_changes/);
  assert.match(body, /admin_schedule_changes/);
  assert.match(body, /admin_content_changes/);
  assert.match(body, /session_booking_changes/);
  assert.match(body, /Promise\.allSettled/);
  assert.match(body, /getAuditProfiles/);
});

test('admin audit range changes reload safely without stale responses winning', async () => {
  const source = await readFile(new URL('../src/components/admin/AdminAuditLog.jsx', import.meta.url), 'utf8');
  assert.match(source, /const loadVersion = useRef\(0\)/);
  assert.match(source, /getAdminAuditRecords\(range\)/);
  assert.match(source, /version !== loadVersion\.current/);
  assert.match(source, /void load\(days\)/);
  assert.match(source, /\}, \[days\]\)/);
  assert.match(source, /disabled=\{loading \|\| exporting \|\| events\.length === 0\}/);
  assert.match(source, /const exportLockRef = useRef\(false\)/);
});
