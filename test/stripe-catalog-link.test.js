import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertCatalogProduct,
  assertStripePriceMatches,
  inspectCatalogLinkEnvironment,
  linkDatabasePrice,
  linkStripeCatalog,
  matchingStripePrice,
  parseCatalogLinkArgs,
} from '../scripts/link-stripe-catalog.mjs';
import {
  inspectStripeLaunchPreflight,
  inspectPaymentSwitch,
  parseStripeLaunchArgs,
} from '../scripts/stripe-launch-preflight.mjs';

const product = {
  id: '00000000-0000-4000-8000-000000000004', slug: 'starter-4',
  price_cents: 4800, currency: 'aud', sessions_count: 4, validity_days: 28, active: true,
  stripe_price_id: null, updated_at: '2026-07-16T00:00:00.000Z',
};
const price = {
  id: 'price_STARTER4', active: true, deleted: false, type: 'one_time', recurring: null,
  unit_amount: 4800, currency: 'aud', livemode: true,
  metadata: {
    xert_product_id: product.id,
    xert_catalog_slug: product.slug,
    xert_sessions: String(product.sessions_count),
    xert_validity_days: String(product.validity_days),
  },
};

test('catalog linker requires an explicit mode and explicit mutation flags', () => {
  assert.deepEqual(parseCatalogLinkArgs(['--mode=live']), { mode: 'live', apply: false, replaceExisting: false });
  assert.deepEqual(parseCatalogLinkArgs(['--mode=test', '--apply']), { mode: 'test', apply: true, replaceExisting: false });
  assert.throws(() => parseCatalogLinkArgs([]), /explicit Stripe mode/);
  assert.throws(() => parseCatalogLinkArgs(['--mode=live', '--replace-existing']), /requires --apply/);
  assert.throws(() => parseCatalogLinkArgs(['--mode=live', '--force']), /Unknown option/);
});

test('catalog creation binds versioned Stripe objects to immutable XERT pack terms', async () => {
  const source = await readFile(new URL('../scripts/link-stripe-catalog.mjs', import.meta.url), 'utf8');
  assert.match(source, /xert_product_id: product\.id/);
  assert.match(source, /xert_catalog_slug: product\.slug/);
  assert.match(source, /xert_sessions: String\(product\.sessions_count\)/);
  assert.match(source, /xert_validity_days: String\(product\.validity_days\)/);
  assert.match(source, /xert-catalog-product-v2-\$\{mode\}-\$\{product\.id\}/);
  assert.match(source, /xert-catalog-price-v2-\$\{mode\}-\$\{product\.id\}/);
});

