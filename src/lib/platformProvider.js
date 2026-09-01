export const PLATFORM_PROVIDERS = Object.freeze({
  NATIVE: 'native',
  FITBOX: 'fitbox',
  UNAVAILABLE: 'unavailable',
});

const NATIVE_CAPABILITIES = Object.freeze({
  canCreateProspect: false,
  canReadMemberProfile: false,
  canUpdateMemberProfile: false,
  canViewProviderTimetable: true,
  canOpenProviderPortal: false,
  canBookInternally: true,
  canCancelInternally: true,
  canViewMirroredBookings: true,
  canViewAttendance: true,
  canPurchaseInternalPack: true,
  timetableMode: 'native',
});

const FITBOX_HANDOFF_CAPABILITIES = Object.freeze({
  canCreateProspect: true,
  canReadMemberProfile: true,
  // The Zapier action currently emits an unsolicited default gender and a
  // misspelled `subrub` key, so real-member updates remain disabled.
  canUpdateMemberProfile: false,
  canViewProviderTimetable: true,
  canOpenProviderPortal: true,
  canBookInternally: false,
  canCancelInternally: false,
  canViewMirroredBookings: false,
  canViewAttendance: false,
  canPurchaseInternalPack: false,
  timetableMode: 'external',
});

const BLOCKED_CAPABILITIES = Object.freeze({
  canCreateProspect: false,
  canReadMemberProfile: false,
  canUpdateMemberProfile: false,
  canViewProviderTimetable: false,
  canOpenProviderPortal: false,
  canBookInternally: false,
  canCancelInternally: false,
  canViewMirroredBookings: false,
  canViewAttendance: false,
  canPurchaseInternalPack: false,
  timetableMode: 'unavailable',
});

export function normalizeProviderUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
  return url.toString();
}

function resolution({ provider, configured, blockedReason = null, portalUrl = null, capabilities }) {
  return Object.freeze({
    membership: provider,
    booking: provider,
    commerce: provider,
    provider,
    configured,
    blocked: Boolean(blockedReason),
    blockedReason,
    portalUrl,
    capabilities,
  });
}

export function resolvePlatformProvider(settings) {
  // Missing settings are not evidence that native operations are selected.
  // All mutations remain closed until the singleton settings row loads.
  if (!settings || typeof settings !== 'object') {
    return resolution({
      provider: PLATFORM_PROVIDERS.UNAVAILABLE,
      configured: false,
      blockedReason: 'Live booking-provider settings could not be verified. Refresh before booking or purchasing.',
      capabilities: BLOCKED_CAPABILITIES,
    });
  }

  if (settings.fitbox_enabled !== true) {
    return resolution({
      provider: PLATFORM_PROVIDERS.NATIVE,
      configured: true,
      capabilities: NATIVE_CAPABILITIES,
    });
  }

  const portalUrl = normalizeProviderUrl(settings.fitbox_booking_url);
  if (!portalUrl) {
    return resolution({
      provider: PLATFORM_PROVIDERS.FITBOX,
      configured: false,
      blockedReason: 'FitBox is selected, but its secure member-portal link is missing or invalid. Internal booking and checkout remain paused.',
      capabilities: BLOCKED_CAPABILITIES,
    });
  }

  return resolution({
    provider: PLATFORM_PROVIDERS.FITBOX,
    configured: true,
    portalUrl,
    capabilities: FITBOX_HANDOFF_CAPABILITIES,
  });
}

export function providerOperationsHealth(settings) {
  const provider = resolvePlatformProvider(settings);
  if (provider.provider === PLATFORM_PROVIDERS.UNAVAILABLE || provider.blocked) {
    return {
      status: 'error',
      detail: provider.blockedReason,
      action: 'Open Platform Settings, repair the booking-provider configuration, then refresh Operations Health.',
    };
  }
  if (provider.provider === PLATFORM_PROVIDERS.FITBOX) {
    return {
      status: 'attention',
      detail: 'FitBox handoff is configured. Native XERT booking and Stripe packs are paused; booking mirroring and FitBox attendance remain unavailable.',
      action: 'Keep the integration in handoff mode until FitBox booking IDs, event ordering and attendance are verified.',
    };
  }
  return {
    status: 'ok',
    detail: 'The native XERT booking, credits and Stripe provider is selected.',
  };
}
