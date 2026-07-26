import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MIGRATION = new URL(
  '../supabase/migrations/20260726080000_cancel_booking_expired_batch_refund.sql',
  import.meta.url,
);
const MIRROR = new URL(
  '../src/supabase/cancel_booking_expired_batch_refund.sql',
  import.meta.url,
);
const BOOKING_SCHEMA = new URL('../src/supabase/booking_schema.sql', import.meta.url);
const BOOKING_MODES = new URL('../src/supabase/booking_modes_upgrade.sql', import.meta.url);

async function executableBody(url) {
  const text = await readFile(url, 'utf8');
  return text.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
}

test('historical migration keeps the expired-pack refund fix', async () => {
  const text = await executableBody(MIGRATION);
  assert.match(
    text,
    /keeping newer cancel_booking/,
    're-run must not strip helper-backed cancel_booking',
  );
  assert.match(
    text,
    /v_status = 'requested' or \(v_status = 'confirmed' and v_start - now\(\) > interval '12 hours'\)/,
    '12-hour confirmed and always-requested refund window must remain',
  );
  assert.match(text, /set remaining = remaining \+ 1/, 'bootstrap still documents inline restore');
  assert.doesNotMatch(
    text,
    /where id = v_batch and \(expires_at is null or expires_at > now\(\)\)/,
    'expired packs must no longer block the refund',
  );
  assert.match(
    text,
    /when expires_at is not null and expires_at <= now\(\)/,
    'only already-expired batches are extended',
  );
  assert.match(
    text,
    /greatest\(v_start, now\(\) \+ interval '12 hours'\)/,
    'reactivation must leave a usable window',
  );
});

test('operator mirror forwards cancel_booking through the shared refund helper', async () => {
  // Re-running the operator script must not reinstall an inline refund that
  // bypasses refund_skips_stripe_refunded_batches.
  const text = await executableBody(MIRROR);
  assert.match(text, /keeping newer cancel_booking/);
  assert.match(text, /perform public\.refund_credits_to_batch\(v_batch, 1, v_start\)/);
  assert.match(
    text,
    /v_status = 'requested' or \(v_status = 'confirmed' and v_start - now\(\) > interval '12 hours'\)/,
  );
});

test('waitlisted places still never refund and late confirmed cancels still forfeit', async () => {
  const text = await executableBody(MIRROR);
  assert.match(text, /v_status not in \('requested', 'confirmed', 'waitlisted'\)/);
  assert.doesNotMatch(
    text,
    /v_status = 'waitlisted'[\s\S]*refund_credits_to_batch/,
    'waitlisted cancel must not restore a credit',
  );
  // The refund branch still requires the 12-hour confirmed window (or requested).
  assert.match(text, /v_start - now\(\) > interval '12 hours'/);
});

test('fresh schema and booking-modes upgrade carry the same refund policy', async () => {
  for (const url of [BOOKING_SCHEMA, BOOKING_MODES]) {
    const text = await executableBody(url);
    assert.match(text, /refund_credits_to_batch\(v_batch, 1, v_start\)/);
    assert.match(
      text,
      /greatest\(coalesce\(p_anchor, now\(\)\), now\(\) \+ interval '12 hours'\)/,
    );
    assert.doesNotMatch(
      text,
      /where id = v_batch and \(expires_at is null or expires_at > now\(\)\)/,
    );
  }
});

test('capability marker is registered for release readiness', async () => {
  const text = await readFile(MIGRATION, 'utf8');
  assert.match(text, /values \('cancel_booking_expired_batch_refund'\)/);
  assert.match(
    text,
    /revoke execute on function public\.cancel_booking\(uuid\) from public, anon;/,
  );
  assert.match(
    text,
    /grant execute on function public\.cancel_booking\(uuid\) to authenticated;/,
  );
});
