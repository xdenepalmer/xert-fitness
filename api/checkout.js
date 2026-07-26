import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createRequestTrace, requestHeader, requestJson } from './http.js';
import {
  inspectCommerceRuntimeEnvironment,
  stripeModeForSecret,
  XERT_PAYMENT_CONTRACT_HEADER,
  XERT_PAYMENT_CONTRACT_VERSION,
} from '../src/lib/commerceRuntime.js';
import {
  validateCanonicalServiceURL,
  XERT_VERCEL_HOST,
} from '../src/lib/publicRuntimeConfig.js';
import {
  loadPaymentActivationHealth,
  paymentActivationAllowsCheckout,
} from '../src/lib/paymentActivation.js';
import { createXertStripeClient } from '../src/lib/serverStripeClient.js';

// Vercel serverless function using the default Node request/response signature.
// Creates a Stripe Checkout Session for a session pack, attributed to the
// signed-in member so the webhook can grant their credits after payment.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REUSABLE_CHECKOUT_WINDOW_MS = 20 * 60 * 1000;
const PAYMENT_FULFILLMENT_CAPABILITY = 'stripe_payment_fulfillment';
const STRIPE_PENDING_ORDER_CAPABILITY = 'stripe_pending_order_guard';
const STRIPE_ORDER_TERMS_CAPABILITY = 'stripe_order_terms_snapshot';
const STRIPE_WEBHOOK_LEDGER_CAPABILITY = 'stripe_webhook_ledger';
const PAYMENT_FULFILLMENT_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
];
const PAYMENT_FULFILLMENT_STALE_MS = 10 * 60 * 1000;
const ADMIN_SETTINGS_SINGLETON_CAPABILITY = 'admin_settings_singleton';
const PAYMENT_ACTIVATION_DRIFT_CAPABILITY = 'payment_activation_drift_guard';
const CHECKOUT_ATTEMPT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHECKOUT_RECORDING_FAILED = 'CHECKOUT_RECORDING_FAILED';
const CHECKOUT_CONTRACT_VERSION = 'receipt_terms_v1';
// Fulfilment (stripe-webhook.js and fulfill_stripe_checkout) hard-requires AUD.
// Committing a charge in any other currency takes the member's money and can
// never grant credits, so the checkout and health paths must reject it up front.
export const SUPPORTED_CHECKOUT_CURRENCY = 'aud';

export { stripeModeForSecret };

export function inspectCheckoutEnvironment(environment = {}) {
  return inspectCommerceRuntimeEnvironment(environment, {
    requireWebhookSecret: true,
    requireAppBaseURL: true,
  });
}

function sendCheckoutEnvironmentStatus(response, environment = process.env) {
  const status = inspectCheckoutEnvironment(environment).ready ? 204 : 503;
  if (!response) {
    return new Response(null, {
      status,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        [XERT_PAYMENT_CONTRACT_HEADER]: XERT_PAYMENT_CONTRACT_VERSION,
      },
    });
  }
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader(XERT_PAYMENT_CONTRACT_HEADER, XERT_PAYMENT_CONTRACT_VERSION);
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

