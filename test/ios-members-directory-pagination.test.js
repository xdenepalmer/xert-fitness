import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(
  new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url),
  'utf8',
);

test('iOS Members directory pages past the old hard limit 50', () => {
  const block = api.slice(
    api.indexOf('func adminMembers(session'),
    api.indexOf('func adminMember(session'),
  );
  // Explicit small limits (owner command index) stay single-page.
  assert.match(block, /limit: Int\? = nil/);
  assert.match(block, /if let limit \{/);
  assert.match(block, /p_offset: 0/);
  // Unfiltered directory / search must offset-page at the RPC ceiling.
  assert.match(block, /let pageSize = 100/);
  assert.match(block, /p_offset: offset/);
  assert.match(block, /offset \+= pageSize/);
  assert.doesNotMatch(block, /limit: Int = 50/);
});

test('iOS admin audit no longer silently truncates to 300 rows', () => {
  const block = api.slice(
    api.indexOf('func adminAudit(session'),
    api.indexOf('func adminProducts(session'),
  );
  assert.match(block, /sorted \{ \$0\.createdAt > \$1\.createdAt \}/);
  assert.doesNotMatch(block, /\.prefix\(300\)/);
});
