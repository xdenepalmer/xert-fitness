import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { inspectStripeReadiness, printReport } from './check-stripe-readiness.mjs';
import { inspectCatalogLinkEnvironment, linkStripeCatalog } from './link-stripe-catalog.mjs';
import { inspectStripeWebhookEndpoints, loadPaymentActivationHealth } from '../api/admin-commerce-health.js';

export function parseStripeLaunchArgs(args) {
  const modeArgs = args.filter(arg => arg.startsWith('--mode='));
  if (modeArgs.length !== 1) {
    throw new Error('Choose an explicit Stripe mode with --mode=test or --mode=live.');
  }
  const modeArg = modeArgs[0];
  const mode = modeArg?.slice('--mode='.length);
  if (!['test', 'live'].includes(mode)) {
    throw new Error('Choose an explicit Stripe mode with --mode=test or --mode=live.');
  }
  const expectationArgs = args.filter(arg => arg.startsWith('--expect-payments='));
  if (expectationArgs.length > 1) throw new Error('Choose one expected payment-switch state.');
  const expectPayments = expectationArgs[0]?.slice('--expect-payments='.length) || 'paused';
  if (!['paused', 'enabled'].includes(expectPayments)) {
    throw new Error('Expected payments must be paused or enabled.');
  }
  const unknown = args.filter(arg => (
    !arg.startsWith('--mode=') && !arg.startsWith('--expect-payments=')
  ));
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown[0]}`);
  return { mode, expectPayments };
}

export function inspectPaymentSwitch(paymentActivation, expectedState) {
  const state = paymentActivation?.payment_switch?.state || 'unknown';
  const receipt = paymentActivation?.activation_receipt || {
    required: expectedState === 'enabled', ready: false, activated_at: null,
  };
  const stateReady = paymentActivation?.payment_switch?.ready === true && state === expectedState;
  const receiptReady = expectedState !== 'enabled' || receipt.ready === true;
  return {
    ready: stateReady && receiptReady,
    state,
    expected: expectedState,
    receipt,
    issue: !stateReady
      ? `Platform payments are ${state}; this gate requires ${expectedState}.`
      : receiptReady ? null : receipt.issue || 'Payment activation receipt is missing.',
  };
}

export async function inspectStripeLaunchPreflight({
  environment = process.env,
  mode,
  expectPayments = 'paused',
  inspectBoundary = inspectStripeReadiness,
  catalogInspector,
  webhookInspector,
  paymentSwitchInspector,
} = {}) {
  if (!['test', 'live'].includes(mode)) throw new Error('Stripe launch mode is required.');
  if (!['paused', 'enabled'].includes(expectPayments)) throw new Error('Expected payment-switch state is required.');
  const privateEnvironment = inspectCatalogLinkEnvironment(environment, mode);
  if (!privateEnvironment.ready) {
    return {
      ready: false,
      mode,
      expectPayments,
      environmentIssues: privateEnvironment.issues,
      boundary: null,
      catalog: null,
      webhook: null,
      paymentSwitch: null,
      catalogMessages: [],
    };
  }

  const inspectCatalog = catalogInspector || (async ({ log }) => {
    const stripe = new Stripe(privateEnvironment.stripeSecretKey, { maxNetworkRetries: 2, timeout: 20_000 });
    const supabase = createClient(privateEnvironment.supabaseUrl, privateEnvironment.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return linkStripeCatalog({ stripe, supabase, mode, apply: false, replaceExisting: false, log });
  });
  const inspectWebhook = webhookInspector || (async () => {
    const stripe = new Stripe(privateEnvironment.stripeSecretKey, { maxNetworkRetries: 2, timeout: 20_000 });
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    return inspectStripeWebhookEndpoints(endpoints.data, environment.APP_BASE_URL || '');
  });
  const inspectSwitch = paymentSwitchInspector || (async () => {
    const supabase = createClient(privateEnvironment.supabaseUrl, privateEnvironment.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const activation = await loadPaymentActivationHealth(supabase);
    return inspectPaymentSwitch(activation, expectPayments);
  });
  const catalogMessages = [];
  const [boundary, catalog, webhook] = await Promise.all([
    inspectBoundary({ environment }),
    inspectCatalog({ environment, mode, log: message => catalogMessages.push(message) }),
    inspectWebhook({ environment, mode }),
  ]);
  // Read the kill switch last so a toggle during slower remote checks cannot
  // produce a stale pre- or post-activation verdict.
  const paymentSwitch = await inspectSwitch({ environment, mode, expectPayments });
  const catalogReady = catalog.productCount > 0
    && catalog.verifiedCount === catalog.productCount
    && catalog.plannedCount === 0;

  return {
    ready: boundary.ready && catalogReady && webhook.ready && paymentSwitch.ready,
    mode,
    expectPayments,
    environmentIssues: [],
    boundary,
    catalog: { ...catalog, ready: catalogReady },
    webhook,
    paymentSwitch,
    catalogMessages,
  };
}

export function printStripeLaunchPreflight(report) {
  const phase = report.expectPayments === 'enabled' ? 'post-activation verification' : 'pre-activation gate';
  console.log(`XERT Stripe ${report.mode.toUpperCase()} ${phase}`);
  if (report.environmentIssues.length > 0) {
    for (const issue of report.environmentIssues) console.log(`FAIL  Private operator environment: ${issue}`);
    console.log('Stripe launch preflight is not ready.');
    return;
  }

  printReport(report.boundary);
  for (const message of report.catalogMessages) console.log(message);
  const catalog = report.catalog;
  console.log(
    `${catalog.ready ? 'PASS' : 'FAIL'}  Stripe catalog: ${catalog.verifiedCount}/${catalog.productCount} active packs verified; ${catalog.plannedCount} change${catalog.plannedCount === 1 ? '' : 's'} planned.`
  );
  if (!catalog.ready) {
    console.log(`      NEXT: Review the plan, run npm run stripe:catalog:${report.mode}:apply, then rerun this preflight.`);
  }
  console.log(
    `${report.webhook.ready ? 'PASS' : 'FAIL'}  Stripe webhook registration: ${report.webhook.issue || 'canonical endpoint enabled with every required event.'}`
  );
  if (!report.webhook.ready) {
    console.log('      NEXT: Enable the canonical /api/stripe-webhook endpoint and every event in docs/STRIPE_LAUNCH_RUNBOOK.md.');
  }
  console.log(
    `${report.paymentSwitch.ready ? 'PASS' : 'FAIL'}  Platform payment switch: ${report.paymentSwitch.state.toUpperCase()} (expected ${report.paymentSwitch.expected.toUpperCase()}).`
  );
  if (report.paymentSwitch.expected === 'enabled') {
    const receipt = report.paymentSwitch.receipt;
    console.log(
      `${receipt?.ready ? 'PASS' : 'FAIL'}  Immutable activation receipt: ${receipt?.ready ? `verified at ${receipt.activated_at}` : receipt?.issue || 'missing'}.`
    );
  }
  if (!report.paymentSwitch.ready) {
    console.log(report.paymentSwitch.expected === 'enabled'
      ? '      NEXT: Use Admin > Platform Controls to complete guarded payment activation, then rerun npm run stripe:launch:verify.'
      : '      NEXT: Pause Session pack payments before changing live Stripe configuration or running the pre-activation gate.');
  }
  console.log(report.ready ? 'Stripe launch preflight is ready.' : 'Stripe launch preflight is not ready.');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  Promise.resolve()
    .then(() => parseStripeLaunchArgs(process.argv.slice(2)))
    .then(options => inspectStripeLaunchPreflight({ ...options }))
    .then(report => {
      printStripeLaunchPreflight(report);
      if (!report.ready) process.exitCode = 1;
    })
    .catch(error => {
      console.error(`Stripe launch preflight failed: ${error.message}`);
      process.exitCode = 1;
    });
}
