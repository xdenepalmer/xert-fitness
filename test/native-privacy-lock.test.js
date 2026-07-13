import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native privacy lock protects signed-in tabs across app lifecycle changes', async () => {
  const [service, root, account, plist, project, swiftTests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/AppPrivacyLock.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Info.plist'),
    read('../ios/XertFitnessApp/project.yml'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);

  assert.match(service, /deviceOwnerAuthentication/);
  assert.match(service, /localizedCancelTitle = "Keep Locked"/);
  assert.match(service, /isSignedIn && isEnabled && !isUnlocked/);
  assert.match(root, /if isPrivacyLocked[\s\S]*PrivacyLockView[\s\S]*else \{[\s\S]*memberTabs/);
  assert.match(root, /guard phase == \.active else[\s\S]*isPrivacyUnlocked = false/);
  assert.match(root, /guard isPrivacyLocked, !isUnlocking, scenePhase == \.active/);
  assert.match(root, /Button\("Sign Out", role: \.destructive/);
  assert.ok(account.includes('"Require \\(authenticationSupport.methodName)"'));
  assert.match(account, /@AppStorage\(AppPrivacyLock\.preferenceKey\)/);
  assert.match(plist, /NSFaceIDUsageDescription/);
  assert.match(project, /path: XertFitnessApp/);
  assert.match(swiftTests, /testPrivacyLockPreferenceRoundTripsAndOnlyLocksSignedInMembers/);
});
