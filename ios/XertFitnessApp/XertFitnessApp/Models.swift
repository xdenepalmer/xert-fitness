import Foundation

enum XertDataSource: String, CaseIterable, Hashable {
    case products, sessions, events, coaches, siteContent, platformSettings, credits, bookings, orders, profile, onboarding, eventGoals, privateSessions, announcements

    var displayName: String {
        switch self {
        case .products: return "session packs"
        case .sessions: return "class timetable"
        case .events: return "event calendar"
        case .coaches: return "coaches and practitioners"
        case .siteContent: return "public site content"
        case .platformSettings: return "booking and pack purchase availability"
        case .credits: return "class credits"
        case .bookings: return "your bookings"
        case .orders: return "purchase history"
        case .profile: return "member profile"
        case .onboarding: return "member readiness"
        case .eventGoals: return "training goals"
        case .privateSessions: return "PT requests"
        case .announcements: return "member notices"
        }
    }
}

struct PublicPlatformSettings: Codable, Hashable {
    let bookings_enabled: Bool
    let payments_enabled: Bool
}

struct MemberAnnouncement: Identifiable, Codable, Hashable {
    let id: UUID
    let title: String
    let body: String
    let tone: String
    let cta_label: String?
    let cta_url: String?
    let published_at: Date
    let expires_at: Date?
    let updated_at: Date

    var priorityLabel: String {
        switch tone {
        case "urgent": return "Urgent"
        case "action": return "Action requested"
        default: return "Member update"
        }
    }

    var action: MemberAnnouncementAction? {
        let label = cta_label?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let destination = cta_url?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !label.isEmpty, label.count <= 40, !destination.isEmpty, destination.count <= 500 else {
            return nil
        }
        if destination.hasPrefix("/"), !destination.hasPrefix("//") {
            let path = URLComponents(string: destination)?.path ?? destination
            let nativeTab = XertPrimaryDestination.destination(for: path)
            guard let url = URL(string: destination, relativeTo: AppConfig.vercelBaseURL)?.absoluteURL else {
                return nil
            }
            return MemberAnnouncementAction(label: label, url: url, nativeTab: nativeTab)
        }
        guard let components = URLComponents(string: destination),
              components.scheme?.lowercased() == "https",
              components.host != nil,
              components.user == nil,
              components.password == nil,
              let url = components.url else { return nil }
        return MemberAnnouncementAction(label: label, url: url, nativeTab: nil)
    }
}

struct MemberAnnouncementAction: Equatable {
    let label: String
    let url: URL
    let nativeTab: XertPrimaryDestination?
}

struct Product: Identifiable, Codable, Hashable {
    var id: String { slug }
    let slug: String
    let name: String
    let description: String?
    let sessionsCount: Int
    let price_cents: Int
    let active: Bool?
    let sort_order: Int?

    enum CodingKeys: String, CodingKey {
        case slug, name, description, price_cents, active, sort_order
        case sessionsCount = "sessions_count"
    }

    var displayPrice: String {
        let dollars = Double(price_cents) / 100
        return dollars.formatted(.currency(code: "AUD"))
    }
}

struct ClassSession: Identifiable, Codable, Hashable {
    let id: UUID
    let class_type: String?
    let title: String
    let description: String?
    let coach_name: String?
    let start_time: Date
    let end_time: Date?
    let duration_minutes: Int?
    let capacity: Int?
    let location_zone: String?
    let beginner_friendly: Bool?
    let intensity_level: String?
    let booking_mode: String?
    let booked_count: Int?
    let spots_left: Int?

    var isFull: Bool { spots_left.map { $0 <= 0 } ?? false }

    var effectiveEndTime: Date {
        if let end_time, end_time > start_time { return end_time }
        return start_time.addingTimeInterval(TimeInterval(Swift.max(duration_minutes ?? 60, 1) * 60))
    }
}

struct EventItem: Identifiable, Codable, Hashable {
    let id: UUID?
    let name: String
    let category: String?
    let event_date: String?
    let end_date: String?
    let location: String?
    let region: String?
    let url: String?
    let published: Bool?
    let sort_order: Int?

    var stableID: String {
        id?.uuidString ?? "\(name)-\(event_date ?? "tbc")"
    }

    var startDate: Date? { eventDate(event_date) }
    var finalDate: Date? { eventDate(end_date) ?? startDate }

    var isComplete: Bool { lifecycle() == .complete }

    func lifecycle(on referenceDate: Date = Date()) -> EventLifecycle {
        guard let startDate, let finalDate else { return .dateTBC }
        let referenceDay = Self.calendar.startOfDay(for: referenceDate)
        if referenceDay > Self.calendar.startOfDay(for: finalDate) { return .complete }
        if referenceDay >= Self.calendar.startOfDay(for: startDate) { return .happeningNow }
        return .upcoming
    }

