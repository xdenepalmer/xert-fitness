import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('loads the complete order ledger in deterministic bounded server pages', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const getAllOrders = source.slice(source.indexOf('export async function getAllOrders'), source.indexOf('export async function getRecentOrders'));

  assert.match(getAllOrders, /collectAdminPages/);
  assert.match(getAllOrders, /count:\s*'exact'/);
  assert.match(getAllOrders, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(getAllOrders, /\.order\('created_at'.*\.order\('id'/s);
});

test('keeps the dashboard activity feed on a small dedicated query', async () => {
  const source = await readFile(new URL('../src/components/admin/AdminOverview.jsx', import.meta.url), 'utf8');
  assert.match(source, /getRecentOrders\(6\)/);
  assert.doesNotMatch(source, /getAllOrders\(/);
});
