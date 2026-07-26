import Foundation

struct AdminAnnouncementDraftSnapshot: Codable, Equatable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    let ownerID: UUID
    let announcementID: UUID?
    let baselineUpdatedAt: String?
    let draft: AdminAnnouncementDraft
    let savedAt: Date

    init(
        ownerID: UUID,
        announcementID: UUID?,
        baselineUpdatedAt: String?,
        draft: AdminAnnouncementDraft,
        savedAt: Date
    ) {
        schemaVersion = Self.currentSchemaVersion
        self.ownerID = ownerID
        self.announcementID = announcementID
        self.baselineUpdatedAt = baselineUpdatedAt
        self.draft = draft
        self.savedAt = savedAt
    }
}

enum AdminAnnouncementDraftStore {
    static let maximumAge: TimeInterval = 12 * 60 * 60
    private static let keyPrefix = "xert.admin.announcement-draft."

    static func load(
        ownerID: UUID?,
        announcementID: UUID?,
        baselineUpdatedAt: String?,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) -> AdminAnnouncementDraftSnapshot? {
        guard let ownerID else { return nil }
        let storageKey = key(ownerID: ownerID, announcementID: announcementID)
        guard
            let data = defaults.data(forKey: storageKey),
            let snapshot = try? JSONDecoder().decode(AdminAnnouncementDraftSnapshot.self, from: data),
            snapshot.schemaVersion == AdminAnnouncementDraftSnapshot.currentSchemaVersion,
            snapshot.ownerID == ownerID,
            snapshot.announcementID == announcementID,
            snapshot.baselineUpdatedAt == baselineUpdatedAt,
            snapshot.savedAt <= now.addingTimeInterval(5 * 60),
            now.timeIntervalSince(snapshot.savedAt) <= maximumAge,
            isBounded(snapshot.draft),
            hasContent(snapshot.draft)
        else {
            defaults.removeObject(forKey: storageKey)
            return nil
        }
        return snapshot
    }

    static func save(
        _ draft: AdminAnnouncementDraft,
        ownerID: UUID?,
        announcementID: UUID?,
        baselineUpdatedAt: String?,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) {
        guard let ownerID else { return }
        guard isBounded(draft), hasContent(draft) else {
            clear(
                ownerID: ownerID,
                announcementID: announcementID,
                defaults: defaults
            )
            return
        }
        let snapshot = AdminAnnouncementDraftSnapshot(
            ownerID: ownerID,
            announcementID: announcementID,
            baselineUpdatedAt: baselineUpdatedAt,
            draft: draft,
            savedAt: now
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key(ownerID: ownerID, announcementID: announcementID))
    }

    static func clear(
        ownerID: UUID?,
        announcementID: UUID?,
        defaults: UserDefaults = .standard
    ) {
        guard let ownerID else { return }
        defaults.removeObject(forKey: key(ownerID: ownerID, announcementID: announcementID))
    }

    static func clearAll(ownerID: UUID, defaults: UserDefaults = .standard) {
        let ownerPrefix = "\(keyPrefix)\(ownerID.uuidString.lowercased())."
        for storageKey in defaults.dictionaryRepresentation().keys
        where storageKey.hasPrefix(ownerPrefix) {
            defaults.removeObject(forKey: storageKey)
        }
    }

    private static func key(ownerID: UUID, announcementID: UUID?) -> String {
        let record = announcementID?.uuidString.lowercased() ?? "new"
        return "\(keyPrefix)\(ownerID.uuidString.lowercased()).\(record)"
    }

    private static func isBounded(_ draft: AdminAnnouncementDraft) -> Bool {
        draft.title.count <= 120
            && draft.body.count <= 2_000
            && draft.ctaLabel.count <= 40
            && draft.ctaURL.count <= 500
            && ["info", "action", "urgent"].contains(draft.tone)
    }

    private static func hasContent(_ draft: AdminAnnouncementDraft) -> Bool {
        !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !draft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !draft.ctaLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !draft.ctaURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || draft.expiresAt != nil
            || draft.tone != "info"
    }
}
