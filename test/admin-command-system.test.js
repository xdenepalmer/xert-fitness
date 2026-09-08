import assert from 'node:assert/strict';
import test from 'node:test';
import { fuzzyMatch, readPreferences, savePreferences, recordCommand, rankCommands, matchShortcut, createMutationGate, reviewedAttendance, reversibleAttendance } from '../src/lib/adminCommandSystem.js';

test('fuzzy subsequence highlights punctuation and empty query safely', () => {
  assert.deepEqual(fuzzyMatch('Mark attendance', 'mat').indices, [0, 5, 6]);
  assert.equal(fuzzyMatch('Class calendar', 'z'), null);
  assert.deepEqual(fuzzyMatch('6:15am', ':5').indices, [1, 3]);
  assert.deepEqual(fuzzyMatch('Calendar', '  ').indices, []);
  assert.ok(fuzzyMatch('Class calendar', 'cc').score > fuzzyMatch('Concentric', 'cc').score);
});
test('storage failure and malicious metadata never leak personal data into recents', () => {
  const bad = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.deepEqual(readPreferences(bad), {});
  assert.doesNotThrow(() => savePreferences(bad, {}));
  let history = [];
  for (let i = 0; i < 50; i++) history = recordCommand(history, `go-${i}`, i);
  assert.equal(history.length, 20);
  const result = recordCommand([{ id: 'go-calendar', count: 2, at: 1, email: 'private' }], 'go-calendar', 2);
  assert.deepEqual(result, [{ id: 'go-calendar', count: 3, at: 2 }]);
  assert.equal(rankCommands([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], '', [{ id: 'b', count: 4, at: 2 }])[0].id, 'b');
});
test('shortcuts exclude typing, editable targets and modals, including command K', () => {
  assert.equal(matchShortcut({ key: 'k', ctrlKey: true }, {}), 'palette');
  assert.equal(matchShortcut({ key: 'k', ctrlKey: true }, { typing: true }), null);
  assert.equal(matchShortcut({ key: '?' }, { modal: true }), null);
  assert.equal(matchShortcut({ key: 'c' }, { prefix: true }), 'calendar');
  assert.equal(matchShortcut({ key: '?' }, {}), 'shortcuts');
});
test('mutation gate synchronously rejects repeat submits and rolls back on failure', async () => {
  const gate = createMutationGate();
  let finish; let state = 'no_show';
  const first = gate.run({ optimistic: () => { state = 'attended'; }, rollback: () => { state = 'no_show'; }, mutate: () => new Promise((resolve, reject) => { finish = reject; }) });
  assert.equal(state, 'attended');
  assert.equal(await gate.run({ mutate: () => assert.fail('duplicate') }), undefined);
  finish(Error('offline'));
  await assert.rejects(first, /offline/);
  assert.equal(state, 'no_show');
  assert.equal(await gate.run({ mutate: async () => 'saved' }), 'saved');
});

test('attendance review includes both sources and detects concurrent edits and pending requests', () => {
  const members = [{ booking_id: 'a', status: 'attended' }];
  const signups = [{ id: 'b', status: 'no_show' }];
  const previous = [...members, ...signups];
  assert.deepEqual(reviewedAttendance(previous, members, signups, { a: 'no_show', b: 'attended' }), [{ bookingId: 'a', status: 'no_show' }, { bookingId: 'b', status: 'attended' }]);
  assert.throws(() => reviewedAttendance(previous, [{ booking_id: 'a', status: 'no_show' }], signups, { a: 'attended', b: 'attended' }), /roll changed/);
  assert.throws(() => reviewedAttendance(previous, [...members, { booking_id: 'c', status: 'requested' }], signups, { a: 'attended', b: 'attended' }), /roll changed/);
  assert.throws(() => reviewedAttendance(previous, members, signups, { a: 'attended' }), /Mark every/);
  assert.equal(reversibleAttendance({ status: 'published', public_visible: true }, previous), false);
  assert.equal(reversibleAttendance({ status: 'completed', public_visible: false }, previous), true);
  assert.equal(reversibleAttendance({ status: 'completed', public_visible: true }, previous), false);
  assert.equal(reversibleAttendance({ status: 'completed', public_visible: false }, [{ booking_id: 'a', status: 'confirmed' }]), false);
});
