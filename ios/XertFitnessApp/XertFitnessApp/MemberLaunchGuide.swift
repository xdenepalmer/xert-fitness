import Foundation

enum MemberLaunchGuideState: Equatable {
    case signIn
    case checking
    case retry
    case completeReadiness
    case chooseAccess
    case bookFirstClass
    case enableReminder(bookingID: UUID)
    case activated(bookingID: UUID)

    var isCompact: Bool {
        if case .activated = self { return true }
        return false
    }
}

enum MemberLaunchGuideResolver {
    static func resolve(
        isSignedIn: Bool,
        onboardingLoaded: Bool,
        readinessComplete: Bool,
        creditBalanceLoaded: Bool,
        creditTotal: Int,
        bookingsLoaded: Bool,
        nextActiveBookingID: UUID?,
        nextConfirmedBookingID: UUID?,
        classRemindersEnabled: Bool,
        onboardingUnavailable: Bool,
        creditsUnavailable: Bool,
        bookingsUnavailable: Bool
    ) -> MemberLaunchGuideState {
        guard isSignedIn else { return .signIn }
        guard !onboardingUnavailable else { return .retry }
        guard onboardingLoaded else { return .checking }
        guard readinessComplete else { return .completeReadiness }
        guard !bookingsUnavailable else { return .retry }
        guard bookingsLoaded else { return .checking }
        if let nextActiveBookingID {
            if !classRemindersEnabled, let nextConfirmedBookingID {
                return .enableReminder(bookingID: nextConfirmedBookingID)
            }
            return .activated(bookingID: nextActiveBookingID)
        }
        guard !creditsUnavailable else { return .retry }
        guard creditBalanceLoaded else { return .checking }
        guard creditTotal > 0 else { return .chooseAccess }
        return .bookFirstClass
    }
}
