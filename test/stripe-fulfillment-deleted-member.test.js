import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FIX = new URL(
  '../supabase/migrations/20260726002000_stripe_fulfillment_deleted_member_fix.sql',
  import.meta.url,
);

test('a deleted member no longer fails fulfilment for the whole store', async () => {
  const sql = await readFile(FIX, 'utf8');

  // orders.user_id is `on delete set null`, so a deleted buyer leaves NULL.
  // NULL is always `distinct from` the event's user id, so the unguarded
  // comparison could never settle and gated checkout for every member.
  assert.match(
    sql,
    /\(v_order\.user_id is not null and v_order\.user_id is distinct from p_user_id\)/,
    'identity check must tolerate a NULL user_id from a deleted account',
  );
  assert.doesNotMatch(
    sql,
    /^\s*if v_order\.user_id is distinct from p_user_id/m,
    'must not keep the unguarded comparison that rejected deleted accounts',
  );
});

test('no credits are granted when the buying account is gone', async () => {
  const sql = await readFile(FIX, 'utf8');
  const guardIndex = sql.indexOf('if v_order.user_id is not null then');
  const insertIndex = sql.indexOf('insert into public.credit_batches');
  assert.ok(guardIndex > -1, 'credit grant must be guarded on a surviving account');
  assert.ok(insertIndex > guardIndex, 'the guard must precede the credit insert');
});

test('every other identity field is still enforced exactly', async () => {
  const sql = await readFile(FIX, 'utf8');
  for (const check of [
    'v_order.product_id is distinct from p_product_id',
    'v_order.amount_cents is distinct from p_amount_cents',
    "lower(coalesce(v_order.currency, '')) <> lower(p_currency)",
  ]) {
    assert.ok(sql.includes(check), `${check} must remain enforced`);
  }
  assert.match(sql, /raise exception 'Stripe fulfillment does not match the recorded order'/);
});

test('the pending-order requirement and payload validation are unchanged', async () => {
  const sql = await readFile(FIX, 'utf8');
  assert.match(sql, /raise exception 'Stripe fulfillment requires a recorded pending order'/);
  assert.match(sql, /raise exception 'Invalid Stripe fulfillment payload'/);
  assert.match(sql, /lower\(coalesce\(p_currency, ''\)\) <> 'aud'/, 'AUD-only guard must remain');
});

test('execute stays restricted to the service role', async () => {
  const sql = await readFile(FIX, 'utf8');
  assert.match(sql, /revoke execute on function public\.fulfill_stripe_checkout\([\s\S]*?from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.fulfill_stripe_checkout\([\s\S]*?to service_role;/);
});
