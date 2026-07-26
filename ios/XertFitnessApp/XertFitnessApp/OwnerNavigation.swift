import Foundation
import Combine

struct XertOwnerEditorExitState: Equatable {
    let id: UUID
    let title: String
    let isDirty: Bool
    let isBusy: Bool
}

final class XertOwnerEditorExitCoordinator: ObservableObject {
    @Published private(set) var active: XertOwnerEditorExitState?
    private var states: [UUID: XertOwnerEditorExitState] = [:]
    private var order: [UUID] = []

    func report(_ state: XertOwnerEditorExitState) {
        guard state.isDirty || state.isBusy else {
            clear(id: state.id)
            return
        }
        states[state.id] = state
        order.removeAll { $0 == state.id }
        order.append(state.id)
        refreshActive()
    }

    func clear(id: UUID) {
        states[id] = nil
        order.removeAll { $0 == id }
        refreshActive()
    }

    func clearAll() {
        states.removeAll()
        order.removeAll()
        active = nil
    }

    private func refreshActive() {
        active = order.reversed().compactMap { states[$0] }.first
    }
}

enum XertOwnerWorkspaceSection: String, CaseIterable, Identifiable {
    case operate = "Operate"
    case grow = "Grow"
    case publish = "Publish"
    case commerce = "Commerce"
    case platform = "Platform"

    var id: String { rawValue }
}

