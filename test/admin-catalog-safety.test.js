import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260714020000_catalog_optimistic_locking.sql');
const adminData = read('../src/lib/adminData.js');
const coaches = read('../src/components/admin/CoachesManager.jsx');
const events = read('../src/components/admin/EventsManager.jsx');
const products = read('../src/components/admin/ProductsManager.jsx');
const commandCentre = read('../src/pages/AdminCommandCentre.jsx');

test('catalog records receive monotonically refreshed versions', () => {
  for (const table of ['products', 'coaches', 'events']) {
    assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]*add column if not exists updated_at`, 'i'));
    assert.match(migration, new RegExp(`${table}_touch_updated_at`, 'i'));
  }
  assert.match(migration, /new\.updated_at := clock_timestamp\(\)/i);
  assert.match(migration, /catalog_optimistic_locking/);
});

test('the Stripe-aware product RPC rejects stale versions and retires its unsafe signature', () => {
  assert.match(migration, /admin_update_product\([\s\S]*p_expected_updated_at timestamptz/i);
  assert.match(migration, /for update[\s\S]*PRODUCT_STALE/i);
  assert.match(migration, /STRIPE_PRICE_REFRESH_REQUIRED/i);
  assert.match(migration, /revoke execute on function public\.admin_update_product\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_update_product\(uuid, jsonb, timestamptz\) to authenticated/i);
});

test('coach, event and pack mutations carry the version originally loaded', () => {
  for (const name of ['updateCoach', 'deleteCoach', 'updateEvent', 'deleteEvent']) {
    const start = adminData.indexOf(`export async function ${name}`);
    const end = adminData.indexOf('\nexport async function ', start + 1);
    const body = adminData.slice(start, end);
    assert.match(body, /expectedUpdatedAt/);
    assert.match(body, /\.eq\('updated_at', expectedUpdatedAt\)/);
    assert.match(body, /assertAdminMutationVersion/);
  }
  assert.match(adminData, /updateProduct\(id, updates, expectedUpdatedAt\)[\s\S]*p_expected_updated_at: expectedUpdatedAt/);
  assert.match(coaches, /updateCoach\(coach\.id, payload, coach\.updated_at\)/);
  assert.match(coaches, /deleteCoach\(coach\.id, coach\.updated_at\)/);
  assert.match(events, /updateEvent\(event\.id, payload, event\.updated_at\)/);
  assert.match(events, /deleteEvent\(event\.id, event\.updated_at\)/);
  assert.match(products, /updateProduct\(product\.id, updates, product\.updated_at\)/);
});

test('all catalog editors protect drafts locally and through admin navigation', () => {
  for (const [source, title] of [
    [coaches, 'Discard team member changes?'],
    [events, 'Discard event changes?'],
    [products, 'Discard session pack draft?'],
  ]) {
    assert.match(source, /onDirtyChange/);
    assert.match(source, /Unsaved changes/);
    assert.match(source, new RegExp(title.replace(/[?.]/g, '\\$&')));
    assert.match(source, /AdminConfirmDialog/);
    assert.match(source, /Keep editing/);
  }
  assert.match(products, /dirtyEditors\.size > 0/);
  assert.match(products, /key=\{`\$\{p\.id\}:\$\{p\.updated_at \|\| ''\}`\}/);
  for (const component of ['CoachesManager', 'EventsManager', 'ProductsManager']) {
    assert.match(commandCentre, new RegExp(`<${component}[^>]+onDirtyChange=\\{setHasUnsavedChanges\\}`));
  }
});
