import assert from 'node:assert/strict';
import test from 'node:test';

import { fitboxHandoff, launchSettingsChanged, normalizeLaunchSettings } from '../src/lib/launchSettings.js';

test('normalizes every live platform control, including the server payment switch', () => {
  const result = normalizeLaunchSettings({
    id: 'must-not-be-sent', payments_enabled: true, fitbox_enabled: true,
    fitbox_booking_url: '  https://portal.fitboxcorp.com/xert  ',
    countdown_enabled: true, bookings_enabled: false,
    announcement_banner_enabled: true,
    announcement_banner_text: '  Foundation registrations open  ',
    target_launch_date: '2026-08-01',
  });

  assert.deepEqual(result, {
    countdown_enabled: true,
    bookings_enabled: false,
    payments_enabled: true,
    prices_coming_soon: true,
    announcement_banner_enabled: true,
    target_launch_date: '2026-08-01',
    announcement_banner_text: 'Foundation registrations open',
    fitbox_enabled: true,
    fitbox_booking_url: 'https://portal.fitboxcorp.com/xert',
    // Class packs are retired, so credits stay off until someone re-enables them.
    class_credits_enabled: false,
    // The casual door fee is a live control too, defaulting to on at $15.60.
    casual_payments_enabled: true,
    // All three visitor prices are the club's to set, each with its own
    // discount that is off until somebody sets a price and switches it on.
    casual_visit_price_cents: 1560,
    casual_visit_discount_cents: null,
    casual_visit_discount_enabled: false,
    three_day_pass_price_cents: 3500,
    three_day_pass_discount_cents: null,
    three_day_pass_discount_enabled: false,
    three_month_price_cents: 43000,
    three_month_discount_cents: null,
    three_month_discount_enabled: false,
  });
});

test('rejects an empty enabled banner and impossible launch date', () => {
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-08-01', announcement_banner_enabled: true }), /announcement text/i);
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-02-30' }), /valid target launch date/i);
});

test('the Fitbox handoff needs a usable https portal link before it can be enabled', () => {
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-08-01', fitbox_enabled: true }), /Fitbox member portal link/i);
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-08-01', fitbox_booking_url: 'not a url' }), /starting with https/i);
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-08-01', fitbox_booking_url: 'http://portal.fitboxcorp.com/xert' }), /starting with https/i);

  const disabled = normalizeLaunchSettings({ target_launch_date: '2026-08-01', fitbox_enabled: false, fitbox_booking_url: '' });
  assert.equal(disabled.fitbox_enabled, false);
  assert.equal(disabled.fitbox_booking_url, null);
});

test('public surfaces hand off to Fitbox only when enabled with a valid link', () => {
  const active = fitboxHandoff({ fitbox_enabled: true, fitbox_booking_url: 'https://portal.fitboxcorp.com/xert' });
  assert.equal(active.active, true);
  assert.equal(active.blocked, false);
  assert.equal(active.url, 'https://portal.fitboxcorp.com/xert');
  assert.equal(active.capabilities.canBookInternally, false);

  // A requested provider with a broken link fails closed instead of silently
  // exposing the native booking engine.
  const missing = fitboxHandoff({ fitbox_enabled: true, fitbox_booking_url: '' });
  assert.equal(missing.active, false);
  assert.equal(missing.requested, true);
  assert.equal(missing.blocked, true);
  assert.equal(missing.capabilities.canBookInternally, false);

  const unsafe = fitboxHandoff({ fitbox_enabled: true, fitbox_booking_url: 'javascript:alert(1)' });
  assert.equal(unsafe.blocked, true);
  assert.equal(unsafe.url, null);

  const native = fitboxHandoff({ fitbox_enabled: false, fitbox_booking_url: 'https://portal.fitboxcorp.com/xert' });
  assert.equal(native.active, false);
  assert.equal(native.requested, false);
  assert.equal(native.blocked, false);
});

test('tracks only live launch fields against the last saved snapshot', () => {
  const saved = {
    id: 'row-id',
    countdown_enabled: true,
    bookings_enabled: false,
    payments_enabled: false,
    announcement_banner_enabled: false,
    target_launch_date: '2026-08-01',
    announcement_banner_text: null,
  };

  assert.equal(launchSettingsChanged({ ...saved }, saved), false);
  assert.equal(launchSettingsChanged({ ...saved, id: 'different-row-id' }, saved), false);
  assert.equal(launchSettingsChanged({ ...saved, bookings_enabled: true }, saved), true);
  assert.equal(launchSettingsChanged({ ...saved, payments_enabled: true }, saved), true);
  assert.equal(launchSettingsChanged({ ...saved, announcement_banner_text: '' }, saved), false);
  assert.equal(launchSettingsChanged({ ...saved, fitbox_enabled: true }, saved), true);
  assert.equal(launchSettingsChanged({ ...saved, fitbox_booking_url: 'https://portal.fitboxcorp.com/xert' }, saved), true);
});

test('a visitor discount must be set, and cheaper, before it can run', async () => {
  const { normalizeVisitorPricing } = await import('../src/lib/launchSettings.js');

  const running = normalizeVisitorPricing({
    three_month_price_cents: 43000, three_month_discount_cents: 39000, three_month_discount_enabled: true,
  });
  assert.equal(running.three_month_discount_cents, 39000);
  assert.equal(running.three_month_discount_enabled, true);

  // Switching one on with nothing behind it, or with a price that is not a
  // discount, is refused here rather than charged to somebody.
  assert.throws(() => normalizeVisitorPricing({ three_day_pass_discount_enabled: true }),
    /Set a three day pass discount price/i);
  assert.throws(() => normalizeVisitorPricing({
    casual_visit_price_cents: 1560, casual_visit_discount_cents: 2000, casual_visit_discount_enabled: true,
  }), /must be cheaper/i);

  // A discount left set but switched off is kept, so it can be run again.
  const parked = normalizeVisitorPricing({
    casual_visit_price_cents: 1560, casual_visit_discount_cents: 1000, casual_visit_discount_enabled: false,
  });
  assert.equal(parked.casual_visit_discount_cents, 1000);
  assert.equal(parked.casual_visit_discount_enabled, false);
});
