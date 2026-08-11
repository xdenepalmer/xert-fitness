import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('owner Command Centre retains an account-scoped warm store and stages presentation refreshes', async () => {
  const [root, view, store, modelsTests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);

  assert.match(root, /@State private var ownerAdminStore: AdminStore\?/);
  assert.match(root, /@State private var ownerAdminStoreUserID: UUID\?/);
  assert.match(root, /if store\.profile\?\.isAdmin == true, let ownerAdminStore/);
  assert.match(root, /AdminCommandCentreView\([\s\S]*admin: ownerAdminStore/);
  assert.match(
    root,
    /ownerAdminStoreUserID != ownerID \|\| ownerAdminStore == nil[\s\S]*ownerAdminStore = AdminStore\(\)[\s\S]*ownerAdminStoreUserID = ownerID/,
  );
  assert.ok((root.match(/ownerAdminStore = nil/g) || []).length >= 3);
  assert.ok((root.match(/showingAdminCommandCentre = false[\s\S]{0,160}ownerAdminStore = nil/g) || []).length >= 3);
  assert.match(root, /onChange\(of: store\.authSession\?\.user\?\.id\)[\s\S]*ownerAdminStoreUserID != store\.authSession\?\.user\?\.id/);

  assert.match(view, /@ObservedObject private var admin: AdminStore/);
  assert.doesNotMatch(view, /@StateObject private var admin = AdminStore\(\)/);
  assert.match(view, /init\([\s\S]*admin: AdminStore,[\s\S]*self\.admin = admin/);
  assert.match(view, /await admin\.refreshForPresentation\(session: session\)/);
  assert.match(
    view,
    /await admin\.refreshForPresentation\(session: session\)\s*guard !Task\.isCancelled else \{ return \}\s*if let task = presentedOwnerTask/,
  );
  assert.match(view, /onChange\(of: scenePhase\)[\s\S]*admin\.refreshForPresentation\(session: session\)/);
  assert.match(view, /@State private var foregroundPresentationRefreshTask: Task<Void, Never>\?/);
  assert.match(
    view,
    /onChange\(of: scenePhase\)[\s\S]*foregroundPresentationRefreshTask\?\.cancel\(\)[\s\S]*foregroundPresentationRefreshTask = Task/,
  );
  assert.match(view, /onDisappear[\s\S]*foregroundPresentationRefreshTask\?\.cancel\(\)/);
  assert.match(view, /onDisappear[\s\S]*admin\.clearVolatileDrillDownData\(\)/);
  assert.doesNotMatch(view, /onChange\(of: admin\.isLoading\)/);

  assert.match(store, /enum AdminPresentationRefreshPlan: Equatable/);
  assert.match(store, /static let fullRefreshAfter: TimeInterval = 10 \* 60/);
  assert.match(store, /static let unavailableRetryAfter: TimeInterval = 30/);
  assert.match(store, /func presentationRefreshPlan\(now: Date = Date\(\)\)/);
  assert.match(store, /hasUnavailableSources: !refreshUnavailableSources\.isEmpty/);
  assert.match(store, /func refreshForPresentation\(session: AuthSession\)/);
  assert.match(
    store,
    /func clearVolatileDrillDownData\(\)[\s\S]*eventRosterGeneration &\+= 1[\s\S]*eventRoster = \[\][\s\S]*rosterLoadGeneration &\+= 1[\s\S]*classRoster = \[\][\s\S]*classRosterReadiness = \[:\]/,
  );
  assert.match(store, /case \.full:[\s\S]*await refresh\(session: session\)/);
  assert.match(store, /case \.operations:[\s\S]*refreshOperationalPulse\(session: session\)/);
  assert.match(store, /case \.retryUnavailable\(let delay\):[\s\S]*Task\.sleep\([\s\S]*await refresh\(session: session\)/);
  assert.match(store, /case \.reuse:[\s\S]*break/);
  assert.match(
    store,
    /guard !Task\.isCancelled else \{ return \}[\s\S]*loadedSources\.formUnion\(successfulSources\)[\s\S]*hasCompletedRefresh = true[\s\S]*fullRefreshAttemptedAt = Date\(\)/,
  );
  assert.match(modelsTests, /testOwnerPresentationRefreshPolicyReusesWarmDataWithoutLeavingQueuesStale/);
});

test('iPhone owner launcher is full-height, searchable, source-aware and sheet-safe', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const switcher = view.slice(
    view.indexOf('private struct AdminWorkspaceSwitcher'),
    view.indexOf('private struct AdminOwnerTaskSheet'),
  );

  assert.match(view, /@State private var pendingLauncherAction: AdminOwnerLauncherAction\?/);
  assert.match(view, /sheet\([\s\S]*isPresented: \$showingWorkspaceSwitcher,[\s\S]*onDismiss: runPendingLauncherAction/);
  assert.match(view, /pendingLauncherAction = action[\s\S]*showingWorkspaceSwitcher = false/);
  assert.match(view, /private func runPendingLauncherAction\(\)[\s\S]*action\.workspace[\s\S]*action\.quickAction/);

  assert.match(switcher, /@Environment\(\\\.dynamicTypeSize\) private var dynamicTypeSize/);
  assert.match(switcher, /matchingActions: \[AdminOwnerLauncherAction\]/);
  assert.match(switcher, /actionSection\("Quick actions", actions: matchingActions\)/);
  assert.match(switcher, /actionSection\("Quick actions", actions: AdminOwnerLauncherAction\.allCases\)/);
  assert.match(switcher, /dynamicTypeSize\.isAccessibilitySize \? 1 : 2/);
  assert.match(switcher, /frame\(maxWidth: \.infinity, minHeight: 96/);
  assert.match(switcher, /admin\.loadedSources\.contains\(source\)/);
  assert.match(switcher, /!admin\.refreshUnavailableSources\.contains\(source\)/);
  assert.match(switcher, /\.presentationDetents\(\[\.large\]\)/);
  assert.match(switcher, /\.accessibilityLabel\(action\.title\)/);

  assert.match(view, /private enum AdminOwnerLauncherAction: String, CaseIterable, Identifiable/);
  for (const action of ['newClass', 'newNotice', 'workout', 'newForm', 'newSessionPack', 'newCoach', 'newEvent']) {
    assert.match(view, new RegExp(`case ${action}`));
  }
  for (const source of ['full timetable', 'member notices', 'session packs', 'team directory', 'event calendar']) {
    assert.match(view, new RegExp(`return "${source}"`));
  }
});

test('owner account toolbar stays within the iOS 16 deployment contract', async () => {
  const [account, project] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
    read('../ios/XertFitnessApp/project.yml'),
  ]);

  assert.match(project, /iOS: "16\.0"/);
  assert.match(account, /ToolbarItem\(placement: \.navigationBarTrailing\)[\s\S]*Label\("Owner"/);
  assert.doesNotMatch(account, /\.topBarTrailing/);
});
