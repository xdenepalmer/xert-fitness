import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260726121000_terminal_booking_clears_stale_credit_batch.sql', import.meta.url),
  'utf8',
);
const mirror = readFileSync(
  new URL('../src/supabase/terminal_booking_clears_stale_credit_batch.sql', import.meta.url),
  'utf8',
);

test('terminal stale credit-batch migration and operator mirror stay aligned', () => {
  assert.equal(mirror, migration);
  assert.match(migration, /values \('terminal_booking_clears_stale_credit_batch'\)/i);
});

test('waitlist cancel / skip clears leftover credit_batch_id', () => {
  assert.match(
    migration,
    /when v_status = 'waitlisted' then null/i,
  );
  assert.match(
    migration,
    /when p_status in \('cancelled', 'declined'\) and v_current = 'waitlisted' then null/i,
  );
});

test('Stripe refund clears terminal leftover credit_batch_id markers', () => {
  assert.match(
    migration,
    /set credit_batch_id = null\s+where credit_batch_id = v_batch\.id\s+and status in \('cancelled', 'declined', 'waitlisted'\)/i,
  );
  // Attended / no_show must keep the FK for refunded-pack skip.
  assert.doesNotMatch(
    migration,
    /status in \('cancelled', 'declined', 'waitlisted', 'attended'/i,
  );
});
