import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

struct AdminCommandCentreView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var admin = AdminStore()
    @SceneStorage("xert.adminWorkspace") private var restoredWorkspace = XertOwnerWorkspace.overview.rawValue
    @SceneStorage("xert.adminRecentWorkspaces") private var restoredRecentWorkspaces = ""
    @SceneStorage("xert.adminWorkspaceHistory") private var restoredWorkspaceHistory = ""
    @SceneStorage("xert.adminNavigationUserID") private var restoredNavigationUserID = ""
    @State private var compactPath: [XertOwnerWorkspace] = []
    @State private var pendingCompactPathWorkspace: XertOwnerWorkspace?
    @State private var showingWorkspaceSwitcher = false
    @State private var showingAllWorkspaces = false
    @State private var pinnedWorkspaces: [XertOwnerWorkspace] = []
    @State private var presentedOwnerTask: XertOwnerTask?
    @State private var presentedQuickAction: AdminOwnerQuickAction?
    @State private var platformDraftSnapshot: AdminPlatformSettings?
    @State private var pendingOwnerExitRequest: OwnerExitRequest?
    @State private var showingPlatformExitConfirmation = false
    @State private var isSavingPlatformExit = false
    let requestedRoute: XertOwnerRoute?
    var onClose: (() -> Void)? = nil

    private enum OwnerExitRequest: Equatable {
        case route(XertOwnerRoute, resolvesTask: Bool)
        case previous(XertOwnerRoute)
        case next(XertOwnerRoute)
        case close

        var destinationTitle: String {
            switch self {
            case .route(let route, _), .previous(let route), .next(let route):
                return route.navigationTitle
            case .close:
                return "the member app"
            }
        }

        var targetWorkspace: XertOwnerWorkspace? {
            switch self {
            case .route(let route, _), .previous(let route), .next(let route):
                return route.workspace
            case .close:
                return nil
            }
        }
    }

    init(
        requestedRoute: XertOwnerRoute? = nil,
        onClose: (() -> Void)? = nil
    ) {
        self.requestedRoute = requestedRoute
        self.onClose = onClose
    }

    var body: some View {
        Group {
            if let session = authorizedOwnerSession {
                if horizontalSizeClass == .regular {
                    ownerSplitWorkspace(session: session)
                } else {
                    ownerCompactWorkspace(session: session)
                }
            } else {
                NavigationStack { accessDenied }
            }
        }
        .focusedSceneValue(\.xertNavigationCommandContext, ownerNavigationCommandContext)
        .background(Color.xertNavy.ignoresSafeArea())
        .interactiveDismissDisabled(hasUnsavedPlatformDraft || admin.isSavingSettings || isSavingPlatformExit)
        .task {
            guard let session = authorizedOwnerSession, let userID = session.user?.id else { return }
            prepareOwnerNavigation(for: userID)
            reloadPinnedWorkspaces()
            applyRequestedRoute(requestedRoute, resolvesTask: false)
            await admin.refresh(session: session)
            if let task = presentedOwnerTask {
                await admin.resolveOwnerTask(session: session, task: task)
            }
        }
        .onChange(of: store.authSession?.user?.id) { userID in
            if let userID { prepareOwnerNavigation(for: userID) }
            reloadPinnedWorkspaces()
        }
        .onChange(of: requestedRoute) { route in
            applyRequestedRoute(route)
        }
        .sheet(isPresented: $showingWorkspaceSwitcher) {
            if let session = authorizedOwnerSession {
                AdminWorkspaceSwitcher(
                    admin: admin,
                    session: session,
                    current: currentWorkspace,
                    recent: recentWorkspaces.workspaces,
                    pinned: pinnedWorkspaces,
                    badges: workspaceBadges,
                    launchRunway: stripeLaunchState
                ) { workspace in
                    showingWorkspaceSwitcher = false
                    openWorkspaceWithFeedback(workspace)
                } onOpenRoute: { route in
                    showingWorkspaceSwitcher = false
                    XertHaptics.play(.lightImpact)
                    openOwnerRoute(route)
                } onTogglePin: { workspace in
                    togglePinnedWorkspace(workspace)
                }
            }
        }
        .sheet(item: $presentedOwnerTask, onDismiss: closePresentedOwnerTask) { task in
            if let session = authorizedOwnerSession {
                AdminOwnerTaskSheet(admin: admin, session: session, task: task)
            }
        }
        .sheet(item: $presentedQuickAction) { action in
            if let session = authorizedOwnerSession {
                quickActionSheet(action, session: session)
            }
        }
        .confirmationDialog(
            "Unsaved Member App Controls",
            isPresented: $showingPlatformExitConfirmation,
            titleVisibility: .visible,
            presenting: pendingOwnerExitRequest
        ) { request in
            Button(platformExitSaveButtonLabel) {
                isSavingPlatformExit = true
                showingPlatformExitConfirmation = false
                savePlatformDraftAndComplete(request)
            }
            .disabled(!canSavePlatformDraftForExit)

            Button("Discard changes and continue", role: .destructive) {
                discardPlatformDraftAndComplete(request)
            }
            .disabled(admin.isSavingSettings || isSavingPlatformExit)

            Button("Keep editing", role: .cancel) {
                pendingOwnerExitRequest = nil
            }
        } message: { request in
            Text(platformExitMessage(for: request))
        }
        .alert("Command Centre", isPresented: Binding(
            get: { admin.errorMessage != nil },
            set: { if !$0 { admin.errorMessage = nil } }
        )) {
            Button("OK") { admin.errorMessage = nil }
        } message: {
            Text(admin.errorMessage ?? "")
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else {
                admin.clearRevealedMemberEmergencyContact()
                return
            }
            guard
                  let session = authorizedOwnerSession,
                  ownerDataNeedsForegroundRefresh else { return }
            Task { await admin.refresh(session: session) }
        }
        .onChange(of: showingPlatformExitConfirmation) { isPresented in
            if !isPresented && !isSavingPlatformExit {
                pendingOwnerExitRequest = nil
            }
        }
    }

    private var authorizedOwnerSession: AuthSession? {
        guard store.profile?.isAdmin == true,
              let session = store.authSession,
              session.user?.id != nil else { return nil }
        return session
    }

    private var currentWorkspace: XertOwnerWorkspace {
        XertOwnerWorkspace(rawValue: restoredWorkspace) ?? .overview
    }

    private var ownerDataNeedsForegroundRefresh: Bool {
        guard !admin.isLoading, !admin.isSavingSettings, !isSavingPlatformExit else { return false }
        guard let updatedAt = admin.lastUpdatedAt else { return true }
        return Date().timeIntervalSince(updatedAt) >= 120
    }

    private var hasUnsavedPlatformDraft: Bool {
        currentWorkspace == .controls
            && platformDraftSnapshot != nil
            && platformDraftSnapshot != admin.settings
    }

    private var canSavePlatformDraftForExit: Bool {
        hasUnsavedPlatformDraft
            && authorizedOwnerSession != nil
            && admin.loadedSources.contains("platform controls")
            && !admin.refreshUnavailableSources.contains("platform controls")
            && !admin.isLoading
            && !admin.isSavingSettings
            && !isSavingPlatformExit
    }

    private var platformExitWouldEnablePayments: Bool {
        platformDraftSnapshot?.payments_enabled == true
            && admin.settings?.payments_enabled != true
    }

    private var platformExitSaveButtonLabel: String {
        platformExitWouldEnablePayments ? "Save, verify checkout and continue" : "Save changes and continue"
    }

    private var workspaceSelection: Binding<XertOwnerWorkspace?> {
        Binding(
            get: { currentWorkspace },
            set: { openWorkspace($0 ?? .overview) }
        )
    }

    private var compactNavigationPath: Binding<[XertOwnerWorkspace]> {
        Binding(
            get: { compactPath },
            set: { path in
                guard path != compactPath else { return }
                let workspace = path.last ?? .overview
                if currentWorkspace == .controls,
                   workspace != .controls,
                   hasUnsavedPlatformDraft {
                    requestOwnerExit(.route(XertOwnerRoute(workspace: workspace), resolvesTask: true))
                    return
                }
                compactPath = path
            }
        )
    }

    private var recentWorkspaces: XertOwnerWorkspaceRecency {
        XertOwnerWorkspaceRecency(restorationValue: restoredRecentWorkspaces)
    }

    private var ownerRouteHistory: XertOwnerRouteHistory {
        XertOwnerRouteHistory(
            restorationValue: restoredWorkspaceHistory,
            fallback: XertOwnerRoute(workspace: currentWorkspace)
        )
    }

    private var workspaceBadges: [XertOwnerWorkspace: Int] {
        let pairs: [(XertOwnerWorkspace, Int)] = XertOwnerWorkspace.allCases.compactMap { workspace in
            guard let badge = workspaceBadge(workspace), badge > 0 else { return nil }
            return (workspace, badge)
        }
        return Dictionary(uniqueKeysWithValues: pairs)
    }

    private var ownerNavigationCommandContext: XertNavigationCommandContext {
        let isAvailable = authorizedOwnerSession != nil
            && !showingWorkspaceSwitcher
            && !showingPlatformExitConfirmation
            && !admin.isSavingSettings
            && !isSavingPlatformExit
        return XertNavigationCommandContext(
            isAvailable: isAvailable,
            scope: .owner(currentWorkspace),
            previousTitle: isAvailable ? ownerRouteHistory.previous?.navigationTitle : nil,
            nextTitle: isAvailable ? ownerRouteHistory.next?.navigationTitle : nil,
            isAdmin: isAvailable,
            perform: executeOwnerSceneNavigationCommand
        )
    }

    private func openWorkspace(_ workspace: XertOwnerWorkspace) {
        openOwnerRoute(XertOwnerRoute(workspace: workspace))
    }

    private func openOwnerRoute(_ route: XertOwnerRoute, resolvesTask: Bool = true) {
        requestOwnerExit(.route(route, resolvesTask: resolvesTask))
    }

    private func performOpenOwnerRoute(_ route: XertOwnerRoute, resolvesTask: Bool = true) {
        var history = ownerRouteHistory
        history.visit(route)
        restoredWorkspaceHistory = history.restorationValue
        applyOwnerRoute(route)
        guard resolvesTask, let task = route.task, let session = authorizedOwnerSession else { return }
        Task { await admin.resolveOwnerTask(session: session, task: task) }
    }

    private func requestOwnerExit(_ request: OwnerExitRequest) {
        guard !isSavingPlatformExit else { return }
        let leavesPlatformControls = request.targetWorkspace != .controls
        guard leavesPlatformControls, hasUnsavedPlatformDraft else {
            performOwnerExit(request)
            return
        }
        pendingOwnerExitRequest = request
        showingPlatformExitConfirmation = true
        XertHaptics.play(.warning)
    }

    private func performOwnerExit(_ request: OwnerExitRequest) {
        pendingOwnerExitRequest = nil
        showingPlatformExitConfirmation = false
        if request.targetWorkspace != .controls {
            platformDraftSnapshot = nil
        }

        switch request {
        case .route(let route, let resolvesTask):
            performOpenOwnerRoute(route, resolvesTask: resolvesTask)
        case .previous:
            performReturnToPreviousOwnerRoute()
        case .next:
            performAdvanceToNextOwnerRoute()
        case .close:
            onClose?()
        }
    }

    private func savePlatformDraftAndComplete(_ request: OwnerExitRequest) {
        guard let session = authorizedOwnerSession, let draft = platformDraftSnapshot else {
            isSavingPlatformExit = false
            pendingOwnerExitRequest = nil
            admin.errorMessage = "Member App Controls could not be saved. Keep editing and try again."
            XertHaptics.play(.error)
            return
        }

        Task {
            let didSave = await admin.saveSettings(session: session, draft: draft)
            isSavingPlatformExit = false
            if didSave {
                XertHaptics.play(.success)
                platformDraftSnapshot = admin.settings
                performOwnerExit(request)
            } else {
                pendingOwnerExitRequest = nil
                XertHaptics.play(.error)
            }
        }
    }

    private func discardPlatformDraftAndComplete(_ request: OwnerExitRequest) {
        platformDraftSnapshot = admin.settings
        XertHaptics.play(.softImpact)
        performOwnerExit(request)
    }

    private func platformExitMessage(for request: OwnerExitRequest) -> String {
        let destination = request == .close
            ? "closing the Command Centre"
            : "opening \(request.destinationTitle)"
        if !canSavePlatformDraftForExit {
            return "Live member-app settings have unsaved changes. Saving is unavailable until Platform Controls refreshes successfully. Discard them before \(destination), or keep editing."
        }
        if platformExitWouldEnablePayments {
            return "Live member-app settings have unsaved changes. Saving will run Stripe launch checks before enabling checkout and \(destination). You can also discard the draft or keep editing."
        }
        return "Save the live member-app settings before \(destination), discard the draft, or keep editing."
    }

    private func reloadPinnedWorkspaces() {
        pinnedWorkspaces = XertOwnerWorkspacePinsStore.load(
            for: authorizedOwnerSession?.user?.id
        )
    }

    private func prepareOwnerNavigation(for userID: UUID) {
        let accountID = userID.uuidString.lowercased()
        guard restoredNavigationUserID != accountID else { return }
        restoredNavigationUserID = accountID
        restoredWorkspace = XertOwnerWorkspace.overview.rawValue
        restoredRecentWorkspaces = ""
        restoredWorkspaceHistory = ""
        compactPath = []
        pendingCompactPathWorkspace = nil
        presentedOwnerTask = nil
        presentedQuickAction = nil
        showingAllWorkspaces = false
        platformDraftSnapshot = nil
        pendingOwnerExitRequest = nil
        showingPlatformExitConfirmation = false
        isSavingPlatformExit = false
    }

    private func togglePinnedWorkspace(_ workspace: XertOwnerWorkspace) {
        guard let userID = authorizedOwnerSession?.user?.id else { return }
        pinnedWorkspaces = XertOwnerWorkspacePinsStore.toggle(workspace, for: userID)
        XertHaptics.play(.lightImpact)
    }

    private func applyWorkspace(_ workspace: XertOwnerWorkspace) {
        restoredWorkspace = workspace.rawValue
        var recency = recentWorkspaces
        recency.record(workspace)
        restoredRecentWorkspaces = recency.restorationValue
        let targetPath = workspace == .overview ? [] : [workspace]
        if compactPath != targetPath {
            pendingCompactPathWorkspace = workspace
            compactPath = targetPath
        }
    }

    private func applyOwnerRoute(_ route: XertOwnerRoute) {
        presentedOwnerTask = route.task
        applyWorkspace(route.workspace)
    }

    private func returnToPreviousOwnerRoute() {
        guard let route = ownerRouteHistory.previous else { return }
        requestOwnerExit(.previous(route))
    }

    private func performReturnToPreviousOwnerRoute() {
        var history = ownerRouteHistory
        guard let route = history.goBack() else { return }
        restoredWorkspaceHistory = history.restorationValue
        applyOwnerRoute(route)
        resolveOwnerTask(route.task)
    }

    private func advanceToNextOwnerRoute() {
        guard let route = ownerRouteHistory.next else { return }
        requestOwnerExit(.next(route))
    }

    private func performAdvanceToNextOwnerRoute() {
        var history = ownerRouteHistory
        guard let route = history.goForward() else { return }
        restoredWorkspaceHistory = history.restorationValue
        applyOwnerRoute(route)
        resolveOwnerTask(route.task)
    }

    private func executeOwnerSceneNavigationCommand(_ command: XertSceneNavigationCommand) {
        guard store.profile?.isAdmin == true else { return }
        switch command {
        case .ownerWorkspace(let workspace):
            openWorkspace(workspace)
        case .previous:
            returnToPreviousOwnerRoute()
        case .next:
            advanceToNextOwnerRoute()
        case .quickSwitcher:
            showingWorkspaceSwitcher = true
        case .refresh:
            guard let session = authorizedOwnerSession else { return }
            refreshOwnerData(session: session)
        case .closeOwner:
            requestOwnerExit(.close)
        case .destination(_), .owner:
            return
        }
    }

    private func applyRequestedRoute(
        _ route: XertOwnerRoute?,
        resolvesTask: Bool = true
    ) {
        if let route {
            openOwnerRoute(route, resolvesTask: resolvesTask)
        } else {
            applyOwnerRoute(ownerRouteHistory.current)
        }
    }

    private func resolveOwnerTask(_ task: XertOwnerTask?) {
        guard let task, let session = authorizedOwnerSession else { return }
        Task { await admin.resolveOwnerTask(session: session, task: task) }
    }

    private func closePresentedOwnerTask() {
        guard ownerRouteHistory.current.task != nil else { return }
        openWorkspace(currentWorkspace)
    }

    private func openWorkspaceWithFeedback(_ workspace: XertOwnerWorkspace) {
        XertHaptics.play(.selection)
        openWorkspace(workspace)
    }

    private func openOwnerRouteWithFeedback(_ route: XertOwnerRoute) {
        XertHaptics.play(.selection)
        openOwnerRoute(route)
    }

    private func presentQuickAction(_ action: AdminOwnerQuickAction) {
        XertHaptics.play(.lightImpact)
        presentedQuickAction = action
    }

    private func refreshOwnerData(session: AuthSession, announcesResult: Bool = true) {
        guard !admin.isLoading, !admin.isSavingSettings, !isSavingPlatformExit else { return }
        XertHaptics.play(.softImpact)
        Task {
            await admin.refresh(session: session)
            guard announcesResult else { return }
            XertHaptics.play(admin.refreshUnavailableSources.isEmpty ? .success : .warning)
        }
    }

    @ViewBuilder
    private func quickActionSheet(_ action: AdminOwnerQuickAction, session: AuthSession) -> some View {
        switch action {
        case .newClass:
            NavigationStack {
                AdminClassEditor(admin: admin, session: session, classSession: nil)
            }
        case .newNotice:
            AdminAnnouncementComposer(isPublishing: admin.isPublishingAnnouncement) { title, body, tone in
                Task {
                    if await admin.publishAnnouncement(session: session, title: title, body: body, tone: tone) {
                        XertHaptics.play(.success)
                        presentedQuickAction = nil
                    } else {
                        XertHaptics.play(.error)
                    }
                }
            }
        case .newSessionPack:
            NavigationStack {
                AdminProductEditor(
                    admin: admin,
                    session: session,
                    product: nil,
                    suggestedSortOrder: (admin.products.map(\.sort_order).max() ?? -1) + 1
                )
            }
        }
    }

    private func ownerCompactWorkspace(session: AuthSession) -> some View {
        NavigationStack(path: compactNavigationPath) {
            dashboard(session: session)
                .navigationTitle("Command Centre")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ownerWorkspaceToolbar }
                .navigationDestination(for: XertOwnerWorkspace.self) { workspace in
                    workspaceDestination(workspace, session: session)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { ownerWorkspaceToolbar }
                }
        }
        .onChange(of: compactPath) { path in
            let workspace = path.last ?? .overview
            if pendingCompactPathWorkspace == workspace {
                pendingCompactPathWorkspace = nil
                return
            }
            openWorkspace(workspace)
        }
    }

    private func ownerSplitWorkspace(session: AuthSession) -> some View {
        NavigationSplitView {
            List(selection: workspaceSelection) {
                Label(XertOwnerWorkspace.overview.title, systemImage: XertOwnerWorkspace.overview.icon)
                    .tag(XertOwnerWorkspace.overview)

                if !pinnedWorkspaces.isEmpty {
                    Section("Pinned") {
                        ForEach(pinnedWorkspaces) { workspace in
                            Label(workspace.title, systemImage: workspace.icon)
                                .tag(workspace)
                        }
                    }
                }

                ForEach(XertOwnerWorkspaceSection.allCases) { section in
                    Section(section.rawValue) {
                        ForEach(XertOwnerWorkspace.workspaces(in: section).filter { !pinnedWorkspaces.contains($0) }) { workspace in
                            HStack(spacing: 10) {
                                Label(workspace.title, systemImage: workspace.icon)
                                Spacer(minLength: 4)
                                if let badge = workspaceBadge(workspace), badge > 0 {
                                    Text(badge > 99 ? "99+" : "\(badge)")
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(Color.xertNavy)
                                        .padding(.horizontal, 7)
                                        .frame(minHeight: 20)
                                        .background(Color.xertSteel)
                                        .clipShape(Capsule())
                                }
                            }
                            .tag(workspace)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.xertInk)
            .navigationTitle("Command Centre")
            .toolbar {
                closeToolbar
                workspaceSwitcherToolbar
            }
            .navigationSplitViewColumnWidth(min: 230, ideal: 270, max: 320)
        } detail: {
            NavigationStack {
                workspaceDestination(currentWorkspace, session: session)
                    .id(currentWorkspace)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { workspaceSwitcherToolbar }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    private func dashboard(session: AuthSession) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                ownerHeader
                if !admin.refreshUnavailableSources.isEmpty {
                    AdminRefreshDataWarning(
                        unavailableSources: admin.refreshUnavailableSources,
                        cachedSources: admin.loadedSources,
                        isRetrying: admin.isLoading
                    ) {
                        refreshOwnerData(session: session)
                    }
                }
                priorityQueue
                stripeLaunchRunway
                quickTools
                attentionGrid
                businessPulse
                activationPulse
                todayDesk
                pinnedDirectory
                managementDirectory
            }
            .frame(maxWidth: 880)
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity)
        }
        .xertScreenBackground()
        .refreshable { await admin.refresh(session: session) }
    }

    private var accessDenied: some View {
        VStack(spacing: 14) {
            Image(systemName: "lock.shield")
                .font(.system(size: 38, weight: .semibold))
                .foregroundStyle(Color.xertSteel)
            Text("Owner access required").xertDisplay(28)
            Text("This workspace is available only to XERT administrators.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.xertPale.opacity(0.7))
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.xertNavy)
        .navigationTitle("Command Centre")
        .toolbar { closeToolbar }
    }

    @ToolbarContentBuilder
    private var closeToolbar: some ToolbarContent {
        if onClose != nil {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { requestOwnerExit(.close) } label: {
                    Label("Close", systemImage: "xmark")
                }
                .foregroundStyle(Color.xertSteel)
            }
        }
    }

    @ToolbarContentBuilder
    private var workspaceSwitcherToolbar: some ToolbarContent {
        ToolbarItem(placement: .secondaryAction) {
            Menu {
                if currentWorkspace != .overview {
                    Button { openWorkspaceWithFeedback(.overview) } label: {
                        Label("Owner overview", systemImage: "waveform.path.ecg.rectangle")
                    }
                }

                if let session = authorizedOwnerSession {
                    Button { refreshOwnerData(session: session) } label: {
                        Label(admin.isLoading ? "Refreshing owner data" : "Refresh owner data", systemImage: "arrow.clockwise")
                    }
                    .disabled(admin.isLoading || admin.isSavingSettings || isSavingPlatformExit)
                }

                if currentWorkspace != .overview {
                    Button { togglePinnedWorkspace(currentWorkspace) } label: {
                        Label(
                            pinnedWorkspaces.contains(currentWorkspace) ? "Unpin this workspace" : "Pin this workspace",
                            systemImage: pinnedWorkspaces.contains(currentWorkspace) ? "pin.slash" : "pin"
                        )
                    }
                }

                Divider()

                Button { returnToPreviousOwnerRoute() } label: {
                    Label(
                        ownerRouteHistory.previous.map { "Back to \($0.navigationTitle)" } ?? "No previous workspace",
                        systemImage: "arrow.left"
                    )
                }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(ownerRouteHistory.previous == nil)

                Button { advanceToNextOwnerRoute() } label: {
                    Label(
                        ownerRouteHistory.next.map { "Forward to \($0.navigationTitle)" } ?? "No next workspace",
                        systemImage: "arrow.right"
                    )
                }
                .keyboardShortcut("]", modifiers: .command)
                .disabled(ownerRouteHistory.next == nil)
            } label: {
                if admin.isLoading {
                    ProgressView().tint(Color.xertSteel)
                } else {
                    Image(systemName: "ellipsis.circle")
                }
            }
            .accessibilityLabel(admin.isLoading ? "Owner actions, refreshing" : "Owner actions")
            .accessibilityHint("Refreshes data, pins workspaces, or opens owner navigation history")
        }

        ToolbarItem(placement: .primaryAction) {
            Button { showingWorkspaceSwitcher = true } label: {
                Image(systemName: "magnifyingglass")
            }
            .keyboardShortcut("k", modifiers: .command)
            .accessibilityLabel("Switch owner workspace")
        }
    }

    @ToolbarContentBuilder
    private var ownerWorkspaceToolbar: some ToolbarContent {
        closeToolbar
        workspaceSwitcherToolbar
    }

    private var ownerHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) {
                        ownerHeaderIdentity
                        AdminOwnerFreshnessBadge(
                            isLoading: admin.isLoading,
                            unavailableCount: admin.refreshUnavailableSources.count,
                            updatedAt: admin.lastUpdatedAt
                        )
                    }
                } else {
                    HStack(alignment: .top, spacing: 14) {
                        ownerHeaderIdentity
                        Spacer(minLength: 8)
                        AdminOwnerFreshnessBadge(
                            isLoading: admin.isLoading,
                            unavailableCount: admin.refreshUnavailableSources.count,
                            updatedAt: admin.lastUpdatedAt
                        )
                    }
                }
            }
            Text("Members, classes, sales and live operations — protected and ready from your phone.")
                .font(.subheadline)
                .foregroundStyle(Color.xertPale.opacity(0.72))
        }
        .padding(18)
        .xertCardStyle()
        .overlay(alignment: .leading) {
            Rectangle().fill(Color.xertSteel).frame(width: 3)
        }
    }

    private var ownerHeaderIdentity: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("OWNER WORKSPACE")
                .font(.caption.weight(.bold))
                .tracking(2)
                .foregroundStyle(Color.xertSteel)
            Text("Run XERT from one place.")
                .xertDisplay(32)
                .foregroundStyle(Color.xertOffWhite)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var stripeLaunchState: XertStripeLaunchRunway {
        let requiredSources = ["platform controls", "session packs", "Stripe health"]
        let sourcesAreCurrent = requiredSources.allSatisfy {
            admin.loadedSources.contains($0) && !admin.refreshUnavailableSources.contains($0)
        }
        let activeProducts = admin.products.filter(\.active)
        let blockingProductIDs = admin.commerceHealth?.issues?.compactMap { issue in
            admin.products.first {
                $0.slug.caseInsensitiveCompare(issue.slug) == .orderedSame
            }?.id
        } ?? []
        return XertStripeLaunchRunway.resolve(
            hasCompletedRefresh: admin.hasCompletedRefresh,
            isRefreshing: admin.isLoading,
            sourcesAreCurrent: sourcesAreCurrent,
            paymentsEnabled: admin.settings?.payments_enabled,
            hasActiveProducts: !activeProducts.isEmpty,
            activeProductsAreLinked: activeProducts.allSatisfy(\.hasStableStripePriceID),
            healthReady: admin.commerceHealth?.ready,
            paymentSwitchState: admin.commerceHealth?.payment_switch?.state,
            activationReceiptReady: admin.commerceHealth?.activation_receipt?.ready,
            blockingProductIDs: blockingProductIDs
        )
    }

    private var stripeLaunchRunway: some View {
        let runway = stripeLaunchState
        return Button {
            openOwnerRouteWithFeedback(runway.route)
        } label: {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: stripeRunwayIcon(runway.phase))
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(stripeRunwayColour(runway.phase))
                        .frame(width: 30)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("STRIPE LAUNCH RUNWAY")
                            .font(.caption2.weight(.black))
                            .tracking(1.4)
                            .foregroundStyle(Color.xertSteel)
                        Text(runway.title)
                            .font(.headline)
                            .foregroundStyle(Color.xertOffWhite)
                        Text(runway.detail)
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.72))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                }
                ProgressView(value: Double(runway.completedSteps), total: Double(XertStripeLaunchRunway.totalSteps))
                    .tint(stripeRunwayColour(runway.phase))
                HStack(spacing: 10) {
                    Text("\(runway.completedSteps)/\(XertStripeLaunchRunway.totalSteps) gates")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.xertPale.opacity(0.58))
                    Spacer()
                    Label(runway.actionTitle, systemImage: "arrow.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.xertSteel)
                        .labelStyle(.titleAndIcon)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .xertCardStyle()
            .overlay(alignment: .leading) {
                Rectangle().fill(stripeRunwayColour(runway.phase)).frame(width: 3)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Stripe launch runway, \(runway.title), \(runway.completedSteps) of \(XertStripeLaunchRunway.totalSteps) gates complete")
        .accessibilityHint(runway.actionTitle)
        .accessibilityIdentifier("owner.stripeLaunchRunway")
    }

    private func stripeRunwayIcon(_ phase: XertStripeLaunchPhase) -> String {
        switch phase {
        case .checking: return "arrow.triangle.2.circlepath"
        case .unavailable: return "wifi.exclamationmark"
        case .catalogBlocked: return "ticket"
        case .healthBlocked: return "exclamationmark.shield"
        case .readyToActivate: return "checkmark.shield"
        case .live: return "bolt.shield.fill"
        }
    }

    private func stripeRunwayColour(_ phase: XertStripeLaunchPhase) -> Color {
        switch phase {
        case .checking: return Color.xertSteel
        case .unavailable, .catalogBlocked, .healthBlocked: return Color.orange
        case .readyToActivate: return Color.xertSteel
        case .live: return Color.green
        }
    }

    private var quickTools: some View {
        VStack(alignment: .leading, spacing: 12) {
            adminHeading("Quick tools")
            LazyVGrid(columns: dashboardMetricColumns, spacing: 10) {
                AdminQuickToolButton(
                    title: "Find a member",
                    detail: "Search name, email or phone",
                    icon: "magnifyingglass"
                ) {
                    XertHaptics.play(.selection)
                    showingWorkspaceSwitcher = true
                }
                AdminQuickToolButton(
                    title: "Create a class",
                    detail: quickToolDetail(source: "full timetable", ready: "Add to the timetable"),
                    icon: "calendar.badge.plus",
                    isEnabled: quickMutationIsAvailable(source: "full timetable")
                ) {
                    presentQuickAction(.newClass)
                }
                AdminQuickToolButton(
                    title: "Publish a notice",
                    detail: quickToolDetail(source: "member notices", ready: "Reach web and iOS members"),
                    icon: "bell.badge.fill",
                    isEnabled: quickMutationIsAvailable(source: "member notices")
                ) {
                    presentQuickAction(.newNotice)
                }
                AdminQuickToolButton(
                    title: "Create a session pack",
                    detail: quickToolDetail(source: "session packs", ready: "Start as a private draft"),
                    icon: "ticket.fill",
                    isEnabled: quickMutationIsAvailable(source: "session packs")
                ) {
                    presentQuickAction(.newSessionPack)
                }
            }
        }
    }

    private func quickMutationIsAvailable(source: String) -> Bool {
        !admin.isLoading
            && admin.loadedSources.contains(source)
            && !admin.refreshUnavailableSources.contains(source)
    }

    private func quickToolDetail(source: String, ready: String) -> String {
        if admin.isLoading && !admin.loadedSources.contains(source) { return "Checking access…" }
        if admin.refreshUnavailableSources.contains(source) || !admin.loadedSources.contains(source) {
            return "Refresh required before editing"
        }
        return ready
    }

    private var attentionGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            adminHeading("Live workload")
            LazyVGrid(columns: dashboardMetricColumns, spacing: 10) {
                AdminMetricTile(
                    title: "Class requests",
                    value: admin.requestedPlaces,
                    icon: "tray.full",
                    dataState: dashboardDataState(for: "today's classes")
                ) {
                    openWorkspaceWithFeedback(.bookingRequests)
                }
                AdminMetricTile(
                    title: "Waitlisted",
                    value: admin.waitingMembers,
                    icon: "person.2.badge.clock",
                    dataState: dashboardDataState(for: "waitlists")
                ) {
                    openWorkspaceWithFeedback(.classDesk)
                }
                AdminMetricTile(
                    title: "Follow-ups",
                    value: admin.followUps.count,
                    icon: "phone.arrow.up.right",
                    dataState: dashboardDataState(for: "retention")
                ) {
                    openWorkspaceWithFeedback(.retention)
                }
                AdminMetricTile(
                    title: "Roll calls",
                    value: admin.attendanceDue,
                    icon: "checklist",
                    dataState: dashboardDataState(for: "today's classes")
                ) {
                    openOwnerRouteWithFeedback(attendancePriorityRoute)
                }
            }
        }
    }

    private var priorityQueue: some View {
        let priorities = operationalPriorities
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                adminHeading("Operational priority queue")
                Spacer()
                Text("LIVE")
                    .font(.system(size: 9, weight: .black))
                    .tracking(1.2)
                    .foregroundStyle(Color.xertNavy)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.xertSteel)
                    .clipShape(Capsule())
            }

            operationalQueueContent(priorities)
        }
    }

    @ViewBuilder
    private func operationalQueueContent(_ priorities: [AdminPriorityAction]) -> some View {
        switch admin.operationalQueueState {
        case .idle, .loading:
            HStack(spacing: 12) {
                ProgressView().tint(Color.xertSteel)
                Text("Checking operational queues…")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.xertPale.opacity(0.82))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .xertCardStyle()
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Checking operational queues")
        case .partial(let unavailableSources):
            AdminOperationalDataWarning(unavailableSources: unavailableSources)
            if priorities.isEmpty {
                AdminEmptyState(
                    icon: "exclamationmark.triangle.fill",
                    text: "Available queues have no open items. Some operational data could not be checked."
                )
            } else {
                priorityRows(priorities)
            }
        case .ready:
            if priorities.isEmpty {
                AdminEmptyState(icon: "checkmark.seal.fill", text: "All operational queues are clear.")
            } else {
                priorityRows(priorities)
            }
        }
    }

    @ViewBuilder
    private func priorityRows(_ priorities: [AdminPriorityAction]) -> some View {
        ForEach(priorities) { priority in
            AdminPriorityRow(priority: priority) {
                openOwnerRouteWithFeedback(priority.route)
            }
        }
    }

    private var operationalPriorities: [AdminPriorityAction] {
        [
            AdminPriorityAction(
                title: "Release health issues",
                detail: "Review schema, Stripe and push readiness",
                icon: "cross.case.fill",
                count: admin.healthIssues,
                workspace: .health,
                isCritical: true
            ),
            AdminPriorityAction(
                title: "Pack sales setup",
                detail: admin.products.isEmpty
                    ? "Create the first private session-pack draft"
                    : "Fix active packs before members reach checkout",
                icon: "ticket",
                count: pricingAttentionCount,
                workspace: .products,
                isCritical: admin.settings?.payments_enabled == true
            ),
            AdminPriorityAction(
                title: "Class booking requests",
                detail: "Confirm or decline member places",
                icon: "person.crop.circle.badge.questionmark",
                count: admin.requestedPlaces,
                workspace: .bookingRequests
            ),
            AdminPriorityAction(
                title: "PT enquiries",
                detail: "Respond to coaching requests",
                icon: "figure.strengthtraining.traditional",
                count: admin.pendingPTRequests,
                workspace: .ptRequests
            ),
            AdminPriorityAction(
                title: "Attendance due",
                detail: "Complete outstanding class roll calls",
                icon: "checklist",
                count: admin.attendanceDue,
                workspace: .classDesk,
                task: singleAttendanceTask
            ),
            AdminPriorityAction(
                title: "Waitlisted members",
                detail: "Review queues and available places",
                icon: "person.2.badge.clock",
                count: admin.waitingMembers,
                workspace: .classDesk
            ),
            AdminPriorityAction(
                title: "Retention follow-ups",
                detail: "Contact members who need support",
                icon: "phone.arrow.up.right",
                count: admin.followUps.count,
                workspace: .retention
            ),
            AdminPriorityAction(
                title: "Orders to reconcile",
                detail: "Recover unresolved paid checkouts",
                icon: "arrow.triangle.2.circlepath.circle",
                count: admin.orders.lazy.filter(\.isRecoverable).count,
                workspace: .orders,
                isCritical: true
            ),
        ]
        .filter { $0.count > 0 }
        .sorted {
            if $0.isCritical != $1.isCritical { return $0.isCritical }
            return $0.count > $1.count
        }
    }

    private var pricingAttentionCount: Int {
        guard !admin.refreshUnavailableSources.contains("session packs") else { return 0 }
        if !admin.products.contains(where: \.active) { return 1 }
        return admin.products.filter { $0.active && !$0.hasStableStripePriceID }.count
    }

    private var singleAttendanceTask: XertOwnerTask? {
        let due = admin.dailyOperations.filter(\.attendance_due)
        guard due.count == 1, let operation = due.first else { return nil }
        return .classSession(operation.id)
    }

    private var attendancePriorityRoute: XertOwnerRoute {
        singleAttendanceTask.map { XertOwnerRoute(task: $0) }
            ?? XertOwnerRoute(workspace: .classDesk)
    }

    private var businessPulse: some View {
        VStack(alignment: .leading, spacing: 12) {
            adminHeading("Business pulse")
            LazyVGrid(columns: dashboardMetricColumns, spacing: 10) {
                AdminMoneyTile(
                    title: "This month",
                    cents: admin.monthRevenueCents,
                    dataState: dashboardDataState(for: "orders")
                ) {
                    openWorkspaceWithFeedback(.finance)
                }
                AdminMoneyTile(
                    title: "Total revenue",
                    cents: admin.totalRevenueCents,
                    dataState: dashboardDataState(for: "orders")
                ) {
                    openWorkspaceWithFeedback(.finance)
                }
                AdminMetricTile(
                    title: "Members",
                    value: admin.memberCount,
                    icon: "person.2",
                    dataState: dashboardDataState(for: "members")
                ) {
                    openWorkspaceWithFeedback(.members)
                }
                AdminMetricTile(
                    title: "Paid orders",
                    value: admin.paidOrders.count,
                    icon: "creditcard",
                    dataState: dashboardDataState(for: "orders")
                ) {
                    openWorkspaceWithFeedback(.orders)
                }
            }
        }
    }

    private var activationPulse: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                adminHeading("Member activation · 30 days")
                Spacer()
                Button("OPEN ACTIONS") { openWorkspaceWithFeedback(.retention) }
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color.xertSteel)
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens member activation and retention actions")
            }

            if admin.activationOverview == nil && (admin.isLoading || admin.lastUpdatedAt == nil) {
                HStack(spacing: 12) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Building the member activation snapshot…")
                        .font(.subheadline)
                        .foregroundStyle(Color.xertPale.opacity(0.75))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .xertCardStyle()
            } else if let overview = admin.activationOverview {
                if admin.refreshUnavailableSources.contains("member activation") {
                    Label("Showing the last activation snapshot. Pull to refresh before outreach.", systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
                LazyVGrid(columns: dashboardMetricColumns, spacing: 10) {
                    ForEach(Array(overview.stages.enumerated()), id: \.offset) { _, stage in
                        let percentage = overview.accounts_created > 0
                            ? Int((Double(stage.count) / Double(overview.accounts_created) * 100).rounded())
                            : nil
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(stage.count)").xertDisplay(28)
                            Text(stage.label.uppercased())
                                .font(.caption2.weight(.bold))
                                .tracking(0.7)
                                .foregroundStyle(Color.xertSteel)
                            Text(percentage.map { "\($0)% of accounts" } ?? "No cohort yet")
                                .font(.caption2)
                                .foregroundStyle(Color.xertPale.opacity(0.58))
                        }
                        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
                        .padding(13)
                        .xertCardStyle()
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(stage.label), \(stage.count), \(percentage.map { "\($0) percent of accounts" } ?? "no cohort yet")")
                    }
                }
                Text("Current readiness, training access, confirmed bookings and recorded attendance · as of \(overview.as_of.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption2)
                    .foregroundStyle(Color.xertPale.opacity(0.5))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                AdminEmptyState(
                    icon: "chart.bar.xaxis",
                    text: "Activation reporting is unavailable until Operations Health verifies the member activation upgrade."
                )
            }
        }
    }

    private func dashboardDataState(for source: String) -> AdminDashboardDataState {
        if admin.refreshUnavailableSources.contains(source) {
            return admin.loadedSources.contains(source) ? .stale : .unavailable
        }
        if admin.loadedSources.contains(source) { return .current }
        return admin.isLoading || admin.lastUpdatedAt == nil ? .loading : .unavailable
    }

    private var todayDesk: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                adminHeading("Today's classes")
                Spacer()
                Button {
                    openWorkspaceWithFeedback(.classDesk)
                } label: {
                    Text("OPEN DESK")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.xertOffWhite)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens today's class desk")
            }
            todayClassContent
        }
    }

    @ViewBuilder
    private var todayClassContent: some View {
        switch dashboardDataState(for: "today's classes") {
        case .loading:
            HStack(spacing: 12) {
                ProgressView().tint(Color.xertSteel)
                Text("Loading today's class desk…")
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale.opacity(0.72))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .xertCardStyle()
        case .unavailable:
            AdminEmptyState(
                icon: "wifi.exclamationmark",
                text: "Today's classes are unavailable. Retry before relying on the desk."
            )
        case .stale:
            Label("Showing the last class snapshot. Pull to refresh before changing attendance.", systemImage: "clock.badge.exclamationmark")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .padding(.horizontal, 2)
            if admin.dailyOperations.isEmpty {
                AdminEmptyState(icon: "calendar", text: "No classes were in the last available snapshot.")
            } else {
                todayClassRows
            }
        case .current:
            if admin.dailyOperations.isEmpty {
                AdminEmptyState(icon: "calendar", text: "No classes are scheduled today.")
            } else {
                todayClassRows
            }
        }
    }

    private var todayClassRows: some View {
        ForEach(admin.dailyOperations.prefix(4)) { item in
            Button {
                openOwnerRouteWithFeedback(XertOwnerRoute(task: .classSession(item.id)))
            } label: {
                HStack(spacing: 14) {
                    VStack(spacing: 2) {
                        Text(item.start_time.formatted(date: .omitted, time: .shortened))
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Color.xertOffWhite)
                        Text(item.status.uppercased())
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.xertSteel)
                    }
                    .frame(width: 72)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .font(.headline)
                            .foregroundStyle(Color.xertOffWhite)
                        Text("\(item.confirmed_count) confirmed · \(item.requested_count) requested · \(item.waitlist_count) waiting")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.6))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: item.attendance_due ? "exclamationmark.circle.fill" : "chevron.right")
                        .foregroundStyle(item.attendance_due ? Color.orange : Color.xertSteel)
                }
                .padding(14)
                .xertCardStyle()
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                "\(item.title), \(item.start_time.formatted(date: .omitted, time: .shortened)), "
                    + "\(item.confirmed_count) confirmed, \(item.requested_count) requested, "
                    + "\(item.waitlist_count) waiting\(item.attendance_due ? ", attendance due" : "")"
            )
            .accessibilityHint("Opens this class roster and roll call")
        }
    }

    private var managementDirectory: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                XertHaptics.play(.selection)
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.22)) {
                    showingAllWorkspaces.toggle()
                }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        adminHeading("Manage XERT")
                        Text(showingAllWorkspaces ? "Hide the full owner directory" : "Open all \(XertOwnerWorkspace.allCases.count - 1) management workspaces")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.6))
                    }
                    Spacer(minLength: 8)
                    Image(systemName: showingAllWorkspaces ? "chevron.up.circle.fill" : "chevron.down.circle.fill")
                        .font(.title3)
                        .foregroundStyle(Color.xertSteel)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showingAllWorkspaces ? "Hide all management workspaces" : "Show all management workspaces")

            if showingAllWorkspaces {
                ForEach(XertOwnerWorkspaceSection.allCases) { section in
                    adminHeading(section.rawValue)
                        .padding(.top, section == .operate ? 0 : 8)
                    ForEach(XertOwnerWorkspace.workspaces(in: section)) { workspace in
                        AdminDestinationRow(
                            title: workspace.title,
                            detail: compactWorkspaceDetail(workspace),
                            icon: workspace.icon,
                            onOpen: { openWorkspaceWithFeedback(workspace) }
                        )
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    @ViewBuilder
    private var pinnedDirectory: some View {
        if !pinnedWorkspaces.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                adminHeading("Pinned Workspaces")
                ForEach(pinnedWorkspaces) { workspace in
                    AdminDestinationRow(
                        title: workspace.title,
                        detail: compactWorkspaceDetail(workspace),
                        icon: workspace.icon,
                        onOpen: { openWorkspaceWithFeedback(workspace) }
                    )
                }
            }
        }
    }

    private func compactWorkspaceDetail(_ workspace: XertOwnerWorkspace) -> String {
        switch workspace {
        case .members:
            return "Search \(admin.memberCount) accounts and review member value"
        case .notices:
            return "\(admin.liveAnnouncements) live · publish to web and iOS"
        case .health:
            if !admin.hasCompletedRefresh {
                return "Checking release services"
            }
            if admin.unavailableHealthSourceCount > 0 {
                return "\(admin.unavailableHealthSourceCount) live health check\(admin.unavailableHealthSourceCount == 1 ? "" : "s") unavailable"
            }
            if !admin.hasHealthSnapshot { return "Release health response incomplete" }
            return admin.healthIssues == 0
                ? "Schema, Stripe and APNs ready"
                : "\(admin.healthIssues) release issue\(admin.healthIssues == 1 ? "" : "s")"
        default:
            return workspace.detail
        }
    }

    private func workspaceBadge(_ workspace: XertOwnerWorkspace) -> Int? {
        switch workspace {
        case .classDesk:
            return admin.requestedPlaces + admin.waitingMembers + admin.attendanceDue
        case .bookingRequests:
            return admin.requestedPlaces
        case .ptRequests:
            return admin.pendingPTRequests
        case .retention:
            return admin.followUps.count
        case .notices:
            return admin.liveAnnouncements
        case .orders:
            return admin.orders.filter(\.isRecoverable).count
        case .products:
            return pricingAttentionCount
        case .health:
            return admin.healthIssues
        default:
            return nil
        }
    }

    @ViewBuilder
    private func workspaceDestination(_ workspace: XertOwnerWorkspace, session: AuthSession) -> some View {
        switch workspace {
        case .overview:
            dashboard(session: session).navigationTitle("Overview")
        case .members:
            AdminMembersView(
                admin: admin,
                session: session,
                onOpenTask: { openOwnerRoute(XertOwnerRoute(task: $0)) }
            )
        case .classDesk:
            AdminClassesView(admin: admin, session: session)
        case .bookingRequests:
            AdminBookingRequestsView(admin: admin, session: session)
        case .timetable:
            AdminScheduleView(admin: admin, session: session)
        case .availability:
            AdminAvailabilityView(admin: admin, session: session)
        case .ptRequests:
            AdminPTRequestsView(admin: admin, session: session)
        case .retention:
            AdminRetentionView(
                admin: admin,
                session: session
            )
        case .leads:
            AdminLeadsView(admin: admin, session: session)
        case .campaigns:
            AdminCampaignAttributionView(admin: admin, session: session)
        case .siteContent:
            AdminSiteContentView(admin: admin, session: session)
        case .notices:
            AdminCommunicationsView(admin: admin, session: session)
        case .events:
            AdminEventsView(
                admin: admin,
                session: session,
                onOpenTask: { openOwnerRoute(XertOwnerRoute(task: $0)) }
            )
        case .team:
            AdminCoachesView(admin: admin, session: session)
        case .finance:
            AdminFinanceView(
                admin: admin,
                onOpenOrders: { openWorkspace(.orders) }
            )
        case .orders:
            AdminOrdersView(
                admin: admin,
                onOpenTask: { openOwnerRoute(XertOwnerRoute(task: $0)) }
            )
        case .products:
            AdminProductsView(
                admin: admin,
                session: session,
                onOpenTask: { openOwnerRoute(XertOwnerRoute(task: $0)) }
            )
        case .controls:
            AdminPlatformView(
                admin: admin,
                session: session,
                initialDraft: platformDraftSnapshot,
                isExitSaving: isSavingPlatformExit,
                onOpenPricing: { openWorkspace(.products) },
                onOpenNotices: { openWorkspace(.notices) },
                onDraftChange: { platformDraftSnapshot = $0 }
            )
        case .health:
            AdminOperationsHealthView(
                admin: admin,
                session: session,
                onOpenTask: { openOwnerRoute(XertOwnerRoute(task: $0)) },
                onOpenWorkspace: openWorkspace
            )
        case .audit:
            AdminAuditView(admin: admin)
        }
    }

    private var dashboardMetricColumns: [GridItem] {
        let count = dynamicTypeSize.isAccessibilitySize ? 1 : 2
        return Array(repeating: GridItem(.flexible(), spacing: 10), count: count)
    }
}

