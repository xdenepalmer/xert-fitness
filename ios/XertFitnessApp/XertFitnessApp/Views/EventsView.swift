import SwiftUI

struct EventsView: View {
    @EnvironmentObject private var store: XertStore

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("XERT programming follows the South East Queensland sporting and fitness calendar.")
                        .foregroundStyle(.secondary)
                }

                Section("Coming Up") {
                    let events = store.events
                        .filter { $0.event_date != nil && !$0.isComplete }
                        .sorted { ($0.event_date ?? "") < ($1.event_date ?? "") }

                    if events.isEmpty {
                        Text("No upcoming events yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(events, id: \.stableID) { event in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(event.name)
                                        .font(.headline)
                                    Spacer()
                                    Text((event.category ?? "event").uppercased())
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(.xertSteel)
                                }
                                if let date = event.event_date {
                                    Text(dateLabel(start: date, end: event.end_date))
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
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
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Events")
            .refreshable {
                await store.refresh()
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
}
