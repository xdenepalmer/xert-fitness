import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, freshSchema, adminData, bookingPage, nativeView] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260714002000_booking_time_conflicts.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/supabase/booking_schema.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/Booking.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url), 'utf8'),
]);

for (const [name, sql] of [['migration', migration], ['fresh schema', freshSchema]]) {
  test(`${name} serializes and rejects overlapping active class places`, () => {
    assert.match(sql, /create or replace function public\.enforce_booking_time_conflict/i);
    assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(new\.user_id::text, 0\)\)/i);
    assert.match(sql, /booking\.status in \('requested', 'confirmed'\)/i);
    assert.match(sql, /session\.start_time < v_end[\s\S]*> v_start/i);
    assert.match(sql, /BOOKING_TIME_CONFLICT/i);
    assert.match(sql, /before insert or update of user_id, class_session_id, status/i);
    assert.match(sql, /create or replace function public\.enforce_session_reschedule_conflicts/i);
    assert.match(sql, /SESSION_TIME_CONFLICTS_WITH_MEMBER_BOOKING/i);
    assert.match(sql, /before update of start_time, end_time, duration_minutes/i);
  });
}

test('migration refuses to certify a database that already contains conflicts', () => {
  assert.match(migration, /EXISTING_BOOKING_TIME_CONFLICTS/i);
  assert.match(migration, /second_booking\.id > first_booking\.id/i);
  assert.match(migration, /first_booking\.start_time < second_booking\.end_time[\s\S]*first_booking\.end_time > second_booking\.start_time/i);
});

test('migration registers a production release capability', () => {
  assert.match(migration, /values \('booking_time_conflict_guard'\)/i);
});

test('admin and member clients explain conflicts instead of exposing RPC codes', () => {
  assert.match(adminData, /This member already has another active class at the same time/);
  assert.match(adminData, /The next member already has another active class at the same time/);
  assert.match(bookingPage, /bookingTimeConflict/);
  assert.match(bookingPage, /Overlaps \{timeConflict\.title/);
  assert.match(nativeView, /BookingItem\.timeConflict/);
  assert.match(nativeView, /Label\("Time conflict"/);
});
