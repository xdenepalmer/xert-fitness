import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web getMyOrders pages past the silent 200-row cut', () => {
  const bookingData = read('../src/lib/bookingData.js');
  const block = bookingData.match(
    /export async function getMyOrders\([\s\S]*?^export async function getMemberAnnouncements/m,
  )?.[0];
  assert.ok(block, 'getMyOrders must be present');
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  assert.doesNotMatch(block, /\.limit\(200\)/);
});
