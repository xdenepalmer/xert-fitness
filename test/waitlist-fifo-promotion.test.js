import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeSessionPromotion } from '../src/lib/adminRequests.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('promotion requests require an explicit session record', () => {
  assert.deepEqual(normalizeSessionPromotion(' session-id ', ' booking-id ', ' request-id '), {
    sessionId: 'session-id', expectedBookingId: 'booking-id', requestId: 'request-id'
  });
  assert.throws(() => normalizeSessionPromotion(''), /request record is required/i);
  assert.throws(() => normalizeSessionPromotion('session-id', ''), /request record is required/i);
});

for (const path of [
  '../src/supabase/admin_cms_schema.sql',
  '../src/supabase/booking_modes_upgrade.sql',
  '../src/supabase/waitlist_fifo_promotion_upgrade.sql'
]) {
  test(`${path} enforces atomic FIFO waitlist promotion`, () => {
    const sql = read(path);
    const statusFunction = sql.slice(
      sql.indexOf('create or replace function public.admin_set_booking_status'),
      sql.indexOf('end; $$;', sql.indexOf('create or replace function public.admin_set_booking_status'))
    );
    const promotionFunction = sql.slice(
      sql.indexOf('create or replace function public.admin_promote_next_waitlisted'),
      sql.indexOf('end; $$;', sql.indexOf('create or replace function public.admin_promote_next_waitlisted'))
    );

    assert.match(sql, /session_bookings_waitlist_order_idx[\s\S]*class_session_id, created_at, id[\s\S]*status = 'waitlisted'/i);
    assert.match(
      statusFunction,
      /p_status in \('requested', 'confirmed'\)[\s\S]*v_current not in \('requested', 'confirmed'(?:, 'attended', 'no_show')?\)[\s\S]*order by created_at, id[\s\S]*WAITLIST_ORDER_REQUIRED/i,
    );
    assert.match(promotionFunction, /if not public\.is_admin\(\)/i);
    assert.match(promotionFunction, /status = 'waitlisted'[\s\S]*order by created_at, id[\s\S]*for update/i);
    assert.match(promotionFunction, /admin_set_booking_status\(v_booking_id, 'confirmed'\)/i);
    assert.match(promotionFunction, /WAITLIST_MEMBER_NO_CREDITS/i);
    assert.match(sql, /revoke execute on function public\.admin_promote_next_waitlisted\(uuid\) from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_promote_next_waitlisted\(uuid\)\s+to authenticated/i);
    assert.doesNotMatch(promotionFunction, /from public\.class_sessions/i);
  });
}

test('member booking RPC returns a stable one-based waitlist position', () => {
  for (const path of ['../src/supabase/booking_schema.sql', '../src/supabase/waitlist_fifo_promotion_upgrade.sql']) {
    const sql = read(path);
    const memberBookings = sql.slice(sql.indexOf('function public.my_bookings'), sql.indexOf('$$;', sql.indexOf('function public.my_bookings')));
    assert.match(memberBookings, /waitlist_position bigint/i);
    assert.match(memberBookings, /select count\(\*\) \+ 1/i);
    assert.match(memberBookings, /earlier\.status = 'waitlisted'/i);
    assert.match(memberBookings, /\(earlier\.created_at, earlier\.id\) < \(b\.created_at, b\.id\)/i);
  }
});

test('every booking path reserves an open place for the existing queue', () => {
  for (const path of [
    '../src/supabase/booking_schema.sql',
    '../src/supabase/booking_modes_upgrade.sql',
    '../src/supabase/waitlist_fifo_promotion_upgrade.sql'
  ]) {
    const sql = read(path);
    assert.match(sql, /function public\.enforce_session_waitlist_fifo/i);
    assert.match(sql, /before insert or update of status on public\.session_bookings/i);
    assert.match(sql, /old\.status = 'waitlisted' and new\.id = v_first_waitlisted/i);
    assert.match(sql, /raise exception 'WAITLIST_PRIORITY'/i);
    assert.match(sql, /revoke execute on function public\.enforce_session_waitlist_fifo\(\) from public, anon, authenticated/i);
    const availability = sql.slice(sql.indexOf('function public.sessions_with_availability'), sql.indexOf('$$;', sql.indexOf('function public.sessions_with_availability')));
    assert.match(availability, /waiting\.status = 'waitlisted'[\s\S]*then 0/i);
  }
});

test('waitlist joining remains available behind an existing queue even when a seat opens', () => {
  for (const path of [
    '../src/supabase/booking_schema.sql',
    '../src/supabase/booking_modes_upgrade.sql',
    '../src/supabase/member_waitlist_upgrade.sql',
    '../src/supabase/waitlist_fifo_promotion_upgrade.sql'
  ]) {
    const sql = read(path);
    const join = sql.slice(sql.indexOf('function public.join_session_waitlist'), sql.indexOf('end; $$;', sql.indexOf('function public.join_session_waitlist')));
    assert.match(join, /v_booked < v_capacity and not exists[\s\S]*status = 'waitlisted'/i);
  }
});

test('admin, member web, and SwiftUI expose the FIFO workflow', () => {
  const adminData = read('../src/lib/adminData.js');
  const adminView = read('../src/components/admin/ClassCalendarAdmin.jsx');
  const webAccount = read('../src/pages/Account.jsx');
  const swiftModel = read('../ios/XertFitnessApp/XertFitnessApp/Models.swift');
  const swiftAccount = read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift');

  assert.match(adminData, /rpc\('admin_promote_next_waitlisted_with_notice'/);
  assert.match(adminView, /Promote next/);
  assert.match(adminView, /Waitlist position/);
  assert.match(adminView, /status === 'waitlisted'\) return \['waitlisted', 'cancelled'\]/);
  assert.match(webAccount, /waitlist_position/);
  assert.match(swiftModel, /waitlist_position: Int\?/);
  assert.match(swiftModel, /Waitlisted · #/);
  assert.match(swiftAccount, /booking\.stateLabel/);
});
