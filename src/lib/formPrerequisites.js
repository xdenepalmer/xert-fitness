// ─── One form leading into another ──────────────────────────────────────────
// The club's poster QR code points at the terms agreement, but nobody may
// train before the Pre-Exercise Questionnaire is answered. A form can name a
// prerequisite: opening it sends a first-time visitor to that form, and the
// original opens again the moment it is submitted.
//
// The "already completed" marker lives in sessionStorage, so it belongs to one
// person in one sitting: a shared phone or a new browser session starts again,
// and a marker older than the window below is ignored.

export const FORM_COMPLETION_PREFIX = 'xert-form-complete:';
export const FORM_COMPLETION_TTL_MS = 12 * 60 * 60 * 1000;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function safeStorage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // Private browsing and locked-down devices throw on access.
  }
}

/** The best name, email and phone we can carry from one form to the next. */
export function completionIdentity(questions, answers = {}, contact = {}) {
  const present = value => value !== undefined && value !== null && String(value).trim() !== '';
  const firstAnswer = type => {
    const match = (questions || []).find(question => question?.type === type
      && (type === 'name_fields'
        ? present(answers[question.id]?.first) || present(answers[question.id]?.last)
        : present(answers[question.id])));
    return match ? answers[match.id] : null;
  };
  const names = firstAnswer('name_fields') || {};
  const fromFields = [names.first, names.last].filter(present).join(' ').trim();
  const text = value => (present(value) ? String(value).trim() : '');
  return {
    name: text(contact.name) || fromFields,
    email: text(contact.email).toLowerCase() || text(firstAnswer('email')).toLowerCase(),
    phone: text(contact.phone) || text(firstAnswer('phone')),
  };
}

export function writeFormCompletion(slug, identity, { storage = safeStorage(), now = Date.now() } = {}) {
  if (!storage || !SLUG_PATTERN.test(String(slug || ''))) return false;
  try {
    storage.setItem(`${FORM_COMPLETION_PREFIX}${slug}`, JSON.stringify({ ...identity, at: now }));
    return true;
  } catch {
    return false; // A full or blocked store must never break the submission.
  }
}

export function readFormCompletion(slug, { storage = safeStorage(), now = Date.now() } = {}) {
  if (!storage || !SLUG_PATTERN.test(String(slug || ''))) return null;
  try {
    const raw = storage.getItem(`${FORM_COMPLETION_PREFIX}${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const at = Number(parsed?.at);
    if (!Number.isFinite(at) || now - at > FORM_COMPLETION_TTL_MS || now < at) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The slug a finished form should hand over to, taken from ?next= */
export function nextFormSlug(search) {
  const raw = new URLSearchParams(search || '').get('next') || '';
  return SLUG_PATTERN.test(raw) ? raw : null;
}

export function formPath(slug, nextSlug = null) {
  const next = SLUG_PATTERN.test(String(nextSlug || '')) ? `?next=${encodeURIComponent(nextSlug)}` : '';
  return `/forms/${encodeURIComponent(slug)}${next}`;
}

/**
 * Decides where a visitor should be sent when they open a gated form.
 * Returns null when they may stay.
 */
export function prerequisiteRedirect(form, { storage = safeStorage(), now = Date.now() } = {}) {
  const prerequisite = String(form?.prerequisite_slug || '');
  if (!SLUG_PATTERN.test(prerequisite) || prerequisite === form?.slug) return null;
  if (readFormCompletion(prerequisite, { storage, now })) return null;
  return formPath(prerequisite, form.slug);
}
