import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_BADGE_REFRESH_INTERVAL_MS,
  ADMIN_OVERVIEW_REFRESH_INTERVAL_MS,
  shouldRefreshAdminData
} from '../src/lib/adminFreshness.js';

test('uses a restrained one-minute admin badge interval', () => {
  assert.equal(ADMIN_BADGE_REFRESH_INTERVAL_MS, 60_000);
  assert.equal(ADMIN_OVERVIEW_REFRESH_INTERVAL_MS, 300_000);
});

test('refreshes stale visible admin data but skips hidden and fresh tabs', () => {
  assert.equal(shouldRefreshAdminData({ visibilityState: 'hidden', lastRefreshAt: 0, now: 100_000 }), false);
  assert.equal(shouldRefreshAdminData({ visibilityState: 'visible', lastRefreshAt: Number.NaN, now: 100_000 }), true);
  assert.equal(shouldRefreshAdminData({ visibilityState: 'visible', lastRefreshAt: 90_000, now: 100_000 }), false);
  assert.equal(shouldRefreshAdminData({ visibilityState: 'visible', lastRefreshAt: 80_000, now: 100_000 }), true);
});