    var externalURL: URL? {
        guard
            let rawURL = url?.trimmingCharacters(in: .whitespacesAndNewlines),
            let parsedURL = URL(string: rawURL),
            let scheme = parsedURL.scheme?.lowercased(),
            parsedURL.host != nil,
            scheme == "https" || scheme == "http"
        else {
            return nil
        }
        return parsedURL
    }

    private func eventDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        return Self.dateFormatter.date(from: value)
    }

    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Australia/Brisbane") ?? .current
        return calendar
    }()

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Self.calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Self.calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

enum EventLifecycle: Equatable {
    case dateTBC
    case upcoming
    case happeningNow
    case complete

    var label: String {
        switch self {
        case .dateTBC: return "Date TBC"
        case .upcoming: return "Coming up"
        case .happeningNow: return "Happening now"
        case .complete: return "Complete"
        }
    }
}

struct EventGoal: Codable, Hashable {
    let event_id: UUID
}

struct CreditBatch: Identifiable, Codable, Hashable {
    let id: UUID
    let order_id: UUID?
    let total: Int
    let remaining: Int
    let expires_at: Date?

    init(
        id: UUID,
        total: Int,
        remaining: Int,
        expires_at: Date?,
        order_id: UUID? = nil
    ) {
        self.id = id
        self.order_id = order_id
        self.total = total
        self.remaining = remaining
        self.expires_at = expires_at
    }
}

struct CreditExpirySummary: Equatable {
    let credits: Int
    let expiresAt: Date
    let daysRemaining: Int
}

extension Collection where Element == CreditBatch {
    func expirySummary(now: Date = Date(), windowDays: Int = 7) -> CreditExpirySummary? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Australia/Brisbane")!
        guard windowDays > 0,
              let cutoff = calendar.date(byAdding: .day, value: windowDays, to: now)
        else { return nil }

        let expiring = compactMap { batch -> (CreditBatch, Date)? in
            guard batch.remaining > 0,
                  let expiry = batch.expires_at,
                  expiry > now,
                  expiry <= cutoff
            else { return nil }
            return (batch, expiry)
        }
        .sorted { $0.1 < $1.1 }

        guard let earliest = expiring.first?.1 else { return nil }
        // Keep the quantity tied to the date we display. Summing every batch
        // inside the warning window would incorrectly imply later credits all
        // expire at the earliest batch's timestamp.
        let credits = expiring
            .filter { calendar.isDate($0.1, inSameDayAs: earliest) }
            .reduce(0) { $0 + $1.0.remaining }
        let daysRemaining = Swift.max(1, Int(ceil(earliest.timeIntervalSince(now) / 86_400)))
        return CreditExpirySummary(credits: credits, expiresAt: earliest, daysRemaining: daysRemaining)
    }
}

struct OrderProduct: Codable, Hashable {
    let name: String
}

struct OrderRefund: Codable, Hashable {
    let refund_id: String
    let amount_cents: Int
    let credits_revoked: Int
    let credits_consumed: Int
    let bookings_cancelled: Int
    let refunded_at: Date
}

struct OrderRefundRelation: Codable, Hashable {
    let values: [OrderRefund]

    init(_ values: [OrderRefund]) { self.values = values }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let rows = try? container.decode([OrderRefund].self) {
            values = rows
        } else {
            values = [try container.decode(OrderRefund.self)]
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(values)
    }
}

struct OrderItem: Identifiable, Codable, Hashable {
    let id: UUID
    let user_id: UUID?
    let product_id: UUID?
    let email: String?
    let status: String
    let amount_cents: Int?
    let currency: String?
    let credit_total: Int?
    let credit_validity_days: Int?
    let stripe_checkout_session_id: String?
    let stripe_payment_intent_id: String?
    let created_at: Date
    let paid_at: Date?
    let refunded_at: Date?
    let refunded_amount_cents: Int?
    let reconciled_at: Date?
    let reconciled_by: UUID?
    let products: OrderProduct?
    let stripe_refunds: OrderRefundRelation?

    var displayAmount: String {
        let normalizedCode = currency?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let code = normalizedCode?.isEmpty == false ? normalizedCode ?? "AUD" : "AUD"
        return (Double(amount_cents ?? 0) / 100).formatted(.currency(code: code))
    }

