import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url);
const navigationURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift', import.meta.url);
const viewURL = name => new URL(`../ios/XertFitnessApp/XertFitnessApp/Views/${name}.swift`, import.meta.url);

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

test('native navigation adapts from a compact dock to an iPad workspace rail', async () => {
  const [root, navigation] = await Promise.all([
    readFile(rootURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
  ]);
  assert.match(root, /@Environment\(\\\.horizontalSizeClass\) private var horizontalSizeClass/);
  assert.match(navigation, /enum XertNavigationPresentation: Equatable/);
  assert.match(navigation, /isRegularWidth \? \.workspaceRail : \.compactDock/);
  assert.match(root, /safeAreaInset\(edge: \.leading, spacing: 0\)[\s\S]*navigationPresentation == \.workspaceRail[\s\S]*navigationRail/);
  assert.match(root, /safeAreaInset\(edge: \.bottom, spacing: 0\)[\s\S]*navigationPresentation == \.compactDock[\s\S]*navigationDock/);
  assert.match(root, /private struct XertNavigationRail: View/);
  assert.match(root, /XertLogoHeader\(height:/);
  assert.match(root, /xert-navigation-history/);
  assert.match(root, /xert-navigation-owner/);
  assert.match(root, /rail-navigation-selection/);
  assert.match(root, /frame\(width: dynamicTypeSize\.isAccessibilitySize \? 136 : 104\)/);
  assert.match(root, /keyboardShortcut\(keyboardShortcut\(for: item\), modifiers: \.command\)/);
  assert.match(root, /case \.home: return "1"[\s\S]*case \.account: return "5"/);
  assert.match(root, /keyboardShortcut\("a", modifiers: \[\.command, \.shift\]\)/);
  assert.match(root, /hoverEffect\(\.highlight\)/);
  assert.equal((root.match(/accessibilityIdentifier\("xert-navigation-/g) || []).length, 5);
});

test('member routing is typed, task-restorable, and owns native deep-link mapping', async () => {
  const [root, navigation] = await Promise.all([
    readFile(rootURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
  ]);
  assert.match(root, /@SceneStorage\("xert\.memberRoute"\)/);
  assert.match(root, /Binding<XertPrimaryDestination>/);
  assert.match(root, /@StateObject private var navigation = XertNavigationCoordinator\(\)/);
  assert.match(root, /navigation\.restore\(routeValue: restoredMemberRoute\)/);
  assert.match(root, /restoredMemberRoute = route\.restorationValue/);
  assert.match(root, /private func navigate\(to destination: XertPrimaryDestination\)/);
  assert.match(root, /XertMemberRoute\.route\(for: url\)/);
  assert.match(root, /navigation\.open\(route, source: \.deepLink\)/);
  assert.doesNotMatch(root, /selectedTab\s*=\s*\d/);
  for (const path of ['/booking', '/events', '/account', '/explore']) {
    assert.match(navigation, new RegExp(`"${path.replace('/', '\\/')}"`));
  }
  assert.match(navigation, /url\.scheme\?\.lowercased\(\) == "xertfitness"/);
  assert.match(navigation, /url\.user == nil[\s\S]*url\.password == nil[\s\S]*url\.query == nil[\s\S]*url\.fragment == nil/);
  assert.match(navigation, /enum XertMemberRoute: Hashable/);
  assert.match(navigation, /case notices\(UUID\?\)/);
  assert.match(navigation, /case upcomingBookings\(UUID\?\)/);
  assert.match(navigation, /case sessionPacks/);
  assert.match(navigation, /case purchaseConfirmation/);
  assert.match(navigation, /case eventGoals/);
  assert.match(navigation, /var restorationValue: String/);
  assert.match(navigation, /static func restore\(_ value: String\)/);
  assert.match(navigation, /final class XertNavigationCoordinator: ObservableObject/);
  assert.match(navigation, /@Published private\(set\) var route: XertMemberRoute/);
  assert.match(navigation, /func open\(_ targetRoute: XertMemberRoute/);
  assert.match(navigation, /private\(set\) var history: \[XertPrimaryDestination\]/);
  assert.match(navigation, /func returnToPrevious\(source: XertNavigationSource/);
  assert.match(navigation, /history\.count > historyLimit[\s\S]*history\.removeFirst/);
  for (const source of ['restoration', 'dock', 'dockSwipe', 'history', 'content', 'deepLink', 'pushNotification', 'checkout', 'commandPalette']) {
    assert.match(navigation, new RegExp(`case ${source}`));
  }
});

test('contextual member routes focus the exact native task instead of only its tab', async () => {
  const [root, home, booking, events, account] = await Promise.all([
    readFile(rootURL, 'utf8'),
    readFile(viewURL('HomeView'), 'utf8'),
    readFile(viewURL('BookingView'), 'utf8'),
    readFile(viewURL('EventsView'), 'utf8'),
    readFile(viewURL('AccountView'), 'utf8'),
  ]);
  assert.match(root, /navigation\.open\(\.notices\(nil\), source: \.commandPalette\)/);
  assert.match(root, /navigation\.open\(\.upcomingBookings\(nil\), source: \.commandPalette\)/);
  assert.match(root, /navigation\.open\(\.eventGoals, source: \.commandPalette\)/);
  assert.match(root, /navigation\.open\(\.purchaseConfirmation, source: \.commandPalette\)/);
  assert.match(root, /navigation\.open\(\.notices\(pendingAnnouncementID\), source: \.pushNotification\)/);
  assert.match(root, /navigation\.open\(\.upcomingBookings\(bookingID\), source: \.pushNotification\)/);
  for (const view of [home, booking, events, account]) {
    assert.match(view, /let route: XertMemberRoute/);
    assert.match(view, /let routeSequence: UInt/);
  }
  assert.match(home, /case \.notices\(let announcementID\) = route[\s\S]*showingNoticeCenter = true/);
  assert.match(booking, /case \.sessionPacks: target = \.packs/);
  assert.match(booking, /case \.purchaseConfirmation: target = \.credits/);
  assert.match(events, /route == \.eventGoals[\s\S]*proxy\.scrollTo\(ScrollTarget\.goals/);
  assert.match(account, /case \.upcomingBookings\(let bookingID\) = route[\s\S]*proxy\.scrollTo\(target/);
});

test('native navigation exposes a searchable contextual command switcher', async () => {
  const [root, navigation, modelsTests] = await Promise.all([
    readFile(rootURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url), 'utf8'),
  ]);
  assert.match(navigation, /enum XertNavigationCommandAction: Hashable/);
  assert.match(navigation, /struct XertNavigationContext: Equatable/);
  assert.match(navigation, /enum XertNavigationActivity: Hashable/);
  assert.match(navigation, /enum XertNavigationCommandSection: String, CaseIterable, Identifiable/);
  assert.match(navigation, /func commandPaletteCommands\([\s\S]*context: XertNavigationContext = \.empty/);
  assert.match(navigation, /static func filteredCommands/);
  assert.match(navigation, /terms\.allSatisfy \{ command\.searchIndex\.contains\(\$0\) \}/);
  assert.match(navigation, /if isAdmin \{[\s\S]*action: \.owner/);
  assert.match(root, /XertNavigationCommandPalette/);
  assert.match(root, /context: navigationContext/);
  assert.match(root, /XertNavigationCommandSection\.allCases/);
  assert.match(root, /Section \{[\s\S]*Text\(section\.rawValue\)/);
  assert.match(root, /\.searchable\(text: \$query/);
  assert.match(root, /keyboardShortcut\("k", modifiers: \.command\)/);
  assert.match(root, /accessibilityAction\(named: "Open XERT quick switcher"/);
  assert.match(root, /Label\("Quick switcher", systemImage: "magnifyingglass"\)/);
  assert.match(root, /navigation\.select\(destination, source: \.commandPalette\)/);
  assert.match(root, /guard store\.profile\?\.isAdmin == true else \{ return \}/);
  assert.match(root, /\.sheet\(isPresented: \$showingNavigationCommands, onDismiss: completeCommandDismissal\)/);
  assert.match(root, /opensAdminAfterCommandDismissal = true[\s\S]*completeCommandDismissal/);
  assert.match(root, /executeNavigationActivity[\s\S]*case \.pendingCheckout:[\s\S]*store\.reconcilePendingCheckout\(\)/);
  assert.match(modelsTests, /testNavigationCommandPaletteIsContextualRoleAwareAndSearchable/);
  assert.match(modelsTests, /testNavigationCommandPalettePromotesLiveMemberActivity/);
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
  assert.match(root, /creditCount: store\.creditTotal/);
  assert.match(root, /eventGoalCount: store\.eventGoalIDs\.count/);
  assert.match(root, /hasPendingCheckout: store\.isCheckoutConfirmationPending \|\| store\.isReconcilingCheckout/);
  assert.match(root, /UISelectionFeedbackGenerator\(\)\.selectionChanged\(\)/);
  assert.match(root, /matchedGeometryEffect\(id: "primary-navigation-selection"/);
  assert.match(root, /dynamicTypeSize\.isAccessibilitySize \? 80 : 66/);
  assert.match(root, /activeBookingCount[\s\S]*isActiveClassPlace[\s\S]*start_time >= Date\(\)/);
  assert.match(root, /guard selection != item else \{[\s\S]*onReselect\(item\)/);
  assert.match(root, /handleReselection[\s\S]*store\.refresh\(\)/);
  assert.match(root, /DragGesture\(minimumDistance: 36\)/);
  assert.match(root, /abs\(horizontal\) > 44[\s\S]*abs\(vertical\) \* 1\.35/);
  assert.match(root, /navigation\.step\(direction\)/);
  assert.match(root, /previousDestination: navigation\.previousDestination/);
  assert.match(root, /navigation\.returnToPrevious\(\)/);
  assert.match(root, /\.accessibilityActions \{/);
  assert.ok(root.includes('Button("Return to \\(previousDestination.title)"'));
  assert.ok(root.includes('Label("Refresh \\(item.title)", systemImage: "arrow.clockwise")'));
  assert.ok(root.includes('Label("Return to \\(previousDestination.title)", systemImage: "arrow.uturn.backward")'));
  assert.match(root, /@Environment\(\\\.accessibilityReduceMotion\) private var reduceMotion/);
  assert.match(root, /withAnimation\(reduceMotion \? nil : \.easeOut/);
  assert.match(root, /active member notices/);
  assert.match(root, /Refreshes this workspace/);
  assert.match(root, /navigation\.open\(\.purchaseConfirmation, source: \.checkout\)/);
  assert.match(root, /navigation\.open\(route, source: \.deepLink\)/);
  assert.match(root, /source: \.pushNotification/);
});
