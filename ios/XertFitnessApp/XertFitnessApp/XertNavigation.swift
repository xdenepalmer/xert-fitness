import Combine
import Foundation

enum XertPrimaryDestination: Int, CaseIterable, Identifiable, Hashable {
    case home = 0
    case booking = 1
    case events = 2
    case account = 3
    case explore = 4

    var id: Self { self }

    static let dockOrder: [Self] = [.home, .booking, .events, .explore, .account]

    var title: String {
        switch self {
        case .home: return "Home"
        case .booking: return "Book"
        case .events: return "Events"
        case .account: return "Account"
        case .explore: return "Explore"
        }
    }

    var icon: String {
        switch self {
        case .home: return "house"
        case .booking: return "calendar.badge.plus"
        case .events: return "trophy"
        case .account: return "person.crop.circle"
        case .explore: return "safari"
        }
    }

    var selectedIcon: String {
        switch self {
        case .home: return "house.fill"
        case .booking: return "calendar.badge.plus"
        case .events: return "trophy.fill"
        case .account: return "person.crop.circle.fill"
        case .explore: return "safari.fill"
        }
    }

    static func destination(for path: String) -> Self? {
        switch path {
        case "/", "/home": return .home
        case "/booking": return .booking
        case "/events": return .events
        case "/account": return .account
        case "/explore": return .explore
        default: return nil
        }
    }

    static func destination(for url: URL) -> Self? {
        XertMemberRoute.route(for: url)?.destination
    }
}

enum XertMemberRoute: Hashable {
    static let canonicalWebHost = AppConfig.vercelHost

    case home
    case notices(UUID?)
    case booking
    case sessionPacks
    case purchaseConfirmation
    case events
    case eventGoals
    case explore
    case account
    case upcomingBookings(UUID?)

    var destination: XertPrimaryDestination {
        switch self {
        case .home, .notices(_): return .home
        case .booking, .sessionPacks, .purchaseConfirmation: return .booking
        case .events, .eventGoals: return .events
        case .explore: return .explore
        case .account, .upcomingBookings(_): return .account
        }
    }

    var navigationTitle: String {
        switch self {
        case .home: return "Home"
        case .notices(_): return "Member Notices"
        case .booking: return "Book"
        case .sessionPacks: return "Session Packs"
        case .purchaseConfirmation: return "Purchase Confirmation"
        case .events: return "Events"
        case .eventGoals: return "Event Goals"
        case .explore: return "Explore"
        case .account: return "Account"
        case .upcomingBookings(_): return "Upcoming Bookings"
        }
    }

    var isContextualTask: Bool {
        switch self {
        case .notices(_), .sessionPacks, .purchaseConfirmation, .eventGoals, .upcomingBookings(_):
            return true
        case .home, .booking, .events, .explore, .account:
            return false
        }
    }

    var requiresAuthentication: Bool {
        switch self {
        case .notices(_), .purchaseConfirmation, .eventGoals, .upcomingBookings(_):
            return true
        case .home, .booking, .sessionPacks, .events, .explore, .account:
            return false
        }
    }

    static func primary(_ destination: XertPrimaryDestination) -> Self {
        switch destination {
        case .home: return .home
        case .booking: return .booking
        case .events: return .events
        case .explore: return .explore
        case .account: return .account
        }
    }

    var restorationValue: String {
        switch self {
        case .home: return "home"
        case .notices(let id): return ["home", "notices", id?.uuidString.lowercased()].compactMap { $0 }.joined(separator: "/")
        case .booking: return "booking"
        case .sessionPacks: return "booking/packs"
        case .purchaseConfirmation: return "booking/purchase-confirmation"
        case .events: return "events"
        case .eventGoals: return "events/goals"
        case .explore: return "explore"
        case .account: return "account"
        case .upcomingBookings(let id): return ["account", "bookings", id?.uuidString.lowercased()].compactMap { $0 }.joined(separator: "/")
        }
    }

    var webURL: URL {
        guard let url = URL(string: "https://\(Self.canonicalWebHost)/open/\(restorationValue)") else {
            preconditionFailure("XERT route generated an invalid canonical web URL")
        }
        return url
    }

