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

export function productStripeReadiness(products = []) {
  const activeProducts = products.filter(product => Boolean(product?.active));
  const missingProducts = activeProducts.filter(product => !/^price_[A-Za-z0-9]+$/.test(String(product?.stripe_price_id || '').trim()));

  return {
    activeCount: activeProducts.length,
    linkedCount: activeProducts.length - missingProducts.length,
    missingCount: missingProducts.length,
    missingSlugs: missingProducts.map(product => String(product.slug || product.name || 'unnamed-pack')),
    readyForLive: activeProducts.length > 0 && missingProducts.length === 0,
  };
}

export function normalizeProductAdminInput(form) {
  const name = String(form.name || '').trim();
  if (!name) throw new Error('A pack name is required.');
  if (name.length > 120) throw new Error('Pack name must be 120 characters or fewer.');

  const description = String(form.description || '').trim();
  if (description.length > 2_000) throw new Error('Description must be 2,000 characters or fewer.');

  const price = String(form.price_dollars ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(price)) {
    throw new Error('Price must be a positive amount with no more than 2 decimal places.');
  }
  const priceCents = Math.round(Number(price) * 100);
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0 || priceCents > 2_147_483_647) {
    throw new Error('Price must be between $0.01 and $21,474,836.47.');
  }

  const sessionsCount = Number(form.sessions_count);
  if (!Number.isSafeInteger(sessionsCount) || sessionsCount < 1 || sessionsCount > 1_000) {
    throw new Error('Sessions must be a whole number between 1 and 1,000.');
  }
  const validityDays = Number(form.validity_days);
  if (!Number.isSafeInteger(validityDays) || validityDays < 1 || validityDays > 3_650) {
    throw new Error('Validity must be a whole number between 1 and 3,650 days.');
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
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
    throw new Error('Display order must be a whole number between 0 and 10,000.');
  }

  return {
    name,
    description: description || null,
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
  return {
    slug,
    ...normalizeProductAdminInput({ ...form, active: false, stripe_price_id: '' }),
    active: false,
    stripe_price_id: null,
  };
}

export function productStripeTransitionError(current, next) {
  const currentStripePrice = String(current?.stripe_price_id || '').trim();
  const nextStripePrice = String(next?.stripe_price_id || '').trim();
  const amountChanged = Number(current?.price_cents) !== Number(next?.price_cents);
  const currencyChanged = String(current?.currency || '').toLowerCase()
    !== String(next?.currency || '').toLowerCase();
  const sessionsChanged = Number(current?.sessions_count) !== Number(next?.sessions_count);
  const validityChanged = Number(current?.validity_days) !== Number(next?.validity_days);

  if (currentStripePrice && currentStripePrice === nextStripePrice
    && (amountChanged || currencyChanged || sessionsChanged || validityChanged)) {
    return 'Replace or clear the Stripe Price ID before changing this pack\'s price, currency, sessions or validity.';
  }
  return '';
}
