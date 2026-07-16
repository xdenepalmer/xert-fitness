import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertFitnessApp.swift', import.meta.url);
const commandsURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertNavigationCommands.swift', import.meta.url);
const navigationURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift', import.meta.url);
const rootURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url);

test('iPad scene commands share typed navigation and preserve root authorization guards', async () => {
  const [app, commands, navigation, root] = await Promise.all([
    readFile(appURL, 'utf8'),
    readFile(commandsURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
    readFile(rootURL, 'utf8'),
  ]);

  assert.match(app, /\.commands \{[\s\S]*XertNavigationCommands\(\)/);
  assert.doesNotMatch(app, /@StateObject private var navigation/);
  assert.match(root, /@StateObject private var navigation = XertNavigationCoordinator\(\)/);
  assert.match(root, /\.focusedSceneValue\(\\\.xertNavigationCommandContext, navigationCommandContext\)/);

  assert.match(commands, /struct XertNavigationCommands: Commands/);
  assert.match(commands, /@FocusedValue\(\\\.xertNavigationCommandContext\) private var context/);
  assert.match(commands, /struct XertNavigationCommandContext/);
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
  assert.match(commands, /disabled\(context\?\.previousRoute == nil\)/);
  assert.match(commands, /disabled\(context\?\.nextRoute == nil\)/);
  assert.equal((commands.match(/disabled\(!hasActiveScene\)/g) || []).length, 2);
  assert.match(commands, /disabled\(context\.map \{ !\$0\.isAvailable \|\| \$0\.selection == destination \} \?\? true\)/);
  assert.match(commands, /context\?\.isAvailable == true/);

  assert.match(navigation, /case keyboard/);
  assert.match(root, /guard !isPrivacyLocked else \{ return \}/);
  assert.match(root, /let isAvailable = !isPrivacyLocked[\s\S]*&& !showingAdminCommandCentre[\s\S]*&& !showingNavigationCommands/);
  assert.match(root, /selection: isAvailable \? navigation\.selection : \.home/);
  assert.match(root, /previousRoute: isAvailable \? navigation\.previousRoute : nil/);
  assert.match(root, /isAdmin: isAvailable && store\.profile\?\.isAdmin == true/);
  assert.match(root, /navigation\.select\(destination, source: \.keyboard\)/);
  assert.match(root, /guard store\.profile\?\.isAdmin == true, !showingNavigationCommands else \{ return \}/);
});
