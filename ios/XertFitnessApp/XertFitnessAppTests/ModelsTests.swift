import XCTest
@testable import XertFitness

private struct LegacyPendingCheckout: Encodable {
    let userID: UUID
    let baselineCreditTotal: Int
    let baselineOrderIDs: Set<UUID>
    let startedAt: Date
}

final class ModelsTests: XCTestCase {
    func testPrimaryNavigationDeepLinksUseTheTypedRouteContract() throws {
        XCTAssertEqual(XertPrimaryDestination.destination(for: try XCTUnwrap(URL(string: "xertfitness://booking"))), .booking)
        XCTAssertEqual(XertPrimaryDestination.destination(for: try XCTUnwrap(URL(string: "xertfitness://events"))), .events)
        XCTAssertEqual(XertPrimaryDestination.destination(for: try XCTUnwrap(URL(string: "xertfitness:///explore"))), .explore)
        XCTAssertEqual(XertPrimaryDestination.destination(for: try XCTUnwrap(URL(string: "xertfitness://account"))), .account)
        XCTAssertEqual(XertPrimaryDestination.destination(for: try XCTUnwrap(URL(string: "https://xert-fitness.vercel.app/booking"))), .booking)
        XCTAssertNil(XertPrimaryDestination.destination(for: try XCTUnwrap(URL(string: "xertfitness://checkout?status=success"))))
    }

    func testMemberSubroutesRoundTripAndRejectAmbiguousDeepLinks() throws {
        let announcementID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000021"))
        let bookingID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000022"))
        let sessionID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000027"))
        let routes: [XertMemberRoute] = [
            .home, .notices(nil), .notices(announcementID), .booking, .classSession(sessionID), .sessionPacks,
            .purchaseConfirmation, .events, .eventGoals, .explore, .account,
            .upcomingBookings(nil), .upcomingBookings(bookingID),
        ]

        for route in routes {
            XCTAssertEqual(XertMemberRoute.restore(route.restorationValue), route)
        }
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://booking/packs"))), .sessionPacks)
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://booking/classes/\(sessionID.uuidString)"))), .classSession(sessionID))
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://events/goals"))), .eventGoals)
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://account/bookings/\(bookingID.uuidString)"))), .upcomingBookings(bookingID))
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://home/notices/\(announcementID.uuidString)"))), .notices(announcementID))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://account/bookings/not-a-uuid"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://booking/packs?source=unknown"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://user:pass@booking/packs"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://booking:444/packs"))))
    }

    func testOwnerWorkspaceRoutesAreTypedBoundedAndStrictlyScoped() throws {
        XCTAssertEqual(XertOwnerWorkspace.allCases.count, 21)
        for workspace in XertOwnerWorkspace.allCases {
            let route = XertOwnerRoute(workspace: workspace)
            XCTAssertEqual(XertOwnerRoute.restore(route.restorationValue), route)
            XCTAssertEqual(
                XertOwnerRoute.route(for: try XCTUnwrap(URL(
                    string: "xertfitness://owner/\(workspace.rawValue)"
                ))),
                route
            )
            XCTAssertEqual(
                XertOwnerRoute.route(for: try XCTUnwrap(URL(
                    string: "https://xert-fitness.vercel.app/open/owner/\(workspace.rawValue)"
                ))),
                route
            )
        }

        XCTAssertNil(XertOwnerRoute.restore("owner/not-a-workspace"))
        XCTAssertNil(XertOwnerRoute.route(for: try XCTUnwrap(URL(
            string: "xertfitness://owner/finance?member=private"
        ))))
        XCTAssertNil(XertOwnerRoute.route(for: try XCTUnwrap(URL(
            string: "https://example.com/open/owner/finance"
        ))))
        XCTAssertNil(XertOwnerRoute.route(for: try XCTUnwrap(URL(
            string: "https://xert-fitness.vercel.app/open/owner/finance#order"
        ))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(
            string: "https://xert-fitness.vercel.app/open/owner/finance"
        ))))

