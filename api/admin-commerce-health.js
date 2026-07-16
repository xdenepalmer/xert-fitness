import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { assertCheckoutProduct, assertStripePriceMatchesProduct, paymentFulfillmentIsReady, stripeModeForSecret } from './checkout.js';
import { requestHeader, requestJson, sendJson } from './http.js';
import {
  validateCanonicalServiceURL,
  XERT_VERCEL_HOST,
} from '../src/lib/publicRuntimeConfig.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYMENT_ACTIVATION_CAPABILITY = 'guarded_payment_activation';
const ADMIN_SETTINGS_SINGLETON_CAPABILITY = 'admin_settings_singleton';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.expired',
  'checkout.session.async_payment_failed',
  'charge.refunded',
];

export function inspectCommerceEnvironment(environment = {}) {
  const missing = [];
  const stripeSecretKey = String(environment.STRIPE_SECRET_KEY || '');
  const webhookSecret = String(environment.STRIPE_WEBHOOK_SECRET || '');
  if (
    stripeSecretKey !== stripeSecretKey.trim()
    || /\s/.test(stripeSecretKey)
    || stripeModeForSecret(stripeSecretKey) === 'unknown'
  ) missing.push('STRIPE_SECRET_KEY');
  if (
    webhookSecret !== webhookSecret.trim()
    || /\s/.test(webhookSecret)
    || !/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret)
  ) missing.push('STRIPE_WEBHOOK_SECRET');

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

function normalizeLaunchDate(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error('INVALID_PAYMENT_ACTIVATION');
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('INVALID_PAYMENT_ACTIVATION');
  }
  return normalized;
}

export function normalizePaymentActivationRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_PAYMENT_ACTIVATION');
  if (body.action !== 'activate_payments' || body.confirmation !== 'ENABLE PAYMENTS') {
    throw new Error('PAYMENT_ACTIVATION_NOT_CONFIRMED');
  }
  const settingsId = String(body.settings_id || '').trim();
  const expectedUpdatedAt = String(body.expected_updated_at || '').trim();
  if (!UUID_PATTERN.test(settingsId) || expectedUpdatedAt.length > 64 || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new Error('INVALID_PAYMENT_ACTIVATION');
  }

  const settings = body.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('INVALID_PAYMENT_ACTIVATION');
  }
  for (const field of ['countdown_enabled', 'bookings_enabled', 'payments_enabled', 'announcement_banner_enabled']) {
    if (typeof settings[field] !== 'boolean') throw new Error('INVALID_PAYMENT_ACTIVATION');
  }
  if (settings.payments_enabled !== true) throw new Error('INVALID_PAYMENT_ACTIVATION');
  const announcement = settings.announcement_banner_text == null
    ? ''
    : String(settings.announcement_banner_text).trim();
  if (announcement.length > 1_000 || (settings.announcement_banner_enabled && !announcement)) {
    throw new Error('INVALID_PAYMENT_ACTIVATION');
  }

  return {
    settingsId,
    expectedUpdatedAt,
    updates: {
      target_launch_date: normalizeLaunchDate(settings.target_launch_date),
      countdown_enabled: settings.countdown_enabled,
      bookings_enabled: settings.bookings_enabled,
      payments_enabled: true,
      announcement_banner_text: announcement || null,
      announcement_banner_enabled: settings.announcement_banner_enabled,
    },
  };
}