    var displayStatus: String {
        status.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var purchasedTerms: String {
        guard let credits = credit_total, credits > 0,
              let validityDays = credit_validity_days, validityDays > 0 else {
            return "Legacy order - purchased terms not recorded"
        }
        return "\(credits) session credit\(credits == 1 ? "" : "s") · \(validityDays) days validity"
    }

    var refundedAmount: String? {
        guard status == "refunded", let refundedAmountCents = refunded_amount_cents else { return nil }
        let normalizedCode = currency?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let code = normalizedCode.flatMap { $0.isEmpty ? nil : $0 } ?? "AUD"
        return (Double(refundedAmountCents) / 100).formatted(.currency(code: code))
    }

    var activityDate: Date { refunded_at ?? paid_at ?? created_at }
    var isRecoverable: Bool {
        ["pending", "failed"].contains(status) && !(stripe_checkout_session_id?.isEmpty ?? true)
    }
    var isRefundable: Bool {
        status == "paid" && !(stripe_payment_intent_id?.isEmpty ?? true)
    }
    var refund: OrderRefund? { stripe_refunds?.values.first }
}

struct AdminReconciliationResult: Decodable, Hashable {
    let order_id: UUID
    let status: String
    let credits_granted: Int
    let already_paid: Bool
    let checkout_status: String?
}

struct AdminRefundResult: Decodable, Hashable {
    let refunded: Bool
    let recovered: Bool?
    let refund_id: String
    let refunded_at: Date
    let order_id: UUID
    let credits_revoked: Int
    let credits_consumed: Int
    let bookings_cancelled: Int
}

struct MemberProfile: Identifiable, Codable, Hashable {
    let id: UUID
    let full_name: String?
    let phone: String?
    let email: String?
    let role: String?

    var isAdmin: Bool { role == "admin" }
}

struct MemberOnboardingProfile: Codable, Hashable {
    let full_name: String?
    let phone: String?
    let updated_at: Date
}

struct MemberEmergencyContact: Codable, Hashable {
    let name: String
    let phone: String
    let relationship: String
    let contact_awareness_confirmed_at: Date?
    let updated_at: Date
}

struct MemberOnboardingDocument: Identifiable, Codable, Hashable {
    static let adultReadinessDocumentKey = "adult_readiness_acknowledgement"

    let id: UUID
    let document_key: String
    let version: String
    let title: String
    let body: String
    let source_url: String?
    let content_sha256: String
    let published_at: Date

    var isAdultReadinessAcknowledgement: Bool {
        document_key == Self.adultReadinessDocumentKey
    }

    var sourceURL: URL? {
        guard
            let source_url,
            let url = URL(string: source_url),
            url.scheme?.lowercased() == "https",
            url.host?.isEmpty == false,
            url.user == nil,
            url.password == nil
        else { return nil }
        return url
    }
}

struct MemberOnboardingAcceptance: Codable, Hashable {
    let document_id: UUID
    let document_key: String
    let version: String
    let content_sha256: String
    let accepted_at: Date
    let source: String
}

struct MemberOnboardingState: Codable, Hashable {
    let user_id: UUID
    let profile: MemberOnboardingProfile
    let emergency_contact: MemberEmergencyContact?
    let required_documents: [MemberOnboardingDocument]
    let accepted_documents: [MemberOnboardingAcceptance]
    let profile_complete: Bool
    let emergency_contact_complete: Bool
    let documents_complete: Bool
    let is_complete: Bool

    var requiredDocumentIDs: Set<UUID> {
        Set(required_documents.map(\.id))
    }

    var acceptedDocumentIDs: Set<UUID> {
        Set(accepted_documents.map(\.document_id)).intersection(requiredDocumentIDs)
    }

    var requiredCount: Int { required_documents.count }
    var acceptedCount: Int { acceptedDocumentIDs.count }

    var adultReadinessDocument: MemberOnboardingDocument? {
        required_documents.first(where: \.isAdultReadinessAcknowledgement)
    }

    var hasAcceptedAdultReadinessDocument: Bool {
        adultReadinessDocument.map { acceptedDocumentIDs.contains($0.id) } == true
    }
}

struct MemberOnboardingDraft: Equatable {
    var fullName: String
    var phone: String
    var emergencyContactName: String
    var emergencyContactPhone: String
    var emergencyContactRelationship: String
    var contactIsAware: Bool
    var confirmsAdultEligibility: Bool
    var acceptedDocumentIDs: Set<UUID>

    init(state: MemberOnboardingState) {
        fullName = state.profile.full_name ?? ""
        phone = state.profile.phone ?? ""
        emergencyContactName = state.emergency_contact?.name ?? ""
        emergencyContactPhone = state.emergency_contact?.phone ?? ""
        emergencyContactRelationship = state.emergency_contact?.relationship ?? ""
        contactIsAware = state.emergency_contact?.contact_awareness_confirmed_at != nil
        confirmsAdultEligibility = state.hasAcceptedAdultReadinessDocument
        acceptedDocumentIDs = state.acceptedDocumentIDs
    }
}

struct MemberOnboardingSaveRequest: Encodable, Equatable {
    let p_full_name: String
    let p_phone: String
    let p_emergency_contact_name: String
    let p_emergency_contact_phone: String
    let p_emergency_contact_relationship: String
    let p_contact_is_aware: Bool
    let p_accepted_document_ids: [UUID]
    let p_source: String

