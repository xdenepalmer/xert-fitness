import Foundation

extension Notification.Name {
    static let xertCheckoutCallback = Notification.Name("xert.checkout.callback")
}

enum CheckoutReturnStatus: String, Identifiable {
    case success
    case cancelled

    var id: String { rawValue }

    var title: String {
        self == .success ? "Purchase confirmed" : "Checkout cancelled"
    }

    var message: String {
        switch self {
        case .success:
            return "Your session pack is active and your credit balance has been refreshed."
        case .cancelled:
            return "No payment was taken. You can choose a session pack whenever you are ready."
        }
    }
}

struct CheckoutCallback: Equatable {
    let status: CheckoutReturnStatus
    let checkoutSessionID: String?
}

enum CheckoutSessionIdentity {
    private static let checkoutSessionPattern = #"^cs_(?:test|live)_[A-Za-z0-9]+$"#

    static func normalize(_ value: String?) -> String? {
        guard let value, value.count <= 255, value.range(
            of: checkoutSessionPattern,
            options: .regularExpression
        ) != nil else { return nil }
        return value
    }
}

enum CheckoutDeepLink {
    static func callback(from url: URL) -> CheckoutCallback? {
        guard
            url.scheme?.lowercased() == "xertfitness",
            url.host?.lowercased() == "checkout",
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let value = components.queryItems?.first(where: { $0.name == "status" })?.value,
            let status = CheckoutReturnStatus(rawValue: value)
        else {
            return nil
        }

        let suppliedSessionID = components.queryItems?
            .first(where: { $0.name == "checkout_session_id" })?
            .value
        if let suppliedSessionID {
            guard CheckoutSessionIdentity.normalize(suppliedSessionID) != nil else { return nil }
        }
        return CheckoutCallback(status: status, checkoutSessionID: suppliedSessionID)
    }

    static func status(from url: URL) -> CheckoutReturnStatus? {
        callback(from: url)?.status
    }
}

enum CheckoutReconciliation {
    // Immediate check, then 2s, 5s and 10s after returning from Stripe.
    static let retryDelaysNanoseconds: [UInt64] = [0, 2_000_000_000, 3_000_000_000, 5_000_000_000]

    enum Settlement: Equatable {
        case pending
        case confirmed
        case failed
        case refunded
    }

    enum Result: Equatable {
        case noMatchingCheckout
        case pending
        case confirmed
        case failed
        case refunded
    }

    static func settlement(
        pendingCheckout: PendingCheckout,
        credits: [CreditBatch],
        orders: [OrderItem]
    ) -> Settlement {
        guard let checkoutSessionID = pendingCheckout.checkoutSessionID else {
            return hasSettled(
                baselineOrderIDs: pendingCheckout.baselineOrderIDs,
                credits: credits,
                orders: orders
            ) ? .confirmed : .pending
        }

        guard let order = orders.first(where: {
            $0.stripe_checkout_session_id == checkoutSessionID
        }) else { return .pending }

        switch order.status.lowercased() {
        case "paid":
            return credits.contains(where: { $0.order_id == order.id }) ? .confirmed : .pending
        case "failed", "cancelled", "expired":
            return .failed
        case "refunded":
            return .refunded
        default:
            return .pending
        }
    }

    static func hasSettled(
        baselineOrderIDs: Set<UUID>,
        credits: [CreditBatch],
        orders: [OrderItem]
    ) -> Bool {
        var newPaidOrderIDs = Set<UUID>()
        for order in orders where
            !baselineOrderIDs.contains(order.id) && order.status.lowercased() == "paid" {
            newPaidOrderIDs.insert(order.id)
        }
        return credits.contains { batch in
            guard let orderID = batch.order_id else { return false }
            return newPaidOrderIDs.contains(orderID)
        }
    }
}