export async function schemaCapabilityIsReady(admin, capability) {
  const { data, error } = await admin
    .from('xert_schema_capabilities')
    .select('capability')
    .eq('capability', capability)
    .maybeSingle();
  return !error && data?.capability === capability;
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
      issues.push({ slug, reason: 'Stripe Price identity, terms, amount, currency, type, or active state does not match.' });
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

export async function inspectCommerceHealth({ admin, products, environment: runtimeEnvironment = process.env, stripe: stripeClient }) {
  const activeProducts = products || [];
  const environment = inspectCommerceEnvironment(runtimeEnvironment);
  const [fulfillmentReady, activationGuardReady, settingsContractReady] = await Promise.all([
    paymentFulfillmentIsReady(admin),
    schemaCapabilityIsReady(admin, PAYMENT_ACTIVATION_CAPABILITY),
    schemaCapabilityIsReady(admin, ADMIN_SETTINGS_SINGLETON_CAPABILITY),
  ]);
  const databaseIssues = [
    ...(fulfillmentReady ? [] : [{ slug: 'database', reason: 'Atomic Stripe payment fulfillment is not installed.' }]),
    ...(activationGuardReady ? [] : [{ slug: 'database', reason: 'Guarded payment activation is not installed.' }]),
    ...(settingsContractReady ? [] : [{ slug: 'database', reason: 'Versioned singleton platform settings are not installed.' }]),
  ];
  if (environment.missing.includes('STRIPE_SECRET_KEY')) {
    return {
      ready: false,
      active_product_count: activeProducts.length,
      stripe_price_count: activeProducts.filter(product => product.stripe_price_id).length,
      dynamic_price_count: activeProducts.filter(product => !product.stripe_price_id).length,
      issues: [...databaseIssues, ...environmentIssues(environment)],
      environment,
      fulfillment_ready: fulfillmentReady,
      activation_guard_ready: activationGuardReady,
      settings_contract_ready: settingsContractReady,
    };
  }

  const stripe = stripeClient || new Stripe(runtimeEnvironment.STRIPE_SECRET_KEY);
  const stripeMode = stripeModeForSecret(runtimeEnvironment.STRIPE_SECRET_KEY);
  const [productHealth, webhookHealth, accountHealth] = await Promise.all([
    inspectCommerceProducts(activeProducts, priceId => stripe.prices.retrieve(priceId), {
      requireLinkedPrices: stripeMode === 'live',
      expectedLivemode: stripeMode === 'live',
    }),
    stripe.webhookEndpoints.list({ limit: 100 })
      .then(result => inspectStripeWebhookEndpoints(result.data, runtimeEnvironment.APP_BASE_URL || ''))
      .catch(() => ({ ready: false, missing_events: REQUIRED_WEBHOOK_EVENTS, issue: 'Stripe webhook settings could not be verified.' })),
    stripe.accounts.retrieve()
      .then(inspectStripeAccount)
      .catch(() => ({ ready: false, issues: ['Stripe account readiness could not be verified.'] })),
  ]);
  return {
    ...productHealth,
    ready: stripeMode !== 'unknown'
      && productHealth.ready
      && webhookHealth.ready
      && accountHealth.ready
      && environment.ready
      && fulfillmentReady
      && activationGuardReady
      && settingsContractReady,
    mode: stripeMode,
    account: accountHealth,
    issues: [
      ...productHealth.issues,
      ...(webhookHealth.issue ? [{ slug: 'webhook', reason: webhookHealth.issue }] : []),
      ...(accountHealth.issues || []).map(reason => ({ slug: 'account', reason })),
      ...(stripeMode === 'unknown' ? [{ slug: 'server', reason: 'Stripe key mode is not recognized.' }] : []),
      ...databaseIssues,
      ...environmentIssues(environment),
    ],
    environment,
    fulfillment_ready: fulfillmentReady,
    activation_guard_ready: activationGuardReady,
    settings_contract_ready: settingsContractReady,
    webhook: webhookHealth,
  };
}

export async function activateSessionPackPayments(serverClient, actorId, activation) {
  const { data, error } = await serverClient.rpc('admin_activate_session_pack_payments', {
    p_actor_id: actorId,
    p_settings_id: activation.settingsId,
    p_expected_updated_at: activation.expectedUpdatedAt,
    p_target_launch_date: activation.updates.target_launch_date,
    p_countdown_enabled: activation.updates.countdown_enabled,
    p_bookings_enabled: activation.updates.bookings_enabled,
    p_announcement_banner_text: activation.updates.announcement_banner_text,
    p_announcement_banner_enabled: activation.updates.announcement_banner_enabled,
  });
  if (error) {
    if (/PAYMENT_ACTIVATION_(?:STALE|ALREADY_ENABLED|SETTINGS_NOT_FOUND)/i.test(error.message || '')) {
      throw new Error('PAYMENT_ACTIVATION_STALE');
    }
    throw new Error('PAYMENT_ACTIVATION_UPDATE_FAILED');
  }
  const settings = Array.isArray(data) ? data[0] : data;
  if (!settings) throw new Error('PAYMENT_ACTIVATION_STALE');
  if (settings.payments_enabled !== true || settings.id !== activation.settingsId) {
    throw new Error('PAYMENT_ACTIVATION_NOT_RETAINED');
  }
  return settings;
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);

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

  let activation;
  if (request.method === 'POST') {
    try {
      activation = normalizePaymentActivationRequest(await requestJson(request));
    } catch (error) {
      if (error.message === 'PAYMENT_ACTIVATION_NOT_CONFIRMED') {
        return json({ error: 'Type ENABLE PAYMENTS to confirm activation.' }, 400);
      }
      return json({ error: 'Payment activation request is invalid.' }, 400);
    }
  }

  const { data: products, error: productError } = await admin
    .from('products')
    .select('id,slug,price_cents,currency,sessions_count,validity_days,stripe_price_id')
    .eq('active', true)
    .order('sort_order');
  if (productError) return json({ error: 'Could not load active products.' }, 500);

  const health = await inspectCommerceHealth({ admin, products });
  if (request.method === 'GET') return json(health);
  if (!health.ready) {
    return json({ error: 'Stripe launch checks are not passing. Payments remain paused.', health }, 409);
  }

  try {
    const serverClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const settings = await activateSessionPackPayments(serverClient, user.id, activation);
    return json(settings);
  } catch (error) {
    if (error.message === 'PAYMENT_ACTIVATION_STALE') {
      return json({ error: 'Platform settings changed during activation. Refresh and review them before retrying.' }, 409);
    }
    return json({ error: 'Payment activation could not be confirmed. Payments remain paused.' }, 500);
  }
}
