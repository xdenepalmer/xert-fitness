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

enum ClassReminderSyncState: Equatable {
    case off
    case scheduled(Int)
    case noEligibleBookings
    case permissionDenied
    case failed(scheduled: Int)

    var scheduledCount: Int {
        switch self {
        case .scheduled(let count), .failed(let count): return count
        case .off, .noEligibleBookings, .permissionDenied: return 0
        }
    }
}

enum ClassReminderPlanner {
    /// Leave capacity for other app notifications under iOS's pending-request
    /// limit while keeping the member's nearest confirmed classes actionable.
    static let maximumScheduledReminders = 32

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
        Array(bookings.filter {
            $0.status == "confirmed"
                && reminderDate(for: $0.start_time, leadTime: leadTime, now: now) != nil
        }
        .sorted { $0.start_time < $1.start_time }
        .prefix(maximumScheduledReminders))
    }
}

actor ClassReminderScheduler {
    static let shared = ClassReminderScheduler()

    private let center = UNUserNotificationCenter.current()

    @discardableResult
    func sync(
        bookings: [BookingItem],
        leadTime: ClassReminderLeadTime = .twoHours,
        now: Date = Date()
    ) async -> ClassReminderSyncState {
        let reminderBookings = ClassReminderPlanner.reminderBookings(
            from: bookings,
            leadTime: leadTime,
            now: now
        )
        await clearManagedReminders()

        guard await isAuthorizedForReminders() else { return .permissionDenied }
        guard !reminderBookings.isEmpty else { return .noEligibleBookings }

        var scheduledCount = 0
        var failedCount = 0

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
            content.categoryIdentifier = XertNotificationCategories.classReminder
            content.threadIdentifier = "xert-class-reminders"
            content.userInfo = [ClassReminderNotification.bookingIDKey: booking.booking_id.uuidString]

            // Absolute calendar fire time survives resync and clock-relative drift
            // better than an interval trigger counted from "now".
            var fireComponents = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute, .second],
                from: reminderDate
            )
            fireComponents.calendar = Calendar.current
            let trigger = UNCalendarNotificationTrigger(
                dateMatching: fireComponents,
                repeats: false
            )
            let request = UNNotificationRequest(
                identifier: identifier(for: booking),
                content: content,
                trigger: trigger
            )
            do {
                try await center.add(request)
                scheduledCount += 1
            } catch {
                failedCount += 1
            }
        }

        return failedCount == 0 ? .scheduled(scheduledCount) : .failed(scheduled: scheduledCount)
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
    ) async -> ClassReminderSyncState {
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
        guard authorized else { return .permissionDenied }
        return await sync(bookings: bookings, leadTime: leadTime, now: now)
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