    init(
        draft: MemberOnboardingDraft,
        requiredDocuments: [MemberOnboardingDocument]
    ) throws {
        let fullName = Self.clean(draft.fullName)
        let phone = Self.clean(draft.phone)
        let contactName = Self.clean(draft.emergencyContactName)
        let contactPhone = Self.clean(draft.emergencyContactPhone)
        let relationship = Self.clean(draft.emergencyContactRelationship)

        guard let adultDocument = requiredDocuments.first(where: \.isAdultReadinessAcknowledgement) else {
            throw APIError(message: "XERT's adult readiness acknowledgement is unavailable. Retry before saving.")
        }
        guard draft.confirmsAdultEligibility else {
            throw APIError(message: "Member Readiness is currently available only to people aged 18 or older. If you are under 18, ask a parent or guardian to contact XERT.")
        }
        guard draft.acceptedDocumentIDs.contains(adultDocument.id) else {
            throw APIError(message: "Read and acknowledge XERT's current adult readiness document.")
        }

        guard Self.hasValidLengthAndNoLineBreaks(fullName, range: 2...100) else {
            throw APIError(message: "Enter your full name (up to 100 characters).")
        }
        guard Self.isPlausiblePhone(phone) else {
            throw APIError(message: "Enter a valid mobile number.")
        }
        guard Self.hasValidLengthAndNoLineBreaks(contactName, range: 2...100) else {
            throw APIError(message: "Enter your emergency contact's name (up to 100 characters).")
        }
        guard Self.isPlausiblePhone(contactPhone) else {
            throw APIError(message: "Enter a valid emergency contact number.")
        }
        guard Self.hasValidLengthAndNoLineBreaks(relationship, range: 2...60) else {
            throw APIError(message: "Enter your emergency contact's relationship to you (up to 60 characters).")
        }
        guard draft.contactIsAware else {
            throw APIError(message: "Confirm that your emergency contact knows you have nominated them.")
        }

        let requiredIDs = Set(requiredDocuments.map(\.id))
        guard !requiredIDs.isEmpty else {
            throw APIError(message: "XERT's required documents are not available yet. Retry before saving.")
        }
        guard requiredIDs.isSubset(of: draft.acceptedDocumentIDs) else {
            throw APIError(message: "Read and acknowledge every current XERT member document.")
        }

        p_full_name = fullName
        p_phone = phone
        p_emergency_contact_name = contactName
        p_emergency_contact_phone = contactPhone
        p_emergency_contact_relationship = relationship
        p_contact_is_aware = true
        p_accepted_document_ids = requiredIDs.sorted { $0.uuidString < $1.uuidString }
        p_source = "ios_app"
    }

    private static func clean(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func isPlausiblePhone(_ value: String) -> Bool {
        guard (6...32).contains(value.count) else { return false }
        let allowedPunctuation = CharacterSet(charactersIn: " ()-")
        var digitCount = 0

        for (index, scalar) in value.unicodeScalars.enumerated() {
            if (48...57).contains(scalar.value) {
                digitCount += 1
            } else if scalar == "+" {
                guard index == 0 else { return false }
            } else if !allowedPunctuation.contains(scalar) {
                return false
            }
        }

        return (6...15).contains(digitCount)
    }

    private static func hasValidLengthAndNoLineBreaks(
        _ value: String,
        range: ClosedRange<Int>
    ) -> Bool {
        range.contains(value.count) && !value.contains("\n") && !value.contains("\r")
    }
}

enum MemberOnboardingErrorMessage {
    private static let messages: [(code: String, message: String)] = [
        ("AUTH_REQUIRED", "Sign in again to update member readiness."),
        ("MEMBER_PROFILE_NOT_FOUND", "Your member profile is still being prepared. Retry shortly."),
        ("INVALID_FULL_NAME", "Enter your full name (up to 100 characters)."),
        ("INVALID_MEMBER_PHONE", "Enter a valid mobile number."),
        ("INVALID_EMERGENCY_CONTACT_NAME", "Enter your emergency contact's name."),
        ("INVALID_EMERGENCY_CONTACT_PHONE", "Enter a valid emergency contact number."),
        ("INVALID_EMERGENCY_CONTACT_RELATIONSHIP", "Enter your emergency contact's relationship to you."),
        ("CONTACT_AWARENESS_REQUIRED", "Confirm that your emergency contact knows you have nominated them."),
        ("INVALID_ONBOARDING_SOURCE", "XERT could not verify this app submission. Update the app and retry."),
        ("ONBOARDING_DOCUMENTS_REQUIRED", "XERT's required member documents are not available yet. Retry shortly."),
        ("ONBOARDING_DOCUMENTS_STALE", "XERT's member documents changed while you were reading them. Review the current versions and acknowledge them again.")
    ]

