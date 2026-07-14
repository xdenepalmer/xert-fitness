import Foundation

struct AdminMemberSummary: Identifiable, Codable, Hashable {
    let id: UUID
    let full_name: String?
    let email: String?
    let phone: String?
    let role: String
    let joined_at: Date
    let credits_remaining: Int
    let bookings_count: Int
    let orders_count: Int
    let total_spent_cents: Int
    let total_count: Int

    var displayName: String { full_name?.nilIfBlank ?? email?.nilIfBlank ?? "XERT member" }
    var totalSpent: String { (Double(total_spent_cents) / 100).formatted(.currency(code: "AUD")) }
}

struct AdminDailyOperation: Identifiable, Codable, Hashable {
    var id: UUID { session_id }
    let session_id: UUID
    let title: String
    let class_type: String?
    let start_time: Date
    let end_time: Date?
    let status: String
    let capacity: Int?
    let coach_name: String?
    let location_zone: String?
    let booking_mode: String?
    let requested_count: Int
    let confirmed_count: Int
    let waitlist_count: Int
    let attended_count: Int
    let no_show_count: Int
    let public_request_count: Int
    let attendance_due: Bool

    var activeCount: Int { requested_count + confirmed_count }
}

struct AdminRosterMember: Identifiable, Codable, Hashable {
    var id: UUID { booking_id }
    let booking_id: UUID
    let member_id: UUID
    let full_name: String?
    let email: String?
    let phone: String?
    let status: String
    let booked_at: Date

    var displayName: String { full_name?.nilIfBlank ?? email?.nilIfBlank ?? "XERT member" }
    var attendanceEligible: Bool { ["confirmed", "attended", "no_show"].contains(status) }
}

struct AdminClassSession: Identifiable, Codable, Hashable {
    let id: UUID
    let class_type: String?
    let title: String
    let description: String?
    let coach_name: String?
    let start_time: Date?
    let end_time: Date?
    let duration_minutes: Int?
    let capacity: Int?
    let location_zone: String?
    let beginner_friendly: Bool?
    let intensity_level: String?
    let status: String
    let public_visible: Bool?
    let booking_mode: String?
    let notes: String?
}

struct AdminClassDraft: Equatable {
    static let classTypes = ["XERT Foundation", "XERT Strength", "XERT Engine", "XERT Hybrid", "XERT Event Prep", "XERT Team"]
    static let intensities = ["Low", "Moderate", "High", "Very high"]
    static let bookingModes = ["interest_only", "request_to_book", "instant_book"]

    var classType: String
    var title: String
    var description: String
    var coachName: String
    var startTime: Date
    var hasEndTime: Bool
    var endTime: Date
    var durationMinutes: Int
    var capacity: Int
    var location: String
    var beginnerFriendly: Bool
    var intensity: String
    var status: String
    var publicVisible: Bool
    var bookingMode: String
    var notes: String

    init(classSession: AdminClassSession? = nil, now: Date = Date()) {
        let defaultStart = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now
        classType = classSession?.class_type ?? "XERT Foundation"
        title = classSession?.title ?? ""
        description = classSession?.description ?? ""
        coachName = classSession?.coach_name ?? ""
        startTime = classSession?.start_time ?? defaultStart
        hasEndTime = classSession?.end_time != nil
        endTime = classSession?.end_time ?? defaultStart.addingTimeInterval(3_600)
        durationMinutes = classSession?.duration_minutes ?? 60
        capacity = classSession?.capacity ?? 8
        location = classSession?.location_zone ?? "Main floor"
        beginnerFriendly = classSession?.beginner_friendly ?? false
        intensity = classSession?.intensity_level ?? "Moderate"
        status = classSession?.status ?? "draft"
        publicVisible = classSession?.public_visible ?? false
        bookingMode = classSession?.booking_mode ?? "request_to_book"
        notes = classSession?.notes ?? ""
    }
}

struct AdminAvailabilityBlock: Identifiable, Codable, Hashable {
    let id: UUID
    let start_time: Date
    let end_time: Date
    let type: String
    let coach_name: String?
    let notes: String?
    let is_bookable: Bool
    let updated_at: String
}

struct AdminAvailabilityDraft: Equatable {
    static let types = ["PT available", "private session available", "group class available", "admin only", "open gym placeholder", "workshop placeholder"]
    var startTime: Date
    var endTime: Date
    var type: String
    var coachName: String
    var notes: String
    var isBookable: Bool

    init(block: AdminAvailabilityBlock? = nil, now: Date = Date()) {
        let start = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now
        startTime = block?.start_time ?? start
        endTime = block?.end_time ?? start.addingTimeInterval(3_600)
        type = block?.type ?? "PT available"
        coachName = block?.coach_name ?? ""
        notes = block?.notes ?? ""
        isBookable = block?.is_bookable ?? false
    }
}

struct AdminBlackoutPeriod: Identifiable, Codable, Hashable {
    let id: UUID
    let start_time: Date
    let end_time: Date
    let affects: String
    let reason: String
    let notes: String?
    let updated_at: String
}

