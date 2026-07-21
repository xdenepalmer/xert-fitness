import Foundation
import Combine

enum AdminOperationalQueueState: Equatable {
    case idle
    case loading
    case ready
    case partial(unavailableSources: [String])
}

@MainActor
final class AdminStore: ObservableObject {
    @Published private(set) var dailyOperations: [AdminDailyOperation] = []
    @Published private(set) var waitlist: [AdminWaitlistItem] = []
    @Published private(set) var followUps: [AdminFollowUp] = []
    @Published private(set) var members: [AdminMemberSummary] = []
    @Published private(set) var memberNotes: [AdminMemberNote] = []
    @Published private(set) var orders: [OrderItem] = []
    @Published private(set) var settings: AdminPlatformSettings?
    @Published private(set) var ptRequests: [AdminPTRequest] = []
    @Published private(set) var announcements: [AdminAnnouncement] = []
    @Published private(set) var schemaCapabilities: [AdminSchemaCapability] = []
    @Published private(set) var commerceHealth: AdminCommerceHealth?
    @Published private(set) var resolvingStripeIncidentID: String?
    @Published private(set) var retryingStripeIncidentID: String?
    @Published private(set) var pushHealth: AdminPushHealth?
    @Published private(set) var auditEntries: [AdminAuditEntry] = []
    @Published private(set) var products: [AdminProduct] = []
    @Published private(set) var events: [AdminEvent] = []
    @Published private(set) var eventGoalCounts: [UUID: Int] = [:]
    @Published private(set) var eventRoster: [AdminEventGoalMember] = []
    @Published private(set) var coaches: [AdminCoach] = []
    @Published private(set) var classRoster: [AdminRosterMember] = []
    @Published private(set) var classSessions: [AdminClassSession] = []
    @Published private(set) var availabilityBlocks: [AdminAvailabilityBlock] = []
    @Published private(set) var blackoutPeriods: [AdminBlackoutPeriod] = []
    @Published private(set) var leadsByPipeline: [AdminLeadPipeline: [AdminLead]] = [:]
    @Published private(set) var campaignAttributionRows: [AdminCampaignAttributionRow] = []
    @Published private(set) var siteContentRows: [AdminSiteContentRow] = []
    @Published private(set) var bookingRequests: [AdminBookingRequest] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isSearchingMembers = false
    @Published private(set) var ownerMemberSearchResults: [AdminMemberSummary] = []
    @Published private(set) var isSearchingOwnerMembers = false
    @Published private(set) var ownerMemberSearchError: String?
    @Published private(set) var resolvingOwnerTask: XertOwnerTask?
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
    @Published private(set) var savingScheduleWindowID: UUID?
    @Published private(set) var deletingScheduleWindowID: UUID?
    @Published private(set) var loadingMemberDetailID: UUID?
    @Published private(set) var servicingMemberID: UUID?
    @Published private(set) var operatingOrderID: UUID?
    @Published private(set) var loadingLeadPipeline: AdminLeadPipeline?
    @Published private(set) var isLoadingCampaignAttribution = false
    @Published private(set) var hasLoadedSiteContent = false
    @Published private(set) var isLoadingSiteContent = false
    @Published private(set) var savingSiteContentSection: AdminSiteContentSection?
    @Published private(set) var isUploadingSiteImage = false
    @Published private(set) var savingLeadIDs: Set<AdminLeadIdentifier> = []
    @Published private(set) var isLoadingBookingRequests = false
    @Published private(set) var updatingBookingRequestIDs: Set<String> = []
    @Published var errorMessage: String?
    @Published private(set) var lastUpdatedAt: Date?
    @Published private(set) var hasCompletedRefresh = false
    @Published private(set) var operationalQueueState: AdminOperationalQueueState = .idle
    @Published private(set) var refreshUnavailableSources: [String] = []
    @Published private(set) var loadedSources: Set<String> = []

