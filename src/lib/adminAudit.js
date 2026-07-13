const AUDIT_TYPES = new Set(['role', 'credit', 'request', 'announcement', 'lead', 'schedule', 'content', 'booking']);
const AUDIT_ACTION_LABELS = Object.freeze({
  role: 'Role change',
  credit: 'Credit grant',
  request: 'Request change',
  announcement: 'Announcement change',
  lead: 'Lead change',
  schedule: 'Schedule change',
  content: 'Content change',
  booking: 'Booking change',
});

function clean(value) {
  return String(value || '').trim();
}

function identity(profile, fallbackId) {
  if (profile?.full_name) return profile.full_name;
  if (profile?.email) return profile.email;
  return fallbackId ? `User ${String(fallbackId).slice(0, 8)}` : 'Deleted user';
}

export function adminAuditRangeStart(days, now = new Date()) {
  if (days === 'all') return null;
  const parsedDays = Number.parseInt(String(days || 30), 10);
  const boundedDays = Math.max(1, Math.min(Number.isFinite(parsedDays) ? parsedDays : 30, 3650));
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeNow = Number.isFinite(nowTime) ? nowTime : Date.now();
  return new Date(safeNow - boundedDays * 24 * 60 * 60 * 1000).toISOString();
}

function valuesDiffer(left, right) {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
}

function displayFieldName(key) {
  return clean(key).replaceAll('_', ' ');
}

function contentChangedFields(previous, next) {
  const ignored = new Set(['id', 'key', 'created_at', 'updated_at']);
  const fields = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changed = [];
  for (const key of fields) {
    if (ignored.has(key) || !valuesDiffer(previous[key], next[key])) continue;
    if (key === 'data' && previous.data && next.data && typeof previous.data === 'object' && typeof next.data === 'object') {
      const contentKeys = new Set([...Object.keys(previous.data), ...Object.keys(next.data)]);
      for (const contentKey of contentKeys) {
        if (valuesDiffer(previous.data[contentKey], next.data[contentKey])) changed.push(displayFieldName(contentKey));
      }
    } else {
      changed.push(displayFieldName(key));
    }
  }
  return [...new Set(changed)];
}

