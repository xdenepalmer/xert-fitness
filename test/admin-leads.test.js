import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeLeadSearch, selectedLeadIds } from '../src/lib/adminLeads.js';

test('normalizes lead search text before building a PostgREST or filter', () => {
  assert.equal(normalizeLeadSearch('  Alex, (Runner)  '), 'Alex Runner');
  assert.equal(normalizeLeadSearch("coach+one@example.com"), 'coach+one@example.com');
  assert.equal(normalizeLeadSearch('a'.repeat(120)).length, 100);
});

test('adds and removes lead selections without mutating the current set', () => {
  const current = new Set(['lead-a']);
  const added = selectedLeadIds(current, 'lead-b', true);
  const removed = selectedLeadIds(added, 'lead-a', false);

  assert.deepEqual([...current], ['lead-a']);
  assert.deepEqual([...added], ['lead-a', 'lead-b']);
  assert.deepEqual([...removed], ['lead-b']);
});
