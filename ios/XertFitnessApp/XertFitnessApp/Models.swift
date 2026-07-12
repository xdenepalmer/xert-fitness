import Foundation

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
}

struct CreditBatch: Identifiable, Codable, Hashable {
    let id: UUID
    let total: Int
    let remaining: Int
    let expires_at: Date?
}

struct MemberProfile: Identifiable, Codable, Hashable {
    let id: UUID
    let full_name: String?
    let phone: String?
    let email: String?
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
}

struct AuthSession: Codable, Hashable {
    let access_token: String
    let refresh_token: String?
    let expires_in: Int?
    let expires_at: Int?
    let token_type: String?
    let user: AuthUser?
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

struct CheckoutResponse: Codable {
    let url: URL
}
