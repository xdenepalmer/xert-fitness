import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { assertCheckoutProduct, assertStripePriceMatchesProduct, stripeModeForSecret } from './checkout.js';
import { requestHeader, sendJson } from './http.js';
import {
  validateCanonicalServiceURL,
  XERT_VERCEL_HOST,
} from '../src/lib/publicRuntimeConfig.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.expired',
  'checkout.session.async_payment_failed',
  'charge.refunded',
];

export function inspectCommerceEnvironment(environment = {}) {
  const missing = [];
  if (!String(environment.STRIPE_SECRET_KEY || '').trim()) missing.push('STRIPE_SECRET_KEY');
  if (!String(environment.STRIPE_WEBHOOK_SECRET || '').trim()) missing.push('STRIPE_WEBHOOK_SECRET');

  try {
    validateCanonicalServiceURL(
      environment.APP_BASE_URL,
      'APP_BASE_URL',
      XERT_VERCEL_HOST,
    );
  } catch {
    missing.push('APP_BASE_URL');
  }

  return { ready: missing.length === 0, missing };
}

function environmentIssues(environmentHealth) {
  return environmentHealth.missing.map(name => ({
    slug: 'server',
    reason: `Missing or invalid server setting: ${name}.`,
  }));
}

export async function inspectCommerceProducts(products, retrieveStripePrice, options = {}) {
  const issues = [];
  let stripePriceCount = 0;
  let dynamicPriceCount = 0;

  for (const product of products || []) {
    const slug = String(product?.slug || 'unknown-product');
    try {
      assertCheckoutProduct(product);
    } catch {
      issues.push({ slug, reason: 'Supabase product values are invalid.' });
      continue;
    }

    if (!product.stripe_price_id) {
      dynamicPriceCount += 1;
      if (options.requireLinkedPrices) {
        issues.push({ slug, reason: 'Live checkout requires a stable Stripe Price ID.' });
      }
      continue;
    }

    stripePriceCount += 1;
    let stripePrice;
    try {
      stripePrice = await retrieveStripePrice(product.stripe_price_id);
    } catch {
      issues.push({ slug, reason: 'Stripe Price ID could not be loaded.' });
      continue;
    }
    try {
      assertStripePriceMatchesProduct(product, stripePrice, options.expectedLivemode ?? null);
    } catch {
      issues.push({ slug, reason: 'Stripe amount, currency, type, or active state does not match.' });
    }
  }

  return {
    ready: (products?.length || 0) > 0 && issues.length === 0,
    active_product_count: products?.length || 0,
    stripe_price_count: stripePriceCount,
    dynamic_price_count: dynamicPriceCount,
    issues,
  };
}

export function inspectStripeAccount(account) {
  const issues = [];
  if (!account?.details_submitted) issues.push('Stripe business verification is incomplete.');
  if (!account?.charges_enabled) issues.push('Stripe charges are not enabled.');
  if (!account?.payouts_enabled) issues.push('Stripe payouts are not enabled.');
  if (String(account?.country || '').toUpperCase() !== 'AU') issues.push('Stripe account country must be Australia.');
  if (String(account?.default_currency || '').toLowerCase() !== 'aud') issues.push('Stripe default currency must be AUD.');
  return {
    ready: issues.length === 0,
    charges_enabled: account?.charges_enabled === true,
    payouts_enabled: account?.payouts_enabled === true,
    details_submitted: account?.details_submitted === true,
    country: String(account?.country || '').toUpperCase() || null,
    default_currency: String(account?.default_currency || '').toLowerCase() || null,
    issues,
  };
}

export function inspectStripeWebhookEndpoints(endpoints, appBaseUrl) {
  let expectedUrl;
  try {
    expectedUrl = new URL('/api/stripe-webhook', appBaseUrl).toString();
  } catch {
    return { ready: false, missing_events: REQUIRED_WEBHOOK_EVENTS, issue: 'APP_BASE_URL cannot identify the Stripe webhook.' };
  }
  const endpoint = (endpoints || []).find(item => item?.url === expectedUrl);
  if (!endpoint) {
    return { ready: false, missing_events: REQUIRED_WEBHOOK_EVENTS, issue: 'The production Stripe webhook endpoint is not registered.' };
  }
  const enabled = new Set(endpoint.enabled_events || []);
  const missingEvents = enabled.has('*') ? [] : REQUIRED_WEBHOOK_EVENTS.filter(event => !enabled.has(event));
  if (endpoint.status !== 'enabled') {
    return { ready: false, missing_events: missingEvents, issue: 'The production Stripe webhook endpoint is disabled.' };
  }
  return {
    ready: missingEvents.length === 0,
    missing_events: missingEvents,
    issue: missingEvents.length ? `Stripe webhook is missing: ${missingEvents.join(', ')}.` : null,
  };
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return json({ error: 'Could not verify admin access.' }, 500);
  if (profile?.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

  const { data: products, error: productError } = await admin
    .from('products')
    .select('slug,price_cents,currency,sessions_count,validity_days,stripe_price_id')
    .eq('active', true)
    .order('sort_order');
  if (productError) return json({ error: 'Could not load active products.' }, 500);

  const activeProducts = products || [];
  const environment = inspectCommerceEnvironment(process.env);
  if (environment.missing.includes('STRIPE_SECRET_KEY')) {
    return json({
      ready: false,
      active_product_count: activeProducts.length,
      stripe_price_count: activeProducts.filter(product => product.stripe_price_id).length,
      dynamic_price_count: activeProducts.filter(product => !product.stripe_price_id).length,
      issues: environmentIssues(environment),
      environment,
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const stripeMode = stripeModeForSecret(process.env.STRIPE_SECRET_KEY);
  const [productHealth, webhookHealth, accountHealth] = await Promise.all([
    inspectCommerceProducts(activeProducts, priceId => stripe.prices.retrieve(priceId), {
      requireLinkedPrices: stripeMode === 'live',
      expectedLivemode: stripeMode === 'live',
    }),
    stripe.webhookEndpoints.list({ limit: 100 })
      .then(result => inspectStripeWebhookEndpoints(result.data, process.env.APP_BASE_URL || ''))
      .catch(() => ({ ready: false, missing_events: REQUIRED_WEBHOOK_EVENTS, issue: 'Stripe webhook settings could not be verified.' })),
    stripe.accounts.retrieve()
      .then(inspectStripeAccount)
      .catch(() => ({ ready: false, issues: ['Stripe account readiness could not be verified.'] })),
  ]);
  return json({
    ...productHealth,
    ready: stripeMode !== 'unknown' && productHealth.ready && webhookHealth.ready && accountHealth.ready && environment.ready,
    mode: stripeMode,
    account: accountHealth,
    issues: [
      ...productHealth.issues,
      ...(webhookHealth.issue ? [{ slug: 'webhook', reason: webhookHealth.issue }] : []),
      ...(accountHealth.issues || []).map(reason => ({ slug: 'account', reason })),
      ...(stripeMode === 'unknown' ? [{ slug: 'server', reason: 'Stripe key mode is not recognized.' }] : []),
      ...environmentIssues(environment),
    ],
    environment,
    webhook: webhookHealth,
  });
}
