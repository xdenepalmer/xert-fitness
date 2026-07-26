import XCTest
@testable import XertFitness

final class MemberLaunchGuideTests: XCTestCase {
    private let bookingID = UUID()

    func testSignedOutMemberStartsWithAccess() {
        XCTAssertEqual(resolve(isSignedIn: false), .signIn)
    }

    func testIncompleteReadinessPrecedesCreditsAndBooking() {
        XCTAssertEqual(
            resolve(onboardingLoaded: true, readinessComplete: false, creditBalanceLoaded: true),
            .completeReadiness
        )
    }

    func testReadyMemberWithoutCreditsChoosesAccess() {
        XCTAssertEqual(resolve(creditBalanceLoaded: true, bookingsLoaded: true), .chooseAccess)
    }

    func testMemberWithCreditsBooksFirstClass() {
        XCTAssertEqual(resolve(creditBalanceLoaded: true, creditTotal: 4, bookingsLoaded: true), .bookFirstClass)
    }

    func testExistingBookingWinsWhenItsCreditHasAlreadyBeenConsumed() {
        XCTAssertEqual(
            resolve(
                creditBalanceLoaded: true,
                bookingsLoaded: true,
                nextActiveBookingID: bookingID,
                classRemindersEnabled: true
            ),
            .activated(bookingID: bookingID)
        )
    }

    func testExistingBookingRemainsActionableWhenOnlyCreditsAreUnavailable() {
        XCTAssertEqual(
            resolve(
                bookingsLoaded: true,
                nextActiveBookingID: bookingID,
                classRemindersEnabled: true,
                creditsUnavailable: true
            ),
            .activated(bookingID: bookingID)
        )
    }

    func testUnavailableLaunchDataOffersRetry() {
        XCTAssertEqual(resolve(onboardingUnavailable: true), .retry)
    }

    func testConfirmedBookingOffersReminderBeforeCompactReadyState() {
        XCTAssertEqual(
            resolve(
                creditBalanceLoaded: true,
                creditTotal: 4,
                bookingsLoaded: true,
                nextActiveBookingID: bookingID,
                nextConfirmedBookingID: bookingID
            ),
            .enableReminder(bookingID: bookingID)
        )
    }

    func testActivatedMemberCollapsesAfterReminderIsEnabled() {
        let state = resolve(
            creditBalanceLoaded: true,
            creditTotal: 4,
            bookingsLoaded: true,
            nextActiveBookingID: bookingID,
            nextConfirmedBookingID: bookingID,
            classRemindersEnabled: true
        )
        XCTAssertEqual(state, .activated(bookingID: bookingID))
        XCTAssertTrue(state.isCompact)
    }

    func testWaitlistedOrRequestedPlaceIsActivatedWithoutReminderPrompt() {
        XCTAssertEqual(
            resolve(
                creditBalanceLoaded: true,
                creditTotal: 2,
                bookingsLoaded: true,
                nextActiveBookingID: bookingID
            ),
            .activated(bookingID: bookingID)
        )
    }

    private func resolve(
        isSignedIn: Bool = true,
        onboardingLoaded: Bool = true,
        readinessComplete: Bool = true,
        creditBalanceLoaded: Bool = false,
        creditTotal: Int = 0,
        bookingsLoaded: Bool = false,
        nextActiveBookingID: UUID? = nil,
        nextConfirmedBookingID: UUID? = nil,
        classRemindersEnabled: Bool = false,
        onboardingUnavailable: Bool = false,
        creditsUnavailable: Bool = false,
        bookingsUnavailable: Bool = false
    ) -> MemberLaunchGuideState {
        MemberLaunchGuideResolver.resolve(
            isSignedIn: isSignedIn,
            onboardingLoaded: onboardingLoaded,
            readinessComplete: readinessComplete,
            creditBalanceLoaded: creditBalanceLoaded,
            creditTotal: creditTotal,
            bookingsLoaded: bookingsLoaded,
            nextActiveBookingID: nextActiveBookingID,
            nextConfirmedBookingID: nextConfirmedBookingID,
            classRemindersEnabled: classRemindersEnabled,
            onboardingUnavailable: onboardingUnavailable,
            creditsUnavailable: creditsUnavailable,
            bookingsUnavailable: bookingsUnavailable
        )
    }
}
