import SwiftUI

struct EventsView: View {
    @EnvironmentObject private var store: XertStore
    @State private var showCompleted = false
    @State private var addingToCalendarID: String?
    @State private var calendarNotice: CalendarNotice?
    let onNavigate: (Int) -> Void

    var body: some View {
        NavigationStack {
            List {
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

                if store.isSignedIn, !trainingGoals.isEmpty {
                    Section {
                        ForEach(trainingGoals, id: \.stableID) { event in
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
                }

                Section {
                    Picker("Calendar range", selection: $showCompleted) {
                        Text("Upcoming").tag(false)
                        Text("All events").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.xertInk)
                }

                if monthSections.isEmpty {
                    Section {
                        Text(showCompleted ? "No calendar events yet." : "No upcoming events yet.")
                            .foregroundStyle(Color.xertMuted)
                            .listRowBackground(Color.xertInk)
                    }
                } else {
                    ForEach(monthSections) { section in
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
            }
            .xertListBackground()
            .navigationTitle("Events")
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                await store.refresh()
            }
            .alert(item: $calendarNotice) { notice in
                Alert(
                    title: Text(notice.title),
                    message: Text(notice.message),
                    dismissButton: .default(Text("OK"))
                )
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
    }

    private func eventHeader(_ event: EventItem) -> some View {
        HStack(alignment: .top, spacing: 14) {
            dateBlock(for: event)
            VStack(alignment: .leading, spacing: 6) {
                Text(event.category ?? "event")
                    .xertEyebrow()
                Text(event.name)
                    .xertDisplay(20)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    if let date = event.event_date {
                        Text(dateLabel(start: date, end: event.end_date))
                    } else {
                        Text(EventLifecycle.dateTBC.label)
                    }
                    if event.lifecycle() == .happeningNow {
                        happeningNowChip
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
        }
        if event.startDate != nil {
            Button {
                Task { await addToCalendar(event) }
            } label: {
                Label(
                    addingToCalendarID == event.stableID ? "Adding..." : "Add to Calendar",
                    systemImage: "calendar.badge.plus"
                )
            }
            .buttonStyle(.xertGhost)
            .disabled(addingToCalendarID != nil)
        }
        if !event.isComplete, let eventID = event.id {
            if store.isSignedIn {
                Button {
                    Task { await store.toggleEventGoal(event) }
                } label: {
                    Label(trainingGoalLabel(for: event), systemImage: "target")
                }
                .buttonStyle(.xertPrimary)
                .disabled(store.updatingEventGoalID == eventID)
            } else {
                Button {
                    onNavigate(3)
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
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: value) else { return value }
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
        if store.updatingEventGoalID == id { return "Saving goal..." }
        return store.eventGoalIDs.contains(id) ? "Training goal" : "Train for this"
    }

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
