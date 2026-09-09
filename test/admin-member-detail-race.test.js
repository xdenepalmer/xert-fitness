import {readMembersSource} from './helpers/member-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [manager, data] = await Promise.all([
  readMembersSource(),
  readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
]);

test('member drawer rejects private detail responses from an earlier member', () => {
  assert.match(manager, /useCallback, useEffect, useRef, useState/);
  assert.match(manager, /const detailRequestIdRef = useRef\(0\)/);
  assert.match(manager, /const expectedMemberId = member\.id/);
  assert.match(manager, /const requestId = \+\+detailRequestIdRef\.current/);
  assert.match(manager, /requestId !== detailRequestIdRef\.current[\s\S]*nextDetail\.memberId !== expectedMemberId/);
  assert.match(manager, /return \(\) => \{[\s\S]*detailRequestIdRef\.current \+= 1/);
  assert.match(manager, /<MemberDrawer[\s\S]*key=\{viewing\.id\}[\s\S]*member=\{viewing\}/);
  assert.match(data, /adminMemberDetail\(userId\)[\s\S]*memberId: userId/);
});

test('member drawer preserves a verified record while refreshing and gates stale mutations', () => {
  assert.match(manager, /const detailMutationsAllowed = Boolean\(detail && !detailLoading && !detailError\)/);
  assert.match(manager, /loadDetail\(\{ preserve: true \}\)/);
  assert.match(manager, /Showing the last loaded record\. Refresh before making changes\./);
  assert.match(manager, /disabled=\{!detailMutationsAllowed \|\| noticeSaving/);
  assert.match(manager, /disabled=\{!detailMutationsAllowed \|\| noteSaving/);
  assert.match(manager, /disabled=\{!detail\.creditAuditAvailable \|\| !detailMutationsAllowed \|\| busy\}/);
  assert.match(manager, /if \(!detailMutationsAllowed \|\| mutationRef.current \|\| operationOpen\) return/);
});

test('member drawer fits compact mobile viewports and exposes reachable controls', async () => {
  const drawer = await readFile(new URL('../src/components/admin/ui/AdminDrawer.jsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/components/admin/ui/kit.css', import.meta.url), 'utf8');
  assert.match(manager, /<AdminDrawer open[\s\S]*closeLabel="Close member detail"/);
  assert.match(drawer, /node.showModal\(\)/);
  assert.match(styles, /height: 100dvh; max-height: 100dvh/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(manager, /title="Refresh member record"[\s\S]{0,300}admin-kit-button/);
  assert.match(manager, /Loading \$\{member\.full_name \|\| member\.email \|\| 'member'\} record/);
});
