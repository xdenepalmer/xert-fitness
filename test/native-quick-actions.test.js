import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const base = '../ios/XertFitnessApp/XertFitnessApp/';

test('Home Screen quick actions restore allowlisted exact native tasks on cold and warm launches', async () => {
  const [plist, quickActions, appDelegate, root, navigation, modelsTests] = await Promise.all([
    readFile(new URL(`${base}Info.plist`, import.meta.url), 'utf8'),
    readFile(new URL(`${base}Services/XertQuickActionNavigation.swift`, import.meta.url), 'utf8'),
    readFile(new URL(`${base}Services/ClassReminderNavigation.swift`, import.meta.url), 'utf8'),
    readFile(new URL(`${base}Views/RootView.swift`, import.meta.url), 'utf8'),
    readFile(new URL(`${base}XertNavigation.swift`, import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(plist, /<key>UIApplicationShortcutItems<\/key>/);
  for (const value of [
    'com.xertfitness.app.quick.book',
    'com.xertfitness.app.quick.bookings',
    'com.xertfitness.app.quick.events',
    'Book a class',
    'Upcoming bookings',
    'Event calendar',
  ]) assert.ok(plist.includes(value));

  assert.match(quickActions, /static func route\(for shortcutType: String\)/);
  assert.match(quickActions, /case bookType: return \.booking/);
  assert.match(quickActions, /case bookingsType: return \.upcomingBookings\(nil\)/);
  assert.match(quickActions, /case eventsType: return \.events/);
  assert.match(quickActions, /guard route\(for: shortcutType\) != nil else \{ return false \}/);
  assert.match(quickActions, /removeObject\(forKey: pendingShortcutTypeKey\)/);
  assert.match(appDelegate, /configurationForConnecting connectingSceneSession: UISceneSession/);
  assert.match(appDelegate, /options: UIScene\.ConnectionOptions/);
  assert.match(appDelegate, /if let shortcutItem = options\.shortcutItem/);
  assert.match(appDelegate, /configuration\.delegateClass = XertSceneDelegate\.self/);
  assert.match(appDelegate, /final class XertSceneDelegate: NSObject, UIWindowSceneDelegate/);
  assert.match(appDelegate, /func windowScene\([\s\S]*performActionFor shortcutItem: UIApplicationShortcutItem/);
  assert.match(appDelegate, /NotificationCenter\.default\.post\(name: \.xertOpenQuickAction/);
  assert.doesNotMatch(appDelegate, /application\([\s\S]{0,120}performActionFor shortcutItem/);
  assert.match(root, /consumePendingQuickActionRoute\(\)/);
  assert.match(root, /publisher\(for: \.xertOpenQuickAction\)/);
  assert.match(root, /openMemberRoute\(route, source: \.quickAction\)/);
  assert.match(navigation, /case quickAction/);
  assert.match(modelsTests, /testQuickActionsMapToTypedRoutesAndSurviveColdLaunchOnce/);
});
