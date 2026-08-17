import XCTest
@testable import XertFitness

final class OwnerLaunchGateTests: XCTestCase {
    func testPausedBookingsCanBePreflightReady() {
        let gate = resolve(bookings: false)
        XCTAssertEqual(gate.phase, .preflightReady)
        XCTAssertEqual(gate.completedChecks, XertOwnerLaunchGate.totalChecks)
        XCTAssertNil(gate.nextAction)
    }

    func testOpenBookingsHaveDistinctLiveState() {
        XCTAssertEqual(resolve(bookings: true).phase, .liveReady)
    }

    func testUnavailableEvidenceNeverProducesReady() {
        XCTAssertEqual(resolve(database: nil).phase, .verifying)
    }

    func testUnknownBookingsSwitchFailsClosed() {
        let gate = resolve(bookings: nil)
        XCTAssertEqual(gate.phase, .verifying)
        XCTAssertEqual(gate.completedChecks, XertOwnerLaunchGate.totalChecks - 1)
    }

    func testFailedBookableClassGateBlocksLaunch() {
        let gate = resolve(classes: false)
        XCTAssertEqual(gate.phase, .blocked)
        XCTAssertEqual(gate.nextAction, "Publish a member-bookable class with valid capacity.")
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
        push: Bool? = true,
        classes: Bool? = true,
        bookings: Bool? = false
    ) -> XertOwnerLaunchGate {
        XertOwnerLaunchGate.resolve(
            databaseReady: database,
            pushReady: push,
            bookableClassesReady: classes,
            bookingsEnabled: bookings
        )
    }
}
