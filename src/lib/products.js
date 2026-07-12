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
