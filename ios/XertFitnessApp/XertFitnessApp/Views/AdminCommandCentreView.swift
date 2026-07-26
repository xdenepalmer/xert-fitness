import SwiftUI
import PhotosUI
import UIKit
import ImageIO
import UniformTypeIdentifiers

private struct AdminEditorExitCoordinatorKey: EnvironmentKey {
    static let defaultValue: XertOwnerEditorExitCoordinator? = nil
}

private extension EnvironmentValues {
    var adminEditorExitCoordinator: XertOwnerEditorExitCoordinator? {
        get { self[AdminEditorExitCoordinatorKey.self] }
        set { self[AdminEditorExitCoordinatorKey.self] = newValue }
    }
}

private struct AdminOwnerExitReportingModifier: ViewModifier {
    @Environment(\.adminEditorExitCoordinator) private var coordinator
    let state: XertOwnerEditorExitState

    func body(content: Content) -> some View {
        content
            .onAppear { coordinator?.report(state) }
            .onChange(of: state) { coordinator?.report($0) }
            .onDisappear { coordinator?.clear(id: state.id) }
    }
}

private extension View {
    func adminOwnerExitState(
        id: UUID,
        title: String,
        isDirty: Bool,
        isBusy: Bool
    ) -> some View {
        modifier(
            AdminOwnerExitReportingModifier(
                state: XertOwnerEditorExitState(
                    id: id,
                    title: title,
                    isDirty: isDirty,
                    isBusy: isBusy
                )
            )
        )
    }
}

struct AdminCommandCentreView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var admin = AdminStore()
    @StateObject private var editorExitCoordinator = XertOwnerEditorExitCoordinator()
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
    @State private var quickNoticeDraft: AdminAnnouncementDraft?
    @State private var platformDraftSnapshot: AdminPlatformSettings?
    @State private var pendingOwnerExitRequest: OwnerExitRequest?
    @State private var showingPlatformExitConfirmation = false
    @State private var pendingEditorExitRequest: OwnerExitRequest?
    @State private var showingEditorExitConfirmation = false
    @State private var isSavingPlatformExit = false
    @State private var shiftBriefCopyFeedbackID: UUID?
    @State private var confirmingEmergencyPause = false
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
        .environment(\.adminEditorExitCoordinator, editorExitCoordinator)
        .focusedSceneValue(\.xertNavigationCommandContext, ownerNavigationCommandContext)
        .background(Color.xertNavy.ignoresSafeArea())
        .interactiveDismissDisabled(
            hasUnsavedPlatformDraft
                || admin.isSavingSettings
                || isSavingPlatformExit
                || editorExitCoordinator.active?.isDirty == true
                || editorExitCoordinator.active?.isBusy == true
        )
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
        .task(id: operationalPulseTaskID) {
            guard scenePhase == .active, let session = authorizedOwnerSession else { return }
            while !Task.isCancelled {
                do {
                    try await Task.sleep(nanoseconds: AdminOperationalRefreshPolicy.intervalNanoseconds)
                } catch {
                    return
                }
                guard !Task.isCancelled, scenePhase == .active else { return }
                await admin.refreshOperationalPulse(session: session)
            }
        }
        .onChange(of: store.authSession?.user?.id) { userID in
            admin.resetOwnerTaskResolution()
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
                    .id(task)
            }
        }
        .sheet(item: $presentedQuickAction, onDismiss: {
            quickNoticeDraft = nil
        }) { action in
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
        .confirmationDialog(
            "Unsaved \(editorExitCoordinator.active?.title ?? "owner changes")",
            isPresented: $showingEditorExitConfirmation,
            titleVisibility: .visible,
            presenting: pendingEditorExitRequest
        ) { request in
            Button("Discard changes and continue", role: .destructive) {
                editorExitCoordinator.clearAll()
                performOwnerExit(request)
            }
            Button("Keep editing", role: .cancel) {
                pendingEditorExitRequest = nil
            }
        } message: { request in
            Text(
                "This draft has not been saved. Discard it before opening "
                    + "\(request.destinationTitle), or keep editing."
            )
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
        .onChange(of: showingEditorExitConfirmation) { isPresented in
            if !isPresented {
                pendingEditorExitRequest = nil
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

    private var operationalPulseTaskID: String {
        let accountID = store.authSession?.user?.id.uuidString.lowercased() ?? "guest"
        return "\(accountID):\(scenePhase == .active ? "active" : "inactive")"
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
            && !showingEditorExitConfirmation
            && !admin.isSavingSettings
            && !isSavingPlatformExit
            && editorExitCoordinator.active?.isBusy != true
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
        if let activeEditor = editorExitCoordinator.active {
            guard !activeEditor.isBusy else {
                admin.errorMessage = "\(activeEditor.title) is still saving. Wait for it to finish before leaving."
                XertHaptics.play(.warning)
                return
            }
            if activeEditor.isDirty {
                pendingEditorExitRequest = request
                showingEditorExitConfirmation = true
                XertHaptics.play(.warning)
                return
            }
        }
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
        editorExitCoordinator.clearAll()
        platformDraftSnapshot = nil
        pendingOwnerExitRequest = nil
        showingPlatformExitConfirmation = false
        pendingEditorExitRequest = nil
        showingEditorExitConfirmation = false
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
        admin.resetOwnerTaskResolution()
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

    private func presentNoticeQuickAction(draft: AdminAnnouncementDraft? = nil) {
        quickNoticeDraft = draft
        presentQuickAction(.newNotice)
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

    private func refreshOperationalPulse() {
        guard let session = authorizedOwnerSession,
              !admin.isLoading,
              !admin.isRefreshingOperations else { return }
        XertHaptics.play(.softImpact)
        Task {
            guard await admin.refreshOperationalPulse(session: session) else {
                XertHaptics.play(.warning)
                return
            }
            switch admin.operationalQueueState {
            case .ready:
                XertHaptics.play(.success)
            case .partial:
                XertHaptics.play(.warning)
            case .idle, .loading:
                break
            }
        }
    }

    @ViewBuilder
    private func quickActionSheet(_ action: AdminOwnerQuickAction, session: AuthSession) -> some View {
        switch action {
        case .newClass:
            NavigationStack {
                AdminClassEditor(
                    admin: admin,
                    session: session,
                    classSession: nil,
                    mutationAllowed: admin.loadedSources.contains("full timetable")
                        && !admin.refreshUnavailableSources.contains("full timetable")
                )
            }
        case .newNotice:
            AdminAnnouncementComposer(
                announcement: nil,
                initialDraft: quickNoticeDraft,
                isSaving: admin.announcementMutationID != nil,
                isPublishing: admin.isPublishingAnnouncement,
                onSave: { draft in
                    Task {
                        if await admin.saveAnnouncement(session: session, announcement: nil, draft: draft) {
                            XertHaptics.play(.success)
                            presentedQuickAction = nil
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                },
                onPublish: { draft in
                    Task {
                        if await admin.publishAnnouncement(session: session, announcement: nil, draft: draft) {
                            XertHaptics.play(.success)
                            presentedQuickAction = nil
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                }
            )
        case .newSessionPack:
            NavigationStack {
                AdminProductEditor(
                    admin: admin,
                    session: session,
                    product: nil,
                    suggestedSortOrder: (admin.products.map(\.sort_order).max() ?? -1) + 1
                )
            }
        case .newCoach:
            NavigationStack {
                AdminCoachEditor(
                    admin: admin,
                    session: session,
                    coach: nil
                )
            }
        case .newEvent:
            NavigationStack {
                AdminEventEditor(
                    admin: admin,
                    session: session,
                    event: nil
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
                shiftBriefing
                stripeLaunchRunway
                incidentControl(session: session)
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
            bookingsEnabled: admin.settings?.bookings_enabled,
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
        case .controlsBlocked: return "switch.2"
        case .readyToOpenBookings: return "calendar.badge.checkmark"
        case .readyToActivate: return "checkmark.shield"
        case .live: return "bolt.shield.fill"
        }
    }

    private func stripeRunwayColour(_ phase: XertStripeLaunchPhase) -> Color {
        switch phase {
        case .checking: return Color.xertSteel
        case .unavailable, .catalogBlocked, .healthBlocked, .controlsBlocked: return Color.orange
        case .readyToOpenBookings, .readyToActivate: return Color.xertSteel
        case .live: return Color.green
        }
    }

    private func incidentControl(session: AuthSession) -> some View {
        let sourceIsCurrent = admin.loadedSources.contains("platform controls")
            && !admin.refreshUnavailableSources.contains("platform controls")
            && !admin.isLoading
        let plan = AdminEmergencyPausePlan(
            settings: admin.settings,
            sourceIsCurrent: sourceIsCurrent
        )
        let communication = AdminIncidentCommunicationPlan(
            operationsState: plan.state,
            announcements: admin.announcements,
            sourceIsCurrent: quickMutationIsAvailable(source: "member notices")
        )
        let color = incidentControlColor(plan.state, communication: communication.state)

        return VStack(alignment: .leading, spacing: 13) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    incidentControlHeading
                    Spacer(minLength: 8)
                    incidentControlStatus(
                        plan: plan,
                        communication: communication.state,
                        color: color
                    )
                }
                VStack(alignment: .leading, spacing: 8) {
                    incidentControlHeading
                    incidentControlStatus(
                        plan: plan,
                        communication: communication.state,
                        color: color
                    )
                }
            }

            Text(plan.detail)
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)

            incidentCommunicationStatus(communication.state)

            if plan.state == .paused {
                incidentRunbook(communication: communication.state)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    incidentControlActions(
                        plan: plan,
                        communication: communication.state,
                        communicationNoticeID: communication.actionNoticeID,
                        session: session
                    )
                }
                VStack(spacing: 10) {
                    incidentControlActions(
                        plan: plan,
                        communication: communication.state,
                        communicationNoticeID: communication.actionNoticeID,
                        session: session
                    )
                }
            }
        }
        .padding(16)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(color.opacity(0.38), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("owner.incidentControl")
        .confirmationDialog(
            "Pause new member activity?",
            isPresented: $confirmingEmergencyPause,
            titleVisibility: .visible
        ) {
            Button("Pause new activity now", role: .destructive) {
                pauseMemberOperations(session: session)
            }
            Button("Keep activity live", role: .cancel) {}
        } message: {
            Text("This immediately stops new bookings, waitlist joins and session-pack checkout. Existing bookings, class rosters, member records and owner tools remain available.")
        }
    }

    private var incidentControlHeading: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.shield")
                .font(.title3)
                .foregroundStyle(Color.xertSteel)
                .frame(width: 34, height: 34)
                .background(Color.xertSteel.opacity(0.1))
            VStack(alignment: .leading, spacing: 2) {
                adminHeading("Incident control")
                Text("Fast protection for member-facing operations")
                    .font(.caption2)
                    .foregroundStyle(Color.xertPale.opacity(0.5))
            }
        }
    }

    private func incidentControlStatus(
        plan: AdminEmergencyPausePlan,
        communication: AdminIncidentCommunicationState,
        color: Color
    ) -> some View {
        Text(incidentControlStatusLabel(plan.state, communication: communication))
            .font(.caption2.weight(.black))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .frame(minHeight: 30)
            .background(color.opacity(0.1))
            .overlay(Rectangle().stroke(color.opacity(0.32), lineWidth: 1))
            .fixedSize(horizontal: true, vertical: false)
    }

    @ViewBuilder
    private func incidentControlActions(
        plan: AdminEmergencyPausePlan,
        communication: AdminIncidentCommunicationState,
        communicationNoticeID: UUID?,
        session: AuthSession
    ) -> some View {
        if plan.canPause {
            Button {
                XertHaptics.play(.warning)
                confirmingEmergencyPause = true
            } label: {
                Label("Pause bookings & checkout", systemImage: "pause.circle.fill")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.red)
            .disabled(admin.isSavingSettings)
            .accessibilityHint("Opens a confirmation before pausing new member activity")

            incidentLiveCommunicationAction(
                state: communication,
                operationsState: plan.state,
                noticeID: communicationNoticeID,
                session: session
            )

            Button {
                openWorkspaceWithFeedback(.controls)
            } label: {
                Label("Review controls", systemImage: "switch.2")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Color.xertSteel)
            .disabled(admin.isSavingSettings)
        } else if plan.state == .unavailable {
            Button {
                Task { await admin.refresh(session: session) }
            } label: {
                Label(
                    admin.isLoading ? "Refreshing..." : "Refresh to unlock",
                    systemImage: "arrow.clockwise"
                )
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.orange)
            .disabled(admin.isLoading || admin.isSavingSettings)
        } else {
            if communication == .pausedUpdateLive {
                Button {
                    openIncidentNotice(communicationNoticeID)
                } label: {
                    Label("Review live update", systemImage: "checkmark.bubble.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.green)
                .accessibilityHint("Opens the live member incident notice")
            } else if quickMutationIsAvailable(source: "member notices") {
                Button {
                    presentNoticeQuickAction(draft: .memberOperationsPaused())
                } label: {
                    Label("Draft member update", systemImage: "bell.badge.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
                .accessibilityHint("Opens an editable incident notice without publishing it")
            } else {
                Button {
                    Task { await admin.refresh(session: session) }
                } label: {
                    Label(
                        admin.isLoading ? "Refreshing..." : "Refresh notices",
                        systemImage: "arrow.clockwise"
                    )
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.orange)
                .disabled(admin.isLoading || admin.isSavingSettings)
                .accessibilityHint("Refreshes live data before preparing a member update")
            }

            Button {
                openWorkspaceWithFeedback(.health)
            } label: {
                Label("Investigate health", systemImage: "stethoscope")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Color.xertSteel)

            Button {
                openWorkspaceWithFeedback(.controls)
            } label: {
                Label("Reopen controls", systemImage: "switch.2")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Color.xertSteel)
            .disabled(admin.isSavingSettings)
        }
    }

    @ViewBuilder
    private func incidentLiveCommunicationAction(
        state: AdminIncidentCommunicationState,
        operationsState: AdminMemberOperationsState,
        noticeID: UUID?,
        session: AuthSession
    ) -> some View {
        switch state {
        case .livePauseNoticeConflict:
            Button {
                openIncidentNotice(noticeID)
            } label: {
                Label("Fix member message", systemImage: "exclamationmark.bubble.fill")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.red)
            .accessibilityHint("Opens Member Notices to remove the contradictory pause update")
        case .recoveryUpdateNeeded:
            Button {
                presentNoticeQuickAction(draft: .memberOperationsRestored(
                    checkoutAvailable: operationsState == .liveCommerce
                ))
            } label: {
                Label("Draft all-clear", systemImage: "checkmark.message.fill")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.xertSteel)
            .foregroundStyle(Color.xertNavy)
            .accessibilityHint("Opens an editable recovery update without publishing it")
        case .recoveryUpdateLive:
            Button {
                openIncidentNotice(noticeID)
            } label: {
                Label("Review all-clear", systemImage: "checkmark.bubble.fill")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Color.green)
        case .unavailable:
            Button {
                Task { await admin.refresh(session: session) }
            } label: {
                Label(
                    admin.isLoading ? "Refreshing..." : "Verify messages",
                    systemImage: "arrow.clockwise"
                )
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Color.orange)
            .disabled(admin.isLoading || admin.isSavingSettings)
        case .normal, .pausedNeedsUpdate, .pausedUpdateLive:
            EmptyView()
        }
    }

    private func openIncidentNotice(_ noticeID: UUID?) {
        if let noticeID {
            openOwnerRouteWithFeedback(
                XertOwnerRoute(task: .announcement(noticeID))
            )
        } else {
            openWorkspaceWithFeedback(.notices)
        }
    }

    @ViewBuilder
    private func incidentCommunicationStatus(_ state: AdminIncidentCommunicationState) -> some View {
        switch state {
        case .livePauseNoticeConflict:
            incidentCommunicationLabel(
                "Member operations are live, but a member notice still says they are paused.",
                icon: "exclamationmark.bubble.fill",
                color: .red
            )
        case .recoveryUpdateNeeded:
            incidentCommunicationLabel(
                "Member operations are live again. Prepare an accurate all-clear update.",
                icon: "message.badge",
                color: .orange
            )
        case .recoveryUpdateLive:
            incidentCommunicationLabel(
                "A current recovery update is live for members.",
                icon: "checkmark.bubble.fill",
                color: .green
            )
        case .unavailable:
            incidentCommunicationLabel(
                "Refresh member notices before relying on communication status.",
                icon: "wifi.exclamationmark",
                color: .orange
            )
        case .normal, .pausedNeedsUpdate, .pausedUpdateLive:
            EmptyView()
        }
    }

    private func incidentCommunicationLabel(
        _ text: String,
        icon: String,
        color: Color
    ) -> some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("owner.incidentCommunicationStatus")
    }

    private func incidentRunbook(
        communication: AdminIncidentCommunicationState
    ) -> some View {
        let communicationIcon: String
        let communicationColor: Color
        let communicationTitle: String
        let communicationDetail: String
        if communication == .pausedUpdateLive {
            communicationIcon = "checkmark.circle.fill"
            communicationColor = .green
            communicationTitle = "Member update is live"
            communicationDetail = "Review the live notice before publishing any follow-up."
        } else if communication == .unavailable {
            communicationIcon = "2.circle.fill"
            communicationColor = .orange
            communicationTitle = "Verify member communications"
            communicationDetail = "Refresh member notices before preparing an update."
        } else {
            communicationIcon = "2.circle.fill"
            communicationColor = Color.xertSteel
            communicationTitle = "Tell members what changed"
            communicationDetail = "Review the prepared update, then publish when accurate."
        }

        return VStack(alignment: .leading, spacing: 10) {
            Text("INCIDENT RUNBOOK")
                .font(.caption2.weight(.black))
                .foregroundStyle(Color.xertPale.opacity(0.48))

            incidentRunbookStep(
                icon: "checkmark.circle.fill",
                color: .green,
                title: "Member activity protected",
                detail: "New bookings, waitlists and checkout are paused."
            )
            incidentRunbookStep(
                icon: communicationIcon,
                color: communicationColor,
                title: communicationTitle,
                detail: communicationDetail
            )
            incidentRunbookStep(
                icon: "3.circle.fill",
                color: Color.xertSteel,
                title: "Investigate the cause",
                detail: "Check schema, Stripe, webhook and Apple push health."
            )
            incidentRunbookStep(
                icon: "4.circle.fill",
                color: Color.xertSteel,
                title: "Reopen deliberately",
                detail: "Use Member App Controls only after live checks pass."
            )
        }
        .padding(.top, 2)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("owner.incidentRunbook")
    }

    private func incidentRunbookStep(
        icon: String,
        color: Color,
        title: String,
        detail: String
    ) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(color)
                .frame(width: 24, height: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.xertOffWhite)
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(Color.xertPale.opacity(0.56))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func pauseMemberOperations(session: AuthSession) {
        Task {
            if await admin.pauseMemberOperations(session: session) {
                platformDraftSnapshot = admin.settings
                XertHaptics.play(.success)
                UIAccessibility.post(
                    notification: .announcement,
                    argument: "New member bookings and checkout paused"
                )
            } else {
                XertHaptics.play(.error)
            }
        }
    }

    private func incidentControlColor(
        _ state: AdminMemberOperationsState,
        communication: AdminIncidentCommunicationState
    ) -> Color {
        if communication == .livePauseNoticeConflict { return .red }
        if communication == .recoveryUpdateLive { return .green }
        switch state {
        case .unavailable, .bookingsOpen, .liveCommerce: return .orange
        case .paused: return .green
        case .inconsistent: return .red
        }
    }

    private func incidentControlStatusLabel(
        _ state: AdminMemberOperationsState,
        communication: AdminIncidentCommunicationState
    ) -> String {
        switch communication {
        case .livePauseNoticeConflict: return "MESSAGE CONFLICT"
        case .recoveryUpdateNeeded: return "ALL-CLEAR DUE"
        case .recoveryUpdateLive: return "RECOVERY SHARED"
        case .unavailable, .normal, .pausedNeedsUpdate, .pausedUpdateLive: break
        }
        switch state {
        case .unavailable: return "REFRESH REQUIRED"
        case .paused: return "PROTECTED"
        case .bookingsOpen: return "BOOKINGS LIVE"
        case .liveCommerce: return "COMMERCE LIVE"
        case .inconsistent: return "ACTION REQUIRED"
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
                    presentNoticeQuickAction()
                }
                AdminQuickToolButton(
                    title: "Create a session pack",
                    detail: quickToolDetail(source: "session packs", ready: "Start as a private draft"),
                    icon: "ticket.fill",
                    isEnabled: quickMutationIsAvailable(source: "session packs")
                ) {
                    presentQuickAction(.newSessionPack)
                }
                AdminQuickToolButton(
                    title: "Add a coach",
                    detail: quickToolDetail(source: "team directory", ready: "Publish a team profile"),
                    icon: "person.crop.rectangle.badge.plus",
                    isEnabled: quickMutationIsAvailable(source: "team directory")
                ) {
                    presentQuickAction(.newCoach)
                }
                AdminQuickToolButton(
                    title: "Add an event",
                    detail: quickToolDetail(source: "event calendar", ready: "Grow the annual training calendar"),
                    icon: "trophy.fill",
                    isEnabled: quickMutationIsAvailable(source: "event calendar")
                ) {
                    presentQuickAction(.newEvent)
                }
                AdminQuickToolButton(
                    title: "Edit site content",
                    detail: "Hero, contact details and FAQs",
                    icon: "text.badge.star"
                ) {
                    openWorkspaceWithFeedback(.content)
                }
                AdminQuickToolButton(
                    title: "Access control",
                    detail: "Review admins and recovery cover",
                    icon: "person.badge.key"
                ) {
                    openWorkspaceWithFeedback(.access)
                }
                AdminQuickToolButton(
                    title: "Launch health",
                    detail: admin.healthIssues == 0 ? "Review release evidence" : "\(admin.healthIssues) issue\(admin.healthIssues == 1 ? "" : "s") need attention",
                    icon: "checkmark.shield"
                ) {
                    openWorkspaceWithFeedback(.health)
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
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    adminHeading("Operational priority queue")
                    Spacer(minLength: 8)
                    operationalPulseControl
                }
                VStack(alignment: .leading, spacing: 8) {
                    adminHeading("Operational priority queue")
                    operationalPulseControl
                }
            }

            operationalQueueContent(priorities)
        }
    }

    private var operationalPulseControl: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            let freshness = AdminOperationalRefreshPolicy.freshness(
                hasCompletedRefresh: admin.hasCompletedRefresh,
                updatedAt: admin.operationalUpdatedAt,
                isRefreshing: admin.isRefreshingOperations,
                hasUnavailableSources: admin.operationalQueueHasUnavailableSources,
                now: context.date
            )
            Button(action: refreshOperationalPulse) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(operationalFreshnessColour(freshness))
                        .frame(width: 7, height: 7)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(freshness.label.uppercased())
                            .font(.system(size: 9, weight: .black))
                            .tracking(1.2)
                        if let updatedAt = admin.operationalUpdatedAt {
                            Text(updatedAt, style: .relative)
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .textCase(.lowercase)
                        }
                    }
                    if admin.isRefreshingOperations {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.caption.weight(.bold))
                    }
                }
                .foregroundStyle(operationalFreshnessColour(freshness))
                .padding(.horizontal, 10)
                .frame(minHeight: 44)
                .background(operationalFreshnessColour(freshness).opacity(0.1))
                .overlay {
                    RoundedRectangle(cornerRadius: 2)
                        .stroke(operationalFreshnessColour(freshness).opacity(0.36), lineWidth: 1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(admin.isLoading || admin.isRefreshingOperations)
            .accessibilityLabel("Operational queues \(freshness.label.lowercased())")
            .accessibilityValue(
                admin.operationalUpdatedAt.map {
                    "Last fully refreshed \($0.formatted(date: .omitted, time: .shortened))"
                } ?? "No complete operational snapshot"
            )
            .accessibilityHint("Refreshes requests, waitlists, retention, activation, orders and private training without leaving this screen")
            .accessibilityIdentifier("owner.operationalPulse")
        }
    }

    private var shiftBriefing: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            let freshness = AdminOperationalRefreshPolicy.freshness(
                hasCompletedRefresh: admin.hasCompletedRefresh,
                updatedAt: admin.operationalUpdatedAt,
                isRefreshing: admin.isRefreshingOperations,
                hasUnavailableSources: admin.operationalQueueHasUnavailableSources,
                now: context.date
            )
            let unavailableSources: [String]
            if case .partial(let sources) = admin.operationalQueueState {
                unavailableSources = sources
            } else {
                unavailableSources = []
            }
            let briefing = AdminShiftBriefing(
                generatedAt: context.date,
                sourceUpdatedAt: admin.operationalUpdatedAt,
                classes: admin.dailyOperations.map { AdminShiftClassBrief(operation: $0) },
                requestedPlaces: admin.requestedPlaces,
                waitlistedMembers: admin.waitingMembers,
                attendanceDue: admin.attendanceDue,
                activationActions: admin.activationQueue.count,
                retentionFollowUps: admin.followUps.count,
                pendingPTRequests: admin.pendingPTRequests,
                recoverableOrders: admin.orders.lazy.filter(\.isRecoverable).count,
                classSetupGaps: dailyClassReadiness.affectedClassCount,
                unavailableSources: unavailableSources
            )
            let canShare = freshness == .current && admin.operationalQueueState == .ready

            VStack(alignment: .leading, spacing: 12) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        shiftBriefingHeading
                        Spacer(minLength: 8)
                        shiftBriefingStatus(freshness: freshness)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        shiftBriefingHeading
                        shiftBriefingStatus(freshness: freshness)
                    }
                }

                HStack(spacing: 12) {
                    shiftBriefingMetric(
                        briefing.classes.count,
                        label: "Today's classes",
                        icon: "calendar"
                    )
                    shiftBriefingMetric(
                        briefing.openActionCount,
                        label: "Open actions",
                        icon: briefing.openActionCount > 0 ? "exclamationmark.circle" : "checkmark.circle"
                    )
                }

                if let nextClass = briefing.classes
                    .filter({ $0.startTime >= context.date })
                    .min(by: { $0.startTime < $1.startTime }) {
                    Label(
                        "Next: \(nextClass.startTime.formatted(date: .omitted, time: .shortened)) - \(nextClass.title)",
                        systemImage: "clock"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.xertPale.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
                }

                Text("No member names, contact details, notes or payment identifiers are included.")
                    .font(.caption2)
                    .foregroundStyle(Color.xertPale.opacity(0.5))
                    .fixedSize(horizontal: false, vertical: true)

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) {
                        shiftBriefingActions(briefing: briefing, canShare: canShare)
                    }
                    VStack(spacing: 10) {
                        shiftBriefingActions(briefing: briefing, canShare: canShare)
                    }
                }

                if !canShare {
                    Label(
                        "Refresh operational queues before copying or sharing this handoff.",
                        systemImage: "lock.shield"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(16)
            .xertCardStyle()
            .accessibilityElement(children: .contain)
        }
    }

    private var shiftBriefingHeading: some View {
        VStack(alignment: .leading, spacing: 3) {
            adminHeading("Owner shift brief")
            Text("A privacy-safe staff handoff from the live operating queues")
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func shiftBriefingStatus(freshness: AdminOperationalFreshness) -> some View {
        Label(freshness.label.uppercased(), systemImage: freshness == .current ? "checkmark.shield.fill" : "clock.badge.exclamationmark")
            .font(.caption2.weight(.black))
            .foregroundStyle(operationalFreshnessColour(freshness))
            .padding(.horizontal, 9)
            .frame(minHeight: 32)
            .background(operationalFreshnessColour(freshness).opacity(0.1))
            .overlay(
                Rectangle()
                    .stroke(operationalFreshnessColour(freshness).opacity(0.34), lineWidth: 1)
            )
    }

    private func shiftBriefingMetric(_ value: Int, label: String, icon: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: icon)
                .foregroundStyle(Color.xertSteel)
            VStack(alignment: .leading, spacing: 1) {
                Text(value.formatted())
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(Color.xertOffWhite)
                Text(label.uppercased())
                    .font(.system(size: 8, weight: .black))
                    .foregroundStyle(Color.xertPale.opacity(0.5))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
        .padding(.horizontal, 12)
        .background(Color.xertDeep.opacity(0.3))
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.18), lineWidth: 1))
    }

    @ViewBuilder
    private func shiftBriefingActions(
        briefing: AdminShiftBriefing,
        canShare: Bool
    ) -> some View {
        if canShare {
            ShareLink(
                item: briefing.text,
                subject: Text("XERT owner shift brief")
            ) {
                Label("Share brief", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.xertSteel)
            .foregroundStyle(Color.xertNavy)
            .accessibilityHint("Shares a current privacy-safe operational handoff")

            Button {
                UIPasteboard.general.string = briefing.text
                XertHaptics.play(.success)
                UIAccessibility.post(notification: .announcement, argument: "Shift brief copied")
                let feedbackID = UUID()
                shiftBriefCopyFeedbackID = feedbackID
                Task {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    guard shiftBriefCopyFeedbackID == feedbackID else { return }
                    shiftBriefCopyFeedbackID = nil
                }
            } label: {
                Label(
                    shiftBriefCopyFeedbackID == nil ? "Copy brief" : "Copied",
                    systemImage: shiftBriefCopyFeedbackID == nil ? "doc.on.doc" : "checkmark"
                )
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(Color.xertSteel)
            .accessibilityHint("Copies a current privacy-safe operational handoff")
        } else {
            Button(action: refreshOperationalPulse) {
                Label(
                    admin.isRefreshingOperations ? "Refreshing..." : "Refresh to unlock",
                    systemImage: "arrow.clockwise"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.xertSteel)
            .foregroundStyle(Color.xertNavy)
            .disabled(admin.isLoading || admin.isRefreshingOperations)
        }
    }

    private func operationalFreshnessColour(_ freshness: AdminOperationalFreshness) -> Color {
        switch freshness {
        case .current: return .green
        case .loading, .refreshing: return Color.xertSteel
        case .stale: return .orange
        case .unavailable: return .red
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
                task: singlePricingAttentionTask,
                isCritical: admin.settings?.payments_enabled == true
            ),
            AdminPriorityAction(
                title: "Class booking requests",
                detail: "Confirm or decline member places",
                icon: "person.crop.circle.badge.questionmark",
                count: admin.requestedPlaces,
                workspace: .bookingRequests,
                task: singleBookingRequestTask ?? singleBookingRequestClassTask
            ),
            AdminPriorityAction(
                title: "Class setup gaps",
                detail: dailyClassSetupPriorityDetail,
                icon: "calendar.badge.exclamationmark",
                count: dailyClassReadiness.affectedClassCount,
                workspace: .timetable,
                task: dailyClassReadiness.singleAffectedClassID.map { .classSetup($0) },
                isCritical: dailyClassReadiness.issues.contains(where: \.isCritical)
            ),
            AdminPriorityAction(
                title: "PT enquiries",
                detail: "Respond to coaching requests",
                icon: "figure.strengthtraining.traditional",
                count: admin.pendingPTRequests,
                workspace: .ptRequests,
                task: singlePTRequestTask
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
                workspace: .classDesk,
                task: singleWaitlistClassTask
            ),
            AdminPriorityAction(
                title: "Member activation actions",
                detail: "Complete onboarding and first-session outreach",
                icon: "person.crop.circle.badge.exclamationmark",
                count: admin.activationQueue.count,
                workspace: .retention,
                task: singleActivationTask
            ),
            AdminPriorityAction(
                title: "New lead enquiries",
                detail: leadActionPriorityDetail,
                icon: "person.2.badge.plus",
                count: admin.leadActionCounts?.total ?? 0,
                workspace: .leads,
                isCritical: (admin.leadActionCounts?.overdueTotal ?? 0) > 0
            ),
            AdminPriorityAction(
                title: "Retention follow-ups",
                detail: "Contact members who need support",
                icon: "phone.arrow.up.right",
                count: admin.followUps.count,
                workspace: .retention,
                task: singleRetentionTask
            ),
            AdminPriorityAction(
                title: "Orders to reconcile",
                detail: "Recover unresolved paid checkouts",
                icon: "arrow.triangle.2.circlepath.circle",
                count: admin.orders.lazy.filter(\.isRecoverable).count,
                workspace: .orders,
                task: singleRecoverableOrderTask,
                isCritical: true
            ),
        ]
        .filter { $0.count > 0 }
        .sorted {
            if $0.isCritical != $1.isCritical { return $0.isCritical }
            return $0.count > $1.count
        }
    }

    private var dailyClassReadiness: AdminDailyClassReadiness {
        AdminDailyClassReadiness(
            operations: admin.dailyOperations,
            sourceIsCurrent: admin.loadedSources.contains("today's classes")
                && !admin.refreshUnavailableSources.contains("today's classes")
        )
    }

    private var dailyClassSetupPriorityDetail: String {
        let readiness = dailyClassReadiness
        guard readiness.affectedClassCount > 0 else {
            return "Today's published classes are ready"
        }
        if readiness.issues.contains(where: \.isCritical) {
            return "Resolve over-capacity rosters and missing class setup"
        }
        return "Assign coaches, training areas or valid capacity"
    }

    private var pricingAttentionCount: Int {
        guard !admin.refreshUnavailableSources.contains("session packs") else { return 0 }
        if !admin.products.contains(where: \.active) { return 1 }
        return admin.products.filter { $0.active && !$0.hasStableStripePriceID }.count
    }

    private var singlePricingAttentionTask: XertOwnerTask? {
        guard !admin.refreshUnavailableSources.contains("session packs") else { return nil }
        let unlinkedActiveProducts = admin.products.filter { $0.active && !$0.hasStableStripePriceID }
        if unlinkedActiveProducts.count == 1, let product = unlinkedActiveProducts.first {
            return .product(product.id)
        }
        guard !admin.products.contains(where: \.active),
              admin.products.count == 1,
              let draft = admin.products.first else { return nil }
        return .product(draft.id)
    }

    private var singleBookingRequestClassTask: XertOwnerTask? {
        let affectedClasses = admin.dailyOperations.filter {
            $0.requested_count + $0.public_request_count > 0
        }
        guard affectedClasses.count == 1, let operation = affectedClasses.first else { return nil }
        return .classSession(operation.id)
    }

    private var singleBookingRequestTask: XertOwnerTask? {
        let pendingRequests = admin.bookingRequests.filter { $0.status == "requested" }
        guard pendingRequests.count == 1,
              let request = pendingRequests.first,
              let recordID = request.routeRecordID else { return nil }
        return .bookingRequest(request.source, recordID)
    }

    private var singleAttendanceTask: XertOwnerTask? {
        let due = admin.dailyOperations.filter(\.attendance_due)
        guard due.count == 1, let operation = due.first else { return nil }
        return .classSession(operation.id)
    }

    private var singleWaitlistClassTask: XertOwnerTask? {
        let affectedClasses = admin.waitlist.filter { $0.waitlist_count > 0 }
        guard affectedClasses.count == 1, let item = affectedClasses.first else { return nil }
        return .classSession(item.session_id)
    }

    private var singlePTRequestTask: XertOwnerTask? {
        let pendingRequests = admin.ptRequests.filter(\.isPending)
        guard pendingRequests.count == 1, let request = pendingRequests.first else { return nil }
        return .ptRequest(request.id)
    }

    private var singleActivationTask: XertOwnerTask? {
        guard admin.activationQueue.count == 1,
              let member = admin.activationQueue.first else { return nil }
        return .member(member.id)
    }

    private var leadActionPriorityDetail: String {
        guard let counts = admin.leadActionCounts else {
            return "Member, trainer and partner intake"
        }
        if counts.overdueTotal > 0 {
            return "\(counts.overdueTotal) waiting 24h+ · \(counts.memberLeads) members · \(counts.trainerApplicants) trainers · \(counts.partnerEnquiries) partners"
        }
        return "\(counts.memberLeads) members · \(counts.trainerApplicants) trainers · \(counts.partnerEnquiries) partners"
    }

    private var singleRetentionTask: XertOwnerTask? {
        guard admin.followUps.count == 1, let followUp = admin.followUps.first else { return nil }
        return .member(followUp.id)
    }

    private var singleRecoverableOrderTask: XertOwnerTask? {
        let recoverableOrders = admin.orders.filter(\.isRecoverable)
        guard recoverableOrders.count == 1, let order = recoverableOrders.first else { return nil }
        return .order(order.id)
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
            let setupIssues = dailyClassReadiness.issues(for: item.id)
            VStack(alignment: .leading, spacing: 12) {
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
                        Text(classCapacitySummary(item))
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.6))
                            .fixedSize(horizontal: false, vertical: true)
                        Label(
                            classAssignmentSummary(item),
                            systemImage: setupIssues.isEmpty
                                ? "person.crop.circle.badge.checkmark"
                                : "exclamationmark.triangle.fill"
                        )
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(setupIssues.isEmpty ? Color.xertSteel : Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    if item.attendance_due {
                        Image(systemName: "checklist")
                            .foregroundStyle(Color.orange)
                            .accessibilityLabel("Attendance due")
                    }
                }

                if let setupSummary = dailyClassReadiness.summary(for: item.id) {
                    Label(setupSummary, systemImage: "wrench.and.screwdriver.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) {
                        todayClassActions(item, hasSetupIssues: !setupIssues.isEmpty)
                    }
                    VStack(spacing: 10) {
                        todayClassActions(item, hasSetupIssues: !setupIssues.isEmpty)
                    }
                }
            }
            .padding(14)
            .xertCardStyle()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("owner.todayClass.\(item.id.uuidString.lowercased())")
        }
    }

    @ViewBuilder
    private func todayClassActions(
        _ item: AdminDailyOperation,
        hasSetupIssues: Bool
    ) -> some View {
        Button {
            openOwnerRouteWithFeedback(XertOwnerRoute(task: .classSession(item.id)))
        } label: {
            Label(
                item.attendance_due ? "Open roll call" : "Open roster",
                systemImage: item.attendance_due ? "checklist" : "person.3"
            )
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(Color.xertSteel)
        .accessibilityHint("Opens bookings, waitlist and attendance for this class")

        if hasSetupIssues {
            Button {
                openOwnerRouteWithFeedback(XertOwnerRoute(task: .classSetup(item.id)))
            } label: {
                Label("Fix setup", systemImage: "wrench.and.screwdriver.fill")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.orange)
            .accessibilityHint("Opens this exact class editor")
        }
    }

    private func classCapacitySummary(_ item: AdminDailyOperation) -> String {
        let capacity = item.capacity.map { "\($0) capacity" } ?? "capacity missing"
        return "\(item.confirmed_count) confirmed / \(capacity) · "
            + "\(item.requested_count + item.public_request_count) requested · "
            + "\(item.waitlist_count) waiting"
    }

    private func classAssignmentSummary(_ item: AdminDailyOperation) -> String {
        let coach = item.coach_name?.trimmingCharacters(in: .whitespacesAndNewlines)
        let location = item.location_zone?.trimmingCharacters(in: .whitespacesAndNewlines)
        let values = [
            coach.flatMap { $0.isEmpty ? nil : $0 },
            location.flatMap { $0.isEmpty ? nil : $0 },
        ].compactMap { $0 }
        return values.isEmpty ? "Coach and training area not assigned" : values.joined(separator: " · ")
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
        case .access:
            return "Review administrators, role changes and recovery cover"
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
            return admin.activationQueue.count + admin.followUps.count
        case .leads:
            return admin.leadActionCounts?.total
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
        case .access:
            AdminAccessControlView(
                admin: admin,
                session: session,
                onOpenTask: { openOwnerRoute(XertOwnerRoute(task: $0)) },
                onOpenAudit: { openWorkspace(.audit) }
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
            AdminLeadsView(
                admin: admin,
                session: session,
                initialPipeline: admin.leadActionCounts?.triagePipeline,
                prioritizesNewWork: (admin.leadActionCounts?.total ?? 0) > 0
            )
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
                session: session,
                onOpenOrders: { openWorkspace(.orders) }
            )
        case .orders:
            AdminOrdersView(
                admin: admin,
                session: session,
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
            AdminAuditView(admin: admin, session: session)
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
            classes: admin.dailyOperations,
            bookingRequests: admin.bookingRequests,
            ptRequests: admin.ptRequests
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
    @Environment(\.adminEditorExitCoordinator) private var editorExitCoordinator
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let task: XertOwnerTask
    @State private var confirmingDiscard = false

    var body: some View {
        NavigationStack {
            taskDestination
        }
        .interactiveDismissDisabled(
            editorExitCoordinator?.active?.isDirty == true
                || editorExitCoordinator?.active?.isBusy == true
        )
        .confirmationDialog(
            "Discard unsaved \(editorExitCoordinator?.active?.title ?? "owner changes")?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard changes", role: .destructive) {
                editorExitCoordinator?.clearAll()
                dismiss()
            }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("The active owner task has not been saved.")
        }
    }

    @ViewBuilder
    private var taskDestination: some View {
        switch task {
        case .member(let id):
            if let member = admin.members.first(where: { $0.id == id }) {
                AdminMemberDetailView(admin: admin, session: session, member: member)
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
        case .classSetup(let id):
            if let classSession = admin.classSessions.first(where: { $0.id == id }) {
                AdminClassEditor(
                    admin: admin,
                    session: session,
                    classSession: classSession,
                    mutationAllowed: admin.loadedSources.contains("full timetable")
                        && !admin.refreshUnavailableSources.contains("full timetable")
                )
            } else {
                resolutionView(recordName: "class setup")
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
        case .announcement(let id):
            if let announcement = admin.announcements.first(where: { $0.id == id }) {
                AdminAnnouncementDetailView(
                    admin: admin,
                    session: session,
                    announcement: announcement
                )
            } else {
                resolutionView(recordName: "member notice")
            }
        case .ptRequest(let id):
            if let request = admin.ptRequests.first(where: { $0.id == id }) {
                AdminPTRequestDetailView(
                    admin: admin,
                    session: session,
                    request: request,
                    mutationAllowed: admin.ptRequestsAreCurrent
                )
            } else {
                resolutionView(recordName: "PT request")
            }
        case .bookingRequest(let source, let id):
            if let booking = admin.bookingRequests.first(where: {
                $0.source == source && $0.routeRecordID == id
            }) {
                AdminBookingRequestDetailView(
                    admin: admin,
                    session: session,
                    booking: booking,
                    mutationAllowed: admin.bookingRequestsAreCurrent
                )
            } else {
                resolutionView(recordName: "booking request")
            }
        }
    }

    private func resolutionView(recordName: String) -> some View {
        VStack(spacing: 16) {
            if admin.resolvingOwnerTask == task
                || (admin.isLoading && admin.lastUpdatedAt == nil) {
                ProgressView()
                    .tint(Color.xertSteel)
                Text("Opening \(task.title.lowercased())...")
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
            } else {
                let resolutionError = admin.ownerTaskResolutionErrorTask == task
                    ? admin.ownerTaskResolutionErrorMessage
                    : nil
                Image(systemName: resolutionError == nil ? "questionmark.folder" : "wifi.exclamationmark")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(resolutionError == nil ? Color.xertSteel : Color.orange)
                Text(
                    resolutionError == nil
                        ? "\(recordName.capitalized) unavailable"
                        : "Could not open \(recordName)"
                )
                    .xertDisplay(28)
                    .foregroundStyle(Color.xertOffWhite)
                Text(
                    resolutionError
                        ?? "This protected link no longer matches a \(recordName) visible to your administrator account."
                )
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.xertPale.opacity(0.68))
                Button {
                    Task { await admin.resolveOwnerTask(session: session, task: task) }
                } label: {
                    Label(
                        resolutionError == nil ? "Check protected record again" : "Retry protected record",
                        systemImage: "arrow.clockwise"
                    )
                    .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
                .accessibilityHint("Retries this exact protected \(recordName) instead of refreshing a bounded workspace list")
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
            Button("Close", action: requestClose)
                .disabled(editorExitCoordinator?.active?.isBusy == true)
        }
    }

    private func requestClose() {
        if editorExitCoordinator?.active?.isDirty == true {
            confirmingDiscard = true
        } else if editorExitCoordinator?.active?.isBusy != true {
            dismiss()
        }
    }
}

private enum AdminAccessDirectoryMode: String, CaseIterable, Identifiable {
    case administrators
    case candidates

    var id: String { rawValue }
    var title: String {
        switch self {
        case .administrators: return "Administrators"
        case .candidates: return "Add backup"
        }
    }
    var role: String {
        switch self {
        case .administrators: return "admin"
        case .candidates: return "member"
        }
    }
}

private struct AdminAccessControlView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let onOpenTask: (XertOwnerTask) -> Void
    let onOpenAudit: () -> Void
    @State private var mode = AdminAccessDirectoryMode.administrators
    @State private var query = ""
    @State private var page = 1
    @State private var hasRequestedDirectory = false

    private let pageSize = 50
    private var normalizedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var canRequestDirectory: Bool {
        mode == .administrators || normalizedQuery.count >= 2
    }
    private var requestKey: String {
        "\(mode.rawValue)|\(normalizedQuery)|\(page)"
    }
    private var directoryIsCurrent: Bool {
        canRequestDirectory
            && admin.hasLoadedMemberDirectory
            && !admin.memberDirectoryUnavailable
            && admin.memberDirectorySearch == normalizedQuery
            && admin.memberDirectoryRole == mode.role
            && admin.memberDirectoryCredit == "all"
            && admin.memberDirectoryPage == page
    }
    private var rows: [AdminMemberSummary] {
        directoryIsCurrent ? admin.memberDirectoryRows : []
    }
    private var pageCount: Int {
        max(1, Int(ceil(Double(admin.memberDirectoryTotal) / Double(pageSize))))
    }
    private var accessSnapshot: AdminAccessSnapshot {
        AdminAccessSnapshot(
            administrators: rows,
            totalCount: directoryIsCurrent && mode == .administrators
                ? admin.memberDirectoryTotal
                : 0,
            currentUserID: session.user?.id
        )
    }
    private var recentAccessChanges: [AdminAuditEntry] {
        admin.auditEntries
            .filter { $0.category == "Access" }
            .sorted { $0.createdAt > $1.createdAt }
            .prefix(5)
            .map { $0 }
    }

    var body: some View {
        List {
            Section {
                Picker("Access directory", selection: $mode) {
                    ForEach(AdminAccessDirectoryMode.allCases) { option in
                        Text(option.title).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Owner access")
            } footer: {
                Text("Administrator access includes member records, finance, publishing and platform controls.")
            }
            .listRowBackground(Color.xertInk)

            if mode == .administrators {
                accessPosture
            } else if normalizedQuery.count < 2 {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Find a trusted existing member", systemImage: "person.crop.circle.badge.plus")
                            .font(.headline)
                        Text("Enter at least two characters of their name, email or phone. Access is granted only after reviewing the exact account and confirming the role change.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.62))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 8)
                    .listRowBackground(Color.xertInk)
                }
            }

            if canRequestDirectory
                && hasRequestedDirectory
                && !directoryIsCurrent
                && !admin.isSearchingMembers {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(
                            admin.memberDirectoryStatusMessage
                                ?? "Access evidence is unavailable. Refresh before changing administrator roles.",
                            systemImage: "lock.trianglebadge.exclamationmark"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                        Button {
                            Task { await loadDirectory() }
                        } label: {
                            Label("Retry access directory", systemImage: "arrow.clockwise")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.orange)
                    }
                    .listRowBackground(Color.xertInk)
                }
            }

            if admin.isSearchingMembers {
                Section {
                    HStack(spacing: 12) {
                        ProgressView().tint(Color.xertSteel)
                        Text(mode == .administrators ? "Loading administrators..." : "Searching eligible members...")
                    }
                    .frame(minHeight: 52)
                    .listRowBackground(Color.xertInk)
                }
            } else if directoryIsCurrent {
                accessDirectory
            }

            accessHistory
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Access Control")
        .searchable(
            text: $query,
            prompt: mode == .administrators
                ? "Filter administrators"
                : "Member name, email or phone"
        )
        .task(id: requestKey) {
            guard canRequestDirectory else { return }
            do {
                try await Task.sleep(nanoseconds: 300_000_000)
                guard !Task.isCancelled else { return }
                await loadDirectory()
            } catch {}
        }
        .task { await admin.loadAudit(session: session) }
        .refreshable {
            if canRequestDirectory { await loadDirectory() }
            await admin.loadAudit(session: session, force: true)
        }
        .onChange(of: mode) { _ in
            query = ""
            page = 1
            hasRequestedDirectory = false
        }
        .onChange(of: query) { _ in
            page = 1
            hasRequestedDirectory = false
        }
        .onChange(of: page) { _ in hasRequestedDirectory = false }
        .onChange(of: admin.memberDirectoryTotal) { _ in
            if page > pageCount { page = pageCount }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task {
                        if canRequestDirectory { await loadDirectory() }
                        await admin.loadAudit(session: session, force: true)
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .frame(width: 44, height: 44)
                }
                .disabled(admin.isSearchingMembers || admin.isLoadingAudit)
                .accessibilityLabel("Refresh access control")
            }
        }
    }

    private var accessPosture: some View {
        Section("Access posture") {
            if directoryIsCurrent {
                let snapshot = accessSnapshot
                VStack(alignment: .leading, spacing: 12) {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 12) {
                            accessPostureIcon(snapshot)
                            accessPostureCopy(snapshot)
                            Spacer(minLength: 8)
                            Text(snapshot.administratorCount.formatted())
                                .font(.title2.weight(.black).monospacedDigit())
                                .foregroundStyle(Color.xertOffWhite)
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 10) {
                                accessPostureIcon(snapshot)
                                Text(snapshot.administratorCount.formatted())
                                    .font(.title2.weight(.black).monospacedDigit())
                                    .foregroundStyle(Color.xertOffWhite)
                            }
                            accessPostureCopy(snapshot)
                        }
                    }
                    if snapshot.currentUserListingIsComplete && !snapshot.currentUserIsListed {
                        Label(
                            "Your signed-in account is missing from this administrator snapshot. Do not change roles until the directory is refreshed.",
                            systemImage: "person.crop.circle.badge.exclamationmark"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    if !snapshot.hasOperationalBackup {
                        Button {
                            mode = .candidates
                        } label: {
                            Label("Find a backup administrator", systemImage: "person.badge.plus")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.xertSteel)
                        .foregroundStyle(Color.xertNavy)
                    }
                }
                .padding(.vertical, 6)
            } else if admin.isSearchingMembers {
                ProgressView().tint(Color.xertSteel)
            }
        }
        .listRowBackground(Color.xertInk)
    }

    private func accessPostureIcon(_ snapshot: AdminAccessSnapshot) -> some View {
        Image(systemName: snapshot.hasOperationalBackup ? "person.2.fill" : "exclamationmark.shield.fill")
            .font(.title2)
            .foregroundStyle(snapshot.hasOperationalBackup ? Color.green : Color.orange)
            .frame(width: 44, height: 44)
            .background((snapshot.hasOperationalBackup ? Color.green : Color.orange).opacity(0.1))
            .accessibilityHidden(true)
    }

    private func accessPostureCopy(_ snapshot: AdminAccessSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(snapshot.statusTitle)
                .font(.headline)
                .foregroundStyle(Color.xertOffWhite)
            Text(snapshot.statusDetail)
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.62))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var accessDirectory: some View {
        Section(mode == .administrators ? "Administrator accounts" : "Eligible member accounts") {
            if rows.isEmpty {
                Text(
                    mode == .administrators
                        ? "No matching administrators. Refresh before relying on this result."
                        : "No eligible members match this search."
                )
                .foregroundStyle(Color.xertPale.opacity(0.62))
            }
            ForEach(rows) { member in
                Button { onOpenTask(.member(member.id)) } label: {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 12) {
                            accessIdentity(member)
                            Spacer(minLength: 8)
                            accessAccountBadge(member)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color.xertSteel)
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            accessIdentity(member)
                            HStack {
                                accessAccountBadge(member)
                                Spacer()
                                Label(
                                    mode == .administrators ? "Review access" : "Review and grant",
                                    systemImage: "chevron.right"
                                )
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color.xertSteel)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
            }

            if admin.memberDirectoryTotal > pageSize {
                HStack {
                    Button {
                        page = max(1, page - 1)
                    } label: {
                        Image(systemName: "chevron.left")
                            .frame(width: 44, height: 44)
                    }
                    .disabled(page <= 1 || admin.isSearchingMembers)
                    Spacer()
                    Text("Page \(page) of \(pageCount)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.xertPale.opacity(0.62))
                    Spacer()
                    Button {
                        page = min(pageCount, page + 1)
                    } label: {
                        Image(systemName: "chevron.right")
                            .frame(width: 44, height: 44)
                    }
                    .disabled(page >= pageCount || admin.isSearchingMembers)
                }
                .foregroundStyle(Color.xertSteel)
            }
        }
        .listRowBackground(Color.xertInk)
    }

    private func accessIdentity(_ member: AdminMemberSummary) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(member.displayName)
                .font(.headline)
                .foregroundStyle(Color.xertOffWhite)
                .lineLimit(2)
            Text(member.email ?? member.phone ?? "No contact details")
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.58))
                .lineLimit(2)
        }
    }

    private func accessAccountBadge(_ member: AdminMemberSummary) -> some View {
        Text(member.id == session.user?.id ? "YOU" : member.role.uppercased())
            .font(.caption2.weight(.black))
            .foregroundStyle(member.id == session.user?.id ? Color.green : Color.xertSteel)
            .padding(.horizontal, 8)
            .frame(minHeight: 28)
            .overlay(
                Rectangle()
                    .stroke(
                        member.id == session.user?.id ? Color.green.opacity(0.45) : Color.xertSteel.opacity(0.3),
                        lineWidth: 1
                    )
            )
    }

    private var accessHistory: some View {
        Section {
            if admin.isLoadingAudit && !admin.hasLoadedAudit {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading access history...")
                }
            } else if !admin.auditIsCurrent {
                Label(
                    admin.auditStatusMessage
                        ?? "Access history is not current. Refresh before relying on it.",
                    systemImage: "clock.badge.exclamationmark"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.orange)
                .fixedSize(horizontal: false, vertical: true)
            } else if recentAccessChanges.isEmpty {
                Text("No administrator role changes in the current audit window.")
                    .foregroundStyle(Color.xertPale.opacity(0.62))
            } else {
                ForEach(recentAccessChanges) { entry in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(entry.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.xertOffWhite)
                        Text(entry.detail)
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.6))
                            .fixedSize(horizontal: false, vertical: true)
                        Text(entry.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption2)
                            .foregroundStyle(Color.xertPale.opacity(0.42))
                    }
                    .padding(.vertical, 3)
                }
            }
            if admin.auditIsCurrent {
                Button(action: onOpenAudit) {
                    Label("Open full Admin Audit", systemImage: "clock.arrow.circlepath")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(Color.xertSteel)
            }
        } header: {
            Text("Recent access changes")
        } footer: {
            Text("Every administrator role change is recorded in the protected audit ledger.")
        }
        .listRowBackground(Color.xertInk)
    }

    private func loadDirectory() async {
        guard canRequestDirectory else { return }
        hasRequestedDirectory = true
        await admin.searchMembers(
            session: session,
            query: normalizedQuery,
            role: mode.role,
            credit: "all",
            page: page,
            pageSize: pageSize
        )
    }
}

