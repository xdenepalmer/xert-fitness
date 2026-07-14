import Foundation

struct APIError: LocalizedError {
    let message: String
    let statusCode: Int?

    init(message: String, statusCode: Int? = nil) {
        self.message = message
        self.statusCode = statusCode
    }

    var errorDescription: String? { message }
    var invalidatesSession: Bool {
        statusCode.map { [400, 401, 403].contains($0) } ?? false
    }
}

enum NetworkFailureMessage {
    static func display(for code: URLError.Code) -> String {
        switch code {
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed:
            return "XERT is offline. Check your connection and try again."
        case .timedOut:
            return "XERT took too long to respond. Please try again."
        case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
            return "XERT services could not be reached. Please try again shortly."
        case .secureConnectionFailed, .serverCertificateHasBadDate,
             .serverCertificateUntrusted, .serverCertificateHasUnknownRoot,
             .serverCertificateNotYetValid, .clientCertificateRejected,
             .clientCertificateRequired:
            return "XERT could not establish a secure connection."
        case .cancelled:
            return "The request was cancelled."
        default:
            return "The network request could not be completed. Please try again."
        }
    }
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

    func signUp(_ signUp: MemberSignUpRequest) async throws -> AuthSession? {
        let response: AuthResponse = try await authRequest(path: "/auth/v1/signup", body: signUp)
        return response.session
    }

    func requestPasswordReset(email: String) async throws {
        let _: EmptyObject = try await authRequest(
            path: "/auth/v1/recover",
            queryItems: [URLQueryItem(name: "redirect_to", value: AppConfig.webURL(path: "reset-password").absoluteString)],
            body: ["email": email]
        )
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

    func updatePassword(session auth: AuthSession, request body: PasswordUpdateRequest) async throws {
        var request = try request(baseURL: AppConfig.supabaseURL, path: "/auth/v1/user")
        request.httpMethod = "PUT"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
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

    func eventGoals(session auth: AuthSession) async throws -> [EventGoal] {
        try await restRequest(
            path: "/rest/v1/member_event_goals",
            queryItems: [
                URLQueryItem(name: "select", value: "event_id"),
                URLQueryItem(name: "order", value: "created_at.desc")
            ],
            auth: auth
        )
    }

    func addEventGoal(session auth: AuthSession, eventID: UUID) async throws {
        guard let userID = auth.user?.id else {
            throw APIError(message: "Your XERT session needs you to sign in again.")
        }
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/member_event_goals",
            queryItems: [URLQueryItem(name: "on_conflict", value: "user_id,event_id")]
        )
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("resolution=ignore-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(EventGoalMutation(user_id: userID, event_id: eventID))
        try await perform(request)
    }

    func removeEventGoal(session auth: AuthSession, eventID: UUID) async throws {
        guard let userID = auth.user?.id else {
            throw APIError(message: "Your XERT session needs you to sign in again.")
        }
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/member_event_goals",
            queryItems: [
                URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString)"),
                URLQueryItem(name: "event_id", value: "eq.\(eventID.uuidString)")
            ]
        )
        request.httpMethod = "DELETE"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        try await perform(request)
    }

