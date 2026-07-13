import SwiftUI

struct BookingView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var activeSheet: BookingSheet?
    @State private var expandedSessionIDs: Set<UUID> = []
    @State private var classSearch = ""
    @State private var classDateWindow: ClassSessionDateWindow = .all
    @State private var classFit: ClassSessionFit = .all
    let onNavigate: (Int) -> Void

    var body: some View {
        NavigationStack {
            List {
                noticeSections
                creditsSection
                packsSection
                classDiscoverySection
                classesSection
                personalTrainingSection
            }
            .tint(.xertSteel)
            .xertListBackground()
            .navigationTitle("Book")
            .navigationBarTitleDisplayMode(.large)
            .searchable(
                text: $classSearch,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Class, coach or location"
            )
            .refreshable {
                await store.refresh()
                await store.reconcilePendingCheckout()
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

    // MARK: Sections

    @ViewBuilder
    private var noticeSections: some View {
        if store.isUsingCachedPublicData {
            Section {
                CachedPublicDataNotice()
            }
            .listRowBackground(Color.xertInk)
            .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
        }
        if !store.unavailableDataSources.isDisjoint(with: [.products, .sessions, .credits, .bookings]) {
            Section {
                DataAvailabilityNotice(sources: [.products, .sessions, .credits, .bookings])
            }
            .listRowBackground(Color.xertInk)
            .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
        }
    }

    private var creditsSection: some View {
        Section {
            if store.isSignedIn {
                HStack {
                    Text("Available credits")
                        .foregroundStyle(Color.xertOffWhite)
                    Spacer()
                    Text("\(store.creditTotal)")
                        .foregroundStyle(.xertSteel)
                        .fontWeight(.bold)
                }
                if store.isReconcilingCheckout {
                    HStack(spacing: 10) {
                        ProgressView()
                            .tint(.xertSteel)
                        Text("Confirming purchase...")
                            .foregroundStyle(Color.xertPale)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Confirming your session pack purchase")
                } else if store.isCheckoutConfirmationPending {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Purchase confirmation is taking longer than usual.", systemImage: "clock.arrow.circlepath")
                            .foregroundStyle(Color.xertPale)
                        Button("Check purchase again") {
                            Task { await store.reconcilePendingCheckout() }
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(.xertSteel)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Sign in to book classes and buy packs.")
                        .foregroundStyle(Color.xertMuted)
                    Button("Sign in or create an account") {
                        onNavigate(3)
                    }
                    .buttonStyle(.xertPrimary)
                }
                .padding(.vertical, 4)
            }
        } header: {
            Text("Credits").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var packsSection: some View {
        Section {
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
                    productSummary(product)
                }
            }
        } header: {
            Text("Buy Session Packs").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var classesSection: some View {
        Section {
            if store.sessions.isEmpty {
                Text("No published classes yet.")
                    .foregroundStyle(Color.xertMuted)
                    .listRowBackground(Color.xertInk)
            } else if visibleSessions.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("No classes match those filters.")
                        .foregroundStyle(Color.xertPale)
                    Button("Clear class filters", action: resetClassDiscovery)
                        .buttonStyle(.xertGhost)
                }
                .padding(.vertical, 4)
            } else {
                ForEach(visibleSessions) { session in
                    sessionCard(for: session)
                }
            }
        } header: {
            Text("Upcoming Classes (\(visibleSessions.count))").xertEyebrow()
        }
    }

    private var classDiscoverySection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text("When").font(.caption).foregroundStyle(Color.xertMuted)
                Picker("When", selection: $classDateWindow) {
                    ForEach(ClassSessionDateWindow.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Training fit").font(.caption).foregroundStyle(Color.xertMuted)
                Picker("Training fit", selection: $classFit) {
                    ForEach(ClassSessionFit.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            }

            if hasActiveClassDiscovery {
                Button(action: resetClassDiscovery) {
                    Label("Clear class filters", systemImage: "xmark.circle")
                }
                .foregroundStyle(.xertSteel)
            }
        } header: {
            Text("Find a Class").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var personalTrainingSection: some View {
        Section {
            Text("Request one-on-one coaching around your goals and availability.")
                .foregroundStyle(Color.xertPale)
            Button {
                activeSheet = .privateSession
            } label: {
                Label("Request PT Session", systemImage: "figure.strengthtraining.traditional")
            }
            .buttonStyle(.xertGhost)
        } header: {
            Text("Personal Training").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    // MARK: Session cards

    private func sessionCard(for session: ClassSession) -> some View {
        let booking = activeBookings[session.id]
        let timeConflict = session.isFull ? nil : BookingItem.timeConflict(for: session, in: store.bookings)
        return VStack(alignment: .leading, spacing: 12) {
            sessionHeader(session)
            sessionMetadata(session)
            .font(.caption)
            .foregroundStyle(Color.xertPale)

            if let timeConflict, booking == nil {
                Label("Overlaps \(timeConflict.title)", systemImage: "calendar.badge.exclamationmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.red)
                    .accessibilityLabel("Time conflict with \(timeConflict.title)")
            }

            DisclosureGroup(isExpanded: expansionBinding(for: session.id)) {
                sessionDetails(for: session)
                    .padding(.top, 10)
            } label: {
                Label("Class details", systemImage: "info.circle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.xertSteel)
            }
            .tint(.xertSteel)

            sessionAction(for: session, booking: booking, timeConflict: timeConflict)
        }
        .padding(14)
        .xertCardStyle()
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
    }

    @ViewBuilder
    private func productSummary(_ product: Product) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                productDetails(product)
                Text(product.displayPrice)
                    .fontWeight(.semibold)
                    .foregroundStyle(.xertSteel)
            }
        } else {
            HStack {
                productDetails(product)
                Spacer()
                Text(product.displayPrice)
                    .fontWeight(.semibold)
                    .foregroundStyle(.xertSteel)
            }
        }
    }

    private func productDetails(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(product.name)
                .foregroundStyle(Color.xertOffWhite)
            Text("\(product.sessionsCount) sessions")
                .font(.caption)
                .foregroundStyle(Color.xertMuted)
        }
    }

    @ViewBuilder
    private func sessionHeader(_ session: ClassSession) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                sessionTitle(session)
                if let spots = session.spots_left { spotsChip(spots) }
            }
        } else {
            HStack(alignment: .top) {
                sessionTitle(session)
                Spacer()
                if let spots = session.spots_left { spotsChip(spots) }
            }
        }
    }

    private func sessionTitle(_ session: ClassSession) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(session.title)
                .xertDisplay(20)
            Text(session.start_time.formatted(date: .abbreviated, time: .shortened))
                .font(.subheadline)
                .foregroundStyle(Color.xertPale)
        }
    }

    @ViewBuilder
    private func sessionMetadata(_ session: ClassSession) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 6) {
                Label(session.coach_name ?? "Coach TBC", systemImage: "person")
                Label(session.location_zone ?? "XERT", systemImage: "mappin")
            }
        } else {
            HStack {
                Label(session.coach_name ?? "Coach TBC", systemImage: "person")
                Spacer()
                Label(session.location_zone ?? "XERT", systemImage: "mappin")
            }
        }
    }

    private func expansionBinding(for sessionID: UUID) -> Binding<Bool> {
        Binding(
            get: { expandedSessionIDs.contains(sessionID) },
            set: { isExpanded in
                if isExpanded {
                    expandedSessionIDs.insert(sessionID)
                } else {
                    expandedSessionIDs.remove(sessionID)
                }
            }
        )
    }

    @ViewBuilder
    private func sessionDetails(for session: ClassSession) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let description = session.description?.trimmingCharacters(in: .whitespacesAndNewlines),
               !description.isEmpty {
                Text(description)
                    .font(.footnote)
                    .foregroundStyle(Color.xertPale)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 7) {
                if let classType = session.class_type, !classType.isEmpty {
                    detailRow("Training style", value: classType, icon: "figure.strengthtraining.traditional")
                }
                if let intensity = session.intensity_level, !intensity.isEmpty {
                    detailRow("Intensity", value: intensity, icon: "speedometer")
                }
                if let duration = session.duration_minutes {
                    detailRow("Duration", value: "\(duration) minutes", icon: "clock")
                }
                if let endTime = session.end_time {
                    detailRow("Finishes", value: endTime.formatted(date: .omitted, time: .shortened), icon: "flag.checkered")
                }
                if session.beginner_friendly == true {
                    detailRow("Suitable for", value: "Beginners", icon: "checkmark.seal")
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func detailRow(_ label: String, value: String, icon: String) -> some View {
        Label {
            Text("\(label): \(value)")
        } icon: {
            Image(systemName: icon)
                .frame(width: 18)
        }
        .font(.caption)
        .foregroundStyle(Color.xertMuted)
    }

    @ViewBuilder
    private func sessionAction(for session: ClassSession, booking: BookingItem?, timeConflict: BookingItem?) -> some View {
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
            }
            .buttonStyle(.xertGhost)
        } else if session.isFull {
            Button {
                if store.isSignedIn {
                    Task { await store.joinWaitlist(session) }
                } else {
                    onNavigate(3)
                }
            } label: {
                Label(store.isSignedIn ? "Join waitlist" : "Sign in to join waitlist", systemImage: "person.2.badge.plus")
            }
            .buttonStyle(.xertPrimary)
            .disabled(store.bookingSessionID == session.id)
        } else if timeConflict != nil {
            Label("Time conflict", systemImage: "exclamationmark.circle")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.red)
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
            }
            .buttonStyle(.xertPrimary)
            .disabled(store.bookingSessionID == session.id)
        }
    }

    private func spotsChip(_ spots: Int) -> some View {
        let tone: Color = spots > 0 ? .xertSteel : .red
        return Text("\(spots) left")
            .font(.caption2.weight(.bold))
            .textCase(.uppercase)
            .tracking(1)
            .foregroundStyle(tone)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tone.opacity(0.14), in: RoundedRectangle(cornerRadius: 2))
            .overlay(
                RoundedRectangle(cornerRadius: 2)
                    .stroke(tone.opacity(0.5), lineWidth: 1)
            )
            .accessibilityLabel(spots > 0 ? "\(spots) spots left" : "No spots left")
    }

    private var activeBookings: [UUID: BookingItem] {
        BookingItem.activeBySession(store.bookings)
    }

    private var visibleSessions: [ClassSession] {
        ClassSessionDiscovery.sessions(
            from: store.sessions,
            search: classSearch,
            dateWindow: classDateWindow,
            fit: classFit
        )
    }

    private var hasActiveClassDiscovery: Bool {
        !classSearch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || classDateWindow != .all
            || classFit != .all
    }

    private func resetClassDiscovery() {
        classSearch = ""
        classDateWindow = .all
        classFit = .all
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
            Group {
                if submitted {
                    confirmationView
                } else {
                    requestForm
                }
            }
            .navigationTitle("Personal Training")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .tint(.xertSteel)
                }
            }
        }
    }

    private var confirmationView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.xertSteel)
            Text("Request Received")
                .xertDisplay(30)
            Text("The XERT team will contact you to confirm availability.")
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.xertPale)
            Button("Done") { dismiss() }
                .buttonStyle(.xertPrimary)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .xertScreenBackground()
    }

    private var requestForm: some View {
        Form {
            contactSection
            sessionSection
            trainingSection
            submitSection
        }
        .tint(.xertSteel)
        .xertListBackground()
    }

    private var contactSection: some View {
        Section {
            TextField("Full name", text: $fullName)
                .textContentType(.name)
                .foregroundStyle(Color.xertOffWhite)
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .foregroundStyle(Color.xertOffWhite)
            TextField("Mobile number", text: $phone)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .foregroundStyle(Color.xertOffWhite)
        } header: {
            Text("Contact").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var sessionSection: some View {
        Section {
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
        } header: {
            Text("Session").xertEyebrow()
        }
        .foregroundStyle(Color.xertOffWhite)
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var trainingSection: some View {
        Section {
            Picker("Goal", selection: $trainingGoal) {
                Text("Choose a goal").tag("")
                ForEach(goals, id: \.self) { Text($0).tag($0) }
            }
            .foregroundStyle(Color.xertOffWhite)
            Picker("Experience", selection: $experienceLevel) {
                Text("Choose a level").tag("")
                ForEach(experience, id: \.self) { Text($0).tag($0) }
            }
            .foregroundStyle(Color.xertOffWhite)
            TextField("Notes for your coach", text: $notes, axis: .vertical)
                .lineLimit(2...5)
                .foregroundStyle(Color.xertOffWhite)
        } header: {
            Text("Training").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var submitSection: some View {
        Section {
            Toggle("XERT may contact me about this request", isOn: $consentsToContact)
                .tint(.xertSteel)
                .foregroundStyle(Color.xertOffWhite)
                .listRowBackground(Color.xertInk)
                .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
            if let validationMessage {
                Text(validationMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .listRowBackground(Color.xertInk)
                    .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
            }
            Button {
                submit()
            } label: {
                HStack {
                    Label("Send PT Request", systemImage: "paperplane.fill")
                    Spacer()
                    if store.isRequestingPrivateSession {
                        ProgressView()
                            .tint(Color.xertNavy)
                    }
                }
            }
            .buttonStyle(.xertPrimary)
            .disabled(store.isRequestingPrivateSession)
            .opacity(store.isRequestingPrivateSession ? 0.5 : 1)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
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
            Group {
                if submitted {
                    confirmationView
                } else {
                    requestForm
                }
            }
            .navigationTitle("Class Interest")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .tint(.xertSteel)
                }
            }
        }
    }

    private var confirmationView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.xertSteel)
            Text("Interest Registered")
                .xertDisplay(30)
            Text("The XERT team will contact you about \(session.title).")
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.xertPale)
            Button("Done") { dismiss() }
                .buttonStyle(.xertPrimary)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .xertScreenBackground()
    }

    private var requestForm: some View {
        Form {
            selectedClassSection
            contactSection
            trainingSection
            submitSection
        }
        .tint(.xertSteel)
        .xertListBackground()
    }

    private var selectedClassSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(session.title)
                    .xertDisplay(20)
                Text(session.start_time.formatted(date: .abbreviated, time: .shortened))
                    .foregroundStyle(Color.xertPale)
                if let coach = session.coach_name {
                    Label(coach, systemImage: "person")
                        .foregroundStyle(Color.xertPale)
                }
            }
            .padding(.vertical, 2)
        } header: {
            Text("Selected Class").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var contactSection: some View {
        Section {
            TextField("Full name", text: $fullName)
                .textContentType(.name)
                .foregroundStyle(Color.xertOffWhite)
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .foregroundStyle(Color.xertOffWhite)
            TextField("Mobile number", text: $phone)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .foregroundStyle(Color.xertOffWhite)
        } header: {
            Text("Contact").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var trainingSection: some View {
        Section {
            Picker("Training level", selection: $trainingLevel) {
                Text("Choose a level").tag("")
                ForEach(trainingLevels, id: \.self) { Text($0).tag($0) }
            }
            .foregroundStyle(Color.xertOffWhite)
            TextField("Notes for the coach", text: $notes, axis: .vertical)
                .lineLimit(2...5)
                .foregroundStyle(Color.xertOffWhite)
        } header: {
            Text("Training").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var submitSection: some View {
        Section {
            Toggle("XERT may contact me about this class", isOn: $consentsToContact)
                .tint(.xertSteel)
                .foregroundStyle(Color.xertOffWhite)
                .listRowBackground(Color.xertInk)
                .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
            if let validationMessage {
                Text(validationMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .listRowBackground(Color.xertInk)
                    .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
            }
            Button {
                submit()
            } label: {
                HStack {
                    Label("Register Interest", systemImage: "paperplane.fill")
                    Spacer()
                    if store.isRequestingClassInterest {
                        ProgressView()
                            .tint(Color.xertNavy)
                    }
                }
            }
            .buttonStyle(.xertPrimary)
            .disabled(store.isRequestingClassInterest)
            .opacity(store.isRequestingClassInterest ? 0.5 : 1)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
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
