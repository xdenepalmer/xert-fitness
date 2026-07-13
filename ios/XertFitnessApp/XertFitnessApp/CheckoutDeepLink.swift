import Foundation

enum CheckoutReturnStatus: String, Identifiable {
    case success
    case cancelled

    var id: String { rawValue }

    var title: String {
        self == .success ? "Payment received" : "Checkout cancelled"
    }

    var message: String {
        switch self {
        case .success:
            return "Your payment is being confirmed. Credits and purchase history are refreshing now."
        case .cancelled:
            return "No payment was taken. You can choose a session pack whenever you are ready."
        }
    }
}

enum CheckoutDeepLink {
    static func status(from url: URL) -> CheckoutReturnStatus? {
        guard
            url.scheme?.lowercased() == "xertfitness",
            url.host?.lowercased() == "checkout",
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let value = components.queryItems?.first(where: { $0.name == "status" })?.value
        else {
            return nil
        }
        return CheckoutReturnStatus(rawValue: value)
    }
}

enum CheckoutReconciliation {
    // Immediate check, then 2s, 5s and 10s after returning from Stripe.
    static let retryDelaysNanoseconds: [UInt64] = [0, 2_000_000_000, 3_000_000_000, 5_000_000_000]

    static func hasSettled(
        baselineCreditTotal: Int,
        baselineOrderIDs: Set<UUID>,
        credits: [CreditBatch],
        orders: [OrderItem]
    ) -> Bool {
        let currentCreditTotal = credits.reduce(0) { $0 + $1.remaining }
        let hasNewPaidOrder = orders.contains {
            !baselineOrderIDs.contains($0.id) && $0.status.lowercased() == "paid"
        }
        return currentCreditTotal > baselineCreditTotal && hasNewPaidOrder
    }
}
