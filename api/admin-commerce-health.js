import { createClient } from '@supabase/supabase-js';
import { assertCheckoutProduct, assertStripePriceMatchesProduct, paymentFulfillmentIsReady } from './checkout.js';
import { createRequestTrace, requestHeader, requestJson } from './http.js';
import {
  inspectCommerceRuntimeEnvironment,
  stripeModeForSecret,
} from '../src/lib/commerceRuntime.js';
import {
  inspectPaymentActivationReceipt,
  loadPaymentActivationHealth,
} from '../src/lib/paymentActivation.js';
import { processStripeEvent } from './stripe-webhook.js';
import { createXertStripeClient } from '../src/lib/serverStripeClient.js';

export { inspectPaymentActivationReceipt, loadPaymentActivationHealth };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REFUND_RECONCILIATION_CAPABILITY = 'stripe_refund_reconciliation';
const CHECKOUT_RECONCILIATION_CAPABILITY = 'checkout_reconciliation';
const PAYMENT_ACTIVATION_CAPABILITY = 'guarded_payment_activation';
const ADMIN_SETTINGS_SINGLETON_CAPABILITY = 'admin_settings_singleton';
const PAYMENT_ACTIVATION_DRIFT_CAPABILITY = 'payment_activation_drift_guard';
const STRIPE_PENDING_ORDER_CAPABILITY = 'stripe_pending_order_guard';
const STRIPE_ORDER_TERMS_CAPABILITY = 'stripe_order_terms_snapshot';
const STRIPE_WEBHOOK_LEDGER_CAPABILITY = 'stripe_webhook_ledger';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.expired',
  'checkout.session.async_payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
];
const STRIPE_OPERATOR_REVIEW_CODES = [
  'PARTIAL_REFUND_REQUIRES_REVIEW',
  'PAYMENT_DISPUTE_REQUIRES_REVIEW',
  'PAYMENT_DISPUTE_LOST_REQUIRES_REVIEW',
];

export function inspectCommerceEnvironment(environment = {}) {
  const { ready, invalid } = inspectCommerceRuntimeEnvironment(environment, {
    requireWebhookSecret: true,
    requireAppBaseURL: true,
  });
  return { ready, missing: invalid };
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

export function normalizeStripeReviewResolutionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_STRIPE_REVIEW_RESOLUTION');
  const eventId = String(body.event_id || '').trim();
  const errorCode = String(body.error_code || '').trim();
  if (
    body.action !== 'resolve_stripe_review'
    || body.confirmation !== 'MARK HANDLED'
    || !/^evt_[A-Za-z0-9_]+$/.test(eventId)
    || eventId.length > 255
    || !STRIPE_OPERATOR_REVIEW_CODES.includes(errorCode)
  ) {
    throw new Error('INVALID_STRIPE_REVIEW_RESOLUTION');
  }
  return { eventId, errorCode };
}

export function normalizeStripeRetryRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_STRIPE_RETRY');
  const eventId = String(body.event_id || '').trim();
  if (
    body.action !== 'retry_stripe_event'
    || body.confirmation !== 'RETRY EVENT'
    || !/^evt_[A-Za-z0-9_]+$/.test(eventId)
    || eventId.length > 255
  ) {
    throw new Error('INVALID_STRIPE_RETRY');
  }
  return { eventId };
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

export function stripeIncidentResolution(errorCode) {
  if (errorCode === 'PARTIAL_REFUND_REQUIRES_REVIEW') {
    return 'Review the refund in Stripe, then adjust or revoke the member credits from the linked order.';
  }
  if (errorCode === 'PAYMENT_DISPUTE_REQUIRES_REVIEW') {
    return 'Open the dispute in Stripe, preserve the member and order evidence, then decide whether access or credits must be suspended.';
  }
  if (errorCode === 'PAYMENT_DISPUTE_LOST_REQUIRES_REVIEW') {
    return 'Stripe closed this dispute as lost. Review the linked order, member access and remaining credits, then record the accounting outcome.';
  }
  return null;
}