    private let api = XertAPI()
    private var ownerMemberSearchGeneration: UInt = 0

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
    var unavailableHealthSourceCount: Int {
        guard hasCompletedRefresh else { return 0 }
        return Self.healthSources.filter {
            !loadedSources.contains($0) || refreshUnavailableSources.contains($0)
        }.count
    }
    var healthIssues: Int {
        unavailableHealthSourceCount
            + (healthSourceIsCurrent("schema health") ? missingSchemaCapabilities.count : 0)
            + (healthSourceIsCurrent("Stripe health") && commerceHealth?.ready == false ? 1 : 0)
            + (healthSourceIsCurrent("push health") && pushHealth?.ready == false ? 1 : 0)
    }
    var hasHealthSnapshot: Bool {
        unavailableHealthSourceCount == 0
            && commerceHealth != nil
            && pushHealth != nil
    }

    private static let healthSources: Set<String> = ["schema health", "Stripe health", "push health"]

    private func healthSourceIsCurrent(_ source: String) -> Bool {
        loadedSources.contains(source) && !refreshUnavailableSources.contains(source)
    }

    func refresh(session: AuthSession) async {
        guard !isLoading else { return }
        isLoading = true
        operationalQueueState = .loading
        defer { isLoading = false }

        async let operationsRequest = api.adminDailyOperations(session: session)
        async let waitlistRequest = api.adminWaitlist(session: session)
        async let followUpRequest = api.adminFollowUps(session: session)
        async let memberRequest = api.adminMembers(session: session)
        async let orderRequest = api.adminOrders(session: session)
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
        async let availabilityRequest = api.adminAvailabilityBlocks(session: session)
        async let blackoutRequest = api.adminBlackoutPeriods(session: session)

        var failures: [String] = []
        var queueFailures: [String] = []
        var successfulSources = Set<String>()
        var loadedSource = false
        do { dailyOperations = try await operationsRequest; successfulSources.insert("today's classes"); loadedSource = true }
        catch { failures.append("today's classes"); queueFailures.append("today's classes") }
        do { waitlist = try await waitlistRequest; successfulSources.insert("waitlists"); loadedSource = true }
        catch { failures.append("waitlists"); queueFailures.append("waitlists") }
        do { followUps = try await followUpRequest; successfulSources.insert("retention"); loadedSource = true }
        catch { failures.append("retention"); queueFailures.append("retention") }
        do { members = try await memberRequest; successfulSources.insert("members"); loadedSource = true }
        catch { failures.append("members") }
        do { orders = try await orderRequest; successfulSources.insert("orders"); loadedSource = true }
        catch { failures.append("orders"); queueFailures.append("orders") }
        do { settings = try await settingsRequest; successfulSources.insert("platform controls"); loadedSource = true }
        catch { failures.append("platform controls") }
        do { ptRequests = try await ptRequest; successfulSources.insert("PT requests"); loadedSource = true }
        catch { failures.append("PT requests"); queueFailures.append("PT requests") }
        do { announcements = try await announcementRequest; successfulSources.insert("member notices"); loadedSource = true }
        catch { failures.append("member notices") }
        do { schemaCapabilities = try await capabilitiesRequest; successfulSources.insert("schema health"); loadedSource = true }
        catch { failures.append("schema health") }
        do { commerceHealth = try await commerceRequest; successfulSources.insert("Stripe health"); loadedSource = true }
        catch { failures.append("Stripe health") }
        do { pushHealth = try await pushRequest; successfulSources.insert("push health"); loadedSource = true }
        catch { failures.append("push health") }
        do { auditEntries = try await auditRequest; successfulSources.insert("admin audit"); loadedSource = true }
        catch { failures.append("admin audit") }
        do { products = try await productRequest; successfulSources.insert("session packs"); loadedSource = true }
        catch { failures.append("session packs") }
        do { events = try await eventRequest; successfulSources.insert("event calendar"); loadedSource = true }
        catch { failures.append("event calendar") }
        do {
            eventGoalCounts = Dictionary(grouping: try await eventGoalsRequest, by: \.event_id).mapValues(\.count)
            successfulSources.insert("event training groups")
            loadedSource = true
        } catch { failures.append("event training groups") }
        do { coaches = try await coachRequest; successfulSources.insert("team directory"); loadedSource = true }
        catch { failures.append("team directory") }
        do { classSessions = try await classSessionRequest; successfulSources.insert("full timetable"); loadedSource = true }
        catch { failures.append("full timetable") }
        do { availabilityBlocks = try await availabilityRequest; successfulSources.insert("availability"); loadedSource = true }
        catch { failures.append("availability") }
        do { blackoutPeriods = try await blackoutRequest; successfulSources.insert("blackouts"); loadedSource = true }
        catch { failures.append("blackouts") }

        if loadedSource {
            lastUpdatedAt = Date()
        }
        loadedSources.formUnion(successfulSources)
        refreshUnavailableSources = failures
        hasCompletedRefresh = true
        operationalQueueState = queueFailures.isEmpty
            ? .ready
            : .partial(unavailableSources: queueFailures)
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

    func searchOwnerMembers(session: AuthSession, query: String) async {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
        ownerMemberSearchGeneration &+= 1
        let generation = ownerMemberSearchGeneration
        guard normalized.count >= 2 else {
            ownerMemberSearchResults = []
            ownerMemberSearchError = nil
            isSearchingOwnerMembers = false
            return
        }

        isSearchingOwnerMembers = true
        ownerMemberSearchError = nil
        do {
            let results = try await api.adminMembers(
                session: session,
                search: normalized,
                limit: XertOwnerCommandIndex.maximumResultsPerKind
            )
            guard generation == ownerMemberSearchGeneration else { return }
            ownerMemberSearchResults = results
            isSearchingOwnerMembers = false
        } catch is CancellationError {
            guard generation == ownerMemberSearchGeneration else { return }
            isSearchingOwnerMembers = false
        } catch {
            guard generation == ownerMemberSearchGeneration else { return }
            ownerMemberSearchResults = []
            ownerMemberSearchError = "Member search is unavailable. Try again."
            isSearchingOwnerMembers = false
        }
    }

    func resetOwnerMemberSearch() {
        ownerMemberSearchGeneration &+= 1
        ownerMemberSearchResults = []
        ownerMemberSearchError = nil
        isSearchingOwnerMembers = false
    }

    func resolveOwnerTask(session: AuthSession, task: XertOwnerTask) async {
        guard resolvingOwnerTask == nil else { return }
        switch task {
        case .member(let memberID):
            guard !members.contains(where: { $0.id == memberID }) else { return }
        case .classSession(let sessionID):
            guard !dailyOperations.contains(where: { $0.id == sessionID }) else { return }
        case .product(let productID):
            guard !products.contains(where: { $0.id == productID }) else { return }
        case .order, .event:
            return
        }
        resolvingOwnerTask = task
        defer { resolvingOwnerTask = nil }
        do {
            switch task {
            case .member(let memberID):
                let member = try await api.adminMember(session: session, id: memberID)
                members.removeAll(where: { $0.id == memberID })
                members.insert(member, at: 0)
            case .classSession(let sessionID):
                let operations = try await api.adminDailyOperations(session: session)
                guard operations.contains(where: { $0.id == sessionID }) else { return }
                dailyOperations = operations
                loadedSources.insert("today's classes")
                refreshUnavailableSources.removeAll { $0 == "today's classes" }
            case .product(let productID):
                let refreshedProducts = try await api.adminProducts(session: session)
                guard refreshedProducts.contains(where: { $0.id == productID }) else { return }
                products = refreshedProducts
                loadedSources.insert("session packs")
                refreshUnavailableSources.removeAll { $0 == "session packs" }
            case .order, .event:
                break
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMemberDetail(session: AuthSession, memberID: UUID) async {
        guard loadingMemberDetailID == nil else { return }
        memberNotes = []
        loadingMemberDetailID = memberID
        defer { loadingMemberDetailID = nil }
        do { memberNotes = try await api.adminMemberNotes(session: session, memberID: memberID) }
        catch { errorMessage = error.localizedDescription }
    }

    func addMemberNote(session: AuthSession, memberID: UUID, category: String, body: String) async -> Bool {
        guard servicingMemberID == nil else { return false }
        servicingMemberID = memberID; defer { servicingMemberID = nil }
        do {
            _ = try await api.adminAddMemberNote(session: session, memberID: memberID, category: category, body: body)
            memberNotes = try await api.adminMemberNotes(session: session, memberID: memberID)
            lastUpdatedAt = Date(); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func archiveMemberNote(session: AuthSession, memberID: UUID, note: AdminMemberNote) async -> Bool {
        guard servicingMemberID == nil else { return false }
        servicingMemberID = memberID; defer { servicingMemberID = nil }
        do {
            try await api.adminArchiveMemberNote(session: session, noteID: note.id, archived: note.archived_at == nil)
            memberNotes = try await api.adminMemberNotes(session: session, memberID: memberID)
            lastUpdatedAt = Date(); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func grantCredits(session: AuthSession, memberID: UUID, sessions: Int, validityDays: Int?, requestID: UUID, note: String) async -> Bool {
        guard servicingMemberID == nil else { return false }
        servicingMemberID = memberID; defer { servicingMemberID = nil }
        do {
            _ = try await api.adminGrantCredits(session: session, memberID: memberID, sessions: sessions, validityDays: validityDays, requestID: requestID, note: note)
            members = try await api.adminMembers(session: session)
            lastUpdatedAt = Date(); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func setMemberRole(session: AuthSession, memberID: UUID, role: String) async -> Bool {
        guard servicingMemberID == nil else { return false }
        servicingMemberID = memberID; defer { servicingMemberID = nil }
        do {
            try await api.adminSetRole(session: session, memberID: memberID, role: role)
            members = try await api.adminMembers(session: session)
            lastUpdatedAt = Date(); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func reconcileOrder(session: AuthSession, order: OrderItem) async -> AdminReconciliationResult? {
        guard operatingOrderID == nil else { return nil }
        guard order.isRecoverable else {
            errorMessage = "Only unresolved orders with a Stripe Checkout Session can be reconciled."
            return nil
        }
        operatingOrderID = order.id
        defer { operatingOrderID = nil }
        do {
            let result = try await api.adminReconcileOrder(session: session, orderID: order.id)
            orders = try await api.adminOrders(session: session)
            lastUpdatedAt = Date()
            return result
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func refundOrder(
        session: AuthSession,
        order: OrderItem,
        reason: String,
        confirmation: String
    ) async -> AdminRefundResult? {
        guard operatingOrderID == nil else { return nil }
        guard order.isRefundable else {
            errorMessage = "Only a fully paid, unreimbursed Stripe order can be refunded."
            return nil
        }
        operatingOrderID = order.id
        defer { operatingOrderID = nil }
        do {
            let result = try await api.adminRefundOrder(
                session: session,
                orderID: order.id,
                reason: reason,
                confirmation: confirmation
            )
            orders = try await api.adminOrders(session: session)
            lastUpdatedAt = Date()
            return result
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func leads(for pipeline: AdminLeadPipeline) -> [AdminLead] {
        leadsByPipeline[pipeline] ?? []
    }

    func loadCampaignAttribution(session: AuthSession, force: Bool = false) async {
        guard !isLoadingCampaignAttribution else { return }
        if !force, !campaignAttributionRows.isEmpty { return }
        isLoadingCampaignAttribution = true
        defer { isLoadingCampaignAttribution = false }
        do {
            campaignAttributionRows = try await api.adminCampaignAttribution(session: session)
            lastUpdatedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func siteContentRow(for section: AdminSiteContentSection) -> AdminSiteContentRow? {
        siteContentRows.first { $0.key == section.rawValue }
    }

    func loadSiteContent(session: AuthSession, force: Bool = false) async {
        guard !isLoadingSiteContent else { return }
        if !force, hasLoadedSiteContent { return }
        isLoadingSiteContent = true
        defer { isLoadingSiteContent = false }
        do {
            siteContentRows = try await api.adminSiteContent(session: session)
            hasLoadedSiteContent = true
            lastUpdatedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveSiteContent(
        session: AuthSession,
        section: AdminSiteContentSection,
        expectedUpdatedAt: String?,
        draft: AdminSiteContentData
    ) async -> AdminSiteContentRow? {
        guard savingSiteContentSection == nil else { return nil }
        savingSiteContentSection = section
        defer { savingSiteContentSection = nil }
        do {
            let saved = try await api.adminSaveSiteContent(
                session: session,
                section: section,
                expectedUpdatedAt: expectedUpdatedAt,
                draft: draft
            )
            siteContentRows.removeAll { $0.key == section.rawValue }
            siteContentRows.append(saved)
            AdminSiteContentDraftStore.clear(section)
            lastUpdatedAt = Date()
            return saved
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func uploadSiteImage(
        session: AuthSession,
        data: Data,
        mimeType: String,
        fileExtension: String
    ) async -> String? {
        guard !isUploadingSiteImage else { return nil }
        isUploadingSiteImage = true
        defer { isUploadingSiteImage = false }
        do {
            return try await api.adminUploadSiteImage(
                session: session,
                data: data,
                mimeType: mimeType,
                fileExtension: fileExtension
            )
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func loadLeads(session: AuthSession, pipeline: AdminLeadPipeline, force: Bool = false) async {
        guard loadingLeadPipeline == nil else { return }
        if !force, leadsByPipeline[pipeline] != nil { return }
        loadingLeadPipeline = pipeline
        defer { loadingLeadPipeline = nil }
        do {
            leadsByPipeline[pipeline] = try await api.adminLeads(session: session, pipeline: pipeline)
            lastUpdatedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveLead(
        session: AuthSession,
        pipeline: AdminLeadPipeline,
        lead: AdminLead,
        status: String,
        notes: String
    ) async -> Bool {
        guard savingLeadIDs.isEmpty else { return false }
        savingLeadIDs = [lead.id]
        defer { savingLeadIDs = [] }
        do {
            try await api.adminUpdateLead(
                session: session,
                pipeline: pipeline,
                leadID: lead.id,
                status: status,
                notes: notes
            )
            leadsByPipeline[pipeline] = try await api.adminLeads(session: session, pipeline: pipeline)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func bulkUpdateLeads(
        session: AuthSession,
        pipeline: AdminLeadPipeline,
        ids: Set<AdminLeadIdentifier>,
        status: String
    ) async -> Bool {
        guard savingLeadIDs.isEmpty else { return false }
        savingLeadIDs = ids
        defer { savingLeadIDs = [] }
        do {
            try await api.adminUpdateLeadStatuses(
                session: session,
                pipeline: pipeline,
                leadIDs: Array(ids),
                status: status
            )
            leadsByPipeline[pipeline] = try await api.adminLeads(session: session, pipeline: pipeline)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func loadBookingRequests(session: AuthSession, force: Bool = false) async {
        guard !isLoadingBookingRequests else { return }
        if !force, !bookingRequests.isEmpty { return }
        isLoadingBookingRequests = true
        defer { isLoadingBookingRequests = false }
        do {
            bookingRequests = try await api.adminBookingRequests(session: session)
            lastUpdatedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateBookingRequest(
        session: AuthSession,
        booking: AdminBookingRequest,
        status: String
    ) async -> Bool {
        guard updatingBookingRequestIDs.isEmpty else { return false }
        updatingBookingRequestIDs = [booking.id]
        defer { updatingBookingRequestIDs = [] }
        do {
            try await api.adminUpdateBookingRequestStatus(session: session, booking: booking, status: status)
            try await refreshBookingOperationsSnapshot(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func bulkUpdateBookingRequests(
        session: AuthSession,
        bookings: [AdminBookingRequest],
        status: String
    ) async -> Set<String> {
        guard updatingBookingRequestIDs.isEmpty else { return Set(bookings.map(\.id)) }
        updatingBookingRequestIDs = Set(bookings.map(\.id))
        defer { updatingBookingRequestIDs = [] }
        var failed: Set<String> = []
        for booking in bookings {
            do { try await api.adminUpdateBookingRequestStatus(session: session, booking: booking, status: status) }
            catch { failed.insert(booking.id) }
        }
        do {
            try await refreshBookingOperationsSnapshot(session: session)
            lastUpdatedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
        if !failed.isEmpty {
            errorMessage = "\(failed.count) booking update\(failed.count == 1 ? "" : "s") failed and remain selected. Review class capacity, credits, or current status."
        }
        return failed
    }

    private func refreshBookingOperationsSnapshot(session: AuthSession) async throws {
        async let bookingRequest = api.adminBookingRequests(session: session)
        async let operationsRequest = api.adminDailyOperations(session: session)
        async let waitlistRequest = api.adminWaitlist(session: session)
        let snapshot = try await (bookingRequest, operationsRequest, waitlistRequest)
        bookingRequests = snapshot.0
        dailyOperations = snapshot.1
        waitlist = snapshot.2
    }

    func saveLegacyBookingNotes(
        session: AuthSession,
        booking: AdminBookingRequest,
        notes: String
    ) async -> Bool {
        guard updatingBookingRequestIDs.isEmpty else { return false }
        updatingBookingRequestIDs = [booking.id]
        defer { updatingBookingRequestIDs = [] }
        do {
            try await api.adminUpdateLegacyBookingNotes(session: session, booking: booking, notes: notes)
            bookingRequests = try await api.adminBookingRequests(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
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
        guard loadedSources.contains("platform controls"),
              !refreshUnavailableSources.contains("platform controls"),
              !isLoading else {
            errorMessage = "Refresh Platform Controls before saving live settings."
            return false
        }
        if draft.bookings_enabled {
            guard loadedSources.contains("schema health"),
                  !refreshUnavailableSources.contains("schema health"),
                  schemaCapabilities.contains(where: { $0.capability == "member_booking_switch_guard" }) else {
                errorMessage = "Bookings stay paused until Operations Health verifies the member booking-switch guard."
                return false
            }
        }
        isSavingSettings = true
        defer { isSavingSettings = false }
        do {
            let activatingPayments = draft.payments_enabled && settings?.payments_enabled != true
            if activatingPayments {
                settings = try await api.adminActivatePlatformPayments(session: session, settings: draft)
                do {
                    commerceHealth = try await api.adminCommerceHealth(session: session)
                    loadedSources.insert("Stripe health")
                    refreshUnavailableSources.removeAll { $0 == "Stripe health" }
                } catch {
                    if !refreshUnavailableSources.contains("Stripe health") {
                        refreshUnavailableSources.append("Stripe health")
                    }
                }
            } else {
                settings = try await api.adminUpdatePlatformSettings(session: session, settings: draft)
            }
            loadedSources.insert("platform controls")
            refreshUnavailableSources.removeAll { $0 == "platform controls" }
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func resolveStripeReview(
        session: AuthSession,
        incident: AdminCommerceHealth.WebhookDelivery.Incident
    ) async -> Bool {
        guard resolvingStripeIncidentID == nil, let errorCode = incident.error_code else { return false }
        resolvingStripeIncidentID = incident.event_id
        defer { resolvingStripeIncidentID = nil }
        do {
            try await api.adminResolveStripeReview(
                session: session,
                eventID: incident.event_id,
                errorCode: errorCode
            )
            commerceHealth = try await api.adminCommerceHealth(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func retryStripeEvent(
        session: AuthSession,
        incident: AdminCommerceHealth.WebhookDelivery.Incident
    ) async -> Bool {
        guard retryingStripeIncidentID == nil, incident.resolution == nil else { return false }
        retryingStripeIncidentID = incident.event_id
        defer { retryingStripeIncidentID = nil }
        do {
            _ = try await api.adminRetryStripeEvent(session: session, eventID: incident.event_id)
            commerceHealth = try await api.adminCommerceHealth(session: session)
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

    func saveProduct(session: AuthSession, product: AdminProduct?, draft: AdminProductDraft) async -> Bool {
        guard savingProductID == nil else { return false }
        guard loadedSources.contains("session packs"),
              !refreshUnavailableSources.contains("session packs"),
              !isLoading else {
            errorMessage = "Refresh Session Packs & Pricing before saving catalogue changes."
            return false
        }
        savingProductID = product?.id ?? UUID()
        defer { savingProductID = nil }
        do {
            let savedProduct: AdminProduct
            if let product {
                savedProduct = try await api.adminUpdateProduct(session: session, product: product, draft: draft)
            } else {
                savedProduct = try await api.adminCreateProduct(session: session, draft: draft)
            }
            mergeProduct(savedProduct)
            lastUpdatedAt = Date()
            do {
                products = try await api.adminProducts(session: session)
                loadedSources.insert("session packs")
                refreshUnavailableSources.removeAll(where: { $0 == "session packs" })
            } catch {
                if !refreshUnavailableSources.contains("session packs") {
                    refreshUnavailableSources.append("session packs")
                }
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func mergeProduct(_ product: AdminProduct) {
        products.removeAll(where: { $0.id == product.id })
        products.append(product)
        products.sort {
            if $0.sort_order != $1.sort_order { return $0.sort_order < $1.sort_order }
            return $0.slug.localizedCaseInsensitiveCompare($1.slug) == .orderedAscending
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

    func saveAvailability(session: AuthSession, block: AdminAvailabilityBlock?, draft: AdminAvailabilityDraft) async -> Bool {
        guard savingScheduleWindowID == nil else { return false }
        savingScheduleWindowID = block?.id ?? UUID()
        defer { savingScheduleWindowID = nil }
        do {
            try await api.adminSaveAvailability(session: session, block: block, draft: draft)
            availabilityBlocks = try await api.adminAvailabilityBlocks(session: session)
            lastUpdatedAt = Date(); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func saveBlackout(session: AuthSession, period: AdminBlackoutPeriod?, draft: AdminBlackoutDraft) async -> Bool {
        guard savingScheduleWindowID == nil else { return false }
        savingScheduleWindowID = period?.id ?? UUID()
        defer { savingScheduleWindowID = nil }
        do {
            try await api.adminSaveBlackout(session: session, period: period, draft: draft)
            blackoutPeriods = try await api.adminBlackoutPeriods(session: session)
            lastUpdatedAt = Date(); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func deleteAvailability(session: AuthSession, block: AdminAvailabilityBlock) async -> Bool {
        guard deletingScheduleWindowID == nil else { return false }
        deletingScheduleWindowID = block.id
        defer { deletingScheduleWindowID = nil }
        do {
            try await api.adminDeleteAvailability(session: session, block: block)
            availabilityBlocks = try await api.adminAvailabilityBlocks(session: session)
            lastUpdatedAt = Date(); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func deleteBlackout(session: AuthSession, period: AdminBlackoutPeriod) async -> Bool {
        guard deletingScheduleWindowID == nil else { return false }
        deletingScheduleWindowID = period.id
        defer { deletingScheduleWindowID = nil }
        do {
            try await api.adminDeleteBlackout(session: session, period: period)
            blackoutPeriods = try await api.adminBlackoutPeriods(session: session)
            lastUpdatedAt = Date(); return true
        } catch { errorMessage = error.localizedDescription; return false }
    }
}
