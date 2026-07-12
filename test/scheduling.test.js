import assert from 'node:assert/strict';
import test from 'node:test';
import { blackoutsOverlappingSession, classSessionValidationError, hasValidTimeRange, normalizeAvailabilityBlock, normalizeBlackoutPeriod, repeatedClassSessionCopies, sessionEndTime } from '../src/lib/scheduling.js';

test('normalizes explicit availability and blackout payloads', () => {
  const block = normalizeAvailabilityBlock({
    id: 'must-not-be-sent', start_time: '2026-08-01T08:00', end_time: '2026-08-01T09:00',
    type: 'PT available', coach_name: ' Byron ', notes: ' ', is_bookable: true,
  });
  const blackout = normalizeBlackoutPeriod({
    created_at: 'must-not-be-sent', start_time: '2026-08-02T08:00', end_time: '2026-08-02T12:00',
    affects: 'facility_only', reason: 'facility maintenance', notes: ' Equipment install ',
  });

  assert.equal(block.coach_name, 'Byron');
  assert.equal(block.notes, null);
  assert.match(block.start_time, /^2026-07-31T22:00:00\.000Z$|^2026-08-01T08:00:00\.000Z$/);
  assert.equal(Date.parse(block.end_time) - Date.parse(block.start_time), 60 * 60 * 1000);
  assert.equal('id' in block, false);
  assert.equal(blackout.notes, 'Equipment install');
  assert.equal('created_at' in blackout, false);
});

test('rejects invalid scheduling types, scopes, reasons, and ranges', () => {
  const base = { start_time: '2026-08-01T08:00', end_time: '2026-08-01T09:00' };
  assert.throws(() => normalizeAvailabilityBlock({ ...base, type: 'unknown' }), /valid availability type/);
  assert.throws(() => normalizeAvailabilityBlock({ ...base, type: 'PT available', end_time: '2026-08-01T07:00' }), /must end after/);
  assert.throws(() => normalizeBlackoutPeriod({ ...base, affects: 'unknown', reason: 'facility maintenance' }), /valid blackout scope/);
  assert.throws(() => normalizeBlackoutPeriod({ ...base, affects: 'all', reason: 'unknown' }), /valid blackout reason/);
});

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

test('rejects unsafe published class data before it reaches the timetable', () => {
  const validClass = {
    title: 'XERT Foundation',
    capacity: 8,
    duration_minutes: 60,
    status: 'published',
    public_visible: true,
    start_time: '2026-08-01T08:00:00.000Z',
    end_time: '2026-08-01T09:00:00.000Z',
  };

  assert.equal(classSessionValidationError(validClass), null);
  assert.equal(classSessionValidationError({ ...validClass, start_time: '' }), 'A published class needs a start time.');
  assert.equal(classSessionValidationError({ ...validClass, capacity: 0 }), 'Capacity must be a whole number of at least 1.');
  assert.equal(classSessionValidationError({ ...validClass, end_time: '2026-08-01T07:30:00.000Z' }), 'Class end time must be after its start time.');
});

test('builds a complete repeat block for one atomic insert', () => {
  const session = {
    id: 'original',
    title: 'XERT Strength',
    start_time: '2026-08-01T08:00:00.000Z',
    end_time: '2026-08-01T09:00:00.000Z',
    status: 'published',
    public_visible: true,
    created_at: '2026-07-01T00:00:00.000Z',
  };

  const copies = repeatedClassSessionCopies(session, { intervalDays: 8, count: 2, keepPublished: false });

  assert.equal(copies.length, 2);
  assert.deepEqual(copies.map(copy => copy.start_time), ['2026-08-09T08:00:00.000Z', '2026-08-17T08:00:00.000Z']);
  assert.equal(copies[0].end_time, '2026-08-09T09:00:00.000Z');
  assert.equal(copies[0].status, 'draft');
  assert.equal(copies[0].public_visible, false);
  assert.equal('id' in copies[0], false);
});
