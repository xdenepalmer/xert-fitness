import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web and native booking actions translate the complete member RPC error contract', async () => {
  const [web, native, store] = await Promise.all([
    readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/BookingCancellationPolicy.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
  ]);
  const codes = [
    'AUTH_REQUIRED', 'SESSION_NOT_FOUND', 'SESSION_NOT_BOOKABLE', 'SESSION_IN_PAST',
    'ALREADY_BOOKED', 'SESSION_FULL', 'SESSION_INTEREST_ONLY', 'SESSION_HAS_CAPACITY',
    'WAITLIST_PRIORITY',
    'NO_CREDITS', 'BOOKING_NOT_FOUND', 'NOT_CANCELLABLE',
  ];

  for (const code of codes) {
    assert.match(web, new RegExp(`${code}:`));
    assert.match(native, new RegExp(`\\("${code}"`));
  }
  assert.match(store, /BookingErrorMessage\.display\(for: error\.localizedDescription\)/);
  assert.doesNotMatch(store, /friendlyBookingError/);
});
