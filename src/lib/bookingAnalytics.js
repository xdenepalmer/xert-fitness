export function bookingTimestamp(booking) {
  const value = Date.parse(booking?.createdAt || booking?.created_at || '');
  return Number.isFinite(value) ? value : 0;
}

export function filterAdminBookings(bookings, filters = {}, now = Date.now()) {
  const search = String(filters.search || '').trim().toLowerCase();
  const days = filters.days === 'all' ? null : Number(filters.days || 30);
  const cutoff = days && Number.isFinite(days) ? now - days * 86400000 : null;

  return (bookings || []).filter(booking => {
    if (filters.status && filters.status !== 'all' && booking.status !== filters.status) return false;
    if (filters.source && filters.source !== 'all' && booking.source !== filters.source) return false;
    if (cutoff && bookingTimestamp(booking) < cutoff) return false;
    if (!search) return true;

    return [
      booking.full_name,
      booking.email,
      booking.phone,
      booking.session?.title,
      booking.session?.coach_name,
      booking.session?.location_zone,
    ].some(value => String(value || '').toLowerCase().includes(search));
  });
}

export function summarizeAdminBookings(bookings) {
  const rows = bookings || [];
  return {
    total: rows.length,
    requested: rows.filter(row => row.status === 'requested').length,
    confirmed: rows.filter(row => row.status === 'confirmed').length,
    attendance: rows.filter(row => row.status === 'attended').length,
  };
}

export function bookingSelectionKey(booking) {
  const source = booking?.source === 'member' ? 'member' : 'enquiry';
  const id = String(booking?.id || '').trim();
  if (!id) throw new Error('A booking ID is required for selection.');
  return `${source}:${id}`;
}

export function selectedBookingKeys(current, bookings, selected) {
  const next = new Set(current || []);
  for (const booking of bookings || []) {
    const key = bookingSelectionKey(booking);
    if (selected) next.add(key);
    else next.delete(key);
  }
  return next;
}

export function bulkBookingStatusOptions(bookings) {
  const statuses = new Set((bookings || []).map(booking => booking.status));
  if (statuses.size !== 1) return [];
  const [status] = statuses;
  if (status === 'requested') return ['confirmed', 'waitlisted', 'declined'];
  if (status === 'waitlisted') return ['cancelled'];
  if (status === 'confirmed') return ['attended', 'no_show', 'cancelled'];
  return [];
}

/** Active places that still hold a reserved (or consumed-but-tracked) class credit. */
const CREDIT_HOLDING_STATUSES = new Set(['requested', 'confirmed', 'attended', 'no_show']);

export function bookingHoldsReservedCredit(booking) {
  return Boolean(booking?.credit_batch_id) && CREDIT_HOLDING_STATUSES.has(booking?.status);
}

export function bookingCsvRows(bookings) {
  return (bookings || []).map(booking => ({
    created_at: booking.createdAt || booking.created_at || '',
    source: booking.source === 'member' ? 'Member credit booking' : 'Enquiry form',
    status: booking.status || '',
    name: booking.full_name || '',
    email: booking.email || '',
    phone: booking.phone || '',
    class: booking.session?.title || '',
    class_start: booking.session?.start_time || '',
    coach: booking.session?.coach_name || '',
    location: booking.session?.location_zone || '',
    // Match desk / iOS Reserved badges: cancelled / waitlisted / declined must
    // not export as "Credit reserved" when a leftover FK remains after release.
    credit_reserved: bookingHoldsReservedCredit(booking) ? 'Yes' : 'No',
  }));
}
