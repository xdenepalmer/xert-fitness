import Foundation
import LocalAuthentication

struct DeviceAuthenticationSupport: Equatable {
    let isAvailable: Bool
    let methodName: String
    let unavailableMessage: String?
}

enum AppPrivacyLock {
    static let preferenceKey = "xert.privacyLock.enabled"

    static func isEnabled(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: preferenceKey)
    }

    static func setEnabled(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: preferenceKey)
    }

    static func requiresUnlock(isSignedIn: Bool, isEnabled: Bool, isUnlocked: Bool) -> Bool {
        isSignedIn && isEnabled && !isUnlocked
    }

    static func requiresOwnerProtection(isAdmin: Bool, isEnabled: Bool) -> Bool {
        isAdmin && !isEnabled
    }
}

enum DeviceAuthenticator {
    static func support(context: LAContext = LAContext()) -> DeviceAuthenticationSupport {
        var authenticationError: NSError?
        let isAvailable = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authenticationError)

        var biometricError: NSError?
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &biometricError)
        let methodName: String
        if context.biometryType == .faceID {
            methodName = "Face ID"
        } else if context.biometryType == .touchID {
            methodName = "Touch ID"
        } else {
            methodName = "device passcode"
        }

        return DeviceAuthenticationSupport(
            isAvailable: isAvailable,
            methodName: methodName,
            unavailableMessage: isAvailable
                ? nil
                : authenticationError?.localizedDescription ?? "Set a device passcode to use the privacy lock."
        )
    }

    static func authenticate(reason: String) async throws {
        let context = LAContext()
        context.localizedCancelTitle = "Keep Locked"
        var authenticationError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authenticationError) else {
            throw PrivacyLockError(
                message: authenticationError?.localizedDescription
                    ?? "Device authentication is not available."
            )
        }

        do {
            try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch let error as LAError {
            throw PrivacyLockError(message: memberMessage(for: error))
        } catch {
            throw PrivacyLockError(message: "XERT could not verify your identity. Please try again.")
        }
    }

    private static func memberMessage(for error: LAError) -> String {
        switch error.code {
        case .userCancel, .appCancel, .systemCancel:
            return "Authentication was cancelled. XERT remains locked."
        case .authenticationFailed:
            return "Your identity could not be verified. Please try again."
        case .biometryLockout:
            return "Biometrics are temporarily locked. Use your device passcode to continue."
        case .passcodeNotSet:
            return "Set a device passcode before enabling the XERT privacy lock."
        case .biometryNotAvailable, .biometryNotEnrolled:
            return "Biometric authentication is not configured on this device."
        default:
            return error.localizedDescription
        }
    }
}

struct PrivacyLockError: LocalizedError, Equatable {
    let message: String

    var errorDescription: String? { message }
}
