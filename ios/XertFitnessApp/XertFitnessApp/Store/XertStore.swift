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
    @Published private(set) var hasBootstrapped = false
    @Published private(set) var isUsingCachedPublicData = false
    @Published private(set) var publicDataUpdatedAt: Date?
    @Published private(set) var isUsingStaleMemberData = false
    @Published private(set) var memberDataUpdatedAt: Date?
    @Published private(set) var unavailableDataSources: Set<XertDataSource> = []

    private let api = XertAPI()
    private var sessionRefreshTask: Task<AuthSession, Error>?

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
        if let authSession, authSession.refresh_token != nil {
            do {
                let refreshed = try await api.refresh(session: authSession)
                self.authSession = refreshed
                try KeychainStore.saveSession(refreshed)
            } catch {
                self.authSession = nil
                KeychainStore.clearSession()
            }
        }
        await refresh()
        hasBootstrapped = true
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        unavailableDataSources = []
        defer { isLoading = false }

        async let productRequest = api.products()
        async let sessionRequest = api.sessions()
        async let eventRequest = api.events()

        var productsLoaded = false
        var sessionsLoaded = false
        var eventsLoaded = false

        do {
            products = try await productRequest
            productsLoaded = true
        } catch {
            unavailableDataSources.insert(.products)
        }

        do {
            sessions = try await sessionRequest
            sessionsLoaded = true
        } catch {
            unavailableDataSources.insert(.sessions)
        }

        do {
            let loadedEvents = try await eventRequest
            events = loadedEvents.isEmpty ? XertEventCalendar.fallback : loadedEvents
            eventsLoaded = true
        } catch {
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
            } catch {
                self.authSession = nil
                KeychainStore.clearSession()
                present(error)
            }
        }

        if let authSession = memberSession {
            async let creditRequest = api.credits(session: authSession)
            async let bookingRequest = api.bookings(session: authSession)
            async let orderRequest = api.orders(session: authSession)
            async let profileRequest = api.profile(session: authSession)
            async let eventGoalRequest = api.eventGoals(session: authSession)
            var creditsLoaded = false
            var bookingsLoaded = false
            var ordersLoaded = false
            var profileLoaded = false
            do {
                credits = try await creditRequest
                creditsLoaded = true
            } catch {
                unavailableDataSources.insert(.credits)
            }
            do {
                bookings = try await bookingRequest
                await ClassReminderScheduler.shared.sync(bookings: bookings)
                bookingsLoaded = true
            } catch {
                unavailableDataSources.insert(.bookings)
            }
            do {
                orders = try await orderRequest
                ordersLoaded = true
            } catch {
                unavailableDataSources.insert(.orders)
            }
            do {
                profile = try await profileRequest
                profileLoaded = true
            } catch {
                unavailableDataSources.insert(.profile)
            }
            do {
                let loadedEventGoals = try await eventGoalRequest
                eventGoalIDs = Set(loadedEventGoals.map(\.event_id))
            } catch {
                unavailableDataSources.insert(.eventGoals)
                // Event goals are optional until the companion Supabase upgrade
                // is applied; keep the rest of the member account available.
            }

            if creditsLoaded && bookingsLoaded && ordersLoaded && profileLoaded {
                memberDataUpdatedAt = Date()
                isUsingStaleMemberData = false
            } else {
                isUsingStaleMemberData = memberDataUpdatedAt != nil
            }
        } else {
            credits = []
            bookings = []
            orders = []
            profile = nil
            eventGoalIDs = []
            memberDataUpdatedAt = nil
            isUsingStaleMemberData = false
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
            authSession = session
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
        sessionRefreshTask?.cancel()
        sessionRefreshTask = nil
        authSession = nil
        credits = []
        bookings = []
        orders = []
        profile = nil
        eventGoalIDs = []
        memberDataUpdatedAt = nil
        isUsingStaleMemberData = false
        unavailableDataSources.subtract([.credits, .bookings, .orders, .profile, .eventGoals])
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
            self.authSession = nil
            credits = []
            bookings = []
            orders = []
            profile = nil
            eventGoalIDs = []
            memberDataUpdatedAt = nil
            isUsingStaleMemberData = false
            unavailableDataSources.subtract([.credits, .bookings, .orders, .profile, .eventGoals])
            KeychainStore.clearSession()
            await ClassReminderScheduler.shared.clearAll()
            return true
        } catch {
            present(error)
            return false
        }
    }

    func book(_ session: ClassSession) async {
        bookingSessionID = session.id
        defer { bookingSessionID = nil }
        do {
            let authSession = try await validAuthSession()
            try await api.book(session: authSession, classSessionID: session.id)
            await refresh()
        } catch {
            errorMessage = friendlyBookingError(error.localizedDescription)
        }
    }

    func joinWaitlist(_ session: ClassSession) async {
        bookingSessionID = session.id
        defer { bookingSessionID = nil }
        do {
            let authSession = try await validAuthSession()
            try await api.joinWaitlist(session: authSession, classSessionID: session.id)
            await refresh()
        } catch {
            errorMessage = friendlyBookingError(error.localizedDescription)
        }
    }

    func cancel(_ booking: BookingItem) async {
        cancellingBookingID = booking.id
        defer { cancellingBookingID = nil }
        do {
            let authSession = try await validAuthSession()
            try await api.cancelBooking(session: authSession, bookingID: booking.id)
            await refresh()
        } catch {
            errorMessage = friendlyBookingError(error.localizedDescription)
        }
    }

    func toggleEventGoal(_ event: EventItem) async {
        guard let eventID = event.id else {
            errorMessage = "This calendar event will be available to track once it is loaded in XERT."
            return
        }

        updatingEventGoalID = eventID
        defer { updatingEventGoalID = nil }
        do {
            let authSession = try await validAuthSession()
            if eventGoalIDs.contains(eventID) {
                try await api.removeEventGoal(session: authSession, eventID: eventID)
                eventGoalIDs.remove(eventID)
            } else {
                try await api.addEventGoal(session: authSession, eventID: eventID)
                eventGoalIDs.insert(eventID)
            }
        } catch {
            present(error)
        }
    }

    func checkoutURL(for product: Product) async -> URL? {
        do {
            let authSession = try await validAuthSession()
            return try await api.checkout(session: authSession, productSlug: product.slug)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    @discardableResult
    func requestPrivateSession(_ request: PrivateSessionRequest) async -> Bool {
        isRequestingPrivateSession = true
        errorMessage = nil
        defer { isRequestingPrivateSession = false }
        do {
            try await api.requestPrivateSession(request)
            return true
        } catch {
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
        isSavingProfile = true
        defer { isSavingProfile = false }
        do {
            let authSession = try await validAuthSession()
            guard let profileID = profile?.id ?? authSession.user?.id else {
                throw APIError(message: "Your profile is still being prepared. Please refresh and try again.")
            }
            profile = try await api.updateProfile(
                session: authSession,
                profileID: profileID,
                fullName: fullName,
                phone: phone
            )
            return true
        } catch {
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
            authSession = session
            try KeychainStore.saveSession(session)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func validAuthSession() async throws -> AuthSession {
        guard let current = authSession else {
            throw APIError(message: "Sign in to continue.")
        }
        guard current.needsRefresh() else { return current }
        guard current.refresh_token?.isEmpty == false else {
            throw APIError(message: "Your XERT session has expired. Please sign in again.")
        }

        if let sessionRefreshTask {
            return try await sessionRefreshTask.value
        }

        let refreshTask = Task { try await api.refresh(session: current) }
        sessionRefreshTask = refreshTask
        defer { sessionRefreshTask = nil }
        let refreshed = try await refreshTask.value
        authSession = refreshed
        try KeychainStore.saveSession(refreshed)
        return refreshed
    }

    private func friendlyBookingError(_ message: String) -> String {
        if message.contains("NO_CREDITS") {
            return "You need available credits before booking this class."
        }
        if message.contains("SESSION_FULL") {
            return "That class is now full."
        }
        if message.contains("ALREADY_BOOKED") {
            return "You are already booked into that class."
        }
        if message.contains("AUTH_REQUIRED") {
            return "Sign in to book a class."
        }
        if message.contains("SESSION_INTEREST_ONLY") {
            return "This class is collecting interest only."
        }
        if message.contains("SESSION_HAS_CAPACITY") {
            return "A place is available now. Refresh and book the class instead."
        }
        if message.contains("NOT_CANCELLABLE") {
            return "This booking can no longer be cancelled."
        }
        return message
    }

    private func present(_ error: Error) {
        if errorMessage == nil {
            errorMessage = error.localizedDescription
        }
    }
}
