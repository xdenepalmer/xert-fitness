import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const XERT_SUPABASE_URL = 'https://ugmkwoapjcpiucsrxwzt.supabase.co';
const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]+$/;

export function parseCatalogLinkArgs(args) {
  const modeArg = args.find(arg => arg.startsWith('--mode='));
  const mode = modeArg?.slice('--mode='.length);
  if (!['test', 'live'].includes(mode)) {
    throw new Error('Choose an explicit Stripe mode with --mode=test or --mode=live.');
  }
  const unknown = args.filter(arg => !['--apply', '--replace-existing'].includes(arg) && !arg.startsWith('--mode='));
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown[0]}`);
  const apply = args.includes('--apply');
  const replaceExisting = args.includes('--replace-existing');
  if (replaceExisting && !apply) throw new Error('--replace-existing requires --apply.');
  return { mode, apply, replaceExisting };
}

export function inspectCatalogLinkEnvironment(environment, mode) {
  const supabaseUrl = String(environment.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceRoleKey = String(environment.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const stripeSecretKey = String(environment.STRIPE_SECRET_KEY || '').trim();
  const expectedStripePrefix = mode === 'live' ? 'sk_live_' : 'sk_test_';
  const issues = [];
  const isLegacyServiceRole = /^eyJ[A-Za-z0-9._-]+$/.test(serviceRoleKey) && serviceRoleKey.length >= 100;
  const isSecretKey = /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(serviceRoleKey);

  if (supabaseUrl !== XERT_SUPABASE_URL) issues.push(`SUPABASE_URL must be ${XERT_SUPABASE_URL}.`);
  if (!isLegacyServiceRole && !isSecretKey) {
    issues.push('SUPABASE_SERVICE_ROLE_KEY is missing or malformed.');
  }
  if (!stripeSecretKey.startsWith(expectedStripePrefix) || stripeSecretKey.length < expectedStripePrefix.length + 16) {
    issues.push(`STRIPE_SECRET_KEY must be a ${mode}-mode secret key beginning with ${expectedStripePrefix}.`);
  }
  return { ready: issues.length === 0, issues, supabaseUrl, serviceRoleKey, stripeSecretKey };
}

export function matchingStripePrice(prices, product, mode) {
  return prices.find(price => (
    price.active
    && price.type === 'one_time'
    && price.recurring == null
    && price.unit_amount === product.price_cents
    && price.currency === product.currency.toLowerCase()
    && price.livemode === (mode === 'live')
    && price.metadata?.xert_product_id === product.id
    && price.metadata?.xert_catalog_slug === product.slug
    && price.metadata?.xert_sessions === String(product.sessions_count)
    && price.metadata?.xert_validity_days === String(product.validity_days)
  )) || null;
}

export function assertStripePriceMatches(price, product, mode) {
  if (!price || price.deleted) throw new Error(`${product.slug}: Stripe Price does not exist.`);
  if (!price.active) throw new Error(`${product.slug}: Stripe Price is inactive.`);
  if (price.livemode !== (mode === 'live')) throw new Error(`${product.slug}: Stripe Price mode does not match ${mode}.`);
  if (price.type !== 'one_time' || price.recurring) throw new Error(`${product.slug}: Stripe Price must be one-time.`);
  if (price.unit_amount !== product.price_cents || price.currency !== product.currency.toLowerCase()) {
    throw new Error(`${product.slug}: Stripe Price amount or currency does not match the catalog.`);
  }
  if (
    price.metadata?.xert_product_id !== product.id
    || price.metadata?.xert_catalog_slug !== product.slug
    || price.metadata?.xert_sessions !== String(product.sessions_count)
    || price.metadata?.xert_validity_days !== String(product.validity_days)
  ) {
    throw new Error(`${product.slug}: Stripe Price is not bound to the current XERT pack terms.`);
  }
}

export function assertCatalogProduct(product) {
  if (!product || typeof product !== 'object') throw new Error('Invalid XERT catalog row.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(product.id || ''))) {
    throw new Error(`${product.slug || 'unknown'}: invalid product identity.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(product.slug || ''))) {
    throw new Error(`Unsafe product slug: ${product.slug || 'missing'}`);
  }
  if (!Number.isSafeInteger(product.price_cents) || product.price_cents <= 0) {
    throw new Error(`${product.slug}: price must be a positive integer in cents.`);
  }
  if (!/^[a-z]{3}$/.test(String(product.currency || ''))) {
    throw new Error(`${product.slug}: currency must be a lowercase three-letter code.`);
  }
  if (!Number.isSafeInteger(product.sessions_count) || product.sessions_count <= 0) {
    throw new Error(`${product.slug}: sessions count must be a positive integer.`);
  }
  if (!Number.isSafeInteger(product.validity_days) || product.validity_days <= 0) {
    throw new Error(`${product.slug}: validity days must be a positive integer.`);
  }
  if (product.active !== true) throw new Error(`${product.slug}: only active products may be linked.`);
  if (!Number.isFinite(Date.parse(product.updated_at))) {
    throw new Error(`${product.slug}: catalog version is missing or malformed.`);
  }
  if (product.stripe_price_id && !PRICE_ID_PATTERN.test(product.stripe_price_id)) {
    throw new Error(`${product.slug}: malformed stored Stripe Price ID.`);
  }
}

function stripeProductQuery(slug) {
  return `metadata['xert_catalog_slug']:'${slug}'`;
}