    static func display(for rawMessage: String) -> String {
        messages.first { rawMessage.contains($0.code) }?.message
            ?? (rawMessage.isEmpty ? "Could not update member readiness." : rawMessage)
    }
}

struct BookingItem: Identifiable, Codable, Hashable {
    var id: UUID { booking_id }
    let booking_id: UUID
    let status: String
    let booked_at: Date?
    let cancelled_at: Date?
    let session_id: UUID
    let title: String
    let class_type: String?
    let coach_name: String?
    let start_time: Date
    let end_time: Date?
    let location_zone: String?
    let intensity_level: String?
    var waitlist_position: Int? = nil

    var isActiveClassPlace: Bool {
        ["requested", "confirmed", "waitlisted"].contains(status)
    }

    var holdsClassTime: Bool {
        ["requested", "confirmed"].contains(status)
    }

    var effectiveEndTime: Date {
        if let end_time, end_time > start_time { return end_time }
        return start_time.addingTimeInterval(60 * 60)
    }

    var stateLabel: String {
        switch status {
        case "requested": return "Request sent"
        case "confirmed": return "Booked"
        case "waitlisted":
            return waitlist_position.map { "Waitlisted · #\($0)" } ?? "Waitlisted"
        default: return status.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    func isCancellable(now: Date = Date()) -> Bool {
        isActiveClassPlace && start_time > now
    }

    func occursOnBrisbaneDay(containing referenceDate: Date = Date()) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Australia/Brisbane")!
        return calendar.isDate(start_time, inSameDayAs: referenceDate)
    }

    func timelineSection(now: Date = Date()) -> BookingTimelineSection {
        guard start_time > now else { return .history }
        switch status {
        case "requested", "waitlisted": return .pending
        case "confirmed": return .upcoming
        default: return .history
        }
    }

    static func activeBySession(_ bookings: [BookingItem]) -> [UUID: BookingItem] {
        bookings.filter(\.isActiveClassPlace).reduce(into: [:]) { index, candidate in
            guard let current = index[candidate.session_id] else {
                index[candidate.session_id] = candidate
                return
            }

            let currentPriority = activeStatusPriority(current.status)
            let candidatePriority = activeStatusPriority(candidate.status)
            if candidatePriority > currentPriority
                || (candidatePriority == currentPriority
                    && (candidate.booked_at ?? .distantPast) > (current.booked_at ?? .distantPast)) {
                index[candidate.session_id] = candidate
            }
        }
    }

    static func timeConflict(for session: ClassSession, in bookings: [BookingItem]) -> BookingItem? {
        bookings.first { booking in
            booking.holdsClassTime
                && booking.session_id != session.id
                && booking.start_time < session.effectiveEndTime
                && booking.effectiveEndTime > session.start_time
        }
    }

    private static func activeStatusPriority(_ status: String) -> Int {
        switch status {
        case "confirmed": return 3
        case "requested": return 2
        case "waitlisted": return 1
        default: return 0
        }
    }
}

struct PrivateSessionStatusItem: Identifiable, Codable, Hashable {
    let id: UUID
    let status: String
    let requested_session_type: String
    let preferred_day: String?
    let preferred_time: String?
    let training_goal: String?
    let created_at: Date

