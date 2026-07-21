import SwiftUI

struct BookingView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.openURL) private var openURL
    @StateObject private var checkoutBrowser = CheckoutBrowser()
    @State private var activeSheet: BookingSheet?
    @State private var expandedSessionIDs: Set<UUID> = []
    @State private var classSearch = ""
    @State private var classDateWindow: ClassSessionDateWindow = .all
    @State private var classFit: ClassSessionFit = .all
    @State private var checkoutProductID: String?
    @State private var checkoutAttemptIDs: [String: UUID] = [:]
    @State private var checkoutErrorMessage: String?
    @State private var handledRouteSequence: UInt = 0
    let route: XertMemberRoute
    let routeSequence: UInt
    let onNavigate: (XertPrimaryDestination) -> Void
    let firstClassActivation: XertFirstClassActivation?
    let onRequireSignInForClass: (UUID) -> Void
    let onBookingNeedsCredits: (UUID) -> Void
    let onChooseCreditsForClass: (UUID) -> Void
    let onCheckoutStarted: () -> Void
    let onBookingCompleted: (UUID) -> Void

    private enum ScrollTarget: Hashable {
        case credits, packs, session(UUID)
    }

    var body: some View {
        let visibleSessions = ClassSessionDiscovery.sessions(
            from: store.sessions,
            search: classSearch,
            dateWindow: classDateWindow,
            fit: classFit
        )
        let activeBookings = BookingItem.activeBySession(store.bookings)

        NavigationStack {
            ScrollViewReader { proxy in
                List {
                    Section {
                        XertPageHero(
                            imageName: "BookHero",
                            eyebrow: "XERT Classes",
                            title: "Train. Book. Repeat.",
                            subtitle: store.publicContent(for: .booking).intro
                                ?? "Choose the session that matches your goal, reserve your place and arrive ready to work.",
                            badge: bookingHeroBadge
                        )
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)

                    noticeSections
                    creditsSection
                    packsSection
                    classDiscoverySection
                    classesSection(
                        visibleSessions: visibleSessions,
                        activeBookings: activeBookings
                    )
                    personalTrainingSection
                    XertScrollEndSpacer()
                }
                .tint(.xertSteel)
                .xertListBackground()
                .listStyle(.plain)
                .scrollDismissesKeyboard(.interactively)
                .navigationTitle("Book")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar(.hidden, for: .tabBar)
                .searchable(
                    text: $classSearch,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Class, coach or location"
                )
                .refreshable {
                    await store.refresh()
                    await store.reconcilePendingCheckout()
                }
                .onAppear { focusRoute(using: proxy) }
                .onChange(of: routeSequence) { _ in focusRoute(using: proxy) }
                .onChange(of: store.sessions) { _ in focusRoute(using: proxy) }
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
                .alert("Secure Checkout", isPresented: Binding(
                get: { checkoutErrorMessage != nil },
                set: { if !$0 { checkoutErrorMessage = nil } }
                )) {
                Button("OK") { checkoutErrorMessage = nil }
                } message: {
                Text(checkoutErrorMessage ?? "")
                }
            }
        }
    }

    private func focusRoute(using proxy: ScrollViewProxy) {
        guard routeSequence > 0, routeSequence != handledRouteSequence else { return }
        let target: ScrollTarget
        switch route {
        case .sessionPacks: target = .packs
        case .purchaseConfirmation: target = .credits
        case .classSession(let sessionID):
            guard store.sessions.contains(where: { $0.id == sessionID }) else { return }
            classSearch = ""
            classDateWindow = .all
            classFit = .all
            expandedSessionIDs.insert(sessionID)
            target = .session(sessionID)
        default: return
        }
        handledRouteSequence = routeSequence
        Task { @MainActor in
            await Task.yield()
            withAnimation { proxy.scrollTo(target, anchor: .top) }
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
        if !store.unavailableDataSources.isDisjoint(with: [.products, .sessions, .platformSettings, .credits, .bookings]) {
            Section {
                DataAvailabilityNotice(sources: [.products, .sessions, .platformSettings, .credits, .bookings])
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
                    Text(bookingCreditValue)
                        .foregroundStyle(.xertSteel)
                        .fontWeight(.bold)
                }
                if let status = bookingCreditStatus {
                    HStack(spacing: 8) {
                        if bookingCreditIsInitiallyLoading {
                            ProgressView()
                                .tint(.xertSteel)
                        } else {
                            Image(systemName: store.unavailableDataSources.contains(.credits)
                                ? "wifi.exclamationmark"
                                : "clock.arrow.circlepath")
                        }
                        Text(status)
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(bookingCreditStatusColor)
                    .accessibilityElement(children: .combine)
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
                        onNavigate(.account)
                    }
                    .buttonStyle(.xertPrimary)
                }
                .padding(.vertical, 4)
            }
        } header: {
            Text("Credits").xertEyebrow()
        }
        .id(ScrollTarget.credits)
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private var hasKnownCreditBalance: Bool {
        store.creditBalanceLoaded
    }

    private var bookingCreditIsInitiallyLoading: Bool {
        !hasKnownCreditBalance
            && !store.unavailableDataSources.contains(.credits)
            && (!store.hasBootstrapped || store.isLoading)
    }

    private var bookingCreditValue: String {
        hasKnownCreditBalance ? "\(store.creditTotal)" : "—"
    }

    private var bookingCreditStatus: String? {
        if store.unavailableDataSources.contains(.credits) {
            return hasKnownCreditBalance ? "Last known balance — pull to refresh" : "Balance unavailable — pull to refresh"
        }
        if bookingCreditIsInitiallyLoading {
            return "Loading your credit balance…"
        }
        if store.isUsingStaleMemberData {
            return "Last synced balance"
        }
        return nil
    }

    private var bookingCreditStatusColor: Color {
        if store.unavailableDataSources.contains(.credits) || store.isUsingStaleMemberData {
            return .orange
        }
        return Color.xertPale
    }

    private var bookingHeroBadge: String {
        guard store.isSignedIn else { return "Your first coached session starts here" }
        guard hasKnownCreditBalance else {
            return store.unavailableDataSources.contains(.credits)
                ? "Credit balance unavailable"
                : "Checking credit balance"
        }
        let balance = "\(store.creditTotal) credit\(store.creditTotal == 1 ? "" : "s") available"
        return store.unavailableDataSources.contains(.credits) || store.isUsingStaleMemberData
            ? "\(balance) · last synced"
            : balance
    }

    private var packsSection: some View {
        Section {
            if !store.paymentAvailabilityLoaded {
                HStack(spacing: 10) {
                    ProgressView()
                        .tint(.xertSteel)
                    Text("Checking secure checkout availability…")
                        .foregroundStyle(Color.xertPale)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Checking secure checkout availability")
            } else if store.unavailableDataSources.contains(.platformSettings) {
                Label {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Checkout status is unavailable")
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.xertOffWhite)
                        Text("Pull to refresh before buying a session pack.")
                            .font(.caption)
                            .foregroundStyle(Color.xertMuted)
                    }
                } icon: {
                    Image(systemName: "wifi.exclamationmark")
                        .foregroundStyle(Color.orange)
                }
                .accessibilityElement(children: .combine)
            } else if !store.sessionPackPaymentsEnabled {
                Label {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Pack purchases are paused")
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.xertOffWhite)
                        Text("Explore packs now. Secure checkout will reopen after XERT completes its payment launch checks.")
                            .font(.caption)
                            .foregroundStyle(Color.xertMuted)
                    }
                } icon: {
                    Image(systemName: "creditcard")
                        .foregroundStyle(Color.xertSteel)
                }
                .accessibilityElement(children: .combine)
            }

            if store.products.isEmpty {
                if store.isLoading || !store.hasBootstrapped {
                    bookingLoadingRow("Loading session packs…")
                } else if store.unavailableDataSources.contains(.products) {
                    bookingUnavailableRow("Session packs")
                } else {
                    Text("No session packs are available yet.")
                        .foregroundStyle(Color.xertMuted)
                }
            } else {
                ForEach(store.products) { product in
                    Button {
                        guard store.isSignedIn else {
                            onNavigate(.account)
                            return
                        }
                        guard checkoutProductID == nil, !checkoutBrowser.isPresenting else { return }
                        checkoutProductID = product.id
                        let checkoutAttemptID = checkoutAttemptIDs[product.id] ?? UUID()
                        checkoutAttemptIDs[product.id] = checkoutAttemptID
                        Task {
                            if let url = await store.checkoutURL(
                                for: product,
                                attemptID: checkoutAttemptID,
                                activationSessionID: firstClassActivation?.sessionID
                            ) {
                                onCheckoutStarted()
                                checkoutAttemptIDs[product.id] = nil
                                checkoutBrowser.start(url: url) { result in
                                    checkoutProductID = nil
                                    switch result {
                                    case .success(let callbackURL):
                                        NotificationCenter.default.post(name: .xertCheckoutCallback, object: callbackURL)
                                    case .failure(.cancelled):
                                        Task { await store.reconcilePendingCheckout() }
                                    case .failure(let error):
                                        checkoutErrorMessage = error.localizedDescription
                                        Task { await store.reconcilePendingCheckout() }
                                    }
                                }
                            } else {
                                checkoutProductID = nil
                            }
                        }
                    } label: {
                        ZStack(alignment: .trailing) {
                            productSummary(product)
                                .padding(.trailing, checkoutProductID == product.id ? 34 : 0)
                            if checkoutProductID == product.id {
                                ProgressView()
                                    .tint(Color.xertSteel)
                                    .accessibilityHidden(true)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .disabled(!store.sessionPackPaymentsEnabled || checkoutProductID != nil || checkoutBrowser.isPresenting)
                    .accessibilityLabel("\(product.name), \(product.sessionsCount) sessions, \(product.displayPrice)")
                    .accessibilityValue(checkoutProductID == product.id ? "Opening secure checkout" : "")
                    .accessibilityHint(store.isSignedIn ? "Opens secure checkout" : "Opens member sign in")
                }
            }
        } header: {
            Text(store.sessionPackPaymentsEnabled ? "Buy Session Packs" : "Session Packs").xertEyebrow()
        }
        .id(ScrollTarget.packs)
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    private func classesSection(
        visibleSessions: [ClassSession],
        activeBookings: [UUID: BookingItem]
    ) -> some View {
        Section {
            if store.bookingAvailabilityLoaded,
               !store.memberBookingsEnabled,
               !store.unavailableDataSources.contains(.platformSettings) {
                Label {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Online bookings are paused")
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.xertOffWhite)
                        Text("Browse the timetable and register interest. XERT will follow up about your place.")
                            .font(.caption)
                            .foregroundStyle(Color.xertMuted)
                    }
                } icon: {
                    Image(systemName: "person.2.badge.plus")
                        .foregroundStyle(Color.xertSteel)
                }
                .accessibilityElement(children: .combine)
            }

            if store.sessions.isEmpty {
                if store.isLoading || !store.hasBootstrapped {
                    bookingLoadingRow("Loading upcoming classes…")
                } else if store.unavailableDataSources.contains(.sessions) {
                    bookingUnavailableRow("Upcoming classes")
                } else {
                    Text("No published classes yet.")
                        .foregroundStyle(Color.xertMuted)
                        .listRowBackground(Color.xertInk)
                }
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
                    sessionCard(for: session, booking: activeBookings[session.id])
                }
            }
        } header: {
            Text(classSectionTitle(count: visibleSessions.count)).xertEyebrow()
        }
    }

    private var classDiscoverySection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text("When").font(.caption).foregroundStyle(Color.xertMuted)
                dateWindowPicker
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Training fit").font(.caption).foregroundStyle(Color.xertMuted)
                trainingFitPicker
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

    private var dateWindowPicker: some View {
        ViewThatFits(in: .horizontal) {
            Picker("When", selection: $classDateWindow) {
                ForEach(ClassSessionDateWindow.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .fixedSize(horizontal: true, vertical: false)

            Picker("When", selection: $classDateWindow) {
                ForEach(ClassSessionDateWindow.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.menu)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHint("Filters classes by date")
    }

    private var trainingFitPicker: some View {
        ViewThatFits(in: .horizontal) {
            Picker("Training fit", selection: $classFit) {
                ForEach(ClassSessionFit.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .fixedSize(horizontal: true, vertical: false)

            Picker("Training fit", selection: $classFit) {
                ForEach(ClassSessionFit.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.menu)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHint("Filters classes by availability or beginner suitability")
    }

    private var personalTrainingSection: some View {
        Section {
            Text("Request one-on-one coaching around your goals and availability.")
                .foregroundStyle(Color.xertPale)
            Button {
                activeSheet = .privateSession
            } label: {
                ViewThatFits(in: .horizontal) {
                    Label("Request PT Session", systemImage: "figure.strengthtraining.traditional")
                    VStack(spacing: 6) {
                        Image(systemName: "figure.strengthtraining.traditional")
                        Text("Request PT Session")
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 24)
                .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.xertGhost)
            .accessibilityHint("Opens the personal training request form")
        } header: {
            Text("Personal Training").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .listRowSeparatorTint(Color.xertSteel.opacity(0.18))
    }

    // MARK: Session cards

    private func sessionCard(for session: ClassSession, booking: BookingItem?) -> some View {
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

            if firstClassActivation?.matches(session.id) == true,
               firstClassActivation?.stage == .readyToBook,
               booking == nil {
                Label("Credits ready — book your place below", systemImage: "checkmark.circle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.green)
                    .accessibilityAddTraits(.isHeader)
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
        .id(ScrollTarget.session(session.id))
        .accessibilityIdentifier("xert-class-session-\(session.id.uuidString.lowercased())")
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
        let isWorking = store.bookingSessionID == session.id
        let hasBookingMutation = store.bookingSessionID != nil || store.cancellingBookingID != nil
        if let booking {
            VStack(alignment: .leading, spacing: 8) {
                Label(
                    booking.stateLabel,
                    systemImage: booking.status == "confirmed" ? "checkmark.circle" : "clock"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.xertSteel)

                Button {
                    guard let destination = URL(
                        string: "xertfitness://account/bookings/\(booking.id.uuidString.lowercased())"
                    ) else { return }
                    openURL(destination)
                } label: {
                    Label("Manage booking", systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.xertGhost)
                .accessibilityHint("Opens this booking to add it to your calendar or cancel it")
            }
        } else if firstClassActivation?.matches(session.id) == true,
                  firstClassActivation?.stage == .needsCredits {
            VStack(alignment: .leading, spacing: 10) {
                Label("You need a session credit to book this class.", systemImage: "ticket")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    onChooseCreditsForClass(session.id)
                } label: {
                    Label("Choose a session pack", systemImage: "creditcard")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .buttonStyle(.xertPrimary)
                .accessibilityHint("Keeps this class selected while you choose credits")
            }
        } else if !store.bookingAvailabilityLoaded {
            Label("Checking booking availability…", systemImage: "arrow.clockwise")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.xertMuted)
        } else if store.unavailableDataSources.contains(.platformSettings) {
            Label("Booking status unavailable", systemImage: "wifi.exclamationmark")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.orange)
        } else if !store.memberBookingsEnabled || session.booking_mode == "interest_only" {
            Button {
                activeSheet = .classInterest(session)
            } label: {
                Label("Register interest", systemImage: "person.2")
            }
            .buttonStyle(.xertGhost)
        } else if session.isFull {
            Button {
                if store.isSignedIn {
                    Task {
                        let outcome = await store.joinWaitlist(session)
                        if outcome == .completed {
                            onBookingCompleted(session.id)
                        }
                    }
                } else {
                    onRequireSignInForClass(session.id)
                }
            } label: {
                bookingActionLabel(
                    store.isSignedIn
                        ? (isWorking ? "Joining waitlist…" : "Join waitlist")
                        : "Sign in to join waitlist",
                    systemImage: "person.2.badge.plus",
                    isWorking: isWorking
                )
            }
            .buttonStyle(.xertPrimary)
            .disabled(hasBookingMutation)
            .accessibilityValue(
                isWorking ? "In progress" : (hasBookingMutation ? "Another booking update is in progress" : "")
            )
        } else if timeConflict != nil {
            Label("Time conflict", systemImage: "exclamationmark.circle")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.red)
        } else {
            Button {
                if store.isSignedIn {
                    Task {
                        let outcome = await store.book(session)
                        if outcome == .needsCredits {
                            onBookingNeedsCredits(session.id)
                        } else if outcome == .completed {
                            onBookingCompleted(session.id)
                        }
                    }
                } else {
                    onRequireSignInForClass(session.id)
                }
            } label: {
                bookingActionLabel(
                    store.isSignedIn
                        ? (isWorking
                            ? (session.booking_mode == "request_to_book" ? "Requesting spot…" : "Booking class…")
                            : (session.booking_mode == "request_to_book" ? "Request spot" : "Book class"))
                        : "Sign in to book",
                    systemImage: session.booking_mode == "request_to_book" ? "clock.badge.checkmark" : "checkmark.circle",
                    isWorking: isWorking
                )
            }
            .buttonStyle(.xertPrimary)
            .disabled(hasBookingMutation)
            .accessibilityValue(
                isWorking ? "In progress" : (hasBookingMutation ? "Another booking update is in progress" : "")
            )
        }
    }

    private func bookingActionLabel(
        _ title: String,
        systemImage: String,
        isWorking: Bool
    ) -> some View {
        HStack(spacing: 10) {
            Label(title, systemImage: systemImage)
            Spacer(minLength: 8)
            if isWorking {
                ProgressView()
                    .controlSize(.small)
                    .tint(Color.xertNavy)
                    .accessibilityHidden(true)
            }
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

    private func classSectionTitle(count: Int) -> String {
        if store.sessions.isEmpty,
           !store.hasBootstrapped || store.isLoading || store.unavailableDataSources.contains(.sessions) {
            return "Upcoming Classes"
        }
        return "Upcoming Classes (\(count))"
    }

    private func bookingLoadingRow(_ title: String) -> some View {
        HStack(spacing: 10) {
            ProgressView()
                .tint(Color.xertSteel)
            Text(title)
                .foregroundStyle(Color.xertMuted)
        }
        .accessibilityElement(children: .combine)
    }

    private func bookingUnavailableRow(_ title: String) -> some View {
        Label("\(title) unavailable. Pull to refresh.", systemImage: "wifi.exclamationmark")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.orange)
            .fixedSize(horizontal: false, vertical: true)
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
    @FocusState private var focusedField: Field?

    private enum Field {
        case fullName, email, phone, notes
    }

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
                        .disabled(store.isRequestingPrivateSession)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
        }
        .interactiveDismissDisabled(store.isRequestingPrivateSession)
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
            XertScrollEndSpacer()
        }
        .tint(.xertSteel)
        .xertListBackground()
        .scrollDismissesKeyboard(.interactively)
    }

    private var contactSection: some View {
        Section {
            TextField("Full name", text: $fullName)
                .textContentType(.name)
                .focused($focusedField, equals: .fullName)
                .submitLabel(.next)
                .onSubmit { focusedField = .email }
                .foregroundStyle(Color.xertOffWhite)
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .phone }
                .foregroundStyle(Color.xertOffWhite)
            TextField("Mobile number", text: $phone)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .focused($focusedField, equals: .phone)
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
                .focused($focusedField, equals: .notes)
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
                    .accessibilityLabel("Error: \(validationMessage)")
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
        focusedField = nil
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
            focusFirstInvalidContactField()
        }
    }

    private func focusFirstInvalidContactField() {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        if fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            focusedField = .fullName
        } else if !normalizedEmail.contains("@") || !normalizedEmail.contains(".") {
            focusedField = .email
        } else if phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            focusedField = .phone
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
    @FocusState private var focusedField: Field?

    private enum Field {
        case fullName, email, phone, notes
    }

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
                        .disabled(store.isRequestingClassInterest)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
        }
        .interactiveDismissDisabled(store.isRequestingClassInterest)
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
            XertScrollEndSpacer()
        }
        .tint(.xertSteel)
        .xertListBackground()
        .scrollDismissesKeyboard(.interactively)
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
                .focused($focusedField, equals: .fullName)
                .submitLabel(.next)
                .onSubmit { focusedField = .email }
                .foregroundStyle(Color.xertOffWhite)
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .phone }
                .foregroundStyle(Color.xertOffWhite)
            TextField("Mobile number", text: $phone)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .focused($focusedField, equals: .phone)
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
                .focused($focusedField, equals: .notes)
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
                    .accessibilityLabel("Error: \(validationMessage)")
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
        focusedField = nil
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
            focusFirstInvalidContactField()
        }
    }

    private func focusFirstInvalidContactField() {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        if fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            focusedField = .fullName
        } else if !normalizedEmail.contains("@") || !normalizedEmail.contains(".") {
            focusedField = .email
        } else if phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            focusedField = .phone
        }
    }
}
