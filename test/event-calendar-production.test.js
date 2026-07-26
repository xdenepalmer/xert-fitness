import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { XERT_2026_EVENTS } from '../src/lib/eventCalendar.js';

const migration = readFileSync(new URL('../supabase/migrations/20260714017000_reconcile_2026_event_calendar.sql', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../src/components/admin/EventsManager.jsx', import.meta.url), 'utf8');

test('production migration reconciles every approved XERT 2026 event without overwriting admin edits', () => {
  assert.equal(XERT_2026_EVENTS.length, 20);
  for (const event of XERT_2026_EVENTS) {
    assert.ok(migration.includes(`'${event.name.replaceAll("'", "''")}'`), `${event.name} is missing from the migration`);
    assert.ok(migration.includes(`'${event.event_date}'`), `${event.event_date} is missing from the migration`);
  }
  assert.match(migration, /create unique index if not exists events_name_date_uidx/i);
  assert.match(migration, /on conflict \(name, event_date\) do nothing/i);
  assert.doesNotMatch(migration, /do update/i);
});

test('event training groups are exportable and the calendar admin remains usable on phones', () => {
  assert.match(manager, /xert-\$\{eventSlug\}-training-group\.csv/);
  assert.match(manager, /Joined training group/);
  assert.match(manager, /grid w-full grid-cols-2 gap-2 sm:flex/);
  assert.match(manager, /flex flex-col gap-4[\s\S]*sm:flex-row/);
  assert.match(manager, /inline-flex min-h-11[\s\S]*mailto:/);
});

test('web event training-group roster is generation and identity scoped before render or CSV export', () => {
  assert.match(manager, /loadedRosterEventId/);
  assert.match(manager, /rosterLoadGenerationRef/);
  assert.match(manager, /rosterReady=\{loadedRosterEventId === rosterEvent\.id\}/);
  assert.match(manager, /const scopedMembers = rosterReady \? members : \[\]/);
  assert.match(manager, /Roster not ready/);
  assert.match(manager, /seedLockRef/);
});

test('admin event goal counts page through PostgREST instead of silently truncating', () => {
  const webData = readFileSync(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const nativeAPI = readFileSync(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8');

  assert.match(webData, /export async function getEventGoalCounts\(\)[\s\S]*collectAdminBatches/);
  assert.match(webData, /from\('member_event_goals'\)[\s\S]*\.range\(from, from \+ pageSize - 1\)/);
  assert.match(manager, /Training-goal counts could not be verified/);
  assert.match(nativeAPI, /func adminEventGoalReferences[\s\S]*pageSize = 500[\s\S]*offset \+= pageSize/);
  assert.match(nativeAPI, /path: "\/rest\/v1\/member_event_goals"[\s\S]*order", value: "event_id\.asc,id\.asc"/);
});
