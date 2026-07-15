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

    static func restore(_ value: String) -> Self? {
        route(forPath: "/\(value.trimmingCharacters(in: CharacterSet(charactersIn: "/")))")
    }

    static func route(for url: URL) -> Self? {
        guard url.scheme?.lowercased() == "xertfitness",
              url.user == nil,
              url.password == nil,
              url.query == nil,
              url.fragment == nil else { return nil }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        let routePath = host.isEmpty ? path : "/\(host)\(path)"
        return route(forPath: routePath.isEmpty ? "/" : routePath)
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

enum XertNavigationCommandAction: Hashable {
    case destination(XertPrimaryDestination)
    case activity(XertNavigationActivity)
    case previous
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

final class XertNavigationCoordinator: ObservableObject {
    @Published private(set) var selection: XertPrimaryDestination
    @Published private(set) var route: XertMemberRoute
    @Published private(set) var routeSequence: UInt = 0
    @Published private(set) var lastTransition: XertNavigationTransition?
    @Published private(set) var reselectionSequence: UInt = 0
    private(set) var history: [XertPrimaryDestination]

    private let historyLimit: Int
    private var transitionSequence: UInt = 0

    init(initial: XertPrimaryDestination = .home, historyLimit: Int = 12) {
        selection = initial
        route = .primary(initial)
        history = [initial]
        self.historyLimit = max(2, historyLimit)
    }

    var previousDestination: XertPrimaryDestination? {
        history.dropLast().last
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

        commands.append(XertNavigationCommand(
            id: "refresh-\(selection.rawValue)",
            title: "Refresh \(selection.title)",
            subtitle: "Reload the latest XERT member and training data",
            icon: "arrow.clockwise",
            keywords: ["reload", "sync", "update", selection.title],
            section: .system,
            action: .refresh
        ))

        if let previousDestination {
            commands.append(XertNavigationCommand(
                id: "previous-\(previousDestination.rawValue)",
                title: "Back to \(previousDestination.title)",
                subtitle: "Return through your workspace history",
                icon: "arrow.uturn.backward",
                keywords: ["back", "previous", "history", previousDestination.title],
                section: .system,
                action: .previous
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
        history = [destination]
        if previous == destination {
            lastTransition = nil
        } else {
            recordTransition(from: previous, to: destination, source: .restoration)
        }
    }

    func restore(routeValue: String) {
        let restoredRoute = XertMemberRoute.restore(routeValue) ?? .home
        let destination = restoredRoute.destination
        let previous = selection
        selection = destination
        route = restoredRoute
        routeSequence &+= 1
        history = [destination]
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
        if destination != previous {
            history.append(destination)
            if history.count > historyLimit {
                history.removeFirst(history.count - historyLimit)
            }
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
        guard history.count > 1 else { return false }
        let previous = selection
        history.removeLast()
        guard let destination = history.last else { return false }
        selection = destination
        route = .primary(destination)
        routeSequence &+= 1
        recordTransition(from: previous, to: destination, source: source)
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
