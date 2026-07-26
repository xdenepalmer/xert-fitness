import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  new URL('../src/pages/SoftLaunchTimetable.jsx', import.meta.url),
  'utf8',
);

test('soft-launch timetable does not paint coming-soon over a session fetch failure', () => {
  assert.match(page, /getClassSessions\(true\)/);
  assert.doesNotMatch(page, /getClassSessions\(true\)\.catch\(\(\) => \[\]\)/);
  assert.match(page, /timetableError/);
  assert.match(page, /Timetable unavailable/);
  // Settings still fail closed to defaults (bookings off).
  assert.match(page, /getSoftLaunchSettings\(\)\.catch\(\(\) => getDefaultSettings\(\)\)/);
});
