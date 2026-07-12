export function normalizeLeadSearch(value) {
  return String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s@.'+_-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

export function selectedLeadIds(current, id, checked) {
  const next = new Set(current);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}