struct AdminBlackoutDraft: Equatable {
    static let scopes = ["all", "group_classes", "pt_only", "facility_only", "coach_only"]
    static let reasons = ["full day unavailable", "partial day unavailable", "recurring unavailable", "personal work", "facility maintenance", "equipment install", "private event", "soft launch restricted"]
    var startTime: Date
    var endTime: Date
    var affects: String
    var reason: String
    var notes: String

    init(period: AdminBlackoutPeriod? = nil, now: Date = Date()) {
        let start = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now
        startTime = period?.start_time ?? start
        endTime = period?.end_time ?? start.addingTimeInterval(3_600)
        affects = period?.affects ?? "all"
        reason = period?.reason ?? "facility maintenance"
        notes = period?.notes ?? ""
    }
}

struct AdminWaitlistItem: Identifiable, Codable, Hashable {
    var id: UUID { session_id }
    let session_id: UUID
    let title: String
    let start_time: Date
    let capacity: Int?
    let active_count: Int
    let waitlist_count: Int
    let spots_available: Int?
    let can_promote: Bool
    let next_booking_id: UUID
    let next_member_id: UUID
    let next_full_name: String?
    let next_email: String?
    let next_phone: String?
    let next_booked_at: Date
    let next_available_credits: Int

    var nextMemberName: String { next_full_name?.nilIfBlank ?? next_email?.nilIfBlank ?? "Next member" }
}

struct AdminFollowUp: Identifiable, Codable, Hashable {
    let id: UUID
    let full_name: String?
    let email: String?
    let phone: String?
    let role: String
    let joined_at: Date
    let credits_remaining: Int
    let bookings_count: Int
    let last_attended_at: Date?
    let next_booking_at: Date?
    let last_follow_up_at: Date?
    let reason: String
    let priority: Int
    let credits_expiring: Int
    let next_credit_expiry: Date?

    var displayName: String { full_name?.nilIfBlank ?? email?.nilIfBlank ?? "XERT member" }

    var reasonLabel: String {
        switch reason {
        case "no_first_booking": return "Needs a first booking"
        case "credits_expiring": return "Credits expiring soon"
        case "idle_credits": return "Has unused credits"
        case "renewal_due": return "Ready to renew"
        default: return "Follow up"
        }
    }
}

struct AdminPlatformSettings: Identifiable, Codable, Hashable {
    let id: UUID
    var target_launch_date: String
    var countdown_enabled: Bool
    var bookings_enabled: Bool
    var announcement_banner_text: String?
    var announcement_banner_enabled: Bool
    let updated_at: String

    var announcementText: String {
        get { announcement_banner_text ?? "" }
        set { announcement_banner_text = newValue }
    }
}

struct AdminPTRequest: Identifiable, Codable, Hashable {
    let id: UUID
    let full_name: String?
    let email: String?
    let phone: String?
    let requested_session_type: String
    let preferred_day: String?
    let preferred_time: String?
    let training_goal: String?
    let experience_level: String?
    let notes: String?
    let admin_notes: String?
    let status: String
    let created_at: Date

    var displayName: String { full_name?.nilIfBlank ?? email?.nilIfBlank ?? "PT enquiry" }
    var isPending: Bool { ["requested", "reschedule_requested"].contains(status) }
}

struct AdminAnnouncement: Identifiable, Codable, Hashable {
    let id: UUID
    let title: String
    let body: String
    let tone: String
    let audience: String
    let cta_label: String?
    let cta_url: String?
    let published_at: Date?
    let expires_at: Date?
    let archived_at: Date?
    let created_at: Date
    let updated_at: String

    var stateLabel: String {
        if archived_at != nil { return "Archived" }
        if let expires_at, expires_at <= Date() { return "Expired" }
        return published_at == nil ? "Draft" : "Live"
    }
}

private extension String {
    var nilIfBlank: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

struct AdminSchemaCapability: Codable, Hashable {
    let capability: String
    let installed_at: Date?
}

struct AdminEnvironmentHealth: Codable, Hashable {
    let ready: Bool
    let missing: [String]
}

struct AdminCommerceHealth: Codable, Hashable {
    let ready: Bool
    let active_product_count: Int
    let stripe_price_count: Int
    let dynamic_price_count: Int
    let environment: AdminEnvironmentHealth
}

struct AdminPushHealth: Codable, Hashable {
    struct Subscriptions: Codable, Hashable {
        let production: Int
        let sandbox: Int
        let disabled: Int
    }
    struct Deliveries: Codable, Hashable {
        let delivered: Int
        let failed: Int
        let invalid_token: Int
    }

