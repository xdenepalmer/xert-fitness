const COACH_CATEGORIES = new Set(['coach', 'nutritionist', 'massage', 'physio']);

function optionalText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function optionalWebURL(value, label) {
  const normalized = optionalText(value);
  if (!normalized) return null;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a complete http:// or https:// address.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must be a complete http:// or https:// address.`);
  }
  return parsed.toString();
}

function optionalImageURL(value) {
  const normalized = optionalText(value);
  if (!normalized || normalized.startsWith('/')) return normalized;
  return optionalWebURL(normalized, 'Photo URL');
}

export function normalizeCoachInput(form = {}) {
  const name = String(form.name || '').trim();
  if (!name) throw new Error('Name is required.');
  if (name.length > 120) throw new Error('Name must be 120 characters or fewer.');

  const category = String(form.category || 'coach');
  if (!COACH_CATEGORIES.has(category)) throw new Error('Choose a valid team category.');

  const sortOrder = Number(form.sort_order ?? 0);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
    throw new Error('Sort order must be a whole number of 0 or greater.');
  }

  return {
    name,
    role: optionalText(form.role),
    category,
    bio: optionalText(form.bio),
    experience: optionalText(form.experience),
    currently_training_for: optionalText(form.currently_training_for),
    photo_url: optionalImageURL(form.photo_url),
    social_url: optionalWebURL(form.social_url, 'Social link'),
    sort_order: sortOrder,
    published: Boolean(form.published),
  };
}
