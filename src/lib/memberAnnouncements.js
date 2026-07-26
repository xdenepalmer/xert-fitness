export const ANNOUNCEMENT_TONES = Object.freeze(['info', 'action', 'urgent']);

export function announcementState(announcement, now = new Date()) {
  if (announcement?.archived_at) return 'archived';
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

// Publish API returns 200 even when APNs throws after the row is saved; the
// failure is carried on push.failed / push.reason. Never describe that as
// "no devices registered" — operators would stop retrying a real outage.
export function describeAnnouncementPublishPush(push) {
  if (!push || typeof push !== 'object') {
    return 'Members can see it now. Push delivery status was not returned.';
  }
  if (push.configured === false) {
    return 'Members can see it now. APNs delivery needs the Vercel push secrets.';
  }
  const attempted = Number(push.attempted) || 0;
  const delivered = Number(push.delivered) || 0;
  const failed = Number(push.failed) || 0;
  const reason = String(push.reason || '').trim();
  if (attempted > 0) {
    const deliveredLabel = `${delivered} device notification${delivered === 1 ? '' : 's'} delivered`;
    if (!failed) return `${deliveredLabel}.`;
    return `${deliveredLabel}; ${failed} failed${reason ? ` (${reason})` : ''}.`;
  }
  if (failed > 0) {
    return reason
      ? `Members can see it now, but Apple push delivery failed (${reason}). Publish again to retry devices that still need a delivery.`
      : 'Members can see it now, but Apple push delivery failed. Publish again to retry devices that still need a delivery.';
  }
  return 'Members can see it now. No enabled iOS devices were registered.';
}

// Private / targeted notices use the same push.failed contract. Never describe a
// real APNs outage as "no active device" — operators must see the failure reason.
export function describeTargetedMemberNoticePush(push) {
  if (!push || typeof push !== 'object') {
    return 'It is available in the member app. Push delivery status was not returned.';
  }
  if (push.configured === false) {
    return 'It is available in the member app. APNs push is not configured.';
  }
  const attempted = Number(push.attempted) || 0;
  const delivered = Number(push.delivered) || 0;
  const failed = Number(push.failed) || 0;
  const reason = String(push.reason || '').trim();
  if (delivered > 0 && !failed) {
    return 'It is available in the member app and the push notification was delivered.';
  }
  if (delivered > 0 && failed > 0) {
    return `It is available in the member app. ${delivered} device notification${delivered === 1 ? '' : 's'} delivered; ${failed} failed${reason ? ` (${reason})` : ''}.`;
  }
  if (failed > 0) {
    return reason
      ? `It is available in the member app, but Apple push delivery failed (${reason}).`
      : 'It is available in the member app, but Apple push delivery failed.';
  }
  if (attempted > 0) {
    return 'It is available in the member app. Apple push was attempted but did not reach a registered device.';
  }
  return 'It is available in the member app. No active device received a push.';
}

export function describeClassCancellationPush(push) {
  if (!push || typeof push !== 'object') {
    return 'Push delivery status was not returned. Use the contact fallback below.';
  }
  if (push.configured === false) {
    return 'The notice is available in XERT, but Apple push delivery is not configured. Use the contact fallback below.';
  }
  const attempted = Number(push.attempted) || 0;
  const delivered = Number(push.delivered) || 0;
  const failed = Number(push.failed) || 0;
  const reason = String(push.reason || '').trim();
  if (delivered > 0 && !failed) {
    return `${delivered} Apple push ${delivered === 1 ? 'notification was' : 'notifications were'} delivered.`;
  }
  if (delivered > 0 && failed > 0) {
    return `${delivered} Apple push ${delivered === 1 ? 'notification was' : 'notifications were'} delivered; ${failed} failed${reason ? ` (${reason})` : ''}. Use the contact fallback below for anyone still missing the alert.`;
  }
  if (failed > 0) {
    return reason
      ? `Apple push delivery failed (${reason}). Use the contact fallback below.`
      : 'Apple push delivery failed. Use the contact fallback below.';
  }
  if (attempted > 0) {
    return 'Apple push delivery was attempted but did not reach a registered device. Use the contact fallback below.';
  }
  return 'No enabled Apple device was registered. The notice remains available when the member opens XERT.';
}
