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
});

test('class update uses a transactional RPC with a guarded legacy preflight', () => {
  assert.match(adminData, /rpc\('admin_update_class_session'/);
  assert.match(adminData, /class session guard migration/);
  assert.match(adminData, /session_bookings[\s\S]*\['requested', 'confirmed'\]/);
  assert.match(adminData, /classSessionUpdateGuardError/);

  for (const sql of [freshSchema, upgradeSchema]) {
    assert.match(sql, /create or replace function public\.admin_update_class_session/i);
    assert.match(sql, /from public\.class_sessions[\s\S]*for update/i);
    assert.match(sql, /from public\.session_bookings[\s\S]*for update/i);
    assert.match(sql, /CAPACITY_BELOW_ACTIVE/i);
    assert.match(sql, /USE_CANCELLATION_WORKFLOW/i);
    assert.match(sql, /USE_ATTENDANCE_WORKFLOW/i);
    assert.match(sql, /values \('class_session_update_guard'\)/i);
    assert.match(sql, /grant execute on function public\.admin_update_class_session\(uuid, jsonb\) to authenticated/i);
  }
});
