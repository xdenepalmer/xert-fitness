import Foundation
import Combine

@MainActor
final class XertStore: ObservableObject {
    @Published var products: [Product] = []
    @Published var sessions: [ClassSession] = []
    @Published var events: [EventItem] = []
    @Published var credits: [CreditBatch] = []
    @Published var bookings: [BookingItem] = []
    @Published var orders: [OrderItem] = []
    @Published var privateSessionRequests: [PrivateSessionStatusItem] = []
    @Published var eventGoalIDs: Set<UUID> = []
    @Published var profile: MemberProfile?
    @Published var authSession: AuthSession?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var bookingSessionID: UUID?
    @Published var cancellingBookingID: UUID?
    @Published var isSavingProfile = false
    @Published var isRequestingPasswordReset = false
    @Published var updatingEventGoalID: UUID?
    @Published var isDeletingAccount = false
    @Published var isRequestingPrivateSession = false
    @Published var isRequestingClassInterest = false
    @Published private(set) var classRemindersEnabled = ClassReminderPreference.isEnabled()
    @Published private(set) var isUpdatingReminderPreference = false
    @Published private(set) var isReconcilingCheckout = false
    @Published private(set) var hasBootstrapped = false
    @Published private(set) var isUsingCachedPublicData = false
    @Published private(set) var publicDataUpdatedAt: Date?
    @Published private(set) var isUsingStaleMemberData = false
    @Published private(set) var memberDataUpdatedAt: Date?
    @Published private(set) var unavailableDataSources: Set<XertDataSource> = []

    private let api = XertAPI()
    private var sessionRefreshTask: Task<AuthSession, Error>?
    private var dataRefreshTask: Task<Void, Never>?
    private var dataRefreshVersion = MemberStateVersion()
    private var memberStateVersion = MemberStateVersion()
    private static let memberDataSources: Set<XertDataSource> = [
        .credits, .bookings, .orders, .profile, .eventGoals, .privateSessions,
    ]

    var isSignedIn: Bool {
        authSession != nil
    }

    var creditTotal: Int {
        credits.reduce(0) { $0 + $1.remaining }
    }

    func bootstrap() async {
        if let cached = PublicDataCache.load() {
            products = cached.products
            sessions = cached.sessions
            events = cached.events
            publicDataUpdatedAt = cached.savedAt
            isUsingCachedPublicData = true
        }
        authSession = KeychainStore.loadSession()
        await refresh()
        hasBootstrapped = true
    }

    func refresh() async {
        if let dataRefreshTask {
            await dataRefreshTask.value
            return
        }

        dataRefreshVersion.invalidate()
        let refreshVersion = dataRefreshVersion.snapshot
        let memberVersion = memberStateVersion.snapshot
        let task = Task {
            await performRefresh(refreshVersion: refreshVersion, memberVersion: memberVersion)
        }
        dataRefreshTask = task
        await task.value
        if dataRefreshVersion.isCurrent(refreshVersion) {
            dataRefreshTask = nil
        }
    }

