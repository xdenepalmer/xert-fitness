import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native launch preserves a saved login across temporary refresh failures', async () => {
  const [api, store] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
  ]);
  const bootstrap = store.slice(store.indexOf('func bootstrap()'), store.indexOf('func refresh()'));
  const memberRefresh = store.slice(store.indexOf('var memberSession'), store.indexOf('if let authSession = memberSession'));

  assert.doesNotMatch(bootstrap, /api\.refresh/);
  assert.match(memberRefresh, /invalidatesSession == true/);
  assert.match(api, /APIError\(message: message, statusCode: http\.statusCode\)/);
  assert.match(api, /statusCode\.map \{ \[400, 401, 403\]\.contains\(\$0\) \} \?\? false/);
});

test('native member mutations securely recover a revoked session without treating validation failures as logout', async () => {
  const [api, store, swiftTests] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url), 'utf8'),
  ]);
  const recovery = store.slice(
    store.indexOf('private func recoverUnauthorizedMemberSession('),
    store.indexOf('private func applyMemberOnboarding('),
  );

  assert.match(api, /var isUnauthorized: Bool \{ statusCode == 401 \}/);
  assert.match(recovery, /MemberPushRegistration\.stopReceivingPrivateNotices\(\)/);
  assert.match(recovery, /clearLocalMemberState\(for: currentUserID\)/);
  assert.match(recovery, /replaceAuthSession\(with: nil\)/);
  assert.match(recovery, /KeychainStore\.clearSession\(\)/);
  assert.match(recovery, /await ClassReminderScheduler\.shared\.clearAll\(\)/);
  assert.match(recovery, /Your XERT session has expired\. Sign in again to continue\./);

  for (const [operation, nextOperation] of [
    ['func book(_ session:', 'func joinWaitlist(_ session:'],
    ['func joinWaitlist(_ session:', 'func cancel(_ booking:'],
    ['func cancel(_ booking:', '/// Booking mutations only invalidate'],
    ['func checkoutURL(', 'func hasMatchingPendingCheckout('],
    ['func updateProfile(', 'func clearMemberOnboardingError('],
    ['func saveMemberOnboarding(', 'func updatePassword('],
    ['func updatePassword(', 'private func authenticate('],
  ]) {
    const start = store.indexOf(operation);
    const end = store.indexOf(nextOperation, start + operation.length);
    assert.notEqual(start, -1, `missing ${operation}`);
    assert.notEqual(end, -1, `missing boundary ${nextOperation}`);
    assert.match(
      store.slice(start, end),
      /recoverUnauthorizedMemberSession\(error, memberVersion: memberVersion\)/,
      operation,
    );
  }

  const publicEnquiry = store.slice(
    store.indexOf('func requestPrivateSession('),
    store.indexOf('func requestClassInterest('),
  );
  assert.doesNotMatch(publicEnquiry, /recoverUnauthorizedMemberSession/);
  assert.match(swiftTests, /statusCode: 401\)\.isUnauthorized/);
  assert.match(swiftTests, /statusCode: 400\)\.isUnauthorized/);
  assert.match(swiftTests, /statusCode: 403\)\.isUnauthorized/);
});

test('native command centre fails closed on a scoped unauthorized owner response', async () => {
  const [api, adminStore, memberStore, commandCentre] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(api, /http\.statusCode == 401[\s\S]*xertAPIUnauthorizedResponse, object: self/);
  assert.match(adminStore, /@Published private\(set\) var requiresReauthentication = false/);
  assert.match(
    adminStore,
    /publisher\(for: \.xertAPIUnauthorizedResponse, object: api\)[\s\S]*requiresReauthentication == false[\s\S]*requiresReauthentication = true/,
  );
  assert.match(commandCentre, /onChange\(of: admin\.requiresReauthentication\)/);
  assert.match(
    commandCentre,
    /await store\.expireUnauthorizedOwnerSession\(\)[\s\S]*admin\.acknowledgeReauthenticationRequest\(\)[\s\S]*onClose\?\(\)/,
  );
  assert.match(memberStore, /func expireUnauthorizedOwnerSession\(\) async/);
  assert.match(memberStore, /Your owner session has expired\. Sign in again to reopen the Command Centre\./);
  assert.match(memberStore, /private func expireCurrentSession\(message: String\) async/);
});
