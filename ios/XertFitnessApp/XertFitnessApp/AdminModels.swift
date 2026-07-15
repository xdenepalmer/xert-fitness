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

struct AdminMemberNote: Identifiable, Codable, Hashable {
    let id: UUID
    let user_id: UUID
    let author_id: UUID?
    let author_name: String?
    let category: String
    let body: String
    let created_at: Date
    let archived_at: Date?
    let archived_by: UUID?
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
    var payments_enabled: Bool
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

enum AdminLeadPipeline: String, CaseIterable, Identifiable, Codable, Hashable {
    case members = "member_interest"
    case trainers = "trainer_interest"
    case partners = "partner_interest"

    var id: String { rawValue }
    var shortLabel: String {
        switch self {
        case .members: return "Members"
        case .trainers: return "Trainers"
        case .partners: return "Partners"
        }
    }
    var title: String {
        switch self {
        case .members: return "Member leads"
        case .trainers: return "Trainer applicants"
        case .partners: return "Partner enquiries"
        }
    }
    var statuses: [String] {
        switch self {
        case .members:
            return ["new", "contacted", "warm", "hot", "foundation_offer_sent", "booked_trial", "joined", "not_suitable", "archived"]
        case .trainers:
            return ["new", "reviewing", "contacted", "interview", "shortlisted", "not_suitable", "hired", "archived"]
        case .partners:
            return ["new", "reviewing", "contacted", "meeting", "approved", "not_suitable", "archived"]
        }
    }
}

struct AdminLeadIdentifier: Codable, Hashable {
    let value: String

