import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('sign-out and account deletion purge member-linked local state', async () => {
  const [localState, store, navigation, ownerNavigation, info] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/MemberLocalState.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Info.plist'),
  ]);

  assert.match(localState, /PendingCheckoutStore\.clear/);
  assert.match(localState, /XertWorkspaceOrderStore\.clear\(for: userID/);
  assert.match(localState, /XertPinnedWorkspaceStore\.clear\(for: userID/);
  assert.match(localState, /XertOwnerWorkspacePinsStore\.clear\(for: userID/);
  assert.match(localState, /ClassReminderNavigation\.clearPending/);
  assert.match(localState, /AnnouncementPushNavigation\.clearPending/);
  assert.match(localState, /MemberPushPreference\.setEnabled\(false/);
  assert.match(localState, /PushDeviceTokenStore\.clear/);
  assert.match(navigation, /enum XertWorkspaceOrderStore[\s\S]*static func clear\(for userID: UUID/);
  assert.match(navigation, /enum XertPinnedWorkspaceStore[\s\S]*static func clear\(for userID: UUID/);
  assert.match(ownerNavigation, /enum XertOwnerWorkspacePinsStore[\s\S]*static func clear\(for userID: UUID/);

  const signOut = store.slice(store.indexOf('func signOut()'), store.indexOf('func deleteAccount()'));
  const deleteAccount = store.slice(store.indexOf('func deleteAccount()'), store.indexOf('func book('));
  assert.match(signOut, /currentUserID[\s\S]*clearLocalMemberState\(for: currentUserID\)[\s\S]*replaceAuthSession\(with: nil\)/);
  assert.match(deleteAccount, /api\.deleteAccount[\s\S]*clearLocalMemberState\(for: currentUserID\)[\s\S]*replaceAuthSession\(with: nil\)/);
  assert.match(store, /private func clearLocalMemberState[\s\S]*classRemindersEnabled = false[\s\S]*memberPushEnabled = false/);
  assert.match(info, /NSCalendarsWriteOnlyAccessUsageDescription/);
  assert.doesNotMatch(info, /NSCalendarsFullAccessUsageDescription/);
});
