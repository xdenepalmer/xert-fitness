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

struct CheckoutResponse: Codable {
    let url: URL
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
        email = normalizedEmail
        phone = normalizedPhone
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

private extension String {
    var trimmedNilIfEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
