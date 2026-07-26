const SECTION_FIELDS = {
  hero: ['headline', 'subheading', 'supporting', 'photos'],
  booking: ['intro'],
  about: ['paragraphs'],
  contact: ['email', 'phone', 'address', 'instagram_handle', 'instagram_url', 'intro'],
  faq: ['items'],
};

const TEXT_LIMITS = {
  headline: [160, 'Headline'],
  subheading: [1000, 'Subheading'],
  supporting: [1000, 'Supporting line'],
  intro: [3000, 'Introduction'],
  email: [254, 'Email'],
  phone: [80, 'Phone'],
  address: [500, 'Address'],
  instagram_handle: [100, 'Instagram handle'],
};

function optionalText(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

function boundedText(value, maximum, label) {
  const text = optionalText(value);
  if (text && text.length > maximum) {
    throw new Error(`${label} must be ${maximum.toLocaleString('en-AU')} characters or fewer.`);
  }
  return text;
}

function safeWebUrl(value, { allowLocal = false } = {}) {
  const text = optionalText(value);
  if (!text) return undefined;
  if (text.length > 2048) throw new Error('Public media URLs must be 2,048 characters or fewer.');
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
  if (sectionKey === 'hero' && Array.isArray(data.photos) && data.photos.length > 12) {
    throw new Error('Hero photography is limited to 12 images.');
  }
  if (sectionKey === 'about' && Array.isArray(data.paragraphs) && data.paragraphs.length > 12) {
    throw new Error('The About page is limited to 12 paragraphs.');
  }
  if (sectionKey === 'faq' && Array.isArray(data.items) && data.items.length > 20) {
    throw new Error('The homepage is limited to 20 FAQ items.');
  }
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
        .map(value => boundedText(value, 4000, 'About paragraph')).filter(Boolean);
      if (paragraphs.length) clean.paragraphs = paragraphs;
      continue;
    }
    if (field === 'items') {
      const items = (Array.isArray(data.items) ? data.items : []).map(item => ({
        q: boundedText(item?.q, 300, 'FAQ question'),
        a: boundedText(item?.a, 3000, 'FAQ answer'),
      })).filter(item => item.q || item.a);
      const incomplete = items.find(item => !item.q || !item.a);
      if (incomplete) throw new Error('Every FAQ item needs both a question and an answer.');
      if (items.length) clean.items = items;
      continue;
    }

    const limit = TEXT_LIMITS[field];
    const value = limit ? boundedText(data[field], limit[0], limit[1]) : optionalText(data[field]);
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
