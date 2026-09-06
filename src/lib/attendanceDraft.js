const ELIGIBLE_STATUSES = new Set(['confirmed', 'attended', 'no_show']);
const MARKED_STATUSES = new Set(['attended', 'no_show']);

/**
 * The roll call covers everyone who was in the room, which is both doors into
 * it: members booked with credits (session_bookings, keyed by booking_id) and
 * people who took a spot through the public timetable (class_bookings, keyed by
 * id). A class filled entirely through the timetable used to have no roll call
 * at all — no Take attendance button, no attendance record, and no way to
 * complete the class.
 */
export function attendanceRowId(person) {
  return String(person?.booking_id || person?.id || '').trim();
}

export function attendanceRosterMembers(roster) {
  const seen = new Set();
  return (roster || []).filter(member => {
    const rowId = attendanceRowId(member);
    if (!rowId || seen.has(rowId) || !ELIGIBLE_STATUSES.has(member?.status)) return false;
    seen.add(rowId);
    return true;
  });
}

/** Members and public sign-ups as one list, in the order they booked. */
export function attendanceRoll(roster = [], signups = []) {
  return [
    ...(roster || []).map(person => ({ ...person, attendance_source: 'member' })),
    ...(signups || []).map(person => ({ ...person, attendance_source: 'signup' })),
  ];
}

export function createAttendanceDraft(roster) {
  return Object.fromEntries(attendanceRosterMembers(roster).map(member => [
    attendanceRowId(member),
    MARKED_STATUSES.has(member.status) ? member.status : '',
  ]));
}

export function blankAttendanceDraft(roster) {
  return Object.fromEntries(attendanceRosterMembers(roster).map(member => [attendanceRowId(member), '']));
}

export function markAllAttendance(roster, status = 'attended') {
  if (!MARKED_STATUSES.has(status)) throw new Error('Choose attended or no show for the roll call.');
  return Object.fromEntries(attendanceRosterMembers(roster).map(member => [attendanceRowId(member), status]));
}

export function summarizeAttendanceDraft(roster, draft = {}) {
  const members = attendanceRosterMembers(roster);
  const entries = members.map(member => ({
    bookingId: attendanceRowId(member),
    status: MARKED_STATUSES.has(draft[attendanceRowId(member)]) ? draft[attendanceRowId(member)] : '',
  }));
  const attended = entries.filter(entry => entry.status === 'attended').length;
  const noShow = entries.filter(entry => entry.status === 'no_show').length;
  const marked = attended + noShow;
  return {
    members,
    entries,
    total: entries.length,
    attended,
    noShow,
    marked,
    unmarked: entries.length - marked,
    complete: entries.length > 0 && marked === entries.length,
  };
}
