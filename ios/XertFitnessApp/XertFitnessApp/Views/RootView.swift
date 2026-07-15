import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(AppPrivacyLock.preferenceKey) private var privacyLockEnabled = false
    @SceneStorage("xert.primaryDestination") private var selectedDestinationRawValue = XertPrimaryDestination.home.rawValue
    @StateObject private var navigation = XertNavigationCoordinator()
    @State private var checkoutReturnStatus: CheckoutReturnStatus?
    @State private var isPrivacyUnlocked = false
    @State private var isUnlocking = false
    @State private var privacyLockError: String?
    @State private var reminderBookingID: UUID?
    @State private var reminderNavigationRequest = 0
    @State private var announcementID: UUID?
    @State private var announcementNavigationRequest = 0
    @State private var showingAdminCommandCentre = false

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
        .onChange(of: scenePhase, perform: handleScenePhase)
        .onChange(of: store.isSignedIn) { isSignedIn in
            guard isSignedIn, privacyLockEnabled else {
                isPrivacyUnlocked = true
                privacyLockError = nil
                return
            }
            lockAndAuthenticate()
        }
        .onChange(of: store.hasBootstrapped) { hasBootstrapped in
            if hasBootstrapped, isPrivacyLocked, privacyLockError == nil {
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
        .onAppear {
            navigation.restore(rawValue: selectedDestinationRawValue)
            consumePendingReminderRoute()
            consumePendingAnnouncementRoute()
        }
        .onChange(of: navigation.selection) { destination in
            selectedDestinationRawValue = destination.rawValue
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
                announcementID: announcementID,
                announcementNavigationRequest: announcementNavigationRequest,
                onNavigate: navigate
            )
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(XertPrimaryDestination.home)

            BookingView(onNavigate: navigate)
                .tabItem {
                    Label("Book", systemImage: "calendar.badge.plus")
                }
                .tag(XertPrimaryDestination.booking)

            EventsView(onNavigate: navigate)
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
                reminderBookingID: reminderBookingID,
                reminderNavigationRequest: reminderNavigationRequest
            )
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle")
                }
                .tag(XertPrimaryDestination.account)
        }
        .toolbar(.hidden, for: .tabBar)
        .tint(.xertSteel)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            XertNavigationDock(
                selection: selectedDestinationBinding,
                isAdmin: store.profile?.isAdmin == true,
                noticeCount: store.announcements.count,
                bookingCount: activeBookingCount,
                onOpenAdmin: { showingAdminCommandCentre = true },
                onReselect: handleReselection,
                onStep: handleNavigationStep
            )
        }
        .fullScreenCover(isPresented: $showingAdminCommandCentre) {
            if store.profile?.isAdmin == true {
                AdminCommandCentreView(onClose: { showingAdminCommandCentre = false })
                    .environmentObject(store)
            }
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

    private var selectedDestinationBinding: Binding<XertPrimaryDestination> {
        Binding(
            get: { navigation.selection },
            set: { navigation.select($0, source: .dock) }
        )
    }

    private func navigate(to destination: XertPrimaryDestination) {
        navigation.select(destination, source: .content)
    }

    private func handleReselection(_ destination: XertPrimaryDestination) {
        navigation.reselect(destination)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task { await store.refresh() }
    }

    private func handleNavigationStep(_ direction: XertNavigationDirection) {
        guard navigation.step(direction) else { return }
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private var isPrivacyLocked: Bool {
        AppPrivacyLock.requiresUnlock(
            isSignedIn: store.isSignedIn,
            isEnabled: privacyLockEnabled,
            isUnlocked: isPrivacyUnlocked
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

    private func handleOpenURL(_ url: URL) {
        if let status = CheckoutDeepLink.status(from: url) {
            checkoutReturnStatus = status
            navigation.select(.booking, source: .checkout)
            Task {
                if status == .success {
                    await store.reconcileCheckout()
                } else {
                    store.cancelPendingCheckout()
                    await store.refresh()
                }
            }
            return
        }
        guard let destination = XertPrimaryDestination.destination(for: url) else { return }
        navigation.select(destination, source: .deepLink)
    }

    private func consumePendingAnnouncementRoute() {
        guard let pendingAnnouncementID = AnnouncementPushNavigation.consumePendingAnnouncementID() else { return }
        announcementID = pendingAnnouncementID
        announcementNavigationRequest += 1
        navigation.select(.home, source: .pushNotification)
        Task { await store.refresh() }
    }

    private func consumePendingReminderRoute() {
        guard let bookingID = ClassReminderNavigation.consumePendingBookingID() else { return }
        reminderBookingID = bookingID
        reminderNavigationRequest += 1
        navigation.select(.account, source: .pushNotification)
    }
}

private struct XertNavigationDock: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var selection: XertPrimaryDestination
    let isAdmin: Bool
    let noticeCount: Int
    let bookingCount: Int
    let onOpenAdmin: () -> Void
    let onReselect: (XertPrimaryDestination) -> Void
    let onStep: (XertNavigationDirection) -> Void
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
    }

    private func navigationButton(_ item: XertPrimaryDestination) -> some View {
        let selected = selection == item
        let badge = item == .home ? noticeCount : item == .booking ? bookingCount : 0
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

                    if badge > 0 {
                        Text(badge > 99 ? "99+" : "\(badge)")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(Color.xertNavy)
                            .frame(minWidth: 16, minHeight: 16)
                            .padding(.horizontal, badge > 9 ? 2 : 0)
                            .background(Color.xertPale)
                            .clipShape(Capsule())
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
        .accessibilityHint(accessibilityHint(for: item, badge: badge, selected: selected))
    }

    private func accessibilityHint(
        for item: XertPrimaryDestination,
        badge: Int,
        selected: Bool
    ) -> String {
        var details: [String] = []
        if badge > 0 {
            details.append(item == .home
                ? "\(badge) active member notices"
                : "\(badge) upcoming bookings")
        }
        details.append(selected ? "Refreshes this workspace" : "Opens the \(item.title) workspace")
        return details.joined(separator: ". ")
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
