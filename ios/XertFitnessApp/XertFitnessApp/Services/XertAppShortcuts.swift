import AppIntents
import Foundation

private enum XertAppIntentNavigation {
    @MainActor
    static func open(shortcutType: String) {
        guard XertQuickActionNavigation.markPending(shortcutType: shortcutType) else { return }
        NotificationCenter.default.post(name: .xertOpenQuickAction, object: nil)
    }
}

struct OpenXertBookingIntent: AppIntent {
    static let title: LocalizedStringResource = "Book a XERT class"
    static let description = IntentDescription("Open XERT class discovery and booking.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        XertAppIntentNavigation.open(shortcutType: XertQuickActionNavigation.bookType)
        return .result()
    }
}

struct OpenXertUpcomingBookingsIntent: AppIntent {
    static let title: LocalizedStringResource = "Show XERT bookings"
    static let description = IntentDescription("Open your upcoming XERT class bookings.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        XertAppIntentNavigation.open(shortcutType: XertQuickActionNavigation.bookingsType)
        return .result()
    }
}

struct OpenXertEventsIntent: AppIntent {
    static let title: LocalizedStringResource = "Open the XERT event calendar"
    static let description = IntentDescription("Open XERT's shared competition and fitness calendar.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        XertAppIntentNavigation.open(shortcutType: XertQuickActionNavigation.eventsType)
        return .result()
    }
}

struct XertAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenXertBookingIntent(),
            phrases: ["Book a class with \(.applicationName)"],
            shortTitle: "Book a class",
            systemImageName: "calendar.badge.plus"
        )
        AppShortcut(
            intent: OpenXertUpcomingBookingsIntent(),
            phrases: ["Show my bookings in \(.applicationName)"],
            shortTitle: "Upcoming bookings",
            systemImageName: "list.bullet.rectangle"
        )
        AppShortcut(
            intent: OpenXertEventsIntent(),
            phrases: ["Open the event calendar in \(.applicationName)"],
            shortTitle: "Event calendar",
            systemImageName: "trophy"
        )
    }

    static var shortcutTileColor: ShortcutTileColor { .blue }
}
