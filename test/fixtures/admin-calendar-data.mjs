// Read-only fictional calendar/roster responses for the real owner panel.
// No operation here forwards traffic or mutates a live gym record.
export const calendarFixtureIds = Object.freeze({
  futureClass: 'c1000000-0000-4000-8000-000000000001',
  pastClass: 'c1000000-0000-4000-8000-000000000002',
  blockedClass: 'c1000000-0000-4000-8000-000000000003',
  pastMemberBooking: 'c2000000-0000-4000-8000-000000000001',
  waitlistBooking: 'c2000000-0000-4000-8000-000000000002',
});

export function installCalendarData(data) {
  const now = Date.now();
  const session = (id, title, hours) => ({
    id, title, class_type: 'XERT Strength', session_type: 'XERT Strength', status: 'published', public_visible: true,
    start_time: new Date(now + hours * 3600000).toISOString(),
    end_time: new Date(now + (hours + 1) * 3600000).toISOString(),
    coach_name: 'Sam', location_zone: 'Main floor', capacity: 8, booking_mode: 'request_to_book',
    description: 'A fictional coached session for local browser verification.', intensity: 'Moderate',
  });
  data.class_sessions = [
    session(calendarFixtureIds.futureClass, 'Foundation Strength', 2),
    session(calendarFixtureIds.pastClass, 'Morning Strength', -2),
    session(calendarFixtureIds.blockedClass, 'Review Pending Requests', -4),
  ];
  const member = (id, name, status, bookingId) => ({
    id, member_id: id, booking_id: bookingId, full_name: name,
    email: name.toLowerCase().replaceAll(' ', '.') + '@example.invalid', status,
    booked_at: '2026-01-01T00:00:00Z', credits_remaining: 2,
  });
  const rosters = new Map([
    [calendarFixtureIds.futureClass, [
      member('c3000000-0000-4000-8000-000000000001', 'Casey Reed', 'confirmed', 'c2000000-0000-4000-8000-000000000003'),
      member('c3000000-0000-4000-8000-000000000002', 'Drew Rowan', 'waitlisted', calendarFixtureIds.waitlistBooking),
    ]],
    [calendarFixtureIds.pastClass, [member('c3000000-0000-4000-8000-000000000003', 'Morgan Ellis', 'confirmed', calendarFixtureIds.pastMemberBooking)]],
    [calendarFixtureIds.blockedClass, [
      member('c3000000-0000-4000-8000-000000000004', 'Jordan Brooks', 'confirmed', 'c2000000-0000-4000-8000-000000000004'),
      member('c3000000-0000-4000-8000-000000000005', 'Riley Quinn', 'requested', 'c2000000-0000-4000-8000-000000000005'),
    ]],
  ]);
  const signup = (id, classId, name, status) => ({
    id, class_session_id: classId, full_name: name,
    email: name.toLowerCase().replaceAll(' ', '.') + '@example.invalid',
    status, training_level: 'Intermediate', created_at: '2026-01-02T00:00:00Z', admin_notes: '',
  });
  const signups = [
    signup('c4000000-0000-4000-8000-000000000001', calendarFixtureIds.futureClass, 'Sky Parker', 'confirmed'),
    signup('c4000000-0000-4000-8000-000000000002', calendarFixtureIds.pastClass, 'Taylor Lane', 'confirmed'),
    signup('c4000000-0000-4000-8000-000000000003', calendarFixtureIds.pastClass, 'Pat River', 'requested'),
  ];
  const queue = [{
    session_id: calendarFixtureIds.futureClass, title: 'Foundation Strength',
    start_time: data.class_sessions[0].start_time, capacity: 8, active_count: 2,
    waitlist_count: 1, next_booking_id: calendarFixtureIds.waitlistBooking,
    next_member_id: 'c3000000-0000-4000-8000-000000000002', next_full_name: 'Drew Rowan',
    next_email: 'drew.rowan@example.invalid', next_available_credits: 2,
    next_booked_at: '2026-01-01T00:00:00Z', can_promote: true,
  }];
  return {
    read(name, args = {}, url) {
      if (name === 'admin_session_roster') return structuredClone(rosters.get(args.p_session_id) || []);
      if (name === 'class_bookings') {
        const filter = url?.searchParams.get('class_session_id');
        return structuredClone(signups.filter(row => !filter || filter === `eq.${row.class_session_id}`));
      }
      if (name === 'admin_waitlist_overview') return structuredClone(queue);
      if (name === 'admin_class_capacity') return data.class_sessions.map(row => {
        const roster = rosters.get(row.id);
        const taken = roster.filter(member => ['confirmed', 'requested'].includes(member.status)).length
          + signups.filter(signup => signup.class_session_id === row.id && signup.status === 'confirmed').length;
        return { class_session_id: row.id, capacity: 8, taken, spots_left: 8 - taken,
          waiting: roster.filter(member => member.status === 'waitlisted').length,
          pending: roster.filter(member => member.status === 'requested').length, booking_mode: row.booking_mode };
      });
      return undefined;
    },
  };
}
