const ACTIVE_BOOKING_STATUSES = new Set(['requested', 'confirmed', 'waitlisted']);
const TIME_HOLDING_BOOKING_STATUSES = new Set(['requested', 'confirmed']);
const DEFAULT_CLASS_DURATION_MS = 60 * 60 * 1000;

function startTime(item) {
  const value = Date.parse(item?.start_time);
  return Number.isFinite(value) ? value : null;
}

function endTime(item) {
  const start = startTime(item);
  if (start === null) return null;
  const explicit = Date.parse(item?.end_time);
  if (Number.isFinite(explicit) && explicit > start) return explicit;
  const duration = Number(item?.duration_minutes);
  return start + (Number.isFinite(duration) && duration > 0 ? duration * 60 * 1000 : DEFAULT_CLASS_DURATION_MS);
}

export function classHasStarted(session, now = Date.now()) {
  const start = startTime(session);
  return start !== null && start <= now;
}

export function activeBookingsBySession(bookings) {
  const active = new Map();
  for (const booking of bookings || []) {
    if (ACTIVE_BOOKING_STATUSES.has(booking.status) && booking.session_id) {
      active.set(booking.session_id, booking);
    }
  }
  return active;
}

export function bookingTimeConflict(session, bookings) {
  const sessionStart = startTime(session);
  const sessionEnd = endTime(session);
  if (sessionStart === null || sessionEnd === null) return null;

  return (bookings || []).find(booking => {
    if (!TIME_HOLDING_BOOKING_STATUSES.has(booking.status)) return false;
    if (booking.session_id === session.id) return false;
    const bookingStart = startTime(booking);
    const bookingEnd = endTime(booking);
    return bookingStart !== null && bookingEnd !== null
      && bookingStart < sessionEnd && bookingEnd > sessionStart;
  }) || null;
}

export function classActionLabel({ booking, conflict, full, bookingMode }) {
  if (booking?.status === 'requested') return 'Requested';
  if (booking?.status === 'waitlisted') return 'Waitlisted';
  if (booking?.status === 'confirmed') return 'Booked';
  if (full) return 'Join waitlist';
  if (conflict) return 'Time conflict';
  return bookingMode === 'request_to_book' ? 'Request spot' : 'Book';
}
