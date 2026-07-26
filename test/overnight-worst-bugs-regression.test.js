import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  inspectWebhookDeliveryGaps,
  paymentFulfillmentDeliveryIsHealthy,
} from '../api/checkout.js';
import {
  assertFulfillmentMatchesOrder,
  orderBuyerMatchesStripe,
  reconcileCheckoutOrder,
} from '../api/admin-reconcile-order.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const ORDER_ID = '6c7bc779-4e22-4f38-88af-c15f2f94ee5a';
const USER_ID = 'c5747dad-2e89-4d55-ad63-5732d8d67a60';
const PRODUCT_ID = '4d8177b3-6ae6-4f77-bb57-59315dc1ad81';
const NOW = new Date('2026-07-17T00:20:00.000Z');

/**
 * Integration-style regression for the three overnight store-killers:
 * 1) deleted-member fulfillment landed on a dead overload → ledger failed → kill switch
 * 2) empty ledger + historical/reconciled paid rows false-alarmed the kill switch
 * 3) waitlist Skip cancelled the wrong booking when the FIFO head raced
 */
test('deleted-member live overload settles without credits and does not claim a grant on reconcile', async () => {
  const overloadFix = read(
    '../supabase/migrations/20260726107000_stripe_fulfillment_deleted_member_overload_fix.sql',
  );
  const operator = read('../src/supabase/stripe_fulfillment_deleted_member_fix.sql');
  const webhook = read('../api/stripe-webhook.js');

  // Live RPC identity the webhook actually calls — not the retired p_expires_at overload.
  assert.match(webhook, /p_credit_validity_days:\s*fulfillment\.credit\.validity_days/);
  assert.doesNotMatch(webhook, /p_expires_at:/);
  for (const sql of [overloadFix, operator]) {
    assert.match(
      sql,
      /\(v_order\.user_id is not null and v_order\.user_id is distinct from p_user_id\)/,
    );
    assert.match(sql, /p_credit_validity_days integer/);
    assert.doesNotMatch(
      sql,
      /create or replace function public\.fulfill_stripe_checkout\([\s\S]*?p_expires_at timestamptz\s*\)/,
    );
  }

  assert.equal(orderBuyerMatchesStripe(null, USER_ID), true);
  const deletedOrder = {
    id: ORDER_ID,
    user_id: null,
    product_id: PRODUCT_ID,
    status: 'pending',
    amount_cents: 4800,
    currency: 'aud',
    credit_total: 4,
    credit_validity_days: 28,
    stripe_checkout_session_id: 'cs_deleted_buyer',
  };
  const fulfillment = {
    order: {
      stripe_checkout_session_id: 'cs_deleted_buyer',
      user_id: USER_ID,
      product_id: PRODUCT_ID,
      amount_cents: 4800,
      currency: 'aud',
    },
    credit: { total: 4, validity_days: 28 },
  };
  assert.doesNotThrow(() => assertFulfillmentMatchesOrder(deletedOrder, fulfillment));

  const admin = {
    async rpc() {
      return {
        data: [{ fulfilled_order_id: ORDER_ID, final_status: 'paid', credit_created: false }],
        error: null,
      };
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return { async single() { return { data: deletedOrder, error: null }; } };
            },
          };
        },
        update() {
          const query = {
            eq() { return query; },
            select() { return query; },
            async maybeSingle() {
              return { data: { id: ORDER_ID, status: 'paid' }, error: null };
            },
          };
          return query;
        },
      };
    },
  };
  const stripe = {
    checkout: {
      sessions: {
        async retrieve() {
          return {
            id: 'cs_deleted_buyer',
            mode: 'payment',
            payment_status: 'paid',
            status: 'complete',
            amount_total: 4800,
            currency: 'aud',
            customer_email: 'gone@example.com',
            payment_intent: 'pi_deleted_buyer',
            metadata: {
              xert_checkout_attempt_id: 'e8c03884-4c1b-4a96-97c1-b0a33f2095b3',
              user_id: USER_ID,
              product_id: PRODUCT_ID,
              sessions_count: '4',
              validity_days: '28',
            },
          };
        },
      },
    },
  };

  const result = await reconcileCheckoutOrder({
    admin, stripe, orderId: ORDER_ID, userId: 'admin-xert', now: NOW,
  });
  assert.equal(result.status, 'paid');
  assert.equal(result.credits_granted, 0);
  assert.equal(result.buyer_deleted, true);
  assert.equal(result.already_paid, false);
});

