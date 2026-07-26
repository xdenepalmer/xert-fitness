export const CREDIT_REFUND_LEAD_TIME_MS = 12 * 60 * 60 * 1000;

// Mirrors cancel_booking timing: requested always attempts a refund; confirmed
// refunds when the class is more than 12 hours away. The server restores the
// credit when the pack is still live (including expired packs that reactivate),
// and no-ops when the pack was already Stripe-refunded.
export function cancellationReturnsCredit(booking, now = Date.now()) {
  if (booking.status === 'requested') return true;
  if (booking.status !== 'confirmed') return false;
  return new Date(booking.start_time).getTime() - now > CREDIT_REFUND_LEAD_TIME_MS;
}

export function cancellationCreditReturnMessage() {
  return 'Your class credit is returned when the pack is still live.';
}

export function cancellationMessage(booking, now = Date.now()) {
  const className = booking.title || booking.class_type || 'this class';
  if (booking.status === 'waitlisted') {
    return `This will remove you from the waitlist for ${className}. No class credit is currently reserved.`;
  }
  if (cancellationReturnsCredit(booking, now)) {
    return `This will remove you from ${className}. Your class credit is returned when the pack is still live.`;
  }
  return `This will remove you from ${className}. Confirmed bookings cancelled within 12 hours do not return a class credit.`;
}
