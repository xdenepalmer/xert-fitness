import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bulkPTRequestStatusOptions,
  filterPTRequests,
  isPendingPTRequest,
  normalizePTRequestFilters,
  ptRequestSelectionId,
  ptRequestCsvRows,
  selectedPTRequestIds,
  summarizePTRequests,
} from '../src/lib/ptRequestAnalytics.js';

const NOW = Date.parse('2026-07-12T12:00:00+10:00');
const requests = [
  { id: 'a', created_at: '2026-07-11T00:00:00Z', status: 'requested', full_name: 'Alex Runner', email: 'alex@example.com', phone: '0400 111 222', requested_session_type: '60-minute PT session', preferred_day: 'Monday', training_goal: 'Strength' },
  { id: 'b', created_at: '2026-05-01T00:00:00Z', status: 'approved', full_name: 'Sam Strong', requested_session_type: 'Intro assessment', admin_notes: 'Call after work' },
  { id: 'c', created_at: '2026-07-10T00:00:00Z', status: 'completed', full_name: 'Jo', requested_session_type: '60-minute PT session' },
];

test('filters PT requests by search, status, session type, and age', () => {
  assert.deepEqual(filterPTRequests(requests, { days: '30', sessionType: '60-minute PT session' }, NOW).map(row => row.id), ['a', 'c']);
  assert.deepEqual(filterPTRequests(requests, { status: 'approved', days: 'all' }, NOW).map(row => row.id), ['b']);
  assert.deepEqual(filterPTRequests(requests, { search: 'after work', days: 'all' }, NOW).map(row => row.id), ['b']);
  assert.deepEqual(filterPTRequests(requests, { search: 'STRENGTH', days: 'all' }, NOW).map(row => row.id), ['a']);
});

test('normalizes bounded server filters for the PT operations queue', () => {
  const filters = normalizePTRequestFilters({
    page: 2,
    pageSize: 50,
    search: ' Alex, (Strength) ',
    status: 'requested',
    sessionType: '60-minute PT session',
    days: '30'
  }, NOW);

  assert.equal(filters.from, 50);
  assert.equal(filters.to, 99);
  assert.equal(filters.search, 'Alex Strength');
  assert.equal(filters.status, 'requested');
  assert.equal(filters.cutoff, new Date(NOW - 30 * 86400000).toISOString());
  assert.throws(() => normalizePTRequestFilters({ status: 'unknown' }), /valid PT request status/);
  assert.throws(() => normalizePTRequestFilters({ days: '365' }), /valid PT request age/);
});

test('summarizes the filtered PT workload', () => {
  assert.deepEqual(summarizePTRequests(requests), { total: 3, requested: 1, approved: 1, completed: 1 });
});

test('exports contact, scheduling, coaching, and admin reconciliation fields', () => {
  const [row] = ptRequestCsvRows(requests);
  assert.equal(row.name, 'Alex Runner');
  assert.equal(row.session_type, '60-minute PT session');
  assert.equal(row.preferred_day, 'Monday');
  assert.equal(row.training_goal, 'Strength');
});

test('keeps reschedule requests actionable after staff follow-up', () => {
  assert.equal(isPendingPTRequest('requested'), true);
  assert.equal(isPendingPTRequest('reschedule_requested'), true);
  assert.equal(isPendingPTRequest('approved'), false);
});

test('selects PT requests without mutating the current selection', () => {
  const current = new Set(['a']);
  assert.deepEqual([...selectedPTRequestIds(current, [{ id: 'b' }, { id: 'c' }], true)], ['a', 'b', 'c']);
  assert.deepEqual([...selectedPTRequestIds(current, [{ id: 'a' }], false)], []);
  assert.deepEqual([...current], ['a']);
  assert.equal(ptRequestSelectionId({ id: ' request-a ' }), 'request-a');
  assert.throws(() => ptRequestSelectionId({}), /PT request ID is required/);
});

test('offers only valid bulk transitions for one PT request state', () => {
  assert.deepEqual(bulkPTRequestStatusOptions([{ status: 'requested' }]), ['approved', 'reschedule_requested', 'declined']);
  assert.deepEqual(bulkPTRequestStatusOptions([{ status: 'reschedule_requested' }]), ['approved', 'declined']);
  assert.deepEqual(bulkPTRequestStatusOptions([{ status: 'approved' }]), ['completed', 'cancelled']);
  assert.deepEqual(bulkPTRequestStatusOptions([{ status: 'requested' }, { status: 'approved' }]), []);
  assert.deepEqual(bulkPTRequestStatusOptions([{ status: 'completed' }]), []);
});
