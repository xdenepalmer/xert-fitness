import { collectAdminPages } from './adminPagination.js';

export function normalizeLeadSearch(value) {
  return String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s@.'+_-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

export function normalizeLeadPage(page = 1, pageSize = 50) {
  const normalizedPage = Number.parseInt(String(page), 10);
  const normalizedSize = Number.parseInt(String(pageSize), 10);
  if (!Number.isInteger(normalizedPage) || normalizedPage < 1) throw new Error('Lead page must be a positive number.');
  if (!Number.isInteger(normalizedSize) || normalizedSize < 1 || normalizedSize > 100) {
    throw new Error('Lead page size must be between 1 and 100.');
  }
  const from = (normalizedPage - 1) * normalizedSize;
  return { page: normalizedPage, pageSize: normalizedSize, from, to: from + normalizedSize - 1 };
}

export { collectAdminPages };
export const collectLeadPages = collectAdminPages;

export function selectedLeadIds(current, id, checked) {
  const next = new Set(current);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

export const LEAD_STATUSES = {
  member_interest: ['new', 'contacted', 'warm', 'hot', 'foundation_offer_sent', 'booked_trial', 'joined', 'not_suitable', 'archived'],
  trainer_interest: ['new', 'reviewing', 'contacted', 'interview', 'shortlisted', 'not_suitable', 'hired', 'archived'],
  partner_interest: ['new', 'reviewing', 'contacted', 'meeting', 'approved', 'not_suitable', 'archived'],
};

const COMMON_ADMIN_LEAD_FIELDS = [
  'id', 'full_name', 'email', 'phone', 'status', 'admin_notes',
  'utm_source', 'utm_medium', 'utm_campaign', 'created_at',
];

export const ADMIN_LEAD_FIELDS = Object.freeze({
  member_interest: Object.freeze([
    ...COMMON_ADMIN_LEAD_FIELDS,
    'suburb_town', 'current_training_level', 'main_training_goals', 'preferred_training_times',
  ]),
  trainer_interest: Object.freeze([
    ...COMMON_ADMIN_LEAD_FIELDS,
    'qualifications', 'short_intro',
  ]),
  partner_interest: Object.freeze([
    ...COMMON_ADMIN_LEAD_FIELDS,
    'business_name', 'profession', 'short_intro',
  ]),
});

const COMMON_LEAD_EXPORT_COLUMNS = [
  { key: 'created_at', label: 'Submitted' },
  { key: 'status', label: 'Status' },
  { key: 'full_name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
];

export const LEAD_EXPORT_COLUMNS = Object.freeze({
  member_interest: Object.freeze([
    ...COMMON_LEAD_EXPORT_COLUMNS,
    { key: 'suburb_town', label: 'Suburb / town' },
    { key: 'utm_source', label: 'Campaign source' },
    { key: 'utm_medium', label: 'Campaign medium' },
    { key: 'utm_campaign', label: 'Campaign name' },
  ]),
  trainer_interest: Object.freeze([
    ...COMMON_LEAD_EXPORT_COLUMNS,
    { key: 'qualifications', label: 'Qualifications' },
  ]),
  partner_interest: Object.freeze([
    ...COMMON_LEAD_EXPORT_COLUMNS,
    { key: 'business_name', label: 'Business' },
    { key: 'profession', label: 'Profession' },
  ]),
});

export function adminLeadSelect(table) {
  const fields = ADMIN_LEAD_FIELDS[table];
  if (!fields) throw new Error('Unsupported lead type.');
  return fields.join(', ');
}

export function leadExportColumns(table) {
  const columns = LEAD_EXPORT_COLUMNS[table];
  if (!columns) throw new Error('Unsupported lead type.');
  return columns;
}

export function leadExportRows(table, rows = []) {
  const keys = leadExportColumns(table).map(column => column.key);
  return rows.map(row => Object.fromEntries(keys.map(key => [key, row?.[key] ?? ''])));
}

export function validateLeadMutation(table, status, ids = []) {
  const statuses = LEAD_STATUSES[table];
  if (!statuses) throw new Error('Unsupported lead type.');
  if (!statuses.includes(status)) throw new Error(`Invalid ${table.replace('_interest', '')} lead status.`);
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error('Lead selection contains an invalid ID.');
  }
  return { table, status, ids: [...new Set(ids.map(id => id.trim()))] };
}

export function normalizeLeadUpdate(table, updates) {
  const mutation = validateLeadMutation(table, updates?.status);
  const adminNotes = String(updates?.admin_notes || '').trim();
  if (adminNotes.length > 5000) throw new Error('Admin notes must be 5,000 characters or fewer.');
  return {
    table: mutation.table,
    updates: { status: mutation.status, admin_notes: adminNotes || null },
  };
}

export function leadMutationError(error, fallback = 'Lead update failed.') {
  const message = String(error?.message || '');
  if (['42883', 'PGRST202'].includes(error?.code)
      || /admin_update_lead(?:_statuses)?.*(?:not found|schema cache|does not exist)/i.test(message)) {
    return new Error('Lead workflow controls are not installed. Apply the lead pipeline audit migration.');
  }
  if (/LEAD_SELECTION_STALE/i.test(message)) {
    return new Error('One or more selected leads changed. Refresh the list and try again.');
  }
  if (/LEAD_NOT_FOUND/i.test(message)) {
    return new Error('This lead no longer exists. Refresh the list.');
  }
  if (/ADMIN_REQUIRED/i.test(message)) {
    return new Error('Your administrator session has expired. Sign in again.');
  }
  return new Error(message || fallback);
}
