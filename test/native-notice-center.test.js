import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift');
const home = read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift');

test('push navigation carries the exact notice into Home', () => {
  assert.match(root, /HomeView\([\s\S]*route: navigation\.route[\s\S]*routeSequence: navigation\.routeSequence/);
  assert.match(root, /consumePendingAnnouncementID\(\)[\s\S]*openMemberRoute\(\.notices\(pendingAnnouncementID\), source: \.pushNotification\)/);
  assert.match(home, /case \.notices\(let announcementID\) = route/);
  assert.match(home, /highlightedAnnouncementID = announcementID/);
});

test('native Home exposes a stable notice badge and bounded preview', () => {
  assert.match(home, /noticeCount: store\.announcements\.count/);
  assert.match(home, /noticeCount > 0 \? "bell\.fill" : "bell"/);
  assert.ok(home.includes(String.raw`accessibilityLabel("Member notices, \(noticeCount) available")`));
  assert.match(home, /store\.announcements\.prefix\(2\)/);
  assert.match(home, /actionTitle: store\.announcements\.count > 2 \? "View all" : nil/);
});

test('notice centre supports push highlighting, actions and dismissal', () => {
  assert.match(home, /struct MemberNoticeCenter: View/);
  assert.match(home, /highlightedAnnouncementID/);
  assert.match(home, /showingNoticeCenter = true/);
  assert.match(home, /lastHandledRouteSequence/);
  assert.match(home, /onAction: \{ announcement in[\s\S]*handleAnnouncementAction\(announcement\)/);
  assert.match(home, /onDismiss: \{ announcement in[\s\S]*store\.dismissAnnouncement\(announcement\)/);
  assert.match(home, /presentationDetents\(\[\.medium, \.large\]\)/);
});

test('shared native sections preserve existing calls while allowing a header command', () => {
  assert.match(root, /struct XertSection<Content: View>/);
  assert.match(root, /actionTitle: String\? = nil/);
  assert.match(root, /action: \(\(\) -> Void\)\? = nil/);
  assert.match(root, /if let actionTitle, let action[\s\S]*Button\(actionTitle, action: action\)/);
});

test('native sign-out clears local push registration and retries failed unregister', () => {
  const store = read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift');
  const registration = read('../ios/XertFitnessApp/XertFitnessApp/Services/MemberPushRegistration.swift');
  const swiftTests = read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift');
  const signOut = store.slice(store.indexOf('func signOut()'), store.indexOf('func deleteAccount'));

  assert.match(registration, /struct PendingPushUnregister: Codable, Equatable/);
  assert.match(registration, /enum PendingPushUnregisterStore/);
  assert.match(signOut, /clearLocalPushRegistration\(\)/);
  assert.match(store, /PushDeviceTokenStore\.clear\(\)/);
  assert.match(store, /unregisterForRemoteNotifications\(\)/);
  assert.match(signOut, /PendingPushUnregisterStore\.save\(/);
  assert.match(store, /func deleteAccount[\s\S]*clearLocalPushRegistration\(\)/);
  assert.match(store, /flushPendingPushUnregister\(\)/);
  assert.match(store, /restoreMemberPushRegistration[\s\S]*await flushPendingPushUnregister\(\)/);
  assert.match(swiftTests, /PendingPushUnregisterStore\.save\(pending, defaults: defaults\)/);
});

test('native sign-out and account deletion purge member-linked UserDefaults state', () => {
  const store = read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift');
  const root = read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift');
  const navigation = read('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift');
  const ownerNavigation = read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift');
  const adminModels = read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift');
  const signOut = store.slice(store.indexOf('func signOut()'), store.indexOf('func deleteAccount'));
  const deleteAccount = store.slice(store.indexOf('func deleteAccount()'), store.indexOf('func book('));
  const purge = store.slice(
    store.indexOf('private func purgeLocalMemberState'),
    store.indexOf('private func flushPendingPushUnregister'),
  );
  const resetNavigation = root.slice(
    root.indexOf('private func resetMemberNavigationAfterSignOut'),
    root.indexOf('private func requireSignInForClass'),
  );

  assert.match(signOut, /purgeLocalMemberState\(userID: userID\)/);
  assert.match(deleteAccount, /purgeLocalMemberState\(userID: userID\)/);
  assert.match(purge, /PendingCheckoutStore\.clear\(\)/);
  assert.match(purge, /ClassReminderPreference\.setEnabled\(false\)/);
  assert.match(purge, /XertPinnedWorkspaceStore\.clear\(for: userID\)/);
  assert.match(purge, /XertWorkspaceOrderStore\.clear\(for: userID\)/);
  assert.match(purge, /XertOwnerWorkspacePinsStore\.clear\(for: userID\)/);
  assert.match(purge, /AdminSiteContentDraftStore\.clearAll\(\)/);
  assert.match(navigation, /enum XertPinnedWorkspaceStore[\s\S]*static func clear\(for userID: UUID/);
  assert.match(navigation, /enum XertWorkspaceOrderStore[\s\S]*static func clear\(for userID: UUID/);
  assert.match(ownerNavigation, /enum XertOwnerWorkspacePinsStore[\s\S]*static func clear\(for userID: UUID/);
  assert.match(adminModels, /static func clearAll\(defaults: UserDefaults/);
  assert.match(resetNavigation, /restoredAdminWorkspaceHistory = ""/);
  assert.match(resetNavigation, /restoredAdminNavigationUserID = ""/);
  assert.match(resetNavigation, /restoredAdminRecentWorkspaces = ""/);
});
