import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDailyRevenue, filterOrders, orderCsvRows, summarizeOrders } from '../src/lib/orderAnalytics.js';

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

test('exports human currency amounts, purchased terms and Stripe reconciliation identifiers', () => {
  const [row] = orderCsvRows([{
    ...orders[0], credit_total: 4, credit_validity_days: 28,
    reconciled_at: '2026-07-13T03:00:00Z', reconciled_by: 'admin-xert',
  }]);
  assert.equal(row.amount, '48.00');
  assert.equal(row.currency, 'AUD');
  assert.equal(row.credit_total, 4);
  assert.equal(row.credit_validity_days, 28);
  assert.equal(row.checkout_session, 'cs_alex');
  assert.equal(row.reconciled_at, '2026-07-13T03:00:00Z');
  assert.equal(row.reconciled_by, 'admin-xert');
});

test('leaves unavailable legacy purchased terms blank in exports', () => {
  const [row] = orderCsvRows([{ ...orders[1], credit_total: null, credit_validity_days: null }]);
  assert.equal(row.credit_total, '');
  assert.equal(row.credit_validity_days, '');
});

test('exports the durable refund and credit reconciliation ledger', () => {
  const [row] = orderCsvRows([{
    ...orders[2], refunded_amount_cents: 2000, refunded_at: '2026-07-11T00:00:00Z',
    stripe_refunds: { credits_revoked: 2, credits_consumed: 1, bookings_cancelled: 1 },
  }]);
  assert.equal(row.refunded_amount, '20.00');
  assert.equal(row.credits_revoked, 2);
  assert.equal(row.credits_consumed_before_refund, 1);
  assert.equal(row.bookings_cancelled, 1);
});

test('builds a bounded daily paid-revenue series without counting refunds', () => {
  const series = buildDailyRevenue(orders, new Date(2026, 6, 12, 12), 3);
  assert.equal(series.length, 3);
  assert.deepEqual(series.map(day => day.label), ['10 July', '11 July', '12 July']);
  assert.deepEqual(series.map(day => day.amountCents), [0, 0, 4800]);
  assert.equal(buildDailyRevenue([], new Date(2026, 6, 12), 1000).length, 366);
});
