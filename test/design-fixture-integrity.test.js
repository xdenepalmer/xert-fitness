import assert from 'node:assert/strict';
import test from 'node:test';
import { kitRows, kitTimeline } from './fixtures/admin-kit-data.mjs';

test('UI-kit fixture exercises stable identities, numeric sorting and variable-height rows', () => {
  assert.ok(kitRows.length > 200, 'Fixture must cross the intended virtualization threshold');
  assert.equal(new Set(kitRows.map(row => row.id)).size, kitRows.length);
  assert.ok(kitRows.every(row => row.id.startsWith('fixture-') && row.email.endsWith('@example.invalid')));
  assert.ok(kitRows.some((row, index) => index > 0 && row.amountInCents < kitRows[index - 1].amountInCents),
    'A no-op numeric sort must not look correct');
  const numeric = [...kitRows].sort((a, b) => a.amountInCents - b.amountInCents).map(row => row.id);
  const lexical = [...kitRows].sort((a, b) => String(a.amountInCents).localeCompare(String(b.amountInCents))).map(row => row.id);
  assert.notDeepEqual(numeric, lexical, 'A lexical comparison must not masquerade as numeric ordering');
  assert.ok(kitRows.some(row => row.detail.length > 200));
  assert.ok(kitRows.some(row => row.detail.length < 80));
  assert.ok(kitRows.some(row => row.status === 'unknown'), 'Exercise the neutral status fallback');
});

test('UI-kit timeline has stable keys and parseable timestamps', () => {
  assert.ok(kitTimeline.length >= 3);
  assert.equal(new Set(kitTimeline.map(event => event.id)).size, kitTimeline.length);
  assert.ok(kitTimeline.every(event => Number.isFinite(Date.parse(event.timestamp))));
});
