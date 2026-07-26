import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizePaymentActivationRequest } from '../api/admin-commerce-health.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const MIGRATION = '../supabase/migrations/20260726118000_soft_launch_switch_authz.sql';
const OPERATOR = '../src/supabase/soft_launch_switch_authz.sql';

test('soft-launch switch authz migration and operator mirror match', () => {
  assert.equal(
    read(MIGRATION).replace(/\r\n/g, '\n'),
    read(OPERATOR).replace(/\r\n/g, '\n'),
  );
});

test('database refuses payments without bookings and bookings without the switch guard', () => {
  for (const sql of [read(MIGRATION), read(OPERATOR)]) {
    assert.match(sql, /create or replace function public\.enforce_soft_launch_switch_authz\(\)/i);
    assert.match(sql, /raise exception 'PAYMENTS_REQUIRE_BOOKINGS'/i);
    assert.match(sql, /raise exception 'BOOKINGS_REQUIRE_SWITCH_GUARD'/i);
    assert.match(sql, /member_booking_switch_guard/);
    assert.match(sql, /admin_settings_soft_launch_switch_authz/);
    assert.match(sql, /before insert or update on public\.admin_settings/i);
    assert.match(sql, /if p_bookings_enabled is not true then[\s\S]*PAYMENTS_REQUIRE_BOOKINGS/i);
    assert.match(sql, /bookings_enabled = true/);
    assert.match(sql, /values \('soft_launch_switch_authz'\)/i);
  }
});

test('activate_payments API rejects bookings_enabled false before the RPC', () => {
  const valid = {
    action: 'activate_payments',
    confirmation: 'ENABLE PAYMENTS',
    settings_id: '6c7bc779-4e22-4f38-88af-c15f2f94ee5a',
    expected_updated_at: '2026-07-26T00:00:00.000Z',
    settings: {
      target_launch_date: '2026-08-01',
      countdown_enabled: true,
      bookings_enabled: true,
      payments_enabled: true,
      announcement_banner_enabled: false,
      announcement_banner_text: null,
    },
  };
  assert.equal(normalizePaymentActivationRequest(valid).updates.bookings_enabled, true);
  assert.throws(
    () => normalizePaymentActivationRequest({
      ...valid,
      settings: { ...valid.settings, bookings_enabled: false },
    }),
    /PAYMENTS_REQUIRE_BOOKINGS/,
  );
  const api = read('../api/admin-commerce-health.js');
  assert.match(api, /PAYMENTS_REQUIRE_BOOKINGS/);
  assert.match(api, /Enable Bookings before opening session pack checkout/);
});

test('soft-launch settings map the new SQL exceptions to operator copy', () => {
  const adminData = read('../src/lib/adminData.js');
  assert.match(adminData, /PAYMENTS_REQUIRE_BOOKINGS/);
  assert.match(adminData, /BOOKINGS_REQUIRE_SWITCH_GUARD/);
  assert.match(adminData, /paymentActivationRequiresBookingsMessage/);
  assert.match(adminData, /member booking-switch guard before bookings can go live/);
});
