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
    credit_reserved: booking.credit_batch_id ? 'Yes' : 'No',
    admin_notes: booking.admin_notes || '',
  }));
}
