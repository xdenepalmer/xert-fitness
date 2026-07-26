export const CREDIT_REFUND_LEAD_TIME_MS = 12 * 60 * 60 * 1000;

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
    return `This will remove you from ${className} and return the reserved credit when its original credit pack is still valid. XERT will confirm the credit outcome after cancellation.`;
  }
  return `This will remove you from ${className}. Confirmed bookings cancelled within 12 hours do not return a class credit.`;
}

const CANCELLATION_OUTCOMES = new Set([
  'returned',
  'not_reserved',
  'late_cancellation',
  'expired',
  'reservation_unavailable',
]);

export function normalizeCancellationReceipt(data, expectedBookingId) {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== 1) {
    throw new Error('The booking changed without a verifiable cancellation receipt. Refresh your account before continuing.');
  }
  const receipt = rows[0] || {};
  if (
    receipt.cancelled_booking_id !== expectedBookingId
    || !['requested', 'confirmed', 'waitlisted'].includes(receipt.previous_status)
    || typeof receipt.credit_refund_eligible !== 'boolean'
    || typeof receipt.credit_refunded !== 'boolean'
    || !CANCELLATION_OUTCOMES.has(receipt.credit_outcome)
    || !receipt.cancelled_at
  ) {
    throw new Error('The cancellation receipt did not match this booking. Refresh your account before continuing.');
  }
  if (receipt.credit_refunded !== (receipt.credit_outcome === 'returned')) {
    throw new Error('The cancellation receipt contained an inconsistent credit outcome. Contact XERT before booking again.');
  }
  return receipt;
}

export function cancellationOutcomeMessage(receipt) {
  switch (receipt.credit_outcome) {
    case 'returned':
      return 'Your booking was cancelled and one class credit was returned.';
    case 'not_reserved':
      return 'You have been removed from the waitlist. No class credit was reserved.';
    case 'late_cancellation':
      return 'Your booking was cancelled within 12 hours of class, so the reserved credit was used.';
    case 'expired':
      return 'Your booking was cancelled, but its original credit pack had already expired so the credit could not be returned.';
    default:
      return 'Your booking was cancelled, but XERT could not verify a credit return. Please contact XERT before booking again.';
  }
}
