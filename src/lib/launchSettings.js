/**
 * Fallback opening date, used only when no admin settings row supplies one.
 * The live value is `admin_settings.target_launch_date`, editable in the admin
 * panel under Platform Settings -> Target launch date. Keep this in one place:
 * it was previously duplicated across four files, so moving the date meant
 * finding all four.
 */
export const DEFAULT_TARGET_LAUNCH_DATE = '2026-09-14';

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

export function sessionPackPaymentsEnabled(settings) {
  return settings?.bookings_enabled === true && settings?.payments_enabled === true;
}

// Public pricing is hidden ("Coming soon") unless the flag is explicitly false,
// so a missing column, an unsaved row or a failed settings fetch all fail safe
// to hiding amounts rather than leaking prices the business has not published.
export function pricesComingSoon(settings) {
  return settings?.prices_coming_soon !== false;
}

function normalizeFitboxUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter a valid Fitbox member portal link, starting with https://.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Enter a valid Fitbox member portal link, starting with https://.');
  }
  return url.toString();
}

// Bookings and payments hand off to the external Fitbox member portal only
// when the switch is on AND a usable https link is saved. A broken or missing
// link fails safe to the internal behaviour instead of dead public buttons.
export function fitboxHandoff(settings = {}) {
  if (settings?.fitbox_enabled !== true) return { active: false, url: null };
  let url = null;
  try {
    url = normalizeFitboxUrl(settings.fitbox_booking_url);
  } catch {
    return { active: false, url: null };
  }
  if (!url) return { active: false, url: null };
  return { active: true, url };
}

export function normalizeLaunchSettings(settings = {}) {
  const announcement = String(settings.announcement_banner_text || '').trim();
  if (settings.announcement_banner_enabled && !announcement) {
    throw new Error('Add announcement text before enabling the banner.');
  }
  const fitboxUrl = normalizeFitboxUrl(settings.fitbox_booking_url);
  if (settings.fitbox_enabled && !fitboxUrl) {
    throw new Error('Add the Fitbox member portal link before enabling Fitbox bookings.');
  }

  return {
    countdown_enabled: Boolean(settings.countdown_enabled),
    bookings_enabled: Boolean(settings.bookings_enabled),
    payments_enabled: Boolean(settings.payments_enabled),
    prices_coming_soon: settings.prices_coming_soon !== false,
    announcement_banner_enabled: Boolean(settings.announcement_banner_enabled),
    target_launch_date: normalizeDate(settings.target_launch_date),
    announcement_banner_text: announcement || null,
    fitbox_enabled: Boolean(settings.fitbox_enabled),
    fitbox_booking_url: fitboxUrl,
  };
}

export function launchSettingsChanged(current = {}, saved = {}) {
  const fields = [
    'countdown_enabled',
    'bookings_enabled',
    'payments_enabled',
    'prices_coming_soon',
    'announcement_banner_enabled',
    'target_launch_date',
    'announcement_banner_text',
    'fitbox_enabled',
    'fitbox_booking_url',
  ];
  return fields.some(field => String(current[field] ?? '') !== String(saved[field] ?? ''));
}

/**
 * Decides whether the public soft-launch countdown should render.
 *
 * A countdown reaching zero says the target date arrived. It does NOT say the
 * gym opened — that is a business fact the timer cannot know. The countdown
 * previously flipped to a hardcoded "We're Open — XERT Fitness is now open in
 * Kingaroy." the moment the date rolled past, which the public read as fact.
 * Staff had no way to retract it: the copy was not editable anywhere, and the
 * only control was a toggle that hid the entire section.
 *
 * An expired countdown is therefore hidden. Announcing an opening is a
 * deliberate act and belongs to the announcement banner
 * (`announcement_banner_text` / `announcement_banner_enabled`), which is
 * admin-authored and can be switched off again.
 */
export function countdownVisibility(targetDate, enabled, now = new Date()) {
  if (!enabled) return 'hidden';
  const target = new Date(targetDate).getTime();
  if (!Number.isFinite(target)) return 'hidden';
  return target - now.getTime() <= 0 ? 'hidden' : 'counting';
}
