import Foundation
import UIKit
import UserNotifications

struct DevicePushToken: Codable, Equatable {
    let value: String
    let environment: String
}

enum MemberPushPreference {
    static let enabledKey = "xert.memberPush.enabled"

    static func isEnabled(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: enabledKey)
    }

    static func setEnabled(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: enabledKey)
    }
}

enum PushDeviceTokenStore {
    static let tokenKey = "xert.memberPush.deviceToken"

    static func load(defaults: UserDefaults = .standard) -> DevicePushToken? {
        guard
            let data = defaults.data(forKey: tokenKey),
            let token = try? JSONDecoder().decode(DevicePushToken.self, from: data)
        else { return nil }
        return token
    }

    static func save(_ token: DevicePushToken, defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(token) else { return }
        defaults.set(data, forKey: tokenKey)
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: tokenKey)
    }
}

/// Retries a failed push unregister after sign-out / account deletion so a
/// departed member's private notices cannot keep targeting this device.
struct PendingPushUnregister: Codable, Equatable {
    let session: AuthSession
    let token: DevicePushToken
}

enum PendingPushUnregisterStore {
    static let storageKey = "xert.memberPush.pendingUnregister"

    static func load(defaults: UserDefaults = .standard) -> PendingPushUnregister? {
        guard
            let data = defaults.data(forKey: storageKey),
            let pending = try? JSONDecoder().decode(PendingPushUnregister.self, from: data)
        else { return nil }
        return pending
    }

    static func save(_ pending: PendingPushUnregister, defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(pending) else { return }
        defaults.set(data, forKey: storageKey)
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: storageKey)
    }
}

enum MemberPushRegistration {
    static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    @MainActor
    static func requestAndRegister() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        let authorized: Bool
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            authorized = true
        case .notDetermined:
            authorized = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) == true
        default:
            authorized = false
        }
        guard authorized else { return false }
        UIApplication.shared.registerForRemoteNotifications()
        return true
    }
}

extension Notification.Name {
    static let xertPushTokenUpdated = Notification.Name("xert.memberPush.tokenUpdated")
    static let xertPushRegistrationFailed = Notification.Name("xert.memberPush.registrationFailed")
    static let xertOpenAnnouncements = Notification.Name("xert.navigation.openAnnouncements")
    static let xertRefreshAnnouncements = Notification.Name("xert.memberPush.refreshAnnouncements")
}
