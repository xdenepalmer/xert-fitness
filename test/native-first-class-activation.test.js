import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const native = relative => readFile(
  new URL(`../ios/XertFitnessApp/XertFitnessApp/${relative}`, import.meta.url),
  'utf8',
);

test('native first-class activation retains exact intent through auth and checkout', async () => {
  const [navigation, root, booking, checkout] = await Promise.all([
    native('XertNavigation.swift'),
    native('Views/RootView.swift'),
    native('Views/BookingView.swift'),
    native('Services/PendingCheckoutStore.swift'),
  ]);

  assert.match(navigation, /struct XertFirstClassActivation[\s\S]*let sessionID: UUID[\s\S]*var stage:/);
  assert.match(root, /pendingProtectedNavigation = XertNavigationIntent\([\s\S]*\.classSession\(sessionID\)/);
  assert.match(root, /resumeFirstClassAfterCheckout[\s\S]*\.readyToBook[\s\S]*\.classSession\(sessionID\)/);
  assert.match(checkout, /let activationSessionID: UUID\?/);
  assert.match(booking, /activationSessionID: firstClassActivation\?\.sessionID/);
  assert.match(booking, /You need a session credit to book this class/);
  assert.match(booking, /Choose a session pack/);
  assert.match(booking, /Credits ready — book your place below/);
  assert.doesNotMatch(root, /resumeFirstClassAfterCheckout[\s\S]{0,800}store\.book\(/);
});

test('native no-credit booking is contextual instead of a global error', async () => {
  const [store, booking] = await Promise.all([
    native('Store/XertStore.swift'),
    native('Views/BookingView.swift'),
  ]);

  assert.match(store, /contains\("NO_CREDITS"\)[\s\S]*return \.needsCredits/);
  assert.match(booking, /outcome == \.needsCredits[\s\S]*onBookingNeedsCredits\(session\.id\)/);
});
