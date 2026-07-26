const STORAGE_KEY = 'xert:pending-web-checkout:v1';
const MAXIMUM_AGE_MS = 24 * 60 * 60 * 1000;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKOUT_SESSION_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
const CHECKOUT_SESSION_MAX_LENGTH = 255;

function isCheckoutSessionID(value) {
  return typeof value === 'string'
    && value.length <= CHECKOUT_SESSION_MAX_LENGTH
    && CHECKOUT_SESSION_PATTERN.test(value);
}

export const WEB_CHECKOUT_RETRY_DELAYS_MS = [0, 2_000, 3_000, 5_000];

export function savePendingWebCheckout(
  { userID, checkoutSessionID },
  storage = globalThis.localStorage,
  now = Date.now(),
) {
  const normalizedUserID = String(userID || '').trim().toLowerCase();
  const normalizedSessionID = String(checkoutSessionID || '').trim();
  if (!USER_ID_PATTERN.test(normalizedUserID) || !isCheckoutSessionID(normalizedSessionID)) {
    throw new Error('Checkout returned an invalid confirmation identity. No redirect was opened.');
  }
  const pending = { userID: normalizedUserID, checkoutSessionID: normalizedSessionID, startedAt: now };
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Private browsing storage limits must not invalidate an authenticated checkout.
  }
  return pending;
}

export function loadPendingWebCheckout(
  userID,
  storage = globalThis.localStorage,
  now = Date.now(),
) {
  try {
    const pending = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    const matchesUser = String(pending?.userID || '').toLowerCase() === String(userID || '').trim().toLowerCase();
    const validAge = Number.isFinite(pending?.startedAt)
      && pending.startedAt <= now
      && now - pending.startedAt <= MAXIMUM_AGE_MS;
    if (matchesUser && validAge && isCheckoutSessionID(pending?.checkoutSessionID)) {
      return pending;
    }
  } catch {
    // Invalid storage is cleared below.
  }
  clearPendingWebCheckout(storage);
  return null;
}

export function clearPendingWebCheckout(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // No cleanup is possible when storage is unavailable.
  }
}

export function pendingWebCheckoutForReturn({
  userID,
  checkoutSessionID,
  storedPending = null,
  now = Date.now(),
}) {
  const normalizedUserID = String(userID || '').trim().toLowerCase();
  const normalizedSessionID = String(checkoutSessionID || '').trim();
  const hasReturnSession = normalizedSessionID.length > 0;
  const storedAge = now - Number(storedPending?.startedAt);
  const hasValidStoredPending = (
    storedPending?.userID === normalizedUserID
    && isCheckoutSessionID(storedPending?.checkoutSessionID)
    && Number.isFinite(storedAge)
    && storedAge >= 0
    && storedAge <= MAXIMUM_AGE_MS
  );

  // A return URL with a different Stripe session must not settle against a
  // leftover local handoff — fail closed like iOS PendingCheckoutStore.resolve.
  if (hasValidStoredPending) {
    if (!hasReturnSession) return storedPending;
    if (!isCheckoutSessionID(normalizedSessionID)) return null;
    return storedPending.checkoutSessionID === normalizedSessionID ? storedPending : null;
  }

  if (
    !USER_ID_PATTERN.test(normalizedUserID)
    || !isCheckoutSessionID(normalizedSessionID)
  ) return null;

  return {
    userID: normalizedUserID,
    checkoutSessionID: normalizedSessionID,
    startedAt: now,
  };
}

export function webCheckoutSettlement(pending, orders) {
  if (!pending) return 'pending';
  const order = (orders || []).find(candidate => (
    candidate?.stripe_checkout_session_id === pending.checkoutSessionID
  ));
  const status = String(order?.status || '').toLowerCase();
  if (status === 'paid') return 'confirmed';
  if (status === 'refunded') return 'refunded';
  if (['failed', 'cancelled', 'expired'].includes(status)) return 'failed';
  return 'pending';
}
