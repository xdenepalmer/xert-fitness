import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const MIGRATION = '../supabase/migrations/20260726120000_roll_call_stripe_refund_clears_credit_batch.sql';
const OPERATOR = '../src/supabase/roll_call_stripe_refund_clears_credit_batch.sql';

test('roll-call / Stripe-refund clear migration and operator mirror match', () => {
  assert.equal(
    read(MIGRATION).replace(/\r\n/g, '\n'),
    read(OPERATOR).replace(/\r\n/g, '\n'),
  );
});

test('roll-call cancels requested places with credit_batch_id cleared after release', () => {
  for (const sql of [read(MIGRATION), read(OPERATOR)]) {
    assert.match(sql, /create or replace function public\.admin_record_session_attendance/i);
    assert.match(sql, /status = 'requested'/i);
    assert.match(sql, /o\.status = 'refunded'/i);
    assert.match(
      sql,
      /set status = 'cancelled',\s*cancelled_at = now\(\),\s*credit_batch_id = null/i,
    );
    assert.match(sql, /values \('roll_call_stripe_refund_clears_credit_batch'\)/i);
  }
});

test('Stripe refund cancel clears credit_batch_id on requested/confirmed places', () => {
  for (const sql of [read(MIGRATION), read(OPERATOR)]) {
    assert.match(sql, /create or replace function public\.reconcile_stripe_order_refund/i);
    assert.match(
      sql,
      /set status = 'cancelled',\s*cancelled_at = coalesce\(cancelled_at, p_refunded_at\),\s*credit_batch_id = null/i,
    );
    assert.match(sql, /status in \('requested', 'confirmed'\)/i);
    assert.match(sql, /grant execute on function public\.reconcile_stripe_order_refund[\s\S]*to service_role/i);
  }
});
