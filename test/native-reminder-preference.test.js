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
  assert.match(store, /if classRemindersEnabled[\s\S]*ClassReminderScheduler\.shared\.sync/);
  assert.match(store, /else \{[\s\S]*ClassReminderScheduler\.shared\.clearAll\(\)/);
  assert.match(store, /func setClassRemindersEnabled\(_ enabled: Bool\) async/);
  assert.match(store, /ClassReminderScheduler\.shared\.clearAll\(\)/);
  assert.match(account, /Toggle\([\s\S]*"Class reminders"/);
  assert.match(account, /store\.setClassRemindersEnabled\(enabled\)/);
});
