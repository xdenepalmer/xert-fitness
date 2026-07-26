import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('tip migration mirrors operator script for booking-decision notice honesty', () => {
  const tip = read('../supabase/migrations/20260726123000_booking_decision_notice_credit_honesty.sql');
  const operator = read('../src/supabase/booking_decision_notice_credit_honesty.sql');
  assert.equal(tip, operator);
  assert.match(tip, /create or replace function public\.admin_set_booking_status_with_notice/i);
  assert.match(tip, /booking_decision_notice_credit_honesty/);
  assert.match(tip, /waitlist_skip_notice_accuracy/);
});

test('booking-decision notices no longer claim an unconditional credit return', () => {
  for (const path of [
    '../src/supabase/booking_decision_notice_credit_honesty.sql',
    '../src/supabase/waitlist_skip_notice_accuracy.sql',
    '../supabase/migrations/20260726123000_booking_decision_notice_credit_honesty.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /Waitlist place removed/);
    assert.match(sql, /No class credit was charged/);
    assert.match(sql, /Reserved credit is returned when the pack is still live/);
    assert.doesNotMatch(
      sql,
      /Your reserved credit has been returned/,
      `${path} must not claim an unconditional credit return`,
    );
    assert.doesNotMatch(
      sql,
      /Any reserved class credit has been returned to your account/,
      `${path} must not claim an unconditional credit return on cancel`,
    );
  }
});

test('historical waitlist-skip migration keeps newer pack-still-live honesty', () => {
  const historical = read('../supabase/migrations/20260726115000_waitlist_skip_notice_accuracy.sql');
  assert.match(historical, /keeping newer admin_set_booking_status_with_notice/);
  assert.match(historical, /pack is still live/);
});
