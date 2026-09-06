import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('confirming a request into a full class asks before overselling', async () => {
  const [table, data, migration] = await Promise.all([
    read('../src/components/admin/BookingRequestsTable.jsx'),
    read('../src/lib/adminData.js'),
    read('../supabase/migrations/20260906010000_booking_integrity_overhaul.sql'),
  ]);

  // The database refuses the oversell rather than writing it silently.
  assert.match(migration, /p_allow_overbook boolean default false/);
  assert.match(migration, /and v_capacity is not null and v_taken >= v_capacity then\s*\n\s*raise exception 'CLASS_FULL'/);
  assert.match(data, /p_allow_overbook: allowOverbook === true/);

  // And the owner can still decide to squeeze someone in.
  assert.match(table, /setOverbook\(\{ booking, status, reason: e\.message \}\)/);
  assert.match(table, /confirmLabel="Squeeze them in"/);
  assert.match(table, /allowOverbook: true/);
});

test('the queue shows the room before asking staff to decide about it', async () => {
  const table = await read('../src/components/admin/BookingRequestsTable.jsx');
  assert.match(table, /adminClassCapacity\(\)/);
  assert.match(table, /classCapacityLine\(capacityById\[b\.class_session_id\]\)/);
  // Both loaders have to carry the class id and capacity for that lookup.
  const data = await read('../src/lib/adminData.js');
  assert.match(data, /class_session_id, class_sessions\(title, start_time, coach_name, location_zone, capacity, booking_mode\)/);
});

test('one decision no longer freezes every button in the queue', async () => {
  const table = await read('../src/components/admin/BookingRequestsTable.jsx');
  assert.doesNotMatch(table, /disabled=\{Boolean\(updatingKey\)\}/);
  assert.match(table, /disabled=\{updatingKey === bookingActionKey\(b\)\}/);
});

test('a status change that changed nothing says so', async () => {
  const [table, data] = await Promise.all([
    read('../src/components/admin/BookingRequestsTable.jsx'),
    read('../src/lib/adminData.js'),
  ]);
  // admin_update_request returns null when the row already had that status.
  assert.match(data, /return \{ changed: Boolean\(data\), auditId: data \|\| null \}/);
  assert.match(table, /result\.changed === false/);
  assert.match(table, /Already up to date/);
});

test('older unanswered requests are surfaced instead of quietly filtered away', async () => {
  const table = await read('../src/components/admin/BookingRequestsTable.jsx');
  assert.match(table, /hiddenByDate > 0 && \(/);
  assert.match(table, /hidden by the date filter/);
  assert.match(table, /onClick=\{\(\) => setDaysFilter\('all'\)\}/);
});