    var shareDestination: XertRouteShareDestination? {
        switch self {
        case .home, .booking, .sessionPacks, .events, .explore:
            return XertRouteShareDestination(route: self, isExactTask: true)
        case .notices(_):
            return XertRouteShareDestination(route: .home, isExactTask: false)
        case .purchaseConfirmation:
            return XertRouteShareDestination(route: .sessionPacks, isExactTask: false)
        case .eventGoals:
            return XertRouteShareDestination(route: .events, isExactTask: false)
        case .upcomingBookings(_):
            return XertRouteShareDestination(route: .booking, isExactTask: false)
        case .account:
            return nil
        }
    }

    static func restore(_ value: String) -> Self? {
        route(forPath: "/\(value.trimmingCharacters(in: CharacterSet(charactersIn: "/")))")
    }

    static func route(for url: URL) -> Self? {
        guard url.user == nil, url.password == nil, url.query == nil else { return nil }
        if url.scheme?.lowercased() == "https" {
            return webRoute(for: url)
        }
        guard
            url.scheme?.lowercased() == "xertfitness",
            url.port == nil,
            url.fragment == nil
        else { return nil }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        let routePath = host.isEmpty ? path : "/\(host)\(path)"
        return route(forPath: routePath.isEmpty ? "/" : routePath)
    }

    private static func webRoute(for url: URL) -> Self? {
        guard
            url.host?.lowercased() == canonicalWebHost,
            url.port == nil || url.port == 443
        else { return nil }
        let path = url.path.lowercased()
        let fragment = url.fragment?.lowercased()

        if path.hasPrefix("/open/") {
            guard fragment == nil else { return nil }
            return restore(String(path.dropFirst("/open/".count)))
        }

        switch (path, fragment) {
        case ("/", nil), ("/app", nil): return .home
        case ("/booking", nil): return .booking
        case ("/booking", "packs"): return .sessionPacks
        case ("/events", nil): return .events
        case ("/events", "goals"): return .eventGoals
        case ("/account", nil): return .account
        case ("/account", "bookings"): return .upcomingBookings(nil)
        case ("/account", "notices"): return .notices(nil)
        case ("/about", nil), ("/coaches", nil), ("/contact", nil), ("/training-guide", nil):
            return .explore
        default: return nil
        }
    }

    private static func route(forPath path: String) -> Self? {
        let parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        switch parts.joined(separator: "/") {
        case "", "home": return .home
        case "home/notices": return .notices(nil)
        case "booking": return .booking
        case "booking/packs": return .sessionPacks
        case "booking/purchase-confirmation": return .purchaseConfirmation
        case "events": return .events
        case "events/goals": return .eventGoals
        case "explore": return .explore
        case "account": return .account
        case "account/bookings": return .upcomingBookings(nil)
        default:
            if parts.count == 3, parts[0] == "home", parts[1] == "notices",
               let id = UUID(uuidString: parts[2]) {
                return .notices(id)
            }
            if parts.count == 3, parts[0] == "account", parts[1] == "bookings",
               let id = UUID(uuidString: parts[2]) {
                return .upcomingBookings(id)
            }
            return nil
        }
    }
}

struct XertRouteShareDestination: Equatable {
    let route: XertMemberRoute
    let isExactTask: Bool

    var title: String { route.navigationTitle }

    var accessibilityHint: String {
        isExactTask
            ? "Shares a link to this XERT task"
            : "Shares the public \(title) workspace without private member details"
    }
}

enum XertNavigationSource: String, Equatable {
    case restoration
    case dock
    case dockSwipe
    case history
    case content
    case deepLink
    case pushNotification
    case checkout
    case commandPalette
    case handoff
    case quickAction
    case keyboard
}

enum XertNavigationIntentDisposition: Equatable {
    case open
    case requireAuthentication
}

struct XertNavigationIntent: Equatable {
    let route: XertMemberRoute
    let source: XertNavigationSource

    func disposition(isSignedIn: Bool) -> XertNavigationIntentDisposition {
        route.requiresAuthentication && !isSignedIn ? .requireAuthentication : .open
    }
}

enum XertRouteUserActivity {
    static let activityType = "com.xertfitness.app.member-task"
    private static let routeKey = "xert.memberRoute"
    private static let versionKey = "xert.routeVersion"
    private static let currentVersion = 1

