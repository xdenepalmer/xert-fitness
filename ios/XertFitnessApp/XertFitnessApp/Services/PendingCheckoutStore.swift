import Foundation

struct PendingCheckout: Codable, Equatable {
    let userID: UUID
    let baselineOrderIDs: Set<UUID>
    let startedAt: Date
    let checkoutSessionID: String?
    let activationSessionID: UUID?

    init(
        userID: UUID,
        baselineOrderIDs: Set<UUID>,
        startedAt: Date,
        checkoutSessionID: String? = nil,
        activationSessionID: UUID? = nil
    ) {
        self.userID = userID
        self.baselineOrderIDs = baselineOrderIDs
        self.startedAt = startedAt
        self.checkoutSessionID = checkoutSessionID
        self.activationSessionID = activationSessionID
    }
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

    static func resolve(
        for userID: UUID,
        callbackSessionID: String?,
        baselineOrderIDs: Set<UUID> = [],
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) -> PendingCheckout? {
        // Never manufacture a pending checkout from an inbound URL. Only a
        // locally issued /api/checkout response may create one via save().
        guard let stored = load(for: userID, now: now, defaults: defaults) else {
            return nil
        }
        guard let callbackSessionID else { return stored }
        guard let normalizedCallback = CheckoutSessionIdentity.normalize(callbackSessionID) else {
            return nil
        }
        if let storedSessionID = stored.checkoutSessionID {
            return storedSessionID == normalizedCallback ? stored : nil
        }
        // Legacy pending rows without a session id still reconcile against
        // order/credit settlement; the callback id is ignored for creation.
        _ = baselineOrderIDs
        return stored
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: storageKey)
    }
}