    private func performRefresh(refreshVersion: Int, memberVersion: Int) async {
        isLoading = true
        errorMessage = nil
        unavailableDataSources = []
        defer {
            if dataRefreshVersion.isCurrent(refreshVersion) {
                isLoading = false
            }
        }

        async let productRequest = api.products()
        async let sessionRequest = api.sessions()
        async let eventRequest = api.events()

        var productsLoaded = false
        var sessionsLoaded = false
        var eventsLoaded = false

        do {
            let loadedProducts = try await productRequest
            guard canApplyRefresh(refreshVersion) else { return }
            products = loadedProducts
            productsLoaded = true
        } catch {
            guard canApplyRefresh(refreshVersion) else { return }
            unavailableDataSources.insert(.products)
        }

        do {
            let loadedSessions = try await sessionRequest
            guard canApplyRefresh(refreshVersion) else { return }
            sessions = loadedSessions
            sessionsLoaded = true
        } catch {
            guard canApplyRefresh(refreshVersion) else { return }
            unavailableDataSources.insert(.sessions)
        }

        do {
            let loadedEvents = try await eventRequest
            guard canApplyRefresh(refreshVersion) else { return }
            events = loadedEvents.isEmpty ? XertEventCalendar.fallback : loadedEvents
            eventsLoaded = true
        } catch {
            guard canApplyRefresh(refreshVersion) else { return }
            unavailableDataSources.insert(.events)
            // The app still carries the published 2026 training calendar when
            // the events table has not been seeded yet.
            if events.isEmpty { events = XertEventCalendar.fallback }
        }

        if productsLoaded && sessionsLoaded && eventsLoaded {
            let snapshot = PublicDataSnapshot(
                products: products,
                sessions: sessions,
                events: events
            )
            PublicDataCache.save(snapshot)
            publicDataUpdatedAt = snapshot.savedAt
            isUsingCachedPublicData = false
        } else {
            isUsingCachedPublicData = publicDataUpdatedAt != nil
        }

        var memberSession: AuthSession?
        if authSession != nil {
            do {
                memberSession = try await validAuthSession()
                guard canApplyMemberState(memberVersion, session: memberSession) && canApplyRefresh(refreshVersion) else { return }
            } catch {
                guard memberStateVersion.isCurrent(memberVersion) && canApplyRefresh(refreshVersion) else { return }
                if (error as? APIError)?.invalidatesSession == true {
                    replaceAuthSession(with: nil)
                    KeychainStore.clearSession()
                    isLoading = false
                    await ClassReminderScheduler.shared.clearAll()
                } else {
                    unavailableDataSources.formUnion(Self.memberDataSources)
                    isUsingStaleMemberData = memberDataUpdatedAt != nil
                }
                present(error)
                return
            }
        }

        if let authSession = memberSession {
            async let creditRequest = api.credits(session: authSession)
            async let bookingRequest = api.bookings(session: authSession)
            async let orderRequest = api.orders(session: authSession)
            async let profileRequest = api.profile(session: authSession)
            async let eventGoalRequest = api.eventGoals(session: authSession)
            async let privateSessionRequest = api.privateSessionRequests(session: authSession)
            var creditsLoaded = false
            var bookingsLoaded = false
            var ordersLoaded = false
            var profileLoaded = false
            do {
                let loadedCredits = try await creditRequest
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                credits = loadedCredits
                creditsLoaded = true
            } catch {
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                unavailableDataSources.insert(.credits)
            }
            do {
                let loadedBookings = try await bookingRequest
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                bookings = loadedBookings
                if classRemindersEnabled {
                    await ClassReminderScheduler.shared.sync(bookings: loadedBookings)
                } else {
                    await ClassReminderScheduler.shared.clearAll()
                }
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                bookingsLoaded = true
            } catch {
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                unavailableDataSources.insert(.bookings)
            }
            do {
                let loadedOrders = try await orderRequest
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                orders = loadedOrders
                ordersLoaded = true
            } catch {
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                unavailableDataSources.insert(.orders)
            }
            do {
                let loadedProfile = try await profileRequest
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                profile = loadedProfile
                profileLoaded = true
            } catch {
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                unavailableDataSources.insert(.profile)
            }
            do {
                let loadedEventGoals = try await eventGoalRequest
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                eventGoalIDs = Set(loadedEventGoals.map(\.event_id))
            } catch {
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                unavailableDataSources.insert(.eventGoals)
                // Event goals are optional until the companion Supabase upgrade
                // is applied; keep the rest of the member account available.
            }

            do {
                let loadedRequests = try await privateSessionRequest
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                privateSessionRequests = loadedRequests
            } catch {
                guard canApplyMemberState(memberVersion, session: authSession) && canApplyRefresh(refreshVersion) else { return }
                unavailableDataSources.insert(.privateSessions)
                // Tracking is optional until the additive ownership migration
                // reaches an existing Supabase project.
            }

            if creditsLoaded && bookingsLoaded && ordersLoaded && profileLoaded {
                memberDataUpdatedAt = Date()
                isUsingStaleMemberData = false
            } else {
                isUsingStaleMemberData = memberDataUpdatedAt != nil
            }
        } else {
            guard memberStateVersion.isCurrent(memberVersion) && canApplyRefresh(refreshVersion) else { return }
            clearMemberData()
            await ClassReminderScheduler.shared.clearAll()
        }
    }

