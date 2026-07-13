const PACK_CTAS = {
  single: 'Book A Session',
  'starter-4': 'Start Your Training Block',
  'performance-10': 'Commit To Your Training',
};

export function formatPackPrice(priceCents, currency = 'aud') {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: String(currency || 'aud').toUpperCase(),
    minimumFractionDigits: 2,
  }).format((Number(priceCents) || 0) / 100);
}

export function formatPackValidity(validityDays) {
  const days = Number(validityDays);
  if (!Number.isFinite(days) || days <= 0) return 'No expiry';
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `Use within ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  return `Use within ${days} days`;
}

export function packCta(slug) {
  return PACK_CTAS[slug] || 'View Pack';
}

export function normalizeProductAdminInput(form) {
  const name = String(form.name || '').trim();
  if (!name) throw new Error('A pack name is required.');

  const price = String(form.price_dollars ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(price)) {
    throw new Error('Price must be a positive amount with no more than 2 decimal places.');
  }
  const priceCents = Math.round(Number(price) * 100);
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) {
    throw new Error('Price must be greater than $0.00.');
  }

  const sessionsCount = Number(form.sessions_count);
  if (!Number.isSafeInteger(sessionsCount) || sessionsCount <= 0) {
    throw new Error('Sessions must be a whole number of at least 1.');
  }
  const validityDays = Number(form.validity_days);
  if (!Number.isSafeInteger(validityDays) || validityDays <= 0) {
    throw new Error('Validity must be a whole number of at least 1 day.');
  }

  const stripePriceId = String(form.stripe_price_id || '').trim();
  if (stripePriceId && !/^price_[A-Za-z0-9]+$/.test(stripePriceId)) {
    throw new Error('Stripe Price ID must begin with price_ and contain only letters and numbers.');
  }

  const currency = String(form.currency || 'aud').trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error('Currency must be a 3-letter code such as AUD.');
  }
  const sortOrder = Number(form.sort_order ?? 0);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
    throw new Error('Display order must be a whole number of 0 or greater.');
  }

  return {
    name,
    description: String(form.description || '').trim() || null,
    price_cents: priceCents,
    sessions_count: sessionsCount,
    validity_days: validityDays,
    currency,
    sort_order: sortOrder,
    featured: Boolean(form.featured),
    active: Boolean(form.active),
    stripe_price_id: stripePriceId || null,
  };
}

export function normalizeProductCreateInput(form) {
  const slug = String(form.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new Error('Slug must use lowercase letters, numbers and single hyphens.');
  }
  return { slug, ...normalizeProductAdminInput(form) };
}

export function productStripeTransitionError(current, next) {
  const currentStripePrice = String(current?.stripe_price_id || '').trim();
  const nextStripePrice = String(next?.stripe_price_id || '').trim();
  const amountChanged = Number(current?.price_cents) !== Number(next?.price_cents);
  const currencyChanged = String(current?.currency || '').toLowerCase()
    !== String(next?.currency || '').toLowerCase();

  if (currentStripePrice && currentStripePrice === nextStripePrice && (amountChanged || currencyChanged)) {
    return 'Replace or clear the Stripe Price ID before changing this pack\'s price or currency.';
  }
  return '';
}