async function findStripeProduct(stripe, product, mode) {
  const result = await stripe.products.search({ query: stripeProductQuery(product.slug), limit: 10 });
  return result.data.find(candidate => (
    candidate.active
    && candidate.livemode === (mode === 'live')
    && candidate.metadata?.xert_product_id === product.id
    && candidate.metadata?.xert_catalog_slug === product.slug
  )) || null;
}

async function createStripeProduct(stripe, product, mode) {
  return stripe.products.create({
    name: product.name,
    description: product.description || undefined,
    metadata: {
      xert_product_id: product.id,
      xert_catalog_slug: product.slug,
      xert_sessions: String(product.sessions_count),
      xert_validity_days: String(product.validity_days),
    },
  }, { idempotencyKey: `xert-catalog-product-v2-${mode}-${product.id}` });
}

async function createStripePrice(stripe, stripeProductID, product, mode) {
  return stripe.prices.create({
    product: stripeProductID,
    unit_amount: product.price_cents,
    currency: product.currency.toLowerCase(),
    metadata: {
      xert_product_id: product.id,
      xert_catalog_slug: product.slug,
      xert_sessions: String(product.sessions_count),
      xert_validity_days: String(product.validity_days),
    },
  }, {
    idempotencyKey: `xert-catalog-price-v2-${mode}-${product.id}-${product.currency}-${product.price_cents}-${product.sessions_count}-${product.validity_days}`,
  });
}

export async function linkDatabasePrice(supabase, product, stripePriceID) {
  let query = supabase.from('products').update({ stripe_price_id: stripePriceID }).eq('id', product.id);
  query = product.stripe_price_id
    ? query.eq('stripe_price_id', product.stripe_price_id)
    : query.is('stripe_price_id', null);
  query = query
    .eq('updated_at', product.updated_at)
    .eq('price_cents', product.price_cents)
    .eq('currency', product.currency)
    .eq('sessions_count', product.sessions_count)
    .eq('validity_days', product.validity_days)
    .eq('active', true);
  const { data, error } = await query.select('id,slug,stripe_price_id').maybeSingle();
  if (error) throw new Error(`${product.slug}: database link failed: ${error.message}`);
  if (!data) {
    throw new Error(`${product.slug}: catalog changed during linking; no database update was made. Review the pack and rerun the linker.`);
  }
  if (data.stripe_price_id !== stripePriceID) throw new Error(`${product.slug}: database did not retain the expected Price ID.`);
}

export async function linkStripeCatalog({ stripe, supabase, mode, apply, replaceExisting, log = console.log }) {
  const { data, error } = await supabase
    .from('products')
    .select('id,slug,name,description,price_cents,currency,sessions_count,validity_days,stripe_price_id,active,updated_at')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Could not load active products: ${error.message}`);
  const products = data || [];
  if (products.length === 0) throw new Error('No active XERT products were found.');

  products.forEach(assertCatalogProduct);

  const verifiedLinkedPrices = new Map();
  if (!replaceExisting) {
    for (const product of products.filter(item => item.stripe_price_id)) {
      const existingPrice = await stripe.prices.retrieve(product.stripe_price_id);
      assertStripePriceMatches(existingPrice, product, mode);
      verifiedLinkedPrices.set(product.id, existingPrice);
    }
  }

  for (const product of products) {
    if (product.stripe_price_id && !replaceExisting) {
      if (!verifiedLinkedPrices.has(product.id)) {
        throw new Error(`${product.slug}: verified Stripe Price preflight is missing.`);
      }
      log(`PASS ${product.slug}: ${product.stripe_price_id} already matches.`);
      continue;
    }

    let stripeProduct = await findStripeProduct(stripe, product, mode);
    if (!stripeProduct && !apply) {
      log(`PLAN ${product.slug}: create Stripe Product and ${product.currency.toUpperCase()} ${(product.price_cents / 100).toFixed(2)} Price, then link it.`);
      continue;
    }
    if (!stripeProduct) stripeProduct = await createStripeProduct(stripe, product, mode);

    const priceList = await stripe.prices.list({ product: stripeProduct.id, active: true, type: 'one_time', limit: 100 });
    let price = matchingStripePrice(priceList.data, product, mode);
    if (price && !apply) {
      log(`PLAN ${product.slug}: link existing matching Price ${price.id}.`);
      continue;
    }
    if (!price && !apply) {
      log(`PLAN ${product.slug}: create ${product.currency.toUpperCase()} ${(product.price_cents / 100).toFixed(2)} Price on ${stripeProduct.id}, then link it.`);
      continue;
    }
    if (!price) price = await createStripePrice(stripe, stripeProduct.id, product, mode);
    assertStripePriceMatches(price, product, mode);
    await linkDatabasePrice(supabase, product, price.id);
    log(`LINK ${product.slug}: ${price.id}`);
  }

  return { productCount: products.length, applied: apply };
}

async function main() {
  const options = parseCatalogLinkArgs(process.argv.slice(2));
  const environment = inspectCatalogLinkEnvironment(process.env, options.mode);
  if (!environment.ready) throw new Error(environment.issues.join('\n'));
  const stripe = new Stripe(environment.stripeSecretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  const supabase = createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`${options.apply ? 'APPLY' : 'DRY RUN'}: linking active XERT packs to Stripe ${options.mode} mode.`);
  const result = await linkStripeCatalog({ stripe, supabase, ...options });
  console.log(`${options.apply ? 'Linked' : 'Inspected'} ${result.productCount} active pack${result.productCount === 1 ? '' : 's'}.`);
  if (!options.apply) console.log('No Stripe or Supabase data was changed. Re-run with --apply after reviewing the plan.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
