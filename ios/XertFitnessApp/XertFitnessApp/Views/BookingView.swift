import SwiftUI

struct BookingView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.openURL) private var openURL
    @State private var activeSheet: BookingSheet?
    let onNavigate: (Int) -> Void

    var body: some View {
        NavigationStack {
            List {
                if store.isUsingCachedPublicData {
                    Section {
                        CachedPublicDataNotice()
                    }
                }

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
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Sign in to book classes and buy packs.")
                                .foregroundStyle(.secondary)
                            Button("Sign in or create an account") {
                                onNavigate(3)
                            }
                        }
                    }
                }

                Section("Buy Session Packs") {
                    ForEach(store.products) { product in
                        Button {
                            guard store.isSignedIn else {
                                onNavigate(3)
                                return
                            }
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
                                        booking.stateLabel,
                                        systemImage: booking.status == "confirmed" ? "checkmark.circle" : "clock"
                                    )
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.xertSteel)
                                } else if session.booking_mode == "interest_only" {
                                    Button {
                                        activeSheet = .classInterest(session)
                                    } label: {
                                        Label("Register interest", systemImage: "person.2")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(.xertSteel)
                                } else {
                                    Button {
                                        if store.isSignedIn {
                                            Task { await store.book(session) }
                                        } else {
                                            onNavigate(3)
                                        }
                                    } label: {
                                        Label(
                                            store.isSignedIn
                                                ? (session.booking_mode == "request_to_book" ? "Request spot" : "Book class")
                                                : "Sign in to book",
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

                Section("Personal Training") {
                    Text("Request one-on-one coaching around your goals and availability.")
                        .foregroundStyle(.secondary)
                    Button {
                        activeSheet = .privateSession
                    } label: {
                        Label("Request PT Session", systemImage: "figure.strengthtraining.traditional")
                    }
                }
            }
            .navigationTitle("Book")
            .refreshable {
                await store.refresh()
            }
            .sheet(item: $activeSheet) { sheet in
                switch sheet {
                case .privateSession:
                    PrivateSessionRequestView(
                        initialName: initialName,
                        initialEmail: initialEmail,
                        initialPhone: initialPhone
                    )
                    .environmentObject(store)
                case .classInterest(let session):
                    ClassInterestRequestView(
                        session: session,
                        initialName: initialName,
                        initialEmail: initialEmail,
                        initialPhone: initialPhone
                    )
                    .environmentObject(store)
                }
            }
        }
    }

    private var activeBookings: [UUID: BookingItem] {
        Dictionary(
            uniqueKeysWithValues: store.bookings
                .filter(\.isActiveClassPlace)
                .map { ($0.session_id, $0) }
        )
    }

    private var initialName: String { store.profile?.full_name ?? "" }
    private var initialEmail: String { store.authSession?.user?.email ?? store.profile?.email ?? "" }
    private var initialPhone: String { store.profile?.phone ?? "" }
}

private enum BookingSheet: Identifiable {
    case privateSession
    case classInterest(ClassSession)

    var id: String {
        switch self {
        case .privateSession: return "private-session"
        case .classInterest(let session): return "class-interest-\(session.id.uuidString)"
        }
    }
}

