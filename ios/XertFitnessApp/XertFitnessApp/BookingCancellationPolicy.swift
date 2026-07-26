import Foundation

enum BookingCancellationPolicy {
    static let creditRefundLeadTime: TimeInterval = 12 * 60 * 60

    /// Mirrors `cancel_booking`: requested always refunds; confirmed refunds when
    /// the class is more than 12 hours away. The server restores the credit even
    /// when the original pack has expired (and reactivates that batch).
    static func returnsCredit(status: String, startTime: Date, now: Date = Date()) -> Bool {
        status == "requested" || (status == "confirmed" && startTime.timeIntervalSince(now) > creditRefundLeadTime)
    }
}

enum MemberBookingOutcome: Equatable {
    case completed
    case needsCredits
    case failed
}

enum BookingErrorMessage {
    private static let messages: [(code: String, message: String)] = [
        ("AUTH_REQUIRED", "Sign in to book a class."),
        ("SESSION_NOT_FOUND", "That class could not be found. Pull to refresh the timetable."),
        ("SESSION_NOT_BOOKABLE", "That class is not currently open for booking."),
        ("SESSION_IN_PAST", "That class has already started."),
        ("ALREADY_BOOKED", "You already have an active place in that class."),
        ("BOOKING_TIME_CONFLICT", "That class overlaps another active booking in your schedule."),
        ("SESSION_FULL", "That class is now full. Refresh to check whether its waitlist is available."),
        ("BOOKINGS_PAUSED", "Online class bookings are currently paused. You can still register interest and XERT will follow up."),
        ("MEMBER_ONBOARDING_REQUIRED", "Complete Member Readiness before booking or joining a waitlist."),
        ("SESSION_INTEREST_ONLY", "This class is collecting interest only."),
        ("SESSION_HAS_CAPACITY", "A place is available now. Refresh and book the class instead."),
        ("WAITLIST_PRIORITY", "Members already on the waitlist have first claim on this place. Refresh and join the queue."),
        ("NO_CREDITS", "You need available credits before booking this class."),
        ("BOOKING_NOT_FOUND", "That booking could not be found. Pull to refresh your account."),
        ("NOT_CANCELLABLE", "This booking can no longer be cancelled.")
    ]

    static func display(for rawMessage: String) -> String {
        messages.first { rawMessage.contains($0.code) }?.message
            ?? (rawMessage.isEmpty ? "Could not complete the booking." : rawMessage)
    }
}
