import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('iOS class roster and event training-group RPCs page past max_rows', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');

  for (const marker of ['func adminSessionRoster(', 'func adminEventGoalMembers(']) {
    const start = api.indexOf(marker);
    assert.notEqual(start, -1, marker);
    const block = api.slice(start, start + 1_400);
    assert.match(block, /pageSize = 500/, marker);
    assert.match(block, /offset \+= pageSize/, marker);
    assert.match(block, /URLQueryItem\(name: "limit"/, marker);
    assert.match(block, /URLQueryItem\(name: "offset"/, marker);
  }
});

test('iOS waitlist and follow-up API defaults use the RPC ceiling', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  assert.match(api, /func adminWaitlist\(session auth: AuthSession, limit: Int = 50\)/);
  assert.match(api, /func adminFollowUps\(session auth: AuthSession, limit: Int = 50\)/);
  assert.doesNotMatch(api, /func adminWaitlist\(session auth: AuthSession, limit: Int = 20\)/);
  assert.doesNotMatch(api, /func adminFollowUps\(session auth: AuthSession, limit: Int = 20\)/);
});
