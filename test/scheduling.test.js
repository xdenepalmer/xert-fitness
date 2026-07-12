import assert from 'node:assert/strict';
import test from 'node:test';
import { blackoutsOverlappingSession, hasValidTimeRange, sessionEndTime } from '../src/lib/scheduling.js';

test('detects only blackouts that affect an overlapping group class', () => {
  const session = {
    start_time: '2026-08-01T08:00:00.000Z',
    duration_minutes: 60,
  };
  const blackouts = [
    { id: 'facility', affects: 'facility_only', start_time: '2026-08-01T08:15:00.000Z', end_time: '2026-08-01T09:15:00.000Z' },
    { id: 'pt', affects: 'pt_only', start_time: '2026-08-01T08:15:00.000Z', end_time: '2026-08-01T09:15:00.000Z' },
    { id: 'before', affects: 'all', start_time: '2026-08-01T06:00:00.000Z', end_time: '2026-08-01T08:00:00.000Z' },
    { id: 'group', affects: 'group_classes', start_time: '2026-08-01T08:30:00.000Z', end_time: '2026-08-01T10:00:00.000Z' },
  ];

  assert.deepEqual(
    blackoutsOverlappingSession(session, blackouts).map(blackout => blackout.id),
    ['facility', 'group']
  );
});

test('uses a class end time when supplied and validates time ranges', () => {
  const session = {
    start_time: '2026-08-01T08:00:00.000Z',
    end_time: '2026-08-01T09:45:00.000Z',
    duration_minutes: 60,
  };

  assert.equal(sessionEndTime(session), Date.parse('2026-08-01T09:45:00.000Z'));
  assert.equal(hasValidTimeRange(session.start_time, session.end_time), true);
  assert.equal(hasValidTimeRange(session.end_time, session.start_time), false);
  assert.equal(hasValidTimeRange('', session.end_time), false);
});