    func credits(session auth: AuthSession, now: Date = Date()) async throws -> [CreditBatch] {
        let timestamp = ISO8601DateFormatter.standard.string(from: now)
        return try await restRequest(
            path: "/rest/v1/credit_batches",
            queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "remaining", value: "gt.0"),
                URLQueryItem(name: "or", value: "(expires_at.is.null,expires_at.gt.\(timestamp))"),
                URLQueryItem(name: "order", value: "expires_at.asc")
            ],
            auth: auth
        )
    }

    func orders(session auth: AuthSession) async throws -> [OrderItem] {
        try await restRequest(
            path: "/rest/v1/orders",
            queryItems: [
                URLQueryItem(name: "select", value: "id,status,amount_cents,currency,created_at,paid_at,refunded_at,refunded_amount_cents,products(name)"),
                URLQueryItem(name: "order", value: "created_at.desc")
            ],
            auth: auth
        )
    }

    func announcements(session auth: AuthSession) async throws -> [MemberAnnouncement] {
        try await rpc(path: "my_member_announcements", body: EmptyBody(), auth: auth)
    }

    func dismissAnnouncement(session auth: AuthSession, announcementID: UUID) async throws {
        let _: EmptyResponse = try await rpc(
            path: "dismiss_member_announcement",
            body: ["p_announcement_id": announcementID.uuidString],
            auth: auth
        )
    }

    func profile(session auth: AuthSession) async throws -> MemberProfile? {
        var queryItems = [
            URLQueryItem(name: "select", value: "id,full_name,phone,email,role"),
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

    // MARK: - Native admin command centre

    func adminDailyOperations(session auth: AuthSession) async throws -> [AdminDailyOperation] {
        try await rpc(path: "admin_daily_operations", body: EmptyBody(), auth: auth)
    }

    func adminWaitlist(session auth: AuthSession, limit: Int = 20) async throws -> [AdminWaitlistItem] {
        try await rpc(
            path: "admin_waitlist_overview",
            body: AdminLimitRequest(p_limit: min(max(limit, 1), 50)),
            auth: auth
        )
    }

    func adminFollowUps(session auth: AuthSession, limit: Int = 20) async throws -> [AdminFollowUp] {
        try await rpc(
            path: "admin_member_follow_up_queue",
            body: AdminLimitRequest(p_limit: min(max(limit, 1), 50)),
            auth: auth
        )
    }

    func adminMembers(session auth: AuthSession, search: String = "", limit: Int = 50) async throws -> [AdminMemberSummary] {
        try await rpc(
            path: "admin_list_members_page",
            body: AdminMemberPageRequest(
                p_search: search.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                p_role: "all",
                p_credit: "all",
                p_limit: min(max(limit, 1), 100),
                p_offset: 0,
                p_user_id: nil
            ),
            auth: auth
        )
    }

    func adminPlatformSettings(session auth: AuthSession) async throws -> AdminPlatformSettings? {
        let settings: [AdminPlatformSettings] = try await restRequest(
            path: "/rest/v1/admin_settings",
            queryItems: [
                URLQueryItem(name: "select", value: "id,target_launch_date,countdown_enabled,bookings_enabled,announcement_banner_text,announcement_banner_enabled,updated_at"),
                URLQueryItem(name: "limit", value: "1")
            ],
            auth: auth
        )
        return settings.first
    }

    func adminPTRequests(session auth: AuthSession) async throws -> [AdminPTRequest] {
        try await restRequest(
            path: "/rest/v1/private_session_requests",
            queryItems: [
                URLQueryItem(name: "select", value: "id,full_name,email,phone,requested_session_type,preferred_day,preferred_time,training_goal,experience_level,notes,admin_notes,status,created_at"),
                URLQueryItem(name: "order", value: "created_at.desc"),
                URLQueryItem(name: "limit", value: "100")
            ],
            auth: auth
        )
    }

    func adminAnnouncements(session auth: AuthSession) async throws -> [AdminAnnouncement] {
        try await restRequest(
            path: "/rest/v1/member_announcements",
            queryItems: [
                URLQueryItem(name: "select", value: "id,title,body,tone,audience,cta_label,cta_url,published_at,expires_at,archived_at,created_at,updated_at"),
                URLQueryItem(name: "audience", value: "eq.all"),
                URLQueryItem(name: "order", value: "created_at.desc"),
                URLQueryItem(name: "limit", value: "100")
            ],
            auth: auth
        )
    }

    func adminSchemaCapabilities(session auth: AuthSession) async throws -> [AdminSchemaCapability] {
        try await restRequest(
            path: "/rest/v1/xert_schema_capabilities",
            queryItems: [
                URLQueryItem(name: "select", value: "capability,installed_at"),
                URLQueryItem(name: "order", value: "capability.asc")
            ],
            auth: auth
        )
    }

    func adminCommerceHealth(session auth: AuthSession) async throws -> AdminCommerceHealth {
        try await vercelGet(path: "/api/admin-commerce-health", auth: auth)
    }

    func adminPushHealth(session auth: AuthSession) async throws -> AdminPushHealth {
        try await vercelGet(path: "/api/admin-push-health", auth: auth)
    }

    func adminPublishAnnouncement(
        session auth: AuthSession,
        title: String,
        body: String,
        tone: String
    ) async throws {
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (3...120).contains(normalizedTitle.count) else {
            throw APIError(message: "Announcement titles must be between 3 and 120 characters.")
        }
        guard (3...2_000).contains(normalizedBody.count) else {
            throw APIError(message: "Announcement messages must be between 3 and 2,000 characters.")
        }
        guard ["info", "action", "urgent"].contains(tone) else {
            throw APIError(message: "Choose a valid announcement priority.")
        }
        let _: EmptyObject = try await vercelRequest(
            path: "/api/admin-publish-announcement",
            body: AdminAnnouncementPublishRequest(
                id: nil,
                announcement: AdminAnnouncementPayload(
                    title: normalizedTitle,
                    body: normalizedBody,
                    tone: tone,
                    expires_at: nil,
                    cta_label: nil,
                    cta_url: nil
                ),
                expected_updated_at: nil
            ),
            auth: auth
        )
    }

    func adminUpdatePTRequest(
        session auth: AuthSession,
        requestID: UUID,
        status: String,
        adminNotes: String? = nil,
        updateNotes: Bool = false
    ) async throws {
        let allowed = ["requested", "approved", "declined", "reschedule_requested", "completed", "cancelled"]
        guard allowed.contains(status) else { throw APIError(message: "Choose a valid PT request status.") }
        if let adminNotes, adminNotes.count > 5_000 {
            throw APIError(message: "Admin notes must be 5,000 characters or fewer.")
        }
        let _: UUID? = try await rpc(
            path: "admin_update_request",
            body: AdminRequestUpdate(
                p_request_type: "private_session",
                p_request_id: requestID.uuidString,
                p_status: status,
                p_admin_notes: adminNotes?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                p_update_admin_notes: updateNotes
            ),
            auth: auth
        )
    }

    func adminUpdatePlatformSettings(
        session auth: AuthSession,
        settings: AdminPlatformSettings
    ) async throws -> AdminPlatformSettings {
        let banner = settings.announcementText.trimmingCharacters(in: .whitespacesAndNewlines)
        if settings.announcement_banner_enabled && banner.isEmpty {
            throw APIError(message: "Add announcement text before enabling the banner.")
        }
        guard settings.target_launch_date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
            throw APIError(message: "Enter the launch date as YYYY-MM-DD.")
        }

        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/admin_settings",
            queryItems: [
                URLQueryItem(name: "id", value: "eq.\(settings.id.uuidString)"),
                URLQueryItem(name: "updated_at", value: "eq.\(settings.updated_at)")
            ]
        )
        request.httpMethod = "PATCH"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(AdminSettingsUpdate(
            target_launch_date: settings.target_launch_date,
            countdown_enabled: settings.countdown_enabled,
            bookings_enabled: settings.bookings_enabled,
            announcement_banner_text: banner.isEmpty ? nil : banner,
            announcement_banner_enabled: settings.announcement_banner_enabled,
            updated_at: ISO8601DateFormatter.standard.string(from: Date())
        ))
        let rows: [AdminPlatformSettings] = try await decode(request)
        guard let updated = rows.first else {
            throw APIError(message: "Platform settings changed elsewhere. Refresh and review the latest values before saving.")
        }
        return updated
    }

    @discardableResult
    func adminPromoteNextWaitlisted(session auth: AuthSession, classSessionID: UUID) async throws -> UUID {
        try await rpc(
            path: "admin_promote_next_waitlisted",
            body: AdminSessionRequest(p_session_id: classSessionID),
            auth: auth
        )
    }

    @discardableResult
    func adminAddMemberNote(
        session auth: AuthSession,
        memberID: UUID,
        category: String,
        body: String
    ) async throws -> UUID {
        try await rpc(
            path: "admin_add_member_note",
            body: AdminMemberNoteRequest(
                p_user_id: memberID,
                p_category: category,
                p_body: body
            ),
            auth: auth
        )
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

    func privateSessionRequests(session auth: AuthSession) async throws -> [PrivateSessionStatusItem] {
        try await restRequest(
            path: "/rest/v1/private_session_requests",
            queryItems: [
                URLQueryItem(name: "select", value: "id,status,requested_session_type,preferred_day,preferred_time,training_goal,created_at"),
                URLQueryItem(name: "order", value: "created_at.desc")
            ],
            auth: auth
        )
    }

    func book(session auth: AuthSession, classSessionID: UUID) async throws {
        let _: UUID = try await rpc(
            path: "book_session",
            body: ["p_session_id": classSessionID.uuidString],
            auth: auth
        )
    }

    func joinWaitlist(session auth: AuthSession, classSessionID: UUID) async throws {
        let _: UUID = try await rpc(
            path: "join_session_waitlist",
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
            body: ["product_slug": productSlug, "return_target": "ios"],
            auth: auth
        )
        return response.url
    }

    func requestPrivateSession(_ requestBody: PrivateSessionRequest, auth: AuthSession? = nil) async throws {
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/private_session_requests"
        )
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        if let auth {
            request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        }
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(requestBody)
        try await perform(request)
    }

    func requestClassInterest(_ requestBody: ClassInterestRequest) async throws {
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/class_bookings"
        )
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(requestBody)
        try await perform(request)
    }

    func deleteAccount(session auth: AuthSession) async throws {
        let response: DeleteAccountResponse = try await vercelRequest(
            path: "/api/delete-account",
            body: ["confirmation": "DELETE"],
            auth: auth
        )
        guard response.deleted else {
            throw APIError(message: "XERT could not confirm that your account was deleted.")
        }
    }

    func updatePushSubscription(session auth: AuthSession, token: DevicePushToken, enabled: Bool) async throws {
        let response: PushSubscriptionResponse = try await vercelRequest(
            path: "/api/push-subscription",
            body: PushSubscriptionRequest(
                action: enabled ? "register" : "unregister",
                device_token: token.value,
                environment: token.environment
            ),
            auth: auth
        )
        guard response.registered == enabled else {
            throw APIError(message: "XERT could not confirm your notification preference.")
        }
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

    private func vercelGet<T: Decodable>(path: String, auth: AuthSession) async throws -> T {
        var request = try request(baseURL: AppConfig.vercelBaseURL, path: path)
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
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
        return URLRequest(url: url, timeoutInterval: AppConfig.apiRequestTimeout)
    }

    private func perform(_ request: URLRequest) async throws {
        _ = try await responseData(for: request)
    }

    private func decode<T: Decodable>(_ request: URLRequest) async throws -> T {
        try decoder.decode(T.self, from: try await responseData(for: request))
    }

    private func responseData(for request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            throw APIError(message: NetworkFailureMessage.display(for: error.code))
        } catch is CancellationError {
            throw APIError(message: NetworkFailureMessage.display(for: .cancelled))
        } catch {
            throw APIError(message: "The network request could not be completed. Please try again.")
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError(message: "Invalid network response.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(SupabaseErrorResponse.self, from: data))?.displayMessage
                ?? String(data: data, encoding: .utf8)
                ?? "Request failed."
            throw APIError(message: message, statusCode: http.statusCode)
        }
        return data
    }
}

