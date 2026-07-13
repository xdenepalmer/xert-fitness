import XCTest
@testable import XertFitness

final class ModelsTests: XCTestCase {
    func testMemberSignUpNormalizesIdentityAndEncodesProfileMetadata() throws {
        let request = try MemberSignUpRequest(
            fullName: "  Alex Runner  ",
            email: " ALEX@Example.COM ",
            phone: " 0400 111 222 ",
            password: "strong-pass",
            confirmation: "strong-pass",
            acceptedTerms: true
        )

        XCTAssertEqual(request.email, "alex@example.com")
        XCTAssertEqual(request.data.full_name, "Alex Runner")
        XCTAssertEqual(request.data.phone, "0400 111 222")

        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any]
        let metadata = object?["data"] as? [String: Any]
        XCTAssertEqual(metadata?["full_name"] as? String, "Alex Runner")
        XCTAssertEqual(metadata?["phone"] as? String, "0400 111 222")
    }

    func testMemberSignUpRequiresValidMatchingCredentialsAndLegalConsent() {
        XCTAssertThrowsError(try signUp(fullName: "", acceptedTerms: true))
        XCTAssertThrowsError(try signUp(email: "invalid", acceptedTerms: true))
        XCTAssertThrowsError(try signUp(password: "short", confirmation: "short", acceptedTerms: true))
        XCTAssertThrowsError(try signUp(confirmation: "different", acceptedTerms: true))
        XCTAssertThrowsError(try signUp(acceptedTerms: false))
    }

    func testDataSourceLabelsAreMemberFacingAndComplete() {
        XCTAssertEqual(Set(XertDataSource.allCases).count, 8)
        XCTAssertEqual(XertDataSource.sessions.displayName, "class timetable")
        XCTAssertEqual(XertDataSource.eventGoals.displayName, "training goals")
        XCTAssertEqual(XertDataSource.orders.displayName, "purchase history")
    }

    func testPrivateSessionRequestNormalizesRequiredAndOptionalFields() throws {
        let request = try PrivateSessionRequest(
            fullName: "  Alex Runner  ",
            email: " ALEX@EXAMPLE.COM ",
            phone: " 0400 123 456 ",
            sessionType: "60-minute PT session",
            preferredDay: "Flexible",
            notes: "   "
        )

        XCTAssertEqual(request.full_name, "Alex Runner")
        XCTAssertEqual(request.email, "alex@example.com")
        XCTAssertEqual(request.phone, "0400 123 456")
        XCTAssertEqual(request.preferred_day, "Flexible")
        XCTAssertNil(request.notes)
        XCTAssertTrue(request.consent_to_contact)
        XCTAssertEqual(request.status, "requested")
    }

    func testPrivateSessionRequestRejectsInvalidRequiredFields() {
        XCTAssertThrowsError(try PrivateSessionRequest(
            fullName: "Alex",
            email: "invalid",
            phone: "0400 123 456",
            sessionType: "Intro assessment"
        ))
        XCTAssertThrowsError(try PrivateSessionRequest(
            fullName: "Alex",
            email: "alex@example.com",
            phone: "",
            sessionType: "Intro assessment"
        ))
    }

    func testClassInterestRequestPreservesSessionAndNormalizesContactDetails() throws {
        let sessionID = UUID()
        let request = try ClassInterestRequest(
            sessionID: sessionID,
            fullName: "  Alex Runner ",
            email: " ALEX@EXAMPLE.COM ",
            phone: " 0400 123 456 ",
            trainingLevel: "Some gym experience",
            notes: "  Knee history  "
        )

        XCTAssertEqual(request.class_session_id, sessionID)
        XCTAssertEqual(request.full_name, "Alex Runner")
        XCTAssertEqual(request.email, "alex@example.com")
        XCTAssertEqual(request.phone, "0400 123 456")
        XCTAssertEqual(request.training_level, "Some gym experience")
        XCTAssertEqual(request.notes, "Knee history")
        XCTAssertTrue(request.consent_to_contact)
        XCTAssertEqual(request.status, "requested")
    }

    func testClassInterestRequestRejectsMissingContactDetails() {
        XCTAssertThrowsError(try ClassInterestRequest(
            sessionID: UUID(),
            fullName: "",
            email: "alex@example.com",
            phone: "0400 123 456"
        ))
    }

    func testPublicDataCacheRoundTripsAndRejectsExpiredData() throws {
        let suiteName = "PublicDataCacheTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let savedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let product = Product(
            slug: "starter-4",
            name: "Starter Pack",
            description: nil,
            sessionsCount: 4,
            price_cents: 4800,
            active: true,
            sort_order: 1
        )
        let snapshot = PublicDataSnapshot(
            savedAt: savedAt,
            products: [product],
            sessions: [],
            events: []
        )

        PublicDataCache.save(snapshot, defaults: defaults)

        XCTAssertEqual(
            PublicDataCache.load(defaults: defaults, now: savedAt.addingTimeInterval(60)),
            snapshot
        )
        XCTAssertNil(PublicDataCache.load(
            defaults: defaults,
            now: savedAt.addingTimeInterval(PublicDataCache.maximumAge + 1)
        ))
    }

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

    func testClassSessionOnlyReportsFullAtZeroOrNegativeAvailability() {
        XCTAssertTrue(classSession(spotsLeft: 0).isFull)
        XCTAssertTrue(classSession(spotsLeft: -1).isFull)
        XCTAssertFalse(classSession(spotsLeft: 1).isFull)
        XCTAssertFalse(classSession(spotsLeft: nil).isFull)
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

    func testOrderDecodesPurchaseHistoryAndFormatsMemberFacingValues() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "status": "paid",
          "amount_cents": 4800,
          "currency": "aud",
          "created_at": "2026-07-12T01:00:00Z",
          "paid_at": "2026-07-12T01:01:00Z",
          "products": { "name": "4 Class Starter Pack" }
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let order = try decoder.decode(OrderItem.self, from: data)

        XCTAssertEqual(order.products?.name, "4 Class Starter Pack")
        XCTAssertTrue(order.displayAmount.contains("48"))
        XCTAssertEqual(order.displayStatus, "Paid")
        XCTAssertEqual(order.activityDate, try XCTUnwrap(order.paid_at))
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

    func testAuthSessionRefreshesBeforeExpiryButNotWhileComfortablyValid() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let expiring = authSession(expiresAt: Int(now.timeIntervalSince1970) + 90)
        let valid = authSession(expiresAt: Int(now.timeIntervalSince1970) + 600)
        let unknown = authSession(expiresAt: nil)

        XCTAssertTrue(expiring.needsRefresh(now: now))
        XCTAssertFalse(valid.needsRefresh(now: now))
        XCTAssertFalse(unknown.needsRefresh(now: now))
    }

    func testWebBaseURLAcceptsAHostnameAndRejectsUnsafeSchemes() {
        XCTAssertEqual(
            AppConfig.normalizedWebBaseURL("xert-fitness.vercel.app")?.absoluteString,
            "https://xert-fitness.vercel.app"
        )
        XCTAssertNil(AppConfig.normalizedWebBaseURL("javascript:alert('no')"))
    }

    func testWebRoutesReplaceAnAccidentalBasePath() {
        let base = AppConfig.normalizedWebBaseURL("https://xert-fitness.vercel.app/preview-token")!

        XCTAssertEqual(AppConfig.webURL(baseURL: base, path: "/reset-password/").absoluteString, "https://xert-fitness.vercel.app/reset-password")
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

    func testEventLifecycleUsesDeterministicQueenslandDayBoundaries() {
        let event = calendarEvent(
            name: "Two Day Event",
            start: "2026-07-04",
            end: "2026-07-05"
        )

        XCTAssertEqual(event.lifecycle(on: queenslandDate(2026, 7, 3, 23, 59)), .upcoming)
        XCTAssertEqual(event.lifecycle(on: queenslandDate(2026, 7, 4, 12, 0)), .happeningNow)
        XCTAssertEqual(event.lifecycle(on: queenslandDate(2026, 7, 5, 23, 59)), .happeningNow)
        XCTAssertEqual(event.lifecycle(on: queenslandDate(2026, 7, 6, 0, 1)), .complete)
    }

    func testCalendarSectionsGroupMonthsAndRespectAdminOrder() {
        let referenceDate = queenslandDate(2026, 7, 1, 12, 0)
        let events = [
            calendarEvent(name: "Second", start: "2026-07-13", order: 2),
            calendarEvent(name: "August", start: "2026-08-02", order: 3),
            calendarEvent(name: "First", start: "2026-07-13", order: 1),
            calendarEvent(name: "Past", start: "2026-06-01", order: 0)
        ]

        let upcoming = XertEventCalendar.sections(
            from: events,
            includeCompleted: false,
            referenceDate: referenceDate
        )

        XCTAssertEqual(upcoming.map(\.title), ["July 2026", "August 2026"])
        XCTAssertEqual(upcoming[0].events.map(\.name), ["First", "Second"])
        XCTAssertEqual(
            XertEventCalendar.sections(from: events, includeCompleted: true, referenceDate: referenceDate).first?.title,
            "June 2026"
        )
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
        XCTAssertFalse(BookingCancellationPolicy.returnsCredit(
            status: "waitlisted",
            startTime: now.addingTimeInterval(24 * 60 * 60),
            now: now
        ))
    }

    func testWaitlistedBookingRemainsVisibleAndCanBeWithdrawn() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let waitlisted = booking(status: "waitlisted", startTime: now.addingTimeInterval(60 * 60))

        XCTAssertTrue(waitlisted.isActiveClassPlace)
        XCTAssertTrue(waitlisted.isCancellable(now: now))
        XCTAssertEqual(waitlisted.stateLabel, "Waitlisted")
    }

    func testBookingTimelineSectionsAreMutuallyExclusive() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let bookings = [
            booking(status: "requested", startTime: now.addingTimeInterval(60)),
            booking(status: "waitlisted", startTime: now.addingTimeInterval(60)),
            booking(status: "confirmed", startTime: now.addingTimeInterval(60)),
            booking(status: "confirmed", startTime: now.addingTimeInterval(-60)),
            booking(status: "cancelled", startTime: now.addingTimeInterval(60))
        ]
        let timeline = BookingTimeline(bookings: bookings, now: now)

        XCTAssertEqual(timeline.pending.count, 2)
        XCTAssertEqual(timeline.upcoming.count, 1)
        XCTAssertEqual(timeline.history.count, 2)
        XCTAssertEqual(timeline.pending.count + timeline.upcoming.count + timeline.history.count, bookings.count)
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

    private func classSession(spotsLeft: Int?) -> ClassSession {
        ClassSession(
            id: UUID(),
            class_type: "Strength",
            title: "XERT Strength",
            description: nil,
            coach_name: "Coach",
            start_time: Date().addingTimeInterval(3_600),
            end_time: nil,
            duration_minutes: 60,
            capacity: 8,
            location_zone: "Main floor",
            beginner_friendly: true,
            intensity_level: "Moderate",
            booking_mode: "instant_book",
            booked_count: spotsLeft.map { 8 - $0 },
            spots_left: spotsLeft
        )
    }

    private func signUp(
        fullName: String = "Alex Runner",
        email: String = "alex@example.com",
        phone: String = "",
        password: String = "strong-pass",
        confirmation: String = "strong-pass",
        acceptedTerms: Bool
    ) throws -> MemberSignUpRequest {
        try MemberSignUpRequest(
            fullName: fullName,
            email: email,
            phone: phone,
            password: password,
            confirmation: confirmation,
            acceptedTerms: acceptedTerms
        )
    }

    private func authSession(expiresAt: Int?) -> AuthSession {
        AuthSession(
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_in: 3600,
            expires_at: expiresAt,
            token_type: "bearer",
            user: nil
        )
    }

    private func calendarEvent(
        name: String,
        start: String?,
        end: String? = nil,
        order: Int = 0
    ) -> EventItem {
        EventItem(
            id: UUID(),
            name: name,
            category: "run",
            event_date: start,
            end_date: end,
            location: "Queensland",
            region: "South East Queensland",
            url: nil,
            published: true,
            sort_order: order
        )
    }

    private func queenslandDate(
        _ year: Int,
        _ month: Int,
        _ day: Int,
        _ hour: Int,
        _ minute: Int
    ) -> Date {
        DateComponents(
            calendar: EventItem.calendar,
            timeZone: EventItem.calendar.timeZone,
            year: year,
            month: month,
            day: day,
            hour: hour,
            minute: minute
        ).date!
    }
}
