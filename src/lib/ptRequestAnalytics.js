export const PT_SESSION_TYPES = ['30-minute PT session', '45-minute PT session', '60-minute PT session', 'Intro assessment', 'Private coaching block'];
const PT_REQUEST_STATUSES = new Set(['requested', 'approved', 'declined', 'reschedule_requested', 'completed', 'cancelled']);
const PT_REQUEST_DAY_FILTERS = new Set(['30', '90', 'all']);

export function normalizePTRequestFilters(filters = {}, now = Date.now()) {
  const page = Number.parseInt(String(filters.page || 1), 10);
  const pageSize = Number.parseInt(String(filters.pageSize || 50), 10);
  if (!Number.isInteger(page) || page < 1) throw new Error('PT request page must be a positive number.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('PT request page size must be between 1 and 100.');
  const dayFilter = String(filters.days || '30');
  if (!PT_REQUEST_DAY_FILTERS.has(dayFilter)) throw new Error('Choose a valid PT request age filter.');
  const status = filters.status && filters.status !== 'all' ? String(filters.status) : null;
  if (status && !PT_REQUEST_STATUSES.has(status)) throw new Error('Choose a valid PT request status filter.');
  const days = dayFilter === 'all' ? null : Number(dayFilter);
  const search = String(filters.search || '').trim().replace(/[^\p{L}\p{N}\s@.'+_-]/gu, '').replace(/\s+/g, ' ').slice(0, 100);
  return {
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
    search,
    status,
    sessionType: filters.sessionType && filters.sessionType !== 'all' ? String(filters.sessionType).slice(0, 100) : null,
    cutoff: days && Number.isFinite(days) ? new Date(now - days * 86400000).toISOString() : null,
  };
}

export function ptRequestTimestamp(request) {
  const value = Date.parse(request?.created_at || '');
  return Number.isFinite(value) ? value : 0;
}

export function filterPTRequests(requests, filters = {}, now = Date.now()) {
  const search = String(filters.search || '').trim().toLowerCase();
  const days = filters.days === 'all' ? null : Number(filters.days || 30);
  const cutoff = days && Number.isFinite(days) ? now - days * 86400000 : null;

  return (requests || []).filter(request => {
    if (filters.status && filters.status !== 'all' && request.status !== filters.status) return false;
    if (filters.sessionType && filters.sessionType !== 'all' && request.requested_session_type !== filters.sessionType) return false;
    if (cutoff && ptRequestTimestamp(request) < cutoff) return false;
    if (!search) return true;

    return [
      request.full_name,
      request.email,
      request.phone,
      request.requested_session_type,
      request.preferred_day,
      request.preferred_time,
      request.training_goal,
      request.experience_level,
      request.admin_notes,
    ].some(value => String(value || '').toLowerCase().includes(search));
  });
}

export function summarizePTRequests(requests) {
  const rows = requests || [];
  return {
    total: rows.length,
    requested: rows.filter(row => row.status === 'requested').length,
    approved: rows.filter(row => row.status === 'approved').length,
    completed: rows.filter(row => row.status === 'completed').length,
  };
}

export function ptRequestCsvRows(requests) {
  return (requests || []).map(request => ({
    created_at: request.created_at || '',
    status: request.status || '',
    name: request.full_name || '',
    email: request.email || '',
    phone: request.phone || '',
    session_type: request.requested_session_type || '',
    preferred_day: request.preferred_day || '',
    preferred_time: request.preferred_time || '',
    training_goal: request.training_goal || '',
    experience_level: request.experience_level || '',
    notes: request.notes || '',
    admin_notes: request.admin_notes || '',
  }));
}

export function isPendingPTRequest(status) {
  return status === 'requested' || status === 'reschedule_requested';
}
