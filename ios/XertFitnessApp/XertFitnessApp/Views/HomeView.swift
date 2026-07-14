import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.openURL) private var openURL
    let onNavigate: (Int) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    NativeHomeHero(
                        isSignedIn: store.isSignedIn,
                        onBook: { onNavigate(1) },
                        onEvents: { onNavigate(2) },
                        onRefresh: { Task { await store.refresh() } }
                    )
                    .frame(height: heroHeight)

                    VStack(alignment: .leading, spacing: 18) {
                        CachedPublicDataNotice()
                        StaleMemberDataNotice()
                        DataAvailabilityNotice(sources: Set(XertDataSource.allCases))
                        announcementsSection
                        todayTrainingSection
                        creditExpirySection
                        nextUpSection
                        quickActions
                        glanceSection
                        nextEventSection
                        sessionPacksSection
                    }
                    .padding()
                }
            }
            .ignoresSafeArea(edges: .top)
            .refreshable {
                await store.refresh()
            }
            .xertScreenBackground()
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var heroHeight: CGFloat {
        min(640, max(560, UIScreen.main.bounds.height * 0.72))
    }

    // MARK: - Member notices

    @ViewBuilder
    private var announcementsSection: some View {
        if store.isSignedIn && !store.announcements.isEmpty {
            XertSection(title: "Member notices") {
                VStack(spacing: 12) {
                    ForEach(store.announcements) { announcement in
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
                        onNavigate(1)
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
            onNavigate(1)
        }
        QuickActionCard(icon: "trophy", title: "Events") {
            onNavigate(2)
        }
        QuickActionCard(icon: "person.crop.circle", title: "Account") {
            onNavigate(3)
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
                        onNavigate(3)
                    }
                    .buttonStyle(.xertGhost)
                }
            } else if store.isSignedIn {
                EmptyAction(
                    message: "No class booked yet.",
                    actionTitle: "Browse classes",
                    action: { onNavigate(1) }
                )
            } else {
                EmptyAction(
                    message: "Sign in to manage bookings and credits.",
                    actionTitle: "Sign in",
                    action: { onNavigate(3) }
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
                        onNavigate(3)
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
                        onNavigate(2)
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
                onNavigate(1)
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
    let isSignedIn: Bool
    let onBook: () -> Void
    let onEvents: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                Image("HeroTraining")
                    .resizable()
                    .scaledToFill()
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

                    VStack(alignment: .leading, spacing: 0) {
                        Text("Beat Your")
                            .font(XertTheme.displayFont(size: 64, relativeTo: .largeTitle))
                            .textCase(.uppercase)
                            .foregroundStyle(Color.xertOffWhite)
                        Text("Best.")
                            .font(XertTheme.displayFont(size: 64, relativeTo: .largeTitle))
                            .textCase(.uppercase)
                            .foregroundStyle(Color.xertSteel)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .padding(.top, 10)

                    Text("Structured functional fitness coaching designed for strength, conditioning, movement quality and long-term performance.")
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
                        Text("Booking-based semi-private classes · Kingaroy QLD")
                            .font(.caption2.weight(.semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(Color.xertSteel)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 14)
                }
                .padding(.horizontal, 20)
                .padding(.top, max(proxy.safeAreaInsets.top, 18) + 10)
                .padding(.bottom, 24)
            }
        }
        .accessibilityElement(children: .contain)
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
