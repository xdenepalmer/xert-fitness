import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStripePriceMatches,
  inspectCatalogLinkEnvironment,
  linkStripeCatalog,
  matchingStripePrice,
  parseCatalogLinkArgs,
} from '../scripts/link-stripe-catalog.mjs';

const product = { slug: 'starter-4', price_cents: 4800, currency: 'aud' };
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

test('catalog linker never links an existing remote match during a dry run', async () => {
  let databaseUpdates = 0;
  const catalogProduct = {
    id: 'product-id', slug: 'starter-4', name: 'Starter Pack', description: null,
    price_cents: 4800, currency: 'aud', sessions_count: 4, stripe_price_id: null, active: true,
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
