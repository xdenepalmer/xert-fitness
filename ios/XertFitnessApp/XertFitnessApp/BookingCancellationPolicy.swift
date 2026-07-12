import Foundation

enum BookingCancellationPolicy {
    static let creditRefundLeadTime: TimeInterval = 12 * 60 * 60

    static func returnsCredit(status: String, startTime: Date, now: Date = Date()) -> Bool {
        status == "requested" || startTime.timeIntervalSince(now) > creditRefundLeadTime
    }
}
