import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web getMyCredits pages past PostgREST max_rows', () => {
  const bookingData = read('../src/lib/bookingData.js');
  const block = bookingData.match(
    /export async function getMyCredits\([\s\S]*?^export async function getMyOrders/m,
  )?.[0];
  assert.ok(block, 'getMyCredits must be present');
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /\.gt\('remaining', 0\)/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
});

test('iOS credits pages past max_rows without dropping depleted fulfillment batches', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const block = api.match(
    /func credits\(session[\s\S]*?func orders\(session/,
  )?.[0];
  assert.ok(block, 'credits(session:) must be present');
  // Checkout reconcile matches fulfillment by order_id even when remaining is 0.
  assert.doesNotMatch(block, /remaining.*gt\.0/);
  assert.match(block, /offset/);
  assert.match(block, /pageSize = 500/);
});