    func signIn(email: String, password: String) async {
        await authenticate {
            try await api.signIn(email: email, password: password)
        }
    }

    func signUp(
        fullName: String,
        email: String,
        phone: String,
        password: String,
        confirmation: String,
        acceptedTerms: Bool
    ) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let request = try MemberSignUpRequest(
                fullName: fullName,
                email: email,
                phone: phone,
                password: password,
                confirmation: confirmation,
                acceptedTerms: acceptedTerms
            )
            guard let session = try await api.signUp(request) else {
                errorMessage = "Check your email to confirm your XERT account, then sign in."
                return
            }
            replaceAuthSession(with: session)
            try KeychainStore.saveSession(session)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func requestPasswordReset(email: String) async -> Bool {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty else {
            errorMessage = "Enter your email address to request a password reset."
            return false
        }

        isRequestingPasswordReset = true
        defer { isRequestingPasswordReset = false }
        do {
            try await api.requestPasswordReset(email: normalizedEmail)
            return true
        } catch {
            present(error)
            return false
        }
    }

    func signOut() {
        let currentSession = authSession
        replaceAuthSession(with: nil)
        KeychainStore.clearSession()
        Task {
            await ClassReminderScheduler.shared.clearAll()
            if let currentSession {
                try? await api.signOut(session: currentSession)
            }
        }
    }

    @discardableResult
    func deleteAccount() async -> Bool {
        errorMessage = nil
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do {
            let authSession = try await validAuthSession()
            try await api.deleteAccount(session: authSession)
            replaceAuthSession(with: nil)
            KeychainStore.clearSession()
            await ClassReminderScheduler.shared.clearAll()
            return true
        } catch {
            present(error)
            return false
        }
    }

    func book(_ session: ClassSession) async {
        let memberVersion = memberStateVersion.snapshot
        bookingSessionID = session.id
        defer {
            if memberStateVersion.isCurrent(memberVersion) { bookingSessionID = nil }
        }
        do {
            let authSession = try await validAuthSession()
            try await api.book(session: authSession, classSessionID: session.id)
            guard canApplyMemberState(memberVersion, session: authSession) else { return }
            await refresh()
        } catch {
            guard memberStateVersion.isCurrent(memberVersion) else { return }
            errorMessage = BookingErrorMessage.display(for: error.localizedDescription)
        }
    }

    func joinWaitlist(_ session: ClassSession) async {
        let memberVersion = memberStateVersion.snapshot
        bookingSessionID = session.id
        defer {
            if memberStateVersion.isCurrent(memberVersion) { bookingSessionID = nil }
        }
        do {
            let authSession = try await validAuthSession()
            try await api.joinWaitlist(session: authSession, classSessionID: session.id)
            guard canApplyMemberState(memberVersion, session: authSession) else { return }
            await refresh()
        } catch {
            guard memberStateVersion.isCurrent(memberVersion) else { return }
            errorMessage = BookingErrorMessage.display(for: error.localizedDescription)
        }
    }

    func cancel(_ booking: BookingItem) async {
        let memberVersion = memberStateVersion.snapshot
        cancellingBookingID = booking.id
        defer {
            if memberStateVersion.isCurrent(memberVersion) { cancellingBookingID = nil }
        }
        do {
            let authSession = try await validAuthSession()
            try await api.cancelBooking(session: authSession, bookingID: booking.id)
            guard canApplyMemberState(memberVersion, session: authSession) else { return }
            await refresh()
        } catch {
            guard memberStateVersion.isCurrent(memberVersion) else { return }
            errorMessage = BookingErrorMessage.display(for: error.localizedDescription)
        }
    }

