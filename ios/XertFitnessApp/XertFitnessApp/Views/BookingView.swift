import SwiftUI

struct BookingView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            List {
                Section("Credits") {
                    if store.isSignedIn {
                        HStack {
                            Text("Available credits")
                            Spacer()
                            Text("\(store.creditTotal)")
                                .foregroundStyle(.xertSteel)
                                .fontWeight(.bold)
                        }
                    } else {
                        Text("Sign in from Account to book classes and buy packs.")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Buy Session Packs") {
                    ForEach(store.products) { product in
                        Button {
                            Task {
                                if let url = await store.checkoutURL(for: product) {
                                    openURL(url)
                                }
                            }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(product.name)
                                        .foregroundStyle(.primary)
                                    Text("\(product.sessionsCount) sessions")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(product.displayPrice)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(.xertSteel)
                            }
                        }
                    }
                }

                Section("Upcoming Classes") {
                    if store.sessions.isEmpty {
                        Text("No published classes yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(store.sessions) { session in
                            let booking = activeBookings[session.id]
                            VStack(alignment: .leading, spacing: 10) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(session.title)
                                            .font(.headline)
                                        Text(session.start_time.formatted(date: .abbreviated, time: .shortened))
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if let spots = session.spots_left {
                                        Text("\(spots) left")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(spots > 0 ? .xertSteel : .red)
                                    }
                                }

                                HStack {
                                    Label(session.coach_name ?? "Coach TBC", systemImage: "person")
                                    Spacer()
                                    Label(session.location_zone ?? "XERT", systemImage: "mappin")
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)

                                if let booking {
                                    Label(
                                        booking.status == "requested" ? "Request sent" : "Booked",
                                        systemImage: booking.status == "requested" ? "clock" : "checkmark.circle"
                                    )
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.xertSteel)
                                } else if session.booking_mode == "interest_only" {
                                    Button {
                                        openURL(AppConfig.webURL(path: "timetable"))
                                    } label: {
                                        Label("Register interest", systemImage: "person.2")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(.xertSteel)
                                } else {
                                    Button {
                                        Task { await store.book(session) }
                                    } label: {
                                        Label(
                                            session.booking_mode == "request_to_book" ? "Request spot" : "Book class",
                                            systemImage: session.booking_mode == "request_to_book" ? "clock.badge.checkmark" : "checkmark.circle"
                                        )
                                        .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(.xertSteel)
                                    .disabled((session.spots_left ?? 1) == 0 || store.bookingSessionID == session.id)
                                }
                            }
                            .padding(.vertical, 6)
                        }
                    }
                }
            }
            .navigationTitle("Book")
            .refreshable {
                await store.refresh()
            }
        }
    }

    private var activeBookings: [UUID: BookingItem] {
        Dictionary(
            uniqueKeysWithValues: store.bookings
                .filter { $0.status == "requested" || $0.status == "confirmed" }
                .map { ($0.session_id, $0) }
        )
    }
}
