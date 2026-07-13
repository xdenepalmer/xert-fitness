export function creditGrantValidationError({ sessions, validityDays, note }) {
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 100) {
    return 'Credits must be a whole number between 1 and 100.';
  }
  if (!Number.isInteger(validityDays) || validityDays < 0 || validityDays > 3650) {
    return 'Validity must be 0 to 3650 whole days.';
  }
  const normalizedNote = String(note || '').trim();
  if (normalizedNote.length < 3 || normalizedNote.length > 500) {
    return 'Add a reason between 3 and 500 characters.';
  }
  return null;
}

export function filterMembers(members, { search = '', role = 'all', credit = 'all' } = {}) {
  const query = search.trim().toLowerCase();
  return (members || []).filter(member => {
    if (role !== 'all' && member.role !== role) return false;
    if (credit === 'available' && Number(member.credits_remaining) <= 0) return false;
    if (credit === 'none' && Number(member.credits_remaining) > 0) return false;
    if (!query) return true;
    return [member.full_name, member.email, member.phone].some(value => String(value || '').toLowerCase().includes(query));
  });
}

export function normalizeMemberDirectoryQuery({
  search = '', role = 'all', credit = 'all', page = 1, pageSize = 50, memberId = null
} = {}) {
  const normalizedSearch = String(search || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const normalizedRole = ['all', 'member', 'admin'].includes(role) ? role : 'all';
  const normalizedCredit = ['all', 'available', 'none'].includes(credit) ? credit : 'all';
  const normalizedPage = Math.max(1, Number.parseInt(String(page), 10) || 1);
  const normalizedPageSize = Math.max(1, Math.min(100, Number.parseInt(String(pageSize), 10) || 50));
  const normalizedMemberId = String(memberId || '').trim() || null;
  if (normalizedMemberId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedMemberId)) {
    throw new Error('A valid member account is required.');
  }

  return {
    search: normalizedSearch,
    role: normalizedRole,
    credit: normalizedCredit,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
    memberId: normalizedMemberId
  };
}

export function normalizeRoleChange(userId, role) {
  const normalizedId = String(userId || '').trim();
  if (!normalizedId) throw new Error('A member account is required.');
  if (!['member', 'admin'].includes(role)) throw new Error('Role must be member or admin.');
  return { userId: normalizedId, role };
}

const MEMBER_NOTE_CATEGORIES = new Set(['general', 'coaching', 'follow_up', 'billing']);

export function normalizeMemberNote(userId, category, body) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedCategory = String(category || '').trim().toLowerCase();
  const normalizedBody = String(body || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedUserId)) {
    throw new Error('A valid member account is required.');
  }
  if (!MEMBER_NOTE_CATEGORIES.has(normalizedCategory)) {
    throw new Error('Choose a valid member note category.');
  }
  if (normalizedBody.length < 3 || normalizedBody.length > 1000) {
    throw new Error('Member notes must be between 3 and 1,000 characters.');
  }
  return { userId: normalizedUserId, category: normalizedCategory, body: normalizedBody };
}

export function normalizeMemberNoteArchive(noteId, archived) {
  const normalizedNoteId = String(noteId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedNoteId)) {
    throw new Error('A valid member note is required.');
  }
  return { noteId: normalizedNoteId, archived: Boolean(archived) };
}
