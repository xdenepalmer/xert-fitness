export const ADMIN_BADGE_REFRESH_INTERVAL_MS = 60_000;
export const ADMIN_OVERVIEW_REFRESH_INTERVAL_MS = 5 * 60_000;
export const ADMIN_VISIBILITY_REFRESH_MIN_AGE_MS = 15_000;

export function shouldRefreshAdminData({ visibilityState, lastRefreshAt, now = Date.now(), minimumAgeMs = ADMIN_VISIBILITY_REFRESH_MIN_AGE_MS }) {
  if (visibilityState !== 'visible') return false;
  if (!Number.isFinite(lastRefreshAt)) return true;
  return now - lastRefreshAt >= minimumAgeMs;
}
