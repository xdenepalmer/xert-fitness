import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  clearCheckoutAttemptID,
  getOrCreateCheckoutAttemptID,
} from '../src/lib/checkoutAttempt.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

const firstAttempt = '7b464e63-6e3f-4f7d-94be-d8ef4231d589';
const secondAttempt = '35afbd15-3178-41d1-9290-37caf1c62ae0';

test('web checkout reuses a bounded attempt until successful handoff', () => {
  const storage = memoryStorage();
  let created = 0;
  const createID = () => [firstAttempt, secondAttempt][created++];

  assert.equal(getOrCreateCheckoutAttemptID('starter', storage, 1_000, createID), firstAttempt);
  assert.equal(getOrCreateCheckoutAttemptID('starter', storage, 2_000, createID), firstAttempt);
  assert.equal(created, 1);

  clearCheckoutAttemptID('starter', storage);
  assert.equal(getOrCreateCheckoutAttemptID('starter', storage, 3_000, createID), secondAttempt);
  assert.equal(created, 2);
});

test('web checkout replaces expired or malformed attempts', () => {
  const storage = memoryStorage();
  storage.setItem('xert:checkout-attempt:starter', JSON.stringify({ id: 'invalid', createdAt: 1_000 }));
  assert.equal(getOrCreateCheckoutAttemptID('starter', storage, 2_000, () => firstAttempt), firstAttempt);

  assert.equal(
    getOrCreateCheckoutAttemptID('starter', storage, 20 * 60 * 1000 + 2_001, () => secondAttempt),
    secondAttempt
  );
});

test('web checkout sends a fresh stable attempt identifier with the purchase request', async () => {
  const source = await readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8');
  const checkout = source.slice(
    source.indexOf('export async function startCheckout'),
    source.indexOf('export async function getMyCredits')
  );

  assert.match(checkout, /getOrCreateCheckoutAttemptID\(productSlug\)/);
  assert.match(checkout, /checkout_attempt_id: checkoutAttemptID/);
  assert.match(checkout, /clearCheckoutAttemptID\(productSlug\)/);
  assert.equal((checkout.match(/fetch\('\/api\/checkout'/g) || []).length, 1);
});
