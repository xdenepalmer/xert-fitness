import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const historical = read('../supabase/migrations/20260714016000_admin_daily_operations.sql');
const upgrade = read('../src/supabase/admin_daily_operations_upgrade.sql');
const tip = read('../supabase/migrations/20260726125000_admin_ops_desk_and_notice_metrics.sql');
const tipMirror = read('../src/supabase/admin_ops_desk_and_notice_metrics.sql');

test('historical daily operations migration is admin-only, Brisbane-local and was hard-bounded', () => {
  assert.match(historical, /create or replace function public\.admin_daily_operations\(\)/i);
  assert.match(historical, /security definer[\s\S]*public\.is_admin\(\)/i);
  assert.match(historical, /Australia\/Brisbane/);
  assert.match(historical, /s\.start_time >= v_day_start[\s\S]*s\.start_time < v_day_end/i);
  assert.match(historical, /requested_count[\s\S]*confirmed_count[\s\S]*waitlist_count[\s\S]*attended_count[\s\S]*no_show_count/i);
  assert.match(historical, /limit 50/i);
  assert.match(historical, /revoke execute on function public\.admin_daily_operations\(\) from public, anon/i);
  assert.match(historical, /grant execute on function public\.admin_daily_operations\(\) to authenticated/i);
  assert.match(historical, /values \('admin_daily_operations'\)/i);
});

test('tip removes the hard limit 50 and pages the Today desk past max_rows', () => {
  assert.equal(tip.trim(), tipMirror.trim());
  assert.match(tip, /admin_daily_operations_full_day/);
  assert.match(tip, /admin_announcement_metrics_paging/);
  assert.doesNotMatch(tip, /^\s*limit 50\s*;/im);
  assert.match(upgrade, /admin_daily_operations_full_day/);
  assert.doesNotMatch(upgrade, /^\s*limit 50\s*;/im);

  const helper = read('../src/lib/adminData.js');
  const block = helper.slice(
    helper.indexOf('export async function getAdminDailyOperations'),
    helper.indexOf('export async function adminSetBookingStatus'),
  );
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /rpc\('admin_daily_operations'\)/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(block, /available: false/);

  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const ios = api.match(
    /func adminDailyOperations\(session auth: AuthSession\) async throws -> \[AdminDailyOperation\] \{[\s\S]*?\n {4}\}/,
  )?.[0];
  assert.ok(ios, 'adminDailyOperations must be present');
  assert.match(ios, /pageSize = 500/);
  assert.match(ios, /URLQueryItem\(name: "limit"/);
  assert.match(ios, /URLQueryItem\(name: "offset"/);
});

test('command centre opens the exact daily roster or roll call', () => {
  const overview = read('../src/components/admin/AdminOverview.jsx');
  const commandCentre = read('../src/pages/AdminCommandCentre.jsx');
  const calendar = read('../src/components/admin/ClassCalendarAdmin.jsx');

  assert.match(overview, /TodayOperationsDesk/);
  assert.match(overview, /onNavigate\?\.\('calendar', \{ session, action \}\)/);
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
