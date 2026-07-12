import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeLaunchSettings } from '../src/lib/launchSettings.js';

test('normalizes only launch settings that the public app actually consumes', () => {
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
    announcement_banner_enabled: true,
    target_launch_date: '2026-08-01',
    announcement_banner_text: 'Foundation registrations open',
  });
});

test('rejects an empty enabled banner and impossible launch date', () => {
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-08-01', announcement_banner_enabled: true }), /announcement text/i);
  assert.throws(() => normalizeLaunchSettings({ target_launch_date: '2026-02-30' }), /valid target launch date/i);
});
