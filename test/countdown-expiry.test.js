import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { countdownVisibility } from '../src/lib/launchSettings.js';

const SOURCE = new URL('../src/components/public/Countdown.jsx', import.meta.url);
const NOW = new Date('2026-07-26T00:00:00Z');

test('an expired countdown hides itself instead of announcing an opening', () => {
  assert.equal(countdownVisibility('2026-07-25', true, NOW), 'hidden');
  assert.equal(countdownVisibility('2020-01-01', true, NOW), 'hidden');
});

test('a future date still counts down', () => {
  assert.equal(countdownVisibility('2026-08-01', true, NOW), 'counting');
});

test('the admin toggle still hides it outright', () => {
  assert.equal(countdownVisibility('2026-08-01', false, NOW), 'hidden');
  assert.equal(countdownVisibility('2026-07-25', false, NOW), 'hidden');
});

test('an unparseable date hides rather than rendering NaN', () => {
  assert.equal(countdownVisibility('not-a-date', true, NOW), 'hidden');
  assert.equal(countdownVisibility(undefined, true, NOW), 'hidden');
  assert.equal(countdownVisibility('', true, NOW), 'hidden');
});

test('the site never claims to be open from a timer alone', async () => {
  const source = await readFile(SOURCE, 'utf8');
  const rendered = source
    .split('\n')
    .filter(line => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
    .join('\n');

  // A date rolling past is not evidence the gym opened. Announcing an opening
  // belongs to the admin-authored announcement banner, which can be retracted.
  assert.doesNotMatch(rendered, /We're Open/i, 'the hardcoded open claim must not return');
  assert.doesNotMatch(rendered, /is now open in/i, 'the hardcoded location claim must not return');
});

test('the fallback opening date lives in one place', async () => {
  const { DEFAULT_TARGET_LAUNCH_DATE } = await import('../src/lib/launchSettings.js');
  assert.equal(DEFAULT_TARGET_LAUNCH_DATE, '2026-09-14');
  assert.match(DEFAULT_TARGET_LAUNCH_DATE, /^\d{4}-\d{2}-\d{2}$/);

  // It was previously duplicated across four files, so moving the opening day
  // meant finding all four. Any reintroduced literal will fail this.
  for (const file of [
    '../src/lib/adminData.js',
    '../src/pages/Home.jsx',
    '../src/pages/SoftLaunchTimetable.jsx',
    '../src/components/public/Countdown.jsx',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /target_launch_date.*'\d{4}-\d{2}-\d{2}'|targetDate\s*=\s*'\d{4}-\d{2}-\d{2}'|\|\|\s*'\d{4}-\d{2}-\d{2}'/,
      `${file} must use DEFAULT_TARGET_LAUNCH_DATE, not its own hardcoded date`);
  }
});
