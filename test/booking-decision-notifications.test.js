import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('staff booking decisions are atomic, retry-safe, and private', () => {
  for (const path of [
    '../src/supabase/booking_decision_notifications_upgrade.sql',
    '../supabase/migrations/20260722000000_booking_decision_notifications.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /booking_decision_receipts[\s\S]*request_id uuid primary key/i);
    assert.match(sql, /admin_set_booking_status_with_notice\([\s\S]*p_request_id uuid/i);
    assert.match(sql, /receipt\.request_id = p_request_id[\s\S]*BOOKING_DECISION_REQUEST_CONFLICT/i);
    assert.match(sql, /for update[\s\S]*admin_set_booking_status\(p_booking_id, p_status\)/i);
    assert.match(sql, /p_status in \('confirmed', 'waitlisted', 'declined', 'cancelled'\)/i);
    assert.match(sql, /insert into public\.member_announcements[\s\S]*'booking_decision', p_booking_id/i);
    assert.match(sql, /insert into public\.member_announcement_targets/i);
    assert.match(sql, /insert into public\.booking_decision_receipts/i);
    assert.match(sql, /user_id\) references auth\.users\(id\) on delete cascade/i);
    assert.match(sql, /decided_by uuid references auth\.users\(id\) on delete set null/i);
    assert.match(sql, /values \('booking_decision_notifications'\)/i);
  }

  // Operator + migration re-runs must not undo waitlist_skip_notice_accuracy notice copy.
  for (const path of [
    '../src/supabase/booking_decision_notifications_upgrade.sql',
    '../supabase/migrations/20260722000000_booking_decision_notifications.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /keeping newer admin_set_booking_status_with_notice/);
    assert.match(
      sql,
      /booking_decision_receipts_admin_read[\s\S]*using\s*\(\s*\(\s*select\s+public\.is_admin\s*\(\s*\)\s*\)\s*\)/i,
    );
  }
});

test('web booking decisions deliver targeted push after the durable receipt', () => {
  const data = read('../src/lib/adminData.js');
  const inbox = read('../src/components/admin/BookingRequestsTable.jsx');
  const roster = read('../src/components/admin/ClassCalendarAdmin.jsx');
  const publisher = read('../api/admin-publish-announcement.js');
  assert.match(data, /admin_set_booking_status_with_notice/);
  assert.match(data, /p_request_id: requestId/);
  assert.match(data, /notifyTargetedAnnouncementPush\(decision\.announcement_id\)/);
  assert.match(publisher, /'booking_decision'/);
  assert.match(inbox, /Booking updated and member notified/);
  assert.match(roster, /Booking updated and member notified/);
});

test('booking inbox status and notes lock against same-paint double submits', () => {
  const inbox = read('../src/components/admin/BookingRequestsTable.jsx');
  assert.match(inbox, /const updateLockRef = useRef\(false\)/);
  assert.match(inbox, /if \(updateLockRef\.current \|\| updatingKey \|\| bulkLockRef\.current \|\| bulkSaving\) return/);
  assert.match(inbox, /updateLockRef\.current = true/);
  assert.match(inbox, /const notesLockRef = useRef\(false\)/);
  assert.match(inbox, /if \(!selectedBooking \|\| notesLockRef\.current \|\| savingNotes\) return/);
});

test('native booking decisions use the same receipt and non-blocking push contract', () => {
  const models = read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift');
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const store = read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const view = read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  assert.match(models, /struct AdminBookingDecision: Codable, Hashable/);
  assert.match(api, /path: "admin_set_booking_status_with_notice"/);
  assert.match(api, /p_request_id: UUID\(\)/);
  assert.match(api, /notify_targeted_announcement/);
  assert.match(store, /bookingDecisionNoticeWarning = outcome\.warning/);
  assert.match(view, /Section\("Member notification"\)/);
});
