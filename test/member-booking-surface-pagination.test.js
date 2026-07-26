import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

function slice(source, fromMarker, toMarker) {
  const start = source.indexOf(fromMarker);
  assert.notEqual(start, -1, `marker present: ${fromMarker}`);
  const end = source.indexOf(toMarker, start + fromMarker.length);
  assert.notEqual(end, -1, `end marker present: ${toMarker}`);
  return source.slice(start, end);
}

test('web member booking surfaces page past PostgREST max_rows', () => {
  const source = read('../src/lib/bookingData.js');
  const announcements = slice(source, 'export async function getMemberAnnouncements', 'export async function dismissMemberAnnouncement');
  const sessions = slice(source, 'export async function getAvailableSessions', 'export async function getMyBookings');
  const bookings = slice(source, 'export async function getMyBookings', 'export async function getMyPrivateSessionRequests');
  const events = slice(source, 'export async function getEvents', 'async function requireCurrentUserId');
  const goals = slice(source, 'export async function getMyEventGoals', 'export async function addMyEventGoal');

  for (const block of [announcements, sessions, bookings, events, goals]) {
    assert.match(block, /collectAdminBatches/);
    assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  }
  assert.match(announcements, /my_member_announcements/);
  assert.match(sessions, /sessions_with_availability/);
  assert.match(bookings, /my_bookings/);
  assert.match(events, /published',\s*true/);
  assert.match(goals, /member_event_goals/);
});

test('Ops Health bookable-classes check pages past PostgREST max_rows', () => {
  const source = read('../src/lib/adminData.js');
  const start = source.indexOf("healthCheck('classes', 'Bookable launch classes'");
  assert.notEqual(start, -1);
  const block = source.slice(start, start + 1_400);
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(block, /public_visible/);
});

test('iOS member booking surfaces page past max_rows', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  for (const marker of [
    'func sessions() async throws',
    'func events() async throws',
    'func eventGoals(session',
    'func announcements(session',
    'func bookings(session',
  ]) {
    const start = api.indexOf(marker);
    assert.notEqual(start, -1, marker);
    const block = api.slice(start, start + 1_800);
    assert.match(block, /pageSize = 500/, marker);
    assert.match(block, /offset \+= pageSize/, marker);
  }
});
