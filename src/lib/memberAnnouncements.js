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

  if (!title || title.length > 120) throw new Error('Title must be between 1 and 120 characters.');
  if (!body || body.length > 2000) throw new Error('Message must be between 1 and 2,000 characters.');
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error('Expiry date is invalid.');

  return {
    title,
    body,
    tone,
    expires_at: expiresAt?.toISOString() || null,
  };
}
