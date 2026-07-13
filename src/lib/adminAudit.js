const AUDIT_TYPES = new Set(['role', 'credit', 'request', 'announcement', 'lead']);

function clean(value) {
  return String(value || '').trim();
}

function identity(profile, fallbackId) {
  if (profile?.full_name) return profile.full_name;
  if (profile?.email) return profile.email;
  return fallbackId ? `User ${String(fallbackId).slice(0, 8)}` : 'Deleted user';
}

export function buildAdminAuditEvents({ roleChanges = [], creditGrants = [], requestChanges = [], announcementEvents = [], leadChanges = [], profiles = [] } = {}) {
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const roleEvents = roleChanges.map(change => ({
    id: `role:${change.id}`,
    sourceId: change.id,
    type: 'role',
    at: change.created_at,
    actorId: change.changed_by,
    actor: identity(profileById.get(change.changed_by), change.changed_by),
    subjectId: change.target_user_id,
    subject: identity(profileById.get(change.target_user_id), change.target_user_id),
    summary: `Role changed from ${clean(change.previous_role) || 'unknown'} to ${clean(change.new_role) || 'unknown'}`,
    detail: `${clean(change.previous_role) || 'unknown'} -> ${clean(change.new_role) || 'unknown'}`,
    sessions: null,
  }));
  const creditEvents = creditGrants.map(grant => ({
    id: `credit:${grant.id}`,
    sourceId: grant.id,
    type: 'credit',
    at: grant.created_at,
    actorId: grant.granted_by,
    actor: identity(profileById.get(grant.granted_by), grant.granted_by),
    subjectId: grant.user_id,
    subject: identity(profileById.get(grant.user_id), grant.user_id),
    summary: `${Number(grant.sessions) || 0} class credit${Number(grant.sessions) === 1 ? '' : 's'} granted`,
    detail: clean(grant.note) || 'No reason recorded',
    sessions: Number(grant.sessions) || 0,
  }));
  const requestEvents = requestChanges.map(change => {
    const requestLabel = change.request_type === 'class_booking' ? 'Booking request' : 'PT request';
    const statusChanged = clean(change.previous_status) !== clean(change.new_status);
    const notesChanged = clean(change.previous_admin_notes) !== clean(change.new_admin_notes);
    return {
      id: `request:${change.id}`,
      sourceId: change.id,
      type: 'request',
      at: change.created_at,
      actorId: change.changed_by,
      actor: identity(profileById.get(change.changed_by), change.changed_by),
      subjectId: change.request_id,
      subject: clean(change.subject_label) || clean(change.subject_email) || `${requestLabel} ${clean(change.request_id).slice(0, 8)}`,
      summary: statusChanged
        ? `${requestLabel} changed from ${clean(change.previous_status) || 'unknown'} to ${clean(change.new_status) || 'unknown'}`
        : `${requestLabel} notes updated`,
      detail: [
        clean(change.subject_email),
        notesChanged ? 'Admin notes updated' : '',
      ].filter(Boolean).join(' · ') || 'Operational request update',
      sessions: null,
    };
  });
  const noticeEvents = announcementEvents.map(event => ({
    id: `announcement:${event.id}`,
    sourceId: event.id,
    type: 'announcement',
    at: event.created_at,
    actorId: event.actor_id,
    actor: identity(profileById.get(event.actor_id), event.actor_id),
    subjectId: event.announcement_id,
    subject: clean(event.announcement_title) || `Member notice ${clean(event.announcement_id).slice(0, 8)}`,
    summary: `Member notice ${clean(event.action) || 'updated'}`,
    detail: event.action === 'archived'
      ? 'Removed from member visibility; history preserved'
      : event.action === 'restored'
        ? 'Restored as an unpublished draft'
        : 'Member announcement lifecycle change',
    sessions: null,
  }));
  const leadEvents = leadChanges.map(change => {
    const leadType = clean(change.lead_type) || 'unknown';
    const leadLabel = `${leadType.charAt(0).toUpperCase()}${leadType.slice(1)} lead`;
    const statusChanged = clean(change.previous_status) !== clean(change.new_status);
    const notesChanged = clean(change.previous_admin_notes) !== clean(change.new_admin_notes);
    return {
      id: `lead:${change.id}`,
      sourceId: change.id,
      type: 'lead',
      at: change.created_at,
      actorId: change.changed_by,
      actor: identity(profileById.get(change.changed_by), change.changed_by),
      subjectId: change.lead_id,
      subject: clean(change.subject_label) || clean(change.subject_email) || `${leadLabel} ${clean(change.lead_id).slice(0, 8)}`,
      summary: statusChanged
        ? `${leadLabel} changed from ${clean(change.previous_status) || 'unknown'} to ${clean(change.new_status) || 'unknown'}`
        : `${leadLabel} notes updated`,
      detail: [
        clean(change.subject_email),
        notesChanged ? 'Internal notes updated' : '',
      ].filter(Boolean).join(' · ') || 'Lead pipeline update',
      sessions: null,
    };
  });

  return [...roleEvents, ...creditEvents, ...requestEvents, ...noticeEvents, ...leadEvents].sort((left, right) => {
    const timeDifference = new Date(right.at).getTime() - new Date(left.at).getTime();
    return timeDifference || right.id.localeCompare(left.id);
  });
}

export function filterAdminAuditEvents(events, filters = {}, now = new Date()) {
  const type = AUDIT_TYPES.has(filters.type) ? filters.type : 'all';
  const days = filters.days === 'all' ? null : Math.max(1, Number.parseInt(String(filters.days || 30), 10) || 30);
  const cutoff = days === null ? null : now.getTime() - days * 24 * 60 * 60 * 1000;
  const query = clean(filters.search).toLocaleLowerCase('en-AU');

  return (Array.isArray(events) ? events : []).filter(event => {
    if (type !== 'all' && event.type !== type) return false;
    const eventTime = new Date(event.at).getTime();
    if (!Number.isFinite(eventTime) || (cutoff !== null && eventTime < cutoff)) return false;
    if (!query) return true;
    return [event.actor, event.subject, event.summary, event.detail, event.actorId, event.subjectId]
      .some(value => clean(value).toLocaleLowerCase('en-AU').includes(query));
  });
}

export function summarizeAdminAuditEvents(events) {
  const rows = Array.isArray(events) ? events : [];
  return {
    total: rows.length,
    roleChanges: rows.filter(event => event.type === 'role').length,
    creditGrants: rows.filter(event => event.type === 'credit').length,
    requestChanges: rows.filter(event => event.type === 'request').length,
    announcementChanges: rows.filter(event => event.type === 'announcement').length,
    leadChanges: rows.filter(event => event.type === 'lead').length,
    creditsGranted: rows.reduce((total, event) => total + (event.type === 'credit' ? event.sessions || 0 : 0), 0),
    activeAdmins: new Set(rows.map(event => event.actorId).filter(Boolean)).size,
  };
}

export function adminAuditCsvRows(events) {
  return (Array.isArray(events) ? events : []).map(event => ({
    timestamp: event.at,
    action: event.type === 'role'
      ? 'Role change'
      : event.type === 'credit'
        ? 'Credit grant'
        : event.type === 'request'
          ? 'Request change'
          : event.type === 'announcement'
            ? 'Announcement change'
            : 'Lead change',
    administrator: event.actor,
    administrator_id: event.actorId || '',
    member: event.subject,
    member_id: event.subjectId || '',
    summary: event.summary,
    detail: event.detail,
  }));
}