export function buildAdminAuditEvents({ roleChanges = [], creditGrants = [], requestChanges = [], announcementEvents = [], leadChanges = [], scheduleChanges = [], contentChanges = [], bookingChanges = [], profiles = [] } = {}) {
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
  const scheduleEvents = scheduleChanges.map(change => {
    const previous = change.previous_snapshot || {};
    const next = change.new_snapshot || {};
    const action = clean(change.action) || 'updated';
    const resourceLabel = change.resource_type === 'class_session'
      ? 'Class session'
      : change.resource_type === 'availability_block'
        ? 'Availability block'
        : 'Blackout period';
    const statusChanged = clean(previous.status) !== clean(next.status);
    const changedFields = [
      ['title', 'title'],
      ['class_type', 'class type'],
      ['start_time', 'start time'],
      ['end_time', 'end time'],
      ['coach_name', 'coach'],
      ['capacity', 'capacity'],
      ['status', 'status'],
      ['public_visible', 'public visibility'],
      ['booking_mode', 'booking mode'],
      ['location', 'location'],
      ['intensity', 'intensity'],
      ['type', 'type'],
      ['is_bookable', 'bookability'],
      ['affects', 'scope'],
      ['reason', 'reason'],
      ['notes', 'notes'],
    ].filter(([key]) => valuesDiffer(previous[key], next[key])).map(([, label]) => label);
    return {
      id: `schedule:${change.id}`,
      sourceId: change.id,
      type: 'schedule',
      at: change.created_at,
      actorId: change.changed_by,
      actor: identity(profileById.get(change.changed_by), change.changed_by),
      subjectId: change.resource_id,
      subject: clean(change.subject_label) || `${resourceLabel} ${clean(change.resource_id).slice(0, 8)}`,
      summary: `${resourceLabel} ${action}`,
      detail: ['created', 'deleted'].includes(action)
        ? `${resourceLabel} ${action}`
        : statusChanged
          ? `Status ${clean(previous.status) || 'unknown'} -> ${clean(next.status) || 'unknown'}`
          : changedFields.length > 0
            ? `Changed ${changedFields.join(', ')}`
            : `${resourceLabel} ${action}`,
      sessions: null,
    };
  });
  const contentEvents = contentChanges.map(change => {
    const previous = change.previous_snapshot || {};
    const next = change.new_snapshot || {};
    const action = clean(change.action) || 'updated';
    const resourceLabel = change.resource_type === 'site_content'
      ? 'Site content'
      : change.resource_type === 'coach'
        ? 'Coach profile'
        : change.resource_type === 'event'
          ? 'Calendar event'
          : change.resource_type === 'product'
            ? 'Session pack'
            : 'Launch settings';
    const changedFields = contentChangedFields(previous, next);
    const visibleFields = changedFields.slice(0, 6);
    const remaining = changedFields.length - visibleFields.length;
    return {
      id: `content:${change.id}`,
      sourceId: change.id,
      type: 'content',
      at: change.created_at,
      actorId: change.changed_by,
      actor: identity(profileById.get(change.changed_by), change.changed_by),
      subjectId: change.resource_id,
      subject: clean(change.subject_label) || `${resourceLabel} ${clean(change.resource_id).slice(0, 8)}`,
      summary: `${resourceLabel} ${action}`,
      detail: ['created', 'deleted'].includes(action)
        ? `${resourceLabel} ${action}`
        : visibleFields.length > 0
          ? `Changed ${visibleFields.join(', ')}${remaining > 0 ? `, +${remaining} more` : ''}`
          : `${resourceLabel} ${action}`,
      sessions: null,
    };
  });
  const bookingEvents = bookingChanges.map(change => {
    const previous = change.previous_snapshot || {};
    const next = change.new_snapshot || {};
    const action = clean(change.action) || 'updated';
    const actionLabel = {
      booked: 'Booking created',
      waitlisted: 'Booking waitlisted',
      promoted: 'Waitlist place promoted',
      status_changed: 'Booking status changed',
      cancelled: 'Booking cancelled',
      attendance_recorded: 'Attendance recorded',
      credit_changed: 'Booking credit changed',
      deleted: 'Booking deleted',
      updated: 'Booking updated',
    }[action] || 'Booking updated';
    const statusChanged = valuesDiffer(previous.status, next.status);
    const creditChanged = valuesDiffer(previous.credit_batch_id, next.credit_batch_id);
    const details = [clean(change.class_label) || 'Class session'];
    if (statusChanged) details.push(`${clean(previous.status) || 'new'} -> ${clean(next.status) || 'deleted'}`);
    if (creditChanged) {
      details.push(!previous.credit_batch_id
        ? 'Credit linked'
        : !next.credit_batch_id
          ? 'Credit link cleared'
          : 'Credit link changed');
    }
    return {
      id: `booking:${change.id}`,
      sourceId: change.id,
      type: 'booking',
      at: change.created_at,
      actorId: change.changed_by,
      actor: change.actor_role === 'system'
        ? 'System'
        : identity(profileById.get(change.changed_by), change.changed_by),
      subjectId: change.member_id,
      subject: identity(profileById.get(change.member_id), change.member_id),
      summary: actionLabel,
      detail: details.join(' · '),
      sessions: null,
    };
  });

  return [...roleEvents, ...creditEvents, ...requestEvents, ...noticeEvents, ...leadEvents, ...scheduleEvents, ...contentEvents, ...bookingEvents].sort((left, right) => {
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
    scheduleChanges: rows.filter(event => event.type === 'schedule').length,
    contentChanges: rows.filter(event => event.type === 'content').length,
    bookingChanges: rows.filter(event => event.type === 'booking').length,
    creditsGranted: rows.reduce((total, event) => total + (event.type === 'credit' ? event.sessions || 0 : 0), 0),
    activeAdmins: new Set(rows.map(event => event.actorId).filter(Boolean)).size,
  };
}

export function adminAuditCsvRows(events) {
  return (Array.isArray(events) ? events : []).map(event => ({
    timestamp: event.at,
    action: AUDIT_ACTION_LABELS[event.type] || 'Admin change',
    administrator: event.actor,
    administrator_id: event.actorId || '',
    member: event.subject,
    member_id: event.subjectId || '',
    summary: event.summary,
    detail: event.detail,
  }));
}
