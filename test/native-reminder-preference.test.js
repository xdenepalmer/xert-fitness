import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [scheduler, store, account] = await Promise.all([
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/ClassReminderScheduler.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift', import.meta.url), 'utf8'),
]);

test('native class reminders require explicit member opt-in', () => {
  const syncBlock = scheduler.slice(
    scheduler.indexOf('func sync('),
    scheduler.indexOf('func clearAll()'),
  );
  assert.doesNotMatch(syncBlock, /requestAuthorization/);
  assert.match(scheduler, /func requestAuthorizationAndSync/);
  assert.match(scheduler, /static func setEnabled\(_ enabled: Bool/);
  assert.match(scheduler, /enum ClassReminderLeadTime: String, CaseIterable, Identifiable, Hashable/);
  assert.match(scheduler, /static func setLeadTime\(_ leadTime: ClassReminderLeadTime/);
  assert.match(store, /if classRemindersEnabled[\s\S]*ClassReminderScheduler\.shared\.sync/);
  assert.match(store, /else \{[\s\S]*ClassReminderScheduler\.shared\.clearAll\(\)/);
  assert.match(store, /func setClassRemindersEnabled\(_ enabled: Bool\) async/);
  assert.match(store, /ClassReminderScheduler\.shared\.clearAll\(\)/);
  assert.match(account, /Toggle\([\s\S]*"Class reminders"/);
  assert.match(account, /store\.setClassRemindersEnabled\(enabled\)/);
  assert.match(account, /Picker\([\s\S]*"Remind me"/);
  assert.match(account, /ClassReminderLeadTime\.allCases/);
  assert.match(account, /store\.setClassReminderLeadTime\(leadTime\)/);
});

test('native class reminders reconcile timing changes and successful cancellations', () => {
  assert.match(scheduler, /func remove\(bookingID: UUID\)/);
  assert.match(scheduler, /content\.body = "\\\(booking\.title\) starts in \\\(leadTime\.notificationLead\)\."/);
  assert.match(store, /func setClassReminderLeadTime\(_ leadTime: ClassReminderLeadTime\) async/);
  assert.match(store, /ClassReminderPreference\.setLeadTime\(leadTime\)/);
  assert.match(store, /sync\(bookings: bookings, leadTime: leadTime\)/);
  assert.match(store, /cancelBooking[\s\S]*remove\(bookingID: booking\.booking_id\)[\s\S]*await refresh\(\)/);
});
