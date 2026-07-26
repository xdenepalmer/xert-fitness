import Foundation

struct AdminAttendanceDraftSnapshot: Codable, Equatable {
    let ownerID: UUID
    let sessionID: UUID
    let marks: [UUID: AdminAttendanceMark]
    let baselineMarks: [UUID: AdminAttendanceMark]
    let savedAt: Date
}

enum AdminAttendanceDraftStore {
    static let maximumAge: TimeInterval = 12 * 60 * 60
    private static let keyPrefix = "xert.admin.attendance-draft."

    static func load(
        ownerID: UUID?,
        sessionID: UUID,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) -> AdminAttendanceDraftSnapshot? {
        guard let ownerID else { return nil }
        let key = key(ownerID: ownerID, sessionID: sessionID)
        guard let data = defaults.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(AdminAttendanceDraftSnapshot.self, from: data),
              snapshot.ownerID == ownerID,
              snapshot.sessionID == sessionID,
              !snapshot.marks.isEmpty,
              snapshot.marks.count <= 250,
              snapshot.baselineMarks.count <= 250,
              snapshot.savedAt <= now.addingTimeInterval(5 * 60),
              now.timeIntervalSince(snapshot.savedAt) <= maximumAge else {
            defaults.removeObject(forKey: key)
            return nil
        }
        return snapshot
    }

    static func save(
        _ draft: AdminAttendanceDraft,
        baseline: AdminAttendanceDraft,
        ownerID: UUID?,
        sessionID: UUID,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) {
        guard let ownerID else { return }
        let marks = draft.persistedMarks
        guard !marks.isEmpty else {
            clear(ownerID: ownerID, sessionID: sessionID, defaults: defaults)
            return
        }
        let snapshot = AdminAttendanceDraftSnapshot(
            ownerID: ownerID,
            sessionID: sessionID,
            marks: marks,
            baselineMarks: baseline.persistedMarks,
            savedAt: now
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key(ownerID: ownerID, sessionID: sessionID))
    }

    static func clear(
        ownerID: UUID?,
        sessionID: UUID,
        defaults: UserDefaults = .standard
    ) {
        guard let ownerID else { return }
        defaults.removeObject(forKey: key(ownerID: ownerID, sessionID: sessionID))
    }

    static func clearAll(ownerID: UUID, defaults: UserDefaults = .standard) {
        let ownerPrefix = "\(keyPrefix)\(ownerID.uuidString.lowercased())."
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(ownerPrefix) {
            defaults.removeObject(forKey: key)
        }
    }

    private static func key(ownerID: UUID, sessionID: UUID) -> String {
        "\(keyPrefix)\(ownerID.uuidString.lowercased()).\(sessionID.uuidString.lowercased())"
    }
}
