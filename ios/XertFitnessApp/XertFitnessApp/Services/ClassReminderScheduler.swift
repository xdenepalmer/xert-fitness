import Foundation
import UserNotifications

enum ClassReminderPreference {
    static let key = "xert.classRemindersEnabled"
    static let leadTimeKey = "xert.classReminderLeadTime"

    static func isEnabled(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: key)
    }

    static func setEnabled(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: key)
    }

    static func leadTime(defaults: UserDefaults = .standard) -> ClassReminderLeadTime {
        guard let rawValue = defaults.string(forKey: leadTimeKey),
              let leadTime = ClassReminderLeadTime(rawValue: rawValue) else {
            return .twoHours
        }
        return leadTime
    }

    static func setLeadTime(_ leadTime: ClassReminderLeadTime, defaults: UserDefaults = .standard) {
        defaults.set(leadTime.rawValue, forKey: leadTimeKey)
    }
}

enum ClassReminderLeadTime: String, CaseIterable, Identifiable, Hashable {
    case oneHour
    case twoHours
    case oneDay

    var id: String { rawValue }

    var timeInterval: TimeInterval {
        switch self {
        case .oneHour: return 60 * 60
        case .twoHours: return 2 * 60 * 60
        case .oneDay: return 24 * 60 * 60
        }
    }

    var label: String {
        switch self {
        case .oneHour: return "1 hour before"
        case .twoHours: return "2 hours before"
        case .oneDay: return "1 day before"
        }
    }

    var notificationLead: String {
        switch self {
        case .oneHour: return "1 hour"
        case .twoHours: return "2 hours"
        case .oneDay: return "1 day"
        }
    }
}

enum ClassReminderPlanner {
    static func reminderDate(
        for startTime: Date,
        leadTime: ClassReminderLeadTime = .twoHours,
        now: Date = Date()
    ) -> Date? {
        let reminderDate = startTime.addingTimeInterval(-leadTime.timeInterval)
        return reminderDate > now ? reminderDate : nil
    }

    static func reminderBookings(
        from bookings: [BookingItem],
        leadTime: ClassReminderLeadTime = .twoHours,
        now: Date = Date()
    ) -> [BookingItem] {
        bookings.filter {
            $0.status == "confirmed"
                && reminderDate(for: $0.start_time, leadTime: leadTime, now: now) != nil
        }
    }
}

actor ClassReminderScheduler {
    static let shared = ClassReminderScheduler()

    private let center = UNUserNotificationCenter.current()

    func sync(
        bookings: [BookingItem],
        leadTime: ClassReminderLeadTime = .twoHours,
        now: Date = Date()
    ) async {
        let reminderBookings = ClassReminderPlanner.reminderBookings(
            from: bookings,
            leadTime: leadTime,
            now: now
        )
        await clearManagedReminders()

        guard !reminderBookings.isEmpty else { return }
        guard await isAuthorizedForReminders() else { return }

        for booking in reminderBookings {
            guard let reminderDate = ClassReminderPlanner.reminderDate(
                for: booking.start_time,
                leadTime: leadTime,
                now: now
            ) else {
                continue
            }

            let content = UNMutableNotificationContent()
            content.title = "XERT class reminder"
            content.body = "\(booking.title) starts in \(leadTime.notificationLead)."
            content.sound = .default
            content.userInfo = [ClassReminderNotification.bookingIDKey: booking.booking_id.uuidString]

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

    func remove(bookingID: UUID) {
        center.removePendingNotificationRequests(
            withIdentifiers: ["\(ClassReminderNotification.identifierPrefix)\(bookingID.uuidString)"]
        )
    }

    func requestAuthorizationAndSync(
        bookings: [BookingItem],
        leadTime: ClassReminderLeadTime = .twoHours,
        now: Date = Date()
    ) async -> Bool {
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
        await sync(bookings: bookings, leadTime: leadTime, now: now)
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
            .filter { $0.hasPrefix(ClassReminderNotification.identifierPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }

    private func identifier(for booking: BookingItem) -> String {
        "\(ClassReminderNotification.identifierPrefix)\(booking.booking_id.uuidString)"
    }
}
