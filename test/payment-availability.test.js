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

  assert.match(webData, /admin_settings[\s\S]*select\('payments_enabled'\)[\s\S]*limit\(2\)/);
  assert.match(webData, /data\?\.length === 1/);
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

test('owner activation requires a fresh server preflight and an explicit confirmation', async () => {
  const [commerceAPI, webData, webAdmin, nativeAPI, nativeStore, nativeAdmin] = await Promise.all([
    readFile(new URL('../api/admin-commerce-health.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/SoftLaunchSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(commerceAPI, /paymentFulfillmentIsReady\(admin\)/);
  assert.match(commerceAPI, /&& fulfillmentReady/);
  assert.match(commerceAPI, /Atomic Stripe payment fulfillment is not installed/);
  assert.match(commerceAPI, /Guarded payment activation is not installed/);
  assert.match(commerceAPI, /Versioned singleton platform settings are not installed/);
  assert.match(commerceAPI, /Stripe pending-order fulfillment guard is not installed/);
  assert.match(commerceAPI, /request\.method === 'POST'/);
  assert.match(commerceAPI, /if \(!health\.ready\)/);
  assert.match(commerceAPI, /activateSessionPackPayments\(serverClient, user\.id, activation\)/);
  assert.match(webData, /export async function getCommerceConfigurationHealth/);
  assert.match(webData, /export async function activateSessionPackPayments/);
  assert.match(webData, /action: 'activate_payments'/);
  assert.match(webData, /confirmation: 'ENABLE PAYMENTS'/);
  assert.match(webAdmin, /await getCommerceConfigurationHealth\(\)/);
  assert.match(webAdmin, /if \(!health\.ready\)/);
  assert.match(webAdmin, /activateSessionPackPayments\(normalized, savedSettings\)/);
  assert.match(webAdmin, /title="Open session pack checkout\?"/);
  assert.match(nativeAPI, /func adminActivatePlatformPayments/);
  assert.match(nativeAPI, /confirmation: "ENABLE PAYMENTS"/);
  assert.match(nativeStore, /let activatingPayments = draft\.payments_enabled/);
  assert.match(nativeStore, /api\.adminActivatePlatformPayments/);
  assert.match(nativeAdmin, /confirmationDialog\("Open session pack checkout\?"/);
  assert.match(nativeAdmin, /run every Stripe launch check on the server/);
  assert.doesNotMatch(nativeAdmin, /disabled\(admin\.commerceHealth\?\.ready != true\)/);
});
