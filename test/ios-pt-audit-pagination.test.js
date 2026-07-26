import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('iOS Command Centre pages PT requests and admin audit past the old hard 100 cut', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');

  const ptBlock = api.match(
    /func adminPTRequests\(session auth: AuthSession\) async throws -> \[AdminPTRequest\] \{[\s\S]*?\n    \}/,
  )?.[0];
  assert.ok(ptBlock, 'adminPTRequests must be present');
  assert.match(ptBlock, /adminBookingPages/);
  assert.doesNotMatch(ptBlock, /limit", value: "100"/);

  const auditBlock = api.match(
    /private func adminAuditRows[\s\S]*?\n    \}/,
  )?.[0];
  assert.ok(auditBlock, 'adminAuditRows must be present');
  assert.match(auditBlock, /pageSize = 500/);
  assert.match(auditBlock, /offset \+= pageSize/);
  assert.doesNotMatch(auditBlock, /limit", value: "100"/);
});
