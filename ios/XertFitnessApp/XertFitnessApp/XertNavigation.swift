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