test('empty ledger kill-switch ignores reconciled recovery and historical paid rows', async () => {
  const calls = [];
  const admin = {
    from(table) {
      calls.push(['from', table]);
      if (table === 'stripe_webhook_signature_failures') {
        const query = {
          select() { return query; },
          gte(field, value) { calls.push(['sig-gte', field, value]); return query; },
          then(resolve) { return resolve({ data: null, count: 0, error: null }); },
        };
        return query;
      }
      if (table === 'stripe_webhook_events') {
        const query = {
          select() { return query; },
          in() { return query; },
          eq(field, value) { calls.push(['evt-eq', field, value]); return query; },
          lt() { return query; },
          order() { return query; },
          limit() {
            // Empty ledger: no webhook events ever recorded.
            return Promise.resolve({ data: [], error: null });
          },
          then(resolve) {
            return Promise.resolve({ count: 0, error: null }).then(resolve);
          },
        };
        return query;
      }
      assert.equal(table, 'orders');
      const query = {
        select() { return query; },
        eq(field, value) { calls.push(['ord-eq', field, value]); return query; },
        is(field, value) { calls.push(['ord-is', field, value]); return query; },
        gte(field, value) { calls.push(['ord-gte', field, value]); return query; },
        gt(field, value) { calls.push(['ord-gt', field, value]); return query; },
        then(resolve) {
          // Reconciled-only recoveries and aged paid rows must not count.
          return resolve({ data: null, count: 0, error: null });
        },
      };
      return query;
    },
  };

  const gaps = await inspectWebhookDeliveryGaps(admin, NOW);
  assert.equal(gaps.deliveryGap, false);
  assert.equal(gaps.probeFailed, false);
  assert.ok(calls.some(([method, field, value]) => method === 'ord-is' && field === 'reconciled_at' && value === null));
  assert.ok(calls.some(([method, field]) => method === 'ord-gte' && field === 'paid_at'));
  assert.ok(!calls.some(([method]) => method === 'ord-gt'));

  assert.equal(await paymentFulfillmentDeliveryIsHealthy(admin, NOW), true);

  // A live unreconciled paid row inside the 24h window still pauses checkout.
  const gappedAdmin = {
    from(table) {
      if (table === 'orders') {
        const query = {
          select() { return query; },
          eq() { return query; },
          is() { return query; },
          gte() { return query; },
          gt() { return query; },
          then(resolve) { return resolve({ data: null, count: 1, error: null }); },
        };
        return query;
      }
      return admin.from(table);
    },
  };
  assert.equal((await inspectWebhookDeliveryGaps(gappedAdmin, NOW)).deliveryGap, true);
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(gappedAdmin, NOW), false);
});

