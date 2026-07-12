const ACTIVE_BOOKING_STATUSES = new Set(['requested', 'confirmed', 'waitlisted']);

export function activeBookingsBySession(bookings) {
  const active = new Map();
  for (const booking of bookings || []) {
    if (ACTIVE_BOOKING_STATUSES.has(booking.status) && booking.session_id) {
      active.set(booking.session_id, booking);
    }
  }
  return active;
}

export function classActionLabel({ booking, full, bookingMode }) {
  if (booking?.status === 'requested') return 'Requested';
  if (booking?.status === 'waitlisted') return 'Waitlisted';
  if (booking?.status === 'confirmed') return 'Booked';
  if (full) return 'Full';
  return bookingMode === 'request_to_book' ? 'Request spot' : 'Book';
}