private struct EmptyBody: Encodable {}
private struct EmptyObject: Decodable {}
private struct AdminLimitRequest: Encodable { let p_limit: Int }
private struct AdminSessionRequest: Encodable { let p_session_id: UUID }
private struct AdminMemberPageRequest: Encodable {
    let p_search: String?
    let p_role: String
    let p_credit: String
    let p_limit: Int
    let p_offset: Int
    let p_user_id: UUID?
}
private struct AdminMemberNoteRequest: Encodable {
    let p_user_id: UUID
    let p_category: String
    let p_body: String
}
private struct AdminSettingsUpdate: Encodable {
    let target_launch_date: String
    let countdown_enabled: Bool
    let bookings_enabled: Bool
    let announcement_banner_text: String?
    let announcement_banner_enabled: Bool
    let updated_at: String
}
private struct AdminRequestUpdate: Encodable {
    let p_request_type: String
    let p_request_id: String
    let p_status: String
    let p_admin_notes: String?
    let p_update_admin_notes: Bool
}
private struct AdminAnnouncementPayload: Encodable {
    let title: String
    let body: String
    let tone: String
    let expires_at: String?
    let cta_label: String?
    let cta_url: String?
}
private struct AdminAnnouncementPublishRequest: Encodable {
    let id: UUID?
    let announcement: AdminAnnouncementPayload
    let expected_updated_at: String?
}
private struct ProfileUpdate: Encodable {
    let full_name: String?
    let phone: String?
    let updated_at: String
}

private struct EventGoalMutation: Encodable {
    let user_id: UUID
    let event_id: UUID
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

private struct DeleteAccountResponse: Decodable {
    let deleted: Bool
}

private struct PushSubscriptionRequest: Encodable {
    let action: String
    let device_token: String
    let environment: String
}

private struct PushSubscriptionResponse: Decodable {
    let registered: Bool
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
