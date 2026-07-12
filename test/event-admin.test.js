import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeEventInput } from '../src/lib/eventAdmin.js';

test('normalizes an explicit event payload without database metadata', () => {
  const result = normalizeEventInput({
    id: 'must-not-be-sent', source: 'fallback', created_at: 'must-not-be-sent',
    name: '  XERT Team Competition ', category: 'xert',
    event_date: '2026-12-05', end_date: '', location: ' Kingaroy ',
    region: 'South East Queensland', url: 'https://xertfitness.com.au/events',
    published: true, sort_order: '20',
  });

  assert.equal(result.name, 'XERT Team Competition');
  assert.equal(result.end_date, null);
  assert.equal(result.location, 'Kingaroy');
  assert.equal(result.sort_order, 20);
  assert.equal('id' in result, false);
  assert.equal('source' in result, false);
  assert.equal('created_at' in result, false);
});

test('rejects impossible ranges, invalid categories, order, and unsafe links', () => {
  assert.throws(() => normalizeEventInput({ name: 'Event', category: 'run', end_date: '2026-07-02' }), /start date/i);
  assert.throws(() => normalizeEventInput({ name: 'Event', category: 'run', event_date: '2026-02-30' }), /valid date/i);
  assert.throws(() => normalizeEventInput({ name: 'Event', category: 'unknown' }), /valid event category/i);
  assert.throws(() => normalizeEventInput({ name: 'Event', category: 'run', sort_order: 1.5 }), /Sort order/);
  assert.throws(() => normalizeEventInput({ name: 'Event', category: 'run', url: 'javascript:alert(1)' }), /Website link/);
});
