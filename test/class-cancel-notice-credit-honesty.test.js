import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('tip migration mirrors operator script for class-cancel notice honesty', () => {
  const tip = read('../supabase/migrations/20260726122000_class_cancel_notice_credit_honesty.sql');
  const operator = read('../src/supabase/class_cancel_notice_credit_honesty.sql');
  assert.equal(tip, operator);
  assert.match(tip, /create or replace function public\.create_class_cancellation_notice/i);
  assert.match(tip, /class_cancel_notice_credit_honesty/);
});