private struct AdminWorkspaceSwitcher: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    let current: XertOwnerWorkspace
    let recent: [XertOwnerWorkspace]
    let pinned: [XertOwnerWorkspace]
    let badges: [XertOwnerWorkspace: Int]
    let launchRunway: XertStripeLaunchRunway
    let onSelect: (XertOwnerWorkspace) -> Void
    let onOpenRoute: (XertOwnerRoute) -> Void
    let onTogglePin: (XertOwnerWorkspace) -> Void

    private var normalizedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var matchingWorkspaces: [XertOwnerWorkspace] {
        XertOwnerWorkspace.allCases.filter { $0.matches(query) }
    }

    private var attentionWorkspaces: [XertOwnerWorkspace] {
        matchingWorkspaces
            .filter { badges[$0, default: 0] > 0 }
            .sorted { badges[$0, default: 0] > badges[$1, default: 0] }
    }

    private var matchingRecent: [XertOwnerWorkspace] {
        recent.filter { $0.matches(query) }
    }

    private var matchingPinned: [XertOwnerWorkspace] {
        pinned.filter { $0.matches(query) }
    }

    private var matchingRecords: [XertOwnerRecordCommand] {
        XertOwnerCommandIndex.matches(
            query: query,
            members: admin.ownerMemberSearchResults,
            orders: admin.orders,
            products: admin.products,
            events: admin.events,
            classes: admin.dailyOperations
        )
    }

    private var launchRunwayMatches: Bool {
        let terms = normalizedQuery
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
        guard !terms.isEmpty else { return false }
        let searchIndex = [
            "stripe launch checkout payments activation",
            launchRunway.title,
            launchRunway.detail,
            launchRunway.actionTitle,
        ].joined(separator: " ").lowercased()
        return terms.allSatisfy { searchIndex.contains($0) }
    }

    private var hasNoResults: Bool {
        !normalizedQuery.isEmpty
            && matchingWorkspaces.isEmpty
            && matchingRecords.isEmpty
            && !launchRunwayMatches
            && !admin.isSearchingOwnerMembers
    }

    var body: some View {
        NavigationStack {
            List {
                if !normalizedQuery.isEmpty {
                    if launchRunwayMatches {
                        Section("Launch") { launchRunwayRow }
                    }
                    workspaceSection("Results", workspaces: matchingWorkspaces)
                    ForEach(XertOwnerRecordKind.allCases) { kind in
                        recordSection(
                            kind.rawValue,
                            records: matchingRecords.filter { $0.kind == kind }
                        )
                    }
                    if admin.isSearchingOwnerMembers {
                        HStack(spacing: 10) {
                            ProgressView().tint(Color.xertSteel)
                            Text("Searching member accounts...")
                                .font(.subheadline)
                                .foregroundStyle(Color.xertPale.opacity(0.7))
                        }
                        .listRowBackground(Color.xertInk)
                    } else if let error = admin.ownerMemberSearchError {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(Color.orange)
                            .listRowBackground(Color.xertInk)
                    }
                } else {
                    workspaceSection("Needs attention", workspaces: attentionWorkspaces)
                    workspaceSection("Pinned", workspaces: matchingPinned)
                    workspaceSection("Recent", workspaces: matchingRecent)

                    Section("All workspaces") {
                        workspaceRow(.overview)
                    }
                    ForEach(XertOwnerWorkspaceSection.allCases) { section in
                        workspaceSection(section.rawValue, workspaces: XertOwnerWorkspace.workspaces(in: section))
                    }
                }

                if hasNoResults {
                    VStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(Color.xertSteel)
                        Text("No matching command")
                            .font(.headline)
                            .foregroundStyle(Color.xertOffWhite)
                        Text("Try a tool, task or business area.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 28)
                    .listRowBackground(Color.xertInk)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.xertNavy)
            .navigationTitle("Owner commands")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Workspace, Stripe launch, class, member or record")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close workspace switcher")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task(id: normalizedQuery) {
            guard normalizedQuery.count >= 2 else {
                admin.resetOwnerMemberSearch()
                return
            }
            do {
                try await Task.sleep(nanoseconds: 300_000_000)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            await admin.searchOwnerMembers(session: session, query: normalizedQuery)
        }
        .onDisappear { admin.resetOwnerMemberSearch() }
    }

    @ViewBuilder
    private func workspaceSection(_ title: String, workspaces: [XertOwnerWorkspace]) -> some View {
        if !workspaces.isEmpty {
            Section(title) {
                ForEach(workspaces) { workspace in
                    workspaceRow(workspace)
                }
            }
        }
    }

    private func workspaceRow(_ workspace: XertOwnerWorkspace) -> some View {
        HStack(spacing: 4) {
            Button { onSelect(workspace) } label: {
                HStack(spacing: 12) {
                    Image(systemName: workspace.icon)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.xertSteel)
                        .frame(width: 28)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(workspace.title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Color.xertOffWhite)
                        Text(workspace.detail)
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                            .lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    if let badge = badges[workspace], badge > 0 {
                        Text(badge > 99 ? "99+" : "\(badge)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.xertNavy)
                            .padding(.horizontal, 7)
                            .frame(minHeight: 20)
                            .background(Color.xertSteel)
                            .clipShape(Capsule())
                    }
                    Image(systemName: workspace == current ? "checkmark" : "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(workspace == current ? Color.xertSteel : Color.xertPale.opacity(0.35))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if workspace != .overview {
                Button { onTogglePin(workspace) } label: {
                    Image(systemName: pinned.contains(workspace) ? "pin.fill" : "pin")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(pinned.contains(workspace) ? Color.xertSteel : Color.xertPale.opacity(0.45))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(pinned.contains(workspace) ? "Unpin \(workspace.title)" : "Pin \(workspace.title)")
                .accessibilityHint("Updates your owner workspace shortcuts")
            }
        }
        .padding(.vertical, 3)
        .listRowBackground(Color.xertInk)
    }

    private var launchRunwayRow: some View {
        Button { onOpenRoute(launchRunway.route) } label: {
            HStack(spacing: 12) {
                Image(systemName: "bolt.shield")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.xertSteel)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text(launchRunway.title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.xertOffWhite)
                    Text("\(launchRunway.completedSteps)/\(XertStripeLaunchRunway.totalSteps) gates · \(launchRunway.actionTitle)")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.65))
                        .lineLimit(2)
                }
                Spacer(minLength: 8)
                Image(systemName: "arrow.up.forward.square")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.xertSteel)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens the exact next Stripe launch action")
        .accessibilityIdentifier("owner.commands.stripeLaunch")
        .listRowBackground(Color.xertInk)
    }

    @ViewBuilder
    private func recordSection(_ title: String, records: [XertOwnerRecordCommand]) -> some View {
        if !records.isEmpty {
            Section(title) {
                ForEach(records) { record in
                    Button { onOpenRoute(record.route) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: record.icon)
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Color.xertSteel)
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(record.title)
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(Color.xertOffWhite)
                                Text(record.subtitle)
                                    .font(.caption)
                                    .foregroundStyle(Color.xertPale.opacity(0.65))
                                    .lineLimit(2)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "arrow.up.forward.square")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color.xertSteel)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the exact protected \(record.kind.rawValue.lowercased()) record")
                    .listRowBackground(Color.xertInk)
                }
            }
        }
    }
}