    static func shouldAdvertise(
        route: XertMemberRoute,
        isSignedIn: Bool,
        isPrivacyLocked: Bool
    ) -> Bool {
        guard !isPrivacyLocked else { return false }
        return !route.isContextualTask || isSignedIn
    }

    static func configure(_ activity: NSUserActivity, route: XertMemberRoute) {
        activity.title = "Continue \(route.navigationTitle) in XERT"
        activity.webpageURL = route.webURL
        activity.userInfo = [
            routeKey: route.restorationValue,
            versionKey: currentVersion
        ]
        activity.requiredUserInfoKeys = [routeKey, versionKey]
        activity.isEligibleForHandoff = true
        activity.isEligibleForSearch = !route.isContextualTask
        activity.isEligibleForPrediction = !route.isContextualTask
        activity.isEligibleForPublicIndexing = false
    }

    static func route(from activity: NSUserActivity) -> XertMemberRoute? {
        guard activity.activityType == activityType else { return nil }

        var restoredRoute: XertMemberRoute?
        if let userInfo = activity.userInfo {
            guard
                let version = userInfo[versionKey] as? NSNumber,
                version.intValue == currentVersion,
                let routeValue = userInfo[routeKey] as? String,
                let route = XertMemberRoute.restore(routeValue)
            else { return nil }
            restoredRoute = route
        }

        let webRoute = activity.webpageURL.flatMap { XertMemberRoute.route(for: $0) }

        if let restoredRoute, let webRoute, restoredRoute != webRoute {
            return nil
        }
        return restoredRoute ?? webRoute
    }
}

enum XertNavigationDirection: Equatable {
    case previous
    case next
}

enum XertNavigationPresentation: Equatable {
    case compactDock
    case workspaceRail

    static func resolve(isRegularWidth: Bool) -> Self {
        isRegularWidth ? .workspaceRail : .compactDock
    }
}

struct XertNavigationTransition: Equatable {
    let from: XertPrimaryDestination
    let to: XertPrimaryDestination
    let source: XertNavigationSource
    let sequence: UInt
}

struct XertNavigationWorkspaceSnapshot: Codable, Equatable {
    static let currentVersion = 1
    static let maximumEncodedLength = 4_096
    static let maximumRouteCount = 32

    let version: Int
    let routeValues: [String]
    let forwardRouteValues: [String]?

    init(routes: [XertMemberRoute], forwardRoutes: [XertMemberRoute] = []) {
        version = Self.currentVersion
        routeValues = routes.map(\.restorationValue)
        forwardRouteValues = forwardRoutes.isEmpty ? nil : forwardRoutes.map(\.restorationValue)
    }
}

enum XertNavigationCommandAction: Hashable {
    case destination(XertPrimaryDestination)
    case timeline(Int)
    case activity(XertNavigationActivity)
    case previous
    case next
    case refresh
    case owner
}

enum XertNavigationActivity: Hashable {
    case notices
    case upcomingBookings
    case eventGoals
    case pendingCheckout
}

enum XertNavigationCommandSection: String, CaseIterable, Identifiable {
    case now = "Now"
    case recent = "Workspace History"
    case navigate = "Navigate"
    case system = "System"

    var id: Self { self }
}

struct XertNavigationContext: Equatable {
    let isSignedIn: Bool
    let noticeCount: Int
    let bookingCount: Int
    let creditCount: Int
    let eventGoalCount: Int
    let hasPendingCheckout: Bool

    static let empty = XertNavigationContext(
        isSignedIn: false,
        noticeCount: 0,
        bookingCount: 0,
        creditCount: 0,
        eventGoalCount: 0,
        hasPendingCheckout: false
    )
}

enum XertNavigationStatusKind: Equatable {
    case activity
    case attention
}

struct XertNavigationStatus: Identifiable, Equatable {
    let destination: XertPrimaryDestination
    let kind: XertNavigationStatusKind
    let count: Int?
    let accessibilityLabel: String
    let activity: XertNavigationActivity
    let actionTitle: String
    let shortTitle: String
    let icon: String

    var id: XertPrimaryDestination { destination }
    var badgeText: String {
        guard let count else { return "!" }
        return count > 99 ? "99+" : String(count)
    }
}

