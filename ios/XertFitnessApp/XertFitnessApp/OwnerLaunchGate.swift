import Foundation

enum XertOwnerLaunchGatePhase: Equatable {
    case verifying
    case blocked
    case preflightReady
    case liveReady
}

struct XertOwnerLaunchGate: Equatable {
    static let totalChecks = 4

    let phase: XertOwnerLaunchGatePhase
    let completedChecks: Int
    let nextAction: String?

    var title: String {
        switch phase {
        case .verifying: return "Verification incomplete"
        case .blocked: return "Hold launch"
        case .preflightReady: return "Ready to open"
        case .liveReady: return "Member bookings are live"
        }
    }

    var detail: String {
        switch phase {
        case .verifying:
            return "Do not open member bookings until every required check is current."
        case .blocked:
            return "Resolve the next required gate before opening the member path."
        case .preflightReady:
            return "Automated checks passed while member bookings stay paused. Complete the pre-open smoke test, then open bookings."
        case .liveReady:
            return "Automated checks passed with member bookings open. Payments and memberships are handled in Fitbox."
        }
    }

    static func resolve(
        databaseReady: Bool?,
        pushReady: Bool?,
        bookableClassesReady: Bool?,
        bookingsEnabled: Bool?
    ) -> XertOwnerLaunchGate {
        let required: [(ready: Bool?, action: String)] = [
            (databaseReady, "Repair the database release contract."),
            (pushReady, "Complete a successful production owner push test."),
            (bookableClassesReady, "Publish a member-bookable class with valid capacity."),
        ]
        // The bookings switch is a deliberate decision, not a readiness check:
        // the gate only needs current evidence of which way it is set.
        let controlsReady = bookingsEnabled != nil
        let completed = required.compactMap(\.ready).filter { $0 }.count + (controlsReady ? 1 : 0)

        guard required.allSatisfy({ $0.ready != nil }), let bookingsEnabled else {
            return XertOwnerLaunchGate(
                phase: .verifying,
                completedChecks: completed,
                nextAction: "Refresh unavailable launch checks."
            )
        }
        if let blocker = required.first(where: { $0.ready == false }) {
            return XertOwnerLaunchGate(phase: .blocked, completedChecks: completed, nextAction: blocker.action)
        }
        return XertOwnerLaunchGate(
            phase: bookingsEnabled ? .liveReady : .preflightReady,
            completedChecks: Self.totalChecks,
            nextAction: nil
        )
    }
}
