import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('member onboarding booking gate fails closed on session_bookings insert', async () => {
  const [migration, operator] = await Promise.all([
    read('../supabase/migrations/20260726114000_member_onboarding_booking_gate.sql'),
    read('../src/supabase/member_onboarding_booking_gate.sql'),
  ]);
  for (const sql of [migration, operator]) {
    assert.match(sql, /enforce_member_onboarding_for_booking/i);
    assert.match(sql, /MEMBER_ONBOARDING_REQUIRED/i);
    assert.match(sql, /member_onboarding_state\(new\.user_id\)/i);
    assert.match(sql, /session_bookings_member_onboarding_gate/i);
    assert.match(sql, /before insert on public\.session_bookings/i);
    assert.match(sql, /auth\.role\(\) = 'service_role'[\s\S]*is_admin\(\)/i);
    assert.match(sql, /values \('member_onboarding_booking_gate'\)/i);
  }
});

test('web and native translate MEMBER_ONBOARDING_REQUIRED for booking actions', async () => {
  const [web, native] = await Promise.all([
    read('../src/lib/bookingData.js'),
    read('../ios/XertFitnessApp/XertFitnessApp/BookingCancellationPolicy.swift'),
  ]);
  assert.match(web, /MEMBER_ONBOARDING_REQUIRED:\s*'Complete Member Readiness/);
  assert.match(web, /BOOKINGS_PAUSED:/);
  assert.match(native, /\("MEMBER_ONBOARDING_REQUIRED"/);
  assert.match(native, /\("BOOKINGS_PAUSED"/);
});
