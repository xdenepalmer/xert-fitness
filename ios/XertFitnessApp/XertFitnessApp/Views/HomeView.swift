import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.openURL) private var openURL
    let route: XertMemberRoute
    let routeSequence: UInt
    let onNavigate: (XertPrimaryDestination) -> Void
    let onOpenRoute: (XertMemberRoute) -> Void
    @State private var showingNoticeCenter = false
    @State private var showingMemberReadiness = false
    @State private var highlightedAnnouncementID: UUID?
    @State private var lastHandledRouteSequence: UInt = 0

    var body: some View {
        GeometryReader { viewport in
            NavigationStack {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        NativeHomeHero(
                            content: store.publicContent(for: .hero),
                            isSignedIn: store.isSignedIn,
                            bookingsEnabled: store.memberBookingsEnabled,
                            noticeCount: store.announcements.count,
                            topSafeAreaInset: viewport.safeAreaInsets.top,
                            // Label says Register interest when paused — action must match
                            // (Account / Explore parity), not deep-link into Book.
                            onBook: openBookingOrInterest,
                            onEvents: { onNavigate(.events) },
                            onNotices: openNoticeCenter,
                            onRefresh: { Task { await store.refresh() } }
                        )
                        .frame(height: XertScreenLayout.homeHeroHeight(
                            viewportHeight: viewport.size.height,
                            deviceTopInset: viewport.safeAreaInsets.top,
                            usesAccessibilityText: dynamicTypeSize.isAccessibilitySize
                        ))

                        MemberLaunchGuideCard(
                            state: memberLaunchGuideState,
                            bookingsEnabled: store.memberBookingsEnabled,
                            onAction: handleMemberLaunchGuideAction
                        )
                        .padding(.horizontal)
                        .padding(.vertical, memberLaunchGuideState.isCompact ? 10 : 14)

                        NativeValueStrip()

                        VStack(alignment: .leading, spacing: 18) {
                            CachedPublicDataNotice()
                            StaleMemberDataNotice()
                            DataAvailabilityNotice(sources: Set(XertDataSource.allCases))
                            memberDashboardSection
                            memberReadinessSection
                            announcementsSection
                            NativeTrainingIdentity(onExplore: { onNavigate(.explore) })
                            todayTrainingSection
                            creditExpirySection
                            if !store.isSignedIn { nextUpSection }
                            quickActions
                            glanceSection
                            nextEventSection
                            sessionPacksSection
                        }
                        .padding()
                        .padding(.bottom, XertScreenLayout.scrollEndClearance)
                    }
                }
                .refreshable {
                    await store.refresh()
                }
                .xertScreenBackground()
                .toolbar(.hidden, for: .navigationBar)
                .toolbar(.hidden, for: .tabBar)
                .sheet(isPresented: $showingNoticeCenter) {
                    MemberNoticeCenter(
                        announcements: store.announcements,
                        highlightedAnnouncementID: highlightedAnnouncementID,
                        dismissingAnnouncementID: store.dismissingAnnouncementID,
                        onAction: { announcement in
                            showingNoticeCenter = false
                            handleAnnouncementAction(announcement)
                        },
                        onDismiss: { announcement in
                            Task { await store.dismissAnnouncement(announcement) }
                        }
                    )
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                }
                .sheet(isPresented: $showingMemberReadiness) {
                    MemberOnboardingView()
                        .environmentObject(store)
                        .presentationDetents([.large])
                        .presentationDragIndicator(.visible)
                }
                .onChange(of: routeSequence) { sequence in
                    handleRoute(sequence)
                }
                .onAppear {
                    handleRoute(routeSequence)
                }
            }
        }
        .ignoresSafeArea(edges: .top)
    }

    // MARK: - Member dashboard

    @ViewBuilder
    private var memberDashboardSection: some View {
        if store.isSignedIn {
            XertSection(title: "Member dashboard") {
                VStack(alignment: .leading, spacing: 16) {
                    dashboardMembershipSummary

                    Rectangle()
                        .fill(Color.xertSteel.opacity(0.18))
                        .frame(height: 1)
                        .accessibilityHidden(true)

                    dashboardNextTraining

                    Rectangle()
                        .fill(Color.xertSteel.opacity(0.18))
                        .frame(height: 1)
                        .accessibilityHidden(true)

                    dashboardTrainingMomentum
                }
            }
        }
    }

    private var memberLaunchGuideState: MemberLaunchGuideState {
        let now = Date()
        let activeBookings = store.bookings
            .filter { $0.isActiveClassPlace && $0.start_time > now }
            .sorted { $0.start_time < $1.start_time }
        let nextConfirmedBookingID = activeBookings.first(where: { $0.status == "confirmed" })?.booking_id
        let bookingsLoaded = store.hasBootstrapped
            && !store.isLoading
            && !store.unavailableDataSources.contains(.bookings)

        return MemberLaunchGuideResolver.resolve(
            isSignedIn: store.isSignedIn,
            onboardingLoaded: store.onboardingLoaded,
            readinessComplete: store.memberOnboarding?.is_complete == true,
            creditBalanceLoaded: store.creditBalanceLoaded,
            creditTotal: store.creditTotal,
            bookingsLoaded: bookingsLoaded,
            nextActiveBookingID: activeBookings.first?.booking_id,
            nextConfirmedBookingID: nextConfirmedBookingID,
            classRemindersEnabled: store.classRemindersEnabled,
            onboardingUnavailable: store.unavailableDataSources.contains(.onboarding),
            creditsUnavailable: store.unavailableDataSources.contains(.credits),
            bookingsUnavailable: store.unavailableDataSources.contains(.bookings)
        )
    }

    private func handleMemberLaunchGuideAction(_ state: MemberLaunchGuideState) {
        switch state {
        case .signIn:
            onNavigate(.account)
        case .checking:
            return
        case .retry:
            Task { await store.refresh() }
        case .completeReadiness:
            showingMemberReadiness = true
        case .chooseAccess:
            // Soft-launch pause: packs stay behind Register interest (Account parity).
            if store.memberBookingsEnabled {
                onOpenRoute(.sessionPacks)
            } else {
                onNavigate(.explore)
            }
        case .bookFirstClass:
            if store.memberBookingsEnabled {
                onOpenRoute(.booking)
            } else {
                onNavigate(.explore)
            }
        case .enableReminder:
            Task { await store.setClassRemindersEnabled(true) }
        case .activated(let bookingID):
            onOpenRoute(.upcomingBookings(bookingID))
        }
    }

    /// Fail closed to Explore interest while bookings are paused (Account parity).
    private func openBookingOrInterest() {
        if store.memberBookingsEnabled {
            onNavigate(.booking)
        } else {
            onNavigate(.explore)
        }
    }

    @ViewBuilder
    private var memberReadinessSection: some View {
        if store.isSignedIn {
            XertSection(title: "Member readiness") {
                MemberReadinessStatusCard {
                    showingMemberReadiness = true
                }
            }
        }
    }

    @ViewBuilder
    private var dashboardMembershipSummary: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 12) {
                dashboardCreditSummary
                dashboardNoticeButton
            }
        } else {
            HStack(alignment: .center, spacing: 12) {
                dashboardCreditSummary
                Spacer(minLength: 8)
                dashboardNoticeButton
            }
        }
    }

    private var dashboardCreditSummary: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Session credits")
                .xertEyebrow()
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(dashboardCreditValue)
                    .xertDisplay(36)
                Text(store.creditTotal == 1 ? "credit" : "credits")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.xertPale)
            }
            Text(dashboardCreditCaption)
                .font(.caption)
                .foregroundStyle(dashboardCreditCaptionColor)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Session credits. \(dashboardCreditAccessibilityLabel)")
    }

    @ViewBuilder
    private var dashboardNoticeButton: some View {
        if !store.announcements.isEmpty {
            Button(action: openNoticeCenter) {
                HStack(spacing: 8) {
                    Image(systemName: "bell.fill")
                    Text("\(store.announcements.count) notice\(store.announcements.count == 1 ? "" : "s")")
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.xertSteel)
                .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : nil, minHeight: 44)
                .padding(.horizontal, 12)
                .background(Color.xertSteel.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 2)
                        .stroke(Color.xertSteel.opacity(0.38), lineWidth: 1)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Member notices, \(store.announcements.count) available")
            .accessibilityHint("Opens member notices")
        }
    }

    @ViewBuilder
    private var dashboardNextTraining: some View {
        if let booking = dashboardNextBooking {
            dashboardBookingCard(booking)
        } else if dashboardBookingsAreInitiallyLoading {
            HStack(alignment: .center, spacing: 12) {
                ProgressView()
                    .tint(Color.xertSteel)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Loading your next class")
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text("Checking your bookings and waitlist places…")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .accessibilityElement(children: .combine)
        } else if store.unavailableDataSources.contains(.bookings) {
            VStack(alignment: .leading, spacing: 12) {
                Label("Next class unavailable", systemImage: "wifi.exclamationmark")
                    .font(.headline)
                    .foregroundStyle(Color.orange)
                Text("Your bookings could not refresh. Retry before relying on your next class status.")
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    Task { await store.refresh() }
                } label: {
                    Label(store.isLoading ? "Retrying…" : "Retry now", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.xertPrimary)
                .disabled(store.isLoading)
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Label("No upcoming class booked", systemImage: "calendar.badge.plus")
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
                Text("Choose a session that suits you and lock in your next training day.")
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale)
                    .fixedSize(horizontal: false, vertical: true)
                Button(store.memberBookingsEnabled ? "Book a class" : "Register interest") {
                    openBookingOrInterest()
                }
                .buttonStyle(.xertPrimary)
            }
        }
    }

    private func dashboardBookingCard(_ booking: BookingItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Next class")
                        .xertEyebrow()
                    Text(booking.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.xertOffWhite)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                Text(booking.stateLabel.uppercased())
                    .font(.caption2.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(Color.xertSteel)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .overlay(
                        RoundedRectangle(cornerRadius: 2)
                            .stroke(Color.xertSteel.opacity(0.5), lineWidth: 1)
                    )
            }

            VStack(alignment: .leading, spacing: 7) {
                Label(Self.dashboardBookingFormatter.string(from: booking.start_time), systemImage: "calendar")
                if let location = booking.location_zone {
                    Label(location, systemImage: "mappin.and.ellipse")
                }
                if let coach = booking.coach_name {
                    Label(coach, systemImage: "person.fill")
                }
            }
            .font(.subheadline)
            .foregroundStyle(Color.xertPale)
            .accessibilityElement(children: .combine)

            if store.isUsingStaleMemberData || store.unavailableDataSources.contains(.bookings) {
                Label("Booking details may be out of date", systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
            }

            dashboardBookingActions(booking)
        }
    }

    @ViewBuilder
    private func dashboardBookingActions(_ booking: BookingItem) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 10) {
                dashboardManageBookingButton(booking)
                dashboardBookAnotherButton
            }
        } else {
            HStack(spacing: 10) {
                dashboardManageBookingButton(booking)
                dashboardBookAnotherButton
            }
        }
    }

    private func dashboardManageBookingButton(_ booking: BookingItem) -> some View {
        Button {
            guard let url = URL(
                string: "xertfitness://account/bookings/\(booking.id.uuidString.lowercased())"
            ) else { return }
            openURL(url)
        } label: {
            Text("Manage booking")
                .lineLimit(1)
                .minimumScaleFactor(0.68)
        }
        .buttonStyle(.xertPrimary)
        .accessibilityHint("Opens your booking timeline")
    }

    private var dashboardBookAnotherButton: some View {
        Button {
            openBookingOrInterest()
        } label: {
            Text(store.memberBookingsEnabled ? "Book another" : "Register interest")
                .lineLimit(1)
                .minimumScaleFactor(0.68)
        }
        .buttonStyle(.xertGhost)
    }

    private var dashboardNextBooking: BookingItem? {
        let now = Date()
        return store.bookings
            .filter { $0.isActiveClassPlace && $0.start_time > now }
            .min { $0.start_time < $1.start_time }
    }

    private var dashboardBookingsAreInitiallyLoading: Bool {
        store.bookings.isEmpty
            && (!store.hasBootstrapped || (store.isLoading && store.memberDataUpdatedAt == nil))
    }

    @ViewBuilder
    private var dashboardTrainingMomentum: some View {
        let progress = MemberTrainingProgress(bookings: store.bookings)
        VStack(alignment: .leading, spacing: 12) {
            Label("Training momentum", systemImage: "chart.line.uptrend.xyaxis")
                .font(.headline)
                .foregroundStyle(Color.xertOffWhite)

            if dashboardBookingsAreInitiallyLoading {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading recorded attendance…")
                        .font(.footnote)
                        .foregroundStyle(Color.xertPale)
                }
            } else if store.bookings.isEmpty && store.unavailableDataSources.contains(.bookings) {
                Text("Progress is unavailable until bookings refresh.")
                    .font(.footnote)
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
            } else if progress.totalAttended == 0 {
                Text("Completed classes will appear after the XERT team records your attendance.")
                    .font(.footnote)
                    .foregroundStyle(Color.xertPale)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        dashboardProgressMetric("\(progress.attendedLast30Days)", label: "30 days")
                        dashboardProgressMetric("\(progress.activeWeeksLastFour)/4", label: "Active weeks")
                        dashboardProgressMetric("\(progress.totalAttended)", label: "All time")
                    }
                    VStack(spacing: 8) {
                        dashboardProgressMetric("\(progress.attendedLast30Days)", label: "Completed · 30 days")
                        dashboardProgressMetric("\(progress.activeWeeksLastFour)/4", label: "Active weeks")
                        dashboardProgressMetric("\(progress.totalAttended)", label: "Completed · all time")
                    }
                }
            }

            Text("Attendance only · Brisbane weeks")
                .font(.caption2)
                .foregroundStyle(Color.xertMuted)
        }
    }

    private func dashboardProgressMetric(_ value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .xertDisplay(25)
            Text(label)
                .font(.caption2.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.5)
                .foregroundStyle(Color.xertMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
        .padding(9)
        .background(Color.xertNavy.opacity(0.35))
        .overlay(
            RoundedRectangle(cornerRadius: 2)
                .stroke(Color.xertSteel.opacity(0.16), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    private var dashboardCreditValue: String {
        let hasNoKnownBalance = !store.creditBalanceLoaded
        if hasNoKnownBalance
            && (!store.hasBootstrapped || store.isLoading || store.unavailableDataSources.contains(.credits)) {
            return "—"
        }
        return "\(store.creditTotal)"
    }

    private var dashboardCreditCaption: String {
        if store.unavailableDataSources.contains(.credits) {
            return store.creditBalanceLoaded ? "Last known balance" : "Balance unavailable"
        }
        if store.isLoading {
            return store.creditBalanceLoaded ? "Refreshing balance…" : "Loading balance…"
        }
        if store.isUsingStaleMemberData {
            return "Last synced balance"
        }
        if let summary = store.creditExpirySummary {
            return "\(summary.credits) expire in \(summary.daysRemaining) day\(summary.daysRemaining == 1 ? "" : "s")"
        }
        return store.creditTotal == 0 ? "No credits available" : "Ready to book"
    }

    private var dashboardCreditCaptionColor: Color {
        if store.unavailableDataSources.contains(.credits) || store.isUsingStaleMemberData {
            return .orange
        }
        if store.creditExpirySummary != nil {
            return Color(red: 224 / 255, green: 179 / 255, blue: 106 / 255)
        }
        return Color.xertPale
    }

    private var dashboardCreditAccessibilityLabel: String {
        dashboardCreditValue == "—"
            ? dashboardCreditCaption
            : "\(store.creditTotal) available. \(dashboardCreditCaption)"
    }

    private static let dashboardBookingFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_AU")
        formatter.timeZone = TimeZone(identifier: "Australia/Brisbane")
        formatter.dateFormat = "EEE d MMM · h:mm a"
        return formatter
    }()

    // MARK: - Member notices

    @ViewBuilder
    private var announcementsSection: some View {
        if store.isSignedIn && !store.announcements.isEmpty {
            XertSection(title: "Member notices", actionTitle: store.announcements.count > 2 ? "View all" : nil, action: openNoticeCenter) {
                VStack(spacing: 12) {
                    ForEach(Array(store.announcements.prefix(2))) { announcement in
                        MemberAnnouncementRow(
                            announcement: announcement,
                            isDismissing: store.dismissingAnnouncementID == announcement.id,
                            dismissDisabled: store.dismissingAnnouncementID != nil,
                            onAction: { handleAnnouncementAction(announcement) },
                            onDismiss: { Task { await store.dismissAnnouncement(announcement) } }
                        )
                    }
                }
            }
        }
    }

    private func openNoticeCenter() {
        highlightedAnnouncementID = nil
        showingNoticeCenter = true
    }

    private func handleRoute(_ sequence: UInt) {
        guard sequence > lastHandledRouteSequence, case .notices(let announcementID) = route else { return }
        lastHandledRouteSequence = sequence
        highlightedAnnouncementID = announcementID
        showingNoticeCenter = true
    }

    private func handleAnnouncementAction(_ announcement: MemberAnnouncement) {
        guard let action = announcement.action else { return }
        if let route = action.memberRoute {
            onOpenRoute(route)
        } else if let tab = action.nativeTab {
            onNavigate(tab)
        } else {
            openURL(action.url)
        }
    }

    // MARK: - Credit expiry

    @ViewBuilder
    private var creditExpirySection: some View {
        if let summary = store.creditExpirySummary {
            XertSection(title: "Credits Expiring Soon") {
                VStack(alignment: .leading, spacing: 10) {
                    Label {
                        Text("\(summary.credits) class credit\(summary.credits == 1 ? "" : "s") expire\(summary.credits == 1 ? "s" : "") in \(summary.daysRemaining) day\(summary.daysRemaining == 1 ? "" : "s").")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.xertOffWhite)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(Color(red: 224 / 255, green: 179 / 255, blue: 106 / 255))
                    }
                    Text("Use them by \(summary.expiresAt.formatted(date: .abbreviated, time: .omitted)).")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale)
                    Button(store.memberBookingsEnabled ? "Book A Class" : "Register interest") {
                        openBookingOrInterest()
                    }
                    .buttonStyle(.xertPrimary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .xertCardStyle()
            }
        }
    }

    // MARK: - Quick actions

    @ViewBuilder
    private var quickActions: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 12) {
                quickActionCards
            }
        } else {
            HStack(spacing: 12) {
                quickActionCards
            }
        }
    }

    @ViewBuilder
    private var quickActionCards: some View {
        QuickActionCard(
            icon: store.memberBookingsEnabled ? "calendar.badge.plus" : "person.crop.circle.badge.plus",
            title: store.memberBookingsEnabled ? "Book" : "Interest"
        ) {
            openBookingOrInterest()
        }
        QuickActionCard(icon: "trophy", title: "Events") {
            onNavigate(.events)
        }
        QuickActionCard(icon: "person.crop.circle", title: "Account") {
            onNavigate(.account)
        }
    }

    // MARK: - Sections

    private var glanceSection: some View {
        XertSection(title: "At a glance") {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 14) {
                    glanceMetrics
                }
            } else {
                HStack(spacing: 14) {
                    glanceMetrics
                }
            }
        }
    }

    @ViewBuilder
    private var glanceMetrics: some View {
        MetricView(value: dashboardPublicMetricValue(store.sessions.count, source: .sessions), label: "Classes")
        MetricView(value: dashboardCreditValue, label: "Credits")
        MetricView(value: dashboardPublicMetricValue(store.events.count, source: .events), label: "Events")
    }

    private func dashboardPublicMetricValue(_ count: Int, source: XertDataSource) -> String {
        guard count == 0 else { return "\(count)" }
        let hasNoKnownPublicSnapshot = store.publicDataUpdatedAt == nil
        if hasNoKnownPublicSnapshot
            && (!store.hasBootstrapped || store.isLoading || store.unavailableDataSources.contains(source)) {
            return "—"
        }
        return "0"
    }

    private var nextUpSection: some View {
        XertSection(title: "Next up") {
            if let booking = nextBooking {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(booking.title)
                            .font(.headline)
                            .foregroundStyle(.xertOffWhite)
                        Spacer()
                        Text(booking.stateLabel.uppercased())
                            .font(.caption2.weight(.bold))
                            .tracking(1.2)
                            .foregroundStyle(.xertSteel)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .overlay(
                                RoundedRectangle(cornerRadius: 2)
                                    .stroke(Color.xertSteel.opacity(0.5), lineWidth: 1)
                            )
                    }
                    Text(booking.start_time.formatted(date: .abbreviated, time: .shortened))
                        .font(.subheadline)
                        .foregroundStyle(Color.xertPale)
                    if let location = booking.location_zone {
                        Label(location, systemImage: "mappin")
                            .font(.caption)
                            .foregroundStyle(Color.xertMuted)
                    }
                    Button("View bookings") {
                        onNavigate(.account)
                    }
                    .buttonStyle(.xertGhost)
                }
            } else if store.isSignedIn {
                EmptyAction(
                    message: "No class booked yet.",
                    actionTitle: store.memberBookingsEnabled ? "Browse classes" : "Register interest",
                    action: openBookingOrInterest
                )
            } else {
                EmptyAction(
                    message: "Sign in to manage bookings and credits.",
                    actionTitle: "Sign in",
                    action: { onNavigate(.account) }
                )
            }
        }
    }

    @ViewBuilder
    private var todayTrainingSection: some View {
        if store.isSignedIn && todayBookings.count > 1 {
            XertSection(title: "Today's training") {
                VStack(spacing: 10) {
                    ForEach(todayBookings) { booking in
                        HStack(alignment: .top, spacing: 12) {
                            Text(booking.start_time.formatted(date: .omitted, time: .shortened))
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(Color.xertSteel)
                                .frame(minWidth: 72, alignment: .leading)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(booking.title)
                                    .font(.headline)
                                    .foregroundStyle(Color.xertOffWhite)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(booking.stateLabel)
                                    .font(.caption)
                                    .foregroundStyle(Color.xertPale)
                                if let location = booking.location_zone {
                                    Label(location, systemImage: "mappin")
                                        .font(.caption)
                                        .foregroundStyle(Color.xertMuted)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .xertCardStyle()
                    }
                    Button("Manage today's bookings") {
                        onNavigate(.account)
                    }
                    .buttonStyle(.xertPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var nextEventSection: some View {
        XertSection(title: "Next event") {
            if let event = nextEvent {
                VStack(alignment: .leading, spacing: 6) {
                    Text(event.name)
                        .font(.headline)
                        .foregroundStyle(.xertOffWhite)
                    Text(event.event_date ?? "Date to be confirmed")
                        .font(.subheadline)
                        .foregroundStyle(Color.xertPale)
                    if let location = event.location {
                        Label(location, systemImage: "mappin")
                            .font(.caption)
                            .foregroundStyle(Color.xertMuted)
                    }
                    Button("View event calendar") {
                        onNavigate(.events)
                    }
                    .buttonStyle(.xertGhost)
                }
            } else {
                Text("The event calendar is being prepared.")
                    .foregroundStyle(Color.xertPale)
            }
        }
    }

    private var sessionPacksSection: some View {
        XertSection(title: "Session Packs") {
            ForEach(store.products.prefix(3)) { product in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(product.name)
                            .font(.headline)
                            .foregroundStyle(.xertOffWhite)
                        Text("\(product.sessionsCount) sessions")
                            .font(.caption)
                            .foregroundStyle(Color.xertMuted)
                    }
                    Spacer()
                    Text(product.displayPrice)
                        .font(XertTheme.displayFont(size: 20, relativeTo: .title3))
                        .tracking(1.0)
                        .foregroundStyle(.xertSteel)
                }
                .padding(.vertical, 6)
            }
            Button(store.memberBookingsEnabled ? "View session packs" : "Register interest") {
                openBookingOrInterest()
            }
            .buttonStyle(.xertGhost)
        }
    }

    private var nextBooking: BookingItem? {
        store.bookings
            .filter { $0.isActiveClassPlace && $0.start_time > Date() && !$0.occursOnBrisbaneDay() }
            .sorted { $0.start_time < $1.start_time }
            .first
    }

    private var todayBookings: [BookingItem] {
        let now = Date()
        return store.bookings
            .filter { $0.isActiveClassPlace && $0.start_time > now && $0.occursOnBrisbaneDay() }
            .sorted { $0.start_time < $1.start_time }
    }

    private var nextEvent: EventItem? {
        store.events
            .filter { !$0.isComplete }
            .sorted { ($0.event_date ?? "") < ($1.event_date ?? "") }
            .first
    }
}

private struct MemberLaunchGuideCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let state: MemberLaunchGuideState
    let bookingsEnabled: Bool
    let onAction: (MemberLaunchGuideState) -> Void

    var body: some View {
        Group {
            if state.isCompact {
                compactContent
            } else {
                expandedContent
            }
        }
        .padding(state.isCompact ? 12 : 14)
        .xertCardStyle()
        .accessibilityElement(children: .contain)
    }

    private var expandedContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            guideHeader
            Button(actionTitle) { onAction(state) }
                .buttonStyle(.xertPrimary)
                .disabled(state == .checking)
                .accessibilityHint(actionHint)
        }
    }

    private var compactContent: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                guideHeader
                Spacer(minLength: 4)
                compactButton
            }
            VStack(alignment: .leading, spacing: 10) {
                guideHeader
                compactButton
            }
        }
    }

    private var guideHeader: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: iconName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(accentColor)
                .frame(width: 36, height: 36)
                .background(accentColor.opacity(0.1))
                .clipShape(Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(eyebrow)
                    .xertEyebrow()
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
                    .fixedSize(horizontal: false, vertical: true)
                if !state.isCompact || dynamicTypeSize.isAccessibilitySize {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color.xertPale)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var compactButton: some View {
        Button(actionTitle) { onAction(state) }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.xertSteel)
            .frame(minHeight: 44)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityHint(actionHint)
    }

    private var eyebrow: String { state.isCompact ? "Ready" : "Your next step" }

    private var title: String {
        switch state {
        case .signIn: return "Start your XERT membership"
        case .checking: return "Checking your member progress"
        case .retry: return "Member progress needs a refresh"
        case .completeReadiness: return "Complete member readiness"
        case .chooseAccess: return "Choose your session access"
        case .bookFirstClass: return "Book your first class"
        case .enableReminder: return "Never miss your next class"
        case .activated: return "You're ready to train"
        }
    }

    private var detail: String {
        switch state {
        case .signIn:
            return "Create an account or sign in, then XERT will keep your next step here."
        case .checking:
            return "XERT is securely loading your readiness, credits and bookings."
        case .retry:
            return "Some member details could not be refreshed. Your saved account remains protected."
        case .completeReadiness:
            return "Add your contact details and acknowledge the current member documents."
        case .chooseAccess:
            return "Choose the session pack that fits your training plan."
        case .bookFirstClass:
            return "Your credits are ready. Choose a coached session that works for you."
        case .enableReminder:
            return "Turn on an optional device reminder for confirmed classes."
        case .activated:
            return "Your next class is booked."
        }
    }

    private var actionTitle: String {
        switch state {
        case .signIn: return "Create Account or Sign In"
        case .checking: return "Checking…"
        case .retry: return "Retry Member Progress"
        case .completeReadiness: return "Complete Readiness"
        case .chooseAccess:
            return bookingsEnabled ? "View Session Packs" : "Register interest"
        case .bookFirstClass:
            return bookingsEnabled ? "Browse Classes" : "Register interest"
        case .enableReminder: return "Enable Class Reminder"
        case .activated: return "View Booking"
        }
    }

    private var actionHint: String {
        switch state {
        case .signIn: return "Opens secure member access"
        case .checking: return "Member progress is still loading"
        case .retry: return "Retries readiness, credits and bookings"
        case .completeReadiness: return "Opens your private member readiness form"
        case .chooseAccess:
            return bookingsEnabled
                ? "Opens session pack options on the Book page"
                : "Opens Explore so you can register interest while bookings are paused"
        case .bookFirstClass:
            return bookingsEnabled
                ? "Opens class discovery on the Book page"
                : "Opens Explore so you can register interest while bookings are paused"
        case .enableReminder: return "Requests notification permission, then schedules eligible class reminders"
        case .activated: return "Opens your upcoming bookings"
        }
    }

    private var iconName: String {
        switch state {
        case .signIn: return "person.crop.circle.badge.plus"
        case .checking: return "arrow.clockwise"
        case .retry: return "wifi.exclamationmark"
        case .completeReadiness: return "person.text.rectangle"
        case .chooseAccess: return "creditcard"
        case .bookFirstClass: return "calendar.badge.plus"
        case .enableReminder: return "bell.badge"
        case .activated: return "checkmark.circle.fill"
        }
    }

    private var accentColor: Color {
        state.isCompact ? .green : .xertSteel
    }
}

