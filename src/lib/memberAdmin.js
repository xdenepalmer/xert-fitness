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
