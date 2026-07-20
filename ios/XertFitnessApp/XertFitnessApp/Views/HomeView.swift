import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.openURL) private var openURL
    let route: XertMemberRoute
    let routeSequence: UInt
    let onNavigate: (XertPrimaryDestination) -> Void
    @State private var showingNoticeCenter = false
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
                            noticeCount: store.announcements.count,
                            topSafeAreaInset: viewport.safeAreaInsets.top,
                            onBook: { onNavigate(.booking) },
                            onEvents: { onNavigate(.events) },
                            onNotices: openNoticeCenter,
                            onRefresh: { Task { await store.refresh() } }
                        )
                        .frame(height: XertScreenLayout.homeHeroHeight(
                            viewportHeight: viewport.size.height,
                            deviceTopInset: viewport.safeAreaInsets.top,
                            usesAccessibilityText: dynamicTypeSize.isAccessibilitySize
                        ))

                        NativeValueStrip()

                        VStack(alignment: .leading, spacing: 18) {
                            CachedPublicDataNotice()
                            StaleMemberDataNotice()
                            DataAvailabilityNotice(sources: Set(XertDataSource.allCases))
                            announcementsSection
                            NativeTrainingIdentity(onExplore: { onNavigate(.explore) })
                            todayTrainingSection
                            creditExpirySection
                            nextUpSection
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
        if let tab = action.nativeTab {
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
                    Button("Book A Class") {
                        onNavigate(.booking)
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
        QuickActionCard(icon: "calendar.badge.plus", title: "Book") {
            onNavigate(.booking)
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
        MetricView(value: "\(store.sessions.count)", label: "Classes")
        MetricView(value: "\(store.creditTotal)", label: "Credits")
        MetricView(value: "\(store.events.count)", label: "Events")
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
                    actionTitle: "Browse classes",
                    action: { onNavigate(.booking) }
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
        if store.isSignedIn && !todayBookings.isEmpty {
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
            Button("View session packs") {
                onNavigate(.booking)
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
        store.bookings
            .filter { $0.isActiveClassPlace && $0.occursOnBrisbaneDay() }
            .sorted { $0.start_time < $1.start_time }
    }

    private var nextEvent: EventItem? {
        store.events
            .filter { !$0.isComplete }
            .sorted { ($0.event_date ?? "") < ($1.event_date ?? "") }
            .first
    }
}

private struct NativeHomeHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var photoIndex = 0
    @State private var isLowPowerModeEnabled = ProcessInfo.processInfo.isLowPowerModeEnabled
    let content: AdminSiteContentData
    let isSignedIn: Bool
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
            Text(isSignedIn ? "Book A Class" : "Book Your First Session")
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
                    .disabled(isDismissing)
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
