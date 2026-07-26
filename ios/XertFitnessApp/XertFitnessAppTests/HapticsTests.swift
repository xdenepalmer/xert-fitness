import XCTest
@testable import XertFitness

final class HapticsTests: XCTestCase {
    func testHapticGateRateLimitsRepeatsAndRapidMixedFeedback() {
        var gate = XertHapticGate()

        XCTAssertTrue(gate.accepts(.selection, at: 10))
        XCTAssertFalse(gate.accepts(.selection, at: 10.02))
        XCTAssertFalse(gate.accepts(.lightImpact, at: 10.03))
        XCTAssertTrue(gate.accepts(.lightImpact, at: 10.04))
        XCTAssertTrue(gate.accepts(.selection, at: 10.08))
        XCTAssertFalse(gate.accepts(.selection, at: .nan))
        XCTAssertFalse(gate.accepts(.selection, at: 9))
    }

    func testHapticPreferenceDefaultsOnAndPersistsAnOverride() throws {
        let suiteName = "XertHapticPreferenceTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertTrue(XertHapticPreference.isEnabled(defaults: defaults))
        XertHapticPreference.setEnabled(false, defaults: defaults)
        XCTAssertFalse(XertHapticPreference.isEnabled(defaults: defaults))
        XertHapticPreference.setEnabled(true, defaults: defaults)
        XCTAssertTrue(XertHapticPreference.isEnabled(defaults: defaults))
    }
}
