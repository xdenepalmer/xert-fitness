const ELIGIBLE_STATUSES = new Set(['confirmed', 'attended', 'no_show']);
const MARKED_STATUSES = new Set(['attended', 'no_show']);

export function attendanceRosterMembers(roster) {
  const seen = new Set();
  return (roster || []).filter(member => {
    const bookingId = String(member?.booking_id || '').trim();
    if (!bookingId || seen.has(bookingId) || !ELIGIBLE_STATUSES.has(member?.status)) return false;
    seen.add(bookingId);
    return true;
  });
}

export function createAttendanceDraft(roster) {
  return Object.fromEntries(attendanceRosterMembers(roster).map(member => [
    member.booking_id,
    MARKED_STATUSES.has(member.status) ? member.status : '',
  ]));
}

export function blankAttendanceDraft(roster) {
  return Object.fromEntries(attendanceRosterMembers(roster).map(member => [member.booking_id, '']));
}

export function markAllAttendance(roster, status = 'attended') {
  if (!MARKED_STATUSES.has(status)) throw new Error('Choose attended or no show for the roll call.');
  return Object.fromEntries(attendanceRosterMembers(roster).map(member => [member.booking_id, status]));
}

export function summarizeAttendanceDraft(roster, draft = {}) {
  const members = attendanceRosterMembers(roster);
  const entries = members.map(member => ({
    bookingId: member.booking_id,
    status: MARKED_STATUSES.has(draft[member.booking_id]) ? draft[member.booking_id] : '',
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
