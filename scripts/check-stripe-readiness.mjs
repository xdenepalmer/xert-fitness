import { pathToFileURL } from 'node:url';
import {
  validateCanonicalServiceURL,
  validateSupabasePublicKey,
  XERT_SUPABASE_HOST,
  XERT_VERCEL_HOST,
} from '../src/lib/publicRuntimeConfig.js';

const DEFAULT_VERCEL_BASE_URL = 'https://xert-fitness.vercel.app';
const REFUND_RECONCILIATION_CAPABILITY = 'stripe_refund_reconciliation';
const CHECKOUT_RECONCILIATION_CAPABILITY = 'checkout_reconciliation';
const PAYMENT_FULFILLMENT_CAPABILITY = 'stripe_payment_fulfillment';
const GUARDED_PAYMENT_ACTIVATION_CAPABILITY = 'guarded_payment_activation';
const ADMIN_SETTINGS_SINGLETON_CAPABILITY = 'admin_settings_singleton';
const STRIPE_PENDING_ORDER_CAPABILITY = 'stripe_pending_order_guard';
const STRIPE_ORDER_TERMS_CAPABILITY = 'stripe_order_terms_snapshot';
const STRIPE_WEBHOOK_LEDGER_CAPABILITY = 'stripe_webhook_ledger';
const RESPONSE_PREVIEW_LIMIT = 180;

async function probe(fetchImpl, url, { responseLimit = RESPONSE_PREVIEW_LIMIT, ...options }) {
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, responseLimit);
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: error?.message || 'No response received.' };
  }
}

function statusCheck(key, label, result, expectedStatus, remediation) {
  return {
    key,
    label,
    ready: result.status === expectedStatus,
    detail: result.status === expectedStatus
      ? `HTTP ${expectedStatus}`
      : `Expected HTTP ${expectedStatus}; received ${result.status || 'no response'}${result.body ? `: ${result.body}` : ''}`,
    remediation: result.status === expectedStatus ? null : remediation,
  };
}