    let ready: Bool
    let environment: AdminEnvironmentHealth
    let subscriptions: Subscriptions
    let deliveries_24h: Deliveries
}

enum AdminSchemaReadiness {
    static let required: Set<String> = [
        "admin_role_safety", "audited_credit_grants", "booking_waitlist_withdrawal",
        "member_waitlist_join", "waitlist_fifo_promotion", "attendance_roll_call",
        "class_session_update_guard", "product_update_guard", "stripe_refund_reconciliation",
        "checkout_reconciliation", "member_announcements", "announcement_receipts",
        "announcement_actions", "announcement_archival", "booking_time_conflict_guard",
        "admin_member_notes", "schedule_blackout_guard", "database_security_hardening",
        "rls_policy_performance", "request_status_audit", "member_push_notifications",
        "credit_expiry_follow_up", "member_pt_request_tracking", "public_form_integrity",
        "lead_pipeline_audit", "schedule_change_audit", "content_change_audit",
        "booking_lifecycle_audit", "class_cancellation_notifications", "admin_daily_operations",
        "schedule_optimistic_locking", "shared_admin_optimistic_locking",
        "catalog_optimistic_locking", "targeted_member_notices"
    ]

    static func missing(from rows: [AdminSchemaCapability]) -> [String] {
        let installed = Set(rows.map(\.capability))
        return required.subtracting(installed).sorted()
    }
}

struct AdminAuditEntry: Identifiable, Hashable {
    let id: String
    let category: String
    let title: String
    let detail: String
    let createdAt: Date
}

struct AdminProduct: Identifiable, Codable, Hashable {
    let id: UUID
    let slug: String
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
    let updated_at: String

    var displayPrice: String { (Double(price_cents) / 100).formatted(.currency(code: currency.uppercased())) }
}

struct AdminProductDraft: Equatable {
    var name: String
    var description: String
    var price: String
    var currency: String
    var sessions: Int
    var validityDays: Int
    var stripePriceID: String
    var featured: Bool
    var active: Bool
    var sortOrder: Int

    init(product: AdminProduct) {
        name = product.name
        description = product.description ?? ""
        price = String(format: "%.2f", Double(product.price_cents) / 100)
        currency = product.currency.uppercased()
        sessions = product.sessions_count
        validityDays = product.validity_days
        stripePriceID = product.stripe_price_id ?? ""
        featured = product.featured
        active = product.active
        sortOrder = product.sort_order
    }
}

struct AdminEvent: Identifiable, Codable, Hashable {
    let id: UUID
    let name: String
    let category: String?
    let event_date: String?
    let end_date: String?
    let location: String?
    let region: String?
    let url: String?
    let published: Bool
    let sort_order: Int
    let updated_at: String
}

struct AdminEventDraft: Equatable {
    static let categories = [
        "run", "marathon", "triathlon", "ironman", "ultra", "trail", "cycling",
        "fitness", "hyrox", "crossfit", "functional", "swim", "spartan",
        "adventure", "games", "community", "sport", "xert", "other"
    ]

    var name: String
    var category: String
    var hasStartDate: Bool
    var startDate: Date
    var hasEndDate: Bool
    var endDate: Date
    var location: String
    var region: String
    var url: String
    var published: Bool
    var sortOrder: Int

    init(event: AdminEvent? = nil, now: Date = Date()) {
        let fallback = Self.calendar.startOfDay(for: now)
        let parsedStart = event?.event_date.flatMap { Self.dateFormatter.date(from: $0) }
        let parsedEnd = event?.end_date.flatMap { Self.dateFormatter.date(from: $0) }
        name = event?.name ?? ""
        category = event?.category ?? "run"
        hasStartDate = parsedStart != nil
        startDate = parsedStart ?? fallback
        hasEndDate = parsedEnd != nil
        endDate = parsedEnd ?? parsedStart ?? fallback
        location = event?.location ?? ""
        region = event?.region ?? "South East Queensland"
        url = event?.url ?? ""
        published = event?.published ?? true
        sortOrder = event?.sort_order ?? 0
    }

    var startDateValue: String? { hasStartDate ? Self.dateFormatter.string(from: startDate) : nil }
    var endDateValue: String? { hasEndDate ? Self.dateFormatter.string(from: endDate) : nil }

    private static let calendar: Calendar = {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Australia/Brisbane") ?? .current
        return value
    }()

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

struct AdminEventGoalReference: Codable {
    let event_id: UUID
}

struct AdminEventGoalMember: Identifiable, Codable, Hashable {
    let user_id: UUID
    let full_name: String?
    let email: String?
    let phone: String?
    let selected_at: Date

    var id: UUID { user_id }
    var displayName: String { full_name?.nilIfEmpty ?? email?.nilIfEmpty ?? "XERT member" }
}

struct AdminCoach: Identifiable, Codable, Hashable {
    let id: UUID
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
    let updated_at: String
}

struct AdminCoachDraft: Equatable {
    static let categories = ["coach", "nutritionist", "massage", "physio"]
    var name: String
    var role: String
    var bio: String
    var experience: String
    var currentlyTrainingFor: String
    var photoURL: String
    var socialURL: String
    var category: String
    var sortOrder: Int
    var published: Bool

    init(coach: AdminCoach? = nil) {
        name = coach?.name ?? ""
        role = coach?.role ?? ""
        bio = coach?.bio ?? ""
        experience = coach?.experience ?? ""
        currentlyTrainingFor = coach?.currently_training_for ?? ""
        photoURL = coach?.photo_url ?? ""
        socialURL = coach?.social_url ?? ""
        category = coach?.category ?? "coach"
        sortOrder = coach?.sort_order ?? 0
        published = coach?.published ?? true
    }
}
