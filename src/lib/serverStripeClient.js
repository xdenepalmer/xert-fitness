import Stripe from 'stripe';

const XERT_STRIPE_APP_INFO = Object.freeze({
  name: 'XERT Fitness',
  url: 'https://xert-fitness.vercel.app',
});

export const XERT_STRIPE_API_VERSION = Stripe.API_VERSION;
export const XERT_STRIPE_MAX_NETWORK_RETRIES = 2;
export const XERT_STRIPE_TIMEOUT_MS = 20_000;

export function xertStripeClientOptions() {
  return {
    apiVersion: XERT_STRIPE_API_VERSION,
    maxNetworkRetries: XERT_STRIPE_MAX_NETWORK_RETRIES,
    timeout: XERT_STRIPE_TIMEOUT_MS,
    appInfo: { ...XERT_STRIPE_APP_INFO },
  };
}

export function createXertStripeClient(secretKey, StripeConstructor = Stripe) {
  return new StripeConstructor(secretKey, xertStripeClientOptions());
}