struct XertNavigationStatusSnapshot: Equatable {
    private let statuses: [XertNavigationStatus]

    init(context: XertNavigationContext) {
        guard context.isSignedIn else {
            statuses = []
            return
        }

        var current: [XertNavigationStatus] = []
        if context.noticeCount > 0 {
            current.append(Self.activity(
                destination: .home,
                count: context.noticeCount,
                singular: "active member notice",
                plural: "active member notices",
                activity: .notices,
                actionTitle: "Review member notices",
                shortTitle: "Notices",
                icon: "bell.badge"
            ))
        }
        if context.hasPendingCheckout {
            current.append(XertNavigationStatus(
                destination: .booking,
                kind: .attention,
                count: nil,
                accessibilityLabel: "Purchase confirmation needs attention",
                activity: .pendingCheckout,
                actionTitle: "Check purchase confirmation",
                shortTitle: "Purchase",
                icon: "clock.arrow.circlepath"
            ))
        }
        if context.eventGoalCount > 0 {
            current.append(Self.activity(
                destination: .events,
                count: context.eventGoalCount,
                singular: "selected event goal",
                plural: "selected event goals",
                activity: .eventGoals,
                actionTitle: "Review event goals",
                shortTitle: "Goals",
                icon: "target"
            ))
        }
        if context.bookingCount > 0 {
            current.append(Self.activity(
                destination: .account,
                count: context.bookingCount,
                singular: "upcoming booking",
                plural: "upcoming bookings",
                activity: .upcomingBookings,
                actionTitle: "View upcoming bookings",
                shortTitle: "Bookings",
                icon: "calendar.badge.clock"
            ))
        }
        statuses = current
    }

    func status(for destination: XertPrimaryDestination) -> XertNavigationStatus? {
        statuses.first { $0.destination == destination }
    }

    var priorityStatus: XertNavigationStatus? {
        statuses.first { $0.kind == .attention } ?? statuses.first
    }

    private static func activity(
        destination: XertPrimaryDestination,
        count: Int,
        singular: String,
        plural: String,
        activity: XertNavigationActivity,
        actionTitle: String,
        shortTitle: String,
        icon: String
    ) -> XertNavigationStatus {
        let boundedCount = max(1, count)
        return XertNavigationStatus(
            destination: destination,
            kind: .activity,
            count: boundedCount,
            accessibilityLabel: "\(boundedCount) \(boundedCount == 1 ? singular : plural)",
            activity: activity,
            actionTitle: actionTitle,
            shortTitle: shortTitle,
            icon: icon
        )
    }
}

struct XertNavigationCommand: Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let icon: String
    let keywords: [String]
    let section: XertNavigationCommandSection
    let action: XertNavigationCommandAction

    fileprivate var searchIndex: String {
        ([title, subtitle] + keywords).joined(separator: " ").lowercased()
    }
}

struct XertNavigationTimelineItem: Identifiable, Equatable {
    let index: Int
    let route: XertMemberRoute
    let offset: Int

    var id: Int { index }
    var isCurrent: Bool { offset == 0 }
    var distance: Int { abs(offset) }
}

struct XertNavigationWorkspaceOverview: Equatable {
    let currentRoute: XertMemberRoute
    let backCount: Int
    let forwardCount: Int
}

final class XertNavigationCoordinator: ObservableObject {
    @Published private(set) var selection: XertPrimaryDestination
    @Published private(set) var route: XertMemberRoute
    @Published private(set) var routeSequence: UInt = 0
    @Published private(set) var lastTransition: XertNavigationTransition?
    @Published private(set) var reselectionSequence: UInt = 0
    private(set) var routeHistory: [XertMemberRoute]
    private(set) var forwardRouteHistory: [XertMemberRoute] = []

    private let historyLimit: Int
    private var transitionSequence: UInt = 0

    init(initial: XertPrimaryDestination = .home, historyLimit: Int = 12) {
        selection = initial
        route = .primary(initial)
        routeHistory = [.primary(initial)]
        self.historyLimit = min(
            max(2, historyLimit),
            XertNavigationWorkspaceSnapshot.maximumRouteCount
        )
    }

    var history: [XertPrimaryDestination] {
        routeHistory.reduce(into: []) { destinations, route in
            if destinations.last != route.destination {
                destinations.append(route.destination)
            }
        }
    }

