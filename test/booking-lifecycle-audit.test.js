import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('linked migration exactly installs the canonical booking lifecycle audit', () => {
  const source = read('../src/supabase/booking_lifecycle_audit_upgrade.sql').replace(/\r\n/g, '\n');
  const migration = read('../supabase/migrations/20260714014000_booking_lifecycle_audit.sql').replace(/\r\n/g, '\n');
  assert.equal(migration, source);
});

for (const path of [
  '../src/supabase/booking_lifecycle_audit_upgrade.sql',
  '../supabase/migrations/20260714014000_booking_lifecycle_audit.sql',
]) {
  test(`${path} preserves every credit-backed booking transition`, () => {
    const sql = read(path);
    assert.match(sql, /create table if not exists public\.session_booking_changes/i);
    assert.match(sql, /actor_role in \('member', 'admin', 'system'\)/i);
    for (const action of ['booked', 'waitlisted', 'promoted', 'cancelled', 'attendance_recorded', 'credit_changed', 'deleted']) {
      assert.match(sql, new RegExp(`'${action}'`, 'i'));
    }
    assert.match(sql, /session_bookings_audit_lifecycle/i);
    assert.match(sql, /after insert or update or delete on public\.session_bookings/i);
    assert.match(sql, /BOOKING_AUDIT_IMMUTABLE/i);
    assert.match(sql, /when public\.is_admin\(\) then 'admin'/i);
    assert.match(sql, /using \(\(select public\.is_admin\(\)\)\)/i);
    assert.match(sql, /revoke all on table public\.session_booking_changes from public, anon, authenticated/i);
    assert.match(sql, /values \('booking_lifecycle_audit'\)/i);
  });
}

test('booking lifecycle events appear in the permanent Activity log ledger', () => {
  const data = read('../src/lib/adminData.js');
  const audit = read('../src/lib/adminAudit.js');
  const view = read('../src/components/admin/AdminAuditLog.jsx');
  assert.match(data, /loadTable\('session_booking_changes'/);
  assert.match(audit, /type: 'booking'/);
  assert.match(audit, /bookingChanges/);
  assert.match(view, /Booking changes/);
  assert.match(view, /summary\.bookingChanges/);
  assert.match(view, /value="booking"/);
});
