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

/**
 * Is this class closed to new bookings?
 *
 * A class with anyone queued for it counts as closed even when places have
 * since freed up: the queue goes first, and book_session enforces that with
 * SESSION_WAITLIST_FIRST. The place count itself stays honest — "3 spots · 1
 * waiting" is the truth — so this is the one place that turns the count and the
 * queue into a single answer.
 *
 * Both the button's label and the action it performs read this. Deciding it
 * twice is how a button labelled "Join waitlist" came to call book_session.
 */
export function classIsClosedToBooking(session) {
  if (Number(session?.waiting_count) > 0) return true;
  const left = session?.spots_left;
  return left !== null && left !== undefined && Number(left) <= 0;
}

export function classActionLabel({ booking, conflict, full, bookingMode }) {
  if (booking?.status === 'requested') return 'Requested';
  if (booking?.status === 'waitlisted') return 'Waitlisted';
  if (booking?.status === 'confirmed') return 'Booked';
  // A clash with a class the member already holds outranks fullness: joining a
  // waitlist for an overlapping class only defers the collision to promotion
  // time, when a credit is spent and they end up double-booked.
  if (conflict) return 'Time conflict';
  if (full) return 'Join waitlist';
  return bookingMode === 'request_to_book' ? 'Request spot' : 'Book';
}
