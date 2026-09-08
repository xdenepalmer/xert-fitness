// This in-memory server exists only inside the isolated browser verification
// runner. It never forwards a request or changes a real XERT record.
export const commandIds = Object.freeze({
  futureClass: '22222222-2222-4222-8222-222222222222',
  pastClass: '44444444-4444-4444-8444-444444444444',
  jordan: '55555555-5555-4555-8555-555555555555',
  request: '66666666-6666-4666-8666-666666666666',
  reese: '77777777-7777-4777-8777-777777777777',
  pastBooking: '88888888-8888-4888-8888-888888888888',
  form: '99999999-9999-4999-8999-999999999999',
});

export function installCommandData(data, { mutations = [] } = {}) {
  const members = [
    { id: commandIds.jordan, full_name: 'Jordan Lee', email: 'jordan@example.invalid', phone: '+61491570156', credits_remaining: 0 },
    { id: commandIds.reese, full_name: 'Reese Taylor', email: 'reese@example.invalid', phone: '+61491570157', credits_remaining: 0 },
  ];
  const future = data.class_sessions[0];
  const past = { ...future, id: commandIds.pastClass, session_id: commandIds.pastClass,
    title: 'Completed Strength', status: 'completed', public_visible: false,
    start_time: new Date(Date.now() - 2 * 3600000).toISOString(),
    end_time: new Date(Date.now() - 3600000).toISOString(),
  };
  data.class_sessions.push(past);
  const rosterRow = (member, bookingId, status) => ({
    ...member, member_id: member.id, booking_id: bookingId, status,
    booked_at: '2026-01-01T00:00:00Z',
  });
  const rosters = new Map([
    [future.id, [rosterRow(members[0], commandIds.request, 'requested')]],
    [past.id, [rosterRow(members[1], commandIds.pastBooking, 'attended')]],
  ]);
  data.xert_forms = [{
    id: commandIds.form, title: 'Member Feedback', slug: 'member-feedback', form_type: 'survey',
    description: 'Fictional design-verification survey.', is_active: false, archived_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    questions: [{ id: 'feedback', type: 'short_text', question: 'What worked well today?', required: false }],
    collect_name: true, collect_email: false, collect_phone: false,
  }];
  const requestReceipts = new Map();
  const failure = message => ({ status: 409, body: { message } });
  return {
    read(name, args) {
      if (name === 'admin_session_roster') return structuredClone(rosters.get(args.p_session_id) || []);
      if (name === 'admin_search_members') return members.filter(member => `${member.full_name} ${member.email}`.toLowerCase().includes(String(args.p_search).toLowerCase()));
      if (name === 'admin_class_capacity') return data.class_sessions.map(row => ({
        class_session_id: row.id, capacity: 8, taken: rosters.get(row.id)?.length || 0,
        waiting: 0, pending: 0, spots_left: 6, booking_mode: 'request_to_book',
      }));
      return undefined;
    },
    mutate(name, { method, url, body }) {
      if (method !== 'POST' && method !== 'PATCH') return undefined;
      if (name === 'admin_set_booking_status_with_notice') {
        mutations.push({ name, body });
        if (body.p_booking_id !== commandIds.request || body.p_status !== 'confirmed' || !body.p_request_id) return failure('Unexpected fixture booking decision.');
        const row = rosters.get(future.id)[0];
        row.status = 'confirmed';
        return { body: { booking_id: row.booking_id, new_status: row.status, announcement_id: null } };
      }
      if (name === 'admin_book_member_into_class') {
        mutations.push({ name, body });
        if (body.p_session_id !== future.id || body.p_member_id !== commandIds.reese || !body.p_request_id) return failure('Unexpected fixture attendee request.');
        if (requestReceipts.has(body.p_request_id)) return { body: requestReceipts.get(body.p_request_id) };
        const roster = rosters.get(future.id);
        if (roster.some(row => row.member_id === body.p_member_id)) return failure('ALREADY_BOOKED');
        const bookingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        roster.push(rosterRow(members[1], bookingId, 'confirmed'));
        const receipt = { request_id: body.p_request_id, session_id: future.id, member_id: commandIds.reese, booking_id: bookingId, announcement_id: null };
        requestReceipts.set(body.p_request_id, receipt);
        return { body: receipt };
      }
      if (name === 'admin_record_session_attendance') {
        mutations.push({ name, body });
        const marked = [...(body.p_attended_ids || []), ...(body.p_no_show_ids || [])];
        if (body.p_session_id !== past.id || marked.length !== 1 || marked[0] !== commandIds.pastBooking) return failure('INCOMPLETE_ROLL_CALL');
        rosters.get(past.id)[0].status = body.p_attended_ids.includes(commandIds.pastBooking) ? 'attended' : 'no_show';
        return { body: 1 };
      }
      if (name === 'xert_forms' && method === 'PATCH') {
        mutations.push({ name, body });
        const form = data.xert_forms[0];
        if (url.searchParams.get('id') !== `eq.${form.id}` || url.searchParams.get('updated_at') !== `eq.${form.updated_at}`) return failure('Form changed; refresh before publishing.');
        Object.assign(form, body, { updated_at: new Date().toISOString() });
        return { body: structuredClone(form) };
      }
      return undefined;
    },
  };
}
