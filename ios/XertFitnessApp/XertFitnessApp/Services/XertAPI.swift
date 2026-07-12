import Foundation

struct APIError: LocalizedError {
    let message: String

    var errorDescription: String? { message }
}

private struct SupabaseErrorResponse: Decodable {
    let message: String?
    let error: String?
    let error_description: String?

    var displayMessage: String? {
        message ?? error_description ?? error
    }
}

final class XertAPI {
    private let session: URLSession
    private let decoder: JSONDecoder

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            if let date = ISO8601DateFormatter.withFractionalSeconds.date(from: value) {
                return date
            }
            if let date = ISO8601DateFormatter.standard.date(from: value) {
                return date
            }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Invalid date: \(value)")
            )
        }
    }

    func signIn(email: String, password: String) async throws -> AuthSession {
        let body = ["email": email, "password": password]
        let response: AuthResponse = try await authRequest(
            path: "/auth/v1/token",
            queryItems: [URLQueryItem(name: "grant_type", value: "password")],
            body: body
        )
        guard let session = response.session else {
            throw APIError(message: "Supabase did not return a session.")
        }
        return session
    }

    func signUp(email: String, password: String) async throws -> AuthSession? {
        let body = ["email": email, "password": password]
        let response: AuthResponse = try await authRequest(path: "/auth/v1/signup", body: body)
        return response.session
    }

    func refresh(session auth: AuthSession) async throws -> AuthSession {
        guard let refreshToken = auth.refresh_token, !refreshToken.isEmpty else {
            throw APIError(message: "Your XERT session needs you to sign in again.")
        }
        let response: AuthResponse = try await authRequest(
            path: "/auth/v1/token",
            queryItems: [URLQueryItem(name: "grant_type", value: "refresh_token")],
            body: ["refresh_token": refreshToken]
        )
        guard let session = response.session else {
            throw APIError(message: "Supabase did not return a refreshed session.")
        }
        return session
    }

    func signOut(session auth: AuthSession) async throws {
        var request = try request(baseURL: AppConfig.supabaseURL, path: "/auth/v1/logout")
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        try await perform(request)
    }

    func products() async throws -> [Product] {
        try await restRequest(
            path: "/rest/v1/products",
            queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "active", value: "eq.true"),
                URLQueryItem(name: "order", value: "sort_order.asc")
            ]
        )
    }

    func sessions() async throws -> [ClassSession] {
        try await rpc(path: "sessions_with_availability", body: EmptyBody())
    }

    func events() async throws -> [EventItem] {
        try await restRequest(
            path: "/rest/v1/events",
            queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "published", value: "eq.true"),
                URLQueryItem(name: "order", value: "event_date.asc,sort_order.asc")
            ]
        )
    }

    func credits(session auth: AuthSession) async throws -> [CreditBatch] {
        try await restRequest(
            path: "/rest/v1/credit_batches",
            queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "remaining", value: "gt.0"),
                URLQueryItem(name: "order", value: "expires_at.asc")
            ],
            auth: auth
        )
    }

    func profile(session auth: AuthSession) async throws -> MemberProfile? {
        var queryItems = [
            URLQueryItem(name: "select", value: "id,full_name,phone"),
            URLQueryItem(name: "limit", value: "1"),
        ]
        if let userID = auth.user?.id {
            queryItems.append(URLQueryItem(name: "id", value: "eq.\(userID.uuidString)"))
        }
        let profiles: [MemberProfile] = try await restRequest(
            path: "/rest/v1/profiles",
            queryItems: queryItems,
            auth: auth
        )
        return profiles.first
    }

    func updateProfile(
        session auth: AuthSession,
        profileID: UUID,
        fullName: String,
        phone: String
    ) async throws -> MemberProfile {
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/profiles",
            queryItems: [URLQueryItem(name: "id", value: "eq.\(profileID.uuidString)")]
        )
        request.httpMethod = "PATCH"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(ProfileUpdate(
            full_name: fullName.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            phone: phone.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            updated_at: ISO8601DateFormatter.standard.string(from: Date())
        ))

        let profiles: [MemberProfile] = try await decode(request)
        guard let profile = profiles.first else {
            throw APIError(message: "Could not save account details.")
        }
        return profile
    }

    func bookings(session auth: AuthSession) async throws -> [BookingItem] {
        try await rpc(path: "my_bookings", body: EmptyBody(), auth: auth)
    }

    func book(session auth: AuthSession, classSessionID: UUID) async throws {
        let _: UUID = try await rpc(
            path: "book_session",
            body: ["p_session_id": classSessionID.uuidString],
            auth: auth
        )
    }

    func cancelBooking(session auth: AuthSession, bookingID: UUID) async throws {
        let _: EmptyResponse = try await rpc(
            path: "cancel_booking",
            body: ["p_booking_id": bookingID.uuidString],
            auth: auth
        )
    }

    func checkout(session auth: AuthSession, productSlug: String) async throws -> URL {
        let response: CheckoutResponse = try await vercelRequest(
            path: "/api/checkout",
            body: ["product_slug": productSlug],
            auth: auth
        )
        return response.url
    }

    private func authRequest<T: Decodable, Body: Encodable>(
        path: String,
        queryItems: [URLQueryItem] = [],
        body: Body
    ) async throws -> T {
        var request = try request(baseURL: AppConfig.supabaseURL, path: path, queryItems: queryItems)
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await decode(request)
    }

    private func restRequest<T: Decodable>(
        path: String,
        queryItems: [URLQueryItem],
        auth: AuthSession? = nil
    ) async throws -> T {
        var request = try request(baseURL: AppConfig.supabaseURL, path: path, queryItems: queryItems)
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let auth {
            request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        }
        return try await decode(request)
    }

    private func rpc<T: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        auth: AuthSession? = nil
    ) async throws -> T {
        var request = try request(baseURL: AppConfig.supabaseURL, path: "/rest/v1/rpc/\(path)")
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let auth {
            request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONEncoder().encode(body)
        return try await decode(request)
    }

    private func vercelRequest<T: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        auth: AuthSession
    ) async throws -> T {
        var request = try request(baseURL: AppConfig.vercelBaseURL, path: path)
        request.httpMethod = "POST"
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await decode(request)
    }

    private func request(
        baseURL: URL,
        path: String,
        queryItems: [URLQueryItem] = []
    ) throws -> URLRequest {
        var url = baseURL
        for component in path.split(separator: "/") {
            url.appendPathComponent(String(component))
        }

        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw APIError(message: "Could not create API request.")
        }
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components.url else {
            throw APIError(message: "Invalid API URL.")
        }
        return URLRequest(url: url)
    }

    private func perform(_ request: URLRequest) async throws {
        _ = try await responseData(for: request)
    }

    private func decode<T: Decodable>(_ request: URLRequest) async throws -> T {
        try decoder.decode(T.self, from: try await responseData(for: request))
    }

    private func responseData(for request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError(message: "Invalid network response.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(SupabaseErrorResponse.self, from: data))?.displayMessage
                ?? String(data: data, encoding: .utf8)
                ?? "Request failed."
            throw APIError(message: message)
        }
        return data
    }
}

private struct EmptyBody: Encodable {}
private struct ProfileUpdate: Encodable {
    let full_name: String?
    let phone: String?
    let updated_at: String
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

private struct EmptyResponse: Decodable {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        _ = container.decodeNil()
    }
}

private extension ISO8601DateFormatter {
    static let standard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let withFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
