import Foundation
import UIKit
import UserNotifications

enum ClassReminderNotification {
    static let identifierPrefix = "xert.booking."
    static let bookingIDKey = "booking_id"

    static func bookingID(identifier: String, userInfo: [AnyHashable: Any]) -> UUID? {
        guard
            identifier.hasPrefix(identifierPrefix),
            let rawBookingID = userInfo[bookingIDKey] as? String,
            let bookingID = UUID(uuidString: rawBookingID),
            UUID(uuidString: String(identifier.dropFirst(identifierPrefix.count))) == bookingID
        else {
            return nil
        }
        return bookingID
    }
}

enum ClassReminderNavigation {
    static let pendingBookingIDKey = "xert.navigation.pendingBookingID"

    static func markPending(bookingID: UUID, defaults: UserDefaults = .standard) {
        defaults.set(bookingID.uuidString, forKey: pendingBookingIDKey)
    }

    static func consumePendingBookingID(defaults: UserDefaults = .standard) -> UUID? {
        guard
            let rawBookingID = defaults.string(forKey: pendingBookingIDKey),
            let bookingID = UUID(uuidString: rawBookingID)
        else {
            defaults.removeObject(forKey: pendingBookingIDKey)
            return nil
        }
        defaults.removeObject(forKey: pendingBookingIDKey)
        return bookingID
    }
}

extension Notification.Name {
    static let xertOpenBookings = Notification.Name("xert.navigation.openBookings")
}

final class XertAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let request = response.notification.request
        if let bookingID = ClassReminderNotification.bookingID(
            identifier: request.identifier,
            userInfo: request.content.userInfo
        ) {
            ClassReminderNavigation.markPending(bookingID: bookingID)
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .xertOpenBookings, object: bookingID)
            }
        }
        completionHandler()
    }
}
