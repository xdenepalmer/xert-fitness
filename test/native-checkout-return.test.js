import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [api, deepLink, info, root, store, pendingStore, booking, browser, swiftTests, app, page] = await Promise.all([
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/CheckoutDeepLink.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Info.plist', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/PendingCheckoutStore.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/CheckoutBrowser.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/CheckoutReturn.jsx', import.meta.url), 'utf8'),
]);

test('native checkout requests the bounded iOS return target', () => {
  const checkout = api.slice(api.indexOf('func checkout('), api.indexOf('func requestPrivateSession'));
  assert.match(checkout, /"return_target": "ios"/);
  assert.doesNotMatch(checkout, /success_url|cancel_url/);
});

test('native checkout stays inside a trusted authenticated browser session', () => {
  assert.match(browser, /ASWebAuthenticationSession/);
  assert.match(browser, /callbackURLScheme: "xertfitness"/);
  assert.match(browser, /CheckoutDeepLink\.status\(from: callbackURL\) != nil/);
  assert.match(browser, /prefersEphemeralWebBrowserSession = false/);
  assert.match(booking, /@StateObject private var checkoutBrowser = CheckoutBrowser\(\)/);
  assert.match(booking, /checkoutBrowser\.start\(url: url\)/);
  assert.doesNotMatch(booking, /openURL\(url\)/);
  assert.match(root, /publisher\(for: \.xertCheckoutCallback\)[\s\S]*handleOpenURL\(url\)/);
});

test('native app accepts only the XERT checkout callback and refreshes member data', () => {
  assert.match(info, /<string>xertfitness<\/string>/);
  assert.match(deepLink, /url\.scheme\?\.lowercased\(\) == "xertfitness"/);
  assert.match(deepLink, /url\.host\?\.lowercased\(\) == "checkout"/);
  assert.match(deepLink, /CheckoutReturnStatus\(rawValue: value\)/);
  assert.match(root, /\.onOpenURL/);
  assert.match(root, /CheckoutDeepLink\.status\(from: url\)/);
  assert.match(root, /navigate\(to: \.booking\)/);
  assert.match(root, /status == \.success[\s\S]*store\.reconcileCheckout\(\)/);
});

test('native app polls bounded order and credit state while Stripe fulfilment settles', () => {
  assert.match(deepLink, /retryDelaysNanoseconds: \[UInt64\] = \[0, 2_000_000_000, 3_000_000_000, 5_000_000_000\]/);
  assert.match(deepLink, /currentCreditTotal > baselineCreditTotal && hasNewPaidOrder/);
  assert.match(store, /let userID = authSession\?\.user\?\.id,[\s\S]*!isReconcilingCheckout/);
  assert.match(store, /for delay in CheckoutReconciliation\.retryDelaysNanoseconds/);
  assert.match(store, /async let creditRequest = api\.credits/);
  assert.match(store, /async let orderRequest = api\.orders/);
  assert.match(store, /PendingCheckoutStore\.save\(pendingCheckout\)/);
  assert.match(store, /let pendingCheckout = PendingCheckoutStore\.load\(for: userID\)/);
  assert.match(store, /PendingCheckoutStore\.clear\(\)/);
  assert.match(store, /await reconcilePendingCheckout\(\)/);
  assert.match(pendingStore, /checkout\.userID == userID/);
  assert.match(pendingStore, /now\.timeIntervalSince\(checkout\.startedAt\) <= maximumAge/);
  assert.match(booking, /Confirming purchase\.\.\./);
  assert.match(booking, /Purchase confirmation is taking longer than usual/);
  assert.match(swiftTests, /testCheckoutReconciliationRequiresBothPaidOrderAndGrantedCredits/);
  assert.match(swiftTests, /testPendingCheckoutRoundTripsForTheSameUser/);
  assert.match(swiftTests, /testPendingCheckoutRejectsAnotherUserAndExpires/);
});

test('cold launches and later foregrounds resume a pending native purchase', () => {
  assert.match(store, /hasBootstrapped = true\s+await reconcilePendingCheckout\(\)/);
  assert.match(store, /try KeychainStore\.saveSession\(session\)\s+await refresh\(\)\s+await reconcilePendingCheckout\(\)/);
  assert.match(root, /await store\.refresh\(\)\s+await store\.reconcilePendingCheckout\(\)/);
  assert.match(root, /store\.cancelPendingCheckout\(\)/);
  assert.match(booking, /await store\.reconcilePendingCheckout\(\)/);
});

test('public checkout return page can reopen the app without requiring web auth', () => {
  assert.match(app, /path="\/checkout-return"/);
  assert.match(page, /xertfitness:\/\/checkout\?status=\$\{status\}/);
  assert.match(page, /Payment received/);
  assert.match(page, /No payment was taken/);
  assert.doesNotMatch(page, /useSupabaseAuth|AdminRoute/);
});
