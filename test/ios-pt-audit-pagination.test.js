import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('iOS Command Centre pages PT requests and admin audit past the old hard 100 cut', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');

  const ptBlock = api.match(
    /func adminPTRequests\(session auth: AuthSession\) async throws -> \[AdminPTRequest\] \{[\s\S]*?\n {4}\}/,
  )?.[0];
  assert.ok(ptBlock, 'adminPTRequests must be present');
  assert.match(ptBlock, /adminBookingPages/);
  assert.doesNotMatch(ptBlock, /limit", value: "100"/);

  const auditBlock = api.match(
    /private func adminAuditRows[\s\S]*?\n {4}\}/,
  )?.[0];
  assert.ok(auditBlock, 'adminAuditRows must be present');
  assert.match(auditBlock, /pageSize = 500/);
  assert.match(auditBlock, /offset \+= pageSize/);
  assert.doesNotMatch(auditBlock, /limit", value: "100"/);
});

test('iOS Command Centre pages broadcast announcements past the old hard 100 cut', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const block = api.match(
    /func adminAnnouncements\(session auth: AuthSession\) async throws -> \[AdminAnnouncement\] \{[\s\S]*?\n {4}\}/,
  )?.[0];
  assert.ok(block, 'adminAnnouncements must be present');
  assert.match(block, /pageSize = 500/);
  assert.match(block, /offset \+= pageSize/);
  assert.doesNotMatch(block, /limit", value: "100"/);
});

test('member Account pages private session requests past PostgREST max_rows', () => {
  const web = read('../src/lib/bookingData.js');
  const ios = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');

  const webBlock = web.match(
    /export async function getMyPrivateSessionRequests\(\) \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(webBlock, 'getMyPrivateSessionRequests must be present');
  assert.match(webBlock, /collectAdminBatches/);
  assert.match(webBlock, /\.range\(from, from \+ pageSize - 1\)/);

  const iosBlock = ios.match(
    /func privateSessionRequests\(session auth: AuthSession\) async throws -> \[PrivateSessionStatusItem\] \{[\s\S]*?\n {4}\}/,
  )?.[0];
  assert.ok(iosBlock, 'privateSessionRequests must be present');
  assert.match(iosBlock, /pageSize = 500/);
  assert.match(iosBlock, /offset \+= pageSize/);
});
