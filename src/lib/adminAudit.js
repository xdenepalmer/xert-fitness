const AUDIT_TYPES = new Set(['role', 'credit']);

function clean(value) {
  return String(value || '').trim();
}

function identity(profile, fallbackId) {
  if (profile?.full_name) return profile.full_name;
  if (profile?.email) return profile.email;
  return fallbackId ? `User ${String(fallbackId).slice(0, 8)}` : 'Deleted user';
}

export function buildAdminAuditEvents({ roleChanges = [], creditGrants = [], profiles = [] } = {}) {
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

  return [...roleEvents, ...creditEvents].sort((left, right) => {
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
    creditsGranted: rows.reduce((total, event) => total + (event.type === 'credit' ? event.sessions || 0 : 0), 0),
    activeAdmins: new Set(rows.map(event => event.actorId).filter(Boolean)).size,
  };
}

export function adminAuditCsvRows(events) {
  return (Array.isArray(events) ? events : []).map(event => ({
    timestamp: event.at,
    action: event.type === 'role' ? 'Role change' : 'Credit grant',
    administrator: event.actor,
    administrator_id: event.actorId || '',
    member: event.subject,
    member_id: event.subjectId || '',
    summary: event.summary,
    detail: event.detail,
  }));
}
