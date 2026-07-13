import assert from 'node:assert/strict';
import test from 'node:test';

import { dashboardMetricsFromSettled } from '../src/lib/adminMetrics.js';

const ok = (count, data = null) => ({ status: 'fulfilled', value: { count, data, error: null } });

test('uses exact count responses for operational dashboard totals', () => {
  const metrics = dashboardMetricsFromSettled([
    ok(1500, [{ preferred_training_times: ['Morning'], main_training_goals: ['Strength'] }]),
    ok(4), ok(3), ok(12), ok(25), ok(31), ok(700), ok(450), ok(300), ok(275), ok(9),
    ok(81), ok(9)
  ]);

  assert.equal(metrics.totalMembers, 1500);
  assert.equal(metrics.pendingBookings, 1150);
  assert.equal(metrics.waitlistedBookings, 575);
  assert.equal(metrics.ptInterest, 25);
  assert.equal(metrics.insightsSampled, true);
  assert.equal(metrics.attended30Days, 81);
  assert.equal(metrics.noShows30Days, 9);
  assert.equal(metrics.attendanceRate30Days, 90);
  assert.deepEqual(metrics.topTimes, [{ time: 'Morning', count: 1 }]);
});

test('keeps healthy dashboard metrics when one source fails', () => {
  const metrics = dashboardMetricsFromSettled([
    ok(2, []), ok(4), ok(3), ok(1), ok(0), ok(0), ok(5),
    { status: 'fulfilled', value: { data: null, count: null, error: { message: 'member bookings offline' } } },
    ok(2), ok(1), ok(7), ok(0),
    { status: 'fulfilled', value: { data: null, count: null, error: { message: 'attendance migration missing' } } }
  ]);

  assert.equal(metrics.totalMembers, 2);
  assert.equal(metrics.pendingBookings, null);
  assert.equal(metrics.waitlistedBookings, 3);
  assert.equal(metrics.ptRequests, 7);
  assert.equal(metrics.attendanceRate30Days, null);
  assert.match(metrics.errors[0], /pendingMembers: member bookings offline/);
  assert.match(metrics.errors[1], /noShows30Days: attendance migration missing/);
});

test('reports zero attendance when no roll calls exist or all marks are no-shows', () => {
  const results = Array.from({ length: 13 }, () => ok(0, []));
  const empty = dashboardMetricsFromSettled(results);
  assert.equal(empty.attended30Days, 0);
  assert.equal(empty.noShows30Days, 0);
  assert.equal(empty.attendanceRate30Days, 0);

  results[12] = ok(4);
  const noShowsOnly = dashboardMetricsFromSettled(results);
  assert.equal(noShowsOnly.attendanceRate30Days, 0);
});