    init(_ value: String) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self.value = value
        } else if let value = try? container.decode(Int64.self) {
            self.value = String(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Lead ID must be text or an integer.")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

struct AdminLead: Identifiable, Codable, Hashable {
    let id: AdminLeadIdentifier
    let full_name: String?
    let email: String?
    let phone: String?
    let status: String?
    let admin_notes: String?
    let created_at: Date
    let suburb_town: String?
    let current_training_level: String?
    let main_training_goals: [String]?
    let preferred_training_times: [String]?
    let qualifications: String?
    let years_experience: String?
    let functional_training_experience: String?
    let specialties: [String]?
    let profession: String?
    let business_name: String?
    let services_offered: [String]?
    let short_intro: String?
    let website_social_link: String?
    let utm_source: String?
    let utm_medium: String?
    let utm_campaign: String?

    var displayName: String { full_name?.nilIfBlank ?? email?.nilIfBlank ?? "XERT lead" }
    var effectiveStatus: String { status?.nilIfBlank ?? "new" }
    var searchableText: String {
        [full_name, email, phone, business_name, qualifications, profession, utm_source]
            .compactMap { $0 }.joined(separator: " ").lowercased()
    }
}

struct AdminCampaignAttributionRow: Identifiable, Codable, Hashable {
    let id: AdminLeadIdentifier
    let utm_source: String?
    let utm_medium: String?
    let utm_campaign: String?
    let source: String?
    let created_at: Date
}

enum AdminCampaignRange: String, CaseIterable, Identifiable {
    case thirty = "30"
    case ninety = "90"
    case all

    var id: String { rawValue }
    var label: String {
        switch self {
        case .thirty: return "30 days"
        case .ninety: return "90 days"
        case .all: return "All time"
        }
    }
    var dayCount: Int? { self == .all ? nil : Int(rawValue) }
}

struct AdminCampaignBreakdown: Identifiable, Hashable {
    let label: String
    let count: Int
    var id: String { label.lowercased() }
}

struct AdminCampaignDailyCount: Identifiable, Hashable {
    let dateKey: String
    let count: Int
    var id: String { dateKey }
}

struct AdminCampaignSummary {
    let rows: [AdminCampaignAttributionRow]
    let attributed: Int
    let sources: [AdminCampaignBreakdown]
    let mediums: [AdminCampaignBreakdown]
    let campaigns: [AdminCampaignBreakdown]
    let dailySignups: [AdminCampaignDailyCount]

    var total: Int { rows.count }
    var direct: Int { total - attributed }
    var attributionRate: Double { total == 0 ? 0 : Double(attributed) / Double(total) }

    init(rows allRows: [AdminCampaignAttributionRow], range: AdminCampaignRange, now: Date = Date()) {
        let calendar = EventItem.calendar
        let validRows = allRows.filter { Self.dateKey($0.created_at, calendar: calendar) != nil }
        let filteredRows: [AdminCampaignAttributionRow]
        if let days = range.dayCount,
           let cutoff = calendar.date(byAdding: .day, value: -(days - 1), to: calendar.startOfDay(for: now)) {
            filteredRows = validRows.filter { $0.created_at >= cutoff }
        } else {
            filteredRows = validRows
        }
        rows = filteredRows

        attributed = filteredRows.filter {
            Self.clean($0.utm_source) != nil || Self.clean($0.utm_medium) != nil || Self.clean($0.utm_campaign) != nil
        }.count
        sources = Self.breakdown(rows: filteredRows, fallback: "Direct / unknown") {
            Self.clean($0.utm_source) ?? Self.clean($0.source)
        }
        mediums = Self.breakdown(rows: filteredRows, fallback: "Unspecified") { Self.clean($0.utm_medium) }
        campaigns = Self.breakdown(rows: filteredRows) { Self.clean($0.utm_campaign) }

        let today = calendar.startOfDay(for: now)
        dailySignups = (0..<30).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: offset - 29, to: today),
                  let key = Self.dateKey(day, calendar: calendar),
                  let nextDay = calendar.date(byAdding: .day, value: 1, to: day) else { return nil }
            return AdminCampaignDailyCount(
                dateKey: key,
                count: filteredRows.filter { $0.created_at >= day && $0.created_at < nextDay }.count
            )
        }
    }

    var csv: String {
        let header = "Created,Brisbane Date,Attributed Source,UTM Medium,UTM Campaign,Recorded Form Source"
        let body = rows.sorted { $0.created_at > $1.created_at }.map { row in
            [
                ISO8601DateFormatter().string(from: row.created_at),
                Self.dateKey(row.created_at, calendar: EventItem.calendar) ?? "",
                Self.clean(row.utm_source) ?? Self.clean(row.source) ?? "Direct / unknown",
                Self.clean(row.utm_medium) ?? "",
                Self.clean(row.utm_campaign) ?? "",
                Self.clean(row.source) ?? ""
            ].map(Self.csvField).joined(separator: ",")
        }
        return ([header] + body).joined(separator: "\n")
    }

    private static func breakdown(
        rows: [AdminCampaignAttributionRow],
        fallback: String? = nil,
        label: (AdminCampaignAttributionRow) -> String?
    ) -> [AdminCampaignBreakdown] {
        var counts: [String: (label: String, count: Int)] = [:]
        for row in rows {
            guard let resolved = label(row) ?? fallback else { continue }
            let key = resolved.lowercased()
            let current = counts[key] ?? (resolved, 0)
            counts[key] = (current.label, current.count + 1)
        }
        return counts.values
            .map { AdminCampaignBreakdown(label: $0.label, count: $0.count) }
            .sorted { $0.count != $1.count ? $0.count > $1.count : $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    private static func clean(_ value: String?) -> String? {
        let cleaned = value?.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ") ?? ""
        return cleaned.isEmpty ? nil : cleaned
    }

    private static func dateKey(_ date: Date, calendar: Calendar) -> String? {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        guard let year = parts.year, let month = parts.month, let day = parts.day else { return nil }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    private static func csvField(_ value: String) -> String {
        let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
        return escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n") ? "\"\(escaped)\"" : escaped
    }
}

enum AdminSiteContentSection: String, CaseIterable, Identifiable, Codable {
    case hero
    case booking
    case about
    case contact
    case faq

    var id: String { rawValue }
    var title: String {
        switch self {
        case .hero: return "Homepage Hero"
        case .booking: return "Booking Page Intro"
        case .about: return "About Page"
        case .contact: return "Contact Details"
        case .faq: return "FAQ"
        }
    }
    var summary: String {
        switch self {
        case .hero: return "Headline, supporting copy and rotating photography"
        case .booking: return "Opening copy above packs and bookings"
        case .about: return "The public story and training philosophy"
        case .contact: return "Public contact details, location and Instagram"
        case .faq: return "Homepage questions and answers"
        }
    }
    var icon: String {
        switch self {
        case .hero: return "house"
        case .booking: return "ticket"
        case .about: return "doc.text"
        case .contact: return "phone"
        case .faq: return "questionmark.circle"
        }
    }
    var publicPath: String {
        switch self {
        case .hero, .faq: return ""
        case .booking: return "booking"
        case .about: return "about"
        case .contact: return "contact"
        }
    }
}

struct AdminFAQItem: Codable, Hashable, Identifiable {
    var id = UUID()
    var q: String
    var a: String

    private enum CodingKeys: String, CodingKey { case q, a }

    init(id: UUID = UUID(), q: String, a: String) {
        self.id = id
        self.q = q
        self.a = a
    }

    static func == (lhs: AdminFAQItem, rhs: AdminFAQItem) -> Bool {
        lhs.q == rhs.q && lhs.a == rhs.a
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(q)
        hasher.combine(a)
    }
}

struct AdminSiteContentData: Codable, Hashable {
    var headline: String?
    var subheading: String?
    var supporting: String?
    var photos: [String]?
    var intro: String?
    var paragraphs: [String]?
    var email: String?
    var phone: String?
    var address: String?
    var instagram_handle: String?
    var instagram_url: String?
    var items: [AdminFAQItem]?

    init(
        headline: String? = nil,
        subheading: String? = nil,
        supporting: String? = nil,
        photos: [String]? = nil,
        intro: String? = nil,
        paragraphs: [String]? = nil,
        email: String? = nil,
        phone: String? = nil,
        address: String? = nil,
        instagram_handle: String? = nil,
        instagram_url: String? = nil,
        items: [AdminFAQItem]? = nil
    ) {
        self.headline = headline
        self.subheading = subheading
        self.supporting = supporting
        self.photos = photos
        self.intro = intro
        self.paragraphs = paragraphs
        self.email = email
        self.phone = phone
        self.address = address
        self.instagram_handle = instagram_handle
        self.instagram_url = instagram_url
        self.items = items
    }

    func merged(over fallback: AdminSiteContentData) -> AdminSiteContentData {
        AdminSiteContentData(
            headline: headline ?? fallback.headline,
            subheading: subheading ?? fallback.subheading,
            supporting: supporting ?? fallback.supporting,
            photos: photos ?? fallback.photos,
            intro: intro ?? fallback.intro,
            paragraphs: paragraphs ?? fallback.paragraphs,
            email: email ?? fallback.email,
            phone: phone ?? fallback.phone,
            address: address ?? fallback.address,
            instagram_handle: instagram_handle ?? fallback.instagram_handle,
            instagram_url: instagram_url ?? fallback.instagram_url,
            items: items ?? fallback.items
        )
    }

    func normalized(for section: AdminSiteContentSection) throws -> AdminSiteContentData {
        switch section {
        case .hero:
            return AdminSiteContentData(
                headline: Self.clean(headline),
                subheading: Self.clean(subheading),
                supporting: Self.clean(supporting),
                photos: try Self.cleanURLs(photos, allowLocal: true)
            )
        case .booking:
            return AdminSiteContentData(intro: Self.clean(intro))
        case .about:
            let values = paragraphs?.compactMap { Self.clean($0) }
            return AdminSiteContentData(paragraphs: values?.isEmpty == false ? values : nil)
        case .contact:
            let cleanEmail = Self.clean(email)
            if let cleanEmail,
               cleanEmail.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) == nil {
                throw APIError(message: "Enter a valid public contact email.")
            }
            let instagramURL = try Self.cleanURLs(instagram_url.map { [$0] }, allowLocal: false)?.first
            return AdminSiteContentData(
                intro: Self.clean(intro),
                email: cleanEmail,
                phone: Self.clean(phone),
                address: Self.clean(address),
                instagram_handle: Self.clean(instagram_handle),
                instagram_url: instagramURL
            )
        case .faq:
            let entered = (items ?? []).compactMap { item -> AdminFAQItem? in
                let question = Self.clean(item.q)
                let answer = Self.clean(item.a)
                return question == nil && answer == nil ? nil : AdminFAQItem(id: item.id, q: question ?? "", a: answer ?? "")
            }
            guard entered.allSatisfy({ !$0.q.isEmpty && !$0.a.isEmpty }) else {
                throw APIError(message: "Every FAQ item needs both a question and an answer.")
            }
            return AdminSiteContentData(items: entered.isEmpty ? nil : entered)
        }
    }

    static func defaults(for section: AdminSiteContentSection) -> AdminSiteContentData {
        switch section {
        case .hero:
            return AdminSiteContentData(
                headline: "Beat Your Best.",
                subheading: "Structured functional fitness coaching designed for strength, conditioning, movement quality and long-term performance.",
                supporting: "Semi-private training in Kingaroy with real coaching, progressive programming and sustainable progress.",
                photos: [
                    "/assets/hero-training-1.jpg", "/assets/hero-training-2.jpg", "/assets/training-style.jpg",
                    "/assets/training-philosophy.jpg", "/assets/event-calendar.jpg"
                ]
            )
        case .booking:
            return AdminSiteContentData(intro: "XERT operates through a booking-based system to maintain coaching quality and controlled class sizes. Initial class sizes are set to 8 people and will gradually increase as the business launches.")
        case .about:
            return AdminSiteContentData(paragraphs: [
                "XERT Fitness is a semi-private functional fitness studio based in Kingaroy, Queensland. We exist to help everyday people through to athletes train with structure and purpose. Every class at XERT is coached and deliberately programmed, blending strength, conditioning, movement quality and long-term performance.",
                "Our programming follows the South East Queensland sporting and fitness calendar, so members always have a real goal ahead of them. Whether you are training for general fitness, preparing for a specific event, or chasing a strength milestone, your coach leads every session and helps you understand what the goal in front of you requires.",
                "The training system combines structured functional fitness classes, an accessory training area, and support for health, performance, recovery and nutrition. Sessions are scalable, booking-based and designed to maintain coaching quality while helping members train consistently.",
                "XERT is built around a simple philosophy: train for life, compete for fun. Members choose events, train together and build toward shared goals throughout the year."
            ])
        case .contact:
            return AdminSiteContentData(
                intro: "Have a question about classes, coaching, allied health partnerships or booking your first session? Reach out and we will help you plan your training.",
                email: "byronhawley@gmail.com", phone: "", address: "Kingaroy, Queensland 4610",
                instagram_handle: "@xert_fit", instagram_url: "https://instagram.com/xert_fit"
            )
        case .faq:
            return AdminSiteContentData(items: [
                AdminFAQItem(q: "When is XERT opening?", a: "Soft launch is planned for August. We'll open in stages — limited class capacity at first, building out as demand and space allow. Register your foundation interest to be notified first."),
                AdminFAQItem(q: "What classes will be available?", a: "XERT offers structured functional training across strength, aerobic capacity, threshold and intensive sessions. Classes follow progressive training blocks and are coached so members understand the purpose of each session."),
                AdminFAQItem(q: "Do I need to be fit to join?", a: "No. XERT is built for all levels — from complete beginners to experienced athletes. Coaches scale every session to the individual. The most important thing is showing up and committing to the process."),
                AdminFAQItem(q: "What is the event prep focus?", a: "XERT follows the South East Queensland sporting and fitness calendar. Members can choose from endurance races, triathlons, trail runs, functional fitness events, local sport and XERT challenges, then train toward those goals together."),
                AdminFAQItem(q: "Is there personal training available?", a: "Yes. 1-on-1 personal training sessions will be available in addition to group classes. You can request a PT session through the timetable page."),
                AdminFAQItem(q: "What allied health services will be available?", a: "XERT is building relationships with physiotherapists, nutritionists, psychologists and other practitioners who will operate inside the facility. This means recovery, injury management and performance support are available without leaving the building."),
                AdminFAQItem(q: "Where is XERT located?", a: "XERT is based in Kingaroy, Queensland 4610. The facility includes a main class training area, accessory training space, onsite parking, bathroom and changeroom access."),
                AdminFAQItem(q: "How do I book my first session?", a: "Create a free account, purchase a class pass or pack on the booking page, then pick your class from the timetable. Your first session is coached end-to-end — arrive 10 minutes early and we will look after the rest.")
            ])
        }
    }

    private static func clean(_ value: String?) -> String? {
        let cleaned = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return cleaned.isEmpty ? nil : cleaned
    }

    private static func cleanURLs(_ values: [String]?, allowLocal: Bool) throws -> [String]? {
        var result: [String] = []
        for value in values ?? [] {
            guard let cleaned = clean(value) else { continue }
            if allowLocal, cleaned.hasPrefix("/"), !cleaned.hasPrefix("//") {
                result.append(cleaned)
                continue
            }
            guard let components = URLComponents(string: cleaned),
                  ["http", "https"].contains(components.scheme?.lowercased() ?? ""),
                  components.host != nil else {
                throw APIError(message: "URL must use HTTPS or HTTP: \(cleaned)")
            }
            result.append(components.url?.absoluteString ?? cleaned)
        }
        return result.isEmpty ? nil : result
    }
}

struct AdminSiteContentRow: Identifiable, Codable, Hashable {
    let key: String
    let data: AdminSiteContentData
    let updated_at: String
    var id: String { key }
}

enum AdminSiteContentDraftStore {
    private static let prefix = "xert.admin.site-content.draft."

    static func load(_ section: AdminSiteContentSection, defaults: UserDefaults = .standard) -> AdminSiteContentData? {
        defaults.data(forKey: prefix + section.rawValue).flatMap { try? JSONDecoder().decode(AdminSiteContentData.self, from: $0) }
    }

    static func save(_ data: AdminSiteContentData, section: AdminSiteContentSection, defaults: UserDefaults = .standard) {
        if let encoded = try? JSONEncoder().encode(data) { defaults.set(encoded, forKey: prefix + section.rawValue) }
    }

    static func clear(_ section: AdminSiteContentSection, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: prefix + section.rawValue)
    }
}

struct AdminBookingSession: Codable, Hashable {
    let title: String
    let start_time: Date?
    let coach_name: String?
    let location_zone: String?
}

struct AdminLegacyBookingRequest: Codable, Hashable {
    let id: AdminLeadIdentifier
    let full_name: String?
    let email: String?
    let phone: String?
    let status: String
    let admin_notes: String?
    let created_at: Date
    let class_sessions: AdminBookingSession?
}

struct AdminMemberBookingRequest: Codable, Hashable {
    let id: UUID
    let user_id: UUID
    let status: String
    let created_at: Date
    let credit_batch_id: UUID?
    let class_sessions: AdminBookingSession?
}

struct AdminBookingProfile: Identifiable, Codable, Hashable {
    let id: UUID
    let full_name: String?
    let email: String?
    let phone: String?
}

enum AdminBookingRequestSource: String, CaseIterable, Identifiable, Hashable {
    case member
    case enquiry
    var id: String { rawValue }
    var label: String { self == .member ? "Member credit" : "Enquiry form" }
}

struct AdminBookingRequest: Identifiable, Hashable {
    let source: AdminBookingRequestSource
    let recordID: String
    let memberBookingID: UUID?
    let fullName: String
    let email: String?
    let phone: String?
    let status: String
    let adminNotes: String?
    let createdAt: Date
    let creditBatchID: UUID?
    let session: AdminBookingSession?

    var id: String { "\(source.rawValue):\(recordID)" }
    var searchableText: String {
        [fullName, email, phone, session?.title, session?.coach_name, session?.location_zone]
            .compactMap { $0 }.joined(separator: " ").lowercased()
    }
    var allowedNextStatuses: [String] {
        switch status {
        case "requested": return ["confirmed", "waitlisted", "declined"]
        case "waitlisted": return ["cancelled"]
        case "confirmed": return ["attended", "no_show", "cancelled"]
        default: return []
        }
    }
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
    struct Issue: Codable, Hashable {
        let slug: String
        let reason: String
    }

    struct Webhook: Codable, Hashable {
        let ready: Bool
        let missing_events: [String]
        let issue: String?
    }

    struct StripeAccount: Codable, Hashable {
        let ready: Bool
        let charges_enabled: Bool?
        let payouts_enabled: Bool?
        let details_submitted: Bool?
        let country: String?
        let default_currency: String?
    }

    let ready: Bool
    let active_product_count: Int
    let stripe_price_count: Int
    let dynamic_price_count: Int
    let environment: AdminEnvironmentHealth
    let fulfillment_ready: Bool?
    let mode: String?
    let account: StripeAccount?
    let webhook: Webhook?
    let issues: [Issue]?
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
        "checkout_reconciliation", "stripe_payment_fulfillment", "member_announcements", "announcement_receipts",
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
    var hasStableStripePriceID: Bool {
        guard let stripePriceID = stripe_price_id?.trimmingCharacters(in: .whitespacesAndNewlines) else { return false }
        return stripePriceID.range(of: #"^price_[A-Za-z0-9]+$"#, options: .regularExpression) != nil
    }
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
