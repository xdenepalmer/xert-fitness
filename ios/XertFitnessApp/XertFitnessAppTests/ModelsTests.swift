import XCTest
@testable import XertFitness

final class ModelsTests: XCTestCase {
    func testProductDecodesTheWebSessionCountColumn() throws {
        let data = """
        {
          "slug": "starter-4",
          "name": "4 Class Starter Pack",
          "description": "A training block",
          "sessions_count": 4,
          "price_cents": 4800,
          "active": true,
          "sort_order": 2
        }
        """.data(using: .utf8)!

        let product = try JSONDecoder().decode(Product.self, from: data)

        XCTAssertEqual(product.sessionsCount, 4)
        XCTAssertEqual(product.price_cents, 4800)
    }

    func testCreditBatchDecodesTheDatabaseTotalColumn() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "total": 10,
          "remaining": 7,
          "expires_at": null
        }
        """.data(using: .utf8)!

        let batch = try JSONDecoder().decode(CreditBatch.self, from: data)

        XCTAssertEqual(batch.total, 10)
        XCTAssertEqual(batch.remaining, 7)
    }

    func testMemberProfileDecodesTheWebProfileColumns() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "full_name": "Alex Runner",
          "phone": "0400 123 456",
          "email": "alex@example.com"
        }
        """.data(using: .utf8)!

        let profile = try JSONDecoder().decode(MemberProfile.self, from: data)

        XCTAssertEqual(profile.full_name, "Alex Runner")
        XCTAssertEqual(profile.phone, "0400 123 456")
    }

    func testMemberProfileDoesNotRequireTheAdminEmailColumn() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "full_name": "Alex Runner",
          "phone": "0400 123 456"
        }
        """.data(using: .utf8)!

        let profile = try JSONDecoder().decode(MemberProfile.self, from: data)

        XCTAssertNil(profile.email)
    }

    func testPasswordRecoveryUsesTheWebResetRoute() {
        XCTAssertEqual(AppConfig.webURL(path: "reset-password").path, "/reset-password")
    }

    func testFallbackCalendarCarriesTheFull2026Program() {
        XCTAssertEqual(XertEventCalendar.fallback.count, 20)
        XCTAssertEqual(XertEventCalendar.fallback.first?.name, "Gold Coast Marathon")
        XCTAssertEqual(XertEventCalendar.fallback.last?.name, "XERT Team Competition")
    }

    func testEventStatesUseQueenslandDatesAndSafeLinks() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "name": "Future Event",
          "event_date": "2999-01-01",
          "end_date": null,
          "url": "https://events.example.com/register"
        }
        """.data(using: .utf8)!

        let futureEvent = try JSONDecoder().decode(EventItem.self, from: data)

        XCTAssertFalse(futureEvent.isComplete)
        XCTAssertEqual(futureEvent.externalURL?.host, "events.example.com")

        let completedEvent = EventItem(
            id: nil,
            name: "Completed Event",
            category: nil,
            event_date: "2020-01-01",
            end_date: nil,
            location: nil,
            region: nil,
            url: "javascript:alert('no')",
            published: true,
            sort_order: nil
        )

        XCTAssertTrue(completedEvent.isComplete)
        XCTAssertNil(completedEvent.externalURL)
    }

    func testEventGoalDecodesTheSupabaseEventID() throws {
        let data = """
        { "event_id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60" }
        """.data(using: .utf8)!

        let goal = try JSONDecoder().decode(EventGoal.self, from: data)

        XCTAssertEqual(goal.event_id.uuidString, "C5747DAD-2E89-4D55-AD63-5732D8D67A60")
    }

    func testClassReminderPlannerOnlySchedulesFutureConfirmedBookings() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let confirmed = booking(status: "confirmed", startTime: now.addingTimeInterval(4 * 60 * 60))
        let requested = booking(status: "requested", startTime: now.addingTimeInterval(4 * 60 * 60))
        let tooSoon = booking(status: "confirmed", startTime: now.addingTimeInterval(90 * 60))

        XCTAssertEqual(
            ClassReminderPlanner.reminderDate(for: confirmed.start_time, now: now),
            now.addingTimeInterval(2 * 60 * 60)
        )
        XCTAssertEqual(
            ClassReminderPlanner.reminderBookings(from: [confirmed, requested, tooSoon], now: now).map(\.booking_id),
            [confirmed.booking_id]
        )
    }

    func testBookingCancellationCreditPolicyMatchesServerRules() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        XCTAssertTrue(BookingCancellationPolicy.returnsCredit(
            status: "requested",
            startTime: now.addingTimeInterval(30 * 60),
            now: now
        ))
        XCTAssertTrue(BookingCancellationPolicy.returnsCredit(
            status: "confirmed",
            startTime: now.addingTimeInterval(13 * 60 * 60),
            now: now
        ))
        XCTAssertFalse(BookingCancellationPolicy.returnsCredit(
            status: "confirmed",
            startTime: now.addingTimeInterval(12 * 60 * 60),
            now: now
        ))
    }

    private func booking(status: String, startTime: Date) -> BookingItem {
        BookingItem(
            booking_id: UUID(),
            status: status,
            booked_at: nil,
            cancelled_at: nil,
            session_id: UUID(),
            title: "Strength",
            class_type: "Strength",
            coach_name: "Coach",
            start_time: startTime,
            end_time: nil,
            location_zone: nil,
            intensity_level: nil
        )
    }
}
