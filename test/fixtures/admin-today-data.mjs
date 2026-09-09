// Fictional read-only Today data. No mutation or outbound communications.
export function installTodayData() {
  const rows = (prefix, count, status) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, status }));
  const now = Date.now();
  const tables = {
    member_interest: [], trainer_interest: rows('fixture-trainer', 2, 'new'), partner_interest: rows('fixture-partner', 1, 'new'),
    class_bookings: [...rows('fixture-public-request', 2, 'requested'), ...rows('fixture-public-wait', 1, 'waitlisted')],
    session_bookings: [...rows('fixture-member-request', 3, 'requested'), ...rows('fixture-member-wait', 2, 'waitlisted')],
    private_session_requests: rows('fixture-pt-request', 1, 'requested'),
    admin_daily_operations: [0, 1].map(index => ({
      session_id: index ? '22222222-2222-4222-8222-222222222223' : '22222222-2222-4222-8222-222222222222',
      title: index ? 'Fictional Later Strength' : 'Foundation Strength', status: 'published',
      start_time: new Date(now + (index + 1) * 3600000).toISOString(), end_time: new Date(now + (index + 2) * 3600000).toISOString(),
      coach_name: 'Fixture Coach', location_zone: 'Fictional main floor', capacity: 8, places_held: 6,
      confirmed_count: 4, public_confirmed_count: 2, requested_count: 3, public_request_count: 2,
      waitlist_count: 2, public_waitlist_count: 1, attendance_due: false,
    })),
  };
  return { read(name, url) {
    if (!Object.hasOwn(tables, name)) return undefined;
    let selected = tables[name];
    const status = url.searchParams.get('status')?.replace(/^eq\./, '');
    if (status) selected = selected.filter(row => row.status === status);
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
    const limit = Math.max(0, Number(url.searchParams.get('limit') || selected.length));
    return { rows: structuredClone(selected.slice(offset, offset + limit)), total: selected.length, offset };
  } };
}
