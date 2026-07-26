import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('OrdersManager pins refund/reconcile subjects and clamps pages', async () => {
  const source = await readFile(new URL('../src/components/admin/OrdersManager.jsx', import.meta.url), 'utf8');
  assert.match(source, /const orderId = selectedOrder\?\.id;/);
  assert.match(source, /const confirmation = refundConfirmation;/);
  assert.match(source, /refundOrder\(orderId, reason, confirmation\)/);
  assert.match(source, /reconcileOrder\(orderId\)/);
  assert.match(source, /if \(refunding \|\| reconciling\) return;/);
  assert.match(source, /const safePage = Math\.min\(page, pageCount\)/);
  assert.match(source, /filteredOrders\.slice\(\(safePage - 1\) \* PAGE_SIZE/);
});

test('OrdersManager refund locks against same-paint double submits', async () => {
  const source = await readFile(new URL('../src/components/admin/OrdersManager.jsx', import.meta.url), 'utf8');
  assert.match(source, /const refundLockRef = useRef\(false\)/);
  assert.match(source, /if \(!orderId \|\| refundLockRef\.current \|\| refunding \|\| reconciling\) return/);
  assert.match(source, /refundLockRef\.current = true/);
  assert.match(source, /refundLockRef\.current = false/);
});

test('OrdersManager CSV locks against same-paint PII downloads and export while loading', async () => {
  const source = await readFile(new URL('../src/components/admin/OrdersManager.jsx', import.meta.url), 'utf8');
  assert.match(source, /const exportLockRef = useRef\(false\)/);
  assert.match(source, /if \(exportLockRef\.current \|\| exporting \|\| loading \|\| filteredOrders\.length === 0\) return/);
  assert.match(source, /exportLockRef\.current = true/);
  assert.match(source, /disabled=\{filteredOrders\.length === 0 \|\| exporting \|\| loading\}/);
});

test('PT desk keeps the operator on the current page after a status update', async () => {
  const source = await readFile(new URL('../src/components/admin/PTRequestsTable.jsx', import.meta.url), 'utf8');
  assert.match(source, /await load\(page\);/);
  assert.doesNotMatch(source, /await updatePTRequestStatus\(id, status, adminNotes\);[\s\S]*await load\(1\);/);
});
