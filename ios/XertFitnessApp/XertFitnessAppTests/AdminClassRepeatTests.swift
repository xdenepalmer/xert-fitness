import XCTest
@testable import XertFitness

final class AdminClassRepeatTests: XCTestCase {
    func testRepeatPlanBuildsBoundedDraftCopiesAndPreservesDuration() throws {
        let source = classSession(
            start: date("2026-08-01T22:00:00Z"),
            end: date("2026-08-01T23:15:00Z"),
            status: "published",
            publicVisible: true
        )
        let plan = AdminClassRepeatPlan(
            classSession: source,
            intervalDays: 8,
            copyCount: 2,
            mode: .draft
        )

        let drafts = try plan.makeDrafts(
            from: source,
            now: date("2026-07-01T00:00:00Z")
        )

        XCTAssertEqual(drafts.count, 2)
        XCTAssertEqual(drafts.map(\.startTime), [
            date("2026-08-09T22:00:00Z"),
            date("2026-08-17T22:00:00Z")
        ])
        XCTAssertEqual(drafts.map(\.endTime), [
            date("2026-08-09T23:15:00Z"),
            date("2026-08-17T23:15:00Z")
        ])
        XCTAssertTrue(drafts.allSatisfy(\.hasEndTime))
        XCTAssertTrue(drafts.allSatisfy { $0.title == source.title })
        XCTAssertTrue(drafts.allSatisfy { $0.status == "draft" })
        XCTAssertTrue(drafts.allSatisfy { !$0.publicVisible })
    }

    func testPublishedRepeatPreservesPublicVisibilityAndMaximumCount() throws {
        let source = classSession(
            start: date("2026-09-01T08:00:00Z"),
            end: nil,
            status: "published",
            publicVisible: true
        )
        let plan = AdminClassRepeatPlan(
            classSession: source,
            intervalDays: 7,
            copyCount: AdminClassRepeatPlan.maximumCopies,
            mode: .published
        )

        let drafts = try plan.makeDrafts(
            from: source,
            now: date("2026-08-01T00:00:00Z")
        )

        XCTAssertEqual(drafts.count, 26)
        XCTAssertEqual(drafts.first?.startTime, date("2026-09-08T08:00:00Z"))
        XCTAssertEqual(drafts.last?.startTime, date("2027-03-02T08:00:00Z"))
        XCTAssertTrue(drafts.allSatisfy { $0.status == "published" })
        XCTAssertTrue(drafts.allSatisfy(\.publicVisible))
        XCTAssertTrue(drafts.allSatisfy { !$0.hasEndTime })
    }

    func testRepeatPlanRejectsUnsupportedIntervalsCountsAndPastPublishedCopies() {
        let future = classSession(
            start: date("2026-09-01T08:00:00Z"),
            end: nil,
            status: "draft",
            publicVisible: false
        )

        assertInvalid(
            AdminClassRepeatPlan(classSession: future, intervalDays: 3, copyCount: 2, mode: .draft),
            source: future,
            contains: "supported repeat interval"
        )
        assertInvalid(
            AdminClassRepeatPlan(classSession: future, intervalDays: 7, copyCount: 27, mode: .draft),
            source: future,
            contains: "between 1 and 26"
        )

        let past = classSession(
            start: date("2026-01-01T08:00:00Z"),
            end: nil,
            status: "published",
            publicVisible: true
        )
        assertInvalid(
            AdminClassRepeatPlan(classSession: past, intervalDays: 7, copyCount: 1, mode: .published),
            source: past,
            now: date("2026-08-01T00:00:00Z"),
            contains: "must start in the future"
        )
    }

    func testRepeatPlanRequiresAValidSourceRange() {
        let missingStart = classSession(start: nil, end: nil, status: "draft", publicVisible: false)
        assertInvalid(
            AdminClassRepeatPlan(classSession: missingStart),
            source: missingStart,
            contains: "valid start time"
        )

        let invalidEnd = classSession(
            start: date("2026-09-01T09:00:00Z"),
            end: date("2026-09-01T08:00:00Z"),
            status: "draft",
            publicVisible: false
        )
        assertInvalid(
            AdminClassRepeatPlan(classSession: invalidEnd),
            source: invalidEnd,
            contains: "invalid end time"
        )
    }

    private func assertInvalid(
        _ plan: AdminClassRepeatPlan,
        source: AdminClassSession,
        now: Date = Date.distantPast,
        contains expectedText: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertThrowsError(
            try plan.makeDrafts(from: source, now: now),
            file: file,
            line: line
        ) { error in
            XCTAssertTrue(
                error.localizedDescription.localizedCaseInsensitiveContains(expectedText),
                "Unexpected repeat error: \(error.localizedDescription)",
                file: file,
                line: line
            )
        }
    }

    private func classSession(
        start: Date?,
        end: Date?,
        status: String,
        publicVisible: Bool
    ) -> AdminClassSession {
        AdminClassSession(
            id: UUID(),
            class_type: "XERT Strength",
            title: "Strength + Engine",
            description: "Main training block",
            coach_name: "Byron",
            start_time: start,
            end_time: end,
            duration_minutes: 75,
            capacity: 12,
            location_zone: "Main floor",
            beginner_friendly: false,
            intensity_level: "High",
            status: status,
            public_visible: publicVisible,
            booking_mode: "request_to_book",
            notes: "Set up rowers"
        )
    }

    private func date(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }
}
