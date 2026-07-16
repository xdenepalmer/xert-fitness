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
        let routes: [XertMemberRoute] = [
            .home, .notices(nil), .notices(announcementID), .booking, .sessionPacks,
            .purchaseConfirmation, .events, .eventGoals, .explore, .account,
            .upcomingBookings(nil), .upcomingBookings(bookingID),
        ]

        for route in routes {
            XCTAssertEqual(XertMemberRoute.restore(route.restorationValue), route)
        }
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://booking/packs"))), .sessionPacks)
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://events/goals"))), .eventGoals)
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://account/bookings/\(bookingID.uuidString)"))), .upcomingBookings(bookingID))
        XCTAssertEqual(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://home/notices/\(announcementID.uuidString)"))), .notices(announcementID))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://account/bookings/not-a-uuid"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://booking/packs?source=unknown"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://user:pass@booking/packs"))))
        XCTAssertNil(XertMemberRoute.route(for: try XCTUnwrap(URL(string: "xertfitness://booking:444/packs"))))
    }

    func testCanonicalWebTaskLinksRoundTripAndRejectUntrustedOrigins() throws {
        let announcementID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000023"))
        let bookingID = try XCTUnwrap(UUID(uuidString: "00000000-0000-0000-0000-000000000024"))
        let routes: [XertMemberRoute] = [
            .home, .notices(nil), .notices(announcementID), .booking, .sessionPacks,
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

        let exactRoutes: [XertMemberRoute] = [.home, .booking, .sessionPacks, .events, .explore]
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
        XCTAssertTrue(XertRouteUserActivity.shouldAdvertise(
            route: .events,
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
        let publicRoutes: [XertMemberRoute] = [
            .home, .booking, .sessionPacks, .events, .explore, .account
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

    func testNavigationWorkspaceRejectsMalformedPartialAndFutureSnapshots() {
        let fallback = XertMemberRoute.upcomingBookings(nil)
        let invalidSnapshots = [
            "not-json",
            #"{"version":2,"routeValues":["events/goals"]}"#,
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

    func testNavigationCommandPaletteIsContextualRoleAwareAndSearchable() {
        let navigation = XertNavigationCoordinator(initial: .home)
        XCTAssertTrue(navigation.select(.booking, source: .content))

        let memberCommands = navigation.commandPaletteCommands(isAdmin: false)
        XCTAssertFalse(memberCommands.contains { $0.action == .owner })
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
        XCTAssertTrue(ownerCommands.contains { $0.action == .owner })
        XCTAssertEqual(
            XertNavigationCoordinator.filteredCommands(ownerCommands, query: "payment operations").map(\.action),
            [.owner]
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
        let context = XertNavigationContext(
            isSignedIn: true,
            noticeCount: 2,
            bookingCount: 1,
            creditCount: 7,
            eventGoalCount: 3,
            hasPendingCheckout: true
        )

        let commands = navigation.commandPaletteCommands(isAdmin: false, context: context)
        XCTAssertEqual(
            commands.filter { $0.section == .now }.map(\.action),
            [
                .activity(.pendingCheckout),
                .activity(.notices),
                .activity(.upcomingBookings),
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
        XCTAssertFalse(
            navigation.commandPaletteCommands(isAdmin: false, context: .empty)
                .contains { $0.section == .now }
        )
    }

    func testNavigationStatusSignalsRouteToTheirOwningWorkspaces() {
        let context = XertNavigationContext(
            isSignedIn: true,
            noticeCount: 120,
            bookingCount: 2,
            creditCount: 7,
            eventGoalCount: 3,
            hasPendingCheckout: true
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
        XCTAssertEqual(snapshot.status(for: .account)?.accessibilityLabel, "2 upcoming bookings")
        XCTAssertEqual(snapshot.status(for: .account)?.activity, .upcomingBookings)
        XCTAssertNil(snapshot.status(for: .explore))

        let signedOut = XertNavigationStatusSnapshot(context: XertNavigationContext(
            isSignedIn: false,
            noticeCount: 1,
            bookingCount: 1,
            creditCount: 1,
            eventGoalCount: 1,
            hasPendingCheckout: true
        ))
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
        let pending = PendingCheckout(
            userID: userID,
            baselineOrderIDs: orderIDs,
            startedAt: startedAt,
            checkoutSessionID: "cs_test_exact"
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
        XCTAssertEqual(Set(XertDataSource.allCases).count, 13)
        XCTAssertEqual(XertDataSource.sessions.displayName, "class timetable")
        XCTAssertEqual(XertDataSource.eventGoals.displayName, "training goals")
        XCTAssertEqual(XertDataSource.orders.displayName, "purchase history")
        XCTAssertEqual(XertDataSource.announcements.displayName, "member notices")
        XCTAssertEqual(XertDataSource.coaches.displayName, "coaches and practitioners")
        XCTAssertEqual(XertDataSource.siteContent.displayName, "public site content")
        XCTAssertEqual(XertDataSource.platformSettings.displayName, "pack purchase availability")
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
            CreditBatch(id: UUID(), total: 3, remaining: 3, expires_at: now.addingTimeInterval(6 * 86_400)),
            CreditBatch(id: UUID(), total: 4, remaining: 4, expires_at: now.addingTimeInterval(8 * 86_400)),
            CreditBatch(id: UUID(), total: 5, remaining: 5, expires_at: nil),
            CreditBatch(id: UUID(), total: 1, remaining: 0, expires_at: now.addingTimeInterval(86_400)),
        ]

        let summary = try XCTUnwrap(batches.expirySummary(now: now))

        XCTAssertEqual(summary.credits, 5)
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

        XCTAssertEqual(draft.name, "Ten Session Pack")
        XCTAssertEqual(draft.price, "299.00")
        XCTAssertEqual(draft.currency, "AUD")
        XCTAssertEqual(draft.sessions, 10)
        XCTAssertEqual(draft.validityDays, 90)
        XCTAssertEqual(draft.stripePriceID, "price_xert")
        XCTAssertTrue(draft.featured)
        XCTAssertTrue(draft.active)
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
    }

    func testSiteContentDraftRoundTripsWithoutPersistingFAQIdentity() throws {
        let suiteName = "ModelsTests.site-content.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let draft = AdminSiteContentData(
            headline: "A stronger public headline",
            items: [AdminFAQItem(q: "Question?", a: "Answer.")]
        )

        AdminSiteContentDraftStore.save(draft, section: .hero, defaults: defaults)
        let restored = AdminSiteContentDraftStore.load(.hero, defaults: defaults)
        XCTAssertEqual(restored?.headline, draft.headline)
        XCTAssertEqual(restored?.items?.first?.q, "Question?")

        AdminSiteContentDraftStore.clear(.hero, defaults: defaults)
        XCTAssertNil(AdminSiteContentDraftStore.load(.hero, defaults: defaults))
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

        member.consentsToContact = false
        XCTAssertThrowsError(try MemberInterestSubmission(member))
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

    private func order(id: UUID, status: String, checkoutSessionID: String? = nil) -> OrderItem {
        OrderItem(
            id: id,
            user_id: nil,
            product_id: nil,
            email: nil,
            status: status,
            amount_cents: 4800,
            currency: "aud",
            credit_total: 10,
            credit_validity_days: 90,
            stripe_checkout_session_id: checkoutSessionID ?? (status == "failed" ? "cs_test_recover" : nil),
            stripe_payment_intent_id: status == "paid" ? "pi_test_paid" : nil,
            created_at: Date(),
            paid_at: status == "paid" ? Date() : nil,
            refunded_at: status == "refunded" ? Date() : nil,
            refunded_amount_cents: status == "refunded" ? 4800 : nil,
            reconciled_at: nil,
            reconciled_by: nil,
            products: nil,
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
