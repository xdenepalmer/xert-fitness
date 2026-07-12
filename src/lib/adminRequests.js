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

export function normalizeLegacyBookingNotes(id, notes) {
  return { id: recordId(id), admin_notes: normalizeAdminNotes(notes) };
}

export function normalizePTRequestMutation(id, status, adminNotes) {
  if (!PT_STATUSES.has(status)) throw new Error('Choose a valid PT request status.');
  const updates = { status };
  if (adminNotes !== undefined) updates.admin_notes = normalizeAdminNotes(adminNotes);
  return { id: recordId(id), updates };
}
