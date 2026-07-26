import Foundation
import UIKit

/// Semantic feedback used across XERT's native interactions. Keeping call sites
/// semantic makes it possible to tune the feel of the whole app in one place.
enum XertHapticFeedback: Hashable {
    case selection
    case lightImpact
    case softImpact
    case mediumImpact
    case success
    case warning
    case error

    var minimumRepeatInterval: TimeInterval {
        switch self {
        case .selection:
            return 0.055
        case .lightImpact, .softImpact, .mediumImpact:
            return 0.09
        case .success, .warning, .error:
            return 0.3
        }
    }
}

enum XertHapticPreference {
    static let preferenceKey = "xert.haptics.enabled"

    static func isEnabled(defaults: UserDefaults = .standard) -> Bool {
        guard defaults.object(forKey: preferenceKey) != nil else { return true }
        return defaults.bool(forKey: preferenceKey)
    }

    static func setEnabled(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: preferenceKey)
    }
}

/// A monotonic, testable gate prevents rapid SwiftUI state changes from
/// producing a noisy stack of feedback pulses.
struct XertHapticGate {
    static let minimumGlobalInterval: TimeInterval = 0.035

    private(set) var lastPlaybackAt: TimeInterval?
    private(set) var lastPlaybackByFeedback: [XertHapticFeedback: TimeInterval] = [:]

    mutating func accepts(_ feedback: XertHapticFeedback, at time: TimeInterval) -> Bool {
        guard time.isFinite else { return false }
        if let lastPlaybackAt {
            guard time >= lastPlaybackAt,
                  time - lastPlaybackAt >= Self.minimumGlobalInterval else {
                return false
            }
        }
        if let previous = lastPlaybackByFeedback[feedback] {
            guard time >= previous,
                  time - previous >= feedback.minimumRepeatInterval else {
                return false
            }
        }

        lastPlaybackAt = time
        lastPlaybackByFeedback[feedback] = time
        return true
    }
}

/// Reuses and primes UIKit feedback generators rather than allocating one for
/// every tap. UIKit automatically respects the device's System Haptics setting.
@MainActor
enum XertHaptics {
    private static let selectionGenerator = UISelectionFeedbackGenerator()
    private static let lightImpactGenerator = UIImpactFeedbackGenerator(style: .light)
    private static let softImpactGenerator = UIImpactFeedbackGenerator(style: .soft)
    private static let mediumImpactGenerator = UIImpactFeedbackGenerator(style: .medium)
    private static let notificationGenerator = UINotificationFeedbackGenerator()
    private static var gate = XertHapticGate()

    static func prepare(_ feedback: XertHapticFeedback) {
        guard XertHapticPreference.isEnabled() else { return }
        switch feedback {
        case .selection:
            selectionGenerator.prepare()
        case .lightImpact:
            lightImpactGenerator.prepare()
        case .softImpact:
            softImpactGenerator.prepare()
        case .mediumImpact:
            mediumImpactGenerator.prepare()
        case .success, .warning, .error:
            notificationGenerator.prepare()
        }
    }

    static func play(
        _ feedback: XertHapticFeedback,
        at time: TimeInterval = ProcessInfo.processInfo.systemUptime
    ) {
        guard XertHapticPreference.isEnabled(), gate.accepts(feedback, at: time) else { return }

        switch feedback {
        case .selection:
            selectionGenerator.selectionChanged()
            selectionGenerator.prepare()
        case .lightImpact:
            lightImpactGenerator.impactOccurred()
            lightImpactGenerator.prepare()
        case .softImpact:
            softImpactGenerator.impactOccurred()
            softImpactGenerator.prepare()
        case .mediumImpact:
            mediumImpactGenerator.impactOccurred()
            mediumImpactGenerator.prepare()
        case .success:
            notificationGenerator.notificationOccurred(.success)
            notificationGenerator.prepare()
        case .warning:
            notificationGenerator.notificationOccurred(.warning)
            notificationGenerator.prepare()
        case .error:
            notificationGenerator.notificationOccurred(.error)
            notificationGenerator.prepare()
        }
    }
}
