import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage(AppPrivacyLock.preferenceKey) private var privacyLockEnabled = false
    @SceneStorage("xert.memberRoute") private var restoredMemberRoute = XertMemberRoute.home.restorationValue
    @SceneStorage("xert.memberWorkspace") private var restoredMemberWorkspace = ""
    @StateObject private var navigation = XertNavigationCoordinator()
    @State private var checkoutReturnStatus: CheckoutReturnStatus?
    @State private var isPrivacyUnlocked = false
    @State private var isUnlocking = false
    @State private var privacyLockError: String?
    @State private var showingAdminCommandCentre = false
    @State private var showingNavigationCommands = false
    @State private var opensAdminAfterCommandDismissal = false
    @State private var pendingProtectedNavigation: XertNavigationIntent?
    @State private var hasRestoredMemberWorkspace = false
    @State private var hasExplicitMemberNavigation = false

    var body: some View {
        Group {
            if isPrivacyLocked {
                PrivacyLockView(
                    isUnlocking: isUnlocking,
                    errorMessage: privacyLockError,
                    onUnlock: { Task { await unlockApp() } },
                    onSignOut: signOutFromLock
                )
            } else {
                memberTabs
            }
        }
        .focusedSceneValue(\.xertNavigationCommandContext, navigationCommandContext)
        .onChange(of: scenePhase, perform: handleScenePhase)
        .onChange(of: store.isSignedIn) { isSignedIn in
            guard isSignedIn else {
                isPrivacyUnlocked = true
                privacyLockError = nil
                resetMemberNavigationAfterSignOut(clearPendingIntent: true)
                return
            }
            resumePendingProtectedNavigation()
            guard privacyLockEnabled else {
                isPrivacyUnlocked = true
                privacyLockError = nil
                return
            }
            lockAndAuthenticate()
        }
        .onChange(of: store.hasBootstrapped) { hasBootstrapped in
            guard hasBootstrapped else { return }
            restoreMemberWorkspaceWhenReady()
            if !store.isSignedIn, navigation.containsProtectedHistory {
                resetMemberNavigationAfterSignOut(clearPendingIntent: false)
            }
            if isPrivacyLocked, privacyLockError == nil {
                Task { await unlockApp() }
            }
        }
        .onChange(of: privacyLockEnabled) { isEnabled in
            guard isEnabled, store.isSignedIn else {
                isPrivacyUnlocked = true
                privacyLockError = nil
                return
            }
            lockAndAuthenticate()
        }
        .onOpenURL(perform: handleOpenURL)
        .userActivity(XertRouteUserActivity.activityType, isActive: shouldAdvertiseCurrentRoute) { activity in
            XertRouteUserActivity.configure(activity, route: navigation.route)
        }
        .onContinueUserActivity(XertRouteUserActivity.activityType) { activity in
            guard let route = XertRouteUserActivity.route(from: activity) else { return }
            openMemberRoute(route, source: .handoff)
        }
        .onAppear {
            restoreMemberWorkspaceWhenReady()
            consumePendingReminderRoute()
            consumePendingAnnouncementRoute()
            consumePendingQuickActionRoute()
        }
        .onChange(of: navigation.route) { route in
            restoredMemberRoute = route.restorationValue
            restoredMemberWorkspace = navigation.workspaceRestorationValue
        }
        .onReceive(NotificationCenter.default.publisher(for: .xertOpenBookings)) { _ in
            consumePendingReminderRoute()
        }
        .onReceive(NotificationCenter.default.publisher(for: .xertPushTokenUpdated)) { notification in
            guard let token = notification.object as? DevicePushToken else { return }
            Task { await store.syncMemberPushToken(token) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .xertPushRegistrationFailed)) { _ in
            store.handlePushRegistrationFailure()
        }
        .onReceive(NotificationCenter.default.publisher(for: .xertOpenAnnouncements)) { _ in
            consumePendingAnnouncementRoute()
        }
        .onReceive(NotificationCenter.default.publisher(for: .xertOpenQuickAction)) { _ in
            consumePendingQuickActionRoute()
        }
        .onReceive(NotificationCenter.default.publisher(for: .xertRefreshAnnouncements)) { _ in
            Task { await store.refresh() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .xertCheckoutCallback)) { notification in
            guard let url = notification.object as? URL else { return }
            handleOpenURL(url)
        }
    }

    private var memberTabs: some View {
        TabView(selection: selectedDestinationBinding) {
            HomeView(
                route: navigation.route,
                routeSequence: navigation.routeSequence,
                onNavigate: navigate
            )
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(XertPrimaryDestination.home)

            BookingView(route: navigation.route, routeSequence: navigation.routeSequence, onNavigate: navigate)
                .tabItem {
                    Label("Book", systemImage: "calendar.badge.plus")
                }
                .tag(XertPrimaryDestination.booking)

            EventsView(route: navigation.route, routeSequence: navigation.routeSequence, onNavigate: navigate)
                .tabItem {
                    Label("Events", systemImage: "trophy")
                }
                .tag(XertPrimaryDestination.events)

            ExploreView(onNavigate: navigate)
                .tabItem {
                    Label("Explore", systemImage: "safari")
                }
                .tag(XertPrimaryDestination.explore)

            AccountView(
                route: navigation.route,
                routeSequence: navigation.routeSequence,
                pendingNavigationTitle: pendingProtectedNavigation?.route.navigationTitle,
                onCancelPendingNavigation: cancelPendingProtectedNavigation
            )
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle")
                }
                .tag(XertPrimaryDestination.account)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .leading, spacing: 0) {
            if navigationPresentation == .workspaceRail {
                navigationRail
            }
        }
        .tint(.xertSteel)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if navigationPresentation == .compactDock {
                navigationDock
            }
        }
        .fullScreenCover(isPresented: $showingAdminCommandCentre) {
            if store.profile?.isAdmin == true {
                AdminCommandCentreView(onClose: { showingAdminCommandCentre = false })
                    .environmentObject(store)
            }
        }
        .sheet(isPresented: $showingNavigationCommands, onDismiss: completeCommandDismissal) {
            XertNavigationCommandPalette(
                commands: navigation.commandPaletteCommands(
                    isAdmin: store.profile?.isAdmin == true,
                    context: navigationContext
                ),
                workspace: navigation.workspaceOverview,
                onSelect: executeNavigationCommand
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .alert("XERT", isPresented: Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            Button("OK") {
                store.errorMessage = nil
            }
        } message: {
            Text(store.errorMessage ?? "")
        }
        .alert(item: $checkoutReturnStatus) { status in
            Alert(
                title: Text(status.title),
                message: Text(status.message),
                dismissButton: .default(Text("OK"))
            )
        }
    }

    private var activeBookingCount: Int {
        store.bookings.filter { $0.isActiveClassPlace && $0.start_time >= Date() }.count
    }

    private var navigationPresentation: XertNavigationPresentation {
        .resolve(isRegularWidth: horizontalSizeClass == .regular)
    }

    private var navigationContext: XertNavigationContext {
        XertNavigationContext(
            isSignedIn: store.isSignedIn,
            noticeCount: store.announcements.count,
            bookingCount: activeBookingCount,
            creditCount: store.creditTotal,
            eventGoalCount: store.eventGoalIDs.count,
            hasPendingCheckout: store.isCheckoutConfirmationPending || store.isReconcilingCheckout
        )
    }

    private var navigationCommandContext: XertNavigationCommandContext {
        let isAvailable = !isPrivacyLocked
            && !showingAdminCommandCentre
            && !showingNavigationCommands
        return XertNavigationCommandContext(
            isAvailable: isAvailable,
            selection: isAvailable ? navigation.selection : .home,
            previousRoute: isAvailable ? navigation.previousRoute : nil,
            nextRoute: isAvailable ? navigation.nextRoute : nil,
            isAdmin: isAvailable && store.profile?.isAdmin == true,
            perform: executeSceneNavigationCommand
        )
    }

    private var navigationDock: some View {
        XertNavigationDock(
            selection: selectedDestinationBinding,
            currentRoute: navigation.route,
            isAdmin: store.profile?.isAdmin == true,
            statusSnapshot: XertNavigationStatusSnapshot(context: navigationContext),
            previousRoute: navigation.previousRoute,
            nextRoute: navigation.nextRoute,
            onOpenAdmin: { showingAdminCommandCentre = true },
            onOpenCommands: { showingNavigationCommands = true },
            onReselect: handleReselection,
            onStep: handleNavigationStep,
            onReturnPrevious: returnToPreviousNavigationDestination,
            onReturnNext: returnToNextNavigationDestination
        )
    }

    private var navigationRail: some View {
        XertNavigationRail(
            selection: selectedDestinationBinding,
            currentRoute: navigation.route,
            isAdmin: store.profile?.isAdmin == true,
            statusSnapshot: XertNavigationStatusSnapshot(context: navigationContext),
            previousRoute: navigation.previousRoute,
            nextRoute: navigation.nextRoute,
            onOpenAdmin: { showingAdminCommandCentre = true },
            onOpenCommands: { showingNavigationCommands = true },
            onReselect: handleReselection,
            onReturnPrevious: returnToPreviousNavigationDestination,
            onReturnNext: returnToNextNavigationDestination
        )
    }

    private var selectedDestinationBinding: Binding<XertPrimaryDestination> {
        Binding(
            get: { navigation.selection },
            set: { selectMemberDestination($0, source: .dock) }
        )
    }

    private func navigate(to destination: XertPrimaryDestination) {
        selectMemberDestination(destination, source: .content)
    }

    private func selectMemberDestination(
        _ destination: XertPrimaryDestination,
        source: XertNavigationSource
    ) {
        claimMemberNavigation()
        guard navigation.select(destination, source: source) else { return }
        cancelPendingProtectedNavigation()
    }

    private func handleReselection(_ destination: XertPrimaryDestination) {
        claimMemberNavigation()
        navigation.reselect(destination)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task { await store.refresh() }
    }

    private func handleNavigationStep(_ direction: XertNavigationDirection) {
        guard navigation.step(direction) else { return }
        claimMemberNavigation()
        cancelPendingProtectedNavigation()
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func returnToPreviousNavigationDestination() {
        guard navigation.returnToPrevious() else { return }
        claimMemberNavigation()
        cancelPendingProtectedNavigation()
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    private func returnToNextNavigationDestination() {
        guard navigation.returnToNext() else { return }
        claimMemberNavigation()
        cancelPendingProtectedNavigation()
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    private func executeNavigationCommand(_ command: XertNavigationCommand) {
        showingNavigationCommands = false
        switch command.action {
        case .destination(let destination):
            selectMemberDestination(destination, source: .commandPalette)
        case .timeline(let index):
            guard navigation.jump(
                toTimelineIndex: index,
                source: .commandPalette,
                allowsProtectedRoutes: store.isSignedIn
            ) else { return }
            claimMemberNavigation()
            cancelPendingProtectedNavigation()
            UISelectionFeedbackGenerator().selectionChanged()
        case .activity(let activity):
            executeNavigationActivity(activity)
        case .previous:
            returnToPreviousNavigationDestination()
        case .next:
            returnToNextNavigationDestination()
        case .refresh:
            handleReselection(navigation.selection)
        case .owner:
            guard store.profile?.isAdmin == true else { return }
            opensAdminAfterCommandDismissal = true
        }
    }

    private func executeNavigationActivity(_ activity: XertNavigationActivity) {
        switch activity {
        case .notices:
            openMemberRoute(.notices(nil), source: .commandPalette)
        case .upcomingBookings:
            openMemberRoute(.upcomingBookings(nil), source: .commandPalette)
        case .eventGoals:
            openMemberRoute(.eventGoals, source: .commandPalette)
        case .pendingCheckout:
            if openMemberRoute(.purchaseConfirmation, source: .commandPalette) {
                Task { await store.reconcilePendingCheckout() }
            }
        }
    }

    private func completeCommandDismissal() {
        guard opensAdminAfterCommandDismissal else { return }
        opensAdminAfterCommandDismissal = false
        guard store.profile?.isAdmin == true else { return }
        showingAdminCommandCentre = true
    }

    private func executeSceneNavigationCommand(_ command: XertSceneNavigationCommand) {
        guard !isPrivacyLocked else { return }

        switch command {
        case .destination(let destination):
            selectMemberDestination(destination, source: .keyboard)
        case .previous:
            returnToPreviousNavigationDestination()
        case .next:
            returnToNextNavigationDestination()
        case .quickSwitcher:
            guard !showingAdminCommandCentre else { return }
            showingNavigationCommands = true
        case .refresh:
            handleReselection(navigation.selection)
        case .owner:
            guard store.profile?.isAdmin == true, !showingNavigationCommands else { return }
            showingAdminCommandCentre = true
        }
    }

    private var isPrivacyLocked: Bool {
        AppPrivacyLock.requiresUnlock(
            isSignedIn: store.isSignedIn,
            isEnabled: privacyLockEnabled,
            isUnlocked: isPrivacyUnlocked
        )
    }

    private var shouldAdvertiseCurrentRoute: Bool {
        XertRouteUserActivity.shouldAdvertise(
            route: navigation.route,
            isSignedIn: store.isSignedIn,
            isPrivacyLocked: isPrivacyLocked
        )
    }

    private func handleScenePhase(_ phase: ScenePhase) {
        guard phase == .active else {
            if store.isSignedIn, privacyLockEnabled {
                isPrivacyUnlocked = false
            }
            return
        }

        if isPrivacyLocked {
            Task { await unlockApp() }
        } else if store.hasBootstrapped, !store.isLoading {
            Task {
                await store.refresh()
                await store.reconcilePendingCheckout()
            }
        }
    }

    private func lockAndAuthenticate() {
        isPrivacyUnlocked = false
        privacyLockError = nil
        Task { await unlockApp() }
    }

    @MainActor
    private func unlockApp() async {
        guard isPrivacyLocked, !isUnlocking, scenePhase == .active else { return }
        isUnlocking = true
        privacyLockError = nil
        defer { isUnlocking = false }

        do {
            try await DeviceAuthenticator.authenticate(
                reason: "Unlock your XERT member account, bookings and purchase history."
            )
            guard scenePhase == .active, store.isSignedIn, privacyLockEnabled else { return }
            isPrivacyUnlocked = true
            if store.hasBootstrapped, !store.isLoading {
                await store.refresh()
                await store.reconcilePendingCheckout()
            }
        } catch {
            privacyLockError = error.localizedDescription
        }
    }

    private func signOutFromLock() {
        store.signOut()
        isPrivacyUnlocked = true
        privacyLockError = nil
    }

    private func resetMemberNavigationAfterSignOut(clearPendingIntent: Bool) {
        let home = XertMemberRoute.home
        navigation.restore(routeValue: home.restorationValue)
        restoredMemberRoute = home.restorationValue
        restoredMemberWorkspace = navigation.workspaceRestorationValue
        showingNavigationCommands = false
        showingAdminCommandCentre = false
        opensAdminAfterCommandDismissal = false
        if clearPendingIntent {
            pendingProtectedNavigation = nil
        }
    }

    @discardableResult
    private func openMemberRoute(
        _ route: XertMemberRoute,
        source: XertNavigationSource
    ) -> Bool {
        claimMemberNavigation()
        let intent = XertNavigationIntent(route: route, source: source)
        guard intent.disposition(isSignedIn: store.isSignedIn) == .open else {
            pendingProtectedNavigation = intent
            navigation.open(.account, source: source)
            return false
        }
        pendingProtectedNavigation = nil
        navigation.open(route, source: source)
        return true
    }

    private func restoreMemberWorkspaceWhenReady() {
        guard store.hasBootstrapped, !hasRestoredMemberWorkspace else { return }
        hasRestoredMemberWorkspace = true
        guard !hasExplicitMemberNavigation else { return }
        navigation.restore(
            workspaceValue: restoredMemberWorkspace,
            fallbackRouteValue: restoredMemberRoute,
            allowsProtectedRoutes: store.isSignedIn
        )
    }

    private func claimMemberNavigation() {
        hasExplicitMemberNavigation = true
        if store.hasBootstrapped {
            hasRestoredMemberWorkspace = true
        }
    }

    private func resumePendingProtectedNavigation() {
        guard store.isSignedIn, let intent = pendingProtectedNavigation else { return }
        pendingProtectedNavigation = nil
        navigation.open(intent.route, source: intent.source)
        if intent.route == .purchaseConfirmation {
            Task { await store.reconcilePendingCheckout() }
        }
    }

    private func cancelPendingProtectedNavigation() {
        pendingProtectedNavigation = nil
    }

    private func handleOpenURL(_ url: URL) {
        if let status = CheckoutDeepLink.status(from: url) {
            checkoutReturnStatus = status
            let canReconcile = openMemberRoute(.purchaseConfirmation, source: .checkout)
            Task {
                if status == .success {
                    if canReconcile { await store.reconcileCheckout() }
                } else {
                    store.cancelPendingCheckout()
                    await store.refresh()
                }
            }
            return
        }
        guard let route = XertMemberRoute.route(for: url) else { return }
        openMemberRoute(route, source: .deepLink)
    }

    private func consumePendingAnnouncementRoute() {
        guard let pendingAnnouncementID = AnnouncementPushNavigation.consumePendingAnnouncementID() else { return }
        if openMemberRoute(.notices(pendingAnnouncementID), source: .pushNotification) {
            Task { await store.refresh() }
        }
    }

    private func consumePendingReminderRoute() {
        guard let bookingID = ClassReminderNavigation.consumePendingBookingID() else { return }
        openMemberRoute(.upcomingBookings(bookingID), source: .pushNotification)
    }

    private func consumePendingQuickActionRoute() {
        guard let route = XertQuickActionNavigation.consumePendingRoute() else { return }
        openMemberRoute(route, source: .quickAction)
    }
}

private struct XertNavigationRail: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var selection: XertPrimaryDestination
    let currentRoute: XertMemberRoute
    let isAdmin: Bool
    let statusSnapshot: XertNavigationStatusSnapshot
    let previousRoute: XertMemberRoute?
    let nextRoute: XertMemberRoute?
    let onOpenAdmin: () -> Void
    let onOpenCommands: () -> Void
    let onReselect: (XertPrimaryDestination) -> Void
    let onReturnPrevious: () -> Void
    let onReturnNext: () -> Void
    @Namespace private var selectionNamespace

    private let items = XertPrimaryDestination.dockOrder

    var body: some View {
        VStack(spacing: 0) {
            XertLogoHeader(height: dynamicTypeSize.isAccessibilitySize ? 24 : 21)
                .frame(maxWidth: .infinity, minHeight: 48)
                .padding(.horizontal, 12)

            Button(action: onOpenCommands) {
                VStack(spacing: 5) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Switch")
                        .font(.caption2.weight(.bold))
                        .textCase(.uppercase)
                        .tracking(0.7)
                }
                .foregroundStyle(Color.xertPale)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .keyboardShortcut("k", modifiers: .command)
            .hoverEffect(.highlight)
            .accessibilityLabel("XERT quick switcher")
            .accessibilityHint("Searches workspaces and available actions")
            .accessibilityIdentifier("xert-navigation-commands")

            XertNavigationShareControl(route: currentRoute, layout: .rail)

            if let previousRoute {
                Button(action: onReturnPrevious) {
                    VStack(spacing: 5) {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 15, weight: .semibold))
                        Text("Back to \(previousRoute.navigationTitle)")
                            .font(.caption2.weight(.semibold))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(Color.xertSteel)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut("[", modifiers: .command)
                .hoverEffect(.highlight)
                .accessibilityHint("Returns to the previous XERT workspace")
                .accessibilityIdentifier("xert-navigation-history")
            }

            if let nextRoute {
                Button(action: onReturnNext) {
                    VStack(spacing: 5) {
                        Image(systemName: "arrow.uturn.forward")
                            .font(.system(size: 15, weight: .semibold))
                        Text("Forward to \(nextRoute.navigationTitle)")
                            .font(.caption2.weight(.semibold))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(Color.xertSteel)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut("]", modifiers: .command)
                .hoverEffect(.highlight)
                .accessibilityHint("Returns to the next XERT workspace task")
                .accessibilityIdentifier("xert-navigation-forward-history")
            }

            Rectangle()
                .fill(Color.xertSteel.opacity(0.18))
                .frame(height: 1)
                .padding(.horizontal, 14)

            VStack(spacing: 4) {
                ForEach(items) { item in
                    navigationButton(item)
                }
            }
            .padding(.vertical, 8)

            Spacer(minLength: 12)

            if isAdmin {
                Button(action: onOpenAdmin) {
                    VStack(spacing: 7) {
                        Image(systemName: "waveform.path.ecg.rectangle")
                            .font(.system(size: 20, weight: .semibold))
                        Text("Owner")
                            .font(.caption2.weight(.bold))
                            .textCase(.uppercase)
                            .tracking(0.8)
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .frame(maxWidth: .infinity, minHeight: 66)
                    .background(Color.xertDeep.opacity(0.96))
                    .overlay(alignment: .top) {
                        Rectangle().fill(Color.xertSteel.opacity(0.5)).frame(height: 1)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut("a", modifiers: [.command, .shift])
                .hoverEffect(.highlight)
                .accessibilityLabel("Owner Command Centre")
                .accessibilityHint("Opens protected gym operations and platform controls")
                .accessibilityIdentifier("xert-navigation-owner")
            }
        }
        .frame(width: dynamicTypeSize.isAccessibilitySize ? 136 : 104)
        .background(Color.xertInk.opacity(0.99).ignoresSafeArea(edges: .leading))
        .overlay(alignment: .trailing) {
            Rectangle().fill(Color.xertSteel.opacity(0.24)).frame(width: 1)
        }
    }

    private func navigationButton(_ item: XertPrimaryDestination) -> some View {
        let selected = selection == item
        let status = statusSnapshot.status(for: item)
        return Button {
            guard selection != item else {
                onReselect(item)
                return
            }
            UISelectionFeedbackGenerator().selectionChanged()
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { selection = item }
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Image(systemName: selected ? item.selectedIcon : item.icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(selected ? Color.xertSteel : Color.xertPale.opacity(0.66))
                        .frame(width: 42, height: 30)

                    if let status {
                        XertNavigationStatusBadge(status: status)
                            .offset(x: 18, y: -11)
                    }
                }
                Text(item.title)
                    .font(.caption2.weight(selected ? .bold : .semibold))
                    .textCase(.uppercase)
                    .tracking(0.7)
                    .foregroundStyle(selected ? Color.xertOffWhite : Color.xertPale.opacity(0.58))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.74)
            }
            .frame(maxWidth: .infinity, minHeight: dynamicTypeSize.isAccessibilitySize ? 78 : 66)
            .background(selected ? Color.xertSteel.opacity(0.09) : Color.clear)
            .overlay(alignment: .leading) {
                if selected {
                    Rectangle()
                        .fill(Color.xertSteel)
                        .frame(width: 3, height: 36)
                        .matchedGeometryEffect(id: "rail-navigation-selection", in: selectionNamespace)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .keyboardShortcut(keyboardShortcut(for: item), modifiers: .command)
        .hoverEffect(.highlight)
        .accessibilityLabel(item.title)
        .accessibilityValue(selected ? "Selected" : "")
        .accessibilityHint(accessibilityHint(for: item, status: status, selected: selected))
        .accessibilityIdentifier("xert-navigation-\(item.title.lowercased())")
        .accessibilityActions {
            if selected {
                Button("Refresh \(item.title)") { onReselect(item) }
                if let previousRoute {
                    Button("Return to \(previousRoute.navigationTitle)", action: onReturnPrevious)
                }
            }
        }
        .contextMenu {
            if selected {
                Button(action: { onReselect(item) }) {
                    Label("Refresh \(item.title)", systemImage: "arrow.clockwise")
                }
                if let previousRoute {
                    Button(action: onReturnPrevious) {
                        Label("Return to \(previousRoute.navigationTitle)", systemImage: "arrow.uturn.backward")
                    }
                }
            }
        }
    }

    private func accessibilityHint(
        for item: XertPrimaryDestination,
        status: XertNavigationStatus?,
        selected: Bool
    ) -> String {
        var details: [String] = []
        if let status { details.append(status.accessibilityLabel) }
        details.append(selected ? "Refreshes this workspace" : "Opens the \(item.title) workspace")
        return details.joined(separator: ". ")
    }

    private func keyboardShortcut(for item: XertPrimaryDestination) -> KeyEquivalent {
        switch item {
        case .home: return "1"
        case .booking: return "2"
        case .events: return "3"
        case .explore: return "4"
        case .account: return "5"
        }
    }
}

private struct XertNavigationDock: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var selection: XertPrimaryDestination
    let currentRoute: XertMemberRoute
    let isAdmin: Bool
    let statusSnapshot: XertNavigationStatusSnapshot
    let previousRoute: XertMemberRoute?
    let nextRoute: XertMemberRoute?
    let onOpenAdmin: () -> Void
    let onOpenCommands: () -> Void
    let onReselect: (XertPrimaryDestination) -> Void
    let onStep: (XertNavigationDirection) -> Void
    let onReturnPrevious: () -> Void
    let onReturnNext: () -> Void
    @Namespace private var selectionNamespace

    private let items = XertPrimaryDestination.dockOrder

    var body: some View {
        VStack(spacing: 0) {
            if isAdmin {
                Button(action: onOpenAdmin) {
                    HStack(spacing: 10) {
                        Image(systemName: "waveform.path.ecg.rectangle")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.xertSteel)
                        Text("Owner Command Centre")
                            .font(XertTheme.displayFont(size: 16, relativeTo: .headline))
                            .textCase(.uppercase)
                            .tracking(1.2)
                            .foregroundStyle(Color.xertOffWhite)
                        Spacer()
                        Text("Open")
                            .font(.caption2.weight(.bold))
                            .textCase(.uppercase)
                            .tracking(1.1)
                            .foregroundStyle(Color.xertSteel)
                        Image(systemName: "chevron.up")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.xertSteel)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .frame(minHeight: 38)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background(Color.xertDeep.opacity(0.96))
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.xertSteel.opacity(0.48)).frame(height: 1)
                }
                .accessibilityHint("Opens protected gym operations and platform controls")
            }

            taskStrip

            HStack(spacing: 0) {
                ForEach(items) { item in
                    navigationButton(item)
                }
            }
            .frame(height: dynamicTypeSize.isAccessibilitySize ? 80 : 66)
            .background {
                ZStack {
                    Color.xertInk.opacity(0.98)
                    Canvas { context, size in
                        let width = size.width / CGFloat(items.count)
                        for index in 1..<items.count {
                            var line = Path()
                            line.move(to: CGPoint(x: CGFloat(index) * width, y: 14))
                            line.addLine(to: CGPoint(x: CGFloat(index) * width, y: size.height - 12))
                            context.stroke(line, with: .color(Color.xertSteel.opacity(0.08)), lineWidth: 1)
                        }
                    }
                    .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .top) {
                Rectangle().fill(Color.xertSteel.opacity(0.24)).frame(height: 1)
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 36)
                    .onEnded { value in
                        let horizontal = value.translation.width
                        let vertical = value.translation.height
                        guard abs(horizontal) > 44, abs(horizontal) > abs(vertical) * 1.35 else { return }
                        onStep(horizontal < 0 ? .next : .previous)
                    }
            )
        }
        .background(Color.xertInk.ignoresSafeArea(edges: .bottom))
        .accessibilityAction(named: "Open XERT quick switcher") {
            onOpenCommands()
        }
    }

    private var taskStrip: some View {
        HStack(spacing: 8) {
            if let previousRoute {
                Button(action: onReturnPrevious) {
                    Image(systemName: "arrow.uturn.backward")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.xertSteel)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut("[", modifiers: .command)
                .accessibilityLabel("Back to \(previousRoute.navigationTitle)")
                .accessibilityHint("Returns to the exact previous XERT task")
                .accessibilityIdentifier("xert-navigation-history")
            } else {
                Image(systemName: currentRoute.destination.selectedIcon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.xertSteel)
                    .frame(width: 44, height: 44)
                    .accessibilityHidden(true)
            }

            Text(currentRoute.navigationTitle)
                .font(XertTheme.displayFont(size: 16, relativeTo: .headline))
                .textCase(.uppercase)
                .tracking(0.8)
                .foregroundStyle(Color.xertOffWhite)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)

            Button(action: onReturnNext) {
                Image(systemName: "arrow.uturn.forward")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.xertSteel)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .keyboardShortcut("]", modifiers: .command)
            .disabled(nextRoute == nil)
            .opacity(nextRoute == nil ? 0.24 : 1)
            .accessibilityLabel(nextRoute.map { "Forward to \($0.navigationTitle)" } ?? "No forward task")
            .accessibilityHint("Returns to the next XERT workspace task")
            .accessibilityHidden(nextRoute == nil)
            .accessibilityIdentifier("xert-navigation-forward-history")

            XertNavigationShareControl(route: currentRoute, layout: .compact)

            Button(action: onOpenCommands) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.xertPale)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .keyboardShortcut("k", modifiers: .command)
            .accessibilityLabel("XERT quick switcher")
            .accessibilityHint("Searches workspaces, recent tasks and available actions")
            .accessibilityIdentifier("xert-navigation-commands")
        }
        .padding(.horizontal, 8)
        .frame(height: dynamicTypeSize.isAccessibilitySize ? 58 : 46)
        .background(Color.xertDeep.opacity(0.96))
        .overlay(alignment: .top) {
            Rectangle().fill(Color.xertSteel.opacity(0.2)).frame(height: 1)
        }
    }

    private func navigationButton(_ item: XertPrimaryDestination) -> some View {
        let selected = selection == item
        let status = statusSnapshot.status(for: item)
        return Button {
            guard selection != item else {
                onReselect(item)
                return
            }
            UISelectionFeedbackGenerator().selectionChanged()
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { selection = item }
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    if item == .booking {
                        Rectangle()
                            .fill(selected ? Color.xertPale : Color.xertSteel)
                            .frame(width: 38, height: 34)
                            .overlay(Rectangle().stroke(Color.xertOffWhite.opacity(0.32), lineWidth: 1))
                    }
                    Image(systemName: selected ? item.selectedIcon : item.icon)
                        .font(.system(size: item == .booking ? 17 : 18, weight: .semibold))
                        .foregroundStyle(item == .booking ? Color.xertNavy : selected ? Color.xertSteel : Color.xertPale.opacity(0.62))
                        .frame(width: 38, height: 34)

                    if let status {
                        XertNavigationStatusBadge(status: status)
                            .offset(x: 16, y: -12)
                    }
                }
                Text(item.title)
                    .font(.caption2.weight(selected ? .bold : .semibold))
                    .textCase(.uppercase)
                    .tracking(0.8)
                    .foregroundStyle(selected ? Color.xertOffWhite : Color.xertPale.opacity(0.55))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .top) {
                if selected {
                    Rectangle()
                        .fill(Color.xertSteel)
                        .frame(width: item == .booking ? 42 : 28, height: 2)
                        .matchedGeometryEffect(id: "primary-navigation-selection", in: selectionNamespace)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityValue(selected ? "Selected" : "")
        .accessibilityHint(accessibilityHint(for: item, status: status, selected: selected))
        .accessibilityIdentifier("xert-navigation-\(item.title.lowercased())")
        .accessibilityActions {
            if selected {
                Button("Refresh \(item.title)") { onReselect(item) }
                if let previousRoute {
                    Button("Return to \(previousRoute.navigationTitle)", action: onReturnPrevious)
                }
            }
        }
        .contextMenu {
            Button(action: onOpenCommands) {
                Label("Quick switcher", systemImage: "magnifyingglass")
            }
            if selected {
                Button(action: { onReselect(item) }) {
                    Label("Refresh \(item.title)", systemImage: "arrow.clockwise")
                }
                if let previousRoute {
                    Button(action: onReturnPrevious) {
                        Label("Return to \(previousRoute.navigationTitle)", systemImage: "arrow.uturn.backward")
                    }
                }
            }
        }
    }

    private func accessibilityHint(
        for item: XertPrimaryDestination,
        status: XertNavigationStatus?,
        selected: Bool
    ) -> String {
        var details: [String] = []
        if let status { details.append(status.accessibilityLabel) }
        details.append(selected ? "Refreshes this workspace" : "Opens the \(item.title) workspace")
        return details.joined(separator: ". ")
    }
}

private enum XertNavigationShareLayout {
    case rail
    case compact
}

private struct XertNavigationShareControl: View {
    let route: XertMemberRoute
    let layout: XertNavigationShareLayout

    var body: some View {
        Group {
            if let destination = route.shareDestination {
                ShareLink(item: destination.route.webURL, subject: Text(destination.title)) {
                    shareLabel
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)
                .accessibilityLabel("Share \(destination.title)")
                .accessibilityHint(destination.accessibilityHint)
                .accessibilityIdentifier("xert-navigation-share")
            } else {
                privateLabel
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(route.navigationTitle) is private")
                    .accessibilityHint("Private account tasks cannot be shared")
                    .accessibilityIdentifier("xert-navigation-share-private")
                    .help("Private account tasks cannot be shared")
            }
        }
    }

    @ViewBuilder
    private var shareLabel: some View {
        switch layout {
        case .rail:
            VStack(spacing: 5) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 16, weight: .semibold))
                Text("Share")
                    .font(.caption2.weight(.bold))
                    .textCase(.uppercase)
                    .tracking(0.7)
            }
            .foregroundStyle(Color.xertPale)
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        case .compact:
            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.xertPale)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
    }

    @ViewBuilder
    private var privateLabel: some View {
        switch layout {
        case .rail:
            VStack(spacing: 5) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 15, weight: .semibold))
                Text("Private")
                    .font(.caption2.weight(.bold))
                    .textCase(.uppercase)
                    .tracking(0.7)
            }
            .foregroundStyle(Color.xertConcrete.opacity(0.5))
            .frame(maxWidth: .infinity, minHeight: 48)
        case .compact:
            Image(systemName: "lock.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.xertConcrete.opacity(0.5))
                .frame(width: 44, height: 44)
        }
    }
}

