import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  normalizeProductPriceProvisionRequest,
  provisionStripePriceForDraft,
} from '../api/admin-commerce-health.js';

const PRODUCT_ID = '08b68ea8-acf9-4f40-a050-9ba12d7252db';
const UPDATED_AT = '2026-07-22T01:00:00.000Z';
const product = {
  id: PRODUCT_ID, slug: 'starter-4', name: 'Starter 4', description: 'Four sessions',
  price_cents: 4800, currency: 'aud', sessions_count: 4, validity_days: 28,
  stripe_price_id: null, active: false, updated_at: UPDATED_AT,
};

function price(id = 'price_exact') {
  return {
    id, active: true, deleted: false, type: 'one_time', unit_amount: 4800,
    currency: 'aud', livemode: true,
    metadata: {
      xert_product_id: PRODUCT_ID, xert_catalog_slug: 'starter-4',
      xert_sessions: '4', xert_validity_days: '28',
    },
  };
}

function adminFor(current = product) {
  const calls = [];
  return {
    calls,
    from() {
      return { select() { return { eq() { return { async maybeSingle() { return { data: current, error: null }; } }; } }; } };
    },
    async rpc(name, payload) {
      calls.push({ name, payload });
      return { data: [{ ...current, stripe_price_id: payload.p_stripe_price_id, updated_at: '2026-07-22T01:01:00.000Z' }], error: null };
    },
  };
}

test('price provisioning requires an explicit exact confirmation and revision', () => {
  assert.throws(() => normalizeProductPriceProvisionRequest({ action: 'provision_product_price' }), /INVALID/);
  assert.deepEqual(normalizeProductPriceProvisionRequest({
    action: 'provision_product_price', confirmation: 'CREATE STRIPE PRICE',
    product_id: PRODUCT_ID, expected_updated_at: UPDATED_AT,
  }), { productId: PRODUCT_ID, expectedUpdatedAt: UPDATED_AT });
});

test('creates an exact metadata-bound one-time Stripe Price then links the private draft', async () => {
  const admin = adminFor();
  const calls = { products: [], prices: [] };
  const stripe = {
    products: {
      async search() { return { data: [] }; },
      async create(payload, options) { calls.products.push({ payload, options }); return { id: 'prod_xert', active: true, livemode: true, metadata: payload.metadata }; },
    },
    prices: {
      async list() { return { data: [] }; },
      async create(payload, options) { calls.prices.push({ payload, options }); return price(); },
    },
  };
  const saved = await provisionStripePriceForDraft({
    admin, stripe, request: { productId: PRODUCT_ID, expectedUpdatedAt: UPDATED_AT },
    expectedLivemode: true, actorId: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(calls.prices[0].payload.unit_amount, 4800);
  assert.equal(calls.prices[0].payload.currency, 'aud');
  assert.deepEqual(calls.prices[0].payload.metadata, calls.products[0].payload.metadata);
  assert.equal(calls.prices[0].payload.metadata.xert_sessions, '4');
  assert.equal(saved.active, false);
  assert.equal(admin.calls[0].name, 'admin_link_verified_product_price');
});

test('rejects Stripe responses with mismatched amount, currency, or catalogue metadata', async () => {
  const mismatches = [
    { unit_amount: 4700 },
    { currency: 'usd' },
    { metadata: { ...price().metadata, xert_sessions: '5' } },
  ];
  for (const mismatch of mismatches) {
    const admin = adminFor();
    const stripe = {
      products: {
        async search() { return { data: [] }; },
        async create(payload) { return { id: 'prod_xert', active: true, livemode: true, metadata: payload.metadata }; },
      },
      prices: {
        async list() { return { data: [] }; },
        async create() { return { ...price(), ...mismatch }; },
      },
    };
    await assert.rejects(() => provisionStripePriceForDraft({
      admin, stripe, request: { productId: PRODUCT_ID, expectedUpdatedAt: UPDATED_AT },
      expectedLivemode: true, actorId: '11111111-1111-4111-8111-111111111111',
    }));
    assert.equal(admin.calls.length, 0, 'an invalid Stripe response must never reach the link RPC');
  }
});

test('duplicate retry reuses the exact Stripe Product and Price without creating another', async () => {
  const admin = adminFor();
  let creates = 0;
  const stripe = {
    products: {
      async search() { return { data: [{ id: 'prod_xert', active: true, livemode: true, metadata: { xert_product_id: PRODUCT_ID, xert_catalog_slug: 'starter-4' } }] }; },
      async create() { creates += 1; },
    },
    prices: {
      async list() { return { data: [price()] }; },
      async create() { creates += 1; },
    },
  };
  await provisionStripePriceForDraft({
    admin, stripe, request: { productId: PRODUCT_ID, expectedUpdatedAt: UPDATED_AT },
    expectedLivemode: true, actorId: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(creates, 0);
});

test('stale draft fails before any Stripe mutation and SQL commit stays CAS-private', async () => {
  const admin = adminFor({ ...product, updated_at: '2026-07-22T02:00:00.000Z' });
  let stripeCalls = 0;
  await assert.rejects(() => provisionStripePriceForDraft({
    admin,
    stripe: { products: { search: async () => { stripeCalls += 1; } } },
    request: { productId: PRODUCT_ID, expectedUpdatedAt: UPDATED_AT },
    expectedLivemode: true, actorId: '11111111-1111-4111-8111-111111111111',
  }), /PRODUCT_STALE/);
  assert.equal(stripeCalls, 0);
  const sql = readFileSync(new URL('../supabase/migrations/20260722010000_owner_stripe_price_provisioning.sql', import.meta.url), 'utf8');
  assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(sql, /v_product\.updated_at is distinct from p_expected_updated_at/i);
  assert.match(sql, /v_product\.active or v_product\.stripe_price_id is not null/i);
  assert.match(sql, /set stripe_price_id[\s\S]*active is false[\s\S]*stripe_price_id is null/i);
  assert.match(sql, /to service_role/i);
});

test('web and iOS use the authenticated server action and preserve separate activation', () => {
  const webData = readFileSync(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const webView = readFileSync(new URL('../src/components/admin/ProductsManager.jsx', import.meta.url), 'utf8');
  const nativeAPI = readFileSync(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8');
  const nativeStore = readFileSync(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift', import.meta.url), 'utf8');
  const nativeView = readFileSync(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url), 'utf8');

  for (const source of [webData, nativeAPI]) {
    assert.match(source, /provision_product_price/);
    assert.doesNotMatch(source, /STRIPE_SECRET_KEY|sk_(?:live|test)_/);
  }
  assert.match(webView, /CREATE STRIPE PRICE/);
  assert.match(nativeAPI, /CREATE STRIPE PRICE/);
  assert.match(webData, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(webView, /Create & link exact Stripe Price/);
  assert.match(webView, /disabled=\{saving \|\| provisioning/);
  assert.match(webView, /stays private until you activate it separately/);
  assert.match(nativeStore, /guard provisioningProductPriceID == nil, savingProductID == nil/);
  assert.match(nativeView, /isProductMutationInFlight/);
  assert.match(nativeView, /stays private until you activate it separately/);
});