private struct AdminOwnerTaskSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let task: XertOwnerTask

    var body: some View {
        NavigationStack {
            taskDestination
        }
    }

    @ViewBuilder
    private var taskDestination: some View {
        switch task {
        case .member(let id):
            if let member = admin.members.first(where: { $0.id == id }) {
                AdminMemberDetailView(admin: admin, session: session, member: member)
                    .toolbar { closeToolbar }
            } else {
                resolutionView(recordName: "member")
            }
        case .classSession(let id):
            if let operation = admin.dailyOperations.first(where: { $0.id == id }) {
                AdminClassRosterView(admin: admin, session: session, operation: operation)
                    .toolbar { closeToolbar }
            } else {
                resolutionView(recordName: "class")
            }
        case .order(let id):
            if let order = admin.orders.first(where: { $0.id == id }) {
                AdminOrderDetailView(admin: admin, session: session, order: order)
            } else {
                resolutionView(recordName: "order")
            }
        case .product(let id):
            if let product = admin.products.first(where: { $0.id == id }) {
                AdminProductEditor(admin: admin, session: session, product: product)
            } else {
                resolutionView(recordName: "session pack")
            }
        case .event(let id):
            if let event = admin.events.first(where: { $0.id == id }) {
                AdminEventEditor(admin: admin, session: session, event: event)
                    .toolbar { closeToolbar }
            } else {
                resolutionView(recordName: "event")
            }
        }
    }

    private func resolutionView(recordName: String) -> some View {
        VStack(spacing: 16) {
            if admin.isLoading || admin.resolvingOwnerTask == task || admin.lastUpdatedAt == nil {
                ProgressView()
                    .tint(Color.xertSteel)
                Text("Opening \(task.title.lowercased())...")
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
            } else {
                Image(systemName: "questionmark.folder")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(Color.xertSteel)
                Text("\(recordName.capitalized) unavailable")
                    .xertDisplay(28)
                    .foregroundStyle(Color.xertOffWhite)
                Text("This protected link no longer matches a \(recordName) visible to your administrator account.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.xertPale.opacity(0.68))
                Button {
                    Task { await admin.refresh(session: session) }
                } label: {
                    Label("Refresh owner data", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.xertNavy)
        .navigationTitle(task.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { closeToolbar }
    }

    @ToolbarContentBuilder
    private var closeToolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Close") { dismiss() }
        }
    }
}

private struct AdminMembersView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let onOpenTask: (XertOwnerTask) -> Void
    @State private var query = ""

    var body: some View {
        List {
            if admin.isSearchingMembers {
                HStack { Spacer(); ProgressView().tint(Color.xertSteel); Spacer() }
                    .listRowBackground(Color.xertInk)
            }
            ForEach(admin.members) { member in
                Button { onOpenTask(.member(member.id)) } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.displayName).font(.headline).foregroundStyle(Color.xertOffWhite)
                                Text(member.email ?? member.phone ?? "No contact details")
                                    .font(.caption).foregroundStyle(Color.xertPale.opacity(0.58))
                            }
                            Spacer()
                            HStack(spacing: 8) {
                                Text(member.role.uppercased())
                                    .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                                Image(systemName: "chevron.right")
                                    .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                            }
                        }
                        HStack(spacing: 18) {
                            Label("\(member.credits_remaining) credits", systemImage: "ticket")
                            Label("\(member.bookings_count) bookings", systemImage: "calendar")
                            Text(member.totalSpent)
                        }
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                    }
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Members")
        .searchable(text: $query, prompt: "Name, email or phone")
        .onSubmit(of: .search) { Task { await admin.searchMembers(session: session, query: query) } }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { query = ""; Task { await admin.searchMembers(session: session, query: "") } } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
    }
}

private struct AdminMemberDetailView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let member: AdminMemberSummary
    @State private var noteCategory = "general"
    @State private var noteBody = ""
    @State private var showingGrant = false
    @State private var pendingRole: String?

    private var current: AdminMemberSummary { admin.members.first(where: { $0.id == member.id }) ?? member }
    private var scopedNotes: [AdminMemberNote] {
        admin.loadedMemberDetailID == current.id ? admin.memberNotes : []
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(current.displayName).xertDisplay(25).foregroundStyle(Color.xertOffWhite)
                    if let email = current.email, let url = URL(string: "mailto:\(email)") { Link(email, destination: url) }
                    if let phone = current.phone,
                       let encoded = phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                       let url = URL(string: "tel:\(encoded)") { Link(phone, destination: url) }
                    Text("Joined \(current.joined_at.formatted(date: .abbreviated, time: .omitted))")
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.5))
                }
                .listRowBackground(Color.xertInk)
            }
            Section("Account value") {
                LabeledContent("Available credits", value: current.credits_remaining.formatted())
                LabeledContent("Bookings", value: current.bookings_count.formatted())
                LabeledContent("Paid orders", value: current.orders_count.formatted())
                LabeledContent("Lifetime spend", value: current.totalSpent)
                Button { showingGrant = true } label: { Label("Grant class credits", systemImage: "ticket") }
                    .disabled(admin.servicingMemberID != nil)
            }
            .listRowBackground(Color.xertInk)

            memberReadinessSection

            Section("Access") {
                LabeledContent("Current role", value: current.role.capitalized)
                Button {
                    pendingRole = current.role == "admin" ? "member" : "admin"
                } label: {
                    Label(current.role == "admin" ? "Remove administrator access" : "Promote to administrator",
                          systemImage: current.role == "admin" ? "person.badge.minus" : "person.badge.key")
                }
                .foregroundStyle(current.role == "admin" ? Color.red : Color.xertSteel)
                .disabled(admin.servicingMemberID != nil)
            }
            .listRowBackground(Color.xertInk)

            Section("Add staff note") {
                Picker("Category", selection: $noteCategory) {
                    Text("General").tag("general"); Text("Coaching").tag("coaching")
                    Text("Follow-up").tag("follow_up"); Text("Billing").tag("billing")
                }
                TextField("Operational context", text: $noteBody, axis: .vertical).lineLimit(3...7)
                Button("Add note") {
                    Task {
                        if await admin.addMemberNote(session: session, memberID: current.id, category: noteCategory, body: noteBody) {
                            noteBody = ""
                        }
                    }
                }
                .disabled(admin.servicingMemberID != nil || noteBody.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
            }
            .listRowBackground(Color.xertInk)

            Section("Staff timeline") {
                if admin.loadingMemberDetailID == current.id { ProgressView().tint(Color.xertSteel) }
                if admin.loadedMemberDetailID == current.id,
                   admin.memberDetailUnavailableSources.contains("staff timeline") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Staff timeline is unavailable.")
                            .font(.subheadline.weight(.semibold))
                        Text("Pull down to retry. Existing notes have not been replaced or removed.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.58))
                    }
                } else if scopedNotes.isEmpty && admin.loadingMemberDetailID != current.id {
                    Text("No staff notes yet.")
                }
                ForEach(scopedNotes) { note in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(note.category.replacingOccurrences(of: "_", with: " ").uppercased())
                                .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                            Spacer()
                            Button {
                                Task { _ = await admin.archiveMemberNote(session: session, memberID: current.id, note: note) }
                            } label: { Image(systemName: note.archived_at == nil ? "archivebox" : "arrow.uturn.backward.circle") }
                                .buttonStyle(.plain)
                                .accessibilityLabel(note.archived_at == nil ? "Archive note" : "Restore note")
                        }
                        Text(note.body).font(.subheadline)
                        Text("\(note.author_name ?? "Former admin") · \(note.created_at.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption2).foregroundStyle(Color.xertPale.opacity(0.45))
                    }
                    .opacity(note.archived_at == nil ? 1 : 0.5)
                    .padding(.vertical, 4)
                }
            }
            .listRowBackground(Color.xertInk)
        }
        .scrollContentBackground(.hidden).background(Color.xertNavy)
        .navigationTitle("Member Record").navigationBarTitleDisplayMode(.inline)
        .task { await admin.loadMemberDetail(session: session, memberID: current.id) }
        .refreshable { await admin.loadMemberDetail(session: session, memberID: current.id) }
        .onDisappear { admin.clearMemberDetail(memberID: current.id) }
        .sheet(isPresented: $showingGrant) {
            AdminCreditGrantView(admin: admin, session: session, member: current)
        }
        .confirmationDialog(
            pendingRole == "admin" ? "Grant administrator access?" : "Remove administrator access?",
            isPresented: Binding(get: { pendingRole != nil }, set: { if !$0 { pendingRole = nil } }),
            presenting: pendingRole
        ) { role in
            Button(role == "admin" ? "Promote to administrator" : "Remove administrator", role: role == "member" ? .destructive : nil) {
                Task { _ = await admin.setMemberRole(session: session, memberID: current.id, role: role); pendingRole = nil }
            }
            Button("Cancel", role: .cancel) { pendingRole = nil }
        } message: { role in
            Text(role == "admin" ? "This person will gain full owner command-centre access." : "This person will lose all administrative access. The final administrator cannot be removed.")
        }
    }

    private var memberReadinessSection: some View {
        Section("Member readiness") {
            if admin.loadingMemberDetailID == current.id,
               admin.memberOnboardingSummary == nil {
                HStack {
                    ProgressView().tint(Color.xertSteel)
                    Text("Checking member readiness...")
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                }
            } else if let summary = admin.memberOnboardingSummary,
                      summary.user_id == current.id {
                Label {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(summary.statusLabel)
                            .font(.headline)
                            .foregroundStyle(summary.onboarding_complete ? Color.xertSteel : Color.xertOffWhite)
                        Text(summary.onboarding_complete
                             ? "The current profile, emergency contact and required acknowledgements are complete."
                             : "Readiness is advisory during rollout and does not block existing member actions.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.58))
                    }
                } icon: {
                    Image(systemName: summary.onboarding_complete ? "checkmark.seal.fill" : "person.crop.circle.badge.exclamationmark")
                        .foregroundStyle(summary.onboarding_complete ? Color.xertSteel : Color.orange)
                }

                readinessRow("Account details", complete: summary.profile_complete)
                readinessRow("Emergency contact", complete: summary.emergency_contact_complete)
                readinessRow(
                    "Required acknowledgements",
                    detail: "\(summary.accepted_required_count) of \(summary.required_document_count)",
                    complete: summary.documents_complete
                )

                if summary.emergency_contact_complete {
                    if let reveal = admin.revealedMemberEmergencyContact,
                       reveal.user_id == current.id {
                        let contact = reveal.emergency_contact
                        VStack(alignment: .leading, spacing: 8) {
                            Text(contact.name)
                                .font(.headline)
                                .foregroundStyle(Color.xertOffWhite)
                            Text(contact.relationship)
                                .font(.caption)
                                .foregroundStyle(Color.xertPale.opacity(0.62))
                            if let encoded = contact.phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                               let url = URL(string: "tel:\(encoded)") {
                                Link(contact.phone, destination: url)
                                    .font(.subheadline.weight(.semibold))
                            } else {
                                Text(contact.phone).font(.subheadline)
                            }
                            Text("Revealed \(reveal.revealed_at.formatted(date: .abbreviated, time: .shortened)). This access was recorded.")
                                .font(.caption2)
                                .foregroundStyle(Color.xertPale.opacity(0.48))
                        }
                        .padding(.vertical, 4)
                        .privacySensitive()
                        .accessibilityElement(children: .combine)
                    } else {
                        Button {
                            Task { await admin.revealMemberEmergencyContact(session: session, memberID: current.id) }
                        } label: {
                            HStack {
                                Label("Reveal emergency contact", systemImage: "cross.case")
                                Spacer()
                                if admin.revealingEmergencyContactMemberID == current.id {
                                    ProgressView().tint(Color.xertSteel)
                                }
                            }
                        }
                        .disabled(admin.revealingEmergencyContactMemberID != nil)
                        Text("Use only when needed for member safety. Every reveal is recorded with the administrator and time.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.52))
                    }
                } else {
                    Text("No emergency contact is available. Ask the member to finish Member Readiness in the XERT app.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.58))
                }
            } else if admin.loadedMemberDetailID == current.id,
                      admin.memberDetailUnavailableSources.contains("member readiness") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Member readiness is unavailable.")
                        .font(.subheadline.weight(.semibold))
                    Text("Pull down to retry before relying on this record in an emergency.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.58))
                }
            } else if admin.loadingMemberDetailID != current.id {
                Text("No member readiness record is available yet.")
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale.opacity(0.68))
            }
        }
        .listRowBackground(Color.xertInk)
    }

    private func readinessRow(_ title: String, detail: String? = nil, complete: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: complete ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(complete ? Color.xertSteel : Color.xertPale.opacity(0.42))
                .accessibilityHidden(true)
            Text(title)
            Spacer()
            if let detail {
                Text(detail)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Color.xertPale.opacity(0.58))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(complete ? "complete" : "incomplete")")
    }
}

private struct AdminCreditGrantView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let member: AdminMemberSummary
    @State private var sessions = 1
    @State private var validityDays = 28
    @State private var noExpiry = false
    @State private var reason = ""
    @State private var requestID = UUID()

    var body: some View {
        NavigationStack {
            Form {
                Section("Credit grant") {
                    Stepper("Credits: \(sessions)", value: $sessions, in: 1...100)
                    Toggle("No expiry", isOn: $noExpiry)
                    if !noExpiry { Stepper("Valid for \(validityDays) days", value: $validityDays, in: 1...3_650) }
                    TextField("Reason", text: $reason, axis: .vertical).lineLimit(3...6)
                    Text("Manual grants are permanently audited and idempotent.").font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Grant to \(member.displayName)").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Grant") {
                        let id = requestID
                        Task {
                            if await admin.grantCredits(session: session, memberID: member.id, sessions: sessions,
                                                        validityDays: noExpiry ? nil : validityDays, requestID: id, note: reason) {
                                requestID = UUID(); dismiss()
                            }
                        }
                    }
                    .disabled(admin.servicingMemberID != nil || reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
                }
            }
        }
    }
}

private struct AdminClassesView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var promotion: AdminWaitlistItem?
    @State private var skipCandidate: AdminWaitlistItem?

    private var operationsAreCurrent: Bool {
        admin.loadedSources.contains("today's classes")
            && !admin.refreshUnavailableSources.contains("today's classes")
    }
    private var waitlistIsCurrent: Bool {
        admin.loadedSources.contains("waitlists")
            && !admin.refreshUnavailableSources.contains("waitlists")
    }
    private var operationsAreLoading: Bool {
        admin.isLoading && !admin.loadedSources.contains("today's classes")
    }
    private var waitlistIsLoading: Bool {
        admin.isLoading && !admin.loadedSources.contains("waitlists")
    }
    private var waitlistDeskBusy: Bool {
        admin.promotingSessionID != nil || admin.updatingBookingID != nil
    }

    var body: some View {
        List {
            Section("Today") {
                if operationsAreLoading {
                    operationalLoadingRow("Loading today's classes…")
                } else {
                    if !operationsAreCurrent {
                        operationalWarningRow(
                            admin.dailyOperations.isEmpty
                                ? "Today's classes are unavailable. Refresh before relying on this desk."
                                : "Showing the last class snapshot. Refresh before changing attendance."
                        )
                    }
                    if admin.dailyOperations.isEmpty, operationsAreCurrent {
                        operationalEmptyRow("No classes are scheduled today.", icon: "calendar")
                    }
                    ForEach(admin.dailyOperations) { item in
                        NavigationLink {
                            AdminClassRosterView(admin: admin, session: session, operation: item)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(item.title).font(.headline)
                                Text("\(item.start_time.formatted(date: .omitted, time: .shortened)) · \(item.activeCount) active · \(item.waitlist_count) waiting")
                                    .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                                if item.attendance_due {
                                    Label("Roll call is due", systemImage: "checklist")
                                        .font(.caption.weight(.bold)).foregroundStyle(.orange)
                                }
                            }
                            .foregroundStyle(Color.xertOffWhite)
                        }
                        .listRowBackground(Color.xertInk)
                    }
                }
            }
            Section("Waitlist desk") {
                if let warning = admin.promotionNoticeWarning {
                    operationalWarningRow(warning)
                }
                if waitlistIsLoading {
                    operationalLoadingRow("Loading class waitlists…")
                } else {
                    if !waitlistIsCurrent {
                        operationalWarningRow(
                            admin.waitlist.isEmpty
                                ? "Waitlists are unavailable. Refresh before assuming every queue is clear."
                                : "Showing the last waitlist snapshot. Refresh before promoting a member."
                        )
                    }
                    if admin.waitlist.isEmpty, waitlistIsCurrent {
                        operationalEmptyRow("No members are waiting for a class place.", icon: "person.2.badge.checkmark")
                    }
                    ForEach(admin.waitlist) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(item.title).font(.headline)
                            Text("Next: \(item.nextMemberName) · \(item.next_available_credits) credits")
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                            if item.can_promote && item.next_available_credits < 1 {
                                Text("Next member needs a credit")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Color.orange)
                            }
                            Button {
                                promotion = item
                            } label: {
                                Label("Promote next member", systemImage: "person.fill.badge.plus")
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Color.xertSteel)
                            .disabled(
                                !waitlistIsCurrent || !item.can_promote
                                    || item.next_available_credits < 1 || waitlistDeskBusy
                            )
                            if item.can_promote && item.next_available_credits < 1 {
                                Button(role: .destructive) {
                                    skipCandidate = item
                                } label: {
                                    Label("Skip — no credits", systemImage: "person.crop.circle.badge.minus")
                                }
                                .disabled(!waitlistIsCurrent || waitlistDeskBusy)
                            }
                        }
                        .foregroundStyle(Color.xertOffWhite)
                        .listRowBackground(Color.xertInk)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Class Desk")
        .refreshable { await admin.refresh(session: session) }
        .confirmationDialog(
            "Promote \(promotion?.nextMemberName ?? "next member")?",
            isPresented: Binding(
                get: { promotion != nil },
                set: { if !$0 { promotion = nil } }
            ),
            presenting: promotion
        ) { item in
            Button("Confirm promotion") {
                Task {
                    _ = await admin.promoteNext(
                        session: session,
                        classSessionID: item.session_id,
                        expectedBookingID: item.next_booking_id,
                        requestID: UUID()
                    )
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: { item in
            Text("This confirms the next FIFO waitlisted member into \(item.title), reserves one available credit, and creates a private member notice. Apple push is requested for enabled devices.")
        }
        .confirmationDialog(
            "Remove \(skipCandidate?.nextMemberName ?? "this member") from the waitlist?",
            isPresented: Binding(
                get: { skipCandidate != nil },
                set: { if !$0 { skipCandidate = nil } }
            ),
            presenting: skipCandidate
        ) { item in
            Button("Skip — no credits", role: .destructive) {
                Task {
                    _ = await admin.skipWaitlistHead(
                        session: session,
                        classSessionID: item.session_id,
                        expectedBookingID: item.next_booking_id,
                        requestID: UUID()
                    )
                    skipCandidate = nil
                }
            }
            Button("Cancel", role: .cancel) { skipCandidate = nil }
        } message: { item in
            Text("\(item.nextMemberName) is first for \(item.title) but has no available credit. Waitlisted members do not hold a credit, so removing them charges or refunds nothing. The next credited member can then be promoted.")
        }
    }

    private func operationalLoadingRow(_ message: String) -> some View {
        HStack(spacing: 10) {
            ProgressView().tint(Color.xertSteel)
            Text(message).foregroundStyle(Color.xertPale.opacity(0.72))
        }
        .listRowBackground(Color.xertInk)
        .accessibilityElement(children: .combine)
    }

    private func operationalWarningRow(_ message: String) -> some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.orange)
            .fixedSize(horizontal: false, vertical: true)
            .listRowBackground(Color.xertInk)
    }

    private func operationalEmptyRow(_ message: String, icon: String) -> some View {
        Label(message, systemImage: icon)
            .foregroundStyle(Color.xertPale.opacity(0.68))
            .listRowBackground(Color.xertInk)
    }
}

private struct AdminClassRosterView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let operation: AdminDailyOperation
    @State private var attendance = AdminAttendanceDraft()
    @State private var confirmingRollCall = false

    private var scopedRoster: [AdminRosterMember] {
        admin.loadedRosterSessionID == operation.id ? admin.classRoster : []
    }
    private var eligible: [AdminRosterMember] { scopedRoster.filter(\.attendanceEligible) }
    private var attendanceSummary: AdminAttendanceSummary { attendance.summary }
    private var canRecordAttendance: Bool {
        attendanceSummary.isComplete && operation.start_time <= Date()
            && admin.recordingAttendanceSessionID == nil
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(operation.start_time.formatted(date: .abbreviated, time: .shortened)).font(.headline)
                    Text([operation.coach_name, operation.location_zone].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    Text("\(operation.confirmed_count) confirmed · \(operation.requested_count) requested · \(operation.waitlist_count) waiting")
                        .font(.caption).foregroundStyle(Color.xertSteel)
                }
                .listRowBackground(Color.xertInk)
            }

            if operation.start_time <= Date(), !eligible.isEmpty {
                Section("Roll call") {
                    VStack(alignment: .leading, spacing: 12) {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 14) { attendanceProgressLabels }
                            VStack(alignment: .leading, spacing: 6) { attendanceProgressLabels }
                        }

                        ProgressView(
                            value: Double(attendanceSummary.marked),
                            total: Double(max(attendanceSummary.total, 1))
                        )
                        .tint(attendanceSummary.isComplete ? Color.green : Color.xertSteel)

                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 10) { attendanceBulkActions }
                            VStack(spacing: 10) { attendanceBulkActions }
                        }

                        if attendanceSummary.unmarked > 0 {
                            Label(
                                "Mark every member present or no show before saving.",
                                systemImage: "exclamationmark.circle"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.orange)
                        }
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(Color.xertInk)
                }
            }

            Section("Member roster") {
                if admin.loadingRosterSessionID == operation.id {
                    HStack { Spacer(); ProgressView().tint(Color.xertSteel); Spacer() }
                } else if scopedRoster.isEmpty {
                    Text("No member bookings for this class.")
                }
                ForEach(scopedRoster) { member in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.displayName).font(.headline)
                                Text(member.status.replacingOccurrences(of: "_", with: " ").uppercased())
                                    .font(.caption2.weight(.bold)).foregroundStyle(statusColour(member.status))
                            }
                            Spacer()
                            if !member.attendanceEligible || operation.start_time > Date(),
                               let actions = bookingActions(member.status), !actions.isEmpty {
                                Menu {
                                    ForEach(actions) { action in
                                        Button(role: action.role) {
                                            Task {
                                                _ = await admin.setBookingStatus(
                                                    session: session,
                                                    classSessionID: operation.id,
                                                    bookingID: member.id,
                                                    status: action.status
                                                )
                                            }
                                        } label: { Label(action.label, systemImage: action.icon) }
                                    }
                                } label: {
                                    Image(systemName: "ellipsis.circle").font(.title3)
                                }
                                .disabled(admin.updatingBookingID != nil)
                                .accessibilityLabel("Manage \(member.displayName) booking")
                            }
                        }
                        if member.attendanceEligible && operation.start_time <= Date() {
                            attendanceControl(for: member)
                        }
                        HStack(spacing: 14) {
                            if let email = contact(member.email), let url = URL(string: "mailto:\(email)") {
                                Link(destination: url) { Label("Email", systemImage: "envelope") }
                            }
                            if let phone = contact(member.phone),
                               let encoded = phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                               let url = URL(string: "tel:\(encoded)") {
                                Link(destination: url) { Label("Call", systemImage: "phone") }
                            }
                        }
                        .font(.caption.weight(.semibold)).foregroundStyle(Color.xertSteel)
                    }
                    .padding(.vertical, 5)
                    .listRowBackground(Color.xertInk)
                }
            }

            if operation.start_time <= Date() {
                Section {
                    Button { confirmingRollCall = true } label: {
                        HStack {
                            Spacer()
                            if admin.recordingAttendanceSessionID == operation.id { ProgressView().tint(Color.xertNavy) }
                            Label(
                                attendanceSummary.isComplete
                                    ? "Save complete roll call"
                                    : "\(attendanceSummary.marked) of \(attendanceSummary.total) marked",
                                systemImage: "checklist"
                            )
                                .fontWeight(.bold)
                            Spacer()
                        }
                    }
                    .disabled(!canRecordAttendance)
                    .listRowBackground(Color.xertSteel)
                    .foregroundStyle(Color.xertNavy)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(operation.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await admin.loadClassRoster(session: session, classSessionID: operation.id)
            attendance = AdminAttendanceDraft(roster: scopedRoster)
        }
        .onChange(of: admin.classRoster) { _ in
            attendance.reconcile(roster: scopedRoster)
        }
        .onChange(of: admin.loadedRosterSessionID) { _ in
            attendance.reconcile(roster: scopedRoster)
        }
        .confirmationDialog("Complete this class?", isPresented: $confirmingRollCall, titleVisibility: .visible) {
            Button("Record attendance and complete class") {
                let attended = attendance.attendedIDs
                let noShows = attendance.noShowIDs
                Task {
                    _ = await admin.recordAttendance(
                        session: session,
                        classSessionID: operation.id,
                        attendedIDs: attended,
                        noShowIDs: noShows
                    )
                }
            }
            Button("Review roll call", role: .cancel) {}
        } message: {
            Text("Record \(attendanceSummary.attended) present and \(attendanceSummary.noShow) no show, complete the class, and remove it from the public timetable.")
        }
    }

    @ViewBuilder
    private var attendanceProgressLabels: some View {
        Label("\(attendanceSummary.marked)/\(attendanceSummary.total) marked", systemImage: "checklist")
        Label("\(attendanceSummary.attended) present", systemImage: "checkmark.circle.fill")
            .foregroundStyle(Color.green)
        Label("\(attendanceSummary.noShow) no show", systemImage: "xmark.circle.fill")
            .foregroundStyle(Color.orange)
    }

    @ViewBuilder
    private var attendanceBulkActions: some View {
        Button {
            attendance.markAllPresent()
            XertHaptics.play(.selection)
        } label: {
            Label("Mark all present", systemImage: "checkmark.circle")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.xertSteel)
        .foregroundStyle(Color.xertNavy)
        .disabled(attendanceSummary.total == 0 || attendanceSummary.attended == attendanceSummary.total)

        Button {
            attendance.clear()
            XertHaptics.play(.selection)
        } label: {
            Label("Clear marks", systemImage: "arrow.counterclockwise")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(Color.xertSteel)
        .disabled(attendanceSummary.marked == 0)
    }

    private func attendanceControl(for member: AdminRosterMember) -> some View {
        HStack(spacing: 0) {
            attendanceButton(
                title: "Present",
                icon: "checkmark",
                mark: .attended,
                member: member,
                colour: .green
            )
            attendanceButton(
                title: "No show",
                icon: "xmark",
                mark: .noShow,
                member: member,
                colour: .orange
            )
        }
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.34), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Attendance for \(member.displayName)")
    }

    private func attendanceButton(
        title: String,
        icon: String,
        mark: AdminAttendanceMark,
        member: AdminRosterMember,
        colour: Color
    ) -> some View {
        let isSelected = attendance.mark(for: member.id) == mark
        return Button {
            attendance.set(mark, for: member.id)
            XertHaptics.play(.selection)
        } label: {
            Label(title, systemImage: icon)
                .font(.caption.weight(.bold))
                .foregroundStyle(isSelected ? Color.xertNavy : Color.xertPale)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(isSelected ? colour : Color.xertDeep.opacity(0.45))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(member.displayName), \(title)")
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private struct BookingAction: Identifiable {
        var id: String { status }
        let status: String
        let label: String
        let icon: String
        let role: ButtonRole?
    }

    private func bookingActions(_ status: String) -> [BookingAction]? {
        switch status {
        case "requested":
            return [BookingAction(status: "confirmed", label: "Confirm place", icon: "checkmark.circle", role: nil),
                    BookingAction(status: "waitlisted", label: "Move to waitlist", icon: "person.2.badge.clock", role: nil),
                    BookingAction(status: "declined", label: "Decline request", icon: "xmark.circle", role: .destructive)]
        case "confirmed":
            return [BookingAction(status: "cancelled", label: "Cancel booking", icon: "calendar.badge.minus", role: .destructive)]
        case "waitlisted":
            return [BookingAction(status: "cancelled", label: "Remove from waitlist", icon: "person.crop.circle.badge.minus", role: .destructive)]
        default:
            return nil
        }
    }

    private func statusColour(_ status: String) -> Color {
        switch status {
        case "confirmed", "attended": return .green
        case "requested", "waitlisted": return .orange
        case "declined", "cancelled", "no_show": return .red
        default: return Color.xertSteel
        }
    }

    private func contact(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct AdminScheduleView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    @State private var showingCreate = false
    @State private var pendingCancellation: AdminClassSession?

    private var rows: [AdminClassSession] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return admin.classSessions }
        return admin.classSessions.filter {
            "\($0.title) \($0.class_type ?? "") \($0.coach_name ?? "") \($0.location_zone ?? "")".lowercased().contains(term)
        }
    }

    private func classSummary(_ item: AdminClassSession) -> String {
        let time = item.start_time?.formatted(date: .omitted, time: .shortened) ?? "Time TBC"
        let capacity = item.capacity ?? 0
        return "\(time) · \(capacity) places"
    }

    private func classDay(_ item: AdminClassSession) -> String {
        item.start_time?.formatted(.dateTime.day()) ?? "--"
    }

    private func classMonth(_ item: AdminClassSession) -> String {
        item.start_time?.formatted(.dateTime.month(.abbreviated)) ?? "TBC"
    }

    var body: some View {
        List {
            if rows.isEmpty { Text("No matching classes.").listRowBackground(Color.xertInk) }
            ForEach(rows) { item in
                classRow(item)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Full Timetable")
        .searchable(text: $query, prompt: "Search timetable")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Create class")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack { AdminClassEditor(admin: admin, session: session, classSession: nil) }
        }
        .confirmationDialog(
            "Cancel this class?",
            isPresented: Binding(get: { pendingCancellation != nil }, set: { if !$0 { pendingCancellation = nil } }),
            presenting: pendingCancellation
        ) { item in
            Button("Cancel \(item.title)", role: .destructive) {
                Task {
                    _ = await admin.cancelClass(session: session, classSession: item)
                    pendingCancellation = nil
                }
            }
            Button("Keep class", role: .cancel) { pendingCancellation = nil }
        } message: { _ in
            Text("Every active booking is cancelled, reserved credits are returned, and affected members receive a cancellation notice.")
        }
    }

    private func classRow(_ item: AdminClassSession) -> some View {
        HStack(alignment: .top, spacing: 12) {
            classDateBadge(item)
            classInformation(item)
        }
        .padding(.vertical, 6)
        .listRowBackground(Color.xertInk)
    }

    private func classDateBadge(_ item: AdminClassSession) -> some View {
        VStack(spacing: 2) {
            Text(classDay(item)).font(.title3.weight(.bold))
            Text(classMonth(item)).font(.caption2.weight(.bold))
        }
        .frame(width: 42)
        .foregroundStyle(Color.xertSteel)
    }

    private func classInformation(_ item: AdminClassSession) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            NavigationLink {
                AdminClassEditor(admin: admin, session: session, classSession: item)
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).font(.headline)
                    Text(classSummary(item))
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.6))
                }
            }
            classStatusActions(item)
        }
        .foregroundStyle(Color.xertOffWhite)
    }

    private func classStatusActions(_ item: AdminClassSession) -> some View {
        HStack {
            Text(item.status.uppercased()).foregroundStyle(classStatusColour(item.status))
            if item.public_visible == true { Text("PUBLIC").foregroundStyle(.green) }
            Spacer()
            Menu {
                Button {
                    Task { _ = await admin.duplicateClass(session: session, classSession: item) }
                } label: {
                    Label("Duplicate as draft", systemImage: "plus.square.on.square")
                }
                if !["cancelled", "completed"].contains(item.status) {
                    Button(role: .destructive) { pendingCancellation = item } label: {
                        Label("Cancel class", systemImage: "calendar.badge.minus")
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .disabled(admin.savingClassID != nil || admin.cancellingClassID != nil)
            .accessibilityLabel("Manage \(item.title)")
        }
        .font(.caption2.weight(.bold))
    }

    private func classStatusColour(_ status: String) -> Color {
        switch status {
        case "published": return .green
        case "full": return .orange
        case "cancelled": return .red
        default: return Color.xertSteel
        }
    }
}

private struct AdminClassEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let classSession: AdminClassSession?
    private let baseline: AdminClassDraft
    @State private var draft: AdminClassDraft

    private var isTerminal: Bool { classSession.map { ["cancelled", "completed"].contains($0.status) } ?? false }

    init(admin: AdminStore, session: AuthSession, classSession: AdminClassSession?) {
        let initial = AdminClassDraft(classSession: classSession)
        self.admin = admin
        self.session = session
        self.classSession = classSession
        baseline = initial
        _draft = State(initialValue: initial)
    }

    var body: some View {
        Form {
            if isTerminal {
                Section {
                    Label("This class is \(classSession?.status ?? "closed") and cannot be reopened. Duplicate it to create a new draft.", systemImage: "lock")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
            Section("Class") {
                Picker("Type", selection: $draft.classType) {
                    ForEach(AdminClassDraft.classTypes, id: \.self) { Text($0).tag($0) }
                }
                TextField("Title", text: $draft.title)
                TextField("Description", text: $draft.description, axis: .vertical).lineLimit(2...6)
                Picker("Status", selection: $draft.status) {
                    Text("Draft").tag("draft")
                    Text("Published").tag("published")
                    Text("Full").tag("full")
                }
            }
            Section("Date and capacity") {
                DatePicker("Starts", selection: $draft.startTime)
                Toggle("Set an end time", isOn: $draft.hasEndTime)
                if draft.hasEndTime {
                    DatePicker("Ends", selection: $draft.endTime, in: draft.startTime...)
                }
                Stepper("Duration: \(draft.durationMinutes) min", value: $draft.durationMinutes, in: 15...240, step: 5)
                Stepper("Capacity: \(draft.capacity)", value: $draft.capacity, in: 1...100)
            }
            Section("Delivery") {
                TextField("Coach", text: $draft.coachName)
                TextField("Location or zone", text: $draft.location)
                Picker("Intensity", selection: $draft.intensity) {
                    ForEach(AdminClassDraft.intensities, id: \.self) { Text($0).tag($0) }
                }
                Picker("Booking mode", selection: $draft.bookingMode) {
                    Text("Interest only").tag("interest_only")
                    Text("Request to book").tag("request_to_book")
                    Text("Instant book").tag("instant_book")
                }
                Toggle("Beginner friendly", isOn: $draft.beginnerFriendly)
                Toggle("Visible on public timetable", isOn: $draft.publicVisible)
                    .disabled(draft.status != "published")
            }
            Section("Internal notes") {
                TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(2...6)
            }
            if !isTerminal {
                Section {
                    Button {
                        Task {
                            if await admin.saveClass(session: session, classSession: classSession, draft: draft) {
                                XertHaptics.play(.success)
                                dismiss()
                            } else {
                                XertHaptics.play(.error)
                            }
                        }
                    } label: {
                        HStack {
                            Spacer()
                            if admin.savingClassID != nil { ProgressView().tint(Color.xertNavy) }
                            Text(classSession == nil ? "Create class" : "Save class").fontWeight(.bold)
                            Spacer()
                        }
                    }
                    .disabled(admin.savingClassID != nil || draft == baseline)
                    .listRowBackground(Color.xertSteel)
                    .foregroundStyle(Color.xertNavy)
                }
            }
        }
        .disabled(isTerminal)
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(classSession == nil ? "New Class" : "Edit Class")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if classSession == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .onChange(of: draft.status) { status in
            if status != "published" { draft.publicVisible = false }
        }
    }
}

private enum AdminScheduleRemoval: Identifiable {
    case availability(AdminAvailabilityBlock)
    case blackout(AdminBlackoutPeriod)
    var id: UUID {
        switch self { case .availability(let item): return item.id; case .blackout(let item): return item.id }
    }
}

private struct AdminAvailabilityView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var mode = "availability"
    @State private var showingCreate = false
    @State private var pendingRemoval: AdminScheduleRemoval?

    var body: some View {
        List {
            Section {
                Picker("Schedule controls", selection: $mode) {
                    Text("Availability").tag("availability")
                    Text("Blackouts").tag("blackouts")
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.xertNavy)

            if mode == "availability" {
                if admin.availabilityBlocks.isEmpty { Text("No availability blocks set.").listRowBackground(Color.xertInk) }
                ForEach(admin.availabilityBlocks) { block in
                    scheduleRow(
                        title: block.type,
                        detail: scheduleRange(block.start_time, block.end_time),
                        note: [block.coach_name, block.notes].compactMap { $0 }.joined(separator: " · "),
                        accent: block.is_bookable ? .green : Color.xertSteel,
                        badge: block.is_bookable ? "BOOKABLE" : "PLANNING"
                    ) {
                        AdminAvailabilityEditor(admin: admin, session: session, block: block)
                    } remove: { pendingRemoval = .availability(block) }
                }
            } else {
                if admin.blackoutPeriods.isEmpty { Text("No blackout periods set.").listRowBackground(Color.xertInk) }
                ForEach(admin.blackoutPeriods) { period in
                    scheduleRow(
                        title: period.reason.capitalized,
                        detail: scheduleRange(period.start_time, period.end_time),
                        note: "Affects \(period.affects.replacingOccurrences(of: "_", with: " "))" + (period.notes.map { " · \($0)" } ?? ""),
                        accent: .red,
                        badge: "CLOSED"
                    ) {
                        AdminBlackoutEditor(admin: admin, session: session, period: period)
                    } remove: { pendingRemoval = .blackout(period) }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Schedule Controls")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel(mode == "availability" ? "Add availability" : "Add blackout")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                if mode == "availability" {
                    AdminAvailabilityEditor(admin: admin, session: session, block: nil)
                } else {
                    AdminBlackoutEditor(admin: admin, session: session, period: nil)
                }
            }
        }
        .confirmationDialog(
            "Remove schedule control?",
            isPresented: Binding(get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } }),
            presenting: pendingRemoval
        ) { removal in
            Button("Remove", role: .destructive) {
                Task {
                    switch removal {
                    case .availability(let block): _ = await admin.deleteAvailability(session: session, block: block)
                    case .blackout(let period): _ = await admin.deleteBlackout(session: session, period: period)
                    }
                    pendingRemoval = nil
                }
            }
            Button("Keep", role: .cancel) { pendingRemoval = nil }
        } message: { removal in
            switch removal {
            case .availability: Text("This time will no longer appear available for planning.")
            case .blackout: Text("Classes and staff planning may immediately become available during this period.")
            }
        }
    }

    private func scheduleRange(_ start: Date, _ end: Date) -> String {
        "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))"
    }

    private func scheduleRow<Destination: View>(
        title: String, detail: String, note: String, accent: Color, badge: String,
        @ViewBuilder destination: () -> Destination, remove: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink(destination: destination()) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack { Text(title).font(.headline); Spacer(); Text(badge).font(.caption2.weight(.bold)).foregroundStyle(accent) }
                    Text(detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.65))
                    if !note.isEmpty { Text(note).font(.caption2).foregroundStyle(Color.xertPale.opacity(0.45)) }
                }
            }
            HStack { Spacer(); Button(role: .destructive, action: remove) { Image(systemName: "trash") }.buttonStyle(.plain) }
        }
        .foregroundStyle(Color.xertOffWhite)
        .padding(.vertical, 5)
        .listRowBackground(Color.xertInk)
    }
}

