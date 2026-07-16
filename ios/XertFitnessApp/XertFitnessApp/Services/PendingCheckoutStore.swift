import Foundation

struct PendingCheckout: Codable, Equatable {
    let userID: UUID
    let baselineOrderIDs: Set<UUID>
    let startedAt: Date
}

enum PendingCheckoutStore {
    static let storageKey = "xert.checkout.pending"
    static let maximumAge: TimeInterval = 24 * 60 * 60

    static func save(
        _ checkout: PendingCheckout,
        defaults: UserDefaults = .standard
    ) {
        guard let data = try? JSONEncoder().encode(checkout) else { return }
        defaults.set(data, forKey: storageKey)
    }

    static func load(
        for userID: UUID,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) -> PendingCheckout? {
        guard
            let data = defaults.data(forKey: storageKey),
            let checkout = try? JSONDecoder().decode(PendingCheckout.self, from: data),
            checkout.userID == userID,
            checkout.startedAt <= now,
            now.timeIntervalSince(checkout.startedAt) <= maximumAge
        else {
            clear(defaults: defaults)
            return nil
        }
        return checkout
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: storageKey)
    }
}
