import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKOUT_BURST_LIMIT,
  CHECKOUT_BURST_WINDOW_MS,
  memberCheckoutBurstExceeded,
} from '../api/checkout.js';

test('checkout burst constants stay intentionally small', () => {
  assert.equal(CHECKOUT_BURST_LIMIT, 8);
  assert.equal(CHECKOUT_BURST_WINDOW_MS, 10 * 60 * 1000);
});

test('memberCheckoutBurstExceeded counts recent orders for the member', async () => {
  const calls = [];
  const admin = {
    from(table) {
      assert.equal(table, 'orders');
      const query = {
        select() { return query; },
        eq(column, value) {
          calls.push(['eq', column, value]);
          return query;
        },
        gte(column, value) {
          calls.push(['gte', column, value]);
          return query;
        },
        then(resolve) {
          return Promise.resolve({ count: 8, error: null }).then(resolve);
        },
      };
      return query;
    },
  };

  assert.equal(
    await memberCheckoutBurstExceeded(admin, 'user-1', {
      now: new Date('2026-07-26T12:00:00.000Z'),
    }),
    true,
  );
  assert.deepEqual(calls[0], ['eq', 'user_id', 'user-1']);
  assert.equal(calls[1][0], 'gte');
  assert.equal(calls[1][1], 'created_at');
  assert.equal(calls[1][2], '2026-07-26T11:50:00.000Z');
});

test('memberCheckoutBurstExceeded allows quieter members', async () => {
  const admin = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        gte() { return query; },
        then(resolve) {
          return Promise.resolve({ count: 2, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  assert.equal(await memberCheckoutBurstExceeded(admin, 'user-2'), false);
  assert.equal(await memberCheckoutBurstExceeded(admin, ''), false);
});
