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

test('web availability and blackout lists page past PostgREST max_rows', () => {
  const source = read('../src/lib/adminData.js');
  const availability = slice(source, 'export async function getAvailabilityBlocks', 'export async function createAvailabilityBlock');
  const blackouts = slice(source, 'export async function getBlackoutPeriods', 'export async function createBlackoutPeriod');
  for (const block of [availability, blackouts]) {
    assert.match(block, /collectAdminBatches/);
    assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  }
});

test('web events catalogue and seed inventory page past PostgREST max_rows', () => {
  const source = read('../src/lib/adminData.js');
  const events = slice(source, 'export async function getAllEvents', 'export async function getEventGoalCounts');
  const seed = slice(source, 'export async function seedXertEventCalendar', 'export async function adminListMembers');
  assert.match(events, /collectAdminBatches/);
  assert.match(events, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(seed, /collectAdminBatches/);
  assert.match(seed, /select\('name,event_date'\)/);
  assert.match(seed, /\.range\(from, from \+ pageSize - 1\)/);
});

test('iOS availability, blackouts and events page past max_rows', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  for (const marker of [
    'func adminAvailabilityBlocks',
    'func adminBlackoutPeriods',
    'func adminEvents',
  ]) {
    const start = api.indexOf(marker);
    assert.notEqual(start, -1, marker);
    const block = api.slice(start, start + 1_600);
    assert.match(block, /pageSize = 500/);
    assert.match(block, /offset \+= pageSize/);
  }
});

test('iOS member notes page past the old hard limit 100', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const start = api.indexOf('func adminMemberNotes');
  assert.notEqual(start, -1);
  const block = api.slice(start, start + 1600);
  assert.match(block, /AdminMemberNotesPageRequest/);
  assert.match(block, /p_limit: pageSize/);
  assert.match(block, /p_offset: offset/);
  assert.match(block, /offset \+= pageSize/);
});
