import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native iOS resolves one fail-closed booking provider', async () => {
  const [models, store, api] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
  ]);

  assert.match(models, /struct XertPlatformProviderResolution/);
  assert.match(models, /static let blockedFitBox/);
  assert.match(models, /components\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(models, /components\.user == nil/);
  assert.match(models, /var sessionPackCheckoutEnabled: Bool \{[\s\S]*providerResolution\.provider == \.native/);
  assert.match(store, /let provider = loadedSettings\?\.providerResolution \?\? \.unavailable[\s\S]*platformProvider = provider/);
  assert.match(store, /guard platformProvider\.provider == \.native,[\s\S]*nativeBookingMutations/);
  assert.match(store, /guard platformProvider\.provider == \.native,[\s\S]*nativePackCheckout/);
  assert.match(api, /prices_coming_soon,fitbox_enabled,fitbox_booking_url/);
  assert.match(api, /Stripe activation is unavailable while FitBox is the selected booking provider/);
});

test('native iOS booking, account and Command Centre expose the provider handoff clearly', async () => {
  const [bookingView, accountView, adminView] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(bookingView, /if store\.platformProvider\.provider == \.native/);
  assert.match(bookingView, /Continue to FitBox/);
  assert.match(bookingView, /source of truth/);
  assert.match(bookingView, /Retry provider check/);
  assert.match(bookingView, /BookingSearchModifier/);
  assert.match(accountView, /store\.platformProvider\.provider == \.native/);
  assert.match(accountView, /Manage in FitBox/);
  assert.match(adminView, /Section\("Booking provider"\)/);
  assert.match(adminView, /Use FitBox for memberships & bookings/);
  assert.match(adminView, /Native booking and checkout will not be used as a fallback/);
  assert.match(adminView, /value\.payments_enabled = false/);
});

test('web account cancellation consumes the same provider contract', async () => {
  const account = await read('../src/pages/Account.jsx');

  assert.match(account, /setProvider\(resolvePlatformProvider\(null\)\)/);
  assert.match(account, /provider\.capabilities\.canCancelInternally/);
  assert.match(account, /providerAllowsNativeCancellation/);
  assert.match(account, /Manage in FitBox/);
});