private struct NativeHomeHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var photoIndex = 0
    @State private var isLowPowerModeEnabled = ProcessInfo.processInfo.isLowPowerModeEnabled
    let content: AdminSiteContentData
    let isSignedIn: Bool
    // Fail closed with store default false until soft-launch settings load
    // (Explore About / web Home parity).
    let bookingsEnabled: Bool
    let noticeCount: Int
    let topSafeAreaInset: CGFloat
    let onBook: () -> Void
    let onEvents: () -> Void
    let onNotices: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                heroImage
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
                    .saturation(0.52)
                    .brightness(-0.16)
                    .contrast(1.08)
                    .accessibilityHidden(true)

                LinearGradient(
                    colors: [
                        Color.xertNavy.opacity(0.76),
                        Color.xertDeep.opacity(0.45),
                        Color.xertNavy.opacity(0.96),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .accessibilityHidden(true)

                Rectangle()
                    .fill(Color.xertSteel.opacity(0.78))
                    .frame(height: 2)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center) {
                        XertLogoHeader(height: 36)
                        Spacer()
                        if isSignedIn {
                            Button(action: onNotices) {
                                Image(systemName: noticeCount > 0 ? "bell.fill" : "bell")
                                    .font(.system(size: 16, weight: .semibold))
                                    .frame(width: 44, height: 44)
                                    .background(Color.xertInk.opacity(0.72))
                                    .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.45), lineWidth: 1))
                                    .overlay(alignment: .topTrailing) {
                                        if noticeCount > 0 {
                                            Text(noticeCount > 99 ? "99+" : "\(noticeCount)")
                                                .font(.system(size: 9, weight: .bold))
                                                .foregroundStyle(Color.xertNavy)
                                                .lineLimit(1)
                                                .minimumScaleFactor(0.7)
                                                .frame(minWidth: 18, minHeight: 18)
                                                .padding(.horizontal, noticeCount > 9 ? 2 : 0)
                                                .background(Color.xertSteel)
                                                .clipShape(Capsule())
                                                .offset(x: 5, y: -5)
                                        }
                                    }
                            }
                            .foregroundStyle(Color.xertSteel)
                            .accessibilityLabel("Member notices, \(noticeCount) available")
                        }
                        Button(action: onRefresh) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 16, weight: .semibold))
                                .frame(width: 44, height: 44)
                                .background(Color.xertInk.opacity(0.72))
                                .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.45), lineWidth: 1))
                        }
                        .foregroundStyle(Color.xertSteel)
                        .accessibilityLabel("Refresh XERT home")
                    }

                    if heroPhotoURLs.count > 1 {
                        HStack(spacing: 0) {
                            ForEach(heroPhotoURLs.indices, id: \.self) { index in
                                Button {
                                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.45)) {
                                        photoIndex = index
                                    }
                                } label: {
                                    Circle()
                                        .fill(index == photoIndex ? Color.xertSteel : Color.xertPale.opacity(0.32))
                                        .frame(width: index == photoIndex ? 8 : 6, height: index == photoIndex ? 8 : 6)
                                        .frame(width: 44, height: 44)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Show training photo \(index + 1) of \(heroPhotoURLs.count)")
                                .accessibilityAddTraits(index == photoIndex ? .isSelected : [])
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.top, 8)
                    }

                    Spacer(minLength: 24)

                    HStack(spacing: 10) {
                        Rectangle()
                            .fill(Color.xertSteel)
                            .frame(width: 28, height: 1)
                        Text("Functional Fitness Training Facility")
                            .font(.caption.weight(.bold))
                            .textCase(.uppercase)
                            .foregroundStyle(Color.xertSteel)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Text(content.headline ?? "Beat Your Best.")
                        .font(XertTheme.displayFont(size: 64, relativeTo: .largeTitle))
                        .textCase(.uppercase)
                        .foregroundStyle(Color.xertOffWhite)
                        .lineLimit(2)
                        .minimumScaleFactor(0.58)
                    .padding(.top, 10)

                    Text(content.subheading ?? "Structured functional fitness coaching designed for strength, conditioning, movement quality and long-term performance.")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.xertPale)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) {
                            heroActions
                        }
                        VStack(spacing: 10) {
                            heroActions
                        }
                    }
                    .padding(.top, 18)

                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color.xertSteel)
                            .frame(width: 7, height: 7)
                        Text(content.supporting ?? "Booking-based semi-private classes · Kingaroy QLD")
                            .font(.caption2.weight(.semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(Color.xertSteel)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 14)
                }
                .padding(.horizontal, 20)
                .padding(.top, XertScreenLayout.heroContentTopInset(deviceTopInset: topSafeAreaInset))
                .padding(.bottom, 24)
            }
        }
        .accessibilityElement(children: .contain)
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name.NSProcessInfoPowerStateDidChange)) { _ in
            isLowPowerModeEnabled = ProcessInfo.processInfo.isLowPowerModeEnabled
        }
        .task(id: carouselTaskID) {
            if photoIndex >= heroPhotoURLs.count { photoIndex = 0 }
            guard heroPhotoURLs.count > 1, allowsAutomaticCarousel else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled, allowsAutomaticCarousel else { return }
            withAnimation(.easeInOut(duration: 1.2)) {
                photoIndex = (photoIndex + 1) % heroPhotoURLs.count
            }
        }
    }

    @ViewBuilder
    private var heroImage: some View {
        if let url = currentHeroPhotoURL {
            XertRemoteImage(
                url: url,
                maximumPointDimension: 760,
                contentMode: .fill
            ) {
                fallbackImage
            }
            .id(url)
            .transition(.opacity)
        } else {
            fallbackImage
        }
    }

    private var heroPhotoURLs: [URL] {
        guard let photos = content.photos else { return [] }
        var seen = Set<URL>()
        return photos.compactMap { value in
            guard let url = publicPhotoURL(value), seen.insert(url).inserted else { return nil }
            return url
        }
    }

    private var currentHeroPhotoURL: URL? {
        guard heroPhotoURLs.indices.contains(photoIndex) else { return heroPhotoURLs.first }
        return heroPhotoURLs[photoIndex]
    }

    private var carouselTaskID: String {
        "\(allowsAutomaticCarousel)-\(photoIndex)-" + heroPhotoURLs.map(\.absoluteString).joined(separator: "|")
    }

    private var allowsAutomaticCarousel: Bool {
        scenePhase == .active && !reduceMotion && !isLowPowerModeEnabled
    }

    private var fallbackImage: some View {
        Image("HeroTraining").resizable().scaledToFill()
    }

    private func publicPhotoURL(_ value: String) -> URL? {
        let url = value.hasPrefix("/") ? AppConfig.webURL(path: value) : URL(string: value)
        guard let url, ["https", "http"].contains(url.scheme?.lowercased()) else { return nil }
        return url
    }

    @ViewBuilder
    private var heroActions: some View {
        Button(action: onBook) {
            Text(bookingsEnabled
                 ? (isSignedIn ? "Book A Class" : "Book Your First Session")
                 : "Register interest")
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .buttonStyle(.xertPrimary)

        Button(action: onEvents) {
            Text("View Event Calendar")
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .buttonStyle(.xertGhost)
    }
}

private struct NativeValueStrip: View {
    private let values = ["Discipline", "Structure", "Purpose", "Performance"]

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                        if index > 0 {
                            Circle()
                                .fill(Color.xertSteel.opacity(0.45))
                                .frame(width: 4, height: 4)
                        }
                        Text(value)
                            .font(XertTheme.displayFont(size: 17, relativeTo: .headline))
                            .textCase(.uppercase)
                            .tracking(1.4)
                            .foregroundStyle(index.isMultiple(of: 2) ? Color.xertOffWhite : Color.xertSteel)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 15)
            }

            HStack(spacing: 0) {
                ValueMetric(label: "Coached model", value: "Semi-private")
                ValueMetric(label: "Programming", value: "12-week blocks")
                ValueMetric(label: "Location", value: "Kingaroy QLD")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 14)
            .background(Color.xertDeep.opacity(0.86))
        }
        .background(Color.xertInk.opacity(0.94))
        .overlay(alignment: .top) { Rectangle().fill(Color.xertSteel.opacity(0.22)).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Color.xertSteel.opacity(0.22)).frame(height: 1) }
    }
}