    var previousRoute: XertMemberRoute? {
        routeHistory.dropLast().last
    }

    var previousDestination: XertPrimaryDestination? {
        previousRoute?.destination
    }

    var nextRoute: XertMemberRoute? {
        forwardRouteHistory.first
    }

    var timeline: [XertNavigationTimelineItem] {
        let currentIndex = routeHistory.count - 1
        return (routeHistory + forwardRouteHistory).enumerated().map { index, route in
            XertNavigationTimelineItem(
                index: index,
                route: route,
                offset: index - currentIndex
            )
        }
    }

    var workspaceOverview: XertNavigationWorkspaceOverview {
        XertNavigationWorkspaceOverview(
            currentRoute: route,
            backCount: max(0, routeHistory.count - 1),
            forwardCount: forwardRouteHistory.count
        )
    }

    var containsContextualHistory: Bool {
        routeHistory.contains { $0.isContextualTask }
            || forwardRouteHistory.contains { $0.isContextualTask }
    }

    var containsProtectedHistory: Bool {
        routeHistory.contains { $0.requiresAuthentication }
            || forwardRouteHistory.contains { $0.requiresAuthentication }
    }

    var workspaceRestorationValue: String {
        let snapshot = XertNavigationWorkspaceSnapshot(
            routes: routeHistory,
            forwardRoutes: forwardRouteHistory
        )
        guard
            let data = try? JSONEncoder().encode(snapshot),
            let value = String(data: data, encoding: .utf8),
            value.count <= XertNavigationWorkspaceSnapshot.maximumEncodedLength
        else { return "" }
        return value
    }

    func commandPaletteCommands(
        isAdmin: Bool,
        context: XertNavigationContext = .empty
    ) -> [XertNavigationCommand] {
        var commands = XertPrimaryDestination.dockOrder
            .filter { $0 != selection }
            .map { destination in
                XertNavigationCommand(
                    id: "destination-\(destination.rawValue)",
                    title: "Open \(destination.title)",
                    subtitle: commandSubtitle(for: destination, context: context),
                    icon: destination.icon,
                    keywords: commandKeywords(for: destination),
                    section: .navigate,
                    action: .destination(destination)
                )
            }

        commands.insert(contentsOf: activityCommands(context: context), at: 0)
        commands.append(contentsOf: timelineCommands(
            allowsProtectedRoutes: context.isSignedIn
        ))

        commands.append(XertNavigationCommand(
            id: "refresh-\(selection.rawValue)",
            title: "Refresh \(selection.title)",
            subtitle: "Reload the latest XERT member and training data",
            icon: "arrow.clockwise",
            keywords: ["reload", "sync", "update", selection.title],
            section: .system,
            action: .refresh
        ))

        if let previousRoute {
            commands.append(XertNavigationCommand(
                id: "previous-\(previousRoute.restorationValue)",
                title: "Back to \(previousRoute.navigationTitle)",
                subtitle: "Return to the exact task in your workspace history",
                icon: "arrow.uturn.backward",
                keywords: ["back", "previous", "history", previousRoute.navigationTitle],
                section: .system,
                action: .previous
            ))
        }

        if let nextRoute {
            commands.append(XertNavigationCommand(
                id: "next-\(nextRoute.restorationValue)",
                title: "Forward to \(nextRoute.navigationTitle)",
                subtitle: "Return to the next exact task in your workspace history",
                icon: "arrow.uturn.forward",
                keywords: ["forward", "next", "history", nextRoute.navigationTitle],
                section: .system,
                action: .next
            ))
        }

        if isAdmin {
            commands.append(XertNavigationCommand(
                id: "owner-command-centre",
                title: "Owner Command Centre",
                subtitle: "Open protected gym operations and platform controls",
                icon: "waveform.path.ecg.rectangle",
                keywords: ["admin", "business", "operations", "members", "payments"],
                section: .system,
                action: .owner
            ))
        }
        return commands
    }

