import Foundation

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
    case products
    case controls
    case health
    case audit

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .members: return "Members"
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
        case .products: return "Session Packs"
        case .controls: return "Platform Controls"
        case .health: return "Operations Health"
        case .audit: return "Admin Audit"
        }
    }

    var detail: String {
        switch self {
        case .overview: return "Business pulse and today's priorities"
        case .members: return "Search accounts and review member value"
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
        case .finance: return "Track pack sales, revenue and refunds"
        case .products: return "Control pricing, credits and Stripe links"
        case .controls: return "Control launch, bookings and messaging"
        case .health: return "Verify Stripe, schema and APNs readiness"
        case .audit: return "Review protected operational changes"
        }
    }

    var icon: String {
        switch self {
        case .overview: return "waveform.path.ecg.rectangle"
        case .members: return "person.2"
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
        case .finance, .products: return .commerce
        case .controls, .health, .audit: return .platform
        }
    }

    var searchKeywords: [String] {
        switch self {
        case .overview: return ["owner", "dashboard", "today", "business", "operations"]
        case .members: return ["member", "account", "credit", "notes", "contact"]
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
        case .finance: return ["payment", "order", "revenue", "refund", "Stripe"]
        case .products: return ["pack", "price", "credit", "Stripe", "product"]
        case .controls: return ["launch", "payment", "booking", "platform", "settings"]
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

struct XertOwnerWorkspaceHistory: Equatable {
    static let maximumCount = 16
    private static let restorationVersion = "v1"

    private(set) var workspaces: [XertOwnerWorkspace]
    private(set) var currentIndex: Int

    init(
        workspaces: [XertOwnerWorkspace] = [.overview],
        currentIndex: Int = 0
    ) {
        let retained = Array(workspaces.suffix(Self.maximumCount))
        guard !retained.isEmpty else {
            self.workspaces = [.overview]
            self.currentIndex = 0
            return
        }

        let removedCount = max(0, workspaces.count - retained.count)
        self.workspaces = retained
        self.currentIndex = min(
            max(0, currentIndex - removedCount),
            retained.count - 1
        )
    }

    init(restorationValue: String, fallback: XertOwnerWorkspace = .overview) {
        let parts = restorationValue.split(
            separator: "|",
            maxSplits: 2,
            omittingEmptySubsequences: false
        )
        guard
            parts.count == 3,
            parts[0] == Self.restorationVersion,
            let restoredIndex = Int(parts[1])
        else {
            self.init(workspaces: [fallback])
            return
        }

        let workspaceTokens = parts[2]
            .split(separator: ",", omittingEmptySubsequences: true)
        let restoredWorkspaces = workspaceTokens
            .compactMap { XertOwnerWorkspace(rawValue: String($0)) }
        guard !restoredWorkspaces.isEmpty else {
            self.init(workspaces: [fallback])
            return
        }
        guard
            workspaceTokens.count <= Self.maximumCount,
            restoredWorkspaces.count == workspaceTokens.count,
            restoredWorkspaces.indices.contains(restoredIndex)
        else {
            self.init(workspaces: [fallback])
            return
        }
        self.init(workspaces: restoredWorkspaces, currentIndex: restoredIndex)
    }

    var restorationValue: String {
        "\(Self.restorationVersion)|\(currentIndex)|\(workspaces.map(\.rawValue).joined(separator: ","))"
    }

    var current: XertOwnerWorkspace { workspaces[currentIndex] }
    var previous: XertOwnerWorkspace? {
        currentIndex > 0 ? workspaces[currentIndex - 1] : nil
    }
    var next: XertOwnerWorkspace? {
        currentIndex + 1 < workspaces.count ? workspaces[currentIndex + 1] : nil
    }

    mutating func visit(_ workspace: XertOwnerWorkspace) {
        guard workspace != current else { return }
        workspaces = Array(workspaces.prefix(currentIndex + 1)) + [workspace]
        if workspaces.count > Self.maximumCount {
            workspaces.removeFirst(workspaces.count - Self.maximumCount)
        }
        currentIndex = workspaces.count - 1
    }

    mutating func goBack() -> XertOwnerWorkspace? {
        guard currentIndex > 0 else { return nil }
        currentIndex -= 1
        return current
    }

    mutating func goForward() -> XertOwnerWorkspace? {
        guard currentIndex + 1 < workspaces.count else { return nil }
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

struct XertOwnerRoute: Equatable, Hashable {
    static let canonicalWebHost = AppConfig.vercelHost
    let workspace: XertOwnerWorkspace

    var restorationValue: String { "owner/\(workspace.rawValue)" }

    static func restore(_ value: String) -> Self? {
        let parts = value
            .lowercased()
            .split(separator: "/", omittingEmptySubsequences: true)
            .map(String.init)
        guard
            parts.count == 2,
            parts[0] == "owner",
            let workspace = XertOwnerWorkspace.allCases.first(where: {
                $0.rawValue.lowercased() == parts[1]
            })
        else { return nil }
        return XertOwnerRoute(workspace: workspace)
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
