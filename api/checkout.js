import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { requestHeader, requestJson, sendJson } from './http.js';
import {
  validateCanonicalServiceURL,
  XERT_SUPABASE_HOST,
  XERT_VERCEL_HOST,
} from '../src/lib/publicRuntimeConfig.js';

// Vercel serverless function using the default Node request/response signature.
// Creates a Stripe Checkout Session for a session pack, attributed to the
// signed-in member so the webhook can grant their credits after payment.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REUSABLE_CHECKOUT_WINDOW_MS = 20 * 60 * 1000;
const PAYMENT_FULFILLMENT_CAPABILITY = 'stripe_payment_fulfillment';
const STRIPE_PENDING_ORDER_CAPABILITY = 'stripe_pending_order_guard';
const ADMIN_SETTINGS_SINGLETON_CAPABILITY = 'admin_settings_singleton';
const CHECKOUT_ATTEMPT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHECKOUT_RECORDING_FAILED = 'CHECKOUT_RECORDING_FAILED';

export function stripeModeForSecret(secret = '') {
  const value = String(secret).trim();
  if (/^(sk|rk)_live_/.test(value)) return 'live';
  if (/^(sk|rk)_test_/.test(value)) return 'test';
  return 'unknown';
}

export function inspectCheckoutEnvironment(environment = {}) {
  const invalid = [];
  const serviceRoleKey = String(environment.SUPABASE_SERVICE_ROLE_KEY || '');
  const stripeSecretKey = String(environment.STRIPE_SECRET_KEY || '');
  const webhookSecret = String(environment.STRIPE_WEBHOOK_SECRET || '');
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
  if (
    stripeSecretKey !== stripeSecretKey.trim()
    || /\s/.test(stripeSecretKey)
    || stripeModeForSecret(stripeSecretKey) === 'unknown'
  ) {
    invalid.push('STRIPE_SECRET_KEY');
  }
  if (
    webhookSecret !== webhookSecret.trim()
    || /\s/.test(webhookSecret)
    || !/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret)
  ) {
    invalid.push('STRIPE_WEBHOOK_SECRET');
  }
  try {
    validateCanonicalServiceURL(
      environment.APP_BASE_URL,
      'APP_BASE_URL',
      XERT_VERCEL_HOST,
    );
  } catch {
    invalid.push('APP_BASE_URL');
  }
  return { ready: invalid.length === 0, invalid };
}

