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
