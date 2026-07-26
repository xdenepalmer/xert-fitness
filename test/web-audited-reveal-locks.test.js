import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web audited reveals refuse same-paint double submits (iOS parity)', () => {
  const leadTable = read('../src/components/admin/LeadTable.jsx');
  const members = read('../src/components/admin/MembersManager.jsx');
  const bookingOps = read('../src/components/admin/BookingRequestsTable.jsx');
  const iosBooking = read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');

  assert.match(leadTable, /healthRevealLockRef/);
  assert.match(leadTable, /if \(healthRevealLockRef\.current \|\| revealingHealth\) return/);
  assert.match(leadTable, /healthRevealLockRef\.current = true/);

  assert.match(members, /emergencyRevealLockRef/);
  assert.match(members, /if \(emergencyRevealLockRef\.current \|\| revealingEmergency\) return/);
  assert.match(members, /emergencyRevealLockRef\.current = true/);

  // Cancelled / waitlisted leftovers must not keep a "Credit reserved" badge.
  assert.match(bookingOps, /bookingHoldsReservedCredit\(b\)/);
  assert.match(
    iosBooking,
    /\["requested", "confirmed", "attended", "no_show"\]\.contains\(booking\.status\)/,
  );
});