enum XertOwnerWorkspace: String, CaseIterable, Identifiable, Codable, Hashable {
    case overview
    case members
    case access
    case classDesk
    case bookingRequests
    case timetable
    case availability
    case ptRequests
    case retention
    case leads
    case campaigns
    case siteContent
    case notices
    case events
    case team
    case finance
    case orders
    case products
    case controls
    case health
    case audit

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .members: return "Members"
        case .access: return "Access Control"
        case .classDesk: return "Class Desk"
        case .bookingRequests: return "Booking Requests"
        case .timetable: return "Full Timetable"
        case .availability: return "Availability"
        case .ptRequests: return "PT Requests"
        case .retention: return "Retention"
        case .leads: return "Lead Pipelines"
        case .campaigns: return "Campaign Attribution"
        case .siteContent: return "Site Content"
        case .notices: return "Member Notices"
        case .events: return "Event Calendar"
        case .team: return "Team Directory"
        case .finance: return "Finance"
        case .orders: return "Orders"
        case .products: return "Session Packs & Pricing"
        case .controls: return "Member App Controls"
        case .health: return "Operations Health"
        case .audit: return "Admin Audit"
        }
    }

    var detail: String {
        switch self {
        case .overview: return "Business pulse and today's priorities"
        case .members: return "Search accounts and review member value"
        case .access: return "Review administrators and govern owner access"
        case .classDesk: return "Run today's schedule and waitlists"
        case .bookingRequests: return "Resolve member and public requests"
        case .timetable: return "Create, publish and cancel classes"
        case .availability: return "Control bookable windows and blackouts"
        case .ptRequests: return "Approve and complete private training"
        case .retention: return "Contact members before they disengage"
        case .leads: return "Manage member, trainer and partner opportunities"
        case .campaigns: return "Measure acquisition sources and campaigns"
        case .siteContent: return "Edit public copy, FAQs and hero media"
        case .notices: return "Publish updates to web and iOS"
        case .events: return "Coordinate the annual training calendar"
        case .team: return "Manage coaches and practitioners"
        case .finance: return "Review revenue and sales performance"
        case .orders: return "Recover payments, fulfil sales and issue refunds"
        case .products: return "Control pricing, credits and Stripe links"
        case .controls: return "Control member booking, purchases, launch and messaging"
        case .health: return "Verify Stripe, schema and APNs readiness"
        case .audit: return "Review protected operational changes"
        }
    }

    var icon: String {
        switch self {
        case .overview: return "waveform.path.ecg.rectangle"
        case .members: return "person.2"
        case .access: return "person.badge.key"
        case .classDesk: return "calendar.badge.clock"
        case .bookingRequests: return "tray.full"
        case .timetable: return "calendar"
        case .availability: return "calendar.badge.exclamationmark"
        case .ptRequests: return "figure.strengthtraining.traditional"
        case .retention: return "arrow.triangle.2.circlepath"
        case .leads: return "person.crop.circle.badge.plus"
        case .campaigns: return "chart.bar.xaxis"
        case .siteContent: return "square.and.pencil"
        case .notices: return "bell.badge"
        case .events: return "trophy"
        case .team: return "person.crop.rectangle.stack"
        case .finance: return "chart.line.uptrend.xyaxis"
        case .orders: return "creditcard.and.123"
        case .products: return "ticket"
        case .controls: return "switch.2"
        case .health: return "checkmark.shield"
        case .audit: return "clock.arrow.circlepath"
        }
    }

    var section: XertOwnerWorkspaceSection? {
        switch self {
        case .overview: return nil
        case .members, .classDesk, .bookingRequests, .timetable, .availability, .ptRequests:
            return .operate
        case .retention, .leads, .campaigns: return .grow
        case .siteContent, .notices, .events, .team: return .publish
        case .finance, .orders, .products: return .commerce
        case .access, .controls, .health, .audit: return .platform
        }
    }

    var searchKeywords: [String] {
        switch self {
        case .overview: return ["owner", "dashboard", "today", "business", "operations"]
        case .members: return ["member", "account", "credit", "notes", "contact"]
        case .access: return ["admin", "administrator", "owner", "staff", "role", "permission", "security"]
        case .classDesk: return ["today", "class", "attendance", "roll call", "waitlist"]
        case .bookingRequests: return ["booking", "request", "approve", "decline"]
        case .timetable: return ["schedule", "class", "publish", "cancel"]
        case .availability: return ["availability", "blackout", "booking window"]
        case .ptRequests: return ["personal training", "pt", "request"]
        case .retention: return ["retention", "follow up", "inactive", "contact"]
        case .leads: return ["lead", "pipeline", "member", "trainer", "partner"]
        case .campaigns: return ["campaign", "attribution", "source", "marketing"]
        case .siteContent: return ["website", "homepage", "hero", "faq", "content"]
        case .notices: return ["announcement", "push", "message", "notification"]
        case .events: return ["event", "race", "competition", "calendar"]
        case .team: return ["coach", "practitioner", "trainer", "team"]
        case .finance: return ["revenue", "sales", "performance", "income", "Stripe"]
        case .orders: return ["payment", "order", "checkout", "recovery", "refund", "fulfilment", "Stripe"]
        case .products: return ["session pack", "pack", "price", "credit", "Stripe", "product"]
        case .controls: return ["member app", "client access", "launch", "payment", "booking", "platform", "settings"]
        case .health: return ["Stripe", "APNs", "schema", "release", "webhook", "readiness"]
        case .audit: return ["audit", "history", "change", "operator"]
        }
    }

    static func workspaces(in section: XertOwnerWorkspaceSection) -> [Self] {
        allCases.filter { $0.section == section }
    }

    func matches(_ query: String) -> Bool {
        let terms = query
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
        guard !terms.isEmpty else { return true }
        let searchableText = ([title, detail, section?.rawValue ?? ""] + searchKeywords)
            .joined(separator: " ")
            .lowercased()
        return terms.allSatisfy(searchableText.contains)
    }
}

struct XertOwnerWorkspaceRecency: Equatable {
    static let maximumCount = 6
    private(set) var workspaces: [XertOwnerWorkspace]

    init(workspaces: [XertOwnerWorkspace] = []) {
        self.workspaces = Self.normalized(workspaces)
    }

    init(restorationValue: String) {
        self.init(workspaces: restorationValue
            .split(separator: ",", omittingEmptySubsequences: true)
            .compactMap { XertOwnerWorkspace(rawValue: String($0)) })
    }

    var restorationValue: String {
        workspaces.map(\.rawValue).joined(separator: ",")
    }

    mutating func record(_ workspace: XertOwnerWorkspace) {
        workspaces = Self.normalized([workspace] + workspaces)
    }

