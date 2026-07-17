import {
  validateCanonicalServiceURL,
  XERT_SUPABASE_HOST,
  XERT_VERCEL_HOST,
} from './publicRuntimeConfig.js';

export const XERT_PAYMENT_CONTRACT_HEADER = 'X-Xert-Payment-Contract';
export const XERT_PAYMENT_CONTRACT_VERSION = 'stripe-launch-2026-07-17';

export function stripeModeForSecret(secret = '') {
  const value = String(secret).trim();
  if (/^(sk|rk)_live_/.test(value)) return 'live';
  if (/^(sk|rk)_test_/.test(value)) return 'test';
  return 'unknown';
}

export function inspectCommerceRuntimeEnvironment(environment = {}, options = {}) {
  const {
    requireStripeSecret = true,
    requireWebhookSecret = false,
    requireAppBaseURL = false,
  } = options;
  const invalid = [];
  const serviceRoleKey = String(environment.SUPABASE_SERVICE_ROLE_KEY || '');
  const stripeSecretKey = String(environment.STRIPE_SECRET_KEY || '');
  const publicSupabaseKeys = new Set([
    environment.SUPABASE_ANON_KEY,
    environment.VITE_SUPABASE_ANON_KEY,
  ].filter(Boolean).map(String));

  try {
    validateCanonicalServiceURL(
      environment.SUPABASE_URL || environment.VITE_SUPABASE_URL,
      'SUPABASE_URL',
      XERT_SUPABASE_HOST,
    );
  } catch {
    invalid.push('SUPABASE_URL');
  }

  if (
    !serviceRoleKey
    || serviceRoleKey !== serviceRoleKey.trim()
    || /\s/.test(serviceRoleKey)
    || /^sb_publishable_/i.test(serviceRoleKey)
    || publicSupabaseKeys.has(serviceRoleKey)
  ) {
    invalid.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (requireStripeSecret) {
    if (
      stripeSecretKey !== stripeSecretKey.trim()
      || /\s/.test(stripeSecretKey)
      || stripeModeForSecret(stripeSecretKey) === 'unknown'
    ) {
      invalid.push('STRIPE_SECRET_KEY');
    }
  }

  if (requireWebhookSecret) {
    const webhookSecret = String(environment.STRIPE_WEBHOOK_SECRET || '');
    if (
      webhookSecret !== webhookSecret.trim()
      || /\s/.test(webhookSecret)
      || !/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret)
    ) {
      invalid.push('STRIPE_WEBHOOK_SECRET');
    }
  }

  if (requireAppBaseURL) {
    try {
      validateCanonicalServiceURL(
        environment.APP_BASE_URL,
        'APP_BASE_URL',
        XERT_VERCEL_HOST,
      );
    } catch {
      invalid.push('APP_BASE_URL');
    }
  }

  return { ready: invalid.length === 0, invalid };
}
