import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XERT_2026_EVENTS,
  buildEventIcs,
  formatEventRange,
  getEventState,
  groupEventsByMonth,
  sortEvents
} from '../src/lib/eventCalendar.js';

test('ships the complete July to December XERT 2026 calendar', () => {
  assert.equal(XERT_2026_EVENTS.length, 20);
  assert.equal(XERT_2026_EVENTS[0].name, 'Gold Coast Marathon');
  assert.equal(XERT_2026_EVENTS.at(-1).name, 'XERT Team Competition');
  assert.deepEqual(
    groupEventsByMonth(XERT_2026_EVENTS).map(group => group.month),
    ['July', 'August', 'September', 'October', 'November', 'December']
  );
});

test('sorts same-day events by administrator sort order and formats date ranges', () => {
  const events = [
    { name: 'Second', event_date: '2026-09-13', sort_order: 2 },
    { name: 'First', event_date: '2026-09-13', sort_order: 1 },
    { name: 'Earlier', event_date: '2026-09-12', end_date: '2026-09-13' }
  ];

  assert.deepEqual(sortEvents(events).map(event => event.name), ['Earlier', 'First', 'Second']);
  assert.equal(formatEventRange(events[2]), '12-13 Sept');
});

test('reports upcoming, live, and completed event states at day boundaries', () => {
  const event = { event_date: '2026-07-04', end_date: '2026-07-05' };

  assert.equal(getEventState(event, new Date(2026, 6, 3, 23, 59)).key, 'upcoming');
  assert.equal(getEventState(event, new Date(2026, 6, 4, 12)).key, 'live');
  assert.equal(getEventState(event, new Date(2026, 6, 5, 23, 59)).key, 'live');
  assert.equal(getEventState(event, new Date(2026, 6, 6, 0, 1)).key, 'complete');
});

test('builds an all-day calendar file with an exclusive end date', () => {
  const contents = buildEventIcs({
    name: 'XERT Team Competition, Finals',
    event_date: '2026-12-05',
    location: 'Kingaroy; Queensland'
  });

  assert.match(contents, /DTSTART;VALUE=DATE:20261205/);
  assert.match(contents, /DTEND;VALUE=DATE:20261206/);
  assert.match(contents, /SUMMARY:XERT Team Competition\\, Finals/);
  assert.match(contents, /LOCATION:Kingaroy\\; Queensland/);
});
