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
    @Published private(set) var ptRequests: [AdminPTRequest] = []
    @Published private(set) var announcements: [AdminAnnouncement] = []
    @Published private(set) var schemaCapabilities: [AdminSchemaCapability] = []
    @Published private(set) var commerceHealth: AdminCommerceHealth?
    @Published private(set) var pushHealth: AdminPushHealth?
    @Published private(set) var auditEntries: [AdminAuditEntry] = []
    @Published private(set) var products: [AdminProduct] = []
    @Published private(set) var events: [AdminEvent] = []
    @Published private(set) var eventGoalCounts: [UUID: Int] = [:]
    @Published private(set) var eventRoster: [AdminEventGoalMember] = []
    @Published private(set) var coaches: [AdminCoach] = []
    @Published private(set) var classRoster: [AdminRosterMember] = []
    @Published private(set) var classSessions: [AdminClassSession] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isSearchingMembers = false
    @Published private(set) var promotingSessionID: UUID?
    @Published private(set) var loggingFollowUpMemberID: UUID?
    @Published private(set) var isSavingSettings = false
    @Published private(set) var updatingPTRequestID: UUID?
    @Published private(set) var isPublishingAnnouncement = false
    @Published private(set) var savingProductID: UUID?
    @Published private(set) var savingEventID: UUID?
    @Published private(set) var deletingEventID: UUID?
    @Published private(set) var loadingEventRosterID: UUID?
    @Published private(set) var savingCoachID: UUID?
    @Published private(set) var deletingCoachID: UUID?
    @Published private(set) var loadingRosterSessionID: UUID?
    @Published private(set) var updatingBookingID: UUID?
    @Published private(set) var recordingAttendanceSessionID: UUID?
    @Published private(set) var savingClassID: UUID?
    @Published private(set) var cancellingClassID: UUID?
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
    var pendingPTRequests: Int { ptRequests.filter(\.isPending).count }
    var liveAnnouncements: Int { announcements.filter { $0.stateLabel == "Live" }.count }
    var missingSchemaCapabilities: [String] { AdminSchemaReadiness.missing(from: schemaCapabilities) }
    var healthIssues: Int {
        missingSchemaCapabilities.count
            + (commerceHealth?.ready == false ? 1 : 0)
            + (pushHealth?.ready == false ? 1 : 0)
    }
    var hasHealthSnapshot: Bool {
        !schemaCapabilities.isEmpty && commerceHealth != nil && pushHealth != nil
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
        async let ptRequest = api.adminPTRequests(session: session)
        async let announcementRequest = api.adminAnnouncements(session: session)
        async let capabilitiesRequest = api.adminSchemaCapabilities(session: session)
        async let commerceRequest = api.adminCommerceHealth(session: session)
        async let pushRequest = api.adminPushHealth(session: session)
        async let auditRequest = api.adminAudit(session: session)
        async let productRequest = api.adminProducts(session: session)
        async let eventRequest = api.adminEvents(session: session)
        async let eventGoalsRequest = api.adminEventGoalReferences(session: session)
        async let coachRequest = api.adminCoaches(session: session)
        async let classSessionRequest = api.adminClassSessions(session: session)

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
        do { ptRequests = try await ptRequest; loadedSource = true }
        catch { failures.append("PT requests") }
        do { announcements = try await announcementRequest; loadedSource = true }
        catch { failures.append("member notices") }
        do { schemaCapabilities = try await capabilitiesRequest; loadedSource = true }
        catch { failures.append("schema health") }
        do { commerceHealth = try await commerceRequest; loadedSource = true }
        catch { failures.append("Stripe health") }
        do { pushHealth = try await pushRequest; loadedSource = true }
        catch { failures.append("push health") }
        do { auditEntries = try await auditRequest; loadedSource = true }
        catch { failures.append("admin audit") }
        do { products = try await productRequest; loadedSource = true }
        catch { failures.append("session packs") }
        do { events = try await eventRequest; loadedSource = true }
        catch { failures.append("event calendar") }
        do {
            eventGoalCounts = Dictionary(grouping: try await eventGoalsRequest, by: \.event_id).mapValues(\.count)
            loadedSource = true
        } catch { failures.append("event training groups") }
        do { coaches = try await coachRequest; loadedSource = true }
        catch { failures.append("team directory") }
        do { classSessions = try await classSessionRequest; loadedSource = true }
        catch { failures.append("full timetable") }

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

    func loadClassRoster(session: AuthSession, classSessionID: UUID) async {
        guard loadingRosterSessionID == nil else { return }
        loadingRosterSessionID = classSessionID
        defer { loadingRosterSessionID = nil }
        do {
            classRoster = try await api.adminSessionRoster(session: session, classSessionID: classSessionID)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setBookingStatus(
        session: AuthSession,
        classSessionID: UUID,
        bookingID: UUID,
        status: String
    ) async -> Bool {
        guard updatingBookingID == nil else { return false }
        updatingBookingID = bookingID
        defer { updatingBookingID = nil }
        do {
            try await api.adminSetBookingStatus(session: session, bookingID: bookingID, status: status)
            classRoster = try await api.adminSessionRoster(session: session, classSessionID: classSessionID)
            dailyOperations = try await api.adminDailyOperations(session: session)
            waitlist = try await api.adminWaitlist(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func recordAttendance(
        session: AuthSession,
        classSessionID: UUID,
        attendedIDs: [UUID],
        noShowIDs: [UUID]
    ) async -> Bool {
        guard recordingAttendanceSessionID == nil else { return false }
        recordingAttendanceSessionID = classSessionID
        defer { recordingAttendanceSessionID = nil }
        do {
            try await api.adminRecordAttendance(
                session: session,
                classSessionID: classSessionID,
                attendedIDs: attendedIDs,
                noShowIDs: noShowIDs
            )
            classRoster = try await api.adminSessionRoster(session: session, classSessionID: classSessionID)
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

    func updatePTRequest(
        session: AuthSession,
        request: AdminPTRequest,
        status: String,
        notes: String? = nil,
        updateNotes: Bool = false
    ) async -> Bool {
        guard updatingPTRequestID == nil else { return false }
        updatingPTRequestID = request.id
        defer { updatingPTRequestID = nil }
        do {
            try await api.adminUpdatePTRequest(
                session: session,
                requestID: request.id,
                status: status,
                adminNotes: notes,
                updateNotes: updateNotes
            )
            ptRequests = try await api.adminPTRequests(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func publishAnnouncement(session: AuthSession, title: String, body: String, tone: String) async -> Bool {
        guard !isPublishingAnnouncement else { return false }
        isPublishingAnnouncement = true
        defer { isPublishingAnnouncement = false }
        do {
            try await api.adminPublishAnnouncement(session: session, title: title, body: body, tone: tone)
            announcements = try await api.adminAnnouncements(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func saveProduct(session: AuthSession, product: AdminProduct, draft: AdminProductDraft) async -> Bool {
        guard savingProductID == nil else { return false }
        savingProductID = product.id
        defer { savingProductID = nil }
        do {
            try await api.adminUpdateProduct(session: session, product: product, draft: draft)
            products = try await api.adminProducts(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func saveEvent(session: AuthSession, event: AdminEvent?, draft: AdminEventDraft) async -> Bool {
        guard savingEventID == nil else { return false }
        savingEventID = event?.id ?? UUID()
        defer { savingEventID = nil }
        do {
            if let event {
                try await api.adminUpdateEvent(session: session, event: event, draft: draft)
            } else {
                try await api.adminCreateEvent(session: session, draft: draft)
            }
            try await reloadEvents(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func deleteEvent(session: AuthSession, event: AdminEvent) async -> Bool {
        guard deletingEventID == nil else { return false }
        deletingEventID = event.id
        defer { deletingEventID = nil }
        do {
            try await api.adminDeleteEvent(session: session, event: event)
            try await reloadEvents(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func loadEventRoster(session: AuthSession, eventID: UUID) async {
        guard loadingEventRosterID == nil else { return }
        eventRoster = []
        loadingEventRosterID = eventID
        defer { loadingEventRosterID = nil }
        do {
            eventRoster = try await api.adminEventGoalMembers(session: session, eventID: eventID)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reloadEvents(session: AuthSession) async throws {
        async let eventRequest = api.adminEvents(session: session)
        async let goalsRequest = api.adminEventGoalReferences(session: session)
        events = try await eventRequest
        eventGoalCounts = Dictionary(grouping: try await goalsRequest, by: \.event_id).mapValues(\.count)
    }

    func saveCoach(session: AuthSession, coach: AdminCoach?, draft: AdminCoachDraft) async -> Bool {
        guard savingCoachID == nil else { return false }
        savingCoachID = coach?.id ?? UUID()
        defer { savingCoachID = nil }
        do {
            if let coach {
                try await api.adminUpdateCoach(session: session, coach: coach, draft: draft)
            } else {
                try await api.adminCreateCoach(session: session, draft: draft)
            }
            coaches = try await api.adminCoaches(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func deleteCoach(session: AuthSession, coach: AdminCoach) async -> Bool {
        guard deletingCoachID == nil else { return false }
        deletingCoachID = coach.id
        defer { deletingCoachID = nil }
        do {
            try await api.adminDeleteCoach(session: session, coach: coach)
            coaches = try await api.adminCoaches(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func saveClass(session: AuthSession, classSession: AdminClassSession?, draft: AdminClassDraft) async -> Bool {
        guard savingClassID == nil else { return false }
        savingClassID = classSession?.id ?? UUID()
        defer { savingClassID = nil }
        do {
            if let classSession {
                try await api.adminUpdateClass(session: session, classSession: classSession, draft: draft)
            } else {
                try await api.adminCreateClass(session: session, draft: draft)
            }
            classSessions = try await api.adminClassSessions(session: session)
            dailyOperations = try await api.adminDailyOperations(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func duplicateClass(session: AuthSession, classSession: AdminClassSession) async -> Bool {
        var draft = AdminClassDraft(classSession: classSession)
        draft.title = "\(classSession.title) (copy)"
        let originalStart = classSession.start_time ?? Date()
        let originalEnd = classSession.end_time ?? originalStart.addingTimeInterval(TimeInterval(draft.durationMinutes * 60))
        draft.startTime = originalStart.addingTimeInterval(7 * 86_400)
        draft.endTime = originalEnd.addingTimeInterval(7 * 86_400)
        draft.status = "draft"
        draft.publicVisible = false
        return await saveClass(session: session, classSession: nil, draft: draft)
    }

    func cancelClass(session: AuthSession, classSession: AdminClassSession) async -> Bool {
        guard cancellingClassID == nil else { return false }
        cancellingClassID = classSession.id
        defer { cancellingClassID = nil }
        do {
            _ = try await api.adminCancelClass(session: session, classSessionID: classSession.id)
            do { try await api.adminNotifyClassCancellation(session: session, classSessionID: classSession.id) }
            catch { errorMessage = "Class cancelled, but push delivery needs attention: \(error.localizedDescription)" }
            classSessions = try await api.adminClassSessions(session: session)
            dailyOperations = try await api.adminDailyOperations(session: session)
            waitlist = try await api.adminWaitlist(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
