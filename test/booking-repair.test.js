import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const repair = () => read('../supabase/migrations/20260906020000_booking_overhaul_repair.sql');

test('the roll call accepts the roll calls deployed clients can actually send', async () => {
  const sql = await repair();
  // Completeness is measured over the member side, which every client can see.
  // Requiring the public side too meant no class holding a timetable sign-up
  // could be closed from the deployed web app or any installed phone.
  assert.match(sql, /if v_member_marked <> v_member_eligible then\s*\n\s*raise exception 'INCOMPLETE_ROLL_CALL';/);
  assert.match(sql, /select count\(\*\) into v_member_eligible\s*\n\s*from public\.session_bookings/);
  // A pending MEMBER request still blocks — it holds a credit this settles.
  assert.match(sql, /perform 1 from public\.session_bookings\s*\n\s*where class_session_id = p_session_id and status = 'requested'/);
  // A pending public enquiry does not: 'requested' is its resting state, so one
  // interest registration would have frozen that class's attendance forever.
  assert.doesNotMatch(sql, /perform 1 from public\.class_bookings\s*\n\s*where class_session_id = p_session_id and status = 'requested'/);
  // Public sign-ups are still marked when the client does send them.
  assert.match(sql, /update public\.class_bookings\s*\n\s*set status = case when id = any\(p_attended_ids\)/);
});

test('the shipped phone can register interest again', async () => {
  const sql = await repair();
  // Revoking anon's insert closed the only enquiry path an installed iOS build
  // has. A 'requested' row holds no place, so this cannot oversell anything.
  assert.match(sql, /create policy "public_insert_class_bookings" on public\.class_bookings/);
  assert.match(sql, /with check \(status = 'requested' and consent_to_contact is true\)/);
  assert.match(sql, /grant insert on table public\.class_bookings to anon;/);
  // Read access stays shut, so cancel tokens still cannot leak.
  assert.doesNotMatch(sql, /grant select on table public\.class_bookings to anon/);
  // And it is marked as the temporary measure it is.
  assert.match(sql, /Remove once every client submits through submit_class_signup/);
});

test('cancelling a class sends one email, not two contradictory ones', async () => {
  const sql = await repair();
  // Moving the class update first fixed the cancellation email, but left the
  // per-booking triggers firing afterwards with copy that reads as though the
  // person cancelled it themselves.
  const guards = sql.match(/if v_session\.status = 'cancelled' and new\.status = 'cancelled' then return new; end if;/g) || [];
  assert.equal(guards.length, 2, 'both the member and the public booking trigger are guarded');
  assert.match(sql, /create trigger email_on_session_booking_change/);
  assert.match(sql, /create trigger email_on_class_booking_change/);
});

test('what a stranger types cannot become markup in the owner inbox', async () => {
  const sql = await repair();
  assert.match(sql, /create or replace function public\.email_escape\(p_text text\)/);
  assert.match(sql, /'&', '&amp;'\), '<', '&lt;'\), '>', '&gt;'/);
  // The owner alert splices the visitor's own name, email and phone into HTML.
  assert.match(sql, /v_who text := public\.email_escape\(coalesce\(new\.full_name, new\.email\)\)/);
  assert.match(sql, /v_email text := public\.email_escape\(new\.email\)/);
  assert.match(sql, /v_phone text := public\.email_escape\(nullif\(new\.phone, ''\)\)/);
  assert.match(sql, /v_name := public\.email_escape\(v_name\)/);
});

test('joining the public waitlist puts someone in a queue that exists', async () => {
  const sql = await repair();
  // It used to write a plain 'requested' row: indistinguishable from an
  // ordinary enquiry, with no position and nothing calling it a waitlist.
  assert.match(sql, /if coalesce\(p_join_waitlist, false\) then[\s\S]{0,220}v_row_status := 'waitlisted';/);
  assert.match(sql, /'waitlisted', v_row_status = 'waitlisted'/);
  // Joining a queue twice is the same mistake as signing up twice.
  assert.match(sql, /existing\.status in \('requested', 'confirmed', 'waitlisted'\)/);
  // It still holds no place: only a confirmed row gets a release token.
  assert.match(sql, /'cancel_token', case when v_row_status = 'confirmed' then v_token else null end/);
});

test('the Command Centre counts both doors everywhere the owner looks', async () => {
  const [today, calendar, analytics] = await Promise.all([
    read('../src/components/admin/AdminToday.jsx'),
    read('../src/components/admin/ClassCalendarAdmin.jsx'),
    read('../src/lib/bookingAnalytics.js'),
  ]);
  // The Requested tile already added the public side; Confirmed and Waiting did
  // not, so a class the timetable filled read 0/8 on the first screen.
  assert.match(analytics, /export function classPlacesHeld\(operation\)/);
  assert.match(today, /classPlacesHeld\(focus\)/);
  assert.match(today, /Number\(focus\.waitlist_count \|\| 0\) \+ Number\(focus\.public_waitlist_count \|\| 0\)/);
  // Today offered a Roll call button that this then refused as "not ready".
  assert.match(calendar, /const roll = attendanceRoll\(members, requests\);/);
  assert.match(calendar, /createAttendanceDraft\(roll\)/);
  // "Class roster (0/8)" with a live Promote next, on a class that was full.
  assert.match(calendar, /const placesTaken = capacityById\[s\.id\]\?\.taken \?\? activeRosterCount;/);
  assert.match(calendar, /const hasOpenPlace = s\.capacity == null \|\| placesTaken < s\.capacity;/);
});
