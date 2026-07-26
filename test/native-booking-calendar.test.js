import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [writer, account, plist] = await Promise.all([
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/EventCalendarWriter.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Info.plist', import.meta.url), 'utf8'),
]);

test('confirmed native bookings can be saved as timed calendar events with write-only access', () => {
  assert.match(writer, /static func add\(_ booking: BookingItem\)/);
  assert.match(writer, /BookingCalendarPlanner\.endDate\(for: booking\)/);
  assert.match(writer, /event\.location = booking\.location_zone/);
  assert.match(writer, /requestWriteOnlyAccessToEvents\(\)/);
  assert.doesNotMatch(writer, /requestFullAccessToEvents\(\)/);
  assert.doesNotMatch(writer, /events\(matching:/);
  assert.match(account, /booking\.status == "confirmed" && booking\.start_time > Date\(\)/);
  assert.match(account, /Label\([\s\S]*"Add to Calendar"/);
  assert.match(account, /EventCalendarWriter\.add\(booking\)/);
  assert.match(plist, /NSCalendarsWriteOnlyAccessUsageDescription/);
  assert.doesNotMatch(plist, /NSCalendarsFullAccessUsageDescription/);
});
