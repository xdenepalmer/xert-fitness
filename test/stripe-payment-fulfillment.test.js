import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const paths = [
  '../src/supabase/booking_schema.sql',
  '../src/supabase/stripe_payment_fulfillment_upgrade.sql',
  '../supabase/migrations/20260716040000_stripe_order_terms_snapshot.sql',
];

function fulfillmentFunction(sql) {
  const start = sql.indexOf('create or replace function public.fulfill_stripe_checkout');
  const end = sql.indexOf('revoke execute on function public.fulfill_stripe_checkout', start);
  return sql.slice(start, end);
}

test('every database path settles Stripe payments in one locked transaction', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /function public\.fulfill_stripe_checkout/i);
    if (!path.includes('20260716040000')) {
      assert.match(sql, /credit_batches_order_id_key[\s\S]*unique \(order_id\)|order_id\s+uuid unique/i);
    }
    assert.match(sql, /where orders\.stripe_checkout_session_id = p_checkout_session_id[\s\S]*for update/i);
    const fulfillment = fulfillmentFunction(sql);
    assert.doesNotMatch(fulfillment, /insert into public\.orders/i);
    assert.match(fulfillment, /Stripe fulfillment requires a recorded pending order/i);
    assert.match(sql, /on conflict \(order_id\) do nothing/i);
    assert.match(sql, /values \('stripe_payment_fulfillment'\)/i);
    assert.match(sql, /values \('stripe_pending_order_guard'\)/i);
    assert.match(sql, /values \('stripe_order_terms_snapshot'\)/i);
  }
});

test('refunds are terminal before any paid transition or credit insertion', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    const terminalGuard = sql.indexOf("v_order.status = 'refunded'");
    const paidUpdate = sql.indexOf("status = 'paid'", terminalGuard);
    const creditInsert = sql.indexOf('insert into public.credit_batches', terminalGuard);
    assert.ok(terminalGuard >= 0 && paidUpdate > terminalGuard && creditInsert > paidUpdate);
    assert.match(sql, /return query select v_order\.id, v_order\.status, false/i);
  }
});

test('fulfillment validates immutable payment identity and is service-role only', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /v_order\.user_id is distinct from p_user_id/i);
    assert.match(sql, /v_order\.product_id is distinct from p_product_id/i);
    assert.match(sql, /v_order\.amount_cents is distinct from p_amount_cents/i);
    assert.match(sql, /v_order\.credit_total is distinct from p_credit_total/i);
    assert.match(sql, /v_order\.credit_validity_days is distinct from p_credit_validity_days/i);
    assert.match(sql, /make_interval\(days => v_order\.credit_validity_days\)/i);
    assert.doesNotMatch(fulfillmentFunction(sql), /p_expires_at/i);
    assert.match(sql, /v_order\.stripe_payment_intent_id[\s\S]*<> p_payment_intent_id/i);
    assert.match(sql, /revoke execute[\s\S]*from public, anon, authenticated/i);
    assert.match(sql, /grant execute[\s\S]*to service_role/i);
  }
});

test('Stripe order credit terms are required at insert and immutable afterwards', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /credit_total/i);
    assert.match(sql, /credit_validity_days/i);
    assert.match(sql, /Stripe orders require a purchased credit terms snapshot/i);
    assert.match(sql, /Stripe order credit terms are immutable/i);
    assert.match(sql, /before insert or update on public\.orders/i);
  }
});
