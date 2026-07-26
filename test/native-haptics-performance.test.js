import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native haptics are semantic, reusable, user-controllable, and rate limited', async () => {
  const [haptics, root] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertHaptics.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
  ]);

  assert.match(haptics, /enum XertHapticFeedback: Hashable/);
  assert.match(haptics, /struct XertHapticGate/);
  assert.match(haptics, /minimumGlobalInterval/);
  assert.match(haptics, /enum XertHapticPreference/);
  assert.match(haptics, /guard XertHapticPreference\.isEnabled\(\)/);
  assert.match(haptics, /private static let selectionGenerator = UISelectionFeedbackGenerator\(\)/);
  assert.match(haptics, /private static let notificationGenerator = UINotificationFeedbackGenerator\(\)/);
  assert.match(haptics, /\.prepare\(\)/);
  assert.doesNotMatch(root, /UI(?:Impact|Selection|Notification)FeedbackGenerator/);
  assert.match(root, /XertHaptics\.play\(\.selection\)/);
  assert.match(root, /XertHaptics\.play\(\.success\)/);
  assert.match(root, /accessibilityReduceMotion[\s\S]*withAnimation\(reduceMotion \? nil/);
});

test('native refresh work is coalesced and scoped to invalidated data', async () => {
  const [store, root, cache] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/PublicDataCache.swift'),
  ]);

  assert.match(store, /private var bootstrapTask: Task<Void, Never>\?/);
  assert.match(store, /if let bootstrapTask[\s\S]*await bootstrapTask\.value/);
  assert.match(store, /private var requiresBootstrapRefresh = false/);
  assert.match(store, /repeat \{[\s\S]*await refresh\(\)[\s\S]*\} while requiresBootstrapRefresh \|\| lastRefreshCompletedAt == nil/);
  assert.match(store, /if !hasBootstrapped \{ requiresBootstrapRefresh = true \}/);
  assert.match(store, /func refreshIfStale\([\s\S]*maximumAge: TimeInterval = 45/);
  assert.equal((store.match(/guard bookingSessionID == nil, cancellingBookingID == nil else \{ return(?: \.failed)? \}/g) ?? []).length, 3);
  assert.equal((store.match(/await refreshBookingState\(memberVersion:/g) ?? []).length, 3);
  assert.match(store, /private func refreshBookingState[\s\S]*async let sessionRequest[\s\S]*async let creditRequest[\s\S]*async let bookingRequest/);
  assert.match(store, /func refreshAnnouncements\(\) async[\s\S]*api\.announcements/);
  assert.match(store, /announcementStateVersion\.invalidate\(\)[\s\S]*announcementStateVersion\.isCurrent\(announcementVersion\)/);
  assert.match(store, /loadedAnnouncements[\s\S]*if announcementStateVersion\.isCurrent\(announcementVersion\)/);
  assert.match(store, /private func cancelInFlightFullRefresh\(\)[\s\S]*dataRefreshTask\?\.cancel\(\)/);
  assert.match(root, /handleScenePhase[\s\S]*await store\.refreshIfStale\(\)/);
  assert.equal((root.match(/await store\.refreshAnnouncements\(\)/g) ?? []).length, 2);
  assert.match(cache, /Task\.detached\(priority: \.utility\)/);
  assert.match(store, /await PublicDataCache\.loadAsync\(\)/);
  assert.match(store, /await PublicDataCache\.saveAsync\(snapshot\)/);
});
