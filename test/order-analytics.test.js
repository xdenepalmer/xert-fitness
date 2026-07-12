import assert from 'node:assert/strict';
import test from 'node:test';

import { filterOrders, orderCsvRows, summarizeOrders } from '../src/lib/orderAnalytics.js';

const NOW = Date.parse('2026-07-12T12:00:00+10:00');
const orders = [
  { id: 'a', status: 'paid', amount_cents: 4800, currency: 'aud', paid_at: '2026-07-12T00:00:00Z', email: 'alex@example.com', products: { name: 'Starter' }, stripe_checkout_session_id: 'cs_alex' },
  { id: 'b', status: 'paid', amount_cents: 1500, currency: 'aud', paid_at: '2026-06-01T00:00:00Z', email: 'sam@example.com', products: { name: 'Single' } },
  { id: 'c', status: 'refunded', amount_cents: 2000, currency: 'aud', paid_at: '2026-07-10T00:00:00Z', email: 'refund@example.com' },
];

test('filters orders by status, age, and reconciliation search text', () => {
  assert.deepEqual(filterOrders(orders, { status: 'paid', days: '30' }, NOW).map(order => order.id), ['a']);
  assert.deepEqual(filterOrders(orders, { search: 'CS_ALEX', days: 'all' }, NOW).map(order => order.id), ['a']);
  assert.deepEqual(filterOrders(orders, { status: 'refunded', days: 'all' }, NOW).map(order => order.id), ['c']);
});

test('revenue summaries include paid orders only and expose currency scope', () => {
  const summary = summarizeOrders(orders, new Date('2026-07-12T12:00:00+10:00'));
  assert.equal(summary.totalRevenue, 6300);
  assert.equal(summary.monthRevenue, 4800);
  assert.equal(summary.paidCount, 2);
  assert.deepEqual(summary.currencies, ['aud']);
});

test('exports human currency amounts and Stripe reconciliation identifiers', () => {
  const [row] = orderCsvRows(orders);
  assert.equal(row.amount, '48.00');
  assert.equal(row.currency, 'AUD');
  assert.equal(row.checkout_session, 'cs_alex');
});
