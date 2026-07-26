import XCTest
@testable import XertFitness

final class OwnerLaunchGateTests: XCTestCase {
    func testPausedSwitchesCanBePreflightReady() {
        XCTAssertEqual(resolve(bookings: false, payments: false).phase, .preflightReady)
    }

    func testEnabledSwitchesHaveDistinctLiveState() {
        XCTAssertEqual(resolve(bookings: true, payments: true).phase, .liveReady)
    }

    func testBookingsCanOpenBeforeGuardedPayments() {
        let gate = resolve(bookings: true, payments: false)
        XCTAssertEqual(gate.phase, .bookingsOpen)
        XCTAssertEqual(gate.completedChecks, XertOwnerLaunchGate.totalChecks)
        XCTAssertEqual(
            gate.nextAction,
            "Complete the booking smoke test, then activate session-pack payments."
        )
    }

    func testPaymentsWithoutBookingsBlockLaunch() {
        let gate = resolve(bookings: false, payments: true)
        XCTAssertEqual(gate.phase, .blocked)
        XCTAssertEqual(gate.completedChecks, XertOwnerLaunchGate.totalChecks - 1)
    }

    func testUnavailableEvidenceNeverProducesReady() {
        XCTAssertEqual(resolve(database: nil).phase, .verifying)
    }

    func testFailedBookableClassGateBlocksLaunch() {
        XCTAssertEqual(resolve(classes: false).phase, .blocked)
    }

    func testProductionPushFailureBlocksLaunch() {
        let gate = resolve(push: false)
        XCTAssertEqual(gate.phase, .blocked)
        XCTAssertEqual(gate.completedChecks, XertOwnerLaunchGate.totalChecks - 1)
        XCTAssertEqual(gate.nextAction, "Complete a successful production owner push test.")
    }

    func testUnavailablePushEvidenceNeverProducesReady() {
        XCTAssertEqual(resolve(push: nil).phase, .verifying)
    }

    private func resolve(
        database: Bool? = true,
        stripe: Bool? = true,
        push: Bool? = true,
        packs: Bool? = true,
        classes: Bool? = true,
        bookings: Bool? = false,
        payments: Bool? = false
    ) -> XertOwnerLaunchGate {
        XertOwnerLaunchGate.resolve(
            databaseReady: database,
            stripeReady: stripe,
            pushReady: push,
            activeLinkedPacksReady: packs,
            bookableClassesReady: classes,
            bookingsEnabled: bookings,
            paymentsEnabled: payments
        )
    }
}
