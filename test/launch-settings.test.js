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
  assert.deepEqual(
    fitboxHandoff({ fitbox_enabled: true, fitbox_booking_url: 'https://portal.fitboxcorp.com/xert' }),
    { active: true, url: 'https://portal.fitboxcorp.com/xert' }
  );
  // A broken or missing link fails safe to the internal flow instead of dead buttons.
  assert.deepEqual(fitboxHandoff({ fitbox_enabled: true, fitbox_booking_url: '' }), { active: false, url: null });
  assert.deepEqual(fitboxHandoff({ fitbox_enabled: true, fitbox_booking_url: 'javascript:alert(1)' }), { active: false, url: null });
  assert.deepEqual(fitboxHandoff({ fitbox_enabled: false, fitbox_booking_url: 'https://portal.fitboxcorp.com/xert' }), { active: false, url: null });
  assert.deepEqual(fitboxHandoff(null), { active: false, url: null });
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
