import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancellationMessage,
  cancellationOutcomeMessage,
  cancellationReturnsCredit,
  normalizeCancellationReceipt,
} from '../src/lib/bookingCancellation.js';

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
    /original credit pack is still valid.*confirm the credit outcome/
  );
  assert.match(
    cancellationMessage({ title: 'XERT Strength', status: 'waitlisted', start_time: '2026-08-02T01:00:00.000Z' }, now),
    /remove you from the waitlist.*No class credit is currently reserved/
  );
});

test('normalizes one exact server cancellation receipt and rejects inconsistent outcomes', () => {
  const receipt = {
    cancelled_booking_id: 'booking-a',
    previous_status: 'confirmed',
    credit_refund_eligible: true,
    credit_refunded: true,
    credit_outcome: 'returned',
    cancelled_at: '2026-08-01T00:00:00.000Z',
  };
  assert.deepEqual(normalizeCancellationReceipt([receipt], 'booking-a'), receipt);
  assert.throws(() => normalizeCancellationReceipt([], 'booking-a'), /verifiable cancellation receipt/);
  assert.throws(() => normalizeCancellationReceipt([receipt], 'booking-b'), /did not match this booking/);
  assert.throws(
    () => normalizeCancellationReceipt([{ ...receipt, credit_refunded: false }], 'booking-a'),
    /inconsistent credit outcome/
  );
});

test('reports the database-confirmed credit outcome instead of predicting it', () => {
  assert.match(cancellationOutcomeMessage({ credit_outcome: 'returned' }), /one class credit was returned/);
  assert.match(cancellationOutcomeMessage({ credit_outcome: 'not_reserved' }), /No class credit was reserved/);
  assert.match(cancellationOutcomeMessage({ credit_outcome: 'late_cancellation' }), /within 12 hours/);
  assert.match(cancellationOutcomeMessage({ credit_outcome: 'expired' }), /credit pack had already expired/);
  assert.match(cancellationOutcomeMessage({ credit_outcome: 'reservation_unavailable' }), /could not verify a credit return/);
});

test('every booking schema path returns an atomic truthful cancellation receipt', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const path of [
    '../src/supabase/booking_schema.sql',
    '../src/supabase/booking_modes_upgrade.sql',
    '../supabase/migrations/20260727030000_member_cancellation_receipt.sql',
  ]) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /v_status not in \('requested', 'confirmed', 'waitlisted'\)/i);
    assert.match(sql, /returns table\s*\([\s\S]*credit_refunded boolean[\s\S]*credit_outcome text/i);
    assert.match(sql, /set remaining = least\(total, remaining \+ 1\)/i);
    assert.match(sql, /expires_at <= v_cancelled_at[\s\S]*v_outcome := 'expired'/i);
    assert.match(sql, /return query\s+select p_booking_id, v_status, v_refund_eligible/i);
    assert.match(sql, /values \('member_cancellation_receipt'\)/i);
  }
});

test('web and iOS surface only the verified cancellation receipt', async () => {
  const { readFile } = await import('node:fs/promises');
  const [bookingData, account, api, store, models] = await Promise.all([
    readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Models.swift', import.meta.url), 'utf8'),
  ]);
  assert.match(bookingData, /return normalizeCancellationReceipt\(data, bookingId\)/);
  assert.match(api, /func cancelBooking[\s\S]*-> MemberBookingCancellationReceipt[\s\S]*rows\.count == 1/);
  assert.match(store, /func cancel\(_ booking: BookingItem\) async -> MemberBookingCancellationReceipt\?/);
  assert.match(account, /receipt = await store\.cancel\(booking\)[\s\S]*message: receipt\.memberMessage/);
  assert.match(models, /struct MemberBookingCancellationReceipt[\s\S]*case "expired":[\s\S]*credit pack had already expired/);
});