    static func filteredCommands(
        _ commands: [XertNavigationCommand],
        query: String
    ) -> [XertNavigationCommand] {
        let terms = query
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
        guard !terms.isEmpty else { return commands }

        return commands
            .filter { command in
                terms.allSatisfy { command.searchIndex.contains($0) }
            }
            .sorted { lhs, rhs in
                let lhsStarts = lhs.title.lowercased().hasPrefix(terms[0])
                let rhsStarts = rhs.title.lowercased().hasPrefix(terms[0])
                if lhsStarts != rhsStarts { return lhsStarts }
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
    }

    func restore(rawValue: Int) {
        let destination = XertPrimaryDestination(rawValue: rawValue) ?? .home
        let previous = selection
        selection = destination
        route = .primary(destination)
        routeSequence &+= 1
        routeHistory = [.primary(destination)]
        forwardRouteHistory = []
        if previous == destination {
            lastTransition = nil
        } else {
            recordTransition(from: previous, to: destination, source: .restoration)
        }
    }

    func restore(routeValue: String) {
        let restoredRoute = XertMemberRoute.restore(routeValue) ?? .home
        applyRestoredRoutes([restoredRoute], forwardRoutes: [])
    }

    func restore(
        workspaceValue: String,
        fallbackRouteValue: String,
        allowsProtectedRoutes: Bool = true
    ) {
        guard
            !workspaceValue.isEmpty,
            workspaceValue.count <= XertNavigationWorkspaceSnapshot.maximumEncodedLength,
            let data = workspaceValue.data(using: .utf8),
            let snapshot = try? JSONDecoder().decode(XertNavigationWorkspaceSnapshot.self, from: data),
            snapshot.version == XertNavigationWorkspaceSnapshot.currentVersion,
            !snapshot.routeValues.isEmpty,
            snapshot.routeValues.count + (snapshot.forwardRouteValues?.count ?? 0)
                <= XertNavigationWorkspaceSnapshot.maximumRouteCount
        else {
            restore(routeValue: authorizedFallback(
                fallbackRouteValue,
                allowsProtectedRoutes: allowsProtectedRoutes
            ).restorationValue)
            return
        }

        let restoredRoutes = snapshot.routeValues.compactMap { XertMemberRoute.restore($0) }
        let forwardValues = snapshot.forwardRouteValues ?? []
        let restoredForwardRoutes = forwardValues.compactMap { XertMemberRoute.restore($0) }
        guard
            restoredRoutes.count == snapshot.routeValues.count,
            restoredForwardRoutes.count == forwardValues.count
        else {
            restore(routeValue: authorizedFallback(
                fallbackRouteValue,
                allowsProtectedRoutes: allowsProtectedRoutes
            ).restorationValue)
            return
        }

        let authorizedRoutes = allowsProtectedRoutes
            ? restoredRoutes
            : restoredRoutes.filter { !$0.requiresAuthentication }
        let authorizedForwardRoutes = allowsProtectedRoutes
            ? restoredForwardRoutes
            : restoredForwardRoutes.filter { !$0.requiresAuthentication }
        guard !authorizedRoutes.isEmpty else {
            restore(routeValue: authorizedFallback(
                fallbackRouteValue,
                allowsProtectedRoutes: allowsProtectedRoutes
            ).restorationValue)
            return
        }

        let boundedForwardRoutes = Array(authorizedForwardRoutes.prefix(max(0, historyLimit - 1)))
        let backwardCapacity = max(1, historyLimit - boundedForwardRoutes.count)
        let boundedRoutes = Array(authorizedRoutes.suffix(backwardCapacity))
        applyRestoredRoutes(
            boundedRoutes,
            forwardRoutes: boundedForwardRoutes
        )
    }

    private func authorizedFallback(
        _ routeValue: String,
        allowsProtectedRoutes: Bool
    ) -> XertMemberRoute {
        let route = XertMemberRoute.restore(routeValue) ?? .home
        return allowsProtectedRoutes || !route.requiresAuthentication ? route : .home
    }

    private func applyRestoredRoutes(
        _ restoredRoutes: [XertMemberRoute],
        forwardRoutes: [XertMemberRoute]
    ) {
        guard let restoredRoute = restoredRoutes.last else { return }
        let destination = restoredRoute.destination
        let previous = selection
        selection = destination
        route = restoredRoute
        routeSequence &+= 1
        routeHistory = restoredRoutes
        forwardRouteHistory = forwardRoutes
        if previous == destination {
            lastTransition = nil
        } else {
            recordTransition(from: previous, to: destination, source: .restoration)
        }
    }

    @discardableResult
    func select(_ destination: XertPrimaryDestination, source: XertNavigationSource) -> Bool {
        open(.primary(destination), source: source)
    }

    @discardableResult
    func open(_ targetRoute: XertMemberRoute, source: XertNavigationSource) -> Bool {
        let destination = targetRoute.destination
        if destination == selection, targetRoute == route {
            reselect(destination)
            return false
        }

        let previous = selection
        selection = destination
        route = targetRoute
        routeSequence &+= 1
        forwardRouteHistory = []
        routeHistory.append(targetRoute)
        if routeHistory.count > historyLimit {
            routeHistory.removeFirst(routeHistory.count - historyLimit)
        }
        recordTransition(from: previous, to: destination, source: source)
        return true
    }

    @discardableResult
    func step(_ direction: XertNavigationDirection, source: XertNavigationSource = .dockSwipe) -> Bool {
        guard let index = XertPrimaryDestination.dockOrder.firstIndex(of: selection) else { return false }
        let targetIndex = direction == .next ? index + 1 : index - 1
        guard XertPrimaryDestination.dockOrder.indices.contains(targetIndex) else { return false }
        return select(XertPrimaryDestination.dockOrder[targetIndex], source: source)
    }

    @discardableResult
    func returnToPrevious(source: XertNavigationSource = .history) -> Bool {
        guard routeHistory.count > 1 else { return false }
        let previous = selection
        let departedRoute = routeHistory.removeLast()
        forwardRouteHistory.insert(departedRoute, at: 0)
        guard let targetRoute = routeHistory.last else { return false }
        selection = targetRoute.destination
        route = targetRoute
        routeSequence &+= 1
        recordTransition(from: previous, to: targetRoute.destination, source: source)
        return true
    }

    @discardableResult
    func returnToNext(source: XertNavigationSource = .history) -> Bool {
        guard !forwardRouteHistory.isEmpty else { return false }
        let previous = selection
        let targetRoute = forwardRouteHistory.removeFirst()
        routeHistory.append(targetRoute)
        selection = targetRoute.destination
        route = targetRoute
        routeSequence &+= 1
        recordTransition(from: previous, to: targetRoute.destination, source: source)
        return true
    }

    @discardableResult
    func jump(
        toTimelineIndex index: Int,
        source: XertNavigationSource = .history,
        allowsProtectedRoutes: Bool = true
    ) -> Bool {
        let routes = routeHistory + forwardRouteHistory
        let currentIndex = routeHistory.count - 1
        guard
            routes.indices.contains(index),
            index != currentIndex,
            allowsProtectedRoutes || !routes[index].requiresAuthentication
        else { return false }

        let previous = selection
        let targetRoute = routes[index]
        routeHistory = Array(routes.prefix(index + 1))
        forwardRouteHistory = Array(routes.dropFirst(index + 1))
        selection = targetRoute.destination
        route = targetRoute
        routeSequence &+= 1
        recordTransition(from: previous, to: targetRoute.destination, source: source)
        return true
    }

    func reselect(_ destination: XertPrimaryDestination) {
        guard destination == selection else { return }
        reselectionSequence &+= 1
    }

    private func recordTransition(
        from: XertPrimaryDestination,
        to: XertPrimaryDestination,
        source: XertNavigationSource
    ) {
        transitionSequence &+= 1
        lastTransition = XertNavigationTransition(
            from: from,
            to: to,
            source: source,
            sequence: transitionSequence
        )
    }

    private func activityCommands(context: XertNavigationContext) -> [XertNavigationCommand] {
        guard context.isSignedIn else { return [] }
        var commands: [XertNavigationCommand] = []

        if context.hasPendingCheckout {
            commands.append(XertNavigationCommand(
                id: "activity-pending-checkout",
                title: "Check purchase confirmation",
                subtitle: "Reconcile your pending session-pack purchase",
                icon: "clock.arrow.circlepath",
                keywords: ["purchase", "payment", "stripe", "pending", "credits"],
                section: .now,
                action: .activity(.pendingCheckout)
            ))
        }
        if context.noticeCount > 0 {
            commands.append(XertNavigationCommand(
                id: "activity-notices",
                title: "Review \(context.noticeCount) member \(noun(context.noticeCount, singular: "notice", plural: "notices"))",
                subtitle: "Open current updates from the XERT team",
                icon: "bell.badge",
                keywords: ["announcement", "message", "update", "news"],
                section: .now,
                action: .activity(.notices)
            ))
        }
        if context.bookingCount > 0 {
            commands.append(XertNavigationCommand(
                id: "activity-upcoming-bookings",
                title: "View \(context.bookingCount) upcoming \(noun(context.bookingCount, singular: "booking", plural: "bookings"))",
                subtitle: "Review class details, reminders and cancellations",
                icon: "calendar.badge.clock",
                keywords: ["class", "schedule", "reminder", "cancel"],
                section: .now,
                action: .activity(.upcomingBookings)
            ))
        }
        if context.eventGoalCount > 0 {
            commands.append(XertNavigationCommand(
                id: "activity-event-goals",
                title: "Review \(context.eventGoalCount) event \(noun(context.eventGoalCount, singular: "goal", plural: "goals"))",
                subtitle: "See the competitions you are training toward",
                icon: "target",
                keywords: ["race", "competition", "calendar", "training"],
                section: .now,
                action: .activity(.eventGoals)
            ))
        }
        return commands
    }

    private func timelineCommands(
        limit: Int = 6,
        allowsProtectedRoutes: Bool
    ) -> [XertNavigationCommand] {
        timeline
            .filter { !$0.isCurrent }
            .filter { allowsProtectedRoutes || !$0.route.requiresAuthentication }
            .sorted { lhs, rhs in
                if lhs.distance != rhs.distance { return lhs.distance < rhs.distance }
                return lhs.offset < rhs.offset
            }
            .prefix(max(0, limit))
            .map { item in
                let direction = item.offset < 0 ? "Back" : "Forward"
                let stepLabel = noun(item.distance, singular: "task", plural: "tasks")
                return XertNavigationCommand(
                    id: "timeline-\(item.index)-\(item.route.restorationValue)",
                    title: "\(direction) to \(item.route.navigationTitle)",
                    subtitle: "\(item.distance) \(stepLabel) \(item.offset < 0 ? "back" : "forward") in this workspace",
                    icon: item.offset < 0 ? "arrow.uturn.backward" : "arrow.uturn.forward",
                    keywords: ["recent", "history", "timeline", "workspace", item.route.navigationTitle],
                    section: .recent,
                    action: .timeline(item.index)
                )
            }
    }

    private func commandSubtitle(
        for destination: XertPrimaryDestination,
        context: XertNavigationContext
    ) -> String {
        switch destination {
        case .home:
            return context.noticeCount > 0
                ? "\(context.noticeCount) active \(noun(context.noticeCount, singular: "notice", plural: "notices")) and next training actions"
                : "Member dashboard, notices and next training actions"
        case .booking:
            return context.isSignedIn
                ? "\(context.creditCount) \(noun(context.creditCount, singular: "credit", plural: "credits")) available; classes, packs and PT"
                : "Classes, availability, session packs and PT requests"
        case .events:
            return context.eventGoalCount > 0
                ? "\(context.eventGoalCount) selected \(noun(context.eventGoalCount, singular: "goal", plural: "goals")) in the annual calendar"
                : "Annual event calendar and shared competition goals"
        case .explore: return "Training philosophy, coaches and XERT information"
        case .account:
            return context.bookingCount > 0
                ? "\(context.bookingCount) upcoming \(noun(context.bookingCount, singular: "booking", plural: "bookings")), purchases and security"
                : "Bookings, credits, purchases and account security"
        }
    }

    private func noun(_ count: Int, singular: String, plural: String) -> String {
        count == 1 ? singular : plural
    }

    private func commandKeywords(for destination: XertPrimaryDestination) -> [String] {
        switch destination {
        case .home: return ["dashboard", "notices", "today", "training"]
        case .booking: return ["book", "class", "timetable", "pack", "pt"]
        case .events: return ["calendar", "race", "competition", "goal"]
        case .explore: return ["coaches", "about", "philosophy", "contact"]
        case .account: return ["profile", "credits", "orders", "security"]
        }
    }
}
