import XCTest
@testable import XertFitness

final class ModelsTests: XCTestCase {
    func testPendingCheckoutRoundTripsForTheSameUser() throws {
        let suiteName = "PendingCheckoutTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let userID = UUID()
        let orderIDs: Set<UUID> = [UUID(), UUID()]
        let startedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let pending = PendingCheckout(
            userID: userID,
            baselineCreditTotal: 3,
            baselineOrderIDs: orderIDs,
            startedAt: startedAt
        )

        PendingCheckoutStore.save(pending, defaults: defaults)

        XCTAssertEqual(
            PendingCheckoutStore.load(
                for: userID,
                now: startedAt.addingTimeInterval(60),
                defaults: defaults
            ),
            pending
        )
    }

    func testPendingCheckoutRejectsAnotherUserAndExpires() throws {
        let suiteName = "PendingCheckoutExpiryTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let userID = UUID()
        let startedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let pending = PendingCheckout(
            userID: userID,
            baselineCreditTotal: 0,
            baselineOrderIDs: [],
            startedAt: startedAt
        )

        PendingCheckoutStore.save(pending, defaults: defaults)
        XCTAssertNil(PendingCheckoutStore.load(for: UUID(), now: startedAt, defaults: defaults))
        XCTAssertNil(defaults.data(forKey: PendingCheckoutStore.storageKey))

        PendingCheckoutStore.save(pending, defaults: defaults)
        XCTAssertNil(PendingCheckoutStore.load(
            for: userID,
            now: startedAt.addingTimeInterval(PendingCheckoutStore.maximumAge + 1),
            defaults: defaults
        ))
        XCTAssertNil(defaults.data(forKey: PendingCheckoutStore.storageKey))
    }

    func testPrivacyLockPreferenceRoundTripsAndOnlyLocksSignedInMembers() throws {
        let suiteName = "AppPrivacyLockTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertFalse(AppPrivacyLock.isEnabled(defaults: defaults))
        AppPrivacyLock.setEnabled(true, defaults: defaults)
        XCTAssertTrue(AppPrivacyLock.isEnabled(defaults: defaults))
        XCTAssertTrue(AppPrivacyLock.requiresUnlock(
            isSignedIn: true,
            isEnabled: true,
            isUnlocked: false
        ))
        XCTAssertFalse(AppPrivacyLock.requiresUnlock(
            isSignedIn: false,
            isEnabled: true,
            isUnlocked: false
        ))
        XCTAssertFalse(AppPrivacyLock.requiresUnlock(
            isSignedIn: true,
            isEnabled: true,
            isUnlocked: true
        ))
    }

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

