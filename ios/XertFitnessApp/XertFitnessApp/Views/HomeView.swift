import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: XertStore
    let onNavigate: (Int) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    CachedPublicDataNotice()
                    StaleMemberDataNotice()
                    DataAvailabilityNotice(sources: Set(XertDataSource.allCases))

                    VStack(alignment: .leading, spacing: 10) {
                        Text("XERT Fitness")
                            .font(.system(size: 44, weight: .black, design: .default))
                            .foregroundStyle(.xertOffWhite)
                        Text("Train with purpose. Compete together.")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.xertSteel)
                        Text("Semi-private coaching, structured blocks, and event-led training for Kingaroy and South East Queensland.")
                            .foregroundStyle(.white.opacity(0.72))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)

                    XertSection(title: "At a glance") {
                        HStack(spacing: 14) {
                            MetricView(value: "\(store.sessions.count)", label: "Classes")
                            MetricView(value: "\(store.creditTotal)", label: "Credits")
                            MetricView(value: "\(store.events.count)", label: "Events")
                        }
                    }

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
                                        .foregroundStyle(.xertSteel)
                                }
                                Text(booking.start_time.formatted(date: .abbreviated, time: .shortened))
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.7))
                                if let location = booking.location_zone {
                                    Label(location, systemImage: "mappin")
                                        .font(.caption)
                                        .foregroundStyle(.white.opacity(0.55))
                                }
                                Button("View bookings") {
                                    onNavigate(3)
                                }
                                .buttonStyle(.bordered)
                                .tint(.xertSteel)
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

                    XertSection(title: "Next event") {
                        if let event = nextEvent {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(event.name)
                                    .font(.headline)
                                    .foregroundStyle(.xertOffWhite)
                                Text(event.event_date ?? "Date to be confirmed")
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.7))
                                if let location = event.location {
                                    Label(location, systemImage: "mappin")
                                        .font(.caption)
                                        .foregroundStyle(.white.opacity(0.55))
                                }
                                Button("View event calendar") {
                                    onNavigate(2)
                                }
                                .buttonStyle(.bordered)
                                .tint(.xertSteel)
                            }
                        } else {
                            Text("The event calendar is being prepared.")
                                .foregroundStyle(.white.opacity(0.7))
                        }
                    }

                    XertSection(title: "Session Packs") {
                        ForEach(store.products.prefix(3)) { product in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(product.name)
                                        .font(.headline)
                                        .foregroundStyle(.xertOffWhite)
                                    Text("\(product.sessionsCount) sessions")
                                        .font(.caption)
                                        .foregroundStyle(.white.opacity(0.55))
                                }
                                Spacer()
                                Text(product.displayPrice)
                                    .font(.headline)
                                    .foregroundStyle(.xertSteel)
                            }
                            .padding(.vertical, 6)
                        }
                        Button("View session packs") {
                            onNavigate(1)
                        }
                        .buttonStyle(.bordered)
                        .tint(.xertSteel)
                    }
                }
                .padding()
            }
            .background(Color.xertNavy.ignoresSafeArea())
            .navigationTitle("XERT")
            .toolbar {
                Button {
                    Task { await store.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
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

private struct MetricView: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.title.bold())
                .foregroundStyle(.xertOffWhite)
            Text(label.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.xertSteel)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct EmptyAction: View {
    let message: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message)
                .foregroundStyle(.white.opacity(0.7))
            Button(actionTitle, action: action)
                .buttonStyle(.bordered)
                .tint(.xertSteel)
        }
    }
}
