import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web getClassSessions pages admin and public catalogues past max_rows', () => {
  const adminData = read('../src/lib/adminData.js');
  const block = adminData.match(
    /export async function getClassSessions\([\s\S]*?^export async function createClassSession/m,
  )?.[0];
  assert.ok(block, 'getClassSessions must be present');
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(block, /public_visible/);
  assert.doesNotMatch(block, /PUBLIC_TIMETABLE_LIMIT/);
  assert.doesNotMatch(block, /\.limit\(/);
});

test('iOS adminClassSessions and member orders page past a hard 1000-row cut', () => {
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const classSessions = api.match(
    /func adminClassSessions\(session auth: AuthSession\) async throws -> \[AdminClassSession\] \{[\s\S]*?\n {4}\}/,
  )?.[0];
  assert.ok(classSessions, 'adminClassSessions must be present');
  assert.match(classSessions, /pageSize = 500/);
  assert.match(classSessions, /offset/);
  assert.doesNotMatch(classSessions, /limit", value: "1000"/);

  const memberOrders = api.match(
    /func orders\(session auth: AuthSession\) async throws -> \[OrderItem\] \{[\s\S]*?\n {4}\}/,
  )?.[0];
  assert.ok(memberOrders, 'orders(session:) must be present');
  assert.match(memberOrders, /pageSize = 500/);
  assert.match(memberOrders, /offset/);
});
