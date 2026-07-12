import Foundation
import Combine

@MainActor
final class XertStore: ObservableObject {
    @Published var products: [Product] = []
    @Published var sessions: [ClassSession] = []
    @Published var events: [EventItem] = []
    @Published var credits: [CreditBatch] = []
    @Published var bookings: [BookingItem] = []
    @Published var authSession: AuthSession?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var bookingSessionID: UUID?
    @Published var cancellingBookingID: UUID?

    private let api = XertAPI()

    var isSignedIn: Bool {
        authSession != nil
    }

    var creditTotal: Int {
        credits.reduce(0) { $0 + $1.remaining }
    }

    func bootstrap() async {
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
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        async let productRequest = api.products()
        async let sessionRequest = api.sessions()
        async let eventRequest = api.events()

        do {
            products = try await productRequest
        } catch {
            products = []
            present(error)
        }

        do {
            sessions = try await sessionRequest
        } catch {
            sessions = []
            present(error)
        }

        do {
            let loadedEvents = try await eventRequest
            events = loadedEvents.isEmpty ? XertEventCalendar.fallback : loadedEvents
        } catch {
            // The app still carries the published 2026 training calendar when
            // the events table has not been seeded yet.
            events = XertEventCalendar.fallback
        }

        if let authSession {
            async let creditRequest = api.credits(session: authSession)
            async let bookingRequest = api.bookings(session: authSession)
            do {
                credits = try await creditRequest
                bookings = try await bookingRequest
            } catch {
                credits = []
                bookings = []
                present(error)
            }
        } else {
            credits = []
            bookings = []
        }
    }

    func signIn(email: String, password: String) async {
        await authenticate {
            try await api.signIn(email: email, password: password)
        }
    }

    func signUp(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            guard let session = try await api.signUp(email: email, password: password) else {
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

    func signOut() {
        let currentSession = authSession
        authSession = nil
        credits = []
        bookings = []
        KeychainStore.clearSession()
        if let currentSession {
            Task { try? await api.signOut(session: currentSession) }
        }
    }

    func book(_ session: ClassSession) async {
        guard let authSession else {
            errorMessage = "Sign in to book a class."
            return
        }

        bookingSessionID = session.id
        defer { bookingSessionID = nil }
        do {
            try await api.book(session: authSession, classSessionID: session.id)
            await refresh()
        } catch {
            errorMessage = friendlyBookingError(error.localizedDescription)
        }
    }

    func cancel(_ booking: BookingItem) async {
        guard let authSession else {
            errorMessage = "Sign in to manage your bookings."
            return
        }

        cancellingBookingID = booking.id
        defer { cancellingBookingID = nil }
        do {
            try await api.cancelBooking(session: authSession, bookingID: booking.id)
            await refresh()
        } catch {
            errorMessage = friendlyBookingError(error.localizedDescription)
        }
    }

    func checkoutURL(for product: Product) async -> URL? {
        guard let authSession else {
            errorMessage = "Sign in to purchase a session pack."
            return nil
        }

        do {
            return try await api.checkout(session: authSession, productSlug: product.slug)
        } catch {
            errorMessage = error.localizedDescription
            return nil
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
