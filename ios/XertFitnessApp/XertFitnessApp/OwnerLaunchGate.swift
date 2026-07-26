import Foundation

enum XertOwnerLaunchGatePhase: Equatable {
    case verifying
    case blocked
    case preflightReady
    case liveReady
}

struct XertOwnerLaunchGate: Equatable {
    static let totalChecks = 5

    let phase: XertOwnerLaunchGatePhase
    let completedChecks: Int
    let nextAction: String?

    var title: String {
        switch phase {
        case .verifying: return "Verification incomplete"
        case .blocked: return "Hold launch"
        case .preflightReady: return "Ready to open"
        case .liveReady: return "Launch path is live"
        }
    }

    var detail: String {
        switch phase {
        case .verifying:
            return "Do not open bookings or payments until every required check is current."
        case .blocked:
            return "Resolve the next required gate before opening the member path."
        case .preflightReady:
            return "Automated checks passed with both launch switches safely paused. Complete the pre-open smoke test."
        case .liveReady:
            return "Automated checks passed with bookings and payments enabled. Complete the controlled live member smoke test."
        }
    }

    static func resolve(
        databaseReady: Bool?,
        stripeReady: Bool?,
        activeLinkedPacksReady: Bool?,
        bookableClassesReady: Bool?,
        bookingsEnabled: Bool?,
        paymentsEnabled: Bool?
    ) -> XertOwnerLaunchGate {
        let required: [(ready: Bool?, action: String)] = [
            (databaseReady, "Repair the database release contract."),
            (stripeReady, "Resolve Stripe checkout health."),
            (activeLinkedPacksReady, "Activate a Stripe-linked session pack."),
            (bookableClassesReady, "Publish a member-bookable class with valid capacity."),
        ]
        let controlsReady = bookingsEnabled != nil
            && paymentsEnabled != nil
            && bookingsEnabled == paymentsEnabled
        let completed = required.compactMap(\.ready).filter { $0 }.count + (controlsReady ? 1 : 0)

        guard required.allSatisfy({ $0.ready != nil }),
              let bookingsEnabled, let paymentsEnabled else {
            return XertOwnerLaunchGate(
                phase: .verifying,
                completedChecks: completed,
                nextAction: "Refresh unavailable launch checks."
            )
        }
        if let blocker = required.first(where: { $0.ready == false }) {
            return XertOwnerLaunchGate(phase: .blocked, completedChecks: completed, nextAction: blocker.action)
        }
        guard bookingsEnabled == paymentsEnabled else {
            return XertOwnerLaunchGate(
                phase: .blocked,
                completedChecks: completed,
                nextAction: "Pause both launch switches for preflight or enable both for the controlled live launch."
            )
        }
        return XertOwnerLaunchGate(
            phase: bookingsEnabled ? .liveReady : .preflightReady,
            completedChecks: Self.totalChecks,
            nextAction: nil
        )
    }
}
