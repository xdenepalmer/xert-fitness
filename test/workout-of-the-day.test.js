import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  brisbaneClock,
  brisbaneDateKey,
  brisbaneDisplayDate,
  normalizeWorkoutInput,
  workoutBodyLines,
  workoutDisplayState,
} from '../src/lib/workoutOfTheDay.js';

test('brisbaneDateKey resolves the local gym day, not the UTC day', () => {
  // Brisbane is UTC+10 all year (no daylight saving), so for ten hours each day
  // the UTC date is a day behind. Using it would put yesterday's workout on the
  // TV for the whole 5:15am and 6:15am block.
  assert.equal(brisbaneDateKey(new Date('2026-07-27T23:00:00Z')), '2026-07-28',
    '9am Brisbane must resolve to that Brisbane day');
  assert.equal(brisbaneDateKey(new Date('2026-07-27T19:15:00Z')), '2026-07-28',
    '5:15am class time must resolve to the Brisbane day');
  // Boundaries either side of Brisbane midnight.
  assert.equal(brisbaneDateKey(new Date('2026-07-28T13:59:59Z')), '2026-07-28');
  assert.equal(brisbaneDateKey(new Date('2026-07-28T14:00:00Z')), '2026-07-29');
  assert.equal(brisbaneDateKey(new Date('invalid')), null);
});

test('display header formatters produce readable Brisbane values', () => {
  const at515am = new Date('2026-07-27T19:15:00Z'); // 5:15am Brisbane, Tue 28 Jul
  assert.match(brisbaneDisplayDate(at515am), /Tuesday 28 July/);
  assert.equal(brisbaneClock(at515am), '5:15 am');
  assert.equal(brisbaneClock(new Date('2026-07-28T07:30:00Z')), '5:30 pm');
  assert.equal(brisbaneDisplayDate(new Date('invalid')), '');
  assert.equal(brisbaneClock(new Date('invalid')), '');
});

test('a workout is only ever shown on its own day', () => {
  const yesterday = { workout_date: '2026-07-27', body: 'Old session' };
  const today = { workout_date: '2026-07-28', body: 'Todays session' };

  const ready = workoutDisplayState({ workout: today, todayKey: '2026-07-28' });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.workout.body, 'Todays session');

  // The regression that matters: a TV left running overnight must not still be
  // showing yesterday's workout to the 5:15am class.
  const rolledOver = workoutDisplayState({ workout: yesterday, todayKey: '2026-07-28' });
  assert.equal(rolledOver.status, 'empty');
  assert.equal(rolledOver.workout, null);
});

test('a failed refresh keeps today\'s workout on screen instead of blanking it', () => {
  const today = { workout_date: '2026-07-28', body: 'Todays session' };
  const offline = workoutDisplayState({ workout: today, todayKey: '2026-07-28', loadFailed: true });
  assert.equal(offline.status, 'ready', 'a network blip must not clear the screen mid-class');
  assert.equal(offline.stale, true);

  // But a failure with nothing valid for today is reported honestly, rather
  // than implying no workout was programmed.
  const nothing = workoutDisplayState({ workout: null, todayKey: '2026-07-28', loadFailed: true });
  assert.equal(nothing.status, 'unavailable');

  const empty = workoutDisplayState({ workout: null, todayKey: '2026-07-28' });
  assert.equal(empty.status, 'empty');
});

test('workoutBodyLines preserves the coach\'s layout including blank spacing', () => {
  assert.deepEqual(workoutBodyLines('A\r\nB\n\nC  '), ['A', 'B', '', 'C']);
  assert.deepEqual(workoutBodyLines(''), ['']);
  assert.deepEqual(workoutBodyLines(null), ['']);
});

test('normalizeWorkoutInput enforces the same rules as the database', () => {
  const ok = normalizeWorkoutInput({
    workout_date: '2026-07-28',
    title: '  Fran  ',
    body: ' 21-15-9\r\nThrusters\n ',
    published: true,
  });
  assert.deepEqual(ok, {
    workout_date: '2026-07-28',
    title: 'Fran',
    body: '21-15-9\nThrusters',
    published: true,
  });

  // Title is optional; a blank one becomes null rather than an empty string.
  assert.equal(normalizeWorkoutInput({ workout_date: '2026-07-28', body: 'Row 2k' }).title, null);
  assert.equal(normalizeWorkoutInput({ workout_date: '2026-07-28', body: 'Row 2k' }).published, false);

  assert.throws(() => normalizeWorkoutInput({ workout_date: '', body: 'x' }), /Pick the day/);
  assert.throws(() => normalizeWorkoutInput({ workout_date: '28-07-2026', body: 'x' }), /Pick the day/);
  assert.throws(() => normalizeWorkoutInput({ workout_date: '2026-02-30', body: 'x' }), /real calendar day/);
  assert.throws(() => normalizeWorkoutInput({ workout_date: '2026-07-28', body: '   ' }), /Add the workout/);
  assert.throws(() => normalizeWorkoutInput({
    workout_date: '2026-07-28', body: 'x', title: 'a'.repeat(121),
  }), /120 characters/);
  assert.throws(() => normalizeWorkoutInput({
    workout_date: '2026-07-28', body: 'x'.repeat(4001),
  }), /4000 characters/);
});

test('the TV kiosk route is public but kept out of search and the sitemap', async () => {
  const { metadataForPath } = await import('../src/lib/pageMetadata.js');
  const meta = metadataForPath('/display');
  assert.equal(meta.indexable, false, 'the club TV page must never be indexed');
  assert.match(meta.title, /Workout Display/, 'it should not fall back to a Page Not Found title');

  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  assert.ok(!sitemap.includes('/display'), '/display must not be advertised in the sitemap');

  // The kiosk is a real route, reachable without authentication.
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /path="\/display" element=\{<WorkoutDisplay \/>\}/);
  assert.ok(!/AdminRoute>\s*<WorkoutDisplay/.test(app), 'the TV cannot sign in, so it must not be admin gated');
});

test('the workout editor is registered in the command centre', async () => {
  const { isAdminSection } = await import('../src/lib/adminNavigation.js');
  assert.equal(isAdminSection('workouts'), true);

  const centre = readFileSync(new URL('../src/pages/AdminCommandCentre.jsx', import.meta.url), 'utf8');
  assert.match(centre, /case 'workouts': return <WorkoutManager/);
  const workspaces = readFileSync(new URL('../src/lib/adminWorkspaces.js', import.meta.url), 'utf8');
  assert.match(workspaces, /key: 'workouts'/);
});

test('the kiosk survives an unattended gym: polling, rollover and offline handling', () => {
  const display = readFileSync(new URL('../src/pages/WorkoutDisplay.jsx', import.meta.url), 'utf8');
  // Re-derives the Brisbane day inside refresh, so midnight rollover needs no restart.
  assert.match(display, /const refresh = useCallback\(async \(\) => \{\s*const todayKey = brisbaneDateKey\(\)/);
  // Polls so a coach's edit reaches the screen without touching the TV.
  assert.match(display, /setInterval\(refresh, REFRESH_MS\)/);
  // A failed refresh must not wipe the screen.
  assert.match(display, /catch \{[\s\S]{0,160}setLoadFailed\(true\)/);
  assert.ok(!/setWorkout\(null\)/.test(display), 'a network error must never blank the workout mid-class');
});
