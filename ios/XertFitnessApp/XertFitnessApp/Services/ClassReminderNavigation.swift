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

enum AnnouncementPushNavigation {
    static let pendingAnnouncementIDKey = "xert.navigation.pendingAnnouncementID"

    static func markPending(announcementID: UUID, defaults: UserDefaults = .standard) {
        defaults.set(announcementID.uuidString, forKey: pendingAnnouncementIDKey)
    }

    static func consumePendingAnnouncementID(defaults: UserDefaults = .standard) -> UUID? {
        guard
            let rawAnnouncementID = defaults.string(forKey: pendingAnnouncementIDKey),
            let announcementID = UUID(uuidString: rawAnnouncementID)
        else {
            defaults.removeObject(forKey: pendingAnnouncementIDKey)
            return nil
        }
        defaults.removeObject(forKey: pendingAnnouncementIDKey)
        return announcementID
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

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        if let shortcutItem = options.shortcutItem {
            XertQuickActionNavigation.markPending(shortcutType: shortcutItem.type)
        }
        let configuration = UISceneConfiguration(
            name: "XERT Member Workspace",
            sessionRole: connectingSceneSession.role
        )
        configuration.delegateClass = XertSceneDelegate.self
        return configuration
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let value = deviceToken.map { String(format: "%02x", $0) }.joined()
        let token = DevicePushToken(value: value, environment: MemberPushRegistration.environment)
        PushDeviceTokenStore.save(token)
        NotificationCenter.default.post(name: .xertPushTokenUpdated, object: token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError _: Error) {
        NotificationCenter.default.post(name: .xertPushRegistrationFailed, object: nil)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if notification.request.content.userInfo["announcement_id"] != nil {
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .xertRefreshAnnouncements, object: nil)
            }
        }
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if response.notification.request.content.userInfo["announcement_id"] != nil,
           let rawAnnouncementID = response.notification.request.content.userInfo["announcement_id"] as? String,
           let announcementID = UUID(uuidString: rawAnnouncementID) {
            AnnouncementPushNavigation.markPending(announcementID: announcementID)
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .xertOpenAnnouncements, object: announcementID)
            }
            completionHandler()
            return
        }
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

final class XertSceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let handled = XertQuickActionNavigation.markPending(shortcutType: shortcutItem.type)
        if handled {
            NotificationCenter.default.post(name: .xertOpenQuickAction, object: nil)
        }
        completionHandler(handled)
    }
}
