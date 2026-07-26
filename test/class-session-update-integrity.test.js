import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  classSessionUpdateGuardError,
  classSessionUpdateRpcError,
} from '../src/lib/scheduling.js';

const [adminData, classCalendar, freshSchema, upgradeSchema] = await Promise.all([
  readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/ClassCalendarAdmin.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/supabase/admin_cms_schema.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260713000000_class_session_update_guard.sql', import.meta.url), 'utf8'),
]);

test('class edits cannot bypass cancellation, attendance, or terminal lifecycle rules', () => {
  assert.match(
    classSessionUpdateGuardError({ currentStatus: 'published', nextStatus: 'cancelled', capacity: 8 }),
    /Use Cancel class/,
  );
  assert.match(
    classSessionUpdateGuardError({ currentStatus: 'published', nextStatus: 'completed', capacity: 8 }),
    /Take attendance/,
  );
  assert.match(
    classSessionUpdateGuardError({ currentStatus: 'cancelled', nextStatus: 'published', capacity: 8 }),
    /cannot be reopened/,
  );
  assert.equal(
    classSessionUpdateGuardError({ currentStatus: 'published', nextStatus: 'draft', capacity: 8 }),
    null,
  );
  assert.doesNotMatch(classCalendar, /const STATUSES = \[[^\]]*cancelled[^\]]*completed/);
  assert.match(classCalendar, /classEditorStatuses\(session\)/);
});

test('capacity cannot be reduced below active bookings and RPC errors stay actionable', () => {
  assert.equal(
    classSessionUpdateGuardError({
      currentStatus: 'published', nextStatus: 'published', capacity: 3, activeBookings: 4,
    }),
    'Capacity cannot be lower than the 4 active bookings.',
  );
  assert.equal(
    classSessionUpdateGuardError({
      currentStatus: 'published', nextStatus: 'published', capacity: 4, activeBookings: 4,
    }),
    null,
  );
  assert.equal(
    classSessionUpdateRpcError('CAPACITY_BELOW_ACTIVE:1'),
    'Capacity cannot be lower than the 1 active booking.',
  );
  assert.match(classSessionUpdateRpcError('USE_CANCELLATION_WORKFLOW'), /credits are returned/);
  assert.match(classSessionUpdateRpcError('USE_ATTENDANCE_WORKFLOW'), /full roll call/);
  assert.match(classSessionUpdateRpcError('SESSION_TIME_CONFLICTS_WITH_MEMBER_BOOKING'), /overlaps another active booking/);
});

test('class update uses a transactional RPC with a guarded legacy preflight', () => {
  assert.match(adminData, /rpc\('admin_update_class_session'/);
  assert.match(adminData, /class session guard/);
  assert.match(adminData, /session_bookings[\s\S]*\['requested', 'confirmed'\]/);
  assert.match(adminData, /classSessionUpdateGuardError/);

  // Historical migration still documents the original two-argument guard.
  assert.match(upgradeSchema, /create or replace function public\.admin_update_class_session/i);
  assert.match(upgradeSchema, /from public\.class_sessions[\s\S]*for update/i);
  assert.match(upgradeSchema, /from public\.session_bookings[\s\S]*for update/i);
  assert.match(upgradeSchema, /CAPACITY_BELOW_ACTIVE/i);
  assert.match(upgradeSchema, /USE_CANCELLATION_WORKFLOW/i);
  assert.match(upgradeSchema, /USE_ATTENDANCE_WORKFLOW/i);
  assert.match(upgradeSchema, /values \('class_session_update_guard'\)/i);
  assert.match(upgradeSchema, /grant execute on function public\.admin_update_class_session\(uuid, jsonb\) to authenticated/i);

  // Fresh admin CMS path ships the version-checked three-argument overload.
  assert.match(freshSchema, /create function public\.admin_update_class_session/i);
  assert.match(freshSchema, /p_expected_updated_at timestamptz/i);
  assert.match(freshSchema, /SESSION_STALE/i);
  assert.match(freshSchema, /CAPACITY_BELOW_ACTIVE/i);
  assert.match(freshSchema, /USE_CANCELLATION_WORKFLOW/i);
  assert.match(freshSchema, /USE_ATTENDANCE_WORKFLOW/i);
  assert.match(freshSchema, /values \('class_session_update_guard'\)/i);
  assert.match(freshSchema, /grant execute on function public\.admin_update_class_session\(uuid, jsonb, timestamptz\) to authenticated/i);
});
