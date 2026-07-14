import Foundation
import Combine

@MainActor
final class AdminStore: ObservableObject {
    @Published private(set) var dailyOperations: [AdminDailyOperation] = []
    @Published private(set) var waitlist: [AdminWaitlistItem] = []
    @Published private(set) var followUps: [AdminFollowUp] = []
    @Published private(set) var members: [AdminMemberSummary] = []
    @Published private(set) var orders: [OrderItem] = []
    @Published private(set) var settings: AdminPlatformSettings?
    @Published private(set) var isLoading = false
    @Published private(set) var isSearchingMembers = false
    @Published private(set) var promotingSessionID: UUID?
    @Published private(set) var loggingFollowUpMemberID: UUID?
    @Published private(set) var isSavingSettings = false
    @Published var errorMessage: String?
    @Published private(set) var lastUpdatedAt: Date?

    private let api = XertAPI()

    var memberCount: Int { members.first?.total_count ?? members.count }
    var requestedPlaces: Int { dailyOperations.reduce(0) { $0 + $1.requested_count + $1.public_request_count } }
    var waitingMembers: Int { waitlist.reduce(0) { $0 + $1.waitlist_count } }
    var attendanceDue: Int { dailyOperations.filter(\.attendance_due).count }
    var paidOrders: [OrderItem] { orders.filter { $0.status == "paid" } }
    var totalRevenueCents: Int { paidOrders.reduce(0) { $0 + ($1.amount_cents ?? 0) } }
    var monthRevenueCents: Int {
        let calendar = Calendar.current
        return paidOrders.filter { calendar.isDate($0.activityDate, equalTo: Date(), toGranularity: .month) }
            .reduce(0) { $0 + ($1.amount_cents ?? 0) }
    }

    func refresh(session: AuthSession) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        async let operationsRequest = api.adminDailyOperations(session: session)
        async let waitlistRequest = api.adminWaitlist(session: session)
        async let followUpRequest = api.adminFollowUps(session: session)
        async let memberRequest = api.adminMembers(session: session)
        async let orderRequest = api.orders(session: session)
        async let settingsRequest = api.adminPlatformSettings(session: session)

        var failures: [String] = []
        var loadedSource = false
        do { dailyOperations = try await operationsRequest; loadedSource = true }
        catch { failures.append("today's classes") }
        do { waitlist = try await waitlistRequest; loadedSource = true }
        catch { failures.append("waitlists") }
        do { followUps = try await followUpRequest; loadedSource = true }
        catch { failures.append("retention") }
        do { members = try await memberRequest; loadedSource = true }
        catch { failures.append("members") }
        do { orders = try await orderRequest; loadedSource = true }
        catch { failures.append("finance") }
        do { settings = try await settingsRequest; loadedSource = true }
        catch { failures.append("platform controls") }

        if loadedSource {
            lastUpdatedAt = Date()
        }
        if !failures.isEmpty {
            errorMessage = "Could not refresh \(failures.joined(separator: ", ")). Pull down to retry."
        }
    }

    func searchMembers(session: AuthSession, query: String) async {
        guard !isSearchingMembers else { return }
        isSearchingMembers = true
        defer { isSearchingMembers = false }
        do {
            members = try await api.adminMembers(session: session, search: query)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func promoteNext(session: AuthSession, classSessionID: UUID) async -> Bool {
        guard promotingSessionID == nil else { return false }
        promotingSessionID = classSessionID
        defer { promotingSessionID = nil }
        do {
            try await api.adminPromoteNextWaitlisted(session: session, classSessionID: classSessionID)
            waitlist = try await api.adminWaitlist(session: session)
            dailyOperations = try await api.adminDailyOperations(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func logFollowUp(session: AuthSession, member: AdminFollowUp, channel: String) async -> Bool {
        guard loggingFollowUpMemberID == nil else { return false }
        loggingFollowUpMemberID = member.id
        defer { loggingFollowUpMemberID = nil }
        do {
            try await api.adminAddMemberNote(
                session: session,
                memberID: member.id,
                category: "follow_up",
                body: "Follow-up completed via \(channel). Reason: \(member.reasonLabel)."
            )
            followUps = try await api.adminFollowUps(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func saveSettings(session: AuthSession, draft: AdminPlatformSettings) async -> Bool {
        guard !isSavingSettings else { return false }
        isSavingSettings = true
        defer { isSavingSettings = false }
        do {
            settings = try await api.adminUpdatePlatformSettings(session: session, settings: draft)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