function sendCheckoutEnvironmentStatus(response, environment = process.env) {
  const status = inspectCheckoutEnvironment(environment).ready ? 204 : 503;
  if (!response) {
    return new Response(null, {
      status,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return response.status(status).end();
}

export async function paymentFulfillmentIsReady(admin) {
  const { data, error } = await admin
    .from('xert_schema_capabilities')
    .select('capability')
    .eq('capability', PAYMENT_FULFILLMENT_CAPABILITY)
    .maybeSingle();
  if (error) return false;
  return data?.capability === PAYMENT_FULFILLMENT_CAPABILITY;
}

export async function adminSettingsContractIsReady(admin) {
  const { data, error } = await admin
    .from('xert_schema_capabilities')
    .select('capability')
    .eq('capability', ADMIN_SETTINGS_SINGLETON_CAPABILITY)
    .maybeSingle();
  if (error) return false;
  return data?.capability === ADMIN_SETTINGS_SINGLETON_CAPABILITY;
}

export async function stripePendingOrderGuardIsReady(admin) {
  const { data, error } = await admin
    .from('xert_schema_capabilities')
    .select('capability')
    .eq('capability', STRIPE_PENDING_ORDER_CAPABILITY)
    .maybeSingle();
  if (error) return false;
  return data?.capability === STRIPE_PENDING_ORDER_CAPABILITY;
}

export async function sessionPackPaymentsAreEnabled(admin) {
  const { data, error } = await admin
    .from('admin_settings')
    .select('payments_enabled')
    .limit(2);
  if (error) return false;
  return data?.length === 1 && data[0]?.payments_enabled === true;
}

/**
 * Stripe return URLs must never come from a request Origin header: browsers
 * and non-browser clients can supply that header themselves. A configured
 * canonical URL wins; otherwise Vercel's request URL keeps the buyer on the
 * deployment that created the Checkout Session.
 */
export function resolveCheckoutOrigin(requestUrl, appBaseUrl = '', options = {}) {
  if (options.stripeMode === 'live') {
    return validateCanonicalServiceURL(
      appBaseUrl,
      'APP_BASE_URL',
      options.expectedHost || XERT_VERCEL_HOST,
    );
  }
  const candidate = appBaseUrl.trim() || requestUrl;
  const url = new URL(candidate);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Checkout return URL must use HTTP or HTTPS.');
  }
  return url.origin;
}

export function resolveCheckoutReturnURLs(origin, returnTarget = 'web') {
  if (returnTarget === 'ios') {
    return {
      success: `${origin}/checkout-return?status=success`,
      cancel: `${origin}/checkout-return?status=cancelled`,
    };
  }
  if (returnTarget === 'web') {
    return {
      success: `${origin}/account?purchase=success`,
      cancel: `${origin}/booking?purchase=cancelled`,
    };
  }
  throw new Error('Unsupported checkout return target.');
}

export function normalizeCheckoutAttemptID(value) {
  const attemptID = String(value || '').trim().toLowerCase();
  if (!CHECKOUT_ATTEMPT_PATTERN.test(attemptID)) {
    throw new Error('Checkout attempt identifier is invalid.');
  }
  return attemptID;
}

export function normalizeCheckoutRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Checkout request must be a JSON object.');
  }
  const productSlug = String(input.product_slug || '').trim().toLowerCase();
  if (!PRODUCT_SLUG_PATTERN.test(productSlug) || productSlug.length > 80) {
    throw new Error('Product identifier is invalid.');
  }
  const returnTarget = input.return_target === undefined ? 'web' : String(input.return_target);
  if (returnTarget !== 'web' && returnTarget !== 'ios') {
    throw new Error('Unsupported checkout return target.');
  }
  return {
    productSlug,
    returnTarget,
    suppliedAttemptID: input.checkout_attempt_id,
  };
}

export function publicCheckoutFailure(error) {
  if (error?.code === CHECKOUT_RECORDING_FAILED) {
    return {
      status: 503,
      message: 'Checkout could not be recorded. No payment was taken; please try again.',
    };
  }
  return {
    status: 500,
    message: 'Checkout could not be started. Please try again.',
  };
}

/**
 * The member, pack and return target scope prevent one client-provided attempt
 * identifier from colliding with another purchase. Replaying the same request
 * returns Stripe's original Checkout Session, including after a function stops
 * between Stripe creation and the pending-order write.
 */