private struct AdminAvailabilityEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let block: AdminAvailabilityBlock?
    private let baseline: AdminAvailabilityDraft
    @State private var draft: AdminAvailabilityDraft

    init(admin: AdminStore, session: AuthSession, block: AdminAvailabilityBlock?) {
        let initial = AdminAvailabilityDraft(block: block)
        self.admin = admin; self.session = session; self.block = block; baseline = initial
        _draft = State(initialValue: initial)
    }

    var body: some View {
        Form {
            Section("Availability") {
                Picker("Type", selection: $draft.type) { ForEach(AdminAvailabilityDraft.types, id: \.self) { Text($0.capitalized).tag($0) } }
                DatePicker("Starts", selection: $draft.startTime)
                DatePicker("Ends", selection: $draft.endTime, in: draft.startTime...)
                TextField("Coach (optional)", text: $draft.coachName)
                Toggle("Bookable", isOn: $draft.isBookable)
                TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(2...5)
            }
            saveButton(label: block == nil ? "Create availability" : "Save availability") {
                await admin.saveAvailability(session: session, block: block, draft: draft)
            }
        }
        .scrollContentBackground(.hidden).background(Color.xertNavy)
        .navigationTitle(block == nil ? "New Availability" : "Edit Availability").navigationBarTitleDisplayMode(.inline)
        .toolbar { if block == nil { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } } }
    }

    @ViewBuilder private func saveButton(label: String, action: @escaping () async -> Bool) -> some View {
        Section { Button { Task { if await action() { dismiss() } } } label: { HStack { Spacer(); Text(label).fontWeight(.bold); Spacer() } }
            .disabled(admin.savingScheduleWindowID != nil || draft == baseline).listRowBackground(Color.xertSteel).foregroundStyle(Color.xertNavy) }
    }
}

private struct AdminBlackoutEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let period: AdminBlackoutPeriod?
    private let baseline: AdminBlackoutDraft
    @State private var draft: AdminBlackoutDraft

    init(admin: AdminStore, session: AuthSession, period: AdminBlackoutPeriod?) {
        let initial = AdminBlackoutDraft(period: period)
        self.admin = admin; self.session = session; self.period = period; baseline = initial
        _draft = State(initialValue: initial)
    }

    var body: some View {
        Form {
            Section("Blackout") {
                Picker("Reason", selection: $draft.reason) { ForEach(AdminBlackoutDraft.reasons, id: \.self) { Text($0.capitalized).tag($0) } }
                Picker("Affects", selection: $draft.affects) { ForEach(AdminBlackoutDraft.scopes, id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) } }
                DatePicker("Starts", selection: $draft.startTime)
                DatePicker("Ends", selection: $draft.endTime, in: draft.startTime...)
                TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(2...5)
            }
            Section { Button { Task { if await admin.saveBlackout(session: session, period: period, draft: draft) { dismiss() } } } label: {
                HStack { Spacer(); Text(period == nil ? "Create blackout" : "Save blackout").fontWeight(.bold); Spacer() }
            }.disabled(admin.savingScheduleWindowID != nil || draft == baseline).listRowBackground(Color.xertSteel).foregroundStyle(Color.xertNavy) }
        }
        .scrollContentBackground(.hidden).background(Color.xertNavy)
        .navigationTitle(period == nil ? "New Blackout" : "Edit Blackout").navigationBarTitleDisplayMode(.inline)
        .toolbar { if period == nil { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } } }
    }
}

