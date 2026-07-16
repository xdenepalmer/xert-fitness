import assert from 'node:assert/strict';
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

const product = {
  id: '00000000-0000-4000-8000-000000000004', slug: 'starter-4',
  price_cents: 4800, currency: 'aud', sessions_count: 4, active: true,
  stripe_price_id: null, updated_at: '2026-07-16T00:00:00.000Z',
};
const price = {
  id: 'price_STARTER4', active: true, deleted: false, type: 'one_time', recurring: null,
  unit_amount: 4800, currency: 'aud', livemode: true,
};

test('catalog linker requires an explicit mode and explicit mutation flags', () => {
  assert.deepEqual(parseCatalogLinkArgs(['--mode=live']), { mode: 'live', apply: false, replaceExisting: false });
  assert.deepEqual(parseCatalogLinkArgs(['--mode=test', '--apply']), { mode: 'test', apply: true, replaceExisting: false });
  assert.throws(() => parseCatalogLinkArgs([]), /explicit Stripe mode/);
  assert.throws(() => parseCatalogLinkArgs(['--mode=live', '--replace-existing']), /requires --apply/);
  assert.throws(() => parseCatalogLinkArgs(['--mode=live', '--force']), /Unknown option/);
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

test('catalog linker reuses only exact one-time mode, amount, and currency matches', () => {
  assert.equal(matchingStripePrice([price], product, 'live'), price);
  assert.equal(matchingStripePrice([{ ...price, unit_amount: 4900 }], product, 'live'), null);
  assert.equal(matchingStripePrice([{ ...price, livemode: false }], product, 'live'), null);
  assert.doesNotThrow(() => assertStripePriceMatches(price, product, 'live'));
  assert.throws(() => assertStripePriceMatches({ ...price, currency: 'usd' }, product, 'live'), /amount or currency/);
  assert.throws(() => assertStripePriceMatches({ ...price, recurring: { interval: 'month' } }, product, 'live'), /one-time/);
});

test('catalog linker validates every mutable catalog invariant before Stripe access', async () => {
  assert.doesNotThrow(() => assertCatalogProduct(product));
  assert.throws(() => assertCatalogProduct({ ...product, price_cents: 48.5 }), /positive integer/);
  assert.throws(() => assertCatalogProduct({ ...product, currency: 'AUD' }), /lowercase three-letter/);
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
    products: { search: async () => ({ data: [{ id: 'prod_XERT', active: true, livemode: true }] }) },
    prices: { list: async () => ({ data: [price] }) },
  };
  const messages = [];

  await linkStripeCatalog({
    stripe, supabase, mode: 'live', apply: false, replaceExisting: false,
    log: message => messages.push(message),
  });

  assert.equal(databaseUpdates, 0);
  assert.match(messages.join('\n'), /link existing matching Price price_STARTER4/);
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
