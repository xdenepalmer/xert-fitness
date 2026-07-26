import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  blankAttendanceDraft,
  createAttendanceDraft,
  markAllAttendance,
  summarizeAttendanceDraft,
} from '../src/lib/attendanceDraft.js';

const freshSchema = await readFile(new URL('../src/supabase/admin_cms_schema.sql', import.meta.url), 'utf8');
const upgradeSchema = await readFile(new URL('../src/supabase/attendance_roll_call_upgrade.sql', import.meta.url), 'utf8');
const requestGuardMigration = await readFile(new URL('../supabase/migrations/20260727020000_attendance_request_resolution_guard.sql', import.meta.url), 'utf8');
const adminData = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
const classCalendar = await readFile(new URL('../src/components/admin/ClassCalendarAdmin.jsx', import.meta.url), 'utf8');

test('fresh and upgrade database paths install the audited roll-call RPC', () => {
  for (const source of [freshSchema, upgradeSchema]) {
    assert.match(source, /admin_record_session_attendance\s*\(/i);
    assert.match(source, /attendance_marked_at\s*=\s*now\(\)/i);
    assert.match(source, /attendance_marked_by\s*=\s*auth\.uid\(\)/i);
    assert.match(source, /p_attended_ids\s*&&\s*p_no_show_ids/i);
    assert.match(source, /INCOMPLETE_ROLL_CALL/i);
    assert.match(source, /PENDING_BOOKING_REQUESTS/i);
    assert.match(source, /SESSION_NOT_STARTED/i);
    assert.match(source, /'published', 'full', 'completed'/i);
    assert.match(source, /set status = 'completed', public_visible = false/i);
    assert.match(source, /revoke execute on function public\.admin_record_session_attendance\(uuid, uuid\[\], uuid\[\]\) from public, anon/i);
    assert.match(source, /grant execute on function public\.admin_record_session_attendance\(uuid, uuid\[\], uuid\[\]\) to authenticated/i);
    assert.match(source, /values \('attendance_roll_call'\)/i);
  }
});

test('production roll-call upgrade atomically guards unresolved booking requests', () => {
  assert.match(requestGuardMigration, /from public\.class_sessions where id = p_session_id for update/i);
  assert.match(requestGuardMigration, /status\s*=\s*'requested'\s*[\r\n]+\s*for update/i);
  assert.match(requestGuardMigration, /raise exception 'PENDING_BOOKING_REQUESTS'/i);
  assert.match(requestGuardMigration, /values \('attendance_request_resolution_guard'\)/i);
});

test('admin roll call sends one bounded RPC and exposes complete attendance controls', () => {
  const rpcBlock = adminData.slice(
    adminData.indexOf('export async function adminRecordSessionAttendance'),
    adminData.indexOf('// ─── Orders (admin)'),
  );
  assert.match(rpcBlock, /normalizeSessionAttendanceMutation/);
  assert.match(rpcBlock, /supabase\.rpc\('admin_record_session_attendance'/);
  assert.match(rpcBlock, /p_attended_ids: mutation\.attendedIds/);
  assert.match(rpcBlock, /p_no_show_ids: mutation\.noShowIds/);
  assert.match(classCalendar, /Take attendance/);
  assert.match(classCalendar, /aria-pressed=\{attendanceDraft\[member\.booking_id\] === 'attended'\}/);
  assert.match(classCalendar, /aria-pressed=\{attendanceDraft\[member\.booking_id\] === 'no_show'\}/);
  assert.match(classCalendar, /Mark all present/);
  assert.match(classCalendar, /Clear marks/);
  assert.match(classCalendar, /pendingAttendanceRequests\.length > 0/);
  assert.match(classCalendar, /Resolve pending booking requests first/);
  assert.match(classCalendar, /disabled=\{isSavingAttendance \|\| !attendanceSummary\.complete \|\| pendingAttendanceRequests\.length > 0\}/);
  assert.match(classCalendar, /'Save attendance'/);
});

test('new roll calls preserve recorded marks but leave confirmed members explicit', () => {
  const roster = [
    { booking_id: 'confirmed', status: 'confirmed' },
    { booking_id: 'present', status: 'attended' },
    { booking_id: 'absent', status: 'no_show' },
    { booking_id: 'waiting', status: 'waitlisted' },
    { booking_id: 'confirmed', status: 'confirmed' },
  ];

  assert.deepEqual(createAttendanceDraft(roster), {
    confirmed: '',
    present: 'attended',
    absent: 'no_show',
  });
  assert.deepEqual(blankAttendanceDraft(roster), { confirmed: '', present: '', absent: '' });
  assert.deepEqual(markAllAttendance(roster), {
    confirmed: 'attended',
    present: 'attended',
    absent: 'attended',
  });
});

test('attendance progress is incomplete until every eligible booking is explicitly marked', () => {
  const roster = [
    { booking_id: 'one', status: 'confirmed' },
    { booking_id: 'two', status: 'confirmed' },
  ];
  assert.deepEqual(summarizeAttendanceDraft(roster, { one: 'attended' }), {
    members: roster,
    entries: [
      { bookingId: 'one', status: 'attended' },
      { bookingId: 'two', status: '' },
    ],
    total: 2,
    attended: 1,
    noShow: 0,
    marked: 1,
    unmarked: 1,
    complete: false,
  });
  assert.equal(summarizeAttendanceDraft(roster, markAllAttendance(roster)).complete, true);
  assert.throws(() => markAllAttendance(roster, 'confirmed'), /attended or no show/);
});
