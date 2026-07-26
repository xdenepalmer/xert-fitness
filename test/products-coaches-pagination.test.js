import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web products and coaches page past PostgREST max_rows', () => {
  const admin = read('../src/lib/adminData.js');
  const booking = read('../src/lib/bookingData.js');

  const allProducts = admin.slice(
    admin.indexOf('export async function getAllProducts'),
    admin.indexOf('export async function createProduct'),
  );
  const allCoaches = admin.slice(
    admin.indexOf('export async function getAllCoaches'),
    admin.indexOf('export async function createCoach'),
  );
  const products = booking.slice(
    booking.indexOf('export async function getProducts'),
    booking.indexOf('export async function getSessionPackPaymentAvailability'),
  );
  const coaches = booking.slice(
    booking.indexOf('export async function getCoaches'),
    booking.indexOf('export async function getEvents'),
  );
  const health = admin.slice(
    admin.indexOf("healthCheck('products', 'Session packs'"),
    admin.indexOf("healthCheck('commerce-config'"),
  );

  for (const block of [allProducts, allCoaches, products, coaches, health]) {
    assert.match(block, /collectAdminBatches/);
    assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  }
});

test('iOS products and coaches page past PostgREST max_rows', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');

  for (const [start, end] of [
    ['func products() async throws', 'func publicPlatformSettings'],
    ['func coaches() async throws', 'func adminSaveSiteContent'],
    ['func adminProducts(session', 'func adminCreateProduct'],
    ['func adminCoaches(session', 'func adminCreateCoach'],
  ]) {
    const block = api.slice(api.indexOf(start), api.indexOf(end));
    assert.match(block, /let pageSize = 500/, start);
    assert.match(block, /offset \+= pageSize/, start);
    assert.match(block, /URLQueryItem\(name: "offset"/, start);
  }
});

test('tip aligns waitlist/follow-up RPC defaults with the desk ceiling', () => {
  for (const path of [
    '../src/supabase/admin_desk_rpc_ceiling_defaults.sql',
    '../supabase/migrations/20260726126000_admin_desk_rpc_ceiling_defaults.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /admin_member_follow_up_queue\(p_limit integer default 50\)/i);
    assert.match(sql, /admin_waitlist_overview\(p_limit integer default 50\)/i);
    assert.match(sql, /coalesce\(p_limit, 50\)/i);
    assert.doesNotMatch(sql, /default 20|coalesce\(p_limit, 20\)/i);
    assert.match(sql, /admin_desk_rpc_ceiling_defaults/);
  }
});