    var displayStatus: String {
        switch status {
        case "requested": return "Awaiting review"
        case "approved": return "Approved"
        case "reschedule_requested": return "Scheduling follow-up"
        case "declined": return "Declined"
        case "completed": return "Completed"
        case "cancelled": return "Cancelled"
        default: return status.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

enum BookingTimelineSection: Equatable {
    case pending
    case upcoming
    case history
}

struct BookingTimeline: Equatable {
    let pending: [BookingItem]
    let upcoming: [BookingItem]
    let history: [BookingItem]

    init(bookings: [BookingItem], now: Date = Date()) {
        var pending: [BookingItem] = []
        var upcoming: [BookingItem] = []
        var history: [BookingItem] = []

        for booking in bookings {
            switch booking.timelineSection(now: now) {
            case .pending: pending.append(booking)
            case .upcoming: upcoming.append(booking)
            case .history: history.append(booking)
            }
        }

        self.pending = pending
        self.upcoming = upcoming
        self.history = history
    }
}

struct MemberTrainingProgress: Equatable {
    let totalAttended: Int
    let attendedLast30Days: Int
    let activeWeeksLastFour: Int
    let lastAttendedAt: Date?

    init(bookings: [BookingItem], now: Date = Date(), calendar inputCalendar: Calendar? = nil) {
        var calendar = inputCalendar ?? Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone(identifier: "Australia/Brisbane")!
        calendar.firstWeekday = 2
        calendar.minimumDaysInFirstWeek = 4

        var attendanceBySession: [UUID: Date] = [:]
        for booking in bookings where booking.status == "attended" && booking.start_time <= now {
            if let current = attendanceBySession[booking.session_id], current >= booking.start_time { continue }
            attendanceBySession[booking.session_id] = booking.start_time
        }

        let attendedDates = attendanceBySession.values.sorted(by: >)
        let recentCutoff = calendar.date(byAdding: .day, value: -30, to: now) ?? now
        let allowedWeeks = Set((0..<4).compactMap { offset -> Date? in
            guard let date = calendar.date(byAdding: .weekOfYear, value: -offset, to: now) else { return nil }
            return calendar.dateInterval(of: .weekOfYear, for: date)?.start
        })
        let activeWeeks = Set(attendedDates.compactMap {
            calendar.dateInterval(of: .weekOfYear, for: $0)?.start
        })

        totalAttended = attendedDates.count
        attendedLast30Days = attendedDates.filter { $0 >= recentCutoff }.count
        activeWeeksLastFour = activeWeeks.intersection(allowedWeeks).count
        lastAttendedAt = attendedDates.first
    }
}

struct AuthSession: Codable, Hashable {
    let access_token: String
    let refresh_token: String?
    let expires_in: Int?
    let expires_at: Int?
    let token_type: String?
    let user: AuthUser?

    func needsRefresh(
        now: Date = Date(),
        leeway: TimeInterval = 2 * 60
    ) -> Bool {
        guard let expires_at else { return false }
        return TimeInterval(expires_at) <= now.timeIntervalSince1970 + leeway
    }
}

struct AuthUser: Codable, Hashable {
    let id: UUID
    let email: String?
}

struct AuthResponse: Codable {
    let access_token: String?
    let refresh_token: String?
    let expires_in: Int?
    let expires_at: Int?
    let token_type: String?
    let user: AuthUser?

    var session: AuthSession? {
        guard let access_token else { return nil }
        return AuthSession(
            access_token: access_token,
            refresh_token: refresh_token,
            expires_in: expires_in,
            expires_at: expires_at,
            token_type: token_type,
            user: user
        )
    }
}

struct MemberSignUpRequest: Encodable, Equatable {
    struct Metadata: Encodable, Equatable {
        let full_name: String
        let phone: String?
    }

    let email: String
    let password: String
    let data: Metadata

    init(
        fullName: String,
        email: String,
        phone: String,
        password: String,
        confirmation: String,
        acceptedTerms: Bool
    ) throws {
        let normalizedName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedPhone = phone.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalizedName.isEmpty, normalizedName.count <= 100 else {
            throw APIError(message: "Enter your full name (up to 100 characters).")
        }
        guard normalizedEmail.contains("@"), normalizedEmail.contains("."), normalizedEmail.count <= 254 else {
            throw APIError(message: "Enter a valid email address.")
        }
        guard password.count >= 8 else {
            throw APIError(message: "Use at least 8 characters for your password.")
        }
        guard password == confirmation else {
            throw APIError(message: "Passwords do not match.")
        }
        guard acceptedTerms else {
            throw APIError(message: "Agree to the Terms of Use and acknowledge the Privacy Policy to create an account.")
        }

        self.email = normalizedEmail
        self.password = password
        self.data = Metadata(full_name: normalizedName, phone: normalizedPhone.isEmpty ? nil : normalizedPhone)
    }
}

struct PasswordUpdateRequest: Encodable, Equatable {
    let password: String

    init(password: String, confirmation: String) throws {
        guard password.count >= 8 else {
            throw APIError(message: "Use at least 8 characters for your new password.")
        }
        guard password == confirmation else {
            throw APIError(message: "New passwords do not match.")
        }

        self.password = password
    }
}

enum NativeInterestKind: String, Identifiable {
    case member = "member_interest"
    case trainer = "trainer_interest"
    case partner = "partner_interest"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .member: return "Foundation Interest"
        case .trainer: return "Coach Application"
        case .partner: return "Partner Enquiry"
        }
    }
}

struct NativeInterestDraft: Equatable {
    var fullName = ""
    var email = ""
    var phone = ""
    var ageRange = ""
    var suburbTown = ""
    var trainingLevel = ""
    var goals: Set<String> = []
    var preferredTimes: Set<String> = []
    var occupationGroup = ""
    var groupClasses = false
    var personalTraining = false
    var workshops = false
    var eventPrep = false
    var injuries = ""
    var joiningReason = ""
    var mailingList = false
    var qualifications = ""
    var yearsExperience = ""
    var functionalExperience = ""
    var availability: Set<String> = []
    var specialties: Set<String> = []
    var firstAidCPR = false
    var insuranceStatus = ""
    var shortIntro = ""
    var socialLinks = ""
    var businessName = ""
    var profession = ""
    var services: Set<String> = []
    var availabilityText = ""
    var subcontractInterest = false
    var preferredModel = ""
    var websiteSocialLink = ""
    var consentsToContact = false
}

struct MemberInterestSubmission: Encodable, Equatable {
    let full_name: String
    let email: String
    let phone: String
    let age_range: String
    let suburb_town: String
    let current_training_level: String
    let main_training_goals: [String]
    let preferred_training_times: [String]
    let occupation_group: String?
    let interested_in_group_classes: Bool
    let interested_in_pt: Bool
    let interested_in_workshops: Bool
    let interested_in_event_prep: Bool
    let injuries_or_limitations_optional: String?
    let biggest_reason_for_joining: String?
    let consent_to_contact: Bool
    let mailing_list_consent: Bool
    let source = "ios_app"
    let status = "new"

