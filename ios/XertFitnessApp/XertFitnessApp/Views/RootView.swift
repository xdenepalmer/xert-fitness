import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(AppPrivacyLock.preferenceKey) private var privacyLockEnabled = false
    @State private var selectedTab = 0
    @State private var checkoutReturnStatus: CheckoutReturnStatus?
    @State private var isPrivacyUnlocked = false
    @State private var isUnlocking = false
    @State private var privacyLockError: String?

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
    }

    private var memberTabs: some View {
        TabView(selection: $selectedTab) {
            HomeView(onNavigate: { selectedTab = $0 })
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(0)

            BookingView(onNavigate: { selectedTab = $0 })
                .tabItem {
                    Label("Book", systemImage: "calendar.badge.plus")
                }
                .tag(1)

            EventsView(onNavigate: { selectedTab = $0 })
                .tabItem {
                    Label("Events", systemImage: "trophy")
                }
                .tag(2)

            AccountView()
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle")
                }
                .tag(3)
        }
        .tint(.xertSteel)
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
            Task { await store.refresh() }
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
        guard let status = CheckoutDeepLink.status(from: url) else { return }
        checkoutReturnStatus = status
        selectedTab = 1
        Task {
            if status == .success {
                await store.reconcileCheckout()
            } else {
                await store.refresh()
            }
        }
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
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.xertSteel)
                .tracking(1.8)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.18), lineWidth: 1))
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
