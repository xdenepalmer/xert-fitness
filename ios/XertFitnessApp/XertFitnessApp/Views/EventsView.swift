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
                    }
                }
                if !store.unavailableDataSources.isDisjoint(with: [.events, .eventGoals]) {
                    Section {
                        DataAvailabilityNotice(sources: [.events, .eventGoals])
                    }
                }

                Section {
                    Text("XERT programming follows the South East Queensland sporting and fitness calendar.")
                        .foregroundStyle(.secondary)
                }

                if store.isSignedIn, !trainingGoals.isEmpty {
                    Section("Your Training Goals") {
                        ForEach(trainingGoals, id: \.stableID) { event in
                            Label(event.name, systemImage: "target")
                        }
                    }
                }

                Section {
                    Picker("Calendar range", selection: $showCompleted) {
                        Text("Upcoming").tag(false)
                        Text("All events").tag(true)
                    }
                    .pickerStyle(.segmented)
                }

                if monthSections.isEmpty {
                    Section {
                        Text(showCompleted ? "No calendar events yet." : "No upcoming events yet.")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    ForEach(monthSections) { section in
                        Section(section.title) {
                            ForEach(section.events, id: \.stableID) { event in
                                eventRow(event)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Events")
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
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(event.name)
                    .font(.headline)
                Spacer()
                Text((event.category ?? "event").uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.xertSteel)
            }
            HStack(spacing: 8) {
                if let date = event.event_date {
                    Text(dateLabel(start: date, end: event.end_date))
                } else {
                    Text(EventLifecycle.dateTBC.label)
                }
                if event.lifecycle() == .happeningNow {
                    Text(EventLifecycle.happeningNow.label)
                        .fontWeight(.semibold)
                        .foregroundStyle(.xertSteel)
                }
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            if let location = event.location {
                Label(location, systemImage: "mappin")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let url = event.externalURL {
                Link(destination: url) {
                    Label("Event details", systemImage: "arrow.up.right.square")
                        .font(.subheadline.weight(.semibold))
                }
                .tint(.xertSteel)
            }
            if event.startDate != nil {
                Button {
                    Task { await addToCalendar(event) }
                } label: {
                    Label(
                        addingToCalendarID == event.stableID ? "Adding..." : "Add to Calendar",
                        systemImage: "calendar.badge.plus"
                    )
                    .font(.subheadline.weight(.semibold))
                }
                .disabled(addingToCalendarID != nil)
                .tint(.xertSteel)
            }
            if !event.isComplete, let eventID = event.id {
                if store.isSignedIn {
                    Button {
                        Task { await store.toggleEventGoal(event) }
                    } label: {
                        Label(trainingGoalLabel(for: event), systemImage: "target")
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(store.updatingEventGoalID == eventID)
                    .tint(.xertSteel)
                } else {
                    Button {
                        onNavigate(3)
                    } label: {
                        Label("Sign in to train for this", systemImage: "person.crop.circle")
                            .font(.subheadline.weight(.semibold))
                    }
                    .tint(.xertSteel)
                }
            }
        }
        .padding(.vertical, 4)
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
