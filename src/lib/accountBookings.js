const PENDING_STATUSES = new Set(['requested', 'waitlisted']);

export function partitionAccountBookings(bookings, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const groups = { pending: [], upcoming: [], history: [] };

  for (const booking of bookings) {
    const startMs = new Date(booking.start_time).getTime();
    const isFuture = Number.isFinite(startMs) && startMs > nowMs;

    if (isFuture && PENDING_STATUSES.has(booking.status)) {
      groups.pending.push(booking);
    } else if (isFuture && booking.status === 'confirmed') {
      groups.upcoming.push(booking);
    } else {
      groups.history.push(booking);
    }
  }

  return groups;
}