    private static func normalized(_ workspaces: [XertOwnerWorkspace]) -> [XertOwnerWorkspace] {
        var seen = Set<XertOwnerWorkspace>()
        return workspaces
            .filter { $0 != .overview && seen.insert($0).inserted }
            .prefix(maximumCount)
            .map { $0 }
    }
}

struct XertOwnerRouteHistory: Equatable {
    static let maximumCount = 16
    static let maximumEncodedLength = 2_048
    private static let restorationVersion = "v2"
    private static let legacyWorkspaceVersion = "v1"

    private(set) var routes: [XertOwnerRoute]
    private(set) var currentIndex: Int

    init(
        routes: [XertOwnerRoute] = [XertOwnerRoute(workspace: .overview)],
        currentIndex: Int = 0
    ) {
        let retained = Array(routes.suffix(Self.maximumCount))
        guard !retained.isEmpty else {
            self.routes = [XertOwnerRoute(workspace: .overview)]
            self.currentIndex = 0
            return
        }

        let removedCount = max(0, routes.count - retained.count)
        self.routes = retained
        self.currentIndex = min(
            max(0, currentIndex - removedCount),
            retained.count - 1
        )
    }

    init(
        restorationValue: String,
        fallback: XertOwnerRoute = XertOwnerRoute(workspace: .overview)
    ) {
        guard restorationValue.utf8.count <= Self.maximumEncodedLength else {
            self.init(routes: [fallback])
            return
        }
        let parts = restorationValue.split(
            separator: "|",
            maxSplits: 2,
            omittingEmptySubsequences: false
        )
        guard
            parts.count == 3,
            let restoredIndex = Int(parts[1])
        else {
            self.init(routes: [fallback])
            return
        }

        let routeTokens = parts[2]
            .split(separator: ",", omittingEmptySubsequences: true)
        let restoredRoutes: [XertOwnerRoute]
        switch parts[0] {
        case Self.restorationVersion:
            restoredRoutes = routeTokens.compactMap { XertOwnerRoute.restore(String($0)) }
        case Self.legacyWorkspaceVersion:
            restoredRoutes = routeTokens.compactMap { token in
                XertOwnerWorkspace(rawValue: String(token)).map { XertOwnerRoute(workspace: $0) }
            }
        default:
            self.init(routes: [fallback])
            return
        }
        guard !restoredRoutes.isEmpty else {
            self.init(routes: [fallback])
            return
        }
        guard
            routeTokens.count <= Self.maximumCount,
            restoredRoutes.count == routeTokens.count,
            restoredRoutes.indices.contains(restoredIndex)
        else {
            self.init(routes: [fallback])
            return
        }
        self.init(routes: restoredRoutes, currentIndex: restoredIndex)
    }

    var restorationValue: String {
        "\(Self.restorationVersion)|\(currentIndex)|\(routes.map(\.restorationValue).joined(separator: ","))"
    }

    var current: XertOwnerRoute { routes[currentIndex] }
    var previous: XertOwnerRoute? {
        currentIndex > 0 ? routes[currentIndex - 1] : nil
    }
    var next: XertOwnerRoute? {
        currentIndex + 1 < routes.count ? routes[currentIndex + 1] : nil
    }

    mutating func visit(_ route: XertOwnerRoute) {
        guard route != current else { return }
        routes = Array(routes.prefix(currentIndex + 1)) + [route]
        if routes.count > Self.maximumCount {
            routes.removeFirst(routes.count - Self.maximumCount)
        }
        currentIndex = routes.count - 1
    }

    mutating func goBack() -> XertOwnerRoute? {
        guard currentIndex > 0 else { return nil }
        currentIndex -= 1
        return current
    }

    mutating func goForward() -> XertOwnerRoute? {
        guard currentIndex + 1 < routes.count else { return nil }
        currentIndex += 1
        return current
    }
}

struct XertOwnerWorkspacePinsSnapshot: Codable, Equatable {
    static let currentVersion = 1
    static let maximumWorkspaceCount = 6
    static let maximumEncodedLength = 512

    let version: Int
    let workspaceValues: [String]

