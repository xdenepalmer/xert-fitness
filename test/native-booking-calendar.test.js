import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [writer, account] = await Promise.all([
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/EventCalendarWriter.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift', import.meta.url), 'utf8'),
]);

test('confirmed native bookings can be saved as idempotent timed calendar events', () => {
  assert.match(writer, /static func add\(_ booking: BookingItem\)/);
  assert.match(writer, /BookingCalendarPlanner\.endDate\(for: booking\)/);
  assert.match(writer, /abs\(\$0\.startDate\.timeIntervalSince\(start\)\) < 1/);
  assert.match(writer, /abs\(\$0\.endDate\.timeIntervalSince\(end\)\) < 1/);
  assert.match(writer, /event\.location = booking\.location_zone/);
  assert.match(account, /booking\.status == "confirmed" && booking\.start_time > Date\(\)/);
  assert.match(account, /Label\([\s\S]*"Add to Calendar"/);
  assert.match(account, /EventCalendarWriter\.add\(booking\)/);
  assert.match(account, /Already in Calendar/);
});
