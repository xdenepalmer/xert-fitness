import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('public booking switch gate migration and mirror stay aligned', async () => {
  const [migration, mirror] = await Promise.all([
    read('../supabase/migrations/20260726113000_public_booking_switch_gate.sql'),
    read('../src/supabase/public_booking_switch_gate.sql'),
  ]);
  assert.equal(mirror, migration);
  assert.match(migration, /v_bookings/);
  assert.match(migration, /bookings_enabled is true/);
  assert.match(migration, /v_table = 'class_bookings'/);
  assert.match(migration, /values \('public_booking_switch_gate'\)/i);
  // Keep the rest of the public-form contract when this installer re-runs.
  assert.match(migration, /start_time > now\(\)/);
  assert.match(migration, /health_info_consent is true/);
  assert.match(migration, /Rehab \/ return to fitness/);
});

test('soft-launch timetable only offers booking CTAs when bookings_enabled is true', async () => {
  const page = await read('../src/pages/SoftLaunchTimetable.jsx');
  assert.match(page, /bookingsEnabled=\{settings\.bookings_enabled === true\}/);
  assert.match(page, /settings\.bookings_enabled === true && <StickyMobileCTA/);
  assert.match(page, /settings\.bookings_enabled !== true/);
});

test('member booking switch still gates signed-in session_bookings', async () => {
  const [migration, upgrade] = await Promise.all([
    read('../supabase/migrations/20260721000000_member_booking_switch_guard.sql'),
    read('../src/supabase/member_booking_switch_guard_upgrade.sql'),
  ]);
  for (const sql of [migration, upgrade]) {
    assert.match(sql, /raise exception 'BOOKINGS_PAUSED'/i);
    assert.match(sql, /session_bookings_member_booking_switch/);
  }
});
