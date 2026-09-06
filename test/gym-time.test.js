import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GYM_TIME_ZONE,
  gymDateKey,
  gymDateTimeLabel,
  gymDayLabel,
  gymMinutesOfDay,
  gymShortDateLabel,
  gymTimeLabel,
} from '../src/lib/gymTime.js';

// 6:00 am on Saturday 5 September 2026 at the gym is 20:00 UTC the day before.
const SIX_AM = new Date('2026-09-04T20:00:00Z');

test('the gym day is Brisbane, not the machine running the code', () => {
  assert.equal(GYM_TIME_ZONE, 'Australia/Brisbane');
  // This is the roster-filename bug: UTC would file it under the 4th.
  assert.equal(SIX_AM.toISOString().slice(0, 10), '2026-09-04');
  assert.equal(gymDateKey(SIX_AM), '2026-09-05');
});

test('class times read the way they are printed on the door', () => {
  assert.equal(gymTimeLabel(SIX_AM), '6:00 am');
  assert.equal(gymShortDateLabel(SIX_AM), 'Sat 5 Sept');
  assert.equal(gymDayLabel(SIX_AM), 'Saturday 5 September');
  assert.equal(gymDateTimeLabel(SIX_AM), 'Sat 5 Sept, 6:00 am');
  assert.equal(gymMinutesOfDay(SIX_AM), 6 * 60);
});

test('Brisbane never observes daylight saving, so summer reads the same way', () => {
  // January: Sydney would be an hour ahead, Brisbane is not.
  const summer = new Date('2027-01-14T20:00:00Z');
  assert.equal(gymDateKey(summer), '2027-01-15');
  assert.equal(gymTimeLabel(summer), '6:00 am');
});

test('unusable values return empty rather than throwing or printing Invalid Date', () => {
  for (const bad of [null, undefined, '', 'garbage', new Date('nope')]) {
    assert.equal(gymDateKey(bad), null);
    assert.equal(gymTimeLabel(bad), '');
    assert.equal(gymShortDateLabel(bad), '');
    assert.equal(gymDayLabel(bad), '');
    assert.equal(gymDateTimeLabel(bad), '');
    assert.equal(gymMinutesOfDay(bad), null);
  }
});
