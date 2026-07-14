import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { productStripeTransitionError } from '../src/lib/products.js';

const current = {
  price_cents: 4800,
  currency: 'aud',
  stripe_price_id: 'price_STARTER4',
};

test('requires a new Stripe Price ID when fixed commercial terms change', () => {
  assert.match(productStripeTransitionError(current, { ...current, price_cents: 5200 }), /replace or clear/i);
  assert.match(productStripeTransitionError(current, { ...current, currency: 'usd' }), /replace or clear/i);
  assert.equal(productStripeTransitionError(current, { ...current, sessions_count: 5 }), '');
  assert.equal(productStripeTransitionError(current, { ...current, price_cents: 5200, stripe_price_id: null }), '');
  assert.equal(productStripeTransitionError(current, { ...current, price_cents: 5200, stripe_price_id: 'price_NEW' }), '');
});

test('product updates use the transactional RPC with a required record version', () => {
  const adminData = readFileSync(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  assert.match(adminData, /rpc\('admin_update_product'/);
  assert.match(adminData, /p_expected_updated_at: expectedUpdatedAt/);
  assert.match(adminData, /PRODUCT_STALE/);
  assert.match(adminData, /STRIPE_PRICE_REFRESH_REQUIRED/);
  assert.doesNotMatch(adminData, /Compatibility path for projects awaiting the product update migration/);
});

test('database migration locks products and removes direct browser updates', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260713010000_product_update_guard.sql', import.meta.url), 'utf8');
  assert.match(sql, /create or replace function public\.admin_update_product/i);
  assert.match(sql, /from public\.products[\s\S]*for update/i);
  assert.match(sql, /STRIPE_PRICE_REFRESH_REQUIRED/i);
  assert.match(sql, /drop policy if exists "products_admin_all"/i);
  assert.match(sql, /create policy "products_admin_insert"/i);
  assert.doesNotMatch(sql, /create policy[^;]+for update/is);
  assert.match(sql, /grant execute on function public\.admin_update_product\(uuid, jsonb\) to authenticated/i);
});
