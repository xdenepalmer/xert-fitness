function normalizeDate(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error('Choose a valid target launch date.');
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Choose a valid target launch date.');
  }
  return normalized;
}

export function normalizeLaunchSettings(settings = {}) {
  const announcement = String(settings.announcement_banner_text || '').trim();
  if (settings.announcement_banner_enabled && !announcement) {
    throw new Error('Add announcement text before enabling the banner.');
  }

  return {
    countdown_enabled: Boolean(settings.countdown_enabled),
    bookings_enabled: Boolean(settings.bookings_enabled),
    announcement_banner_enabled: Boolean(settings.announcement_banner_enabled),
    target_launch_date: normalizeDate(settings.target_launch_date),
    announcement_banner_text: announcement || null,
  };
}
