import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pulse = read('../ios/XertFitnessApp/XertFitnessApp/Services/OwnerNavigationPulse.swift');
const root = read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift');
const swiftTests = read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift');

test('owner navigation pulse loads only bounded operational and health summaries concurrently', () => {
  for (const method of [
    'adminDailyOperations',
    'adminWaitlist',
    'adminFollowUps',
    'adminPTRequests',
    'adminCommerceHealth',
    'adminPushHealth',
  ]) {
    assert.match(pulse, new RegExp(`async let [\\s\\S]*api\\.${method}\\(session: session`));
  }
  assert.doesNotMatch(pulse, /adminMembers|adminOrders|adminAudit|adminClassSessions/);
  assert.match(pulse, /adminWaitlist\(session: session, limit: 50\)/);
  assert.match(pulse, /adminFollowUps\(session: session, limit: 50\)/);
  assert.match(pulse, /requested_count \+ \$1\.public_request_count/);
  assert.match(pulse, /filter\(\\\.attendance_due\)/);
  assert.match(pulse, /filter\(\\\.isPending\)/);
  assert.match(pulse, /commerceHealth\?\.ready == false/);
  assert.match(pulse, /pushHealth\?\.ready == false/);
});

test('owner pulse store is account scoped, freshness bounded, and resistant to stale responses', () => {
  assert.match(pulse, /private var accountID: UUID\?/);
  assert.match(pulse, /private var requestID: UUID\?/);
  assert.match(pulse, /if accountID != userID \{[\s\S]*reset\(\)[\s\S]*accountID = userID/);
  assert.match(pulse, /guard requestID == currentRequestID, accountID == userID else \{ return \}/);
  assert.match(pulse, /guard force \|\| !snapshot\.isFresh/);
  assert.match(pulse, /func reset\(\)[\s\S]*snapshot = \.empty/);
});

test('iPhone and iPad owner entry points expose the same operational pulse', () => {
  assert.match(root, /@StateObject private var ownerNavigationPulse = XertOwnerNavigationPulseStore\(\)/);
  assert.equal((root.match(/ownerPulse: ownerNavigationPulse\.snapshot/g) || []).length, 2);
  assert.equal((root.match(/XertOwnerNavigationPulseBadge\(pulse: ownerPulse\)/g) || []).length, 2);
  assert.equal((root.match(/\.accessibilityValue\(ownerPulse\.accessibilityLabel\)/g) || []).length, 2);
  assert.match(root, /refreshOwnerNavigationPulse\(force: true\)/);
  assert.match(root, /ownerNavigationPulse\.reset\(\)/);
  assert.match(swiftTests, /testOwnerNavigationPulseBoundsCountsAndExplainsAttention/);
  assert.match(swiftTests, /testOwnerNavigationPulseFreshnessRejectsFutureAndExpiredSnapshots/);
});