private struct AdminRetentionView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var selected: AdminFollowUp?
    @State private var selectedActivation: AdminMemberActivationItem?
    @State private var presentedMember: AdminMemberSummary?
    @State private var openingMemberID: UUID?

    var body: some View {
        List {
            Section("Activation actions") {
                if admin.refreshUnavailableSources.contains("activation actions") {
                    Label("Showing the last activation snapshot. Outreach is disabled until you pull down to refresh.", systemImage: "wifi.exclamationmark")
                        .foregroundStyle(Color.orange)
                        .listRowBackground(Color.xertInk)
                } else if admin.activationQueue.isEmpty {
                    Text("No activation follow-ups are due.")
                        .listRowBackground(Color.xertInk)
                }
                ForEach(admin.activationQueue) { member in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.displayName).font(.headline)
                                Text(member.reasonLabel).font(.caption).foregroundStyle(Color.xertSteel)
                            }
                            Spacer()
                            Text("\(member.credits_remaining) credits")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Color.xertPale.opacity(0.6))
                        }
                        ViewThatFits(in: .horizontal) {
                            HStack {
                                activationActions(
                                    for: member,
                                    expands: false,
                                    allowsOutreach: !admin.refreshUnavailableSources.contains("activation actions")
                                )
                            }
                            VStack(spacing: 8) {
                                activationActions(
                                    for: member,
                                    expands: true,
                                    allowsOutreach: !admin.refreshUnavailableSources.contains("activation actions")
                                )
                            }
                        }
                        .font(.caption.weight(.bold))
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .padding(.vertical, 6)
                    .listRowBackground(Color.xertInk)
                }
            }

            Section("Retention actions") {
            if admin.followUps.isEmpty {
                Text("The retention queue is caught up.")
                    .listRowBackground(Color.xertInk)
            }
            ForEach(admin.followUps) { member in
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(member.displayName).font(.headline)
                            Text(member.reasonLabel).font(.caption).foregroundStyle(Color.xertSteel)
                        }
                        Spacer()
                        Text("P\(member.priority)").font(.caption2.weight(.bold)).foregroundStyle(.orange)
                    }
                    Text("\(member.credits_remaining) credits · \(member.bookings_count) bookings")
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            retentionActions(for: member, expands: false)
                        }
                        VStack(spacing: 8) {
                            retentionActions(for: member, expands: true)
                        }
                    }
                    .font(.caption.weight(.bold))
                }
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 6)
                .listRowBackground(Color.xertInk)
            }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Retention")
        .sheet(item: $presentedMember) { member in
            NavigationStack {
                AdminMemberDetailView(admin: admin, session: session, member: member)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { presentedMember = nil }
                        }
                    }
            }
        }
        .confirmationDialog(
            "Log follow-up",
            isPresented: Binding(
                get: { selected != nil },
                set: { if !$0 { selected = nil } }
            ),
            presenting: selected
        ) { member in
            ForEach(["phone", "email", "SMS", "in person"], id: \.self) { channel in
                Button(channel.capitalized) {
                    Task { _ = await admin.logFollowUp(session: session, member: member, channel: channel) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Log activation follow-up",
            isPresented: Binding(
                get: { selectedActivation != nil },
                set: { if !$0 { selectedActivation = nil } }
            ),
            presenting: selectedActivation
        ) { member in
            ForEach(["phone", "email", "SMS", "in person"], id: \.self) { channel in
                Button(channel.capitalized) {
                    Task { _ = await admin.logActivationFollowUp(session: session, member: member, channel: channel) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    @ViewBuilder
    private func retentionActions(for member: AdminFollowUp, expands: Bool) -> some View {
        Button { openMemberRecord(member.id) } label: {
            Label(openingMemberID == member.id ? "Opening..." : "Member record", systemImage: "person.text.rectangle")
                .frame(maxWidth: expands ? .infinity : nil)
        }
        .buttonStyle(.bordered)
        .disabled(openingMemberID != nil)
        if let phone = member.phone,
           let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
            Link(destination: url) {
                Label("Call", systemImage: "phone")
                    .frame(maxWidth: expands ? .infinity : nil)
            }
            .buttonStyle(.bordered)
        }
        if let email = member.email, let url = URL(string: "mailto:\(email)") {
            Link(destination: url) {
                Label("Email", systemImage: "envelope")
                    .frame(maxWidth: expands ? .infinity : nil)
            }
            .buttonStyle(.bordered)
        }
        Button { selected = member } label: {
            Label("Log follow-up", systemImage: "checkmark.circle")
                .frame(maxWidth: expands ? .infinity : nil)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.xertSteel)
        .disabled(admin.loggingFollowUpMemberID != nil)
    }

    @ViewBuilder
    private func activationActions(
        for member: AdminMemberActivationItem,
        expands: Bool,
        allowsOutreach: Bool
    ) -> some View {
        Button { openMemberRecord(member.id) } label: {
            Label(openingMemberID == member.id ? "Opening..." : "Member record", systemImage: "person.text.rectangle")
                .frame(maxWidth: expands ? .infinity : nil, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(openingMemberID != nil)
        if let phone = member.phone,
           let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
            Link(destination: url) {
                Label("Call", systemImage: "phone")
                    .frame(maxWidth: expands ? .infinity : nil, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(!allowsOutreach)
            .accessibilityHint(allowsOutreach ? "Calls this member" : "Refresh activation actions before contacting this member")
        }
        if let email = member.email,
           let encoded = email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let url = URL(string: "mailto:\(encoded)") {
            Link(destination: url) {
                Label("Email", systemImage: "envelope")
                    .frame(maxWidth: expands ? .infinity : nil, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(!allowsOutreach)
            .accessibilityHint(allowsOutreach ? "Emails this member" : "Refresh activation actions before contacting this member")
        }
        Button { selectedActivation = member } label: {
            Label("Log follow-up", systemImage: "checkmark.circle")
                .frame(maxWidth: expands ? .infinity : nil, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.xertSteel)
        .disabled(admin.loggingFollowUpMemberID != nil || !allowsOutreach)
        .accessibilityHint(allowsOutreach ? "Records completed outreach" : "Refresh activation actions before logging outreach")
    }

    private func openMemberRecord(_ memberID: UUID) {
        guard openingMemberID == nil else { return }
        if let member = admin.members.first(where: { $0.id == memberID }) {
            presentedMember = member
            return
        }
        openingMemberID = memberID
        Task {
            await admin.resolveOwnerTask(session: session, task: .member(memberID))
            if let member = admin.members.first(where: { $0.id == memberID }) {
                presentedMember = member
            }
            openingMemberID = nil
        }
    }
}

private struct AdminFinanceView: View {
    @ObservedObject var admin: AdminStore
    let onOpenOrders: () -> Void

    private var pendingOrders: Int {
        admin.orders.filter { $0.status == "pending" }.count
    }

    private var refundedOrders: Int {
        admin.orders.filter { $0.status == "refunded" }.count
    }

    private var recoverableOrders: Int {
        admin.orders.filter(\.isRecoverable).count
    }

    var body: some View {
        List {
            Section("Revenue") {
                FinanceSummaryRow(label: "This month", cents: admin.monthRevenueCents)
                FinanceSummaryRow(label: "All paid orders", cents: admin.totalRevenueCents)
            }
            Section("Sales performance") {
                financeCount("Paid orders", value: admin.paidOrders.count, icon: "checkmark.circle")
                financeCount("Pending checkouts", value: pendingOrders, icon: "clock")
                financeCount("Refunded orders", value: refundedOrders, icon: "arrow.uturn.backward.circle")
            }
            Section("Order operations") {
                Button(action: onOpenOrders) {
                    HStack(spacing: 12) {
                        Image(systemName: recoverableOrders > 0 ? "exclamationmark.arrow.circlepath" : "creditcard")
                            .foregroundStyle(recoverableOrders > 0 ? Color.orange : Color.xertSteel)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Open orders")
                                .font(.headline)
                                .foregroundStyle(Color.xertOffWhite)
                            Text(recoverableOrders > 0
                                 ? "\(recoverableOrders) payment\(recoverableOrders == 1 ? "" : "s") need recovery"
                                 : "Search sales, reconcile payments and manage refunds")
                                .font(.caption)
                                .foregroundStyle(Color.xertPale.opacity(0.65))
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.xertSteel)
                    }
                }
                .buttonStyle(.plain)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Finance")
    }

    private func financeCount(_ label: String, value: Int, icon: String) -> some View {
        HStack {
            Label(label, systemImage: icon)
            Spacer()
            Text(value.formatted()).fontWeight(.bold)
        }
        .foregroundStyle(Color.xertOffWhite)
        .listRowBackground(Color.xertInk)
    }
}

private struct AdminOrdersView: View {
    @ObservedObject var admin: AdminStore
    let onOpenTask: (XertOwnerTask) -> Void
    @State private var query = ""
    @State private var status = "all"

    private var filteredOrders: [OrderItem] {
        admin.orders.filter { order in
            let matchesStatus = status == "all" || order.status == status
            let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let haystack = [
                order.id.uuidString, order.email ?? "", order.products?.name ?? "",
                order.stripe_checkout_session_id ?? "", order.stripe_payment_intent_id ?? ""
            ].joined(separator: " ").lowercased()
            return matchesStatus && (needle.isEmpty || haystack.contains(needle))
        }
    }

    var body: some View {
        List {
            Section("Order operations") {
                Picker("Order status", selection: $status) {
                    Text("All").tag("all")
                    Text("Paid").tag("paid")
                    Text("Pending").tag("pending")
                    Text("Failed").tag("failed")
                    Text("Refunded").tag("refunded")
                }
                .pickerStyle(.menu)
                .tint(Color.xertSteel)
                .listRowBackground(Color.xertInk)

                if filteredOrders.isEmpty {
                    AdminEmptyState(icon: "creditcard", text: admin.orders.isEmpty ? "No orders yet." : "No matching orders.")
                        .listRowBackground(Color.xertInk)
                }
                ForEach(filteredOrders) { order in
                    Button { onOpenTask(.order(order.id)) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: order.isRecoverable ? "exclamationmark.arrow.circlepath" : "creditcard")
                                .foregroundStyle(order.isRecoverable ? Color.orange : Color.xertSteel)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(order.products?.name ?? "Session pack").font(.headline)
                            Text((order.email?.isEmpty == false ? order.email : nil) ?? "Anonymized buyer")
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.65))
                            Text(order.activityDate.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(order.displayAmount).font(.subheadline.weight(.bold))
                            Text(order.displayStatus.uppercased())
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(financeStatusColour(order.status))
                            Image(systemName: "chevron.right")
                                .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                        }
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Orders")
        .searchable(text: $query, prompt: "Email, pack or Stripe ID")
    }

    private func financeStatusColour(_ value: String) -> Color {
        switch value {
        case "paid": return .green
        case "refunded": return Color.xertPale.opacity(0.55)
        case "failed": return .red
        default: return .orange
        }
    }
}

private struct AdminOrderDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let order: OrderItem
    @State private var refundReason = "requested_by_customer"
    @State private var refundConfirmation = ""
    @State private var confirmingReconciliation = false
    @State private var resultMessage: String?

    private var isOperating: Bool { admin.operatingOrderID == order.id }

    var body: some View {
        List {
            Section("Order") {
                orderValue("Product", order.products?.name ?? "Session pack")
                orderValue("Buyer", (order.email?.isEmpty == false ? order.email : nil) ?? "Anonymized buyer")
                orderValue("Amount", order.displayAmount)
                orderValue("Status", order.displayStatus)
                orderValue("Purchased terms", order.purchasedTerms)
                orderValue("Created", order.created_at.formatted(date: .abbreviated, time: .shortened))
                if let paidAt = order.paid_at { orderValue("Paid", paidAt.formatted(date: .abbreviated, time: .shortened)) }
                identifier("XERT order", order.id.uuidString)
                identifier("Stripe checkout", order.stripe_checkout_session_id)
                identifier("Payment intent", order.stripe_payment_intent_id)
                if let reconciledAt = order.reconciled_at {
                    orderValue("Reconciled", reconciledAt.formatted(date: .abbreviated, time: .shortened))
                    identifier("Reconciled by", order.reconciled_by?.uuidString)
                }
            }

            if order.isRecoverable {
                Section("Payment recovery") {
                    Text("Ask Stripe for the canonical outcome. XERT grants credits only for an exact paid match, or safely closes an expired unpaid checkout.")
                        .font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.7))
                    Button { confirmingReconciliation = true } label: {
                        Label(isOperating ? "Checking Stripe..." : "Check Stripe outcome", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(isOperating)
                }
            }

            if order.status == "refunded" {
                Section("Refund reconciliation") {
                    orderValue("Refunded", order.refundedAmount ?? order.displayAmount)
                    if let refund = order.refund {
                        orderValue("Unused credits revoked", refund.credits_revoked.formatted())
                        orderValue("Credits already consumed", refund.credits_consumed.formatted())
                        orderValue("Future bookings cancelled", refund.bookings_cancelled.formatted())
                        identifier("Stripe refund", refund.refund_id)
                    }
                }
            }

            if order.isRefundable {
                Section("Full refund") {
                    Text("This sends the full payment back through Stripe, revokes unused credits, and cancels future bookings funded by this order.")
                        .font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.7))
                    Picker("Reason", selection: $refundReason) {
                        Text("Requested by customer").tag("requested_by_customer")
                        Text("Duplicate payment").tag("duplicate")
                    }
                    TextField("Type REFUND to confirm", text: $refundConfirmation)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    Button(role: .destructive) {
                        Task {
                            if let result = await admin.refundOrder(
                                session: session,
                                order: order,
                                reason: refundReason,
                                confirmation: refundConfirmation
                            ) {
                                let outcome = result.recovered == true ? "Stripe refund recovered and reconciled." : "Refund complete."
                                resultMessage = "\(outcome) \(result.credits_revoked) unused credits revoked, \(result.credits_consumed) already consumed, and \(result.bookings_cancelled) future bookings cancelled."
                            }
                        }
                    } label: {
                        Label(isOperating ? "Refunding..." : "Refund \(order.displayAmount)", systemImage: "arrow.uturn.backward.circle")
                    }
                    .disabled(isOperating || refundConfirmation != "REFUND")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Order detail")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(isOperating) } }
        .confirmationDialog("Check this payment with Stripe?", isPresented: $confirmingReconciliation, titleVisibility: .visible) {
            Button("Check and reconcile") {
                Task {
                    if let result = await admin.reconcileOrder(session: session, order: order) {
                        resultMessage = result.status == "failed" && result.checkout_status == "expired"
                            ? "Stripe confirms no payment was taken. The expired checkout is closed without granting credits."
                            : (result.buyer_deleted == true || result.credits_granted == 0)
                            ? "Payment settled without granting credits — the buying account is gone."
                            : result.already_paid
                            ? "Fulfilment verified. \(result.credits_granted) session credits are attached to this order."
                            : "Payment reconciled. \(result.credits_granted) session credits were granted."
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("No credits are granted unless Stripe and the XERT order match exactly.")
        }
        .alert("Order updated", isPresented: Binding(
            get: { resultMessage != nil },
            set: { if !$0 { resultMessage = nil; dismiss() } }
        )) {
            Button("Done") { resultMessage = nil; dismiss() }
        } message: { Text(resultMessage ?? "") }
    }

    @ViewBuilder
    private func orderValue(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundStyle(Color.xertPale.opacity(0.6))
            Spacer()
            Text(value).multilineTextAlignment(.trailing).foregroundStyle(Color.xertOffWhite)
        }
        .listRowBackground(Color.xertInk)
    }

    @ViewBuilder
    private func identifier(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                Text(value).font(.caption.monospaced()).textSelection(.enabled).foregroundStyle(Color.xertOffWhite)
            }
            .listRowBackground(Color.xertInk)
        }
    }
}

private struct AdminBookingRequestsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    @State private var status = "all"
    @State private var source = "all"
    @State private var days = "30"
    @State private var selectedRequest: AdminBookingRequest?
    @State private var selectedIDs: Set<String> = []
    @State private var bulkStatus = ""
    @State private var confirmingBulk = false

    private let statuses = ["requested", "confirmed", "waitlisted", "cancelled", "declined", "attended", "no_show"]

    private var filteredRequests: [AdminBookingRequest] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cutoff: Date? = days == "all" ? nil : Calendar.current.date(byAdding: .day, value: -(Int(days) ?? 30), to: Date())
        return admin.bookingRequests.filter { booking in
            let withinWindow = cutoff.map { booking.createdAt >= $0 } ?? true
            return (status == "all" || booking.status == status)
                && (source == "all" || booking.source.rawValue == source)
                && withinWindow
                && (needle.isEmpty || booking.searchableText.contains(needle))
        }
    }

    private var selectedRequests: [AdminBookingRequest] {
        admin.bookingRequests.filter { selectedIDs.contains($0.id) }
    }

    private var bulkOptions: [String] {
        let selected = selectedRequests
        guard let first = selected.first, selected.allSatisfy({ $0.status == first.status }) else { return [] }
        return first.allowedNextStatuses
    }

    var body: some View {
        List {
            if let warning = admin.bookingDecisionNoticeWarning {
                Section("Member notification") {
                    Label(warning, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .listRowBackground(Color.xertInk)
                }
            }
            Section("Queue filters") {
                Picker("Status", selection: $status) {
                    Text("All statuses").tag("all")
                    ForEach(statuses, id: \.self) { Text(statusLabel($0)).tag($0) }
                }
                Picker("Source", selection: $source) {
                    Text("All sources").tag("all")
                    Text("Member credit").tag("member")
                    Text("Enquiry form").tag("enquiry")
                }
                .pickerStyle(.segmented)
                Picker("Age", selection: $days) {
                    Text("30 days").tag("30")
                    Text("90 days").tag("90")
                    Text("All time").tag("all")
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.xertInk)

            Section("Matching workload") {
                metricRow("Matching", filteredRequests.count)
                metricRow("Requested", filteredRequests.filter { $0.status == "requested" }.count)
                metricRow("Confirmed", filteredRequests.filter { $0.status == "confirmed" }.count)
                metricRow("Attended", filteredRequests.filter { $0.status == "attended" }.count)
            }

            if !selectedIDs.isEmpty {
                Section("Bulk update") {
                    HStack {
                        Text("\(selectedIDs.count) selected")
                        Spacer()
                        Button("Clear") { selectedIDs = []; bulkStatus = "" }
                    }
                    if bulkOptions.isEmpty {
                        Text("Select bookings with the same actionable status to update them together.")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    } else {
                        Picker("Move selected to", selection: $bulkStatus) {
                            Text("Choose status").tag("")
                            ForEach(bulkOptions, id: \.self) { Text(statusLabel($0)).tag($0) }
                        }
                        Button { confirmingBulk = true } label: {
                            Label(admin.updatingBookingRequestIDs.isEmpty ? "Apply booking update" : "Updating bookings...", systemImage: "arrow.triangle.2.circlepath")
                        }
                        .disabled(bulkStatus.isEmpty || !admin.updatingBookingRequestIDs.isEmpty)
                    }
                }
                .listRowBackground(Color.xertInk)
            }

            Section("Booking operations") {
                if admin.isLoadingBookingRequests && admin.bookingRequests.isEmpty {
                    HStack { ProgressView(); Text("Loading booking requests...") }
                        .listRowBackground(Color.xertInk)
                } else if filteredRequests.isEmpty {
                    AdminEmptyState(icon: "tray", text: admin.bookingRequests.isEmpty ? "No booking requests yet." : "No matching bookings.")
                        .listRowBackground(Color.xertInk)
                }
                ForEach(filteredRequests) { booking in
                    HStack(spacing: 12) {
                        Button { toggleSelection(booking.id) } label: {
                            Image(systemName: selectedIDs.contains(booking.id) ? "checkmark.circle.fill" : "circle")
                                .font(.title3).foregroundStyle(Color.xertSteel)
                        }
                        .buttonStyle(.plain)
                        .disabled(selectedIDs.count >= 50 && !selectedIDs.contains(booking.id))
                        .accessibilityLabel(selectedIDs.contains(booking.id) ? "Deselect \(booking.fullName)" : "Select \(booking.fullName)")

                        Button { selectedRequest = booking } label: {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(booking.fullName).font(.headline)
                                    Text(booking.session?.title ?? "Class not linked")
                                        .font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.72))
                                    if let start = booking.session?.start_time {
                                        Text(start.formatted(date: .abbreviated, time: .shortened))
                                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.52))
                                    }
                                    Text(booking.source.label.uppercased())
                                        .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 5) {
                                    Text(statusLabel(booking.status).uppercased())
                                        .font(.caption2.weight(.bold)).foregroundStyle(bookingStatusColour(booking.status))
                                    if booking.creditBatchID != nil {
                                        Label("Reserved", systemImage: "ticket").font(.caption2).foregroundStyle(Color.xertPale.opacity(0.5))
                                    }
                                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Color.xertSteel)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .padding(.vertical, 5)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Booking Requests")
        .searchable(text: $query, prompt: "Member, contact, class or coach")
        .refreshable { await admin.loadBookingRequests(session: session, force: true) }
        .task { await admin.loadBookingRequests(session: session) }
        .onChange(of: status) { _ in resetSelection() }
        .onChange(of: source) { _ in resetSelection() }
        .onChange(of: days) { _ in resetSelection() }
        .sheet(item: $selectedRequest) { booking in
            NavigationStack {
                AdminBookingRequestDetailView(admin: admin, session: session, booking: booking)
            }
        }
        .confirmationDialog("Update \(selectedRequests.count) bookings?", isPresented: $confirmingBulk, titleVisibility: .visible) {
            Button("Move to \(statusLabel(bulkStatus))", role: bulkStatus == "cancelled" ? .destructive : nil) {
                let selected = selectedRequests
                Task {
                    selectedIDs = await admin.bulkUpdateBookingRequests(session: session, bookings: selected, status: bulkStatus)
                    if selectedIDs.isEmpty { bulkStatus = "" }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(bulkStatus == "cancelled" ? "Confirmed member bookings follow the server credit-return policy." : "Every selected enquiry and member booking will be updated.")
        }
    }

    private func toggleSelection(_ id: String) {
        if selectedIDs.contains(id) { selectedIDs.remove(id) } else { selectedIDs.insert(id) }
        if selectedIDs.count > 50 { selectedIDs.remove(id) }
        if !bulkOptions.contains(bulkStatus) { bulkStatus = "" }
    }

    private func resetSelection() { selectedIDs = []; bulkStatus = ""; selectedRequest = nil }

    private func statusLabel(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func bookingStatusColour(_ value: String) -> Color {
        switch value {
        case "confirmed", "attended": return .green
        case "requested", "waitlisted", "no_show": return .orange
        case "cancelled", "declined": return Color.xertPale.opacity(0.45)
        default: return Color.xertSteel
        }
    }

    private func metricRow(_ label: String, _ value: Int) -> some View {
        HStack { Text(label); Spacer(); Text(value.formatted()).fontWeight(.bold) }
            .foregroundStyle(Color.xertOffWhite).listRowBackground(Color.xertInk)
    }
}

private struct AdminBookingRequestDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let booking: AdminBookingRequest
    @State private var notes: String
    @State private var pendingStatus: String?

    init(admin: AdminStore, session: AuthSession, booking: AdminBookingRequest) {
        self.admin = admin
        self.session = session
        self.booking = booking
        _notes = State(initialValue: booking.adminNotes ?? "")
    }

    private var isUpdating: Bool { admin.updatingBookingRequestIDs.contains(booking.id) }

    var body: some View {
        List {
            Section("Booking") {
                detailRow("Member", booking.fullName)
                detailRow("Source", booking.source.label)
                detailRow("Status", statusLabel(booking.status))
                detailRow("Requested", booking.createdAt.formatted(date: .abbreviated, time: .shortened))
                if booking.creditBatchID != nil { detailRow("Class credit", "Reserved") }
                if let email = nonBlank(booking.email), let url = URL(string: "mailto:\(email)") {
                    Link(destination: url) { Label(email, systemImage: "envelope") }
                }
                if let phone = nonBlank(booking.phone), let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(destination: url) { Label(phone, systemImage: "phone") }
                }
            }
            Section("Class") {
                detailRow("Class", booking.session?.title ?? "Not linked")
                if let start = booking.session?.start_time { detailRow("Starts", start.formatted(date: .complete, time: .shortened)) }
                optionalRow("Coach", booking.session?.coach_name)
                optionalRow("Location", booking.session?.location_zone)
            }
            if !booking.allowedNextStatuses.isEmpty {
                Section("Decision") {
                    ForEach(booking.allowedNextStatuses, id: \.self) { next in
                        Button(role: next == "cancelled" || next == "declined" ? .destructive : nil) {
                            pendingStatus = next
                        } label: {
                            Label(statusLabel(next), systemImage: statusIcon(next))
                        }
                        .disabled(isUpdating)
                    }
                }
            }
            if booking.source == .enquiry {
                Section("Staff notes") {
                    TextEditor(text: $notes).frame(minHeight: 120)
                    Text("\(notes.count)/5,000").font(.caption2)
                        .foregroundStyle(notes.count > 5_000 ? Color.red : Color.xertPale.opacity(0.45))
                    Button {
                        Task {
                            if await admin.saveLegacyBookingNotes(session: session, booking: booking, notes: notes) { dismiss() }
                        }
                    } label: { Label(isUpdating ? "Saving..." : "Save notes", systemImage: "note.text") }
                    .disabled(isUpdating || notes.count > 5_000)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Booking Detail")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(isUpdating) } }
        .confirmationDialog("Move booking to \(statusLabel(pendingStatus ?? ""))?", isPresented: Binding(
            get: { pendingStatus != nil },
            set: { if !$0 { pendingStatus = nil } }
        ), titleVisibility: .visible) {
            if let pendingStatus {
                Button(statusLabel(pendingStatus), role: pendingStatus == "cancelled" || pendingStatus == "declined" ? .destructive : nil) {
                    Task {
                        if await admin.updateBookingRequest(session: session, booking: booking, status: pendingStatus) { dismiss() }
                    }
                }
            }
            Button("Keep current status", role: .cancel) { pendingStatus = nil }
        } message: {
            Text(pendingStatus == "cancelled" && booking.source == .member
                ? "The server will return the reserved class credit according to the cancellation policy."
                : "This change is recorded in the permanent admin request audit.")
        }
    }

    private func statusLabel(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }
    private func statusIcon(_ value: String) -> String {
        switch value {
        case "confirmed": return "checkmark.circle"
        case "waitlisted": return "clock"
        case "attended": return "person.badge.checkmark"
        case "no_show": return "person.badge.minus"
        default: return "xmark.circle"
        }
    }
    private func nonBlank(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
    @ViewBuilder private func optionalRow(_ label: String, _ value: String?) -> some View {
        if let value = nonBlank(value) { detailRow(label, value) }
    }
    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundStyle(Color.xertPale.opacity(0.55))
            Spacer()
            Text(value).multilineTextAlignment(.trailing).foregroundStyle(Color.xertOffWhite)
        }
    }
}

private struct AdminSiteContentView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession

    var body: some View {
        List {
            Section {
                Text("Changes publish to the public website immediately. Empty saved fields use XERT's built-in copy, and unfinished drafts stay on this device.")
                    .foregroundStyle(Color.xertPale.opacity(0.7))
            }
            Section("Public sections") {
                ForEach(AdminSiteContentSection.allCases) { section in
                    NavigationLink {
                        AdminSiteContentEditor(
                            admin: admin,
                            session: session,
                            section: section,
                            row: admin.siteContentRow(for: section)
                        )
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(section.title).font(.headline)
                                Text(section.summary).font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                            }
                        } icon: {
                            Image(systemName: section.icon).foregroundStyle(Color.xertSteel)
                        }
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Site Content")
        .overlay {
            if admin.isLoadingSiteContent && !admin.hasLoadedSiteContent {
                ProgressView("Loading live content...").tint(Color.xertSteel)
            }
        }
        .refreshable { await admin.loadSiteContent(session: session, force: true) }
        .task { await admin.loadSiteContent(session: session) }
    }
}

/// Stable identity for string rows so TextField bindings survive delete/reorder.
private struct IdentifiedDraftLine: Identifiable, Equatable {
    let id: UUID
    var value: String

    init(id: UUID = UUID(), value: String) {
        self.id = id
        self.value = value
    }
}

private struct AdminSiteContentEditor: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let section: AdminSiteContentSection
    let row: AdminSiteContentRow?
    @State private var baseline: AdminSiteContentData
    @State private var draft: AdminSiteContentData
    @State private var expectedUpdatedAt: String?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoURL = ""
    @State private var photoRows: [IdentifiedDraftLine]
    @State private var paragraphRows: [IdentifiedDraftLine]

    init(admin: AdminStore, session: AuthSession, section: AdminSiteContentSection, row: AdminSiteContentRow?) {
        self.admin = admin
        self.session = session
        self.section = section
        self.row = row
        let live = (row?.data ?? AdminSiteContentData()).merged(over: .defaults(for: section))
        let initial = AdminSiteContentDraftStore.load(section) ?? live
        _baseline = State(initialValue: live)
        _draft = State(initialValue: initial)
        _expectedUpdatedAt = State(initialValue: row?.updated_at)
        _photoRows = State(initialValue: (initial.photos ?? []).map { IdentifiedDraftLine(value: $0) })
        _paragraphRows = State(initialValue: (initial.paragraphs ?? []).map { IdentifiedDraftLine(value: $0) })
    }

    private var dirty: Bool { draft != baseline }
    private var isSaving: Bool { admin.savingSiteContentSection == section }

    var body: some View {
        Form {
            Section {
                Label(section.summary, systemImage: section.icon)
                    .foregroundStyle(Color.xertPale.opacity(0.72))
                Link(destination: AppConfig.webURL(path: section.publicPath)) {
                    Label("View live page", systemImage: "safari")
                }
            }

            fields

            Section {
                Button {
                    Task {
                        if let saved = await admin.saveSiteContent(
                            session: session,
                            section: section,
                            expectedUpdatedAt: expectedUpdatedAt,
                            draft: draft
                        ) {
                            baseline = draft
                            expectedUpdatedAt = saved.updated_at
                        }
                    }
                } label: {
                    if isSaving { ProgressView() } else { Label(dirty ? "Publish section" : "Published", systemImage: "checkmark.circle") }
                }
                .disabled(!dirty || isSaving)

                Button {
                    applyDraft(.defaults(for: section))
                } label: {
                    Label("Restore original copy", systemImage: "arrow.counterclockwise")
                }
                if dirty {
                    Button("Discard draft", role: .destructive) {
                        applyDraft(baseline)
                        AdminSiteContentDraftStore.clear(section)
                    }
                }
            } footer: {
                Text(dirty ? "Unsaved draft stored on this device." : "This section matches the live version loaded from Supabase.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(section.title)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: draft) { value in
            if value == baseline { AdminSiteContentDraftStore.clear(section) }
            else { AdminSiteContentDraftStore.save(value, section: section) }
        }
        .onChange(of: selectedPhoto) { item in
            guard let item else { return }
            Task { await upload(item) }
        }
    }

    @ViewBuilder
    private var fields: some View {
        switch section {
        case .hero:
            Section("Hero copy") {
                TextField("Headline", text: textBinding(\.headline))
                TextField("Subheading", text: textBinding(\.subheading), axis: .vertical).lineLimit(3...8)
                TextField("Supporting line", text: textBinding(\.supporting), axis: .vertical).lineLimit(3...8)
            }
            Section("Rotating photos") {
                ForEach(Array(photoRows.enumerated()), id: \.element.id) { index, row in
                    heroPhotoRow(id: row.id, index: index)
                }
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label(admin.isUploadingSiteImage ? "Uploading..." : "Upload photo", systemImage: "photo.badge.plus")
                }
                .disabled(admin.isUploadingSiteImage)
                HStack {
                    TextField("https://... or /assets/...", text: $photoURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    Button {
                        guard !photoURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                        photoRows.append(IdentifiedDraftLine(value: photoURL))
                        syncPhotosFromRows()
                        photoURL = ""
                    } label: { Image(systemName: "plus.circle.fill") }
                    .accessibilityLabel("Add photo URL")
                }
            }
        case .booking:
            Section("Booking introduction") {
                TextField("Introduction", text: textBinding(\.intro), axis: .vertical).lineLimit(5...12)
            }
        case .about:
            Section("About paragraphs") {
                ForEach(Array(paragraphRows.enumerated()), id: \.element.id) { index, row in
                    editableTextListRow(id: row.id, index: index)
                }
                Button {
                    paragraphRows.append(IdentifiedDraftLine(value: ""))
                    syncParagraphsFromRows()
                } label: {
                    Label("Add paragraph", systemImage: "plus")
                }
            }
        case .contact:
            Section("Public contact") {
                TextField("Email", text: textBinding(\.email)).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Phone", text: textBinding(\.phone)).keyboardType(.phonePad)
                TextField("Address or location", text: textBinding(\.address), axis: .vertical)
                TextField("Instagram handle", text: textBinding(\.instagram_handle)).textInputAutocapitalization(.never)
                TextField("Instagram URL", text: textBinding(\.instagram_url)).keyboardType(.URL).textInputAutocapitalization(.never)
                TextField("Contact page introduction", text: textBinding(\.intro), axis: .vertical).lineLimit(4...10)
            }
        case .faq:
            Section("Questions and answers") {
                ForEach(draft.items ?? []) { item in
                    faqRow(itemID: item.id)
                }
                Button {
                    draft.items = (draft.items ?? []) + [AdminFAQItem(q: "", a: "")]
                } label: {
                    Label("Add question", systemImage: "plus")
                }
            }
        }
    }

    private func applyDraft(_ value: AdminSiteContentData) {
        draft = value
        photoRows = (value.photos ?? []).map { IdentifiedDraftLine(value: $0) }
        paragraphRows = (value.paragraphs ?? []).map { IdentifiedDraftLine(value: $0) }
    }

    private func syncPhotosFromRows() {
        draft.photos = photoRows.map(\.value)
    }

    private func syncParagraphsFromRows() {
        draft.paragraphs = paragraphRows.map(\.value)
    }

    private func textBinding(_ keyPath: WritableKeyPath<AdminSiteContentData, String?>) -> Binding<String> {
        Binding(
            get: { draft[keyPath: keyPath] ?? "" },
            set: { draft[keyPath: keyPath] = $0 }
        )
    }

    private func paragraphBinding(id: UUID) -> Binding<String> {
        Binding(
            get: { paragraphRows.first(where: { $0.id == id })?.value ?? "" },
            set: { newValue in
                guard let index = paragraphRows.firstIndex(where: { $0.id == id }) else { return }
                paragraphRows[index].value = newValue
                syncParagraphsFromRows()
            }
        )
    }

    private func faqBinding(itemID: UUID, _ keyPath: WritableKeyPath<AdminFAQItem, String>) -> Binding<String> {
        Binding(
            get: {
                draft.items?.first(where: { $0.id == itemID })?[keyPath: keyPath] ?? ""
            },
            set: { newValue in
                guard let index = draft.items?.firstIndex(where: { $0.id == itemID }) else { return }
                draft.items?[index][keyPath: keyPath] = newValue
            }
        )
    }

    @ViewBuilder
    private func heroPhotoRow(id: UUID, index: Int) -> some View {
        let value = photoRows.first(where: { $0.id == id })?.value ?? ""
        HStack(spacing: 12) {
            if let url = publicImageURL(value) {
                XertRemoteImage(url: url, maximumPointDimension: 72) {
                    Image(systemName: "photo").foregroundStyle(Color.xertPale.opacity(0.4))
                }
                .frame(width: 58, height: 70)
                .clipped()
            } else {
                Image(systemName: "photo")
                    .foregroundStyle(Color.xertPale.opacity(0.4))
                    .frame(width: 58, height: 70)
            }
            Text(value).font(.caption).lineLimit(2)
            Spacer()
            reorderButtons(index: index, count: photoRows.count) { from, to in
                guard photoRows.indices.contains(from), photoRows.indices.contains(to) else { return }
                photoRows.swapAt(from, to)
                syncPhotosFromRows()
            } remove: {
                photoRows.removeAll { $0.id == id }
                syncPhotosFromRows()
            }
        }
    }

    @ViewBuilder
    private func editableTextListRow(id: UUID, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Paragraph \(index + 1)").font(.caption.weight(.bold))
                Spacer()
                reorderButtons(index: index, count: paragraphRows.count) { from, to in
                    guard paragraphRows.indices.contains(from), paragraphRows.indices.contains(to) else { return }
                    paragraphRows.swapAt(from, to)
                    syncParagraphsFromRows()
                } remove: {
                    paragraphRows.removeAll { $0.id == id }
                    syncParagraphsFromRows()
                }
            }
            TextField("Paragraph", text: paragraphBinding(id: id), axis: .vertical).lineLimit(5...14)
        }
    }

    @ViewBuilder
    private func faqRow(itemID: UUID) -> some View {
        let index = draft.items?.firstIndex(where: { $0.id == itemID }) ?? 0
        let count = draft.items?.count ?? 0
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Question \(index + 1)").font(.caption.weight(.bold))
                Spacer()
                reorderButtons(index: index, count: count) { from, to in
                    guard let items = draft.items, items.indices.contains(from), items.indices.contains(to) else { return }
                    draft.items?.swapAt(from, to)
                } remove: {
                    draft.items?.removeAll { $0.id == itemID }
                }
            }
            TextField("Question", text: faqBinding(itemID: itemID, \.q))
            TextField("Answer", text: faqBinding(itemID: itemID, \.a), axis: .vertical).lineLimit(3...10)
        }
    }

    private func reorderButtons(
        index: Int,
        count: Int,
        move: @escaping (Int, Int) -> Void,
        remove: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 4) {
            Button { move(index, index - 1) } label: { Image(systemName: "arrow.up") }
                .disabled(index == 0).accessibilityLabel("Move up")
            Button { move(index, index + 1) } label: { Image(systemName: "arrow.down") }
                .disabled(index >= count - 1).accessibilityLabel("Move down")
            Button(role: .destructive, action: remove) { Image(systemName: "trash") }
                .accessibilityLabel("Remove")
        }
        .buttonStyle(.borderless)
    }

    private func publicImageURL(_ value: String) -> URL? {
        value.hasPrefix("/") ? AppConfig.webURL(path: value) : URL(string: value)
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { selectedPhoto = nil }
        guard let sourceData = try? await item.loadTransferable(type: Data.self) else {
            admin.errorMessage = "The selected photo could not be read."
            return
        }
        guard sourceData.count <= 5 * 1_024 * 1_024 else {
            admin.errorMessage = "Image must be under 5 MB."
            return
        }
        let type = item.supportedContentTypes.first(where: { $0.conforms(to: .image) }) ?? .jpeg
        let upload: (data: Data, mimeType: String, fileExtension: String)
        if type.conforms(to: .jpeg) || type.conforms(to: .png) {
            upload = (sourceData, type.preferredMIMEType ?? "image/jpeg", type.preferredFilenameExtension ?? "jpg")
        } else if let image = UIImage(data: sourceData), let jpeg = image.jpegData(compressionQuality: 0.9) {
            upload = (jpeg, "image/jpeg", "jpg")
        } else {
            admin.errorMessage = "The selected image type could not be prepared for the website."
            return
        }
        if let url = await admin.uploadSiteImage(
            session: session,
            data: upload.data,
            mimeType: upload.mimeType,
            fileExtension: upload.fileExtension
        ) {
            photoRows.append(IdentifiedDraftLine(value: url))
            syncPhotosFromRows()
        }
    }
}

private struct AdminCampaignAttributionView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var range = AdminCampaignRange.thirty
    @State private var exportDocument: AdminCampaignCSVDocument?
    @State private var isExporting = false

    private var summary: AdminCampaignSummary {
        AdminCampaignSummary(rows: admin.campaignAttributionRows, range: range)
    }

    var body: some View {
        List {
            Section {
                Picker("Reporting range", selection: $range) {
                    ForEach(AdminCampaignRange.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            } footer: {
                Text("Member-interest attribution uses Australia/Brisbane reporting days and matches the desktop command centre.")
            }

            Section("Acquisition pulse") {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    AdminCampaignMetric(title: "Leads", value: "\(summary.total)")
                    AdminCampaignMetric(title: "UTM attributed", value: "\(summary.attributed)")
                    AdminCampaignMetric(title: "Direct / unknown", value: "\(summary.direct)")
                    AdminCampaignMetric(
                        title: "Attribution rate",
                        value: summary.attributionRate.formatted(.percent.precision(.fractionLength(0)))
                    )
                }
                .padding(.vertical, 4)
                .listRowBackground(Color.xertNavy)
            }

            AdminCampaignBreakdownSection(
                title: "Traffic sources", items: summary.sources, total: summary.total,
                emptyText: "No source data in this range."
            )
            AdminCampaignBreakdownSection(
                title: "Campaigns", items: summary.campaigns, total: summary.total,
                emptyText: "No UTM campaigns in this range."
            )
            AdminCampaignBreakdownSection(
                title: "Channels / mediums", items: summary.mediums, total: summary.total,
                emptyText: "No channel data in this range."
            )

            Section("Daily signups - latest 30 Queensland days") {
                if summary.dailySignups.allSatisfy({ $0.count == 0 }) {
                    AdminEmptyState(icon: "chart.bar", text: "No member leads in the latest 30 days.")
                        .listRowInsets(EdgeInsets())
                } else {
                    AdminCampaignDailyChart(days: summary.dailySignups)
                        .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Campaign Attribution")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    exportDocument = AdminCampaignCSVDocument(csv: summary.csv)
                    isExporting = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(summary.total == 0)
                .accessibilityLabel("Export campaign attribution CSV")
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .commaSeparatedText,
            defaultFilename: "xert-campaign-attribution-\(range.rawValue)"
        ) { result in
            if case .failure(let error) = result { admin.errorMessage = error.localizedDescription }
        }
        .overlay {
            if admin.isLoadingCampaignAttribution && admin.campaignAttributionRows.isEmpty {
                ProgressView("Loading attribution...").tint(Color.xertSteel)
            }
        }
        .refreshable { await admin.loadCampaignAttribution(session: session, force: true) }
        .task { await admin.loadCampaignAttribution(session: session) }
    }
}

private struct AdminCampaignMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.xertOffWhite)
                .minimumScaleFactor(0.75)
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(Color.xertPale.opacity(0.55))
        }
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .padding(12)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.16), lineWidth: 1))
    }
}

private struct AdminCampaignBreakdownSection: View {
    let title: String
    let items: [AdminCampaignBreakdown]
    let total: Int
    let emptyText: String

    var body: some View {
        Section(title) {
            if items.isEmpty {
                Text(emptyText).foregroundStyle(Color.xertPale.opacity(0.6))
            } else {
                ForEach(items.prefix(8)) { item in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Text(item.label).lineLimit(1)
                            Spacer()
                            Text("\(item.count)").fontWeight(.bold).monospacedDigit()
                        }
                        ProgressView(value: Double(item.count), total: Double(max(total, 1)))
                            .tint(Color.xertSteel)
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
    }
}

private struct AdminCampaignDailyChart: View {
    let days: [AdminCampaignDailyCount]
    private var maximum: Int { max(days.map(\.count).max() ?? 0, 1) }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(days.indices, id: \.self) { index in
                    let day = days[index]
                    VStack(spacing: 4) {
                        Text(day.count == 0 ? "" : "\(day.count)")
                            .font(.caption2).monospacedDigit()
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                            .frame(height: 12)
                        Rectangle()
                            .fill(Color.xertSteel)
                            .frame(width: 14, height: max(2, CGFloat(day.count) / CGFloat(maximum) * 92))
                        Text(index % 5 == 0 || index == days.count - 1 ? String(day.dateKey.suffix(5)) : "")
                            .font(.system(size: 8))
                            .foregroundStyle(Color.xertPale.opacity(0.45))
                            .frame(width: 24)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(day.dateKey), \(day.count) signups")
                }
            }
            .frame(minHeight: 125, alignment: .bottom)
            .padding(.vertical, 6)
        }
    }
}

private struct AdminCampaignCSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }
    let csv: String

    init(csv: String) { self.csv = csv }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents,
              let value = String(data: data, encoding: .utf8) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        csv = value
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(csv.utf8))
    }
}

private struct AdminLeadsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var pipeline = AdminLeadPipeline.members
    @State private var query = ""
    @State private var status = "all"
    @State private var selectedLead: AdminLead?
    @State private var selectedIDs: Set<AdminLeadIdentifier> = []
    @State private var bulkStatus = ""

    private var leads: [AdminLead] { admin.leads(for: pipeline) }
    private var filteredLeads: [AdminLead] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return leads.filter { lead in
            (status == "all" || lead.effectiveStatus == status)
                && (needle.isEmpty || lead.searchableText.contains(needle))
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Lead pipeline", selection: $pipeline) {
                    ForEach(AdminLeadPipeline.allCases) { option in
                        Text(option.shortLabel).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                Picker("Status", selection: $status) {
                    Text("All statuses").tag("all")
                    ForEach(pipeline.statuses, id: \.self) { value in
                        Text(statusLabel(value)).tag(value)
                    }
                }
                .pickerStyle(.menu)
                .tint(Color.xertSteel)
            }
            .listRowBackground(Color.xertInk)

            if !selectedIDs.isEmpty {
                Section("Bulk update") {
                    HStack {
                        Text("\(selectedIDs.count) selected")
                        Spacer()
                        Button("Clear") { selectedIDs = [] }
                    }
                    Picker("Move selected to", selection: $bulkStatus) {
                        Text("Choose status").tag("")
                        ForEach(pipeline.statuses, id: \.self) { value in
                            Text(statusLabel(value)).tag(value)
                        }
                    }
                    Button {
                        let ids = selectedIDs
                        Task {
                            if await admin.bulkUpdateLeads(session: session, pipeline: pipeline, ids: ids, status: bulkStatus) {
                                selectedIDs = []
                                bulkStatus = ""
                            }
                        }
                    } label: {
                        Label(admin.savingLeadIDs.isEmpty ? "Apply bulk status" : "Updating leads...", systemImage: "person.2.badge.gearshape")
                    }
                    .disabled(bulkStatus.isEmpty || !admin.savingLeadIDs.isEmpty)
                }
                .listRowBackground(Color.xertInk)
            }

            Section(pipeline.title) {
                if admin.loadingLeadPipeline == pipeline && leads.isEmpty {
                    HStack { ProgressView(); Text("Loading pipeline...") }
                        .listRowBackground(Color.xertInk)
                } else if filteredLeads.isEmpty {
                    AdminEmptyState(icon: "person.crop.circle.badge.questionmark", text: leads.isEmpty ? "No leads yet." : "No matching leads.")
                        .listRowBackground(Color.xertInk)
                }

                ForEach(filteredLeads) { lead in
                    HStack(spacing: 12) {
                        Button { toggleSelection(lead.id) } label: {
                            Image(systemName: selectedIDs.contains(lead.id) ? "checkmark.circle.fill" : "circle")
                                .font(.title3).foregroundStyle(Color.xertSteel)
                        }
                        .buttonStyle(.plain)
                        .disabled(selectedIDs.count >= 100 && !selectedIDs.contains(lead.id))
                        .accessibilityLabel(selectedIDs.contains(lead.id) ? "Deselect \(lead.displayName)" : "Select \(lead.displayName)")

                        Button { selectedLead = lead } label: {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(lead.displayName).font(.headline)
                                    Text([lead.email, lead.phone].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.62))
                                    if let goals = lead.main_training_goals, !goals.isEmpty {
                                        Text(goals.prefix(3).joined(separator: ", "))
                                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.5)).lineLimit(1)
                                    }
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 5) {
                                    Text(statusLabel(lead.effectiveStatus).uppercased())
                                        .font(.caption2.weight(.bold)).foregroundStyle(leadStatusColour(lead.effectiveStatus))
                                    Text(lead.created_at.formatted(date: .abbreviated, time: .omitted))
                                        .font(.caption2).foregroundStyle(Color.xertPale.opacity(0.42))
                                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Color.xertSteel)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .padding(.vertical, 5)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Lead Pipelines")
        .searchable(text: $query, prompt: "Name, email, phone or source")
        .refreshable { await admin.loadLeads(session: session, pipeline: pipeline, force: true) }
        .task { await admin.loadLeads(session: session, pipeline: pipeline) }
        .onChange(of: pipeline) { newPipeline in
            query = ""
            status = "all"
            selectedIDs = []
            bulkStatus = ""
            selectedLead = nil
            Task { await admin.loadLeads(session: session, pipeline: newPipeline) }
        }
        .sheet(item: $selectedLead) { lead in
            NavigationStack {
                AdminLeadDetailView(admin: admin, session: session, pipeline: pipeline, lead: lead)
            }
        }
    }

    private func toggleSelection(_ id: AdminLeadIdentifier) {
        if selectedIDs.contains(id) { selectedIDs.remove(id) }
        else if selectedIDs.count < 100 { selectedIDs.insert(id) }
    }

    private func statusLabel(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func leadStatusColour(_ value: String) -> Color {
        switch value {
        case "new", "hot": return .orange
        case "joined", "hired", "approved", "booked_trial": return .green
        case "not_suitable", "archived": return Color.xertPale.opacity(0.45)
        default: return Color.xertSteel
        }
    }
}

private struct AdminLeadDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let pipeline: AdminLeadPipeline
    let lead: AdminLead
    @State private var status: String
    @State private var notes: String

    init(admin: AdminStore, session: AuthSession, pipeline: AdminLeadPipeline, lead: AdminLead) {
        self.admin = admin
        self.session = session
        self.pipeline = pipeline
        self.lead = lead
        _status = State(initialValue: lead.effectiveStatus)
        _notes = State(initialValue: lead.admin_notes ?? "")
    }

    private var isSaving: Bool { admin.savingLeadIDs.contains(lead.id) }

    var body: some View {
        List {
            Section("Contact") {
                detailRow("Name", lead.displayName)
                if let email = nonBlank(lead.email), let url = URL(string: "mailto:\(email)") {
                    Link(destination: url) { Label(email, systemImage: "envelope") }
                }
                if let phone = nonBlank(lead.phone), let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(destination: url) { Label(phone, systemImage: "phone") }
                }
                detailRow("Submitted", lead.created_at.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Application") {
                optionalRow("Business", lead.business_name)
                optionalRow("Suburb", lead.suburb_town)
                optionalRow("Training level", lead.current_training_level)
                optionalList("Goals", lead.main_training_goals)
                optionalList("Preferred times", lead.preferred_training_times)
                optionalRow("Qualifications", lead.qualifications)
                optionalRow("Experience", lead.years_experience)
                optionalRow("Functional training", lead.functional_training_experience)
                optionalList("Specialties", lead.specialties)
                optionalRow("Profession", lead.profession)
                optionalList("Services", lead.services_offered)
                optionalRow("Introduction", lead.short_intro)
                if let website = nonBlank(lead.website_social_link), let url = URL(string: website), url.scheme != nil {
                    Link(destination: url) { Label("Website or social profile", systemImage: "safari") }
                }
                if let source = nonBlank(lead.utm_source) {
                    detailRow("Source", [source, lead.utm_medium, lead.utm_campaign].compactMap { nonBlank($0) }.joined(separator: " / "))
                }
            }

            Section("Pipeline") {
                Picker("Status", selection: $status) {
                    ForEach(pipeline.statuses, id: \.self) { value in
                        Text(value.replacingOccurrences(of: "_", with: " ").capitalized).tag(value)
                    }
                }
                TextEditor(text: $notes)
                    .frame(minHeight: 120)
                    .overlay(alignment: .topLeading) {
                        if notes.isEmpty {
                            Text("Internal notes").foregroundStyle(Color.xertPale.opacity(0.35)).padding(.top, 8).allowsHitTesting(false)
                        }
                    }
                Text("\(notes.count)/5,000")
                    .font(.caption2).foregroundStyle(notes.count > 5_000 ? Color.red : Color.xertPale.opacity(0.45))
                Button {
                    Task {
                        if await admin.saveLead(session: session, pipeline: pipeline, lead: lead, status: status, notes: notes) {
                            dismiss()
                        }
                    }
                } label: {
                    Label(isSaving ? "Saving..." : "Save pipeline changes", systemImage: "checkmark.circle")
                }
                .disabled(isSaving || notes.count > 5_000)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(lead.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(isSaving) } }
    }

    @ViewBuilder
    private func optionalRow(_ label: String, _ value: String?) -> some View {
        if let value = nonBlank(value) { detailRow(label, value) }
    }

    @ViewBuilder
    private func optionalList(_ label: String, _ values: [String]?) -> some View {
        if let values, !values.isEmpty { detailRow(label, values.joined(separator: ", ")) }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(Color.xertPale.opacity(0.48))
            Text(value).foregroundStyle(Color.xertOffWhite)
        }
    }

    private func nonBlank(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct AdminPTRequestsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var filter = "active"
    @State private var notesRequest: AdminPTRequest?

    private var rows: [AdminPTRequest] {
        switch filter {
        case "active": return admin.ptRequests.filter { ["requested", "reschedule_requested", "approved"].contains($0.status) }
        case "completed": return admin.ptRequests.filter { $0.status == "completed" }
        default: return admin.ptRequests
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Request filter", selection: $filter) {
                    Text("Active").tag("active")
                    Text("Completed").tag("completed")
                    Text("All").tag("all")
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.xertNavy)

            if rows.isEmpty {
                Text("No matching PT requests.")
                    .listRowBackground(Color.xertInk)
            }
            ForEach(rows) { request in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(request.displayName).font(.headline)
                            Text(request.requested_session_type)
                                .font(.caption.weight(.bold)).foregroundStyle(Color.xertSteel)
                        }
                        Spacer()
                        Text(request.status.replacingOccurrences(of: "_", with: " ").uppercased())
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(request.isPending ? Color.orange : Color.xertPale.opacity(0.65))
                    }
                    Text([request.preferred_day, request.preferred_time].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    if let goal = request.training_goal, !goal.isEmpty {
                        Text("Goal: \(goal)").font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    }
                    HStack(spacing: 8) {
                        if let phone = request.phone, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                            Link(destination: url) { Image(systemName: "phone") }.buttonStyle(.bordered)
                        }
                        if let email = request.email, let url = URL(string: "mailto:\(email)") {
                            Link(destination: url) { Image(systemName: "envelope") }.buttonStyle(.bordered)
                        }
                        Menu {
                            if request.isPending {
                                requestAction("Approve", status: "approved", request: request)
                                requestAction("Request reschedule", status: "reschedule_requested", request: request)
                                requestAction("Decline", status: "declined", request: request)
                            }
                            if request.status == "approved" {
                                requestAction("Mark complete", status: "completed", request: request)
                                requestAction("Cancel", status: "cancelled", request: request)
                            }
                        } label: {
                            Label("Update", systemImage: "arrow.triangle.2.circlepath")
                        }
                        .buttonStyle(.borderedProminent).tint(Color.xertSteel)
                        .disabled(admin.updatingPTRequestID != nil)

                        Button { notesRequest = request } label: { Image(systemName: "note.text") }
                            .buttonStyle(.bordered)
                            .accessibilityLabel("Edit admin notes")
                    }
                    .font(.caption.weight(.bold))
                }
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 6)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("PT Requests")
        .sheet(item: $notesRequest) { request in
            AdminPTNotesEditor(request: request) { notes in
                Task {
                    _ = await admin.updatePTRequest(
                        session: session,
                        request: request,
                        status: request.status,
                        notes: notes,
                        updateNotes: true
                    )
                    notesRequest = nil
                }
            }
        }
    }

    @ViewBuilder
    private func requestAction(_ title: String, status: String, request: AdminPTRequest) -> some View {
        Button(title) {
            Task { _ = await admin.updatePTRequest(session: session, request: request, status: status) }
        }
    }
}

private struct AdminPTNotesEditor: View {
    @Environment(\.dismiss) private var dismiss
    let request: AdminPTRequest
    let onSave: (String) -> Void
    @State private var notes: String

    init(request: AdminPTRequest, onSave: @escaping (String) -> Void) {
        self.request = request
        self.onSave = onSave
        _notes = State(initialValue: request.admin_notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Private owner notes") {
                    TextEditor(text: $notes).frame(minHeight: 160)
                    Text("\(notes.count)/5000").font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle(request.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(String(notes.prefix(5_000))) }
                }
            }
        }
    }
}