private struct AdminMembersView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let onOpenTask: (XertOwnerTask) -> Void
    @State private var query = ""
    @State private var role = "all"
    @State private var credit = "all"
    @State private var page = 1
    @State private var exportDocument: AdminIntakeCSVDocument?
    @State private var isExporting = false

    private let pageSize = 50
    private var normalizedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var requestKey: String {
        "\(normalizedQuery)|\(role)|\(credit)|\(page)"
    }
    private var pageCount: Int {
        max(1, Int(ceil(Double(admin.memberDirectoryTotal) / Double(pageSize))))
    }
    private var firstResult: Int {
        admin.memberDirectoryTotal == 0 ? 0 : ((page - 1) * pageSize) + 1
    }
    private var lastResult: Int {
        min(((page - 1) * pageSize) + admin.memberDirectoryRows.count, admin.memberDirectoryTotal)
    }
    private var directoryIsCurrent: Bool {
        admin.hasLoadedMemberDirectory
            && !admin.memberDirectoryUnavailable
            && admin.memberDirectorySearch == normalizedQuery
            && admin.memberDirectoryRole == role
            && admin.memberDirectoryCredit == credit
            && admin.memberDirectoryPage == page
    }
    private var exportDateStamp: String {
        String(ISO8601DateFormatter().string(from: Date()).prefix(10))
    }

    var body: some View {
        List {
            Section {
                Picker("Role", selection: $role) {
                    Text("All").tag("all")
                    Text("Members").tag("member")
                    Text("Admins").tag("admin")
                }
                .pickerStyle(.segmented)

                Picker("Credits", selection: $credit) {
                    Text("All").tag("all")
                    Text("Available").tag("available")
                    Text("None").tag("none")
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Directory filters")
            }
            .listRowBackground(Color.xertInk)

            if let message = admin.memberDirectoryStatusMessage {
                Section {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(Color.orange)
                        .listRowBackground(Color.xertInk)
                }
            }

            if admin.isSearchingMembers {
                HStack { Spacer(); ProgressView().tint(Color.xertSteel); Spacer() }
                    .listRowBackground(Color.xertInk)
            }

            if directoryIsCurrent && admin.memberDirectoryRows.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "person.2.slash")
                        .font(.title2)
                        .foregroundStyle(Color.xertSteel)
                    Text("No matching members")
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text("Adjust the search or directory filters.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.62))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
                .listRowBackground(Color.xertNavy)
            }

            ForEach(admin.memberDirectoryRows) { member in
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
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 18) {
                                memberValue(member)
                            }
                            VStack(alignment: .leading, spacing: 5) {
                                memberValue(member)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                    }
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
                .listRowBackground(Color.xertInk)
            }

            if directoryIsCurrent {
                Section {
                    HStack {
                        Button {
                            page = max(1, page - 1)
                        } label: {
                            Label("Previous", systemImage: "chevron.left")
                        }
                        .disabled(page <= 1 || admin.isSearchingMembers)

                        Spacer()

                        VStack(spacing: 2) {
                            Text("Page \(page) of \(pageCount)")
                                .font(.caption.weight(.semibold))
                            Text("\(firstResult)-\(lastResult) of \(admin.memberDirectoryTotal)")
                                .font(.caption2)
                                .foregroundStyle(Color.xertPale.opacity(0.55))
                        }

                        Spacer()

                        Button {
                            page = min(pageCount, page + 1)
                        } label: {
                            Label("Next", systemImage: "chevron.right")
                                .labelStyle(.titleAndIcon)
                        }
                        .disabled(page >= pageCount || admin.isSearchingMembers)
                    }
                    .foregroundStyle(Color.xertSteel)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Members")
        .searchable(text: $query, prompt: "Name, email or phone")
        .task(id: requestKey) {
            do {
                try await Task.sleep(nanoseconds: 300_000_000)
                guard !Task.isCancelled else { return }
                await loadDirectory()
            } catch {}
        }
        .onChange(of: query) { _ in page = 1 }
        .onChange(of: role) { _ in page = 1 }
        .onChange(of: credit) { _ in page = 1 }
        .onChange(of: admin.memberDirectoryTotal) { _ in
            if page > pageCount { page = pageCount }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task {
                        guard let report = await admin.exportMembers(
                            session: session,
                            query: normalizedQuery,
                            role: role,
                            credit: credit
                        ) else {
                            XertHaptics.play(.error)
                            return
                        }
                        exportDocument = AdminIntakeCSVDocument(csv: report.csv)
                        isExporting = true
                        XertHaptics.play(.success)
                    }
                } label: {
                    if admin.isExportingMembers {
                        ProgressView()
                    } else {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
                .disabled(
                    !directoryIsCurrent
                        || admin.memberDirectoryTotal == 0
                        || admin.isExportingMembers
                )
                .accessibilityLabel("Export filtered member directory CSV")
                .accessibilityHint(
                    directoryIsCurrent
                        ? "Exports every member matching the current filters"
                        : "Wait for the current directory filters to finish loading"
                )
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { Task { await loadDirectory() } } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(admin.isSearchingMembers)
                .accessibilityLabel("Refresh members")
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .commaSeparatedText,
            defaultFilename: "xert-members-\(exportDateStamp)"
        ) { result in
            if case .failure(let error) = result {
                admin.errorMessage = error.localizedDescription
                XertHaptics.play(.error)
            }
        }
    }

    @ViewBuilder
    private func memberValue(_ member: AdminMemberSummary) -> some View {
        Label("\(member.credits_remaining) credits", systemImage: "ticket")
        Label("\(member.bookings_count) bookings", systemImage: "calendar")
        Text(member.totalSpent)
    }

    private func loadDirectory() async {
        await admin.searchMembers(
            session: session,
            query: normalizedQuery,
            role: role,
            credit: credit,
            page: page,
            pageSize: pageSize
        )
    }
}

private struct AdminMemberDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let member: AdminMemberSummary
    @State private var noteCategory = "general"
    @State private var noteBody = ""
    @State private var showingGrant = false
    @State private var showingNoticeComposer = false
    @State private var pendingRole: String?
    @State private var historyTab = AdminMemberHistoryTab.credits
    @State private var confirmingDiscardNote = false
    @State private var exitStateID = UUID()
    @FocusState private var noteFocused: Bool

    private var current: AdminMemberSummary { admin.members.first(where: { $0.id == member.id }) ?? member }
    private var hasNoteDraft: Bool {
        !noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    private var memberRecordIsCurrent: Bool {
        admin.loadedMemberDetailID == current.id
    }
    private var memberRecordIsRefreshing: Bool {
        admin.loadingMemberDetailID == current.id
    }
    private var memberRecordMutationsAllowed: Bool {
        memberRecordIsCurrent
            && admin.loadingMemberDetailID == nil
            && admin.memberDetailUnavailableSources.isEmpty
            && admin.servicingMemberID == nil
    }
    private var isBusy: Bool { admin.servicingMemberID != nil }
    private var isSignedInAdministrator: Bool {
        current.role == "admin" && current.id == session.user?.id
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
            if !memberRecordIsCurrent || memberRecordIsRefreshing {
                Section {
                    HStack(spacing: 10) {
                        ProgressView().tint(Color.xertSteel)
                        Text(
                            memberRecordIsCurrent
                                ? "Refreshing verified member record..."
                                : "Loading member record..."
                        )
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.xertSteel)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        memberRecordIsCurrent
                            ? "Refreshing verified member record"
                            : "Loading member record"
                    )
                }
                .listRowBackground(Color.xertInk)
            } else if !admin.memberDetailUnavailableSources.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Showing the last verified record", systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Color.orange)
                        Text("Unavailable: \(admin.memberDetailUnavailableSources.joined(separator: ", ")). Refresh before making changes.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.68))
                        Button {
                            Task {
                                await admin.loadMemberDetail(
                                    session: session,
                                    memberID: current.id,
                                    preserveCurrent: true
                                )
                            }
                        } label: {
                            Label("Retry member record", systemImage: "arrow.clockwise")
                                .frame(minHeight: 44)
                        }
                    }
                }
                .listRowBackground(Color.xertInk)
            }
            Section("Account value") {
                LabeledContent("Available credits", value: current.credits_remaining.formatted())
                LabeledContent("Bookings", value: current.bookings_count.formatted())
                LabeledContent("Paid orders", value: current.orders_count.formatted())
                LabeledContent("Lifetime spend", value: current.totalSpent)
                Button { showingGrant = true } label: { Label("Grant class credits", systemImage: "ticket") }
                    .disabled(!memberRecordMutationsAllowed)
                if admin.memberDetailUnavailableSources.contains("credit audit") {
                    Label(
                        "Credit grants are paused until the audit ledger refreshes.",
                        systemImage: "lock.trianglebadge.exclamationmark"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.orange)
                }
            }
            .listRowBackground(Color.xertInk)

            accountHistorySection

            memberReadinessSection

            privateNoticesSection

            Section("Access") {
                LabeledContent("Current role", value: current.role.capitalized)
                if isSignedInAdministrator {
                    Label(
                        "This is your signed-in administrator account. Use another trusted administrator to change its access.",
                        systemImage: "lock.shield"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.64))
                    .fixedSize(horizontal: false, vertical: true)
                }
                Button {
                    pendingRole = current.role == "admin" ? "member" : "admin"
                } label: {
                    Label(current.role == "admin" ? "Remove administrator access" : "Promote to administrator",
                          systemImage: current.role == "admin" ? "person.badge.minus" : "person.badge.key")
                }
                .foregroundStyle(current.role == "admin" ? Color.red : Color.xertSteel)
                .disabled(!memberRecordMutationsAllowed || isSignedInAdministrator)
                .accessibilityHint(
                    isSignedInAdministrator
                        ? "Your signed-in administrator account cannot remove its own access"
                        : "Opens a confirmation before changing administrator access"
                )
            }
            .listRowBackground(Color.xertInk)

            Section("Add staff note") {
                Picker("Category", selection: $noteCategory) {
                    Text("General").tag("general"); Text("Coaching").tag("coaching")
                    Text("Follow-up").tag("follow_up"); Text("Billing").tag("billing")
                }
                TextField("Operational context", text: $noteBody, axis: .vertical)
                    .lineLimit(3...7)
                    .focused($noteFocused)
                Button("Add note") {
                    noteFocused = false
                    Task {
                        if await admin.addMemberNote(session: session, memberID: current.id, category: noteCategory, body: noteBody) {
                            noteBody = ""
                            XertHaptics.play(.success)
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                }
                .disabled(!memberRecordMutationsAllowed || noteBody.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
            }
            .listRowBackground(Color.xertInk)

            Section("Staff timeline") {
                if !memberRecordIsCurrent {
                    HStack(spacing: 10) {
                        ProgressView().tint(Color.xertSteel)
                        Text("Loading staff timeline...")
                            .foregroundStyle(Color.xertPale.opacity(0.68))
                    }
                } else if admin.memberDetailUnavailableSources.contains("staff timeline") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Staff timeline is unavailable.")
                            .font(.subheadline.weight(.semibold))
                        Text("Pull down to retry. Existing notes have not been replaced or removed.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.58))
                    }
                } else if admin.memberNotes.isEmpty && !memberRecordIsRefreshing {
                    Text("No staff notes yet.")
                }
                if memberRecordIsCurrent {
                    ForEach(admin.memberNotes) { note in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(note.category.replacingOccurrences(of: "_", with: " ").uppercased())
                                    .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                                Spacer()
                                Button {
                                    Task { _ = await admin.archiveMemberNote(session: session, memberID: current.id, note: note) }
                                } label: { Image(systemName: note.archived_at == nil ? "archivebox" : "arrow.uturn.backward.circle") }
                                    .buttonStyle(.plain)
                                    .disabled(!memberRecordMutationsAllowed)
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
            }
            .listRowBackground(Color.xertInk)
        }
        .scrollContentBackground(.hidden).background(Color.xertNavy)
        .navigationTitle("Member Record").navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close", action: requestDismiss)
                    .disabled(isBusy)
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task {
                        await admin.loadMemberDetail(
                            session: session,
                            memberID: current.id,
                            preserveCurrent: true
                        )
                    }
                } label: {
                    if memberRecordIsRefreshing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(memberRecordIsRefreshing || isBusy)
                .accessibilityLabel("Refresh member record")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { noteFocused = false }
            }
        }
        .task(id: current.id) {
            await admin.loadMemberDetail(session: session, memberID: current.id)
        }
        .refreshable {
            await admin.loadMemberDetail(
                session: session,
                memberID: current.id,
                preserveCurrent: true
            )
        }
        .onDisappear { admin.clearMemberDetail(memberID: current.id) }
        .adminOwnerExitState(
            id: exitStateID,
            title: "staff note for \(current.displayName)",
            isDirty: hasNoteDraft,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(hasNoteDraft || isBusy)
        .sheet(isPresented: $showingGrant) {
            AdminCreditGrantView(admin: admin, session: session, member: current)
        }
        .sheet(isPresented: $showingNoticeComposer) {
            AdminMemberNoticeComposer(
                memberName: current.displayName,
                isSending: admin.sendingMemberNoticeID == current.id,
                onSend: { draft in
                    Task {
                        if await admin.sendMemberNotice(
                            session: session,
                            memberID: current.id,
                            draft: draft
                        ) {
                            showingNoticeComposer = false
                            XertHaptics.play(admin.memberNoticeStatusIsWarning ? .warning : .success)
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                }
            )
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
        .confirmationDialog(
            "Discard staff note?",
            isPresented: $confirmingDiscardNote,
            titleVisibility: .visible
        ) {
            Button("Discard note", role: .destructive) { dismiss() }
            Button("Keep writing", role: .cancel) {}
        } message: {
            Text("The unsaved note for \(current.displayName) will be lost.")
        }
    }

    private func requestDismiss() {
        noteFocused = false
        if hasNoteDraft {
            confirmingDiscardNote = true
        } else if !isBusy {
            dismiss()
        }
    }

    private var accountHistorySection: some View {
        Section("Account history") {
            Picker("Account history", selection: $historyTab) {
                ForEach(AdminMemberHistoryTab.allCases) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("owner.member.accountHistory")

            if !memberRecordIsCurrent {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading \(historyTab.rawValue.lowercased())...")
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                }
                .frame(minHeight: 44)
            } else {
                switch historyTab {
                case .credits:
                    creditHistory
                case .bookings:
                    bookingHistory
                case .purchases:
                    purchaseHistory
                }
            }
        }
        .listRowBackground(Color.xertInk)
    }

    @ViewBuilder
    private var creditHistory: some View {
        if admin.memberDetailUnavailableSources.contains("credit history") {
            accountHistoryWarning(
                "Credit history is unavailable.",
                detail: "Refresh before relying on this balance or its expiry dates."
            )
        } else if admin.memberCreditBatches.isEmpty {
            accountHistoryEmpty("No credit batches recorded.", icon: "ticket")
        } else {
            ForEach(admin.memberCreditBatches) { batch in
                VStack(alignment: .leading, spacing: 7) {
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            Text("\(batch.remaining) of \(batch.total) credits")
                                .font(.headline.monospacedDigit())
                            Spacer()
                            historyStatus(batch.stateLabel())
                        }
                        VStack(alignment: .leading, spacing: 5) {
                            Text("\(batch.remaining) of \(batch.total) credits")
                                .font(.headline.monospacedDigit())
                            historyStatus(batch.stateLabel())
                        }
                    }

                    if let expiry = batch.expires_at {
                        Label(
                            "Expires \(expiry.formatted(date: .abbreviated, time: .omitted))",
                            systemImage: "calendar.badge.clock"
                        )
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.65))
                    } else {
                        Label("No expiry", systemImage: "infinity")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                    }

                    if let grant = admin.memberCreditGrants.first(where: { $0.credit_batch_id == batch.id }) {
                        Label(grant.note, systemImage: "person.badge.plus")
                            .font(.caption)
                            .foregroundStyle(Color.xertSteel)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Text("Added \(batch.created_at.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption2)
                        .foregroundStyle(Color.xertPale.opacity(0.45))
                }
                .padding(.vertical, 5)
                .accessibilityElement(children: .combine)
            }

            if admin.memberDetailUnavailableSources.contains("credit audit") {
                accountHistoryWarning(
                    "Manual grant reasons are unavailable.",
                    detail: "Credit grants remain paused until the audit ledger refreshes."
                )
            }
        }
    }

    @ViewBuilder
    private var bookingHistory: some View {
        if admin.memberDetailUnavailableSources.contains("booking history") {
            accountHistoryWarning(
                "Booking history is unavailable.",
                detail: "Refresh before relying on this member's attendance record."
            )
        } else if admin.memberBookingHistory.isEmpty {
            accountHistoryEmpty("No bookings recorded.", icon: "calendar")
        } else {
            ForEach(admin.memberBookingHistory) { booking in
                VStack(alignment: .leading, spacing: 7) {
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            Text(booking.class_sessions?.displayName ?? "Class")
                                .font(.headline)
                            Spacer()
                            historyStatus(booking.statusLabel)
                        }
                        VStack(alignment: .leading, spacing: 5) {
                            Text(booking.class_sessions?.displayName ?? "Class")
                                .font(.headline)
                            historyStatus(booking.statusLabel)
                        }
                    }
                    Label(
                        (booking.class_sessions?.start_time ?? booking.created_at)
                            .formatted(date: .abbreviated, time: .shortened),
                        systemImage: "clock"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.62))
                    if let cancelledAt = booking.cancelled_at {
                        Text("Cancelled \(cancelledAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption2)
                            .foregroundStyle(Color.xertPale.opacity(0.45))
                    }
                }
                .padding(.vertical, 5)
                .accessibilityElement(children: .combine)
            }
        }
    }

    @ViewBuilder
    private var purchaseHistory: some View {
        if admin.memberDetailUnavailableSources.contains("purchase history") {
            accountHistoryWarning(
                "Purchase history is unavailable.",
                detail: "Refresh before discussing payments, refunds or purchased terms."
            )
        } else if admin.memberOrderHistory.isEmpty {
            accountHistoryEmpty("No purchases recorded.", icon: "creditcard")
        } else {
            ForEach(admin.memberOrderHistory) { order in
                NavigationLink {
                    AdminOrderDetailView(admin: admin, session: session, order: order)
                } label: {
                    VStack(alignment: .leading, spacing: 7) {
                        ViewThatFits(in: .horizontal) {
                            HStack {
                                Text(order.products?.name ?? "Session pack")
                                    .font(.headline)
                                Spacer()
                                Text(order.displayAmount)
                                    .font(.subheadline.weight(.bold).monospacedDigit())
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text(order.products?.name ?? "Session pack")
                                    .font(.headline)
                                Text(order.displayAmount)
                                    .font(.subheadline.weight(.bold).monospacedDigit())
                            }
                        }
                        HStack(spacing: 8) {
                            historyStatus(order.displayStatus)
                            Text(order.activityDate.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption)
                                .foregroundStyle(Color.xertPale.opacity(0.58))
                        }
                        Text(order.purchasedTerms)
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.62))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 5)
                }
                .accessibilityHint("Opens payment recovery, reconciliation and refund operations for this purchase")
            }
        }
    }

    private func historyStatus(_ value: String) -> some View {
        Text(value.uppercased())
            .font(.caption2.weight(.bold))
            .foregroundStyle(historyStatusColour(value))
            .fixedSize(horizontal: true, vertical: false)
    }

    private func historyStatusColour(_ value: String) -> Color {
        switch value.lowercased() {
        case "available", "paid", "confirmed", "attended": return .green
        case "expired", "used", "cancelled", "declined", "refunded": return Color.xertPale.opacity(0.5)
        case "failed": return .red
        default: return .orange
        }
    }

    private func accountHistoryWarning(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(title, systemImage: "wifi.exclamationmark")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.orange)
            Text(detail)
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.58))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(minHeight: 44, alignment: .leading)
    }

    private func accountHistoryEmpty(_ title: String, icon: String) -> some View {
        Label(title, systemImage: icon)
            .font(.subheadline)
            .foregroundStyle(Color.xertPale.opacity(0.62))
            .frame(minHeight: 44, alignment: .leading)
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
                        .disabled(
                            !memberRecordMutationsAllowed
                                || admin.revealingEmergencyContactMemberID != nil
                        )
                        Text("Use only when needed for member safety. Every reveal is recorded with the administrator and time.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.52))
                    }
                } else {
                    Text("No emergency contact is available. Ask the member to finish Member Readiness in the XERT app.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.58))
                }
            } else if admin.memberDetailUnavailableSources.contains("member readiness") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Member readiness is unavailable.")
                        .font(.subheadline.weight(.semibold))
                    Text("Pull down to retry before relying on this record in an emergency.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.58))
                }
            } else {
                Text("No member readiness record is available yet.")
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale.opacity(0.68))
            }
        }
        .listRowBackground(Color.xertInk)
    }

    private var privateNoticesSection: some View {
        Section("Private notices") {
            if let status = admin.memberNoticeStatusMessage {
                Label(
                    status,
                    systemImage: admin.memberNoticeStatusIsWarning
                        ? "exclamationmark.triangle.fill"
                        : "checkmark.circle.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(admin.memberNoticeStatusIsWarning ? Color.orange : Color.green)
                .accessibilityAddTraits(.isStaticText)
            }

            if !memberRecordIsCurrent {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading private notice history...")
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                }
            } else if admin.memberDetailUnavailableSources.contains("private notices") {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Private notice history is unavailable.", systemImage: "wifi.exclamationmark")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.orange)
                    Text("Refresh this member record before sending or relying on delivery history.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.58))
                }
            } else {
                Button {
                    showingNoticeComposer = true
                    XertHaptics.play(.lightImpact)
                } label: {
                    HStack {
                        Label("Send private notice", systemImage: "bell.badge")
                        Spacer()
                        if admin.sendingMemberNoticeID == current.id {
                            ProgressView().tint(Color.xertSteel)
                        } else {
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                        }
                    }
                    .frame(minHeight: 44)
                }
                .disabled(!memberRecordMutationsAllowed)
                .accessibilityHint("Composes an account-only message with optional Apple push delivery")

                if admin.loadingMemberDetailID == current.id && admin.memberNotices.isEmpty {
                    HStack {
                        ProgressView().tint(Color.xertSteel)
                        Text("Loading delivery history...")
                            .foregroundStyle(Color.xertPale.opacity(0.68))
                    }
                } else if admin.memberNotices.isEmpty {
                    Text("No private notices have been sent to this member.")
                        .font(.subheadline)
                        .foregroundStyle(Color.xertPale.opacity(0.62))
                }

                ForEach(admin.memberNotices) { notice in
                    AdminMemberNoticeHistoryRow(notice: notice)
                }
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

private struct AdminMemberNoticeHistoryRow: View {
    let notice: AdminMemberNotice

    private var toneColour: Color {
        switch notice.tone {
        case "urgent": return .red
        case "action": return .orange
        default: return Color.xertSteel
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(notice.sourceLabel.uppercased())
                    .font(.caption2.weight(.black))
                    .foregroundStyle(toneColour)
                Spacer(minLength: 8)
                Text(notice.published_at.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Color.xertPale.opacity(0.45))
            }
            Text(notice.title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.xertOffWhite)
            Text(notice.body)
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.68))
                .lineLimit(4)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { evidence }
                VStack(alignment: .leading, spacing: 5) { evidence }
            }
            if let label = notice.cta_label {
                Label(label, systemImage: "arrow.up.forward.app")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.xertSteel)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(notice.sourceLabel), \(notice.title), \(notice.receiptLabel), \(notice.deliveryLabel)"
        )
    }

    @ViewBuilder
    private var evidence: some View {
        Label(
            notice.receiptLabel,
            systemImage: notice.read_at == nil ? "envelope" : "envelope.open"
        )
        Label(
            notice.deliveryLabel,
            systemImage: notice.push_delivered > 0
                ? "checkmark.circle.fill"
                : notice.push_failed > 0 ? "exclamationmark.triangle" : "iphone"
        )
        if let expiresAt = notice.expires_at {
            Label(
                expiresAt <= Date()
                    ? "Expired \(expiresAt.formatted(date: .abbreviated, time: .omitted))"
                    : "Expires \(expiresAt.formatted(date: .abbreviated, time: .omitted))",
                systemImage: "calendar.badge.clock"
            )
        }
    }
}

