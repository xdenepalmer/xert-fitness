import SwiftUI

struct EventsView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showCompleted = false
    @State private var addingToCalendarID: String?
    @State private var calendarNotice: CalendarNotice?
    @State private var handledRouteSequence: UInt = 0
    let route: XertMemberRoute
    let routeSequence: UInt
    let onNavigate: (XertPrimaryDestination) -> Void

    private enum ScrollTarget: Hashable { case goals }

    var body: some View {
        let visibleTrainingGoals = trainingGoals
        let visibleMonthSections = monthSections

        NavigationStack {
            ScrollViewReader { proxy in
              List {
                Section {
                    XertPageHero(
                        imageName: "EventsHero",
                        eyebrow: "XERT Annual Calendar 2026",
                        title: "Compete Together.",
                        subtitle: "Choose the event ahead, train with purpose and build toward it with the XERT community.",
                        badge: visibleTrainingGoals.isEmpty
                            ? "South East Queensland"
                            : "\(visibleTrainingGoals.count) active training goal\(visibleTrainingGoals.count == 1 ? "" : "s")"
                    )
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)

                if store.isUsingCachedPublicData {
                    Section {
                        CachedPublicDataNotice()
                            .listRowBackground(Color.xertInk)
                    }
                }
                if !store.unavailableDataSources.isDisjoint(with: [.events, .eventGoals]) {
                    Section {
                        DataAvailabilityNotice(sources: [.events, .eventGoals])
                            .listRowBackground(Color.xertInk)
                    }
                }

                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("SEQ Calendar")
                            .xertEyebrow()
                        Text("XERT programming follows the South East Queensland sporting and fitness calendar.")
                            .font(.subheadline)
                            .foregroundStyle(Color.xertPale)
                    }
                    .padding(.vertical, 2)
                    .listRowBackground(Color.xertInk)
                }

                if store.isSignedIn, !visibleTrainingGoals.isEmpty {
                    Section {
                        ForEach(visibleTrainingGoals, id: \.stableID) { event in
                            Label {
                                Text(event.name)
                                    .foregroundStyle(Color.xertOffWhite)
                            } icon: {
                                Image(systemName: "target")
                                    .foregroundStyle(Color.xertSteel)
                            }
                            .listRowBackground(Color.xertInk)
                        }
                    } header: {
                        Text("Your Training Goals")
                            .xertEyebrow()
                    }
                    .id(ScrollTarget.goals)
                }

                Section {
                    Picker("Calendar range", selection: $showCompleted) {
                        Text("Upcoming").tag(false)
                        Text("All events").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.xertInk)
                }

                if visibleMonthSections.isEmpty {
                    Section {
                        if (store.isLoading || !store.hasBootstrapped) && store.events.isEmpty {
                            HStack(spacing: 10) {
                                ProgressView()
                                    .tint(.xertSteel)
                                Text("Loading the XERT event calendar…")
                                    .foregroundStyle(Color.xertMuted)
                            }
                            .accessibilityElement(children: .combine)
                        } else if store.unavailableDataSources.contains(.events) && store.events.isEmpty {
                            Label("Event calendar unavailable. Pull to refresh.", systemImage: "wifi.exclamationmark")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.orange)
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            Text(showCompleted ? "No calendar events yet." : "No upcoming events yet.")
                                .foregroundStyle(Color.xertMuted)
                        }
                    }
                    .listRowBackground(Color.xertInk)
                } else {
                    ForEach(visibleMonthSections) { section in
                        Section {
                            ForEach(section.events, id: \.stableID) { event in
                                eventRow(event)
                            }
                        } header: {
                            Text(section.title)
                                .xertEyebrow()
                        }
                    }
                }
                XertScrollEndSpacer()
              }
              .xertListBackground()
              .listStyle(.plain)
              .navigationTitle("Events")
              .navigationBarTitleDisplayMode(.inline)
              .toolbar(.hidden, for: .tabBar)
              .refreshable { await store.refresh() }
              .onAppear { focusRoute(using: proxy) }
              .onChange(of: routeSequence) { _ in focusRoute(using: proxy) }
              .onChange(of: store.eventGoalIDs) { _ in focusRoute(using: proxy) }
              .alert(item: $calendarNotice) { notice in
                  Alert(
                      title: Text(notice.title),
                      message: Text(notice.message),
                      dismissButton: .default(Text("OK"))
                  )
              }
            }
        }
    }

    private func focusRoute(using proxy: ScrollViewProxy) {
        guard routeSequence > 0,
              routeSequence != handledRouteSequence,
              route == .eventGoals,
              !trainingGoals.isEmpty else { return }
        handledRouteSequence = routeSequence
        Task { @MainActor in
            await Task.yield()
            withAnimation {
                proxy.scrollTo(ScrollTarget.goals, anchor: XertScreenLayout.routedContentAnchor)
            }
        }
    }

    @ViewBuilder
    private func eventRow(_ event: EventItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            eventHeader(event)
            eventActions(event)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .xertCardStyle()
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
        .accessibilityIdentifier("xert-event-\(event.stableID)")
    }

    @ViewBuilder
    private func eventHeader(_ event: EventItem) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            eventDetails(event)
        } else {
            HStack(alignment: .top, spacing: 14) {
                dateBlock(for: event)
                eventDetails(event)
            }
        }
    }

    private func eventDetails(_ event: EventItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(event.category ?? "event")
                .xertEyebrow()
            Text(event.name)
                .xertDisplay(20)
                .fixedSize(horizontal: false, vertical: true)
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 6) {
                        eventDateLabel(event)
                        if event.lifecycle() == .happeningNow { happeningNowChip }
                    }
                } else {
                    HStack(spacing: 8) {
                        eventDateLabel(event)
                        if event.lifecycle() == .happeningNow { happeningNowChip }
                    }
                }
            }
            .font(.caption)
            .foregroundStyle(Color.xertPale)
            if let location = event.location {
                Label {
                    Text(location)
                        .foregroundStyle(Color.xertMuted)
                } icon: {
                    Image(systemName: "mappin")
                        .foregroundStyle(Color.xertSteel)
                }
                .font(.caption)
            }
        }
    }

    @ViewBuilder
    private func eventDateLabel(_ event: EventItem) -> some View {
        if let date = event.event_date {
            Text(dateLabel(start: date, end: event.end_date))
        } else {
            Text(EventLifecycle.dateTBC.label)
        }
    }

    /// Square brand date block: Bebas day numeral over the abbreviated month.
    /// Decorative — the full date is read out in the row details.
    private func dateBlock(for event: EventItem) -> some View {
        VStack(spacing: 0) {
            if let start = event.startDate {
                Text(Self.dayNumberFormatter.string(from: start))
                    .xertDisplay(28)
                Text(Self.monthFormatter.string(from: start))
                    .xertEyebrow()
            } else {
                Text("TBC")
                    .xertDisplay(22)
                Text("date")
                    .xertEyebrow()
            }
        }
        .frame(width: 58, height: 58)
        .background(Color.xertDeep)
        .overlay(
            RoundedRectangle(cornerRadius: 2)
                .stroke(Color.xertSteel.opacity(0.35), lineWidth: 1)
        )
        .accessibilityHidden(true)
    }

    private var happeningNowChip: some View {
        Text(EventLifecycle.happeningNow.label)
            .font(.caption2.weight(.bold))
            .textCase(.uppercase)
            .tracking(1)
            .foregroundStyle(Color.xertNavy)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.xertSteel)
            .clipShape(RoundedRectangle(cornerRadius: 2))
    }

    @ViewBuilder
    private func eventActions(_ event: EventItem) -> some View {
        if let url = event.externalURL {
            Link(destination: url) {
                Label("Event details", systemImage: "arrow.up.right.square")
            }
            .buttonStyle(.xertGhost)
            .accessibilityHint("Opens the event website")
        }
        if event.startDate != nil {
            Button {
                Task { await addToCalendar(event) }
            } label: {
                HStack(spacing: 10) {
                    Label(
                        addingToCalendarID == event.stableID ? "Adding to calendar…" : "Add to Calendar",
                        systemImage: "calendar.badge.plus"
                    )
                    Spacer(minLength: 8)
                    if addingToCalendarID == event.stableID {
                        ProgressView()
                            .controlSize(.small)
                            .accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(.xertGhost)
            .disabled(addingToCalendarID != nil)
            .accessibilityValue(addingToCalendarID == event.stableID ? "In progress" : "")
        }
        if !event.isComplete, let eventID = event.id {
            if store.isSignedIn {
                Button {
                    Task { await store.toggleEventGoal(event) }
                } label: {
                    Label(
                        trainingGoalLabel(for: event),
                        systemImage: store.eventGoalIDs.contains(eventID) ? "checkmark.circle.fill" : "target"
                    )
                }
                .buttonStyle(.xertPrimary)
                .disabled(store.updatingEventGoalID != nil)
                .accessibilityHint(
                    store.eventGoalIDs.contains(eventID)
                        ? "Removes this event from your training goals"
                        : "Adds this event to your training goals"
                )
                .accessibilityValue(
                    store.updatingEventGoalID == eventID
                        ? "Saving"
                        : (store.updatingEventGoalID != nil ? "Another training goal is saving" : "")
                )
            } else {
                Button {
                    onNavigate(.account)
                } label: {
                    Label("Sign in to train for this", systemImage: "person.crop.circle")
                }
                .buttonStyle(.xertPrimary)
            }
        }
    }

    private func dateLabel(start: String, end: String?) -> String {
        let startLabel = displayDate(start)
        guard let end, end != start else { return startLabel }
        return "\(startLabel) - \(displayDate(end))"
    }

    private func displayDate(_ value: String) -> String {
        guard let date = Self.inputDateFormatter.date(from: value) else { return value }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    private var trainingGoals: [EventItem] {
        store.events
            .filter { event in
                guard let id = event.id else { return false }
                return store.eventGoalIDs.contains(id)
            }
            .sorted { ($0.startDate ?? .distantFuture) < ($1.startDate ?? .distantFuture) }
    }

    private var monthSections: [EventMonthSection] {
        XertEventCalendar.sections(from: store.events, includeCompleted: showCompleted)
    }

    private func trainingGoalLabel(for event: EventItem) -> String {
        guard let id = event.id else { return "Train for this" }
        if store.updatingEventGoalID == id { return "Saving goal…" }
        return store.eventGoalIDs.contains(id) ? "Remove training goal" : "Train for this"
    }

    private static let inputDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = EventItem.calendar
        formatter.locale = Locale(identifier: "en_AU_POSIX")
        formatter.timeZone = EventItem.calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let dayNumberFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = EventItem.calendar
        formatter.locale = Locale(identifier: "en_AU")
        formatter.timeZone = EventItem.calendar.timeZone
        formatter.dateFormat = "d"
        return formatter
    }()

    private static let monthFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = EventItem.calendar
        formatter.locale = Locale(identifier: "en_AU")
        formatter.timeZone = EventItem.calendar.timeZone
        formatter.dateFormat = "MMM"
        return formatter
    }()

    @MainActor
    private func addToCalendar(_ event: EventItem) async {
        addingToCalendarID = event.stableID
        defer { addingToCalendarID = nil }
        do {
            let result = try await EventCalendarWriter.add(event)
            calendarNotice = result == .added
                ? CalendarNotice(title: "Added to Calendar", message: "\(event.name) is now in your calendar.")
                : CalendarNotice(title: "Already in Calendar", message: "\(event.name) is already saved in your calendar.")
        } catch {
            calendarNotice = CalendarNotice(
                title: "Could Not Add Event",
                message: error.localizedDescription
            )
        }
    }
}

private struct CalendarNotice: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}