private struct ValueMetric: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .textCase(.uppercase)
                .foregroundStyle(Color.xertSteel)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(value)
                .font(XertTheme.displayFont(size: 15, relativeTo: .subheadline))
                .textCase(.uppercase)
                .foregroundStyle(Color.xertOffWhite)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
        .padding(.horizontal, 8)
        .overlay(alignment: .leading) {
            Rectangle().fill(Color.xertSteel.opacity(0.22)).frame(width: 1)
        }
    }
}

private struct NativeTrainingIdentity: View {
    let onExplore: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                Image("TrainingStyle")
                    .resizable()
                    .scaledToFill()
                    .frame(height: 230)
                    .clipped()
                    .saturation(0.62)
                    .brightness(-0.18)
                    .accessibilityHidden(true)

                LinearGradient(
                    colors: [Color.clear, Color.xertNavy.opacity(0.94)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                VStack(alignment: .leading, spacing: 7) {
                    Text("The XERT training system")
                        .xertEyebrow()
                    Text("Purposeful.\nProgressive.\nSustainable.")
                        .xertDisplay(39)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(18)
            }

            VStack(alignment: .leading, spacing: 14) {
                Text("Every session is programmed with intent and delivered through a booking-based coaching model designed to help you train consistently, move better and improve over time.")
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    TrainingPillar(icon: "figure.strengthtraining.traditional", label: "Coach-led")
                    TrainingPillar(icon: "chart.line.uptrend.xyaxis", label: "Progressive")
                    TrainingPillar(icon: "trophy", label: "Event-led")
                }

                Button("Explore how XERT trains", action: onExplore)
                    .buttonStyle(.xertGhost)
            }
            .padding(18)
            .background(Color.xertInk.opacity(0.9))
        }
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.24), lineWidth: 1))
    }
}

