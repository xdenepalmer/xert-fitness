export const CREDIT_EXPIRY_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeExpiringCredits(batches, now = new Date(), windowDays = CREDIT_EXPIRY_WINDOW_DAYS) {
  const nowMs = new Date(now).getTime();
  const safeWindowDays = Math.max(1, Number(windowDays) || CREDIT_EXPIRY_WINDOW_DAYS);
  const cutoffMs = nowMs + safeWindowDays * DAY_MS;

  const expiring = (batches || [])
    .map(batch => ({ ...batch, expiresAt: batch?.expires_at ? new Date(batch.expires_at) : null }))
    .filter(batch => {
      const expiryMs = batch.expiresAt?.getTime();
      return Number(batch.remaining) > 0
        && Number.isFinite(expiryMs)
        && expiryMs > nowMs
        && expiryMs <= cutoffMs;
    })
    .sort((left, right) => left.expiresAt - right.expiresAt);

  if (expiring.length === 0) return null;

  const expiresAt = expiring[0].expiresAt;
  return {
    credits: expiring.reduce((sum, batch) => sum + Number(batch.remaining), 0),
    expiresAt,
    daysRemaining: Math.max(1, Math.ceil((expiresAt.getTime() - nowMs) / DAY_MS)),
  };
}
