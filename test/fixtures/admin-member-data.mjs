// Fictional read-only records for the real owner directory. No mutation handler.
import { filterMembers } from '../../src/lib/memberAdmin.js';

const uuid = (group, number) => `${group}0000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export function installMemberData() {
  const members = Array.from({ length: 112 }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    return {
      id: uuid('2', index + 1), full_name: `Directory Member ${number}`, email: `directory.member.${number}@example.invalid`, phone: '',
      role: (index + 1) % 10 === 0 ? 'admin' : 'member', joined_at: new Date(Date.UTC(2026, 7, 31, 12) - index * 3600000).toISOString(),
      credits_remaining: (index + 1) % 3, bookings_count: index % 8, total_spent_cents: (index + 1) * 1000,
    };
  });
  const member = members[0];
  const notes = [
    { id: uuid('3', 1), user_id: member.id, category: 'coaching', body: 'Fictional staff note: prefers a clear session overview.', author_name: 'Fixture Coach', created_at: '2026-09-01T01:00:00Z', archived_at: null },
    { id: uuid('3', 2), user_id: member.id, category: 'general', body: 'Fictional archived note retained for staff history.', author_name: 'Fixture Coach', created_at: '2026-08-01T01:00:00Z', archived_at: '2026-09-01T02:00:00Z' },
  ];
  const tables = {
    credit_batches: [{ id: uuid('4', 1), user_id: member.id, total: 4, remaining: 1, expires_at: null, order_id: null, created_at: '2026-08-01T01:00:00Z' }],
    session_bookings: [{ id: uuid('5', 1), user_id: member.id, status: 'attended', created_at: '2026-09-01T01:00:00Z', class_sessions: { title: 'Fictional Foundation Strength', class_type: 'strength', start_time: '2026-09-01T06:00:00Z' } }],
    orders: [{ id: uuid('6', 1), user_id: member.id, amount_cents: 43000, currency: 'aud', created_at: '2026-08-01T01:00:00Z', paid_at: '2026-08-01T01:00:00Z', products: { name: 'Fictional three-month membership' } }],
    admin_credit_grants: [{ id: uuid('7', 1), user_id: member.id, credit_batch_id: uuid('4', 1), note: 'Fictional legacy grant with preserved reason.', created_at: '2026-08-01T01:00:00Z' }],
  };
  return {
    read(name, args = {}, url) {
      let rows;
      let offset = 0;
      let total;
      if (name === 'admin_list_members_page') {
        rows = filterMembers(args.p_user_id ? members.filter(row => row.id === args.p_user_id) : members,
          { search: args.p_search || '', role: args.p_role || 'all', credit: args.p_credit || 'all' });
        total = rows.length;
        offset = Math.max(0, Number(args.p_offset || 0));
        rows = rows.slice(offset, offset + Math.min(100, Number(args.p_limit || 50))).map(row => ({ ...row, total_count: total }));
      } else if (name === 'admin_list_members') {
        rows = members;
      } else if (name === 'admin_member_activation_overview') {
        rows = [{ as_of: new Date().toISOString(), cohort_days: Number(args.p_cohort_days || 30), accounts_created: 112, readiness_complete: 90, training_access: 70, first_booking: 60, first_attended: 45, returned: 30 }];
      } else if (name === 'admin_member_activation_queue') {
        rows = members.slice(1, 4).map((row, index) => ({ ...row, reason: ['setup_incomplete', 'no_training_access', 'no_first_booking'][index], has_training_access: index === 2 })).slice(0, Number(args.p_limit || 12));
      } else if (name === 'admin_member_follow_up_queue') {
        rows = members.slice(4, 7).map((row, index) => ({ ...row, reason: ['no_first_booking', 'credits_expiring', 'idle_credits'][index], credits_expiring: 1, next_credit_expiry: '2026-10-01T00:00:00Z', last_attended_at: null })).slice(0, Number(args.p_limit || 20));
      } else if (name === 'admin_list_member_notes') {
        rows = notes.filter(note => note.user_id === args.p_user_id && (args.p_include_archived || !note.archived_at));
      } else if (name === 'admin_list_member_notices') {
        rows = args.p_user_id === member.id ? [{ id: uuid('8', 1), title: 'Fictional training reminder', body: 'Please check the class timetable.', tone: 'info', source_kind: 'manual', published_at: '2026-09-01T00:00:00Z', read_at: '2026-09-01T01:00:00Z', dismissed_at: null, push_attempted: 1, push_delivered: 1 }] : [];
      } else if (Object.hasOwn(tables, name)) {
        const memberId = url.searchParams.get('user_id')?.replace(/^eq\./, '');
        rows = tables[name].filter(row => row.user_id === memberId);
      } else return undefined;
      return { rows: structuredClone(rows), total: total ?? rows.length, offset };
    },
  };
}
