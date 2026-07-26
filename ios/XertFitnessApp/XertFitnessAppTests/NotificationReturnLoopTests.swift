import XCTest
@testable import XertFitness

final class NotificationReturnLoopTests: XCTestCase {
    func testReminderReturnRoutesAreMutuallyExclusiveAndConsumedOnce() throws {
        let suiteName = "XertNotificationReturnLoopTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let bookingID = UUID()

        ClassReminderNavigation.markPending(bookingID: bookingID, defaults: defaults)
        XCTAssertFalse(ClassReminderNavigation.consumePendingBrowseClasses(defaults: defaults))
        XCTAssertEqual(
            ClassReminderNavigation.consumePendingBookingID(defaults: defaults),
            bookingID
        )
        XCTAssertNil(ClassReminderNavigation.consumePendingBookingID(defaults: defaults))

        ClassReminderNavigation.markPending(bookingID: bookingID, defaults: defaults)
        ClassReminderNavigation.markPendingBrowseClasses(defaults: defaults)
        XCTAssertNil(ClassReminderNavigation.consumePendingBookingID(defaults: defaults))
        XCTAssertTrue(ClassReminderNavigation.consumePendingBrowseClasses(defaults: defaults))
        XCTAssertFalse(ClassReminderNavigation.consumePendingBrowseClasses(defaults: defaults))
    }

    func testNotificationCategoryIdentifiersMatchTheAPNsContract() {
        XCTAssertEqual(XertNotificationCategories.memberNotice, "xert.member-notice")
        XCTAssertEqual(XertNotificationCategories.classReminder, "xert.class-reminder")
    }
}
