import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBookingStatusMutation, normalizeLegacyBookingNotes, normalizePTRequestMutation } from '../src/lib/adminRequests.js';

test('normalizes explicit booking status and notes mutations', () => {
  assert.deepEqual(normalizeBookingStatusMutation(' booking-a ', 'confirmed'), { id: 'booking-a', status: 'confirmed' });
  assert.deepEqual(normalizeLegacyBookingNotes('booking-a', ' Follow up Friday. '), {
    id: 'booking-a', admin_notes: 'Follow up Friday.',
  });
  assert.deepEqual(normalizeLegacyBookingNotes('booking-a', ' '), { id: 'booking-a', admin_notes: null });
});

test('rejects unsupported booking and PT request mutations', () => {
  assert.throws(() => normalizeBookingStatusMutation('', 'confirmed'), /record is required/);
  assert.throws(() => normalizeBookingStatusMutation('booking-a', 'refunded'), /valid booking status/);
  assert.throws(() => normalizePTRequestMutation('request-a', 'confirmed'), /valid PT request status/);
  assert.throws(() => normalizeLegacyBookingNotes('booking-a', 'x'.repeat(5001)), /5,000 characters/);
});

test('builds bounded PT updates without carrying caller fields', () => {
  assert.deepEqual(normalizePTRequestMutation(' request-a ', 'approved', ' Confirmed by phone. '), {
    id: 'request-a', updates: { status: 'approved', admin_notes: 'Confirmed by phone.' },
  });
  assert.deepEqual(normalizePTRequestMutation('request-a', 'completed'), {
    id: 'request-a', updates: { status: 'completed' },
  });
});