private struct AdminMemberNoticeComposer: View {
    @Environment(\.dismiss) private var dismiss
    let memberName: String
    let isSending: Bool
    let onSend: (AdminMemberNoticeDraft) -> Void
    @State private var draft = AdminMemberNoticeDraft()
    @State private var confirmingSend = false
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case title
        case body
    }

    private var isDirty: Bool { draft != AdminMemberNoticeDraft() }
    private var validation: String? { draft.validationMessage() }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("PRIVATE MEMBER MESSAGE", systemImage: "person.crop.circle.badge.exclamationmark")
                            .font(.caption.weight(.black))
                            .foregroundStyle(Color.xertSteel)
                        Text(memberName)
                            .font(.title3.weight(.bold))
                            .foregroundStyle(Color.xertOffWhite)
                        Text("Only this member can see the notice in their XERT account.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.58))
                    }
                    .padding(.vertical, 4)
                }

                Section("Notice") {
                    TextField("Title", text: $draft.title)
                        .focused($focusedField, equals: .title)
                        .onChange(of: draft.title) { value in
                            if value.count > 120 { draft.title = String(value.prefix(120)) }
                        }
                    HStack {
                        Spacer()
                        Text("\(draft.title.count)/120")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(Color.xertPale.opacity(0.45))
                    }
                    TextEditor(text: $draft.body)
                        .focused($focusedField, equals: .body)
                        .frame(minHeight: 160)
                        .onChange(of: draft.body) { value in
                            if value.count > 2_000 { draft.body = String(value.prefix(2_000)) }
                        }
                    HStack {
                        Spacer()
                        Text("\(draft.body.count)/2000")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(Color.xertPale.opacity(0.45))
                    }
                }

                Section("Delivery") {
                    Picker("Priority", selection: $draft.tone) {
                        Text("Information").tag("info")
                        Text("Action needed").tag("action")
                        Text("Urgent").tag("urgent")
                    }
                    Picker("Member action", selection: $draft.action) {
                        ForEach(AdminMemberNoticeAction.allCases) { action in
                            Text(action.title).tag(action)
                        }
                    }
                    Picker("Expires after", selection: $draft.expiryDays) {
                        Text("7 days").tag(7)
                        Text("30 days").tag(30)
                        Text("90 days").tag(90)
                    }
                    Text("The notice is saved first, then XERT attempts Apple push delivery to the member's enabled devices.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.55))
                }

                if let validation {
                    Section {
                        Label(validation, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.orange)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.xertNavy)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Private Notice")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button {
                    focusedField = nil
                    confirmingSend = true
                } label: {
                    Label(isSending ? "Sending..." : "Review & Send", systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
                .disabled(isSending || validation != nil)
                .accessibilityIdentifier("owner.memberNotice.send")
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { requestClose() }
                        .disabled(isSending)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
            .confirmationDialog(
                "Send this private notice to \(memberName)?",
                isPresented: $confirmingSend,
                titleVisibility: .visible
            ) {
                Button("Send private notice") { onSend(draft) }
                    .disabled(isSending || validation != nil)
                Button("Keep editing", role: .cancel) {}
            } message: {
                Text("The notice becomes available in this member's account immediately. Apple push delivery is attempted once.")
            }
            .confirmationDialog(
                "Discard private notice draft?",
                isPresented: $confirmingDiscard,
                titleVisibility: .visible
            ) {
                Button("Discard draft", role: .destructive) { dismiss() }
                Button("Keep writing", role: .cancel) {}
            } message: {
                Text("The title, message and delivery choices will be lost.")
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: "private notice for \(memberName)",
            isDirty: isDirty,
            isBusy: isSending
        )
        .interactiveDismissDisabled(isDirty || isSending)
    }

    private func requestClose() {
        focusedField = nil
        if isDirty {
            confirmingDiscard = true
        } else {
            dismiss()
        }
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
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var reasonFocused: Bool

    private var isDirty: Bool {
        sessions != 1
            || validityDays != 28
            || noExpiry
            || !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    private var isBusy: Bool { admin.servicingMemberID != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Credit grant") {
                    Stepper("Credits: \(sessions)", value: $sessions, in: 1...100)
                    Toggle("No expiry", isOn: $noExpiry)
                    if !noExpiry { Stepper("Valid for \(validityDays) days", value: $validityDays, in: 1...3_650) }
                    TextField("Reason", text: $reason, axis: .vertical)
                        .lineLimit(3...6)
                        .focused($reasonFocused)
                    Text("Manual grants are permanently audited and idempotent.").font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Grant to \(member.displayName)").navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: requestDismiss)
                        .disabled(isBusy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Grant") {
                        reasonFocused = false
                        let id = requestID
                        Task {
                            if await admin.grantCredits(session: session, memberID: member.id, sessions: sessions,
                                                        validityDays: noExpiry ? nil : validityDays, requestID: id, note: reason) {
                                requestID = UUID()
                                XertHaptics.play(.success)
                                dismiss()
                            } else {
                                XertHaptics.play(.error)
                            }
                        }
                    }
                    .disabled(isBusy || reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { reasonFocused = false }
                }
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: "manual credit grant",
            isDirty: isDirty,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(isDirty || isBusy)
        .confirmationDialog(
            "Discard manual credit grant?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard grant", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("No credits have been granted yet. The amount, expiry and audit reason will be lost.")
        }
    }

    private func requestDismiss() {
        reasonFocused = false
        if isDirty {
            confirmingDiscard = true
        } else {
            dismiss()
        }
    }
}

private struct AdminClassesView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var promotion: AdminWaitlistItem?

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
                            Button {
                                promotion = item
                            } label: {
                                Label("Promote next member", systemImage: "person.fill.badge.plus")
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Color.xertSteel)
                            .disabled(
                                !waitlistIsCurrent || !item.can_promote
                                    || item.next_available_credits < 1 || admin.promotingSessionID != nil
                            )
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
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let operation: AdminDailyOperation
    @State private var attendance = AdminAttendanceDraft()
    @State private var attendanceBaseline = AdminAttendanceDraft()
    @State private var confirmingRollCall = false
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @State private var presentedMember: AdminMemberSummary?
    @State private var openingMemberID: UUID?

    private var rosterIsCurrent: Bool { admin.loadedRosterSessionID == operation.id }
    private var roster: [AdminRosterMember] { rosterIsCurrent ? admin.classRoster : [] }
    private var eligible: [AdminRosterMember] { roster.filter(\.attendanceEligible) }
    private var readinessRelevant: [AdminRosterMember] {
        roster.filter { ["requested", "confirmed", "attended"].contains($0.status) }
    }
    private var incompleteReadiness: [AdminRosterMember] {
        readinessRelevant.filter {
            admin.classRosterReadiness[$0.member_id]?.onboarding_complete == false
        }
    }
    private var attendanceSummary: AdminAttendanceSummary { attendance.summary }
    private var isDirty: Bool { attendance != attendanceBaseline }
    private var isBusy: Bool { admin.recordingAttendanceSessionID == operation.id }
    private var loadFailed: Bool { admin.rosterLoadErrorSessionID == operation.id }
    private var canRecordAttendance: Bool {
        rosterIsCurrent && attendanceSummary.isComplete && operation.start_time <= Date()
            && !isBusy
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

            if rosterIsCurrent, !readinessRelevant.isEmpty {
                Section("Training readiness") {
                    if let warning = admin.rosterReadinessStatusMessage {
                        Label(warning, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if admin.loadingRosterSessionID == operation.id {
                        HStack(spacing: 10) {
                            ProgressView().tint(Color.xertSteel)
                            Text("Checking member readiness...")
                        }
                        .foregroundStyle(Color.xertPale.opacity(0.72))
                    } else if incompleteReadiness.isEmpty {
                        Label(
                            "Every active booking has completed the required readiness steps.",
                            systemImage: "checkmark.shield.fill"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.green)
                    } else {
                        Label(
                            "\(incompleteReadiness.count) active booking\(incompleteReadiness.count == 1 ? "" : "s") need readiness review before training.",
                            systemImage: "person.crop.circle.badge.exclamationmark"
                        )
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .listRowBackground(Color.xertInk)
            }

            Section("Member roster") {
                if !rosterIsCurrent, admin.loadingRosterSessionID == operation.id {
                    HStack { Spacer(); ProgressView().tint(Color.xertSteel); Spacer() }
                } else if !rosterIsCurrent, loadFailed {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Roster unavailable", systemImage: "wifi.exclamationmark")
                            .font(.headline)
                            .foregroundStyle(Color.orange)
                        Text(admin.rosterLoadErrorMessage ?? "The class roster could not be loaded.")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.72))
                            .fixedSize(horizontal: false, vertical: true)
                        Button {
                            Task { await loadRoster(preserveCurrent: false) }
                        } label: {
                            Label("Retry roster", systemImage: "arrow.clockwise")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.xertSteel)
                        .foregroundStyle(Color.xertNavy)
                    }
                    .padding(.vertical, 4)
                } else if rosterIsCurrent, loadFailed {
                    Label(
                        "Showing the last verified roster. Refresh failed: \(admin.rosterLoadErrorMessage ?? "connection unavailable")",
                        systemImage: "exclamationmark.arrow.triangle.2.circlepath"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                } else if rosterIsCurrent, roster.isEmpty {
                    Text("No member bookings for this class.")
                }
                ForEach(roster) { member in
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
                        readinessBadge(for: member)
                        if member.attendanceEligible && operation.start_time <= Date() {
                            attendanceControl(for: member)
                        }
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 14) { memberActions(for: member) }
                            VStack(alignment: .leading, spacing: 10) { memberActions(for: member) }
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.xertSteel)
                    }
                    .padding(.vertical, 5)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if operation.start_time <= Date() {
                VStack(spacing: 0) {
                    Divider().overlay(Color.xertSteel.opacity(0.25))
                    Button { confirmingRollCall = true } label: {
                        HStack {
                            if admin.recordingAttendanceSessionID == operation.id {
                                ProgressView().tint(Color.xertNavy)
                            }
                            Label(
                                attendanceSummary.isComplete
                                    ? "Save complete roll call"
                                    : "\(attendanceSummary.marked) of \(attendanceSummary.total) marked",
                                systemImage: "checklist"
                            )
                            .fontWeight(.bold)
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.xertSteel)
                    .foregroundStyle(Color.xertNavy)
                    .controlSize(.large)
                    .disabled(!canRecordAttendance)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }
                .background(.ultraThinMaterial)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(operation.title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: operation.id) { await loadRoster(preserveCurrent: false) }
        .refreshable { await loadRoster(preserveCurrent: true) }
        .onChange(of: admin.classRoster) { roster in
            guard rosterIsCurrent else { return }
            attendance.reconcile(roster: roster)
            attendanceBaseline.reconcile(roster: roster)
        }
        .sheet(item: $presentedMember) { member in
            NavigationStack {
                AdminMemberDetailView(admin: admin, session: session, member: member)
            }
        }
        .navigationBarBackButtonHidden(isDirty)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await loadRoster(preserveCurrent: true) }
                } label: {
                    if admin.loadingRosterSessionID == operation.id {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(admin.loadingRosterSessionID == operation.id || isBusy)
                .accessibilityLabel("Refresh class roster")
            }
            if isDirty {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: requestDismiss) {
                        Image(systemName: "chevron.left")
                            .frame(width: 44, height: 44)
                    }
                    .disabled(isBusy)
                    .accessibilityLabel("Back")
                    .accessibilityHint("Asks before discarding this unfinished roll call")
                }
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: "roll call for \(operation.title)",
            isDirty: isDirty,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(isDirty || isBusy)
        .confirmationDialog("Complete this class?", isPresented: $confirmingRollCall, titleVisibility: .visible) {
            Button("Record attendance and complete class") {
                let attended = attendance.attendedIDs
                let noShows = attendance.noShowIDs
                Task {
                    let didRecord = await admin.recordAttendance(
                        session: session,
                        classSessionID: operation.id,
                        attendedIDs: attended,
                        noShowIDs: noShows
                    )
                    if didRecord {
                        if admin.loadedRosterSessionID == operation.id {
                            attendance = AdminAttendanceDraft(roster: admin.classRoster)
                            attendanceBaseline = attendance
                        }
                        XertHaptics.play(.success)
                    } else {
                        XertHaptics.play(.error)
                    }
                }
            }
            Button("Review roll call", role: .cancel) {}
        } message: {
            Text("Record \(attendanceSummary.attended) present and \(attendanceSummary.noShow) no show, complete the class, and remove it from the public timetable.")
        }
        .confirmationDialog(
            "Discard unfinished roll call?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard marks", role: .destructive) { dismiss() }
            Button("Keep marking attendance", role: .cancel) {}
        } message: {
            Text("\(attendanceSummary.marked) attendance mark\(attendanceSummary.marked == 1 ? "" : "s") will be lost.")
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

    @ViewBuilder
    private func readinessBadge(for member: AdminRosterMember) -> some View {
        if ["requested", "confirmed", "attended"].contains(member.status),
           let readiness = admin.classRosterReadiness[member.member_id] {
            if readiness.onboarding_complete {
                Label("Training ready", systemImage: "checkmark.shield.fill")
                    .foregroundStyle(Color.green)
            } else {
                Label(readinessIssueLabel(readiness), systemImage: "exclamationmark.shield.fill")
                    .foregroundStyle(Color.orange)
            }
        }
    }

    @ViewBuilder
    private func memberActions(for member: AdminRosterMember) -> some View {
        Button { openMemberRecord(member.member_id) } label: {
            Label(
                openingMemberID == member.member_id ? "Opening..." : "Member record",
                systemImage: "person.text.rectangle"
            )
            .frame(minHeight: 32)
        }
        .buttonStyle(.plain)
        .disabled(openingMemberID != nil)
        if let email = contact(member.email), let url = URL(string: "mailto:\(email)") {
            Link(destination: url) { Label("Email", systemImage: "envelope").frame(minHeight: 32) }
        }
        if let phone = contact(member.phone),
           let encoded = phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
           let url = URL(string: "tel:\(encoded)") {
            Link(destination: url) { Label("Call", systemImage: "phone").frame(minHeight: 32) }
        }
    }

    private func readinessIssueLabel(_ readiness: AdminMemberOnboardingSummary) -> String {
        var issues: [String] = []
        if !readiness.profile_complete { issues.append("profile") }
        if !readiness.emergency_contact_complete { issues.append("emergency contact") }
        if !readiness.documents_complete { issues.append("documents") }
        return "Review " + issues.joined(separator: ", ")
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

    private func contact(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func requestDismiss() {
        if isDirty {
            confirmingDiscard = true
        } else {
            dismiss()
        }
    }

    @MainActor
    private func loadRoster(preserveCurrent: Bool) async {
        let wasDirty = isDirty
        let didLoad = await admin.loadClassRoster(
            session: session,
            classSessionID: operation.id,
            preserveCurrent: preserveCurrent
        )
        guard didLoad, admin.loadedRosterSessionID == operation.id else { return }
        if !wasDirty {
            attendance = AdminAttendanceDraft(roster: admin.classRoster)
            attendanceBaseline = attendance
        }
    }
}

private struct AdminScheduleView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    @State private var scope = AdminScheduleScope.upcoming
    @State private var showingCreate = false
    @State private var pendingCancellation: AdminClassSession?

    private var timetableIsCurrent: Bool {
        admin.loadedSources.contains("full timetable")
            && !admin.refreshUnavailableSources.contains("full timetable")
    }

    private var timetableIsLoading: Bool {
        admin.isLoading && !admin.loadedSources.contains("full timetable")
    }

    private var rows: [AdminClassSession] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let scoped = admin.classSessions.filter { scope.includes($0, now: Date()) }
        let filtered = term.isEmpty ? scoped : scoped.filter {
            "\($0.title) \($0.class_type ?? "") \($0.coach_name ?? "") \($0.location_zone ?? "")".lowercased().contains(term)
        }
        return filtered.sorted {
            let left = $0.start_time ?? .distantPast
            let right = $1.start_time ?? .distantPast
            return scope == .upcoming ? left < right : left > right
        }
    }

    private func count(for scope: AdminScheduleScope) -> Int {
        admin.classSessions.filter { scope.includes($0, now: Date()) }.count
    }

    private var emptyMessage: String {
        if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "No matching \(scope.title.lowercased()) classes."
        }
        switch scope {
        case .upcoming: return "No current or upcoming classes are scheduled."
        case .past: return "No past classes are available."
        case .all: return "No classes are scheduled."
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
            Section {
                Picker("Timetable scope", selection: $scope) {
                    ForEach(AdminScheduleScope.allCases) { option in
                        Text("\(option.title) \(count(for: option))")
                            .tag(option)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("owner.timetable.scope")
            }
            .listRowBackground(Color.xertInk)

            if timetableIsLoading {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading the full timetable...")
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                }
                .frame(minHeight: 44)
                .listRowBackground(Color.xertInk)
            } else {
                if !timetableIsCurrent {
                    Label(
                        admin.classSessions.isEmpty
                            ? "The full timetable is unavailable. Refresh before managing classes."
                            : "Showing the last timetable snapshot. Refresh before editing or cancelling a class.",
                        systemImage: "exclamationmark.triangle.fill"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
                }
                if rows.isEmpty {
                    Text(emptyMessage)
                        .foregroundStyle(Color.xertPale.opacity(0.65))
                        .listRowBackground(Color.xertInk)
                }
                ForEach(rows) { item in
                    classRow(item)
                }
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
                    .disabled(!timetableIsCurrent)
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                AdminClassEditor(
                    admin: admin,
                    session: session,
                    classSession: nil,
                    mutationAllowed: timetableIsCurrent
                )
            }
        }
        .refreshable { await admin.refresh(session: session) }
        .sheet(
            item: Binding(
                get: { admin.classCancellationFollowUp },
                set: { if $0 == nil { admin.clearClassCancellationFollowUp() } }
            )
        ) { followUp in
            AdminClassCancellationFollowUpView(
                followUp: followUp,
                onClose: admin.clearClassCancellationFollowUp
            )
        }
        .confirmationDialog(
            "Cancel this class?",
            isPresented: Binding(get: { pendingCancellation != nil }, set: { if !$0 { pendingCancellation = nil } }),
            presenting: pendingCancellation
        ) { item in
            Button("Cancel \(item.title)", role: .destructive) {
                Task {
                    let outcome = await admin.cancelClass(session: session, classSession: item)
                    XertHaptics.play(outcome == nil ? .error : .warning)
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
                AdminClassEditor(
                    admin: admin,
                    session: session,
                    classSession: item,
                    mutationAllowed: timetableIsCurrent
                )
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
            .disabled(
                !timetableIsCurrent
                    || admin.savingClassID != nil
                    || admin.cancellingClassID != nil
            )
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

private struct AdminClassCancellationFollowUpView: View {
    let followUp: AdminClassCancellationFollowUp
    let onClose: () -> Void
    @State private var copiedMessage = false

    var body: some View {
        NavigationStack {
            List {
                Section("Cancellation result") {
                    Label {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(followUp.classTitle)
                                .font(.headline)
                            Text(affectedSummary)
                                .font(.caption)
                                .foregroundStyle(Color.xertPale.opacity(0.62))
                        }
                    } icon: {
                        Image(systemName: "calendar.badge.minus")
                            .foregroundStyle(Color.orange)
                    }

                    if !followUp.refreshWarnings.isEmpty {
                        Label(
                            "Class cancelled, but \(followUp.refreshWarnings.joined(separator: ", ")) could not refresh.",
                            systemImage: "exclamationmark.arrow.triangle.2.circlepath"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .listRowBackground(Color.xertInk)

                if followUp.affectedBookings > 0 {
                    notificationSection
                    contactSection

                    Section("Ready-to-send message") {
                        Text(followUp.message.body)
                            .font(.subheadline)
                            .foregroundStyle(Color.xertOffWhite)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                        if followUp.omittedEmailCount > 0 {
                            Label(
                                "\(followUp.omittedEmailCount) additional email recipient\(followUp.omittedEmailCount == 1 ? " was" : "s were") omitted from the bounded BCC message.",
                                systemImage: "person.crop.circle.badge.exclamationmark"
                            )
                            .font(.caption)
                            .foregroundStyle(Color.orange)
                        }
                    }
                    .listRowBackground(Color.xertInk)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.xertNavy)
            .navigationTitle("Cancellation Follow-up")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { onClose() }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if followUp.affectedBookings > 0 {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) {
                            followUpActions(expands: false)
                        }
                        VStack(spacing: 10) {
                            followUpActions(expands: true)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.ultraThinMaterial)
                }
            }
        }
        .interactiveDismissDisabled()
    }

    private var notificationSection: some View {
        Section("Member notification") {
            if let notification = followUp.notification {
                Label(
                    "Private notice created for \(notification.recipients) member account\(notification.recipients == 1 ? "" : "s").",
                    systemImage: "bell.badge.fill"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.xertSteel)

                Label(pushSummary(notification.push), systemImage: pushIcon(notification.push))
                    .font(.caption)
                    .foregroundStyle(notification.push.delivered > 0 ? Color.green : Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let warning = followUp.notificationWarning {
                Label(warning, systemImage: "bell.slash.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Label(
                    "The cancellation notice exists in affected member accounts. Use the contact fallback below.",
                    systemImage: "bell"
                )
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.65))
            }
        }
        .listRowBackground(Color.xertInk)
    }

    private var contactSection: some View {
        Section("Contact fallback") {
            if followUp.contactLookupIncomplete {
                Label(
                    "One booking source could not be checked. Review Booking Requests before considering follow-up complete.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.orange)
                .fixedSize(horizontal: false, vertical: true)
            }

            if followUp.contacts.isEmpty {
                Text("No email address or callable phone number was available for affected bookings.")
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale.opacity(0.62))
            } else {
                ForEach(followUp.contacts) { contact in
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 12) {
                            contactIdentity(contact)
                            Spacer(minLength: 8)
                            contactActions(contact)
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            contactIdentity(contact)
                            contactActions(contact)
                        }
                    }
                    .frame(minHeight: 44)
                }
            }
        }
        .listRowBackground(Color.xertInk)
    }

    private func contactIdentity(_ contact: AdminClassCancellationContact) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(contact.displayName)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.xertOffWhite)
            Text([contact.email, contact.phone].compactMap { $0 }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.55))
                .lineLimit(2)
        }
    }

    private func contactActions(_ contact: AdminClassCancellationContact) -> some View {
        HStack(spacing: 6) {
            if let emailURL = contact.emailURL {
                Link(destination: emailURL) {
                    Image(systemName: "envelope")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Email \(contact.displayName)")
            }
            if let phoneURL = contact.phoneURL {
                Link(destination: phoneURL) {
                    Image(systemName: "phone")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Call \(contact.displayName)")
            }
        }
        .foregroundStyle(Color.xertSteel)
    }

    @ViewBuilder
    private func followUpActions(expands: Bool) -> some View {
        Button {
            UIPasteboard.general.string = followUp.message.body
            copiedMessage = true
            XertHaptics.play(.success)
        } label: {
            Label(copiedMessage ? "Message copied" : "Copy message", systemImage: copiedMessage ? "checkmark" : "doc.on.doc")
                .frame(maxWidth: expands ? .infinity : nil, minHeight: 46)
        }
        .buttonStyle(.bordered)
        .tint(Color.xertSteel)

        if let mailtoURL = followUp.mailtoURL {
            Link(destination: mailtoURL) {
                Label("Email \(followUp.emailRecipientCount) via BCC", systemImage: "envelope.fill")
                    .frame(maxWidth: expands ? .infinity : nil, minHeight: 46)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.xertSteel)
            .foregroundStyle(Color.xertNavy)
        }
    }

    private var affectedSummary: String {
        guard followUp.affectedBookings > 0 else {
            return "No active bookings needed to be cancelled."
        }
        return "\(followUp.affectedBookings) active booking\(followUp.affectedBookings == 1 ? " was" : "s were") cancelled. Reserved credits were returned."
    }

    private func pushSummary(_ push: AdminAnnouncementPushSummary) -> String {
        if push.delivered > 0 {
            return "\(push.delivered) Apple push notification\(push.delivered == 1 ? " was" : "s were") delivered."
        }
        if !push.configured {
            return "Apple push is not configured. The private notice remains available in XERT."
        }
        if push.attempted > 0 {
            return "Apple push was attempted but did not reach a registered device."
        }
        return "No enabled Apple device was registered. The private notice remains available in XERT."
    }

    private func pushIcon(_ push: AdminAnnouncementPushSummary) -> String {
        push.delivered > 0 ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
    }
}

private struct AdminClassEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.adminEditorExitCoordinator) private var editorExitCoordinator
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let classSession: AdminClassSession?
    let mutationAllowed: Bool
    private let baseline: AdminClassDraft
    @State private var draft: AdminClassDraft
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var textInputFocused: Bool

    private var isTerminal: Bool { classSession.map { ["cancelled", "completed"].contains($0.status) } ?? false }
    private var isDirty: Bool { draft != baseline }
    private var isBusy: Bool { admin.savingClassID != nil }
    private var editorTitle: String { classSession == nil ? "new class" : "class changes" }

    init(
        admin: AdminStore,
        session: AuthSession,
        classSession: AdminClassSession?,
        mutationAllowed: Bool
    ) {
        let initial = AdminClassDraft(classSession: classSession)
        self.admin = admin
        self.session = session
        self.classSession = classSession
        self.mutationAllowed = mutationAllowed
        baseline = initial
        _draft = State(initialValue: initial)
    }

    var body: some View {
        Form {
            if !mutationAllowed {
                Section {
                    Label(
                        "This timetable snapshot is not current. Close this editor and refresh before changing the class.",
                        systemImage: "lock.trianglebadge.exclamationmark"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.orange)
                }
            }
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
                    .focused($textInputFocused)
                TextField("Description", text: $draft.description, axis: .vertical)
                    .lineLimit(2...6)
                    .focused($textInputFocused)
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
                    .focused($textInputFocused)
                TextField("Location or zone", text: $draft.location)
                    .focused($textInputFocused)
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
                TextField("Notes", text: $draft.notes, axis: .vertical)
                    .lineLimit(2...6)
                    .focused($textInputFocused)
            }
            if !isTerminal {
                Section {
                    Button {
                        Task {
                            if await admin.saveClass(session: session, classSession: classSession, draft: draft) {
                                XertHaptics.play(.success)
                                editorExitCoordinator?.clear(id: exitStateID)
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
                    .disabled(!mutationAllowed || isBusy || !isDirty)
                    .listRowBackground(Color.xertSteel)
                    .foregroundStyle(Color.xertNavy)
                }
            }
        }
        .disabled(isTerminal || !mutationAllowed)
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(classSession == nil ? "New Class" : "Edit Class")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: requestDismiss) {
                    Image(systemName: classSession == nil ? "xmark" : "chevron.left")
                        .frame(width: 44, height: 44)
                }
                .disabled(isBusy)
                .accessibilityLabel(classSession == nil ? "Cancel" : "Back")
                .accessibilityHint(isDirty ? "Asks before discarding unsaved class changes" : "Returns to the timetable")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { textInputFocused = false }
            }
        }
        .onChange(of: draft.status) { status in
            if status != "published" { draft.publicVisible = false }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: editorTitle,
            isDirty: isDirty,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(isDirty || isBusy)
        .confirmationDialog(
            "Discard unsaved class changes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard changes", role: .destructive) {
                editorExitCoordinator?.clear(id: exitStateID)
                dismiss()
            }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("This class draft has not been saved.")
        }
    }

    private func requestDismiss() {
        textInputFocused = false
        guard !isBusy else { return }
        if isDirty {
            confirmingDiscard = true
        } else {
            editorExitCoordinator?.clear(id: exitStateID)
            dismiss()
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
    @State private var range = "upcoming"
    @State private var showingCreate = false
    @State private var pendingRemoval: AdminScheduleRemoval?

    private var activeSource: String { mode == "availability" ? "availability" : "blackouts" }
    private var activeSourceIsCurrent: Bool {
        admin.loadedSources.contains(activeSource)
            && !admin.refreshUnavailableSources.contains(activeSource)
    }
    private var timetableIsCurrent: Bool {
        admin.loadedSources.contains("full timetable")
            && !admin.refreshUnavailableSources.contains("full timetable")
    }
    private var activeMutationAllowed: Bool {
        activeSourceIsCurrent && (mode == "availability" || timetableIsCurrent)
    }
    private var visibleAvailability: [AdminAvailabilityBlock] {
        range == "all" ? admin.availabilityBlocks : admin.availabilityBlocks.filter { $0.end_time >= Date() }
    }
    private var visibleBlackouts: [AdminBlackoutPeriod] {
        range == "all" ? admin.blackoutPeriods : admin.blackoutPeriods.filter { $0.end_time >= Date() }
    }

    var body: some View {
        List {
            Section {
                Picker("Schedule controls", selection: $mode) {
                    Text("Availability").tag("availability")
                    Text("Blackouts").tag("blackouts")
                }
                .pickerStyle(.segmented)
                Picker("Schedule range", selection: $range) {
                    Text("Upcoming").tag("upcoming")
                    Text("All records").tag("all")
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.xertNavy)

            if let warning = admin.scheduleMutationWarning {
                Label(warning, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }

            if admin.isRefreshingScheduleControls && !admin.loadedSources.contains(activeSource) {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading \(activeSource)...")
                }
                .frame(minHeight: 44)
                .listRowBackground(Color.xertInk)
            } else if !activeSourceIsCurrent {
                scheduleUnavailableRow
            } else if mode == "blackouts" && !timetableIsCurrent {
                Label(
                    "The timetable is not current. Blackouts are read-only until class conflicts can be checked safely.",
                    systemImage: "calendar.badge.exclamationmark"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.orange)
                .fixedSize(horizontal: false, vertical: true)
                .listRowBackground(Color.xertInk)
            }

            if mode == "availability" {
                if activeSourceIsCurrent && visibleAvailability.isEmpty {
                    Text(range == "upcoming" ? "No upcoming availability blocks." : "No availability blocks set.")
                        .listRowBackground(Color.xertInk)
                }
                ForEach(visibleAvailability) { block in
                    scheduleRow(
                        title: block.type,
                        detail: scheduleRange(block.start_time, block.end_time),
                        note: [block.coach_name, block.notes].compactMap { $0 }.joined(separator: " · "),
                        accent: block.is_bookable ? .green : Color.xertSteel,
                        badge: block.is_bookable ? "BOOKABLE" : "PLANNING",
                        mutationAllowed: activeSourceIsCurrent
                    ) {
                        AdminAvailabilityEditor(
                            admin: admin,
                            session: session,
                            block: block,
                            mutationAllowed: activeSourceIsCurrent
                        )
                    } remove: { pendingRemoval = .availability(block) }
                }
            } else {
                if activeSourceIsCurrent && visibleBlackouts.isEmpty {
                    Text(range == "upcoming" ? "No upcoming blackout periods." : "No blackout periods set.")
                        .listRowBackground(Color.xertInk)
                }
                ForEach(visibleBlackouts) { period in
                    scheduleRow(
                        title: period.reason.capitalized,
                        detail: scheduleRange(period.start_time, period.end_time),
                        note: "Affects \(period.affects.replacingOccurrences(of: "_", with: " "))" + (period.notes.map { " · \($0)" } ?? ""),
                        accent: .red,
                        badge: "CLOSED",
                        mutationAllowed: activeMutationAllowed
                    ) {
                        AdminBlackoutEditor(
                            admin: admin,
                            session: session,
                            period: period,
                            mutationAllowed: activeMutationAllowed
                        )
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
                    .disabled(!activeMutationAllowed)
            }
        }
        .refreshable { await admin.refreshScheduleControls(session: session) }
        .task {
            if !admin.loadedSources.contains("availability")
                || !admin.loadedSources.contains("blackouts")
                || !admin.loadedSources.contains("full timetable") {
                await admin.refreshScheduleControls(session: session)
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                if mode == "availability" {
                    AdminAvailabilityEditor(
                        admin: admin,
                        session: session,
                        block: nil,
                        mutationAllowed: activeSourceIsCurrent
                    )
                } else {
                    AdminBlackoutEditor(
                        admin: admin,
                        session: session,
                        period: nil,
                        mutationAllowed: activeMutationAllowed
                    )
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
            .disabled(!removalMutationAllowed(removal))
            Button("Keep", role: .cancel) { pendingRemoval = nil }
        } message: { removal in
            switch removal {
            case .availability: Text("This time will no longer appear available for planning.")
            case .blackout: Text("Classes and staff planning may immediately become available during this period.")
            }
        }
    }

    private func removalMutationAllowed(_ removal: AdminScheduleRemoval) -> Bool {
        switch removal {
        case .availability:
            return admin.loadedSources.contains("availability")
                && !admin.refreshUnavailableSources.contains("availability")
        case .blackout:
            return admin.loadedSources.contains("blackouts")
                && !admin.refreshUnavailableSources.contains("blackouts")
                && timetableIsCurrent
        }
    }

    private var scheduleUnavailableRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                admin.loadedSources.contains(activeSource)
                    ? "Showing the last \(activeSource) snapshot. Changes are paused until refresh succeeds."
                    : "\(activeSource.capitalized) could not be loaded. No empty-state assumption is being made.",
                systemImage: "wifi.exclamationmark"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.orange)
            .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await admin.refreshScheduleControls(session: session) }
            } label: {
                Label(
                    admin.isRefreshingScheduleControls ? "Retrying..." : "Retry schedule controls",
                    systemImage: "arrow.clockwise"
                )
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.orange)
            .disabled(admin.isRefreshingScheduleControls)
        }
        .listRowBackground(Color.xertInk)
    }

    private func scheduleRange(_ start: Date, _ end: Date) -> String {
        "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))"
    }

    private func scheduleRow<Destination: View>(
        title: String, detail: String, note: String, accent: Color, badge: String,
        mutationAllowed: Bool,
        @ViewBuilder destination: () -> Destination, remove: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink(destination: destination()) {
                VStack(alignment: .leading, spacing: 4) {
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            Text(title).font(.headline)
                            Spacer()
                            Text(badge).font(.caption2.weight(.bold)).foregroundStyle(accent)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(title).font(.headline)
                            Text(badge).font(.caption2.weight(.bold)).foregroundStyle(accent)
                        }
                    }
                    Text(detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.65))
                    if !note.isEmpty { Text(note).font(.caption2).foregroundStyle(Color.xertPale.opacity(0.45)) }
                }
            }
            HStack {
                Spacer()
                Button(role: .destructive, action: remove) { Image(systemName: "trash") }
                    .buttonStyle(.plain)
                    .disabled(!mutationAllowed || admin.deletingScheduleWindowID != nil)
                    .accessibilityLabel("Remove \(title)")
            }
        }
        .foregroundStyle(Color.xertOffWhite)
        .padding(.vertical, 5)
        .listRowBackground(Color.xertInk)
    }
}

private struct AdminAvailabilityEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.adminEditorExitCoordinator) private var editorExitCoordinator
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let block: AdminAvailabilityBlock?
    let mutationAllowed: Bool
    private let baseline: AdminAvailabilityDraft
    @State private var draft: AdminAvailabilityDraft
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var textInputFocused: Bool

    private var isDirty: Bool { draft != baseline }
    private var isBusy: Bool { admin.savingScheduleWindowID != nil }
    private var editorTitle: String { block == nil ? "new availability" : "availability changes" }

    init(
        admin: AdminStore,
        session: AuthSession,
        block: AdminAvailabilityBlock?,
        mutationAllowed: Bool
    ) {
        let initial = AdminAvailabilityDraft(block: block)
        self.admin = admin
        self.session = session
        self.block = block
        self.mutationAllowed = mutationAllowed
        baseline = initial
        _draft = State(initialValue: initial)
    }

    var body: some View {
        Form {
            if !mutationAllowed {
                Section {
                    Label(
                        "This availability snapshot is not current. Refresh Schedule Controls before making changes.",
                        systemImage: "lock.trianglebadge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                }
            }
            Section("Availability") {
                Picker("Type", selection: $draft.type) { ForEach(AdminAvailabilityDraft.types, id: \.self) { Text($0.capitalized).tag($0) } }
                DatePicker("Starts", selection: $draft.startTime)
                DatePicker("Ends", selection: $draft.endTime, in: draft.startTime...)
                TextField("Coach (optional)", text: $draft.coachName)
                    .focused($textInputFocused)
                Toggle("Bookable", isOn: $draft.isBookable)
                TextField("Notes", text: $draft.notes, axis: .vertical)
                    .lineLimit(2...5)
                    .focused($textInputFocused)
            }
            .disabled(!mutationAllowed)
            saveButton(label: block == nil ? "Create availability" : "Save availability") {
                await admin.saveAvailability(session: session, block: block, draft: draft)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(block == nil ? "New Availability" : "Edit Availability")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: requestDismiss) {
                    Image(systemName: block == nil ? "xmark" : "chevron.left")
                        .frame(width: 44, height: 44)
                }
                .disabled(isBusy)
                .accessibilityLabel(block == nil ? "Cancel" : "Back")
                .accessibilityHint(isDirty ? "Asks before discarding unsaved availability changes" : "Returns to Schedule Controls")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { textInputFocused = false }
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: editorTitle,
            isDirty: isDirty,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(isDirty || isBusy)
        .confirmationDialog(
            "Discard unsaved availability changes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard changes", role: .destructive) {
                editorExitCoordinator?.clear(id: exitStateID)
                dismiss()
            }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("This availability draft has not been saved.")
        }
    }

    @ViewBuilder private func saveButton(label: String, action: @escaping () async -> Bool) -> some View {
        Section {
            Button {
                Task {
                    if await action() {
                        editorExitCoordinator?.clear(id: exitStateID)
                        dismiss()
                    }
                }
            } label: {
                HStack { Spacer(); Text(label).fontWeight(.bold); Spacer() }
            }
            .disabled(!mutationAllowed || isBusy || !isDirty)
            .listRowBackground(Color.xertSteel)
            .foregroundStyle(Color.xertNavy)
        }
    }

    private func requestDismiss() {
        textInputFocused = false
        guard !isBusy else { return }
        if isDirty {
            confirmingDiscard = true
        } else {
            editorExitCoordinator?.clear(id: exitStateID)
            dismiss()
        }
    }
}

private struct AdminBlackoutEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.adminEditorExitCoordinator) private var editorExitCoordinator
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let period: AdminBlackoutPeriod?
    let mutationAllowed: Bool
    private let baseline: AdminBlackoutDraft
    @State private var draft: AdminBlackoutDraft
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var textInputFocused: Bool

    private var isDirty: Bool { draft != baseline }
    private var isBusy: Bool { admin.savingScheduleWindowID != nil }
    private var editorTitle: String { period == nil ? "new blackout" : "blackout changes" }

    init(
        admin: AdminStore,
        session: AuthSession,
        period: AdminBlackoutPeriod?,
        mutationAllowed: Bool
    ) {
        let initial = AdminBlackoutDraft(period: period)
        self.admin = admin
        self.session = session
        self.period = period
        self.mutationAllowed = mutationAllowed
        baseline = initial
        _draft = State(initialValue: initial)
    }

    private var conflicts: [AdminClassSession] {
        draft.overlappingPublishedClasses(in: admin.classSessions)
    }

    var body: some View {
        Form {
            if !mutationAllowed {
                Section {
                    Label(
                        "Current blackout and timetable data are required before this closure can be changed.",
                        systemImage: "lock.trianglebadge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                }
            }
            Section("Blackout") {
                Picker("Reason", selection: $draft.reason) { ForEach(AdminBlackoutDraft.reasons, id: \.self) { Text($0.capitalized).tag($0) } }
                Picker("Affects", selection: $draft.affects) { ForEach(AdminBlackoutDraft.scopes, id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) } }
                DatePicker("Starts", selection: $draft.startTime)
                DatePicker("Ends", selection: $draft.endTime, in: draft.startTime...)
                TextField("Notes", text: $draft.notes, axis: .vertical)
                    .lineLimit(2...5)
                    .focused($textInputFocused)
            }
            .disabled(!mutationAllowed)
            if !conflicts.isEmpty {
                Section("Classes blocking this blackout") {
                    Label(
                        "\(conflicts.count) published class\(conflicts.count == 1 ? "" : "es") must be rescheduled or cancelled first.",
                        systemImage: "calendar.badge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    Text("Open a class below to reschedule it, or cancel it from Full Timetable.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.62))
                    ForEach(conflicts) { classSession in
                        NavigationLink {
                            AdminClassEditor(
                                admin: admin,
                                session: session,
                                classSession: classSession,
                                mutationAllowed: mutationAllowed
                            )
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(classSession.title)
                                    .font(.subheadline.weight(.semibold))
                                Text(classSession.start_time?.formatted(date: .abbreviated, time: .shortened) ?? "Time unavailable")
                                    .font(.caption)
                                    .foregroundStyle(Color.xertPale.opacity(0.6))
                            }
                        }
                    }
                }
            }
            Section {
                Button {
                    Task {
                        if await admin.saveBlackout(session: session, period: period, draft: draft) {
                            editorExitCoordinator?.clear(id: exitStateID)
                            dismiss()
                        }
                    }
                } label: {
                    HStack {
                        Spacer()
                        Text(period == nil ? "Create blackout" : "Save blackout").fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(!mutationAllowed || !conflicts.isEmpty || isBusy || !isDirty)
                .listRowBackground(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(period == nil ? "New Blackout" : "Edit Blackout")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: requestDismiss) {
                    Image(systemName: period == nil ? "xmark" : "chevron.left")
                        .frame(width: 44, height: 44)
                }
                .disabled(isBusy)
                .accessibilityLabel(period == nil ? "Cancel" : "Back")
                .accessibilityHint(isDirty ? "Asks before discarding unsaved blackout changes" : "Returns to Schedule Controls")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { textInputFocused = false }
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: editorTitle,
            isDirty: isDirty,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(isDirty || isBusy)
        .confirmationDialog(
            "Discard unsaved blackout changes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard changes", role: .destructive) {
                editorExitCoordinator?.clear(id: exitStateID)
                dismiss()
            }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("This blackout draft has not been saved.")
        }
    }

    private func requestDismiss() {
        textInputFocused = false
        guard !isBusy else { return }
        if isDirty {
            confirmingDiscard = true
        } else {
            editorExitCoordinator?.clear(id: exitStateID)
            dismiss()
        }
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
    let session: AuthSession
    let onOpenOrders: () -> Void
    @State private var currency = "AUD"

    private var currencies: [String] {
        let values = Set(admin.orders.map {
            let normalized = $0.currency?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
            return normalized.isEmpty ? "AUD" : normalized
        })
        return values.isEmpty ? ["AUD"] : values.sorted()
    }

    private var report: AdminFinanceReport {
        AdminFinanceReport(orders: admin.orders, currency: currency)
    }

    private var ordersAreCurrent: Bool {
        admin.loadedSources.contains("orders") && !admin.refreshUnavailableSources.contains("orders")
    }

    private var ordersAreLoading: Bool {
        admin.isLoading && !admin.loadedSources.contains("orders")
    }

    private var comparisonLabel: String {
        if report.previousPeriodCents == 0, report.currentPeriodCents > 0 {
            return "New revenue - the previous 30 days had no paid sales"
        }
        guard let change = report.periodChangePercent else {
            return "No paid sales in either 30-day period"
        }
        let direction = change > 0 ? "Up" : change < 0 ? "Down" : "Flat"
        return "\(direction) \(abs(change).formatted(.number.precision(.fractionLength(0))))% vs previous 30 days"
    }

    private var comparisonColour: Color {
        guard let change = report.periodChangePercent else { return Color.xertPale.opacity(0.6) }
        if change > 0 { return Color.green }
        if change < 0 { return Color.orange }
        return Color.xertSteel
    }

    var body: some View {
        List {
            if ordersAreLoading {
                Section {
                    HStack(spacing: 12) {
                        ProgressView().tint(Color.xertSteel)
                        Text("Loading the complete sales ledger...")
                    }
                    .foregroundStyle(Color.xertPale)
                    .listRowBackground(Color.xertInk)
                }
            }

            if !ordersAreCurrent {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(
                            admin.orders.isEmpty ? "Finance data unavailable" : "Last finance snapshot",
                            systemImage: "exclamationmark.arrow.triangle.2.circlepath"
                        )
                        .font(.headline)
                        .foregroundStyle(Color.orange)
                        Text(
                            admin.orders.isEmpty
                                ? "Revenue and sales performance could not be verified. Retry before relying on this workspace."
                                : "The figures below may be stale. Payment actions remain protected in Orders."
                        )
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                        Button {
                            Task { await admin.refreshOperationalPulse(session: session) }
                        } label: {
                            Label(
                                admin.isRefreshingOperations ? "Retrying..." : "Retry finance data",
                                systemImage: "arrow.clockwise"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.xertSteel)
                        .foregroundStyle(Color.xertNavy)
                        .disabled(admin.isRefreshingOperations)
                    }
                    .listRowBackground(Color.xertInk)
                }
            }

            if ordersAreCurrent || !admin.orders.isEmpty {
                Section {
                    Picker("Reporting currency", selection: $currency) {
                        ForEach(currencies, id: \.self) { code in
                            Text(code).tag(code)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.xertInk)
                } header: {
                    Text("Currency")
                }

                Section(ordersAreCurrent ? "Revenue pulse" : "Last revenue pulse") {
                    FinanceSummaryRow(
                        label: "Last 30 days",
                        cents: report.currentPeriodCents,
                        currency: report.currency
                    )
                    FinanceSummaryRow(
                        label: "Previous 30 days",
                        cents: report.previousPeriodCents,
                        currency: report.currency
                    )
                    FinanceSummaryRow(
                        label: "This calendar month",
                        cents: report.monthRevenueCents,
                        currency: report.currency
                    )
                    FinanceSummaryRow(
                        label: "All paid orders",
                        cents: report.allTimeRevenueCents,
                        currency: report.currency
                    )
                    HStack {
                        Label(comparisonLabel, systemImage: "chart.line.uptrend.xyaxis")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(comparisonColour)
                        Spacer()
                    }
                    .listRowBackground(Color.xertInk)
                }

                Section("30-day sales rhythm") {
                    AdminFinanceTrendChart(days: report.dailyRevenue, currency: report.currency)
                        .listRowBackground(Color.xertInk)
                }

                Section("Sales performance") {
                    financeCount(
                        "Paid orders - 30 days",
                        value: report.currentPaidCount,
                        icon: "checkmark.circle"
                    )
                    FinanceSummaryRow(
                        label: "Average paid sale",
                        cents: report.averageSaleCents,
                        currency: report.currency
                    )
                    financeCount("Pending checkouts", value: report.pendingCount, icon: "clock")
                    financeCount(
                        "Refunded orders",
                        value: report.refundedCount,
                        icon: "arrow.uturn.backward.circle"
                    )
                }

                Section("Top packs - 30 days") {
                    if report.productLeaders.isEmpty {
                        Text("No paid packs in this period.")
                            .foregroundStyle(Color.xertPale.opacity(0.62))
                            .listRowBackground(Color.xertInk)
                    }
                    ForEach(report.productLeaders.prefix(5)) { product in
                        ViewThatFits(in: .horizontal) {
                            HStack {
                                productLeaderIdentity(product)
                                Spacer()
                                productLeaderValue(product)
                            }
                            VStack(alignment: .leading, spacing: 7) {
                                productLeaderIdentity(product)
                                productLeaderValue(product)
                            }
                        }
                        .listRowBackground(Color.xertInk)
                    }
                }

                Section("Order operations") {
                    Button(action: onOpenOrders) {
                        HStack(spacing: 12) {
                            Image(systemName: report.recoverableCount > 0 ? "exclamationmark.arrow.circlepath" : "creditcard")
                                .foregroundStyle(report.recoverableCount > 0 ? Color.orange : Color.xertSteel)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Open orders")
                                    .font(.headline)
                                    .foregroundStyle(Color.xertOffWhite)
                                Text(report.recoverableCount > 0
                                     ? "\(report.recoverableCount) \(report.currency) payment\(report.recoverableCount == 1 ? "" : "s") need recovery"
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
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Finance")
        .refreshable {
            await admin.refreshOperationalPulse(session: session)
        }
        .onChange(of: currencies) { available in
            if !available.contains(currency) {
                currency = available.first ?? "AUD"
            }
        }
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

    private func productLeaderIdentity(_ product: AdminFinanceProductPerformance) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(product.name)
                .font(.headline)
                .foregroundStyle(Color.xertOffWhite)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(product.sales) sale\(product.sales == 1 ? "" : "s")")
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.58))
        }
    }

    private func productLeaderValue(_ product: AdminFinanceProductPerformance) -> some View {
        Text((Double(product.cents) / 100).formatted(.currency(code: report.currency)))
            .font(.subheadline.weight(.bold).monospacedDigit())
            .foregroundStyle(Color.xertSteel)
    }
}

private struct AdminFinanceTrendChart: View {
    let days: [AdminFinanceDay]
    let currency: String

    private var maximumCents: Int {
        max(days.map(\.cents).max() ?? 0, 1)
    }

    private var totalCents: Int {
        days.reduce(0) { $0 + $1.cents }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { proxy in
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(days) { day in
                        Rectangle()
                            .fill(day.cents > 0 ? Color.xertSteel : Color.xertSteel.opacity(0.12))
                            .frame(
                                maxWidth: .infinity,
                                minHeight: day.cents > 0 ? 3 : 1,
                                maxHeight: max(1, proxy.size.height * CGFloat(day.cents) / CGFloat(maximumCents))
                            )
                            .accessibilityHidden(true)
                    }
                }
            }
            .frame(height: 118)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color.xertSteel.opacity(0.22)).frame(height: 1)
            }

            HStack {
                Text(days.first?.date.formatted(date: .abbreviated, time: .omitted) ?? "30 days ago")
                Spacer()
                Text(days.last?.date.formatted(date: .abbreviated, time: .omitted) ?? "Today")
            }
            .font(.caption2)
            .foregroundStyle(Color.xertPale.opacity(0.5))

            Text("\((Double(totalCents) / 100).formatted(.currency(code: currency))) paid across \(days.filter { $0.cents > 0 }.count) active sales day\(days.filter { $0.cents > 0 }.count == 1 ? "" : "s").")
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Thirty day paid revenue trend. \((Double(totalCents) / 100).formatted(.currency(code: currency))) total."
        )
    }
}

private struct AdminOrdersView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let onOpenTask: (XertOwnerTask) -> Void
    @State private var query = ""
    @State private var status = "all"
    @State private var currency = "all"
    @State private var range = AdminOrderRange.thirtyDays
    @State private var exportDocument: AdminOrderCSVDocument?
    @State private var isExporting = false

    private var report: AdminOrderReport {
        AdminOrderReport(
            orders: admin.orders,
            query: query,
            status: status,
            currency: currency,
            range: range
        )
    }

    private var currencies: [String] {
        Set(admin.orders.map {
            let code = $0.currency?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
            return code.isEmpty ? "AUD" : code
        }).sorted()
    }

    private var ordersAreCurrent: Bool {
        admin.loadedSources.contains("orders") && !admin.refreshUnavailableSources.contains("orders")
    }

    private var ordersAreLoading: Bool {
        admin.isLoading && !admin.loadedSources.contains("orders")
    }

    private var exportDateStamp: String {
        String(ISO8601DateFormatter().string(from: Date()).prefix(10))
    }

    var body: some View {
        List {
            Section("Report controls") {
                Picker("Reporting range", selection: $range) {
                    ForEach(AdminOrderRange.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                Picker("Order status", selection: $status) {
                    Text("All").tag("all")
                    Text("Paid").tag("paid")
                    Text("Pending").tag("pending")
                    Text("Failed").tag("failed")
                    Text("Refunded").tag("refunded")
                }
                .pickerStyle(.menu)
                .tint(Color.xertSteel)

                if currencies.count > 1 {
                    Picker("Currency", selection: $currency) {
                        Text("All currencies").tag("all")
                        ForEach(currencies, id: \.self) { code in
                            Text(code).tag(code.lowercased())
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(Color.xertSteel)
                }
            }
            .listRowBackground(Color.xertInk)

            if ordersAreLoading {
                Section {
                    HStack(spacing: 10) {
                        ProgressView().tint(Color.xertSteel)
                        Text("Loading complete order ledger...")
                            .foregroundStyle(Color.xertPale.opacity(0.68))
                    }
                    .frame(minHeight: 44)
                }
                .listRowBackground(Color.xertInk)
            } else {
                if !ordersAreCurrent {
                    Section {
                        Label(
                            admin.orders.isEmpty
                                ? "Orders are unavailable. Refresh before relying on revenue or payment state."
                                : "Showing the last order snapshot. Refresh before exporting or changing a payment.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    .listRowBackground(Color.xertInk)
                }

                if ordersAreCurrent || !admin.orders.isEmpty {
                    Section(ordersAreCurrent ? "Revenue snapshot" : "Last revenue snapshot") {
                        LabeledContent("Matching orders", value: report.rows.count.formatted())
                        LabeledContent("Paid orders", value: report.paidCount.formatted())
                        if report.paidRevenue.isEmpty {
                            LabeledContent("Paid revenue", value: "None")
                        } else {
                            ForEach(report.paidRevenue) { total in
                                LabeledContent(
                                    report.paidRevenue.count == 1 ? "Paid revenue" : "\(total.currency) paid revenue",
                                    value: total.displayAmount
                                )
                            }
                        }
                    }
                    .listRowBackground(Color.xertInk)
                }

                Section("Order operations") {
                    if report.rows.isEmpty {
                        AdminEmptyState(
                            icon: "creditcard",
                            text: admin.orders.isEmpty ? "No orders yet." : "No orders match these controls."
                        )
                        .listRowBackground(Color.xertInk)
                    }
                    ForEach(report.rows) { order in
                        Button { onOpenTask(.order(order.id)) } label: {
                            ViewThatFits(in: .horizontal) {
                                HStack(spacing: 12) {
                                    orderIdentity(order)
                                    Spacer(minLength: 8)
                                    orderValue(order, includesChevron: true)
                                }
                                VStack(alignment: .leading, spacing: 8) {
                                    orderIdentity(order)
                                    HStack {
                                        orderValue(order, includesChevron: false)
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(Color.xertSteel)
                                    }
                                }
                            }
                            .padding(.vertical, 3)
                        }
                        .foregroundStyle(Color.xertOffWhite)
                        .buttonStyle(.plain)
                        .disabled(!ordersAreCurrent)
                        .accessibilityHint("Opens protected payment recovery, reconciliation and refund operations")
                        .listRowBackground(Color.xertInk)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Orders")
        .searchable(text: $query, prompt: "Email, pack or Stripe ID")
        .refreshable { await admin.refresh(session: session) }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    exportDocument = AdminOrderCSVDocument(csv: report.csv)
                    isExporting = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(report.rows.isEmpty || !ordersAreCurrent)
                .accessibilityLabel("Export filtered order ledger CSV")
                .accessibilityHint(
                    ordersAreCurrent
                        ? "Exports the current filtered payment ledger"
                        : "Refresh orders before exporting"
                )
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .commaSeparatedText,
            defaultFilename: "xert-orders-\(exportDateStamp)"
        ) { result in
            if case .failure(let error) = result { admin.errorMessage = error.localizedDescription }
        }
        .onChange(of: currencies) { available in
            let normalized = Set(available.map { $0.lowercased() })
            if currency != "all" && !normalized.contains(currency) {
                currency = "all"
            }
        }
    }

    private func orderIdentity(_ order: OrderItem) -> some View {
        HStack(spacing: 10) {
            Image(systemName: order.isRecoverable ? "exclamationmark.arrow.circlepath" : "creditcard")
                .foregroundStyle(order.isRecoverable ? Color.orange : Color.xertSteel)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(order.products?.name ?? "Session pack").font(.headline)
                Text((order.email?.isEmpty == false ? order.email : nil) ?? "Anonymized buyer")
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.65))
                    .lineLimit(1)
                Text(order.activityDate.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.55))
            }
        }
    }

    private func orderValue(_ order: OrderItem, includesChevron: Bool) -> some View {
        HStack(spacing: 9) {
            VStack(alignment: .trailing, spacing: 3) {
                Text(order.displayAmount).font(.subheadline.weight(.bold).monospacedDigit())
                Text(order.displayStatus.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(financeStatusColour(order.status))
            }
            if includesChevron {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color.xertSteel)
            }
        }
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

private struct AdminOrderCSVDocument: FileDocument {
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
    @State private var exportDocument: AdminIntakeCSVDocument?
    @State private var isExporting = false
    @State private var exportError: String?

    private let statuses = ["requested", "confirmed", "waitlisted", "cancelled", "declined", "attended", "no_show"]
    private var requestsAreCurrent: Bool { admin.bookingRequestsAreCurrent }
    private var requestsAreLoading: Bool {
        admin.isLoadingBookingRequests && !admin.hasLoadedBookingRequests
    }

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
    private var exportDateStamp: String {
        String(ISO8601DateFormatter().string(from: Date()).prefix(10))
    }

    var body: some View {
        List {
            if let message = admin.bookingRequestStatusMessage {
                Label(message, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }
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

            if !requestsAreCurrent && !requestsAreLoading {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        admin.hasLoadedBookingRequests
                            ? "Showing the last booking-request snapshot. Decisions are paused until refresh succeeds."
                            : "Booking requests could not be loaded. No empty queue assumption is being made.",
                        systemImage: "wifi.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    Button {
                        Task { await admin.loadBookingRequests(session: session, force: true) }
                    } label: {
                        Label(
                            admin.isLoadingBookingRequests ? "Retrying..." : "Retry booking requests",
                            systemImage: "arrow.clockwise"
                        )
                        .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.orange)
                    .disabled(admin.isLoadingBookingRequests)
                }
                .listRowBackground(Color.xertInk)
            }

            if admin.hasLoadedBookingRequests {
                Section(requestsAreCurrent ? "Matching workload" : "Last matching workload") {
                    metricRow("Matching", filteredRequests.count)
                    metricRow("Requested", filteredRequests.filter { $0.status == "requested" }.count)
                    metricRow("Confirmed", filteredRequests.filter { $0.status == "confirmed" }.count)
                    metricRow("Attended", filteredRequests.filter { $0.status == "attended" }.count)
                }
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
                        .disabled(!requestsAreCurrent || bulkStatus.isEmpty || !admin.updatingBookingRequestIDs.isEmpty)
                    }
                }
                .listRowBackground(Color.xertInk)
            }

            Section("Booking operations") {
                if requestsAreLoading {
                    HStack { ProgressView(); Text("Loading booking requests...") }
                        .listRowBackground(Color.xertInk)
                } else if requestsAreCurrent && filteredRequests.isEmpty {
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
                        .disabled(
                            !requestsAreCurrent
                                || (selectedIDs.count >= 50 && !selectedIDs.contains(booking.id))
                        )
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
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    exportDocument = AdminIntakeCSVDocument(
                        csv: AdminBookingRequestReport(rows: filteredRequests).csv
                    )
                    isExporting = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(filteredRequests.isEmpty || !requestsAreCurrent)
                .accessibilityLabel("Export filtered booking requests")
                .accessibilityHint(
                    requestsAreCurrent
                        ? "Exports the current filtered booking operations report"
                        : "Refresh booking requests before exporting"
                )
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .commaSeparatedText,
            defaultFilename: "xert-bookings-\(exportDateStamp)"
        ) { result in
            if case .failure(let error) = result {
                exportError = error.localizedDescription
            }
            exportDocument = nil
        }
        .alert("Export failed", isPresented: Binding(
            get: { exportError != nil },
            set: { if !$0 { exportError = nil } }
        )) {
            Button("OK", role: .cancel) { exportError = nil }
        } message: {
            Text(exportError ?? "The booking operations report could not be exported.")
        }
        .task { await admin.loadBookingRequests(session: session) }
        .onChange(of: status) { _ in resetSelection() }
        .onChange(of: source) { _ in resetSelection() }
        .onChange(of: days) { _ in resetSelection() }
        .sheet(item: $selectedRequest) { booking in
            NavigationStack {
                AdminBookingRequestDetailView(
                    admin: admin,
                    session: session,
                    booking: booking,
                    mutationAllowed: requestsAreCurrent
                )
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
            .disabled(!requestsAreCurrent)
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
    let mutationAllowed: Bool
    private let baselineNotes: String
    @State private var notes: String
    @State private var pendingStatus: String?
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var notesFocused: Bool

    init(
        admin: AdminStore,
        session: AuthSession,
        booking: AdminBookingRequest,
        mutationAllowed: Bool
    ) {
        self.admin = admin
        self.session = session
        self.booking = booking
        self.mutationAllowed = mutationAllowed
        let initialNotes = booking.adminNotes ?? ""
        baselineNotes = initialNotes
        _notes = State(initialValue: initialNotes)
    }

    private var isUpdating: Bool { admin.updatingBookingRequestIDs.contains(booking.id) }
    private var isDirty: Bool { notes != baselineNotes }

    var body: some View {
        List {
            if !mutationAllowed {
                Label(
                    "This booking snapshot is not current. Contact and class details remain available, but decisions and staff notes are read-only.",
                    systemImage: "lock.trianglebadge.exclamationmark"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.orange)
                .fixedSize(horizontal: false, vertical: true)
                .listRowBackground(Color.xertInk)
            }
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
                    if isDirty {
                        Label(
                            "Save or discard the staff-note draft before changing this booking's status.",
                            systemImage: "note.text.badge.plus"
                        )
                        .font(.caption)
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(booking.allowedNextStatuses, id: \.self) { next in
                        Button(role: next == "cancelled" || next == "declined" ? .destructive : nil) {
                            pendingStatus = next
                        } label: {
                            Label(statusLabel(next), systemImage: statusIcon(next))
                        }
                        .disabled(!mutationAllowed || isUpdating || isDirty)
                    }
                }
            }
            if booking.source == .enquiry {
                Section("Staff notes") {
                    TextEditor(text: $notes)
                        .frame(minHeight: 120)
                        .focused($notesFocused)
                    Text("\(notes.count)/5,000").font(.caption2)
                        .foregroundStyle(notes.count > 5_000 ? Color.red : Color.xertPale.opacity(0.45))
                    Button {
                        notesFocused = false
                        Task {
                            if await admin.saveLegacyBookingNotes(session: session, booking: booking, notes: notes) {
                                XertHaptics.play(.success)
                                dismiss()
                            } else {
                                XertHaptics.play(.error)
                            }
                        }
                    } label: { Label(isUpdating ? "Saving..." : "Save notes", systemImage: "note.text") }
                    .disabled(!mutationAllowed || !isDirty || isUpdating || notes.count > 5_000)
                }
                .disabled(!mutationAllowed)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Booking Detail")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close", action: requestDismiss)
                    .disabled(isUpdating)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { notesFocused = false }
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: "booking notes for \(booking.fullName)",
            isDirty: isDirty,
            isBusy: isUpdating
        )
        .interactiveDismissDisabled(isDirty || isUpdating)
        .confirmationDialog("Move booking to \(statusLabel(pendingStatus ?? ""))?", isPresented: Binding(
            get: { pendingStatus != nil },
            set: { if !$0 { pendingStatus = nil } }
        ), titleVisibility: .visible) {
            if let pendingStatus {
                Button(statusLabel(pendingStatus), role: pendingStatus == "cancelled" || pendingStatus == "declined" ? .destructive : nil) {
                    Task {
                        if await admin.updateBookingRequest(session: session, booking: booking, status: pendingStatus) {
                            XertHaptics.play(.success)
                            dismiss()
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                }
            }
            Button("Keep current status", role: .cancel) { pendingStatus = nil }
        } message: {
            Text(pendingStatus == "cancelled" && booking.source == .member
                ? "The server will return the reserved class credit according to the cancellation policy."
                : "This change is recorded in the permanent admin request audit.")
        }
        .confirmationDialog(
            "Discard booking notes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard notes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("The unsaved staff notes for \(booking.fullName) will be lost.")
        }
    }

    private func requestDismiss() {
        notesFocused = false
        if isDirty {
            confirmingDiscard = true
        } else if !isUpdating {
            dismiss()
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
            if let message = admin.siteContentStatusMessage {
                Label(message, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }
            Section {
                Text("Changes publish to the public website immediately. Empty saved fields use XERT's built-in copy, and unfinished drafts stay on this device.")
                    .foregroundStyle(Color.xertPale.opacity(0.7))
            }
            if admin.isLoadingSiteContent && !admin.hasLoadedSiteContent {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading live content...")
                }
                .frame(minHeight: 44)
                .listRowBackground(Color.xertInk)
            } else if !admin.siteContentIsCurrent {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        admin.hasLoadedSiteContent
                            ? "Showing the last website snapshot. Publishing and media uploads are paused until refresh succeeds."
                            : "Live Site Content could not be loaded. Built-in defaults are not being treated as the server state.",
                        systemImage: "wifi.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    Button {
                        Task { await admin.loadSiteContent(session: session, force: true) }
                    } label: {
                        Label(admin.isLoadingSiteContent ? "Retrying..." : "Retry live content", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.orange)
                    .disabled(admin.isLoadingSiteContent)
                }
                .listRowBackground(Color.xertInk)
            }
            if admin.hasLoadedSiteContent {
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
                                    HStack {
                                        Text(section.title).font(.headline)
                                        Spacer()
                                        Text(admin.siteContentRow(for: section) == nil ? "BUILT-IN" : "CUSTOM")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(Color.xertSteel)
                                    }
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
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Site Content")
        .refreshable { await admin.loadSiteContent(session: session, force: true) }
        .task { await admin.loadSiteContent(session: session) }
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
    @FocusState private var editorIsFocused: Bool

    private var ownerID: UUID? { session.user?.id }

    init(admin: AdminStore, session: AuthSession, section: AdminSiteContentSection, row: AdminSiteContentRow?) {
        self.admin = admin
        self.session = session
        self.section = section
        self.row = row
        let live = (row?.data ?? AdminSiteContentData()).merged(over: .defaults(for: section))
        _baseline = State(initialValue: live)
        _draft = State(initialValue: AdminSiteContentDraftStore.load(
            section,
            ownerID: session.user?.id
        ) ?? live)
        _expectedUpdatedAt = State(initialValue: row?.updated_at)
    }

    private var dirty: Bool { draft != baseline }
    private var isSaving: Bool { admin.savingSiteContentSection == section }
    private var mutationAllowed: Bool {
        admin.siteContentIsCurrent
            && !admin.isLoadingSiteContent
    }
    private var canPublish: Bool {
        dirty
            && !isSaving
            && !admin.isUploadingSiteImage
            && mutationAllowed
            && validationMessage == nil
    }
    private var validationMessage: String? {
        do {
            _ = try draft.normalized(for: section)
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    var body: some View {
        Form {
            if !mutationAllowed {
                Section {
                    Label(
                        "This website snapshot is not current. Your local draft is preserved, but publishing and uploads require a refresh from the Site Content desk.",
                        systemImage: "lock.trianglebadge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let validationMessage {
                Section {
                    Label(validationMessage, systemImage: "exclamationmark.triangle")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Section {
                Label(section.summary, systemImage: section.icon)
                    .foregroundStyle(Color.xertPale.opacity(0.72))
                Link(destination: AppConfig.webURL(path: section.publicPath)) {
                    Label("View live page", systemImage: "safari")
                }
            }

            fields

            Section {
                Button(action: publish) {
                    if isSaving { ProgressView() } else { Label(dirty ? "Publish section" : "Published", systemImage: "checkmark.circle") }
                }
                .disabled(!canPublish)

                Button {
                    draft = .defaults(for: section)
                } label: {
                    Label("Restore original copy", systemImage: "arrow.counterclockwise")
                }
                if dirty {
                    Button("Discard draft", role: .destructive) {
                        editorIsFocused = false
                        draft = baseline
                        AdminSiteContentDraftStore.clear(section, ownerID: ownerID)
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
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: publish) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Image(systemName: dirty ? "checkmark.circle.fill" : "checkmark.circle")
                    }
                }
                .disabled(!canPublish)
                .accessibilityLabel(dirty ? "Publish section" : "Section published")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { editorIsFocused = false }
            }
        }
        .onChange(of: draft) { value in
            if value == baseline {
                AdminSiteContentDraftStore.clear(section, ownerID: ownerID)
            } else {
                AdminSiteContentDraftStore.save(value, section: section, ownerID: ownerID)
            }
        }
        .onChange(of: selectedPhoto) { item in
            guard let item else { return }
            Task { await upload(item) }
        }
    }

    private func publish() {
        guard canPublish else { return }
        editorIsFocused = false
        Task {
            if let saved = await admin.saveSiteContent(
                session: session,
                section: section,
                expectedUpdatedAt: expectedUpdatedAt,
                draft: draft
            ) {
                let authoritative = saved.data.merged(over: .defaults(for: section))
                baseline = authoritative
                draft = authoritative
                expectedUpdatedAt = saved.updated_at
            }
        }
    }

    @ViewBuilder
    private var fields: some View {
        switch section {
        case .hero:
            Section("Hero copy") {
                TextField("Headline", text: textBinding(\.headline)).focused($editorIsFocused)
                TextField("Subheading", text: textBinding(\.subheading), axis: .vertical).lineLimit(3...8).focused($editorIsFocused)
                TextField("Supporting line", text: textBinding(\.supporting), axis: .vertical).lineLimit(3...8).focused($editorIsFocused)
            }
            Section("Rotating photos") {
                ForEach((draft.photos ?? []).indices, id: \.self) { index in
                    heroPhotoRow(index: index)
                }
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label(admin.isUploadingSiteImage ? "Uploading..." : "Upload photo", systemImage: "photo.badge.plus")
                        .frame(minHeight: 44)
                }
                .disabled(
                    !mutationAllowed
                        || admin.isUploadingSiteImage
                        || (draft.photos?.count ?? 0) >= 12
                )
                HStack {
                    TextField("https://... or /assets/...", text: $photoURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .focused($editorIsFocused)
                    Button {
                        guard !photoURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                        draft.photos = (draft.photos ?? []) + [photoURL]
                        photoURL = ""
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .frame(width: 44, height: 44)
                    }
                    .disabled(
                        photoURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || (draft.photos?.count ?? 0) >= 12
                    )
                    .accessibilityLabel("Add photo URL")
                }
            }
        case .booking:
            Section("Booking introduction") {
                TextField("Introduction", text: textBinding(\.intro), axis: .vertical).lineLimit(5...12).focused($editorIsFocused)
            }
        case .about:
            Section("About paragraphs") {
                ForEach((draft.paragraphs ?? []).indices, id: \.self) { index in
                    editableTextListRow(index: index)
                }
                Button {
                    draft.paragraphs = (draft.paragraphs ?? []) + [""]
                } label: {
                    Label("Add paragraph", systemImage: "plus")
                        .frame(minHeight: 44)
                }
                .disabled((draft.paragraphs?.count ?? 0) >= 12)
            }
        case .contact:
            Section("Public contact") {
                TextField("Email", text: textBinding(\.email)).keyboardType(.emailAddress).textInputAutocapitalization(.never).focused($editorIsFocused)
                TextField("Phone", text: textBinding(\.phone)).keyboardType(.phonePad).focused($editorIsFocused)
                TextField("Address or location", text: textBinding(\.address), axis: .vertical).focused($editorIsFocused)
                TextField("Instagram handle", text: textBinding(\.instagram_handle)).textInputAutocapitalization(.never).focused($editorIsFocused)
                TextField("Instagram URL", text: textBinding(\.instagram_url)).keyboardType(.URL).textInputAutocapitalization(.never).focused($editorIsFocused)
                TextField("Contact page introduction", text: textBinding(\.intro), axis: .vertical).lineLimit(4...10).focused($editorIsFocused)
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
                        .frame(minHeight: 44)
                }
                .disabled((draft.items?.count ?? 0) >= 20)
            }
        }
    }

    private func textBinding(_ keyPath: WritableKeyPath<AdminSiteContentData, String?>) -> Binding<String> {
        Binding(
            get: { draft[keyPath: keyPath] ?? "" },
            set: { draft[keyPath: keyPath] = $0 }
        )
    }

    @ViewBuilder
    private func heroPhotoRow(index: Int) -> some View {
        if let value = value(at: index, in: draft.photos) {
            VStack(alignment: .leading, spacing: 8) {
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
                    Text(value)
                        .font(.caption)
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                reorderButtons(index: index, count: draft.photos?.count ?? 0) { from, to in
                    draft.photos = movingElement(from: from, to: to, in: draft.photos)
                } remove: {
                    editorIsFocused = false
                    draft.photos = removingElement(at: index, from: draft.photos)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }

    @ViewBuilder
    private func editableTextListRow(index: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Paragraph \(index + 1)").font(.caption.weight(.bold))
            reorderButtons(index: index, count: draft.paragraphs?.count ?? 0) { from, to in
                draft.paragraphs = movingElement(from: from, to: to, in: draft.paragraphs)
            } remove: {
                editorIsFocused = false
                draft.paragraphs = removingElement(at: index, from: draft.paragraphs)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            TextField("Paragraph", text: paragraphBinding(index), axis: .vertical)
                .lineLimit(5...14)
                .focused($editorIsFocused)
        }
    }

    @ViewBuilder
    private func faqRow(itemID: UUID) -> some View {
        if let index = draft.items?.firstIndex(where: { $0.id == itemID }) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Question \(index + 1)").font(.caption.weight(.bold))
                reorderButtons(index: index, count: draft.items?.count ?? 0) { _, to in
                    moveFAQItem(id: itemID, to: to)
                } remove: {
                    editorIsFocused = false
                    draft.items?.removeAll { $0.id == itemID }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
                TextField("Question", text: faqBinding(itemID, \.q))
                    .focused($editorIsFocused)
                TextField("Answer", text: faqBinding(itemID, \.a), axis: .vertical)
                    .lineLimit(3...10)
                    .focused($editorIsFocused)
            }
        }
    }

    private func paragraphBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { value(at: index, in: draft.paragraphs) ?? "" },
            set: { value in
                guard draft.paragraphs?.indices.contains(index) == true else { return }
                draft.paragraphs?[index] = value
            }
        )
    }

    private func faqBinding(
        _ itemID: UUID,
        _ keyPath: WritableKeyPath<AdminFAQItem, String>
    ) -> Binding<String> {
        Binding(
            get: {
                draft.items?.first(where: { $0.id == itemID })?[keyPath: keyPath] ?? ""
            },
            set: { value in
                guard let index = draft.items?.firstIndex(where: { $0.id == itemID }),
                      var item = draft.items?[index] else { return }
                item[keyPath: keyPath] = value
                draft.items?[index] = item
            }
        )
    }

    private func moveFAQItem(id: UUID, to destination: Int) {
        guard let source = draft.items?.firstIndex(where: { $0.id == id }) else { return }
        draft.items = movingElement(from: source, to: destination, in: draft.items)
    }

    private func value<Element>(at index: Int, in values: [Element]?) -> Element? {
        guard let values, values.indices.contains(index) else { return nil }
        return values[index]
    }

    private func movingElement<Element>(
        from source: Int,
        to destination: Int,
        in values: [Element]?
    ) -> [Element]? {
        guard var values,
              values.indices.contains(source),
              values.indices.contains(destination) else { return values }
        values.swapAt(source, destination)
        return values
    }

    private func removingElement<Element>(at index: Int, from values: [Element]?) -> [Element]? {
        guard var values, values.indices.contains(index) else { return values }
        values.remove(at: index)
        return values
    }

    private func reorderButtons(
        index: Int,
        count: Int,
        move: @escaping (Int, Int) -> Void,
        remove: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 4) {
            Button { move(index, index - 1) } label: {
                Image(systemName: "arrow.up").frame(width: 44, height: 44)
            }
                .disabled(index == 0).accessibilityLabel("Move up")
            Button { move(index, index + 1) } label: {
                Image(systemName: "arrow.down").frame(width: 44, height: 44)
            }
                .disabled(index >= count - 1).accessibilityLabel("Move down")
            Button(role: .destructive, action: remove) {
                Image(systemName: "trash").frame(width: 44, height: 44)
            }
                .accessibilityLabel("Remove")
        }
        .buttonStyle(.borderless)
    }

    private func publicImageURL(_ value: String) -> URL? {
        value.hasPrefix("/") ? AppConfig.webURL(path: value) : URL(string: value)
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { selectedPhoto = nil }
        guard (draft.photos?.count ?? 0) < 12 else {
            admin.errorMessage = "Hero photography is limited to 12 images."
            return
        }
        guard let sourceData = try? await item.loadTransferable(type: Data.self) else {
            admin.errorMessage = "The selected photo could not be read."
            return
        }
        guard sourceData.count <= 5 * 1_024 * 1_024 else {
            admin.errorMessage = "Image must be under 5 MB."
            return
        }
        guard let preparedData = preparedHeroJPEG(sourceData),
              preparedData.count <= 5 * 1_024 * 1_024 else {
            admin.errorMessage = "The selected image type could not be prepared for the website."
            return
        }
        if let url = await admin.uploadSiteImage(
            session: session,
            data: preparedData,
            mimeType: "image/jpeg",
            fileExtension: "jpg"
        ) {
            draft.photos = (draft.photos ?? []) + [url]
        }
    }

    private func preparedHeroJPEG(_ data: Data) -> Data? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 2_400,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(
                source,
                0,
                options as CFDictionary
              ) else { return nil }
        return UIImage(cgImage: image).jpegData(compressionQuality: 0.86)
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

    private var reportIsCurrent: Bool {
        admin.campaignAttributionIsCurrent && !admin.isLoadingCampaignAttribution
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

            if !admin.hasLoadedCampaignAttribution {
                Section {
                    if admin.isLoadingCampaignAttribution {
                        HStack(spacing: 12) {
                            ProgressView().tint(Color.xertSteel)
                            Text("Loading acquisition evidence...")
                        }
                        .frame(minHeight: 64)
                        .listRowBackground(Color.xertInk)
                    } else {
                        reportingUnavailablePanel(
                            message: admin.campaignAttributionStatusMessage
                                ?? "Campaign Attribution has not loaded. Retry before relying on acquisition totals."
                        )
                    }
                }
            } else {
                if !reportIsCurrent {
                    Section {
                        reportingUnavailablePanel(
                            message: admin.campaignAttributionStatusMessage
                                ?? "Showing the last acquisition snapshot. Refresh before using these totals."
                        )
                    }
                }

                Section {
                    Label(
                        reportIsCurrent ? "LIVE REPORT" : "CACHED REPORT",
                        systemImage: reportIsCurrent ? "checkmark.circle.fill" : "clock.arrow.circlepath"
                    )
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(reportIsCurrent ? Color.green : Color.orange)
                    if let updatedAt = admin.campaignAttributionUpdatedAt {
                        Text("Loaded \(updatedAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.52))
                    }
                }
                .listRowBackground(Color.xertInk)

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
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Campaign Attribution")
        .toolbar {
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Button {
                    exportDocument = AdminCampaignCSVDocument(csv: summary.csv)
                    isExporting = true
                } label: {
                    Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
                }
                .disabled(!reportIsCurrent || summary.total == 0)
                .accessibilityLabel("Export campaign attribution CSV")
                .accessibilityHint(reportIsCurrent ? "Exports the selected live reporting range" : "Refresh the report before exporting")
                Button {
                    Task { await admin.loadCampaignAttribution(session: session, force: true) }
                } label: {
                    Image(systemName: "arrow.clockwise").frame(width: 44, height: 44)
                }
                .disabled(admin.isLoadingCampaignAttribution)
                .accessibilityLabel("Refresh campaign attribution")
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
        .refreshable { await admin.loadCampaignAttribution(session: session, force: true) }
        .task { await admin.loadCampaignAttribution(session: session) }
    }

    private func reportingUnavailablePanel(message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(message, systemImage: "wifi.exclamationmark")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await admin.loadCampaignAttribution(session: session, force: true) }
            } label: {
                Label(
                    admin.isLoadingCampaignAttribution ? "Retrying..." : "Retry campaign report",
                    systemImage: "arrow.clockwise"
                )
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.orange)
            .disabled(admin.isLoadingCampaignAttribution)
        }
        .padding(.vertical, 4)
        .listRowBackground(Color.xertInk)
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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    private let defaultStatus: String
    @State private var pipeline: AdminLeadPipeline
    @State private var query = ""
    @State private var status: String
    @State private var selectedLead: AdminLead?
    @State private var selectedIDs: Set<AdminLeadIdentifier> = []
    @State private var bulkStatus = ""
    @State private var exportDocument: AdminIntakeCSVDocument?
    @State private var isExporting = false
    @State private var exportError: String?

    private var leads: [AdminLead] { admin.leads(for: pipeline) }
    private var pipelineIsLoaded: Bool { admin.loadedLeadPipelines.contains(pipeline) }
    private var pipelineIsCurrent: Bool { admin.leadPipelineIsCurrent(pipeline) }
    private var pipelineIsLoading: Bool {
        admin.loadingLeadPipeline == pipeline && !pipelineIsLoaded
    }
    private var filteredLeads: [AdminLead] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let matches = leads.filter { lead in
            (status == "all" || lead.effectiveStatus == status)
                && (needle.isEmpty || lead.searchableText.contains(needle))
        }
        if status == "new" {
            return matches.sorted { $0.created_at < $1.created_at }
        }
        return matches
    }
    private var exportDateStamp: String {
        String(ISO8601DateFormatter().string(from: Date()).prefix(10))
    }

    @ViewBuilder
    private var pipelinePicker: some View {
        if dynamicTypeSize.isAccessibilitySize {
            Picker("Lead pipeline", selection: $pipeline) {
                pipelineOptions
            }
            .pickerStyle(.menu)
            .tint(Color.xertSteel)
        } else {
            Picker("Lead pipeline", selection: $pipeline) {
                pipelineOptions
            }
            .pickerStyle(.segmented)
        }
    }

    @ViewBuilder
    private var pipelineOptions: some View {
        ForEach(AdminLeadPipeline.allCases) { option in
            Text(option.shortLabel).tag(option)
        }
    }

    init(
        admin: AdminStore,
        session: AuthSession,
        initialPipeline: AdminLeadPipeline? = nil,
        prioritizesNewWork: Bool = false
    ) {
        self.admin = admin
        self.session = session
        let initialStatus = prioritizesNewWork ? "new" : "all"
        defaultStatus = initialStatus
        _pipeline = State(initialValue: initialPipeline ?? .members)
        _status = State(initialValue: initialStatus)
    }

    var body: some View {
        List {
            if let message = admin.leadPipelineStatusMessage,
               admin.unavailableLeadPipelines.contains(pipeline) {
                Label(message, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }
            if let counts = admin.leadActionCounts, counts.overdueTotal > 0 {
                Label(
                    "\(counts.overdueTotal) new enquiries have waited more than 24 hours. Oldest are shown first.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.orange)
                .fixedSize(horizontal: false, vertical: true)
                .listRowBackground(Color.orange.opacity(0.08))
                .accessibilityIdentifier("owner.leads.overdueSLA")
            }
            Section {
                pipelinePicker
                    .disabled(admin.loadingLeadPipeline != nil)

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

            if !pipelineIsCurrent && !pipelineIsLoading {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        pipelineIsLoaded
                            ? "Showing the last \(pipeline.title.lowercased()) snapshot. Changes are paused until refresh succeeds."
                            : "\(pipeline.title) could not be loaded. No empty pipeline assumption is being made.",
                        systemImage: "wifi.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    Button {
                        Task { await admin.loadLeads(session: session, pipeline: pipeline, force: true) }
                    } label: {
                        Label(
                            admin.loadingLeadPipeline == pipeline ? "Retrying..." : "Retry pipeline",
                            systemImage: "arrow.clockwise"
                        )
                        .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.orange)
                    .disabled(admin.loadingLeadPipeline != nil)
                }
                .listRowBackground(Color.xertInk)
            }

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
                    .disabled(!pipelineIsCurrent || bulkStatus.isEmpty || !admin.savingLeadIDs.isEmpty)
                }
                .listRowBackground(Color.xertInk)
            }

            Section(pipeline.title) {
                if pipelineIsLoading {
                    HStack { ProgressView(); Text("Loading pipeline...") }
                        .listRowBackground(Color.xertInk)
                } else if pipelineIsCurrent && filteredLeads.isEmpty {
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
                        .disabled(
                            !pipelineIsCurrent
                                || (selectedIDs.count >= 100 && !selectedIDs.contains(lead.id))
                        )
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
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    exportDocument = AdminIntakeCSVDocument(
                        csv: AdminLeadReport(pipeline: pipeline, rows: filteredLeads).csv
                    )
                    isExporting = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(filteredLeads.isEmpty || !pipelineIsCurrent)
                .accessibilityLabel("Export filtered \(pipeline.title.lowercased())")
                .accessibilityHint(
                    pipelineIsCurrent
                        ? "Exports every current lead matching the active pipeline filters"
                        : "Refresh this lead pipeline before exporting"
                )
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .commaSeparatedText,
            defaultFilename: "xert-\(pipeline.rawValue)-\(exportDateStamp)"
        ) { result in
            if case .failure(let error) = result {
                exportError = error.localizedDescription
            }
            exportDocument = nil
        }
        .alert("Export failed", isPresented: Binding(
            get: { exportError != nil },
            set: { if !$0 { exportError = nil } }
        )) {
            Button("OK", role: .cancel) { exportError = nil }
        } message: {
            Text(exportError ?? "The lead pipeline report could not be exported.")
        }
        .task { await admin.loadLeads(session: session, pipeline: pipeline) }
        .onChange(of: pipeline) { newPipeline in
            query = ""
            status = defaultStatus
            selectedIDs = []
            bulkStatus = ""
            selectedLead = nil
            Task { await admin.loadLeads(session: session, pipeline: newPipeline) }
        }
        .onChange(of: admin.unavailableLeadPipelines) { unavailable in
            if unavailable.contains(pipeline) {
                selectedIDs = []
                bulkStatus = ""
            }
        }
        .sheet(item: $selectedLead) { lead in
            NavigationStack {
                AdminLeadDetailView(
                    admin: admin,
                    session: session,
                    pipeline: pipeline,
                    lead: lead,
                    mutationAllowed: pipelineIsCurrent
                )
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
    let mutationAllowed: Bool
    private let baselineStatus: String
    private let baselineNotes: String
    @State private var status: String
    @State private var notes: String
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var notesFocused: Bool

    init(
        admin: AdminStore,
        session: AuthSession,
        pipeline: AdminLeadPipeline,
        lead: AdminLead,
        mutationAllowed: Bool
    ) {
        self.admin = admin
        self.session = session
        self.pipeline = pipeline
        self.lead = lead
        self.mutationAllowed = mutationAllowed
        let initialStatus = lead.effectiveStatus
        let initialNotes = lead.admin_notes ?? ""
        baselineStatus = initialStatus
        baselineNotes = initialNotes
        _status = State(initialValue: initialStatus)
        _notes = State(initialValue: initialNotes)
    }

    private var isSaving: Bool { admin.savingLeadIDs.contains(lead.id) }
    private var isDirty: Bool {
        status != baselineStatus || notes != baselineNotes
    }

    var body: some View {
        List {
            if !mutationAllowed {
                Label(
                    "This pipeline snapshot is not current. Contact details remain available, but status and notes are read-only.",
                    systemImage: "lock.trianglebadge.exclamationmark"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.orange)
                .fixedSize(horizontal: false, vertical: true)
                .listRowBackground(Color.xertInk)
            }
            Section("Contact") {
                detailRow("Name", lead.displayName)
                if let email = nonBlank(lead.email), let url = URL(string: "mailto:\(email)") {
                    Link(destination: url) {
                        Label(email, systemImage: "envelope")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                }
                if let phone = nonBlank(lead.phone), let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(destination: url) {
                        Label(phone, systemImage: "phone")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                }
                detailRow("Submitted", lead.created_at.formatted(date: .abbreviated, time: .shortened))
                if status == "new" {
                    Button(action: logContacted) {
                        Label(
                            isSaving ? "Saving contact..." : "Log contacted and save",
                            systemImage: "checkmark.circle.fill"
                        )
                        .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.xertSteel)
                    .disabled(!mutationAllowed || isSaving || notes.count > 5_000)
                    .accessibilityHint(
                        "Moves this lead out of the new enquiry queue and saves the current owner notes"
                    )
                }
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
                    .focused($notesFocused)
                    .overlay(alignment: .topLeading) {
                        if notes.isEmpty {
                            Text("Internal notes").foregroundStyle(Color.xertPale.opacity(0.35)).padding(.top, 8).allowsHitTesting(false)
                        }
                    }
                Text("\(notes.count)/5,000")
                    .font(.caption2).foregroundStyle(notes.count > 5_000 ? Color.red : Color.xertPale.opacity(0.45))
                Button {
                    notesFocused = false
                    Task {
                        if await admin.saveLead(session: session, pipeline: pipeline, lead: lead, status: status, notes: notes) {
                            XertHaptics.play(.success)
                            dismiss()
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                } label: {
                    Label(isSaving ? "Saving..." : "Save pipeline changes", systemImage: "checkmark.circle")
                }
                .disabled(!mutationAllowed || !isDirty || isSaving || notes.count > 5_000)
            }
            .disabled(!mutationAllowed)
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(lead.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close", action: requestDismiss)
                    .disabled(isSaving)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { notesFocused = false }
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: "\(pipeline.shortLabel.lowercased()) lead changes",
            isDirty: isDirty,
            isBusy: isSaving
        )
        .interactiveDismissDisabled(isDirty || isSaving)
        .confirmationDialog(
            "Discard lead changes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("The unsaved status or notes for \(lead.displayName) will be lost.")
        }
    }

    private func requestDismiss() {
        notesFocused = false
        if isDirty {
            confirmingDiscard = true
        } else if !isSaving {
            dismiss()
        }
    }

    private func logContacted() {
        guard mutationAllowed, !isSaving, notes.count <= 5_000 else { return }
        notesFocused = false
        Task {
            if await admin.saveLead(
                session: session,
                pipeline: pipeline,
                lead: lead,
                status: "contacted",
                notes: notes
            ) {
                XertHaptics.play(.success)
                dismiss()
            } else {
                XertHaptics.play(.error)
            }
        }
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
    @State private var query = ""
    @State private var statusFilter = "active"
    @State private var sessionTypeFilter = "all"
    @State private var ageFilter = "30"
    @State private var selectedIDs: Set<UUID> = []
    @State private var bulkStatus = ""
    @State private var confirmingBulkUpdate = false
    @State private var notesRequest: AdminPTRequest?
    @State private var exportDocument: AdminIntakeCSVDocument?
    @State private var isExporting = false
    @State private var exportError: String?

    private var requestsAreCurrent: Bool { admin.ptRequestsAreCurrent }
    private var requestsAreLoading: Bool {
        (admin.isLoading || admin.isRefreshingOperations)
            && !admin.loadedSources.contains("PT requests")
    }
    private var isMutating: Bool {
        admin.updatingPTRequestID != nil || !admin.bulkUpdatingPTRequestIDs.isEmpty
    }
    private var sessionTypes: [String] {
        Array(Set(admin.ptRequests.map(\.requested_session_type)))
            .filter { !$0.isEmpty }
            .sorted()
    }

    private var rows: [AdminPTRequest] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cutoff: Date? = {
            switch ageFilter {
            case "30": return Calendar.current.date(byAdding: .day, value: -30, to: Date())
            case "90": return Calendar.current.date(byAdding: .day, value: -90, to: Date())
            default: return nil
            }
        }()
        return admin.ptRequests.filter { request in
            let matchesStatus: Bool
            switch statusFilter {
            case "active":
                matchesStatus = ["requested", "reschedule_requested", "approved"].contains(request.status)
            case "all":
                matchesStatus = true
            default:
                matchesStatus = request.status == statusFilter
            }
            return matchesStatus
                && (sessionTypeFilter == "all" || request.requested_session_type == sessionTypeFilter)
                && (cutoff.map { request.created_at >= $0 } ?? true)
                && (needle.isEmpty || request.searchableText.contains(needle))
        }
    }
    private var selectedRequests: [AdminPTRequest] {
        admin.ptRequests.filter { selectedIDs.contains($0.id) }
    }
    private var bulkOptions: [String] {
        guard let first = selectedRequests.first,
              selectedRequests.allSatisfy({ $0.status == first.status }) else { return [] }
        return first.allowedNextStatuses
    }
    private var report: AdminPTRequestReport { AdminPTRequestReport(rows: rows) }
    private var exportDateStamp: String {
        String(ISO8601DateFormatter().string(from: Date()).prefix(10))
    }

    var body: some View {
        List {
            if let message = admin.ptRequestStatusMessage {
                Label(message, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }
            Section("Filters") {
                Picker("Status", selection: $statusFilter) {
                    Text("Active").tag("active")
                    Text("All statuses").tag("all")
                    ForEach(["requested", "reschedule_requested", "approved", "completed", "declined", "cancelled"], id: \.self) {
                        Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0)
                    }
                }
                Picker("Session type", selection: $sessionTypeFilter) {
                    Text("All session types").tag("all")
                    ForEach(sessionTypes, id: \.self) { Text($0).tag($0) }
                }
                Picker("Submitted", selection: $ageFilter) {
                    Text("30 days").tag("30")
                    Text("90 days").tag("90")
                    Text("All time").tag("all")
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.xertNavy)

            if requestsAreLoading {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading PT requests...")
                }
                .frame(minHeight: 44)
                .listRowBackground(Color.xertInk)
            } else if !requestsAreCurrent {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        admin.loadedSources.contains("PT requests")
                            ? "Showing the last PT request snapshot. Updates are paused until refresh succeeds."
                            : "PT Requests could not be loaded. No empty queue assumption is being made.",
                        systemImage: "wifi.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    Button {
                        Task { await admin.refreshPTRequests(session: session) }
                    } label: {
                        Label(
                            admin.isLoading || admin.isRefreshingOperations ? "Retrying..." : "Retry PT requests",
                            systemImage: "arrow.clockwise"
                        )
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.orange)
                    .disabled(admin.isLoading || admin.isRefreshingOperations)
                }
                .listRowBackground(Color.xertInk)
            }

            if admin.loadedSources.contains("PT requests") {
                Section(requestsAreCurrent ? "Matching workload" : "Last matching workload") {
                    HStack(spacing: 0) {
                        ptMetric("Total", rows.count)
                        ptMetric("New", report.requestedCount)
                        ptMetric("Approved", report.approvedCount)
                        ptMetric("Done", report.completedCount)
                    }
                    .padding(.vertical, 4)
                }
                .listRowBackground(Color.xertInk)
            }

            if !selectedIDs.isEmpty {
                Section("Bulk action") {
                    Text("\(selectedIDs.count) request\(selectedIDs.count == 1 ? "" : "s") selected")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.xertPale.opacity(0.7))
                    if bulkOptions.isEmpty {
                        Label(
                            "Select requests with the same actionable status.",
                            systemImage: "info.circle"
                        )
                        .font(.caption)
                        .foregroundStyle(Color.orange)
                    } else {
                        Picker("Move selected to", selection: $bulkStatus) {
                            Text("Choose status").tag("")
                            ForEach(bulkOptions, id: \.self) {
                                Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0)
                            }
                        }
                        Button {
                            confirmingBulkUpdate = true
                        } label: {
                            Label("Update selected", systemImage: "arrow.triangle.2.circlepath")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.xertSteel)
                        .disabled(!requestsAreCurrent || bulkStatus.isEmpty || isMutating)
                    }
                    Button("Clear selection", role: .cancel) { selectedIDs = [] }
                }
                .listRowBackground(Color.xertInk)
            }

            if requestsAreCurrent && rows.isEmpty {
                Text("No matching PT requests.")
                    .listRowBackground(Color.xertInk)
            }
            ForEach(rows) { request in
                VStack(alignment: .leading, spacing: 10) {
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top) {
                            selectionButton(for: request)
                            ptRequestHeading(request)
                            Spacer()
                            ptStatus(request)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .top) {
                                selectionButton(for: request)
                                ptRequestHeading(request)
                                Spacer()
                            }
                            ptStatus(request)
                                .padding(.leading, 44)
                        }
                    }
                    Text([request.preferred_day, request.preferred_time].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    Text("Submitted \(request.created_at.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption2)
                        .foregroundStyle(Color.xertPale.opacity(0.48))
                    if let goal = request.training_goal, !goal.isEmpty {
                        Text("Goal: \(goal)").font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    }
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) {
                            ptActions(for: request, expands: false)
                        }
                        VStack(spacing: 8) {
                            ptActions(for: request, expands: true)
                        }
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
        .searchable(text: $query, prompt: "Name, contact, goal or notes")
        .refreshable { await admin.refreshPTRequests(session: session) }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    exportDocument = AdminIntakeCSVDocument(csv: report.csv)
                    isExporting = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(rows.isEmpty || !requestsAreCurrent)
                .accessibilityLabel("Export filtered PT requests")
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .commaSeparatedText,
            defaultFilename: "xert-pt-requests-\(exportDateStamp)"
        ) { result in
            if case .failure(let error) = result {
                exportError = error.localizedDescription
            }
            exportDocument = nil
        }
        .alert("Export failed", isPresented: Binding(
            get: { exportError != nil },
            set: { if !$0 { exportError = nil } }
        )) {
            Button("OK", role: .cancel) { exportError = nil }
        } message: {
            Text(exportError ?? "The PT request report could not be exported.")
        }
        .confirmationDialog(
            "Update \(selectedIDs.count) PT requests?",
            isPresented: $confirmingBulkUpdate,
            titleVisibility: .visible
        ) {
            Button("Move to \(bulkStatus.replacingOccurrences(of: "_", with: " ").capitalized)") {
                let requests = selectedRequests
                Task {
                    selectedIDs = await admin.bulkUpdatePTRequests(
                        session: session,
                        requests: requests,
                        status: bulkStatus
                    )
                    if selectedIDs.isEmpty { bulkStatus = "" }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Only requests that fail will remain selected for retry.")
        }
        .task {
            if !admin.loadedSources.contains("PT requests") {
                await admin.refreshPTRequests(session: session)
            }
        }
        .onChange(of: admin.refreshUnavailableSources) { unavailable in
            if unavailable.contains("PT requests") {
                notesRequest = nil
            }
        }
        .onChange(of: statusFilter) { _ in resetSelection() }
        .onChange(of: sessionTypeFilter) { _ in resetSelection() }
        .onChange(of: ageFilter) { _ in resetSelection() }
        .onChange(of: query) { _ in resetSelection() }
        .sheet(item: $notesRequest) { request in
            NavigationStack {
                AdminPTRequestDetailView(
                    admin: admin,
                    session: session,
                    request: request,
                    mutationAllowed: requestsAreCurrent
                )
            }
        }
    }

    private func ptRequestHeading(_ request: AdminPTRequest) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(request.displayName).font(.headline)
            Text(request.requested_session_type)
                .font(.caption.weight(.bold)).foregroundStyle(Color.xertSteel)
        }
    }

    private func ptStatus(_ request: AdminPTRequest) -> some View {
        Text(request.status.replacingOccurrences(of: "_", with: " ").uppercased())
            .font(.caption2.weight(.bold))
            .foregroundStyle(request.isPending ? Color.orange : Color.xertPale.opacity(0.65))
            .fixedSize(horizontal: true, vertical: false)
    }

    private func selectionButton(for request: AdminPTRequest) -> some View {
        Button {
            if selectedIDs.contains(request.id) {
                selectedIDs.remove(request.id)
            } else if selectedIDs.count < 50 {
                selectedIDs.insert(request.id)
            }
            bulkStatus = ""
        } label: {
            Image(systemName: selectedIDs.contains(request.id) ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(selectedIDs.contains(request.id) ? Color.xertSteel : Color.xertPale.opacity(0.5))
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .disabled(!requestsAreCurrent || isMutating)
        .accessibilityLabel(selectedIDs.contains(request.id) ? "Deselect \(request.displayName)" : "Select \(request.displayName)")
    }

    private func ptMetric(_ label: String, _ value: Int) -> some View {
        VStack(spacing: 3) {
            Text(value.formatted())
                .font(.headline.monospacedDigit())
                .foregroundStyle(Color.xertOffWhite)
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color.xertPale.opacity(0.58))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
    }

    private func resetSelection() {
        selectedIDs = []
        bulkStatus = ""
    }

    @ViewBuilder
    private func ptActions(for request: AdminPTRequest, expands: Bool) -> some View {
        HStack(spacing: 8) {
            if let phone = request.phone,
               let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                Link(destination: url) {
                    Image(systemName: "phone")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Call \(request.displayName)")
            }
            if let email = request.email, let url = URL(string: "mailto:\(email)") {
                Link(destination: url) {
                    Image(systemName: "envelope")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Email \(request.displayName)")
            }
        }

        Menu {
            ForEach(request.allowedNextStatuses, id: \.self) { next in
                requestAction(
                    next.replacingOccurrences(of: "_", with: " ").capitalized,
                    status: next,
                    request: request
                )
            }
        } label: {
            Label("Update", systemImage: "arrow.triangle.2.circlepath")
                .frame(maxWidth: expands ? .infinity : nil, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.xertSteel)
        .disabled(!requestsAreCurrent || isMutating || request.allowedNextStatuses.isEmpty)

        Button { notesRequest = request } label: {
            Label("Open", systemImage: "arrow.up.right.square")
                .frame(maxWidth: expands ? .infinity : nil, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(!requestsAreCurrent || isMutating)
        .accessibilityLabel("Open PT request for \(request.displayName)")
    }

    @ViewBuilder
    private func requestAction(_ title: String, status: String, request: AdminPTRequest) -> some View {
        Button(title) {
            Task { _ = await admin.updatePTRequest(session: session, request: request, status: status) }
        }
    }
}

private struct AdminIntakeCSVDocument: FileDocument {
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

private struct AdminPTRequestDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let request: AdminPTRequest
    let mutationAllowed: Bool
    private let baselineNotes: String
    @State private var notes: String
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var notesFocused: Bool

    init(
        admin: AdminStore,
        session: AuthSession,
        request: AdminPTRequest,
        mutationAllowed: Bool
    ) {
        self.admin = admin
        self.session = session
        self.request = request
        self.mutationAllowed = mutationAllowed
        let initialNotes = request.admin_notes ?? ""
        baselineNotes = initialNotes
        _notes = State(initialValue: initialNotes)
    }

    private var isDirty: Bool { notes != baselineNotes }
    private var isSaving: Bool { admin.updatingPTRequestID == request.id }

    var body: some View {
        Form {
            if !mutationAllowed {
                Section {
                    Label(
                        "This PT request snapshot is not current. Contact and request details remain available, but workflow and notes are read-only.",
                        systemImage: "lock.trianglebadge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                }
                .listRowBackground(Color.xertInk)
            }

            Section("Contact") {
                if let phone = nonBlank(request.phone),
                   let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(destination: url) {
                        Label(phone, systemImage: "phone")
                            .frame(minHeight: 44, alignment: .leading)
                    }
                }
                if let email = nonBlank(request.email),
                   let url = URL(string: "mailto:\(email)") {
                    Link(destination: url) {
                        Label(email, systemImage: "envelope")
                            .frame(minHeight: 44, alignment: .leading)
                    }
                }
                if nonBlank(request.phone) == nil && nonBlank(request.email) == nil {
                    Label("No contact details supplied", systemImage: "person.crop.circle.badge.exclamationmark")
                        .foregroundStyle(Color.orange)
                }
            }

            Section("Training request") {
                requestDetailRow("Session", request.requested_session_type)
                requestDetailRow(
                    "Submitted",
                    request.created_at.formatted(date: .abbreviated, time: .shortened)
                )
                optionalRequestDetailRow("Preferred day", request.preferred_day)
                optionalRequestDetailRow("Preferred time", request.preferred_time)
                optionalRequestDetailRow("Goal", request.training_goal)
                optionalRequestDetailRow("Experience", request.experience_level)
                if let memberNotes = nonBlank(request.notes) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("MEMBER NOTES")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.xertPale.opacity(0.52))
                        Text(memberNotes)
                            .foregroundStyle(Color.xertOffWhite)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            Section("Workflow") {
                requestDetailRow(
                    "Status",
                    request.status.replacingOccurrences(of: "_", with: " ").capitalized
                )
                if !request.allowedNextStatuses.isEmpty {
                    Menu {
                        ForEach(request.allowedNextStatuses, id: \.self) { status in
                            Button(status.replacingOccurrences(of: "_", with: " ").capitalized) {
                                updateStatus(status)
                            }
                        }
                    } label: {
                        Label("Update request status", systemImage: "arrow.triangle.2.circlepath")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .disabled(!mutationAllowed || isDirty || isSaving)
                    .accessibilityHint(
                        isDirty
                            ? "Save or discard private notes before changing status"
                            : "Changes this request to its next valid workflow state"
                    )
                }
                if isDirty {
                    Label(
                        "Save or discard private notes before changing workflow status.",
                        systemImage: "square.and.pencil"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.orange)
                }
            }

            Section("Private owner notes") {
                TextEditor(text: $notes)
                    .frame(minHeight: 160)
                    .focused($notesFocused)
                Text("\(notes.count)/5,000")
                    .font(.caption)
                    .foregroundStyle(notes.count > 5_000 ? Color.red : Color.xertPale.opacity(0.55))
            }
            .disabled(!mutationAllowed)
        }
        .tint(Color.xertSteel)
        .xertListBackground()
        .navigationTitle(request.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close", action: requestDismiss)
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "Saving..." : "Save", action: save)
                    .disabled(!mutationAllowed || !isDirty || isSaving || notes.count > 5_000)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { notesFocused = false }
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: "PT request for \(request.displayName)",
            isDirty: isDirty,
            isBusy: isSaving
        )
        .interactiveDismissDisabled(isDirty || isSaving)
        .confirmationDialog(
            "Discard PT notes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard notes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("The unsaved private notes for \(request.displayName) will be lost.")
        }
    }

    private func updateStatus(_ status: String) {
        notesFocused = false
        guard !isDirty else { return }
        Task {
            let didSave = await admin.updatePTRequest(
                session: session,
                request: request,
                status: status
            )
            if didSave {
                XertHaptics.play(.success)
                dismiss()
            } else {
                XertHaptics.play(.error)
            }
        }
    }

    private func save() {
        notesFocused = false
        Task {
            let didSave = await admin.updatePTRequest(
                session: session,
                request: request,
                status: request.status,
                notes: notes,
                updateNotes: true
            )
            if didSave {
                XertHaptics.play(.success)
                dismiss()
            } else {
                XertHaptics.play(.error)
            }
        }
    }

    private func requestDismiss() {
        notesFocused = false
        if isDirty {
            confirmingDiscard = true
        } else if !isSaving {
            dismiss()
        }
    }

    private func requestDetailRow(_ label: String, _ value: String) -> some View {
        LabeledContent(label) {
            Text(value)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(Color.xertOffWhite)
        }
    }

    @ViewBuilder
    private func optionalRequestDetailRow(_ label: String, _ value: String?) -> some View {
        if let value = nonBlank(value) {
            requestDetailRow(label, value)
        }
    }

    private func nonBlank(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
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
                        Toggle("Bookings enabled", isOn: bookingsEnabledBinding)
                        Text("Controls both website and iOS class actions. Turning bookings off also pauses checkout.")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        Toggle("Session pack payments", isOn: settingBinding(\.payments_enabled))
                            .disabled(draft?.bookings_enabled != true && draft?.payments_enabled != true)
                        Text("Master checkout switch for pack purchases on the website and iOS app. Keep off until Stripe launch checks pass.")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        if draft?.bookings_enabled != true && draft?.payments_enabled != true {
                            Label("Open bookings and complete the booking smoke test before enabling payments.", systemImage: "lock.shield")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.xertSteel)
                        }
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

    private var bookingsEnabledBinding: Binding<Bool> {
        Binding(
            get: { draft?.bookings_enabled == true },
            set: { isEnabled in
                guard var value = draft else { return }
                value.bookings_enabled = isEnabled
                if !isEnabled {
                    value.payments_enabled = false
                }
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

private struct AdminAnnouncementDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let announcement: AdminAnnouncement
    @State private var editor: AdminAnnouncementEditorContext?
    @State private var pendingAction: AdminAnnouncementConfirmation?

    private var noticesAreCurrent: Bool {
        admin.loadedSources.contains("member notices")
            && !admin.refreshUnavailableSources.contains("member notices")
            && !admin.isLoading
    }

    private var isBusy: Bool {
        admin.isMutatingAnnouncements
    }

    private var currentAnnouncement: AdminAnnouncement {
        admin.announcements.first(where: { $0.id == announcement.id }) ?? announcement
    }

    private var deliveryMetrics: AdminAnnouncementDeliveryMetrics? {
        admin.announcementDeliveryMetrics[currentAnnouncement.id]
    }

    var body: some View {
        List {
            if !noticesAreCurrent {
                Section {
                    Label(
                        admin.announcementLoadErrorMessage
                            ?? "Refresh the notice before changing member visibility.",
                        systemImage: "wifi.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)

                    Button {
                        Task { await admin.refreshAnnouncements(session: session) }
                    } label: {
                        Label("Refresh member notice", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.orange)
                    .disabled(isBusy)
                }
                .listRowBackground(Color.xertInk)
            }

            if let status = admin.announcementStatusMessage {
                Section {
                    Label(status, systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.green)
                }
                .listRowBackground(Color.green.opacity(0.08))
            }

            Section("Notice") {
                VStack(alignment: .leading, spacing: 12) {
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            noticeStatus
                            Spacer(minLength: 8)
                            Text(currentAnnouncement.tone.uppercased())
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(Color.xertPale.opacity(0.5))
                        }
                        VStack(alignment: .leading, spacing: 7) {
                            noticeStatus
                            Text(currentAnnouncement.tone.uppercased())
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(Color.xertPale.opacity(0.5))
                        }
                    }

                    Text(currentAnnouncement.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.xertOffWhite)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(currentAnnouncement.body)
                        .font(.body)
                        .foregroundStyle(Color.xertPale.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)

                    if let label = currentAnnouncement.cta_label,
                       let url = currentAnnouncement.cta_url {
                        Label("\(label) · \(url)", systemImage: "arrow.up.forward.app")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.xertSteel)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 6)
            }
            .listRowBackground(Color.xertInk)

            Section("Lifecycle") {
                detailRow(
                    "Created",
                    value: currentAnnouncement.created_at.formatted(
                        date: .abbreviated,
                        time: .shortened
                    ),
                    icon: "clock"
                )
                if let firstPublished = currentAnnouncement.first_published_at {
                    detailRow(
                        "First published",
                        value: firstPublished.formatted(
                            date: .abbreviated,
                            time: .shortened
                        ),
                        icon: "paperplane"
                    )
                }
                if let expiry = currentAnnouncement.expires_at {
                    detailRow(
                        "Expires",
                        value: expiry.formatted(date: .abbreviated, time: .shortened),
                        icon: "calendar.badge.clock"
                    )
                }
            }
            .listRowBackground(Color.xertInk)

            if currentAnnouncement.wasPublished {
                Section("Member reach") {
                    if let metrics = deliveryMetrics {
                        detailRow(
                            "Opened",
                            value: metrics.readCount.formatted(),
                            icon: "eye"
                        )
                        detailRow(
                            "Dismissed",
                            value: metrics.dismissedCount.formatted(),
                            icon: "xmark.circle"
                        )
                        detailRow(
                            "Push attempted",
                            value: metrics.pushAttemptedCount.formatted(),
                            icon: "paperplane"
                        )
                        detailRow(
                            "Push delivered",
                            value: metrics.pushDeliveredCount.formatted(),
                            icon: "iphone.radiowaves.left.and.right"
                        )
                        if metrics.pushFailedCount > 0 {
                            detailRow(
                                "Push failed",
                                value: metrics.pushFailedCount.formatted(),
                                icon: "exclamationmark.triangle"
                            )
                        }
                        if let attemptedAt = metrics.pushLastAttemptedAt {
                            detailRow(
                                "Last push attempt",
                                value: attemptedAt.formatted(date: .abbreviated, time: .shortened),
                                icon: "clock.arrow.circlepath"
                            )
                        }
                    } else {
                        Label(
                            admin.announcementDeliveryStatusMessage
                                ?? "No delivery attempts have been recorded for this notice.",
                            systemImage: admin.announcementDeliveryStatusMessage == nil
                                ? "iphone.slash"
                                : "wifi.exclamationmark"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(
                            admin.announcementDeliveryStatusMessage == nil
                                ? Color.xertPale.opacity(0.62)
                                : Color.orange
                        )
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .listRowBackground(Color.xertInk)
            }

            Section("Actions") {
                if currentAnnouncement.archived_at == nil {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) { primaryActions }
                        VStack(spacing: 10) { primaryActions }
                    }
                    .listRowInsets(
                        EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
                    )
                }

                if currentAnnouncement.archived_at != nil {
                    Button {
                        confirm(.restore(currentAnnouncement))
                    } label: {
                        Label("Restore as draft", systemImage: "archivebox")
                    }
                } else if currentAnnouncement.wasPublished {
                    Button {
                        confirm(.archive(currentAnnouncement))
                    } label: {
                        Label("Archive with delivery history", systemImage: "archivebox")
                    }
                    .foregroundStyle(Color.orange)
                } else {
                    Button(role: .destructive) {
                        confirm(.delete(currentAnnouncement))
                    } label: {
                        Label("Delete unpublished draft", systemImage: "trash")
                    }
                }
            }
            .listRowBackground(Color.xertInk)
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Member Notice")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
                    .disabled(isBusy)
            }
        }
        .sheet(item: $editor) { context in
            AdminAnnouncementComposer(
                announcement: context.announcement,
                publishesOnOpen: context.publishesOnOpen,
                isSaving: admin.announcementMutationID != nil,
                isPublishing: admin.isPublishingAnnouncement,
                onSave: { draft in
                    Task {
                        if await admin.saveAnnouncement(
                            session: session,
                            announcement: context.announcement,
                            draft: draft
                        ) {
                            editor = nil
                            XertHaptics.play(.success)
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                },
                onPublish: { draft in
                    Task {
                        if await admin.publishAnnouncement(
                            session: session,
                            announcement: context.announcement,
                            draft: draft
                        ) {
                            editor = nil
                            XertHaptics.play(.success)
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                }
            )
        }
        .confirmationDialog(
            pendingAction?.title ?? "Confirm notice action",
            isPresented: Binding(
                get: { pendingAction != nil },
                set: { if !$0 { pendingAction = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let action = pendingAction {
                Button(
                    action.confirmLabel,
                    role: action.isDestructive ? .destructive : nil
                ) {
                    perform(action)
                }
                Button("Cancel", role: .cancel) { pendingAction = nil }
            }
        } message: {
            Text(pendingAction?.message ?? "")
        }
        .accessibilityIdentifier("owner.notice.detail")
    }

    private var noticeStatus: some View {
        Label(
            currentAnnouncement.stateLabel.uppercased(),
            systemImage: currentAnnouncement.published_at == nil ? "eye.slash" : "eye.fill"
        )
        .font(.caption.weight(.black))
        .foregroundStyle(stateColour)
    }

    private var stateColour: Color {
        switch currentAnnouncement.stateLabel {
        case "Live": return .green
        case "Expired", "Archived": return .orange
        case "Scheduled": return Color.xertSteel
        default: return Color.xertPale.opacity(0.62)
        }
    }

    @ViewBuilder
    private var primaryActions: some View {
        if currentAnnouncement.archived_at == nil {
            Button {
                editor = .init(announcement: currentAnnouncement)
            } label: {
                Label("Edit notice", systemImage: "pencil")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Color.xertSteel)
            .disabled(isBusy || !noticesAreCurrent)
            .accessibilityIdentifier("owner.notice.edit")

            if currentAnnouncement.published_at == nil {
                Button {
                    editor = .init(
                        announcement: currentAnnouncement,
                        publishesOnOpen: true
                    )
                } label: {
                    Label("Review & publish", systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
                .disabled(isBusy || !noticesAreCurrent)
                .accessibilityIdentifier("owner.notice.reviewPublish")
            } else {
                Button {
                    confirm(.unpublish(currentAnnouncement))
                } label: {
                    Label("Unpublish now", systemImage: "eye.slash.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.orange)
                .disabled(isBusy || !noticesAreCurrent)
                .accessibilityHint("Hides this exact notice from member accounts after confirmation")
                .accessibilityIdentifier("owner.notice.unpublish")
            }
        }
    }

    private func detailRow(
        _ title: String,
        value: String,
        icon: String
    ) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                Label(title, systemImage: icon)
                    .foregroundStyle(Color.xertPale.opacity(0.68))
                Spacer(minLength: 8)
                Text(value)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.xertOffWhite)
            }
            VStack(alignment: .leading, spacing: 5) {
                Label(title, systemImage: icon)
                    .foregroundStyle(Color.xertPale.opacity(0.68))
                Text(value)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.xertOffWhite)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func confirm(_ action: AdminAnnouncementConfirmation) {
        pendingAction = action
        XertHaptics.play(action.isDestructive ? .warning : .lightImpact)
    }

    private func perform(_ action: AdminAnnouncementConfirmation) {
        pendingAction = nil
        Task {
            let succeeded: Bool
            switch action {
            case .unpublish(let notice):
                succeeded = await admin.unpublishAnnouncement(
                    session: session,
                    announcement: notice
                )
            case .archive(let notice):
                succeeded = await admin.setAnnouncementArchived(
                    session: session,
                    announcement: notice,
                    archived: true
                )
            case .restore(let notice):
                succeeded = await admin.setAnnouncementArchived(
                    session: session,
                    announcement: notice,
                    archived: false
                )
            case .delete(let notice):
                succeeded = await admin.deleteAnnouncement(
                    session: session,
                    announcement: notice
                )
            }
            XertHaptics.play(succeeded ? .success : .error)
        }
    }
}

private struct AdminCommunicationsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var editor: AdminAnnouncementEditorContext?
    @State private var pendingAction: AdminAnnouncementConfirmation?

    private var noticesAreCurrent: Bool {
        admin.loadedSources.contains("member notices")
            && !admin.refreshUnavailableSources.contains("member notices")
    }

    private var stateCounts: [String: Int] {
        Dictionary(grouping: admin.announcements, by: \.stateLabel)
            .mapValues { $0.count }
    }

    var body: some View {
        List {
            Section {
                AdminAnnouncementStatusStrip(counts: stateCounts)
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear)
            }

            if !noticesAreCurrent {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(
                            admin.announcementLoadErrorMessage
                                ?? (admin.loadedSources.contains("member notices")
                                    ? "Showing the last notice snapshot. Refresh before publishing or changing visibility."
                                    : "Member notices are unavailable. Refresh before managing communications."),
                            systemImage: "wifi.exclamationmark"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        Button { refreshNotices() } label: {
                            Label("Refresh member notices", systemImage: "arrow.clockwise")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.orange)
                        .disabled(admin.isMutatingAnnouncements)
                    }
                    .listRowBackground(Color.xertInk)
                }
            }
            if let status = admin.announcementStatusMessage {
                Section {
                    Label(status, systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.green)
                }
                .listRowBackground(Color.green.opacity(0.08))
            }
            if let warning = admin.announcementDeliveryStatusMessage {
                Section {
                    Label(warning, systemImage: "chart.bar.xaxis")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .listRowBackground(Color.orange.opacity(0.08))
            }

            if admin.announcements.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "bell.slash")
                        .font(.title2)
                        .foregroundStyle(Color.xertSteel)
                    Text("No Member Notices")
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text(noticesAreCurrent
                        ? "Create a private draft or publish an operational update."
                        : "Refresh to check the communications desk.")
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Color.xertPale.opacity(0.6))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
                .listRowBackground(Color.xertInk)
            }
            ForEach(admin.announcements) { notice in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 8) {
                                Text(notice.stateLabel.uppercased())
                                    .font(.caption2.weight(.black))
                                    .tracking(0.8)
                                    .foregroundStyle(stateColour(notice.stateLabel))
                                Text(notice.tone.uppercased())
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(Color.xertPale.opacity(0.48))
                            }
                            Text(notice.title)
                                .font(.headline)
                                .foregroundStyle(Color.xertOffWhite)
                        }
                        Spacer(minLength: 8)
                        Menu {
                            if notice.archived_at != nil {
                                Button { confirm(.restore(notice)) } label: {
                                    Label("Restore as draft", systemImage: "archivebox")
                                }
                            } else {
                                Button { editor = .init(announcement: notice) } label: {
                                    Label("Edit notice", systemImage: "pencil")
                                }
                                if notice.published_at == nil {
                                    Button { editor = .init(announcement: notice, publishesOnOpen: true) } label: {
                                        Label("Review and publish", systemImage: "paperplane")
                                    }
                                } else {
                                    Button { confirm(.unpublish(notice)) } label: {
                                        Label("Unpublish", systemImage: "eye.slash")
                                    }
                                }
                                if notice.wasPublished {
                                    Button { confirm(.archive(notice)) } label: {
                                        Label("Archive", systemImage: "archivebox")
                                    }
                                } else {
                                    Button(role: .destructive) { confirm(.delete(notice)) } label: {
                                        Label("Delete draft", systemImage: "trash")
                                    }
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .font(.title3)
                                .frame(width: 44, height: 44)
                        }
                        .disabled(admin.isMutatingAnnouncements || !noticesAreCurrent)
                        .accessibilityLabel("Actions for \(notice.title)")
                    }
                    Text(notice.body)
                        .font(.subheadline)
                        .foregroundStyle(Color.xertPale.opacity(0.72))
                        .lineLimit(5)
                    ViewThatFits(in: .horizontal) {
                        noticeMetadata(notice)
                        VStack(alignment: .leading, spacing: 5) {
                            noticeMetadataItems(notice)
                        }
                    }
                    if let label = notice.cta_label, let url = notice.cta_url {
                        Label("\(label) · \(url)", systemImage: "arrow.up.forward.app")
                            .font(.caption2)
                            .foregroundStyle(Color.xertSteel)
                            .lineLimit(2)
                    }
                    if notice.wasPublished,
                       let metrics = admin.announcementDeliveryMetrics[notice.id] {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 12) {
                                deliveryMetricItems(metrics)
                            }
                            VStack(alignment: .leading, spacing: 5) {
                                deliveryMetricItems(metrics)
                            }
                        }
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.xertPale.opacity(0.62))
                    }
                }
                .disabled(!noticesAreCurrent)
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 7)
                .contentShape(Rectangle())
                .onTapGesture {
                    guard noticesAreCurrent, !admin.isMutatingAnnouncements, notice.archived_at == nil else { return }
                    editor = .init(announcement: notice)
                }
                .listRowBackground(Color.xertInk)
                .accessibilityElement(children: .contain)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Member Notices")
        .refreshable { await admin.refreshAnnouncements(session: session) }
        .toolbar {
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Button { refreshNotices() } label: {
                    if admin.isRefreshingAnnouncements {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(admin.isMutatingAnnouncements || admin.isRefreshingAnnouncements)
                .accessibilityLabel("Refresh member notices")
                Button { editor = .init(announcement: nil) } label: {
                    Image(systemName: "plus")
                }
                .disabled(admin.isMutatingAnnouncements || !noticesAreCurrent)
                .accessibilityLabel("New member notice")
            }
        }
        .sheet(item: $editor) { context in
            AdminAnnouncementComposer(
                announcement: context.announcement,
                publishesOnOpen: context.publishesOnOpen,
                isSaving: admin.announcementMutationID != nil,
                isPublishing: admin.isPublishingAnnouncement,
                onSave: { draft in
                    Task {
                        if await admin.saveAnnouncement(
                            session: session,
                            announcement: context.announcement,
                            draft: draft
                        ) {
                            editor = nil
                            XertHaptics.play(.success)
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                },
                onPublish: { draft in
                    Task {
                        if await admin.publishAnnouncement(
                            session: session,
                            announcement: context.announcement,
                            draft: draft
                        ) {
                            editor = nil
                            XertHaptics.play(.success)
                        } else {
                            XertHaptics.play(.error)
                        }
                    }
                }
            )
        }
        .confirmationDialog(
            pendingAction?.title ?? "Confirm notice action",
            isPresented: Binding(
                get: { pendingAction != nil },
                set: { if !$0 { pendingAction = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let action = pendingAction {
                Button(action.confirmLabel, role: action.isDestructive ? .destructive : nil) {
                    perform(action)
                }
                Button("Cancel", role: .cancel) { pendingAction = nil }
            }
        } message: {
            Text(pendingAction?.message ?? "")
        }
    }

    private func noticeMetadata(_ notice: AdminAnnouncement) -> some View {
        HStack(spacing: 12) {
            noticeMetadataItems(notice)
        }
    }

    @ViewBuilder
    private func noticeMetadataItems(_ notice: AdminAnnouncement) -> some View {
        Label(notice.created_at.formatted(date: .abbreviated, time: .shortened), systemImage: "clock")
        if let expiresAt = notice.expires_at {
            Label("Expires \(expiresAt.formatted(date: .abbreviated, time: .shortened))", systemImage: "calendar.badge.clock")
        }
    }

    private func stateColour(_ state: String) -> Color {
        switch state {
        case "Live": return .green
        case "Expired", "Archived": return .orange
        case "Scheduled": return Color.xertSteel
        default: return Color.xertPale.opacity(0.55)
        }
    }

    @ViewBuilder
    private func deliveryMetricItems(_ metrics: AdminAnnouncementDeliveryMetrics) -> some View {
        Label("\(metrics.readCount) opened", systemImage: "eye")
        Label("\(metrics.pushDeliveredCount) pushed", systemImage: "iphone.radiowaves.left.and.right")
        if metrics.pushFailedCount > 0 {
            Label("\(metrics.pushFailedCount) failed", systemImage: "exclamationmark.triangle")
                .foregroundStyle(Color.orange)
        }
    }

    private func refreshNotices() {
        XertHaptics.play(.softImpact)
        Task { await admin.refreshAnnouncements(session: session) }
    }

    private func confirm(_ action: AdminAnnouncementConfirmation) {
        pendingAction = action
        XertHaptics.play(action.isDestructive ? .warning : .lightImpact)
    }

    private func perform(_ action: AdminAnnouncementConfirmation) {
        pendingAction = nil
        Task {
            let succeeded: Bool
            switch action {
            case .unpublish(let notice):
                succeeded = await admin.unpublishAnnouncement(session: session, announcement: notice)
            case .archive(let notice):
                succeeded = await admin.setAnnouncementArchived(session: session, announcement: notice, archived: true)
            case .restore(let notice):
                succeeded = await admin.setAnnouncementArchived(session: session, announcement: notice, archived: false)
            case .delete(let notice):
                succeeded = await admin.deleteAnnouncement(session: session, announcement: notice)
            }
            XertHaptics.play(succeeded ? .success : .error)
        }
    }
}

private struct AdminAnnouncementStatusStrip: View {
    let counts: [String: Int]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(["Live", "Draft", "Scheduled", "Expired", "Archived"], id: \.self) { state in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(counts[state, default: 0].formatted())
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(Color.xertOffWhite)
                        Text(state.uppercased())
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.xertSteel)
                    }
                    .frame(minWidth: 84, minHeight: 56, alignment: .leading)
                    .padding(.horizontal, 12)
                    .background(Color.xertInk)
                    .overlay {
                        RoundedRectangle(cornerRadius: 2)
                            .stroke(Color.xertSteel.opacity(0.24), lineWidth: 1)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Notice status totals")
    }
}

private struct AdminAnnouncementEditorContext: Identifiable {
    let id = UUID()
    let announcement: AdminAnnouncement?
    var publishesOnOpen = false
}

private enum AdminAnnouncementConfirmation: Identifiable {
    case unpublish(AdminAnnouncement)
    case archive(AdminAnnouncement)
    case restore(AdminAnnouncement)
    case delete(AdminAnnouncement)

    var id: String {
        switch self {
        case .unpublish(let notice): return "unpublish:\(notice.id)"
        case .archive(let notice): return "archive:\(notice.id)"
        case .restore(let notice): return "restore:\(notice.id)"
        case .delete(let notice): return "delete:\(notice.id)"
        }
    }

    var notice: AdminAnnouncement {
        switch self {
        case .unpublish(let value), .archive(let value), .restore(let value), .delete(let value):
            return value
        }
    }

    var title: String {
        switch self {
        case .unpublish: return "Unpublish this notice?"
        case .archive: return "Archive this notice?"
        case .restore: return "Restore this notice as a draft?"
        case .delete: return "Delete this draft?"
        }
    }

    var message: String {
        switch self {
        case .unpublish:
            return "Members will no longer see \(notice.title). Delivery and read history remain intact."
        case .archive:
            return "Member visibility is turned off and delivery history is preserved."
        case .restore:
            return "The notice returns as a hidden draft for review before publishing again."
        case .delete:
            return "This unpublished draft will be permanently deleted."
        }
    }

    var confirmLabel: String {
        switch self {
        case .unpublish: return "Unpublish"
        case .archive: return "Archive"
        case .restore: return "Restore Draft"
        case .delete: return "Delete Draft"
        }
    }

    var isDestructive: Bool {
        switch self {
        case .archive, .delete: return true
        case .unpublish, .restore: return false
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
                        Label(admin.isRefreshingHealth ? "Refreshing launch gates..." : "Refresh launch gates", systemImage: "arrow.clockwise")
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
        case .bookingsOpen: return "calendar.badge.checkmark"
        case .blocked: return "hand.raised.fill"
        case .verifying: return "questionmark.circle.fill"
        }
    }

    private var launchGateColor: Color {
        switch memberLaunchGate.phase {
        case .preflightReady, .liveReady: return .green
        case .bookingsOpen: return Color.xertSteel
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
    let session: AuthSession
    @State private var query = ""
    @State private var category = "All"
    @State private var exportDocument: AdminAuditCSVDocument?
    @State private var isExporting = false

    private var categories: [String] {
        ["All"] + Set(admin.auditEntries.map(\.category)).sorted()
    }

    private var rows: [AdminAuditEntry] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return admin.auditEntries.filter { entry in
            (category == "All" || entry.category == category)
                && (
                    term.isEmpty
                        || [
                            entry.title,
                            entry.detail,
                            entry.category,
                            entry.operatorID?.uuidString ?? "",
                            entry.subjectID ?? ""
                        ]
                        .joined(separator: " ")
                        .lowercased()
                        .contains(term)
                )
        }
    }

    private var summary: AdminAuditSummary {
        AdminAuditSummary(entries: admin.auditEntries)
    }

    private var reportIsCurrent: Bool {
        admin.auditIsCurrent && !admin.isLoadingAudit
    }

    private var reportStateLabel: String {
        if reportIsCurrent { return "LIVE HISTORY" }
        if admin.auditUnavailable { return "CACHED HISTORY" }
        return admin.auditPartialSources.isEmpty ? "CACHED HISTORY" : "PARTIAL HISTORY"
    }

    private var reportStateIcon: String {
        if reportIsCurrent { return "checkmark.circle.fill" }
        if admin.auditUnavailable { return "clock.arrow.circlepath" }
        return admin.auditPartialSources.isEmpty ? "clock.arrow.circlepath" : "exclamationmark.triangle.fill"
    }

    private var exportDateStamp: String {
        String(ISO8601DateFormatter().string(from: Date()).prefix(10))
    }

    var body: some View {
        List {
            if !admin.hasLoadedAudit {
                Section {
                    if admin.isLoadingAudit {
                        HStack(spacing: 12) {
                            ProgressView().tint(Color.xertSteel)
                            Text("Loading protected change history...")
                        }
                        .frame(minHeight: 64)
                        .listRowBackground(Color.xertInk)
                    } else {
                        auditUnavailablePanel(
                            message: admin.auditStatusMessage
                                ?? "Admin Audit has not loaded. Retry before relying on change history."
                        )
                    }
                }
            } else {
                if !reportIsCurrent {
                    Section {
                        auditUnavailablePanel(
                            message: admin.auditStatusMessage
                                ?? "Showing the last audit snapshot. Refresh before treating this history as current."
                        )
                    }
                }

                Section {
                    HStack {
                        Label(
                            reportStateLabel,
                            systemImage: reportStateIcon
                        )
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(reportIsCurrent ? Color.green : Color.orange)
                        Spacer()
                        Text("\(admin.auditEntries.count) RECORDS")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.xertPale.opacity(0.5))
                    }
                    if let updatedAt = admin.auditUpdatedAt {
                        Text("Loaded \(updatedAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.52))
                    }
                }
                .listRowBackground(Color.xertInk)

                Section {
                    auditSummary
                }
                .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                .listRowBackground(Color.xertInk)

                Section {
                    Picker("Audit category", selection: $category) {
                        ForEach(categories, id: \.self) { Text($0).tag($0) }
                    }
                }
                .listRowBackground(Color.xertNavy)

                if rows.isEmpty {
                    Text(
                        reportIsCurrent
                            ? "No matching administrative actions."
                            : "No matching actions in the last loaded snapshot."
                    )
                    .listRowBackground(Color.xertInk)
                }
                ForEach(rows) { entry in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: auditIcon(entry.category))
                            .frame(width: 24).foregroundStyle(Color.xertSteel)
                        VStack(alignment: .leading, spacing: 4) {
                            ViewThatFits(in: .horizontal) {
                                HStack {
                                    Text(entry.title).font(.headline)
                                    Spacer()
                                    auditCategory(entry.category)
                                }
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(entry.title).font(.headline)
                                    auditCategory(entry.category)
                                }
                            }
                            Text(entry.detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.62))
                            Label(operatorLabel(entry), systemImage: entry.operatorID == nil ? "gearshape.2" : "person.badge.key")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(entry.operatorID == nil ? Color.xertPale.opacity(0.45) : Color.xertSteel)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(entry.createdAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption2).foregroundStyle(Color.xertPale.opacity(0.4))
                        }
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .padding(.vertical, 5)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Admin Audit")
        .searchable(text: $query, prompt: "Search changes")
        .toolbar {
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Button {
                    exportDocument = AdminAuditCSVDocument(
                        csv: AdminAuditExport(entries: rows).csv
                    )
                    isExporting = true
                } label: {
                    Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
                }
                .disabled(!reportIsCurrent || rows.isEmpty)
                .accessibilityLabel("Export filtered admin audit CSV")
                .accessibilityHint(reportIsCurrent ? "Exports the visible live history" : "Refresh Admin Audit before exporting")
                Button {
                    Task { await admin.loadAudit(session: session, force: true) }
                } label: {
                    Image(systemName: "arrow.clockwise").frame(width: 44, height: 44)
                }
                .disabled(admin.isLoadingAudit)
                .accessibilityLabel("Refresh admin audit")
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .commaSeparatedText,
            defaultFilename: "xert-admin-audit-\(exportDateStamp)"
        ) { result in
            if case .failure(let error) = result { admin.errorMessage = error.localizedDescription }
        }
        .refreshable { await admin.loadAudit(session: session, force: true) }
        .task { await admin.loadAudit(session: session) }
    }

    private var auditSummary: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.shield")
                    .font(.headline)
                    .foregroundStyle(Color.xertSteel)
                    .frame(width: 34, height: 34)
                    .background(Color.xertSteel.opacity(0.1))
                VStack(alignment: .leading, spacing: 2) {
                    Text("OPERATOR ACCOUNTABILITY")
                        .font(.caption.weight(.black))
                        .foregroundStyle(Color.xertOffWhite)
                    Text("Protected changes across operations and commerce")
                        .font(.caption2)
                        .foregroundStyle(Color.xertPale.opacity(0.5))
                }
            }

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8)
                ],
                spacing: 8
            ) {
                auditMetric(summary.total, label: "Ledger actions", icon: "clock.arrow.circlepath")
                auditMetric(summary.last24Hours, label: "Last 24 hours", icon: "clock.badge")
                auditMetric(summary.moneyActions, label: "Money actions", icon: "dollarsign.circle")
                auditMetric(summary.identifiedOperators, label: "Operators seen", icon: "person.2.badge.gearshape")
            }

            if !reportIsCurrent {
                Label("Metrics are from the last available audit snapshot.", systemImage: "clock.badge.exclamationmark")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("owner.audit.summary")
    }

    private func auditMetric(_ value: Int, label: String, icon: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: icon)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.xertSteel)
                .frame(width: 28, height: 28)
                .background(Color.xertSteel.opacity(0.08))
            VStack(alignment: .leading, spacing: 1) {
                Text(value.formatted())
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(Color.xertOffWhite)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(Color.xertPale.opacity(0.5))
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .background(Color.xertNavy.opacity(0.72))
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.14), lineWidth: 1))
    }

    private func operatorLabel(_ entry: AdminAuditEntry) -> String {
        guard let operatorID = entry.operatorID else {
            return entry.category == "Bookings"
                ? "Member or system initiated"
                : "System or historical action"
        }
        let shortID = String(operatorID.uuidString.lowercased().prefix(8))
        if operatorID == session.user?.id {
            return "You · \(shortID)"
        }
        if let member = admin.members.first(where: { $0.id == operatorID }) {
            return "\(member.displayName) · \(shortID)"
        }
        return "Admin \(shortID)"
    }

    private func auditUnavailablePanel(message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(message, systemImage: "wifi.exclamationmark")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await admin.loadAudit(session: session, force: true) }
            } label: {
                Label(admin.isLoadingAudit ? "Retrying..." : "Retry Admin Audit", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.orange)
            .disabled(admin.isLoadingAudit)
        }
        .padding(.vertical, 4)
        .listRowBackground(Color.xertInk)
    }

    private func auditCategory(_ category: String) -> some View {
        Text(category.uppercased())
            .font(.caption2.weight(.bold))
            .foregroundStyle(Color.xertSteel)
    }

    private func auditIcon(_ category: String) -> String {
        switch category {
        case "Access": return "person.badge.key"
        case "Credits": return "ticket"
        case "Bookings", "Requests": return "calendar.badge.clock"
        case "Notices": return "bell"
        case "Content": return "square.and.pencil"
        case "Schedule": return "calendar"
        case "Commerce": return "creditcard.and.123"
        default: return "clock.arrow.circlepath"
        }
    }
}

private struct AdminAuditCSVDocument: FileDocument {
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
    @State private var exitStateID = UUID()
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
        .adminOwnerExitState(
            id: exitStateID,
            title: isCreating ? "new session pack" : "session-pack changes",
            isDirty: isDirty,
            isBusy: isProductMutationInFlight
        )
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
    @State private var categoryFilter = "all"
    @State private var showingCreate = false
    @State private var rosterEvent: AdminEvent?
    @State private var pendingDelete: AdminEvent?

    private var rows: [AdminEvent] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return admin.events.filter {
            (categoryFilter == "all" || $0.category == categoryFilter)
                && (term.isEmpty
                    || "\($0.name) \($0.category ?? "") \($0.location ?? "") \($0.region ?? "")"
                        .lowercased().contains(term))
        }
    }

    private var categories: [String] {
        Array(Set(admin.events.compactMap(\.category))).sorted()
    }
    private var calendarIsCurrent: Bool { admin.eventCalendarIsCurrent }
    private var groupsAreCurrent: Bool { admin.eventTrainingGroupsAreCurrent }
    private var isRefreshing: Bool { admin.isLoading || admin.isRefreshingEventCatalogue }

    var body: some View {
        List {
            if let message = admin.eventCatalogueStatusMessage {
                Label(message, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }
            if !calendarIsCurrent || !groupsAreCurrent {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        admin.loadedSources.contains("event calendar")
                            ? "Showing the last event snapshot. Catalogue changes are paused until required sources refresh."
                            : "The Event Calendar could not be loaded. No empty calendar assumption is being made.",
                        systemImage: "wifi.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    Button {
                        Task { await admin.refreshEventCatalogue(session: session) }
                    } label: {
                        Label(isRefreshing ? "Retrying..." : "Retry event catalogue", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.orange)
                    .disabled(isRefreshing)
                }
                .listRowBackground(Color.xertInk)
            }
            Section("Filter") {
                Picker("Category", selection: $categoryFilter) {
                    Text("All categories").tag("all")
                    ForEach(categories, id: \.self) { Text($0.capitalized).tag($0) }
                }
            }
            .listRowBackground(Color.xertNavy)

            if calendarIsCurrent && rows.isEmpty {
                Text("No matching calendar events.").listRowBackground(Color.xertInk)
            }
            ForEach(rows) { event in
                VStack(alignment: .leading, spacing: 10) {
                    Button { onOpenTask(.event(event.id)) } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            ViewThatFits(in: .horizontal) {
                                HStack {
                                    Text(event.name).font(.headline)
                                    Spacer()
                                    eventPublicationState(event)
                                    Image(systemName: "chevron.right")
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(Color.xertSteel)
                                }
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(event.name).font(.headline)
                                    HStack {
                                        eventPublicationState(event)
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(Color.xertSteel)
                                    }
                                }
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
                        } label: {
                            Label(
                                groupsAreCurrent
                                    ? "\(admin.eventGoalCounts[event.id, default: 0]) training"
                                    : "Training group",
                                systemImage: "person.3"
                            )
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.xertSteel)

                        Spacer()
                        Button(role: .destructive) { pendingDelete = event } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.plain)
                        .frame(width: 44, height: 44)
                        .disabled(
                            !calendarIsCurrent
                                || !groupsAreCurrent
                                || isRefreshing
                                || admin.deletingEventID != nil
                                || admin.savingEventID != nil
                        )
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
        .refreshable { await admin.refreshEventCatalogue(session: session) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .disabled(
                        !calendarIsCurrent
                            || isRefreshing
                            || admin.savingEventID != nil
                            || admin.deletingEventID != nil
                    )
                    .accessibilityLabel("Add event")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                AdminEventEditor(admin: admin, session: session, event: nil)
            }
        }
        .sheet(item: $rosterEvent) { event in
            AdminEventRosterView(admin: admin, session: session, event: event)
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

    private func eventPublicationState(_ event: AdminEvent) -> some View {
        Text(event.published ? "LIVE" : "HIDDEN")
            .font(.caption2.weight(.bold))
            .foregroundStyle(event.published ? Color.green : Color.xertPale.opacity(0.45))
            .fixedSize(horizontal: true, vertical: false)
    }
}

private struct AdminEventEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let event: AdminEvent?
    private let baseline: AdminEventDraft
    @State private var draft: AdminEventDraft
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()

    private var mutationAllowed: Bool {
        admin.eventCalendarIsCurrent
            && !admin.isLoading
            && !admin.isRefreshingEventCatalogue
    }
    private var isDirty: Bool { draft != baseline }
    private var isBusy: Bool { admin.savingEventID != nil }
    private var canSave: Bool {
        mutationAllowed
            && isDirty
            && !isBusy
            && !draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

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
            if !mutationAllowed {
                Section {
                    Label(
                        "This calendar snapshot is not current. Review is available, but publishing changes is paused until refresh succeeds.",
                        systemImage: "lock.trianglebadge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                }
            }
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
                        if isBusy { ProgressView().tint(Color.xertNavy) }
                        Text(event == nil ? "Create event" : "Save event").fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(!canSave)
                .listRowBackground(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(event == nil ? "New Event" : "Edit Event")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if event == nil || isDirty {
                ToolbarItem(placement: .cancellationAction) {
                    Button(event == nil ? "Cancel" : "Close") { requestDismiss() }
                        .disabled(isBusy)
                }
            }
        }
        .navigationBarBackButtonHidden(event != nil && isDirty)
        .adminOwnerExitState(
            id: exitStateID,
            title: event == nil ? "new event" : "event changes",
            isDirty: isDirty,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(isDirty || isBusy)
        .confirmationDialog("Discard event changes?", isPresented: $confirmingDiscard) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("Your unsaved calendar changes will be permanently discarded.")
        }
        .onChange(of: draft.hasStartDate) { enabled in
            if !enabled { draft.hasEndDate = false }
        }
    }

    private func requestDismiss() {
        if isDirty { confirmingDiscard = true }
        else { dismiss() }
    }
}

private struct AdminEventRosterView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let event: AdminEvent
    @State private var exportDocument: AdminEventRosterCSVDocument?
    @State private var isExporting = false
    @State private var exportError: String?

    private var rosterIsLoaded: Bool { admin.eventRosterLoadedEventID == event.id }
    private var rosterIsUnavailable: Bool { admin.eventRosterUnavailableEventID == event.id }
    private var report: AdminEventRosterReport {
        AdminEventRosterReport(event: event, members: admin.eventRoster)
    }

    var body: some View {
        NavigationStack {
            List {
                if admin.loadingEventRosterID == event.id || (!rosterIsLoaded && !rosterIsUnavailable) {
                    HStack {
                        Spacer()
                        ProgressView()
                        Text("Loading training group...")
                        Spacer()
                    }
                    .frame(minHeight: 44)
                } else if rosterIsUnavailable {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(
                            "This training group could not be loaded. No empty-group assumption is being made.",
                            systemImage: "wifi.exclamationmark"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                        Button {
                            Task { await admin.loadEventRoster(session: session, eventID: event.id) }
                        } label: {
                            Label("Retry training group", systemImage: "arrow.clockwise")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.orange)
                    }
                } else if rosterIsLoaded && admin.eventRoster.isEmpty {
                    Text("No members are training toward this event yet.")
                } else if rosterIsLoaded {
                    ForEach(admin.eventRoster) { member in
                        VStack(alignment: .leading, spacing: 7) {
                            Text(member.displayName).font(.headline)
                            if let email = nonempty(member.email) {
                                Link(destination: URL(string: "mailto:\(email)")!) {
                                    Label(email, systemImage: "envelope")
                                        .frame(minHeight: 44)
                                }
                            }
                            if let phone = nonempty(member.phone),
                               let number = phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                               let url = URL(string: "tel:\(number)") {
                                Link(destination: url) {
                                    Label(phone, systemImage: "phone")
                                        .frame(minHeight: 44)
                                }
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
            .task {
                if !rosterIsLoaded && !rosterIsUnavailable {
                    await admin.loadEventRoster(session: session, eventID: event.id)
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        exportDocument = AdminEventRosterCSVDocument(csv: report.csv)
                        isExporting = true
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .disabled(!rosterIsLoaded || admin.eventRoster.isEmpty)
                    .accessibilityLabel("Export \(event.name) training group")
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .fileExporter(
                isPresented: $isExporting,
                document: exportDocument,
                contentType: .commaSeparatedText,
                defaultFilename: "xert-\(safeFilename(event.name))-training-group"
            ) { result in
                if case .failure(let error) = result {
                    exportError = error.localizedDescription
                }
                exportDocument = nil
            }
            .alert("Export failed", isPresented: Binding(
                get: { exportError != nil },
                set: { if !$0 { exportError = nil } }
            )) {
                Button("OK", role: .cancel) { exportError = nil }
            } message: {
                Text(exportError ?? "The training group could not be exported.")
            }
        }
    }

    private func nonempty(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func safeFilename(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        return value.lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .unicodeScalars
            .filter { allowed.contains($0) }
            .map(String.init)
            .joined()
            .prefix(60)
            .description
    }
}

private struct AdminEventRosterCSVDocument: FileDocument {
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

private struct AdminCoachesView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    @State private var categoryFilter = "all"
    @State private var showingCreate = false
    @State private var pendingDelete: AdminCoach?

    private var directoryIsCurrent: Bool { admin.teamDirectoryIsCurrent }
    private var isRefreshing: Bool { admin.isLoading || admin.isRefreshingTeamDirectory }
    private var categories: [String] {
        Array(Set(admin.coaches.map(\.category))).sorted()
    }
    private var rows: [AdminCoach] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return admin.coaches.filter { coach in
            let fields: [String?] = [
                coach.name, coach.role, coach.experience,
                coach.currently_training_for, coach.category
            ]
            return (categoryFilter == "all" || coach.category == categoryFilter)
                && (term.isEmpty
                    || fields
                    .compactMap { $0?.lowercased() }
                    .joined(separator: " ")
                    .contains(term))
        }
    }

    var body: some View {
        List {
            if let message = admin.teamDirectoryStatusMessage {
                Label(message, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }
            if !directoryIsCurrent {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        admin.loadedSources.contains("team directory")
                            ? "Showing the last team snapshot. Profile changes are paused until refresh succeeds."
                            : "The Team Directory could not be loaded. No empty-directory assumption is being made.",
                        systemImage: "wifi.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    Button {
                        Task { await admin.refreshTeamDirectory(session: session) }
                    } label: {
                        Label(isRefreshing ? "Retrying..." : "Retry team directory", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.orange)
                    .disabled(isRefreshing)
                }
                .listRowBackground(Color.xertInk)
            }
            Section("Filter") {
                Picker("Category", selection: $categoryFilter) {
                    Text("All categories").tag("all")
                    ForEach(categories, id: \.self) { Text($0.capitalized).tag($0) }
                }
            }
            .listRowBackground(Color.xertNavy)

            if directoryIsCurrent && rows.isEmpty {
                Text("No matching team profiles.").listRowBackground(Color.xertInk)
            }
            ForEach(rows) { coach in
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
                            .frame(width: 44, height: 44)
                            .disabled(
                                !directoryIsCurrent
                                    || admin.deletingCoachID != nil
                                    || isRefreshing
                                    || admin.savingCoachID != nil
                            )
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
        .searchable(text: $query, prompt: "Name, role or experience")
        .refreshable { await admin.refreshTeamDirectory(session: session) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .disabled(
                        !directoryIsCurrent
                            || isRefreshing
                            || admin.savingCoachID != nil
                            || admin.deletingCoachID != nil
                    )
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
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()

    private var mutationAllowed: Bool {
        admin.teamDirectoryIsCurrent
            && !admin.isLoading
            && !admin.isRefreshingTeamDirectory
    }
    private var isDirty: Bool { draft != baseline }
    private var isBusy: Bool { admin.savingCoachID != nil }
    private var canSave: Bool {
        mutationAllowed
            && isDirty
            && !isBusy
            && !draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

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
            if !mutationAllowed {
                Section {
                    Label(
                        "This team snapshot is not current. Profile details remain visible, but publishing changes is paused until refresh succeeds.",
                        systemImage: "lock.trianglebadge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                }
            }
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
                        if isBusy { ProgressView().tint(Color.xertNavy) }
                        Text(coach == nil ? "Create profile" : "Save profile").fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(!canSave)
                .listRowBackground(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(coach == nil ? "New Team Member" : "Edit Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if coach == nil || isDirty {
                ToolbarItem(placement: .cancellationAction) {
                    Button(coach == nil ? "Cancel" : "Close") { requestDismiss() }
                        .disabled(isBusy)
                }
            }
        }
        .navigationBarBackButtonHidden(coach != nil && isDirty)
        .adminOwnerExitState(
            id: exitStateID,
            title: coach == nil ? "new team profile" : "team profile changes",
            isDirty: isDirty,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(isDirty || isBusy)
        .confirmationDialog("Discard team profile changes?", isPresented: $confirmingDiscard) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("Your unsaved team profile changes will be permanently discarded.")
        }
    }

    private func requestDismiss() {
        if isDirty { confirmingDiscard = true }
        else { dismiss() }
    }
}

private struct AdminAnnouncementComposer: View {
    @Environment(\.dismiss) private var dismiss
    let announcement: AdminAnnouncement?
    let publishesOnOpen: Bool
    let isSaving: Bool
    let isPublishing: Bool
    let onSave: (AdminAnnouncementDraft) -> Void
    let onPublish: (AdminAnnouncementDraft) -> Void
    private let baseline: AdminAnnouncementDraft
    @State private var draft: AdminAnnouncementDraft
    @State private var hasExpiry: Bool
    @State private var confirmingPublish: Bool
    @State private var confirmingDiscard = false
    @State private var exitStateID = UUID()
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case title
        case body
        case ctaLabel
        case ctaURL
    }

    init(
        announcement: AdminAnnouncement?,
        initialDraft: AdminAnnouncementDraft? = nil,
        publishesOnOpen: Bool = false,
        isSaving: Bool,
        isPublishing: Bool,
        onSave: @escaping (AdminAnnouncementDraft) -> Void,
        onPublish: @escaping (AdminAnnouncementDraft) -> Void
    ) {
        let initial = announcement.map(AdminAnnouncementDraft.init)
            ?? initialDraft
            ?? AdminAnnouncementDraft()
        self.announcement = announcement
        self.publishesOnOpen = publishesOnOpen
        self.isSaving = isSaving
        self.isPublishing = isPublishing
        self.onSave = onSave
        self.onPublish = onPublish
        baseline = initial
        _draft = State(initialValue: initial)
        _hasExpiry = State(initialValue: initial.expiresAt != nil)
        _confirmingPublish = State(initialValue: publishesOnOpen)
    }

    private var isBusy: Bool { isSaving || isPublishing }
    private var isDirty: Bool { draft != baseline }
    private var saveValidation: String? { draft.validationMessage(publishing: false) }
    private var publishValidation: String? { draft.validationMessage(publishing: true) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Member notice") {
                    TextField("Title", text: $draft.title)
                        .focused($focusedField, equals: .title)
                        .onChange(of: draft.title) { value in
                            if value.count > 120 { draft.title = String(value.prefix(120)) }
                        }
                    HStack {
                        Spacer()
                        Text("\(draft.title.count)/120")
                            .font(.caption2)
                            .foregroundStyle(Color.xertPale.opacity(0.48))
                    }
                    TextEditor(text: $draft.body)
                        .focused($focusedField, equals: .body)
                        .frame(minHeight: 170)
                        .onChange(of: draft.body) { value in
                            if value.count > 2_000 { draft.body = String(value.prefix(2_000)) }
                        }
                    HStack {
                        Spacer()
                        Text("\(draft.body.count)/2000")
                            .font(.caption2)
                            .foregroundStyle(Color.xertPale.opacity(0.48))
                    }
                    Picker("Priority", selection: $draft.tone) {
                        Text("Information").tag("info")
                        Text("Action requested").tag("action")
                        Text("Urgent").tag("urgent")
                    }
                }

                Section("Member action") {
                    TextField("Action label (optional)", text: $draft.ctaLabel)
                        .focused($focusedField, equals: .ctaLabel)
                        .onChange(of: draft.ctaLabel) { value in
                            if value.count > 40 { draft.ctaLabel = String(value.prefix(40)) }
                        }
                    TextField("Internal path or HTTPS URL", text: $draft.ctaURL)
                        .focused($focusedField, equals: .ctaURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: draft.ctaURL) { value in
                            if value.count > 500 { draft.ctaURL = String(value.prefix(500)) }
                        }
                    Text("Use an internal destination such as /booking, or a complete secure HTTPS URL.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.55))
                }

                Section("Visibility window") {
                    Toggle("Expire automatically", isOn: $hasExpiry)
                        .onChange(of: hasExpiry) { enabled in
                            draft.expiresAt = enabled
                                ? draft.expiresAt ?? Calendar.current.date(byAdding: .day, value: 1, to: Date())
                                : nil
                        }
                    if hasExpiry {
                        DatePicker(
                            "Expiry",
                            selection: Binding(
                                get: { draft.expiresAt ?? Date() },
                                set: { draft.expiresAt = $0 }
                            ),
                            displayedComponents: [.date, .hourAndMinute]
                        )
                    }
                    Text("After expiry, the notice disappears automatically from member accounts.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.55))
                }

                if let validation = saveValidation {
                    Section {
                        Label(validation, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.orange)
                    }
                }

                Section {
                    Text(announcement?.published_at == nil
                        ? "Saving creates a private draft. Publishing makes it visible immediately and requests Apple push delivery."
                        : "Saving updates the live notice without sending a second push. Unpublish it from the communications desk to hide it.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.58))
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.xertNavy)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(announcement == nil ? "New Notice" : "Edit Notice")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                actionBar
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { requestClose() }
                        .disabled(isBusy)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
            .confirmationDialog("Publish this member notice now?", isPresented: $confirmingPublish, titleVisibility: .visible) {
                Button("Publish to members") { onPublish(draft) }
                    .disabled(publishValidation != nil || isBusy)
                Button("Keep editing", role: .cancel) {}
            } message: {
                Text(publishValidation ?? "The notice becomes live on the website and iOS app, and push delivery starts immediately.")
            }
            .confirmationDialog("Discard unsaved notice changes?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            } message: {
                Text("Your title, message, action and expiry edits will be lost.")
            }
        }
        .adminOwnerExitState(
            id: exitStateID,
            title: announcement == nil ? "new member notice" : "member notice changes",
            isDirty: isDirty,
            isBusy: isBusy
        )
        .interactiveDismissDisabled(isDirty || isBusy)
    }

    private var actionBar: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { actionButtons }
            VStack(spacing: 10) { actionButtons }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) {
            Rectangle().fill(Color.xertSteel.opacity(0.24)).frame(height: 1)
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        Button {
            focusedField = nil
            onSave(draft)
        } label: {
            Label(isSaving ? "Saving..." : announcement == nil ? "Save Draft" : "Save Changes", systemImage: "square.and.arrow.down")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(Color.xertSteel)
        .disabled(isBusy || saveValidation != nil || (!isDirty && announcement != nil))
        .accessibilityIdentifier("owner.notice.save")

        Button {
            focusedField = nil
            confirmingPublish = true
        } label: {
            Label(isPublishing ? "Publishing..." : "Publish", systemImage: "paperplane.fill")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.xertSteel)
        .foregroundStyle(Color.xertNavy)
        .disabled(isBusy || publishValidation != nil || announcement?.archived_at != nil)
        .accessibilityIdentifier("owner.notice.publish")
    }

    private func requestClose() {
        focusedField = nil
        if isDirty {
            confirmingDiscard = true
        } else {
            dismiss()
        }
    }
}

private enum AdminOwnerQuickAction: String, Identifiable {
    case newClass
    case newNotice
    case newSessionPack
    case newCoach
    case newEvent

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

    var actionTitle: String {
        task == nil ? "Open workspace" : "Open exact task"
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
                        Label(priority.actionTitle, systemImage: "arrow.right")
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
        .accessibilityHint("\(priority.detail). \(priority.actionTitle).")
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
    var currency = "AUD"

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text((Double(cents) / 100).formatted(.currency(code: currency))).fontWeight(.bold)
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
