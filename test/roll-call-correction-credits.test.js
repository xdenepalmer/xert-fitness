import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FIX = new URL(
  '../supabase/migrations/20260726003000_roll_call_correction_double_credit_fix.sql',
  import.meta.url,
);

// The header comment quotes the superseded code on purpose, so assertions
// about what the migration *does* have to look at executable SQL only.
async function body() {
  const text = await readFile(FIX, 'utf8');
  return text.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
}

test('attended and no_show count as already holding a credit', async () => {
  const text = await body();
  const guards = text.match(
    /v_current not in \('requested', 'confirmed', 'attended', 'no_show'\)/g,
  ) || [];
  assert.equal(guards.length, 2,
    'both the waitlist-order check and the credit charge must skip already-credited states');
  assert.doesNotMatch(
    text,
    /v_current not in \('requested', 'confirmed'\)\s*then/,
    'the narrow guard that re-charged a roll-call correction must be gone',
  );
});

test('refunds mirror the charge so credits are never stranded', async () => {
  const text = await body();
  assert.match(
    text,
    /v_current in \('requested', 'confirmed', 'attended', 'no_show'\) and v_batch is not null/,
    'cancelling from attended/no_show must return the credit',
  );
});

test('attendance is still only reachable from confirmed', async () => {
  const text = await body();
  assert.match(
    text,
    /if p_status in \('attended', 'no_show'\) and v_current <> 'confirmed' then\s*\n\s*raise exception 'STATUS_TRANSITION_NOT_ALLOWED';/,
    'the transition guard that makes the already-credited assumption safe must remain',
  );
});

test('booking safety rules are all still enforced', async () => {
  const text = await body();
  for (const guard of [
    "raise exception 'ADMIN_ONLY'",
    "raise exception 'INVALID_STATUS'",
    "raise exception 'BOOKING_NOT_FOUND'",
    "raise exception 'WAITLIST_ORDER_REQUIRED'",
    "raise exception 'SESSION_NOT_BOOKABLE'",
    "raise exception 'SESSION_IN_PAST'",
    "raise exception 'SESSION_FULL'",
    "raise exception 'NO_CREDITS'",
  ]) {
    assert.ok(text.includes(guard), `${guard} must remain enforced`);
  }
});

test('execute stays restricted to authenticated callers behind the admin gate', async () => {
  const text = await body();
  assert.match(text, /revoke execute on function public\.admin_set_booking_status\(uuid, text\) from public, anon;/);
  assert.match(text, /grant execute on function public\.admin_set_booking_status\(uuid, text\) to authenticated;/);
});

test('re-run keeps a helper-backed status RPC instead of restoring inline remaining+1', async () => {
  const text = await body();
  assert.match(text, /keeping newer admin_set_booking_status/);
  assert.match(text, /refund_credits_to_batch/);
  // Historical bootstrap body is still present for databases that never got the helper.
  assert.match(text, /remaining = remaining \+ 1/);
});