        let intent = XertOwnerNavigationIntent(
            route: XertOwnerRoute(workspace: .finance)
        )
        XCTAssertEqual(intent.disposition(
            isSignedIn: false,
            isProfileLoaded: false,
            isAdmin: false
        ), .requireAuthentication)
        XCTAssertEqual(intent.disposition(
            isSignedIn: true,
            isProfileLoaded: false,
            isAdmin: false
        ), .waitForProfile)
        XCTAssertEqual(intent.disposition(
            isSignedIn: true,
            isProfileLoaded: true,
            isAdmin: true
        ), .open)
        XCTAssertEqual(intent.disposition(
            isSignedIn: true,
            isProfileLoaded: true,
            isAdmin: false
        ), .deny)
    }

    func testOwnerRecordRoutesRoundTripAndRemainWorkspaceBound() throws {
        let memberID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000081"))
        let orderID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000082"))
        let eventID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000083"))
        let productID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000084"))
        let classID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000085"))
        let announcementID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000086"))
        let ptRequestID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000087"))
        let bookingRequestID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000088"))
        let routes = [
            XertOwnerRoute(task: .member(memberID)),
            XertOwnerRoute(task: .classSession(classID)),
            XertOwnerRoute(task: .classSetup(classID)),
            XertOwnerRoute(task: .order(orderID)),
            XertOwnerRoute(task: .product(productID)),
            XertOwnerRoute(task: .event(eventID)),
            XertOwnerRoute(task: .announcement(announcementID)),
            XertOwnerRoute(task: .ptRequest(ptRequestID)),
            XertOwnerRoute(task: .bookingRequest(.member, bookingRequestID)),
            XertOwnerRoute(task: .bookingRequest(.enquiry, bookingRequestID)),
        ]

        for route in routes {
            XCTAssertEqual(XertOwnerRoute.restore(route.restorationValue), route)
            XCTAssertEqual(
                XertOwnerRoute.route(for: try XCTUnwrap(URL(
                    string: "xertfitness://\(route.restorationValue)"
                ))),
                route
            )
            XCTAssertEqual(
                XertOwnerRoute.route(for: try XCTUnwrap(URL(
                    string: "https://xert-fitness.vercel.app/open/\(route.restorationValue)"
                ))),
                route
            )
            XCTAssertEqual(route.task?.workspace, route.workspace)
        }

        XCTAssertNil(XertOwnerRoute.restore("owner/finance/member/\(memberID.uuidString)"))
        XCTAssertNil(XertOwnerRoute.restore("owner/timetable/class/\(classID.uuidString)"))
        XCTAssertNil(XertOwnerRoute.restore("owner/classdesk/class-setup/\(classID.uuidString)"))
        XCTAssertEqual(
            XertOwnerRoute.restore("owner/classdesk/class/\(classID.uuidString)"),
            XertOwnerRoute(task: .classSession(classID))
        )
        XCTAssertEqual(
            XertOwnerRoute.restore("owner/timetable/class-setup/\(classID.uuidString)"),
            XertOwnerRoute(task: .classSetup(classID))
        )
        XCTAssertNil(XertOwnerRoute.restore("owner/members/order/\(orderID.uuidString)"))
        XCTAssertNil(XertOwnerRoute.restore("owner/orders/product/\(productID.uuidString)"))
        XCTAssertNil(XertOwnerRoute.restore("owner/events/announcement/\(announcementID.uuidString)"))
        XCTAssertNil(XertOwnerRoute.restore("owner/members/pt-request/\(ptRequestID.uuidString)"))
        XCTAssertNil(XertOwnerRoute.restore("owner/members/member-booking-request/\(bookingRequestID.uuidString)"))
        XCTAssertNil(XertOwnerRoute.restore("owner/bookingrequests/pt-request/\(ptRequestID.uuidString)"))
        XCTAssertEqual(
            XertOwnerRoute.restore("owner/bookingrequests/member-booking-request/\(bookingRequestID.uuidString)"),
            XertOwnerRoute(task: .bookingRequest(.member, bookingRequestID))
        )
        XCTAssertEqual(
            XertOwnerRoute.restore("owner/bookingrequests/booking-enquiry/\(bookingRequestID.uuidString)"),
            XertOwnerRoute(task: .bookingRequest(.enquiry, bookingRequestID))
        )
        XCTAssertEqual(
            XertOwnerRoute.restore("owner/notices/announcement/\(announcementID.uuidString)"),
            XertOwnerRoute(task: .announcement(announcementID))
        )
        XCTAssertEqual(
            XertOwnerRoute.restore("owner/finance/order/\(orderID.uuidString)"),
            XertOwnerRoute(task: .order(orderID))
        )
        XCTAssertEqual(
            XertOwnerRoute.restore("owner/ptrequests/pt-request/\(ptRequestID.uuidString)"),
            XertOwnerRoute(task: .ptRequest(ptRequestID))
        )
        XCTAssertNil(XertOwnerRoute.restore("owner/events/event/not-a-uuid"))
        XCTAssertNil(XertOwnerRoute.route(for: try XCTUnwrap(URL(
            string: "xertfitness://owner/finance/order/\(orderID.uuidString)?action=refund"
        ))))

        let intent = XertOwnerNavigationIntent(route: XertOwnerRoute(task: .order(orderID)))
        XCTAssertEqual(intent.disposition(
            isSignedIn: false,
            isProfileLoaded: false,
            isAdmin: false
        ), .requireAuthentication)
        XCTAssertEqual(intent.disposition(
            isSignedIn: true,
            isProfileLoaded: true,
            isAdmin: true
        ), .open)
        XCTAssertEqual(intent.disposition(
            isSignedIn: true,
            isProfileLoaded: true,
            isAdmin: false
        ), .deny)
    }

    func testStripeLaunchRunwayFailsClosedAndRoutesTheExactNextAction() throws {
        let productID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000096"))
        func runway(
            refreshed: Bool = true,
            current: Bool = true,
            bookingsEnabled: Bool? = true,
            paymentsEnabled: Bool? = false,
            hasProducts: Bool = true,
            linked: Bool = true,
            healthReady: Bool? = true,
            switchState: String? = "paused",
            receiptReady: Bool? = true,
            blockingProducts: [UUID] = []
        ) -> XertStripeLaunchRunway {
            XertStripeLaunchRunway.resolve(
                hasCompletedRefresh: refreshed,
                isRefreshing: !refreshed,
                sourcesAreCurrent: current,
                bookingsEnabled: bookingsEnabled,
                paymentsEnabled: paymentsEnabled,
                hasActiveProducts: hasProducts,
                activeProductsAreLinked: linked,
                healthReady: healthReady,
                paymentSwitchState: switchState,
                activationReceiptReady: receiptReady,
                blockingProductIDs: blockingProducts
            )
        }

        let checking = runway(refreshed: false, current: false, healthReady: nil)
        XCTAssertEqual(checking.phase, .checking)
        XCTAssertEqual(checking.completedSteps, 0)
        XCTAssertEqual(checking.route, XertOwnerRoute(workspace: .health))

        let unavailable = runway(current: false)
        XCTAssertEqual(unavailable.phase, .unavailable)
        XCTAssertEqual(unavailable.route, XertOwnerRoute(workspace: .health))

        let noCatalogue = runway(hasProducts: false)
        XCTAssertEqual(noCatalogue.phase, .catalogBlocked)
        XCTAssertEqual(noCatalogue.route, XertOwnerRoute(workspace: .products))

        let exactPack = runway(linked: false, blockingProducts: [productID, productID])
        XCTAssertEqual(exactPack.phase, .catalogBlocked)
        XCTAssertEqual(exactPack.route, XertOwnerRoute(task: .product(productID)))

        let blockedHealth = runway(healthReady: false, blockingProducts: [productID])
        XCTAssertEqual(blockedHealth.phase, .healthBlocked)
        XCTAssertEqual(blockedHealth.route, XertOwnerRoute(task: .product(productID)))

        let unavailableSwitches = runway(bookingsEnabled: nil)
        XCTAssertEqual(unavailableSwitches.phase, .unavailable)
        XCTAssertEqual(unavailableSwitches.route, XertOwnerRoute(workspace: .health))

        let readyForBookings = runway(bookingsEnabled: false)
        XCTAssertEqual(readyForBookings.phase, .readyToOpenBookings)
        XCTAssertEqual(readyForBookings.completedSteps, 3)
        XCTAssertEqual(readyForBookings.route, XertOwnerRoute(workspace: .controls))

        let unsafeControls = runway(bookingsEnabled: false, paymentsEnabled: true)
        XCTAssertEqual(unsafeControls.phase, .controlsBlocked)
        XCTAssertEqual(unsafeControls.route, XertOwnerRoute(workspace: .controls))

        let readyForPayments = runway()
        XCTAssertEqual(readyForPayments.phase, .readyToActivate)
        XCTAssertEqual(readyForPayments.completedSteps, 4)
        XCTAssertEqual(readyForPayments.route, XertOwnerRoute(workspace: .controls))

        let unverifiedActivation = runway(
            paymentsEnabled: true,
            switchState: "enabled",
            receiptReady: false
        )
        XCTAssertEqual(unverifiedActivation.phase, .healthBlocked)
        XCTAssertEqual(unverifiedActivation.route, XertOwnerRoute(workspace: .health))

        let live = runway(
            paymentsEnabled: true,
            switchState: "ENABLED",
            receiptReady: true
        )
        XCTAssertEqual(live.phase, .live)
        XCTAssertEqual(live.completedSteps, XertStripeLaunchRunway.totalSteps)
        XCTAssertEqual(live.route, XertOwnerRoute(workspace: .health))
    }

    func testOwnerWorkspaceRecencyIsBoundedDeduplicatedAndRestorable() {
        var recency = XertOwnerWorkspaceRecency(workspaces: [
            .overview, .finance, .members, .finance, .health, .products,
            .events, .team, .audit,
        ])

        XCTAssertEqual(recency.workspaces, [.finance, .members, .health, .products, .events, .team])
        recency.record(.audit)
        XCTAssertEqual(recency.workspaces, [.audit, .finance, .members, .health, .products, .events])
        recency.record(.overview)
        XCTAssertEqual(recency.workspaces, [.audit, .finance, .members, .health, .products, .events])
        XCTAssertEqual(
            XertOwnerWorkspaceRecency(restorationValue: recency.restorationValue),
            recency
        )
        XCTAssertEqual(
            XertOwnerWorkspaceRecency(restorationValue: "unknown,finance,finance,members").workspaces,
            [.finance, .members]
        )
    }

    func testOwnerEditorExitCoordinatorRestoresTheUnderlyingDirtyDraft() {
        let coordinator = XertOwnerEditorExitCoordinator()
        let blackoutID = UUID()
        let classID = UUID()

        coordinator.report(
            XertOwnerEditorExitState(
                id: blackoutID,
                title: "blackout changes",
                isDirty: true,
                isBusy: false
            )
        )
        XCTAssertEqual(coordinator.active?.id, blackoutID)

        coordinator.report(
            XertOwnerEditorExitState(
                id: classID,
                title: "class changes",
                isDirty: true,
                isBusy: true
            )
        )
        XCTAssertEqual(coordinator.active?.id, classID)
        XCTAssertTrue(coordinator.active?.isBusy == true)

        coordinator.clear(id: classID)
        XCTAssertEqual(coordinator.active?.id, blackoutID)

        coordinator.report(
            XertOwnerEditorExitState(
                id: blackoutID,
                title: "blackout changes",
                isDirty: false,
                isBusy: false
            )
        )
        XCTAssertNil(coordinator.active)
    }

    func testOwnerRouteHistoryPreservesExactTasksForwardStateAndMigration() throws {
        let memberID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000091"))
        let orderID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000092"))
        let overview = XertOwnerRoute(workspace: .overview)
        let members = XertOwnerRoute(workspace: .members)
        let finance = XertOwnerRoute(workspace: .finance)
        let health = XertOwnerRoute(workspace: .health)
        let memberTask = XertOwnerRoute(task: .member(memberID))
        let orderTask = XertOwnerRoute(task: .order(orderID))
        var history = XertOwnerRouteHistory(
            routes: [overview, members, orderTask],
            currentIndex: 2
        )

        XCTAssertEqual(history.current, orderTask)
        XCTAssertEqual(history.current.navigationTitle, "Order Detail")
        XCTAssertEqual(history.previous, members)
        XCTAssertNil(history.next)
        XCTAssertEqual(history.goBack(), members)
        XCTAssertEqual(history.previous, overview)
        XCTAssertEqual(history.next, orderTask)
        XCTAssertEqual(history.goForward(), orderTask)

        XCTAssertEqual(history.goBack(), members)
        history.visit(health)
        XCTAssertEqual(history.routes, [overview, members, health])
        XCTAssertEqual(history.current, health)
        XCTAssertNil(history.next)

        history.visit(memberTask)
        XCTAssertEqual(history.routes, [overview, members, health, memberTask])
        let restored = XertOwnerRouteHistory(
            restorationValue: history.restorationValue,
            fallback: XertOwnerRoute(workspace: .audit)
        )
        XCTAssertEqual(restored, history)
        XCTAssertTrue(restored.restorationValue.hasPrefix("v2|"))

        var bounded = XertOwnerRouteHistory()
        for index in 0..<(XertOwnerRouteHistory.maximumCount + 5) {
            bounded.visit(index.isMultiple(of: 2) ? members : finance)
        }
        XCTAssertEqual(bounded.routes.count, XertOwnerRouteHistory.maximumCount)
        XCTAssertEqual(bounded.currentIndex, bounded.routes.count - 1)
        XCTAssertEqual(
            XertOwnerRouteHistory(
                restorationValue: "broken",
                fallback: XertOwnerRoute(workspace: .audit)
            ).current,
            XertOwnerRoute(workspace: .audit)
        )
        XCTAssertEqual(
            XertOwnerRouteHistory(restorationValue: "v2|99|owner/members,owner/finance").current,
            overview
        )
        XCTAssertEqual(
            XertOwnerRouteHistory(
                restorationValue: "v2|0|owner/unknown,owner/finance",
                fallback: XertOwnerRoute(workspace: .audit)
            ).current,
            XertOwnerRoute(workspace: .audit)
        )
        let migrated = XertOwnerRouteHistory(restorationValue: "v1|1|members,finance")
        XCTAssertEqual(migrated.routes, [members, finance])
        XCTAssertEqual(migrated.current, finance)
        XCTAssertTrue(migrated.restorationValue.hasPrefix("v2|"))
        XCTAssertEqual(
            XertOwnerRouteHistory(
                restorationValue: String(repeating: "x", count: XertOwnerRouteHistory.maximumEncodedLength + 1),
                fallback: XertOwnerRoute(workspace: .audit)
            ).current,
            XertOwnerRoute(workspace: .audit)
        )
    }

    func testOwnerCommandIndexRanksAndBoundsProtectedBusinessRecords() throws {
        let memberID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-0000000000a1"))
        let orderID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-0000000000a2"))
        let eventID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-0000000000a3"))
        let productID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-0000000000a4"))
        let classID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-0000000000a5"))
        let bookingRequestID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-0000000000a6"))
        let ptRequestID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-0000000000a7"))
        let member = AdminMemberSummary(
            id: memberID,
            full_name: "Alex Runner",
            email: "alex@example.com",
            phone: "0400000000",
            role: "member",
            joined_at: Date(timeIntervalSince1970: 0),
            credits_remaining: 4,
            bookings_count: 2,
            orders_count: 1,
            total_spent_cents: 4800,
            total_count: 1
        )
        let order = OrderItem(
            id: orderID,
            user_id: memberID,
            product_id: nil,
            email: "alex@example.com",
            status: "paid",
            amount_cents: 4800,
            currency: "aud",
            credit_total: 4,
            credit_validity_days: 28,
            stripe_checkout_session_id: "cs_test_owner_command",
            stripe_payment_intent_id: "pi_test_owner_command",
            created_at: Date(timeIntervalSince1970: 0),
            paid_at: Date(timeIntervalSince1970: 1),
            refunded_at: nil,
            refunded_amount_cents: nil,
            reconciled_at: nil,
            reconciled_by: nil,
            products: OrderProduct(name: "Starter 4"),
            stripe_refunds: nil
        )
        let event = AdminEvent(
            id: eventID,
            name: "Gold Coast Marathon",
            category: "marathon",
            event_date: "2026-07-04",
            end_date: "2026-07-05",
            location: "Gold Coast",
            region: "South East Queensland",
            url: nil,
            published: true,
            sort_order: 1,
            updated_at: "2026-07-17T00:00:00Z"
        )
        let product = AdminProduct(
            id: productID,
            slug: "starter-4",
            name: "Starter 4",
            description: "Four coached sessions",
            price_cents: 4800,
            currency: "aud",
            sessions_count: 4,
            validity_days: 28,
            stripe_price_id: "price_live_owner_command",
            featured: true,
            active: true,
            sort_order: 1,
            updated_at: "2026-07-17T00:00:00Z"
        )
        let operation = AdminDailyOperation(
            session_id: classID,
            title: "XERT Engine",
            class_type: "conditioning",
            start_time: Date(timeIntervalSince1970: 3_600),
            end_time: Date(timeIntervalSince1970: 7_200),
            status: "published",
            capacity: 12,
            coach_name: "Byron",
            location_zone: "Main floor",
            booking_mode: "instant_book",
            requested_count: 0,
            confirmed_count: 7,
            waitlist_count: 1,
            attended_count: 0,
            no_show_count: 0,
            public_request_count: 0,
            attendance_due: true
        )
        let bookingRequest = AdminBookingRequest(
            source: .enquiry,
            recordID: bookingRequestID.uuidString,
            memberBookingID: nil,
            fullName: "Jordan Booker",
            email: "booking.person@example.com",
            phone: "0400000001",
            status: "requested",
            adminNotes: nil,
            createdAt: Date(timeIntervalSince1970: 100),
            creditBatchID: nil,
            session: AdminBookingSession(
                title: "XERT Engine",
                start_time: Date(timeIntervalSince1970: 3_600),
                coach_name: "Byron",
                location_zone: "Main floor"
            )
        )
        let ptRequest = AdminPTRequest(
            id: ptRequestID,
            full_name: "Casey Strong",
            email: "casey@example.com",
            phone: "0400000002",
            requested_session_type: "Strength coaching",
            preferred_day: "Tuesday",
            preferred_time: "Morning",
            training_goal: "Strength rebuild",
            experience_level: "Intermediate",
            notes: nil,
            admin_notes: nil,
            status: "requested",
            created_at: Date(timeIntervalSince1970: 200)
        )

        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: orderID.uuidString,
                members: [member],
                orders: [order],
                products: [product],
                events: [event]
            ).map(\.route),
            [XertOwnerRoute(task: .order(orderID))]
        )
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "alex",
                members: [member],
                orders: [order],
                products: [product],
                events: [event]
            ).map(\.kind),
            [.member, .order]
        )
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "gold coast",
                members: [member],
                orders: [order],
                products: [product],
                events: [event]
            ).first?.route,
            XertOwnerRoute(task: .event(eventID))
        )
        XCTAssertTrue(XertOwnerCommandIndex.matches(
            query: " ", members: [member], orders: [order], products: [product], events: [event]
        ).isEmpty)
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "price_live_owner_command",
                members: [member],
                orders: [order],
                products: [product],
                events: [event]
            ).map(\.route),
            [XertOwnerRoute(task: .product(productID))]
        )
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "starter-4",
                members: [],
                orders: [],
                products: [product],
                events: []
            ).first?.kind,
            .product
        )
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "roll call",
                members: [],
                orders: [],
                products: [],
                events: [],
                classes: [operation]
            ).map(\.route),
            [XertOwnerRoute(task: .classSession(classID))]
        )
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "byron",
                members: [],
                orders: [],
                products: [],
                events: [],
                classes: [operation]
            ).first?.kind,
            .classSession
        )
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "booking.person@example.com",
                members: [],
                orders: [],
                products: [],
                events: [],
                bookingRequests: [bookingRequest]
            ).map(\.route),
            [XertOwnerRoute(task: .bookingRequest(.enquiry, bookingRequestID))]
        )
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "strength rebuild",
                members: [],
                orders: [],
                products: [],
                events: [],
                ptRequests: [ptRequest]
            ).map(\.route),
            [XertOwnerRoute(task: .ptRequest(ptRequestID))]
        )

        let manyEvents = (0..<(XertOwnerCommandIndex.maximumResultsPerKind + 3)).map { index in
            AdminEvent(
                id: UUID(),
                name: "Race \(index)",
                category: "run",
                event_date: "2026-08-01",
                end_date: nil,
                location: "Queensland",
                region: "Queensland",
                url: nil,
                published: true,
                sort_order: index,
                updated_at: "2026-07-17T00:00:00Z"
            )
        }
        XCTAssertEqual(
            XertOwnerCommandIndex.matches(
                query: "race",
                members: [],
                orders: [],
                products: [],
                events: manyEvents
            ).count,
            XertOwnerCommandIndex.maximumResultsPerKind
        )
    }

    func testLeadActionCountsCombineOnlyFreshPipelineWork() {
        let counts = AdminLeadActionCounts(
            memberLeads: 4,
            trainerApplicants: 2,
            partnerEnquiries: 1,
            overdueMemberLeads: 1,
            overdueTrainerApplicants: 0,
            overduePartnerEnquiries: 2
        )
        XCTAssertEqual(counts.total, 7)
        XCTAssertEqual(counts.overdueTotal, 3)
        XCTAssertEqual(counts.priorityPipeline, .members)
        XCTAssertEqual(counts.overduePriorityPipeline, .partners)
        XCTAssertEqual(counts.triagePipeline, .partners)
        XCTAssertEqual(
            AdminLeadActionCounts(
                memberLeads: 0,
                trainerApplicants: 2,
                partnerEnquiries: 5
            ).priorityPipeline,
            .partners
        )
        XCTAssertNil(
            AdminLeadActionCounts(
                memberLeads: 0,
                trainerApplicants: 0,
                partnerEnquiries: 0
            ).priorityPipeline
        )
    }

    func testOwnerWorkspacePinsAreBoundedStrictAndAccountScoped() throws {
        let suiteName = "XertOwnerWorkspacePinsStoreTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let firstUser = UUID()
        let secondUser = UUID()

        XCTAssertTrue(XertOwnerWorkspacePinsStore.load(for: nil, defaults: defaults).isEmpty)
        XCTAssertTrue(XertOwnerWorkspacePinsStore.load(for: secondUser, defaults: defaults).isEmpty)
        XCTAssertTrue(
            XertOwnerWorkspacePinsStore.toggle(.overview, for: firstUser, defaults: defaults).isEmpty
        )

        XCTAssertEqual(
            XertOwnerWorkspacePinsStore.toggle(.finance, for: firstUser, defaults: defaults),
            [.finance]
        )
        XCTAssertEqual(
            XertOwnerWorkspacePinsStore.toggle(.members, for: firstUser, defaults: defaults),
            [.members, .finance]
        )
        XCTAssertEqual(
            XertOwnerWorkspacePinsStore.toggle(.finance, for: firstUser, defaults: defaults),
            [.members]
        )

        for workspace in [.finance, .products, .health, .events, .team, .audit, .controls] as [XertOwnerWorkspace] {
            _ = XertOwnerWorkspacePinsStore.toggle(workspace, for: firstUser, defaults: defaults)
        }
        let bounded = XertOwnerWorkspacePinsStore.load(for: firstUser, defaults: defaults)
        XCTAssertEqual(bounded.count, XertOwnerWorkspacePinsSnapshot.maximumWorkspaceCount)
        XCTAssertEqual(bounded.first, .controls)
        XCTAssertFalse(bounded.contains(.finance))
        XCTAssertTrue(XertOwnerWorkspacePinsStore.load(for: secondUser, defaults: defaults).isEmpty)

        let storageKey = "xert.owner-navigation.pins.v1.\(firstUser.uuidString.lowercased())"
        defaults.set(Data(#"{"version":1,"workspaceValues":["unknown","finance"]}"#.utf8), forKey: storageKey)
        XCTAssertTrue(XertOwnerWorkspacePinsStore.load(for: firstUser, defaults: defaults).isEmpty)
        defaults.set(Data(#"{"version":1,"workspaceValues":["finance","finance"]}"#.utf8), forKey: storageKey)
        XCTAssertTrue(XertOwnerWorkspacePinsStore.load(for: firstUser, defaults: defaults).isEmpty)
    }

    func testOwnerWorkspaceSearchMatchesTasksAcrossBusinessAreas() {
        XCTAssertTrue(XertOwnerWorkspace.finance.matches("stripe revenue"))
        XCTAssertTrue(XertOwnerWorkspace.orders.matches("stripe refund"))
        XCTAssertFalse(XertOwnerWorkspace.finance.matches("refund"))
        XCTAssertTrue(XertOwnerWorkspace.siteContent.matches("homepage hero"))
        XCTAssertTrue(XertOwnerWorkspace.classDesk.matches("roll waitlist"))
        XCTAssertTrue(XertOwnerWorkspace.members.matches("MEMBER credit"))
        XCTAssertTrue(XertOwnerWorkspace.access.matches("staff permission"))
        XCTAssertFalse(XertOwnerWorkspace.events.matches("refund"))
        XCTAssertTrue(XertOwnerWorkspace.events.matches("   "))
    }

    func testCanonicalWebTaskLinksRoundTripAndRejectUntrustedOrigins() throws {
        let announcementID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000023"))
        let bookingID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000024"))
        let sessionID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000028"))
        let routes: [XertMemberRoute] = [
            .home, .notices(nil), .notices(announcementID), .booking, .classSession(sessionID), .sessionPacks,
            .purchaseConfirmation, .events, .eventGoals, .explore, .account,
            .upcomingBookings(nil), .upcomingBookings(bookingID),
        ]

        for route in routes {
            XCTAssertEqual(route.webURL.scheme, "https")
            XCTAssertEqual(route.webURL.host, XertMemberRoute.canonicalWebHost)
            XCTAssertEqual(XertMemberRoute.route(for: route.webURL), route)
        }

        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "https://xert-fitness.vercel.app/booking#packs"))), .sessionPacks)
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "https://xert-fitness.vercel.app/account#bookings"))), .upcomingBookings(nil))
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "https://xert-fitness.vercel.app/coaches"))), .explore)
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "http://xert-fitness.vercel.app/booking"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "https://example.com/open/booking/packs"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "https://xert-fitness.vercel.app:444/open/booking/packs"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "https://xert-fitness.vercel.app/open/booking/packs?source=email"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "https://user:pass@xert-fitness.vercel.app/open/booking"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "https://xert-fitness.vercel.app/open/admin"))))
    }

    func testRouteSharingNeverExportsPrivateMemberTaskIdentity() throws {
        let announcementID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000025"))
        let bookingID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000026"))
        let sessionID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000029"))

        let exactRoutes: [XertMemberRoute] = [.home, .booking, .classSession(sessionID), .sessionPacks, .events, .explore]
        for route in exactRoutes {
            XCTAssertEqual(route.shareDestination?.route, route)
            XCTAssertEqual(route.shareDestination?.isExactTask, true)
        }

        let safeParents: [(XertMemberRoute, XertMemberRoute)] = [
            (.notices(announcementID), .home),
            (.purchaseConfirmation, .sessionPacks),
            (.eventGoals, .events),
            (.upcomingBookings(bookingID), .booking),
        ]
        for (privateRoute, publicRoute) in safeParents {
            let shared = try XCTUnwrap(privateRoute.shareDestination)
            XCTAssertEqual(shared.route, publicRoute)
            XCTAssertFalse(shared.isExactTask)
            XCTAssertFalse(shared.route.requiresAuthentication)
            XCTAssertFalse(shared.route.webURL.absoluteString.contains(announcementID.uuidString.lowercased()))
            XCTAssertFalse(shared.route.webURL.absoluteString.contains(bookingID.uuidString.lowercased()))
        }

        XCTAssertNil(XertMemberRoute.account.shareDestination)
    }

    func testRouteUserActivityRoundTripsExactTasksWithoutIndexingPrivateContext() throws {
        let bookingID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000023"))
        let route = XertMemberRoute.upcomingBookings(bookingID)
        let activity = NSUserActivity(activityType: XertRouteUserActivity.activityType)

        XertRouteUserActivity.configure(activity, route: route)

        XCTAssertEqual(XertRouteUserActivity.route(from: activity), route)
        XCTAssertEqual(activity.webpageURL, route.webURL)
        XCTAssertTrue(activity.isEligibleForHandoff)
        XCTAssertFalse(activity.isEligibleForSearch)
        XCTAssertFalse(activity.isEligibleForPrediction)
        XCTAssertFalse(activity.isEligibleForPublicIndexing)
    }

    func testRouteUserActivityAllowsPrivateSearchOnlyForPrimaryWorkspaces() {
        let activity = NSUserActivity(activityType: XertRouteUserActivity.activityType)

        XertRouteUserActivity.configure(activity, route: .events)

        XCTAssertTrue(activity.isEligibleForSearch)
        XCTAssertTrue(activity.isEligibleForPrediction)
        XCTAssertFalse(activity.isEligibleForPublicIndexing)
    }

    func testRouteUserActivityAdvertisingProtectsSignedOutAndLockedMemberContext() {
        let sessionID = UUID()
        XCTAssertTrue(XertRouteUserActivity.shouldAdvertise(
            route: .events,
            isSignedIn: false,
            isPrivacyLocked: false
        ))
        XCTAssertTrue(XertRouteUserActivity.shouldAdvertise(
            route: .classSession(sessionID),
            isSignedIn: false,
            isPrivacyLocked: false
        ))
        XCTAssertFalse(XertRouteUserActivity.shouldAdvertise(
            route: .upcomingBookings(nil),
            isSignedIn: false,
            isPrivacyLocked: false
        ))
        XCTAssertTrue(XertRouteUserActivity.shouldAdvertise(
            route: .upcomingBookings(nil),
            isSignedIn: true,
            isPrivacyLocked: false
        ))
        XCTAssertFalse(XertRouteUserActivity.shouldAdvertise(
            route: .events,
            isSignedIn: true,
            isPrivacyLocked: true
        ))
    }

    func testNavigationIntentsDeferOnlyMemberPrivateRoutesUntilAuthentication() {
        let sessionID = UUID()
        let publicRoutes: [XertMemberRoute] = [
            .home, .booking, .classSession(sessionID), .sessionPacks, .events, .explore, .account
        ]
        let protectedRoutes: [XertMemberRoute] = [
            .notices(nil), .purchaseConfirmation, .eventGoals, .upcomingBookings(nil)
        ]

        for route in publicRoutes {
            let intent = XertNavigationIntent(route: route, source: .deepLink)
            XCTAssertFalse(route.requiresAuthentication)
            XCTAssertEqual(intent.disposition(isSignedIn: false), .open)
        }
        for route in protectedRoutes {
            let intent = XertNavigationIntent(route: route, source: .pushNotification)
            XCTAssertTrue(route.requiresAuthentication)
            XCTAssertEqual(intent.disposition(isSignedIn: false), .requireAuthentication)
            XCTAssertEqual(intent.disposition(isSignedIn: true), .open)
            XCTAssertEqual(intent.source, .pushNotification)
        }
    }

    func testRouteUserActivityRejectsWrongMalformedAndConflictingPayloads() throws {
        let wrongType = NSUserActivity(activityType: "com.example.other")
        XertRouteUserActivity.configure(wrongType, route: .booking)
        XCTAssertNil(XertRouteUserActivity.route(from: wrongType))

        let future = NSUserActivity(activityType: XertRouteUserActivity.activityType)
        future.userInfo = ["xert.memberRoute": "booking", "xert.routeVersion": 2]
        XCTAssertNil(XertRouteUserActivity.route(from: future))

        let unversioned = NSUserActivity(activityType: XertRouteUserActivity.activityType)
        unversioned.userInfo = ["xert.memberRoute": "booking"]
        XCTAssertNil(XertRouteUserActivity.route(from: unversioned))

        let untrusted = NSUserActivity(activityType: XertRouteUserActivity.activityType)
        untrusted.webpageURL = try XCTUnwrap(URL(string: "https://example.com/open/booking"))
        XCTAssertNil(XertRouteUserActivity.route(from: untrusted))

        let conflicting = NSUserActivity(activityType: XertRouteUserActivity.activityType)
        conflicting.userInfo = ["xert.memberRoute": "booking", "xert.routeVersion": 1]
        conflicting.webpageURL = XertMemberRoute.events.webURL
        XCTAssertNil(XertRouteUserActivity.route(from: conflicting))
    }

    func testNavigationCoordinatorTracksSourcesHistoryReselectionAndAdjacentTabs() {
        let navigation = XertNavigationCoordinator(initial: .home, historyLimit: 3)

        XCTAssertTrue(navigation.select(.booking, source: .content))
        XCTAssertEqual(navigation.selection, .booking)
        XCTAssertEqual(navigation.previousDestination, .home)
        XCTAssertEqual(navigation.lastTransition?.source, .content)

        XCTAssertFalse(navigation.select(.booking, source: .dock))
        XCTAssertEqual(navigation.reselectionSequence, 1)

        XCTAssertTrue(navigation.step(.next))
        XCTAssertEqual(navigation.selection, .events)
        XCTAssertEqual(navigation.lastTransition?.source, .dockSwipe)
        XCTAssertTrue(navigation.returnToPrevious())
        XCTAssertEqual(navigation.selection, .booking)
        XCTAssertEqual(navigation.lastTransition?.source, .history)

        XCTAssertTrue(navigation.select(.events, source: .deepLink))
        XCTAssertTrue(navigation.select(.explore, source: .pushNotification))
        XCTAssertEqual(navigation.history, [.booking, .events, .explore])

        navigation.restore(rawValue: XertPrimaryDestination.account.rawValue)
        XCTAssertEqual(navigation.selection, .account)
        XCTAssertEqual(navigation.history, [.account])
        XCTAssertEqual(navigation.lastTransition?.source, .restoration)
    }

    func testNavigationCoordinatorTracksAndRestoresExactMemberTasks() {
        let navigation = XertNavigationCoordinator(initial: .booking)
        let initialSequence = navigation.routeSequence

        XCTAssertTrue(navigation.open(.sessionPacks, source: .commandPalette))
        XCTAssertEqual(navigation.selection, .booking)
        XCTAssertEqual(navigation.route, .sessionPacks)
        XCTAssertGreaterThan(navigation.routeSequence, initialSequence)
        XCTAssertEqual(navigation.history, [.booking])
        XCTAssertEqual(navigation.routeHistory, [.booking, .sessionPacks])
        XCTAssertEqual(navigation.lastTransition?.from, .booking)
        XCTAssertEqual(navigation.lastTransition?.to, .booking)

        XCTAssertTrue(navigation.open(.eventGoals, source: .deepLink))
        XCTAssertEqual(navigation.selection, .events)
        XCTAssertEqual(navigation.history, [.booking, .events])
        XCTAssertEqual(navigation.routeHistory, [.booking, .sessionPacks, .eventGoals])

        navigation.restore(routeValue: XertMemberRoute.upcomingBookings(nil).restorationValue)
        XCTAssertEqual(navigation.selection, .account)
        XCTAssertEqual(navigation.route, .upcomingBookings(nil))
        XCTAssertEqual(navigation.history, [.account])
        XCTAssertEqual(navigation.routeHistory, [.upcomingBookings(nil)])
        XCTAssertEqual(navigation.lastTransition?.source, .restoration)
    }

    func testNavigationRemembersTheExactTaskInEveryWorkspace() throws {
        let bookingID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000071"))
        let navigation = XertNavigationCoordinator(initial: .booking)

        XCTAssertTrue(navigation.open(.sessionPacks, source: .content))
        XCTAssertTrue(navigation.open(.eventGoals, source: .content))
        XCTAssertEqual(navigation.rememberedRoute(for: .booking), .sessionPacks)
        XCTAssertEqual(navigation.rememberedRoute(for: .events), .eventGoals)

        XCTAssertTrue(navigation.select(.booking, source: .dock))
        XCTAssertEqual(navigation.route, .sessionPacks)
        XCTAssertTrue(navigation.step(
            .next,
            order: [.booking, .events, .home, .explore, .account]
        ))
        XCTAssertEqual(navigation.route, .eventGoals)

        XCTAssertTrue(navigation.open(.upcomingBookings(bookingID), source: .pushNotification))
        XCTAssertTrue(navigation.select(.events, source: .keyboard))
        XCTAssertEqual(navigation.route, .eventGoals)
        XCTAssertTrue(navigation.select(.account, source: .commandPalette))
        XCTAssertEqual(navigation.route, .upcomingBookings(bookingID))

        let commands = navigation.commandPaletteCommands(
            isAdmin: false,
            context: XertNavigationContext(
                isSignedIn: true,
                noticeCount: 0,
                bookingCount: 1,
                creditCount: 4,
                eventGoalCount: 1,
                hasPendingCheckout: false
            )
        )
        XCTAssertEqual(
            commands.first { $0.action == .destination(.booking) }?.title,
            "Return to Session Packs"
        )
        XCTAssertEqual(
            commands.first { $0.action == .destination(.events) }?.title,
            "Return to Event Goals"
        )
    }

    func testNavigationWorkspaceMapOrdersAndProtectsRememberedTasks() throws {
        let noticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000072"))
        let navigation = XertNavigationCoordinator(initial: .home)
        XCTAssertTrue(navigation.open(.notices(noticeID), source: .pushNotification))
        XCTAssertTrue(navigation.open(.sessionPacks, source: .content))
        XCTAssertTrue(navigation.open(.eventGoals, source: .content))

        let order: [XertPrimaryDestination] = [.account, .events, .booking, .home, .explore]
        let signedIn = navigation.workspaceNodes(order: order, allowsProtectedRoutes: true)
        XCTAssertEqual(signedIn.map(\.destination), order)
        XCTAssertEqual(signedIn.first { $0.destination == .home }?.route, .notices(noticeID))
        XCTAssertEqual(signedIn.first { $0.destination == .booking }?.route, .sessionPacks)
        XCTAssertEqual(signedIn.first { $0.destination == .events }?.route, .eventGoals)
        XCTAssertEqual(signedIn.filter(\.isCurrent).map(\.destination), [.events])

        let signedOut = navigation.workspaceNodes(order: order, allowsProtectedRoutes: false)
        XCTAssertEqual(signedOut.map(\.destination), order)
        XCTAssertEqual(signedOut.first { $0.destination == .home }?.route, .home)
        XCTAssertEqual(signedOut.first { $0.destination == .booking }?.route, .sessionPacks)
        XCTAssertEqual(signedOut.first { $0.destination == .events }?.route, .events)
        XCTAssertFalse(signedOut.contains { $0.route.requiresAuthentication })
    }

    func testNavigationHistoryReturnsToExactTasksAcrossAndWithinTabs() throws {
        let noticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000031"))
        let navigation = XertNavigationCoordinator(initial: .home, historyLimit: 6)

        XCTAssertTrue(navigation.open(.notices(noticeID), source: .pushNotification))
        XCTAssertTrue(navigation.open(.sessionPacks, source: .content))
        XCTAssertTrue(navigation.open(.purchaseConfirmation, source: .checkout))
        XCTAssertEqual(navigation.previousRoute, .sessionPacks)
        XCTAssertEqual(navigation.previousDestination, .booking)

        XCTAssertTrue(navigation.returnToPrevious())
        XCTAssertEqual(navigation.selection, .booking)
        XCTAssertEqual(navigation.route, .sessionPacks)
        XCTAssertEqual(navigation.previousRoute, .notices(noticeID))

        XCTAssertTrue(navigation.returnToPrevious())
        XCTAssertEqual(navigation.selection, .home)
        XCTAssertEqual(navigation.route, .notices(noticeID))
        XCTAssertEqual(navigation.previousRoute, .home)
        XCTAssertEqual(navigation.history, [.home])
    }

    func testNavigationWorkspaceRestoresBoundedExactTaskHistory() throws {
        let noticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000051"))
        let source = XertNavigationCoordinator(initial: .home, historyLimit: 4)
        XCTAssertTrue(source.open(.notices(noticeID), source: .pushNotification))
        XCTAssertTrue(source.open(.sessionPacks, source: .content))
        XCTAssertTrue(source.open(.eventGoals, source: .commandPalette))

        let restored = XertNavigationCoordinator(initial: .account, historyLimit: 3)
        restored.restore(
            workspaceValue: source.workspaceRestorationValue,
            fallbackRouteValue: XertMemberRoute.account.restorationValue
        )

        XCTAssertEqual(restored.route, .eventGoals)
        XCTAssertEqual(restored.routeHistory, [.notices(noticeID), .sessionPacks, .eventGoals])
        XCTAssertEqual(restored.previousRoute, .sessionPacks)
        XCTAssertEqual(restored.lastTransition?.source, .restoration)
        XCTAssertTrue(restored.returnToPrevious())
        XCTAssertEqual(restored.route, .sessionPacks)
    }

    func testNavigationWorkspaceFiltersProtectedTasksUntilAuthentication() throws {
        let noticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000053"))
        let source = XertNavigationCoordinator(initial: .home, historyLimit: 8)
        XCTAssertTrue(source.open(.notices(noticeID), source: .pushNotification))
        XCTAssertTrue(source.open(.sessionPacks, source: .content))
        XCTAssertTrue(source.open(.eventGoals, source: .commandPalette))
        XCTAssertTrue(source.open(.explore, source: .dock))
        XCTAssertTrue(source.returnToPrevious())

        let signedOut = XertNavigationCoordinator(initial: .account, historyLimit: 8)
        signedOut.restore(
            workspaceValue: source.workspaceRestorationValue,
            fallbackRouteValue: XertMemberRoute.upcomingBookings(nil).restorationValue,
            allowsProtectedRoutes: false
        )

        XCTAssertEqual(signedOut.route, .sessionPacks)
        XCTAssertEqual(signedOut.routeHistory, [.home, .sessionPacks])
        XCTAssertEqual(signedOut.nextRoute, .explore)
        XCTAssertFalse(signedOut.containsProtectedHistory)

        let signedIn = XertNavigationCoordinator(initial: .account, historyLimit: 8)
        signedIn.restore(
            workspaceValue: source.workspaceRestorationValue,
            fallbackRouteValue: XertMemberRoute.home.restorationValue,
            allowsProtectedRoutes: true
        )
        XCTAssertEqual(signedIn.route, .eventGoals)
        XCTAssertEqual(signedIn.routeHistory, [.home, .notices(noticeID), .sessionPacks, .eventGoals])
        XCTAssertEqual(signedIn.nextRoute, .explore)
        XCTAssertTrue(signedIn.containsProtectedHistory)

        let protectedFallback = XertNavigationCoordinator(initial: .events)
        protectedFallback.restore(
            workspaceValue: "not-json",
            fallbackRouteValue: XertMemberRoute.purchaseConfirmation.restorationValue,
            allowsProtectedRoutes: false
        )
        XCTAssertEqual(protectedFallback.route, .home)
    }

    func testNavigationWorkspaceRestoresIndependentTasksAndFiltersPrivateMemory() throws {
        let noticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000072"))
        let source = XertNavigationCoordinator(initial: .home, historyLimit: 8)
        XCTAssertTrue(source.open(.notices(noticeID), source: .pushNotification))
        XCTAssertTrue(source.open(.sessionPacks, source: .content))
        XCTAssertTrue(source.open(.eventGoals, source: .commandPalette))
        XCTAssertTrue(source.open(.explore, source: .dock))

        let data = try XCTUnwrap(source.workspaceRestorationValue.data(using: .utf8))
        let snapshot = try JSONDecoder().decode(XertNavigationWorkspaceSnapshot.self, from: data)
        XCTAssertEqual(snapshot.version, XertNavigationWorkspaceSnapshot.currentVersion)
        XCTAssertEqual(
            snapshot.workspaceRouteValues?.count,
            XertNavigationWorkspaceSnapshot.maximumWorkspaceRouteCount
        )

        let signedIn = XertNavigationCoordinator(initial: .account, historyLimit: 8)
        signedIn.restore(
            workspaceValue: source.workspaceRestorationValue,
            fallbackRouteValue: XertMemberRoute.account.restorationValue,
            allowsProtectedRoutes: true
        )
        XCTAssertEqual(signedIn.rememberedRoute(for: .home), .notices(noticeID))
        XCTAssertEqual(signedIn.rememberedRoute(for: .booking), .sessionPacks)
        XCTAssertEqual(signedIn.rememberedRoute(for: .events), .eventGoals)
        XCTAssertTrue(signedIn.select(.home, source: .dock))
        XCTAssertEqual(signedIn.route, .notices(noticeID))

        let signedOut = XertNavigationCoordinator(initial: .account, historyLimit: 8)
        signedOut.restore(
            workspaceValue: source.workspaceRestorationValue,
            fallbackRouteValue: XertMemberRoute.home.restorationValue,
            allowsProtectedRoutes: false
        )
        XCTAssertEqual(signedOut.rememberedRoute(for: .home), .home)
        XCTAssertEqual(signedOut.rememberedRoute(for: .booking), .sessionPacks)
        XCTAssertEqual(signedOut.rememberedRoute(for: .events), .events)
        XCTAssertFalse(signedOut.containsProtectedHistory)

        let defensiveSelection = XertNavigationCoordinator(initial: .home)
        XCTAssertTrue(defensiveSelection.open(.eventGoals, source: .deepLink))
        XCTAssertTrue(defensiveSelection.open(.booking, source: .dock))
        XCTAssertTrue(defensiveSelection.select(
            .events,
            source: .dock,
            allowsProtectedRoutes: false
        ))
        XCTAssertEqual(defensiveSelection.route, .events)

        let legacy = #"{"version":1,"routeValues":["booking/packs","events/goals"]}"#
        let legacyRestored = XertNavigationCoordinator(initial: .home)
        legacyRestored.restore(
            workspaceValue: legacy,
            fallbackRouteValue: XertMemberRoute.home.restorationValue
        )
        XCTAssertEqual(legacyRestored.route, .eventGoals)
        XCTAssertEqual(legacyRestored.rememberedRoute(for: .booking), .sessionPacks)
    }

    func testNavigationWorkspaceRejectsMalformedPartialAndFutureSnapshots() {
        let fallback = XertMemberRoute.upcomingBookings(nil)
        let invalidSnapshots = [
            "not-json",
            #"{"version":3,"routeValues":["events/goals"],"workspaceRouteValues":["home","booking","events/goals","explore","account"]}"#,
            #"{"version":2,"routeValues":["events/goals"]}"#,
            #"{"version":2,"routeValues":["booking"],"workspaceRouteValues":["home"]}"#,
            #"{"version":2,"routeValues":["booking"],"workspaceRouteValues":["booking/packs","booking/purchase-confirmation"]}"#,
            #"{"version":2,"routeValues":["booking"],"workspaceRouteValues":["home","unknown"]}"#,
            #"{"version":1,"routeValues":["booking/packs","unknown"]}"#,
            #"{"version":1,"routeValues":["booking"],"forwardRouteValues":["unknown"]}"#,
            #"{"version":1,"routeValues":[]}"#,
            String(repeating: "x", count: XertNavigationWorkspaceSnapshot.maximumEncodedLength + 1),
        ]

        for snapshot in invalidSnapshots {
            let navigation = XertNavigationCoordinator(initial: .home)
            navigation.restore(workspaceValue: snapshot, fallbackRouteValue: fallback.restorationValue)
            XCTAssertEqual(navigation.route, fallback)
            XCTAssertEqual(navigation.routeHistory, [fallback])
        }
    }

    func testNavigationHistorySupportsForwardTraversalAndClearsAfterBranching() {
        let navigation = XertNavigationCoordinator(initial: .home)
        XCTAssertTrue(navigation.open(.sessionPacks, source: .content))
        XCTAssertTrue(navigation.open(.eventGoals, source: .content))

        XCTAssertTrue(navigation.returnToPrevious())
        XCTAssertEqual(navigation.route, .sessionPacks)
        XCTAssertEqual(navigation.nextRoute, .eventGoals)
        XCTAssertTrue(navigation.returnToNext())
        XCTAssertEqual(navigation.route, .eventGoals)
        XCTAssertNil(navigation.nextRoute)

        XCTAssertTrue(navigation.returnToPrevious())
        XCTAssertTrue(navigation.open(.booking, source: .dock))
        XCTAssertNil(navigation.nextRoute)
        XCTAssertFalse(navigation.returnToNext())
    }

    func testNavigationTimelineJumpsDirectlyWithoutDiscardingForwardTasks() {
        let navigation = XertNavigationCoordinator(initial: .home)
        XCTAssertTrue(navigation.open(.sessionPacks, source: .content))
        XCTAssertTrue(navigation.open(.eventGoals, source: .content))
        XCTAssertTrue(navigation.open(.explore, source: .content))
        XCTAssertTrue(navigation.returnToPrevious())

        XCTAssertEqual(navigation.workspaceOverview, XertNavigationWorkspaceOverview(
            currentRoute: .eventGoals,
            backCount: 2,
            forwardCount: 1
        ))
        XCTAssertEqual(navigation.timeline.map(\.route), [.home, .sessionPacks, .eventGoals, .explore])
        XCTAssertEqual(navigation.timeline.map(\.offset), [-2, -1, 0, 1])

        XCTAssertTrue(navigation.jump(toTimelineIndex: 0, source: .commandPalette))
        XCTAssertEqual(navigation.route, .home)
        XCTAssertEqual(navigation.routeHistory, [.home])
        XCTAssertEqual(navigation.forwardRouteHistory, [.sessionPacks, .eventGoals, .explore])

        XCTAssertTrue(navigation.jump(toTimelineIndex: 2, source: .commandPalette))
        XCTAssertEqual(navigation.route, .eventGoals)
        XCTAssertEqual(navigation.previousRoute, .sessionPacks)
        XCTAssertEqual(navigation.nextRoute, .explore)
        XCTAssertEqual(navigation.lastTransition?.source, .commandPalette)

        XCTAssertFalse(navigation.jump(toTimelineIndex: 2))
        XCTAssertFalse(navigation.jump(toTimelineIndex: 99))
    }

    func testNavigationTimelineRejectsProtectedJumpsAndCommandsWhenSignedOut() throws {
        let noticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000061"))
        let navigation = XertNavigationCoordinator(initial: .home)
        XCTAssertTrue(navigation.open(.notices(noticeID), source: .pushNotification))
        XCTAssertTrue(navigation.open(.sessionPacks, source: .content))

        XCTAssertFalse(navigation.jump(
            toTimelineIndex: 1,
            source: .commandPalette,
            allowsProtectedRoutes: false
        ))
        let signedOutCommands = navigation.commandPaletteCommands(
            isAdmin: false,
            context: .empty
        )
        XCTAssertFalse(signedOutCommands.contains { $0.action == .timeline(1) })

        let signedInCommands = navigation.commandPaletteCommands(
            isAdmin: false,
            context: XertNavigationContext(
                isSignedIn: true,
                noticeCount: 0,
                bookingCount: 0,
                creditCount: 0,
                eventGoalCount: 0,
                hasPendingCheckout: false
            )
        )
        XCTAssertTrue(signedInCommands.contains { $0.action == .timeline(1) })
    }

    func testNavigationIdentifiesPrivateContextAcrossBackAndForwardHistory() {
        let navigation = XertNavigationCoordinator(initial: .home)
        XCTAssertFalse(navigation.containsContextualHistory)

        XCTAssertTrue(navigation.open(.sessionPacks, source: .content))
        XCTAssertTrue(navigation.containsContextualHistory)
        XCTAssertTrue(navigation.open(.events, source: .dock))
        XCTAssertTrue(navigation.returnToPrevious())
        XCTAssertTrue(navigation.returnToPrevious())
        XCTAssertTrue(navigation.containsContextualHistory)

        navigation.restore(routeValue: XertMemberRoute.explore.restorationValue)
        XCTAssertFalse(navigation.containsContextualHistory)
    }

    func testNavigationWorkspaceRestoresExactForwardTaskHistory() throws {
        let noticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000052"))
        let source = XertNavigationCoordinator(initial: .home, historyLimit: 5)
        XCTAssertTrue(source.open(.notices(noticeID), source: .pushNotification))
        XCTAssertTrue(source.open(.sessionPacks, source: .content))
        XCTAssertTrue(source.open(.eventGoals, source: .commandPalette))
        XCTAssertTrue(source.returnToPrevious())

        let restored = XertNavigationCoordinator(initial: .account, historyLimit: 3)
        restored.restore(
            workspaceValue: source.workspaceRestorationValue,
            fallbackRouteValue: XertMemberRoute.account.restorationValue
        )

        XCTAssertEqual(restored.route, .sessionPacks)
        XCTAssertEqual(restored.nextRoute, .eventGoals)
        XCTAssertTrue(restored.returnToNext())
        XCTAssertEqual(restored.route, .eventGoals)
        XCTAssertEqual(restored.lastTransition?.source, .history)
    }

    func testNavigationPresentationAdaptsWithoutChangingDestinationPolicy() {
        XCTAssertEqual(XertNavigationPresentation.resolve(isRegularWidth: false), .compactDock)
        XCTAssertEqual(XertNavigationPresentation.resolve(isRegularWidth: true), .workspaceRail)
        XCTAssertEqual(
            XertPrimaryDestination.dockOrder,
            [.home, .booking, .events, .explore, .account]
        )
    }

    func testScreenLayoutProtectsFullBleedHeroContentAndScrollReachability() {
        XCTAssertEqual(XertScreenLayout.heroContentTopInset(deviceTopInset: 59), 69)
        XCTAssertEqual(XertScreenLayout.heroContentTopInset(deviceTopInset: 0), 28)
        XCTAssertEqual(XertScreenLayout.heroContentTopInset(deviceTopInset: -12), 28)
        XCTAssertEqual(
            XertScreenLayout.resolvedTopSafeAreaInset(localInset: 0, inheritedInset: 59),
            59
        )
        XCTAssertEqual(
            XertScreenLayout.resolvedTopSafeAreaInset(localInset: 47, inheritedInset: 0),
            47
        )
        XCTAssertEqual(
            XertScreenLayout.resolvedTopSafeAreaInset(localInset: -4, inheritedInset: -8),
            0
        )
        XCTAssertEqual(XertScreenLayout.scrollEndClearance, 112)
        XCTAssertEqual(XertScreenLayout.pageHeroHeight(usesAccessibilityText: false), 250)
        XCTAssertEqual(XertScreenLayout.pageHeroHeight(usesAccessibilityText: true), 420)

        XCTAssertEqual(
            XertScreenLayout.homeHeroHeight(
                viewportHeight: 667,
                deviceTopInset: 20,
                usesAccessibilityText: false
            ),
            580
        )
        XCTAssertEqual(
            XertScreenLayout.homeHeroHeight(
                viewportHeight: 932,
                deviceTopInset: 59,
                usesAccessibilityText: false
            ),
            680
        )
        XCTAssertEqual(
            XertScreenLayout.homeHeroHeight(
                viewportHeight: 667,
                deviceTopInset: 20,
                usesAccessibilityText: true
            ),
            760
        )
        XCTAssertEqual(
            XertScreenLayout.homeHeroHeight(
                viewportHeight: 932,
                deviceTopInset: 59,
                usesAccessibilityText: true
            ),
            920
        )
    }

    func testOwnerShiftBriefingIsActionableAndOmitsPrivateMemberData() {
        let generatedAt = queenslandDate(2026, 7, 27, 16, 0)
        let operation = AdminDailyOperation(
            session_id: UUID(),
            title: "XERT Engine",
            class_type: "conditioning",
            start_time: queenslandDate(2026, 7, 27, 17, 0),
            end_time: queenslandDate(2026, 7, 27, 18, 0),
            status: "published",
            capacity: 12,
            coach_name: "Coach",
            location_zone: "Main floor",
            booking_mode: "instant_book",
            requested_count: 2,
            confirmed_count: 7,
            waitlist_count: 1,
            attended_count: 0,
            no_show_count: 0,
            public_request_count: 1,
            attendance_due: true
        )
        let briefing = AdminShiftBriefing(
            generatedAt: generatedAt,
            sourceUpdatedAt: generatedAt.addingTimeInterval(-60),
            classes: [AdminShiftClassBrief(operation: operation)],
            requestedPlaces: 3,
            waitlistedMembers: 1,
            attendanceDue: 1,
            activationActions: 2,
            retentionFollowUps: 3,
            pendingPTRequests: 1,
            recoverableOrders: 1,
            classSetupGaps: 1,
            unavailableSources: ["orders", "waitlists"]
        )

        XCTAssertEqual(briefing.classes.first?.requested, 3)
        XCTAssertEqual(briefing.openActionCount, 13)
        XCTAssertEqual(briefing.summary, "1 class | 13 open actions")
        XCTAssertTrue(briefing.text.contains("XERT OWNER SHIFT BRIEF"))
        XCTAssertTrue(briefing.text.contains("Class booking requests: 3"))
        XCTAssertTrue(briefing.text.contains("XERT Engine"))
        XCTAssertTrue(briefing.text.contains("7 confirmed | 3 requested | 1 waiting"))
        XCTAssertTrue(briefing.text.contains("ATTENDANCE DUE"))
        XCTAssertTrue(briefing.text.contains("Classes needing setup: 1"))
        XCTAssertTrue(briefing.text.contains("Unavailable: orders, waitlists"))
        XCTAssertFalse(briefing.text.lowercased().contains("email"))
        XCTAssertFalse(briefing.text.lowercased().contains("phone"))
        XCTAssertFalse(briefing.text.lowercased().contains("member name"))
    }

    func testDailyClassReadinessFindsOnlyCurrentActionableSetupDefects() {
        let now = queenslandDate(2026, 7, 27, 9, 0)

        func operation(
            id: UUID = UUID(),
            title: String,
            startOffset: TimeInterval = 3_600,
            status: String = "published",
            capacity: Int? = 8,
            coach: String? = "Coach",
            location: String? = "Main floor",
            confirmed: Int = 3
        ) -> AdminDailyOperation {
            let start = now.addingTimeInterval(startOffset)
            return AdminDailyOperation(
                session_id: id,
                title: title,
                class_type: "strength",
                start_time: start,
                end_time: start.addingTimeInterval(3_600),
                status: status,
                capacity: capacity,
                coach_name: coach,
                location_zone: location,
                booking_mode: "instant_book",
                requested_count: 0,
                confirmed_count: confirmed,
                waitlist_count: 0,
                attended_count: 0,
                no_show_count: 0,
                public_request_count: 0,
                attendance_due: false
            )
        }

        let setupID = UUID()
        let capacityID = UUID()
        let setup = operation(
            id: setupID,
            title: "Engine",
            capacity: 2,
            coach: " ",
            location: nil,
            confirmed: 3
        )
        let invalidCapacity = operation(
            id: capacityID,
            title: "Strength",
            capacity: 0
        )
        let ignored = [
            operation(title: "Draft", status: "draft", coach: nil),
            operation(title: "Cancelled", status: "cancelled", location: nil),
            operation(title: "Elapsed", startOffset: -7_200, coach: nil),
        ]
        let readiness = AdminDailyClassReadiness(
            operations: [setup, invalidCapacity] + ignored,
            sourceIsCurrent: true,
            now: now
        )

        XCTAssertEqual(readiness.affectedClassCount, 2)
        XCTAssertNil(readiness.singleAffectedClassID)
        XCTAssertEqual(
            Set(readiness.issues(for: setupID).map(\.kind)),
            Set([.missingCoach, .missingLocation, .overCapacity])
        )
        XCTAssertEqual(
            readiness.issues(for: capacityID).map(\.kind),
            [.invalidCapacity]
        )
        XCTAssertTrue(readiness.issues.contains(where: \.isCritical))
        XCTAssertTrue(readiness.summary(for: setupID)?.contains("Coach not assigned") == true)
        XCTAssertTrue(AdminDailyClassReadiness(
            operations: [setup],
            sourceIsCurrent: true,
            now: now
        ).singleAffectedClassID == setupID)
        XCTAssertTrue(AdminDailyClassReadiness(
            operations: [setup],
            sourceIsCurrent: false,
            now: now
        ).issues.isEmpty)
    }

    func testClassOperationalFocusPrioritisesDueAttendanceThenLiveThenUpcoming() {
        let now = queenslandDate(2026, 7, 27, 9, 0)

        func operation(
            title: String,
            startOffset: TimeInterval,
            endOffset: TimeInterval? = nil,
            status: String = "published",
            attendanceDue: Bool = false
        ) -> AdminDailyOperation {
            AdminDailyOperation(
                session_id: UUID(),
                title: title,
                class_type: "strength",
                start_time: now.addingTimeInterval(startOffset),
                end_time: endOffset.map { now.addingTimeInterval($0) },
                status: status,
                capacity: 10,
                coach_name: "Coach",
                location_zone: "Main floor",
                booking_mode: "instant",
                requested_count: 0,
                confirmed_count: 5,
                waitlist_count: 0,
                attended_count: 0,
                no_show_count: 0,
                public_request_count: 0,
                attendance_due: attendanceDue
            )
        }

        let overdue = operation(
            title: "Previous class",
            startOffset: -7_200,
            endOffset: -3_600,
            attendanceDue: true
        )
        let live = operation(title: "Live class", startOffset: -900, endOffset: 2_700)
        let upcoming = operation(title: "Next class", startOffset: 3_600, endOffset: 7_200)

        var focus = AdminClassOperationalFocus.resolve(
            operations: [upcoming, live, overdue],
            sourceIsCurrent: true,
            now: now
        )
        XCTAssertEqual(focus?.operation.id, overdue.id)
        XCTAssertEqual(focus?.phase, .attendanceDue)

        focus = AdminClassOperationalFocus.resolve(
            operations: [upcoming, live],
            sourceIsCurrent: true,
            now: now
        )
        XCTAssertEqual(focus?.operation.id, live.id)
        XCTAssertEqual(focus?.phase, .live)

        focus = AdminClassOperationalFocus.resolve(
            operations: [upcoming],
            sourceIsCurrent: true,
            now: now
        )
        XCTAssertEqual(focus?.operation.id, upcoming.id)
        XCTAssertEqual(focus?.phase, .upcoming)
    }

    func testClassOperationalFocusRejectsStaleCancelledAndFinishedClasses() {
        let now = queenslandDate(2026, 7, 27, 9, 0)
        let cancelled = AdminDailyOperation(
            session_id: UUID(),
            title: "Cancelled",
            class_type: "strength",
            start_time: now.addingTimeInterval(3_600),
            end_time: now.addingTimeInterval(7_200),
            status: "cancelled",
            capacity: 10,
            coach_name: "Coach",
            location_zone: "Main floor",
            booking_mode: "instant",
            requested_count: 0,
            confirmed_count: 5,
            waitlist_count: 0,
            attended_count: 0,
            no_show_count: 0,
            public_request_count: 0,
            attendance_due: false
        )
        let finished = AdminDailyOperation(
            session_id: UUID(),
            title: "Finished",
            class_type: "strength",
            start_time: now.addingTimeInterval(-7_200),
            end_time: now.addingTimeInterval(-3_600),
            status: "published",
            capacity: 10,
            coach_name: "Coach",
            location_zone: "Main floor",
            booking_mode: "instant",
            requested_count: 0,
            confirmed_count: 5,
            waitlist_count: 0,
            attended_count: 0,
            no_show_count: 0,
            public_request_count: 0,
            attendance_due: false
        )

        XCTAssertNil(AdminClassOperationalFocus.resolve(
            operations: [cancelled, finished],
            sourceIsCurrent: true,
            now: now
        ))
        XCTAssertNil(AdminClassOperationalFocus.resolve(
            operations: [finished],
            sourceIsCurrent: false,
            now: now
        ))
    }

    func testEmergencyPausePlanDiagnosesEveryLiveStateAndPreservesUnrelatedSettings() {
        let id = UUID()
        let settings = AdminPlatformSettings(
            id: id,
            target_launch_date: "2026-08-01",
            countdown_enabled: true,
            bookings_enabled: true,
            payments_enabled: true,
            announcement_banner_text: "Training as scheduled",
            announcement_banner_enabled: true,
            updated_at: "2026-07-27T08:00:00Z"
        )

        let live = AdminEmergencyPausePlan(settings: settings, sourceIsCurrent: true)
        XCTAssertEqual(live.state, .liveCommerce)
        XCTAssertTrue(live.canPause)
        XCTAssertEqual(live.title, "Bookings and checkout are live")
        XCTAssertTrue(live.detail.contains("session-pack checkout"))
        XCTAssertEqual(live.pausedSettings?.id, id)
        XCTAssertEqual(live.pausedSettings?.bookings_enabled, false)
        XCTAssertEqual(live.pausedSettings?.payments_enabled, false)
        XCTAssertEqual(live.pausedSettings?.announcement_banner_text, "Training as scheduled")
        XCTAssertEqual(live.pausedSettings?.updated_at, settings.updated_at)

        var bookingsOnly = settings
        bookingsOnly.payments_enabled = false
        XCTAssertEqual(
            AdminEmergencyPausePlan(settings: bookingsOnly, sourceIsCurrent: true).state,
            .bookingsOpen
        )

        var inconsistent = settings
        inconsistent.bookings_enabled = false
        XCTAssertEqual(
            AdminEmergencyPausePlan(settings: inconsistent, sourceIsCurrent: true).state,
            .inconsistent
        )

        inconsistent.payments_enabled = false
        let paused = AdminEmergencyPausePlan(settings: inconsistent, sourceIsCurrent: true)
        XCTAssertEqual(paused.state, .paused)
        XCTAssertFalse(paused.canPause)
        XCTAssertNil(paused.pausedSettings)
        XCTAssertTrue(paused.detail.contains("Existing bookings"))

        let unavailable = AdminEmergencyPausePlan(settings: settings, sourceIsCurrent: false)
        XCTAssertEqual(unavailable.state, .unavailable)
        XCTAssertFalse(unavailable.canPause)
        XCTAssertNil(unavailable.pausedSettings)
    }

    func testEmergencyMemberUpdateTemplateIsPublishableAndMakesNoFalseRecoveryClaim() {
        let draft = AdminAnnouncementDraft.memberOperationsPaused()
        let bookingsRestored = AdminAnnouncementDraft.memberOperationsRestored(
            checkoutAvailable: false
        )
        let commerceRestored = AdminAnnouncementDraft.memberOperationsRestored(
            checkoutAvailable: true
        )

        XCTAssertEqual(draft.title, AdminAnnouncementDraft.memberOperationsPausedTitle)
        XCTAssertEqual(draft.tone, "urgent")
        XCTAssertTrue(draft.body.contains("new bookings, waitlist joins and session-pack checkout"))
        XCTAssertTrue(draft.body.contains("Existing bookings remain confirmed"))
        XCTAssertTrue(draft.body.contains("another update"))
        XCTAssertFalse(draft.body.localizedCaseInsensitiveContains("resolved"))
        XCTAssertTrue(draft.ctaLabel.isEmpty)
        XCTAssertTrue(draft.ctaURL.isEmpty)
        XCTAssertNil(draft.expiresAt)
        XCTAssertNil(draft.validationMessage(publishing: true))
        XCTAssertEqual(bookingsRestored.title, AdminAnnouncementDraft.memberBookingsRestoredTitle)
        XCTAssertTrue(bookingsRestored.body.contains("checkout remains temporarily paused"))
        XCTAssertFalse(bookingsRestored.body.contains("checkout are available again"))
        XCTAssertEqual(commerceRestored.title, AdminAnnouncementDraft.memberCommerceRestoredTitle)
        XCTAssertTrue(commerceRestored.body.contains("session-pack checkout are available again"))
        XCTAssertEqual(commerceRestored.ctaLabel, "Book a class")
        XCTAssertEqual(commerceRestored.ctaURL, "/booking")
        XCTAssertNil(bookingsRestored.validationMessage(publishing: true))
        XCTAssertNil(commerceRestored.validationMessage(publishing: true))
    }

    func testIncidentCommunicationPlanDetectsDriftAndRequiresAnAccurateRecoveryUpdate() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let pauseAt = now.addingTimeInterval(-3_600)

        func notice(
            title: String,
            body: String,
            publishedAt: Date?,
            firstPublishedAt: Date?
        ) -> AdminAnnouncement {
            AdminAnnouncement(
                id: UUID(),
                title: title,
                body: body,
                tone: "info",
                audience: "all",
                cta_label: nil,
                cta_url: nil,
                published_at: publishedAt,
                first_published_at: firstPublishedAt,
                expires_at: nil,
                archived_at: nil,
                created_at: firstPublishedAt ?? now.addingTimeInterval(-60),
                updated_at: "2027-01-15T08:00:00Z"
            )
        }

        let livePause = notice(
            title: AdminAnnouncementDraft.memberOperationsPausedTitle,
            body: AdminAnnouncementDraft.memberOperationsPaused().body,
            publishedAt: pauseAt,
            firstPublishedAt: pauseAt
        )
        let hiddenPause = notice(
            title: AdminAnnouncementDraft.memberOperationsPausedTitle,
            body: AdminAnnouncementDraft.memberOperationsPaused().body,
            publishedAt: nil,
            firstPublishedAt: pauseAt
        )
        let fullRecovery = notice(
            title: AdminAnnouncementDraft.memberCommerceRestoredTitle,
            body: AdminAnnouncementDraft.memberOperationsRestored(checkoutAvailable: true).body,
            publishedAt: now.addingTimeInterval(-300),
            firstPublishedAt: now.addingTimeInterval(-300)
        )
        let bookingsRecovery = notice(
            title: AdminAnnouncementDraft.memberBookingsRestoredTitle,
            body: AdminAnnouncementDraft.memberOperationsRestored(checkoutAvailable: false).body,
            publishedAt: now.addingTimeInterval(-240),
            firstPublishedAt: now.addingTimeInterval(-240)
        )

        XCTAssertEqual(AdminIncidentCommunicationPlan(
            operationsState: .paused,
            announcements: [],
            sourceIsCurrent: false,
            now: now
        ).state, .unavailable)
        XCTAssertEqual(AdminIncidentCommunicationPlan(
            operationsState: .paused,
            announcements: [],
            sourceIsCurrent: true,
            now: now
        ).state, .pausedNeedsUpdate)
        XCTAssertEqual(AdminIncidentCommunicationPlan(
            operationsState: .paused,
            announcements: [livePause],
            sourceIsCurrent: true,
            now: now
        ).state, .pausedUpdateLive)
        let conflictPlan = AdminIncidentCommunicationPlan(
            operationsState: .liveCommerce,
            announcements: [livePause, fullRecovery],
            sourceIsCurrent: true,
            now: now
        )
        XCTAssertEqual(conflictPlan.state, .livePauseNoticeConflict)
        XCTAssertEqual(conflictPlan.actionNoticeID, livePause.id)
        XCTAssertEqual(AdminIncidentCommunicationPlan(
            operationsState: .liveCommerce,
            announcements: [hiddenPause],
            sourceIsCurrent: true,
            now: now
        ).state, .recoveryUpdateNeeded)
        let commerceRecoveryPlan = AdminIncidentCommunicationPlan(
            operationsState: .liveCommerce,
            announcements: [hiddenPause, fullRecovery],
            sourceIsCurrent: true,
            now: now
        )
        XCTAssertEqual(commerceRecoveryPlan.state, .recoveryUpdateLive)
        XCTAssertEqual(commerceRecoveryPlan.actionNoticeID, fullRecovery.id)
        XCTAssertEqual(AdminIncidentCommunicationPlan(
            operationsState: .bookingsOpen,
            announcements: [hiddenPause, fullRecovery],
            sourceIsCurrent: true,
            now: now
        ).state, .recoveryUpdateNeeded)
        let bookingsRecoveryPlan = AdminIncidentCommunicationPlan(
            operationsState: .bookingsOpen,
            announcements: [hiddenPause, bookingsRecovery],
            sourceIsCurrent: true,
            now: now
        )
        XCTAssertEqual(bookingsRecoveryPlan.state, .recoveryUpdateLive)
        XCTAssertEqual(bookingsRecoveryPlan.actionNoticeID, bookingsRecovery.id)

        let oldHiddenPause = notice(
            title: AdminAnnouncementDraft.memberOperationsPausedTitle,
            body: AdminAnnouncementDraft.memberOperationsPaused().body,
            publishedAt: nil,
            firstPublishedAt: now.addingTimeInterval(
                -AdminIncidentCommunicationPlan.recoveryWindow - 1
            )
        )
        XCTAssertEqual(AdminIncidentCommunicationPlan(
            operationsState: .liveCommerce,
            announcements: [oldHiddenPause],
            sourceIsCurrent: true,
            now: now
        ).state, .normal)
    }

    func testOperationalRefreshPolicyReportsHonestQueueFreshness() {
        let now = Date(timeIntervalSince1970: 10_000)

        XCTAssertEqual(
            AdminOperationalRefreshPolicy.freshness(
                hasCompletedRefresh: false,
                updatedAt: nil,
                isRefreshing: false,
                now: now
            ),
            .loading
        )
        XCTAssertEqual(
            AdminOperationalRefreshPolicy.freshness(
                hasCompletedRefresh: true,
                updatedAt: nil,
                isRefreshing: false,
                now: now
            ),
            .unavailable
        )
        XCTAssertEqual(
            AdminOperationalRefreshPolicy.freshness(
                hasCompletedRefresh: true,
                updatedAt: now.addingTimeInterval(-30),
                isRefreshing: true,
                now: now
            ),
            .refreshing
        )
        XCTAssertEqual(
            AdminOperationalRefreshPolicy.freshness(
                hasCompletedRefresh: true,
                updatedAt: now.addingTimeInterval(-AdminOperationalRefreshPolicy.staleAfter),
                isRefreshing: false,
                now: now
            ),
            .current
        )
        XCTAssertEqual(
            AdminOperationalRefreshPolicy.freshness(
                hasCompletedRefresh: true,
                updatedAt: now.addingTimeInterval(-30),
                isRefreshing: false,
                hasUnavailableSources: true,
                now: now
            ),
            .stale
        )
        XCTAssertEqual(
            AdminOperationalRefreshPolicy.freshness(
                hasCompletedRefresh: true,
                updatedAt: now.addingTimeInterval(-AdminOperationalRefreshPolicy.staleAfter - 1),
                isRefreshing: false,
                now: now
            ),
            .stale
        )
        XCTAssertEqual(AdminOperationalRefreshPolicy.intervalNanoseconds, 60_000_000_000)
    }

    func testWorkspaceOrderIsCompleteAccountScopedAndDrivesNavigation() throws {
        let suiteName = "XertWorkspaceOrderStoreTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let firstUser = UUID()
        let secondUser = UUID()
        let preferred: [XertPrimaryDestination] = [.booking, .events, .home, .account, .explore]

        XCTAssertEqual(XertWorkspaceOrderStore.load(for: nil, defaults: defaults), XertPrimaryDestination.dockOrder)
        XCTAssertEqual(XertWorkspaceOrderStore.save(preferred, for: firstUser, defaults: defaults), preferred)
        XCTAssertEqual(XertWorkspaceOrderStore.load(for: firstUser, defaults: defaults), preferred)
        XCTAssertEqual(XertWorkspaceOrderStore.load(for: secondUser, defaults: defaults), XertPrimaryDestination.dockOrder)
        XCTAssertEqual(
            XertWorkspaceOrderStore.normalized([.events, .events, .home]),
            [.events, .home, .booking, .explore, .account]
        )

        let malformed = Data("{\"version\":1,\"destinationRawValues\":[0,0,1,2,4]}".utf8)
        defaults.set(
            malformed,
            forKey: "xert.navigation.workspace-order.v1.\(firstUser.uuidString.lowercased())"
        )
        XCTAssertEqual(XertWorkspaceOrderStore.load(for: firstUser, defaults: defaults), XertPrimaryDestination.dockOrder)

        let navigation = XertNavigationCoordinator(initial: .booking)
        XCTAssertTrue(navigation.step(.next, order: preferred))
        XCTAssertEqual(navigation.selection, .events)
        XCTAssertTrue(navigation.step(.previous, order: preferred))
        XCTAssertEqual(navigation.selection, .booking)
        XCTAssertFalse(navigation.step(.previous, order: preferred))

        let commands = navigation.commandPaletteCommands(
            isAdmin: false,
            orderedDestinations: preferred
        )
        XCTAssertEqual(
            commands.compactMap { command -> XertPrimaryDestination? in
                guard case .destination(let destination) = command.action else { return nil }
                return destination
            },
            [.events, .home, .account, .explore]
        )
    }

    func testNavigationCommandPaletteIsContextualRoleAwareAndSearchable() {
        let navigation = XertNavigationCoordinator(initial: .home)
        XCTAssertTrue(navigation.select(.booking, source: .content))

        let memberCommands = navigation.commandPaletteCommands(isAdmin: false)
        XCTAssertFalse(memberCommands.contains {
            if case .owner = $0.action { return true }
            return false
        })
        XCTAssertTrue(memberCommands.contains { $0.action == .previous })
        XCTAssertTrue(memberCommands.contains { $0.action == .refresh })
        XCTAssertEqual(
            memberCommands.compactMap { command -> XertPrimaryDestination? in
                guard case .destination(let destination) = command.action else { return nil }
                return destination
            },
            XertPrimaryDestination.dockOrder.filter { $0 != .booking }
        )

        let ownerCommands = navigation.commandPaletteCommands(isAdmin: true)
        XCTAssertEqual(
            ownerCommands.compactMap { command -> XertOwnerWorkspace? in
                guard case .owner(let workspace) = command.action else { return nil }
                return workspace
            },
            XertOwnerWorkspace.allCases
        )
        XCTAssertEqual(
            XertNavigationCoordinator.filteredCommands(ownerCommands, query: "stripe refund").map(\.action),
            [.owner(.orders)]
        )
        XCTAssertEqual(
            XertNavigationCoordinator.filteredCommands(ownerCommands, query: "stripe revenue").map(\.action),
            [.owner(.finance)]
        )
        XCTAssertEqual(
            XertNavigationCoordinator.filteredCommands(memberCommands, query: "race calendar").map(\.action),
            [.destination(.events)]
        )
        XCTAssertTrue(
            XertNavigationCoordinator.filteredCommands(memberCommands, query: "not a command").isEmpty
        )
    }

    func testNavigationCommandPalettePromotesLiveMemberActivity() {
        let navigation = XertNavigationCoordinator(initial: .home)
        let bookingID = UUID(uuidString: "00000000-0000-0000-0000-000000000071")!
        let noticeID = UUID(uuidString: "00000000-0000-0000-0000-000000000073")!
        let context = XertNavigationContext(
            isSignedIn: true,
            noticeCount: 2,
            bookingCount: 1,
            creditCount: 7,
            eventGoalCount: 3,
            hasPendingCheckout: true,
            nextBooking: XertNextBookingNavigationContext(
                id: bookingID,
                title: "Engine Room",
                startTime: Date(timeIntervalSince1970: 1_800_000_000)
            ),
            memberRecords: [
                .booking(
                    id: bookingID,
                    title: "Engine Room",
                    status: "Booked",
                    startTime: Date(timeIntervalSince1970: 1_800_000_000)
                ),
                .notice(
                    id: noticeID,
                    title: "Friday floor closure",
                    tone: "urgent",
                    publishedAt: Date(timeIntervalSince1970: 1_799_000_000)
                ),
            ]
        )

        let commands = navigation.commandPaletteCommands(isAdmin: false, context: context)
        XCTAssertEqual(
            commands.filter { $0.section == .now }.map(\.action),
            [
                .activity(.pendingCheckout),
                .activity(.upcomingBookings(bookingID)),
                .activity(.notice(noticeID)),
                .activity(.notices),
                .activity(.eventGoals),
            ]
        )
        XCTAssertEqual(
            XertNavigationCoordinator.filteredCommands(commands, query: "stripe pending").map(\.action),
            [.activity(.pendingCheckout)]
        )
        XCTAssertTrue(commands.contains {
            $0.action == .destination(.booking) && $0.subtitle.contains("7 credits available")
        })
        XCTAssertTrue(commands.contains {
            $0.action == .activity(.upcomingBookings(bookingID))
                && $0.title == "Open class: Engine Room"
        })
        XCTAssertTrue(commands.contains {
            $0.action == .activity(.notice(noticeID))
                && $0.title == "Friday floor closure"
                && $0.subtitle.contains("Urgent")
        })
        XCTAssertFalse(
            navigation.commandPaletteCommands(isAdmin: false, context: .empty)
                .contains { $0.section == .now }
        )
    }

    func testNavigationMemberRecordIndexIsBoundedRankedAndPrivate() {
        let navigation = XertNavigationCoordinator(initial: .home)
        let baseDate = Date(timeIntervalSince1970: 1_800_000_000)
        let bookings = (0..<6).reversed().map { offset in
            XertMemberRecordNavigationContext.booking(
                id: UUID(),
                title: offset == 0 ? "   " : "Class \(offset)",
                status: "Booked",
                startTime: baseDate.addingTimeInterval(Double(offset) * 3_600)
            )
        }
        let duplicateBooking = bookings[0]
        let notices = [
            XertMemberRecordNavigationContext.notice(
                id: UUID(),
                title: "General update",
                tone: "info",
                publishedAt: baseDate
            ),
            XertMemberRecordNavigationContext.notice(
                id: UUID(),
                title: String(repeating: "U", count: 180),
                tone: "urgent",
                publishedAt: baseDate.addingTimeInterval(-3_600)
            ),
            XertMemberRecordNavigationContext.notice(
                id: UUID(),
                title: "Action needed",
                tone: "action",
                publishedAt: baseDate.addingTimeInterval(3_600)
            ),
        ]
        let publicSessions = (0..<6).reversed().map { offset in
            XertMemberRecordNavigationContext.classSession(
                id: UUID(),
                title: "Open Class \(offset)",
                coach: "Coach Morgan",
                location: "Floor",
                spotsLeft: offset,
                startTime: baseDate.addingTimeInterval(Double(offset) * 1_800)
            )
        }
        let signedInContext = XertNavigationContext(
            isSignedIn: true,
            noticeCount: notices.count,
            bookingCount: bookings.count,
            creditCount: 0,
            eventGoalCount: 0,
            hasPendingCheckout: false,
            memberRecords: bookings + [duplicateBooking] + notices + publicSessions
        )

        XCTAssertEqual(
            signedInContext.memberRecords.filter { $0.kind == .booking }.count,
            XertMemberRecordNavigationContext.maximumRecordsPerKind
        )
        XCTAssertEqual(
            signedInContext.memberRecords.filter { $0.kind == .booking }.map(\.timestamp),
            Array(bookings.map(\.timestamp).sorted().prefix(4))
        )
        XCTAssertEqual(
            signedInContext.memberRecords.filter { $0.kind == .notice }.map(\.priority),
            [0, 1, 2]
        )
        XCTAssertEqual(
            signedInContext.memberRecords.filter { $0.kind == .classSession }.count,
            XertMemberRecordNavigationContext.maximumRecordsPerKind
        )
        XCTAssertEqual(
            signedInContext.memberRecords.first { $0.kind == .notice }?.title.count,
            XertMemberRecordNavigationContext.maximumTitleLength
        )

        let commands = navigation.commandPaletteCommands(
            isAdmin: false,
            context: signedInContext
        )
        XCTAssertEqual(
            commands.filter {
                if case .activity(.upcomingBookings(let id)) = $0.action { return id != nil }
                return false
            }.count,
            XertMemberRecordNavigationContext.maximumRecordsPerKind
        )
        XCTAssertTrue(commands.contains {
            $0.action == .activity(.upcomingBookings(nil))
                && $0.title == "View all 6 upcoming bookings"
        })
        XCTAssertEqual(
            XertNavigationCoordinator.filteredCommands(commands, query: "urgent").first?.action,
            .activity(.notice(notices[1].id))
        )

        let signedOutContext = XertNavigationContext(
            isSignedIn: false,
            noticeCount: notices.count,
            bookingCount: bookings.count,
            creditCount: 0,
            eventGoalCount: 0,
            hasPendingCheckout: false,
            memberRecords: bookings + notices + publicSessions
        )
        XCTAssertEqual(
            signedOutContext.memberRecords.map(\.kind),
            Array(
                repeating: XertMemberRecordKind.classSession,
                count: XertMemberRecordNavigationContext.maximumRecordsPerKind
            )
        )
        let guestCommands = navigation.commandPaletteCommands(
            isAdmin: false,
            context: signedOutContext
        )
        XCTAssertFalse(guestCommands.contains { $0.section == .now })
        XCTAssertEqual(
            guestCommands.filter { $0.section == .discover }.count,
            XertMemberRecordNavigationContext.maximumRecordsPerKind
        )
        XCTAssertEqual(
            XertNavigationCoordinator.filteredCommands(guestCommands, query: "coach morgan").first?.action,
            .activity(.classSession(publicSessions.last!.id))
        )
    }

    func testNavigationStatusSignalsRouteToTheirOwningWorkspaces() {
        let bookingID = UUID(uuidString: "00000000-0000-0000-0000-000000000072")!
        let context = XertNavigationContext(
            isSignedIn: true,
            noticeCount: 120,
            bookingCount: 2,
            creditCount: 7,
            eventGoalCount: 3,
            hasPendingCheckout: true,
            nextBooking: XertNextBookingNavigationContext(
                id: bookingID,
                title: "Performance Lab",
                startTime: Date(timeIntervalSince1970: 1_800_000_000)
            )
        )
        let snapshot = XertNavigationStatusSnapshot(context: context)

        XCTAssertEqual(snapshot.status(for: .home)?.badgeText, "99+")
        XCTAssertEqual(snapshot.status(for: .home)?.accessibilityLabel, "120 active member notices")
        XCTAssertEqual(snapshot.status(for: .home)?.activity, .notices)
        XCTAssertEqual(snapshot.status(for: .booking)?.kind, .attention)
        XCTAssertEqual(snapshot.status(for: .booking)?.accessibilityLabel, "Purchase confirmation needs attention")
        XCTAssertEqual(snapshot.status(for: .booking)?.activity, .pendingCheckout)
        XCTAssertEqual(snapshot.priorityStatus?.destination, .booking)
        XCTAssertEqual(snapshot.status(for: .events)?.badgeText, "3")
        XCTAssertEqual(snapshot.status(for: .events)?.activity, .eventGoals)
        XCTAssertTrue(snapshot.status(for: .account)?.accessibilityLabel.contains("Performance Lab") == true)
        XCTAssertEqual(snapshot.status(for: .account)?.activity, .upcomingBookings(bookingID))
        XCTAssertEqual(snapshot.status(for: .account)?.actionTitle, "Open next class: Performance Lab")
        XCTAssertNil(snapshot.status(for: .explore))

        let withoutCheckout = XertNavigationStatusSnapshot(context: XertNavigationContext(
            isSignedIn: true,
            noticeCount: 1,
            bookingCount: 1,
            creditCount: 0,
            eventGoalCount: 1,
            hasPendingCheckout: false,
            nextBooking: context.nextBooking
        ))
        XCTAssertEqual(withoutCheckout.priorityStatus?.destination, .account)
        XCTAssertEqual(withoutCheckout.priorityStatus?.activity, .upcomingBookings(bookingID))

        let signedOutContext = XertNavigationContext(
            isSignedIn: false,
            noticeCount: 1,
            bookingCount: 1,
            creditCount: 1,
            eventGoalCount: 1,
            hasPendingCheckout: true,
            nextBooking: context.nextBooking
        )
        XCTAssertNil(signedOutContext.nextBooking)
        let signedOut = XertNavigationStatusSnapshot(context: signedOutContext)
        for destination in XertPrimaryDestination.allCases {
            XCTAssertNil(signedOut.status(for: destination))
        }
        XCTAssertNil(signedOut.priorityStatus)
    }

    func testNavigationCommandPaletteOffersBoundedDirectWorkspaceTimeline() throws {
        let firstNoticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000041"))
        let latestNoticeID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000042"))
        let navigation = XertNavigationCoordinator(initial: .home)

        XCTAssertTrue(navigation.open(.notices(firstNoticeID), source: .pushNotification))
        XCTAssertTrue(navigation.open(.sessionPacks, source: .content))
        XCTAssertTrue(navigation.open(.eventGoals, source: .commandPalette))
        XCTAssertTrue(navigation.open(.notices(latestNoticeID), source: .pushNotification))
        XCTAssertTrue(navigation.open(.purchaseConfirmation, source: .checkout))

        let commands = navigation.commandPaletteCommands(
            isAdmin: false,
            context: XertNavigationContext(
                isSignedIn: true,
                noticeCount: 0,
                bookingCount: 0,
                creditCount: 0,
                eventGoalCount: 0,
                hasPendingCheckout: false
            )
        )
        XCTAssertEqual(
            commands.filter { $0.section == .recent }.map(\.action),
            [
                .timeline(4),
                .timeline(3),
                .timeline(2),
                .timeline(1),
                .timeline(0),
            ]
        )
        XCTAssertEqual(
            XertNavigationCoordinator.filteredCommands(commands, query: "recent session").map(\.action),
            [.timeline(2)]
        )
        XCTAssertTrue(commands.contains { $0.action == .timeline(1) })
        XCTAssertFalse(commands.contains { $0.action == .timeline(5) })
    }

    func testPinnedWorkspacesAreBoundedNormalizedAndAccountScoped() throws {
        let suiteName = "XertPinnedWorkspaceStoreTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let firstUser = UUID()
        let secondUser = UUID()
        let noticeID = UUID()
        let bookingID = UUID()

        XCTAssertEqual(
            XertPinnedWorkspaceStore.toggle(.notices(noticeID), for: firstUser, defaults: defaults),
            [.notices(nil)]
        )
        XCTAssertEqual(
            XertPinnedWorkspaceStore.toggle(.upcomingBookings(bookingID), for: firstUser, defaults: defaults),
            [.upcomingBookings(nil), .notices(nil)]
        )
        XCTAssertEqual(
            XertPinnedWorkspaceStore.toggle(.purchaseConfirmation, for: firstUser, defaults: defaults),
            [.upcomingBookings(nil), .notices(nil)]
        )
        XCTAssertTrue(XertPinnedWorkspaceStore.load(for: secondUser, defaults: defaults).isEmpty)
        XCTAssertTrue(XertPinnedWorkspaceStore.load(for: nil, defaults: defaults).isEmpty)

        for route in [XertMemberRoute.home, .booking, .sessionPacks, .events, .eventGoals, .explore, .account] {
            _ = XertPinnedWorkspaceStore.toggle(route, for: firstUser, defaults: defaults)
        }
        let bounded = XertPinnedWorkspaceStore.load(for: firstUser, defaults: defaults)
        XCTAssertEqual(bounded.count, XertPinnedWorkspaceSnapshot.maximumRouteCount)
        XCTAssertEqual(bounded.first, .account)
        XCTAssertFalse(bounded.contains(.notices(nil)))
    }

    func testPinnedWorkspaceCommandsAreDirectAndAuthorizationAware() {
        let navigation = XertNavigationCoordinator(initial: .home)
        let pins: [XertMemberRoute] = [.eventGoals, .sessionPacks, .eventGoals]

        let signedOut = navigation.commandPaletteCommands(
            isAdmin: false,
            context: .empty,
            pinnedRoutes: pins
        )
        XCTAssertFalse(signedOut.contains { $0.action == .pinned(.eventGoals) })
        XCTAssertTrue(signedOut.contains { $0.action == .pinned(.sessionPacks) })

        let signedIn = navigation.commandPaletteCommands(
            isAdmin: false,
            context: XertNavigationContext(
                isSignedIn: true,
                noticeCount: 0,
                bookingCount: 0,
                creditCount: 0,
                eventGoalCount: 0,
                hasPendingCheckout: false
            ),
            pinnedRoutes: pins
        )
        XCTAssertEqual(
            signedIn.filter { $0.section == .pinned }.map(\.action),
            [.pinned(.eventGoals), .pinned(.sessionPacks)]
        )
    }

    func testAdminRoleAndOperationalModelsDecodeFromSupabase() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let profile = try decoder.decode(MemberProfile.self, from: Data("""
        {"id":"00000000-0000-0000-0000-000000000001","full_name":"Owner","phone":null,"email":"owner@xert.com","role":"admin"}
        """.utf8))
        XCTAssertTrue(profile.isAdmin)

        let operation = try decoder.decode(AdminDailyOperation.self, from: Data("""
        {"session_id":"00000000-0000-0000-0000-000000000002","title":"XERT Engine","class_type":"conditioning","start_time":"2026-07-14T06:00:00Z","end_time":"2026-07-14T07:00:00Z","status":"published","capacity":12,"coach_name":"Byron","location_zone":"Floor","booking_mode":"instant","requested_count":2,"confirmed_count":7,"waitlist_count":1,"attended_count":0,"no_show_count":0,"public_request_count":1,"attendance_due":false}
        """.utf8))
        XCTAssertEqual(operation.activeCount, 9)
        XCTAssertEqual(operation.waitlist_count, 1)
    }

    func testAdminRetentionReasonsAreOwnerReadable() {
        let followUp = AdminFollowUp(
            id: UUID(), full_name: "Alex", email: "alex@example.com", phone: nil,
            role: "member", joined_at: Date(), credits_remaining: 3, bookings_count: 4,
            last_attended_at: nil, next_booking_at: nil, last_follow_up_at: nil,
            reason: "credits_expiring", priority: 1, credits_expiring: 2,
            next_credit_expiry: Date().addingTimeInterval(86_400)
        )
        XCTAssertEqual(followUp.displayName, "Alex")
        XCTAssertEqual(followUp.reasonLabel, "Credits expiring soon")
    }

    func testNativeAdminRequestAndAnnouncementModelsDecode() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let request = try decoder.decode(AdminPTRequest.self, from: Data("""
        {"id":"00000000-0000-0000-0000-000000000003","full_name":"Alex","email":"alex@example.com","phone":"0400000000","requested_session_type":"Personal training","preferred_day":"Friday","preferred_time":"Morning","training_goal":"Strength","experience_level":"Intermediate","notes":null,"admin_notes":null,"status":"requested","created_at":"2026-07-14T06:00:00Z"}
        """.utf8))
        XCTAssertTrue(request.isPending)
        XCTAssertEqual(request.displayName, "Alex")
        XCTAssertTrue(request.searchableText.contains("strength"))
        XCTAssertEqual(request.allowedNextStatuses, ["approved", "reschedule_requested", "declined"])

        let report = AdminPTRequestReport(rows: [request])
        XCTAssertEqual(report.requestedCount, 1)
        XCTAssertTrue(report.csv.contains("\"Alex\""))
        XCTAssertTrue(report.csv.contains("\"Personal training\""))
        XCTAssertFalse(report.csv.contains("Strength"))
        XCTAssertFalse(report.csv.contains("Intermediate"))

        let announcement = try decoder.decode(AdminAnnouncement.self, from: Data("""
        {"id":"00000000-0000-0000-0000-000000000004","title":"Class update","body":"Tonight's class starts at six.","tone":"info","audience":"all","cta_label":null,"cta_url":null,"published_at":"2026-07-14T06:00:00Z","expires_at":null,"archived_at":null,"created_at":"2026-07-14T05:00:00Z","updated_at":"2026-07-14T06:00:00.123456+00:00"}
        """.utf8))
        XCTAssertEqual(announcement.stateLabel, "Live")
    }

    func testNativeAdminSchemaReadinessNamesMissingCapabilities() {
        let installed = AdminSchemaReadiness.required
            .filter { $0 != "targeted_member_notices" }
            .map { AdminSchemaCapability(capability: $0, installed_at: nil) }
        XCTAssertEqual(AdminSchemaReadiness.missing(from: installed), ["targeted_member_notices"])
    }

    func testPendingCheckoutRoundTripsForTheSameUser() throws {
        let suiteName = "PendingCheckoutTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let userID = UUID()
        let orderIDs: Set<UUID> = [UUID(), UUID()]
        let startedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let activationSessionID = UUID()
        let pending = PendingCheckout(
            userID: userID,
            baselineOrderIDs: orderIDs,
            startedAt: startedAt,
            checkoutSessionID: "cs_test_exact",
            activationSessionID: activationSessionID
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

        let legacy = LegacyPendingCheckout(
            userID: userID,
            baselineCreditTotal: 3,
            baselineOrderIDs: orderIDs,
            startedAt: startedAt
        )
        defaults.set(try JSONEncoder().encode(legacy), forKey: PendingCheckoutStore.storageKey)
        let migrated = PendingCheckoutStore.load(for: userID, now: startedAt, defaults: defaults)
        XCTAssertEqual(migrated?.userID, pending.userID)
        XCTAssertEqual(migrated?.baselineOrderIDs, pending.baselineOrderIDs)
        XCTAssertEqual(migrated?.startedAt, pending.startedAt)
        XCTAssertNil(migrated?.checkoutSessionID)
        XCTAssertNil(migrated?.activationSessionID)
    }

    func testPendingCheckoutRejectsAnotherUserAndExpires() throws {
        let suiteName = "PendingCheckoutExpiryTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let userID = UUID()
        let startedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let pending = PendingCheckout(
            userID: userID,
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

    func testPendingCheckoutReturnMustMatchStoredIdentity() throws {
        let suiteName = "PendingCheckoutReturnTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let userID = UUID()
        let baselineOrderIDs: Set<UUID> = [UUID()]
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let pending = PendingCheckout(
            userID: userID,
            baselineOrderIDs: baselineOrderIDs,
            startedAt: now,
            checkoutSessionID: "cs_test_ReturnRecovery123"
        )
        PendingCheckoutStore.save(pending, defaults: defaults)

        let matched = try XCTUnwrap(PendingCheckoutStore.resolve(
            for: userID,
            callbackSessionID: "cs_test_ReturnRecovery123",
            now: now,
            defaults: defaults
        ))
        XCTAssertEqual(matched, pending)

        XCTAssertNil(PendingCheckoutStore.resolve(
            for: userID,
            callbackSessionID: "cs_test_DifferentReturn456",
            now: now.addingTimeInterval(60),
            defaults: defaults
        ))
        XCTAssertEqual(
            PendingCheckoutStore.load(for: userID, now: now, defaults: defaults),
            pending
        )
        XCTAssertEqual(
            PendingCheckoutStore.resolve(
                for: userID,
                callbackSessionID: nil,
                now: now,
                defaults: defaults
            ),
            pending
        )

        PendingCheckoutStore.clear(defaults: defaults)
        XCTAssertNil(PendingCheckoutStore.resolve(
            for: userID,
            callbackSessionID: "cs_test_ReturnRecovery123",
            now: now,
            defaults: defaults
        ))
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

    func testMemberLocalStateClearsAccountLinkedIdentifiersAndPreferences() throws {
        let suiteName = "MemberLocalStateTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let userID = UUID()
        let bookingID = UUID()
        let announcementID = UUID()

        _ = XertWorkspaceOrderStore.save(
            Array(XertPrimaryDestination.dockOrder.reversed()),
            for: userID,
            defaults: defaults
        )
        _ = XertPinnedWorkspaceStore.toggle(.events, for: userID, defaults: defaults)
        _ = XertOwnerWorkspacePinsStore.toggle(.members, for: userID, defaults: defaults)
        PendingCheckoutStore.save(
            PendingCheckout(
                userID: userID,
                baselineOrderIDs: [UUID()],
                startedAt: Date(),
                checkoutSessionID: "cs_test_LocalClear123"
            ),
            defaults: defaults
        )
        ClassReminderNavigation.markPending(bookingID: bookingID, defaults: defaults)
        AnnouncementPushNavigation.markPending(announcementID: announcementID, defaults: defaults)
        _ = XertQuickActionNavigation.markPending(
            shortcutType: XertQuickActionNavigation.bookingsType,
            defaults: defaults
        )
        ClassReminderPreference.setEnabled(true, defaults: defaults)
        MemberPushPreference.setEnabled(true, defaults: defaults)
        AppPrivacyLock.setEnabled(true, defaults: defaults)
        PushDeviceTokenStore.save(
            DevicePushToken(value: "device-token", environment: "sandbox"),
            defaults: defaults
        )
        AdminSiteContentDraftStore.save(
            AdminSiteContentData(headline: "Private owner draft"),
            section: .hero,
            ownerID: userID,
            defaults: defaults
        )

        MemberLocalState.clear(for: userID, defaults: defaults)

        XCTAssertEqual(
            XertWorkspaceOrderStore.load(for: userID, defaults: defaults),
            XertPrimaryDestination.dockOrder
        )
        XCTAssertTrue(XertPinnedWorkspaceStore.load(for: userID, defaults: defaults).isEmpty)
        XCTAssertTrue(XertOwnerWorkspacePinsStore.load(for: userID, defaults: defaults).isEmpty)
        XCTAssertNil(defaults.data(forKey: PendingCheckoutStore.storageKey))
        XCTAssertNil(defaults.object(forKey: ClassReminderNavigation.pendingBookingIDKey))
        XCTAssertNil(defaults.object(forKey: AnnouncementPushNavigation.pendingAnnouncementIDKey))
        XCTAssertNil(defaults.object(forKey: XertQuickActionNavigation.pendingShortcutTypeKey))
        XCTAssertFalse(ClassReminderPreference.isEnabled(defaults: defaults))
        XCTAssertFalse(MemberPushPreference.isEnabled(defaults: defaults))
        XCTAssertFalse(AppPrivacyLock.isEnabled(defaults: defaults))
        XCTAssertNil(PushDeviceTokenStore.load(defaults: defaults))
        XCTAssertNil(AdminSiteContentDraftStore.load(.hero, ownerID: userID, defaults: defaults))
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
        XCTAssertEqual(Set(XertDataSource.allCases).count, 14)
        XCTAssertEqual(XertDataSource.sessions.displayName, "class timetable")
        XCTAssertEqual(XertDataSource.eventGoals.displayName, "training goals")
        XCTAssertEqual(XertDataSource.orders.displayName, "purchase history")
        XCTAssertEqual(XertDataSource.announcements.displayName, "member notices")
        XCTAssertEqual(XertDataSource.coaches.displayName, "coaches and practitioners")
        XCTAssertEqual(XertDataSource.siteContent.displayName, "public site content")
        XCTAssertEqual(XertDataSource.platformSettings.displayName, "booking and pack purchase availability")
        XCTAssertEqual(XertDataSource.onboarding.displayName, "member readiness")
    }

    func testMemberAnnouncementDecodesPriorityAndExpiry() throws {
        let data = Data("""
        {
          "id": "11111111-1111-4111-8111-111111111111",
          "title": "Class location update",
          "body": "Saturday training has moved indoors.",
          "tone": "action",
          "cta_label": "Book A Class",
          "cta_url": "/booking",
          "published_at": "2026-07-13T04:00:00Z",
          "expires_at": "2026-07-14T04:00:00Z",
          "updated_at": "2026-07-13T04:00:00Z"
        }
        """.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let announcement = try decoder.decode(MemberAnnouncement.self, from: data)

        XCTAssertEqual(announcement.priorityLabel, "Action requested")
        XCTAssertNotNil(announcement.expires_at)
        XCTAssertEqual(announcement.action?.label, "Book A Class")
        XCTAssertEqual(announcement.action?.nativeTab, .booking)
    }

    func testMemberAnnouncementActionsRouteNativeTabsAndRejectUnsafeLinks() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        func announcement(url: String) throws -> MemberAnnouncement {
            let data = Data("""
            {
              "id": "11111111-1111-4111-8111-111111111111",
              "title": "Action",
              "body": "Take action now.",
              "tone": "info",
              "cta_label": "Open",
              "cta_url": "\(url)",
              "published_at": "2026-07-13T04:00:00Z",
              "expires_at": null,
              "updated_at": "2026-07-13T04:00:00Z"
            }
            """.utf8)
            return try decoder.decode(MemberAnnouncement.self, from: data)
        }

        XCTAssertEqual(try announcement(url: "/events").action?.nativeTab, .events)
        XCTAssertEqual(try announcement(url: "/account").action?.nativeTab, .account)
        XCTAssertEqual(try announcement(url: "https://events.example.com/register").action?.url.host, "events.example.com")
        XCTAssertNil(try announcement(url: "http://events.example.com").action)
        XCTAssertNil(try announcement(url: "//events.example.com").action)
        XCTAssertNil(try announcement(url: "https://user:pass@events.example.com").action)
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

    func testCreditBatchDecodesPurchasedOrderIdentityAtZeroRemaining() throws {
        let orderID = try XCTUnwrap(UUID(uuidString: "08B68EA8-ACF9-4F40-A050-9BA12D7252DB"))
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "order_id": "\(orderID.uuidString)",
          "total": 10,
          "remaining": 0,
          "expires_at": null
        }
        """.data(using: .utf8)!

        let batch = try JSONDecoder().decode(CreditBatch.self, from: data)

        XCTAssertEqual(batch.total, 10)
        XCTAssertEqual(batch.remaining, 0)
        XCTAssertEqual(batch.order_id, orderID)
    }

    func testCreditExpirySummaryIncludesOnlyActiveCreditsInsideSevenDays() throws {
        let now = Date(timeIntervalSince1970: 1_784_006_400)
        let batches = [
            CreditBatch(id: UUID(), total: 2, remaining: 2, expires_at: now.addingTimeInterval(2 * 86_400)),
            CreditBatch(id: UUID(), total: 1, remaining: 1, expires_at: now.addingTimeInterval((2 * 86_400) + 3_600)),
            CreditBatch(id: UUID(), total: 3, remaining: 3, expires_at: now.addingTimeInterval(6 * 86_400)),
            CreditBatch(id: UUID(), total: 4, remaining: 4, expires_at: now.addingTimeInterval(8 * 86_400)),
            CreditBatch(id: UUID(), total: 5, remaining: 5, expires_at: nil),
            CreditBatch(id: UUID(), total: 1, remaining: 0, expires_at: now.addingTimeInterval(86_400)),
        ]

        let summary = try XCTUnwrap(batches.expirySummary(now: now))

        XCTAssertEqual(summary.credits, 3)
        XCTAssertEqual(summary.expiresAt, now.addingTimeInterval(2 * 86_400))
        XCTAssertEqual(summary.daysRemaining, 2)
    }

    func testCreditExpirySummaryExcludesExpiredAndDistantCredits() {
        let now = Date(timeIntervalSince1970: 1_784_006_400)
        let batches = [
            CreditBatch(id: UUID(), total: 2, remaining: 2, expires_at: now.addingTimeInterval(-86_400)),
            CreditBatch(id: UUID(), total: 4, remaining: 4, expires_at: now.addingTimeInterval(8 * 86_400)),
            CreditBatch(id: UUID(), total: 5, remaining: 5, expires_at: nil),
        ]

        XCTAssertNil(batches.expirySummary(now: now))
    }

    func testCheckoutReconciliationRequiresThePaidOrdersFulfillmentBatch() {
        let baselineOrderID = UUID()
        let newOrderID = UUID()
        let unrelatedOrderID = UUID()
        let baselineOrderIDs: Set<UUID> = [baselineOrderID]
        let consumedFulfillmentBatch = [creditBatch(remaining: 0, orderID: newOrderID)]
        let paidOrder = order(id: newOrderID, status: "paid")

        XCTAssertFalse(CheckoutReconciliation.hasSettled(
            baselineOrderIDs: baselineOrderIDs,
            credits: [],
            orders: [paidOrder]
        ))
        XCTAssertFalse(CheckoutReconciliation.hasSettled(
            baselineOrderIDs: baselineOrderIDs,
            credits: consumedFulfillmentBatch,
            orders: [order(id: newOrderID, status: "pending")]
        ))
        XCTAssertFalse(CheckoutReconciliation.hasSettled(
            baselineOrderIDs: baselineOrderIDs,
            credits: [creditBatch(remaining: 4, orderID: baselineOrderID)],
            orders: [order(id: baselineOrderID, status: "paid")]
        ))
        XCTAssertFalse(CheckoutReconciliation.hasSettled(
            baselineOrderIDs: baselineOrderIDs,
            credits: [creditBatch(remaining: 4, orderID: unrelatedOrderID)],
            orders: [paidOrder]
        ))
        XCTAssertTrue(CheckoutReconciliation.hasSettled(
            baselineOrderIDs: baselineOrderIDs,
            credits: consumedFulfillmentBatch,
            orders: [paidOrder]
        ))
    }

    func testCheckoutReconciliationUsesTheExactStripeSessionAndClosesTerminalStates() {
        let expectedOrderID = UUID()
        let unrelatedOrderID = UUID()
        let pending = PendingCheckout(
            userID: UUID(),
            baselineOrderIDs: [],
            startedAt: Date(),
            checkoutSessionID: "cs_test_exact"
        )

        XCTAssertEqual(CheckoutReconciliation.settlement(
            pendingCheckout: pending,
            credits: [creditBatch(remaining: 4, orderID: unrelatedOrderID)],
            orders: [order(id: unrelatedOrderID, status: "paid", checkoutSessionID: "cs_test_other")]
        ), .pending)
        XCTAssertEqual(CheckoutReconciliation.settlement(
            pendingCheckout: pending,
            credits: [creditBatch(remaining: 0, orderID: expectedOrderID)],
            orders: [order(id: expectedOrderID, status: "paid", checkoutSessionID: "cs_test_exact")]
        ), .confirmed)
        XCTAssertEqual(CheckoutReconciliation.settlement(
            pendingCheckout: pending,
            credits: [],
            orders: [order(id: expectedOrderID, status: "failed", checkoutSessionID: "cs_test_exact")]
        ), .failed)
        XCTAssertEqual(CheckoutReconciliation.settlement(
            pendingCheckout: pending,
            credits: [],
            orders: [order(id: expectedOrderID, status: "refunded", checkoutSessionID: "cs_test_exact")]
        ), .refunded)
    }

    func testCheckoutCallbackCarriesOnlyAValidatedStripeSessionIdentity() throws {
        let callback = try XCTUnwrap(CheckoutDeepLink.callback(from: try XCTUnwrap(
            URL(string: "xertfitness://checkout?status=success&checkout_session_id=cs_test_XertReturn123")
        )))
        XCTAssertEqual(callback.status, .success)
        XCTAssertEqual(callback.checkoutSessionID, "cs_test_XertReturn123")

        let legacy = try XCTUnwrap(CheckoutDeepLink.callback(from: try XCTUnwrap(
            URL(string: "xertfitness://checkout?status=cancelled")
        )))
        XCTAssertEqual(legacy.status, .cancelled)
        XCTAssertNil(legacy.checkoutSessionID)

        XCTAssertNil(CheckoutDeepLink.callback(from: try XCTUnwrap(
            URL(string: "xertfitness://checkout?status=success&checkout_session_id=not-stripe")
        )))
        XCTAssertNil(CheckoutSessionIdentity.normalize("cs_test_" + String(repeating: "A", count: 256)))
        XCTAssertNil(CheckoutDeepLink.callback(from: try XCTUnwrap(
            URL(string: "other://checkout?status=success&checkout_session_id=cs_test_XertReturn123")
        )))
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

    func testRefundedOrderUsesRefundAuditValues() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "status": "refunded",
          "amount_cents": 4800,
          "currency": "aud",
          "created_at": "2026-07-12T01:00:00Z",
          "paid_at": "2026-07-12T01:01:00Z",
          "refunded_at": "2026-07-13T02:30:00Z",
          "refunded_amount_cents": 4800,
          "products": { "name": "4 Class Starter Pack" }
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let order = try decoder.decode(OrderItem.self, from: data)

        XCTAssertEqual(order.displayStatus, "Refunded")
        XCTAssertTrue(try XCTUnwrap(order.refundedAmount).contains("48"))
        XCTAssertEqual(order.activityDate, try XCTUnwrap(order.refunded_at))
    }

    func testAdminOrderDecodesRecoveryAndRefundControls() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "user_id": "0D07F153-ED81-4B24-BA8D-329F7B7233AE",
          "product_id": "447CC495-4A9E-4826-BF91-B07C12C94EE1",
          "email": "member@example.com",
          "status": "failed",
          "amount_cents": 4800,
          "currency": "aud",
          "stripe_checkout_session_id": "cs_test_recover",
          "stripe_payment_intent_id": null,
          "created_at": "2026-07-12T01:00:00Z",
          "paid_at": null,
          "refunded_at": null,
          "refunded_amount_cents": 0,
          "reconciled_at": null,
          "reconciled_by": null,
          "products": { "name": "4 Class Starter Pack" },
          "stripe_refunds": []
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let order = try decoder.decode(OrderItem.self, from: data)

        XCTAssertTrue(order.isRecoverable)
        XCTAssertFalse(order.isRefundable)
        XCTAssertEqual(order.email, "member@example.com")
        XCTAssertEqual(order.stripe_checkout_session_id, "cs_test_recover")
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
        XCTAssertTrue(APIError(message: "unauthorized", statusCode: 401).isUnauthorized)
        XCTAssertFalse(APIError(message: "invalid form", statusCode: 400).isUnauthorized)
        XCTAssertFalse(APIError(message: "forbidden", statusCode: 403).isUnauthorized)
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

    func testRuntimeConfigurationTrustsOnlyXERTOriginsAndPublicKeys() throws {
        let supabase = try XCTUnwrap(AppConfig.canonicalServiceURL(
            "https://ugmkwoapjcpiucsrxwzt.supabase.co/",
            expectedHost: AppConfig.supabaseHost
        ))
        let vercel = try XCTUnwrap(AppConfig.canonicalServiceURL(
            "https://xert-fitness.vercel.app",
            expectedHost: AppConfig.vercelHost
        ))
        XCTAssertTrue(AppConfig.isTrustedServiceBaseURL(supabase))
        XCTAssertTrue(AppConfig.isTrustedServiceBaseURL(vercel))

        for unsafe in [
            "http://ugmkwoapjcpiucsrxwzt.supabase.co",
            "https://another-project.supabase.co",
            "https://ugmkwoapjcpiucsrxwzt.supabase.co/rest/v1",
            "https://user:password@ugmkwoapjcpiucsrxwzt.supabase.co",
            "\thttps://ugmkwoapjcpiucsrxwzt.supabase.co"
        ] {
            XCTAssertNil(AppConfig.canonicalServiceURL(unsafe, expectedHost: AppConfig.supabaseHost))
        }
        XCTAssertFalse(AppConfig.isTrustedServiceBaseURL(URL(string: "https://example.com")!))

        let legacyAnon = "e30.eyJyb2xlIjoiYW5vbiJ9.signature"
        let legacyServiceRole = "e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature"
        XCTAssertTrue(AppConfig.isPublicSupabaseKey(legacyAnon))
        XCTAssertTrue(AppConfig.isPublicSupabaseKey("sb_publishable_abcdefghijklmnopqrstuvwx"))
        XCTAssertFalse(AppConfig.isPublicSupabaseKey(legacyServiceRole))
        XCTAssertFalse(AppConfig.isPublicSupabaseKey("sb_secret_abcdefghijklmnopqrstuvwx"))
        XCTAssertFalse(AppConfig.isPublicSupabaseKey("\t\(legacyAnon)"))
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

    func testFallbackEventConvertsToPublishedAdminSeedDraft() throws {
        let event = try XCTUnwrap(XertEventCalendar.fallback.first)
        let draft = AdminEventDraft(seed: event)

        XCTAssertEqual(draft.name, "Gold Coast Marathon")
        XCTAssertEqual(draft.category, "run")
        XCTAssertEqual(draft.startDateValue, "2026-07-04")
        XCTAssertEqual(draft.endDateValue, "2026-07-05")
        XCTAssertEqual(draft.location, "Gold Coast")
        XCTAssertEqual(draft.region, "South East Queensland")
        XCTAssertTrue(draft.published)
        XCTAssertEqual(draft.sortOrder, 1)
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
        let confirmed = booking(status: "confirmed", startTime: now.addingTimeInterval(26 * 60 * 60))
        let requested = booking(status: "requested", startTime: now.addingTimeInterval(26 * 60 * 60))
        let tooSoon = booking(status: "confirmed", startTime: now.addingTimeInterval(90 * 60))

        XCTAssertEqual(
            ClassReminderPlanner.reminderDate(for: confirmed.start_time, now: now),
            now.addingTimeInterval(24 * 60 * 60)
        )
        XCTAssertEqual(
            ClassReminderPlanner.reminderDate(for: confirmed.start_time, leadTime: .oneDay, now: now),
            now.addingTimeInterval(2 * 60 * 60)
        )
        XCTAssertEqual(
            ClassReminderPlanner.reminderBookings(from: [confirmed, requested, tooSoon], now: now).map(\.booking_id),
            [confirmed.booking_id]
        )
        XCTAssertEqual(
            ClassReminderPlanner.reminderBookings(
                from: [confirmed, requested, tooSoon],
                leadTime: .oneDay,
                now: now
            ).map(\.booking_id),
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

        XCTAssertEqual(ClassReminderPreference.leadTime(defaults: defaults), .twoHours)
        ClassReminderPreference.setLeadTime(.oneDay, defaults: defaults)
        XCTAssertEqual(ClassReminderPreference.leadTime(defaults: defaults), .oneDay)
        defaults.set("unsupported", forKey: ClassReminderPreference.leadTimeKey)
        XCTAssertEqual(ClassReminderPreference.leadTime(defaults: defaults), .twoHours)
    }

    func testClassReminderTapRoutingIsValidatedAndSurvivesColdLaunch() throws {
        let bookingID = UUID()
        XCTAssertEqual(ClassReminderNotification.bookingID(
            identifier: "\(ClassReminderNotification.identifierPrefix)\(bookingID.uuidString)",
            userInfo: [ClassReminderNotification.bookingIDKey: bookingID.uuidString]
        ), bookingID)
        XCTAssertNil(ClassReminderNotification.bookingID(
            identifier: "unmanaged.notification",
            userInfo: [ClassReminderNotification.bookingIDKey: bookingID.uuidString]
        ))
        XCTAssertNil(ClassReminderNotification.bookingID(
            identifier: "\(ClassReminderNotification.identifierPrefix)invalid",
            userInfo: [ClassReminderNotification.bookingIDKey: "not-a-uuid"]
        ))
        XCTAssertNil(ClassReminderNotification.bookingID(
            identifier: "\(ClassReminderNotification.identifierPrefix)\(UUID().uuidString)",
            userInfo: [ClassReminderNotification.bookingIDKey: bookingID.uuidString]
        ))

        let suiteName = "ClassReminderNavigationTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        XCTAssertNil(ClassReminderNavigation.consumePendingBookingID(defaults: defaults))
        ClassReminderNavigation.markPending(bookingID: bookingID, defaults: defaults)
        XCTAssertEqual(ClassReminderNavigation.consumePendingBookingID(defaults: defaults), bookingID)
        XCTAssertNil(ClassReminderNavigation.consumePendingBookingID(defaults: defaults))
    }

    func testMemberPushPreferenceAndDeviceTokenAreExplicitAndPersistent() throws {
        let suiteName = "MemberPushPreferenceTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertFalse(MemberPushPreference.isEnabled(defaults: defaults))
        MemberPushPreference.setEnabled(true, defaults: defaults)
        XCTAssertTrue(MemberPushPreference.isEnabled(defaults: defaults))

        let token = DevicePushToken(value: String(repeating: "ab", count: 32), environment: "sandbox")
        PushDeviceTokenStore.save(token, defaults: defaults)
        XCTAssertEqual(PushDeviceTokenStore.load(defaults: defaults), token)
        PushDeviceTokenStore.clear(defaults: defaults)
        XCTAssertNil(PushDeviceTokenStore.load(defaults: defaults))
    }

    func testAnnouncementPushRoutingSurvivesColdLaunchAndConsumesOnce() throws {
        let suiteName = "AnnouncementPushNavigationTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let announcementID = UUID()

        XCTAssertNil(AnnouncementPushNavigation.consumePendingAnnouncementID(defaults: defaults))
        AnnouncementPushNavigation.markPending(announcementID: announcementID, defaults: defaults)
        XCTAssertEqual(
            AnnouncementPushNavigation.consumePendingAnnouncementID(defaults: defaults),
            announcementID
        )
        XCTAssertNil(AnnouncementPushNavigation.consumePendingAnnouncementID(defaults: defaults))
    }

    func testQuickActionsMapToTypedRoutesAndSurviveColdLaunchOnce() throws {
        XCTAssertEqual(XertQuickActionNavigation.route(for: XertQuickActionNavigation.bookType), .booking)
        XCTAssertEqual(XertQuickActionNavigation.route(for: XertQuickActionNavigation.bookingsType), .upcomingBookings(nil))
        XCTAssertEqual(XertQuickActionNavigation.route(for: XertQuickActionNavigation.eventsType), .events)
        XCTAssertNil(XertQuickActionNavigation.route(for: "com.xertfitness.app.quick.unknown"))

        let suiteName = "XertQuickActionNavigationTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertFalse(XertQuickActionNavigation.markPending(
            shortcutType: "com.xertfitness.app.quick.unknown",
            defaults: defaults
        ))
        XCTAssertNil(XertQuickActionNavigation.consumePendingRoute(defaults: defaults))
        XCTAssertTrue(XertQuickActionNavigation.markPending(
            shortcutType: XertQuickActionNavigation.bookingsType,
            defaults: defaults
        ))
        XCTAssertEqual(
            XertQuickActionNavigation.consumePendingRoute(defaults: defaults),
            .upcomingBookings(nil)
        )
        XCTAssertNil(XertQuickActionNavigation.consumePendingRoute(defaults: defaults))

        defaults.set("tampered", forKey: XertQuickActionNavigation.pendingShortcutTypeKey)
        XCTAssertNil(XertQuickActionNavigation.consumePendingRoute(defaults: defaults))
        XCTAssertNil(defaults.string(forKey: XertQuickActionNavigation.pendingShortcutTypeKey))
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

    func testMemberCancellationReceiptExplainsOnlyTheServerOutcome() throws {
        let bookingID = try XCTUnwrap(UUID(
            uuidString: "00000000-0000-0000-0000-000000000099"
        ))
        let cancelledAt = Date(timeIntervalSince1970: 1_800_000_000)
        let returned = MemberBookingCancellationReceipt(
            cancelled_booking_id: bookingID,
            previous_status: "confirmed",
            credit_refund_eligible: true,
            credit_refunded: true,
            credit_outcome: "returned",
            cancelled_at: cancelledAt
        )
        let expired = MemberBookingCancellationReceipt(
            cancelled_booking_id: bookingID,
            previous_status: "requested",
            credit_refund_eligible: true,
            credit_refunded: false,
            credit_outcome: "expired",
            cancelled_at: cancelledAt
        )

        XCTAssertTrue(returned.memberMessage.contains("one class credit was returned"))
        XCTAssertTrue(expired.memberMessage.contains("credit pack had already expired"))
        XCTAssertFalse(expired.memberMessage.contains("credit was returned"))
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

    func testBookingTimeConflictsIgnoreWaitlistsAndAllowBackToBackClasses() {
        let target = classSession(
            spotsLeft: 4,
            startTime: queenslandDate(2026, 7, 14, 8, 0)
        )
        let overlap = booking(
            status: "confirmed",
            startTime: queenslandDate(2026, 7, 14, 8, 30),
            endTime: queenslandDate(2026, 7, 14, 9, 30)
        )
        let waitlist = booking(
            status: "waitlisted",
            startTime: queenslandDate(2026, 7, 14, 8, 15)
        )
        let backToBack = booking(
            status: "requested",
            startTime: queenslandDate(2026, 7, 14, 9, 0),
            endTime: queenslandDate(2026, 7, 14, 10, 0)
        )

        XCTAssertEqual(BookingItem.timeConflict(for: target, in: [waitlist, overlap])?.id, overlap.id)
        XCTAssertNil(BookingItem.timeConflict(for: target, in: [waitlist, backToBack]))
    }

    func testBookingDayUsesBrisbaneBoundariesWhileTravelling() {
        let reference = queenslandDate(2026, 7, 14, 23, 45)
        let sameBrisbaneDay = booking(
            status: "confirmed",
            startTime: queenslandDate(2026, 7, 14, 5, 30)
        )
        let nextBrisbaneDay = booking(
            status: "confirmed",
            startTime: queenslandDate(2026, 7, 15, 0, 15)
        )

        XCTAssertTrue(sameBrisbaneDay.occursOnBrisbaneDay(containing: reference))
        XCTAssertFalse(nextBrisbaneDay.occursOnBrisbaneDay(containing: reference))
    }

    func testTrainingProgressCountsOnlyRecordedAttendanceAndDeduplicatesSessions() {
        let now = queenslandDate(2026, 7, 21, 12, 0)
        let duplicateSessionID = UUID()
        let progress = MemberTrainingProgress(bookings: [
            booking(status: "attended", startTime: queenslandDate(2026, 7, 20, 18, 0), sessionID: duplicateSessionID),
            booking(status: "attended", startTime: queenslandDate(2026, 7, 20, 18, 0), sessionID: duplicateSessionID),
            booking(status: "attended", startTime: queenslandDate(2026, 7, 13, 18, 0)),
            booking(status: "attended", startTime: queenslandDate(2026, 6, 1, 18, 0)),
            booking(status: "confirmed", startTime: queenslandDate(2026, 7, 19, 18, 0)),
            booking(status: "no_show", startTime: queenslandDate(2026, 7, 12, 18, 0)),
            booking(status: "cancelled", startTime: queenslandDate(2026, 7, 10, 18, 0)),
            booking(status: "attended", startTime: queenslandDate(2026, 7, 22, 18, 0)),
        ], now: now)

        XCTAssertEqual(progress.totalAttended, 3)
        XCTAssertEqual(progress.attendedLast30Days, 2)
        XCTAssertEqual(progress.activeWeeksLastFour, 2)
        XCTAssertEqual(progress.lastAttendedAt, queenslandDate(2026, 7, 20, 18, 0))
    }

    func testTrainingProgressUsesMondayBrisbaneWeekBoundaries() {
        let now = queenslandDate(2026, 7, 20, 1, 30)
        let progress = MemberTrainingProgress(bookings: [
            booking(status: "attended", startTime: queenslandDate(2026, 7, 19, 23, 30)),
            booking(status: "attended", startTime: queenslandDate(2026, 7, 20, 0, 30)),
            booking(status: "attended", startTime: queenslandDate(2026, 6, 21, 23, 30)),
        ], now: now)

        XCTAssertEqual(progress.totalAttended, 3)
        XCTAssertEqual(progress.attendedLast30Days, 3)
        XCTAssertEqual(progress.activeWeeksLastFour, 2)
    }

    func testTrainingProgressHasAnHonestEmptyState() {
        let progress = MemberTrainingProgress(bookings: [], now: queenslandDate(2026, 7, 21, 12, 0))

        XCTAssertEqual(progress.totalAttended, 0)
        XCTAssertEqual(progress.attendedLast30Days, 0)
        XCTAssertEqual(progress.activeWeeksLastFour, 0)
        XCTAssertNil(progress.lastAttendedAt)
    }

    func testAdminMemberReportMatchesOwnerDirectoryExportAndEscapesCSV() throws {
        let joinedAt = try XCTUnwrap(
            ISO8601DateFormatter().date(from: "2026-07-27T03:15:00Z")
        )
        let member = AdminMemberSummary(
            id: UUID(),
            full_name: "Dene \"DP\", Palmer",
            email: "owner@example.com",
            phone: "0400 000 000",
            role: "admin",
            joined_at: joinedAt,
            credits_remaining: 7,
            bookings_count: 12,
            orders_count: 3,
            total_spent_cents: 12_345,
            total_count: 1
        )

        let csv = AdminMemberReport(rows: [member]).csv

        XCTAssertTrue(csv.hasPrefix(
            "\"Name\",\"Email\",\"Phone\",\"Role\",\"Credits\",\"Bookings\",\"Spent (AUD)\",\"Joined\"\n"
        ))
        XCTAssertTrue(csv.contains("\"Dene \"\"DP\"\", Palmer\""))
        XCTAssertTrue(csv.contains("\"123.45\""))
        XCTAssertTrue(csv.contains("\"2026-07-27T03:15:00Z\""))
        XCTAssertFalse(csv.contains("orders_count"))
        XCTAssertTrue(csv.hasSuffix("\n"))
    }

    func testAdminAccessSnapshotIdentifiesLaunchCoverageWithoutOverstatingPagedEvidence() {
        let ownerID = UUID()
        let backupID = UUID()
        let owner = AdminMemberSummary(
            id: ownerID,
            full_name: "Owner",
            email: "owner@example.com",
            phone: nil,
            role: "admin",
            joined_at: Date(timeIntervalSince1970: 0),
            credits_remaining: 0,
            bookings_count: 0,
            orders_count: 0,
            total_spent_cents: 0,
            total_count: 2
        )
        let backup = AdminMemberSummary(
            id: backupID,
            full_name: "Backup",
            email: "backup@example.com",
            phone: nil,
            role: "admin",
            joined_at: Date(timeIntervalSince1970: 1),
            credits_remaining: 0,
            bookings_count: 0,
            orders_count: 0,
            total_spent_cents: 0,
            total_count: 2
        )

        let ready = AdminAccessSnapshot(
            administrators: [owner, backup],
            totalCount: 2,
            currentUserID: ownerID
        )
        XCTAssertEqual(ready.administratorCount, 2)
        XCTAssertTrue(ready.hasOperationalBackup)
        XCTAssertTrue(ready.currentUserIsListed)
        XCTAssertTrue(ready.currentUserListingIsComplete)
        XCTAssertEqual(ready.statusTitle, "Access coverage ready")
        XCTAssertTrue(ready.statusDetail.contains("2 administrators"))

        let single = AdminAccessSnapshot(
            administrators: [owner],
            totalCount: 1,
            currentUserID: ownerID
        )
        XCTAssertFalse(single.hasOperationalBackup)
        XCTAssertEqual(single.statusTitle, "Single administrator")
        XCTAssertEqual(single.statusDetail, "Add one trusted backup administrator before launch.")

        let incompletePage = AdminAccessSnapshot(
            administrators: [backup],
            totalCount: 75,
            currentUserID: ownerID
        )
        XCTAssertFalse(incompletePage.currentUserIsListed)
        XCTAssertFalse(incompletePage.currentUserListingIsComplete)
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

    func testAdminProductDraftPreservesEditableCatalogueValues() {
        let product = AdminProduct(
            id: UUID(),
            slug: "ten-session-pack",
            name: "Ten Session Pack",
            description: "Train with purpose.",
            price_cents: 29900,
            currency: "aud",
            sessions_count: 10,
            validity_days: 90,
            stripe_price_id: "price_xert",
            featured: true,
            active: true,
            sort_order: 2,
            updated_at: "2026-07-14T00:00:00Z"
        )

        let draft = AdminProductDraft(product: product)

        XCTAssertEqual(draft.slug, "ten-session-pack")
        XCTAssertEqual(draft.name, "Ten Session Pack")
        XCTAssertEqual(draft.price, "299.00")
        XCTAssertEqual(draft.currency, "AUD")
        XCTAssertEqual(draft.sessions, 10)
        XCTAssertEqual(draft.validityDays, 90)
        XCTAssertEqual(draft.stripePriceID, "price_xert")
        XCTAssertTrue(draft.featured)
        XCTAssertTrue(draft.active)
    }

    func testAdminProductDraftValidatesExactMoneyAndStripeCommercialTerms() {
        let product = AdminProduct(
            id: UUID(),
            slug: "starter-4",
            name: "Starter Pack",
            description: nil,
            price_cents: 4800,
            currency: "aud",
            sessions_count: 4,
            validity_days: 28,
            stripe_price_id: "price_starter4",
            featured: true,
            active: true,
            sort_order: 2,
            updated_at: "2026-07-20T00:00:00Z"
        )

        var draft = AdminProductDraft(product: product)
        XCTAssertNil(draft.validationMessage(existingProduct: product))
        XCTAssertEqual(draft.normalizedPriceCents, 4800)

        draft.price = "48.009"
        XCTAssertEqual(
            draft.validationMessage(existingProduct: product),
            "Enter a positive price up to 21,474,836.47 with no more than two decimal places."
        )

        draft.price = "48.00"
        draft.sessions = 5
        XCTAssertEqual(
            draft.validationMessage(existingProduct: product),
            "Clear or replace the Stripe Price ID before changing price, currency, sessions or validity."
        )
    }

    func testAdminProductDraftParsesCommaMoneyAndCapsPostgresIntegerCents() {
        var draft = AdminProductDraft(suggestedSortOrder: 0)
        draft.slug = "locale-pack"
        draft.name = "Locale Pack"
        draft.price = "48,05"

        XCTAssertEqual(draft.normalizedPriceCents, 4_805)
        XCTAssertNil(draft.validationMessage(existingProduct: nil))

        draft.price = "21474836.47"
        XCTAssertEqual(draft.normalizedPriceCents, Int(Int32.max))

        draft.price = "21474836,48"
        XCTAssertNil(draft.normalizedPriceCents)
        XCTAssertEqual(
            draft.validationMessage(existingProduct: nil),
            "Enter a positive price up to 21,474,836.47 with no more than two decimal places."
        )
    }

    func testNewAdminProductDraftStartsPrivateAndRequiresSafeIdentifiers() {
        var draft = AdminProductDraft(suggestedSortOrder: 6)
        XCTAssertFalse(draft.active)
        XCTAssertTrue(draft.stripePriceID.isEmpty)
        XCTAssertEqual(draft.validityDays, 28)
        XCTAssertEqual(draft.sortOrder, 6)
        XCTAssertNotNil(draft.validationMessage(existingProduct: nil))

        draft.slug = "founders-6"
        draft.name = "Founders Pack"
        draft.price = "120"
        draft.sessions = 6
        draft.validityDays = 42
        XCTAssertNil(draft.validationMessage(existingProduct: nil))
        XCTAssertEqual(draft.normalizedPriceCents, 12_000)
    }

    func testAdminEventDraftUsesQueenslandCalendarDates() {
        let event = AdminEvent(
            id: UUID(),
            name: "Gold Coast Marathon",
            category: "marathon",
            event_date: "2026-07-04",
            end_date: "2026-07-05",
            location: "Gold Coast",
            region: "South East Queensland",
            url: "https://example.com/event",
            published: true,
            sort_order: 1,
            updated_at: "2026-07-14T00:00:00Z"
        )

        let draft = AdminEventDraft(event: event)

        XCTAssertTrue(draft.hasStartDate)
        XCTAssertTrue(draft.hasEndDate)
        XCTAssertEqual(draft.startDateValue, "2026-07-04")
        XCTAssertEqual(draft.endDateValue, "2026-07-05")
        XCTAssertEqual(draft.category, "marathon")
        XCTAssertTrue(draft.published)
    }

    func testAdminEventRosterReportExportsContactableTrainingGroup() {
        let event = AdminEvent(
            id: UUID(),
            name: "XERT \"Team\" Competition",
            category: "xert",
            event_date: "2026-12-05",
            end_date: nil,
            location: "Gold Coast",
            region: "South East Queensland",
            url: nil,
            published: true,
            sort_order: 20,
            updated_at: "2026-07-14T00:00:00Z"
        )
        let member = AdminEventGoalMember(
            user_id: UUID(),
            full_name: "Alex Example",
            email: "alex@example.com",
            phone: "0400000000",
            selected_at: Date(timeIntervalSince1970: 1_783_987_200)
        )

        let csv = AdminEventRosterReport(event: event, members: [member]).csv

        XCTAssertTrue(csv.contains("\"XERT \"\"Team\"\" Competition\""))
        XCTAssertTrue(csv.contains("\"Alex Example\""))
        XCTAssertTrue(csv.contains("\"alex@example.com\""))
        XCTAssertTrue(csv.contains("\"0400000000\""))
        XCTAssertFalse(csv.contains(member.user_id.uuidString))
    }

    func testAdminCoachDraftPreservesPublicProfileValues() {
        let coach = AdminCoach(
            id: UUID(),
            name: "Dene Palmer",
            role: "Owner and Head Coach",
            bio: "Purposeful coaching.",
            experience: "10 years",
            currently_training_for: "XERT Endurance Challenge",
            photo_url: "https://example.com/dene.jpg",
            social_url: "https://instagram.com/xert",
            category: "coach",
            sort_order: 1,
            published: true,
            updated_at: "2026-07-14T00:00:00Z"
        )

        let draft = AdminCoachDraft(coach: coach)

        XCTAssertEqual(draft.name, "Dene Palmer")
        XCTAssertEqual(draft.role, "Owner and Head Coach")
        XCTAssertEqual(draft.currentlyTrainingFor, "XERT Endurance Challenge")
        XCTAssertEqual(draft.photoURL, "https://example.com/dene.jpg")
        XCTAssertTrue(draft.published)
    }

    func testAdminRosterMemberLimitsRollCallToAttendanceStatuses() {
        let confirmed = AdminRosterMember(
            booking_id: UUID(), member_id: UUID(), full_name: "Alex Runner",
            email: "alex@example.com", phone: nil, status: "confirmed", booked_at: Date()
        )
        let requested = AdminRosterMember(
            booking_id: UUID(), member_id: UUID(), full_name: "Sam Lifter",
            email: nil, phone: nil, status: "requested", booked_at: Date()
        )
        let noShow = AdminRosterMember(
            booking_id: UUID(), member_id: UUID(), full_name: nil,
            email: "late@example.com", phone: nil, status: "no_show", booked_at: Date()
        )

        XCTAssertTrue(confirmed.attendanceEligible)
        XCTAssertFalse(requested.attendanceEligible)
        XCTAssertTrue(noShow.attendanceEligible)
        XCTAssertEqual(noShow.displayName, "late@example.com")
    }

    func testAdminAttendanceDraftRequiresExplicitCompleteRollCall() {
        let confirmedID = UUID()
        let attendedID = UUID()
        let noShowID = UUID()
        let requestedID = UUID()
        let roster = [
            AdminRosterMember(
                booking_id: confirmedID, member_id: UUID(), full_name: "Confirmed",
                email: nil, phone: nil, status: "confirmed", booked_at: Date()
            ),
            AdminRosterMember(
                booking_id: attendedID, member_id: UUID(), full_name: "Present",
                email: nil, phone: nil, status: "attended", booked_at: Date()
            ),
            AdminRosterMember(
                booking_id: noShowID, member_id: UUID(), full_name: "Absent",
                email: nil, phone: nil, status: "no_show", booked_at: Date()
            ),
            AdminRosterMember(
                booking_id: requestedID, member_id: UUID(), full_name: "Requested",
                email: nil, phone: nil, status: "requested", booked_at: Date()
            ),
        ]
        var draft = AdminAttendanceDraft(roster: roster + [roster[0]])

        XCTAssertEqual(draft.eligibleIDs, [confirmedID, attendedID, noShowID])
        XCTAssertNil(draft.mark(for: confirmedID))
        XCTAssertEqual(draft.mark(for: attendedID), .attended)
        XCTAssertEqual(draft.mark(for: noShowID), .noShow)
        XCTAssertEqual(
            draft.summary,
            AdminAttendanceSummary(total: 3, attended: 1, noShow: 1)
        )
        XCTAssertFalse(draft.summary.isComplete)

        draft.set(.noShow, for: confirmedID)
        draft.set(.attended, for: requestedID)
        XCTAssertTrue(draft.summary.isComplete)
        XCTAssertEqual(draft.attendedIDs, [attendedID])
        XCTAssertEqual(draft.noShowIDs, [confirmedID, noShowID])

        draft.markAllPresent()
        XCTAssertEqual(draft.summary.attended, 3)
        XCTAssertTrue(draft.noShowIDs.isEmpty)
        draft.clear()
        XCTAssertEqual(draft.summary.unmarked, 3)
        XCTAssertFalse(draft.summary.isComplete)
    }

    func testAdminAttendanceDraftReconcilesRosterWithoutLosingLocalMarks() {
        let firstID = UUID()
        let secondID = UUID()
        let first = AdminRosterMember(
            booking_id: firstID, member_id: UUID(), full_name: "First",
            email: nil, phone: nil, status: "confirmed", booked_at: Date()
        )
        let second = AdminRosterMember(
            booking_id: secondID, member_id: UUID(), full_name: "Second",
            email: nil, phone: nil, status: "attended", booked_at: Date()
        )
        var draft = AdminAttendanceDraft(roster: [first])
        draft.set(.noShow, for: firstID)
        draft.reconcile(roster: [first, second])

        XCTAssertEqual(draft.mark(for: firstID), .noShow)
        XCTAssertEqual(draft.mark(for: secondID), .attended)
        draft.reconcile(roster: [second])
        XCTAssertNil(draft.mark(for: firstID))
        XCTAssertEqual(draft.eligibleIDs, [secondID])
    }

    func testAdminClassRosterReportExportsVerifiedRosterAndDraftAttendanceSafely() {
        let start = Date(timeIntervalSince1970: 1_784_500_000)
        let verified = Date(timeIntervalSince1970: 1_784_499_000)
        let generated = Date(timeIntervalSince1970: 1_784_499_300)
        let presentID = UUID()
        let requestedID = UUID()
        let present = AdminRosterMember(
            booking_id: presentID,
            member_id: UUID(),
            full_name: "=2+2",
            email: "present@example.com",
            phone: "0400 000 001",
            status: "confirmed",
            booked_at: start.addingTimeInterval(-3_600)
        )
        let requested = AdminRosterMember(
            booking_id: requestedID,
            member_id: UUID(),
            full_name: "Requested Member",
            email: "requested@example.com",
            phone: nil,
            status: "requested",
            booked_at: start.addingTimeInterval(-1_800)
        )
        var attendance = AdminAttendanceDraft(roster: [present, requested])
        attendance.set(.attended, for: presentID)
        let operation = AdminDailyOperation(
            session_id: UUID(),
            title: "XERT Engine",
            class_type: "XERT Engine",
            start_time: start,
            end_time: start.addingTimeInterval(3_600),
            status: "published",
            capacity: 12,
            coach_name: "Dene",
            location_zone: "Main floor",
            booking_mode: "instant_book",
            requested_count: 1,
            confirmed_count: 1,
            waitlist_count: 0,
            attended_count: 0,
            no_show_count: 0,
            public_request_count: 0,
            attendance_due: false
        )

        let csv = AdminClassRosterReport(
            operation: operation,
            members: [present, requested],
            attendance: attendance,
            rosterVerifiedAt: verified,
            generatedAt: generated
        ).csv

        XCTAssertTrue(csv.contains("\"Roster verified\""))
        XCTAssertTrue(csv.contains("\"Roll call draft\""))
        XCTAssertTrue(csv.contains("\"present\""))
        XCTAssertTrue(csv.contains("\"not eligible\""))
        XCTAssertTrue(csv.contains("\"'=2+2\""))
        XCTAssertFalse(csv.contains("\",\"=2+2\""))
        XCTAssertEqual(csv.split(separator: "\n").count, 3)
    }

    func testAdminClassDraftHydratesLegacyNullableMetadata() {
        let start = Date().addingTimeInterval(86_400)
        let session = AdminClassSession(
            id: UUID(), class_type: nil, title: "Community Session", description: nil,
            coach_name: nil, start_time: start, end_time: nil, duration_minutes: nil,
            capacity: nil, location_zone: nil, beginner_friendly: nil,
            intensity_level: nil, status: "draft", public_visible: nil,
            booking_mode: nil, notes: nil
        )

        let draft = AdminClassDraft(classSession: session)

        XCTAssertEqual(draft.classType, "XERT Foundation")
        XCTAssertEqual(draft.durationMinutes, 60)
        XCTAssertEqual(draft.capacity, 8)
        XCTAssertEqual(draft.intensity, "Moderate")
        XCTAssertEqual(draft.bookingMode, "request_to_book")
        XCTAssertFalse(draft.publicVisible)
        XCTAssertFalse(draft.hasEndTime)
    }

    func testAdminScheduleScopeKeepsActiveClassesInUpcomingWork() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let active = adminClassSession(
            title: "Active",
            startTime: now.addingTimeInterval(-1_800),
            endTime: now.addingTimeInterval(1_800)
        )
        let durationOnly = adminClassSession(
            title: "Duration fallback",
            startTime: now.addingTimeInterval(-900),
            durationMinutes: 60
        )
        let past = adminClassSession(
            title: "Past",
            startTime: now.addingTimeInterval(-7_200),
            endTime: now.addingTimeInterval(-3_600)
        )

        XCTAssertTrue(AdminScheduleScope.upcoming.includes(active, now: now))
        XCTAssertTrue(AdminScheduleScope.upcoming.includes(durationOnly, now: now))
        XCTAssertFalse(AdminScheduleScope.upcoming.includes(past, now: now))
        XCTAssertTrue(AdminScheduleScope.past.includes(past, now: now))
        XCTAssertFalse(AdminScheduleScope.past.includes(active, now: now))
        XCTAssertTrue(AdminScheduleScope.all.includes(active, now: now))
        XCTAssertTrue(AdminScheduleScope.all.includes(past, now: now))
    }

    func testScheduleControlDraftsHydrateProtectedWindows() {
        let start = Date().addingTimeInterval(3_600)
        let end = start.addingTimeInterval(7_200)
        let availability = AdminAvailabilityBlock(
            id: UUID(), start_time: start, end_time: end, type: "PT available",
            coach_name: "Dene", notes: "Member consults", is_bookable: true,
            updated_at: "2026-07-14T00:00:00Z"
        )
        let blackout = AdminBlackoutPeriod(
            id: UUID(), start_time: start, end_time: end, affects: "group_classes",
            reason: "facility maintenance", notes: "Floor works",
            updated_at: "2026-07-14T00:00:00Z"
        )

        let availabilityDraft = AdminAvailabilityDraft(block: availability)
        let blackoutDraft = AdminBlackoutDraft(period: blackout)

        XCTAssertTrue(availabilityDraft.isBookable)
        XCTAssertEqual(availabilityDraft.coachName, "Dene")
        XCTAssertEqual(blackoutDraft.affects, "group_classes")
        XCTAssertEqual(blackoutDraft.reason, "facility maintenance")
        XCTAssertEqual(blackoutDraft.endTime, end)
    }

    func testAdminMemberNoteRetainsAuditAndArchiveState() {
        let authorID = UUID()
        let archivedAt = Date()
        let note = AdminMemberNote(
            id: UUID(), user_id: UUID(), author_id: authorID, author_name: "Owner",
            category: "billing", body: "Cash pack payment confirmed.", created_at: Date(),
            archived_at: archivedAt, archived_by: authorID
        )

        XCTAssertEqual(note.category, "billing")
        XCTAssertEqual(note.author_name, "Owner")
        XCTAssertEqual(note.archived_at, archivedAt)
        XCTAssertEqual(note.archived_by, authorID)
    }

    func testAdminLeadAcceptsLegacyNumericIdentityAndPipelineMetadata() throws {
        let data = """
        {
          "id": 42,
          "full_name": "Alex Runner",
          "email": "alex@example.com",
          "phone": "0400 123 456",
          "status": "hot",
          "admin_notes": "Foundation offer next.",
          "created_at": "2026-07-14T01:00:00Z",
          "main_training_goals": ["Strength", "Gold Coast Marathon"],
          "utm_source": "instagram"
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let lead = try decoder.decode(AdminLead.self, from: data)

        XCTAssertEqual(lead.id.value, "42")
        XCTAssertEqual(lead.displayName, "Alex Runner")
        XCTAssertEqual(lead.effectiveStatus, "hot")
        XCTAssertTrue(lead.searchableText.contains("instagram"))
        XCTAssertTrue(AdminLeadPipeline.members.statuses.contains("foundation_offer_sent"))
        XCTAssertTrue(AdminLeadPipeline.trainers.statuses.contains("hired"))
        XCTAssertTrue(AdminLeadPipeline.partners.statuses.contains("approved"))

        let report = AdminLeadReport(pipeline: .members, rows: [lead])
        XCTAssertTrue(report.csv.contains("\"Suburb / town\""))
        XCTAssertTrue(report.csv.contains("\"Campaign source\""))
        XCTAssertTrue(report.csv.contains("\"instagram\""))
        XCTAssertFalse(report.csv.contains("Foundation offer next."))
    }

    func testUnifiedBookingRequestKeepsCreditWorkflowAndAllowedTransitions() {
        let booking = AdminBookingRequest(
            source: .member,
            recordID: UUID().uuidString,
            memberBookingID: UUID(),
            fullName: "Alex Runner",
            email: "alex@example.com",
            phone: "0400 123 456",
            status: "confirmed",
            adminNotes: nil,
            createdAt: Date(),
            creditBatchID: UUID(),
            session: AdminBookingSession(
                title: "XERT Engine", start_time: Date(), coach_name: "Dene", location_zone: "Main floor"
            )
        )

        XCTAssertEqual(booking.source.label, "Member credit")
        XCTAssertTrue(booking.searchableText.contains("xert engine"))
        XCTAssertEqual(booking.allowedNextStatuses, ["attended", "no_show", "cancelled"])
        XCTAssertTrue(booking.id.hasPrefix("member:"))

        let report = AdminBookingRequestReport(rows: [booking])
        XCTAssertTrue(report.csv.contains("\"Member credit booking\""))
        XCTAssertTrue(report.csv.contains("\"Credit reserved\""))
        XCTAssertTrue(report.csv.contains("\"Yes\""))
        XCTAssertTrue(report.csv.contains("\"XERT Engine\""))
    }

    func testCampaignAttributionMatchesQueenslandReportingAndPrivacySafeExport() {
        let rows = [
            campaignRow(
                id: "1", source: " Facebook ", medium: "Paid Social", campaign: "Winter Push",
                createdAt: queenslandDate(2026, 7, 13, 1, 30)
            ),
            campaignRow(
                id: "2", source: "facebook", medium: "paid social", campaign: "Winter Push",
                createdAt: queenslandDate(2026, 7, 13, 11, 0)
            ),
            campaignRow(
                id: "3", source: nil, medium: nil, campaign: nil,
                createdAt: queenslandDate(2026, 7, 1, 10, 0), recordedSource: "Website"
            )
        ]
        let summary = AdminCampaignSummary(
            rows: rows,
            range: .thirty,
            now: queenslandDate(2026, 7, 14, 12, 0)
        )

        XCTAssertEqual(summary.total, 3)
        XCTAssertEqual(summary.attributed, 2)
        XCTAssertEqual(summary.direct, 1)
        XCTAssertEqual(summary.sources.first, AdminCampaignBreakdown(label: "Facebook", count: 2))
        XCTAssertEqual(summary.mediums.first?.count, 2)
        XCTAssertEqual(summary.campaigns.first, AdminCampaignBreakdown(label: "Winter Push", count: 2))
        XCTAssertEqual(summary.dailySignups.first(where: { $0.dateKey == "2026-07-13" })?.count, 2)
        XCTAssertTrue(summary.csv.contains("Brisbane Date"))
        XCTAssertTrue(summary.csv.contains("Direct / unknown"))
        XCTAssertFalse(summary.csv.lowercased().contains("email"))
    }

    func testAdminAuditExportIsBoundedAndEscapesCSVFields() {
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        let operatorID = UUID(uuidString: "11111111-2222-4333-8444-555555555555")!
        let entries = (0..<305).map { index in
            AdminAuditEntry(
                id: "audit-\(index)",
                category: index == 0 ? "Content, CMS" : "Bookings",
                title: index == 0 ? "Changed \"hero\"" : "Booking updated",
                detail: index == 0 ? "Line one\nLine two" : "Member \(index)",
                createdAt: now.addingTimeInterval(TimeInterval(-index)),
                operatorID: index == 0 ? operatorID : nil,
                subjectID: index == 0 ? "hero" : nil
            )
        }

        let csv = AdminAuditExport(entries: entries).csv
        let rows = csv.split(separator: "\n", omittingEmptySubsequences: false)

        XCTAssertEqual(rows.first, "Created,Category,Action,Detail,Operator ID,Subject ID")
        XCTAssertEqual(rows.count, 302)
        XCTAssertTrue(csv.contains(#""Content, CMS""#))
        XCTAssertTrue(csv.contains(#""Changed ""hero""""#))
        XCTAssertTrue(csv.contains("\"Line one\nLine two\""))
        XCTAssertTrue(csv.contains(operatorID.uuidString.lowercased()))
        XCTAssertTrue(csv.contains(#""hero""#))
        XCTAssertFalse(csv.contains("Member 304"))
        XCTAssertFalse(AdminAuditSnapshot(
            entries: Array(entries.prefix(1)),
            unavailableSources: ["Role changes"]
        ).isComplete)
        XCTAssertTrue(AdminAuditSnapshot(entries: [], unavailableSources: []).isComplete)
    }

    func testAdminAuditSummaryCountsRecentMoneyActionsAndDistinctOperators() {
        let now = Date(timeIntervalSince1970: 1_750_000_000)
        let firstOperator = UUID(uuidString: "11111111-2222-4333-8444-555555555555")!
        let secondOperator = UUID(uuidString: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")!
        let entries = [
            AdminAuditEntry(
                id: "refund",
                category: "Commerce",
                title: "Stripe order refunded",
                detail: "$100.00",
                createdAt: now.addingTimeInterval(-60),
                operatorID: firstOperator
            ),
            AdminAuditEntry(
                id: "credit",
                category: "Credits",
                title: "4 credits granted",
                detail: "Launch recovery",
                createdAt: now.addingTimeInterval(-3_600),
                operatorID: firstOperator
            ),
            AdminAuditEntry(
                id: "access",
                category: "Access",
                title: "Member role changed",
                detail: "member to admin",
                createdAt: now.addingTimeInterval(-86_400),
                operatorID: secondOperator
            ),
            AdminAuditEntry(
                id: "historical",
                category: "Content",
                title: "Hero updated",
                detail: "Homepage",
                createdAt: now.addingTimeInterval(-86_401)
            ),
            AdminAuditEntry(
                id: "future",
                category: "Commerce",
                title: "Future record",
                detail: "Clock skew",
                createdAt: now.addingTimeInterval(1)
            )
        ]

        let summary = AdminAuditSummary(entries: entries, now: now)

        XCTAssertEqual(summary.total, 5)
        XCTAssertEqual(summary.last24Hours, 3)
        XCTAssertEqual(summary.moneyActions, 3)
        XCTAssertEqual(summary.identifiedOperators, 2)
    }

    func testSiteContentNormalizationMatchesPublicSchemaAndRejectsUnsafeValues() throws {
        let contact = try AdminSiteContentData(
            paragraphs: ["must not leak"],
            email: " hello@xertfitness.com.au ",
            phone: " 0400 000 000 ",
            instagram_url: "https://instagram.com/xert_fit"
        ).normalized(for: .contact)

        XCTAssertEqual(contact.email, "hello@xertfitness.com.au")
        XCTAssertEqual(contact.phone, "0400 000 000")
        XCTAssertNil(contact.paragraphs)
        XCTAssertNil(try AdminSiteContentData(paragraphs: [" ", ""]).normalized(for: .about).paragraphs)
        XCTAssertThrowsError(try AdminSiteContentData(
            items: [AdminFAQItem(q: "When?", a: "")]
        ).normalized(for: .faq))
        XCTAssertThrowsError(try AdminSiteContentData(
            photos: ["javascript:alert(1)"]
        ).normalized(for: .hero))
        XCTAssertThrowsError(try AdminSiteContentData(email: "not-an-email").normalized(for: .contact))
        XCTAssertThrowsError(try AdminSiteContentData(
            headline: String(repeating: "x", count: 161)
        ).normalized(for: .hero))
        XCTAssertThrowsError(try AdminSiteContentData(
            photos: Array(repeating: "/assets/hero.jpg", count: 13)
        ).normalized(for: .hero))
        XCTAssertThrowsError(try AdminSiteContentData(
            paragraphs: Array(repeating: "Training with purpose.", count: 13)
        ).normalized(for: .about))
        XCTAssertThrowsError(try AdminSiteContentData(
            items: Array(repeating: AdminFAQItem(q: "Question?", a: "Answer."), count: 21)
        ).normalized(for: .faq))
    }

    func testSiteContentDraftRoundTripsWithoutPersistingFAQIdentity() throws {
        let suiteName = "ModelsTests.site-content.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let draft = AdminSiteContentData(
            headline: "A stronger public headline",
            items: [AdminFAQItem(q: "Question?", a: "Answer.")]
        )

        let ownerID = UUID()
        let otherOwnerID = UUID()
        AdminSiteContentDraftStore.save(draft, section: .faq, ownerID: ownerID, defaults: defaults)
        let restored = AdminSiteContentDraftStore.load(.faq, ownerID: ownerID, defaults: defaults)
        XCTAssertEqual(restored?.headline, draft.headline)
        XCTAssertEqual(restored?.items?.first?.q, "Question?")
        XCTAssertNotEqual(restored?.items?.first?.id, draft.items?.first?.id)
        XCTAssertNil(AdminSiteContentDraftStore.load(.faq, ownerID: otherOwnerID, defaults: defaults))

        defaults.set(try JSONEncoder().encode(draft), forKey: "xert.admin.site-content.draft.faq")
        XCTAssertNil(AdminSiteContentDraftStore.load(.faq, ownerID: otherOwnerID, defaults: defaults))
        XCTAssertNil(defaults.data(forKey: "xert.admin.site-content.draft.faq"))

        AdminSiteContentDraftStore.clear(.faq, ownerID: ownerID, defaults: defaults)
        XCTAssertNil(AdminSiteContentDraftStore.load(.faq, ownerID: ownerID, defaults: defaults))
    }

    func testNativeInterestSubmissionsValidateAndMapEveryDesktopPipeline() throws {
        var member = NativeInterestDraft()
        member.fullName = " Alex Runner "; member.email = " ALEX@example.com "; member.phone = "0400 123 456"
        member.ageRange = "31–40"; member.suburbTown = "Kingaroy"; member.trainingLevel = "Regular trainer"
        member.goals = ["Strength"]; member.preferredTimes = ["Early morning"]; member.consentsToContact = true
        let memberPayload = try MemberInterestSubmission(member)
        XCTAssertEqual(memberPayload.email, "alex@example.com")
        XCTAssertEqual(memberPayload.source, "ios_app")
        XCTAssertEqual(memberPayload.status, "new")

        var trainer = member
        trainer.qualifications = "Cert IV"; trainer.yearsExperience = "3–5 years"
        trainer.functionalExperience = "Five years coaching functional strength."; trainer.availability = ["Evenings"]
        XCTAssertEqual(try TrainerInterestSubmission(trainer).availability, ["Evenings"])

        var partner = member
        partner.businessName = "South Burnett Physio"; partner.profession = "Physiotherapist"
        partner.services = ["Physiotherapy"]
        XCTAssertEqual(try PartnerInterestSubmission(partner).services_offered, ["Physiotherapy"])
        XCTAssertNil(partner.validationMessage(for: .partner))

        member.consentsToContact = false
        XCTAssertThrowsError(try MemberInterestSubmission(member))
        XCTAssertEqual(member.validationMessage(for: .member), "Consent to contact is required.")

        var invalid = trainer
        invalid.email = "alex@example"
        XCTAssertThrowsError(try TrainerInterestSubmission(invalid))
        invalid = trainer
        invalid.phone = "123"
        XCTAssertThrowsError(try TrainerInterestSubmission(invalid))
        invalid = trainer
        invalid.qualifications = String(repeating: "Q", count: 2_001)
        XCTAssertThrowsError(try TrainerInterestSubmission(invalid))

        var unsafePartner = partner
        unsafePartner.websiteSocialLink = "javascript:alert(1)"
        XCTAssertThrowsError(try PartnerInterestSubmission(unsafePartner))
        unsafePartner.websiteSocialLink = "https://example.com/practice"
        XCTAssertEqual(
            try PartnerInterestSubmission(unsafePartner).website_social_link,
            "https://example.com/practice"
        )
    }

    func testOwnerNavigationPulseBoundsCountsAndExplainsAttention() {
        let now = Date()
        let pulse = XertOwnerNavigationPulse(
            actionCount: 140,
            healthIssueCount: 2,
            loadedSourceCount: 99,
            failedSourceCount: -3,
            updatedAt: now
        )

        XCTAssertEqual(pulse.attentionCount, 142)
        XCTAssertEqual(pulse.badgeText, "99+")
        XCTAssertEqual(pulse.shortStatus, "99+ OPEN")
        XCTAssertEqual(pulse.loadedSourceCount, XertOwnerNavigationPulse.sourceCount)
        XCTAssertEqual(pulse.failedSourceCount, 0)
        XCTAssertTrue(pulse.accessibilityLabel.contains("140 open operational actions"))
        XCTAssertTrue(pulse.accessibilityLabel.contains("2 platform health issues"))
    }

    func testOwnerNavigationPulseDistinguishesClearPartialAndUnavailableStates() {
        let now = Date()
        let clear = XertOwnerNavigationPulse(
            actionCount: 0,
            healthIssueCount: 0,
            loadedSourceCount: XertOwnerNavigationPulse.sourceCount,
            failedSourceCount: 0,
            updatedAt: now
        )
        let partial = XertOwnerNavigationPulse(
            actionCount: 0,
            healthIssueCount: 0,
            loadedSourceCount: 4,
            failedSourceCount: 2,
            updatedAt: now
        )

        XCTAssertEqual(clear.shortStatus, "CLEAR")
        XCTAssertEqual(clear.accessibilityLabel, "No open owner actions")
        XCTAssertEqual(partial.shortStatus, "PARTIAL")
        XCTAssertTrue(partial.accessibilityLabel.contains("some status sources are unavailable"))
        XCTAssertEqual(XertOwnerNavigationPulse.empty.shortStatus, "CHECK")
        XCTAssertFalse(XertOwnerNavigationPulse.empty.isAvailable)
    }

    func testOwnerNavigationPulseFreshnessRejectsFutureAndExpiredSnapshots() {
        let updatedAt = Date(timeIntervalSince1970: 1_000)
        let pulse = XertOwnerNavigationPulse(
            actionCount: 1,
            healthIssueCount: 0,
            loadedSourceCount: 6,
            failedSourceCount: 0,
            updatedAt: updatedAt
        )

        XCTAssertTrue(pulse.isFresh(at: Date(timeIntervalSince1970: 1_059), maximumAge: 60))
        XCTAssertFalse(pulse.isFresh(at: Date(timeIntervalSince1970: 1_061), maximumAge: 60))
        XCTAssertFalse(pulse.isFresh(at: Date(timeIntervalSince1970: 999), maximumAge: 60))
    }

    func testOwnerNavigationPriorityRoutesTheMostUrgentWorkExactly() {
        let health = XertOwnerNavigationPriority.resolve(
            healthIssueCount: 2,
            attendanceDue: 4,
            bookingRequests: 8,
            waitingMembers: 5,
            pendingPT: 3,
            followUps: 12
        )
        XCTAssertEqual(health, .platformHealth(2))
        XCTAssertEqual(health?.workspace, .health)
        XCTAssertEqual(health?.compactLabel, "2 HEALTH")
        XCTAssertEqual(health?.actionTitle, "Open 2 platform health issues")

        let attendance = XertOwnerNavigationPriority.resolve(
            healthIssueCount: 0,
            attendanceDue: 4,
            bookingRequests: 8,
            waitingMembers: 5,
            pendingPT: 3,
            followUps: 12
        )
        XCTAssertEqual(attendance, .attendance(4))
        XCTAssertEqual(attendance?.workspace, .classDesk)

        let requests = XertOwnerNavigationPriority.resolve(
            healthIssueCount: 0,
            attendanceDue: 0,
            bookingRequests: 8,
            waitingMembers: 5,
            pendingPT: 3,
            followUps: 12
        )
        XCTAssertEqual(requests, .bookingRequests(8))
        XCTAssertEqual(requests?.workspace, .bookingRequests)

        XCTAssertNil(XertOwnerNavigationPriority.resolve(
            healthIssueCount: 0,
            attendanceDue: 0,
            bookingRequests: 0,
            waitingMembers: 0,
            pendingPT: 0,
            followUps: 0
        ))
    }

    func testMemberOnboardingDraftUsesOnlyCurrentServerDocumentAcceptances() throws {
        let currentDocumentID = try XCTUnwrap(UUID(
            uuidString: "00000000-0000-0000-0000-000000000102"
        ))
        let staleDocumentID = try XCTUnwrap(UUID(
            uuidString: "00000000-0000-0000-0000-000000000101"
        ))
        let state = memberOnboardingState(
            documentIDs: [currentDocumentID],
            acceptedIDs: [currentDocumentID, staleDocumentID]
        )

        let draft = MemberOnboardingDraft(state: state)

        XCTAssertEqual(state.requiredDocumentIDs, [currentDocumentID])
        XCTAssertEqual(state.acceptedDocumentIDs, [currentDocumentID])
        XCTAssertEqual(state.acceptedCount, 1)
        XCTAssertEqual(draft.acceptedDocumentIDs, [currentDocumentID])
        XCTAssertTrue(draft.contactIsAware)
        XCTAssertTrue(draft.confirmsAdultEligibility)
    }

    func testMemberOnboardingSaveRequestTrimsAndSendsExactCurrentDocumentSet() throws {
        let firstID = try XCTUnwrap(UUID(
            uuidString: "00000000-0000-0000-0000-000000000002"
        ))
        let secondID = try XCTUnwrap(UUID(
            uuidString: "00000000-0000-0000-0000-000000000001"
        ))
        let unrelatedID = UUID()
        var draft = MemberOnboardingDraft(state: memberOnboardingState(
            documentIDs: [firstID, secondID],
            acceptedIDs: []
        ))
        draft.fullName = "  Alex Runner  "
        draft.phone = "  0400 123 456  "
        draft.emergencyContactName = "  Sam Runner  "
        draft.emergencyContactPhone = "  +61 400 999 111  "
        draft.emergencyContactRelationship = "  Partner  "
        draft.contactIsAware = true
        draft.confirmsAdultEligibility = true
        draft.acceptedDocumentIDs = [firstID, secondID, unrelatedID]

        let request = try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: memberDocuments([firstID, secondID])
        )

        XCTAssertEqual(request.p_full_name, "Alex Runner")
        XCTAssertEqual(request.p_phone, "0400 123 456")
        XCTAssertEqual(request.p_emergency_contact_name, "Sam Runner")
        XCTAssertEqual(request.p_emergency_contact_phone, "+61 400 999 111")
        XCTAssertEqual(request.p_emergency_contact_relationship, "Partner")
        XCTAssertTrue(request.p_contact_is_aware)
        XCTAssertEqual(request.p_accepted_document_ids, [secondID, firstID])
        XCTAssertEqual(request.p_source, "ios_app")

        let payload = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(request)
        ) as? [String: Any]
        XCTAssertNil(payload?["p_is_adult"])
        XCTAssertNil(payload?["p_confirms_adult_eligibility"])
    }

    func testMemberOnboardingSaveRequestRejectsMissingAwarenessAndAcknowledgements() {
        let adultDocumentID = UUID()
        let additionalDocumentID = UUID()
        let documents = memberDocuments([adultDocumentID, additionalDocumentID])
        var draft = MemberOnboardingDraft(state: memberOnboardingState(
            documentIDs: [adultDocumentID, additionalDocumentID],
            acceptedIDs: []
        ))
        draft.confirmsAdultEligibility = true
        draft.acceptedDocumentIDs = [adultDocumentID]
        draft.contactIsAware = false

        XCTAssertThrowsError(try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: documents
        )) { error in
            XCTAssertTrue(error.localizedDescription.contains("emergency contact knows"))
        }

        draft.contactIsAware = true
        XCTAssertThrowsError(try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: documents
        )) { error in
            XCTAssertTrue(error.localizedDescription.contains("acknowledge every current"))
        }
    }

    func testFirstClassActivationRetainsOnlyTheSelectedSessionAndStage() {
        let sessionID = UUID()
        var activation = XertFirstClassActivation(sessionID: sessionID, stage: .signIn)

        XCTAssertTrue(activation.matches(sessionID))
        XCTAssertFalse(activation.matches(UUID()))
        activation.stage = .needsCredits
        XCTAssertEqual(activation, XertFirstClassActivation(sessionID: sessionID, stage: .needsCredits))
        activation.stage = .readyToBook
        XCTAssertEqual(activation.sessionID, sessionID)
        XCTAssertEqual(activation.stage, .readyToBook)
    }

    func testMemberOnboardingSaveRequestRejectsUnder18OrUnconfirmedAdultEligibility() {
        let adultDocumentID = UUID()
        var draft = MemberOnboardingDraft(state: memberOnboardingState(
            documentIDs: [adultDocumentID],
            acceptedIDs: [adultDocumentID]
        ))
        draft.confirmsAdultEligibility = false

        XCTAssertThrowsError(try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: memberDocuments([adultDocumentID])
        )) { error in
            XCTAssertTrue(error.localizedDescription.contains("only to people aged 18 or older"))
            XCTAssertTrue(error.localizedDescription.contains("parent or guardian"))
        }

        draft.confirmsAdultEligibility = true
        draft.acceptedDocumentIDs = []
        XCTAssertThrowsError(try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: memberDocuments([adultDocumentID])
        )) { error in
            XCTAssertTrue(error.localizedDescription.contains("adult readiness document"))
        }
    }

    func testMemberOnboardingSaveRequestMatchesBackendFieldBoundsAndPhoneCharacters() {
        let documentID = UUID()
        var draft = MemberOnboardingDraft(state: memberOnboardingState(
            documentIDs: [documentID],
            acceptedIDs: [documentID]
        ))

        draft.phone = "12345"
        XCTAssertThrowsError(try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: memberDocuments([documentID])
        ))

        draft.phone = "0400 CALL ME"
        XCTAssertThrowsError(try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: memberDocuments([documentID])
        ))

        draft.phone = "+61 (400) 123-456"
        draft.emergencyContactRelationship = String(repeating: "R", count: 61)
        XCTAssertThrowsError(try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: memberDocuments([documentID])
        ))

        draft.emergencyContactRelationship = "Parent"
        XCTAssertNoThrow(try MemberOnboardingSaveRequest(
            draft: draft,
            requiredDocuments: memberDocuments([documentID])
        ))
    }

    func testMemberOnboardingDocumentOnlyOpensSafeOfficialHTTPSLinks() throws {
        let id = UUID()
        let safe = memberDocument(id: id, sourceURL: "https://xertfitness.com.au/member-safety")
        let insecure = memberDocument(id: id, sourceURL: "http://xertfitness.com.au/member-safety")
        let credentialed = memberDocument(id: id, sourceURL: "https://member:secret@xertfitness.com.au/safety")

        XCTAssertEqual(safe.sourceURL?.host, "xertfitness.com.au")
        XCTAssertNil(insecure.sourceURL)
        XCTAssertNil(credentialed.sourceURL)
    }

    func testMemberOnboardingStaleDocumentErrorHasActionableCopy() {
        let message = MemberOnboardingErrorMessage.display(
            for: "P0001 ONBOARDING_DOCUMENTS_STALE"
        )

        XCTAssertTrue(message.contains("changed while you were reading"))
        XCTAssertTrue(message.contains("acknowledge them again"))
    }

    private func creditBatch(remaining: Int, orderID: UUID? = nil) -> CreditBatch {
        CreditBatch(
            id: UUID(),
            total: max(remaining, 1),
            remaining: remaining,
            expires_at: nil,
            order_id: orderID
        )
    }

    func testAdminMemberNoticeDraftMatchesTheBoundedServerContract() {
        var draft = AdminMemberNoticeDraft()
        XCTAssertEqual(
            draft.validationMessage(),
            "Title must be between 3 and 120 characters."
        )

        draft.title = "Booking reminder"
        draft.body = "Your requested class is ready to review."
        draft.tone = "action"
        draft.action = .booking
        draft.expiryDays = 7

        XCTAssertNil(draft.validationMessage())
        XCTAssertEqual(draft.action.cta.label, "Book a class")
        XCTAssertEqual(draft.action.cta.url, "/booking")

        draft.expiryDays = 365
        XCTAssertEqual(draft.validationMessage(), "Choose a valid expiry.")
    }

    func testAdminMemberNoticeEvidenceDistinguishesReadAndPushState() {
        let notice = AdminMemberNotice(
            id: UUID(),
            title: "Class confirmed",
            body: "Your place is confirmed.",
            tone: "action",
            cta_label: "View account",
            cta_url: "/account",
            source_kind: "booking_decision",
            published_at: Date(timeIntervalSince1970: 1_800_000_000),
            expires_at: Date(timeIntervalSince1970: 1_802_592_000),
            read_at: Date(timeIntervalSince1970: 1_800_000_600),
            dismissed_at: nil,
            push_attempted: 1,
            push_delivered: 1,
            push_failed: 0
        )

        XCTAssertEqual(notice.sourceLabel, "Booking decision")
        XCTAssertEqual(notice.receiptLabel, "Read in app")
        XCTAssertEqual(notice.deliveryLabel, "Push delivered")
    }

    func testAdminMemberCreditBatchStatesRespectExpiryBeforeRemainingBalance() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let expired = AdminMemberCreditBatch(
            id: UUID(),
            order_id: nil,
            total: 10,
            remaining: 4,
            expires_at: now.addingTimeInterval(-1),
            created_at: now.addingTimeInterval(-86_400)
        )
        let used = AdminMemberCreditBatch(
            id: UUID(),
            order_id: nil,
            total: 5,
            remaining: 0,
            expires_at: now.addingTimeInterval(86_400),
            created_at: now
        )
        let available = AdminMemberCreditBatch(
            id: UUID(),
            order_id: nil,
            total: 3,
            remaining: 2,
            expires_at: nil,
            created_at: now
        )

        XCTAssertEqual(expired.stateLabel(now: now), "Expired")
        XCTAssertEqual(used.stateLabel(now: now), "Used")
        XCTAssertEqual(available.stateLabel(now: now), "Available")
    }

    func testAdminMemberBookingHistoryProvidesSafeOperationalFallbacks() {
        let fallbackClass = AdminMemberBookingClass(title: "  ", class_type: "Strength", start_time: nil)
        let unnamedClass = AdminMemberBookingClass(title: nil, class_type: nil, start_time: nil)
        let booking = AdminMemberBookingHistory(
            id: UUID(),
            status: "no_show",
            created_at: Date(),
            cancelled_at: nil,
            class_sessions: fallbackClass
        )

        XCTAssertEqual(fallbackClass.displayName, "Strength")
        XCTAssertEqual(unnamedClass.displayName, "Class")
        XCTAssertEqual(booking.statusLabel, "No Show")
    }

    func testAdminOrderReportFiltersRevenueWithoutMixingCurrenciesAndEscapesCSV() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let currentAUD = order(
            id: UUID(),
            status: "paid",
            amountCents: 4_800,
            currency: "aud",
            createdAt: now.addingTimeInterval(-86_400),
            productName: "Launch Pack, 10",
            email: "alex@example.com"
        )
        let olderNZD = order(
            id: UUID(),
            status: "paid",
            amountCents: 6_500,
            currency: "nzd",
            createdAt: now.addingTimeInterval(-40 * 86_400),
            productName: "Travel Pack"
        )
        let failedAUD = order(
            id: UUID(),
            status: "failed",
            amountCents: 4_800,
            currency: "aud",
            createdAt: now,
            productName: "Launch Pack"
        )

        let latest = AdminOrderReport(
            orders: [olderNZD, failedAUD, currentAUD],
            range: .thirtyDays,
            now: now
        )
        XCTAssertEqual(latest.rows.map(\.id), [failedAUD.id, currentAUD.id])
        XCTAssertEqual(latest.paidCount, 1)
        XCTAssertEqual(latest.paidRevenue, [
            AdminOrderCurrencyTotal(currency: "AUD", cents: 4_800)
        ])
        XCTAssertTrue(latest.csv.contains("\"Launch Pack, 10\""))
        XCTAssertTrue(latest.csv.contains("Stripe Payment Intent"))

        let nzd = AdminOrderReport(
            orders: [olderNZD, failedAUD, currentAUD],
            query: "travel",
            status: "paid",
            currency: "nzd",
            range: .ninetyDays,
            now: now
        )
        XCTAssertEqual(nzd.rows.map(\.id), [olderNZD.id])
        XCTAssertEqual(nzd.paidRevenue, [
            AdminOrderCurrencyTotal(currency: "NZD", cents: 6_500)
        ])
    }

    func testAdminFinanceReportBuildsCurrencySafeThirtyDayOwnerInsights() {
        let now = queenslandDate(2026, 7, 27, 12, 0)
        let currentLaunch = order(
            id: UUID(),
            status: "paid",
            amountCents: 4_800,
            createdAt: EventItem.calendar.date(byAdding: .day, value: -1, to: now)!,
            productName: "Launch Pack"
        )
        let currentLaunchTwo = order(
            id: UUID(),
            status: "paid",
            amountCents: 5_200,
            createdAt: EventItem.calendar.date(byAdding: .day, value: -10, to: now)!,
            productName: "Launch Pack"
        )
        let previousStarter = order(
            id: UUID(),
            status: "paid",
            amountCents: 4_000,
            createdAt: EventItem.calendar.date(byAdding: .day, value: -35, to: now)!,
            productName: "Starter Pack"
        )
        let pending = order(
            id: UUID(),
            status: "pending",
            checkoutSessionID: "cs_pending",
            createdAt: now,
            productName: "Launch Pack"
        )
        let refunded = order(
            id: UUID(),
            status: "refunded",
            createdAt: now,
            productName: "Launch Pack"
        )
        let currentNZD = order(
            id: UUID(),
            status: "paid",
            amountCents: 20_000,
            currency: "nzd",
            createdAt: now,
            productName: "NZ Pack"
        )

        let report = AdminFinanceReport(
            orders: [
                currentLaunch, currentLaunchTwo, previousStarter,
                pending, refunded, currentNZD
            ],
            currency: "aud",
            now: now
        )

        XCTAssertEqual(report.currency, "AUD")
        XCTAssertEqual(report.currentPeriodCents, 10_000)
        XCTAssertEqual(report.previousPeriodCents, 4_000)
        XCTAssertEqual(report.monthRevenueCents, 10_000)
        XCTAssertEqual(report.allTimeRevenueCents, 14_000)
        XCTAssertEqual(report.currentPaidCount, 2)
        XCTAssertEqual(report.previousPaidCount, 1)
        XCTAssertEqual(report.averageSaleCents, 5_000)
        XCTAssertEqual(report.pendingCount, 1)
        XCTAssertEqual(report.refundedCount, 1)
        XCTAssertEqual(report.recoverableCount, 1)
        XCTAssertEqual(report.dailyRevenue.count, 30)
        XCTAssertEqual(report.dailyRevenue.reduce(0) { $0 + $1.cents }, 10_000)
        XCTAssertEqual(
            report.productLeaders.first,
            AdminFinanceProductPerformance(name: "Launch Pack", sales: 2, cents: 10_000)
        )
        XCTAssertEqual(report.periodChangePercent, 150)

        let newRevenue = AdminFinanceReport(
            orders: [currentLaunch],
            currency: "AUD",
            now: now
        )
        XCTAssertNil(newRevenue.periodChangePercent)
        XCTAssertEqual(newRevenue.previousPeriodCents, 0)
    }

    func testClassCancellationFollowUpDeduplicatesActiveContactsAndBuildsFallbackCopy() {
        let session = adminClassSession(
            title: "XERT Engine",
            startTime: Date(timeIntervalSince1970: 1_800_000_000)
        )
        let member = AdminRosterMember(
            booking_id: UUID(),
            member_id: UUID(),
            full_name: " ",
            email: "ALEX@EXAMPLE.COM",
            phone: "0401 234 567",
            status: "confirmed",
            booked_at: Date()
        )
        let duplicateEnquiry = AdminLegacyBookingRequest(
            id: AdminLeadIdentifier("enquiry-1"),
            full_name: "Alex Runner",
            email: "alex@example.com",
            phone: nil,
            status: "requested",
            admin_notes: nil,
            created_at: Date(),
            class_sessions: nil
        )
        let inactive = AdminLegacyBookingRequest(
            id: AdminLeadIdentifier("enquiry-2"),
            full_name: "Cancelled Person",
            email: "cancelled@example.com",
            phone: nil,
            status: "cancelled",
            admin_notes: nil,
            created_at: Date(),
            class_sessions: nil
        )

        let contacts = AdminClassCancellationFollowUp.contacts(
            roster: [member],
            enquiries: [duplicateEnquiry, inactive]
        )
        XCTAssertEqual(contacts.count, 1)
        XCTAssertEqual(contacts[0].displayName, "Alex Runner")
        XCTAssertEqual(contacts[0].email, "alex@example.com")
        XCTAssertEqual(contacts[0].phoneDialable, "0401234567")

        let message = AdminClassCancellationMessage(classSession: session)
        XCTAssertEqual(message.subject, "XERT class cancelled: XERT Engine")
        XCTAssertTrue(message.body.contains("Any reserved session credit has been returned automatically."))
        XCTAssertTrue(message.body.contains("Please open XERT to choose another class"))
    }

    func testClassCancellationFollowUpBoundsBCCRecipients() {
        let contacts = (0..<45).map { index in
            AdminClassCancellationContact(
                name: "Member \(index)",
                email: "member\(index)@example.com",
                phone: nil,
                phoneDialable: nil
            )
        }
        let session = adminClassSession(title: "XERT Strength")
        let followUp = AdminClassCancellationFollowUp(
            sessionID: session.id,
            classTitle: session.title,
            affectedBookings: contacts.count,
            contacts: contacts,
            message: AdminClassCancellationMessage(classSession: session),
            contactLookupIncomplete: false,
            notification: nil,
            notificationWarning: nil,
            refreshWarnings: [],
            completedAt: Date()
        )

        XCTAssertEqual(followUp.emailRecipientCount, 40)
        XCTAssertEqual(followUp.omittedEmailCount, 5)
        XCTAssertNotNil(followUp.mailtoURL)
        XCTAssertTrue(followUp.mailtoURL?.absoluteString.hasPrefix("mailto:") == true)
    }

    func testBlackoutDraftFindsOnlyPublishedOverlappingClasses() {
        let base = Date(timeIntervalSince1970: 1_800_000_000)
        var draft = AdminBlackoutDraft(now: base)
        draft.startTime = base.addingTimeInterval(3_600)
        draft.endTime = base.addingTimeInterval(7_200)
        draft.affects = "all"

        let fallbackDuration = adminClassSession(
            title: "Fallback duration",
            startTime: base.addingTimeInterval(3_540),
            endTime: nil,
            durationMinutes: 60
        )
        let fullClass = adminClassSession(
            title: "Full class",
            startTime: base.addingTimeInterval(5_400),
            status: "full"
        )
        let boundary = adminClassSession(
            title: "Starts at blackout end",
            startTime: draft.endTime
        )
        let draftClass = adminClassSession(
            title: "Unpublished draft",
            startTime: base.addingTimeInterval(5_400),
            status: "draft"
        )

        XCTAssertEqual(
            draft.overlappingPublishedClasses(
                in: [boundary, draftClass, fullClass, fallbackDuration]
            ).map(\.title),
            ["Fallback duration", "Full class"]
        )
    }

    func testPTAndCoachBlackoutsDoNotBlockGroupClasses() {
        let base = Date(timeIntervalSince1970: 1_800_000_000)
        var draft = AdminBlackoutDraft(now: base)
        draft.startTime = base
        draft.endTime = base.addingTimeInterval(3_600)
        let classSession = adminClassSession(title: "XERT Engine", startTime: base)

        draft.affects = "pt_only"
        XCTAssertTrue(draft.overlappingPublishedClasses(in: [classSession]).isEmpty)
        draft.affects = "coach_only"
        XCTAssertTrue(draft.overlappingPublishedClasses(in: [classSession]).isEmpty)
        draft.affects = "facility_only"
        XCTAssertEqual(draft.overlappingPublishedClasses(in: [classSession]).count, 1)
    }

    func testAdminAnnouncementStatesRespectPublishingExpiryAndArchiveOrder() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        XCTAssertEqual(adminAnnouncement(publishedAt: nil).stateLabel(now: now), "Draft")
        XCTAssertEqual(
            adminAnnouncement(publishedAt: now.addingTimeInterval(3_600)).stateLabel(now: now),
            "Scheduled"
        )
        XCTAssertEqual(
            adminAnnouncement(
                publishedAt: now.addingTimeInterval(-7_200),
                expiresAt: now.addingTimeInterval(-60)
            ).stateLabel(now: now),
            "Expired"
        )
        XCTAssertEqual(
            adminAnnouncement(
                publishedAt: now.addingTimeInterval(-7_200),
                expiresAt: now.addingTimeInterval(3_600)
            ).stateLabel(now: now),
            "Live"
        )
        XCTAssertEqual(
            adminAnnouncement(
                publishedAt: now.addingTimeInterval(-7_200),
                archivedAt: now.addingTimeInterval(-60)
            ).stateLabel(now: now),
            "Archived"
        )
    }

    func testAdminAnnouncementDraftRequiresSafeCompleteMemberActions() {
        var draft = AdminAnnouncementDraft()
        draft.title = "Class update"
        draft.body = "Saturday training now begins at 7 am."

        XCTAssertNil(draft.validationMessage(publishing: true))

        draft.ctaLabel = "Book now"
        XCTAssertEqual(
            draft.validationMessage(publishing: false),
            "Action label and destination must be provided together."
        )

        draft.ctaURL = "http://example.com/booking"
        XCTAssertEqual(
            draft.validationMessage(publishing: false),
            "Action destination must be an internal path or a secure HTTPS URL."
        )

        draft.ctaURL = "/booking"
        XCTAssertNil(draft.validationMessage(publishing: true))

        draft.ctaURL = "https://xertfitness.com.au/booking"
        XCTAssertNil(draft.validationMessage(publishing: true))

        draft.expiresAt = Date(timeIntervalSince1970: 1_700_000_000)
        XCTAssertNil(
            draft.validationMessage(
                publishing: false,
                now: Date(timeIntervalSince1970: 1_800_000_000)
            )
        )
        XCTAssertEqual(
            draft.validationMessage(
                publishing: true,
                now: Date(timeIntervalSince1970: 1_800_000_000)
            ),
            "Choose a future expiry before publishing."
        )
    }

    private func adminAnnouncement(
        publishedAt: Date?,
        expiresAt: Date? = nil,
        archivedAt: Date? = nil
    ) -> AdminAnnouncement {
        AdminAnnouncement(
            id: UUID(),
            title: "Training update",
            body: "Saturday training now begins at 7 am.",
            tone: "info",
            audience: "all",
            cta_label: nil,
            cta_url: nil,
            published_at: publishedAt,
            first_published_at: publishedAt,
            expires_at: expiresAt,
            archived_at: archivedAt,
            created_at: Date(timeIntervalSince1970: 1_700_000_000),
            updated_at: "2027-01-15T08:00:00.000Z"
        )
    }

    private func memberOnboardingState(
        documentIDs: [UUID],
        acceptedIDs: [UUID]
    ) -> MemberOnboardingState {
        MemberOnboardingState(
            user_id: UUID(),
            profile: MemberOnboardingProfile(
                full_name: "Alex Runner",
                phone: "0400 123 456",
                updated_at: Date()
            ),
            emergency_contact: MemberEmergencyContact(
                name: "Sam Runner",
                phone: "0400 999 111",
                relationship: "Partner",
                contact_awareness_confirmed_at: Date(),
                updated_at: Date()
            ),
            required_documents: memberDocuments(documentIDs),
            accepted_documents: acceptedIDs.map { id in
                MemberOnboardingAcceptance(
                    document_id: id,
                    document_key: "member_safety",
                    version: "1.0",
                    content_sha256: "fixture-hash",
                    accepted_at: Date(),
                    source: "ios_app"
                )
            },
            profile_complete: true,
            emergency_contact_complete: true,
            documents_complete: Set(documentIDs).isSubset(of: Set(acceptedIDs)),
            is_complete: Set(documentIDs).isSubset(of: Set(acceptedIDs))
        )
    }

    private func memberDocuments(_ ids: [UUID]) -> [MemberOnboardingDocument] {
        ids.enumerated().map { index, id in
            memberDocument(
                id: id,
                documentKey: index == 0
                    ? MemberOnboardingDocument.adultReadinessDocumentKey
                    : "additional_readiness_\(index)"
            )
        }
    }

    private func memberDocument(
        id: UUID,
        documentKey: String = MemberOnboardingDocument.adultReadinessDocumentKey,
        sourceURL: String? = "https://xertfitness.com.au/member-safety"
    ) -> MemberOnboardingDocument {
        MemberOnboardingDocument(
            id: id,
            document_key: documentKey,
            version: "1.0",
            title: "Member safety acknowledgement",
            body: "Read the complete current member safety instructions.",
            source_url: sourceURL,
            content_sha256: "fixture-hash",
            published_at: Date()
        )
    }

    private func campaignRow(
        id: String,
        source: String?,
        medium: String?,
        campaign: String?,
        createdAt: Date,
        recordedSource: String? = "website"
    ) -> AdminCampaignAttributionRow {
        AdminCampaignAttributionRow(
            id: AdminLeadIdentifier(id),
            utm_source: source,
            utm_medium: medium,
            utm_campaign: campaign,
            source: recordedSource,
            created_at: createdAt
        )
    }

    private func adminClassSession(
        title: String,
        startTime: Date = Date(timeIntervalSince1970: 1_800_000_000),
        endTime: Date? = nil,
        durationMinutes: Int? = 60,
        status: String = "published"
    ) -> AdminClassSession {
        AdminClassSession(
            id: UUID(),
            class_type: "XERT Engine",
            title: title,
            description: nil,
            coach_name: "Coach",
            start_time: startTime,
            end_time: endTime,
            duration_minutes: durationMinutes,
            capacity: 12,
            location_zone: "Main floor",
            beginner_friendly: true,
            intensity_level: "High",
            status: status,
            public_visible: true,
            booking_mode: "instant_book",
            notes: nil
        )
    }

    func testAdminPushHealthDecodesLatestProductionAttempt() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let health = try decoder.decode(AdminPushHealth.self, from: Data("""
        {
          "ready": true,
          "environment": { "ready": true, "missing": [] },
          "subscriptions": { "production": 1, "sandbox": 0, "disabled": 0 },
          "deliveries_24h": { "delivered": 1, "failed": 0, "invalid_token": 0 },
          "last_attempt": {
            "status": "delivered",
            "reason": null,
            "attempted_at": "2026-07-27T06:00:00Z"
          },
          "owner_smoke_test": {
            "status": "delivered",
            "reason": "OWNER_LAUNCH_TEST:DELIVERED",
            "attempted_at": "2026-07-27T06:00:00Z"
          }
        }
        """.utf8))

        XCTAssertEqual(health.last_attempt?.status, "delivered")
        XCTAssertNil(health.last_attempt?.reason)
        XCTAssertEqual(health.owner_smoke_test?.reason, "OWNER_LAUNCH_TEST:DELIVERED")
        XCTAssertEqual(health.subscriptions.production, 1)
        XCTAssertTrue(
            health.isOwnerLaunchReady(at: ISO8601DateFormatter().date(from: "2026-07-27T07:00:00Z")!)
        )
        XCTAssertFalse(
            health.isOwnerLaunchReady(at: ISO8601DateFormatter().date(from: "2026-07-28T07:00:01Z")!)
        )
    }

    private func order(
        id: UUID,
        status: String,
        checkoutSessionID: String? = nil,
        amountCents: Int = 4_800,
        currency: String = "aud",
        createdAt: Date = Date(),
        productName: String? = nil,
        email: String? = nil
    ) -> OrderItem {
        OrderItem(
            id: id,
            user_id: nil,
            product_id: nil,
            email: email,
            status: status,
            amount_cents: amountCents,
            currency: currency,
            credit_total: 10,
            credit_validity_days: 90,
            stripe_checkout_session_id: checkoutSessionID ?? (status == "failed" ? "cs_test_recover" : nil),
            stripe_payment_intent_id: status == "paid" ? "pi_test_paid" : nil,
            created_at: createdAt,
            paid_at: status == "paid" ? createdAt : nil,
            refunded_at: status == "refunded" ? createdAt : nil,
            refunded_amount_cents: status == "refunded" ? amountCents : nil,
            reconciled_at: nil,
            reconciled_by: nil,
            products: productName.map { OrderProduct(name: $0) },
            stripe_refunds: nil
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
