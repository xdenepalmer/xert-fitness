import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertFitnessApp.swift', import.meta.url);
const commandsURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertNavigationCommands.swift', import.meta.url);
const navigationURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift', import.meta.url);
const rootURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url);
const ownerURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url);

test('iPad scene commands share typed member and owner navigation with authorization guards', async () => {
  const [app, commands, navigation, root, owner] = await Promise.all([
    readFile(appURL, 'utf8'),
    readFile(commandsURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
    readFile(rootURL, 'utf8'),
    readFile(ownerURL, 'utf8'),
  ]);

  assert.match(app, /\.commands \{[\s\S]*XertNavigationCommands\(\)/);
  assert.doesNotMatch(app, /@StateObject private var navigation/);
  assert.match(root, /@StateObject private var navigation = XertNavigationCoordinator\(\)/);
  assert.match(root, /\.focusedSceneValue\(\\\.xertNavigationCommandContext, navigationCommandContext\)/);

  assert.match(commands, /struct XertNavigationCommands: Commands/);
  assert.match(commands, /@FocusedValue\(\\\.xertNavigationCommandContext\) private var context/);
  assert.match(commands, /struct XertNavigationCommandContext/);
  assert.match(commands, /enum XertSceneNavigationScope: Equatable/);
  assert.match(commands, /case member\(XertPrimaryDestination\)/);
  assert.match(commands, /case owner\(XertOwnerWorkspace\)/);
  assert.match(commands, /private struct XertNavigationCommandContextKey: FocusedValueKey/);
  assert.match(commands, /CommandMenu\("XERT"\)/);
  for (const [destination, shortcut] of [
    ['home', '1'], ['booking', '2'], ['events', '3'], ['explore', '4'], ['account', '5'],
  ]) {
    assert.match(commands, new RegExp(`workspaceButton\\(\\.${destination}, shortcut: "${shortcut}"\\)`));
  }
  assert.match(commands, /keyboardShortcut\("k", modifiers: \.command\)/);
  assert.match(commands, /keyboardShortcut\("\[", modifiers: \.command\)/);
  assert.match(commands, /keyboardShortcut\("\]", modifiers: \.command\)/);
  assert.match(commands, /keyboardShortcut\("r", modifiers: \.command\)/);
  assert.match(commands, /context\?\.isAvailable == true, context\?\.isAdmin == true[\s\S]*keyboardShortcut\("a", modifiers: \[\.command, \.shift\]\)/);
  assert.match(commands, /disabled\(context\?\.previousTitle == nil\)/);
  assert.match(commands, /disabled\(context\?\.nextTitle == nil\)/);
  assert.ok((commands.match(/disabled\(!hasActiveScene\)/g) || []).length >= 4);
  assert.match(commands, /disabled\(!hasActiveScene \|\| memberSelection == destination\)/);
  assert.match(commands, /disabled\(!hasActiveScene \|\| selection == workspace\)/);
  assert.match(commands, /context\?\.isAvailable == true/);
  assert.match(commands, /Menu\("Open Owner Workspace", systemImage: "square\.grid\.2x2"\)/);
  assert.match(commands, /case ownerWorkspace\(XertOwnerWorkspace\)/);
  assert.match(commands, /case closeOwner/);

  assert.match(navigation, /case keyboard/);
  assert.match(root, /guard !isPrivacyLocked else \{ return \}/);
  assert.match(root, /let isAvailable = !isPrivacyLocked[\s\S]*&& !showingAdminCommandCentre[\s\S]*&& !showingNavigationCommands/);
  assert.match(root, /scope: \.member\(isAvailable \? navigation\.selection : \.home\)/);
  assert.match(root, /previousTitle: isAvailable \? navigation\.previousRoute\?\.navigationTitle : nil/);
  assert.match(root, /isAdmin: isAvailable && store\.profile\?\.isAdmin == true/);
  assert.match(root, /selectMemberDestination\(destination, source: \.keyboard\)/);
  assert.match(root, /guard store\.profile\?\.isAdmin == true, !showingNavigationCommands else \{ return \}/);
  assert.match(owner, /\.focusedSceneValue\(\\\.xertNavigationCommandContext, ownerNavigationCommandContext\)/);
  assert.match(owner, /scope: \.owner\(currentWorkspace\)/);
  assert.match(owner, /let isAvailable = store\.authSession != nil[\s\S]*store\.profile\?\.isAdmin == true/);
  assert.match(owner, /case \.ownerWorkspace\(let workspace\):[\s\S]*openWorkspace\(workspace\)/);
  assert.match(owner, /case \.closeOwner:[\s\S]*onClose\?\(\)/);
});
