import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const paths = [
  '../src/supabase/booking_schema.sql',
  '../src/supabase/stripe_payment_fulfillment_upgrade.sql',
  '../supabase/migrations/20260715010000_stripe_payment_fulfillment.sql',
];

test('every database path settles Stripe payments in one locked transaction', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /function public\.fulfill_stripe_checkout/i);
    assert.match(sql, /credit_batches_order_id_key[\s\S]*unique \(order_id\)|order_id\s+uuid unique/i);
    assert.match(sql, /where orders\.stripe_checkout_session_id = p_checkout_session_id[\s\S]*for update/i);
    assert.match(sql, /on conflict \(stripe_checkout_session_id\) do nothing/i);
    assert.match(sql, /on conflict \(order_id\) do nothing/i);
    assert.match(sql, /values \('stripe_payment_fulfillment'\)/i);
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
    assert.match(sql, /v_order\.stripe_payment_intent_id[\s\S]*<> p_payment_intent_id/i);
    assert.match(sql, /revoke execute[\s\S]*from public, anon, authenticated/i);
    assert.match(sql, /grant execute[\s\S]*to service_role/i);
  }
});