    init(workspaces: [XertOwnerWorkspace]) {
        version = Self.currentVersion
        workspaceValues = workspaces.map(\.rawValue)
    }
}

enum XertOwnerWorkspacePinsStore {
    private static let keyPrefix = "xert.owner-navigation.pins.v1."

    static func load(
        for userID: UUID?,
        defaults: UserDefaults = .standard
    ) -> [XertOwnerWorkspace] {
        guard
            let userID,
            let data = defaults.data(forKey: storageKey(for: userID)),
            data.count <= XertOwnerWorkspacePinsSnapshot.maximumEncodedLength,
            let snapshot = try? JSONDecoder().decode(XertOwnerWorkspacePinsSnapshot.self, from: data),
            snapshot.version == XertOwnerWorkspacePinsSnapshot.currentVersion,
            snapshot.workspaceValues.count <= XertOwnerWorkspacePinsSnapshot.maximumWorkspaceCount
        else { return [] }

        let workspaces = snapshot.workspaceValues.compactMap(XertOwnerWorkspace.init(rawValue:))
        guard
            workspaces.count == snapshot.workspaceValues.count,
            !workspaces.contains(.overview),
            Set(workspaces).count == workspaces.count
        else { return [] }
        return workspaces
    }

    @discardableResult
    static func toggle(
        _ workspace: XertOwnerWorkspace,
        for userID: UUID,
        defaults: UserDefaults = .standard
    ) -> [XertOwnerWorkspace] {
        guard workspace != .overview else { return load(for: userID, defaults: defaults) }
        var workspaces = load(for: userID, defaults: defaults)
        if let index = workspaces.firstIndex(of: workspace) {
            workspaces.remove(at: index)
        } else {
            workspaces.insert(workspace, at: 0)
            workspaces = Array(workspaces.prefix(XertOwnerWorkspacePinsSnapshot.maximumWorkspaceCount))
        }
        save(workspaces, for: userID, defaults: defaults)
        return workspaces
    }

    static func clear(for userID: UUID, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: storageKey(for: userID))
    }

    private static func save(
        _ workspaces: [XertOwnerWorkspace],
        for userID: UUID,
        defaults: UserDefaults
    ) {
        let snapshot = XertOwnerWorkspacePinsSnapshot(workspaces: workspaces)
        guard
            let data = try? JSONEncoder().encode(snapshot),
            data.count <= XertOwnerWorkspacePinsSnapshot.maximumEncodedLength
        else { return }
        defaults.set(data, forKey: storageKey(for: userID))
    }

    private static func storageKey(for userID: UUID) -> String {
        keyPrefix + userID.uuidString.lowercased()
    }
}

enum XertOwnerTask: Equatable, Hashable, Identifiable {
    case member(UUID)
    case classSession(UUID)
    case classSetup(UUID)
    case order(UUID)
    case product(UUID)
    case event(UUID)
    case announcement(UUID)
    case ptRequest(UUID)
    case bookingRequest(AdminBookingRequestSource, UUID)

    var id: String { restorationValue }

    var workspace: XertOwnerWorkspace {
        switch self {
        case .member: return .members
        case .classSession: return .classDesk
        case .classSetup: return .timetable
        case .order: return .orders
        case .product: return .products
        case .event: return .events
        case .announcement: return .notices
        case .ptRequest: return .ptRequests
        case .bookingRequest: return .bookingRequests
        }
    }

    var title: String {
        switch self {
        case .member: return "Member Record"
        case .classSession: return "Class Roster"
        case .classSetup: return "Class Setup"
        case .order: return "Order Detail"
        case .product: return "Session Pack"
        case .event: return "Event Detail"
        case .announcement: return "Member Notice"
        case .ptRequest: return "PT Request"
        case .bookingRequest: return "Booking Request"
        }
    }