export async function inspectWebhookDeliveryHealth(admin, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = now.getTime() - 10 * 60 * 1000;
  const fields = 'event_id,event_type,status,attempts,order_id,last_received_at,last_error_code';
  const [recentResult, reviewResult] = await Promise.all([
    admin
      .from('stripe_webhook_events')
      .select(fields)
      .gte('last_received_at', since)
      .order('last_received_at', { ascending: false })
      .limit(500),
    admin
      .from('stripe_webhook_events')
      .select(fields)
      .eq('status', 'failed')
      .in('last_error_code', STRIPE_OPERATOR_REVIEW_CODES)
      .order('last_received_at', { ascending: false })
      .limit(100),
  ]);
  if (recentResult.error || reviewResult.error) {
    return {
      ready: false, available: false, received: 0, failed: 0,
      stale_processing: 0, retries: 0, incidents: [],
      issue: 'Stripe webhook delivery history could not be loaded.',
    };
  }
  const rows = recentResult.data || [];
  const reviewRows = reviewResult.data || [];
  const incidentRows = [...reviewRows, ...rows].filter((row, index, all) => (
    all.findIndex(candidate => candidate.event_id === row.event_id) === index
  ));
  const failed = incidentRows.filter(row => row.status === 'failed').length;
  const staleProcessing = rows.filter(row => (
    row.status === 'processing' && Date.parse(row.last_received_at) < staleBefore
  )).length;
  const retries = rows.reduce((total, row) => total + Math.max(0, Number(row.attempts || 0) - 1), 0);
  const incidents = incidentRows
    .filter(row => (
      row.status === 'failed'
      || (row.status === 'processing' && Date.parse(row.last_received_at) < staleBefore)
    ))
    .slice(0, 10)
    .map(row => {
      const errorCode = row.status === 'failed'
        ? String(row.last_error_code || 'WEBHOOK_PROCESSING_FAILED').slice(0, 120)
        : null;
      const resolution = stripeIncidentResolution(errorCode);
      return {
        event_id: String(row.event_id || '').slice(0, 255),
        event_type: String(row.event_type || '').slice(0, 160),
        status: row.status === 'failed' ? 'failed' : 'stalled',
        attempts: Math.max(1, Math.min(1_000, Number(row.attempts || 1))),
        order_id: UUID_PATTERN.test(String(row.order_id || '')) ? row.order_id : null,
        last_received_at: Number.isFinite(Date.parse(row.last_received_at)) ? row.last_received_at : null,
        error_code: errorCode,
        ...(resolution ? { resolution } : {}),
      };
    });
  const recentTruncated = rows.length === 500;
  const reviewTruncated = reviewRows.length === 100;
  const truncated = recentTruncated || reviewTruncated;
  const ready = failed === 0 && staleProcessing === 0 && !truncated;
  return {
    ready,
    available: true,
    received: rows.length,
    failed,
    stale_processing: staleProcessing,
    retries,
    incidents,
    issue: reviewTruncated
      ? 'The unresolved Stripe operator review queue reached its safety limit.'
      : recentTruncated
        ? 'Stripe webhook delivery history exceeded the 24-hour health window limit.'
      : failed > 0
        ? `${failed} Stripe webhook deliver${failed === 1 ? 'y has' : 'ies have'} an unresolved failure.`
        : staleProcessing > 0
          ? `${staleProcessing} Stripe webhook deliver${staleProcessing === 1 ? 'y is' : 'ies are'} still processing.`
          : null,
  };
}

