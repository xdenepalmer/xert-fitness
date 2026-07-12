import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPTRequests,
  isPendingPTRequest,
  ptRequestCsvRows,
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
