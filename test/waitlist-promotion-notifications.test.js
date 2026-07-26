import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('waitlist promotion is retry-safe and creates the private notice atomically', () => {
  for (const path of [
    '../src/supabase/waitlist_promotion_notifications_upgrade.sql',
    '../supabase/migrations/20260721030000_waitlist_promotion_notifications.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /waitlist_promotion_receipts[\s\S]*request_id uuid primary key/i);
    assert.match(sql, /booking_id uuid not null unique/i);
    assert.match(sql, /admin_promote_next_waitlisted_with_notice\([\s\S]*p_expected_booking_id uuid[\s\S]*p_request_id uuid/i);
    assert.match(sql, /receipt\.request_id = p_request_id[\s\S]*receipt\.booking_id = p_expected_booking_id/i);
    assert.match(sql, /for update[\s\S]*WAITLIST_CHANGED/i);
    assert.match(sql, /admin_set_booking_status\(v_booking_id, 'confirmed'\)/i);
    assert.match(sql, /insert into public\.member_announcements[\s\S]*'waitlist_promotion', v_booking_id/i);
    assert.match(sql, /insert into public\.member_announcement_targets/i);
    assert.match(sql, /insert into public\.waitlist_promotion_receipts/i);
    assert.match(sql, /revoke all on table public\.waitlist_promotion_receipts from public, anon, authenticated/i);
    assert.match(sql, /grant select on table public\.waitlist_promotion_receipts to authenticated/i);
    assert.match(sql, /grant execute on function public\.admin_promote_next_waitlisted\(uuid\) to authenticated/i);
    assert.match(sql, /values \('waitlist_promotion_notifications'\)/i);
  }
});

test('web promotion confirms the exact FIFO member and reports durable notification outcome', () => {
  const data = read('../src/lib/adminData.js');
  const view = read('../src/components/admin/ClassCalendarAdmin.jsx');
  const publisher = read('../api/admin-publish-announcement.js');
  assert.match(data, /admin_promote_next_waitlisted_with_notice/);
  assert.match(data, /p_expected_booking_id: mutation\.expectedBookingId/);
  assert.match(data, /p_request_id: mutation\.requestId/);
  assert.match(data, /notifyTargetedAnnouncementPush\(promotion\.announcement_id\)/);
  assert.match(publisher, /\.in\('source_kind', \['member_direct', 'waitlist_promotion', 'booking_decision'\]\)/);
  assert.match(view, /Confirm and notify this member/);
  assert.match(view, /Their earliest-expiring credit will be reserved and a private member notice will be created/);
  assert.match(view, /Member promoted and notified/);
  // Desk refresh must not rewrite a successful promote+notify as "Promotion paused".
  const promoteHandler = view.slice(
    view.indexOf('const handlePromoteNext'),
    view.indexOf('const handleSkipWaitlistHead'),
  );
  assert.match(promoteHandler, /Member promoted and notified/);
  assert.match(promoteHandler, /Waitlist refresh needed/);
  assert.ok(
    promoteHandler.indexOf('Member promoted and notified')
      < promoteHandler.indexOf('refreshWaitlistOverview'),
    'success toast must fire before the desk refresh',
  );
});

test('native promotion carries the same expected-member, receipt and push contract', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const store = read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const view = read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  assert.match(api, /admin_promote_next_waitlisted_with_notice/);
  assert.match(api, /p_expected_booking_id: expectedBookingID/);
  assert.match(api, /p_request_id: requestID/);
  assert.match(api, /notify_targeted_announcement/);
  assert.match(store, /promotionNoticeWarning = outcome\.warning/);
  assert.match(view, /expectedBookingID: item\.next_booking_id/);
  assert.match(view, /creates a private member notice/);
  const promoteFn = store.slice(
    store.indexOf('func promoteNext('),
    store.indexOf('func skipWaitlistHead('),
  );
  assert.match(promoteFn, /The member was promoted\. Reload the waitlist before the next action\./);
  assert.match(promoteFn, /return true/);
  assert.ok(
    promoteFn.indexOf('promotionNoticeWarning = outcome.warning')
      < promoteFn.indexOf('adminWaitlist'),
    'promotion success must be recorded before the waitlist refresh',
  );
});
