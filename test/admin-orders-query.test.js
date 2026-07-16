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
  assert.match(getAllOrders, /select\('\*, products\(name\)/);
});

test('keeps the dashboard activity feed on a small dedicated query', async () => {
  const source = await readFile(new URL('../src/components/admin/AdminOverview.jsx', import.meta.url), 'utf8');
  assert.match(source, /getRecentOrders\(6\)/);
  assert.doesNotMatch(source, /getAllOrders\(/);
});

test('web and native finance expose the immutable terms purchased on each order', async () => {
  const [web, analytics, models, api, native] = await Promise.all([
    readFile(new URL('../src/components/admin/OrdersManager.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/orderAnalytics.js', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Models.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url), 'utf8'),
  ]);
  for (const source of [web, analytics, models, api]) {
    assert.match(source, /credit_total/);
    assert.match(source, /credit_validity_days/);
  }
  assert.match(web, /Purchased terms/);
  assert.match(native, /Purchased terms/);
  assert.match(models, /Legacy order - purchased terms not recorded/);
});
