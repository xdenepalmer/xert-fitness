import Combine
import Foundation

enum XertOwnerNavigationPriority: Equatable {
    case platformHealth(Int)
    case attendance(Int)
    case bookingRequests(Int)
    case waitlist(Int)
    case ptRequests(Int)
    case retention(Int)

    var workspace: XertOwnerWorkspace {
        switch self {
        case .platformHealth: return .health
        case .attendance, .waitlist: return .classDesk
        case .bookingRequests: return .bookingRequests
        case .ptRequests: return .ptRequests
        case .retention: return .retention
        }
    }

    var count: Int {
        let rawCount: Int
        switch self {
        case .platformHealth(let value),
             .attendance(let value),
             .bookingRequests(let value),
             .waitlist(let value),
             .ptRequests(let value),
             .retention(let value):
            rawCount = value
        }
        return min(999, max(0, rawCount))
    }

    var compactLabel: String {
        let value = count > 99 ? "99+" : String(count)
        switch self {
        case .platformHealth: return "\(value) HEALTH"
        case .attendance: return "\(value) ROLL CALL"
        case .bookingRequests: return "\(value) REQUESTS"
        case .waitlist: return "\(value) WAITING"
        case .ptRequests: return "\(value) PT"
        case .retention: return "\(value) FOLLOW-UP"
        }
    }

    var actionTitle: String {
        let noun: String
        switch self {
        case .platformHealth:
            noun = count == 1 ? "platform health issue" : "platform health issues"
        case .attendance:
            noun = count == 1 ? "roll call" : "roll calls"
        case .bookingRequests:
            noun = count == 1 ? "booking request" : "booking requests"
        case .waitlist:
            noun = count == 1 ? "waitlisted member" : "waitlisted members"
        case .ptRequests:
            noun = count == 1 ? "PT request" : "PT requests"
        case .retention:
            noun = count == 1 ? "retention follow-up" : "retention follow-ups"
        }
        return "Open \(count) \(noun)"
    }

    static func resolve(
        healthIssueCount: Int,
        attendanceDue: Int,
        bookingRequests: Int,
        waitingMembers: Int,
        pendingPT: Int,
        followUps: Int
    ) -> Self? {
        if healthIssueCount > 0 { return .platformHealth(healthIssueCount) }
        if attendanceDue > 0 { return .attendance(attendanceDue) }
        if bookingRequests > 0 { return .bookingRequests(bookingRequests) }
        if waitingMembers > 0 { return .waitlist(waitingMembers) }
        if pendingPT > 0 { return .ptRequests(pendingPT) }
        if followUps > 0 { return .retention(followUps) }
        return nil
    }
}

struct XertOwnerNavigationPulse: Equatable {
    static let sourceCount = 6
    static let empty = XertOwnerNavigationPulse(
        actionCount: 0,
        healthIssueCount: 0,
        loadedSourceCount: 0,
        failedSourceCount: 0,
        updatedAt: nil
    )

    let actionCount: Int
    let healthIssueCount: Int
    let loadedSourceCount: Int
    let failedSourceCount: Int
    let updatedAt: Date?
    let priority: XertOwnerNavigationPriority?

    init(
        actionCount: Int,
        healthIssueCount: Int,
        loadedSourceCount: Int,
        failedSourceCount: Int,
        updatedAt: Date?,
        priority: XertOwnerNavigationPriority? = nil
    ) {
        self.actionCount = max(0, actionCount)
        self.healthIssueCount = max(0, healthIssueCount)
        self.loadedSourceCount = min(Self.sourceCount, max(0, loadedSourceCount))
        self.failedSourceCount = min(Self.sourceCount, max(0, failedSourceCount))
        self.updatedAt = updatedAt
        self.priority = priority
    }

    var isAvailable: Bool { loadedSourceCount > 0 && updatedAt != nil }
    var isPartial: Bool { isAvailable && failedSourceCount > 0 }
    var attentionCount: Int { min(999, actionCount + healthIssueCount) }
    var badgeText: String { attentionCount > 99 ? "99+" : String(attentionCount) }

    var shortStatus: String {
        guard isAvailable else { return "CHECK" }
        return attentionCount > 0 ? "\(badgeText) OPEN" : isPartial ? "PARTIAL" : "CLEAR"
    }

    var accessibilityLabel: String {
        guard isAvailable else { return "Owner operations status unavailable" }
        var details: [String] = []
        if actionCount > 0 {
            details.append("\(actionCount) open operational \(actionCount == 1 ? "action" : "actions")")
        }
        if healthIssueCount > 0 {
            details.append("\(healthIssueCount) platform health \(healthIssueCount == 1 ? "issue" : "issues")")
        }
        if details.isEmpty { details.append("No open owner actions") }
        if isPartial { details.append("some status sources are unavailable") }
        return details.joined(separator: ", ")
    }

