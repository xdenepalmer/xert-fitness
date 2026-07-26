import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MIGRATION = new URL(
  '../supabase/migrations/20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql',
  import.meta.url,
);
const MIRROR = new URL(
  '../src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql',
  import.meta.url,
);
const BOOKING_SCHEMA = new URL('../src/supabase/booking_schema.sql', import.meta.url);
const FULFILL_OPERATOR = new URL(
  '../src/supabase/stripe_fulfillment_deleted_member_fix.sql',
  import.meta.url,
);
const REFUND_OPERATOR = new URL(
  '../src/supabase/credit_batch_refund_reactivation.sql',
  import.meta.url,
);

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

test('deleted-buyer settlement never re-attaches Stripe email to the order', async () => {
  for (const url of [MIGRATION, BOOKING_SCHEMA, FULFILL_OPERATOR]) {
    const text = await executableBody(url);
    assert.match(
      text,
      /email = case\s+when orders\.user_id is null then null\s+else coalesce\(nullif\(btrim\(p_email\), ''\), orders\.email\)\s+end/s,
      `${url.pathname.split('/').pop()} must null email when the buyer row is already orphaned`,
    );
    assert.doesNotMatch(
      text,
      /set status = 'paid',\s*email = coalesce\(nullif\(btrim\(p_email\)/s,
      `${url.pathname.split('/').pop()} must not keep the unguarded email write`,
    );
  }
});

test('credit refunds skip packs whose Stripe order is already refunded', async () => {
  for (const url of [MIGRATION, REFUND_OPERATOR, BOOKING_SCHEMA]) {
    const text = await executableBody(url);
    assert.match(
      text,
      /refund_credits_to_batch[\s\S]*o\.status = 'refunded'/,
      `${url.pathname.split('/').pop()} helper must refuse Stripe-refunded batches`,
    );
  }

  const migration = await executableBody(MIGRATION);
  assert.match(
    migration,
    /admin_cancel_class_session[\s\S]*o\.status = 'refunded'[\s\S]*admin_record_session_attendance|admin_record_session_attendance[\s\S]*o\.status = 'refunded'[\s\S]*admin_cancel_class_session/s,
  );
  assert.match(migration, /admin_cancel_class_session[\s\S]*o\.status = 'refunded'/s);
  assert.match(migration, /admin_record_session_attendance[\s\S]*o\.status = 'refunded'/s);
});

test('capability markers are registered for release readiness', async () => {
  const text = await readFile(MIGRATION, 'utf8');
  assert.match(text, /values \('stripe_fulfillment_deleted_email_erasure'\)/);
  assert.match(text, /values \('refund_skips_stripe_refunded_batches'\)/);
});

test('operator / migration re-runs skip-if-newer for money/privacy RPCs', async () => {
  const text = await executableBody(MIGRATION);
  for (const notice of [
    /keeping newer refund_credits_to_batch/,
    /keeping newer fulfill_stripe_checkout/,
    /keeping newer admin_record_session_attendance/,
    /keeping newer admin_cancel_class_session/,
  ]) {
    assert.match(text, notice);
  }
  assert.match(text, /p_anchor timestamp with time zone/);
});