private struct AdminPlatformView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let initialDraft: AdminPlatformSettings?
    let isExitSaving: Bool
    let onOpenPricing: () -> Void
    let onOpenNotices: () -> Void
    let onDraftChange: (AdminPlatformSettings?) -> Void
    @State private var draft: AdminPlatformSettings?
    @State private var lastLoadedSettings: AdminPlatformSettings?
    @State private var saved = false
    @State private var confirmingPaymentActivation = false
    @State private var staleDraftRequiresReset = false

    private var pricingDataUnavailable: Bool {
        admin.refreshUnavailableSources.contains("session packs")
    }

    private var platformDataIsCurrent: Bool {
        admin.loadedSources.contains("platform controls")
            && !admin.refreshUnavailableSources.contains("platform controls")
    }

    private var platformDataUnavailable: Bool {
        !platformDataIsCurrent && admin.hasCompletedRefresh
    }

    private var platformMutationAvailable: Bool {
        platformDataIsCurrent
            && !admin.isLoading
            && !admin.isSavingSettings
            && !isExitSaving
    }

    private var stripeHealthIsCurrent: Bool {
        admin.loadedSources.contains("Stripe health")
            && !admin.refreshUnavailableSources.contains("Stripe health")
            && admin.commerceHealth != nil
    }

    private var memberNoticeDataIsCurrent: Bool {
        admin.loadedSources.contains("member notices")
            && !admin.refreshUnavailableSources.contains("member notices")
    }

    private var bookingGuardReady: Bool? {
        guard admin.loadedSources.contains("schema health"),
              !admin.refreshUnavailableSources.contains("schema health") else { return nil }
        return admin.schemaCapabilities.contains { $0.capability == "member_booking_switch_guard" }
    }

    private var liveMemberNoticeCount: Int {
        admin.announcements.filter { $0.stateLabel == "Live" }.count
    }

    var body: some View {
        Group {
            if draft != nil {
                Form {
                    if platformDataUnavailable {
                        Section {
                            Label(
                                "Live platform settings could not be refreshed. This last snapshot is read-only until a retry succeeds.",
                                systemImage: "clock.badge.exclamationmark"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                            Button {
                                Task { await admin.refresh(session: session) }
                            } label: {
                                Label(admin.isLoading ? "Retrying…" : "Retry platform settings", systemImage: "arrow.clockwise")
                                    .frame(maxWidth: .infinity, minHeight: 44)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Color.orange)
                            .disabled(admin.isLoading || admin.isSavingSettings || isExitSaving)
                        }
                    } else if admin.isLoading {
                        Section {
                            Label("Refreshing live platform settings. Editing is paused until the latest snapshot settles.", systemImage: "arrow.clockwise")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.xertSteel)
                        }
                    }
                    Section("Member app experience") {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("XERT member companion", systemImage: "iphone.gen3")
                                .font(.headline)
                                .foregroundStyle(Color.xertOffWhite)
                            Text("Members can browse published content and manage only their own credits, bookings, purchases, PT requests, goals and notification preferences. Owner workspaces and other member records stay protected.")
                                .font(.caption)
                                .foregroundStyle(Color.xertPale.opacity(0.7))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 4)

                        memberCapabilityRow(
                            title: "Class booking",
                            value: draft?.bookings_enabled == true ? "Book & waitlist" : "Interest only",
                            icon: "calendar.badge.plus",
                            color: draft?.bookings_enabled == true ? .green : Color.xertSteel
                        )
                        memberCapabilityRow(
                            title: "Booking protection",
                            value: bookingGuardReady.map { $0 ? "Verified" : "Migration required" } ?? "Unavailable",
                            icon: "checkmark.shield",
                            color: bookingGuardReady == true ? .green : .orange
                        )
                        memberCapabilityRow(
                            title: "Session packs",
                            value: draft?.payments_enabled == true ? "Checkout live" : "Browse only",
                            icon: "ticket",
                            color: draft?.payments_enabled == true ? .green : Color.xertSteel
                        )
                        memberCapabilityRow(
                            title: "Member notices",
                            value: memberNoticeDataIsCurrent
                                ? (liveMemberNoticeCount == 0 ? "None live" : "\(liveMemberNoticeCount) live")
                                : "Unavailable",
                            icon: "bell.badge",
                            color: memberNoticeDataIsCurrent ? Color.xertSteel : .orange
                        )

                        Button(action: onOpenNotices) {
                            Label("Manage member notices", systemImage: "arrow.right.circle")
                        }
                        .disabled(admin.isLoading || admin.isSavingSettings || isExitSaving)
                    }
                    Section("Pack sales") {
                        LabeledContent(
                            "Active session packs",
                            value: pricingDataUnavailable ? "Unavailable" : "\(admin.products.filter(\.active).count)"
                        )
                        LabeledContent(
                            "Stripe-linked active packs",
                            value: pricingDataUnavailable
                                ? "Unavailable"
                                : "\(admin.products.filter { $0.active && $0.hasStableStripePriceID }.count)"
                        )
                        Button(action: requestPricingNavigation) {
                            Label("Open session packs & pricing", systemImage: "ticket")
                        }
                        .disabled(admin.isLoading || admin.isSavingSettings || isExitSaving)
                        if pricingDataUnavailable {
                            Label("Session-pack data could not be refreshed. Pricing counts may be stale.", systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                                .font(.caption).foregroundStyle(.orange)
                        } else if draft?.payments_enabled == true,
                           admin.products.contains(where: { $0.active && !$0.hasStableStripePriceID }) {
                            Label("Checkout is enabled but an active pack is missing its Stripe Price ID.", systemImage: "exclamationmark.triangle.fill")
                                .font(.caption).foregroundStyle(.orange)
                        }
                    }
                    Section("Member booking & purchases") {
                        Toggle("Bookings enabled", isOn: settingBinding(\.bookings_enabled))
                        Text("Controls both website and iOS class actions. When off, members can browse and register interest but cannot book or join waitlists.")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        Toggle("Session pack payments", isOn: settingBinding(\.payments_enabled))
                        Text("Master checkout switch for pack purchases on the website and iOS app. Keep off until Stripe launch checks pass.")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        Toggle("Launch countdown", isOn: settingBinding(\.countdown_enabled))
                    }
                    .disabled(!platformMutationAvailable)
                    Section("Public announcement") {
                        Toggle("Show announcement banner", isOn: settingBinding(\.announcement_banner_enabled))
                        TextField("Announcement text", text: announcementBinding, axis: .vertical)
                            .lineLimit(2...5)
                    }
                    .disabled(!platformMutationAvailable)
                    Section("Launch") {
                        TextField("Target date (YYYY-MM-DD)", text: settingBinding(\.target_launch_date))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    .disabled(!platformMutationAvailable)
                }
                .scrollContentBackground(.hidden)
                .scrollDismissesKeyboard(.interactively)
            } else if admin.isLoading || !platformDataUnavailable {
                ProgressView("Loading platform settings...").tint(Color.xertSteel)
            } else {
                VStack(spacing: 14) {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(Color.orange)
                    Text("Platform settings unavailable")
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text("No safe settings snapshot is available. Retry before changing bookings, payments or public announcements.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Color.xertPale.opacity(0.72))
                    Button {
                        Task { await admin.refresh(session: session) }
                    } label: {
                        Label("Retry platform settings", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.orange)
                }
                .padding(24)
                .frame(maxWidth: 520, maxHeight: .infinity)
                .frame(maxWidth: .infinity)
            }
        }
        .background(Color.xertNavy)
        .navigationTitle("Member App Controls")
        .onAppear {
            draft = initialDraft ?? admin.settings
            lastLoadedSettings = admin.settings
            staleDraftRequiresReset = platformDataUnavailable
            onDraftChange(draft)
        }
        .onChange(of: admin.settings) { settings in
            if draft == nil || draft == lastLoadedSettings { draft = settings }
            lastLoadedSettings = settings
        }
        .onChange(of: draft) { value in
            if value != admin.settings { saved = false }
            onDraftChange(value)
        }
        .onChange(of: platformDataUnavailable) { isUnavailable in
            if isUnavailable {
                staleDraftRequiresReset = true
                saved = false
            } else if staleDraftRequiresReset {
                draft = admin.settings
                lastLoadedSettings = admin.settings
                staleDraftRequiresReset = false
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if draft != nil { platformSaveBar }
        }
        .confirmationDialog("Open session pack checkout?", isPresented: $confirmingPaymentActivation, titleVisibility: .visible) {
            Button("Enable pack checkout") {
                guard let draft else { return }
                save(draft)
            }
            Button("Keep payments paused", role: .cancel) {}
        } message: {
            Text(stripeHealthIsCurrent && admin.commerceHealth?.ready == true
                ? "Stripe launch checks passed recently. XERT will run them again on the server before enabling purchases."
                : "XERT will run every Stripe launch check on the server. Payments remain paused if any check fails.")
        }
    }

    private var platformSaveBar: some View {
        Button {
            guard let draft else { return }
            XertHaptics.play(.lightImpact)
            if draft.payments_enabled && admin.settings?.payments_enabled != true {
                confirmingPaymentActivation = true
            } else {
                save(draft)
            }
        } label: {
            HStack(spacing: 10) {
                if admin.isSavingSettings { ProgressView().tint(Color.xertNavy) }
                Image(systemName: saved ? "checkmark.circle.fill" : "checkmark.shield")
                Text(saved ? "Live settings saved" : "Save live settings")
                    .font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.xertNavy)
        .background(canSavePlatformSettings ? Color.xertSteel : Color.xertSteel.opacity(0.45))
        .disabled(!canSavePlatformSettings)
        .accessibilityIdentifier("owner.platform.save")
        .accessibilityHint("Saves booking, payment, countdown and public announcement settings")
    }

    private var canSavePlatformSettings: Bool {
        !admin.isSavingSettings
            && platformMutationAvailable
            && draft != nil
            && draft != admin.settings
    }

    private func requestPricingNavigation() {
        guard !admin.isLoading else { return }
        onOpenPricing()
    }

    private func save(_ settings: AdminPlatformSettings) {
        guard platformMutationAvailable else { return }
        Task {
            saved = await admin.saveSettings(session: session, draft: settings)
            if saved {
                XertHaptics.play(.success)
                draft = admin.settings
            } else {
                XertHaptics.play(.error)
            }
        }
    }

    private func settingBinding<Value>(_ keyPath: WritableKeyPath<AdminPlatformSettings, Value>) -> Binding<Value> {
        Binding(
            get: { draft![keyPath: keyPath] },
            set: {
                guard var value = draft else { return }
                value[keyPath: keyPath] = $0
                draft = value
            }
        )
    }

    private var announcementBinding: Binding<String> {
        Binding(
            get: { draft?.announcementText ?? "" },
            set: {
                guard var value = draft else { return }
                value.announcementText = $0
                draft = value
            }
        )
    }

    private func memberCapabilityRow(
        title: String,
        value: String,
        icon: String,
        color: Color
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 22)
            Text(title)
                .foregroundStyle(Color.xertOffWhite)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
                .multilineTextAlignment(.trailing)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(value)")
    }
}

private struct AdminCommunicationsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var composing = false

    var body: some View {
        List {
            if admin.announcements.isEmpty {
                Text("No member notices yet.").listRowBackground(Color.xertInk)
            }
            ForEach(admin.announcements) { notice in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top) {
                        Text(notice.title).font(.headline)
                        Spacer()
                        Text(notice.stateLabel.uppercased())
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(notice.stateLabel == "Live" ? Color.green : Color.xertSteel)
                    }
                    Text(notice.body).font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.72)).lineLimit(4)
                    HStack {
                        Label(notice.tone.capitalized, systemImage: notice.tone == "urgent" ? "exclamationmark.triangle.fill" : "bell")
                        Spacer()
                        Text(notice.created_at.formatted(date: .abbreviated, time: .shortened))
                    }
                    .font(.caption).foregroundStyle(Color.xertPale.opacity(0.5))
                }
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 6)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Member Notices")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { composing = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New member notice")
            }
        }
        .sheet(isPresented: $composing) {
            AdminAnnouncementComposer(isPublishing: admin.isPublishingAnnouncement) { title, body, tone in
                Task {
                    if await admin.publishAnnouncement(session: session, title: title, body: body, tone: tone) {
                        composing = false
                    }
                }
            }
        }
    }
}

