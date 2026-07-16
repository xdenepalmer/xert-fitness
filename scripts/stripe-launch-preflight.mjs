import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { inspectStripeReadiness, printReport } from './check-stripe-readiness.mjs';
import { inspectCatalogLinkEnvironment, linkStripeCatalog } from './link-stripe-catalog.mjs';

export function parseStripeLaunchArgs(args) {
  const modeArg = args.find(arg => arg.startsWith('--mode='));
  const mode = modeArg?.slice('--mode='.length);
  if (!['test', 'live'].includes(mode)) {
    throw new Error('Choose an explicit Stripe mode with --mode=test or --mode=live.');
  }
  const unknown = args.filter(arg => !arg.startsWith('--mode='));
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown[0]}`);
  return { mode };
}

export async function inspectStripeLaunchPreflight({
  environment = process.env,
  mode,
  inspectBoundary = inspectStripeReadiness,
  catalogInspector,
} = {}) {
  if (!['test', 'live'].includes(mode)) throw new Error('Stripe launch mode is required.');
  const privateEnvironment = inspectCatalogLinkEnvironment(environment, mode);
  if (!privateEnvironment.ready) {
    return {
      ready: false,
      mode,
      environmentIssues: privateEnvironment.issues,
      boundary: null,
      catalog: null,
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
  const catalogMessages = [];
  const [boundary, catalog] = await Promise.all([
    inspectBoundary({ environment }),
    inspectCatalog({ environment, mode, log: message => catalogMessages.push(message) }),
  ]);
  const catalogReady = catalog.productCount > 0
    && catalog.verifiedCount === catalog.productCount
    && catalog.plannedCount === 0;

  return {
    ready: boundary.ready && catalogReady,
    mode,
    environmentIssues: [],
    boundary,
    catalog: { ...catalog, ready: catalogReady },
    catalogMessages,
  };
}

export function printStripeLaunchPreflight(report) {
  console.log(`XERT Stripe ${report.mode.toUpperCase()} launch preflight`);
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
