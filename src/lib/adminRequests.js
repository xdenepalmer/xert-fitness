const BOOKING_STATUSES = new Set(['requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show']);
const PT_STATUSES = new Set(['requested', 'approved', 'declined', 'reschedule_requested', 'completed', 'cancelled']);

function recordId(value) {
  const id = String(value || '').trim();
  if (!id) throw new Error('A request record is required.');
  return id;
}

export function normalizeAdminNotes(value) {
  const notes = String(value || '').trim();
  if (notes.length > 5000) throw new Error('Admin notes must be 5,000 characters or fewer.');
  return notes || null;
}

export function normalizeBookingStatusMutation(id, status) {
  if (!BOOKING_STATUSES.has(status)) throw new Error('Choose a valid booking status.');
  return { id: recordId(id), status };
}

export function normalizeSessionAttendanceMutation(sessionId, attendance) {
  const normalizedSessionId = recordId(sessionId);
  if (!Array.isArray(attendance) || attendance.length === 0) {
    throw new Error('Add at least one member to the roll call.');
  }

  const seen = new Set();
  const attendedIds = [];
  const noShowIds = [];
  for (const entry of attendance) {
    const bookingId = recordId(entry?.bookingId);
    if (seen.has(bookingId)) throw new Error('Each booking can only appear once in a roll call.');
    if (!['attended', 'no_show'].includes(entry?.status)) {
      throw new Error('Mark every member as attended or no show.');
    }
    seen.add(bookingId);
    (entry.status === 'attended' ? attendedIds : noShowIds).push(bookingId);
  }

  return { sessionId: normalizedSessionId, attendedIds, noShowIds };
}

export function normalizeLegacyBookingNotes(id, notes) {
  return { id: recordId(id), admin_notes: normalizeAdminNotes(notes) };
}

export function normalizePTRequestMutation(id, status, adminNotes) {
  if (!PT_STATUSES.has(status)) throw new Error('Choose a valid PT request status.');
  const updates = { status };
  if (adminNotes !== undefined) updates.admin_notes = normalizeAdminNotes(adminNotes);
  return { id: recordId(id), updates };
}