private struct AdminOperationsHealthView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let onOpenTask: (XertOwnerTask) -> Void
    let onOpenWorkspace: (XertOwnerWorkspace) -> Void
    @State private var pendingResolution: AdminCommerceHealth.WebhookDelivery.Incident?
    @State private var pendingRetry: AdminCommerceHealth.WebhookDelivery.Incident?
    @State private var copiedStripeEventID: String?

    private var unavailableHealthSources: [String] {
        admin.refreshUnavailableSources.filter { ["schema health", "Stripe health", "push health"].contains($0) }
    }

    private var databaseReady: Bool? {
        guard admin.loadedSources.contains("schema health"),
              !admin.refreshUnavailableSources.contains("schema health") else { return nil }
        return admin.missingSchemaCapabilities.isEmpty
    }

    private var stripeHealthIsCurrent: Bool {
        admin.loadedSources.contains("Stripe health")
            && !admin.refreshUnavailableSources.contains("Stripe health")
            && admin.commerceHealth != nil
    }

    private var pushHealthIsCurrent: Bool {
        admin.loadedSources.contains("push health")
            && !admin.refreshUnavailableSources.contains("push health")
            && admin.pushHealth != nil
    }

    private var databaseDetail: String {
        guard let databaseReady else {
            return admin.loadedSources.contains("schema health")
                ? "The last database snapshot is hidden until a live health check succeeds."
                : "Database capabilities could not be loaded. No readiness result is available."
        }
        return databaseReady
            ? "All \(AdminSchemaReadiness.required.count) required capabilities are installed."
            : "\(admin.missingSchemaCapabilities.count) required database capabilities are missing."
    }

    private func sourceIsCurrent(_ source: String) -> Bool {
        admin.loadedSources.contains(source) && !admin.refreshUnavailableSources.contains(source)
    }

    private var activeLinkedPacksReady: Bool? {
        guard sourceIsCurrent("session packs") else { return nil }
        return admin.products.contains { $0.active && $0.hasStableStripePriceID }
    }

    private var bookableClassesReady: Bool? {
        guard sourceIsCurrent("full timetable") else { return nil }
        let now = Date()
        return admin.classSessions.contains { item in
            item.status == "published"
                && item.public_visible == true
                && (item.start_time ?? .distantPast) > now
                && ["instant_book", "request_to_book"].contains(item.booking_mode ?? "instant_book")
                && (item.capacity ?? 0) > 0
        }
    }

    private var launchSwitches: (bookings: Bool?, payments: Bool?) {
        guard sourceIsCurrent("platform controls"), let settings = admin.settings else { return (nil, nil) }
        return (settings.bookings_enabled, settings.payments_enabled)
    }

    private var memberLaunchGate: XertOwnerLaunchGate {
        guard admin.launchGateUpdatedAt != nil else {
            return XertOwnerLaunchGate.resolve(
                databaseReady: nil,
                stripeReady: nil,
                activeLinkedPacksReady: nil,
                bookableClassesReady: nil,
                bookingsEnabled: nil,
                paymentsEnabled: nil
            )
        }
        return XertOwnerLaunchGate.resolve(
            databaseReady: databaseReady,
            stripeReady: stripeHealthIsCurrent ? admin.commerceHealth?.ready : nil,
            activeLinkedPacksReady: activeLinkedPacksReady,
            bookableClassesReady: bookableClassesReady,
            bookingsEnabled: launchSwitches.bookings,
            paymentsEnabled: launchSwitches.payments
        )
    }

    private var launchGateNextWorkspace: XertOwnerWorkspace? {
        guard databaseReady == true,
              stripeHealthIsCurrent,
              admin.commerceHealth?.ready == true else { return nil }
        if activeLinkedPacksReady == false { return .products }
        guard activeLinkedPacksReady == true else { return nil }
        if bookableClassesReady == false { return .timetable }
        guard bookableClassesReady == true else { return nil }
        if let bookings = launchSwitches.bookings,
           let payments = launchSwitches.payments,
           bookings != payments { return .controls }
        return nil
    }

    var body: some View {
        List {
            if !unavailableHealthSources.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(
                            "Live health is unavailable for \(unavailableHealthSources.joined(separator: ", ")). Last-known details are labelled below.",
                            systemImage: "wifi.exclamationmark"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        Button {
                            XertHaptics.play(.softImpact)
                            Task {
                                await admin.refreshHealth(session: session)
                                XertHaptics.play(unavailableHealthSources.isEmpty ? .success : .warning)
                            }
                        } label: {
                            Label(admin.isRefreshingHealth ? "Refreshing health…" : "Retry health checks", systemImage: "arrow.clockwise")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.orange)
                        .disabled(admin.isLoading || admin.isRefreshingHealth)
                    }
                    .listRowBackground(Color.xertInk)
                }
            }

            Section("Member launch gate") {
                VStack(alignment: .leading, spacing: 10) {
                    Label(memberLaunchGate.title, systemImage: launchGateIcon)
                        .font(.headline)
                        .foregroundStyle(launchGateColor)
                    Text(memberLaunchGate.detail)
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                    ProgressView(
                        value: Double(memberLaunchGate.completedChecks),
                        total: Double(XertOwnerLaunchGate.totalChecks)
                    )
                    .tint(launchGateColor)
                    Text("\(memberLaunchGate.completedChecks)/\(XertOwnerLaunchGate.totalChecks) required gates")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.xertPale.opacity(0.5))
                    if let nextAction = memberLaunchGate.nextAction {
                        Text("Next: \(nextAction)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button {
                        XertHaptics.play(.softImpact)
                        Task {
                            await admin.refreshHealth(session: session)
                            XertHaptics.play(memberLaunchGate.phase == .verifying ? .warning : .success)
                        }
                    } label: {
                        Label(admin.isRefreshingHealth ? "Refreshing launch gatesâ€¦" : "Refresh launch gates", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.xertSteel)
                    .disabled(
                        admin.isLoading
                            || admin.isRefreshingHealth
                            || admin.isSavingSettings
                            || admin.savingProductID != nil
                            || admin.savingClassID != nil
                            || admin.cancellingClassID != nil
                            || admin.resolvingStripeIncidentID != nil
                            || admin.retryingStripeIncidentID != nil
                    )
                    if let verifiedAt = admin.launchGateUpdatedAt {
                        Text("Verified \(verifiedAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.xertPale.opacity(0.48))
                    }
                    if let workspace = launchGateNextWorkspace {
                        Button { onOpenWorkspace(workspace) } label: {
                            Label("Open next gate", systemImage: "arrow.up.forward.square")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        .tint(Color.xertSteel)
                    }
                }
                .padding(.vertical, 4)
                .listRowBackground(Color.xertInk)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("owner.launchGate")
            }

            Section("Release readiness") {
                HealthStatusRow(
                    title: "Database contract",
                    ready: databaseReady,
                    detail: databaseDetail
                )
                HealthStatusRow(
                    title: "Stripe checkout",
                    ready: stripeHealthIsCurrent ? admin.commerceHealth?.ready : nil,
                    detail: commerceDetail
                )
                HealthStatusRow(
                    title: "Member push notifications",
                    ready: pushHealthIsCurrent ? admin.pushHealth?.ready : nil,
                    detail: pushDetail
                )
            }

            if databaseReady != nil && !admin.missingSchemaCapabilities.isEmpty {
                Section("Missing database capabilities") {
                    ForEach(admin.missingSchemaCapabilities, id: \.self) { capability in
                        Label(capability.replacingOccurrences(of: "_", with: " ").capitalized, systemImage: "exclamationmark.triangle")
                            .font(.subheadline).foregroundStyle(.orange)
                            .listRowBackground(Color.xertInk)
                    }
                }
            }
            if let commerce = admin.commerceHealth, stripeHealthIsCurrent {
                Section("Stripe launch checklist") {
                    HealthValueRow(label: "Mode", value: commerce.mode?.uppercased() ?? "Unknown")
                    HealthValueRow(
                        label: "Payment switch",
                        value: commerce.payment_switch?.state.uppercased() ?? "UNKNOWN"
                    )
                    HealthCheckRow(
                        label: commerce.activation_receipt?.required == true
                            ? "Activation receipt"
                            : "Activation receipt (when enabled)",
                        ready: commerce.activation_receipt?.ready == true
                    )
                    HealthCheckRow(
                        label: "Live settings immutable",
                        ready: commerce.activation_drift_guard_ready == true
                    )
                    if let activatedAt = commerce.activation_receipt?.activated_at {
                        HealthValueRow(
                            label: "Activated",
                            value: activatedAt.formatted(date: .abbreviated, time: .shortened)
                        )
                    }
                    HealthCheckRow(label: "Business verification", ready: commerce.account?.details_submitted == true)
                    HealthCheckRow(label: "Charges enabled", ready: commerce.account?.charges_enabled == true)
                    HealthCheckRow(label: "Payouts enabled", ready: commerce.account?.payouts_enabled == true)
                    HealthCheckRow(
                        label: "Active packs linked",
                        ready: commerce.active_product_count > 0 && commerce.stripe_price_count == commerce.active_product_count
                    )
                    HealthCheckRow(label: "Webhook registered", ready: commerce.webhook?.ready == true)
                    HealthCheckRow(label: "Webhook delivery ledger", ready: commerce.webhook_delivery?.ready == true)
                    HealthCheckRow(label: "Refund reconciliation", ready: commerce.refund_reconciliation_ready == true)
                    HealthCheckRow(label: "Checkout recovery", ready: commerce.checkout_reconciliation_ready == true)
                    if let delivery = commerce.webhook_delivery {
                        HealthCountRow(label: "Deliveries received (24h)", value: delivery.received)
                        HealthCountRow(label: "Delivery retries (24h)", value: delivery.retries)
                        HealthCountRow(label: "Failed or stalled", value: delivery.failed + delivery.stale_processing)
                    }
                }

                if let incidents = commerce.webhook_delivery?.incidents, !incidents.isEmpty {
                    Section("Unresolved Stripe incidents") {
                        ForEach(incidents) { incident in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(incident.status.uppercased())
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(.red)
                                    Text(incident.event_type)
                                        .font(.caption)
                                        .foregroundStyle(Color.xertPale.opacity(0.7))
                                        .lineLimit(2)
                                    Spacer()
                                    Button {
                                        UIPasteboard.general.string = incident.event_id
                                        copiedStripeEventID = incident.event_id
                                        XertHaptics.play(.success)
                                        Task {
                                            try? await Task.sleep(nanoseconds: 1_600_000_000)
                                            guard !Task.isCancelled, copiedStripeEventID == incident.event_id else { return }
                                            copiedStripeEventID = nil
                                        }
                                    } label: {
                                        Image(systemName: copiedStripeEventID == incident.event_id ? "checkmark.circle.fill" : "doc.on.doc")
                                            .frame(width: 44, height: 44)
                                    }
                                    .buttonStyle(.plain)
                                    .foregroundStyle(Color.xertSteel)
                                    .accessibilityLabel(copiedStripeEventID == incident.event_id ? "Stripe Event ID copied" : "Copy Stripe Event ID")
                                }
                                Text(incident.event_id)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(Color.xertPale.opacity(0.55))
                                    .textSelection(.enabled)
                                if let orderID = incident.order_id {
                                    Text("Order \(orderID.uuidString.lowercased())")
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(Color.xertPale.opacity(0.45))
                                        .textSelection(.enabled)
                                }
                                HStack(spacing: 12) {
                                    Text("\(incident.attempts) attempt\(incident.attempts == 1 ? "" : "s")")
                                    if let code = incident.error_code { Text(code) }
                                    if let received = incident.last_received_at {
                                        Text(received.formatted(date: .abbreviated, time: .shortened))
                                    }
                                }
                                .font(.caption2)
                                .foregroundStyle(Color.xertPale.opacity(0.45))
                                if let resolution = incident.resolution {
                                    Label(resolution, systemImage: "person.crop.circle.badge.exclamationmark")
                                        .font(.caption)
                                        .foregroundStyle(Color.orange)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Button {
                                        pendingResolution = incident
                                    } label: {
                                        Label("Mark handled", systemImage: "checkmark.seal")
                                    }
                                    .disabled(admin.resolvingStripeIncidentID != nil)
                                } else {
                                    Button {
                                        pendingRetry = incident
                                    } label: {
                                        Label("Retry safely", systemImage: "arrow.triangle.2.circlepath")
                                    }
                                    .disabled(admin.retryingStripeIncidentID != nil)
                                }
                            }
                            .padding(.vertical, 4)
                            .listRowBackground(Color.xertInk)
                        }
                    }
                }

                if let issues = commerce.issues, !issues.isEmpty {
                    Section("Stripe actions required") {
                        ForEach(Array(issues.enumerated()), id: \.offset) { _, issue in
                            if let product = product(for: issue) {
                                Button { onOpenTask(.product(product.id)) } label: {
                                    HStack(alignment: .top, spacing: 12) {
                                        Image(systemName: "exclamationmark.triangle")
                                            .foregroundStyle(Color.orange)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(product.name)
                                                .font(.headline)
                                                .foregroundStyle(Color.xertOffWhite)
                                            Text(issue.reason)
                                                .font(.caption)
                                                .foregroundStyle(Color.xertPale.opacity(0.68))
                                        }
                                        Spacer()
                                        Image(systemName: "arrow.up.forward.square")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(Color.xertSteel)
                                    }
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Opens the exact session pack blocking Stripe launch")
                                .listRowBackground(Color.xertInk)
                            } else if issue.slug == "activation-receipt" {
                                Button { onOpenWorkspace(.controls) } label: {
                                    launchIssueRow(issue, actionIcon: "switch.2")
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Opens Platform Controls")
                                .listRowBackground(Color.xertInk)
                            } else {
                                launchIssueRow(issue)
                                    .listRowBackground(Color.xertInk)
                            }
                        }
                    }
                }
            } else if let commerce = admin.commerceHealth {
                Section("Stripe — last snapshot") {
                    Label(
                        "Live verification failed. Actions and readiness checkmarks stay hidden until Stripe health refreshes successfully.",
                        systemImage: "lock.fill"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .listRowBackground(Color.xertInk)
                    HealthValueRow(label: "Last mode", value: commerce.mode?.uppercased() ?? "Unknown")
                    HealthCountRow(label: "Last active pack count", value: commerce.active_product_count)
                    HealthCountRow(label: "Last Stripe-linked count", value: commerce.stripe_price_count)
                }
            }
            if let push = admin.pushHealth, pushHealthIsCurrent {
                Section("APNs activity (24 hours)") {
                    HealthCountRow(label: "Production devices", value: push.subscriptions.production)
                    HealthCountRow(label: "Delivered", value: push.deliveries_24h.delivered)
                    HealthCountRow(label: "Failed", value: push.deliveries_24h.failed + push.deliveries_24h.invalid_token)
                }
            } else if let push = admin.pushHealth {
                Section("APNs — last snapshot") {
                    Label("Live push verification failed. These counts may be stale.", systemImage: "clock.badge.exclamationmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .listRowBackground(Color.xertInk)
                    HealthCountRow(label: "Last production devices", value: push.subscriptions.production)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Operations Health")
        .refreshable {
            await admin.refreshHealth(session: session)
        }
        .confirmationDialog(
            "Mark Stripe incident handled?",
            isPresented: Binding(
                get: { pendingResolution != nil },
                set: { if !$0 { pendingResolution = nil } }
            ),
            presenting: pendingResolution
        ) { incident in
            Button("Mark handled") {
                Task { _ = await admin.resolveStripeReview(session: session, incident: incident) }
            }
            Button("Keep unresolved", role: .cancel) {}
        } message: { incident in
            Text("Confirm that \(incident.event_type) has been reviewed and any required member credit action is complete. Stripe and order records remain unchanged.")
        }
        .confirmationDialog(
            "Retry Stripe event?",
            isPresented: Binding(
                get: { pendingRetry != nil },
                set: { if !$0 { pendingRetry = nil } }
            ),
            presenting: pendingRetry
        ) { incident in
            Button("Retry event") {
                Task { _ = await admin.retryStripeEvent(session: session, incident: incident) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { incident in
            Text("Retrieve \(incident.event_id) directly from Stripe and run it through XERT's idempotent recovery path. XERT verifies its identity and payment mode before processing.")
        }
    }

    private var launchGateIcon: String {
        switch memberLaunchGate.phase {
        case .preflightReady, .liveReady: return "checkmark.seal.fill"
        case .blocked: return "hand.raised.fill"
        case .verifying: return "questionmark.circle.fill"
        }
    }

    private var launchGateColor: Color {
        switch memberLaunchGate.phase {
        case .preflightReady, .liveReady: return .green
        case .blocked: return .red
        case .verifying: return .orange
        }
    }

    private var commerceDetail: String {
        guard stripeHealthIsCurrent, let health = admin.commerceHealth else {
            return admin.commerceHealth == nil
                ? "Stripe health could not be loaded. No readiness result is available."
                : "Live Stripe health failed. A last snapshot is available below, with all actions disabled."
        }
        if !health.environment.missing.isEmpty {
            return "Missing: \(health.environment.missing.joined(separator: ", "))."
        }
        let mode = health.mode?.uppercased() ?? "UNKNOWN"
        let payout = health.account?.payouts_enabled == true ? "payouts ready" : "payouts need attention"
        return "\(mode): \(health.active_product_count) active packs; \(health.stripe_price_count) Stripe-linked, \(health.dynamic_price_count) dynamic; \(payout)."
    }

    private func product(for issue: AdminCommerceHealth.Issue) -> AdminProduct? {
        admin.products.first {
            $0.slug.caseInsensitiveCompare(issue.slug) == .orderedSame
        }
    }

    private func launchIssueRow(
        _ issue: AdminCommerceHealth.Issue,
        actionIcon: String? = nil
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(Color.orange)
            Text(issue.reason)
                .font(.subheadline)
                .foregroundStyle(Color.xertPale)
            Spacer(minLength: 8)
            if let actionIcon {
                Image(systemName: actionIcon)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.xertSteel)
            }
        }
    }

    private var pushDetail: String {
        guard pushHealthIsCurrent, let health = admin.pushHealth else {
            return admin.pushHealth == nil
                ? "Push health could not be loaded. No delivery result is available."
                : "Live push health failed. The last device count is shown below as stale."
        }
        if !health.environment.missing.isEmpty {
            return "Missing: \(health.environment.missing.joined(separator: ", "))."
        }
        return "\(health.subscriptions.production) production device\(health.subscriptions.production == 1 ? "" : "s") registered."
    }
}

private struct HealthStatusRow: View {
    let title: String
    let ready: Bool?
    let detail: String

    private var icon: String {
        guard let ready else { return "questionmark.circle.fill" }
        return ready ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
    }

    private var colour: Color {
        guard let ready else { return Color.xertPale.opacity(0.55) }
        return ready ? .green : .orange
    }

    private var stateLabel: String {
        guard let ready else { return "Status unavailable" }
        return ready ? "Ready" : "Needs attention"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(colour)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline).foregroundStyle(Color.xertOffWhite)
                Text(detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.62))
            }
        }
        .listRowBackground(Color.xertInk)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(stateLabel). \(detail)")
    }

}

private struct HealthCheckRow: View {
    let label: String
    let ready: Bool

    var body: some View {
        HStack {
            Text(label).foregroundStyle(Color.xertPale)
            Spacer()
            Image(systemName: ready ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(ready ? Color.green : Color.orange)
                .accessibilityLabel(ready ? "Ready" : "Needs attention")
        }
        .listRowBackground(Color.xertInk)
    }
}

private struct HealthValueRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label).foregroundStyle(Color.xertPale)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.xertSteel)
        }
        .listRowBackground(Color.xertInk)
    }
}

private struct HealthCountRow: View {
    let label: String
    let value: Int

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value.formatted()).fontWeight(.bold)
        }
        .foregroundStyle(Color.xertOffWhite)
        .listRowBackground(Color.xertInk)
    }
}

private struct AdminAuditView: View {
    @ObservedObject var admin: AdminStore
    @State private var query = ""
    @State private var category = "All"

    private var categories: [String] {
        ["All"] + Set(admin.auditEntries.map(\.category)).sorted()
    }

    private var rows: [AdminAuditEntry] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return admin.auditEntries.filter { entry in
            (category == "All" || entry.category == category)
                && (term.isEmpty || "\(entry.title) \(entry.detail) \(entry.category)".lowercased().contains(term))
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Audit category", selection: $category) {
                    ForEach(categories, id: \.self) { Text($0).tag($0) }
                }
            }
            .listRowBackground(Color.xertNavy)

            if rows.isEmpty { Text("No matching administrative actions.").listRowBackground(Color.xertInk) }
            ForEach(rows) { entry in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: auditIcon(entry.category))
                        .frame(width: 24).foregroundStyle(Color.xertSteel)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(entry.title).font(.headline)
                            Spacer()
                            Text(entry.category.uppercased())
                                .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                        }
                        Text(entry.detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.62))
                        Text(entry.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption2).foregroundStyle(Color.xertPale.opacity(0.4))
                    }
                }
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 5)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Admin Audit")
        .searchable(text: $query, prompt: "Search changes")
    }

    private func auditIcon(_ category: String) -> String {
        switch category {
        case "Access": return "person.badge.key"
        case "Credits": return "ticket"
        case "Bookings", "Requests": return "calendar.badge.clock"
        case "Notices": return "bell"
        case "Content": return "square.and.pencil"
        case "Schedule": return "calendar"
        default: return "clock.arrow.circlepath"
        }
    }
}

private struct AdminProductsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let onOpenTask: (XertOwnerTask) -> Void
    @State private var query = ""
    @State private var filter: ProductFilter = .all
    @State private var showingCreate = false

    private enum ProductFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case active = "Live"
        case inactive = "Drafts"
        var id: String { rawValue }
    }

    private var activeProducts: [AdminProduct] { admin.products.filter(\.active) }
    private var liveBlockedProducts: [AdminProduct] { activeProducts.filter { !$0.hasStableStripePriceID } }
    private var pricingDataIsCurrent: Bool {
        admin.loadedSources.contains("session packs")
            && !admin.refreshUnavailableSources.contains("session packs")
    }
    private var pricingDataIsPending: Bool {
        !admin.hasCompletedRefresh && !admin.loadedSources.contains("session packs")
    }
    private var pricingDataUnavailable: Bool {
        !pricingDataIsCurrent && !pricingDataIsPending
    }
    private var pricingMutationAvailable: Bool {
        pricingDataIsCurrent && !admin.isLoading
    }
    private var stripeHealthIsCurrent: Bool {
        admin.loadedSources.contains("Stripe health")
            && !admin.refreshUnavailableSources.contains("Stripe health")
            && admin.commerceHealth != nil
    }
    private var stripeHealthUnavailable: Bool {
        !stripeHealthIsCurrent && admin.hasCompletedRefresh
    }
    private var isLiveReady: Bool {
        pricingDataIsCurrent
            && stripeHealthIsCurrent
            && admin.commerceHealth?.ready == true
            && !activeProducts.isEmpty
            && liveBlockedProducts.isEmpty
    }
    private var visibleProducts: [AdminProduct] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return admin.products.filter { product in
            let matchesFilter = filter == .all || (filter == .active ? product.active : !product.active)
            let matchesQuery = term.isEmpty || "\(product.name) \(product.slug) \(product.description ?? "")"
                .lowercased().contains(term)
            return matchesFilter && matchesQuery
        }
    }

    var body: some View {
        List {
            Section {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: isLiveReady ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundStyle(isLiveReady ? Color.green : Color.orange)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("LIVE STRIPE READINESS").font(.caption.weight(.bold))
                        if pricingDataIsPending || (admin.isLoading && !pricingDataIsCurrent) {
                            Text("Checking session-pack and Stripe readiness…")
                        } else if pricingDataUnavailable || stripeHealthUnavailable {
                            Text("Pricing or Stripe health could not be refreshed. The last visible setup may be stale.")
                            Text("Return to Overview and retry unavailable data before changing checkout.")
                                .foregroundStyle(Color.xertPale.opacity(0.5))
                        } else if activeProducts.isEmpty {
                            Text("Create a pack, attach its live Stripe Price ID, then make it active when it is ready for sale.")
                        } else if isLiveReady {
                            Text("Stripe has verified all \(activeProducts.count) active packs and the checkout service is ready.")
                        } else if liveBlockedProducts.isEmpty {
                            Text("All active packs have Price IDs, but Stripe launch checks still need attention.")
                            Text("Review Operations Health before enabling checkout.")
                                .foregroundStyle(Color.xertPale.opacity(0.5))
                        } else {
                            Text("\(liveBlockedProducts.count) of \(activeProducts.count) active packs block live checkout: \(liveBlockedProducts.map(\.slug).joined(separator: ", ")).")
                            Text("Test checkout may use dynamic prices. Live checkout requires a live price_ ID.")
                                .foregroundStyle(Color.xertPale.opacity(0.5))
                        }
                        Text("These are one-off session packs, not recurring subscriptions. Changes affect new purchases only; existing credits keep their original terms.")
                            .foregroundStyle(Color.xertPale.opacity(0.5))
                    }
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.75))
                }
                .padding(.vertical, 5)
                .listRowBackground(Color.xertInk)
            }

            Section {
                Picker("Sale status", selection: $filter) {
                    ForEach(ProductFilter.allCases) { option in Text(option.rawValue).tag(option) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.xertInk)
            }

            if pricingDataIsPending {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading session packs…")
                        .foregroundStyle(Color.xertPale.opacity(0.7))
                }
                .accessibilityElement(children: .combine)
                .listRowBackground(Color.xertInk)
            } else if pricingDataUnavailable {
                Label("Session-pack data is unavailable. Cached rows below may be stale.", systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .foregroundStyle(.orange)
                    .listRowBackground(Color.xertInk)
            } else if visibleProducts.isEmpty {
                Text(admin.products.isEmpty ? "No session packs configured." : "No packs match this search and filter.")
                    .foregroundStyle(Color.xertPale.opacity(0.7))
                    .listRowBackground(Color.xertInk)
            }
            ForEach(visibleProducts) { product in
                Button { onOpenTask(.product(product.id)) } label: {
                    AdminProductRow(product: product, dataIsStale: pricingDataUnavailable)
                }
                .buttonStyle(.plain)
                .disabled(!pricingMutationAvailable)
                .accessibilityIdentifier("owner.product.\(product.id.uuidString.lowercased())")
                .accessibilityHint(
                    pricingMutationAvailable
                        ? "Opens this session pack to review pricing and sale state"
                        : "Refresh Session Packs & Pricing before editing this pack"
                )
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Session Packs & Pricing")
        .searchable(text: $query, prompt: "Search packs")
        .accessibilityIdentifier("owner.products.list")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button { showingCreate = true } label: {
                Label("Create session pack", systemImage: "plus.circle.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.xertNavy)
            .background(Color.xertSteel)
            .disabled(!pricingMutationAvailable)
            .opacity(pricingMutationAvailable ? 1 : 0.45)
            .accessibilityLabel("Create a new session pack")
            .accessibilityHint(
                pricingMutationAvailable
                    ? "Opens a private session-pack draft"
                    : "Wait for a current session-pack refresh before creating a pack"
            )
            .accessibilityIdentifier("owner.products.create")
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                AdminProductEditor(
                    admin: admin,
                    session: session,
                    product: nil,
                    suggestedSortOrder: (admin.products.map(\.sort_order).max() ?? -1) + 1
                )
            }
        }
    }
}

