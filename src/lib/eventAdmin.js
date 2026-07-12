const EVENT_CATEGORIES = new Set([
  'run', 'marathon', 'triathlon', 'ironman', 'ultra', 'trail', 'cycling',
  'fitness', 'hyrox', 'crossfit', 'functional', 'swim', 'spartan',
  'adventure', 'games', 'community', 'sport', 'xert', 'other',
]);

function optionalText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeDate(value, label) {
  const normalized = optionalText(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${label} must be a valid date.`);
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} must be a valid date.`);
  }
  return normalized;
}

function optionalWebURL(value) {
  const normalized = optionalText(value);
  if (!normalized) return null;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Website link must be a complete http:// or https:// address.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Website link must be a complete http:// or https:// address.');
  }
  return parsed.toString();
}

export function normalizeEventInput(form = {}) {
  const name = String(form.name || '').trim();
  if (!name) throw new Error('Event name is required.');
  if (name.length > 160) throw new Error('Event name must be 160 characters or fewer.');

  const category = String(form.category || 'other');
  if (!EVENT_CATEGORIES.has(category)) throw new Error('Choose a valid event category.');

  const eventDate = normalizeDate(form.event_date, 'Start date');
  const endDate = normalizeDate(form.end_date, 'End date');
  if (!eventDate && endDate) throw new Error('Choose a start date before adding an end date.');
  if (eventDate && endDate && endDate < eventDate) throw new Error('The end date cannot be before the start date.');

  const sortOrder = Number(form.sort_order ?? 0);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
    throw new Error('Sort order must be a whole number of 0 or greater.');
  }

  return {
    name,
    category,
    event_date: eventDate,
    end_date: endDate,
    location: optionalText(form.location),
    region: optionalText(form.region),
    url: optionalWebURL(form.url),
    published: Boolean(form.published),
    sort_order: sortOrder,
  };
}
