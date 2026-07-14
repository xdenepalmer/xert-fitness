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
