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
                URLQueryItem(name: "select", value: "id,user_id,product_id,email,status,amount_cents,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at,paid_at,refunded_at,refunded_amount_cents,reconciled_at,reconciled_by,products(name),stripe_refunds(refund_id,amount_cents,credits_revoked,credits_consumed,bookings_cancelled,refunded_at)"),
                URLQueryItem(name: "order", value: "created_at.desc")
            ],
            auth: auth
        )
    }

    func adminOrders(session auth: AuthSession) async throws -> [OrderItem] {
        let pageSize = 500
        var offset = 0
        var orders: [OrderItem] = []
        while true {
            let page: [OrderItem] = try await restRequest(
                path: "/rest/v1/orders",
                queryItems: [
                    URLQueryItem(name: "select", value: "id,user_id,product_id,email,status,amount_cents,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at,paid_at,refunded_at,refunded_amount_cents,reconciled_at,reconciled_by,products(name),stripe_refunds(refund_id,amount_cents,credits_revoked,credits_consumed,bookings_cancelled,refunded_at)"),
                    URLQueryItem(name: "order", value: "created_at.desc,id.desc"),
                    URLQueryItem(name: "limit", value: String(pageSize)),
                    URLQueryItem(name: "offset", value: String(offset))
                ],
                auth: auth
            )
            orders.append(contentsOf: page)
            if page.count < pageSize { return orders }
            offset += pageSize
        }
    }

    func adminReconcileOrder(session auth: AuthSession, orderID: UUID) async throws -> AdminReconciliationResult {
        try await vercelRequest(
            path: "/api/admin-reconcile-order",
            body: AdminOrderRequest(order_id: orderID),
            auth: auth
        )
    }

    func adminRefundOrder(
        session auth: AuthSession,
        orderID: UUID,
        reason: String,
        confirmation: String
    ) async throws -> AdminRefundResult {
        guard ["requested_by_customer", "duplicate"].contains(reason) else {
            throw APIError(message: "Choose a valid refund reason.")
        }
        guard confirmation == "REFUND" else {
            throw APIError(message: "Type REFUND exactly to confirm this full refund.")
        }
        return try await vercelRequest(
            path: "/api/admin-refund-order",
            body: AdminRefundRequest(order_id: orderID, reason: reason, confirmation: confirmation),
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

    func adminSessionRoster(session auth: AuthSession, classSessionID: UUID) async throws -> [AdminRosterMember] {
        try await rpc(
            path: "admin_session_roster",
            body: AdminSessionRequest(p_session_id: classSessionID),
            auth: auth
        )
    }

    func adminClassSessions(session auth: AuthSession) async throws -> [AdminClassSession] {
        return try await restRequest(
            path: "/rest/v1/class_sessions",
            queryItems: [
                URLQueryItem(name: "select", value: "id,class_type,title,description,coach_name,start_time,end_time,duration_minutes,capacity,location_zone,beginner_friendly,intensity_level,status,public_visible,booking_mode,notes"),
                URLQueryItem(name: "order", value: "start_time.asc.nullslast"),
                URLQueryItem(name: "limit", value: "1000")
            ],
            auth: auth
        )
    }

    func adminCreateClass(session auth: AuthSession, draft: AdminClassDraft) async throws {
        let payload = try adminClassPayload(draft)
        var request = try request(baseURL: AppConfig.supabaseURL, path: "/rest/v1/class_sessions")
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(payload)
        try await perform(request)
    }

    func adminUpdateClass(session auth: AuthSession, classSession: AdminClassSession, draft: AdminClassDraft) async throws {
        guard !["cancelled", "completed"].contains(classSession.status) else {
            throw APIError(message: "Cancelled and completed classes cannot be reopened. Create a new class instead.")
        }
        guard !["cancelled", "completed"].contains(draft.status) else {
            throw APIError(message: "Use cancellation or attendance to close this class safely.")
        }
        let _: UUID = try await rpc(
            path: "admin_update_class_session",
            body: AdminClassUpdateRequest(
                p_session_id: classSession.id,
                p_session: try adminClassPayload(draft)
            ),
            auth: auth
        )
    }

    @discardableResult
    func adminCancelClass(session auth: AuthSession, classSessionID: UUID) async throws -> Int {
        try await rpc(
            path: "admin_cancel_class_session",
            body: AdminSessionRequest(p_session_id: classSessionID),
            auth: auth
        )
    }

    func adminNotifyClassCancellation(session auth: AuthSession, classSessionID: UUID) async throws {
        let _: AdminCancellationNoticeResponse = try await vercelRequest(
            path: "/api/admin-publish-announcement",
            body: AdminCancellationNoticeRequest(action: "notify_class_cancellation", session_id: classSessionID),
            auth: auth
        )
    }

    private func adminClassPayload(_ draft: AdminClassDraft) throws -> AdminClassPayload {
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw APIError(message: "A class title is required.") }
        guard AdminClassDraft.classTypes.contains(draft.classType) else { throw APIError(message: "Choose a valid class type.") }
        guard AdminClassDraft.intensities.contains(draft.intensity) else { throw APIError(message: "Choose a valid intensity.") }
        guard AdminClassDraft.bookingModes.contains(draft.bookingMode) else { throw APIError(message: "Choose a valid booking mode.") }
        guard ["draft", "published", "full"].contains(draft.status) else { throw APIError(message: "Choose a valid editable class status.") }
        guard draft.capacity > 0, draft.durationMinutes > 0 else { throw APIError(message: "Capacity and duration must be positive whole numbers.") }
        if draft.status == "published" && draft.startTime <= Date() {
            throw APIError(message: "A published class must start in the future.")
        }
        if draft.hasEndTime && draft.endTime <= draft.startTime {
            throw APIError(message: "Class end time must be after its start time.")
        }
        return AdminClassPayload(
            class_type: draft.classType,
            title: title,
            description: draft.description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            coach_name: draft.coachName.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            start_time: ISO8601DateFormatter.standard.string(from: draft.startTime),
            end_time: draft.hasEndTime ? ISO8601DateFormatter.standard.string(from: draft.endTime) : nil,
            duration_minutes: draft.durationMinutes,
            capacity: draft.capacity,
            location_zone: draft.location.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            beginner_friendly: draft.beginnerFriendly,
            intensity_level: draft.intensity,
            status: draft.status,
            public_visible: draft.status == "published" && draft.publicVisible,
            booking_mode: draft.bookingMode,
            notes: draft.notes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        )
    }

    func adminAvailabilityBlocks(session auth: AuthSession) async throws -> [AdminAvailabilityBlock] {
        try await restRequest(
            path: "/rest/v1/availability_blocks",
            queryItems: [
                URLQueryItem(name: "select", value: "id,start_time,end_time,type,coach_name,notes,is_bookable,updated_at"),
                URLQueryItem(name: "order", value: "start_time.asc")
            ], auth: auth
        )
    }

    func adminBlackoutPeriods(session auth: AuthSession) async throws -> [AdminBlackoutPeriod] {
        try await restRequest(
            path: "/rest/v1/blackout_periods",
            queryItems: [
                URLQueryItem(name: "select", value: "id,start_time,end_time,affects,reason,notes,updated_at"),
                URLQueryItem(name: "order", value: "start_time.asc")
            ], auth: auth
        )
    }

    func adminSaveAvailability(session auth: AuthSession, block: AdminAvailabilityBlock?, draft: AdminAvailabilityDraft) async throws {
        guard AdminAvailabilityDraft.types.contains(draft.type) else { throw APIError(message: "Choose a valid availability type.") }
        guard draft.endTime > draft.startTime else { throw APIError(message: "Availability must end after it starts.") }
        let payload = AdminAvailabilityPayload(
            start_time: ISO8601DateFormatter.standard.string(from: draft.startTime),
            end_time: ISO8601DateFormatter.standard.string(from: draft.endTime),
            type: draft.type,
            coach_name: draft.coachName.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            notes: draft.notes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            is_bookable: draft.isBookable
        )
        try await adminScheduleMutation(path: "/rest/v1/availability_blocks", id: block?.id, version: block?.updated_at, payload: payload, auth: auth)
    }

    func adminSaveBlackout(session auth: AuthSession, period: AdminBlackoutPeriod?, draft: AdminBlackoutDraft) async throws {
        guard AdminBlackoutDraft.scopes.contains(draft.affects) else { throw APIError(message: "Choose a valid blackout scope.") }
        guard AdminBlackoutDraft.reasons.contains(draft.reason) else { throw APIError(message: "Choose a valid blackout reason.") }
        guard draft.endTime > draft.startTime else { throw APIError(message: "Blackout must end after it starts.") }
        let payload = AdminBlackoutPayload(
            start_time: ISO8601DateFormatter.standard.string(from: draft.startTime),
            end_time: ISO8601DateFormatter.standard.string(from: draft.endTime),
            affects: draft.affects,
            reason: draft.reason,
            notes: draft.notes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        )
        do {
            try await adminScheduleMutation(path: "/rest/v1/blackout_periods", id: period?.id, version: period?.updated_at, payload: payload, auth: auth)
        } catch let error as APIError where error.message.localizedCaseInsensitiveContains("BLACKOUT_OVERLAPS_PUBLISHED_CLASS") {
            throw APIError(message: "This blackout overlaps a published class. Cancel or reschedule that class first.")
        }
    }

    func adminDeleteAvailability(session auth: AuthSession, block: AdminAvailabilityBlock) async throws {
        try await adminScheduleDelete(path: "/rest/v1/availability_blocks", id: block.id, version: block.updated_at, auth: auth)
    }

    func adminDeleteBlackout(session auth: AuthSession, period: AdminBlackoutPeriod) async throws {
        try await adminScheduleDelete(path: "/rest/v1/blackout_periods", id: period.id, version: period.updated_at, auth: auth)
    }

    private func adminScheduleMutation<Payload: Encodable>(path: String, id: UUID?, version: String?, payload: Payload, auth: AuthSession) async throws {
        var queryItems: [URLQueryItem] = []
        if id != nil && version == nil {
            throw APIError(message: "This schedule record has no version. Refresh before editing it.")
        }
        if let id, let version {
            queryItems = [URLQueryItem(name: "id", value: "eq.\(id.uuidString)"), URLQueryItem(name: "updated_at", value: "eq.\(version)")]
        }
        var request = try request(baseURL: AppConfig.supabaseURL, path: path, queryItems: queryItems)
        request.httpMethod = id == nil ? "POST" : "PATCH"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(id == nil ? "return=minimal" : "return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(payload)
        if id == nil { try await perform(request); return }
        let rows: [AdminMutationID] = try await decode(request)
        guard !rows.isEmpty else { throw APIError(message: "This schedule record changed elsewhere. Refresh and review the latest version.") }
    }

    private func adminScheduleDelete(path: String, id: UUID, version: String, auth: AuthSession) async throws {
        var request = try request(baseURL: AppConfig.supabaseURL, path: path, queryItems: [
            URLQueryItem(name: "id", value: "eq.\(id.uuidString)"), URLQueryItem(name: "updated_at", value: "eq.\(version)")
        ])
        request.httpMethod = "DELETE"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let rows: [AdminMutationID] = try await decode(request)
        guard !rows.isEmpty else { throw APIError(message: "This schedule record changed elsewhere. Refresh before removing it.") }
    }

    func adminSetBookingStatus(session auth: AuthSession, bookingID: UUID, status: String) async throws {
        guard ["requested", "confirmed", "waitlisted", "cancelled", "declined"].contains(status) else {
            throw APIError(message: "Choose a valid booking decision.")
        }
        let _: EmptyResponse = try await rpc(
            path: "admin_set_booking_status",
            body: AdminBookingStatusRequest(p_booking_id: bookingID, p_status: status),
            auth: auth
        )
    }

    @discardableResult
    func adminRecordAttendance(
        session auth: AuthSession,
        classSessionID: UUID,
        attendedIDs: [UUID],
        noShowIDs: [UUID]
    ) async throws -> Int {
        guard !attendedIDs.isEmpty || !noShowIDs.isEmpty else {
            throw APIError(message: "Complete the roll call before saving attendance.")
        }
        return try await rpc(
            path: "admin_record_session_attendance",
            body: AdminAttendanceRequest(
                p_session_id: classSessionID,
                p_attended_ids: attendedIDs,
                p_no_show_ids: noShowIDs
            ),
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

    func adminMemberNotes(session auth: AuthSession, memberID: UUID, includeArchived: Bool = true) async throws -> [AdminMemberNote] {
        try await rpc(
            path: "admin_list_member_notes",
            body: AdminMemberNotesRequest(p_user_id: memberID, p_include_archived: includeArchived),
            auth: auth
        )
    }

    @discardableResult
    func adminGrantCredits(
        session auth: AuthSession,
        memberID: UUID,
        sessions: Int,
        validityDays: Int?,
        requestID: UUID,
        note: String
    ) async throws -> UUID {
        let reason = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...100).contains(sessions) else { throw APIError(message: "Grant between 1 and 100 class credits.") }
        if let validityDays, !(1...3_650).contains(validityDays) { throw APIError(message: "Validity must be between 1 and 3,650 days.") }
        guard (3...500).contains(reason.count) else { throw APIError(message: "Add a grant reason between 3 and 500 characters.") }
        return try await rpc(
            path: "admin_grant_credits_v2",
            body: AdminCreditGrantRequest(
                p_user_id: memberID, p_sessions: sessions, p_validity_days: validityDays,
                p_request_id: requestID, p_note: reason
            ), auth: auth
        )
    }

    func adminSetRole(session auth: AuthSession, memberID: UUID, role: String) async throws {
        guard ["member", "admin"].contains(role) else { throw APIError(message: "Choose a valid account role.") }
        do {
            let _: EmptyResponse = try await rpc(
                path: "admin_set_role",
                body: AdminRoleRequest(p_user_id: memberID, p_role: role), auth: auth
            )
        } catch let error as APIError {
            if error.message.localizedCaseInsensitiveContains("CANNOT_DEMOTE_LAST_ADMIN") {
                throw APIError(message: "Promote another administrator before removing the final admin.")
            }
            if error.message.localizedCaseInsensitiveContains("CANNOT_DEMOTE_SELF") {
                throw APIError(message: "Another administrator must remove your owner access.")
            }
            throw APIError(message: error.message, statusCode: error.statusCode)
        }
    }

    func adminArchiveMemberNote(session auth: AuthSession, noteID: UUID, archived: Bool) async throws {
        let _: EmptyResponse = try await rpc(
            path: "admin_set_member_note_archived",
            body: AdminNoteArchiveRequest(p_note_id: noteID, p_archived: archived), auth: auth
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

    func adminAudit(session auth: AuthSession) async throws -> [AdminAuditEntry] {
        async let roles: [AdminRoleAuditRow] = adminAuditRows(
            table: "admin_role_changes",
            select: "id,target_user_id,previous_role,new_role,created_at",
            auth: auth
        )
        async let credits: [AdminCreditAuditRow] = adminAuditRows(
            table: "admin_credit_grants",
            select: "id,user_id,sessions,note,created_at",
            auth: auth
        )
        async let requests: [AdminRequestAuditRow] = adminAuditRows(
            table: "admin_request_status_changes",
            select: "id,request_type,previous_status,new_status,subject_label,subject_email,created_at",
            auth: auth
        )
        async let notices: [AdminNoticeAuditRow] = adminAuditRows(
            table: "member_announcement_admin_events",
            select: "id,announcement_title,action,created_at",
            auth: auth
        )
        async let leads: [AdminLeadAuditRow] = adminAuditRows(
            table: "admin_lead_changes",
            select: "id,lead_type,previous_status,new_status,subject_label,subject_email,created_at",
            auth: auth
        )
        async let schedules: [AdminResourceAuditRow] = adminAuditRows(
            table: "admin_schedule_changes",
            select: "id,resource_type,action,subject_label,created_at",
            auth: auth
        )
        async let content: [AdminResourceAuditRow] = adminAuditRows(
            table: "admin_content_changes",
            select: "id,resource_type,action,subject_label,created_at",
            auth: auth
        )
        async let bookings: [AdminBookingAuditRow] = adminAuditRows(
            table: "session_booking_changes",
            select: "id,action,class_label,created_at",
            auth: auth
        )

        let rows = try await (roles, credits, requests, notices, leads, schedules, content, bookings)
        let all = [
            rows.0.map { $0.entry }, rows.1.map { $0.entry }, rows.2.map { $0.entry },
            rows.3.map { $0.entry }, rows.4.map { $0.entry }, rows.5.map { $0.entry(category: "Schedule") },
            rows.6.map { $0.entry(category: "Content") }, rows.7.map { $0.entry }
        ]
        return all
            .flatMap { $0 }
            .sorted { $0.createdAt > $1.createdAt }
            .prefix(300)
            .map { $0 }
    }

    func adminProducts(session auth: AuthSession) async throws -> [AdminProduct] {
        try await restRequest(
            path: "/rest/v1/products",
            queryItems: [
                URLQueryItem(name: "select", value: "id,slug,name,description,price_cents,currency,sessions_count,validity_days,stripe_price_id,featured,active,sort_order,updated_at"),
                URLQueryItem(name: "order", value: "sort_order.asc,created_at.asc")
            ],
            auth: auth
        )
    }

    func adminUpdateProduct(session auth: AuthSession, product: AdminProduct, draft: AdminProductDraft) async throws {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { throw APIError(message: "A pack name is required.") }
        guard let amount = Decimal(string: draft.price), amount > 0 else {
            throw APIError(message: "Enter a valid positive pack price.")
        }
        let cents = NSDecimalNumber(decimal: amount * 100).intValue
        guard cents > 0, draft.sessions > 0, draft.validityDays > 0, draft.sortOrder >= 0 else {
            throw APIError(message: "Sessions, validity and display order must be valid whole numbers.")
        }
        let currency = draft.currency.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard currency.range(of: #"^[a-z]{3}$"#, options: .regularExpression) != nil else {
            throw APIError(message: "Currency must be a three-letter code such as AUD.")
        }
        let stripeID = draft.stripePriceID.trimmingCharacters(in: .whitespacesAndNewlines)
        if !stripeID.isEmpty, stripeID.range(of: #"^price_[A-Za-z0-9]+$"#, options: .regularExpression) == nil {
            throw APIError(message: "Stripe Price ID must begin with price_.")
        }
        if let currentStripe = product.stripe_price_id, currentStripe == stripeID,
           (product.price_cents != cents || product.currency.lowercased() != currency) {
            throw APIError(message: "Replace or clear the Stripe Price ID before changing this pack's price or currency.")
        }

        let _: UUID = try await rpc(
            path: "admin_update_product",
            body: AdminProductUpdateRequest(
                p_product_id: product.id,
                p_product: AdminProductPayload(
                    name: name,
                    description: draft.description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    price_cents: cents,
                    currency: currency,
                    sessions_count: draft.sessions,
                    validity_days: draft.validityDays,
                    stripe_price_id: stripeID.nilIfEmpty,
                    featured: draft.featured,
                    active: draft.active,
                    sort_order: draft.sortOrder
                ),
                p_expected_updated_at: product.updated_at
            ),
            auth: auth
        )
    }

    func adminEvents(session auth: AuthSession) async throws -> [AdminEvent] {
        try await restRequest(
            path: "/rest/v1/events",
            queryItems: [
                URLQueryItem(name: "select", value: "id,name,category,event_date,end_date,location,region,url,published,sort_order,updated_at"),
                URLQueryItem(name: "order", value: "event_date.asc.nullslast,sort_order.asc")
            ],
            auth: auth
        )
    }

    func adminEventGoalReferences(session auth: AuthSession) async throws -> [AdminEventGoalReference] {
        try await restRequest(
            path: "/rest/v1/member_event_goals",
            queryItems: [URLQueryItem(name: "select", value: "event_id")],
            auth: auth
        )
    }

    func adminEventGoalMembers(session auth: AuthSession, eventID: UUID) async throws -> [AdminEventGoalMember] {
        try await rpc(
            path: "admin_event_goal_members",
            body: ["p_event_id": eventID.uuidString],
            auth: auth
        )
    }

    func adminCreateEvent(session auth: AuthSession, draft: AdminEventDraft) async throws {
        let payload = try adminEventPayload(draft)
        var request = try request(baseURL: AppConfig.supabaseURL, path: "/rest/v1/events")
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(payload)
        try await perform(request)
    }

    func adminUpdateEvent(session auth: AuthSession, event: AdminEvent, draft: AdminEventDraft) async throws {
        let payload = try adminEventPayload(draft)
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/events",
            queryItems: [
                URLQueryItem(name: "id", value: "eq.\(event.id.uuidString)"),
                URLQueryItem(name: "updated_at", value: "eq.\(event.updated_at)")
            ]
        )
        request.httpMethod = "PATCH"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(payload)
        let rows: [AdminMutationID] = try await decode(request)
        guard !rows.isEmpty else {
            throw APIError(message: "This event changed elsewhere. Refresh the calendar and review the latest version.")
        }
    }

    func adminDeleteEvent(session auth: AuthSession, event: AdminEvent) async throws {
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/events",
            queryItems: [
                URLQueryItem(name: "id", value: "eq.\(event.id.uuidString)"),
                URLQueryItem(name: "updated_at", value: "eq.\(event.updated_at)")
            ]
        )
        request.httpMethod = "DELETE"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let rows: [AdminMutationID] = try await decode(request)
        guard !rows.isEmpty else {
            throw APIError(message: "This event changed elsewhere. Refresh the calendar before deleting it.")
        }
    }

    private func adminEventPayload(_ draft: AdminEventDraft) throws -> AdminEventPayload {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { throw APIError(message: "An event name is required.") }
        guard draft.sortOrder >= 0 else { throw APIError(message: "Sort order cannot be negative.") }
        if draft.hasEndDate && !draft.hasStartDate {
            throw APIError(message: "Add a start date before adding an end date.")
        }
        if draft.hasStartDate && draft.hasEndDate && draft.endDate < draft.startDate {
            throw APIError(message: "The end date cannot be before the start date.")
        }
        let link = draft.url.trimmingCharacters(in: .whitespacesAndNewlines)
        if !link.isEmpty {
            guard let url = URL(string: link), let scheme = url.scheme?.lowercased(),
                  ["https", "http"].contains(scheme), url.host != nil else {
                throw APIError(message: "Enter a complete event website beginning with https://.")
            }
        }
        return AdminEventPayload(
            name: name,
            category: draft.category,
            event_date: draft.startDateValue,
            end_date: draft.endDateValue,
            location: draft.location.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            region: draft.region.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            url: link.nilIfEmpty,
            published: draft.published,
            sort_order: draft.sortOrder
        )
    }

    func adminCoaches(session auth: AuthSession) async throws -> [AdminCoach] {
        try await restRequest(
            path: "/rest/v1/coaches",
            queryItems: [
                URLQueryItem(name: "select", value: "id,name,role,bio,experience,currently_training_for,photo_url,social_url,category,sort_order,published,updated_at"),
                URLQueryItem(name: "order", value: "sort_order.asc,created_at.asc")
            ],
            auth: auth
        )
    }

    func adminCreateCoach(session auth: AuthSession, draft: AdminCoachDraft) async throws {
        let payload = try adminCoachPayload(draft)
        var request = try request(baseURL: AppConfig.supabaseURL, path: "/rest/v1/coaches")
        request.httpMethod = "POST"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(payload)
        try await perform(request)
    }

    func adminUpdateCoach(session auth: AuthSession, coach: AdminCoach, draft: AdminCoachDraft) async throws {
        let payload = try adminCoachPayload(draft)
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/coaches",
            queryItems: [
                URLQueryItem(name: "id", value: "eq.\(coach.id.uuidString)"),
                URLQueryItem(name: "updated_at", value: "eq.\(coach.updated_at)")
            ]
        )
        request.httpMethod = "PATCH"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(payload)
        let rows: [AdminMutationID] = try await decode(request)
        guard !rows.isEmpty else {
            throw APIError(message: "This team profile changed elsewhere. Refresh and review the latest version.")
        }
    }

    func adminDeleteCoach(session auth: AuthSession, coach: AdminCoach) async throws {
        var request = try request(
            baseURL: AppConfig.supabaseURL,
            path: "/rest/v1/coaches",
            queryItems: [
                URLQueryItem(name: "id", value: "eq.\(coach.id.uuidString)"),
                URLQueryItem(name: "updated_at", value: "eq.\(coach.updated_at)")
            ]
        )
        request.httpMethod = "DELETE"
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(auth.access_token)", forHTTPHeaderField: "Authorization")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let rows: [AdminMutationID] = try await decode(request)
        guard !rows.isEmpty else {
            throw APIError(message: "This team profile changed elsewhere. Refresh before deleting it.")
        }
    }

    private func adminCoachPayload(_ draft: AdminCoachDraft) throws -> AdminCoachPayload {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { throw APIError(message: "A team member name is required.") }
        guard name.count <= 120 else { throw APIError(message: "Name must be 120 characters or fewer.") }
        guard AdminCoachDraft.categories.contains(draft.category) else {
            throw APIError(message: "Choose a valid team category.")
        }
        guard draft.sortOrder >= 0 else { throw APIError(message: "Sort order cannot be negative.") }
        let photo = try validatedWebLink(draft.photoURL, label: "Photo URL", allowsRelative: true)
        let social = try validatedWebLink(draft.socialURL, label: "Social link")
        return AdminCoachPayload(
            name: name,
            role: draft.role.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            bio: draft.bio.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            experience: draft.experience.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            currently_training_for: draft.currentlyTrainingFor.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            photo_url: photo,
            social_url: social,
            category: draft.category,
            sort_order: draft.sortOrder,
            published: draft.published
        )
    }

    private func validatedWebLink(_ value: String, label: String, allowsRelative: Bool = false) throws -> String? {
        let link = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !link.isEmpty else { return nil }
        if allowsRelative && link.hasPrefix("/") { return link }
        guard let url = URL(string: link), let scheme = url.scheme?.lowercased(),
              ["https", "http"].contains(scheme), url.host != nil else {
            throw APIError(message: "\(label) must be a complete http:// or https:// address.")
        }
        return link
    }

    private func adminAuditRows<T: Decodable>(table: String, select: String, auth: AuthSession) async throws -> [T] {
        try await restRequest(
            path: "/rest/v1/\(table)",
            queryItems: [
                URLQueryItem(name: "select", value: select),
                URLQueryItem(name: "order", value: "created_at.desc,id.desc"),
                URLQueryItem(name: "limit", value: "100")
            ],
            auth: auth
        )
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
private struct AdminBookingStatusRequest: Encodable {
    let p_booking_id: UUID
    let p_status: String
}
private struct AdminAttendanceRequest: Encodable {
    let p_session_id: UUID
    let p_attended_ids: [UUID]
    let p_no_show_ids: [UUID]
}
private struct AdminOrderRequest: Encodable { let order_id: UUID }
private struct AdminRefundRequest: Encodable {
    let order_id: UUID
    let reason: String
    let confirmation: String
}
private struct AdminClassPayload: Encodable {
    let class_type: String
    let title: String
    let description: String?
    let coach_name: String?
    let start_time: String
    let end_time: String?
    let duration_minutes: Int
    let capacity: Int
    let location_zone: String?
    let beginner_friendly: Bool
    let intensity_level: String
    let status: String
    let public_visible: Bool
    let booking_mode: String
    let notes: String?
}
private struct AdminClassUpdateRequest: Encodable {
    let p_session_id: UUID
    let p_session: AdminClassPayload
}
private struct AdminCancellationNoticeRequest: Encodable {
    let action: String
    let session_id: UUID
}
private struct AdminCancellationNoticeResponse: Decodable {}
private struct AdminAvailabilityPayload: Encodable {
    let start_time: String
    let end_time: String
    let type: String
    let coach_name: String?
    let notes: String?
    let is_bookable: Bool
}
private struct AdminBlackoutPayload: Encodable {
    let start_time: String
    let end_time: String
    let affects: String
    let reason: String
    let notes: String?
}
private struct AdminMemberPageRequest: Encodable {
    let p_search: String?
    let p_role: String
    let p_credit: String
    let p_limit: Int
    let p_offset: Int
    let p_user_id: UUID?
}
private struct AdminMemberNotesRequest: Encodable {
    let p_user_id: UUID
    let p_include_archived: Bool
}
private struct AdminCreditGrantRequest: Encodable {
    let p_user_id: UUID
    let p_sessions: Int
    let p_validity_days: Int?
    let p_request_id: UUID
    let p_note: String
}
private struct AdminRoleRequest: Encodable { let p_user_id: UUID; let p_role: String }
private struct AdminNoteArchiveRequest: Encodable { let p_note_id: UUID; let p_archived: Bool }
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

private struct AdminRoleAuditRow: Decodable {
    let id: UUID; let target_user_id: UUID; let previous_role: String; let new_role: String; let created_at: Date
    var entry: AdminAuditEntry { .init(id: "role:\(id)", category: "Access", title: "Member role changed", detail: "\(previous_role) to \(new_role) · \(target_user_id.uuidString.prefix(8))", createdAt: created_at) }
}
private struct AdminCreditAuditRow: Decodable {
    let id: UUID; let user_id: UUID; let sessions: Int; let note: String?; let created_at: Date
    var entry: AdminAuditEntry { .init(id: "credit:\(id)", category: "Credits", title: "\(sessions) credit\(sessions == 1 ? "" : "s") granted", detail: note ?? "Member \(user_id.uuidString.prefix(8))", createdAt: created_at) }
}
private struct AdminRequestAuditRow: Decodable {
    let id: UUID; let request_type: String; let previous_status: String?; let new_status: String?; let subject_label: String?; let subject_email: String?; let created_at: Date
    var entry: AdminAuditEntry { .init(id: "request:\(id)", category: "Requests", title: "\(request_type == "class_booking" ? "Booking" : "PT") request updated", detail: "\(subject_label ?? subject_email ?? "Request") · \(previous_status ?? "new") to \(new_status ?? "updated")", createdAt: created_at) }
}
private struct AdminNoticeAuditRow: Decodable {
    let id: UUID; let announcement_title: String?; let action: String; let created_at: Date
    var entry: AdminAuditEntry { .init(id: "notice:\(id)", category: "Notices", title: "Member notice \(action)", detail: announcement_title ?? "Member announcement", createdAt: created_at) }
}
private struct AdminLeadAuditRow: Decodable {
    let id: UUID; let lead_type: String; let previous_status: String?; let new_status: String?; let subject_label: String?; let subject_email: String?; let created_at: Date
    var entry: AdminAuditEntry { .init(id: "lead:\(id)", category: "Leads", title: "\(lead_type.capitalized) lead updated", detail: "\(subject_label ?? subject_email ?? "Lead") · \(previous_status ?? "new") to \(new_status ?? "updated")", createdAt: created_at) }
}
private struct AdminResourceAuditRow: Decodable {
    let id: UUID; let resource_type: String; let action: String; let subject_label: String?; let created_at: Date
    func entry(category: String) -> AdminAuditEntry { .init(id: "\(category.lowercased()):\(id)", category: category, title: "\(resource_type.replacingOccurrences(of: "_", with: " ").capitalized) \(action)", detail: subject_label ?? "Managed resource", createdAt: created_at) }
}
private struct AdminBookingAuditRow: Decodable {
    let id: UUID; let action: String; let class_label: String?; let created_at: Date
    var entry: AdminAuditEntry { .init(id: "booking:\(id)", category: "Bookings", title: action.replacingOccurrences(of: "_", with: " ").capitalized, detail: class_label ?? "Class booking", createdAt: created_at) }
}
private struct AdminProductPayload: Encodable {
    let name: String
    let description: String?
    let price_cents: Int
    let currency: String
    let sessions_count: Int
    let validity_days: Int
    let stripe_price_id: String?
    let featured: Bool
    let active: Bool
    let sort_order: Int
}
private struct AdminProductUpdateRequest: Encodable {
    let p_product_id: UUID
    let p_product: AdminProductPayload
    let p_expected_updated_at: String
}
private struct AdminEventPayload: Encodable {
    let name: String
    let category: String
    let event_date: String?
    let end_date: String?
    let location: String?
    let region: String?
    let url: String?
    let published: Bool
    let sort_order: Int
}
private struct AdminMutationID: Decodable { let id: UUID }
private struct AdminCoachPayload: Encodable {
    let name: String
    let role: String?
    let bio: String?
    let experience: String?
    let currently_training_for: String?
    let photo_url: String?
    let social_url: String?
    let category: String
    let sort_order: Int
    let published: Bool
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
