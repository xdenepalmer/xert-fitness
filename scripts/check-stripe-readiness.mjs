import { pathToFileURL } from 'node:url';

const DEFAULT_VERCEL_BASE_URL = 'https://xert-fitness.vercel.app';
const PAYMENT_FULFILLMENT_CAPABILITY = 'stripe_payment_fulfillment';
const RESPONSE_PREVIEW_LIMIT = 180;

function httpsURL(value, name) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error(`${name} must be a credential-free HTTPS URL.`);
  }
  return url.origin;
}

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

function statusCheck(key, label, result, expectedStatus) {
  return {
    key,
    label,
    ready: result.status === expectedStatus,
    detail: result.status === expectedStatus
      ? `HTTP ${expectedStatus}`
      : `Expected HTTP ${expectedStatus}; received ${result.status || 'no response'}${result.body ? `: ${result.body}` : ''}`,
  };
}

export async function inspectStripeReadiness({ environment = process.env, fetchImpl = fetch } = {}) {
  const vercelBaseURL = httpsURL(environment.VERCEL_BASE_URL || DEFAULT_VERCEL_BASE_URL, 'VERCEL_BASE_URL');
  const supabaseURL = httpsURL(environment.SUPABASE_URL || environment.VITE_SUPABASE_URL, 'SUPABASE_URL');
  const anonKey = String(environment.SUPABASE_ANON_KEY || environment.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!anonKey || /\s/.test(anonKey)) {
    throw new Error('SUPABASE_ANON_KEY must be configured as one line.');
  }

  const jsonHeaders = { 'Content-Type': 'application/json' };
  const [checkout, refund, reconciliation, webhook, capabilities] = await Promise.all([
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
    statusCheck('checkout', 'Authenticated checkout boundary', checkout, 401),
    statusCheck('refund', 'Authenticated refund boundary', refund, 401),
    statusCheck('reconciliation', 'Authenticated reconciliation boundary', reconciliation, 401),
    statusCheck('webhook', 'Stripe webhook signature verification', webhook, 400),
  ];

  let capabilityReady = false;
  let capabilityDetail;
  if (capabilities.status !== 200) {
    capabilityDetail = `Capability RPC returned HTTP ${capabilities.status || 'no response'}${capabilities.body ? `: ${capabilities.body}` : ''}`;
  } else {
    try {
      const rows = JSON.parse(capabilities.body || '[]');
      capabilityReady = Array.isArray(rows)
        && rows.some(row => row?.capability === PAYMENT_FULFILLMENT_CAPABILITY);
      capabilityDetail = capabilityReady
        ? `${PAYMENT_FULFILLMENT_CAPABILITY} installed`
        : `${PAYMENT_FULFILLMENT_CAPABILITY} is missing`;
    } catch {
      capabilityDetail = 'Capability RPC returned malformed JSON.';
    }
  }
  checks.push({
    key: 'fulfillment',
    label: 'Atomic Stripe fulfillment contract',
    ready: capabilityReady,
    detail: capabilityDetail,
  });

  return { ready: checks.every(check => check.ready), checks };
}

function printReport(report) {
  for (const check of report.checks) {
    console.log(`${check.ready ? 'PASS' : 'FAIL'}  ${check.label}: ${check.detail}`);
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
