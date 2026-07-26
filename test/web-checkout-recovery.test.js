import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  clearPendingWebCheckout,
  loadPendingWebCheckout,
  pendingWebCheckoutForReturn,
  savePendingWebCheckout,
  WEB_CHECKOUT_RETRY_DELAYS_MS,
  webCheckoutSettlement,
} from '../src/lib/webCheckoutRecovery.js';

const USER_ID = '81fdd46a-d2a9-4ab4-a479-0e687c72c4f2';
const OTHER_USER_ID = '9bb45f52-9022-4b5b-933f-d8998dbe659f';
const SESSION_ID = 'cs_test_XertRecovery123';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    size() { return values.size; },
  };
}

test('web checkout recovery is user-bound, validated and expires after 24 hours', () => {
  const storage = memoryStorage();
  const startedAt = 1_800_000_000_000;
  const pending = savePendingWebCheckout({ userID: USER_ID, checkoutSessionID: SESSION_ID }, storage, startedAt);
  assert.deepEqual(loadPendingWebCheckout(USER_ID, storage, startedAt + 60_000), pending);

  assert.equal(loadPendingWebCheckout(OTHER_USER_ID, storage, startedAt + 60_000), null);
  assert.equal(storage.size(), 0);

  savePendingWebCheckout({ userID: USER_ID, checkoutSessionID: SESSION_ID }, storage, startedAt);
  assert.equal(loadPendingWebCheckout(USER_ID, storage, startedAt + 24 * 60 * 60 * 1000 + 1), null);
  assert.equal(storage.size(), 0);

  assert.throws(
    () => savePendingWebCheckout({ userID: USER_ID, checkoutSessionID: 'not-a-session' }, storage, startedAt),
    /invalid confirmation identity/,
  );
  assert.throws(
    () => savePendingWebCheckout({
      userID: USER_ID,
      checkoutSessionID: `cs_test_${'A'.repeat(256)}`,
    }, storage, startedAt),
    /invalid confirmation identity/,
  );
  clearPendingWebCheckout(storage);
});

test('web checkout recovery settles only the exact Stripe session order', () => {
  const pending = { userID: USER_ID, checkoutSessionID: SESSION_ID, startedAt: Date.now() };
  assert.equal(webCheckoutSettlement(pending, []), 'pending');
  assert.equal(webCheckoutSettlement(pending, [{ stripe_checkout_session_id: 'cs_test_Other', status: 'paid' }]), 'pending');
  assert.equal(webCheckoutSettlement(pending, [{ stripe_checkout_session_id: SESSION_ID, status: 'pending' }]), 'pending');
  assert.equal(webCheckoutSettlement(pending, [{ stripe_checkout_session_id: SESSION_ID, status: 'paid' }]), 'confirmed');
  assert.equal(webCheckoutSettlement(pending, [{ stripe_checkout_session_id: SESSION_ID, status: 'refunded' }]), 'refunded');
  assert.equal(webCheckoutSettlement(pending, [{ stripe_checkout_session_id: SESSION_ID, status: 'failed' }]), 'failed');
  assert.deepEqual(WEB_CHECKOUT_RETRY_DELAYS_MS, [0, 2_000, 3_000, 5_000]);
});

test('Stripe return identity recovers without storage but cannot replace a valid stored handoff', () => {
  const now = 1_800_000_000_000;
  const returned = pendingWebCheckoutForReturn({
    userID: USER_ID,
    checkoutSessionID: SESSION_ID,
    now,
  });
  assert.deepEqual(returned, {
    userID: USER_ID,
    checkoutSessionID: SESSION_ID,
    startedAt: now,
  });

  const stored = {
    userID: USER_ID,
    checkoutSessionID: 'cs_test_StoredIdentity',
    startedAt: now - 1_000,
  };
  assert.equal(pendingWebCheckoutForReturn({
    userID: USER_ID,
    checkoutSessionID: SESSION_ID,
    storedPending: stored,
    now,
  }), stored);
  assert.equal(pendingWebCheckoutForReturn({
    userID: OTHER_USER_ID,
    checkoutSessionID: 'not-a-session',
    storedPending: stored,
    now,
  }), null);
});

test('web checkout handoff persists exact recovery identity and clears cancelled returns', async () => {
  const [checkoutAPI, bookingData, account, booking] = await Promise.all([
    readFile(new URL('../api/checkout.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Account.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Booking.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(checkoutAPI, /checkout_session_id: reusableCheckout\.checkoutSessionID/);
  assert.match(checkoutAPI, /verifiedCreatedCheckoutURL\(session, user, product/);
  assert.match(checkoutAPI, /json\(\{ url: checkoutURL, checkout_session_id: session\.id \}\)/);
  assert.match(bookingData, /savePendingWebCheckout\(\{ userID: session\.user\.id, checkoutSessionID \}\)/);
  assert.ok(bookingData.indexOf('savePendingWebCheckout') < bookingData.indexOf('window.location.href = url'));
  assert.match(account, /webCheckoutSettlement\(pending, loadedOrders\)/);
  assert.match(account, /pendingWebCheckoutForReturn\(/);
  assert.match(account, /searchParams\.get\('checkout_session_id'\)/);
  assert.match(account, /nextParams\.delete\('checkout_session_id'\)/);
  assert.match(account, /commerceRequestID === commerceRequestIDRef\.current/);
  assert.match(account, /setPurchaseStatus\('delayed'\)/);
  assert.match(account, /if \(!pending\) \{[\s\S]*setPurchaseStatus\('failed'\)/);
  assert.match(account, /Payment confirmed/);
  assert.match(account, /Check again/);
  assert.match(booking, /searchParams\.get\('purchase'\) !== 'cancelled'/);
  assert.match(booking, /clearPendingWebCheckout\(\)/);
  assert.match(booking, /No payment was taken/);
});
