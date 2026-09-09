import test from 'node:test';
import assert from 'node:assert/strict';
import { installTodayData } from './fixtures/admin-today-data.mjs';
import { dashboardMetricsFromSettled } from '../src/lib/adminMetrics.js';

const query = (table, params = {}) => new URL(`https://fixture.invalid/rest/v1/${table}?${new URLSearchParams(params)}`);
test('Today fixture distinguishes public/member decision counts and read-only operations', () => {
  const fixture = installTodayData();
  const publicPending = fixture.read('class_bookings', query('class_bookings', { status: 'eq.requested' }));
  const memberPending = fixture.read('session_bookings', query('session_bookings', { status: 'eq.requested' }));
  assert.equal(publicPending.total, 2);
  assert.equal(memberPending.total, 3);
  assert.equal(fixture.read('class_bookings', query('class_bookings', { status: 'eq.waitlisted' })).total, 1);
  const results = Array.from({ length: 13 }, () => ({ status: 'fulfilled', value: { data: [], count: 0 } }));
  results[6].value.count = publicPending.total;
  results[7].value.count = memberPending.total;
  assert.equal(dashboardMetricsFromSettled(results).pendingBookings, 5);
  const ops = fixture.read('admin_daily_operations', query('rpc/admin_daily_operations')).rows;
  assert.equal(ops.length, 2);
  assert.equal(ops[0].session_id, '22222222-2222-4222-8222-222222222222');
  assert.equal(ops[0].places_held, 6);
  assert.equal(ops[0].public_request_count, 2);
  assert.equal(fixture.mutate, undefined);
  assert.equal(fixture.read('admin_record_session_attendance', query('rpc/admin_record_session_attendance')), undefined);
});
