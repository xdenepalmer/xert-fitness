import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('admin overview only clears the in-flight guard for the current request generation', () => {
  const overview = read('../src/components/admin/AdminOverview.jsx');
  const load = overview.slice(
    overview.indexOf('const load = useCallback'),
    overview.indexOf('useEffect(() => {\n    void load({ initial: true })'),
  );

  assert.match(load, /const requestId = \+\+requestIdRef\.current/);
  assert.match(load, /finally \{\s*\/\/ Only the current generation may release the slot/);
  assert.match(
    load,
    /if \(requestId === requestIdRef\.current\) \{\s*requestInFlightRef\.current = false;/,
  );
  // A stale response must not unconditionally release a newer load's guard.
  assert.doesNotMatch(
    load.replace(/if \(requestId === requestIdRef\.current\) \{\s*requestInFlightRef\.current = false;[\s\S]*?\}/, ''),
    /requestInFlightRef\.current = false/,
  );
});

test('admin overview quick actions open create intents through the dirty-nav guard', () => {
  const overview = read('../src/components/admin/AdminOverview.jsx');
  // Labels promise create/add — they must pass action=create like ⌘K so the
  // section editor opens, and so same-section dirty editors still prompt.
  assert.match(overview, /key: 'calendar'[\s\S]*params: \{ action: 'create' \}/);
  assert.match(overview, /key: 'coaches'[\s\S]*params: \{ action: 'create' \}/);
  assert.match(overview, /key: 'events'[\s\S]*params: \{ action: 'create' \}/);
  assert.match(overview, /onNavigate\?\.\(a\.key, a\.params\)/);
});

test('operations health uses the same current-generation in-flight release', () => {
  const monitor = read('../src/components/admin/OperationsHealth.jsx');
  const load = monitor.slice(
    monitor.indexOf('const load = useCallback'),
    monitor.indexOf('useEffect(() => {\n    void load({ initial: true })'),
  );
  assert.match(
    load,
    /if \(requestId === requestIdRef\.current\) \{[\s\S]*requestInFlightRef\.current = false;/,
  );
  assert.doesNotMatch(
    load.replace(
      /if \(requestId === requestIdRef\.current\) \{[\s\S]*?requestInFlightRef\.current = false;\s*\}/,
      '',
    ),
    /requestInFlightRef\.current = false/,
  );
});
