import Foundation

struct PublicDataSnapshot: Codable, Equatable {
    static let currentSchemaVersion = 2

    let schemaVersion: Int
    let savedAt: Date
    let products: [Product]
    let sessions: [ClassSession]
    let events: [EventItem]
    let coaches: [AdminCoach]
    let siteContent: [AdminSiteContentRow]

    init(
        savedAt: Date = Date(),
        products: [Product],
        sessions: [ClassSession],
        events: [EventItem],
        coaches: [AdminCoach] = [],
        siteContent: [AdminSiteContentRow] = []
    ) {
        schemaVersion = Self.currentSchemaVersion
        self.savedAt = savedAt
        self.products = products
        self.sessions = sessions
        self.events = events
        self.coaches = coaches
        self.siteContent = siteContent
    }
}

enum PublicDataCache {
    private static let key = "xert.public-data.v1"
    static let maximumAge: TimeInterval = 30 * 24 * 60 * 60

    static func load(
        defaults: UserDefaults = .standard,
        now: Date = Date()
    ) -> PublicDataSnapshot? {
        guard
            let data = defaults.data(forKey: key),
            let snapshot = try? JSONDecoder().decode(PublicDataSnapshot.self, from: data),
            snapshot.schemaVersion == PublicDataSnapshot.currentSchemaVersion,
            snapshot.savedAt <= now,
            now.timeIntervalSince(snapshot.savedAt) <= maximumAge
        else {
            return nil
        }
        return snapshot
    }

    static func save(
        _ snapshot: PublicDataSnapshot,
        defaults: UserDefaults = .standard
    ) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)
    }

    /// JSON coding and UserDefaults persistence scale with the published class
    /// and event catalogues, so live app callers keep that work off MainActor.
    static func loadAsync(now: Date = Date()) async -> PublicDataSnapshot? {
        await Task.detached(priority: .utility) {
            load(now: now)
        }.value
    }

    static func saveAsync(_ snapshot: PublicDataSnapshot) async {
        await Task.detached(priority: .utility) {
            save(snapshot)
        }.value
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key)
    }
}