export async function inspectCommerceHealth({ admin, products, environment: runtimeEnvironment = process.env, stripe: stripeClient }) {
  const activeProducts = products || [];
  const environment = inspectCommerceEnvironment(runtimeEnvironment);
  const [
    fulfillmentReady, refundReconciliationReady, checkoutReconciliationReady,
    activationGuardReady, settingsContractReady, activationDriftGuardReady, pendingOrderGuardReady,
    orderTermsReady, webhookLedgerReady, paymentActivation,
  ] = await Promise.all([
    paymentFulfillmentIsReady(admin),
    schemaCapabilityIsReady(admin, REFUND_RECONCILIATION_CAPABILITY),
    schemaCapabilityIsReady(admin, CHECKOUT_RECONCILIATION_CAPABILITY),
    schemaCapabilityIsReady(admin, PAYMENT_ACTIVATION_CAPABILITY),
    schemaCapabilityIsReady(admin, ADMIN_SETTINGS_SINGLETON_CAPABILITY),
    schemaCapabilityIsReady(admin, PAYMENT_ACTIVATION_DRIFT_CAPABILITY),
    schemaCapabilityIsReady(admin, STRIPE_PENDING_ORDER_CAPABILITY),
    schemaCapabilityIsReady(admin, STRIPE_ORDER_TERMS_CAPABILITY),
    schemaCapabilityIsReady(admin, STRIPE_WEBHOOK_LEDGER_CAPABILITY),
    loadPaymentActivationHealth(admin),
  ]);
  const webhookDelivery = webhookLedgerReady
    ? await inspectWebhookDeliveryHealth(admin)
    : {
        ready: false, available: false, received: 0, failed: 0,
        stale_processing: 0, retries: 0, incidents: [],
        issue: 'Stripe webhook delivery ledger is not installed.',
      };
  const databaseIssues = [
    ...(fulfillmentReady ? [] : [{ slug: 'database', reason: 'Atomic Stripe payment fulfillment is not installed.' }]),
    ...(refundReconciliationReady ? [] : [{ slug: 'database', reason: 'Atomic Stripe refund reconciliation is not installed.' }]),
    ...(checkoutReconciliationReady ? [] : [{ slug: 'database', reason: 'Stripe checkout recovery reconciliation is not installed.' }]),
    ...(activationGuardReady ? [] : [{ slug: 'database', reason: 'Guarded payment activation is not installed.' }]),
    ...(settingsContractReady ? [] : [{ slug: 'database', reason: 'Versioned singleton platform settings are not installed.' }]),
    ...(activationDriftGuardReady ? [] : [{ slug: 'database', reason: 'Live payment settings drift protection is not installed.' }]),
    ...(pendingOrderGuardReady ? [] : [{ slug: 'database', reason: 'Stripe pending-order fulfillment guard is not installed.' }]),
    ...(orderTermsReady ? [] : [{ slug: 'database', reason: 'Immutable Stripe order terms are not installed.' }]),
    ...(webhookLedgerReady ? [] : [{ slug: 'database', reason: 'Stripe webhook delivery ledger is not installed.' }]),
    ...(webhookLedgerReady && !webhookDelivery.ready ? [{ slug: 'webhook-delivery', reason: webhookDelivery.issue }].filter(issue => issue.reason) : []),
    ...(paymentActivation.activation_receipt.required && !paymentActivation.activation_receipt.ready
      ? [{ slug: 'activation-receipt', reason: paymentActivation.activation_receipt.issue }]
      : []),
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
      refund_reconciliation_ready: refundReconciliationReady,
      checkout_reconciliation_ready: checkoutReconciliationReady,
      activation_guard_ready: activationGuardReady,
      settings_contract_ready: settingsContractReady,
      activation_drift_guard_ready: activationDriftGuardReady,
      pending_order_guard_ready: pendingOrderGuardReady,
      order_terms_ready: orderTermsReady,
      webhook_ledger_ready: webhookLedgerReady,
      webhook_delivery: webhookDelivery,
      ...paymentActivation,
    };
  }

  const stripe = stripeClient || createXertStripeClient(runtimeEnvironment.STRIPE_SECRET_KEY);
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
      && refundReconciliationReady
      && checkoutReconciliationReady
      && activationGuardReady
      && settingsContractReady
      && activationDriftGuardReady
      && pendingOrderGuardReady
      && orderTermsReady
      && webhookLedgerReady
      && webhookDelivery.ready
      && paymentActivation.payment_switch.ready
      && paymentActivation.activation_receipt.ready,
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
    refund_reconciliation_ready: refundReconciliationReady,
    checkout_reconciliation_ready: checkoutReconciliationReady,
    activation_guard_ready: activationGuardReady,
    settings_contract_ready: settingsContractReady,
    activation_drift_guard_ready: activationDriftGuardReady,
    pending_order_guard_ready: pendingOrderGuardReady,
    order_terms_ready: orderTermsReady,
    webhook_ledger_ready: webhookLedgerReady,
    webhook_delivery: webhookDelivery,
    ...paymentActivation,
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

export async function resolveStripeOperatorReview(admin, review, resolvedAt = new Date()) {
  const { data, error } = await admin
    .from('stripe_webhook_events')
    .update({ status: 'ignored', finished_at: resolvedAt.toISOString() })
    .eq('event_id', review.eventId)
    .eq('status', 'failed')
    .eq('last_error_code', review.errorCode)
    .select('event_id,status')
    .maybeSingle();
  if (error) throw new Error('STRIPE_REVIEW_RESOLUTION_FAILED');
  if (data?.event_id !== review.eventId || data?.status !== 'ignored') {
    throw new Error('STRIPE_REVIEW_RESOLUTION_STALE');
  }
  return data;
}