private struct XertNavigationStatusBadge: View {
    let status: XertNavigationStatus

    var body: some View {
        Text(status.badgeText)
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(Color.xertNavy)
            .frame(minWidth: 16, minHeight: 16)
            .padding(.horizontal, status.badgeText.count > 1 ? 2 : 0)
            .background(status.kind == .attention ? Color.orange : Color.xertPale)
            .clipShape(Capsule())
            .accessibilityHidden(true)
    }
}

private struct XertNavigationCommandPalette: View {
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @FocusState private var searchFocused: Bool
    let commands: [XertNavigationCommand]
    let workspace: XertNavigationWorkspaceOverview
    let onSelect: (XertNavigationCommand) -> Void

    private var filteredCommands: [XertNavigationCommand] {
        XertNavigationCoordinator.filteredCommands(commands, query: query)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                workspaceHeader
                Group {
                    if filteredCommands.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 28, weight: .semibold))
                                .foregroundStyle(Color.xertSteel)
                            Text("No matching XERT actions")
                                .font(.headline)
                                .foregroundStyle(Color.xertOffWhite)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        List {
                            ForEach(XertNavigationCommandSection.allCases) { section in
                                let sectionCommands = filteredCommands.filter { $0.section == section }
                                if !sectionCommands.isEmpty {
                                    Section {
                                        ForEach(sectionCommands) { command in
                                            commandRow(command)
                                        }
                                    } header: {
                                        Text(section.rawValue)
                                            .font(.caption2.weight(.bold))
                                            .textCase(.uppercase)
                                            .foregroundStyle(Color.xertSteel)
                                    }
                                }
                            }
                        }
                        .listStyle(.plain)
                        .scrollContentBackground(.hidden)
                    }
                }
            }
            .background(Color.xertNavy.ignoresSafeArea())
            .navigationTitle("Quick Switcher")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search XERT")
            .focused($searchFocused)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.xertSteel)
                }
            }
            .onAppear { searchFocused = true }
        }
        .tint(Color.xertSteel)
        .preferredColorScheme(.dark)
    }

    private var workspaceHeader: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                workspaceIdentity
                Spacer(minLength: 8)
                workspaceCounts
            }
            VStack(alignment: .leading, spacing: 8) {
                workspaceIdentity
                workspaceCounts
            }
        }
        .font(.caption.weight(.bold))
        .foregroundStyle(Color.xertSteel)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 58)
        .background(Color.xertDeep.opacity(0.96))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.xertSteel.opacity(0.2)).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Current task \(workspace.currentRoute.navigationTitle), \(workspace.backCount) back, \(workspace.forwardCount) forward"
        )
        .accessibilityIdentifier("xert-navigation-workspace-overview")
    }

    private var workspaceIdentity: some View {
        HStack(spacing: 12) {
            Image(systemName: workspace.currentRoute.destination.selectedIcon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.xertSteel)
                .frame(width: 36, height: 36)
                .background(Color.xertSteel.opacity(0.1))
            VStack(alignment: .leading, spacing: 2) {
                Text(workspace.currentRoute.navigationTitle)
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text("Current workspace task")
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(Color.xertPale.opacity(0.55))
            }
        }
    }

    private var workspaceCounts: some View {
        HStack(spacing: 12) {
            Label("\(workspace.backCount)", systemImage: "arrow.uturn.backward")
            Label("\(workspace.forwardCount)", systemImage: "arrow.uturn.forward")
        }
    }

    private func commandRow(_ command: XertNavigationCommand) -> some View {
        Button {
            dismiss()
            onSelect(command)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: command.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.xertSteel)
                    .frame(width: 34, height: 34)
                    .background(Color.xertSteel.opacity(0.1))
                VStack(alignment: .leading, spacing: 3) {
                    Text(command.title)
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text(command.subtitle)
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.7))
                        .lineLimit(2)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.xertSteel.opacity(0.65))
            }
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.16))
    }
}