private struct AdminProductRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let product: AdminProduct
    let dataIsStale: Bool

    private var hasMalformedStripePriceID: Bool {
        let value = product.stripe_price_id?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return !value.isEmpty && !product.hasStableStripePriceID
    }

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    identity
                    status
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    identity
                    Spacer(minLength: 8)
                    status
                }
            }
        }
        .foregroundStyle(Color.xertOffWhite)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(product.name).font(.headline).fixedSize(horizontal: false, vertical: true)
                if product.featured {
                    Text("FEATURED")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.orange)
                        .fixedSize()
                }
            }
            Text("\(product.sessions_count) sessions · \(product.validity_days) days · \(product.displayPrice)")
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
            Text("\(product.displayPricePerSession) per session")
                .font(.caption2)
                .foregroundStyle(Color.xertPale.opacity(0.5))
        }
    }

    private var status: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(product.active ? "LIVE" : "DRAFT")
                .font(.caption2.weight(.bold))
                .foregroundStyle(
                    dataIsStale
                        ? Color.orange
                        : hasMalformedStripePriceID
                            ? Color.red
                            : product.active ? Color.green : Color.xertPale.opacity(0.55)
                )
            if dataIsStale {
                Label("Pricing data stale", systemImage: "clock.badge.exclamationmark")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            } else if hasMalformedStripePriceID {
                Label("Malformed Price ID", systemImage: "xmark.circle.fill")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            } else if product.active {
                Label(product.hasStableStripePriceID ? "Price ID entered" : "Checkout blocked",
                      systemImage: product.hasStableStripePriceID ? "checkmark.circle" : "exclamationmark.triangle")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(product.hasStableStripePriceID ? Color.green : Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct AdminProductEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let product: AdminProduct?
    private let baseline: AdminProductDraft
    @State private var draft: AdminProductDraft
    @State private var confirmingDiscard = false
    @State private var confirmingPriceProvision = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case slug, name, description, price, currency, stripePrice }

    init(
        admin: AdminStore,
        session: AuthSession,
        product: AdminProduct?,
        suggestedSortOrder: Int = 0
    ) {
        self.admin = admin
        self.session = session
        self.product = product
        let initial = product.map { AdminProductDraft(product: $0) }
            ?? AdminProductDraft(suggestedSortOrder: suggestedSortOrder)
        baseline = initial
        _draft = State(initialValue: initial)
    }

    private var normalizedStripePriceID: String {
        draft.stripePriceID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var stripePriceIDHasValidSyntax: Bool {
        normalizedStripePriceID.range(
            of: #"^price_[A-Za-z0-9]+$"#,
            options: .regularExpression
        ) != nil
    }

    private var isCreating: Bool { product == nil }
    private var isDirty: Bool { draft != baseline }
    private var isSaving: Bool { admin.savingProductID != nil }
    private var isProvisioningPrice: Bool { admin.provisioningProductPriceID == product?.id }
    private var isProductMutationInFlight: Bool { isSaving || isProvisioningPrice }
    private var pricingDataIsCurrent: Bool {
        admin.loadedSources.contains("session packs")
            && !admin.refreshUnavailableSources.contains("session packs")
    }
    private var pricingMutationAvailable: Bool {
        pricingDataIsCurrent && !admin.isLoading
    }
    private var validationMessage: String? { draft.validationMessage(existingProduct: product) }
    private var canSave: Bool {
        isDirty && validationMessage == nil && !isProductMutationInFlight && pricingMutationAvailable
    }

    var body: some View {
        Form {
            if !pricingMutationAvailable {
                Section {
                    Label(
                        pricingDataIsCurrent
                            ? "Session packs are refreshing. Editing will resume when the current catalogue settles."
                            : "Session-pack data is unavailable. Retry before changing prices or sale state.",
                        systemImage: pricingDataIsCurrent ? "arrow.clockwise" : "clock.badge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(pricingDataIsCurrent ? Color.xertSteel : Color.orange)
                    Button {
                        Task { await admin.refresh(session: session) }
                    } label: {
                        Label(admin.isLoading ? "Refreshing…" : "Retry session packs", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(pricingDataIsCurrent ? Color.xertSteel : Color.orange)
                    .disabled(admin.isLoading)
                }
            }
            Section("Pack details") {
                if isCreating {
                    TextField("Permanent ID (for example starter-6)", text: $draft.slug)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .slug)
                    Text("The permanent ID becomes part of checkout records and cannot be edited later.")
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                } else if let product {
                    LabeledContent("Permanent ID", value: product.slug)
                }
                TextField("Name", text: $draft.name)
                    .focused($focusedField, equals: .name)
                TextField("Description", text: $draft.description, axis: .vertical)
                    .lineLimit(2...5)
                    .focused($focusedField, equals: .description)
                TextField("Price in \(draft.currency.uppercased())", text: $draft.price)
                    .keyboardType(.decimalPad)
                    .focused($focusedField, equals: .price)
                    .accessibilityIdentifier("owner.productEditor.price")
                TextField("Currency", text: $draft.currency)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .focused($focusedField, equals: .currency)
            }
            .disabled(!pricingMutationAvailable || isProductMutationInFlight)
            Section("Credits") {
                Stepper("Sessions: \(draft.sessions)", value: $draft.sessions, in: 1...1_000)
                Stepper("Validity: \(draft.validityDays) days", value: $draft.validityDays, in: 1...3_650)
                Stepper("Display order: \(draft.sortOrder)", value: $draft.sortOrder, in: 0...10_000)
                if let cents = draft.normalizedPriceCents, draft.sessions > 0 {
                    let amount = Double(cents) / 100 / Double(draft.sessions)
                    LabeledContent("Price per session", value: amount.formatted(.currency(code: draft.currency.uppercased())))
                }
            }
            .disabled(!pricingMutationAvailable || isProductMutationInFlight)
            Section("Sale state") {
                Toggle("Featured pack", isOn: $draft.featured)
                if isCreating {
                    Label("New packs are saved as private drafts with no Stripe link.", systemImage: "lock.fill")
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.7))
                    Text("After creating it, add the matching Stripe Price ID and make it active when checkout is ready.")
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                } else {
                    Toggle("Active and purchasable", isOn: $draft.active)
                    TextField("Stripe Price ID (required for live checkout)", text: $draft.stripePriceID)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focusedField, equals: .stripePrice)
                    if draft.active && normalizedStripePriceID.isEmpty {
                        Label("Add a Stripe Price ID before making this pack live.", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption).foregroundStyle(.orange)
                    } else if !normalizedStripePriceID.isEmpty && !stripePriceIDHasValidSyntax {
                        Label("Malformed Price ID. Use price_ followed by letters and numbers.", systemImage: "xmark.circle.fill")
                            .font(.caption).foregroundStyle(.red)
                    } else if stripePriceIDHasValidSyntax && draft.active && !isDirty && product?.active == true {
                        Label("Price ID linked. Checkout re-verifies every commercial term before charging.", systemImage: "checkmark.shield")
                            .font(.caption).foregroundStyle(.green)
                    } else if stripePriceIDHasValidSyntax && draft.active {
                        Label("Stripe will verify this Price and every pack term when you save.", systemImage: "arrow.triangle.2.circlepath")
                            .font(.caption).foregroundStyle(.orange)
                    } else if stripePriceIDHasValidSyntax {
                        Label("Price ID entered. Stripe verification runs when this pack is activated.", systemImage: "clock.badge.checkmark")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.65))
                    }
                    if product?.stripe_price_id != nil {
                        Text("Clear or replace the Stripe Price ID before changing price, currency, sessions or validity.")
                            .font(.caption).foregroundStyle(.orange)
                    }
                    if let product,
                       !product.active,
                       product.stripe_price_id == nil,
                       !isDirty {
                        Button {
                            confirmingPriceProvision = true
                        } label: {
                            Label(
                                isProvisioningPrice ? "Preparing Stripe Price..." : "Create & link exact Stripe Price",
                                systemImage: "link.badge.plus"
                            )
                            .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        .disabled(isProvisioningPrice || !pricingMutationAvailable)
                    }
                }
            }
            .disabled(!pricingMutationAvailable || isProductMutationInFlight)

            if let validationMessage, isDirty || !isCreating {
                Section {
                    Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityLabel("Cannot save. \(validationMessage)")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(Color.xertNavy)
        .navigationTitle(isCreating ? "New Session Pack" : product?.name ?? "Session Pack")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("owner.productEditor.form")
        .interactiveDismissDisabled(isDirty || isProductMutationInFlight)
        .safeAreaInset(edge: .bottom, spacing: 0) { saveBar }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { requestDismiss() }
                    .disabled(isProductMutationInFlight)
                    .accessibilityIdentifier("owner.productEditor.close")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
        .confirmationDialog(
            "Discard unsaved pack changes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("The session-pack pricing details in this draft have not been saved.")
        }
        .confirmationDialog(
            "Create this exact Stripe Price?",
            isPresented: $confirmingPriceProvision,
            titleVisibility: .visible
        ) {
            Button("Create Stripe Price") {
                guard let product else { return }
                Task {
                    if await admin.provisionProductPrice(session: session, product: product) != nil {
                        dismiss()
                    }
                }
            }
            Button("Keep private", role: .cancel) {}
        } message: {
            Text("XERT creates or reuses the exact one-time Stripe Price and links it to this draft. The pack stays private until you activate it separately.")
        }
    }

    private var saveBar: some View {
        Button { save() } label: {
            HStack(spacing: 10) {
                if isSaving { ProgressView().tint(Color.xertNavy) }
                Text(isCreating ? "Create private draft" : "Save pricing changes")
                    .font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.xertNavy)
        .background(canSave ? Color.xertSteel : Color.xertSteel.opacity(0.45))
        .disabled(!canSave)
        .accessibilityIdentifier("owner.productEditor.save")
        .accessibilityHint(validationMessage ?? "Saves this session pack")
    }

    private func requestDismiss() {
        focusedField = nil
        if isDirty { confirmingDiscard = true }
        else { dismiss() }
    }

    private func save() {
        guard canSave else { return }
        focusedField = nil
        Task {
            if await admin.saveProduct(session: session, product: product, draft: draft) {
                XertHaptics.play(.success)
                dismiss()
            } else {
                XertHaptics.play(.error)
            }
        }
    }
}

private struct AdminEventsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let onOpenTask: (XertOwnerTask) -> Void
    @State private var query = ""
    @State private var showingCreate = false
    @State private var rosterEvent: AdminEvent?
    @State private var pendingDelete: AdminEvent?

    private var rows: [AdminEvent] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return admin.events }
        return admin.events.filter {
            "\($0.name) \($0.category ?? "") \($0.location ?? "")".lowercased().contains(term)
        }
    }

    var body: some View {
        List {
            if rows.isEmpty { Text("No matching calendar events.").listRowBackground(Color.xertInk) }
            ForEach(rows) { event in
                VStack(alignment: .leading, spacing: 10) {
                    Button { onOpenTask(.event(event.id)) } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(event.name).font(.headline)
                                Spacer()
                                Text(event.published ? "LIVE" : "HIDDEN")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(event.published ? Color.green : Color.xertPale.opacity(0.45))
                                Image(systemName: "chevron.right")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(Color.xertSteel)
                            }
                            Text([event.event_date ?? "Date TBC", event.location].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                        }
                        .foregroundStyle(Color.xertOffWhite)
                    }
                    .buttonStyle(.plain)
                    HStack(spacing: 18) {
                        Button {
                            rosterEvent = event
                            Task { await admin.loadEventRoster(session: session, eventID: event.id) }
                        } label: {
                            Label("\(admin.eventGoalCounts[event.id, default: 0]) training", systemImage: "person.3")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.xertSteel)

                        Spacer()
                        Button(role: .destructive) { pendingDelete = event } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.plain)
                        .disabled(admin.deletingEventID != nil)
                        .accessibilityLabel("Delete \(event.name)")
                    }
                    .font(.caption.weight(.semibold))
                }
                .padding(.vertical, 6)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Event Calendar")
        .searchable(text: $query, prompt: "Search events")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add event")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                AdminEventEditor(admin: admin, session: session, event: nil)
            }
        }
        .sheet(item: $rosterEvent) { event in
            AdminEventRosterView(admin: admin, event: event)
        }
        .confirmationDialog(
            "Delete calendar event?",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            presenting: pendingDelete
        ) { event in
            Button("Delete \(event.name)", role: .destructive) {
                Task {
                    _ = await admin.deleteEvent(session: session, event: event)
                    pendingDelete = nil
                }
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: { event in
            let count = admin.eventGoalCounts[event.id, default: 0]
            Text(count > 0
                 ? "This also removes \(count) member training goal\(count == 1 ? "" : "s"). This cannot be undone."
                 : "This removes the event from the shared web and iOS calendar. This cannot be undone.")
        }
    }
}

private struct AdminEventEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let event: AdminEvent?
    private let baseline: AdminEventDraft
    @State private var draft: AdminEventDraft

    init(admin: AdminStore, session: AuthSession, event: AdminEvent?) {
        let initialDraft = AdminEventDraft(event: event)
        self.admin = admin
        self.session = session
        self.event = event
        baseline = initialDraft
        _draft = State(initialValue: initialDraft)
    }

    var body: some View {
        Form {
            Section("Event") {
                TextField("Event name", text: $draft.name)
                Picker("Category", selection: $draft.category) {
                    ForEach(AdminEventDraft.categories, id: \.self) { Text($0.capitalized).tag($0) }
                }
                Toggle("Start date confirmed", isOn: $draft.hasStartDate)
                if draft.hasStartDate {
                    DatePicker("Start date", selection: $draft.startDate, displayedComponents: .date)
                }
                Toggle("Multi-day event", isOn: $draft.hasEndDate)
                    .disabled(!draft.hasStartDate)
                if draft.hasStartDate && draft.hasEndDate {
                    DatePicker("End date", selection: $draft.endDate, in: draft.startDate..., displayedComponents: .date)
                }
            }
            Section("Location and link") {
                TextField("Location", text: $draft.location)
                TextField("Region", text: $draft.region)
                TextField("Official website", text: $draft.url)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Section("Publishing") {
                Toggle("Published on web and iOS", isOn: $draft.published)
                Stepper("Display order: \(draft.sortOrder)", value: $draft.sortOrder, in: 0...10_000)
            }
            Section {
                Button {
                    Task {
                        if await admin.saveEvent(session: session, event: event, draft: draft) { dismiss() }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if admin.savingEventID != nil { ProgressView().tint(Color.xertNavy) }
                        Text(event == nil ? "Create event" : "Save event").fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(admin.savingEventID != nil || draft == baseline)
                .listRowBackground(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(event == nil ? "New Event" : "Edit Event")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if event == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .onChange(of: draft.hasStartDate) { enabled in
            if !enabled { draft.hasEndDate = false }
        }
    }
}

private struct AdminEventRosterView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let event: AdminEvent

    private var scopedRoster: [AdminEventGoalMember] {
        admin.loadedEventRosterID == event.id ? admin.eventRoster : []
    }

    var body: some View {
        NavigationStack {
            List {
                if admin.loadingEventRosterID == event.id {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if scopedRoster.isEmpty {
                    Text("No members are training toward this event yet.")
                } else {
                    ForEach(scopedRoster) { member in
                        VStack(alignment: .leading, spacing: 7) {
                            Text(member.displayName).font(.headline)
                            if let email = nonempty(member.email) {
                                Link(email, destination: URL(string: "mailto:\(email)")!)
                            }
                            if let phone = nonempty(member.phone),
                               let number = phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                               let url = URL(string: "tel:\(number)") {
                                Link(phone, destination: url)
                            }
                            Text("Joined \(member.selected_at.formatted(date: .abbreviated, time: .omitted))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle(event.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private func nonempty(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct AdminCoachesView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var showingCreate = false
    @State private var pendingDelete: AdminCoach?

    var body: some View {
        List {
            if admin.coaches.isEmpty { Text("No team profiles configured.").listRowBackground(Color.xertInk) }
            ForEach(admin.coaches) { coach in
                HStack(alignment: .top, spacing: 12) {
                    if let photoURL = URL(string: coach.photo_url ?? ""), !(coach.photo_url ?? "").isEmpty {
                        XertRemoteImage(url: photoURL, maximumPointDimension: 64) {
                            Image(systemName: "person.crop.square").foregroundStyle(Color.xertSteel)
                        }
                        .frame(width: 52, height: 60)
                        .background(Color.xertNavy)
                        .clipped()
                    } else {
                        Image(systemName: "person.crop.square")
                            .foregroundStyle(Color.xertSteel)
                            .frame(width: 52, height: 60)
                            .background(Color.xertNavy)
                    }

                    VStack(alignment: .leading, spacing: 5) {
                        NavigationLink {
                            AdminCoachEditor(admin: admin, session: session, coach: coach)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(coach.name).font(.headline)
                                Text([coach.role, coach.experience].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                            }
                        }
                        HStack {
                            Text(coach.category.uppercased()).foregroundStyle(Color.xertSteel)
                            Text(coach.published ? "LIVE" : "HIDDEN")
                                .foregroundStyle(coach.published ? Color.green : Color.xertPale.opacity(0.45))
                            Spacer()
                            Button(role: .destructive) { pendingDelete = coach } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.plain)
                            .disabled(admin.deletingCoachID != nil)
                            .accessibilityLabel("Delete \(coach.name)")
                        }
                        .font(.caption2.weight(.bold))
                    }
                    .foregroundStyle(Color.xertOffWhite)
                }
                .padding(.vertical, 5)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("XERT Team")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add team member")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack { AdminCoachEditor(admin: admin, session: session, coach: nil) }
        }
        .confirmationDialog(
            "Delete team member?",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            presenting: pendingDelete
        ) { coach in
            Button("Delete \(coach.name)", role: .destructive) {
                Task {
                    _ = await admin.deleteCoach(session: session, coach: coach)
                    pendingDelete = nil
                }
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: { coach in
            Text("\(coach.name) will be removed from the public team page. This cannot be undone.")
        }
    }
}

private struct AdminCoachEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let coach: AdminCoach?
    private let baseline: AdminCoachDraft
    @State private var draft: AdminCoachDraft

    init(admin: AdminStore, session: AuthSession, coach: AdminCoach?) {
        let initialDraft = AdminCoachDraft(coach: coach)
        self.admin = admin
        self.session = session
        self.coach = coach
        baseline = initialDraft
        _draft = State(initialValue: initialDraft)
    }

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Name", text: $draft.name)
                Picker("Category", selection: $draft.category) {
                    Text("Coach").tag("coach")
                    Text("Nutritionist").tag("nutritionist")
                    Text("Massage therapist").tag("massage")
                    Text("Physiotherapist").tag("physio")
                }
                TextField("Role", text: $draft.role)
                TextField("Biography", text: $draft.bio, axis: .vertical).lineLimit(3...8)
                TextField("Experience", text: $draft.experience)
                TextField("Currently training for", text: $draft.currentlyTrainingFor)
            }
            Section("Media") {
                TextField("Photo URL", text: $draft.photoURL)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                if let url = URL(string: draft.photoURL), !draft.photoURL.isEmpty {
                    XertRemoteImage(url: url, maximumPointDimension: 640) {
                        ProgressView().tint(Color.xertSteel)
                    }
                    .frame(height: 180)
                    .frame(maxWidth: .infinity)
                    .clipped()
                }
                TextField("Social link", text: $draft.socialURL)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Section("Publishing") {
                Toggle("Published on the website", isOn: $draft.published)
                Stepper("Display order: \(draft.sortOrder)", value: $draft.sortOrder, in: 0...10_000)
            }
            Section {
                Button {
                    Task {
                        if await admin.saveCoach(session: session, coach: coach, draft: draft) { dismiss() }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if admin.savingCoachID != nil { ProgressView().tint(Color.xertNavy) }
                        Text(coach == nil ? "Create profile" : "Save profile").fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(admin.savingCoachID != nil || draft == baseline)
                .listRowBackground(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(coach == nil ? "New Team Member" : "Edit Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if coach == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}

private struct AdminAnnouncementComposer: View {
    @Environment(\.dismiss) private var dismiss
    let isPublishing: Bool
    let onPublish: (String, String, String) -> Void
    @State private var title = ""
    @State private var noticeBody = ""
    @State private var tone = "info"
    @State private var confirming = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Member notice") {
                    TextField("Title", text: $title)
                    TextEditor(text: $noticeBody).frame(minHeight: 180)
                    Text("\(noticeBody.count)/2000").font(.caption).foregroundStyle(.secondary)
                    Picker("Priority", selection: $tone) {
                        Text("Information").tag("info")
                        Text("Action requested").tag("action")
                        Text("Urgent").tag("urgent")
                    }
                }
                Section {
                    Text("Publishing makes this visible immediately in member accounts and requests Apple push delivery for enabled devices.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Notice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(isPublishing) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isPublishing ? "Publishing..." : "Publish") { confirming = true }
                        .disabled(isPublishing || title.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || noticeBody.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
                }
            }
            .confirmationDialog("Publish this member notice now?", isPresented: $confirming, titleVisibility: .visible) {
                Button("Publish to members") { onPublish(title, String(noticeBody.prefix(2_000)), tone) }
                Button("Keep editing", role: .cancel) {}
            } message: {
                Text("The notice becomes live on the website and iOS app, and push delivery starts immediately.")
            }
        }
    }
}

private enum AdminOwnerQuickAction: String, Identifiable {
    case newClass
    case newNotice
    case newSessionPack

    var id: String { rawValue }
}

private enum AdminDashboardDataState: Equatable {
    case loading
    case current
    case stale
    case unavailable

    var accessibilityDescription: String {
        switch self {
        case .loading: return "loading"
        case .current: return "current"
        case .stale: return "from the last loaded snapshot"
        case .unavailable: return "unavailable"
        }
    }
}

private struct AdminOwnerFreshnessBadge: View {
    let isLoading: Bool
    let unavailableCount: Int
    let updatedAt: Date?

    private var label: String {
        if isLoading { return "Refreshing" }
        if unavailableCount > 0 { return "Partial data" }
        if let updatedAt { return "Updated \(updatedAt.formatted(date: .omitted, time: .shortened))" }
        return "Connecting"
    }

    private var icon: String {
        if isLoading { return "arrow.clockwise" }
        if unavailableCount > 0 { return "exclamationmark.triangle.fill" }
        if updatedAt != nil { return "checkmark.circle.fill" }
        return "antenna.radiowaves.left.and.right"
    }

    private var colour: Color {
        unavailableCount > 0 ? .orange : Color.xertSteel
    }

    var body: some View {
        Label(label, systemImage: icon)
            .font(.caption.weight(.bold))
            .foregroundStyle(colour)
            .padding(.horizontal, 10)
            .frame(minHeight: 32)
            .background(colour.opacity(0.12))
            .clipShape(Capsule())
            .fixedSize(horizontal: true, vertical: false)
            .accessibilityLabel(
                isLoading
                    ? "Refreshing Command Centre data"
                    : unavailableCount > 0
                        ? "Partial Command Centre data, \(unavailableCount) services unavailable"
                        : updatedAt.map { "Command Centre data updated at \($0.formatted(date: .omitted, time: .shortened))" }
                            ?? "Connecting Command Centre data"
            )
    }
}

private struct AdminQuickToolButton: View {
    let title: String
    let detail: String
    let icon: String
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(Color.xertSteel.opacity(isEnabled ? 0.14 : 0.07))
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(isEnabled ? Color.xertSteel : Color.xertPale.opacity(0.35))
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(isEnabled ? Color.xertOffWhite : Color.xertPale.opacity(0.45))
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(isEnabled ? Color.xertPale.opacity(0.62) : Color.orange.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                Image(systemName: "arrow.up.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(isEnabled ? Color.xertSteel : Color.xertPale.opacity(0.25))
            }
            .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .xertCardStyle()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel("\(title). \(detail)")
        .accessibilityHint(isEnabled ? "Opens this owner tool" : "Retry Command Centre data to enable this tool")
    }
}

private struct AdminPriorityAction: Identifiable {
    let title: String
    let detail: String
    let icon: String
    let count: Int
    let workspace: XertOwnerWorkspace
    var task: XertOwnerTask? = nil
    var isCritical = false

    var route: XertOwnerRoute {
        task.map { XertOwnerRoute(task: $0) } ?? XertOwnerRoute(workspace: workspace)
    }

    var id: String { "\(route.restorationValue):\(title)" }
}

private struct AdminPriorityRow: View {
    let priority: AdminPriorityAction
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 14) {
                    priorityIcon
                    priorityCopy
                    Spacer(minLength: 8)
                    countBadge
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.xertSteel)
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        priorityIcon
                        Text(priority.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.xertOffWhite)
                        Spacer(minLength: 8)
                        countBadge
                    }
                    Text(priority.detail)
                        .font(.subheadline)
                        .foregroundStyle(Color.xertPale.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                    HStack {
                        if priority.isCritical {
                            Label("Critical", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(Color.red)
                        }
                        Spacer()
                        Label("Open workspace", systemImage: "arrow.right")
                            .foregroundStyle(Color.xertSteel)
                    }
                    .font(.caption.weight(.bold))
                }
            }
            .padding(14)
            .xertCardStyle()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(priority.isCritical ? "Critical, " : "")\(priority.title), \(priority.count)")
        .accessibilityHint(priority.detail)
    }

    private var priorityIcon: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill((priority.isCritical ? Color.red : Color.xertSteel).opacity(0.14))
            Image(systemName: priority.icon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(priority.isCritical ? Color.red : Color.xertSteel)
        }
        .frame(width: 42, height: 42)
    }

    private var priorityCopy: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(priority.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.xertOffWhite)
            Text(priority.detail)
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.72))
                .lineLimit(2)
        }
    }

    private var countBadge: some View {
        Text(priority.count > 99 ? "99+" : priority.count.formatted())
            .font(.caption.weight(.black))
            .foregroundStyle(priority.isCritical ? Color.white : Color.xertNavy)
            .padding(.horizontal, 8)
            .frame(minWidth: 30, minHeight: 26)
            .background(priority.isCritical ? Color.red : Color.xertSteel)
            .clipShape(Capsule())
    }
}

private struct AdminOperationalDataWarning: View {
    let unavailableSources: [String]

    var body: some View {
        Label {
            Text("Partial data: \(unavailableSources.joined(separator: ", ")). Existing items remain available; pull to retry.")
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "exclamationmark.triangle.fill")
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(Color.orange)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.orange.opacity(0.08))
        .overlay {
            RoundedRectangle(cornerRadius: 2)
                .stroke(Color.orange.opacity(0.42), lineWidth: 1)
        }
        .accessibilityLabel("Operational data is partial. Unavailable: \(unavailableSources.joined(separator: ", "))")
    }
}

private struct AdminRefreshDataWarning: View {
    let unavailableSources: [String]
    let cachedSources: Set<String>
    let isRetrying: Bool
    let onRetry: () -> Void
    @State private var showingDetails = false

    private var retainedSourceCount: Int {
        unavailableSources.filter(cachedSources.contains).count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(unavailableSources.count) data service\(unavailableSources.count == 1 ? "" : "s") need\(unavailableSources.count == 1 ? "s" : "") attention")
                        .font(.subheadline.weight(.bold))
                    Text(retainedSourceCount > 0
                        ? "\(retainedSourceCount) area\(retainedSourceCount == 1 ? " is" : "s are") showing the last loaded snapshot. Other available tools still work."
                        : "Unavailable totals are hidden so they cannot be mistaken for zero. Other available tools still work.")
                        .font(.caption)
                        .foregroundStyle(Color.orange.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                }
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill")
            }

            DisclosureGroup(isExpanded: $showingDetails) {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(unavailableSources, id: \.self) { source in
                        Label(
                            source.capitalized + (cachedSources.contains(source) ? " — last snapshot" : " — unavailable"),
                            systemImage: cachedSources.contains(source) ? "clock.badge.exclamationmark" : "xmark.circle"
                        )
                    }
                }
                .font(.caption)
                .padding(.top, 8)
            } label: {
                Text(showingDetails ? "Hide affected areas" : "Show affected areas")
                    .font(.caption.weight(.bold))
            }
            .tint(Color.orange)

            Button(action: onRetry) {
                HStack(spacing: 8) {
                    if isRetrying {
                        ProgressView().tint(Color.xertNavy)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                    Text(isRetrying ? "Retrying…" : "Retry unavailable data")
                }
                .font(.subheadline.weight(.bold))
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.orange)
            .disabled(isRetrying)
            .accessibilityLabel(isRetrying ? "Retrying unavailable Command Centre data" : "Retry unavailable Command Centre data")
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Color.orange)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.orange.opacity(0.08))
        .overlay {
            RoundedRectangle(cornerRadius: 2)
                .stroke(Color.orange.opacity(0.42), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            "Command Centre data is partial. Unavailable: \(unavailableSources.joined(separator: ", ")). "
                + "\(retainedSourceCount) areas retain their last snapshot."
        )
    }
}

private struct AdminMetricTile: View {
    let title: String
    let value: Int
    let icon: String
    let dataState: AdminDashboardDataState
    let action: (() -> Void)?

    init(
        title: String,
        value: Int,
        icon: String,
        dataState: AdminDashboardDataState = .current,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.value = value
        self.icon = icon
        self.dataState = dataState
        self.action = action
    }

    var body: some View {
        Group {
            if let action {
                Button(action: action) { tileContent }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens \(title.lowercased())")
            } else {
                tileContent
            }
        }
    }

    private var tileContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: icon).foregroundStyle(Color.xertSteel)
                Spacer()
                dataStateBadge
                if action != nil {
                    Image(systemName: "arrow.up.right")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.xertSteel.opacity(0.6))
                }
            }
            metricValue
            Text(title.uppercased()).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Color.xertPale.opacity(0.55))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .xertCardStyle()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(accessibleValue), \(dataState.accessibilityDescription)")
    }

    @ViewBuilder
    private var metricValue: some View {
        switch dataState {
        case .loading:
            ProgressView()
                .tint(Color.xertSteel)
                .frame(height: 36, alignment: .leading)
        case .unavailable:
            Text("—").xertDisplay(30).foregroundStyle(Color.xertPale.opacity(0.5))
        case .current, .stale:
            Text(value.formatted()).xertDisplay(30).foregroundStyle(Color.xertOffWhite)
        }
    }

    @ViewBuilder
    private var dataStateBadge: some View {
        switch dataState {
        case .stale:
            Text("LAST")
                .font(.system(size: 8, weight: .black))
                .foregroundStyle(.orange)
        case .unavailable:
            Image(systemName: "wifi.exclamationmark")
                .font(.caption2)
                .foregroundStyle(.orange)
        case .loading, .current:
            EmptyView()
        }
    }

    private var accessibleValue: String {
        switch dataState {
        case .loading: return "loading"
        case .unavailable: return "value unavailable"
        case .current, .stale: return value.formatted()
        }
    }
}

private struct AdminMoneyTile: View {
    let title: String
    let cents: Int
    let dataState: AdminDashboardDataState
    let action: (() -> Void)?

    init(
        title: String,
        cents: Int,
        dataState: AdminDashboardDataState = .current,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.cents = cents
        self.dataState = dataState
        self.action = action
    }

    var body: some View {
        Group {
            if let action {
                Button(action: action) { tileContent }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens finance")
            } else {
                tileContent
            }
        }
    }

    private var tileContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "dollarsign.circle").foregroundStyle(Color.xertSteel)
                Spacer()
                if dataState == .stale {
                    Text("LAST")
                        .font(.system(size: 8, weight: .black))
                        .foregroundStyle(.orange)
                } else if dataState == .unavailable {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                if action != nil {
                    Image(systemName: "arrow.up.right")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.xertSteel.opacity(0.6))
                }
            }
            moneyValue
            Text(title.uppercased()).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Color.xertPale.opacity(0.55))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .xertCardStyle()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(accessibleValue), \(dataState.accessibilityDescription)")
    }

    @ViewBuilder
    private var moneyValue: some View {
        switch dataState {
        case .loading:
            ProgressView()
                .tint(Color.xertSteel)
                .frame(height: 28, alignment: .leading)
        case .unavailable:
            Text("—")
                .font(.title3.weight(.bold))
                .foregroundStyle(Color.xertPale.opacity(0.5))
        case .current, .stale:
            Text((Double(cents) / 100).formatted(.currency(code: "AUD")))
                .font(.title3.weight(.bold))
                .foregroundStyle(Color.xertOffWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private var accessibleValue: String {
        switch dataState {
        case .loading: return "loading"
        case .unavailable: return "value unavailable"
        case .current, .stale:
            return (Double(cents) / 100).formatted(.currency(code: "AUD"))
        }
    }
}

private struct FinanceSummaryRow: View {
    let label: String
    let cents: Int

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text((Double(cents) / 100).formatted(.currency(code: "AUD"))).fontWeight(.bold)
        }
        .foregroundStyle(Color.xertOffWhite)
        .listRowBackground(Color.xertInk)
    }
}

private struct AdminDestinationRow: View {
    let title: String
    let detail: String
    let icon: String
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 14) {
                Image(systemName: icon).frame(width: 26).foregroundStyle(Color.xertSteel)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline).foregroundStyle(Color.xertOffWhite)
                    Text(detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Color.xertSteel)
            }
            .padding(15)
            .xertCardStyle()
        }
        .buttonStyle(.plain)
    }
}

private struct AdminEmptyState: View {
    let icon: String
    let text: String

    var body: some View {
        Label(text, systemImage: icon)
            .font(.subheadline)
            .foregroundStyle(Color.xertPale.opacity(0.65))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .xertCardStyle()
    }
}

private func adminHeading(_ title: String) -> some View {
    Text(title.uppercased())
        .font(.caption.weight(.bold))
        .tracking(1.8)
        .foregroundStyle(Color.xertSteel)
        .accessibilityAddTraits(.isHeader)
}