export async function retryStripeWebhookEvent(admin, stripe, retry, {
  secretKey = process.env.STRIPE_SECRET_KEY,
  now = new Date(),
} = {}) {
  const { data: ledgerEvent, error } = await admin
    .from('stripe_webhook_events')
    .select('event_id,event_type,livemode,status,last_received_at,last_error_code')
    .eq('event_id', retry.eventId)
    .maybeSingle();
  if (error) throw new Error('STRIPE_RETRY_LOOKUP_FAILED');
  if (!ledgerEvent) throw new Error('STRIPE_RETRY_NOT_FOUND');
  if (STRIPE_OPERATOR_REVIEW_CODES.includes(ledgerEvent.last_error_code)) {
    throw new Error('STRIPE_RETRY_REQUIRES_OPERATOR_REVIEW');
  }

  const staleBefore = now.getTime() - 10 * 60 * 1000;
  const stalled = ledgerEvent.status === 'processing'
    && Number.isFinite(Date.parse(ledgerEvent.last_received_at))
    && Date.parse(ledgerEvent.last_received_at) < staleBefore;
  if (ledgerEvent.status !== 'failed' && !stalled) {
    throw new Error('STRIPE_RETRY_STALE');
  }

  const event = await stripe.events.retrieve(retry.eventId);
  if (
    event?.id !== ledgerEvent.event_id
    || event?.type !== ledgerEvent.event_type
    || event?.livemode !== ledgerEvent.livemode
  ) {
    throw new Error('STRIPE_RETRY_IDENTITY_MISMATCH');
  }
  return processStripeEvent(admin, event, { secretKey, receivedAt: now });
}

export default async function handler(request, response) {
  const trace = createRequestTrace(response);
  const { json } = trace;
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  if (!inspectCommerceRuntimeEnvironment(process.env, { requireStripeSecret: false }).ready) {
    return json({ error: 'Commerce health service is unavailable.' }, 503);
  }

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);
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
  let reviewResolution;
  let webhookRetry;
  if (request.method === 'POST') {
    try {
      const body = await requestJson(request);
      if (body?.action === 'resolve_stripe_review') {
        reviewResolution = normalizeStripeReviewResolutionRequest(body);
      } else if (body?.action === 'retry_stripe_event') {
        webhookRetry = normalizeStripeRetryRequest(body);
      } else {
        activation = normalizePaymentActivationRequest(body);
      }
    } catch (error) {
      if (error.message === 'INVALID_STRIPE_REVIEW_RESOLUTION') {
        return json({ error: 'Stripe incident resolution request is invalid.' }, 400);
      }
      if (error.message === 'INVALID_STRIPE_RETRY') {
        return json({ error: 'Stripe event retry request is invalid.' }, 400);
      }
      if (error.message === 'PAYMENT_ACTIVATION_NOT_CONFIRMED') {
        return json({ error: 'Type ENABLE PAYMENTS to confirm activation.' }, 400);
      }
      return json({ error: 'Payment activation request is invalid.' }, 400);
    }
  }

  if (reviewResolution) {
    try {
      const resolved = await resolveStripeOperatorReview(admin, reviewResolution);
      console.info('Stripe operator review resolved.', {
        requestId: trace.requestId,
        eventId: resolved.event_id,
        actorId: user.id,
      });
      return json(resolved);
    } catch (error) {
      if (error.message === 'STRIPE_REVIEW_RESOLUTION_STALE') {
        return json({ error: 'This Stripe incident changed or was already handled. Refresh before continuing.' }, 409);
      }
      return json({ error: 'The Stripe incident could not be marked handled.' }, 500);
    }
  }

  if (webhookRetry) {
    if (stripeModeForSecret(process.env.STRIPE_SECRET_KEY) === 'unknown') {
      return json({ error: 'Stripe event recovery is unavailable.' }, 503);
    }
    try {
      const stripe = createXertStripeClient(process.env.STRIPE_SECRET_KEY);
      const result = await retryStripeWebhookEvent(admin, stripe, webhookRetry);
      console.info('Stripe webhook event retried by owner.', {
        requestId: trace.requestId,
        eventId: webhookRetry.eventId,
        actorId: user.id,
        duplicate: result.duplicate,
        requiresReview: result.requiresReview,
      });
      return json({
        event_id: webhookRetry.eventId,
        status: result.requiresReview ? 'failed' : result.handled ? 'processed' : 'ignored',
        duplicate: result.duplicate,
      });
    } catch (error) {
      if (error.message === 'STRIPE_RETRY_NOT_FOUND') {
        return json({ error: 'This Stripe event is not recorded in XERT.' }, 404);
      }
      if (error.message === 'STRIPE_RETRY_REQUIRES_OPERATOR_REVIEW') {
        return json({ error: 'This incident requires owner review and cannot be automatically retried.' }, 409);
      }
      if (['STRIPE_RETRY_STALE', 'STRIPE_RETRY_IDENTITY_MISMATCH'].includes(error.message)) {
        return json({ error: 'This Stripe incident changed. Refresh Operations Health before retrying.' }, 409);
      }
      return json({ error: 'Stripe could not safely retry this event. The incident remains unresolved.' }, 500);
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
