export const ANNOUNCEMENT_TONES = Object.freeze(['info', 'action', 'urgent']);

export function announcementState(announcement, now = new Date()) {
  const publishedAt = announcement?.published_at ? new Date(announcement.published_at) : null;
  const expiresAt = announcement?.expires_at ? new Date(announcement.expires_at) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return 'draft';
  if (publishedAt > now) return 'scheduled';
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= now) return 'expired';
  return 'live';
}

export function normalizeAnnouncementInput(input) {
  const title = String(input?.title || '').trim();
  const body = String(input?.body || '').trim();
  const tone = ANNOUNCEMENT_TONES.includes(input?.tone) ? input.tone : 'info';
  const expiresAt = input?.expires_at ? new Date(input.expires_at) : null;
  const ctaLabel = String(input?.cta_label || '').trim();
  const ctaUrl = String(input?.cta_url || '').trim();
  const action = ctaLabel && ctaUrl ? announcementAction({ cta_label: ctaLabel, cta_url: ctaUrl }) : null;

  if (!title || title.length > 120) throw new Error('Title must be between 1 and 120 characters.');
  if (!body || body.length > 2000) throw new Error('Message must be between 1 and 2,000 characters.');
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error('Expiry date is invalid.');
  if (Boolean(ctaLabel) !== Boolean(ctaUrl)) throw new Error('Action label and destination must be provided together.');
  if (ctaLabel.length > 40) throw new Error('Action label must be 40 characters or fewer.');
  if (ctaUrl.length > 500 || (ctaUrl && !action)) {
    throw new Error('Action destination must be an internal path or a secure HTTPS URL.');
  }

  return {
    title,
    body,
    tone,
    expires_at: expiresAt?.toISOString() || null,
    cta_label: action?.label || null,
    cta_url: action?.href || null,
  };
}

export function announcementAction(announcement) {
  const label = String(announcement?.cta_label || '').trim();
  const href = String(announcement?.cta_url || '').trim();
  if (!label || !href || label.length > 40 || href.length > 500) return null;
  if (href.startsWith('/') && !href.startsWith('//')) {
    return { label, href, external: false };
  }
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return { label, href: url.toString(), external: true };
  } catch {
    return null;
  }
}
