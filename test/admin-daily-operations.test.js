import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260714016000_admin_daily_operations.sql');
const upgrade = read('../src/supabase/admin_daily_operations_upgrade.sql');

test('daily operations migration is canonical, admin-only, Brisbane-local and bounded', () => {
  assert.equal(migration, upgrade);
  assert.match(migration, /create or replace function public\.admin_daily_operations\(\)/i);
  assert.match(migration, /security definer[\s\S]*public\.is_admin\(\)/i);
  assert.match(migration, /Australia\/Brisbane/);
  assert.match(migration, /s\.start_time >= v_day_start[\s\S]*s\.start_time < v_day_end/i);
  assert.match(migration, /requested_count[\s\S]*confirmed_count[\s\S]*waitlist_count[\s\S]*attended_count[\s\S]*no_show_count/i);
  assert.match(migration, /limit 50/i);
  assert.match(migration, /revoke execute on function public\.admin_daily_operations\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_daily_operations\(\) to authenticated/i);
  assert.match(migration, /values \('admin_daily_operations'\)/i);
});

test('admin client degrades only when the daily RPC is absent', () => {
  const helper = read('../src/lib/adminData.js');
  assert.match(helper, /export async function getAdminDailyOperations\(\)/);
  assert.match(helper, /supabase\.rpc\('admin_daily_operations'\)/);
  assert.match(helper, /\['42883', 'PGRST202'\]/);
  assert.match(helper, /return \{ rows: \[\], available: false \}/);
});

test('command centre opens the exact daily roster or roll call', () => {
  const today = read('../src/components/admin/AdminToday.jsx');
  const commandCentre = read('../src/pages/AdminCommandCentre.jsx');
  const calendar = read('../src/components/admin/ClassCalendarAdmin.jsx');

  assert.match(today, /getAdminDailyOperations\(\)/);
  assert.match(today, /onNavigate\?\.\('calendar', \{ session: focus\.session_id, action: 'roster' \}\)/);
  assert.match(today, /onNavigate\?\.\('calendar', \{ session: focus\.session_id, action: 'attendance' \}\)/);
  assert.match(commandCentre, /initialSessionId=\{intent\.get\('session'\)\}/);
  assert.match(calendar, /\['roster', 'attendance'\]\.includes\(initialAction\)/);
  assert.match(calendar, /setAttendanceSession\(target\)/);
  assert.match(calendar, /class-session-\$\{target\.id\}/);
});

test('SwiftUI home and model agree on the Brisbane training day', () => {
  const model = read('../ios/XertFitnessApp/XertFitnessApp/Models.swift');
  const home = read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift');
  const swiftTests = read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift');

  assert.match(model, /func occursOnBrisbaneDay[\s\S]*Australia\/Brisbane/);
  assert.match(home, /XertSection\(title: "Today's training"\)/);
  assert.match(home, /Manage today's bookings/);
  assert.match(swiftTests, /testBookingDayUsesBrisbaneBoundariesWhileTravelling/);
});