test('waitlist skip refuses to cancel when the expected booking is no longer FIFO head', () => {
  for (const path of [
    '../src/supabase/waitlist_skip_concurrency_upgrade.sql',
    '../supabase/migrations/20260726110000_waitlist_skip_concurrency.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /admin_skip_waitlisted_head_with_notice\([\s\S]*p_expected_booking_id uuid/i);
    assert.match(sql, /status = 'waitlisted'[\s\S]*order by booking\.created_at, booking\.id[\s\S]*for update/i);
    assert.match(sql, /v_booking_id is distinct from p_expected_booking_id[\s\S]*WAITLIST_CHANGED/i);
    assert.match(sql, /status is distinct from 'waitlisted'[\s\S]*BOOKING_NOT_WAITLISTED/i);
  }

  const data = read('../src/lib/adminData.js');
  const skip = data.slice(
    data.indexOf('export async function adminSkipWaitlistedHead'),
    data.indexOf('export async function adminRecordSessionAttendance'),
  );
  assert.match(skip, /admin_skip_waitlisted_head_with_notice/);
  assert.match(skip, /p_expected_booking_id: mutation\.expectedBookingId/);
  assert.match(skip, /BOOKING_NOT_WAITLISTED\|WAITLIST_CHANGED/);
  assert.match(skip, /The queue changed before this skip\. Refresh and review the waitlist\./);

  const view = read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(view, /adminSkipWaitlistedHead\(candidate\.session_id, candidate\.next_booking_id\)/);
  assert.doesNotMatch(view, /adminSetBookingStatus\(candidate\.next_booking_id, 'cancelled'\)/);
  const skipHandler = view.slice(
    view.indexOf('const handleSkipWaitlistHead'),
    view.indexOf('const handleDuplicate'),
  );
  assert.match(skipHandler, /refreshWaitlistOverview\(\{ quiet: true \}\)/);
  assert.match(skipHandler, /Waitlist refresh needed/);
});

/**
 * Soft-launch / onboarding / erasure gates that must stay in the overnight
 * regression bundle (not only their dedicated suite files).
 */
test('soft-launch public booking gate keeps class_bookings inserts behind bookings_enabled', () => {
  for (const path of [
    '../supabase/migrations/20260726113000_public_booking_switch_gate.sql',
    '../src/supabase/public_booking_switch_gate.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /v_table = 'class_bookings'/);
    assert.match(sql, /bookings_enabled is true/);
    assert.match(sql, /values \('public_booking_switch_gate'\)/i);
  }

  const timetable = read('../src/pages/SoftLaunchTimetable.jsx');
  assert.match(timetable, /settings\.bookings_enabled === true && <StickyMobileCTA/);
  assert.match(timetable, /<PublicFooter showBookCta=\{settings\.bookings_enabled === true\}/);

  const home = read('../src/pages/Home.jsx');
  assert.match(home, /const bookingsEnabled = settings\.bookings_enabled === true/);
  assert.match(home, /bookingsEnabled && <StickyMobileCTA/);
  assert.match(home, /<PublicFooter showBookCta=\{bookingsEnabled\}/);

  for (const path of [
    '../src/pages/About.jsx',
    '../src/pages/Contact.jsx',
    '../src/pages/Coaches.jsx',
    '../src/pages/Events.jsx',
    '../src/pages/TrainingGuide.jsx',
    '../src/pages/AppLanding.jsx',
  ]) {
    const page = read(path);
    assert.match(page, /const bookingsEnabled = settings\.bookings_enabled === true/);
    assert.match(page, /bookingsEnabled && <StickyMobileCTA/);
    assert.match(page, /<PublicFooter showBookCta=\{bookingsEnabled\}/);
  }

  const booking = read('../src/pages/Booking.jsx');
  assert.match(booking, /setBookingsEnabled\(settings\?\.bookings_enabled === true\)/);
  assert.match(booking, /if \(!bookingsEnabled\)/);

  const iosHome = read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift');
  assert.match(iosHome, /bookingsEnabled: store\.memberBookingsEnabled/);
  assert.match(iosHome, /Register interest/);
});

test('account profile save and public event goals refuse same-paint double submits', () => {
  const account = read('../src/pages/Account.jsx');
  assert.match(account, /const profileSaveLockRef = useRef\(false\)/);
  assert.match(account, /if \(profileSaveLockRef\.current \|\| savingProfile\) return/);
  assert.match(account, /profileSaveLockRef\.current = true/);

  const events = read('../src/pages/Events.jsx');
  assert.match(events, /const goalLockRef = useRef\(false\)/);
  assert.match(events, /goalLockRef\.current \|\| savingGoalId/);
  assert.match(events, /goalLockRef\.current = true/);
  assert.match(events, /disabled=\{savingGoalId !== null\}/);
});

test('member onboarding booking gate fails closed before session_bookings insert', () => {
  for (const path of [
    '../supabase/migrations/20260726114000_member_onboarding_booking_gate.sql',
    '../src/supabase/member_onboarding_booking_gate.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /enforce_member_onboarding_for_booking/i);
    assert.match(sql, /MEMBER_ONBOARDING_REQUIRED/i);
    assert.match(sql, /before insert on public\.session_bookings/i);
    assert.match(sql, /values \('member_onboarding_booking_gate'\)/i);
  }

  const web = read('../src/lib/bookingData.js');
  assert.match(web, /MEMBER_ONBOARDING_REQUIRED:\s*'Complete Member Readiness/);
});

test('deleted-buyer fulfillment keeps Stripe email erased on orphaned orders', () => {
  const executable = text => text.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
  for (const path of [
    '../supabase/migrations/20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql',
    '../src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql',
    '../src/supabase/stripe_fulfillment_deleted_member_fix.sql',
  ]) {
    const sql = executable(read(path));
    assert.match(
      sql,
      /email = case\s+when orders\.user_id is null then null\s+else coalesce\(nullif\(btrim\(p_email\), ''\), orders\.email\)\s+end/s,
    );
    assert.doesNotMatch(sql, /set status = 'paid',\s*email = coalesce\(nullif\(btrim\(p_email\)/s);
  }
});
