import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url);
const navigationURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift', import.meta.url);
const plistURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Info.plist', import.meta.url);
const modelsTestsURL = new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url);

test('native exact-task routes participate in privacy-safe Handoff continuation', async () => {
  const [root, navigation, plist, modelsTests] = await Promise.all([
    readFile(rootURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
    readFile(plistURL, 'utf8'),
    readFile(modelsTestsURL, 'utf8'),
  ]);

  assert.match(plist, /<key>NSUserActivityTypes<\/key>[\s\S]*com\.xertfitness\.app\.member-task/);
  assert.match(navigation, /enum XertRouteUserActivity/);
  assert.match(navigation, /activity\.webpageURL = route\.webURL/);
  assert.match(navigation, /activity\.isEligibleForHandoff = true/);
  assert.match(navigation, /activity\.isEligibleForSearch = !route\.isContextualTask/);
  assert.match(navigation, /activity\.isEligibleForPrediction = !route\.isContextualTask/);
  assert.match(navigation, /activity\.isEligibleForPublicIndexing = false/);
  assert.match(navigation, /func shouldAdvertise\([\s\S]*!route\.isContextualTask \|\| isSignedIn/);
  assert.match(navigation, /version\.intValue == currentVersion/);
  assert.match(navigation, /restoredRoute != webRoute/);
  assert.match(navigation, /case handoff/);
  assert.match(root, /\.userActivity\(XertRouteUserActivity\.activityType, isActive: shouldAdvertiseCurrentRoute\)/);
  assert.match(root, /XertRouteUserActivity\.shouldAdvertise\([\s\S]*isSignedIn: store\.isSignedIn,[\s\S]*isPrivacyLocked: isPrivacyLocked/);
  assert.match(root, /\.onContinueUserActivity\(XertRouteUserActivity\.activityType\)/);
  assert.match(root, /navigation\.open\(route, source: \.handoff\)/);
  assert.match(modelsTests, /testRouteUserActivityRoundTripsExactTasksWithoutIndexingPrivateContext/);
  assert.match(modelsTests, /testRouteUserActivityAdvertisingProtectsSignedOutAndLockedMemberContext/);
  assert.match(modelsTests, /testRouteUserActivityRejectsWrongMalformedAndConflictingPayloads/);
});
