import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { rosterPeople, rosterPlacesHeld } from '../src/lib/classRoster.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const MEMBERS = [
  { booking_id: 'm-confirmed', status: 'confirmed', full_name: 'Booked with credit', booked_at: '2026-09-01T00:00:00Z' },
  { booking_id: 'm-requested', status: 'requested', full_name: 'Awaiting a decision', booked_at: '2026-09-02T00:00:00Z' },
  { booking_id: 'm-waiting', status: 'waitlisted', full_name: 'Queued member', booked_at: '2026-09-03T00:00:00Z' },
];
const SIGNUPS = [
  { id: 's-confirmed', status: 'confirmed', full_name: 'Took a spot', created_at: '2026-09-01T12:00:00Z' },
  { id: 's-requested', status: 'requested', full_name: 'Asked for a spot', created_at: '2026-09-02T12:00:00Z' },
  { id: 's-cancelled', status: 'cancelled', full_name: 'Gave it back', created_at: '2026-09-02T13:00:00Z' },
];

test('the roster is one list of people, each knowing which door it came through', () => {
  const people = rosterPeople(SIGNUPS, MEMBERS);
  assert.equal(people.length, 6);
  // Ordered by when they booked, so a waitlist reads as a queue.
  assert.deepEqual(people.map(person => person.rowId), [
    'm-confirmed', 's-confirmed', 'm-requested', 's-requested', 's-cancelled', 'm-waiting',
  ]);
  // A member row is keyed by booking_id, never by an `id` the RPC does not
  // return — sending an undefined id to the public function used to fail every
  // status change in the calendar view with "A request record is required".
  assert.equal(people.find(p => p.rowId === 'm-confirmed').source, 'member');
  assert.equal(people.find(p => p.rowId === 's-confirmed').source, 'signup');
  assert.ok(people.every(person => person.rowId));
});

test('places held count both doors the way the database does', () => {
  // A member request holds a credit and therefore a place; a public request
  // holds nothing until staff confirm it.
  assert.equal(rosterPlacesHeld(rosterPeople(SIGNUPS, MEMBERS)), 3);
  assert.equal(rosterPlacesHeld(rosterPeople([], MEMBERS)), 2);
  assert.equal(rosterPlacesHeld(rosterPeople(SIGNUPS, [])), 1);
  assert.equal(rosterPlacesHeld([]), 0);
});

test('the panel groups by what the place is, and routes each row by its source', async () => {
  const roster = await read('../src/components/admin/ClassSignupRoster.jsx');
  assert.match(roster, /In the class/);
  assert.match(roster, /Awaiting decision/);
  // Waitlisted people used to appear under "Cancelled and declined", so the
  // owner scanning a full class saw nobody waiting and gave the spot away.
  assert.match(roster, /Waitlist — first in line first/);
  assert.doesNotMatch(roster, /activeMembers/);
  // The panel keeps no capacity maths of its own; it uses the shared helpers.
  assert.match(roster, /import \{ rosterPeople, rosterPlacesHeld \} from '@\/lib\/classRoster';/);
  assert.match(roster, /onStatusChange\(person, event\.target\.value\)/);

  const admin = await read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(admin, /if \(person\.source === 'member'\) return handleRosterStatus\(person\.rowId, status\);/);
  assert.match(admin, /onRosterStatusChange=\{handleRosterPersonStatus\}/);
});