    func testCheckoutReconciliationRequiresBothPaidOrderAndGrantedCredits() {
        let baselineOrderID = UUID()
        let newOrderID = UUID()
        let baselineOrderIDs: Set<UUID> = [baselineOrderID]
        let grantedCredits = [creditBatch(remaining: 4)]
        let paidOrder = order(id: newOrderID, status: "paid")

        XCTAssertFalse(CheckoutReconciliation.hasSettled(
            baselineCreditTotal: 0,
            baselineOrderIDs: baselineOrderIDs,
            credits: [],
            orders: [paidOrder]
        ))
        XCTAssertFalse(CheckoutReconciliation.hasSettled(
            baselineCreditTotal: 0,
            baselineOrderIDs: baselineOrderIDs,
            credits: grantedCredits,
            orders: [order(id: newOrderID, status: "pending")]
        ))
        XCTAssertFalse(CheckoutReconciliation.hasSettled(
            baselineCreditTotal: 0,
            baselineOrderIDs: baselineOrderIDs,
            credits: grantedCredits,
            orders: [order(id: baselineOrderID, status: "paid")]
        ))
        XCTAssertTrue(CheckoutReconciliation.hasSettled(
            baselineCreditTotal: 0,
            baselineOrderIDs: baselineOrderIDs,
            credits: grantedCredits,
            orders: [paidOrder]
        ))
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

    func testMemberStateVersionsRejectWorkFromAnEarlierAccountGeneration() {
        var version = MemberStateVersion()
        let firstSession = version.snapshot

        XCTAssertTrue(version.isCurrent(firstSession))
        version.invalidate()
        XCTAssertFalse(version.isCurrent(firstSession))

        let secondSession = version.snapshot
        XCTAssertTrue(version.isCurrent(secondSession))
        version.invalidate()
        XCTAssertFalse(version.isCurrent(secondSession))
    }

    func testPasswordUpdateRequiresLengthAndMatchingConfirmation() throws {
        let request = try PasswordUpdateRequest(
            password: "strong-new-password",
            confirmation: "strong-new-password"
        )

        XCTAssertEqual(request.password, "strong-new-password")
        XCTAssertThrowsError(try PasswordUpdateRequest(password: "short", confirmation: "short"))
        XCTAssertThrowsError(try PasswordUpdateRequest(password: "strong-password", confirmation: "different-password"))
    }

    func testOnlyAuthenticationResponsesInvalidateTheSavedSession() {
        XCTAssertTrue(APIError(message: "invalid refresh token", statusCode: 400).invalidatesSession)
        XCTAssertTrue(APIError(message: "unauthorized", statusCode: 401).invalidatesSession)
        XCTAssertTrue(APIError(message: "forbidden", statusCode: 403).invalidatesSession)
        XCTAssertFalse(APIError(message: "server unavailable", statusCode: 503).invalidatesSession)
        XCTAssertFalse(APIError(message: "network offline").invalidatesSession)
    }

    func testBookingErrorsAreSafeAndActionableForMembers() {
        XCTAssertTrue(BookingErrorMessage.display(for: "P0001: SESSION_IN_PAST").contains("already started"))
        XCTAssertTrue(BookingErrorMessage.display(for: "P0001: SESSION_NOT_BOOKABLE").contains("not currently open"))
        XCTAssertTrue(BookingErrorMessage.display(for: "P0001: BOOKING_NOT_FOUND").contains("Pull to refresh"))
        XCTAssertEqual(BookingErrorMessage.display(for: "Unexpected service response"), "Unexpected service response")
        XCTAssertEqual(BookingErrorMessage.display(for: ""), "Could not complete the booking.")
    }

    func testNativeRequestsUseBoundedTimeoutsAndMemberFacingNetworkErrors() {
        XCTAssertEqual(AppConfig.apiRequestTimeout, 20)
        XCTAssertTrue(NetworkFailureMessage.display(for: .notConnectedToInternet).contains("offline"))
        XCTAssertTrue(NetworkFailureMessage.display(for: .timedOut).contains("too long"))
        XCTAssertTrue(NetworkFailureMessage.display(for: .cannotFindHost).contains("could not be reached"))
        XCTAssertTrue(NetworkFailureMessage.display(for: .serverCertificateUntrusted).contains("secure connection"))
        XCTAssertTrue(NetworkFailureMessage.display(for: .unknown).contains("try again"))
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

    func testClassReminderPreferenceIsExplicitAndPersistent() throws {
        let suiteName = "ClassReminderPreferenceTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertFalse(ClassReminderPreference.isEnabled(defaults: defaults))
        ClassReminderPreference.setEnabled(true, defaults: defaults)
        XCTAssertTrue(ClassReminderPreference.isEnabled(defaults: defaults))
        ClassReminderPreference.setEnabled(false, defaults: defaults)
        XCTAssertFalse(ClassReminderPreference.isEnabled(defaults: defaults))
    }

    func testBookingCalendarPlannerUsesValidEndOrOneHourFallback() {
        let start = Date(timeIntervalSince1970: 1_800_000_000)
        let explicitEnd = start.addingTimeInterval(45 * 60)

        XCTAssertEqual(
            BookingCalendarPlanner.endDate(for: booking(status: "confirmed", startTime: start, endTime: explicitEnd)),
            explicitEnd
        )
        XCTAssertEqual(
            BookingCalendarPlanner.endDate(for: booking(status: "confirmed", startTime: start)),
            start.addingTimeInterval(60 * 60)
        )
        XCTAssertEqual(
            BookingCalendarPlanner.endDate(for: booking(status: "confirmed", startTime: start, endTime: start)),
            start.addingTimeInterval(60 * 60)
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
        var waitlisted = booking(status: "waitlisted", startTime: now.addingTimeInterval(60 * 60))
        waitlisted.waitlist_position = 2

        XCTAssertTrue(waitlisted.isActiveClassPlace)
        XCTAssertTrue(waitlisted.isCancellable(now: now))
        XCTAssertEqual(waitlisted.stateLabel, "Waitlisted · #2")
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

    func testActiveBookingIndexSurvivesDuplicateSessionRows() {
        let sessionID = UUID()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let oldRequest = booking(
            status: "requested",
            startTime: now.addingTimeInterval(60),
            sessionID: sessionID,
            bookedAt: now.addingTimeInterval(-120)
        )
        let confirmed = booking(
            status: "confirmed",
            startTime: now.addingTimeInterval(60),
            sessionID: sessionID,
            bookedAt: now.addingTimeInterval(-180)
        )
        let cancelled = booking(
            status: "cancelled",
            startTime: now.addingTimeInterval(60),
            sessionID: sessionID,
            bookedAt: now
        )

        let index = BookingItem.activeBySession([oldRequest, confirmed, cancelled])

        XCTAssertEqual(index.count, 1)
        XCTAssertEqual(index[sessionID]?.booking_id, confirmed.booking_id)
    }

    func testActiveBookingIndexKeepsNewestRowWithinTheSameState() {
        let sessionID = UUID()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let older = booking(status: "waitlisted", startTime: now, sessionID: sessionID, bookedAt: now.addingTimeInterval(-60))
        let newer = booking(status: "waitlisted", startTime: now, sessionID: sessionID, bookedAt: now)

        XCTAssertEqual(BookingItem.activeBySession([newer, older])[sessionID]?.booking_id, newer.booking_id)
    }

    func testClassDiscoverySearchesMemberFacingSessionDetails() {
        let sessions = [
            classSession(spotsLeft: 4, title: "Engine Room", classType: "Conditioning", coachName: "Morgan", location: "Outdoor zone"),
            classSession(spotsLeft: 3, title: "Barbell Club", classType: "Strength", coachName: "Taylor", location: "Main floor"),
        ]

        XCTAssertEqual(ClassSessionDiscovery.sessions(from: sessions, search: "morgan").map(\.title), ["Engine Room"])
        XCTAssertEqual(ClassSessionDiscovery.sessions(from: sessions, search: "STRENGTH").map(\.title), ["Barbell Club"])
        XCTAssertEqual(ClassSessionDiscovery.sessions(from: sessions, search: "outdoor").map(\.title), ["Engine Room"])
    }

    func testClassDiscoveryUsesQueenslandTodayAndSevenDayWindows() {
        let now = queenslandDate(2026, 7, 13, 10, 0)
        let sessions = [
            classSession(spotsLeft: 4, title: "Today", startTime: queenslandDate(2026, 7, 13, 18, 0)),
            classSession(spotsLeft: 4, title: "This Week", startTime: queenslandDate(2026, 7, 19, 8, 0)),
            classSession(spotsLeft: 4, title: "Outside Window", startTime: queenslandDate(2026, 7, 20, 0, 0)),
        ]

        XCTAssertEqual(
            ClassSessionDiscovery.sessions(from: sessions, dateWindow: .today, now: now).map(\.title),
            ["Today"]
        )
        XCTAssertEqual(
            ClassSessionDiscovery.sessions(from: sessions, dateWindow: .sevenDays, now: now).map(\.title),
            ["Today", "This Week"]
        )
    }

    func testClassDiscoveryFiltersFitAndSortsDeterministically() {
        let start = queenslandDate(2026, 7, 14, 6, 0)
        let sessions = [
            classSession(spotsLeft: 0, title: "Full", startTime: start, beginnerFriendly: true),
            classSession(spotsLeft: 2, title: "Zulu", startTime: start, beginnerFriendly: false),
            classSession(spotsLeft: nil, title: "Alpha", startTime: start, beginnerFriendly: true),
        ]

        XCTAssertEqual(
            ClassSessionDiscovery.sessions(from: sessions, fit: .spotsAvailable).map(\.title),
            ["Alpha", "Zulu"]
        )
        XCTAssertEqual(
            ClassSessionDiscovery.sessions(from: sessions, fit: .beginnerFriendly).map(\.title),
            ["Alpha", "Full"]
        )
    }

    private func booking(
        status: String,
        startTime: Date,
        endTime: Date? = nil,
        sessionID: UUID = UUID(),
        bookedAt: Date? = nil
    ) -> BookingItem {
        BookingItem(
            booking_id: UUID(),
            status: status,
            booked_at: bookedAt,
            cancelled_at: nil,
            session_id: sessionID,
            title: "Strength",
            class_type: "Strength",
            coach_name: "Coach",
            start_time: startTime,
            end_time: endTime,
            location_zone: nil,
            intensity_level: nil
        )
    }

    private func classSession(
        spotsLeft: Int?,
        title: String = "XERT Strength",
        classType: String = "Strength",
        coachName: String = "Coach",
        location: String? = "Main floor",
        startTime: Date = Date().addingTimeInterval(3_600),
        beginnerFriendly: Bool = true
    ) -> ClassSession {
        ClassSession(
            id: UUID(),
            class_type: classType,
            title: title,
            description: nil,
            coach_name: coachName,
            start_time: startTime,
            end_time: nil,
            duration_minutes: 60,
            capacity: 8,
            location_zone: location,
            beginner_friendly: beginnerFriendly,
            intensity_level: "Moderate",
            booking_mode: "instant_book",
            booked_count: spotsLeft.map { 8 - $0 },
            spots_left: spotsLeft
        )
    }

    private func creditBatch(remaining: Int) -> CreditBatch {
        CreditBatch(id: UUID(), total: remaining, remaining: remaining, expires_at: nil)
    }

    private func order(id: UUID, status: String) -> OrderItem {
        OrderItem(
            id: id,
            status: status,
            amount_cents: 4800,
            currency: "aud",
            created_at: Date(),
            paid_at: status == "paid" ? Date() : nil,
            products: nil
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
