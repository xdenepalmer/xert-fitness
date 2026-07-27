import Foundation

enum AdminIntakeDraftKind: String, Codable, CaseIterable {
    case bookingRequest
    case lead
    case ptRequest
    case memberStaffNote
}

struct AdminIntakeDraft: Codable, Hashable {
    var status: String?
    var notes: String
}

struct AdminIntakeDraftSnapshot: Codable, Hashable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    let kind: AdminIntakeDraftKind
    let ownerID: UUID
    let recordID: String
    let baselineToken: String
    let draft: AdminIntakeDraft
    let savedAt: Date

    init(
        kind: AdminIntakeDraftKind,
        ownerID: UUID,
        recordID: String,
        baselineToken: String,
        draft: AdminIntakeDraft,
        savedAt: Date
    ) {
        schemaVersion = Self.currentSchemaVersion
        self.kind = kind
        self.ownerID = ownerID
        self.recordID = recordID
        self.baselineToken = baselineToken
        self.draft = draft
        self.savedAt = savedAt
    }
}

enum AdminIntakeDraftStore {
    static let maximumAge: TimeInterval = 8 * 60 * 60
    static let maximumEncodedBytes = 16 * 1_024
    private static let futureTolerance: TimeInterval = 5 * 60
    private static let keyPrefix = "xert.admin.intake-draft."

    static func load(
        kind: AdminIntakeDraftKind,
        ownerID: UUID?,
        recordID: String,
        baselineToken: String,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) -> AdminIntakeDraftSnapshot? {
        guard let ownerID, !recordID.isEmpty else { return nil }
        let storageKey = key(kind: kind, ownerID: ownerID, recordID: recordID)
        guard
            let data = defaults.data(forKey: storageKey),
            data.count <= maximumEncodedBytes,
            let snapshot = try? decoder.decode(AdminIntakeDraftSnapshot.self, from: data),
            snapshot.schemaVersion == AdminIntakeDraftSnapshot.currentSchemaVersion,
            snapshot.kind == kind,
            snapshot.ownerID == ownerID,
            snapshot.recordID == recordID,
            snapshot.baselineToken == baselineToken,
            snapshot.savedAt <= now.addingTimeInterval(futureTolerance),
            now.timeIntervalSince(snapshot.savedAt) <= maximumAge,
            isBounded(snapshot.draft)
        else {
            defaults.removeObject(forKey: storageKey)
            return nil
        }
        return snapshot
    }

    static func save(
        _ draft: AdminIntakeDraft,
        kind: AdminIntakeDraftKind,
        ownerID: UUID?,
        recordID: String,
        baselineToken: String,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) {
        guard let ownerID, !recordID.isEmpty else { return }
        guard isBounded(draft) else {
            clear(kind: kind, ownerID: ownerID, recordID: recordID, defaults: defaults)
            return
        }
        let snapshot = AdminIntakeDraftSnapshot(
            kind: kind,
            ownerID: ownerID,
            recordID: recordID,
            baselineToken: baselineToken,
            draft: draft,
            savedAt: now
        )
        guard
            let data = try? encoder.encode(snapshot),
            data.count <= maximumEncodedBytes
        else {
            clear(kind: kind, ownerID: ownerID, recordID: recordID, defaults: defaults)
            return
        }
        defaults.set(data, forKey: key(kind: kind, ownerID: ownerID, recordID: recordID))
    }

    static func clear(
        kind: AdminIntakeDraftKind,
        ownerID: UUID?,
        recordID: String,
        defaults: UserDefaults = .standard
    ) {
        guard let ownerID, !recordID.isEmpty else { return }
        defaults.removeObject(forKey: key(kind: kind, ownerID: ownerID, recordID: recordID))
    }

    static func clearAll(ownerID: UUID, defaults: UserDefaults = .standard) {
        let ownerFragment = ".\(ownerID.uuidString.lowercased())."
        for storageKey in defaults.dictionaryRepresentation().keys
        where storageKey.hasPrefix(keyPrefix) && storageKey.contains(ownerFragment) {
            defaults.removeObject(forKey: storageKey)
        }
    }

    static func baselineToken(status: String?, notes: String) -> String {
        let baseline = AdminIntakeDraft(status: status, notes: notes)
        return (try? baselineEncoder.encode(baseline).base64EncodedString()) ?? ""
    }

    private static func key(
        kind: AdminIntakeDraftKind,
        ownerID: UUID,
        recordID: String
    ) -> String {
        let encodedRecord = Data(recordID.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
        return "\(keyPrefix)\(kind.rawValue).\(ownerID.uuidString.lowercased()).\(encodedRecord)"
    }

    private static func isBounded(_ draft: AdminIntakeDraft) -> Bool {
        draft.notes.count <= 5_000 && (draft.status?.count ?? 0) <= 64
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private static let baselineEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
}
