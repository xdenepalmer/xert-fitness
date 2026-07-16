import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url);
const navigationURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift', import.meta.url);
const modelsTestsURL = new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url);
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
  assert.ok((root.match(/accessibilityIdentifier\("xert-navigation-/g) || []).length >= 7);
});

test('compact dock visibly exposes exact task context, back, and quick switching', async () => {
  const root = await readFile(rootURL, 'utf8');
  assert.match(root, /XertNavigationDock\([\s\S]*currentRoute: navigation\.route/);
  assert.match(root, /let currentRoute: XertMemberRoute/);
  assert.match(root, /private var taskStrip: some View/);
  assert.match(root, /Text\(currentRoute\.navigationTitle\)/);
  assert.match(root, /lineLimit\(2\)[\s\S]*minimumScaleFactor\(0\.72\)/);
  assert.match(root, /frame\(height: dynamicTypeSize\.isAccessibilitySize \? 58 : 46\)/);
  assert.match(root, /Button\(action: onReturnPrevious\)[\s\S]*arrow\.uturn\.backward/);
  assert.match(root, /Returns to the exact previous XERT task/);
  assert.match(root, /Button\(action: onOpenCommands\)[\s\S]*magnifyingglass/);
  assert.match(root, /Searches workspaces, recent tasks and available actions/);
});

test('member routing is typed, task-restorable, and owns native deep-link mapping', async () => {
  const [root, navigation] = await Promise.all([
    readFile(rootURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
  ]);
  assert.match(root, /@SceneStorage\("xert\.memberRoute"\)/);
  assert.match(root, /Binding<XertPrimaryDestination>/);
  assert.match(root, /@StateObject private var navigation = XertNavigationCoordinator\(\)/);
  assert.match(root, /navigation\.restore\([\s\S]*workspaceValue: restoredMemberWorkspace,[\s\S]*fallbackRouteValue: restoredMemberRoute/);
  assert.match(root, /restoredMemberRoute = route\.restorationValue/);
  assert.match(root, /private func navigate\(to destination: XertPrimaryDestination\)/);
  assert.match(root, /XertMemberRoute\.route\(for: url\)/);
  assert.match(root, /navigation\.open\(route, source: \.deepLink\)/);
  assert.doesNotMatch(root, /selectedTab\s*=\s*\d/);
  for (const path of ['/booking', '/events', '/account', '/explore']) {
    assert.match(navigation, new RegExp(`"${path.replace('/', '\\/')}"`));
  }
  assert.match(navigation, /url\.scheme\?\.lowercased\(\) == "xertfitness"/);
  assert.match(navigation, /url\.scheme\?\.lowercased\(\) == "xertfitness",[\s\S]*url\.port == nil/);
  assert.match(navigation, /url\.host\?\.lowercased\(\) == canonicalWebHost,[\s\S]*url\.port == nil \|\| url\.port == 443/);
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
  assert.match(navigation, /private\(set\) var routeHistory: \[XertMemberRoute\]/);
  assert.match(navigation, /var history: \[XertPrimaryDestination\]/);
  assert.match(navigation, /func returnToPrevious\(source: XertNavigationSource/);
  assert.match(navigation, /routeHistory\.count > historyLimit[\s\S]*routeHistory\.removeFirst/);
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
  assert.match(navigation, /case route\(XertMemberRoute\)/);
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
  assert.match(root, /navigation\.open\(route, source: \.commandPalette\)/);
  assert.match(root, /guard store\.profile\?\.isAdmin == true else \{ return \}/);
  assert.match(root, /\.sheet\(isPresented: \$showingNavigationCommands, onDismiss: completeCommandDismissal\)/);
  assert.match(root, /opensAdminAfterCommandDismissal = true[\s\S]*completeCommandDismissal/);
  assert.match(root, /executeNavigationActivity[\s\S]*case \.pendingCheckout:[\s\S]*store\.reconcilePendingCheckout\(\)/);
  assert.match(modelsTests, /testNavigationCommandPaletteIsContextualRoleAwareAndSearchable/);
  assert.match(modelsTests, /testNavigationCommandPalettePromotesLiveMemberActivity/);
  assert.match(modelsTests, /testNavigationCommandPaletteOffersBoundedUniqueRecentTasks/);
});

test('quick switcher offers bounded unique recent contextual tasks', async () => {
  const [navigation, modelsTests] = await Promise.all([
    readFile(navigationURL, 'utf8'),
    readFile(modelsTestsURL, 'utf8'),
  ]);
  assert.match(navigation, /case recent = "Recent"/);
  assert.match(navigation, /var isContextualTask: Bool/);
  assert.match(navigation, /private func recentTaskCommands\(limit: Int = 3\)/);
  assert.match(navigation, /routeHistory[\s\S]*\.dropLast\(\)[\s\S]*\.reversed\(\)/);
  assert.match(navigation, /guard recentRoute != route, recentRoute\.isContextualTask/);
  assert.match(navigation, /guard seenTasks\.insert\(taskKey\)\.inserted/);
  assert.match(navigation, /\.prefix\(max\(0, limit\)\)/);
  assert.match(navigation, /section: \.recent,[\s\S]*action: \.route\(recentRoute\)/);
  assert.match(modelsTests, /\.route\(\.notices\(latestNoticeID\)\)[\s\S]*\.route\(\.eventGoals\)[\s\S]*\.route\(\.sessionPacks\)/);
});

test('owner command access is role-aware, full-screen, and never buried in tab overflow', async () => {
  const root = await readFile(rootURL, 'utf8');
  assert.match(root, /isAdmin: store\.profile\?\.isAdmin == true/);
  assert.match(root, /Text\("Owner Command Centre"\)/);
  assert.match(root, /\.fullScreenCover\(isPresented: \$showingAdminCommandCentre\)/);
  assert.match(root, /if store\.profile\?\.isAdmin == true \{[\s\S]*AdminCommandCentreView\(onClose:/);
});

test('navigation carries operational state and native interaction feedback', async () => {
  const [root, navigation, modelsTests] = await Promise.all([
    readFile(rootURL, 'utf8'),
    readFile(navigationURL, 'utf8'),
    readFile(modelsTestsURL, 'utf8'),
  ]);
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
  assert.match(root, /previousRoute: navigation\.previousRoute/);
  assert.match(root, /navigation\.returnToPrevious\(\)/);
  assert.match(root, /\.accessibilityActions \{/);
  assert.ok(root.includes('Button("Return to \\(previousRoute.navigationTitle)"'));
  assert.ok(root.includes('Label("Refresh \\(item.title)", systemImage: "arrow.clockwise")'));
  assert.ok(root.includes('Label("Return to \\(previousRoute.navigationTitle)", systemImage: "arrow.uturn.backward")'));
  assert.match(root, /@Environment\(\\\.accessibilityReduceMotion\) private var reduceMotion/);
  assert.match(root, /withAnimation\(reduceMotion \? nil : \.easeOut/);
  assert.match(navigation, /active member notices/);
  assert.match(root, /Refreshes this workspace/);
  assert.match(navigation, /struct XertNavigationStatusSnapshot: Equatable/);
  assert.match(navigation, /destination: \.booking,[\s\S]*kind: \.attention,[\s\S]*Purchase confirmation needs attention/);
  assert.match(navigation, /destination: \.events,[\s\S]*selected event goals/);
  assert.match(navigation, /destination: \.account,[\s\S]*upcoming bookings/);
  assert.match(root, /statusSnapshot: XertNavigationStatusSnapshot\(context: navigationContext\)/);
  assert.ok((root.match(/let statusSnapshot: XertNavigationStatusSnapshot/g) || []).length === 2);
  assert.match(root, /XertNavigationStatusBadge\(status: status\)/);
  assert.match(root, /status\.kind == \.attention \? Color\.orange : Color\.xertPale/);
  assert.match(modelsTests, /testNavigationStatusSignalsRouteToTheirOwningWorkspaces/);
  assert.match(root, /navigation\.open\(\.purchaseConfirmation, source: \.checkout\)/);
  assert.match(root, /navigation\.open\(route, source: \.deepLink\)/);
  assert.match(root, /source: \.pushNotification/);
});

test('navigation history preserves exact member tasks instead of flattening them to tabs', async () => {
  const [navigation, root, modelsTests] = await Promise.all([
    readFile(navigationURL, 'utf8'),
    readFile(rootURL, 'utf8'),
    readFile(modelsTestsURL, 'utf8'),
  ]);
  assert.match(navigation, /private\(set\) var routeHistory: \[XertMemberRoute\]/);
  assert.match(navigation, /var previousRoute: XertMemberRoute\?/);
  assert.match(navigation, /routeHistory\.append\(targetRoute\)/);
  assert.match(navigation, /guard let targetRoute = routeHistory\.last/);
  assert.match(navigation, /route = targetRoute/);
  assert.ok(navigation.includes('Back to \\(previousRoute.navigationTitle)'));
  assert.match(root, /previousRoute: navigation\.previousRoute/);
  assert.match(modelsTests, /testNavigationHistoryReturnsToExactTasksAcrossAndWithinTabs/);
});

test('sign-out clears exact-task history before another member can inherit it', async () => {
  const [navigation, root, modelsTests] = await Promise.all([
    readFile(navigationURL, 'utf8'),
    readFile(rootURL, 'utf8'),
    readFile(modelsTestsURL, 'utf8'),
  ]);
  assert.match(navigation, /var containsContextualHistory: Bool/);
  assert.match(navigation, /routeHistory\.contains \{ \$0\.isContextualTask \}/);
  assert.match(navigation, /forwardRouteHistory\.contains \{ \$0\.isContextualTask \}/);
  assert.match(root, /if !isSignedIn \{[\s\S]*resetMemberNavigationAfterSignOut\(\)/);
  assert.match(root, /hasBootstrapped, !store\.isSignedIn, navigation\.containsContextualHistory/);
  assert.match(root, /resetMemberNavigationAfterSignOut[\s\S]*navigation\.restore\(routeValue: home\.restorationValue\)/);
  assert.match(root, /restoredMemberWorkspace = navigation\.workspaceRestorationValue/);
  assert.match(modelsTests, /testNavigationIdentifiesPrivateContextAcrossBackAndForwardHistory/);
});

test('scene restoration preserves a bounded versioned exact-task workspace', async () => {
  const [navigation, root, modelsTests] = await Promise.all([
    readFile(navigationURL, 'utf8'),
    readFile(rootURL, 'utf8'),
    readFile(modelsTestsURL, 'utf8'),
  ]);
  assert.match(navigation, /struct XertNavigationWorkspaceSnapshot: Codable, Equatable/);
  assert.match(navigation, /maximumEncodedLength = 4_096/);
  assert.match(navigation, /maximumRouteCount = 32/);
  assert.match(navigation, /var workspaceRestorationValue: String/);
  assert.match(navigation, /func restore\(workspaceValue: String, fallbackRouteValue: String\)/);
  assert.match(navigation, /snapshot\.version == XertNavigationWorkspaceSnapshot\.currentVersion/);
  assert.match(navigation, /restoredRoutes\.count == snapshot\.routeValues\.count/);
  assert.match(navigation, /restoredForwardRoutes\.prefix\(max\(0, historyLimit - 1\)\)/);
  assert.match(navigation, /backwardCapacity = max\(1, historyLimit - boundedForwardRoutes\.count\)/);
  assert.match(navigation, /restoredRoutes\.suffix\(backwardCapacity\)/);
  assert.match(root, /@SceneStorage\("xert\.memberWorkspace"\)/);
  assert.match(root, /navigation\.restore\([\s\S]*workspaceValue: restoredMemberWorkspace,[\s\S]*fallbackRouteValue: restoredMemberRoute/);
  assert.match(root, /restoredMemberWorkspace = navigation\.workspaceRestorationValue/);
  assert.match(modelsTests, /testNavigationWorkspaceRestoresBoundedExactTaskHistory/);
  assert.match(modelsTests, /testNavigationWorkspaceRejectsMalformedPartialAndFutureSnapshots/);
});

test('native task history supports bounded back and forward traversal', async () => {
  const [navigation, root, modelsTests] = await Promise.all([
    readFile(navigationURL, 'utf8'),
    readFile(rootURL, 'utf8'),
    readFile(modelsTestsURL, 'utf8'),
  ]);
  assert.match(navigation, /let forwardRouteValues: \[String\]\?/);
  assert.match(navigation, /private\(set\) var forwardRouteHistory: \[XertMemberRoute\] = \[\]/);
  assert.match(navigation, /var nextRoute: XertMemberRoute\?/);
  assert.match(navigation, /func returnToNext\(source: XertNavigationSource = \.history\) -> Bool/);
  assert.match(navigation, /forwardRouteHistory\.insert\(departedRoute, at: 0\)/);
  assert.match(navigation, /let targetRoute = forwardRouteHistory\.removeFirst\(\)/);
  assert.match(navigation, /forwardRouteHistory = \[\][\s\S]*routeHistory\.append\(targetRoute\)/);
  assert.ok(navigation.includes('Forward to \\(nextRoute.navigationTitle)'));
  assert.match(root, /nextRoute: navigation\.nextRoute/);
  assert.match(root, /navigation\.returnToNext\(\)/);
  assert.match(root, /keyboardShortcut\("\]", modifiers: \.command\)/);
  assert.match(root, /xert-navigation-forward-history/);
  assert.match(modelsTests, /testNavigationHistorySupportsForwardTraversalAndClearsAfterBranching/);
  assert.match(modelsTests, /testNavigationWorkspaceRestoresExactForwardTaskHistory/);
});