export function checkoutIdempotencyKey({ attemptID, userID, productID, returnTarget }) {
  const normalizedAttemptID = normalizeCheckoutAttemptID(attemptID);
  return `xert-checkout:${userID}:${productID}:${returnTarget}:${normalizedAttemptID}`;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * The product table is the server-side authority for price and credits. Keep
 * this validation here as a deployment-safe backstop while database migrations
 * roll out, so malformed admin data never reaches Stripe or credit fulfilment.
 */
export function assertCheckoutProduct(product) {
  const currency = String(product?.currency || 'aud');
  if (
    !product ||
    !isPositiveInteger(product.price_cents) ||
    !isPositiveInteger(product.sessions_count) ||
    !isPositiveInteger(product.validity_days) ||
    !/^[a-z]{3}$/i.test(currency)
  ) {
    throw new Error('Product configuration is invalid.');
  }
}

/**
 * A stored Stripe Price ID is an optional operational shortcut, not a second
 * source of truth. Refuse checkout unless the Price is explicitly bound to the
 * same XERT pack identity, commercial terms, amount, currency and Stripe mode.
 */
export function assertStripePriceMatchesProduct(product, stripePrice, expectedLivemode = null) {
  const metadata = stripePrice?.metadata || {};
  if (
    !stripePrice ||
    stripePrice.deleted === true ||
    stripePrice.id !== product?.stripe_price_id ||
    stripePrice.active !== true ||
    stripePrice.type !== 'one_time' ||
    stripePrice.unit_amount !== product?.price_cents ||
    String(stripePrice.currency || '').toLowerCase() !== String(product?.currency || '').toLowerCase()
    || metadata.xert_product_id !== product?.id
    || metadata.xert_catalog_slug !== product?.slug
    || metadata.xert_sessions !== String(product?.sessions_count)
    || metadata.xert_validity_days !== String(product?.validity_days)
    || (typeof expectedLivemode === 'boolean' && stripePrice.livemode !== expectedLivemode)
  ) {
    throw new Error('Stripe price does not match the product configuration.');
  }
}

export function reusableCheckoutURL(checkout, user, product, options = {}) {
  const metadata = checkout?.metadata || {};
  const expectedLivemode = options.stripeMode === 'live';
  const url = (() => {
    try { return new URL(checkout?.url || ''); } catch { return null; }
  })();
  if (
    checkout?.status !== 'open'
    || checkout?.payment_status !== 'unpaid'
    || checkout?.livemode !== expectedLivemode
    || !url || url.protocol !== 'https:'
    || metadata.user_id !== user?.id
    || metadata.product_id !== product?.id
    || metadata.product_slug !== product?.slug
    || metadata.sessions_count !== String(product?.sessions_count)
    || metadata.validity_days !== String(product?.validity_days)
    || metadata.return_target !== options.returnTarget
    || checkout.amount_total !== product?.price_cents
    || String(checkout.currency || '').toLowerCase() !== String(product?.currency || '').toLowerCase()
  ) return null;
  return url.toString();
}

async function findReusableCheckout({ admin, stripe, user, product, returnTarget, stripeMode, now = new Date() }) {
  const cutoff = new Date(now.getTime() - REUSABLE_CHECKOUT_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from('orders')
    .select('stripe_checkout_session_id')
    .eq('user_id', user.id)
    .eq('product_id', product.id)
    .eq('status', 'pending')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) return null;
  for (const order of data || []) {
    if (!order.stripe_checkout_session_id) continue;
    try {
      const checkout = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      const url = reusableCheckoutURL(checkout, user, product, { returnTarget, stripeMode });
      if (url) return url;
    } catch {
      // A missing or expired Stripe session is not reusable; create a clean one.
    }
  }
  return null;
}

export function pendingOrderForCheckout(checkout, user, product) {
  if (!checkout?.id || !user?.id || !product?.id) {
    throw new Error('Pending checkout identity is incomplete.');
  }
  const amountCents = checkout.amount_total ?? product.price_cents;
  const currency = String(checkout.currency || product.currency || 'aud').toLowerCase();
  if (
    !Number.isSafeInteger(amountCents)
    || amountCents !== product.price_cents
    || currency !== String(product.currency || 'aud').toLowerCase()
  ) {
    throw new Error('Pending checkout amount does not match the product.');
  }
  return {
    user_id: user.id,
    product_id: product.id,
    email: user.email || null,
    amount_cents: amountCents,
    currency,
    status: 'pending',
    stripe_checkout_session_id: checkout.id,
    stripe_payment_intent_id:
      typeof checkout.payment_intent === 'string'
        ? checkout.payment_intent
        : checkout.payment_intent?.id || null,
  };
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method === 'HEAD') return sendCheckoutEnvironmentStatus(response);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json({ error: 'Invalid or expired session.' }, 401);

    if (!await paymentFulfillmentIsReady(admin)) {
      return json({
        error: 'Checkout is temporarily unavailable while payment services are being upgraded.',
      }, 503);
    }

    if (!await stripePendingOrderGuardIsReady(admin)) {
      return json({
        error: 'Checkout is temporarily unavailable while payment order safeguards are being upgraded.',
      }, 503);
    }

    if (!await adminSettingsContractIsReady(admin)) {
      return json({
        error: 'Checkout is temporarily unavailable while platform settings are being upgraded.',
      }, 503);
    }

    if (!await sessionPackPaymentsAreEnabled(admin)) {
      return json({
        error: 'Session pack purchases are temporarily unavailable.',
      }, 503);
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json({ error: 'Stripe is not configured.' }, 500);
    }
    const stripeMode = stripeModeForSecret(process.env.STRIPE_SECRET_KEY);
    if (stripeMode === 'unknown') return json({ error: 'Stripe key mode is not recognized.' }, 500);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    let checkoutRequest;
    try {
      checkoutRequest = normalizeCheckoutRequest(await requestJson(request));
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    const { productSlug, returnTarget, suppliedAttemptID } = checkoutRequest;
    let checkoutAttemptID;
    try {
      // Older installed clients remain compatible; updated clients keep this
      // value stable if their network layer retries the same purchase action.
      checkoutAttemptID = normalizeCheckoutAttemptID(suppliedAttemptID || randomUUID());
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    let returnURLs;
    try {
      returnURLs = resolveCheckoutReturnURLs(
        resolveCheckoutOrigin(request.url, process.env.APP_BASE_URL || '', {
          stripeMode,
          expectedHost: XERT_VERCEL_HOST,
        }),
        returnTarget
      );
    } catch (error) {
      return json({ error: error.message }, 400);
    }

    // Price comes from the DB (authoritative) — never trust a client-supplied amount.
    const { data: product, error: prodErr } = await admin
      .from('products')
      .select('*')
      .eq('slug', productSlug)
      .eq('active', true)
      .single();
    if (prodErr || !product) return json({ error: 'Unknown product.' }, 400);
    assertCheckoutProduct(product);

    if (stripeMode === 'live' && !product.stripe_price_id) {
      return json({ error: 'This pack is not linked to a live Stripe Price yet.' }, 409);
    }

    const reusableURL = await findReusableCheckout({
      admin, stripe, user, product, returnTarget, stripeMode,
    });
    if (reusableURL) return json({ url: reusableURL, reused: true });

    let lineItem;
    if (product.stripe_price_id) {
      const stripePrice = await stripe.prices.retrieve(product.stripe_price_id);
      assertStripePriceMatchesProduct(product, stripePrice, stripeMode === 'live');
      lineItem = { price: stripePrice.id, quantity: 1 };
    } else {
      lineItem = {
        price_data: {
          currency: product.currency.toLowerCase(),
          unit_amount: product.price_cents,
          product_data: {
            name: product.name,
            description: product.description || undefined,
          },
        },
        quantity: 1,
      };
    }

    const checkoutParameters = {
      mode: 'payment',
      customer_creation: 'always',
      billing_address_collection: 'auto',
      line_items: [lineItem],
      customer_email: user.email,
      client_reference_id: user.id,
      success_url: returnURLs.success,
      cancel_url: returnURLs.cancel,
      // Stripe requires at least 30 minutes. The extra five minutes avoids a
      // boundary rejection caused by network transit or clock skew.
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      payment_intent_data: {
        description: `XERT Fitness - ${product.name}`,
        metadata: {
          xert_user_id: user.id,
          xert_product_id: product.id,
          xert_product_slug: product.slug,
          xert_checkout_attempt_id: checkoutAttemptID,
        },
      },
      metadata: {
        user_id: user.id,
        product_id: product.id,
        product_slug: product.slug,
        sessions_count: String(product.sessions_count),
        validity_days: String(product.validity_days),
        return_target: returnTarget,
        checkout_attempt_id: checkoutAttemptID,
      },
    };
    const session = await stripe.checkout.sessions.create(checkoutParameters, {
      idempotencyKey: checkoutIdempotencyKey({
        attemptID: checkoutAttemptID,
        userID: user.id,
        productID: product.id,
        returnTarget,
      }),
    });

    try {
      const { error: pendingOrderError } = await admin
        .from('orders')
        .upsert(pendingOrderForCheckout(session, user, product), {
          onConflict: 'stripe_checkout_session_id',
        });
      if (pendingOrderError) throw pendingOrderError;
    } catch {
      await stripe.checkout.sessions.expire(session.id).catch(() => {});
      const recordingError = new Error('Pending checkout order could not be saved.');
      recordingError.code = CHECKOUT_RECORDING_FAILED;
      throw recordingError;
    }

    return json({ url: session.url });
  } catch (e) {
    const failure = publicCheckoutFailure(e);
    console.error('Checkout request failed.', {
      name: String(e?.name || 'Error'),
      code: String(e?.code || 'UNEXPECTED_CHECKOUT_ERROR'),
      type: String(e?.type || ''),
      requestId: String(e?.requestId || ''),
    });
    return json({ error: failure.message }, failure.status);
  }
}