    func setClassRemindersEnabled(_ enabled: Bool) async {
        guard enabled != classRemindersEnabled, !isUpdatingReminderPreference else { return }
        isUpdatingReminderPreference = true
        defer { isUpdatingReminderPreference = false }

        if enabled {
            let authorized = await ClassReminderScheduler.shared.requestAuthorizationAndSync(bookings: bookings)
            guard authorized else {
                ClassReminderPreference.setEnabled(false)
                classRemindersEnabled = false
                errorMessage = "Notifications are disabled for XERT. Allow them in Settings to enable class reminders."
                return
            }
            ClassReminderPreference.setEnabled(true)
            classRemindersEnabled = true
        } else {
            ClassReminderPreference.setEnabled(false)
            classRemindersEnabled = false
            await ClassReminderScheduler.shared.clearAll()
        }
    }

    func toggleEventGoal(_ event: EventItem) async {
        guard let eventID = event.id else {
            errorMessage = "This calendar event will be available to track once it is loaded in XERT."
            return
        }

        let memberVersion = memberStateVersion.snapshot
        updatingEventGoalID = eventID
        defer {
            if memberStateVersion.isCurrent(memberVersion) { updatingEventGoalID = nil }
        }
        do {
            let authSession = try await validAuthSession()
            if eventGoalIDs.contains(eventID) {
                try await api.removeEventGoal(session: authSession, eventID: eventID)
                guard canApplyMemberState(memberVersion, session: authSession) else { return }
                eventGoalIDs.remove(eventID)
            } else {
                try await api.addEventGoal(session: authSession, eventID: eventID)
                guard canApplyMemberState(memberVersion, session: authSession) else { return }
                eventGoalIDs.insert(eventID)
            }
        } catch {
            guard memberStateVersion.isCurrent(memberVersion) else { return }
            present(error)
        }
    }

