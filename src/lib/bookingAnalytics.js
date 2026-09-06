import { gymDateTimeLabel } from './gymTime.js';

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
      // Staff type a note into the box above the list expecting to find it.
      booking.admin_notes,
      booking.notes,
    ].some(value => String(value || '').toLowerCase().includes(search));
  });
}

/**
 * Requests older than the date filter are still unanswered requests. The queue
 * hid them by default while the nav badge went on counting them, so the owner
 * saw "7" on the badge, opened the queue, counted 3, and the four oldest people
 * were never contacted. This says how many the filter is holding back.
 */
export function hiddenBookingCount(bookings, filters = {}, now = Date.now()) {
  const all = filterAdminBookings(bookings, { ...filters, days: 'all' }, now);
  const shown = filterAdminBookings(bookings, filters, now);
  return Math.max(all.length - shown.length, 0);
}

export function pendingBookingCount(bookings) {
  return (bookings || []).filter(booking => booking.status === 'requested').length;
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

/**
 * Places held in one class, counting both doors into the room: member bookings
 * that have committed a credit, and confirmed public timetable sign-ups.
 *
 * `admin_daily_operations` computes this as `places_held`; the fallback is for
 * a database that has not taken the migration yet, and for the older shape
 * where the public side was simply absent.
 */
export function classPlacesHeld(operation) {
  if (operation?.places_held !== null && operation?.places_held !== undefined) {
    return Number(operation.places_held) || 0;
  }
  return (Number(operation?.requested_count) || 0)
    + (Number(operation?.confirmed_count) || 0)
    + (Number(operation?.public_confirmed_count) || 0);
}

const BOOKING_MODE_NOTE = {
  interest_only: 'interest only — confirming this does not give anyone a place',
  request_to_book: 'request to book',
  instant_book: 'sign-ups take a real spot',
};

/**
 * The one line a staff member needs before pressing Confirm: how full the class
 * is, and what its booking mode actually promises. Without it an interest-only
 * registration ("I might come along one day") was indistinguishable from a real
 * request, and Confirm burned a place either way.
 */
export function classCapacityLine(capacity) {
  if (!capacity) return '';
  const taken = Number(capacity.taken) || 0;
  const parts = [`${taken}${capacity.capacity ? ` / ${capacity.capacity}` : ''} in the class`];
  if (capacity.spotsLeft === 0) parts.push('full');
  else if (typeof capacity.spotsLeft === 'number') parts.push(`${capacity.spotsLeft} left`);
  if (Number(capacity.waiting) > 0) parts.push(`${capacity.waiting} on the waitlist`);
  const note = BOOKING_MODE_NOTE[capacity.bookingMode];
  if (note) parts.push(note);
  return parts.join(' · ');
}

/**
 * Identifies the row a status change is running against. Every action button in
 * the queue used to be disabled while any single update was in flight, so
 * working through a morning's requests was one blocking round-trip at a time.
 */
export function bookingActionKey(booking) {
  return `${booking?.source === 'member' ? 'member' : 'enquiry'}-${booking?.id || ''}`;
}

/**
 * Marking someone present frees their place in every count, so pressing it on a
 * class three days out quietly resells the room. Both the queue and a database
 * trigger refuse it until the class has actually started.
 */
export function classHasStarted(booking, now = Date.now()) {
  const start = Date.parse(booking?.session?.start_time || '');
  return Number.isFinite(start) && start <= now;
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
  if (status === 'requested') return ['confirmed', 'waitlisted', 'declined', 'cancelled'];
  // Moving a whole waitlist into a class that has just freed up is the single
  // most useful bulk action there is, and it was the one the list left out.
  if (status === 'waitlisted') return ['confirmed', 'declined', 'cancelled'];
  if (status === 'confirmed') return ['attended', 'no_show', 'cancelled'];
  // Roll-call mistakes and hasty declines are common; both can be undone.
  if (status === 'attended' || status === 'no_show') return ['confirmed'];
  if (status === 'declined' || status === 'cancelled') return ['requested'];
  return [];
}

/**
 * The export the owner takes to the floor. It used to drop exactly the
 * operational context — the person's own note ("first session, knee injury"),
 * their training level, and any staff note — and wrote raw UTC timestamps, so a
 * 5:30 am Brisbane class opened in Excel as 19:30 the previous day.
 */
export function bookingCsvRows(bookings) {
  return (bookings || []).map(booking => ({
    created_at: gymDateTimeLabel(booking.createdAt || booking.created_at),
    source: booking.source === 'member' ? 'Member credit booking' : 'Timetable class request',
    status: booking.status || '',
    name: booking.full_name || '',
    email: booking.email || '',
    phone: booking.phone || '',
    class: booking.session?.title || '',
    class_start: gymDateTimeLabel(booking.session?.start_time),
    coach: booking.session?.coach_name || '',
    location: booking.session?.location_zone || '',
    credit_reserved: booking.credit_batch_id ? 'Yes' : 'No',
    training_level: booking.training_level || '',
    their_note: booking.notes || '',
    staff_note: booking.admin_notes || '',
  }));
}
