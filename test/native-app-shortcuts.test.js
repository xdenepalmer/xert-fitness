import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shortcutsURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAppShortcuts.swift', import.meta.url);
const quickActionsURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertQuickActionNavigation.swift', import.meta.url);

test('App Intents expose the typed XERT task router to Siri, Spotlight and Shortcuts', async () => {
  const [shortcuts, quickActions] = await Promise.all([
    readFile(shortcutsURL, 'utf8'),
    readFile(quickActionsURL, 'utf8'),
  ]);

  assert.match(shortcuts, /import AppIntents/);
  assert.match(shortcuts, /struct OpenXertBookingIntent: AppIntent/);
  assert.match(shortcuts, /struct OpenXertUpcomingBookingsIntent: AppIntent/);
  assert.match(shortcuts, /struct OpenXertEventsIntent: AppIntent/);
  assert.equal((shortcuts.match(/static let openAppWhenRun = true/g) || []).length, 3);
  assert.equal((shortcuts.match(/func perform\(\) async throws -> some IntentResult/g) || []).length, 3);
  assert.match(shortcuts, /XertQuickActionNavigation\.bookType/);
  assert.match(shortcuts, /XertQuickActionNavigation\.bookingsType/);
  assert.match(shortcuts, /XertQuickActionNavigation\.eventsType/);
  assert.match(shortcuts, /NotificationCenter\.default\.post\(name: \.xertOpenQuickAction/);
  assert.match(shortcuts, /struct XertAppShortcuts: AppShortcutsProvider/);
  assert.equal((shortcuts.match(/AppShortcut\(/g) || []).length, 3);
  assert.equal((shortcuts.match(/\\\(\.applicationName\)/g) || []).length, 3);
  assert.match(shortcuts, /Book a class/);
  assert.match(shortcuts, /Upcoming bookings/);
  assert.match(shortcuts, /Event calendar/);
  assert.match(quickActions, /guard route\(for: shortcutType\) != nil else \{ return false \}/);
});