    fileprivate var restorationValue: String {
        switch self {
        case .member(let id): return "member/\(id.uuidString.lowercased())"
        case .classSession(let id): return "class/\(id.uuidString.lowercased())"
        case .classSetup(let id): return "class-setup/\(id.uuidString.lowercased())"
        case .order(let id): return "order/\(id.uuidString.lowercased())"
        case .product(let id): return "product/\(id.uuidString.lowercased())"
        case .event(let id): return "event/\(id.uuidString.lowercased())"
        case .announcement(let id): return "announcement/\(id.uuidString.lowercased())"
        case .ptRequest(let id): return "pt-request/\(id.uuidString.lowercased())"
        case .bookingRequest(let source, let id):
            let kind = source == .member ? "member-booking-request" : "booking-enquiry"
            return "\(kind)/\(id.uuidString.lowercased())"
        }
    }

    fileprivate static func restore(
        workspace: XertOwnerWorkspace,
        kind: String,
        identifier: String
    ) -> Self? {
        guard let id = UUID(uuidString: identifier) else { return nil }
        switch (workspace, kind) {
        case (.members, "member"): return .member(id)
        case (.classDesk, "class"): return .classSession(id)
        case (.timetable, "class-setup"): return .classSetup(id)
        case (.orders, "order"), (.finance, "order"): return .order(id)
        case (.products, "product"): return .product(id)
        case (.events, "event"): return .event(id)
        case (.notices, "announcement"): return .announcement(id)
        case (.ptRequests, "pt-request"): return .ptRequest(id)
        case (.bookingRequests, "member-booking-request"): return .bookingRequest(.member, id)
        case (.bookingRequests, "booking-enquiry"): return .bookingRequest(.enquiry, id)
        default: return nil
        }
    }
}

struct XertOwnerRoute: Equatable, Hashable {
    static let canonicalWebHost = AppConfig.vercelHost
    let workspace: XertOwnerWorkspace
    let task: XertOwnerTask?

    init(workspace: XertOwnerWorkspace) {
        self.workspace = workspace
        task = nil
    }

    init(task: XertOwnerTask) {
        workspace = task.workspace
        self.task = task
    }

    var navigationTitle: String {
        task?.title ?? workspace.title
    }

    var restorationValue: String {
        ["owner", workspace.rawValue, task?.restorationValue]
            .compactMap { $0 }
            .joined(separator: "/")
    }

    static func restore(_ value: String) -> Self? {
        let parts = value
            .lowercased()
            .split(separator: "/", omittingEmptySubsequences: true)
            .map(String.init)
        guard
            parts.count == 2 || parts.count == 4,
            parts[0] == "owner",
            let workspace = XertOwnerWorkspace.allCases.first(where: {
                $0.rawValue.lowercased() == parts[1]
            })
        else { return nil }
        if parts.count == 2 { return XertOwnerRoute(workspace: workspace) }
        guard let task = XertOwnerTask.restore(
            workspace: workspace,
            kind: parts[2],
            identifier: parts[3]
        ) else { return nil }
        return XertOwnerRoute(task: task)
    }

    static func route(for url: URL) -> Self? {
        guard
            url.user == nil,
            url.password == nil,
            url.query == nil,
            url.fragment == nil
        else { return nil }

        switch url.scheme?.lowercased() {
        case "xertfitness":
            guard url.port == nil, url.host?.lowercased() == "owner" else { return nil }
            return restore("owner/\(url.path)")
        case "https":
            guard
                url.host?.lowercased() == canonicalWebHost,
                url.port == nil || url.port == 443,
                url.path.lowercased().hasPrefix("/open/owner/")
            else { return nil }
            return restore(String(url.path.dropFirst("/open/".count)))
        default:
            return nil
        }
    }
}

enum XertStripeLaunchPhase: Equatable {
    case checking
    case unavailable
    case catalogBlocked
    case healthBlocked
    case controlsBlocked
    case readyToOpenBookings
    case readyToActivate
    case live
}

struct XertStripeLaunchRunway: Equatable {
    static let totalSteps = 5

    let phase: XertStripeLaunchPhase
    let completedSteps: Int
    let title: String
    let detail: String
    let actionTitle: String
    let route: XertOwnerRoute