    init(_ draft: NativeInterestDraft) throws {
        let common = try InterestValidation.common(draft)
        guard !draft.ageRange.isEmpty else { throw APIError(message: "Choose your age range.") }
        guard let suburb = InterestValidation.optional(draft.suburbTown) else { throw APIError(message: "Enter your suburb or town.") }
        guard !draft.trainingLevel.isEmpty else { throw APIError(message: "Choose your current training level.") }
        guard !draft.goals.isEmpty else { throw APIError(message: "Select at least one training goal.") }
        guard !draft.preferredTimes.isEmpty else { throw APIError(message: "Select at least one preferred training time.") }
        guard draft.consentsToContact else { throw APIError(message: "Consent to contact is required.") }
        full_name = common.name; email = common.email; phone = common.phone
        age_range = draft.ageRange; suburb_town = suburb; current_training_level = draft.trainingLevel
        main_training_goals = draft.goals.sorted(); preferred_training_times = draft.preferredTimes.sorted()
        occupation_group = InterestValidation.optional(draft.occupationGroup)
        interested_in_group_classes = draft.groupClasses; interested_in_pt = draft.personalTraining
        interested_in_workshops = draft.workshops; interested_in_event_prep = draft.eventPrep
        injuries_or_limitations_optional = InterestValidation.optional(draft.injuries)
        biggest_reason_for_joining = InterestValidation.optional(draft.joiningReason)
        consent_to_contact = true; mailing_list_consent = draft.mailingList
    }
}

struct TrainerInterestSubmission: Encodable, Equatable {
    let full_name: String
    let email: String
    let phone: String
    let qualifications: String
    let years_experience: String
    let functional_training_experience: String
    let availability: [String]
    let specialties: [String]
    let interested_in_group_classes: Bool
    let interested_in_pt: Bool
    let interested_in_workshops: Bool
    let first_aid_cpr: Bool
    let insurance_status: String?
    let short_intro: String?
    let social_links: String?
    let consent_to_contact: Bool
    let source = "ios_app"
    let status = "new"

    init(_ draft: NativeInterestDraft) throws {
        let common = try InterestValidation.common(draft)
        guard let qualifications = InterestValidation.optional(draft.qualifications) else { throw APIError(message: "Enter your qualifications.") }
        guard !draft.yearsExperience.isEmpty else { throw APIError(message: "Choose your years of experience.") }
        guard let functional = InterestValidation.optional(draft.functionalExperience) else { throw APIError(message: "Describe your functional training experience.") }
        guard !draft.availability.isEmpty else { throw APIError(message: "Select at least one availability window.") }
        guard draft.consentsToContact else { throw APIError(message: "Consent to contact is required.") }
        full_name = common.name; email = common.email; phone = common.phone
        self.qualifications = qualifications; years_experience = draft.yearsExperience
        functional_training_experience = functional; availability = draft.availability.sorted()
        specialties = draft.specialties.sorted(); interested_in_group_classes = draft.groupClasses
        interested_in_pt = draft.personalTraining; interested_in_workshops = draft.workshops
        first_aid_cpr = draft.firstAidCPR; insurance_status = InterestValidation.optional(draft.insuranceStatus)
        short_intro = InterestValidation.optional(draft.shortIntro); social_links = InterestValidation.optional(draft.socialLinks)
        consent_to_contact = true
    }
}

struct PartnerInterestSubmission: Encodable, Equatable {
    let full_name: String
    let business_name: String
    let email: String
    let phone: String
    let profession: String
    let services_offered: [String]
    let availability: String?
    let subcontract_interest: Bool
    let workshop_interest: Bool
    let preferred_model: String?
    let website_social_link: String?
    let short_intro: String?
    let consent_to_contact: Bool
    let source = "ios_app"
    let status = "new"