private struct TrainingPillar: View {
    let icon: String
    let label: String

    var body: some View {
        VStack(spacing: 7) {
            Image(systemName: icon)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.xertSteel)
            Text(label)
                .font(.caption2.weight(.bold))
                .textCase(.uppercase)
                .foregroundStyle(Color.xertOffWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, minHeight: 68)
        .background(Color.xertDeep.opacity(0.34))
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.18), lineWidth: 1))
    }
}

private struct MemberNoticeCenter: View {
    @Environment(\.dismiss) private var dismiss
    let announcements: [MemberAnnouncement]
    let highlightedAnnouncementID: UUID?
    let dismissingAnnouncementID: UUID?
    let onAction: (MemberAnnouncement) -> Void
    let onDismiss: (MemberAnnouncement) -> Void

    private var orderedAnnouncements: [MemberAnnouncement] {
        guard
            let highlightedAnnouncementID,
            let highlighted = announcements.first(where: { $0.id == highlightedAnnouncementID })
        else { return announcements }
        return [highlighted] + announcements.filter { $0.id != highlightedAnnouncementID }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if orderedAnnouncements.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "bell.slash")
                                .font(.title2)
                                .foregroundStyle(Color.xertSteel)
                            Text("You're all caught up")
                                .font(.headline)
                                .foregroundStyle(Color.xertOffWhite)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 64)
                    } else {
                        ForEach(orderedAnnouncements) { announcement in
                            MemberAnnouncementRow(
                                announcement: announcement,
                                isDismissing: dismissingAnnouncementID == announcement.id,
                                dismissDisabled: dismissingAnnouncementID != nil,
                                onAction: { onAction(announcement) },
                                onDismiss: { onDismiss(announcement) }
                            )
                            .overlay {
                                if announcement.id == highlightedAnnouncementID {
                                    Rectangle().stroke(Color.xertSteel, lineWidth: 2)
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .xertScreenBackground()
            .navigationTitle("Member Notices")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.xertSteel)
                }
            }
        }
    }
}

