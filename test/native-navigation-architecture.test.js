import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url);
const navigationURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift', import.meta.url);

test('native navigation uses five stable primary destinations without iOS More overflow', async () => {
  const root = await readFile(rootURL, 'utf8');
  const navigation = await readFile(navigationURL, 'utf8');
  assert.match(root, /struct XertNavigationDock/);
  assert.match(root, /\.toolbar\(\.hidden, for: \.tabBar\)/);
  assert.match(root, /\.safeAreaInset\(edge: \.bottom, spacing: 0\)/);
  assert.match(navigation, /enum XertPrimaryDestination: Int, CaseIterable, Identifiable, Hashable/);
  for (const item of [
    ['home', '0'], ['booking', '1'], ['events', '2'], ['account', '3'], ['explore', '4'],
  ]) assert.match(navigation, new RegExp(`case ${item[0]} = ${item[1]}`));
  assert.match(navigation, /dockOrder: \[Self\] = \[\.home, \.booking, \.events, \.explore, \.account\]/);
  assert.match(root, /ForEach\(items\)/);
  assert.doesNotMatch(root, /Label\("Admin", systemImage:/);
});

test('primary routing is typed, restorable, and owns native deep-link mapping', async () => {
  const [root, navigation] = await Promise.all([
    readFile(rootURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
  ]);
  assert.match(root, /@SceneStorage\("xert\.primaryDestination"\)/);
  assert.match(root, /Binding<XertPrimaryDestination>/);
  assert.match(root, /private func navigate\(to destination: XertPrimaryDestination\)/);
  assert.match(root, /XertPrimaryDestination\.destination\(for: url\)/);
  assert.doesNotMatch(root, /selectedTab\s*=\s*\d/);
  for (const path of ['/booking', '/events', '/account', '/explore']) {
    assert.match(navigation, new RegExp(`"${path.replace('/', '\\/')}"`));
  }
  assert.match(navigation, /url\.scheme\?\.lowercased\(\) == "xertfitness"/);
  assert.match(navigation, /url\.user == nil[\s\S]*url\.password == nil/);
});

test('owner command access is role-aware, full-screen, and never buried in tab overflow', async () => {
  const root = await readFile(rootURL, 'utf8');
  assert.match(root, /isAdmin: store\.profile\?\.isAdmin == true/);
  assert.match(root, /Text\("Owner Command Centre"\)/);
  assert.match(root, /\.fullScreenCover\(isPresented: \$showingAdminCommandCentre\)/);
  assert.match(root, /if store\.profile\?\.isAdmin == true \{[\s\S]*AdminCommandCentreView\(onClose:/);
});

test('navigation carries operational state and native interaction feedback', async () => {
  const root = await readFile(rootURL, 'utf8');
  assert.match(root, /noticeCount: store\.announcements\.count/);
  assert.match(root, /bookingCount: activeBookingCount/);
  assert.match(root, /UISelectionFeedbackGenerator\(\)\.selectionChanged\(\)/);
  assert.match(root, /matchedGeometryEffect\(id: "primary-navigation-selection"/);
  assert.match(root, /dynamicTypeSize\.isAccessibilitySize \? 80 : 66/);
  assert.match(root, /activeBookingCount[\s\S]*isActiveClassPlace[\s\S]*start_time >= Date\(\)/);
  assert.match(root, /guard selection != item else \{[\s\S]*onReselect\(item\)/);
  assert.match(root, /handleReselection[\s\S]*store\.refresh\(\)/);
});
