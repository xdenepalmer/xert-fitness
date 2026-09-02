import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLATFORM_PROVIDERS,
  normalizeProviderUrl,
  providerOperationsHealth,
  resolvePlatformProvider,
} from '../src/lib/platformProvider.js';

test('missing provider settings fail closed instead of silently enabling native mutations', () => {
  const provider = resolvePlatformProvider(null);
  assert.equal(provider.provider, PLATFORM_PROVIDERS.UNAVAILABLE);
  assert.equal(provider.blocked, true);
  assert.equal(provider.capabilities.canBookInternally, false);
  assert.equal(provider.capabilities.canPurchaseInternalPack, false);
});

test('native remains a deliberate fully capable alternate provider', () => {
  const provider = resolvePlatformProvider({ fitbox_enabled: false });
  assert.equal(provider.provider, PLATFORM_PROVIDERS.NATIVE);
  assert.equal(provider.configured, true);
  assert.equal(provider.capabilities.canBookInternally, true);
  assert.equal(provider.capabilities.canCancelInternally, true);
  assert.equal(provider.capabilities.canViewAttendance, true);
});

test('FitBox handoff disables every unsupported internal mutation', () => {
  const provider = resolvePlatformProvider({
    fitbox_enabled: true,
    fitbox_booking_url: 'https://portal.fitboxcorp.com/xert',
  });
  assert.equal(provider.provider, PLATFORM_PROVIDERS.FITBOX);
  assert.equal(provider.portalUrl, 'https://portal.fitboxcorp.com/xert');
  assert.equal(provider.capabilities.canOpenProviderPortal, true);
  assert.equal(provider.capabilities.canBookInternally, false);
  assert.equal(provider.capabilities.canCancelInternally, false);
  assert.equal(provider.capabilities.canPurchaseInternalPack, false);
  assert.equal(provider.capabilities.canViewMirroredBookings, false);
  assert.equal(provider.capabilities.canViewAttendance, false);
  assert.equal(provider.capabilities.canUpdateMemberProfile, false);
});

test('a selected but misconfigured FitBox provider never falls back to native', () => {
  for (const fitbox_booking_url of ['', 'http://portal.fitboxcorp.com/xert', 'javascript:alert(1)', 'https://user:pass@example.com']) {
    const provider = resolvePlatformProvider({ fitbox_enabled: true, fitbox_booking_url });
    assert.equal(provider.provider, PLATFORM_PROVIDERS.FITBOX);
    assert.equal(provider.blocked, true);
    assert.equal(provider.capabilities.canBookInternally, false);
    assert.equal(provider.capabilities.canPurchaseInternalPack, false);
  }
});

test('provider URLs must be credential-free HTTPS destinations', () => {
  assert.equal(normalizeProviderUrl(' https://portal.fitboxcorp.com/xert '), 'https://portal.fitboxcorp.com/xert');
  assert.equal(normalizeProviderUrl('http://portal.fitboxcorp.com/xert'), null);
  assert.equal(normalizeProviderUrl('https://user:pass@portal.fitboxcorp.com/xert'), null);
  assert.equal(normalizeProviderUrl('not-a-url'), null);
});

test('System status describes FitBox honestly', () => {
  const native = providerOperationsHealth({ fitbox_enabled: false });
  assert.equal(native.status, 'ok');

  const handoff = providerOperationsHealth({
    fitbox_enabled: true,
    fitbox_booking_url: 'https://portal.fitboxcorp.com/xert',
  });
  assert.equal(handoff.status, 'attention');
  assert.match(handoff.detail, /booking mirroring.*attendance remain unavailable/i);

  const broken = providerOperationsHealth({ fitbox_enabled: true, fitbox_booking_url: '' });
  assert.equal(broken.status, 'error');
  assert.match(broken.detail, /internal booking and checkout remain paused/i);
});
