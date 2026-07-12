import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const freshSchema = await readFile(new URL('../src/supabase/admin_cms_schema.sql', import.meta.url), 'utf8');
const upgradeSchema = await readFile(new URL('../src/supabase/attendance_roll_call_upgrade.sql', import.meta.url), 'utf8');
const adminData = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
const classCalendar = await readFile(new URL('../src/components/admin/ClassCalendarAdmin.jsx', import.meta.url), 'utf8');

test('fresh and upgrade database paths install the audited roll-call RPC', () => {
  for (const source of [freshSchema, upgradeSchema]) {
    assert.match(source, /admin_record_session_attendance\s*\(/i);
    assert.match(source, /attendance_marked_at\s*=\s*now\(\)/i);
    assert.match(source, /attendance_marked_by\s*=\s*auth\.uid\(\)/i);
    assert.match(source, /p_attended_ids\s*&&\s*p_no_show_ids/i);
    assert.match(source, /INCOMPLETE_ROLL_CALL/i);
    assert.match(source, /SESSION_NOT_STARTED/i);
    assert.match(source, /'published', 'full', 'completed'/i);
    assert.match(source, /set status = 'completed', public_visible = false/i);
    assert.match(source, /revoke execute on function public\.admin_record_session_attendance\(uuid, uuid\[\], uuid\[\]\) from public, anon/i);
    assert.match(source, /grant execute on function public\.admin_record_session_attendance\(uuid, uuid\[\], uuid\[\]\) to authenticated/i);
    assert.match(source, /values \('attendance_roll_call'\)/i);
  }
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
  assert.match(classCalendar, /'Save attendance'/);
});
