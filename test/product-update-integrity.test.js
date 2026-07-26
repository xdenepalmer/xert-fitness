import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { productStripeTransitionError } from '../src/lib/products.js';

const current = {
  price_cents: 4800,
  currency: 'aud',
  sessions_count: 4,
  validity_days: 28,
  stripe_price_id: 'price_STARTER4',
};

test('requires a new Stripe Price ID when fixed commercial terms change', () => {
  assert.match(productStripeTransitionError(current, { ...current, price_cents: 5200 }), /replace or clear/i);
  assert.match(productStripeTransitionError(current, { ...current, currency: 'usd' }), /replace or clear/i);
  assert.match(productStripeTransitionError(current, { ...current, sessions_count: 5 }), /replace or clear/i);
  assert.match(productStripeTransitionError(current, { ...current, validity_days: 42 }), /replace or clear/i);
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

test('database guard covers every term embedded in Stripe Price metadata', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260720000000_product_commercial_terms_guard.sql', import.meta.url), 'utf8');
  assert.match(migration, /sessions_count <> v_update\.sessions_count/);
  assert.match(migration, /validity_days <> v_update\.validity_days/);
  assert.match(migration, /ACTIVE_PRODUCT_REQUIRES_STRIPE_PRICE/);
  assert.match(migration, /v_update\.active and \([\s\S]*not v_current\.active[\s\S]*stripe_price_id is distinct from[\s\S]*PRODUCT_ACTIVATION_VERIFICATION_REQUIRED/);
  assert.match(migration, /returns public\.products[\s\S]*returning \* into v_current;[\s\S]*return v_current;/i);
  assert.match(migration, /admin_apply_verified_product[\s\S]*auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(migration, /p_actor_id is null or not exists[\s\S]*role = 'admin'/i);
  assert.match(migration, /set_config\('request\.jwt\.claim\.sub', p_actor_id::text, true\)/i);
  assert.match(migration, /revoke all on function public\.admin_apply_verified_product[^;]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_apply_verified_product[^;]+to service_role/i);
});

test('product creation is an admin-only private-draft RPC with no direct insert bypass', () => {
  for (const path of [
    '../src/supabase/product_commercial_terms_guard_upgrade.sql',
    '../supabase/migrations/20260720000000_product_commercial_terms_guard.sql',
  ]) {
    const sql = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /create(?: or replace)? function public\.admin_create_product\(p_slug text, p_product jsonb\)/i);
    assert.match(sql, /returns public\.products[\s\S]*security definer[\s\S]*if not public\.is_admin\(\)/i);
    assert.match(sql, /p_slug !~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/i);
    assert.match(sql, /length\(btrim\(v_product\.name\)\) > 120/i);
    assert.match(sql, /length\(coalesce\(btrim\(v_product\.description\), ''\)\) > 2000/i);
    assert.match(sql, /sessions_count not between 1 and 1000/i);
    assert.match(sql, /validity_days not between 1 and 3650/i);
    assert.match(sql, /sort_order not between 0 and 10000/i);
    assert.match(sql, /validity_days, stripe_price_id, featured, active, sort_order/i);
    assert.match(sql, /v_product\.validity_days,\s*null,\s*v_product\.featured,\s*false,\s*v_product\.sort_order/i);
    assert.match(sql, /revoke all on function public\.admin_create_product\(text, jsonb\) from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_create_product\(text, jsonb\) to authenticated/i);
    assert.match(sql, /drop policy if exists "products_admin_insert" on public\.products/i);
    assert.match(sql, /revoke insert on table public\.products from anon, authenticated/i);
  }
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
