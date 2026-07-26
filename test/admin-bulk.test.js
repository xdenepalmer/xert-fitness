import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { adminBulkConfirmation, settleAdminMutations } from '../src/lib/adminBulk.js';

test('settles admin mutations in input order with bounded concurrency', async () => {
  let active = 0;
  let peak = 0;
  const results = await settleAdminMutations([1, 2, 3, 4, 5, 6], async value => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, value % 2 ? 5 : 1));
    active -= 1;
    if (value === 4) throw new Error('four failed');
    return value * 10;
  }, 2);

  assert.equal(peak, 2);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
  assert.equal(results[0].value, 10);
  assert.match(results[3].reason.message, /four failed/);
});

test('validates the bulk worker contract', async () => {
  await assert.rejects(() => settleAdminMutations(null, () => {}), /items must be an array/);
  await assert.rejects(() => settleAdminMutations([], null), /mutation function/);
  await assert.rejects(() => settleAdminMutations([], () => {}, 0), /between 1 and 10/);
});

test('describes bulk mutations before they execute', () => {
  assert.equal(adminBulkConfirmation({ count: 1, recordLabel: 'booking', status: 'no_show' }), 'Move 1 booking to no show?');
  assert.equal(
    adminBulkConfirmation({ count: 3, recordLabel: 'booking', status: 'cancelled', warning: 'Credit policy applies.' }),
    'Move 3 bookings to cancelled?\n\nCredit policy applies.',
  );
  assert.throws(() => adminBulkConfirmation({ count: 0, recordLabel: 'request', status: 'approved' }), /Select at least one record/);
});

test('destructive admin bulk updates use the accessible confirmation surface', () => {
  const dialog = readFileSync(new URL('../src/components/admin/AdminConfirmDialog.jsx', import.meta.url), 'utf8');
  const bookings = readFileSync(new URL('../src/components/admin/BookingRequestsTable.jsx', import.meta.url), 'utf8');
  const ptRequests = readFileSync(new URL('../src/components/admin/PTRequestsTable.jsx', import.meta.url), 'utf8');

  assert.match(dialog, /AlertDialogContent/);
  assert.match(dialog, /AlertDialogDescription/);
  assert.match(dialog, /Keep unchanged/);
  assert.match(dialog, /confirmLockRef/);
  assert.match(dialog, /if \(busy \|\| confirmLockRef\.current\)/);
  for (const source of [bookings, ptRequests]) {
    assert.match(source, /<AdminConfirmDialog/);
    assert.match(source, /adminBulkConfirmation/);
    assert.doesNotMatch(source, /window\.confirm/);
  }
  for (const source of [bookings, ptRequests]) {
    assert.match(source, /const bulkLockRef = useRef\(false\)/);
    assert.match(source, /if \(bulkLockRef\.current \|\| bulkSaving/);
    assert.match(source, /setBulkConfirmationOpen\(false\)/);
  }
  assert.match(ptRequests, /const updateLockRef = useRef\(false\)/);
  assert.match(ptRequests, /if \(updateLockRef\.current \|\| updatingId !== null/);
});
