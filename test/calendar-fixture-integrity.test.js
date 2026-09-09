import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarFixtureIds, installCalendarData } from './fixtures/admin-calendar-data.mjs';

test('calendar fixture keeps public and member attendance sources distinct and session-scoped', () => {
  const data = { class_sessions: [] };
  const fixture = installCalendarData(data);
  assert.equal(data.class_sessions.length, 3);
  assert.equal(new Set(data.class_sessions.map(row => row.id)).size, 3);
  const memberRows = fixture.read('admin_session_roster', { p_session_id: calendarFixtureIds.pastClass });
  const publicRows = fixture.read('class_bookings', {}, new URL(`https://example.invalid/rest/v1/class_bookings?class_session_id=eq.${calendarFixtureIds.pastClass}`));
  assert.equal(memberRows.length, 1);
  assert.equal(publicRows.length, 2);
  assert.ok(publicRows.every(row => row.class_session_id === calendarFixtureIds.pastClass && row.email.endsWith('@example.invalid')));
  assert.equal(memberRows[0].booking_id, calendarFixtureIds.pastMemberBooking);
  assert.ok(publicRows.some(row => row.status === 'requested'), 'A public enquiry coexists with eligible attendance without reserving a member credit');
  memberRows[0].status = 'cancelled';
  assert.equal(fixture.read('admin_session_roster', { p_session_id: calendarFixtureIds.pastClass })[0].status, 'confirmed', 'Read results cannot mutate fixture state');
  assert.equal(fixture.read('unconfigured_rpc', {}), undefined, 'Unknown operations do not become successful empty responses');
});

test('calendar fixture exposes a reviewable FIFO candidate and a separate pending-member blocker', () => {
  const data = { class_sessions: [] };
  const fixture = installCalendarData(data);
  const queue = fixture.read('admin_waitlist_overview', {});
  assert.equal(queue.length, 1);
  assert.equal(queue[0].session_id, calendarFixtureIds.futureClass);
  assert.equal(queue[0].next_booking_id, calendarFixtureIds.waitlistBooking);
  assert.equal(queue[0].can_promote, true);
  const pending = fixture.read('admin_session_roster', { p_session_id: calendarFixtureIds.blockedClass });
  assert.ok(pending.some(row => row.status === 'requested'));
  assert.ok(pending.some(row => row.status === 'confirmed'));
  const capacity = fixture.read('admin_class_capacity', {});
  assert.ok(capacity.every(row => row.spots_left === row.capacity - row.taken));
});

test('attendee search fixture respects literal query and bounds across both booking sources', () => {
  const data = { class_sessions: [] };
  const fixture = installCalendarData(data);
  const find = query => fixture.read('admin_search_class_attendees', { p_query: query, p_from: null, p_to: null, p_limit: 100 });
  const member = find('Morgan');
  assert.equal(member.length, 1);
  assert.equal(member[0].source, 'member');
  assert.equal(member[0].session_id, calendarFixtureIds.pastClass);
  assert.equal(member[0].session_title, 'Morning Strength');
  assert.equal(find('Taylor')[0].source, 'signup');
  assert.equal(find('Taylor')[0].member_id, null);
  assert.deepEqual(find('q'), []);
  assert.deepEqual(find('%'), []);
  assert.deepEqual(find('example.invalid'), [], 'An email domain alone is not a local-part match');
  assert.equal(find('morgan.ellis@example.invalid').length, 1);
  assert.equal(fixture.read('admin_search_class_attendees', { p_query: 'Morgan', p_from: data.class_sessions[0].start_time, p_limit: 100 }).length, 0);
  assert.equal(fixture.read('admin_search_class_attendees', { p_query: 'an', p_limit: 1 }).length, 1);
  member[0].status = 'cancelled';
  assert.equal(find('Morgan')[0].status, 'confirmed');
});
