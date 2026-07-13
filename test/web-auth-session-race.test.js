import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const context = readFileSync(new URL('../src/lib/SupabaseAuthContext.jsx', import.meta.url), 'utf8');

test('web auth ignores stale initial sessions and stale profile responses', () => {
  assert.match(context, /let sessionVersion = 0/);
  assert.match(context, /if \(!active \|\| sessionVersion !== 0\) return/);
  assert.match(context, /const version = \+\+sessionVersion/);
  assert.match(context, /version === sessionVersion/);
  assert.match(context, /const requestId = \+\+profileRequestId/);
  assert.match(context, /requestId === profileRequestId/);
});

test('web auth always settles initial loading when session lookup fails', () => {
  assert.match(context, /\.catch\(\(\) => \{/);
  assert.match(context, /sessionVersion === 0\) setLoading\(false\)/);
});
