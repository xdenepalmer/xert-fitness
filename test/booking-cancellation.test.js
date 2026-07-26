import assert from 'node:assert/strict';
import test from 'node:test';
import { cancellationMessage, cancellationReturnsCredit } from '../src/lib/bookingCancellation.js';

test('uses the server cancellation credit policy for requests and confirmed bookings', () => {
  const now = Date.parse('2026-08-01T00:00:00.000Z');

  assert.equal(cancellationReturnsCredit({ status: 'requested', start_time: '2026-08-01T01:00:00.000Z' }, now), true);
  assert.equal(cancellationReturnsCredit({ status: 'confirmed', start_time: '2026-08-01T13:00:01.000Z' }, now), true);
  assert.equal(cancellationReturnsCredit({ status: 'confirmed', start_time: '2026-08-01T12:00:00.000Z' }, now), false);
  assert.equal(cancellationReturnsCredit({ status: 'waitlisted', start_time: '2026-08-02T12:00:00.000Z' }, now), false);
});

test('explains the cancellation outcome before a member confirms', () => {
  const now = Date.parse('2026-08-01T00:00:00.000Z');

  assert.match(
    cancellationMessage({ title: 'XERT Strength', status: 'confirmed', start_time: '2026-08-01T08:00:00.000Z' }, now),
    /do not return a class credit/
  );
  assert.match(
    cancellationMessage({ title: 'XERT Strength', status: 'requested', start_time: '2026-08-01T01:00:00.000Z' }, now),
    /return your class credit/
  );
  assert.match(
    cancellationMessage({ title: 'XERT Strength', status: 'waitlisted', start_time: '2026-08-02T01:00:00.000Z' }, now),
    /remove you from the waitlist.*No class credit is currently reserved/
  );
});

test('both booking schema paths let members leave a waitlist without double-refunding credit', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const path of ['../src/supabase/booking_schema.sql', '../src/supabase/booking_modes_upgrade.sql']) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /v_status not in \('requested', 'confirmed', 'waitlisted'\)/i);
    assert.match(sql, /v_status = 'confirmed' and v_start - now\(\) > interval '12 hours'/i);
    assert.match(sql, /status in \('requested', 'confirmed', 'waitlisted'\)/i);
    // Timely cancel must restore credit even after the pack expires.
    assert.doesNotMatch(sql, /where id = v_batch and \(expires_at is null or expires_at > now\(\)\)/i);
    // Expired packs are reactivated through the shared helper (p_anchor) or the
    // older inline form that used the class start time directly.
    assert.match(
      sql,
      /greatest\((?:coalesce\()?p_anchor|v_start(?:, now\(\))?\)?, now\(\) \+ interval '12 hours'\)/i,
    );
  }
});

test('web Account booking cancel confirm locks against same-paint double submits', async () => {
  const { readFile } = await import('node:fs/promises');
  const account = await readFile(new URL('../src/pages/Account.jsx', import.meta.url), 'utf8');
  assert.match(account, /const cancelBookingLockRef = useRef\(false\)/);
  assert.match(account, /if \(!cancellationTarget \|\| cancelBookingLockRef\.current \|\| cancellingId\) return/);
  assert.match(account, /cancelBookingLockRef\.current = true/);
  assert.match(account, /cancelBookingLockRef\.current = false/);
});
