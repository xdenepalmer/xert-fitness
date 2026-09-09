import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { attendeeMatchesByPerson, attendeeDisplayName, summarizeAttendeeSearch } from '../src/lib/classAttendeeSearch.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const now = Date.parse('2026-09-08T22:00:00.000Z');
const row = (over = {}) => ({
  source: 'signup', booking_id: 'b1', member_id: null,
  full_name: 'Chloe Cowan', email: 'chloe@example.com', phone: '0400 111 222',
  status: 'confirmed', session_id: 's1', session_title: '6:15am Training session',
  session_start: '2026-09-08T20:15:00.000Z', coach_name: 'Byron', location_zone: 'Main floor',
  ...over,
});

test('one row per booking becomes one entry per person, with their classes under them', () => {
  const people = attendeeMatchesByPerson([
    row(),
    row({ booking_id: 'b2', session_id: 's2', session_start: '2026-09-09T07:30:00.000Z', session_title: '5:30pm training session' }),
    row({ booking_id: 'b3', full_name: 'Max Eastwell', email: 'max@example.com', session_id: 's3' }),
  ], { now });

  assert.equal(people.length, 2, 'somebody in two classes is one person, not two results');
  assert.equal(people[0].name, 'Chloe Cowan');
  assert.equal(people[0].classes.length, 2);
  // Most classes first, so a single stray match never leads the list.
  assert.equal(people[1].name, 'Max Eastwell');
  // Classes read in the order they happen.
  assert.ok(people[0].classes[0].startsAt < people[0].classes[1].startsAt);
});

test('both doors into a class are shown, and cancelled places are not counted as coming up', () => {
  const people = attendeeMatchesByPerson([
    row({ source: 'member', member_id: 'm1', booking_id: 'b1' }),
    row({ source: 'signup', booking_id: 'b2', session_id: 's2', session_start: '2026-09-09T07:30:00.000Z' }),
    row({ source: 'signup', booking_id: 'b3', session_id: 's3', status: 'cancelled', session_start: '2026-09-10T07:30:00.000Z' }),
    row({ source: 'signup', booking_id: 'b4', session_id: 's4', session_start: '2026-09-01T07:30:00.000Z' }),
  ], { now });

  const [person] = people;
  assert.deepEqual(person.sources, ['member', 'signup'], 'somebody can reach a class either way');
  assert.equal(person.memberId, 'm1');
  assert.equal(person.classes.length, 4);
  // One still to come: the cancelled class does not count, and neither do the
  // two that have already been and gone.
  assert.equal(person.upcoming, 1);
  assert.equal(person.classes.find(entry => entry.status === 'cancelled').active, false);

  assert.deepEqual(summarizeAttendeeSearch(people), { people: 1, bookings: 4, upcoming: 1 });
});

test('people are matched by email, and a booking with no name still shows something', () => {
  // Same person, name typed differently each time.
  const people = attendeeMatchesByPerson([
    row({ full_name: 'chloe cowan' }),
    row({ booking_id: 'b2', full_name: 'Chloe  Cowan', session_id: 's2' }),
  ], { now });
  assert.equal(people.length, 1);

  // No email to match on falls back to the name.
  assert.equal(attendeeMatchesByPerson([
    row({ email: '', full_name: 'Chloe Cowan' }),
    row({ email: '', full_name: 'CHLOE COWAN', booking_id: 'b2', session_id: 's2' }),
  ], { now }).length, 1);

  assert.equal(attendeeDisplayName({ full_name: '', email: 'x@example.com' }), 'x@example.com');
  assert.equal(attendeeDisplayName({}), 'Unnamed booking');
  assert.deepEqual(attendeeMatchesByPerson(null), []);
});

test('the database searches both doors and never lets a query act as a wildcard', async () => {
  const sql = await read('../supabase/migrations/20260908080000_admin_search_class_attendees.sql');

  // Both ways into a class, in one answer.
  assert.match(sql, /from public\.class_bookings c/);
  assert.match(sql, /from public\.session_bookings b/);
  assert.match(sql, /'signup'::text as source/);
  assert.match(sql, /'member'::text as source/);

  // position() is a literal search: a name holding % or _ cannot become a
  // pattern, which `like` would have allowed.
  assert.match(sql, /position\(v_query in lower\(coalesce\(c\.full_name, ''\)\)\)/);
  assert.doesNotMatch(sql, /\blike\b/i, 'no pattern matching on staff-typed text');
  assert.match(sql, /if length\(v_query\) < 2 then return; end if/,
    'an almost-empty box must not return the whole history of the club');
  assert.match(sql, /if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/);
  assert.match(sql, /least\(greatest\(coalesce\(p_limit, 100\), 1\), 500\)/, 'the result size is bounded');
  // Phone numbers are compared as digits, so spacing never hides a match.
  assert.match(sql, /regexp_replace\(coalesce\(p_query, ''\), '\[\^0-9\]', '', 'g'\)/);

  // Searching two letters used to match every hotmail.com and gmail.com on
  // file, because ".com" contains "co". Only the part before the @ is searched
  // now, unless the query itself is an address.
  assert.match(sql, /v_whole_email boolean := position\('@' in v_query\) > 0/);
  assert.match(sql, /case when v_whole_email then c\.email else split_part\(c\.email, '@', 1\) end/);
  assert.match(sql, /case when v_whole_email then pr\.email else split_part\(pr\.email, '@', 1\) end/);
});

test('the calendar searches as you type and jumps to the class you pick', async () => {
  const screen = await read('../src/components/admin/ClassCalendarAdmin.jsx');
  const data = await read('../src/lib/adminData.js');

  assert.match(screen, /Search a name, email or phone across every class/);
  assert.match(screen, /window\.setTimeout\(async \(\) => \{/, 'typing a name is one query, not one per keystroke');
  assert.match(screen, /if \(active\) setAttendeeMatches\(attendeeMatchesByPerson\(rows\)\)/,
    'a slower earlier query must not overwrite the latest answer');
  // The browser search probe opens the chosen roster and verifies retained
  // period, URL filters, hash and the selected-session exception.
  assert.match(screen, /Nobody matching/, 'an empty result says so rather than showing nothing');
  assert.match(data, /p_query: term/);
  assert.match(data, /if \(term\.length < 2\) return \[\]/);
});