private struct MemberAnnouncementRow: View {
    let announcement: MemberAnnouncement
    let isDismissing: Bool
    let dismissDisabled: Bool
    let onAction: () -> Void
    let onDismiss: () -> Void

    private var accent: Color {
        switch announcement.tone {
        case "urgent": return Color(red: 240 / 255, green: 161 / 255, blue: 161 / 255)
        case "action": return Color(red: 224 / 255, green: 179 / 255, blue: 106 / 255)
        default: return .xertSteel
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Rectangle()
                .fill(accent)
                .frame(width: 3)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .top) {
                    Text(announcement.priorityLabel)
                        .font(.caption2.weight(.bold))
                        .textCase(.uppercase)
                        .tracking(1.2)
                        .foregroundStyle(accent)
                    Spacer()
                    Button(action: onDismiss) {
                        if isDismissing {
                            ProgressView().tint(.xertSteel)
                        } else {
                            Image(systemName: "xmark")
                        }
                    }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                    .disabled(dismissDisabled)
                    .foregroundStyle(Color.xertMuted)
                    .accessibilityLabel("Dismiss \(announcement.title)")
                }
                Text(announcement.title)
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
                Text(announcement.body)
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale)
                    .fixedSize(horizontal: false, vertical: true)
                if let action = announcement.action {
                    Button(action: onAction) {
                        Label(action.label, systemImage: action.nativeTab == nil ? "arrow.up.right.square" : "arrow.right")
                    }
                    .buttonStyle(.xertPrimary)
                }
                if let expiry = announcement.expires_at {
                    Text("Available until \(expiry.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(Color.xertMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .xertCardStyle()
        .accessibilityElement(children: .contain)
    }
}

private struct QuickActionCard: View {
    let icon: String
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(Color.xertSteel)
                Text(title)
                    .font(.caption.weight(.bold))
                    .textCase(.uppercase)
                    .tracking(1.2)
                    .foregroundStyle(Color.xertOffWhite)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .xertCardStyle()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

private struct MetricView: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .xertDisplay(32)
            Text(label)
                .xertEyebrow()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct EmptyAction: View {
    let message: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.xertPale)
            Button(actionTitle, action: action)
                .buttonStyle(.xertPrimary)
        }
    }
}
