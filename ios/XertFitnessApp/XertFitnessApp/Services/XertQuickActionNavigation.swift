import Foundation

enum XertQuickActionNavigation {
    static let bookType = "com.xertfitness.app.quick.book"
    static let bookingsType = "com.xertfitness.app.quick.bookings"
    static let eventsType = "com.xertfitness.app.quick.events"
    static let pendingShortcutTypeKey = "xert.navigation.pendingShortcutType"

    static func route(for shortcutType: String) -> XertMemberRoute? {
        switch shortcutType {
        case bookType: return .booking
        case bookingsType: return .upcomingBookings(nil)
        case eventsType: return .events
        default: return nil
        }
    }

    @discardableResult
    static func markPending(
        shortcutType: String,
        defaults: UserDefaults = .standard
    ) -> Bool {
        guard route(for: shortcutType) != nil else { return false }
        defaults.set(shortcutType, forKey: pendingShortcutTypeKey)
        return true
    }

    static func consumePendingRoute(defaults: UserDefaults = .standard) -> XertMemberRoute? {
        guard let shortcutType = defaults.string(forKey: pendingShortcutTypeKey) else { return nil }
        defaults.removeObject(forKey: pendingShortcutTypeKey)
        return route(for: shortcutType)
    }

    static func clearPending(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: pendingShortcutTypeKey)
    }
}

extension Notification.Name {
    static let xertOpenQuickAction = Notification.Name("xert.navigation.openQuickAction")
}
