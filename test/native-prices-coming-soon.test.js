import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native public pricing settings fail closed and gate checkout with all three controls', async () => {
  const [models, api, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
  ]);

  assert.match(models, /struct PublicPlatformSettings:[\s\S]*let prices_coming_soon: Bool/);
  assert.match(models, /prices_coming_soon: Bool = true/);
  assert.match(models, /prices_coming_soon = \(try\? container\.decode\(Bool\.self, forKey: \.prices_coming_soon\)\) \?\? true/);
  assert.match(models, /bookings_enabled && payments_enabled && !prices_coming_soon/);
  assert.match(models, /pricesComingSoon \? "Coming soon" : displayPrice/);
  assert.match(api, /select", value: "bookings_enabled,payments_enabled,prices_coming_soon"/);

  assert.match(store, /@Published private\(set\) var sessionPackPricesComingSoon = true/);
  assert.match(store, /sessionPackPricesComingSoon = loadedSettings\?\.prices_coming_soon \?\? true/);
  assert.match(store, /sessionPackPaymentsEnabled = loadedSettings\?\.sessionPackCheckoutEnabled == true/);
  assert.ok((store.match(/sessionPackPricesComingSoon = true/g) || []).length >= 2);
  assert.match(store, /guard !sessionPackPricesComingSoon else \{[\s\S]*Checkout stays closed/);
});

test('every native member pack surface hides amount text and accessibility while pricing is pending', async () => {
  const [booking, home] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
  ]);

  assert.doesNotMatch(booking, /product\.displayPrice/);
  assert.doesNotMatch(home, /product\.displayPrice/);
  assert.match(booking, /memberPriceLabel\(for: product\)/);
  assert.match(booking, /accessibilityLabel\("\\\(product\.name\), \\\(product\.sessionsCount\) sessions, \\\(memberPriceLabel\(for: product\)\)"\)/);
  assert.match(booking, /else if store\.sessionPackPricesComingSoon[\s\S]*Pack pricing is coming soon/);
  assert.match(booking, /disabled\(!store\.sessionPackPaymentsEnabled/);
  assert.match(home, /product\.memberPriceLabel\(pricesComingSoon: store\.sessionPackPricesComingSoon\)/);
});
