import assert from 'node:assert/strict';
import test from 'node:test';
import { availabilityBlockEditorForm, blackoutPeriodEditorForm, blackoutPeriodMutationError, blackoutsOverlappingSession, classSessionUpdateRpcError, classSessionValidationError, hasValidTimeRange, normalizeAvailabilityBlock, normalizeBlackoutPeriod, normalizeClassSession, repeatedClassSessionCopies, sessionEndTime, toDateTimeLocalInput } from '../src/lib/scheduling.js';

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

test('translates database schedule conflicts into actionable admin errors', () => {
  assert.equal(
    classSessionUpdateRpcError('SESSION_OVERLAPS_BLACKOUT'),
    'This class overlaps an active blackout. Change the class time or remove the blackout first.'
  );
  assert.equal(
    blackoutPeriodMutationError('BLACKOUT_OVERLAPS_PUBLISHED_CLASS'),
    'This blackout overlaps one or more published classes. Cancel or reschedule those classes before saving the blackout.'
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

test('round-trips stored timestamps through a datetime-local editor value', () => {
  const iso = '2026-08-01T08:35:00.000Z';
  const editorValue = toDateTimeLocalInput(iso);
  assert.match(editorValue, /^\d{4}-\d{2}-\d{2}T\d{2}:35$/);
  assert.equal(new Date(editorValue).getTime(), Date.parse(iso));
  assert.equal(toDateTimeLocalInput('not-a-date'), '');
});

test('hydrates editable scheduling forms without carrying database metadata', () => {
  const block = availabilityBlockEditorForm({
    id: 'database-id', start_time: '2026-08-01T08:00:00.000Z', end_time: '2026-08-01T09:00:00.000Z',
    type: 'group class available', coach_name: 'Byron', notes: null, is_bookable: true,
  });
  const blackout = blackoutPeriodEditorForm({
    id: 'database-id', start_time: '2026-08-02T08:00:00.000Z', end_time: '2026-08-02T12:00:00.000Z',
    affects: 'facility_only', reason: 'facility maintenance', notes: 'Equipment install',
  });

  assert.equal(new Date(block.start_time).getTime(), Date.parse('2026-08-01T08:00:00.000Z'));
  assert.equal(block.is_bookable, true);
  assert.equal(blackout.affects, 'facility_only');
  assert.equal(blackout.notes, 'Equipment install');
  assert.equal('id' in block, false);
  assert.equal('id' in blackout, false);
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

  const fullClass = {
    ...validClass,
    class_type: 'XERT Strength', booking_mode: 'instant_book', intensity_level: 'High',
  };
  const beforeClass = Date.parse('2026-07-01T00:00:00.000Z');
  assert.equal(classSessionValidationError(fullClass, { now: beforeClass }), null);
  assert.equal(classSessionValidationError({ ...fullClass, start_time: '' }, { now: beforeClass }), 'A published class needs a start time.');
  assert.equal(classSessionValidationError({ ...fullClass, capacity: 0 }, { now: beforeClass }), 'Capacity must be a whole number of at least 1.');
  assert.equal(classSessionValidationError({ ...fullClass, end_time: '2026-08-01T07:30:00.000Z' }, { now: beforeClass }), 'Class end time must be after its start time.');
});

test('normalizes an explicit class mutation payload and strips database metadata', () => {
  const payload = normalizeClassSession({
    id: 'database-id', created_at: 'old', booked_count: 4, spots_left: 4,
    class_type: 'XERT Strength', title: ' Strength Block ', description: ' ', coach_name: ' Byron ',
    start_time: '2026-08-01T08:00:00.000Z', end_time: '2026-08-01T09:00:00.000Z',
    duration_minutes: '60', capacity: '8', location_zone: ' Main floor ', beginner_friendly: true,
    intensity_level: 'High', status: 'draft', public_visible: true,
    booking_mode: 'request_to_book', notes: ' Technique focus ',
  }, { now: Date.parse('2026-07-01T00:00:00.000Z') });

  assert.equal(payload.title, 'Strength Block');
  assert.equal(payload.coach_name, 'Byron');
  assert.equal(payload.description, null);
  assert.equal(payload.public_visible, false);
  assert.equal(payload.duration_minutes, 60);
  assert.equal('id' in payload, false);
  assert.equal('booked_count' in payload, false);
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
