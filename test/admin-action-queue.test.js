import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildAdminActionQueue } from '../src/lib/adminActionQueue.js';

test('prioritizes only actionable admin queues with direct destinations', () => {
  const queue = buildAdminActionQueue({
    pendingBookings: 3,
    ptRequests: 1,
    waitlistedBookings: 2,
    trainerApplicants: 0,
    partnerEnquiries: null,
  });

  assert.deepEqual(queue.map(item => [item.key, item.count, item.target]), [
    ['pending-bookings', 3, 'bookings'],
    ['pt-requests', 1, 'pt-requests'],
    ['waitlists', 2, 'calendar'],
  ]);
  assert.match(queue[0].detail, /3 booking requests need a decision/);
  assert.match(queue[1].detail, /1 private training request is waiting/);
});

test('shows a caught-up state when no reliable queue has work', () => {
  assert.deepEqual(buildAdminActionQueue(null), []);
  assert.deepEqual(buildAdminActionQueue({
    pendingBookings: 0,
    ptRequests: Number.NaN,
    waitlistedBookings: null,
    trainerApplicants: -1,
    partnerEnquiries: 0,
  }), []);
});

test('dashboard action counts query only actionable lead and PT statuses', async () => {
  const [source, overview] = await Promise.all([
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/AdminOverview.jsx', import.meta.url), 'utf8'),
  ]);
  const dashboard = source.slice(source.indexOf('export async function getDashboardStats'), source.indexOf('// ─── Coaches'));

  assert.match(dashboard, /from\('trainer_interest'\)[\s\S]*?\.eq\('status', 'new'\)/);
  assert.match(dashboard, /from\('partner_interest'\)[\s\S]*?\.eq\('status', 'new'\)/);
  assert.match(dashboard, /from\('private_session_requests'\)[\s\S]*?\.eq\('status', 'requested'\)/);
  assert.match(overview, /!loading && stats && \(/);
});