    func isFresh(at now: Date, maximumAge: TimeInterval) -> Bool {
        guard let updatedAt else { return false }
        return now.timeIntervalSince(updatedAt) >= 0
            && now.timeIntervalSince(updatedAt) <= maximumAge
    }

    static func aggregate(
        dailyOperations: [AdminDailyOperation]?,
        waitlist: [AdminWaitlistItem]?,
        followUps: [AdminFollowUp]?,
        ptRequests: [AdminPTRequest]?,
        commerceHealth: AdminCommerceHealth?,
        pushHealth: AdminPushHealth?,
        updatedAt: Date = Date()
    ) -> Self {
        let loadedSourceCount = [
            dailyOperations != nil,
            waitlist != nil,
            followUps != nil,
            ptRequests != nil,
            commerceHealth != nil,
            pushHealth != nil,
        ].filter { $0 }.count
        let requestedPlaces = dailyOperations?.reduce(0) {
            $0 + $1.requested_count + $1.public_request_count
        } ?? 0
        let attendanceDue = dailyOperations?.filter(\.attendance_due).count ?? 0
        let waitingMembers = waitlist?.reduce(0) { $0 + $1.waitlist_count } ?? 0
        let pendingPT = ptRequests?.filter(\.isPending).count ?? 0
        let healthIssues = (commerceHealth?.ready == false ? 1 : 0)
            + (pushHealth?.isOwnerLaunchReady(at: updatedAt) == false ? 1 : 0)
        let followUpCount = followUps?.count ?? 0
        let priority = XertOwnerNavigationPriority.resolve(
            healthIssueCount: healthIssues,
            attendanceDue: attendanceDue,
            bookingRequests: requestedPlaces,
            waitingMembers: waitingMembers,
            pendingPT: pendingPT,
            followUps: followUpCount
        )

        return Self(
            actionCount: requestedPlaces + attendanceDue + waitingMembers + followUpCount + pendingPT,
            healthIssueCount: healthIssues,
            loadedSourceCount: loadedSourceCount,
            failedSourceCount: Self.sourceCount - loadedSourceCount,
            updatedAt: loadedSourceCount > 0 ? updatedAt : nil,
            priority: priority
        )
    }
}

struct XertOwnerNavigationPulseLoader {
    let load: (AuthSession) async -> XertOwnerNavigationPulse

    static let live = XertOwnerNavigationPulseLoader { session in
        let api = XertAPI()
        async let dailyOperations = try? api.adminDailyOperations(session: session)
        async let waitlist = try? api.adminWaitlist(session: session, limit: 50)
        async let followUps = try? api.adminFollowUps(session: session, limit: 50)
        async let ptRequests = try? api.adminPTRequests(session: session)
        async let commerceHealth = try? api.adminCommerceHealth(session: session)
        async let pushHealth = try? api.adminPushHealth(session: session)

        return await XertOwnerNavigationPulse.aggregate(
            dailyOperations: dailyOperations,
            waitlist: waitlist,
            followUps: followUps,
            ptRequests: ptRequests,
            commerceHealth: commerceHealth,
            pushHealth: pushHealth
        )
    }
}

@MainActor
final class XertOwnerNavigationPulseStore: ObservableObject {
    @Published private(set) var snapshot = XertOwnerNavigationPulse.empty
    @Published private(set) var isRefreshing = false

    private let loader: XertOwnerNavigationPulseLoader
    private let freshnessInterval: TimeInterval
    private var accountID: UUID?
    private var requestID: UUID?

    init(
        loader: XertOwnerNavigationPulseLoader = .live,
        freshnessInterval: TimeInterval = 60
    ) {
        self.loader = loader
        self.freshnessInterval = max(10, freshnessInterval)
    }

    func refresh(session: AuthSession, force: Bool = false, now: Date = Date()) async {
        guard let userID = session.user?.id else {
            reset()
            return
        }
        if accountID != userID {
            reset()
            accountID = userID
        }
        guard !isRefreshing else { return }
        guard force || !snapshot.isFresh(at: now, maximumAge: freshnessInterval) else { return }

        let currentRequestID = UUID()
        requestID = currentRequestID
        isRefreshing = true
        let loadedSnapshot = await loader.load(session)
        guard requestID == currentRequestID, accountID == userID else { return }
        snapshot = loadedSnapshot
        isRefreshing = false
    }

    func reset() {
        requestID = nil
        accountID = nil
        snapshot = .empty
        isRefreshing = false
    }
}
