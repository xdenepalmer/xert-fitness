import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MIGRATION = new URL(
  '../supabase/migrations/20260726106000_credit_batch_refund_reactivation.sql',
  import.meta.url,
);
const MIRROR = new URL(
  '../src/supabase/credit_batch_refund_reactivation.sql',
  import.meta.url,
);
const NOTIFICATIONS_UPGRADE = new URL(
  '../src/supabase/class_cancellation_notifications_upgrade.sql',
  import.meta.url,
);
const CREDIT_REFUND_OPERATOR = new URL(
  '../src/supabase/class_cancellation_credit_refund_fix.sql',
  import.meta.url,
);

async function executableBody(url) {
  const text = await readFile(url, 'utf8');
  return text.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
}

test('operator mirror keeps reactivation behaviour and refuses Stripe-refunded packs', async () => {
  // Mirror is intentionally ahead of the historical migration so re-runs cannot
  // strip refund_skips_stripe_refunded_batches. Skip-if-newer keeps a live body
  // that already refuses orders.status = 'refunded'.
  const [migration, mirror] = await Promise.all([
    executableBody(MIGRATION),
    executableBody(MIRROR),
  ]);
  for (const text of [migration, mirror]) {
    assert.match(text, /create or replace function public\.credit_batch_expires_at_after_refund/);
    assert.match(text, /create or replace function public\.refund_credits_to_batch/);
    assert.match(
      text,
      /greatest\(coalesce\(p_anchor, now\(\)\), now\(\) \+ interval '12 hours'\)/,
    );
    assert.match(text, /perform public\.refund_credits_to_batch\(v_batch, 1, v_start\)/);
  }
  assert.match(mirror, /o\.status = 'refunded'/);
  assert.match(mirror, /keeping newer refund_credits_to_batch/);
  assert.match(mirror, /keeping newer admin_cancel_class_session/);
  assert.match(mirror, /keeping newer cancel_booking/);
  assert.match(mirror, /keeping newer admin_set_booking_status/);
  assert.match(mirror, /keeping newer admin_record_session_attendance/);
  assert.match(migration, /keeping newer refund_credits_to_batch/);
  assert.match(migration, /keeping newer admin_record_session_attendance/);
  assert.match(migration, /keeping newer admin_cancel_class_session/);
});

test('class cancel refunds attended and no_show that still hold a credit', async () => {
  const text = await executableBody(MIGRATION);
  const cancel = text.slice(text.indexOf('create or replace function public.admin_cancel_class_session'));
  assert.match(
    cancel,
    /status in \('requested', 'confirmed', 'waitlisted', 'attended', 'no_show'\)/,
  );
  assert.match(
    cancel,
    /previous_status in \('requested', 'confirmed', 'attended', 'no_show'\)/,
  );
  assert.match(cancel, /status as previous_status/);
  assert.doesNotMatch(
    cancel.split('previous_status in')[1].split('group by')[0],
    /waitlisted/,
    'waitlisted must never be refunded',
  );
});

test('admin cancel and roll-call release use the shared expiry rule', async () => {
  const text = await executableBody(MIGRATION);
  assert.match(
    text,
    /admin_set_booking_status[\s\S]*refund_credits_to_batch\(v_batch, 1, v_start\)/,
  );
  assert.match(
    text,
    /admin_record_session_attendance[\s\S]*credit_batch_expires_at_after_refund\(batch\.expires_at, v_start_time\)/,
  );
});

test('notifications upgrade no longer recreates the silent no-refund cancel', async () => {
  const text = await executableBody(NOTIFICATIONS_UPGRADE);
  assert.doesNotMatch(
    text,
    /create or replace function public\.admin_cancel_class_session/,
    're-running notifications must not reinstall the RETURNING-status cancel body',
  );
  assert.match(
    text,
    /status in \('requested', 'confirmed', 'waitlisted', 'attended', 'no_show'\)/,
  );
});

test('operator credit-refund fix stays complete on re-run', async () => {
  const text = await executableBody(CREDIT_REFUND_OPERATOR);
  assert.match(text, /attended', 'no_show/);
  assert.match(text, /credit_batch_expires_at_after_refund/);
  assert.match(text, /status as previous_status/);
});

test('capability marker is registered for release readiness', async () => {
  const text = await readFile(MIGRATION, 'utf8');
  assert.match(text, /values \('credit_batch_refund_reactivation'\)/);
});
