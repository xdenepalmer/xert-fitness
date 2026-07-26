import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native Operations Health retry is scoped to required launch-health sources', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const healthRefresh = store.slice(
    store.indexOf('func refreshHealth(session: AuthSession)'),
    store.indexOf('func searchMembers(session: AuthSession'),
  );
  const healthView = view.slice(
    view.indexOf('private struct AdminOperationsHealthView'),
    view.indexOf('private struct HealthStatusRow'),
  );

  assert.match(healthRefresh, /api\.adminSchemaCapabilities\(session: session\)/);
  assert.match(healthRefresh, /api\.adminCommerceHealth\(session: session\)/);
  assert.match(healthRefresh, /api\.adminPushHealth\(session: session\)/);
  assert.match(healthRefresh, /api\.adminPlatformSettings\(session: session\)/);
  assert.match(healthRefresh, /api\.adminProducts\(session: session\)/);
  assert.match(healthRefresh, /api\.adminClassSessions\(session: session\)/);

  for (const unrelatedLoader of [
    'adminDailyOperations', 'adminWaitlist', 'adminFollowUps', 'adminMembers',
    'adminOrders',
  ]) {
    assert.doesNotMatch(healthRefresh, new RegExp(`api\\.${unrelatedLoader}\\(`));
  }

  assert.match(healthView, /await admin\.refreshHealth\(session: session\)/);
  assert.doesNotMatch(healthView, /await admin\.refresh\(session: session\)/);
  assert.match(healthView, /\.refreshable \{[\s\S]*await admin\.refreshHealth\(session: session\)/);
});

test('native health retry preserves snapshots and updates only health availability', async () => {
  const store = await read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const healthRefresh = store.slice(
    store.indexOf('func refreshHealth(session: AuthSession)'),
    store.indexOf('func searchMembers(session: AuthSession'),
  );

  assert.match(store, /@Published private\(set\) var isRefreshingHealth = false/);
  assert.match(store, /@Published private\(set\) var healthSourceUpdatedAt: \[String: Date\] = \[:\]/);
  assert.match(store, /@Published private\(set\) var launchGateUpdatedAt: Date\?/);
  assert.match(healthRefresh, /loadedSources\.formUnion\(successfulSources\)/);
  assert.match(healthRefresh, /healthSourceUpdatedAt\[source\] = refreshedAt/);
  assert.match(healthRefresh, /refreshUnavailableSources\.removeAll \{[\s\S]*Self\.healthSources\.contains\(\$0\)[\s\S]*Self\.launchGateSources\.contains\(\$0\)/);
  assert.match(healthRefresh, /refreshUnavailableSources\.append\(contentsOf: failures\)/);
  assert.match(healthRefresh, /generation == healthRefreshGeneration/);
  assert.match(healthRefresh, /!Task\.isCancelled/);
  assert.match(store, /healthRefreshGeneration &\+= 1[\s\S]*isSavingSettings = true/);
  assert.match(healthRefresh, /Self\.launchGateSources\.isSubset\(of: successfulSources\)/);
  assert.match(
    store,
    /launchGateSources: Set<String> = \[[\s\S]*"schema health", "Stripe health", "push health"[\s\S]*"platform controls", "session packs", "full timetable"/,
  );

  // Failed requests must not erase the previously verified payloads.
  assert.doesNotMatch(healthRefresh, /catch\s*\{[^}]*schemaCapabilities\s*=/s);
  assert.doesNotMatch(healthRefresh, /catch\s*\{[^}]*commerceHealth\s*=/s);
  assert.doesNotMatch(healthRefresh, /catch\s*\{[^}]*pushHealth\s*=/s);

  // Partial health failures are inline state, never a disruptive global alert.
  assert.doesNotMatch(healthRefresh, /errorMessage\s*=/);
  assert.doesNotMatch(healthRefresh, /lastUpdatedAt\s*=/);
});
