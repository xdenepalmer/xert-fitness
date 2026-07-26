import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('waitlist skip verifies the expected booking is still the waitlisted FIFO head', () => {
  for (const path of [
    '../src/supabase/waitlist_skip_concurrency_upgrade.sql',
    '../supabase/migrations/20260726110000_waitlist_skip_concurrency.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /admin_skip_waitlisted_head_with_notice\([\s\S]*p_expected_booking_id uuid[\s\S]*p_request_id uuid/i);
    assert.match(sql, /status is distinct from 'waitlisted'[\s\S]*BOOKING_NOT_WAITLISTED/i);
    assert.match(sql, /status = 'waitlisted'[\s\S]*order by booking\.created_at, booking\.id[\s\S]*for update/i);
    assert.match(sql, /v_booking_id is distinct from p_expected_booking_id[\s\S]*WAITLIST_CHANGED/i);
    assert.match(sql, /admin_set_booking_status_with_notice\(\s*p_expected_booking_id,\s*'cancelled',\s*p_request_id/i);
    assert.match(sql, /revoke execute on function public\.admin_skip_waitlisted_head_with_notice\(uuid, uuid, uuid\)\s+from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_skip_waitlisted_head_with_notice\(uuid, uuid, uuid\)\s+to authenticated/i);
    assert.match(sql, /values \('waitlist_skip_concurrency'\)/i);
  }
});

test('web skip uses the FIFO concurrency RPC and refreshes after a race', () => {
  const data = read('../src/lib/adminData.js');
  const view = read('../src/components/admin/ClassCalendarAdmin.jsx');
  const skip = data.slice(
    data.indexOf('export async function adminSkipWaitlistedHead'),
    data.indexOf('export async function adminRecordSessionAttendance')
  );

  assert.match(skip, /admin_skip_waitlisted_head_with_notice/);
  assert.match(skip, /p_expected_booking_id: mutation\.expectedBookingId/);
  assert.match(skip, /BOOKING_NOT_WAITLISTED\|WAITLIST_CHANGED/);
  assert.match(skip, /The queue changed before this skip\. Refresh and review the waitlist\./);
  assert.match(view, /adminSkipWaitlistedHead\(candidate\.session_id, candidate\.next_booking_id\)/);
  assert.doesNotMatch(view, /adminSetBookingStatus\(candidate\.next_booking_id, 'cancelled'\)/);
  const skipHandler = view.slice(
    view.indexOf('const handleSkipWaitlistHead'),
    view.indexOf('const handleDuplicate')
  );
  assert.match(skipHandler, /refreshWaitlistOverview\(\)/);
  assert.match(skipHandler, /Could not remove waitlisted member/);
});

test('native skip carries the same expected-member concurrency contract', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const store = read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const view = read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');

  assert.match(api, /admin_skip_waitlisted_head_with_notice/);
  assert.match(api, /p_expected_booking_id: expectedBookingID/);
  assert.match(store, /func skipWaitlistHead\(/);
  assert.match(store, /BOOKING_NOT_WAITLISTED/);
  assert.match(store, /The queue changed before this skip\. Refresh and review the waitlist\./);
  assert.match(view, /admin\.skipWaitlistHead\(/);
  assert.match(view, /expectedBookingID: item\.next_booking_id/);
  const skipDialog = view.slice(
    view.indexOf('Remove \\(skipCandidate'),
    view.indexOf('private func operationalLoadingRow')
  );
  assert.match(skipDialog, /skipWaitlistHead\(/);
  assert.doesNotMatch(skipDialog, /setBookingStatus\(/);
});
