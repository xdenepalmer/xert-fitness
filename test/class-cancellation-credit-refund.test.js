import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REFUND_FIX = new URL(
  '../supabase/migrations/20260726000000_class_cancellation_credit_refund_fix.sql',
  import.meta.url,
);
const AUDIT_FIX = new URL(
  '../supabase/migrations/20260726001000_audit_immutability_account_deletion_fix.sql',
  import.meta.url,
);
const ORIGINAL_CANCEL = new URL(
  '../supabase/migrations/20260714015000_class_cancellation_notifications.sql',
  import.meta.url,
);

test('the cancel-class refund reads the pre-update status, not RETURNING status', async () => {
  const sql = await readFile(REFUND_FIX, 'utf8');

  // RETURNING exposes the post-UPDATE row, so the refund must come from a
  // snapshot CTE taken before the status is overwritten with 'cancelled'.
  assert.match(sql, /status as previous_status/, 'must snapshot the pre-update status');
  assert.match(sql, /where previous_status in \('requested', 'confirmed'\)/,
    'refund must filter on the snapshotted status');
  assert.doesNotMatch(sql, /returning credit_batch_id, status/,
    'must not reuse the broken RETURNING status projection');
});

test('waitlisted places are still excluded from the refund', async () => {
  const sql = await readFile(REFUND_FIX, 'utf8');
  const refundFilter = sql.match(/where previous_status in \(([^)]*)\)/);
  assert.ok(refundFilter, 'refund filter must exist');
  assert.doesNotMatch(refundFilter[1], /waitlisted/,
    'waitlisted bookings never consumed a credit, so must not be refunded');
});

test('the superseded cancel function is the one being replaced', async () => {
  const original = await readFile(ORIGINAL_CANCEL, 'utf8');
  const fixed = await readFile(REFUND_FIX, 'utf8');
  const name = 'create or replace function public.admin_cancel_class_session(p_session_id uuid)';
  assert.ok(original.includes(name), 'baseline migration defines the function');
  assert.ok(fixed.includes(name), 'fix must replace the same function signature');
});

test('every audit guard permits the referential SET NULL from account deletion', async () => {
  const sql = await readFile(AUDIT_FIX, 'utf8');
  for (const guard of [
    'guard_session_booking_change',
    'guard_admin_request_status_change',
    'guard_admin_lead_change',
    'guard_admin_schedule_change',
    'guard_admin_content_change',
  ]) {
    assert.ok(
      sql.includes(`create or replace function public.${guard}()`),
      `${guard} must be repaired — otherwise deleting an account still aborts`,
    );
  }
});

test('audit guards still block content tampering and deletion', async () => {
  const sql = await readFile(AUDIT_FIX, 'utf8');
  for (const code of [
    'BOOKING_AUDIT_IMMUTABLE',
    'REQUEST_AUDIT_IMMUTABLE',
    'LEAD_AUDIT_IMMUTABLE',
    'SCHEDULE_AUDIT_IMMUTABLE',
    'CONTENT_AUDIT_IMMUTABLE',
  ]) {
    assert.ok(sql.includes(`raise exception '${code}'`), `${code} must still be raised`);
  }
  // The allowance is narrow: everything outside the auth-user reference
  // columns has to compare equal for the update to be let through.
  const allowances = sql.match(/to_jsonb\(new\)[^=]*=\s*to_jsonb\(old\)/g) || [];
  assert.equal(allowances.length, 5, 'each guard must gate on an unchanged payload');
});
