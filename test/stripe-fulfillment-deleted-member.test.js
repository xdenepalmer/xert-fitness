import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FIX = new URL(
  '../supabase/migrations/20260726107000_stripe_fulfillment_deleted_member_overload_fix.sql',
  import.meta.url,
);
const OPERATOR = new URL(
  '../src/supabase/stripe_fulfillment_deleted_member_fix.sql',
  import.meta.url,
);
const SUPERSEDED = new URL(
  '../supabase/migrations/20260726002000_stripe_fulfillment_deleted_member_fix.sql',
  import.meta.url,
);
const WEBHOOK = new URL('../api/stripe-webhook.js', import.meta.url);

const LIVE_IDENTITY_ARGS = 'text, uuid, uuid, text, integer, text, text, timestamptz, integer, integer';
const DEAD_IDENTITY_ARGS = 'text, uuid, uuid, text, integer, text, text, timestamptz, integer, timestamptz';

function lastArgBlock(sql) {
  const match = sql.match(
    /create or replace function public\.fulfill_stripe_checkout\([\s\S]*?p_credit_total integer,\s*(p_\w+ \w+)\s*\)/,
  );
  return match?.[1] || '';
}

test('repair targets the live p_credit_validity_days overload the API calls', async () => {
  const [sql, operator, webhook] = await Promise.all([
    readFile(FIX, 'utf8'),
    readFile(OPERATOR, 'utf8'),
    readFile(WEBHOOK, 'utf8'),
  ]);

  assert.equal(lastArgBlock(sql), 'p_credit_validity_days integer');
  assert.equal(lastArgBlock(operator), 'p_credit_validity_days integer');
  assert.match(webhook, /p_credit_validity_days:\s*fulfillment\.credit\.validity_days/);
  assert.doesNotMatch(webhook, /p_expires_at:/);

  for (const body of [sql, operator]) {
    assert.match(
      body,
      new RegExp(`drop function if exists public\\.fulfill_stripe_checkout\\(\\s*${DEAD_IDENTITY_ARGS.replace(/, /g, ',\\s*')}\\s*\\)`, 'i'),
    );
    assert.match(
      body,
      new RegExp(`grant execute on function public\\.fulfill_stripe_checkout\\(\\s*${LIVE_IDENTITY_ARGS.replace(/, /g, ',\\s*')}\\s*\\)`, 'i'),
    );
    assert.doesNotMatch(
      body,
      /grant execute on function public\.fulfill_stripe_checkout\(\s*text, uuid, uuid, text, integer, text, text, timestamptz, integer, timestamptz\s*\)/i,
    );
    assert.doesNotMatch(
      body,
      /create or replace function public\.fulfill_stripe_checkout\([\s\S]*?p_expires_at timestamptz\s*\)/,
    );
  }
});

test('superseded migration is marked unsafe to re-run and still documents the wrong signature', async () => {
  const sql = await readFile(SUPERSEDED, 'utf8');
  assert.match(sql, /SUPERSEDED by 20260726107000_stripe_fulfillment_deleted_member_overload_fix/i);
  assert.equal(lastArgBlock(sql) || 'p_expires_at timestamptz', 'p_expires_at timestamptz');
});

test('a deleted member no longer fails fulfilment for the whole store', async () => {
  const sql = await readFile(FIX, 'utf8');

  assert.match(
    sql,
    /keeping newer fulfill_stripe_checkout/,
    're-run must not strip deleted-buyer email erasure',
  );
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
  assert.match(sql, /make_interval\(days => v_order\.credit_validity_days\)/);
});

test('every other identity field is still enforced exactly', async () => {
  const sql = await readFile(FIX, 'utf8');
  for (const check of [
    'v_order.product_id is distinct from p_product_id',
    'v_order.amount_cents is distinct from p_amount_cents',
    "lower(coalesce(v_order.currency, '')) <> lower(p_currency)",
    'v_order.credit_total is distinct from p_credit_total',
    'v_order.credit_validity_days is distinct from p_credit_validity_days',
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
  assert.match(sql, /Stripe fulfillment requires service role/);
});

test('execute stays restricted to the service role on the live overload', async () => {
  const sql = await readFile(FIX, 'utf8');
  assert.match(sql, /revoke execute on function public\.fulfill_stripe_checkout\([\s\S]*?from public, anon, authenticated;/);
  assert.match(
    sql,
    new RegExp(`grant execute on function public\\.fulfill_stripe_checkout\\(\\s*${LIVE_IDENTITY_ARGS.replace(/, /g, ',\\s*')}\\s*\\)[\\s\\S]*?to service_role;`, 'i'),
  );
});

test('operator mirror keeps deleted-member settlement and email erasure', async () => {
  // Operator file is ahead of the historical overload-repair migration so a
  // re-run cannot restore the unguarded Stripe email write.
  const operator = await readFile(OPERATOR, 'utf8');
  assert.match(operator, /keeping newer fulfill_stripe_checkout/);
  assert.match(
    operator,
    /\(v_order\.user_id is not null and v_order\.user_id is distinct from p_user_id\)/,
  );
  assert.match(
    operator,
    /email = case\s+when orders\.user_id is null then null/s,
  );
  assert.match(operator, /p_credit_validity_days integer/);
  assert.doesNotMatch(operator, /p_expires_at timestamptz/);
});
