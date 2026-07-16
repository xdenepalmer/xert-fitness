import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [navigation, scheduler, app, root, account, api, models] = await Promise.all([
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/ClassReminderNavigation.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/ClassReminderScheduler.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/XertFitnessApp.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Models.swift', import.meta.url), 'utf8'),
]);

test('class reminder taps validate and persist the exact booking route', () => {
  assert.match(navigation, /UUID\(uuidString: String\(identifier\.dropFirst\(identifierPrefix\.count\)\)\) == bookingID/);
  assert.match(navigation, /defaults\.set\(bookingID\.uuidString, forKey: pendingBookingIDKey\)/);
  assert.match(navigation, /func consumePendingBookingID/);
  assert.match(navigation, /ClassReminderNavigation\.markPending\(bookingID: bookingID\)/);
  assert.match(navigation, /post\(name: \.xertOpenBookings, object: bookingID\)/);
  assert.match(scheduler, /ClassReminderNotification\.bookingIDKey/);
  assert.match(scheduler, /ClassReminderNotification\.identifierPrefix/);
});

test('the app delegate and root route reminder taps into the matching account row', () => {
  assert.match(app, /@UIApplicationDelegateAdaptor\(XertAppDelegate\.self\)/);
  assert.match(root, /consumePendingBookingID\(\)/);
  assert.match(root, /openMemberRoute\(\.upcomingBookings\(bookingID\), source: \.pushNotification\)/);
  assert.match(account, /ScrollViewReader/);
  assert.match(account, /case \.upcomingBookings\(let bookingID\) = route/);
  assert.match(account, /store\.bookings\.contains\(where: \{ \$0\.id == bookingID \}\)/);
  assert.match(account, /proxy\.scrollTo\(target, anchor: \.center\)/);
  assert.match(account, /\.id\(booking\.id\)/);
});

test('native purchase history consumes durable refund audit fields', () => {
  assert.match(api, /refunded_at,refunded_amount_cents/);
  assert.match(models, /let refunded_at: Date\?/);
  assert.match(models, /let refunded_amount_cents: Int\?/);
  assert.match(models, /var refundedAmount: String\?/);
  assert.ok(account.includes('Text("Refunded \\(refundedAmount)")'));
});
