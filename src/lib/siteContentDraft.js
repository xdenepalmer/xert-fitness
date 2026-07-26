export const SITE_CONTENT_DRAFT_PREFIX = 'xert:admin:site-content-draft:';
export const UNSAVED_ADMIN_CHANGES_MESSAGE = 'You have unsaved admin changes. Leave without saving them?';

function draftKey(userId, sectionKey) {
  return `${SITE_CONTENT_DRAFT_PREFIX}${String(userId).trim()}:${String(sectionKey || '').trim()}`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBaseUpdatedAt(value) {
  if (value == null || value === '') return null;
  return String(value);
}

export function isSiteContentDraftCurrent(draft, baseUpdatedAt) {
  if (!draft) return false;
  // Legacy drafts omit baseUpdatedAt entirely — refuse restore over live copy.
  if (draft.baseUpdatedAt === undefined) return false;
  return normalizeBaseUpdatedAt(draft.baseUpdatedAt) === normalizeBaseUpdatedAt(baseUpdatedAt);
}

export function readSiteContentDraft(storage, userId, sectionKey) {
  if (!storage || !userId || !sectionKey) return null;
  try {
    const parsed = JSON.parse(storage.getItem(draftKey(userId, sectionKey)) || 'null');
    if (parsed?.version !== 1 || !isRecord(parsed.data) || !Number.isFinite(parsed.updatedAt)) return null;
    return {
      data: parsed.data,
      updatedAt: parsed.updatedAt,
      // Older drafts omitted the server revision they were based on; treat that
      // as unknown so callers can refuse to restore over a newer live section.
      baseUpdatedAt: Object.prototype.hasOwnProperty.call(parsed, 'baseUpdatedAt')
        ? normalizeBaseUpdatedAt(parsed.baseUpdatedAt)
        : undefined,
    };
  } catch {
    return null;
  }
}

export function writeSiteContentDraft(storage, userId, sectionKey, data, options = {}) {
  if (!storage || !userId || !sectionKey || !isRecord(data)) return false;
  const updatedAt = Number.isFinite(options?.updatedAt) ? options.updatedAt : Date.now();
  const baseUpdatedAt = normalizeBaseUpdatedAt(options?.baseUpdatedAt);
  try {
    storage.setItem(draftKey(userId, sectionKey), JSON.stringify({
      version: 1,
      data,
      updatedAt,
      baseUpdatedAt,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSiteContentDraft(storage, userId, sectionKey) {
  if (!storage || !userId || !sectionKey) return false;
  try {
    storage.removeItem(draftKey(userId, sectionKey));
    return true;
  } catch {
    return false;
  }
}

// Sweeps every admin's CMS draft out of storage regardless of user. Called on
// sign-out so a shared front-desk browser never surfaces one admin's unsaved
// draft to the next signed-in admin.
export function clearSiteContentDrafts(storage) {
  if (!storage) return false;
  try {
    const staleKeys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(SITE_CONTENT_DRAFT_PREFIX)) staleKeys.push(key);
    }
    staleKeys.forEach(key => storage.removeItem(key));
    return true;
  } catch {
    return false;
  }
}
