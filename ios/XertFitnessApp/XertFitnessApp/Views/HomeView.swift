import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let onNavigate: (Int) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    CachedPublicDataNotice()
                    StaleMemberDataNotice()
                    DataAvailabilityNotice(sources: Set(XertDataSource.allCases))

                    heroHeader
                    announcementsSection
                    quickActions
                    glanceSection
                    nextUpSection
                    nextEventSection
                    sessionPacksSection
                }
                .padding()
            }
            .xertScreenBackground()
            .navigationTitle("XERT")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                Button {
                    Task { await store.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .tint(.xertSteel)
                .accessibilityLabel("Refresh")
            }
        }
    }

    // MARK: - Hero

    private var heroHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            XertLogoHeader(height: 26)
            Text("XERT Fitness")
                .xertDisplay(42)
            Text("Train with purpose. Compete together.")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.xertSteel)
            Text("Semi-private coaching, structured blocks, and event-led training for Kingaroy and South East Queensland.")
                .font(.subheadline)
                .foregroundStyle(Color.xertPale)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
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
                            onDismiss: { Task { await store.dismissAnnouncement(announcement) } }
                        )
                    }
                }
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
            .filter { $0.isActiveClassPlace && $0.start_time > Date() }
            .sorted { $0.start_time < $1.start_time }
            .first
    }

    private var nextEvent: EventItem? {
        store.events
            .filter { !$0.isComplete }
            .sorted { ($0.event_date ?? "") < ($1.event_date ?? "") }
            .first
    }
}

private struct MemberAnnouncementRow: View {
    let announcement: MemberAnnouncement
    let isDismissing: Bool
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
