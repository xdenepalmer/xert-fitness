import Foundation

struct MemberBookingSnapshot: Codable, Equatable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    let userID: UUID
    let savedAt: Date
    let bookings: [BookingItem]

    init(
        userID: UUID,
        bookings: [BookingItem],
        savedAt: Date = Date(),
        now: Date = Date()
    ) {
        schemaVersion = Self.currentSchemaVersion
        self.userID = userID
        self.savedAt = savedAt
        self.bookings = Array(
            bookings
                .filter { $0.isActiveClassPlace && $0.start_time >= now }
                .sorted { $0.start_time < $1.start_time }
                .prefix(MemberBookingCache.maximumBookings)
        )
    }
}

enum MemberBookingCache {
    static let maximumAge: TimeInterval = 7 * 24 * 60 * 60
    static let maximumBookings = 100
    private static let keyPrefix = "xert.member-bookings.v1."

    static func load(
        for userID: UUID,
        defaults: UserDefaults = .standard,
        now: Date = Date()
    ) -> MemberBookingSnapshot? {
        let key = storageKey(for: userID)
        guard
            let data = defaults.data(forKey: key),
            let stored = try? JSONDecoder().decode(MemberBookingSnapshot.self, from: data),
            stored.schemaVersion == MemberBookingSnapshot.currentSchemaVersion,
            stored.userID == userID,
            stored.savedAt <= now.addingTimeInterval(5 * 60),
            now.timeIntervalSince(stored.savedAt) <= maximumAge
        else {
            defaults.removeObject(forKey: key)
            return nil
        }

        return MemberBookingSnapshot(
            userID: userID,
            bookings: stored.bookings,
            savedAt: stored.savedAt,
            now: now
        )
    }

    static func save(
        _ snapshot: MemberBookingSnapshot,
        defaults: UserDefaults = .standard
    ) {
        guard let data = encode(snapshot) else { return }
        saveEncoded(data, for: snapshot.userID, defaults: defaults)
    }

    static func loadAsync(for userID: UUID, now: Date = Date()) async -> MemberBookingSnapshot? {
        await Task.detached(priority: .utility) {
            load(for: userID, now: now)
        }.value
    }

    static func encodeAsync(_ snapshot: MemberBookingSnapshot) async -> Data? {
        await Task.detached(priority: .utility) {
            encode(snapshot)
        }.value
    }

    static func saveEncoded(
        _ data: Data,
        for userID: UUID,
        defaults: UserDefaults = .standard
    ) {
        defaults.set(data, forKey: storageKey(for: userID))
    }

    static func clear(for userID: UUID, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: storageKey(for: userID))
    }

    private static func storageKey(for userID: UUID) -> String {
        keyPrefix + userID.uuidString.lowercased()
    }

    private static func encode(_ snapshot: MemberBookingSnapshot) -> Data? {
        try? JSONEncoder().encode(snapshot)
    }
}
