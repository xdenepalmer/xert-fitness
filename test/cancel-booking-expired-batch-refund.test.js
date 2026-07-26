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

test('migration and operator mirror are identical', async () => {
  const [migration, mirror] = await Promise.all([
    readFile(MIGRATION, 'utf8'),
    readFile(MIRROR, 'utf8'),
  ]);
  assert.equal(mirror.replace(/\r\n/g, '\n').trim(), migration.replace(/\r\n/g, '\n').trim());
});

test('timely cancel restores credit without an unexpired-batch guard', async () => {
  const text = await executableBody(MIGRATION);
  assert.match(
    text,
    /v_status = 'requested' or \(v_status = 'confirmed' and v_start - now\(\) > interval '12 hours'\)/,
    '12-hour confirmed and always-requested refund window must remain',
  );
  assert.match(text, /set remaining = remaining \+ 1/, 'credit must be restored');
  assert.doesNotMatch(
    text,
    /where id = v_batch and \(expires_at is null or expires_at > now\(\)\)/,
    'expired packs must no longer block the refund',
  );
  assert.match(
    text,
    /where id = v_batch;/,
    'refund targets the booking batch by id alone',
  );
});

test('expired packs are reactivated so the returned credit is bookable', async () => {
  const text = await executableBody(MIGRATION);
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

test('waitlisted places still never refund and late confirmed cancels still forfeit', async () => {
  const text = await executableBody(MIGRATION);
  assert.match(text, /v_status not in \('requested', 'confirmed', 'waitlisted'\)/);
  assert.doesNotMatch(
    text,
    /v_status = 'waitlisted'[\s\S]*remaining = remaining \+ 1/,
    'waitlisted cancel must not restore a credit',
  );
  // The refund branch still requires the 12-hour confirmed window (or requested).
  assert.match(text, /v_start - now\(\) > interval '12 hours'/);
});

test('fresh schema and booking-modes upgrade carry the same refund policy', async () => {
  for (const url of [BOOKING_SCHEMA, BOOKING_MODES]) {
    const text = await executableBody(url);
    assert.match(text, /greatest\(v_start, now\(\) \+ interval '12 hours'\)/);
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