private struct PrivateSessionRequestView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dismiss) private var dismiss
    @State private var fullName: String
    @State private var email: String
    @State private var phone: String
    @State private var sessionType = ""
    @State private var preferredDay = ""
    @State private var preferredTime = ""
    @State private var trainingGoal = ""
    @State private var experienceLevel = ""
    @State private var notes = ""
    @State private var consentsToContact = false
    @State private var validationMessage: String?
    @State private var submitted = false

    private let sessionTypes = ["30-minute PT session", "45-minute PT session", "60-minute PT session", "Intro assessment", "Private coaching block"]
    private let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Flexible"]
    private let times = ["Early morning (5-8am)", "Morning (8-11am)", "Lunch (11am-1pm)", "Afternoon (1-5pm)", "After work (5-7pm)", "Evening (7pm+)", "Flexible"]
    private let goals = ["Strength", "Conditioning", "Weight loss / body composition", "Rehab / return to fitness", "Event preparation", "Sport performance", "General health"]
    private let experience = ["Complete beginner", "Some experience", "Regular trainer", "Advanced"]

    init(initialName: String, initialEmail: String, initialPhone: String) {
        _fullName = State(initialValue: initialName)
        _email = State(initialValue: initialEmail)
        _phone = State(initialValue: initialPhone)
    }

    var body: some View {
        NavigationStack {
            if submitted {
                VStack(spacing: 16) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.xertSteel)
                    Text("Request Received")
                        .font(.title2.bold())
                    Text("The XERT team will contact you to confirm availability.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    Button("Done") { dismiss() }
                        .buttonStyle(.borderedProminent)
                        .tint(.xertSteel)
                }
                .padding(32)
            } else {
                Form {
                    Section("Contact") {
                        TextField("Full name", text: $fullName)
                            .textContentType(.name)
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                        TextField("Mobile number", text: $phone)
                            .textContentType(.telephoneNumber)
                            .keyboardType(.phonePad)
                    }

                    Section("Session") {
                        Picker("Session type", selection: $sessionType) {
                            Text("Choose a session").tag("")
                            ForEach(sessionTypes, id: \.self) { Text($0).tag($0) }
                        }
                        Picker("Preferred day", selection: $preferredDay) {
                            Text("Any day").tag("")
                            ForEach(days, id: \.self) { Text($0).tag($0) }
                        }
                        Picker("Preferred time", selection: $preferredTime) {
                            Text("Any time").tag("")
                            ForEach(times, id: \.self) { Text($0).tag($0) }
                        }
                    }

                    Section("Training") {
                        Picker("Goal", selection: $trainingGoal) {
                            Text("Choose a goal").tag("")
                            ForEach(goals, id: \.self) { Text($0).tag($0) }
                        }
                        Picker("Experience", selection: $experienceLevel) {
                            Text("Choose a level").tag("")
                            ForEach(experience, id: \.self) { Text($0).tag($0) }
                        }
                        TextField("Notes for your coach", text: $notes, axis: .vertical)
                            .lineLimit(2...5)
                    }

                    Section {
                        Toggle("XERT may contact me about this request", isOn: $consentsToContact)
                        if let validationMessage {
                            Text(validationMessage)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                        Button {
                            submit()
                        } label: {
                            HStack {
                                Label("Send PT Request", systemImage: "paperplane.fill")
                                Spacer()
                                if store.isRequestingPrivateSession { ProgressView() }
                            }
                        }
                        .disabled(store.isRequestingPrivateSession)
                    }
                }
            }
        }
        .navigationTitle("Personal Training")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
        }
    }

    private func submit() {
        validationMessage = nil
        guard consentsToContact else {
            validationMessage = "Consent to contact is required."
            return
        }
        do {
            let request = try PrivateSessionRequest(
                fullName: fullName,
                email: email,
                phone: phone,
                sessionType: sessionType,
                preferredDay: preferredDay,
                preferredTime: preferredTime,
                trainingGoal: trainingGoal,
                experienceLevel: experienceLevel,
                notes: notes
            )
            Task {
                let succeeded = await store.requestPrivateSession(request)
                if succeeded {
                    submitted = true
                } else {
                    validationMessage = store.errorMessage ?? "The request could not be sent. Please try again."
                    store.errorMessage = nil
                }
            }
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}

private struct ClassInterestRequestView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dismiss) private var dismiss
    let session: ClassSession
    @State private var fullName: String
    @State private var email: String
    @State private var phone: String
    @State private var trainingLevel = ""
    @State private var notes = ""
    @State private var consentsToContact = false
    @State private var validationMessage: String?
    @State private var submitted = false

    private let trainingLevels = ["New / beginner", "Some gym experience", "Regular trainer", "Advanced"]

    init(session: ClassSession, initialName: String, initialEmail: String, initialPhone: String) {
        self.session = session
        _fullName = State(initialValue: initialName)
        _email = State(initialValue: initialEmail)
        _phone = State(initialValue: initialPhone)
    }

    var body: some View {
        NavigationStack {
            if submitted {
                VStack(spacing: 16) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.xertSteel)
                    Text("Interest Registered")
                        .font(.title2.bold())
                    Text("The XERT team will contact you about \(session.title).")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    Button("Done") { dismiss() }
                        .buttonStyle(.borderedProminent)
                        .tint(.xertSteel)
                }
                .padding(32)
            } else {
                Form {
                    Section("Selected Class") {
                        Text(session.title).font(.headline)
                        Text(session.start_time.formatted(date: .abbreviated, time: .shortened))
                            .foregroundStyle(.secondary)
                        if let coach = session.coach_name {
                            Label(coach, systemImage: "person")
                                .foregroundStyle(.secondary)
                        }
                    }

                    Section("Contact") {
                        TextField("Full name", text: $fullName)
                            .textContentType(.name)
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                        TextField("Mobile number", text: $phone)
                            .textContentType(.telephoneNumber)
                            .keyboardType(.phonePad)
                    }

                    Section("Training") {
                        Picker("Training level", selection: $trainingLevel) {
                            Text("Choose a level").tag("")
                            ForEach(trainingLevels, id: \.self) { Text($0).tag($0) }
                        }
                        TextField("Notes for the coach", text: $notes, axis: .vertical)
                            .lineLimit(2...5)
                    }

                    Section {
                        Toggle("XERT may contact me about this class", isOn: $consentsToContact)
                        if let validationMessage {
                            Text(validationMessage)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                        Button {
                            submit()
                        } label: {
                            HStack {
                                Label("Register Interest", systemImage: "paperplane.fill")
                                Spacer()
                                if store.isRequestingClassInterest { ProgressView() }
                            }
                        }
                        .disabled(store.isRequestingClassInterest)
                    }
                }
            }
        }
        .navigationTitle("Class Interest")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
        }
    }

    private func submit() {
        validationMessage = nil
        guard consentsToContact else {
            validationMessage = "Consent to contact is required."
            return
        }
        do {
            let request = try ClassInterestRequest(
                sessionID: session.id,
                fullName: fullName,
                email: email,
                phone: phone,
                trainingLevel: trainingLevel,
                notes: notes
            )
            Task {
                let succeeded = await store.requestClassInterest(request)
                if succeeded {
                    submitted = true
                } else {
                    validationMessage = store.errorMessage ?? "The request could not be sent. Please try again."
                    store.errorMessage = nil
                }
            }
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}
