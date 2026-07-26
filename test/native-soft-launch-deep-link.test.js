import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('iOS deep links and reminders fail closed to Explore while bookings are paused', () => {
  const root = read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift');
  assert.match(root, /private func softLaunchMemberRoute\(_ route: XertMemberRoute\)/);
  assert.match(
    root,
    /case \.booking, \.classSession, \.sessionPacks:[\s\S]*return store\.memberBookingsEnabled \? route : \.explore/,
  );
  assert.match(root, /let resolvedRoute = softLaunchMemberRoute\(route\)/);
  assert.match(root, /handleExternalOpenURL[\s\S]*openMemberRoute\(route, source: \.deepLink\)/);
  assert.match(root, /consumePendingReminderRoute[\s\S]*openMemberRoute\(\.booking, source: \.pushNotification\)/);
  assert.match(root, /consumePendingQuickActionRoute[\s\S]*openMemberRoute\(route, source: \.quickAction\)/);
  // In-flight checkout settlement must still open even when bookings are paused.
  const softLaunchFn = root.match(
    /private func softLaunchMemberRoute\(_ route: XertMemberRoute\) -> XertMemberRoute \{[\s\S]*?\n {4}\}/,
  )?.[0] || '';
  assert.match(softLaunchFn, /\.booking, \.classSession, \.sessionPacks/);
  assert.doesNotMatch(softLaunchFn, /\.purchaseConfirmation/);
});
