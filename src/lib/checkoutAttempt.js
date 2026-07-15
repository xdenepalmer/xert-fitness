const CHECKOUT_ATTEMPT_TTL_MS = 20 * 60 * 1000;
const CHECKOUT_ATTEMPT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function checkoutAttemptStorageKey(productSlug) {
  return `xert:checkout-attempt:${String(productSlug)}`;
}

export function getOrCreateCheckoutAttemptID(
  productSlug,
  storage = globalThis.sessionStorage,
  now = Date.now(),
  createID = () => globalThis.crypto.randomUUID()
) {
  const storageKey = checkoutAttemptStorageKey(productSlug);
  try {
    const stored = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (
      CHECKOUT_ATTEMPT_PATTERN.test(stored?.id || '')
      && Number.isFinite(stored?.createdAt)
      && stored.createdAt <= now
      && now - stored.createdAt < CHECKOUT_ATTEMPT_TTL_MS
    ) return stored.id.toLowerCase();
  } catch {
    // A corrupt or unavailable session store should not block a purchase.
  }

  const attemptID = createID().toLowerCase();
  if (!CHECKOUT_ATTEMPT_PATTERN.test(attemptID)) {
    throw new Error('Could not create a secure checkout attempt.');
  }
  try {
    storage?.setItem(storageKey, JSON.stringify({ id: attemptID, createdAt: now }));
  } catch {
    // The request remains valid even when private browsing blocks storage.
  }
  return attemptID;
}

export function clearCheckoutAttemptID(productSlug, storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(checkoutAttemptStorageKey(productSlug));
  } catch {
    // No cleanup is needed when storage is unavailable.
  }
}
