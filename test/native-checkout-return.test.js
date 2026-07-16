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
  assert.match(checkout, /attemptID: UUID/);
  assert.match(checkout, /"checkout_attempt_id": attemptID\.uuidString\.lowercased\(\)/);
  assert.match(checkout, /async throws -> CheckoutResponse/);
  assert.match(checkout, /return response/);
  assert.doesNotMatch(checkout, /success_url|cancel_url/);
});

test('native checkout reuses an attempt after API failure and clears it after handoff', () => {
  assert.match(booking, /@State private var checkoutAttemptIDs: \[String: UUID\] = \[:\]/);
  assert.match(booking, /checkoutAttemptIDs\[product\.id\] \?\? UUID\(\)/);
  assert.match(booking, /checkoutURL\(for: product, attemptID: checkoutAttemptID\)/);
  assert.match(booking, /if let url[\s\S]*checkoutAttemptIDs\[product\.id\] = nil[\s\S]*checkoutBrowser\.start/);
});

test('native checkout stays inside a trusted authenticated browser session', () => {
  assert.match(browser, /ASWebAuthenticationSession/);
  assert.match(browser, /callbackURLScheme: "xertfitness"/);
  assert.match(browser, /CheckoutDeepLink\.status\(from: callbackURL\) != nil/);
  assert.match(browser, /prefersEphemeralWebBrowserSession = false/);
  assert.match(booking, /@StateObject private var checkoutBrowser = CheckoutBrowser\(\)/);
  assert.match(booking, /@State private var checkoutProductID: String\?/);
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
  assert.match(root, /navigation\.open\(\.purchaseConfirmation, source: \.checkout\)/);
  assert.match(root, /status == \.success[\s\S]*store\.reconcileCheckout\(\)/);
});

test('native app polls bounded order and credit state while Stripe fulfilment settles', () => {
  assert.match(deepLink, /retryDelaysNanoseconds: \[UInt64\] = \[0, 2_000_000_000, 3_000_000_000, 5_000_000_000\]/);
  assert.match(deepLink, /var newPaidOrderIDs = Set<UUID>\(\)/);
  assert.match(deepLink, /newPaidOrderIDs\.insert\(order\.id\)/);
  assert.match(deepLink, /guard let orderID = batch\.order_id/);
  assert.match(deepLink, /newPaidOrderIDs\.contains\(orderID\)/);
  assert.match(deepLink, /let checkoutSessionID = pendingCheckout\.checkoutSessionID/);
  assert.match(deepLink, /\$0\.stripe_checkout_session_id == checkoutSessionID/);
  assert.match(deepLink, /case "failed", "cancelled", "expired"/);
  assert.match(deepLink, /case "refunded"/);
  assert.match(store, /let userID = authSession\?\.user\?\.id,[\s\S]*!isReconcilingCheckout/);
  assert.match(store, /for delay in CheckoutReconciliation\.retryDelaysNanoseconds/);
  assert.match(store, /async let creditRequest = api\.credits/);
  assert.match(store, /async let orderRequest = api\.orders/);
  assert.match(store, /checkoutSessionID: checkout\.checkout_session_id/);
  assert.match(store, /PendingCheckoutStore\.save\(PendingCheckout\(/);
  assert.match(store, /let pendingCheckout = PendingCheckoutStore\.load\(for: userID\)/);
  assert.match(store, /CheckoutReconciliation\.settlement\([\s\S]*pendingCheckout: pendingCheckout/);
  assert.match(store, /PendingCheckoutStore\.clear\(\)/);
  assert.match(store, /await reconcilePendingCheckout\(\)/);
  assert.match(api, /select", value: "id,order_id,total,remaining,expires_at"/);
  assert.doesNotMatch(api, /URLQueryItem\(name: "remaining", value: "gt\.0"\)/);
  assert.match(pendingStore, /checkout\.userID == userID/);
  assert.match(pendingStore, /let checkoutSessionID: String\?/);
  assert.match(pendingStore, /now\.timeIntervalSince\(checkout\.startedAt\) <= maximumAge/);
  assert.match(booking, /Confirming purchase\.\.\./);
  assert.match(booking, /Purchase confirmation is taking longer than usual/);
  assert.match(swiftTests, /testCheckoutReconciliationRequiresThePaidOrdersFulfillmentBatch/);
  assert.match(swiftTests, /testCheckoutReconciliationUsesTheExactStripeSessionAndClosesTerminalStates/);
  assert.match(swiftTests, /creditBatch\(remaining: 0, orderID: newOrderID\)/);
  assert.match(swiftTests, /testPendingCheckoutRoundTripsForTheSameUser/);
  assert.match(swiftTests, /testPendingCheckoutRejectsAnotherUserAndExpires/);
});

test('native order fixtures preserve the purchased credit terms', () => {
  assert.match(swiftTests, /OrderItem\([\s\S]*credit_total:\s*10,[\s\S]*credit_validity_days:\s*90,/);
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
