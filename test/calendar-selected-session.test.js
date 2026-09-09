import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarListWithSelectedSession } from '../src/components/admin/calendarModel.mjs';

const foundation = { id: 'foundation', title: 'Foundation Strength' };
const engine = { id: 'engine', title: 'Engine' };
const sessions = [foundation, engine];

test('matching roster intent keeps the filtered results without a duplicate or exception label', () => {
  const matching = [foundation];
  const result = calendarListWithSelectedSession(matching, sessions, 'foundation');
  assert.equal(result.rows, matching);
  assert.equal(result.selectedOutsideFilters, null);
  assert.equal(matching.length, 1);
});

test('conflicting filters reveal only the selected class without inflating matching results', () => {
  const matching = [engine];
  const result = calendarListWithSelectedSession(matching, sessions, 'foundation');
  assert.deepEqual(result.rows, [foundation, engine]);
  assert.equal(result.selectedOutsideFilters, 'foundation');
  assert.deepEqual(matching, [engine]);
  assert.equal(calendarListWithSelectedSession(matching, sessions, null).rows, matching);
  assert.deepEqual(calendarListWithSelectedSession([], sessions, 'foundation').rows, [foundation]);
});

test('missing selected classes do not invent results', () => {
  assert.deepEqual(calendarListWithSelectedSession([], sessions, 'deleted'), { rows: [], selectedOutsideFilters: null });
});
