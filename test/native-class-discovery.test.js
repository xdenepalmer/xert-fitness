import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native booking discovery exposes complete searchable and filterable class controls', async () => {
  const [discovery, bookingView, swiftTests] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/ClassSessionDiscovery.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(discovery, /enum ClassSessionDateWindow/);
  assert.match(discovery, /case sevenDays/);
  assert.match(discovery, /enum ClassSessionFit/);
  assert.match(discovery, /case spotsAvailable/);
  assert.match(discovery, /case beginnerFriendly/);
  assert.match(discovery, /calendar\.isDate\(session\.start_time, inSameDayAs: now\)/);
  assert.match(discovery, /localizedCaseInsensitiveContains\(query\)/);
  assert.match(discovery, /\.sorted/);

  assert.match(bookingView, /\.searchable\(/);
  assert.match(bookingView, /Picker\("When", selection: \$classDateWindow\)/);
  assert.match(bookingView, /Picker\("Training fit", selection: \$classFit\)/);
  assert.match(bookingView, /ForEach\(visibleSessions\)/);
  assert.match(bookingView, /No classes match those filters/);
  assert.match(bookingView, /resetClassDiscovery/);

  assert.match(swiftTests, /testClassDiscoverySearchesMemberFacingSessionDetails/);
  assert.match(swiftTests, /testClassDiscoveryUsesQueenslandTodayAndSevenDayWindows/);
  assert.match(swiftTests, /testClassDiscoveryFiltersFitAndSortsDeterministically/);
});
