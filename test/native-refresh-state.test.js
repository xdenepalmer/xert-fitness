import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native refreshes coalesce and reject results from an earlier account generation', async () => {
  const [store, version, swiftTests] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/MemberStateVersion.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url), 'utf8'),
  ]);

  const refresh = store.slice(store.indexOf('func refresh()'), store.indexOf('private func performRefresh'));
  const transition = store.slice(store.indexOf('private func replaceAuthSession'), store.indexOf('private func clearMemberData'));
  const sessionRefresh = store.slice(store.indexOf('private func validAuthSession'), store.indexOf('private func canApplyRefresh'));
  const checkoutReconciliation = store.slice(store.indexOf('func reconcileCheckout'), store.indexOf('func requestPrivateSession'));

  assert.match(version, /mutating func invalidate\(\)/);
  assert.match(version, /value &\+= 1/);
  assert.match(version, /func isCurrent\(_ snapshot: Int\)/);
  assert.match(swiftTests, /testMemberStateVersionsRejectWorkFromAnEarlierAccountGeneration/);

  assert.match(refresh, /if let dataRefreshTask/);
  assert.match(refresh, /await dataRefreshTask\.value/);
  assert.match(refresh, /dataRefreshVersion\.snapshot/);
  assert.match(store, /guard canApplyMemberState\(memberVersion, session: authSession\) && canApplyRefresh\(refreshVersion\)/);

  assert.match(transition, /memberStateVersion\.invalidate\(\)/);
  assert.match(transition, /dataRefreshVersion\.invalidate\(\)/);
  assert.match(transition, /dataRefreshTask\?\.cancel\(\)/);
  assert.match(transition, /sessionRefreshTask\?\.cancel\(\)/);
  assert.match(transition, /clearMemberData\(\)/);

  assert.match(sessionRefresh, /guard memberStateVersion\.isCurrent\(memberVersion\)/);
  assert.match(sessionRefresh, /authSession\?\.access_token == current\.access_token/);
  assert.match(sessionRefresh, /authSession = refreshed/);
  assert.match(checkoutReconciliation, /guard canApplyMemberState\(memberVersion, session: memberSession\)/);
});

test('native account distinguishes unavailable member data from genuine empty history', async () => {
  const account = await readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift', import.meta.url),
    'utf8'
  );
  const root = await readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url),
    'utf8'
  );

  assert.match(account, /Text\(creditsUnavailableOrLoading \? "—"/);
  assert.match(account, /store\.isLoading && store\.credits\.isEmpty/);
  assert.match(account, /unavailableDataSources\.contains\(\.orders\).*accountUnavailableRow\("Purchase history"\)/s);
  assert.match(account, /unavailableDataSources\.contains\(\.bookings\).*accountUnavailableRow\("Bookings"\)/s);
  assert.match(account, /unavailableDataSources\.contains\(\.privateSessions\).*accountUnavailableRow\("PT requests"\)/s);
  assert.match(root, /Retry unavailable data/);
  assert.match(root, /Task \{ await store\.refresh\(\) \}/);
});

test('temporary native token refresh failures retain stale member data for retry', async () => {
  const store = await readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url),
    'utf8',
  );
  const memberSession = store.slice(store.indexOf('var memberSession'), store.indexOf('if let authSession = memberSession'));

  assert.match(memberSession, /invalidatesSession == true/);
  assert.match(memberSession, /replaceAuthSession\(with: nil\)/);
  assert.match(memberSession, /unavailableDataSources\.formUnion\(Self\.memberDataSources\)/);
  assert.match(memberSession, /isUsingStaleMemberData = memberDataUpdatedAt != nil/);
});
