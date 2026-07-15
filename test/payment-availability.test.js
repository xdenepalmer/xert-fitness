import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sessionPackPaymentsEnabled } from '../src/lib/launchSettings.js';

test('public payment availability accepts only an explicit enabled setting', () => {
  assert.equal(sessionPackPaymentsEnabled({ payments_enabled: true }), true);
  for (const settings of [
    undefined,
    null,
    {},
    { payments_enabled: false },
    { payments_enabled: 1 },
    { payments_enabled: 'true' },
  ]) {
    assert.equal(sessionPackPaymentsEnabled(settings), false);
  }
});

test('web and native purchase surfaces fail closed before checkout', async () => {
  const [webData, webBooking, nativeModels, nativeAPI, nativeStore, nativeBooking] = await Promise.all([
    readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Booking.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Models.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(webData, /admin_settings[\s\S]*select\('payments_enabled'\)[\s\S]*maybeSingle/);
  assert.match(webBooking, /getSessionPackPaymentAvailability\(\)/);
  assert.match(webBooking, /disabled=\{!paymentsEnabled \|\| buyingSlug === pack\.slug\}/);
  assert.match(webBooking, /Pack purchases are paused/);

  assert.match(nativeModels, /struct PublicPlatformSettings[\s\S]*let payments_enabled: Bool/);
  assert.match(nativeAPI, /func publicPlatformSettings[\s\S]*payments_enabled/);
  assert.match(nativeStore, /sessionPackPaymentsEnabled = false/);
  assert.match(nativeStore, /guard sessionPackPaymentsEnabled else/);
  assert.match(nativeBooking, /disabled\(!store\.sessionPackPaymentsEnabled/);
  assert.match(nativeBooking, /Pack purchases are paused/);
});

test('owner activation requires Stripe health and an explicit confirmation', async () => {
  const [commerceAPI, webData, webAdmin, nativeAdmin] = await Promise.all([
    readFile(new URL('../api/admin-commerce-health.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/SoftLaunchSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(commerceAPI, /await paymentFulfillmentIsReady\(admin\)/);
  assert.match(commerceAPI, /&& fulfillmentReady/);
  assert.match(commerceAPI, /Atomic Stripe payment fulfillment is not installed/);
  assert.match(webData, /export async function getCommerceConfigurationHealth/);
  assert.match(webAdmin, /await getCommerceConfigurationHealth\(\)/);
  assert.match(webAdmin, /if \(!health\.ready\)/);
  assert.match(webAdmin, /title="Open session pack checkout\?"/);
  assert.match(nativeAdmin, /confirmationDialog\("Open session pack checkout\?"/);
  assert.match(nativeAdmin, /disabled\(admin\.commerceHealth\?\.ready != true\)/);
});
