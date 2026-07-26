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
  return settings?.payments_enabled === true;
}

// Public pricing is hidden ("Coming soon") unless the flag is explicitly false,
// so a missing column, an unsaved row or a failed settings fetch all fail safe
// to hiding amounts rather than leaking prices the business has not published.
export function pricesComingSoon(settings) {
  return settings?.prices_coming_soon !== false;
}

export function normalizeLaunchSettings(settings = {}) {
  const announcement = String(settings.announcement_banner_text || '').trim();
  if (settings.announcement_banner_enabled && !announcement) {
    throw new Error('Add announcement text before enabling the banner.');
  }

  return {
    countdown_enabled: Boolean(settings.countdown_enabled),
    bookings_enabled: Boolean(settings.bookings_enabled),
    payments_enabled: Boolean(settings.payments_enabled),
    prices_coming_soon: settings.prices_coming_soon !== false,
    announcement_banner_enabled: Boolean(settings.announcement_banner_enabled),
    target_launch_date: normalizeDate(settings.target_launch_date),
    announcement_banner_text: announcement || null,
  };
}

export const LIVE_LAUNCH_SETTING_FIELDS = Object.freeze([
  'countdown_enabled',
  'bookings_enabled',
  'payments_enabled',
  'prices_coming_soon',
  'announcement_banner_enabled',
  'target_launch_date',
  'announcement_banner_text',
]);

export function launchSettingsChanged(current = {}, saved = {}) {
  return LIVE_LAUNCH_SETTING_FIELDS.some(
    field => String(current[field] ?? '') !== String(saved[field] ?? ''),
  );
}

// While pack checkout is live, admin_settings rejects any other column change
// (PAYMENT_SETTINGS_CHANGE_REQUIRES_PAUSE). Pausing payments in the same save
// is the supported escape hatch; every other edit must pause first.
export function livePaymentSettingsRequirePause(current = {}, saved = {}) {
  if (saved?.payments_enabled !== true || current?.payments_enabled !== true) return false;
  return LIVE_LAUNCH_SETTING_FIELDS
    .filter(field => field !== 'payments_enabled')
    .some(field => String(current[field] ?? '') !== String(saved[field] ?? ''));
}

export function paymentSettingsPauseRequiredMessage() {
  return 'Pause session pack payments, save that change, then update the other soft-launch controls. Checkout must stay frozen while live platform settings change.';
}

// Pack checkout without class booking leaves members able to pay while Ops
// Health marks the launch switches unsafe. Pause payments first, or enable
// bookings in the same save before opening checkout.
export function paymentActivationRequiresBookings(settings = {}) {
  return settings?.payments_enabled === true && settings?.bookings_enabled !== true;
}

export function paymentActivationRequiresBookingsMessage() {
  return 'Enable Bookings before opening session pack checkout. Members need class booking available when pack purchases go live.';
}