export async function paymentActivationDriftGuardIsReady(admin) {
  const { data, error } = await admin
    .from('xert_schema_capabilities')
    .select('capability')
    .eq('capability', PAYMENT_ACTIVATION_DRIFT_CAPABILITY)
    .maybeSingle();
  if (error) return false;
  return data?.capability === PAYMENT_ACTIVATION_DRIFT_CAPABILITY;
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

export async function stripeOrderTermsSnapshotIsReady(admin) {
  const { data, error } = await admin
    .from('xert_schema_capabilities')
    .select('capability')
    .eq('capability', STRIPE_ORDER_TERMS_CAPABILITY)
    .maybeSingle();
  if (error) return false;
  return data?.capability === STRIPE_ORDER_TERMS_CAPABILITY;
}

export async function stripeWebhookLedgerIsReady(admin) {
  const { data, error } = await admin
    .from('xert_schema_capabilities')
    .select('capability')
    .eq('capability', STRIPE_WEBHOOK_LEDGER_CAPABILITY)
    .maybeSingle();
  if (error) return false;
  return data?.capability === STRIPE_WEBHOOK_LEDGER_CAPABILITY;
}

function isMissingSignatureFailureLedger(error) {
  return ['42P01', 'PGRST205'].includes(error?.code)
    || /stripe_webhook_signature_failures.*(?:not found|schema cache|does not exist)/i.test(error?.message || '');
}

/**
 * Probes that Operations Health also treats as not-ready: durable signature
 * rejections (invisible to the event ledger) and paid orders newer than the
 * newest ledger row ("no webhooks at all"). Missing signature-ledger schema
 * degrades to zero so rolling upgrades do not pause checkout.
 */
export async function inspectWebhookDeliveryGaps(admin, now = new Date()) {
  const nowTime = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowTime)) {
    return { signatureInstalled: false, signatureFailures: 0, deliveryGap: true };
  }
  const since = new Date(nowTime - 24 * 60 * 60 * 1000).toISOString();
  const [signatureResult, newestLedgerResult] = await Promise.all([
    admin
      .from('stripe_webhook_signature_failures')
      .select('id', { count: 'exact', head: true })
      .gte('received_at', since),
    admin
      .from('stripe_webhook_events')
      .select('last_received_at')
      .order('last_received_at', { ascending: false })
      .limit(1),
  ]);
  const signatureInstalled = !(signatureResult?.error && isMissingSignatureFailureLedger(signatureResult.error));
  const signatureFailures = signatureResult?.error ? 0 : (signatureResult?.count || 0);
  const newestLedgerAt = newestLedgerResult?.error
    ? null
    : (newestLedgerResult?.data?.[0]?.last_received_at || null);

  let paidOrdersQuery = admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'paid');
  if (newestLedgerAt) paidOrdersQuery = paidOrdersQuery.gt('paid_at', newestLedgerAt);
  const paidOrdersResult = await paidOrdersQuery;
  const paidBeyondLedger = paidOrdersResult?.error ? 0 : (paidOrdersResult?.count || 0);

  return {
    signatureInstalled,
    signatureFailures,
    deliveryGap: paidBeyondLedger > 0,
  };
}

/**
 * Stop new purchases when Stripe has already reported a paid Checkout Session
 * that XERT failed to settle — or when Operations Health would mark webhook
 * delivery not-ready for signature failures / a paid-order delivery gap.
 * This limits one delivery outage to the members already in flight instead of
 * continuing to accept charges without credits.
 */
export async function paymentFulfillmentDeliveryIsHealthy(admin, now = new Date()) {
  const nowTime = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowTime)) return false;
  const staleBefore = new Date(nowTime - PAYMENT_FULFILLMENT_STALE_MS).toISOString();
  const count = status => admin
    .from('stripe_webhook_events')
    .select('event_id', { count: 'exact', head: true })
    .in('event_type', PAYMENT_FULFILLMENT_EVENT_TYPES)
    .eq('status', status);
  try {
    const [failed, stalled, gaps] = await Promise.all([
      count('failed'),
      count('processing').lt('last_received_at', staleBefore),
      inspectWebhookDeliveryGaps(admin, now),
    ]);
    return !failed.error
      && !stalled.error
      && failed.count === 0
      && stalled.count === 0
      && gaps.signatureFailures === 0
      && !gaps.deliveryGap;
  } catch {
    return false;
  }
}

