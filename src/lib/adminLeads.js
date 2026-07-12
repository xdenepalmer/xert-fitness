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
