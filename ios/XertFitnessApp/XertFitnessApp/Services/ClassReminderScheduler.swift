import Foundation
import UserNotifications

enum ClassReminderPreference {
    static let key = "xert.classRemindersEnabled"

    static func isEnabled(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: key)
    }

    static func setEnabled(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: key)
    }
}

enum ClassReminderPlanner {
    static let leadTime: TimeInterval = 2 * 60 * 60

    static func reminderDate(for startTime: Date, now: Date = Date()) -> Date? {
        let reminderDate = startTime.addingTimeInterval(-leadTime)
        return reminderDate > now ? reminderDate : nil
    }

    static func reminderBookings(from bookings: [BookingItem], now: Date = Date()) -> [BookingItem] {
        bookings.filter {
            $0.status == "confirmed" && reminderDate(for: $0.start_time, now: now) != nil
        }
    }
}

actor ClassReminderScheduler {
    static let shared = ClassReminderScheduler()

    private let center = UNUserNotificationCenter.current()
    private let identifierPrefix = "xert.booking."

    func sync(bookings: [BookingItem], now: Date = Date()) async {
        let reminderBookings = ClassReminderPlanner.reminderBookings(from: bookings, now: now)
        await clearManagedReminders()

        guard !reminderBookings.isEmpty else { return }
        guard await isAuthorizedForReminders() else { return }

        for booking in reminderBookings {
            guard let reminderDate = ClassReminderPlanner.reminderDate(for: booking.start_time, now: now) else {
                continue
            }

            let content = UNMutableNotificationContent()
            content.title = "XERT class reminder"
            content.body = "\(booking.title) starts in 2 hours."
            content.sound = .default
            content.userInfo = ["booking_id": booking.booking_id.uuidString]

            let trigger = UNTimeIntervalNotificationTrigger(
                timeInterval: reminderDate.timeIntervalSince(now),
                repeats: false
            )
            let request = UNNotificationRequest(
                identifier: identifier(for: booking),
                content: content,
                trigger: trigger
            )
            try? await center.add(request)
        }
    }

    func clearAll() async {
        await clearManagedReminders()
    }

    func requestAuthorizationAndSync(bookings: [BookingItem], now: Date = Date()) async -> Bool {
        let settings = await center.notificationSettings()
        let authorized: Bool
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            authorized = true
        case .notDetermined:
            authorized = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        case .denied:
            authorized = false
        @unknown default:
            authorized = false
        }
        guard authorized else { return false }
        await sync(bookings: bookings, now: now)
        return true
    }

    private func isAuthorizedForReminders() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .notDetermined, .denied:
            return false
        @unknown default:
            return false
        }
    }

    private func clearManagedReminders() async {
        let identifiers = await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { $0.hasPrefix(identifierPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }

    private func identifier(for booking: BookingItem) -> String {
        "\(identifierPrefix)\(booking.booking_id.uuidString)"
    }
}
