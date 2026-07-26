export const CREDIT_REFUND_LEAD_TIME_MS = 12 * 60 * 60 * 1000;

// Mirrors cancel_booking: requested always refunds; confirmed refunds when the
// class is more than 12 hours away. The server restores the credit even when
// the original pack has expired (and reactivates that batch so it stays usable).
export function cancellationReturnsCredit(booking, now = Date.now()) {
  if (booking.status === 'requested') return true;
  if (booking.status !== 'confirmed') return false;
  return new Date(booking.start_time).getTime() - now > CREDIT_REFUND_LEAD_TIME_MS;
}

export function cancellationMessage(booking, now = Date.now()) {
  const className = booking.title || booking.class_type || 'this class';
  if (booking.status === 'waitlisted') {
    return `This will remove you from the waitlist for ${className}. No class credit is currently reserved.`;
  }
  if (cancellationReturnsCredit(booking, now)) {
    return `This will remove you from ${className} and return your class credit.`;
  }
  return `This will remove you from ${className}. Confirmed bookings cancelled within 12 hours do not return a class credit.`;
}