export async function inspectStripeReadiness({ environment = process.env, fetchImpl = fetch } = {}) {
  const expectedVercelHost = environment.EXPECTED_VERCEL_HOST || XERT_VERCEL_HOST;
  const expectedSupabaseHost = environment.EXPECTED_SUPABASE_HOST || XERT_SUPABASE_HOST;
  const vercelBaseURL = validateCanonicalServiceURL(
    environment.VERCEL_BASE_URL || DEFAULT_VERCEL_BASE_URL,
    'VERCEL_BASE_URL',
    expectedVercelHost
  );
  const supabaseURL = validateCanonicalServiceURL(
    environment.SUPABASE_URL || environment.VITE_SUPABASE_URL,
    'SUPABASE_URL',
    expectedSupabaseHost
  );
  const anonKey = String(environment.SUPABASE_ANON_KEY || environment.VITE_SUPABASE_ANON_KEY || '');
  validateSupabasePublicKey(anonKey);

  const jsonHeaders = { 'Content-Type': 'application/json' };
  const [environmentGate, checkout, refund, reconciliation, webhook, capabilities] = await Promise.all([
    probe(fetchImpl, `${vercelBaseURL}/api/checkout`, { method: 'HEAD' }),
    probe(fetchImpl, `${vercelBaseURL}/api/checkout`, {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: 'Bearer xert-readiness-invalid-token' },
      body: '{}',
    }),
    probe(fetchImpl, `${vercelBaseURL}/api/admin-refund-order`, {
      method: 'POST', headers: jsonHeaders, body: '{}',
    }),
    probe(fetchImpl, `${vercelBaseURL}/api/admin-reconcile-order`, {
      method: 'POST', headers: jsonHeaders, body: '{}',
    }),
    probe(fetchImpl, `${vercelBaseURL}/api/stripe-webhook`, {
      method: 'POST',
      headers: { ...jsonHeaders, 'Stripe-Signature': 't=0,v1=xert-readiness-invalid-signature' },
      body: '{}',
    }),
    probe(fetchImpl, `${supabaseURL}/rest/v1/rpc/xert_public_capabilities`, {
      method: 'POST',
      headers: { ...jsonHeaders, apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: '{}',
      responseLimit: 32_768,
    }),
  ]);

  const checks = [
    statusCheck(
      'environment',
      'Commerce environment gate',
      environmentGate,
      204,
      'Add the canonical APP_BASE_URL, Supabase service role, Stripe secret, and Stripe webhook secret to Vercel Production, then redeploy.'
    ),
    statusCheck(
      'checkout',
      'Authenticated checkout boundary',
      checkout,
      401,
      "Add SUPABASE_SERVICE_ROLE_KEY to Vercel Production, then redeploy."
    ),
    statusCheck(
      'refund',
      'Authenticated refund boundary',
      refund,
      401,
      "Verify the protected admin refund function is deployed from main."
    ),
    statusCheck(
      'reconciliation',
      'Authenticated reconciliation boundary',
      reconciliation,
      401,
      "Verify the protected admin reconciliation function is deployed from main."
    ),
    statusCheck(
      'webhook',
      'Stripe webhook signature verification',
      webhook,
      400,
      "Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to Vercel Production, then redeploy."
    ),
  ];

  let capabilityReady = false;
  let refundReconciliationReady = false;
  let checkoutReconciliationReady = false;
  let activationGuardReady = false;
  let settingsContractReady = false;
  let pendingOrderGuardReady = false;
  let orderTermsReady = false;
  let webhookLedgerReady = false;
  let capabilityDetail;
  let refundReconciliationDetail;
  let checkoutReconciliationDetail;
  let activationGuardDetail;
  let settingsContractDetail;
  let pendingOrderGuardDetail;
  let orderTermsDetail;
  let webhookLedgerDetail;
  if (capabilities.status !== 200) {
    capabilityDetail = `Capability RPC returned HTTP ${capabilities.status || 'no response'}${capabilities.body ? `: ${capabilities.body}` : ''}`;
    refundReconciliationDetail = capabilityDetail;
    checkoutReconciliationDetail = capabilityDetail;
    activationGuardDetail = capabilityDetail;
    settingsContractDetail = capabilityDetail;
    pendingOrderGuardDetail = capabilityDetail;
    orderTermsDetail = capabilityDetail;
    webhookLedgerDetail = capabilityDetail;
  } else {
    try {
      const rows = JSON.parse(capabilities.body || '[]');
      const installed = new Set(Array.isArray(rows) ? rows.map(row => row?.capability) : []);
      capabilityReady = installed.has(PAYMENT_FULFILLMENT_CAPABILITY);
      refundReconciliationReady = installed.has(REFUND_RECONCILIATION_CAPABILITY);
      checkoutReconciliationReady = installed.has(CHECKOUT_RECONCILIATION_CAPABILITY);
      activationGuardReady = installed.has(GUARDED_PAYMENT_ACTIVATION_CAPABILITY);
      settingsContractReady = installed.has(ADMIN_SETTINGS_SINGLETON_CAPABILITY);
      pendingOrderGuardReady = installed.has(STRIPE_PENDING_ORDER_CAPABILITY);
      orderTermsReady = installed.has(STRIPE_ORDER_TERMS_CAPABILITY);
      webhookLedgerReady = installed.has(STRIPE_WEBHOOK_LEDGER_CAPABILITY);
      capabilityDetail = capabilityReady
        ? `${PAYMENT_FULFILLMENT_CAPABILITY} installed`
        : `${PAYMENT_FULFILLMENT_CAPABILITY} is missing`;
      refundReconciliationDetail = refundReconciliationReady
        ? `${REFUND_RECONCILIATION_CAPABILITY} installed`
        : `${REFUND_RECONCILIATION_CAPABILITY} is missing`;
      checkoutReconciliationDetail = checkoutReconciliationReady
        ? `${CHECKOUT_RECONCILIATION_CAPABILITY} installed`
        : `${CHECKOUT_RECONCILIATION_CAPABILITY} is missing`;
      activationGuardDetail = activationGuardReady
        ? `${GUARDED_PAYMENT_ACTIVATION_CAPABILITY} installed`
        : `${GUARDED_PAYMENT_ACTIVATION_CAPABILITY} is missing`;
      settingsContractDetail = settingsContractReady
        ? `${ADMIN_SETTINGS_SINGLETON_CAPABILITY} installed`
        : `${ADMIN_SETTINGS_SINGLETON_CAPABILITY} is missing`;
      pendingOrderGuardDetail = pendingOrderGuardReady
        ? `${STRIPE_PENDING_ORDER_CAPABILITY} installed`
        : `${STRIPE_PENDING_ORDER_CAPABILITY} is missing`;
      orderTermsDetail = orderTermsReady
        ? `${STRIPE_ORDER_TERMS_CAPABILITY} installed`
        : `${STRIPE_ORDER_TERMS_CAPABILITY} is missing`;
      webhookLedgerDetail = webhookLedgerReady
        ? `${STRIPE_WEBHOOK_LEDGER_CAPABILITY} installed`
        : `${STRIPE_WEBHOOK_LEDGER_CAPABILITY} is missing`;
    } catch {
      capabilityDetail = 'Capability RPC returned malformed JSON.';
      refundReconciliationDetail = capabilityDetail;
      checkoutReconciliationDetail = capabilityDetail;
      activationGuardDetail = capabilityDetail;
      settingsContractDetail = capabilityDetail;
      pendingOrderGuardDetail = capabilityDetail;
      orderTermsDetail = capabilityDetail;
      webhookLedgerDetail = capabilityDetail;
    }
  }
  checks.push({
    key: 'refund-reconciliation-contract',
    label: 'Atomic Stripe refund reconciliation',
    ready: refundReconciliationReady,
    detail: refundReconciliationDetail,
    remediation: refundReconciliationReady
      ? null
      : 'Apply supabase/migrations/20260713020000_stripe_refund_reconciliation.sql to the XERT Supabase project.',
  });
  checks.push({
    key: 'checkout-reconciliation-contract',
    label: 'Recoverable Stripe checkout reconciliation',
    ready: checkoutReconciliationReady,
    detail: checkoutReconciliationDetail,
    remediation: checkoutReconciliationReady
      ? null
      : 'Apply supabase/migrations/20260713030000_checkout_reconciliation.sql to the XERT Supabase project.',
  });
  checks.push({
    key: 'fulfillment',
    label: 'Atomic Stripe fulfillment contract',
    ready: capabilityReady,
    detail: capabilityDetail,
    remediation: capabilityReady
      ? null
      : 'Apply supabase/migrations/20260715010000_stripe_payment_fulfillment.sql to the XERT Supabase project.',
  });
  checks.push({
    key: 'webhook-ledger',
    label: 'Durable Stripe delivery ledger',
    ready: webhookLedgerReady,
    detail: webhookLedgerDetail,
    remediation: webhookLedgerReady
      ? null
      : 'Apply supabase/migrations/20260716050000_stripe_webhook_ledger.sql to the XERT Supabase project.',
  });
  checks.push({
    key: 'activation-guard',
    label: 'Server-authoritative payment activation',
    ready: activationGuardReady,
    detail: activationGuardDetail,
    remediation: activationGuardReady
      ? null
      : 'Apply supabase/migrations/20260716010000_guarded_payment_activation.sql to the XERT Supabase project.',
  });
  checks.push({
    key: 'settings-contract',
    label: 'Versioned singleton platform settings',
    ready: settingsContractReady,
    detail: settingsContractDetail,
    remediation: settingsContractReady
      ? null
      : 'Apply supabase/migrations/20260716020000_admin_settings_singleton.sql to the XERT Supabase project.',
  });
  checks.push({
    key: 'pending-order-guard',
    label: 'Recorded-order Stripe fulfillment',
    ready: pendingOrderGuardReady,
    detail: pendingOrderGuardDetail,
    remediation: pendingOrderGuardReady
      ? null
      : 'Apply supabase/migrations/20260716030000_stripe_pending_order_guard.sql to the XERT Supabase project.',
  });
  checks.push({
    key: 'order-terms',
    label: 'Immutable purchased credit terms',
    ready: orderTermsReady,
    detail: orderTermsDetail,
    remediation: orderTermsReady
      ? null
      : 'Apply supabase/migrations/20260716040000_stripe_order_terms_snapshot.sql to the XERT Supabase project.',
  });

  return { ready: checks.every(check => check.ready), checks };
}

export function printReport(report) {
  for (const check of report.checks) {
    console.log(`${check.ready ? 'PASS' : 'FAIL'}  ${check.label}: ${check.detail}`);
    if (!check.ready && check.remediation) console.log(`      NEXT: ${check.remediation}`);
  }
  console.log(report.ready ? 'Stripe production boundary is ready.' : 'Stripe production boundary is not ready.');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  inspectStripeReadiness()
    .then(report => {
      printReport(report);
      if (!report.ready) process.exitCode = 1;
    })
    .catch(error => {
      console.error(`Stripe readiness check failed: ${error.message}`);
      process.exitCode = 1;
    });
}
