import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('staff-assisted booking is atomic, FIFO-safe, retry-safe and private', async () => {
  const paths = [
    '../src/supabase/staff_assisted_booking_upgrade.sql',
    '../supabase/migrations/20260727010000_staff_assisted_booking.sql',
  ];

  for (const path of paths) {
    const sql = await read(path);
    assert.match(sql, /admin_staff_booking_receipts[\s\S]*request_id uuid primary key/i);
    assert.match(sql, /booking_status text not null check \(booking_status in \('confirmed', 'waitlisted'\)\)/i);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /using \(public\.is_admin\(\)\)/i);
    assert.match(sql, /create or replace function public\.admin_book_member_into_class/i);
    assert.match(sql, /set search_path = public, pg_temp/i);
    assert.match(sql, /if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/i);
    assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_request_id::text, 0\)\)/i);
    assert.match(sql, /STAFF_BOOKING_REQUEST_CONFLICT/i);
    assert.match(sql, /from public\.class_sessions session[\s\S]*for update/i);
    assert.match(sql, /coalesce\(v_end, v_start \+ interval '3 hours'\) <= now\(\)/i);
    assert.match(sql, /v_capacity is null or v_capacity < 1/i);
    assert.match(sql, /profile\.role = 'member'[\s\S]*MEMBER_NOT_BOOKABLE/i);
    assert.match(sql, /MEMBER_ALREADY_ON_ROSTER/i);
    assert.match(sql, /v_active_count >= v_capacity[\s\S]*or v_has_waitlist[\s\S]*v_booking_status := 'waitlisted'/i);
    assert.match(sql, /order by batch\.expires_at asc nulls last, batch\.created_at asc[\s\S]*for update/i);
    assert.match(sql, /MEMBER_HAS_NO_CREDITS/i);
    assert.match(sql, /set remaining = remaining - 1/i);
    assert.match(sql, /insert into public\.session_bookings[\s\S]*v_booking_status/i);
    assert.match(sql, /'targeted',[\s\S]*'staff_booking',[\s\S]*v_booking_id/i);
    assert.match(sql, /insert into public\.member_announcement_targets/i);
    assert.match(sql, /insert into public\.admin_staff_booking_receipts/i);
    assert.match(sql, /revoke execute on function public\.admin_book_member_into_class\(uuid, uuid, uuid\)[\s\S]*from public, anon/i);
    assert.match(sql, /values \('staff_assisted_booking'\)/i);
  }
});

test("native Today's classes can safely add and notify an existing member", async () => {
  const [models, api, store, view, publisher, readiness] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../api/admin-publish-announcement.js'),
    read('../src/supabase/release_readiness_check.sql'),
  ]);

  assert.match(models, /struct AdminStaffBookingReceipt: Codable, Hashable/);
  assert.match(models, /struct AdminStaffBookingFeedback: Equatable/);
  assert.match(models, /case "staff_booking": return "Staff-assisted booking"/);
  assert.match(models, /"staff_assisted_booking"/);
  assert.match(api, /func adminBookMemberIntoClass\(/);
  assert.match(api, /path: "admin_book_member_into_class"/);
  assert.match(api, /receipt\.request_id == requestID/);
  assert.match(api, /action: "notify_targeted_announcement"/);
  assert.match(store, /func bookMemberIntoClass\(/);
  assert.match(store, /requestedRosterSessionID == classSessionID[\s\S]*loadedRosterSessionID == classSessionID/);
  assert.match(store, /rosterLoadErrorSessionID != classSessionID/);
  assert.match(store, /MEMBER_HAS_NO_CREDITS/);
  assert.match(store, /BOOKING_TIME_CONFLICT/);
  assert.match(store, /MEMBER_NOT_BOOKABLE/);
  assert.match(store, /loadClassRoster\([\s\S]*preserveCurrent: true/);
  assert.match(view, /Label\("Add existing member", systemImage: "person\.badge\.plus"\)/);
  assert.match(view, /private struct AdminRosterMemberPicker: View/);
  assert.match(view, /\.searchable\(text: \$query, prompt: "Name, email or phone"\)/);
  assert.match(view, /existingMemberIDs\.contains\(member\.id\)/);
  assert.match(view, /member\.role\.lowercased\(\) == "member"/);
  assert.match(view, /requestID: requestID/);
  assert.match(view, /Otherwise the member joins the FIFO waitlist without using a credit/);
  assert.match(view, /\.interactiveDismissDisabled\(admin\.addingRosterMemberID != nil\)/);
  assert.match(publisher, /'staff_booking'/);
  assert.match(readiness, /'staff_assisted_booking', 'supabase\/migrations\/20260727010000_staff_assisted_booking\.sql'/);
});
