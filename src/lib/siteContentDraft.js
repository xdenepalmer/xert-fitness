export const SITE_CONTENT_DRAFT_PREFIX = 'xert:admin:site-content-draft:';
export const UNSAVED_ADMIN_CHANGES_MESSAGE = 'You have unsaved admin changes. Leave without saving them?';

function draftKey(sectionKey) {
  return `${SITE_CONTENT_DRAFT_PREFIX}${String(sectionKey || '').trim()}`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readSiteContentDraft(storage, sectionKey) {
  if (!storage || !sectionKey) return null;
  try {
    const parsed = JSON.parse(storage.getItem(draftKey(sectionKey)) || 'null');
    if (parsed?.version !== 1 || !isRecord(parsed.data) || !Number.isFinite(parsed.updatedAt)) return null;
    return { data: parsed.data, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

export function writeSiteContentDraft(storage, sectionKey, data, updatedAt = Date.now()) {
  if (!storage || !sectionKey || !isRecord(data)) return false;
  try {
    storage.setItem(draftKey(sectionKey), JSON.stringify({ version: 1, data, updatedAt }));
    return true;
  } catch {
    return false;
  }
}

export function clearSiteContentDraft(storage, sectionKey) {
  if (!storage || !sectionKey) return false;
  try {
    storage.removeItem(draftKey(sectionKey));
    return true;
  } catch {
    return false;
  }
}
