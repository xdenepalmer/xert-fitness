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

    private let api = XertAPI()

    var isSignedIn: Bool {
        authSession != nil
    }

    var creditTotal: Int {
        credits.reduce(0) { $0 + $1.remaining }
    }

    func bootstrap() async {
        authSession = KeychainStore.loadSession()
        await refresh()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let products = api.products()
            async let sessions = api.sessions()
            async let events = api.events()

            self.products = try await products
            self.sessions = try await sessions
            self.events = try await events

            if let authSession {
                async let credits = api.credits(session: authSession)
                async let bookings = api.bookings(session: authSession)
                self.credits = try await credits
                self.bookings = try await bookings
            } else {
                self.credits = []
                self.bookings = []
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signIn(email: String, password: String) async {
        await authenticate {
            try await api.signIn(email: email, password: password)
        }
    }

    func signUp(email: String, password: String) async {
        await authenticate {
            if let session = try await api.signUp(email: email, password: password) {
                return session
            }
            return try await api.signIn(email: email, password: password)
        }
    }

    func signOut() {
        authSession = nil
        credits = []
        bookings = []
        KeychainStore.clearSession()
    }

    func book(_ session: ClassSession) async {
        guard let authSession else {
            errorMessage = "Sign in to book a class."
            return
        }

        do {
            try await api.book(session: authSession, classSessionID: session.id)
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
        return message
    }
}