    func checkoutURL(for product: Product) async -> URL? {
        let memberVersion = memberStateVersion.snapshot
        do {
            let authSession = try await validAuthSession()
            let url = try await api.checkout(session: authSession, productSlug: product.slug)
            guard canApplyMemberState(memberVersion, session: authSession) else { return nil }
            return url
        } catch {
            guard memberStateVersion.isCurrent(memberVersion) else { return nil }
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func reconcileCheckout() async {
        guard authSession != nil, !isReconcilingCheckout else { return }
        let memberVersion = memberStateVersion.snapshot
        let baselineCreditTotal = creditTotal
        let baselineOrderIDs = Set(orders.map(\.id))
        isReconcilingCheckout = true
        defer {
            if memberStateVersion.isCurrent(memberVersion) {
                isReconcilingCheckout = false
            }
        }

        for delay in CheckoutReconciliation.retryDelaysNanoseconds {
            if delay > 0 {
                do {
                    try await Task.sleep(nanoseconds: delay)
                } catch {
                    return
                }
            }
            guard !Task.isCancelled else { return }

            do {
                let memberSession = try await validAuthSession()
                async let creditRequest = api.credits(session: memberSession)
                async let orderRequest = api.orders(session: memberSession)
                let (loadedCredits, loadedOrders) = try await (creditRequest, orderRequest)
                guard canApplyMemberState(memberVersion, session: memberSession) else { return }
                credits = loadedCredits
                orders = loadedOrders
                unavailableDataSources.subtract([.credits, .orders])
                memberDataUpdatedAt = Date()

                if CheckoutReconciliation.hasSettled(
                    baselineCreditTotal: baselineCreditTotal,
                    baselineOrderIDs: baselineOrderIDs,
                    credits: loadedCredits,
                    orders: loadedOrders
                ) {
                    return
                }
            } catch {
                guard memberStateVersion.isCurrent(memberVersion) else { return }
                unavailableDataSources.formUnion([.credits, .orders])
                isUsingStaleMemberData = memberDataUpdatedAt != nil
            }
        }
    }

    @discardableResult
    func requestPrivateSession(_ request: PrivateSessionRequest) async -> Bool {
        let memberVersion = memberStateVersion.snapshot
        isRequestingPrivateSession = true
        errorMessage = nil
        defer { isRequestingPrivateSession = false }
        do {
            let memberSession = authSession == nil ? nil : try await validAuthSession()
            try await api.requestPrivateSession(request, auth: memberSession)
            if let memberSession {
                let loadedRequests = try await api.privateSessionRequests(session: memberSession)
                guard canApplyMemberState(memberVersion, session: memberSession) else { return true }
                privateSessionRequests = loadedRequests
                unavailableDataSources.remove(.privateSessions)
            }
            return true
        } catch {
            guard memberStateVersion.isCurrent(memberVersion) else { return false }
            present(error)
            return false
        }
    }

    @discardableResult
    func requestClassInterest(_ request: ClassInterestRequest) async -> Bool {
        isRequestingClassInterest = true
        errorMessage = nil
        defer { isRequestingClassInterest = false }
        do {
            try await api.requestClassInterest(request)
            return true
        } catch {
            present(error)
            return false
        }
    }

    @discardableResult
    func updateProfile(fullName: String, phone: String) async -> Bool {
        let memberVersion = memberStateVersion.snapshot
        isSavingProfile = true
        defer {
            if memberStateVersion.isCurrent(memberVersion) { isSavingProfile = false }
        }
        do {
            let authSession = try await validAuthSession()
            guard let profileID = profile?.id ?? authSession.user?.id else {
                throw APIError(message: "Your profile is still being prepared. Please refresh and try again.")
            }
            let loadedProfile = try await api.updateProfile(
                session: authSession,
                profileID: profileID,
                fullName: fullName,
                phone: phone
            )
            guard canApplyMemberState(memberVersion, session: authSession) else { return false }
            profile = loadedProfile
            return true
        } catch {
            guard memberStateVersion.isCurrent(memberVersion) else { return false }
            present(error)
            return false
        }
    }

    private func authenticate(_ action: () async throws -> AuthSession) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let session = try await action()
            replaceAuthSession(with: session)
            try KeychainStore.saveSession(session)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func validAuthSession() async throws -> AuthSession {
        let memberVersion = memberStateVersion.snapshot
        guard let current = authSession else {
            throw APIError(message: "Sign in to continue.")
        }
        guard current.needsRefresh() else { return current }
        guard current.refresh_token?.isEmpty == false else {
            throw APIError(message: "Your XERT session has expired. Please sign in again.", statusCode: 401)
        }

        if let sessionRefreshTask {
            let refreshed = try await sessionRefreshTask.value
            guard canApplyMemberState(memberVersion, session: refreshed) else {
                throw CancellationError()
            }
            return refreshed
        }

        let refreshTask = Task { () throws -> AuthSession in
            let refreshed = try await api.refresh(session: current)
            guard memberStateVersion.isCurrent(memberVersion),
                  authSession?.access_token == current.access_token else {
                throw CancellationError()
            }
            authSession = refreshed
            try KeychainStore.saveSession(refreshed)
            return refreshed
        }
        sessionRefreshTask = refreshTask
        defer {
            if memberStateVersion.isCurrent(memberVersion) {
                sessionRefreshTask = nil
            }
        }
        return try await refreshTask.value
    }

    private func canApplyRefresh(_ version: Int) -> Bool {
        dataRefreshVersion.isCurrent(version) && !Task.isCancelled
    }

    private func canApplyMemberState(_ version: Int, session: AuthSession?) -> Bool {
        guard memberStateVersion.isCurrent(version), !Task.isCancelled, let session else { return false }
        return authSession?.access_token == session.access_token
    }

    private func replaceAuthSession(with session: AuthSession?) {
        memberStateVersion.invalidate()
        dataRefreshVersion.invalidate()
        dataRefreshTask?.cancel()
        dataRefreshTask = nil
        sessionRefreshTask?.cancel()
        sessionRefreshTask = nil
        authSession = session
        clearMemberData()
        isLoading = false
        isReconcilingCheckout = false
        bookingSessionID = nil
        cancellingBookingID = nil
        updatingEventGoalID = nil
        isSavingProfile = false
        errorMessage = nil
    }

    private func clearMemberData() {
        credits = []
        bookings = []
        orders = []
        profile = nil
        eventGoalIDs = []
        privateSessionRequests = []
        memberDataUpdatedAt = nil
        isUsingStaleMemberData = false
        unavailableDataSources.subtract(Self.memberDataSources)
    }

    private func present(_ error: Error) {
        if errorMessage == nil {
            errorMessage = error.localizedDescription
        }
    }
}