export async function sessionPackPaymentsAreEnabled(admin) {
  const activation = await loadPaymentActivationHealth(admin);
  return paymentActivationAllowsCheckout(activation);
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
      success: `${origin}/checkout-return?status=success&checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel: `${origin}/checkout-return?status=cancelled`,
    };
  }
  if (returnTarget === 'web') {
    return {
      success: `${origin}/account?purchase=success&checkout_session_id={CHECKOUT_SESSION_ID}`,
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
  const currency = String(product?.currency || SUPPORTED_CHECKOUT_CURRENCY).toLowerCase();
  if (
    !product ||
    !isPositiveInteger(product.price_cents) ||
    !isPositiveInteger(product.sessions_count) ||
    !isPositiveInteger(product.validity_days) ||
    currency !== SUPPORTED_CHECKOUT_CURRENCY
  ) {
    throw new Error('Product configuration is invalid.');
  }
}

export function checkoutReceiptDetails(user, product) {
  assertCheckoutProduct(product);
  const email = String(user?.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('The member account needs a valid email address before checkout.');
  }

  const sessionLabel = product.sessions_count === 1 ? 'session' : 'sessions';
  const productName = String(product.name || 'Session pack')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'Session pack';
  const terms = `This purchase adds ${product.sessions_count} XERT training ${sessionLabel} to your member account. Credits expire ${product.validity_days} days after successful payment.`;

  return {
    email,
    terms,
    description: `XERT Fitness - ${productName}: ${product.sessions_count} ${sessionLabel}, valid for ${product.validity_days} days from payment.`,
    contractVersion: CHECKOUT_CONTRACT_VERSION,
  };
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
    || !url
    || url.protocol !== 'https:'
    || url.hostname !== 'checkout.stripe.com'
    || url.username !== ''
    || url.password !== ''
    || (url.port !== '' && url.port !== '443')
    || metadata.user_id !== user?.id
    || metadata.product_id !== product?.id
    || metadata.product_slug !== product?.slug
    || metadata.sessions_count !== String(product?.sessions_count)
    || metadata.validity_days !== String(product?.validity_days)
    || metadata.return_target !== options.returnTarget
    || metadata.checkout_contract !== CHECKOUT_CONTRACT_VERSION
    || String(checkout.customer_email || '').trim().toLowerCase() !== options.memberEmail
    || checkout.amount_total !== product?.price_cents
    || String(checkout.currency || '').toLowerCase() !== String(product?.currency || '').toLowerCase()
  ) return null;
  return url.toString();
}

export function buildCheckoutSessionParameters({
  user,
  product,
  lineItem,
  returnTarget,
  returnURLs,
  receiptDetails,
  checkoutAttemptID,
}) {
  assertCheckoutProduct(product);
  const attemptID = normalizeCheckoutAttemptID(checkoutAttemptID);
  if (!user?.id || !lineItem || typeof lineItem !== 'object') {
    throw new Error('Checkout session identity is incomplete.');
  }
  if (returnTarget !== 'web' && returnTarget !== 'ios') {
    throw new Error('Unsupported checkout return target.');
  }
  if (
    !receiptDetails?.email
    || !receiptDetails?.terms
    || !receiptDetails?.description
    || !receiptDetails?.contractVersion
  ) {
    throw new Error('Checkout receipt details are incomplete.');
  }
  for (const value of [returnURLs?.success, returnURLs?.cancel]) {
    let url;
    try {
      url = new URL(value || '');
    } catch {
      throw new Error('Checkout return URL is invalid.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Checkout return URL must use HTTP or HTTPS.');
    }
  }

  return /** @type {import('stripe').Stripe.Checkout.SessionCreateParams} */ ({
    mode: 'payment',
    customer_creation: 'if_required',
    origin_context: returnTarget === 'ios' ? 'mobile_app' : 'web',
    billing_address_collection: 'auto',
    line_items: [lineItem],
    customer_email: receiptDetails.email,
    client_reference_id: user.id,
    success_url: returnURLs.success,
    cancel_url: returnURLs.cancel,
    // No wall-clock field may appear here: the idempotency key is stable across
    // client retries, so Stripe only replays the saved session when the request
    // body is byte-identical. A per-second expires_at broke every genuine retry.
    // Stripe's default session lifetime plus XERT's reuse window bound the session.
    custom_text: {
      submit: { message: receiptDetails.terms },
    },
    payment_intent_data: {
      description: receiptDetails.description,
      receipt_email: receiptDetails.email,
      metadata: {
        xert_user_id: user.id,
        xert_product_id: product.id,
        xert_product_slug: product.slug,
        xert_checkout_attempt_id: attemptID,
      },
    },
    metadata: {
      xert_checkout_attempt_id: attemptID,
      user_id: user.id,
      product_id: product.id,
      product_slug: product.slug,
      sessions_count: String(product.sessions_count),
      validity_days: String(product.validity_days),
      return_target: returnTarget,
      checkout_contract: receiptDetails.contractVersion,
      checkout_attempt_id: attemptID,
    },
  });
}

export function verifiedCreatedCheckoutURL(checkout, user, product, options = {}) {
  const url = reusableCheckoutURL(checkout, user, product, options);
  const metadata = checkout?.metadata || {};
  const expectedOriginContext = options.returnTarget === 'ios' ? 'mobile_app' : 'web';
  if (
    !url
    || !/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(String(checkout?.id || ''))
    || checkout.client_reference_id !== user?.id
    || checkout.origin_context !== expectedOriginContext
    || checkout.success_url !== options.returnURLs?.success
    || checkout.cancel_url !== options.returnURLs?.cancel
    || metadata.xert_checkout_attempt_id !== options.checkoutAttemptID
    || metadata.checkout_attempt_id !== options.checkoutAttemptID
  ) {
    throw new Error('Stripe Checkout Session did not match the requested purchase.');
  }
  return url;
}

async function findReusableCheckout({
  admin, stripe, user, product, returnTarget, stripeMode, memberEmail, now = new Date(),
}) {
  const cutoff = new Date(now.getTime() - REUSABLE_CHECKOUT_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from('orders')
    .select('stripe_checkout_session_id,credit_total,credit_validity_days')
    .eq('user_id', user.id)
    .eq('product_id', product.id)
    .eq('status', 'pending')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) return null;
  for (const order of data || []) {
    if (!order.stripe_checkout_session_id) continue;
    if (
      order.credit_total !== product.sessions_count
      || order.credit_validity_days !== product.validity_days
    ) continue;
    try {
      const checkout = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      const url = reusableCheckoutURL(checkout, user, product, {
        returnTarget, stripeMode, memberEmail,
      });
      if (url) return { url, checkoutSessionID: checkout.id };
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
    credit_total: product.sessions_count,
    credit_validity_days: product.validity_days,
    stripe_checkout_session_id: checkout.id,
    stripe_payment_intent_id:
      typeof checkout.payment_intent === 'string'
        ? checkout.payment_intent
        : checkout.payment_intent?.id || null,
  };
}

export default async function handler(request, response) {
  const trace = createRequestTrace(response);
  response.setHeader(XERT_PAYMENT_CONTRACT_HEADER, XERT_PAYMENT_CONTRACT_VERSION);
  const { json } = trace;
  if (request.method === 'HEAD') return sendCheckoutEnvironmentStatus(response);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!inspectCheckoutEnvironment(process.env).ready) {
    return json({ error: 'Checkout service is unavailable.' }, 503);
  }

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json({ error: 'Invalid or expired session.' }, 401);

    const [
      fulfillmentReady,
      pendingOrderGuardReady,
      orderTermsReady,
      webhookLedgerReady,
      paymentDeliveryHealthy,
      settingsContractReady,
      activationDriftGuardReady,
      paymentActivationReady,
    ] = await Promise.all([
      paymentFulfillmentIsReady(admin),
      stripePendingOrderGuardIsReady(admin),
      stripeOrderTermsSnapshotIsReady(admin),
      stripeWebhookLedgerIsReady(admin),
      paymentFulfillmentDeliveryIsHealthy(admin),
      adminSettingsContractIsReady(admin),
      paymentActivationDriftGuardIsReady(admin),
      sessionPackPaymentsAreEnabled(admin),
    ]);

    if (!fulfillmentReady) {
      return json({
        error: 'Checkout is temporarily unavailable while payment services are being upgraded.',
      }, 503);
    }

    if (!pendingOrderGuardReady) {
      return json({
        error: 'Checkout is temporarily unavailable while payment order safeguards are being upgraded.',
      }, 503);
    }

    if (!orderTermsReady) {
      return json({
        error: 'Checkout is temporarily unavailable while purchased pack terms are being secured.',
      }, 503);
    }

    if (!webhookLedgerReady) {
      return json({
        error: 'Checkout is temporarily unavailable while payment delivery monitoring is being installed.',
      }, 503);
    }

    if (!paymentDeliveryHealthy) {
      return json({
        error: 'Checkout is temporarily paused while a payment delivery issue is being resolved.',
      }, 503);
    }

    if (!settingsContractReady) {
      return json({
        error: 'Checkout is temporarily unavailable while platform settings are being upgraded.',
      }, 503);
    }

    if (!activationDriftGuardReady) {
      return json({
        error: 'Checkout is temporarily unavailable while live payment settings are being secured.',
      }, 503);
    }

    if (!paymentActivationReady) {
      return json({
        error: 'Session pack purchases are temporarily unavailable because payment activation could not be verified.',
      }, 503);
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json({ error: 'Stripe is not configured.' }, 500);
    }
    const stripeMode = stripeModeForSecret(process.env.STRIPE_SECRET_KEY);
    if (stripeMode === 'unknown') return json({ error: 'Stripe key mode is not recognized.' }, 500);
    const stripe = createXertStripeClient(process.env.STRIPE_SECRET_KEY);

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
    let receiptDetails;
    try {
      receiptDetails = checkoutReceiptDetails(user, product);
    } catch (error) {
      return json({ error: error.message }, 409);
    }

    if (stripeMode === 'live' && !product.stripe_price_id) {
      return json({ error: 'This pack is not linked to a live Stripe Price yet.' }, 409);
    }

    const reusableCheckout = await findReusableCheckout({
      admin,
      stripe,
      user,
      product,
      returnTarget,
      stripeMode,
      memberEmail: receiptDetails.email,
    });
    if (reusableCheckout) {
      return json({
        url: reusableCheckout.url,
        checkout_session_id: reusableCheckout.checkoutSessionID,
        reused: true,
      });
    }

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

    const checkoutParameters = buildCheckoutSessionParameters({
      user,
      product,
      lineItem,
      returnTarget,
      returnURLs,
      receiptDetails,
      checkoutAttemptID,
    });
    const session = await stripe.checkout.sessions.create(checkoutParameters, {
      idempotencyKey: checkoutIdempotencyKey({
        attemptID: checkoutAttemptID,
        userID: user.id,
        productID: product.id,
        returnTarget,
      }),
    });

    let checkoutURL;
    try {
      checkoutURL = verifiedCreatedCheckoutURL(session, user, product, {
        returnTarget,
        returnURLs,
        stripeMode,
        memberEmail: receiptDetails.email,
        checkoutAttemptID,
      });
    } catch (error) {
      await stripe.checkout.sessions.expire(session.id).catch(() => {});
      throw error;
    }

    try {
      const { error: pendingOrderError } = await admin
        .from('orders')
        .upsert(pendingOrderForCheckout(session, user, product), {
          onConflict: 'stripe_checkout_session_id',
        });
      if (pendingOrderError) throw pendingOrderError;
    } catch {
      await stripe.checkout.sessions.expire(session.id).catch(() => {});
      const recordingError = /** @type {Error & { code?: string }} */ (
        new Error('Pending checkout order could not be saved.')
      );
      recordingError.code = CHECKOUT_RECORDING_FAILED;
      throw recordingError;
    }

    return json({ url: checkoutURL, checkout_session_id: session.id });
  } catch (e) {
    const failure = publicCheckoutFailure(e);
    console.error('Checkout request failed.', {
      requestId: trace.requestId,
      name: String(e?.name || 'Error'),
      code: String(e?.code || 'UNEXPECTED_CHECKOUT_ERROR'),
      type: String(e?.type || ''),
      stripeRequestId: String(e?.requestId || ''),
    });
    return json({ error: failure.message }, failure.status);
  }
}