    static func resolve(
        hasCompletedRefresh: Bool,
        isRefreshing: Bool,
        sourcesAreCurrent: Bool,
        bookingsEnabled: Bool?,
        paymentsEnabled: Bool?,
        hasActiveProducts: Bool,
        activeProductsAreLinked: Bool,
        healthReady: Bool?,
        paymentSwitchState: String?,
        activationReceiptReady: Bool?,
        blockingProductIDs: [UUID]
    ) -> Self {
        guard hasCompletedRefresh else {
            return Self(
                phase: .checking,
                completedSteps: 0,
                title: isRefreshing ? "Checking Stripe launch gates" : "Stripe launch status pending",
                detail: "Refresh owner data to verify the catalogue, Stripe services and payment switch.",
                actionTitle: "Open Operations Health",
                route: XertOwnerRoute(workspace: .health)
            )
        }
        guard sourcesAreCurrent else {
            return Self(
                phase: .unavailable,
                completedSteps: 0,
                title: "Stripe launch status unavailable",
                detail: "One or more live launch sources could not be verified. Keep payments paused and retry health checks.",
                actionTitle: "Review unavailable checks",
                route: XertOwnerRoute(workspace: .health)
            )
        }
        guard hasActiveProducts else {
            return Self(
                phase: .catalogBlocked,
                completedSteps: 1,
                title: "Session-pack catalogue required",
                detail: "Create at least one active session pack before opening checkout.",
                actionTitle: "Open Session Packs",
                route: XertOwnerRoute(workspace: .products)
            )
        }
        guard activeProductsAreLinked else {
            return Self(
                phase: .catalogBlocked,
                completedSteps: 1,
                title: "Stripe catalogue needs attention",
                detail: "Every active pack needs a verified stable Stripe Price ID before live checkout.",
                actionTitle: blockingProductIDs.count == 1 ? "Fix blocking pack" : "Review active packs",
                route: exactProductRoute(blockingProductIDs) ?? XertOwnerRoute(workspace: .products)
            )
        }
        guard healthReady == true else {
            return Self(
                phase: .healthBlocked,
                completedSteps: 2,
                title: "Stripe launch checks need attention",
                detail: "Resolve account, webhook, database or delivery checks before activation.",
                actionTitle: blockingProductIDs.count == 1 ? "Fix blocking pack" : "Open Operations Health",
                route: exactProductRoute(blockingProductIDs) ?? XertOwnerRoute(workspace: .health)
            )
        }
        guard let bookingsEnabled, let paymentsEnabled else {
            return Self(
                phase: .unavailable,
                completedSteps: 3,
                title: "Launch switches unavailable",
                detail: "Bookings and payment switch state could not be verified. Keep checkout paused and refresh owner data.",
                actionTitle: "Refresh launch switches",
                route: XertOwnerRoute(workspace: .health)
            )
        }
        if paymentsEnabled && !bookingsEnabled {
            return Self(
                phase: .controlsBlocked,
                completedSteps: 3,
                title: "Unsafe launch-switch order",
                detail: "Session-pack checkout cannot open while member bookings are paused.",
                actionTitle: "Repair launch switches",
                route: XertOwnerRoute(workspace: .controls)
            )
        }
        guard bookingsEnabled else {
            return Self(
                phase: .readyToOpenBookings,
                completedSteps: 3,
                title: "Ready to open bookings",
                detail: "Stripe preflight is healthy. Open member bookings and complete the booking smoke test before activating payments.",
                actionTitle: "Review booking switch",
                route: XertOwnerRoute(workspace: .controls)
            )
        }
        guard paymentsEnabled else {
            return Self(
                phase: .readyToActivate,
                completedSteps: 4,
                title: "Ready for guarded activation",
                detail: "Bookings are open and Stripe launch checks pass. Payments remain paused until you confirm activation.",
                actionTitle: "Review payment switch",
                route: XertOwnerRoute(workspace: .controls)
            )
        }
        guard paymentSwitchState?.lowercased() == "enabled", activationReceiptReady == true else {
            return Self(
                phase: .healthBlocked,
                completedSteps: 4,
                title: "Payment activation needs verification",
                detail: "Checkout is marked enabled, but its live switch or immutable activation receipt is not verified.",
                actionTitle: "Verify activation",
                route: XertOwnerRoute(workspace: .health)
            )
        }
        return Self(
            phase: .live,
            completedSteps: totalSteps,
            title: "Session-pack checkout is live",
            detail: "Stripe services, catalogue links and the immutable activation receipt are verified.",
            actionTitle: "Monitor Stripe health",
            route: XertOwnerRoute(workspace: .health)
        )
    }

