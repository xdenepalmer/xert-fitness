import XCTest
@testable import XertFitness

final class OwnerLaunchGateTests: XCTestCase {
    func testPausedSwitchesCanBePreflightReady() {
        XCTAssertEqual(resolve(bookings: false, payments: false).phase, .preflightReady)
    }

    func testEnabledSwitchesHaveDistinctLiveState() {
        XCTAssertEqual(resolve(bookings: true, payments: true).phase, .liveReady)
    }

    func testMixedSwitchesBlockLaunch() {
        XCTAssertEqual(resolve(bookings: true, payments: false).phase, .blocked)
    }

    func testUnavailableEvidenceNeverProducesReady() {
        XCTAssertEqual(resolve(database: nil).phase, .verifying)
    }

    func testFailedBookableClassGateBlocksLaunch() {
        XCTAssertEqual(resolve(classes: false).phase, .blocked)
    }

    private func resolve(
        database: Bool? = true,
        stripe: Bool? = true,
        packs: Bool? = true,
        classes: Bool? = true,
        bookings: Bool? = false,
        payments: Bool? = false
    ) -> XertOwnerLaunchGate {
        XertOwnerLaunchGate.resolve(
            databaseReady: database,
            stripeReady: stripe,
            activeLinkedPacksReady: packs,
            bookableClassesReady: classes,
            bookingsEnabled: bookings,
            paymentsEnabled: payments
        )
    }
}
