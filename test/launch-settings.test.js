import assert from 'node:assert/strict';
import test from 'node:test';

import {
  launchSettingsChanged,
  livePaymentSettingsRequirePause,
  normalizeLaunchSettings,
  paymentActivationRequiresBookings,
  paymentActivationRequiresBookingsMessage,
  paymentSettingsPauseRequiredMessage,
} from '../src/lib/launchSettings.js';

test('normalizes every live platform control, including the server payment switch', () => {
  const result = normalizeLaunchSettings({
    id: 'must-not-be-sent', payments_enabled: true, fitbox_enabled: true,
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
  });
});

test('rejects an empty enabled banner and impossible launch date', () => {
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-08-01', announcement_banner_enabled: true }), /announcement text/i);
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-02-30' }), /valid target launch date/i);
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
});

test('live checkout freezes other soft-launch edits until payments are paused', () => {
  const live = {
    countdown_enabled: true,
    bookings_enabled: true,
    payments_enabled: true,
    prices_coming_soon: false,
    announcement_banner_enabled: false,
    target_launch_date: '2026-08-01',
    announcement_banner_text: null,
  };

  assert.equal(livePaymentSettingsRequirePause(live, live), false);
  assert.equal(
    livePaymentSettingsRequirePause({ ...live, countdown_enabled: false }, live),
    true,
  );
  assert.equal(
    livePaymentSettingsRequirePause({ ...live, payments_enabled: false, countdown_enabled: false }, live),
    false,
  );
  assert.equal(
    livePaymentSettingsRequirePause({ ...live, payments_enabled: true }, { ...live, payments_enabled: false }),
    false,
  );
  assert.match(paymentSettingsPauseRequiredMessage(), /Pause session pack payments/i);
});

test('pack checkout cannot go live while class bookings stay paused', () => {
  assert.equal(
    paymentActivationRequiresBookings({ payments_enabled: true, bookings_enabled: false }),
    true,
  );
  assert.equal(
    paymentActivationRequiresBookings({ payments_enabled: true, bookings_enabled: true }),
    false,
  );
  assert.equal(
    paymentActivationRequiresBookings({ payments_enabled: false, bookings_enabled: false }),
    false,
  );
  assert.match(paymentActivationRequiresBookingsMessage(), /Enable Bookings before opening/i);
});