    private static func exactProductRoute(_ productIDs: [UUID]) -> XertOwnerRoute? {
        let uniqueIDs = Array(Set(productIDs))
        guard uniqueIDs.count == 1, let productID = uniqueIDs.first else { return nil }
        return XertOwnerRoute(task: .product(productID))
    }
}

enum XertOwnerRecordKind: String, CaseIterable, Identifiable {
    case member = "Members"
    case classSession = "Today's Classes"
    case order = "Orders"
    case product = "Session Packs"
    case event = "Events"

    var id: Self { self }
}

struct XertOwnerRecordCommand: Identifiable, Equatable {
    let kind: XertOwnerRecordKind
    let route: XertOwnerRoute
    let title: String
    let subtitle: String
    let icon: String

    var id: String { route.restorationValue }
}

enum XertOwnerCommandIndex {
    static let maximumResultsPerKind = 8

    private struct Candidate {
        let command: XertOwnerRecordCommand
        let title: String
        let identifiers: [String]
        let searchableValues: [String]
    }

    static func matches(
        query: String,
        members: [AdminMemberSummary],
        orders: [OrderItem],
        products: [AdminProduct],
        events: [AdminEvent],
        classes: [AdminDailyOperation] = []
    ) -> [XertOwnerRecordCommand] {
        let normalizedQuery = normalize(query)
        guard normalizedQuery.count >= 2 else { return [] }

        let candidates = members.map(memberCandidate)
            + classes.map(classCandidate)
            + orders.map(orderCandidate)
            + products.map(productCandidate)
            + events.map(eventCandidate)
        return XertOwnerRecordKind.allCases.flatMap { kind in
            candidates
                .filter { $0.command.kind == kind }
                .compactMap { candidate -> (Candidate, Int)? in
                    guard let score = score(candidate, query: normalizedQuery) else { return nil }
                    return (candidate, score)
                }
                .sorted {
                    if $0.1 != $1.1 { return $0.1 < $1.1 }
                    return $0.0.title.localizedCaseInsensitiveCompare($1.0.title) == .orderedAscending
                }
                .prefix(maximumResultsPerKind)
                .map { $0.0.command }
        }
    }

    private static func memberCandidate(_ member: AdminMemberSummary) -> Candidate {
        let contact = [member.email, member.phone]
            .compactMap(clean)
            .joined(separator: " · ")
        return Candidate(
            command: XertOwnerRecordCommand(
                kind: .member,
                route: XertOwnerRoute(task: .member(member.id)),
                title: member.displayName,
                subtitle: contact.isEmpty ? "Member account" : contact,
                icon: "person.crop.circle"
            ),
            title: member.displayName,
            identifiers: [member.id.uuidString],
            searchableValues: [member.displayName, member.email, member.phone, member.role]
                .compactMap { $0 }
        )
    }

    private static func orderCandidate(_ order: OrderItem) -> Candidate {
        let title = order.products?.name ?? "Session pack"
        let buyer = clean(order.email) ?? "Anonymized buyer"
        return Candidate(
            command: XertOwnerRecordCommand(
                kind: .order,
                route: XertOwnerRoute(task: .order(order.id)),
                title: title,
                subtitle: "\(order.displayAmount) · \(order.displayStatus) · \(buyer)",
                icon: order.isRecoverable ? "exclamationmark.arrow.circlepath" : "creditcard"
            ),
            title: title,
            identifiers: [
                order.id.uuidString,
                order.stripe_checkout_session_id,
                order.stripe_payment_intent_id,
            ].compactMap { $0 },
            searchableValues: [
                title,
                order.email,
                order.status,
                order.stripe_checkout_session_id,
                order.stripe_payment_intent_id,
            ].compactMap { $0 }
        )
    }