test('catalog linker accepts only canonical Supabase and mode-matched secrets', () => {
  const valid = inspectCatalogLinkEnvironment({
    SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co/',
    SUPABASE_SERVICE_ROLE_KEY: `eyJ${'a'.repeat(120)}`,
    STRIPE_SECRET_KEY: `sk_live_${'a'.repeat(32)}`,
  }, 'live');
  assert.equal(valid.ready, true);
  assert.equal(inspectCatalogLinkEnvironment({
    SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'s'.repeat(32)}`,
    STRIPE_SECRET_KEY: `sk_live_${'a'.repeat(32)}`,
  }, 'live').ready, true);

  const invalid = inspectCatalogLinkEnvironment({
    SUPABASE_URL: 'https://other.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'public-anon-key',
    STRIPE_SECRET_KEY: `sk_test_${'a'.repeat(32)}`,
  }, 'live');
  assert.equal(invalid.ready, false);
  assert.equal(invalid.issues.length, 3);
});

test('catalog linker reuses only exact mode, value, and XERT pack identity matches', () => {
  assert.equal(matchingStripePrice([price], product, 'live'), price);
  assert.equal(matchingStripePrice([{ ...price, unit_amount: 4900 }], product, 'live'), null);
  assert.equal(matchingStripePrice([{ ...price, livemode: false }], product, 'live'), null);
  assert.doesNotThrow(() => assertStripePriceMatches(price, product, 'live'));
  assert.throws(() => assertStripePriceMatches({ ...price, currency: 'usd' }, product, 'live'), /amount or currency/);
  assert.throws(() => assertStripePriceMatches({ ...price, recurring: { interval: 'month' } }, product, 'live'), /one-time/);
  assert.equal(matchingStripePrice([{ ...price, metadata: { ...price.metadata, xert_product_id: 'another-product' } }], product, 'live'), null);
  assert.throws(
    () => assertStripePriceMatches({ ...price, metadata: { ...price.metadata, xert_sessions: '10' } }, product, 'live'),
    /not bound to the current XERT pack terms/,
  );
});

test('catalog linker validates every mutable catalog invariant before Stripe access', async () => {
  assert.doesNotThrow(() => assertCatalogProduct(product));
  assert.throws(() => assertCatalogProduct({ ...product, price_cents: 48.5 }), /positive integer/);
  assert.throws(() => assertCatalogProduct({ ...product, currency: 'AUD' }), /lowercase three-letter/);
  assert.throws(() => assertCatalogProduct({ ...product, validity_days: 0 }), /validity days/);
  assert.throws(() => assertCatalogProduct({ ...product, updated_at: null }), /catalog version/);

  let stripeCalls = 0;
  const supabase = catalogSupabase([product, { ...product, id: '00000000-0000-4000-8000-000000000005', slug: 'broken', sessions_count: 0 }]);
  const stripe = {
    products: { search: async () => { stripeCalls += 1; return { data: [] }; } },
    prices: { retrieve: async () => { stripeCalls += 1; return price; } },
  };
  await assert.rejects(
    linkStripeCatalog({ stripe, supabase, mode: 'live', apply: true, replaceExisting: false }),
    /sessions count/,
  );
  assert.equal(stripeCalls, 0);
});

test('catalog linker verifies every stored Stripe link before creating anything', async () => {
  let createSearches = 0;
  const linked = { ...product, id: '00000000-0000-4000-8000-000000000006', slug: 'linked', stripe_price_id: price.id };
  const stripe = {
    products: { search: async () => { createSearches += 1; return { data: [] }; } },
    prices: { retrieve: async () => ({ ...price, unit_amount: 9999 }) },
  };

  await assert.rejects(
    linkStripeCatalog({
      stripe,
      supabase: catalogSupabase([product, linked]),
      mode: 'live',
      apply: true,
      replaceExisting: false,
    }),
    /amount or currency/,
  );
  assert.equal(createSearches, 0);
});

test('database linking compares the complete loaded commercial snapshot', async () => {
  const filters = [];
  const supabase = {
    from() {
      return {
        update() { return this; },
        eq(column, value) { filters.push([column, value]); return this; },
        is(column, value) { filters.push([column, value]); return this; },
        select() { return this; },
        async maybeSingle() { return { data: { id: product.id, slug: product.slug, stripe_price_id: price.id }, error: null }; },
      };
    },
  };

  await linkDatabasePrice(supabase, product, price.id);
  assert.deepEqual(filters, [
    ['id', product.id],
    ['stripe_price_id', null],
    ['updated_at', product.updated_at],
    ['price_cents', product.price_cents],
    ['currency', product.currency],
    ['sessions_count', product.sessions_count],
    ['validity_days', product.validity_days],
    ['active', true],
  ]);

  const changedSupabase = {
    from() {
      return {
        update() { return this; },
        eq() { return this; },
        is() { return this; },
        select() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
      };
    },
  };
  await assert.rejects(
    linkDatabasePrice(changedSupabase, product, price.id),
    /catalog changed during linking; no database update was made/,
  );
});

test('catalog linker never links an existing remote match during a dry run', async () => {
  let databaseUpdates = 0;
  const catalogProduct = {
    ...product, name: 'Starter Pack', description: null,
  };
  const supabase = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        update() { databaseUpdates += 1; return this; },
        async order() { return { data: [catalogProduct], error: null }; },
      };
    },
  };
  const stripe = {
    products: { search: async () => ({ data: [{
      id: 'prod_XERT', active: true, livemode: true,
      metadata: { xert_product_id: product.id, xert_catalog_slug: product.slug },
    }] }) },
    prices: { list: async () => ({ data: [price] }) },
  };
  const messages = [];

  const result = await linkStripeCatalog({
    stripe, supabase, mode: 'live', apply: false, replaceExisting: false,
    log: message => messages.push(message),
  });

  assert.equal(databaseUpdates, 0);
  assert.deepEqual(result, {
    productCount: 1, applied: false, verifiedCount: 0, linkedCount: 0, plannedCount: 1,
  });
  assert.match(messages.join('\n'), /link existing matching Price price_STARTER4/);
});

test('launch preflight requires explicit mode and valid private operator configuration', async () => {
  assert.deepEqual(parseStripeLaunchArgs(['--mode=live']), { mode: 'live', expectPayments: 'paused' });
  assert.deepEqual(
    parseStripeLaunchArgs(['--mode=live', '--expect-payments=enabled']),
    { mode: 'live', expectPayments: 'enabled' },
  );
  assert.throws(() => parseStripeLaunchArgs([]), /explicit Stripe mode/);
  assert.throws(() => parseStripeLaunchArgs(['--mode=live', '--apply']), /Unknown option/);
  assert.throws(() => parseStripeLaunchArgs(['--mode=live', '--expect-payments=open']), /paused or enabled/);

  let boundaryCalls = 0;
  let catalogCalls = 0;
  let webhookCalls = 0;
  const report = await inspectStripeLaunchPreflight({
    mode: 'live',
    environment: {},
    inspectBoundary: async () => { boundaryCalls += 1; },
    catalogInspector: async () => { catalogCalls += 1; },
    webhookInspector: async () => { webhookCalls += 1; },
  });
  assert.equal(report.ready, false);
  assert.ok(report.environmentIssues.length >= 3);
  assert.equal(boundaryCalls, 0);
  assert.equal(catalogCalls, 0);
  assert.equal(webhookCalls, 0);
});

test('launch preflight passes only when deployed boundaries and every catalog link are verified', async () => {
  const environment = {
    SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'s'.repeat(32)}`,
    STRIPE_SECRET_KEY: `sk_live_${'a'.repeat(32)}`,
    APP_BASE_URL: 'https://xert-fitness.vercel.app',
  };
  const boundary = { ready: true, checks: [] };
  const webhook = { ready: true, missing_events: [], issue: null };
  const paymentSwitch = { ready: true, state: 'paused', expected: 'paused', issue: null };
  const ready = await inspectStripeLaunchPreflight({
    environment,
    mode: 'live',
    inspectBoundary: async () => boundary,
    catalogInspector: async ({ log }) => {
      log('PASS starter-4: linked price verified.');
      return { productCount: 1, applied: false, verifiedCount: 1, linkedCount: 0, plannedCount: 0 };
    },
    webhookInspector: async () => webhook,
    paymentSwitchInspector: async () => paymentSwitch,
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.catalog.ready, true);
  assert.equal(ready.catalogMessages.length, 1);

  const planned = await inspectStripeLaunchPreflight({
    environment,
    mode: 'live',
    inspectBoundary: async () => boundary,
    catalogInspector: async () => ({
      productCount: 1, applied: false, verifiedCount: 0, linkedCount: 0, plannedCount: 1,
    }),
    webhookInspector: async () => webhook,
    paymentSwitchInspector: async () => paymentSwitch,
  });
  assert.equal(planned.ready, false);
  assert.equal(planned.catalog.ready, false);

  const brokenBoundary = await inspectStripeLaunchPreflight({
    environment,
    mode: 'live',
    inspectBoundary: async () => ({ ready: false, checks: [] }),
    catalogInspector: async () => ({
      productCount: 1, applied: false, verifiedCount: 1, linkedCount: 0, plannedCount: 0,
    }),
    webhookInspector: async () => webhook,
    paymentSwitchInspector: async () => paymentSwitch,
  });
  assert.equal(brokenBoundary.ready, false);

  const missingDisputeDelivery = await inspectStripeLaunchPreflight({
    environment,
    mode: 'live',
    inspectBoundary: async () => boundary,
    catalogInspector: async () => ({
      productCount: 1, applied: false, verifiedCount: 1, linkedCount: 0, plannedCount: 0,
    }),
    webhookInspector: async () => ({
      ready: false,
      missing_events: ['charge.dispute.created'],
      issue: 'The Stripe webhook is missing: charge.dispute.created.',
    }),
    paymentSwitchInspector: async () => paymentSwitch,
  });
  assert.equal(missingDisputeDelivery.ready, false);
  assert.deepEqual(missingDisputeDelivery.webhook.missing_events, ['charge.dispute.created']);

  const switchMismatch = await inspectStripeLaunchPreflight({
    environment,
    mode: 'live',
    expectPayments: 'enabled',
    inspectBoundary: async () => boundary,
    catalogInspector: async () => ({
      productCount: 1, applied: false, verifiedCount: 1, linkedCount: 0, plannedCount: 0,
    }),
    webhookInspector: async () => webhook,
    paymentSwitchInspector: async () => ({
      ready: false, state: 'paused', expected: 'enabled',
      issue: 'Platform payments are paused; this gate requires enabled.',
    }),
  });
  assert.equal(switchMismatch.ready, false);
  assert.equal(switchMismatch.paymentSwitch.state, 'paused');
});

test('launch preflight validates the singleton payment switch for both cutover phases', () => {
  const paused = {
    payment_switch: { ready: true, state: 'paused' },
    activation_receipt: { required: false, ready: true, activated_at: null, issue: null },
  };
  const enabled = {
    payment_switch: { ready: true, state: 'enabled' },
    activation_receipt: {
      required: true, ready: true, activated_at: '2026-07-16T03:05:00.100Z', issue: null,
    },
  };
  assert.equal(inspectPaymentSwitch(paused, 'paused').ready, true);
  assert.equal(inspectPaymentSwitch(enabled, 'enabled').ready, true);
  assert.equal(inspectPaymentSwitch(paused, 'enabled').ready, false);
  assert.equal(inspectPaymentSwitch({
    ...enabled,
    activation_receipt: { ...enabled.activation_receipt, ready: false, issue: 'Receipt missing.' },
  }, 'enabled').ready, false);
  assert.equal(inspectPaymentSwitch(null, 'paused').state, 'unknown');
});

test('launch preflight observes the payment switch after all remote readiness checks settle', async () => {
  const environment = {
    SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'s'.repeat(32)}`,
    STRIPE_SECRET_KEY: `sk_live_${'a'.repeat(32)}`,
    APP_BASE_URL: 'https://xert-fitness.vercel.app',
  };
  const settled = new Set();
  const report = await inspectStripeLaunchPreflight({
    environment,
    mode: 'live',
    inspectBoundary: async () => {
      await Promise.resolve();
      settled.add('boundary');
      return { ready: true, checks: [] };
    },
    catalogInspector: async () => {
      await Promise.resolve();
      settled.add('catalog');
      return { productCount: 1, applied: false, verifiedCount: 1, linkedCount: 0, plannedCount: 0 };
    },
    webhookInspector: async () => {
      await Promise.resolve();
      settled.add('webhook');
      return { ready: true, missing_events: [], issue: null };
    },
    paymentSwitchInspector: async () => {
      assert.deepEqual([...settled].sort(), ['boundary', 'catalog', 'webhook']);
      return { ready: true, state: 'paused', expected: 'paused', issue: null };
    },
  });
  assert.equal(report.ready, true);
});

function catalogSupabase(products) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async order() { return { data: products, error: null }; },
      };
    },
  };
}