    init(_ draft: NativeInterestDraft) throws {
        let common = try InterestValidation.common(draft)
        guard let business = InterestValidation.optional(draft.businessName) else { throw APIError(message: "Enter your business or practice name.") }
        guard let profession = InterestValidation.optional(draft.profession) else { throw APIError(message: "Enter your profession or specialty.") }
        guard !draft.services.isEmpty else { throw APIError(message: "Select at least one service.") }
        guard draft.consentsToContact else { throw APIError(message: "Consent to contact is required.") }
        full_name = common.name; business_name = business; email = common.email; phone = common.phone
        self.profession = profession; services_offered = draft.services.sorted()
        availability = InterestValidation.optional(draft.availabilityText)
        subcontract_interest = draft.subcontractInterest; workshop_interest = draft.workshops
        preferred_model = InterestValidation.optional(draft.preferredModel)
        website_social_link = InterestValidation.optional(draft.websiteSocialLink)
        short_intro = InterestValidation.optional(draft.shortIntro); consent_to_contact = true
    }
}

private enum InterestValidation {
    static func common(_ draft: NativeInterestDraft) throws -> (name: String, email: String, phone: String) {
        guard let name = optional(draft.fullName), name.count <= 100 else { throw APIError(message: "Enter your full name.") }
        let email = draft.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard email.contains("@"), email.contains("."), email.count <= 254 else { throw APIError(message: "Enter a valid email address.") }
        guard let phone = optional(draft.phone), phone.count <= 40 else { throw APIError(message: "Enter your phone number.") }
        return (name, email, phone)
    }

    static func optional(_ value: String) -> String? {
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : String(clean.prefix(5_000))
    }
}

struct CheckoutResponse: Codable {
    let url: URL
    let checkout_session_id: String
}

struct PrivateSessionRequest: Encodable, Equatable {
    let full_name: String
    let email: String
    let phone: String
    let requested_session_type: String
    let preferred_day: String?
    let preferred_time: String?
    let training_goal: String?
    let experience_level: String?
    let notes: String?
    let consent_to_contact: Bool
    let status: String

    init(
        fullName: String,
        email: String,
        phone: String,
        sessionType: String,
        preferredDay: String = "",
        preferredTime: String = "",
        trainingGoal: String = "",
        experienceLevel: String = "",
        notes: String = ""
    ) throws {
        let normalizedName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedPhone = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedType = sessionType.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedName.isEmpty else { throw APIError(message: "Enter your full name.") }
        guard normalizedEmail.contains("@"), normalizedEmail.contains(".") else {
            throw APIError(message: "Enter a valid email address.")
        }
        guard !normalizedPhone.isEmpty else { throw APIError(message: "Enter your mobile number.") }
        guard !normalizedType.isEmpty else { throw APIError(message: "Choose a session type.") }

        full_name = normalizedName
        self.email = normalizedEmail
        self.phone = normalizedPhone
        requested_session_type = normalizedType
        preferred_day = preferredDay.trimmedNilIfEmpty
        preferred_time = preferredTime.trimmedNilIfEmpty
        training_goal = trainingGoal.trimmedNilIfEmpty
        experience_level = experienceLevel.trimmedNilIfEmpty
        self.notes = notes.trimmedNilIfEmpty
        consent_to_contact = true
        status = "requested"
    }
}

struct ClassInterestRequest: Encodable, Equatable {
    let class_session_id: UUID
    let full_name: String
    let email: String
    let phone: String
    let training_level: String?
    let notes: String?
    let consent_to_contact: Bool
    let status: String

    init(
        sessionID: UUID,
        fullName: String,
        email: String,
        phone: String,
        trainingLevel: String = "",
        notes: String = ""
    ) throws {
        let normalizedName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedPhone = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedName.isEmpty else { throw APIError(message: "Enter your full name.") }
        guard normalizedEmail.contains("@"), normalizedEmail.contains(".") else {
            throw APIError(message: "Enter a valid email address.")
        }
        guard !normalizedPhone.isEmpty else { throw APIError(message: "Enter your mobile number.") }

        class_session_id = sessionID
        full_name = normalizedName
        self.email = normalizedEmail
        self.phone = normalizedPhone
        training_level = trainingLevel.trimmedNilIfEmpty
        self.notes = notes.trimmedNilIfEmpty
        consent_to_contact = true
        status = "requested"
    }
}

private extension String {
    var trimmedNilIfEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
