/**
 * Map GoTrue / Supabase Auth failures into owner-facing AdminLogin copy.
 * Rate-limit responses keep status/code when signIn preserves them; message
 * matching covers stripped Error wrappers and GoTrue's prose variants.
 */
export const ADMIN_SIGN_IN_RATE_LIMIT_COOLDOWN_MS = 60_000;

export function isAdminSignInRateLimited(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return status === 429
    || /over_request_rate_limit|over_email_send_rate_limit|request_rate_limit/i.test(code)
    || /rate limit|too many requests|for security purposes/i.test(message);
}

export function describeAdminSignInError(error) {
  if (isAdminSignInRateLimited(error)) {
    return {
      message: 'Too many sign-in attempts. Wait about a minute, then try again.',
      cooldownMs: ADMIN_SIGN_IN_RATE_LIMIT_COOLDOWN_MS,
    };
  }
  return {
    message: String(error?.message || '').trim() || 'Sign in failed. Check your email and password.',
    cooldownMs: 0,
  };
}
