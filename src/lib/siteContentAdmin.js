const SECTION_FIELDS = {
  hero: ['headline', 'subheading', 'supporting', 'photos'],
  booking: ['intro'],
  about: ['paragraphs'],
  contact: ['email', 'phone', 'address', 'instagram_handle', 'instagram_url', 'intro'],
  faq: ['items'],
};

function optionalText(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

function safeWebUrl(value, { allowLocal = false } = {}) {
  const text = optionalText(value);
  if (!text) return undefined;
  if (allowLocal && text.startsWith('/') && !text.startsWith('//')) return text;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Invalid URL: ${text}`);
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`URL must use HTTPS or HTTP: ${text}`);
  return url.toString();
}

export function normalizeSiteContent(sectionKey, data) {
  const fields = SECTION_FIELDS[sectionKey];
  if (!fields) throw new Error('Unknown site content section.');
  const clean = {};

  for (const field of fields) {
    if (field === 'photos') {
      const photos = (Array.isArray(data.photos) ? data.photos : [])
        .map(url => safeWebUrl(url, { allowLocal: true }))
        .filter(Boolean);
      if (photos.length) clean.photos = photos;
      continue;
    }
    if (field === 'paragraphs') {
      const paragraphs = (Array.isArray(data.paragraphs) ? data.paragraphs : [])
        .map(optionalText).filter(Boolean);
      if (paragraphs.length) clean.paragraphs = paragraphs;
      continue;
    }
    if (field === 'items') {
      const items = (Array.isArray(data.items) ? data.items : []).map(item => ({
        q: optionalText(item?.q),
        a: optionalText(item?.a),
      })).filter(item => item.q || item.a);
      const incomplete = items.find(item => !item.q || !item.a);
      if (incomplete) throw new Error('Every FAQ item needs both a question and an answer.');
      if (items.length) clean.items = items;
      continue;
    }

    const value = optionalText(data[field]);
    if (value) clean[field] = value;
  }

  if (sectionKey === 'contact') {
    if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
      throw new Error('Enter a valid public contact email.');
    }
    if (clean.instagram_url) clean.instagram_url = safeWebUrl(clean.instagram_url);
  }
  return clean;
}