private struct PrivacyLockView: View {
    let isUnlocking: Bool
    let errorMessage: String?
    let onUnlock: () -> Void
    let onSignOut: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            XertLogoHeader(height: 42)
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(Color.xertSteel)
                .accessibilityHidden(true)
            VStack(spacing: 8) {
                Text("XERT Locked")
                    .xertDisplay(34)
                Text("Authenticate to view your member account.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.xertPale)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.orange)
                    .padding(.horizontal)
                    .accessibilityLabel("Unlock error: \(errorMessage)")
            }

            VStack(spacing: 12) {
                Button(action: onUnlock) {
                    HStack {
                        if isUnlocking {
                            ProgressView()
                                .tint(Color.xertNavy)
                        }
                        Text(isUnlocking ? "Authenticating..." : "Unlock XERT")
                    }
                }
                .buttonStyle(.xertPrimary)
                .disabled(isUnlocking)

                Button("Sign Out", role: .destructive, action: onSignOut)
                    .buttonStyle(.xertGhost)
                    .disabled(isUnlocking)
            }
            .frame(maxWidth: 360)
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.xertNavy.ignoresSafeArea())
    }
}

extension Color {
    static let xertNavy = Color(red: 16 / 255, green: 24 / 255, blue: 32 / 255)
    static let xertInk = Color(red: 11 / 255, green: 18 / 255, blue: 24 / 255)
    static let xertSteel = Color(red: 123 / 255, green: 167 / 255, blue: 188 / 255)
    static let xertOffWhite = Color(red: 241 / 255, green: 243 / 255, blue: 244 / 255)
}

