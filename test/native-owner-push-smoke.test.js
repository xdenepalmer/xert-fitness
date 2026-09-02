import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native System status runs a confirmed owner-only production push smoke test', async () => {
  const [models, api, store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(models, /struct AdminOwnerPushSmokeTestResult: Codable, Hashable/);
  assert.match(models, /struct LastAttempt: Codable, Hashable/);
  assert.match(models, /let last_attempt: LastAttempt\?/);
  assert.match(models, /let owner_smoke_test: LastAttempt\?/);
  assert.match(models, /func isOwnerLaunchReady\(at now: Date = Date\(\)\)/);
  assert.match(models, /subscriptions\.production > 0/);
  assert.match(models, /smokeTest\.status == "delivered"/);
  assert.match(models, /age <= 24 \* 60 \* 60/);
  assert.match(api, /func adminSendOwnerPushSmokeTest/);
  assert.match(api, /AdminOwnerPushSmokeTestRequest\(action: "test_owner_push"\)/);

  const action = store.slice(
    store.indexOf('func sendOwnerPushSmokeTest(session: AuthSession)'),
    store.indexOf('func bulkUpdatePTRequests('),
  );
  assert.match(action, /healthSourceIsCurrent\("push health"\)/);
  assert.match(action, /launchGateUpdatedAt = nil/);
  assert.match(action, /api\.adminSendOwnerPushSmokeTest/);
  assert.match(action, /pushHealth = try await api\.adminPushHealth/);
  assert.match(action, /result\.attempted == 0/);
  assert.match(action, /result\.delivered == result\.attempted/);
  assert.doesNotMatch(action, /error\.localizedDescription/);

  assert.match(view, /accessibilityIdentifier\("owner\.pushSmokeTest"\)/);
  assert.match(view, /push\.subscriptions\.production == 0/);
  assert.match(view, /Send a production push test\?/);
  assert.match(view, /creates no member announcement/);
  assert.match(view, /await admin\.sendOwnerPushSmokeTest\(session: session\)/);
  assert.match(view, /lastAttempt\.status\.uppercased\(\)/);
  assert.match(view, /smokeTest\.status\.uppercased\(\)/);
});
