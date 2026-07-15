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
        guard url.scheme?.lowercased() == "xertfitness",
              url.user == nil,
              url.password == nil else { return nil }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        let route = host.isEmpty ? path : "/\(host)\(path)"
        return destination(for: route.isEmpty ? "/" : route)
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
    case previous
    case refresh
    case owner
}

struct XertNavigationCommand: Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let icon: String
    let keywords: [String]
    let action: XertNavigationCommandAction

    fileprivate var searchIndex: String {
        ([title, subtitle] + keywords).joined(separator: " ").lowercased()
    }
}

final class XertNavigationCoordinator: ObservableObject {
    @Published private(set) var selection: XertPrimaryDestination
    @Published private(set) var lastTransition: XertNavigationTransition?
    @Published private(set) var reselectionSequence: UInt = 0
    private(set) var history: [XertPrimaryDestination]

    private let historyLimit: Int
    private var transitionSequence: UInt = 0

    init(initial: XertPrimaryDestination = .home, historyLimit: Int = 12) {
        selection = initial
        history = [initial]
        self.historyLimit = max(2, historyLimit)
    }

    var previousDestination: XertPrimaryDestination? {
        history.dropLast().last
    }

    func commandPaletteCommands(isAdmin: Bool) -> [XertNavigationCommand] {
        var commands = XertPrimaryDestination.dockOrder
            .filter { $0 != selection }
            .map { destination in
                XertNavigationCommand(
                    id: "destination-\(destination.rawValue)",
                    title: "Open \(destination.title)",
                    subtitle: commandSubtitle(for: destination),
                    icon: destination.icon,
                    keywords: commandKeywords(for: destination),
                    action: .destination(destination)
                )
            }

        commands.append(XertNavigationCommand(
            id: "refresh-\(selection.rawValue)",
            title: "Refresh \(selection.title)",
            subtitle: "Reload the latest XERT member and training data",
            icon: "arrow.clockwise",
            keywords: ["reload", "sync", "update", selection.title],
            action: .refresh
        ))

        if let previousDestination {
            commands.append(XertNavigationCommand(
                id: "previous-\(previousDestination.rawValue)",
                title: "Back to \(previousDestination.title)",
                subtitle: "Return through your workspace history",
                icon: "arrow.uturn.backward",
                keywords: ["back", "previous", "history", previousDestination.title],
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
        history = [destination]
        if previous == destination {
            lastTransition = nil
        } else {
            recordTransition(from: previous, to: destination, source: .restoration)
        }
    }

    @discardableResult
    func select(_ destination: XertPrimaryDestination, source: XertNavigationSource) -> Bool {
        guard destination != selection else {
            reselect(destination)
            return false
        }

        let previous = selection
        selection = destination
        history.append(destination)
        if history.count > historyLimit {
            history.removeFirst(history.count - historyLimit)
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

    private func commandSubtitle(for destination: XertPrimaryDestination) -> String {
        switch destination {
        case .home: return "Member dashboard, notices and next training actions"
        case .booking: return "Classes, availability, session packs and PT requests"
        case .events: return "Annual event calendar and shared competition goals"
        case .explore: return "Training philosophy, coaches and XERT information"
        case .account: return "Bookings, credits, purchases and account security"
        }
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
