import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const MIGRATION = '../supabase/migrations/20260726119000_booking_credit_release_clears_batch.sql';
const OPERATOR = '../src/supabase/booking_credit_release_clears_batch.sql';

test('credit-release clear migration and operator mirror match', () => {
  assert.equal(
    read(MIGRATION).replace(/\r\n/g, '\n'),
    read(OPERATOR).replace(/\r\n/g, '\n'),
  );
});

test('cancel and status demotions clear credit_batch_id when a credit is released', () => {
  for (const sql of [read(MIGRATION), read(OPERATOR)]) {
    assert.match(sql, /create or replace function public\.cancel_booking\(p_booking_id uuid\)/i);
    assert.match(sql, /v_refund := \(v_status = 'requested'/i);
    assert.match(
      sql,
      /credit_batch_id = case when v_refund then null else credit_batch_id end/i,
    );
    assert.match(sql, /perform public\.refund_credits_to_batch\(v_batch, 1, v_start\)/i);

    assert.match(sql, /create or replace function public\.admin_set_booking_status/i);
    assert.match(sql, /v_release_credit := p_status in \('waitlisted', 'declined', 'cancelled'\)/i);
    assert.match(sql, /when p_status = 'waitlisted' then null/i);
    assert.match(sql, /when v_release_credit then null/i);

    assert.match(sql, /create or replace function public\.admin_cancel_class_session/i);
    assert.match(sql, /credit_batch_id = null/i);
    assert.match(sql, /status = 'refunded'/i);
    assert.match(sql, /values \('booking_credit_release_clears_batch'\)/i);
  }
});