extension ShapeStyle where Self == Color {
    static var xertSteel: Color { Color.xertSteel }
    static var xertOffWhite: Color { Color.xertOffWhite }
}

struct XertSection<Content: View>: View {
    let title: String
    let actionTitle: String?
    let action: (() -> Void)?
    let content: Content

    init(
        title: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.actionTitle = actionTitle
        self.action = action
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                Rectangle()
                    .fill(Color.xertSteel)
                    .frame(width: 22, height: 1)
                    .accessibilityHidden(true)
                Text(title)
                    .xertDisplay(24)
                Spacer()
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.xertOffWhite)
                }
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 18)
        .padding(.horizontal, 16)
        .background(Color.xertInk.opacity(0.72))
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color.xertSteel.opacity(0.55))
                .frame(width: 2)
        }
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.xertSteel.opacity(0.15))
                .frame(height: 1)
        }
    }
}

struct CachedPublicDataNotice: View {
    @EnvironmentObject private var store: XertStore

    var body: some View {
        if store.isUsingCachedPublicData, let updatedAt = store.publicDataUpdatedAt {
            Label {
                Text("Offline data from \(updatedAt.formatted(date: .abbreviated, time: .shortened))")
            } icon: {
                Image(systemName: "wifi.slash")
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.xertSteel)
            .accessibilityLabel("Showing saved data from \(updatedAt.formatted(date: .long, time: .shortened))")
        }
    }
}

struct StaleMemberDataNotice: View {
    @EnvironmentObject private var store: XertStore

    var body: some View {
        if store.isUsingStaleMemberData, let updatedAt = store.memberDataUpdatedAt {
            Label {
                Text("Account data last updated \(updatedAt.formatted(date: .omitted, time: .shortened))")
            } icon: {
                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.orange)
            .accessibilityLabel("Account data could not refresh. Last updated \(updatedAt.formatted(date: .long, time: .shortened))")
        }
    }
}

struct DataAvailabilityNotice: View {
    @EnvironmentObject private var store: XertStore
    let sources: Set<XertDataSource>

    var body: some View {
        let unavailable = sources.intersection(store.unavailableDataSources)
            .sorted { $0.rawValue < $1.rawValue }
        if !unavailable.isEmpty {
            Label {
                Text("Could not refresh \(unavailable.map(\.displayName).joined(separator: ", ")). Pull to retry.")
            } icon: {
                Image(systemName: "exclamationmark.triangle")
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.orange)
            .accessibilityLabel("Some XERT data is unavailable: \(unavailable.map(\.displayName).joined(separator: ", ")). Pull to retry.")
        }
    }
}
