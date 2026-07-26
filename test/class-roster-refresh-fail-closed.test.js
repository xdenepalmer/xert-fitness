import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const calendar = readFileSync(
  new URL('../src/components/admin/ClassCalendarAdmin.jsx', import.meta.url),
  'utf8',
);
const adminData = readFileSync(
  new URL('../src/lib/adminData.js', import.meta.url),
  'utf8',
);

test('class roster refresh does not swallow adminSessionRoster failures as empty', () => {
  const refresh = calendar.slice(
    calendar.indexOf('const refreshBookings = async'),
    calendar.indexOf('const loadBookings = async'),
  );
  assert.match(refresh, /adminSessionRoster\(sessionId\)/);
  assert.doesNotMatch(refresh, /adminSessionRoster\(sessionId\)\.catch\(\(\) => \[\]\)/);
});

test('adminSessionRoster only degrades to empty when the RPC is missing', () => {
  const block = adminData.slice(
    adminData.indexOf('export async function adminSessionRoster'),
    adminData.indexOf('export async function adminWaitlistOverview'),
  );
  assert.match(block, /functionUnavailable/);
  assert.match(block, /admin_session_roster/);
  assert.match(block, /Object\.assign\(new Error\(error\.message\), \{ code: error\.code \}\)/);
  assert.match(block, /throw new Error\(error\?\.message \|\| 'Class roster unavailable\.'\)/);
});

test('adminSessionRoster pages past PostgREST max_rows', () => {
  const block = adminData.slice(
    adminData.indexOf('export async function adminSessionRoster'),
    adminData.indexOf('export async function adminWaitlistOverview'),
  );
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
});

test('getEventGoalMembers pages past PostgREST max_rows', () => {
  const block = adminData.slice(
    adminData.indexOf('export async function getEventGoalMembers'),
    adminData.indexOf('export async function createEvent'),
  );
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /admin_event_goal_members/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
});