    private static func classCandidate(_ operation: AdminDailyOperation) -> Candidate {
        let context = [
            operation.start_time.formatted(date: .abbreviated, time: .shortened),
            clean(operation.coach_name),
            clean(operation.location_zone),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
        let state = operation.attendance_due
            ? "Roll call due"
            : "\(operation.confirmed_count) confirmed · \(operation.waitlist_count) waiting"
        return Candidate(
            command: XertOwnerRecordCommand(
                kind: .classSession,
                route: XertOwnerRoute(task: .classSession(operation.id)),
                title: operation.title,
                subtitle: "\(context) · \(state)",
                icon: operation.attendance_due ? "checklist" : "person.3"
            ),
            title: operation.title,
            identifiers: [operation.id.uuidString],
            searchableValues: [
                operation.title,
                operation.class_type,
                operation.coach_name,
                operation.location_zone,
                operation.status,
                operation.attendance_due ? "attendance roll call due" : "roster class",
            ].compactMap { $0 }
        )
    }

    private static func eventCandidate(_ event: AdminEvent) -> Candidate {
        let context = [event.event_date, event.location, event.region]
            .compactMap(clean)
            .joined(separator: " · ")
        return Candidate(
            command: XertOwnerRecordCommand(
                kind: .event,
                route: XertOwnerRoute(task: .event(event.id)),
                title: event.name,
                subtitle: context.isEmpty ? "Calendar event" : context,
                icon: "trophy"
            ),
            title: event.name,
            identifiers: [event.id.uuidString],
            searchableValues: [event.name, event.category, event.location, event.region, event.event_date]
                .compactMap { $0 }
        )
    }

    private static func productCandidate(_ product: AdminProduct) -> Candidate {
        let stripeState: String
        if !product.active {
            stripeState = "Inactive"
        } else if product.hasStableStripePriceID {
            stripeState = "Stripe linked"
        } else {
            stripeState = "Blocks live checkout"
        }
        return Candidate(
            command: XertOwnerRecordCommand(
                kind: .product,
                route: XertOwnerRoute(task: .product(product.id)),
                title: product.name,
                subtitle: "\(product.displayPrice) · \(product.sessions_count) sessions · \(stripeState)",
                icon: product.active && !product.hasStableStripePriceID
                    ? "exclamationmark.triangle"
                    : "ticket"
            ),
            title: product.name,
            identifiers: [product.id.uuidString, product.slug, product.stripe_price_id]
                .compactMap { $0 },
            searchableValues: [
                product.name,
                product.slug,
                product.description,
                product.currency,
                product.stripe_price_id,
                stripeState,
            ].compactMap { $0 }
        )
    }

    private static func score(_ candidate: Candidate, query: String) -> Int? {
        let identifiers = candidate.identifiers.map(normalize)
        if identifiers.contains(query) { return 0 }
        let title = normalize(candidate.title)
        if title == query { return 1 }
        if title.hasPrefix(query) { return 2 }
        let values = candidate.searchableValues.map(normalize)
        if values.contains(where: { $0.hasPrefix(query) }) { return 3 }
        if identifiers.contains(where: { $0.contains(query) }) { return 4 }
        if values.contains(where: { $0.contains(query) }) { return 5 }
        return nil
    }

    private static func normalize(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func clean(_ value: String?) -> String? {
        guard let value else { return nil }
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }
}

enum XertOwnerNavigationDisposition: Equatable {
    case requireAuthentication
    case waitForProfile
    case open
    case deny
}

struct XertOwnerNavigationIntent: Equatable {
    let route: XertOwnerRoute

    func disposition(
        isSignedIn: Bool,
        isProfileLoaded: Bool,
        isAdmin: Bool
    ) -> XertOwnerNavigationDisposition {
        guard isSignedIn else { return .requireAuthentication }
        guard isProfileLoaded else { return .waitForProfile }
        return isAdmin ? .open : .deny
    }
}
