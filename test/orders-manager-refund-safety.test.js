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

test('PT desk keeps the operator on the current page after a status update', async () => {
  const source = await readFile(new URL('../src/components/admin/PTRequestsTable.jsx', import.meta.url), 'utf8');
  assert.match(source, /await load\(page\);/);
  assert.doesNotMatch(source, /await updatePTRequestStatus\(id, status, adminNotes\);[\s\S]*await load\(1\);/);
});
