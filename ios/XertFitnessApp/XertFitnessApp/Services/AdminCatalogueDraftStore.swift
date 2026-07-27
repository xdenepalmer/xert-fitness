import Foundation

enum AdminCatalogueDraftKind: String, Codable, CaseIterable {
    case classSession = "class"
    case availability
    case blackout
    case product
    case event
    case coach
    case memberNotice
}

struct AdminCatalogueDraftSnapshot<Draft: Codable & Hashable>: Codable, Hashable {
    static var currentSchemaVersion: Int { 1 }

    let schemaVersion: Int
    let kind: AdminCatalogueDraftKind
    let ownerID: UUID
    let recordID: UUID?
    let baselineToken: String?
    let draft: Draft
    let savedAt: Date

    init(
        kind: AdminCatalogueDraftKind,
        ownerID: UUID,
        recordID: UUID?,
        baselineToken: String?,
        draft: Draft,
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

enum AdminCatalogueDraftStore {
    static let maximumAge: TimeInterval = 24 * 60 * 60
    static let maximumEncodedBytes = 64 * 1_024
    private static let futureTolerance: TimeInterval = 5 * 60
    private static let keyPrefix = "xert.admin.catalogue-draft."

    static func load<Draft: Codable & Hashable>(
        kind: AdminCatalogueDraftKind,
        ownerID: UUID?,
        recordID: UUID?,
        baselineToken: String?,
        as _: Draft.Type = Draft.self,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) -> AdminCatalogueDraftSnapshot<Draft>? {
        guard let ownerID else { return nil }
        let storageKey = key(kind: kind, ownerID: ownerID, recordID: recordID)
        guard
            let data = defaults.data(forKey: storageKey),
            data.count <= maximumEncodedBytes,
            let snapshot = try? decoder.decode(AdminCatalogueDraftSnapshot<Draft>.self, from: data),
            snapshot.schemaVersion == AdminCatalogueDraftSnapshot<Draft>.currentSchemaVersion,
            snapshot.kind == kind,
            snapshot.ownerID == ownerID,
            snapshot.recordID == recordID,
            snapshot.baselineToken == baselineToken,
            snapshot.savedAt <= now.addingTimeInterval(futureTolerance),
            now.timeIntervalSince(snapshot.savedAt) <= maximumAge
        else {
            defaults.removeObject(forKey: storageKey)
            return nil
        }
        return snapshot
    }

    static func save<Draft: Codable & Hashable>(
        _ draft: Draft,
        kind: AdminCatalogueDraftKind,
        ownerID: UUID?,
        recordID: UUID?,
        baselineToken: String?,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) {
        guard let ownerID else { return }
        let snapshot = AdminCatalogueDraftSnapshot(
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
        kind: AdminCatalogueDraftKind,
        ownerID: UUID?,
        recordID: UUID?,
        defaults: UserDefaults = .standard
    ) {
        guard let ownerID else { return }
        defaults.removeObject(forKey: key(kind: kind, ownerID: ownerID, recordID: recordID))
    }

    static func clearAll(ownerID: UUID, defaults: UserDefaults = .standard) {
        let ownerFragment = ".\(ownerID.uuidString.lowercased())."
        for storageKey in defaults.dictionaryRepresentation().keys
        where storageKey.hasPrefix(keyPrefix) && storageKey.contains(ownerFragment) {
            defaults.removeObject(forKey: storageKey)
        }
    }

    static func baselineToken<Value: Encodable>(for value: Value?) -> String? {
        guard let value, let data = try? baselineEncoder.encode(value) else { return nil }
        return data.base64EncodedString()
    }

    private static func key(
        kind: AdminCatalogueDraftKind,
        ownerID: UUID,
        recordID: UUID?
    ) -> String {
        let record = recordID?.uuidString.lowercased() ?? "new"
        return "\(keyPrefix)\(kind.rawValue).\(ownerID.uuidString.lowercased()).\(record)"
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
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
}
