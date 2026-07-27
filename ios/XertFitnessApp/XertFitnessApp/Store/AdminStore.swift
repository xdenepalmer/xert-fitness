import Foundation
import Combine

enum AdminOperationalQueueState: Equatable {
    case idle
    case loading
    case ready
    case partial(unavailableSources: [String])
}

enum AdminOperationalFreshness: Equatable {
    case loading
    case current
    case refreshing
    case stale
    case unavailable

    var label: String {
        switch self {
        case .loading: return "Checking"
        case .current: return "Live"
        case .refreshing: return "Syncing"
        case .stale: return "Stale"
        case .unavailable: return "Offline"
        }
    }
}

enum AdminOperationalRefreshPolicy {
    static let intervalNanoseconds: UInt64 = 60_000_000_000
    static let staleAfter: TimeInterval = 120

    static func freshness(
        hasCompletedRefresh: Bool,
        updatedAt: Date?,
        isRefreshing: Bool,
        hasUnavailableSources: Bool = false,
        now: Date = Date()
    ) -> AdminOperationalFreshness {
        guard let updatedAt else {
            return hasCompletedRefresh && !isRefreshing ? .unavailable : .loading
        }
        if isRefreshing { return .refreshing }
        if hasUnavailableSources { return .stale }
        return now.timeIntervalSince(updatedAt) <= staleAfter ? .current : .stale
    }
}

@MainActor
final class AdminStore: ObservableObject {
    @Published private(set) var dailyOperations: [AdminDailyOperation] = []
    @Published private(set) var waitlist: [AdminWaitlistItem] = []
    @Published private(set) var followUps: [AdminFollowUp] = []
    @Published private(set) var activationOverview: AdminMemberActivationOverview?
    @Published private(set) var activationQueue: [AdminMemberActivationItem] = []
    @Published private(set) var members: [AdminMemberSummary] = []
    @Published private(set) var memberDirectoryRows: [AdminMemberSummary] = []
    @Published private(set) var memberDirectoryTotal = 0
    @Published private(set) var hasLoadedMemberDirectory = false
    @Published private(set) var memberDirectoryUnavailable = false
    @Published private(set) var memberDirectoryStatusMessage: String?
    @Published private(set) var memberDirectorySearch = ""
    @Published private(set) var memberDirectoryRole = "all"
    @Published private(set) var memberDirectoryCredit = "all"
    @Published private(set) var memberDirectoryPage = 1
    @Published private(set) var memberNotes: [AdminMemberNote] = []
    @Published private(set) var memberNoteStatusMessage: String?
    @Published private(set) var memberNoteStatusIsWarning = false
    @Published private(set) var memberNotices: [AdminMemberNotice] = []
    @Published private(set) var memberNoticeStatusMessage: String?
    @Published private(set) var memberNoticeStatusIsWarning = false
    @Published private(set) var memberCreditBatches: [AdminMemberCreditBatch] = []
    @Published private(set) var memberCreditGrants: [AdminMemberCreditGrant] = []
    @Published private(set) var memberBookingHistory: [AdminMemberBookingHistory] = []
    @Published private(set) var memberOrderHistory: [OrderItem] = []
    @Published private(set) var memberOnboardingSummary: AdminMemberOnboardingSummary?
    @Published private(set) var revealedMemberEmergencyContact: AdminMemberEmergencyContactReveal?
    @Published private(set) var loadedMemberDetailID: UUID?
    @Published private(set) var memberDetailUnavailableSources: [String] = []
    @Published private(set) var orders: [OrderItem] = []
    @Published private(set) var settings: AdminPlatformSettings?
    @Published private(set) var ptRequests: [AdminPTRequest] = []
    @Published private(set) var announcements: [AdminAnnouncement] = []
    @Published private(set) var announcementDeliveryMetrics: [UUID: AdminAnnouncementDeliveryMetrics] = [:]
    @Published private(set) var announcementDeliveryStatusMessage: String?
    @Published private(set) var schemaCapabilities: [AdminSchemaCapability] = []
    @Published private(set) var commerceHealth: AdminCommerceHealth?
    @Published private(set) var resolvingStripeIncidentID: String?
    @Published private(set) var retryingStripeIncidentID: String?
    @Published private(set) var stripeIncidentStatusMessage: String?
    @Published private(set) var stripeIncidentStatusIsWarning = false
    @Published private(set) var pushHealth: AdminPushHealth?
    @Published private(set) var isSendingOwnerPushTest = false
    @Published private(set) var ownerPushTestStatusMessage: String?
    @Published private(set) var ownerPushTestStatusIsWarning = false
    @Published private(set) var auditEntries: [AdminAuditEntry] = []
    @Published private(set) var products: [AdminProduct] = []
    @Published private(set) var events: [AdminEvent] = []
    @Published private(set) var eventGoalCounts: [UUID: Int] = [:]
    @Published private(set) var eventRoster: [AdminEventGoalMember] = []
    @Published private(set) var eventCatalogueStatusMessage: String?
    @Published private(set) var eventRosterLoadedEventID: UUID?
    @Published private(set) var eventRosterUnavailableEventID: UUID?
    @Published private(set) var coaches: [AdminCoach] = []
    @Published private(set) var teamDirectoryStatusMessage: String?
    @Published private(set) var classRoster: [AdminRosterMember] = []
    @Published private(set) var classRosterReadiness: [UUID: AdminMemberOnboardingSummary] = [:]
    @Published private(set) var loadedRosterSessionID: UUID?
    @Published private(set) var loadedRosterAt: Date?
    @Published private(set) var rosterLoadErrorSessionID: UUID?
    @Published private(set) var rosterLoadErrorMessage: String?
    @Published private(set) var rosterReadinessStatusMessage: String?
    @Published private(set) var classSessions: [AdminClassSession] = []
    @Published private(set) var classCancellationFollowUp: AdminClassCancellationFollowUp?
    @Published private(set) var availabilityBlocks: [AdminAvailabilityBlock] = []
    @Published private(set) var blackoutPeriods: [AdminBlackoutPeriod] = []
    @Published private(set) var leadsByPipeline: [AdminLeadPipeline: [AdminLead]] = [:]
    @Published private(set) var leadActionCounts: AdminLeadActionCounts?
    @Published private(set) var campaignAttributionRows: [AdminCampaignAttributionRow] = []
    @Published private(set) var siteContentRows: [AdminSiteContentRow] = []
    @Published private(set) var bookingRequests: [AdminBookingRequest] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isRefreshingHealth = false
    @Published private(set) var isRefreshingOperations = false
    @Published private(set) var isSearchingMembers = false
    @Published private(set) var isExportingMembers = false
    @Published private(set) var ownerMemberSearchResults: [AdminMemberSummary] = []
    @Published private(set) var isSearchingOwnerMembers = false
    @Published private(set) var ownerMemberSearchError: String?
    @Published private(set) var resolvingOwnerTask: XertOwnerTask?
    @Published private(set) var ownerTaskResolutionErrorTask: XertOwnerTask?
    @Published private(set) var ownerTaskResolutionErrorMessage: String?
    @Published private(set) var promotingSessionID: UUID?
    @Published private(set) var promotionNoticeWarning: String?
    @Published private(set) var promotionStatusMessage: String?
    @Published private(set) var promotionStatusIsWarning = false
    @Published private(set) var bookingDecisionNoticeWarning: String?
    @Published private(set) var bookingDecisionStatusMessage: String?
    @Published private(set) var bookingDecisionStatusIsWarning = false
    @Published private(set) var bookingDecisionStatusSessionID: UUID?
    @Published private(set) var addingRosterMemberID: UUID?
    @Published private(set) var staffBookingFeedback: AdminStaffBookingFeedback?
    @Published private(set) var loggingFollowUpMemberID: UUID?
    @Published private(set) var isSavingSettings = false
    @Published private(set) var updatingPTRequestID: UUID?
    @Published private(set) var bulkUpdatingPTRequestIDs: Set<UUID> = []
    @Published private(set) var isPublishingAnnouncement = false
    @Published private(set) var isRefreshingAnnouncements = false
    @Published private(set) var announcementMutationID: UUID?
    @Published private(set) var announcementStatusMessage: String?
    @Published private(set) var announcementLoadErrorMessage: String?
    @Published private(set) var savingProductID: UUID?
    @Published private(set) var provisioningProductPriceID: UUID?
    @Published private(set) var savingEventID: UUID?
    @Published private(set) var deletingEventID: UUID?
    @Published private(set) var loadingEventRosterID: UUID?
    @Published private(set) var isRefreshingEventCatalogue = false
    @Published private(set) var isSeedingEventCalendar = false
    @Published private(set) var isRefreshingTeamDirectory = false
    @Published private(set) var savingCoachID: UUID?
    @Published private(set) var deletingCoachID: UUID?
    @Published private(set) var loadingRosterSessionID: UUID?
    @Published private(set) var updatingBookingID: UUID?
    @Published private(set) var recordingAttendanceSessionID: UUID?
    @Published private(set) var savingClassID: UUID?
    @Published private(set) var cancellingClassID: UUID?
    @Published private(set) var savingScheduleWindowID: UUID?
    @Published private(set) var deletingScheduleWindowID: UUID?
    @Published private(set) var isRefreshingScheduleControls = false
    @Published private(set) var scheduleMutationWarning: String?
    @Published private(set) var scheduleMutationIsWarning = false
    @Published private(set) var classMutationStatusMessage: String?
    @Published private(set) var classMutationStatusIsWarning = false
    @Published private(set) var loadingMemberDetailID: UUID?
    @Published private(set) var revealingEmergencyContactMemberID: UUID?
    @Published private(set) var sendingMemberNoticeID: UUID?
    @Published private(set) var servicingMemberID: UUID?
    @Published private(set) var operatingOrderID: UUID?
    @Published private(set) var orderOperationStatusMessage: String?
    @Published private(set) var orderOperationStatusIsWarning = false
    @Published private(set) var loadingLeadPipeline: AdminLeadPipeline?
    @Published private(set) var loadedLeadPipelines: Set<AdminLeadPipeline> = []
    @Published private(set) var unavailableLeadPipelines: Set<AdminLeadPipeline> = []
    @Published private(set) var leadPipelineStatusMessage: String?
    @Published private(set) var isLoadingCampaignAttribution = false
    @Published private(set) var hasLoadedCampaignAttribution = false
    @Published private(set) var campaignAttributionUnavailable = false
    @Published private(set) var campaignAttributionStatusMessage: String?
    @Published private(set) var campaignAttributionUpdatedAt: Date?
    @Published private(set) var isLoadingAudit = false
    @Published private(set) var hasLoadedAudit = false
    @Published private(set) var auditUnavailable = false
    @Published private(set) var auditPartialSources: [String] = []
    @Published private(set) var auditStatusMessage: String?
    @Published private(set) var auditUpdatedAt: Date?
    @Published private(set) var hasLoadedSiteContent = false
    @Published private(set) var siteContentUnavailable = false
    @Published private(set) var siteContentStatusMessage: String?
    @Published private(set) var isLoadingSiteContent = false
    @Published private(set) var savingSiteContentSection: AdminSiteContentSection?
    @Published private(set) var isUploadingSiteImage = false
    @Published private(set) var savingLeadIDs: Set<AdminLeadIdentifier> = []
    @Published private(set) var isLoadingBookingRequests = false
    @Published private(set) var hasLoadedBookingRequests = false
    @Published private(set) var bookingRequestsUnavailable = false
    @Published private(set) var bookingRequestStatusMessage: String?
    @Published private(set) var updatingBookingRequestIDs: Set<String> = []
    @Published private(set) var ptRequestStatusMessage: String?
    @Published private(set) var ptRequestStatusIsWarning = false
    @Published var errorMessage: String?
    @Published private(set) var lastUpdatedAt: Date?
    @Published private(set) var operationalUpdatedAt: Date?
    @Published private(set) var hasCompletedRefresh = false
    @Published private(set) var operationalQueueState: AdminOperationalQueueState = .idle
    @Published private(set) var refreshUnavailableSources: [String] = []
    @Published private(set) var loadedSources: Set<String> = []
    @Published private(set) var healthSourceUpdatedAt: [String: Date] = [:]
    @Published private(set) var launchGateUpdatedAt: Date?
    @Published private(set) var requiresReauthentication = false

    private let api: XertAPI
    private var apiSubscriptions = Set<AnyCancellable>()
    private var memberDirectoryGeneration: UInt = 0
    private var ownerMemberSearchGeneration: UInt = 0
    private var ownerTaskResolutionGeneration: UInt = 0
    private var memberDetailGeneration: UInt = 0
    private var emergencyContactRevealGeneration: UInt = 0
    private var healthRefreshGeneration: UInt = 0
    private var operationalRefreshGeneration: UInt = 0
    private var eventRosterGeneration: UInt = 0
    private var rosterLoadGeneration: UInt = 0
    private var requestedRosterSessionID: UUID?

    init(api: XertAPI = XertAPI()) {
        self.api = api
        NotificationCenter.default.publisher(for: .xertAPIUnauthorizedResponse, object: api)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                Task { @MainActor in
                    guard self?.requiresReauthentication == false else { return }
                    self?.requiresReauthentication = true
                }
            }
            .store(in: &apiSubscriptions)
    }

    func acknowledgeReauthenticationRequest() {
        requiresReauthentication = false
    }

    var memberCount: Int {
        max(members.map(\.total_count).max() ?? 0, members.count)
    }
    var requestedPlaces: Int { dailyOperations.reduce(0) { $0 + $1.requested_count + $1.public_request_count } }
    var waitingMembers: Int { waitlist.reduce(0) { $0 + $1.waitlist_count } }
    var attendanceDue: Int { dailyOperations.filter(\.attendance_due).count }
    var paidOrders: [OrderItem] { orders.filter { $0.status == "paid" } }
    private var paidAUDOrders: [OrderItem] {
        paidOrders.filter {
            let code = $0.currency?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
            return code.isEmpty || code == "AUD"
        }
    }
    var totalRevenueCents: Int { paidAUDOrders.reduce(0) { $0 + ($1.amount_cents ?? 0) } }
    var monthRevenueCents: Int {
        let calendar = EventItem.calendar
        return paidAUDOrders.filter { calendar.isDate($0.activityDate, equalTo: Date(), toGranularity: .month) }
            .reduce(0) { $0 + ($1.amount_cents ?? 0) }
    }
    var pendingPTRequests: Int { ptRequests.filter(\.isPending).count }
    var liveAnnouncements: Int { announcements.filter { $0.stateLabel == "Live" }.count }
    var isMutatingAnnouncements: Bool {
        isPublishingAnnouncement || announcementMutationID != nil || isRefreshingAnnouncements
    }
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
            + (healthSourceIsCurrent("push health") && pushHealth?.isOwnerLaunchReady() == false ? 1 : 0)
    }
    var hasHealthSnapshot: Bool {
        unavailableHealthSourceCount == 0
            && commerceHealth != nil
            && pushHealth != nil
    }

    var operationalFreshness: AdminOperationalFreshness {
        AdminOperationalRefreshPolicy.freshness(
            hasCompletedRefresh: hasCompletedRefresh,
            updatedAt: operationalUpdatedAt,
            isRefreshing: isRefreshingOperations,
            hasUnavailableSources: operationalQueueHasUnavailableSources
        )
    }

    var operationalQueueHasUnavailableSources: Bool {
        if case .partial = operationalQueueState { return true }
        return false
    }

    private static let healthSources: Set<String> = ["schema health", "Stripe health", "push health"]
    private static let launchGateSources: Set<String> = [
        "schema health", "Stripe health", "push health",
        "platform controls", "session packs", "full timetable"
    ]

    private func healthSourceIsCurrent(_ source: String) -> Bool {
        loadedSources.contains(source) && !refreshUnavailableSources.contains(source)
    }

    func refresh(session: AuthSession) async {
        guard !isLoading, !isRefreshingHealth, !isRefreshingOperations else { return }
        isLoading = true
        isLoadingAudit = true
        operationalQueueState = .loading
        defer {
            isLoading = false
            isLoadingAudit = false
        }

        async let operationsRequest = api.adminDailyOperations(session: session)
        async let waitlistRequest = api.adminWaitlist(session: session)
        async let followUpRequest = api.adminFollowUps(session: session)
        async let activationOverviewRequest = api.adminMemberActivationOverview(session: session)
        async let activationQueueRequest = api.adminMemberActivationQueue(session: session)
        async let memberRequest = api.adminMembers(session: session)
        async let orderRequest = api.adminOrders(session: session)
        async let settingsRequest = api.adminPlatformSettings(session: session)
        async let ptRequest = api.adminPTRequests(session: session)
        async let announcementRequest = api.adminAnnouncements(session: session)
        async let announcementReceiptMetricsRequest = api.adminAnnouncementReceiptMetrics(session: session)
        async let announcementPushMetricsRequest = api.adminAnnouncementPushMetrics(session: session)
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
        async let leadActionCountRequest = api.adminLeadActionCounts(session: session)

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
        do {
            activationOverview = try await activationOverviewRequest
            successfulSources.insert("member activation")
            loadedSource = true
        } catch { failures.append("member activation") }
        do {
            activationQueue = try await activationQueueRequest
            successfulSources.insert("activation actions")
            loadedSource = true
        } catch { failures.append("activation actions"); queueFailures.append("activation actions") }
        do { members = try await memberRequest; successfulSources.insert("members"); loadedSource = true }
        catch {
            // The member directory and server-backed health endpoints are the
            // most likely reads to meet a cold connection on first open. Retry
            // them once before presenting partial data, but never retry a stale
            // foreground refresh or a cancelled Command Centre task.
            if !loadedSources.contains("members"), !Task.isCancelled {
                do {
                    members = try await api.adminMembers(session: session)
                    successfulSources.insert("members")
                    loadedSource = true
                } catch { failures.append("members") }
            } else {
                failures.append("members")
            }
        }
        do {
            orders = try await orderRequest
            orderOperationStatusMessage = nil
            orderOperationStatusIsWarning = false
            successfulSources.insert("orders")
            loadedSource = true
        }
        catch { failures.append("orders"); queueFailures.append("orders") }
        do { settings = try await settingsRequest; successfulSources.insert("platform controls"); loadedSource = true }
        catch { failures.append("platform controls") }
        do {
            ptRequests = try await ptRequest
            successfulSources.insert("PT requests")
            ptRequestStatusMessage = nil
            ptRequestStatusIsWarning = false
            loadedSource = true
        }
        catch { failures.append("PT requests"); queueFailures.append("PT requests") }
        do {
            announcements = try await announcementRequest
            announcementLoadErrorMessage = nil
            successfulSources.insert("member notices")
            loadedSource = true
        }
        catch { failures.append("member notices") }
        do {
            let receiptRows = try await announcementReceiptMetricsRequest
            let pushRows = try await announcementPushMetricsRequest
            setAnnouncementDeliveryMetrics(receiptRows: receiptRows, pushRows: pushRows)
        } catch {
            announcementDeliveryStatusMessage = "Delivery evidence is temporarily unavailable. Existing counts may be out of date."
        }
        do { schemaCapabilities = try await capabilitiesRequest; successfulSources.insert("schema health"); loadedSource = true }
        catch { failures.append("schema health") }
        do {
            commerceHealth = try await commerceRequest
            stripeIncidentStatusMessage = nil
            stripeIncidentStatusIsWarning = false
            successfulSources.insert("Stripe health")
            loadedSource = true
        }
        catch {
            if !loadedSources.contains("Stripe health"), !Task.isCancelled {
                do {
                    commerceHealth = try await api.adminCommerceHealth(session: session)
                    stripeIncidentStatusMessage = nil
                    stripeIncidentStatusIsWarning = false
                    successfulSources.insert("Stripe health")
                    loadedSource = true
                } catch { failures.append("Stripe health") }
            } else {
                failures.append("Stripe health")
            }
        }
        do { pushHealth = try await pushRequest; successfulSources.insert("push health"); loadedSource = true }
        catch {
            if !loadedSources.contains("push health"), !Task.isCancelled {
                do {
                    pushHealth = try await api.adminPushHealth(session: session)
                    successfulSources.insert("push health")
                    loadedSource = true
                } catch { failures.append("push health") }
            } else {
                failures.append("push health")
            }
        }
        do {
            let snapshot = try await auditRequest
            auditEntries = snapshot.entries
            hasLoadedAudit = true
            auditUnavailable = false
            auditPartialSources = snapshot.unavailableSources
            auditStatusMessage = snapshot.isComplete
                ? nil
                : "Admin Audit is partial. Unavailable: \(snapshot.unavailableSources.joined(separator: ", "))."
            auditUpdatedAt = Date()
            loadedSources.insert("admin audit")
            if snapshot.isComplete {
                successfulSources.insert("admin audit")
            } else {
                failures.append("admin audit")
            }
            loadedSource = true
        } catch {
            auditUnavailable = true
            auditStatusMessage = hasLoadedAudit
                ? "Admin Audit could not refresh. The last loaded history is labelled as stale."
                : "Admin Audit could not load. Retry before relying on change history."
            failures.append("admin audit")
        }
        do { products = try await productRequest; successfulSources.insert("session packs"); loadedSource = true }
        catch { failures.append("session packs") }
        do {
            events = try await eventRequest
            successfulSources.insert("event calendar")
            eventCatalogueStatusMessage = nil
            loadedSource = true
        }
        catch { failures.append("event calendar") }
        do {
            eventGoalCounts = Dictionary(grouping: try await eventGoalsRequest, by: \.event_id).mapValues(\.count)
            successfulSources.insert("event training groups")
            loadedSource = true
        } catch { failures.append("event training groups") }
        do {
            coaches = try await coachRequest
            successfulSources.insert("team directory")
            teamDirectoryStatusMessage = nil
            loadedSource = true
        }
        catch { failures.append("team directory") }
        do { classSessions = try await classSessionRequest; successfulSources.insert("full timetable"); loadedSource = true }
        catch { failures.append("full timetable") }
        do { availabilityBlocks = try await availabilityRequest; successfulSources.insert("availability"); loadedSource = true }
        catch { failures.append("availability") }
        do { blackoutPeriods = try await blackoutRequest; successfulSources.insert("blackouts"); loadedSource = true }
        catch { failures.append("blackouts") }

        do {
            leadActionCounts = try await leadActionCountRequest
            successfulSources.insert("lead actions")
            loadedSource = true
        } catch { failures.append("lead actions"); queueFailures.append("lead actions") }

        if loadedSource {
            lastUpdatedAt = Date()
        }
        if queueFailures.isEmpty {
            operationalUpdatedAt = Date()
        }
        loadedSources.formUnion(successfulSources)
        let refreshedAt = Date()
        for source in successfulSources where Self.healthSources.contains(source) {
            healthSourceUpdatedAt[source] = refreshedAt
        }
        if Self.launchGateSources.isSubset(of: successfulSources) {
            launchGateUpdatedAt = refreshedAt
        }
        refreshUnavailableSources = failures
        if successfulSources.contains("waitlists"),
           successfulSources.contains("today's classes") {
            promotionStatusMessage = nil
            promotionStatusIsWarning = false
        }
        if successfulSources.contains("full timetable"),
           successfulSources.contains("today's classes") {
            classMutationStatusMessage = nil
            classMutationStatusIsWarning = false
        }
        hasCompletedRefresh = true
        operationalQueueState = queueFailures.isEmpty
            ? .ready
            : .partial(unavailableSources: queueFailures)
    }

    /// Refreshes the owner queues that can change during an active shift
    /// without replacing unrelated form, CMS, timetable, or directory state.
    @discardableResult
    func refreshOperationalPulse(session: AuthSession) async -> Bool {
        guard !isLoading,
              !isRefreshingHealth,
              !isRefreshingOperations,
              promotingSessionID == nil,
              loggingFollowUpMemberID == nil,
              updatingPTRequestID == nil,
              bulkUpdatingPTRequestIDs.isEmpty,
              updatingBookingID == nil,
              updatingBookingRequestIDs.isEmpty,
              recordingAttendanceSessionID == nil,
              operatingOrderID == nil,
              savingClassID == nil,
              cancellingClassID == nil,
              resolvingStripeIncidentID == nil,
              retryingStripeIncidentID == nil else { return false }

        operationalRefreshGeneration &+= 1
        let generation = operationalRefreshGeneration
        isRefreshingOperations = true
        defer {
            if generation == operationalRefreshGeneration {
                isRefreshingOperations = false
            }
        }

        async let operationsRequest = api.adminDailyOperations(session: session)
        async let waitlistRequest = api.adminWaitlist(session: session)
        async let followUpRequest = api.adminFollowUps(session: session)
        async let activationRequest = api.adminMemberActivationQueue(session: session)
        async let orderRequest = api.adminOrders(session: session)
        async let ptRequest = api.adminPTRequests(session: session)
        async let leadActionCountRequest = api.adminLeadActionCounts(session: session)

        var failures: [String] = []
        var successfulSources = Set<String>()

        do {
            let next = try await operationsRequest
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            dailyOperations = next
            successfulSources.insert("today's classes")
        } catch {
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            failures.append("today's classes")
        }
        do {
            let next = try await waitlistRequest
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            waitlist = next
            successfulSources.insert("waitlists")
        } catch {
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            failures.append("waitlists")
        }
        do {
            let next = try await followUpRequest
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            followUps = next
            successfulSources.insert("retention")
        } catch {
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            failures.append("retention")
        }
        do {
            let next = try await activationRequest
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            activationQueue = next
            successfulSources.insert("activation actions")
        } catch {
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            failures.append("activation actions")
        }
        do {
            let next = try await orderRequest
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            orders = next
            successfulSources.insert("orders")
        } catch {
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            failures.append("orders")
        }
        do {
            let next = try await ptRequest
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            ptRequests = next
            successfulSources.insert("PT requests")
            ptRequestStatusMessage = nil
            ptRequestStatusIsWarning = false
        } catch {
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            failures.append("PT requests")
        }

        do {
            let next = try await leadActionCountRequest
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            leadActionCounts = next
            successfulSources.insert("lead actions")
        } catch {
            guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
            failures.append("lead actions")
        }

        guard !Task.isCancelled, generation == operationalRefreshGeneration else { return false }
        loadedSources.formUnion(successfulSources)
        let operationalSources: Set<String> = [
            "today's classes", "waitlists", "retention",
            "activation actions", "orders", "PT requests", "lead actions"
        ]
        refreshUnavailableSources.removeAll { operationalSources.contains($0) }
        refreshUnavailableSources.append(contentsOf: failures)
        operationalQueueState = failures.isEmpty
            ? .ready
            : .partial(unavailableSources: failures)
        if failures.isEmpty {
            operationalUpdatedAt = Date()
        }
        return true
    }

    /// Refreshes the bounded release-health and launch-gate contracts used by Operations Health.
    /// Failed requests preserve their last successful payload. The source is
    /// marked unavailable so stale snapshots cannot be presented as current.
    /// Partial availability stays inline and never raises a global modal alert.
    func refreshHealth(session: AuthSession) async {
        guard !isLoading,
              !isRefreshingHealth,
              !isSavingSettings,
              savingProductID == nil,
              savingClassID == nil,
              cancellingClassID == nil,
              resolvingStripeIncidentID == nil,
              retryingStripeIncidentID == nil else { return }
        healthRefreshGeneration &+= 1
        let generation = healthRefreshGeneration
        isRefreshingHealth = true
        defer { isRefreshingHealth = false }

        async let capabilitiesRequest = api.adminSchemaCapabilities(session: session)
        async let commerceRequest = api.adminCommerceHealth(session: session)
        async let pushRequest = api.adminPushHealth(session: session)
        async let settingsRequest = api.adminPlatformSettings(session: session)
        async let productRequest = api.adminProducts(session: session)
        async let classSessionRequest = api.adminClassSessions(session: session)

        var failures: [String] = []
        var successfulSources = Set<String>()

        do {
            let nextCapabilities = try await capabilitiesRequest
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            schemaCapabilities = nextCapabilities
            successfulSources.insert("schema health")
        } catch {
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            failures.append("schema health")
        }
        do {
            let nextCommerceHealth = try await commerceRequest
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            commerceHealth = nextCommerceHealth
            stripeIncidentStatusMessage = nil
            stripeIncidentStatusIsWarning = false
            successfulSources.insert("Stripe health")
        } catch {
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            failures.append("Stripe health")
        }
        do {
            let nextPushHealth = try await pushRequest
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            pushHealth = nextPushHealth
            successfulSources.insert("push health")
        } catch {
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            failures.append("push health")
        }
        do {
            let nextSettings = try await settingsRequest
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            settings = nextSettings
            successfulSources.insert("platform controls")
        } catch {
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            failures.append("platform controls")
        }
        do {
            let nextProducts = try await productRequest
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            products = nextProducts
            successfulSources.insert("session packs")
        } catch {
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            failures.append("session packs")
        }
        do {
            let nextClassSessions = try await classSessionRequest
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            classSessions = nextClassSessions
            successfulSources.insert("full timetable")
        } catch {
            guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
            failures.append("full timetable")
        }

        guard !Task.isCancelled, generation == healthRefreshGeneration else { return }
        let refreshedAt = Date()
        loadedSources.formUnion(successfulSources)
        for source in successfulSources {
            healthSourceUpdatedAt[source] = refreshedAt
        }
        if Self.launchGateSources.isSubset(of: successfulSources) {
            launchGateUpdatedAt = refreshedAt
        } else {
            launchGateUpdatedAt = nil
        }

        // Replace only health failures. Unrelated stale owner data must survive
        // this scoped retry unchanged.
        refreshUnavailableSources.removeAll {
            Self.healthSources.contains($0) || Self.launchGateSources.contains($0)
        }
        refreshUnavailableSources.append(contentsOf: failures)
    }

    func searchMembers(session: AuthSession, query: String,
        role: String = "all",
        credit: String = "all",
        page: Int = 1,
        pageSize: Int = 50
    ) async {
        memberDirectoryGeneration &+= 1
        let generation = memberDirectoryGeneration
        isSearchingMembers = true
        defer {
            if generation == memberDirectoryGeneration {
                isSearchingMembers = false
            }
        }
        do {
            let safePage = max(page, 1)
            let safePageSize = min(max(pageSize, 1), 100)
            let rows = try await api.adminMembers(
                session: session,
                search: query,
                role: role,
                credit: credit,
                limit: safePageSize,
                offset: (safePage - 1) * safePageSize
            )
            guard !Task.isCancelled, generation == memberDirectoryGeneration else { return }
            memberDirectoryRows = rows
            memberDirectoryTotal = rows.first?.total_count ?? 0
            memberDirectorySearch = query.trimmingCharacters(in: .whitespacesAndNewlines)
            memberDirectoryRole = role
            memberDirectoryCredit = credit
            memberDirectoryPage = safePage
            hasLoadedMemberDirectory = true
            memberDirectoryUnavailable = false
            memberDirectoryStatusMessage = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == memberDirectoryGeneration else { return }
            memberDirectoryUnavailable = true
            memberDirectoryStatusMessage = hasLoadedMemberDirectory
                ? "Members could not refresh. The last loaded page is shown and exports are paused."
                : "Members could not load. Check the connection and retry."
        }
    }

    func exportMembers(
        session: AuthSession,
        query: String,
        role: String = "all",
        credit: String = "all"
    ) async -> AdminMemberReport? {
        guard !isExportingMembers else { return nil }
        isExportingMembers = true
        defer { isExportingMembers = false }

        do {
            let pageSize = 100
            let maximumRows = 10_000
            var rows: [AdminMemberSummary] = []
            var expectedTotal: Int?

            while rows.count < (expectedTotal ?? Int.max) {
                let page = try await api.adminMembers(
                    session: session,
                    search: query,
                    role: role,
                    credit: credit,
                    limit: pageSize,
                    offset: rows.count
                )
                if expectedTotal == nil {
                    expectedTotal = page.first?.total_count ?? page.count
                    guard (expectedTotal ?? 0) <= maximumRows else {
                        throw APIError(message: "This export exceeds 10,000 members. Narrow the filters and try again.")
                    }
                }
                rows.append(contentsOf: page)
                if page.count < pageSize { break }
            }

            return AdminMemberReport(rows: rows)
        } catch {
            errorMessage = error.localizedDescription
            return nil
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

    func resetOwnerTaskResolution() {
        ownerTaskResolutionGeneration &+= 1
        resolvingOwnerTask = nil
        ownerTaskResolutionErrorTask = nil
        ownerTaskResolutionErrorMessage = nil
    }

    func resolveOwnerTask(session: AuthSession, task: XertOwnerTask) async {
        ownerTaskResolutionGeneration &+= 1
        let generation = ownerTaskResolutionGeneration
        ownerTaskResolutionErrorTask = nil
        ownerTaskResolutionErrorMessage = nil

        let requiresResolution: Bool
        switch task {
        case .member(let memberID):
            requiresResolution = !members.contains(where: { $0.id == memberID })
        case .classSession(let sessionID):
            requiresResolution = !dailyOperations.contains(where: { $0.id == sessionID })
        case .classSetup(let sessionID):
            let timetableIsCurrent = loadedSources.contains("full timetable")
                && !refreshUnavailableSources.contains("full timetable")
            requiresResolution = !classSessions.contains(where: { $0.id == sessionID })
                || !timetableIsCurrent
        case .product(let productID):
            requiresResolution = !products.contains(where: { $0.id == productID })
        case .order(let orderID):
            requiresResolution = !orders.contains(where: { $0.id == orderID })
        case .event(let eventID):
            requiresResolution = !events.contains(where: { $0.id == eventID })
        case .announcement(let announcementID):
            requiresResolution = !announcements.contains(where: { $0.id == announcementID })
        case .ptRequest(let requestID):
            let ptRequestsAreCurrent = loadedSources.contains("PT requests")
                && !refreshUnavailableSources.contains("PT requests")
            requiresResolution = !ptRequests.contains(where: { $0.id == requestID })
                || !ptRequestsAreCurrent
        case .bookingRequest(let source, let recordID):
            requiresResolution = !bookingRequests.contains(where: {
                $0.source == source && $0.routeRecordID == recordID
            }) || !bookingRequestsAreCurrent
        }
        guard requiresResolution else {
            resolvingOwnerTask = nil
            return
        }

        resolvingOwnerTask = task
        defer {
            if ownerTaskResolutionGeneration == generation,
               resolvingOwnerTask == task {
                resolvingOwnerTask = nil
            }
        }
        do {
            switch task {
            case .member(let memberID):
                let member = try await api.adminMember(session: session, id: memberID)
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                mergeResolvedMember(member)
            case .classSession(let sessionID):
                let operations = try await api.adminDailyOperations(session: session)
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                guard operations.contains(where: { $0.id == sessionID }) else { return }
                dailyOperations = operations
                loadedSources.insert("today's classes")
                refreshUnavailableSources.removeAll { $0 == "today's classes" }
            case .classSetup(let sessionID):
                let timetable = try await api.adminClassSessions(session: session)
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                guard timetable.contains(where: { $0.id == sessionID }) else { return }
                classSessions = timetable
                loadedSources.insert("full timetable")
                refreshUnavailableSources.removeAll { $0 == "full timetable" }
            case .product(let productID):
                let refreshedProducts = try await api.adminProducts(session: session)
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                guard refreshedProducts.contains(where: { $0.id == productID }) else { return }
                products = refreshedProducts
                loadedSources.insert("session packs")
                refreshUnavailableSources.removeAll { $0 == "session packs" }
            case .order(let orderID):
                let order = try await api.adminOrder(session: session, id: orderID)
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                orders.removeAll(where: { $0.id == orderID })
                orders.insert(order, at: 0)
                loadedSources.insert("orders")
                refreshUnavailableSources.removeAll { $0 == "orders" }
            case .event(let eventID):
                let event = try await api.adminEvent(session: session, id: eventID)
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                events.removeAll(where: { $0.id == eventID })
                events.insert(event, at: 0)
                loadedSources.insert("event calendar")
                refreshUnavailableSources.removeAll { $0 == "event calendar" }
            case .announcement(let announcementID):
                let announcement = try await api.adminAnnouncement(
                    session: session,
                    id: announcementID
                )
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                mergeAnnouncement(announcement)
                loadedSources.insert("member notices")
                refreshUnavailableSources.removeAll { $0 == "member notices" }
            case .ptRequest(let requestID):
                let refreshedRequests = try await api.adminPTRequests(session: session)
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                ptRequests = refreshedRequests
                loadedSources.insert("PT requests")
                refreshUnavailableSources.removeAll { $0 == "PT requests" }
                guard refreshedRequests.contains(where: { $0.id == requestID }) else { return }
            case .bookingRequest(let source, let recordID):
                let refreshedRequests = try await api.adminBookingRequests(session: session)
                guard ownerTaskResolutionGeneration == generation,
                      resolvingOwnerTask == task else { return }
                bookingRequests = refreshedRequests
                hasLoadedBookingRequests = true
                bookingRequestsUnavailable = false
                bookingRequestStatusMessage = nil
                guard refreshedRequests.contains(where: {
                    $0.source == source && $0.routeRecordID == recordID
                }) else { return }
            }
        } catch {
            guard ownerTaskResolutionGeneration == generation,
                  resolvingOwnerTask == task else { return }
            ownerTaskResolutionErrorTask = task
            ownerTaskResolutionErrorMessage = "XERT could not securely load this protected record. Check your connection and try again."
        }
    }

    func loadMemberDetail(
        session: AuthSession,
        memberID: UUID,
        preserveCurrent: Bool = false
    ) async {
        guard servicingMemberID != memberID else { return }
        memberDetailGeneration &+= 1
        let generation = memberDetailGeneration
        let canPreserveCurrent = preserveCurrent && loadedMemberDetailID == memberID
        loadedMemberDetailID = memberID
        memberNoticeStatusMessage = nil
        memberNoticeStatusIsWarning = false
        revealedMemberEmergencyContact = nil
        memberDetailUnavailableSources = []
        if !canPreserveCurrent {
            memberNotes = []
            memberNoteStatusMessage = nil
            memberNoteStatusIsWarning = false
            memberNotices = []
            memberCreditBatches = []
            memberCreditGrants = []
            memberBookingHistory = []
            memberOrderHistory = []
            memberOnboardingSummary = nil
        }
        loadingMemberDetailID = memberID
        defer {
            if memberDetailGeneration == generation { loadingMemberDetailID = nil }
        }

        async let notesRequest = api.adminMemberNotes(session: session, memberID: memberID)
        async let noticesRequest = api.adminMemberNotices(session: session, memberID: memberID)
        async let creditsRequest = api.adminMemberCreditBatches(session: session, memberID: memberID)
        async let grantsRequest = api.adminMemberCreditGrants(session: session, memberID: memberID)
        async let bookingsRequest = api.adminMemberBookings(session: session, memberID: memberID)
        async let ordersRequest = api.adminMemberOrders(session: session, memberID: memberID)
        async let onboardingRequest = api.adminMemberOnboardingSummary(session: session, memberID: memberID)
        var failures: [String] = []

        do {
            let notes = try await notesRequest
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            memberNotes = notes
            memberNoteStatusMessage = nil
            memberNoteStatusIsWarning = false
        } catch {
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            failures.append("staff timeline")
        }

        do {
            let summary = try await onboardingRequest
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            memberOnboardingSummary = summary
        } catch {
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            failures.append("member readiness")
        }

        do {
            let notices = try await noticesRequest
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            memberNotices = notices
        } catch {
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            failures.append("private notices")
        }

        do {
            let credits = try await creditsRequest
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            memberCreditBatches = credits
        } catch {
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            failures.append("credit history")
        }

        do {
            let grants = try await grantsRequest
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            memberCreditGrants = grants
        } catch {
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            failures.append("credit audit")
        }

        do {
            let bookings = try await bookingsRequest
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            memberBookingHistory = bookings
        } catch {
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            failures.append("booking history")
        }

        do {
            let orders = try await ordersRequest
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            memberOrderHistory = orders
        } catch {
            guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
            failures.append("purchase history")
        }

        guard memberDetailGeneration == generation, loadedMemberDetailID == memberID else { return }
        memberDetailUnavailableSources = failures
    }

    func clearMemberDetail(memberID: UUID) {
        guard loadedMemberDetailID == memberID else { return }
        memberDetailGeneration &+= 1
        emergencyContactRevealGeneration &+= 1
        loadedMemberDetailID = nil
        loadingMemberDetailID = nil
        revealingEmergencyContactMemberID = nil
        sendingMemberNoticeID = nil
        memberNotes = []
        memberNoteStatusMessage = nil
        memberNoteStatusIsWarning = false
        memberNotices = []
        memberNoticeStatusMessage = nil
        memberNoticeStatusIsWarning = false
        memberCreditBatches = []
        memberCreditGrants = []
        memberBookingHistory = []
        memberOrderHistory = []
        memberOnboardingSummary = nil
        revealedMemberEmergencyContact = nil
        memberDetailUnavailableSources = []
    }

    func clearRevealedMemberEmergencyContact() {
        emergencyContactRevealGeneration &+= 1
        revealingEmergencyContactMemberID = nil
        revealedMemberEmergencyContact = nil
    }

    func revealMemberEmergencyContact(session: AuthSession, memberID: UUID) async {
        guard revealingEmergencyContactMemberID == nil,
              loadedMemberDetailID == memberID,
              loadingMemberDetailID == nil,
              !memberDetailUnavailableSources.contains("member readiness"),
              memberOnboardingSummary?.emergency_contact_complete == true else { return }
        let generation = memberDetailGeneration
        emergencyContactRevealGeneration &+= 1
        let revealGeneration = emergencyContactRevealGeneration
        revealingEmergencyContactMemberID = memberID
        defer {
            if memberDetailGeneration == generation,
               emergencyContactRevealGeneration == revealGeneration {
                revealingEmergencyContactMemberID = nil
            }
        }
        do {
            let reveal = try await api.adminRevealMemberEmergencyContact(session: session, memberID: memberID)
            guard memberDetailGeneration == generation,
                  emergencyContactRevealGeneration == revealGeneration,
                  loadedMemberDetailID == memberID else { return }
            revealedMemberEmergencyContact = reveal
            XertHaptics.play(.success)
        } catch {
            guard memberDetailGeneration == generation,
                  emergencyContactRevealGeneration == revealGeneration else { return }
            errorMessage = error.localizedDescription
            XertHaptics.play(.error)
        }
    }

    func addMemberNote(session: AuthSession, memberID: UUID, category: String, body: String) async -> Bool {
        guard servicingMemberID == nil,
              loadedMemberDetailID == memberID,
              loadingMemberDetailID == nil,
              !memberDetailUnavailableSources.contains("staff timeline") else {
            errorMessage = "Refresh this member record before adding a staff note."
            return false
        }
        let generation = memberDetailGeneration
        servicingMemberID = memberID
        memberNoteStatusMessage = nil
        memberNoteStatusIsWarning = false
        defer {
            if servicingMemberID == memberID { servicingMemberID = nil }
        }
        let noteID: UUID
        do {
            noteID = try await api.adminAddMemberNote(
                session: session,
                memberID: memberID,
                category: category,
                body: body
            )
        } catch {
            guard memberDetailGeneration == generation,
                  loadedMemberDetailID == memberID else { return false }
            errorMessage = error.localizedDescription
            return false
        }
        do {
            let notes = try await api.adminMemberNotes(session: session, memberID: memberID)
            guard memberDetailGeneration == generation,
                  loadedMemberDetailID == memberID else { return true }
            memberNotes = notes
            memberDetailUnavailableSources.removeAll { $0 == "staff timeline" }
            memberNoteStatusMessage = "Staff note saved and timeline verified."
            memberNoteStatusIsWarning = false
        } catch {
            guard memberDetailGeneration == generation,
                  loadedMemberDetailID == memberID else { return true }
            if !memberDetailUnavailableSources.contains("staff timeline") {
                memberDetailUnavailableSources.append("staff timeline")
            }
            memberNoteStatusMessage = "Staff note saved with receipt \(noteID.uuidString.lowercased()), but the timeline could not refresh. Do not add it again; pull down to verify."
            memberNoteStatusIsWarning = true
        }
        lastUpdatedAt = Date()
        return true
    }

    func archiveMemberNote(session: AuthSession, memberID: UUID, note: AdminMemberNote) async -> Bool {
        guard servicingMemberID == nil,
              loadedMemberDetailID == memberID,
              loadingMemberDetailID == nil,
              !memberDetailUnavailableSources.contains("staff timeline") else {
            errorMessage = "Refresh this member record before changing its staff timeline."
            return false
        }
        let generation = memberDetailGeneration
        servicingMemberID = memberID
        memberNoteStatusMessage = nil
        memberNoteStatusIsWarning = false
        defer {
            if servicingMemberID == memberID { servicingMemberID = nil }
        }
        do {
            try await api.adminArchiveMemberNote(session: session, noteID: note.id, archived: note.archived_at == nil)
        } catch {
            guard memberDetailGeneration == generation,
                  loadedMemberDetailID == memberID else { return false }
            errorMessage = error.localizedDescription
            return false
        }
        do {
            let notes = try await api.adminMemberNotes(session: session, memberID: memberID)
            guard memberDetailGeneration == generation,
                  loadedMemberDetailID == memberID else { return true }
            memberNotes = notes
            memberDetailUnavailableSources.removeAll { $0 == "staff timeline" }
            memberNoteStatusMessage = note.archived_at == nil
                ? "Staff note archived and timeline verified."
                : "Staff note restored and timeline verified."
            memberNoteStatusIsWarning = false
        } catch {
            guard memberDetailGeneration == generation,
                  loadedMemberDetailID == memberID else { return true }
            if !memberDetailUnavailableSources.contains("staff timeline") {
                memberDetailUnavailableSources.append("staff timeline")
            }
            memberNoteStatusMessage = note.archived_at == nil
                ? "The note was archived, but the timeline could not refresh. Do not repeat the action; pull down to verify."
                : "The note was restored, but the timeline could not refresh. Do not repeat the action; pull down to verify."
            memberNoteStatusIsWarning = true
        }
        lastUpdatedAt = Date()
        return true
    }

    func sendMemberNotice(
        session: AuthSession,
        memberID: UUID,
        draft: AdminMemberNoticeDraft
    ) async -> Bool {
        guard servicingMemberID == nil,
              sendingMemberNoticeID == nil,
              loadedMemberDetailID == memberID,
              loadingMemberDetailID == nil,
              !memberDetailUnavailableSources.contains("private notices") else {
            errorMessage = "Refresh this member record before sending a private notice."
            return false
        }
        servicingMemberID = memberID
        sendingMemberNoticeID = memberID
        memberNoticeStatusMessage = nil
        memberNoticeStatusIsWarning = false
        let generation = memberDetailGeneration
        defer {
            servicingMemberID = nil
            sendingMemberNoticeID = nil
        }
        do {
            let outcome = try await api.adminSendMemberNotice(
                session: session,
                memberID: memberID,
                draft: draft
            )
            var historyUnavailable = false
            do {
                let notices = try await api.adminMemberNotices(session: session, memberID: memberID)
                guard memberDetailGeneration == generation,
                      loadedMemberDetailID == memberID else { return true }
                memberNotices = notices
                memberDetailUnavailableSources.removeAll { $0 == "private notices" }
            } catch {
                guard memberDetailGeneration == generation,
                      loadedMemberDetailID == memberID else { return true }
                historyUnavailable = true
                if !memberDetailUnavailableSources.contains("private notices") {
                    memberDetailUnavailableSources.append("private notices")
                }
            }
            if let warning = outcome.warning {
                memberNoticeStatusMessage = warning
                memberNoticeStatusIsWarning = true
            } else if historyUnavailable {
                memberNoticeStatusMessage = "Private notice sent, but delivery history could not refresh."
                memberNoticeStatusIsWarning = true
            } else if (outcome.push?.delivered ?? 0) > 0 {
                memberNoticeStatusMessage = "Private notice sent and Apple push delivered."
            } else {
                memberNoticeStatusMessage = "Private notice sent. It is available in the member app."
            }
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func grantCredits(session: AuthSession, memberID: UUID, sessions: Int, validityDays: Int?, requestID: UUID, note: String) async -> Bool {
        guard servicingMemberID == nil else { return false }
        guard loadedMemberDetailID == memberID,
              loadingMemberDetailID == nil,
              !memberDetailUnavailableSources.contains("credit audit") else {
            errorMessage = "Credit audit is unavailable. Refresh this member record before granting credits."
            return false
        }
        servicingMemberID = memberID; defer { servicingMemberID = nil }
        do {
            _ = try await api.adminGrantCredits(session: session, memberID: memberID, sessions: sessions, validityDays: validityDays, requestID: requestID, note: note)
            var refreshWarnings: [String] = []
            do {
                mergeResolvedMember(try await api.adminMember(session: session, id: memberID))
            } catch {
                refreshWarnings.append("member balance")
            }
            if loadedMemberDetailID == memberID {
                do {
                    memberCreditBatches = try await api.adminMemberCreditBatches(
                        session: session,
                        memberID: memberID
                    )
                    memberDetailUnavailableSources.removeAll { $0 == "credit history" }
                } catch {
                    refreshWarnings.append("credit history")
                    if !memberDetailUnavailableSources.contains("credit history") {
                        memberDetailUnavailableSources.append("credit history")
                    }
                }
                do {
                    memberCreditGrants = try await api.adminMemberCreditGrants(
                        session: session,
                        memberID: memberID
                    )
                    memberDetailUnavailableSources.removeAll { $0 == "credit audit" }
                } catch {
                    refreshWarnings.append("credit audit")
                    if !memberDetailUnavailableSources.contains("credit audit") {
                        memberDetailUnavailableSources.append("credit audit")
                    }
                }
            }
            if !refreshWarnings.isEmpty {
                errorMessage = "Credits were granted, but \(refreshWarnings.joined(separator: " and ")) could not refresh."
            }
            await refreshLoadedMemberDirectory(session: session)
            lastUpdatedAt = Date()
            return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func setMemberRole(session: AuthSession, memberID: UUID, role: String) async -> Bool {
        guard servicingMemberID == nil,
              loadedMemberDetailID == memberID,
              loadingMemberDetailID == nil,
              memberDetailUnavailableSources.isEmpty else {
            errorMessage = "Refresh this member record before changing administrator access."
            return false
        }
        servicingMemberID = memberID; defer { servicingMemberID = nil }
        do {
            try await api.adminSetRole(session: session, memberID: memberID, role: role)
        } catch {
            errorMessage = error.localizedDescription
            return false
        }

        do {
            mergeResolvedMember(try await api.adminMember(session: session, id: memberID))
        } catch {
            errorMessage = "The role was updated, but the member summary could not refresh."
        }
        await refreshLoadedMemberDirectory(session: session)
        lastUpdatedAt = Date()
        return true
    }

    private func refreshLoadedMemberDirectory(session: AuthSession) async {
        guard hasLoadedMemberDirectory else { return }
        await searchMembers(
            session: session,
            query: memberDirectorySearch,
            role: memberDirectoryRole,
            credit: memberDirectoryCredit,
            page: memberDirectoryPage
        )
    }

    private func mergeResolvedMember(_ member: AdminMemberSummary) {
        members.removeAll { $0.id == member.id }
        members.insert(member, at: 0)
    }

    func reconcileOrder(session: AuthSession, order: OrderItem) async -> AdminReconciliationResult? {
        guard operatingOrderID == nil else { return nil }
        guard loadedSources.contains("orders"),
              !refreshUnavailableSources.contains("orders"),
              !isLoading else {
            errorMessage = "Refresh Orders before reconciling a payment."
            return nil
        }
        guard order.isRecoverable else {
            errorMessage = "Only unresolved orders with a Stripe Checkout Session can be reconciled."
            return nil
        }
        operatingOrderID = order.id
        orderOperationStatusMessage = nil
        orderOperationStatusIsWarning = false
        defer { operatingOrderID = nil }
        let result: AdminReconciliationResult
        do {
            result = try await api.adminReconcileOrder(session: session, orderID: order.id)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
        await refreshOrdersAfterConfirmedOperation(
            session: session,
            staleMessage: "Stripe reconciliation was confirmed, but the order ledger could not refresh. Do not repeat the reconciliation; refresh Orders to verify the latest record."
        )
        lastUpdatedAt = Date()
        return result
    }

    func refundOrder(
        session: AuthSession,
        order: OrderItem,
        reason: String,
        confirmation: String
    ) async -> AdminRefundResult? {
        guard operatingOrderID == nil else { return nil }
        guard loadedSources.contains("orders"),
              !refreshUnavailableSources.contains("orders"),
              !isLoading else {
            errorMessage = "Refresh Orders before submitting a refund."
            return nil
        }
        guard order.isRefundable else {
            errorMessage = "Only a fully paid, unreimbursed Stripe order can be refunded."
            return nil
        }
        operatingOrderID = order.id
        orderOperationStatusMessage = nil
        orderOperationStatusIsWarning = false
        defer { operatingOrderID = nil }
        let result: AdminRefundResult
        do {
            result = try await api.adminRefundOrder(
                session: session,
                orderID: order.id,
                reason: reason,
                confirmation: confirmation
            )
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
        await refreshOrdersAfterConfirmedOperation(
            session: session,
            staleMessage: "Stripe refund was confirmed, but the order ledger could not refresh. Do not submit another refund; refresh Orders to verify the latest record."
        )
        lastUpdatedAt = Date()
        return result
    }

    private func refreshOrdersAfterConfirmedOperation(
        session: AuthSession,
        staleMessage: String
    ) async {
        do {
            orders = try await api.adminOrders(session: session)
            loadedSources.insert("orders")
            refreshUnavailableSources.removeAll { $0 == "orders" }
            orderOperationStatusMessage = "Order ledger refreshed and verified."
            orderOperationStatusIsWarning = false
        } catch {
            if !refreshUnavailableSources.contains("orders") {
                refreshUnavailableSources.append("orders")
            }
            orderOperationStatusMessage = staleMessage
            orderOperationStatusIsWarning = true
        }
    }

    func leads(for pipeline: AdminLeadPipeline) -> [AdminLead] {
        leadsByPipeline[pipeline] ?? []
    }

    func loadCampaignAttribution(session: AuthSession, force: Bool = false) async {
        guard !isLoadingCampaignAttribution else { return }
        if !force, campaignAttributionIsCurrent { return }
        isLoadingCampaignAttribution = true
        defer { isLoadingCampaignAttribution = false }
        do {
            campaignAttributionRows = try await api.adminCampaignAttribution(session: session)
            hasLoadedCampaignAttribution = true
            campaignAttributionUnavailable = false
            campaignAttributionStatusMessage = nil
            campaignAttributionUpdatedAt = Date()
            lastUpdatedAt = Date()
        } catch {
            campaignAttributionUnavailable = true
            campaignAttributionStatusMessage = hasLoadedCampaignAttribution
                ? "Campaign Attribution could not refresh. The last loaded report remains visible but is stale."
                : "Campaign Attribution could not load. Retry before relying on acquisition totals."
        }
    }

    var campaignAttributionIsCurrent: Bool {
        hasLoadedCampaignAttribution && !campaignAttributionUnavailable
    }

    var auditIsCurrent: Bool {
        hasLoadedAudit
            && !auditUnavailable
            && auditPartialSources.isEmpty
            && loadedSources.contains("admin audit")
            && !refreshUnavailableSources.contains("admin audit")
    }

    func loadAudit(session: AuthSession, force: Bool = false) async {
        guard !isLoadingAudit else { return }
        if !force, auditIsCurrent { return }
        isLoadingAudit = true
        defer { isLoadingAudit = false }
        do {
            let snapshot = try await api.adminAudit(session: session)
            auditEntries = snapshot.entries
            hasLoadedAudit = true
            auditUnavailable = false
            auditPartialSources = snapshot.unavailableSources
            auditStatusMessage = snapshot.isComplete
                ? nil
                : "Admin Audit is partial. Unavailable: \(snapshot.unavailableSources.joined(separator: ", "))."
            auditUpdatedAt = Date()
            loadedSources.insert("admin audit")
            if snapshot.isComplete {
                refreshUnavailableSources.removeAll { $0 == "admin audit" }
            } else if !refreshUnavailableSources.contains("admin audit") {
                refreshUnavailableSources.append("admin audit")
            }
            lastUpdatedAt = Date()
        } catch {
            auditUnavailable = true
            if !refreshUnavailableSources.contains("admin audit") {
                refreshUnavailableSources.append("admin audit")
            }
            auditStatusMessage = hasLoadedAudit
                ? "Admin Audit could not refresh. The last loaded history remains visible but is stale."
                : "Admin Audit could not load. Retry before relying on change history."
        }
    }

    func siteContentRow(for section: AdminSiteContentSection) -> AdminSiteContentRow? {
        siteContentRows.first { $0.key == section.rawValue }
    }

    var siteContentIsCurrent: Bool {
        hasLoadedSiteContent && !siteContentUnavailable
    }

    func loadSiteContent(session: AuthSession, force: Bool = false) async {
        guard !isLoadingSiteContent else { return }
        if !force, siteContentIsCurrent { return }
        isLoadingSiteContent = true
        defer { isLoadingSiteContent = false }
        do {
            siteContentRows = try await api.adminSiteContent(session: session)
            hasLoadedSiteContent = true
            siteContentUnavailable = false
            siteContentStatusMessage = nil
            lastUpdatedAt = Date()
        } catch {
            siteContentUnavailable = true
            siteContentStatusMessage = "Site Content could not refresh. Last loaded sections remain read-only."
        }
    }

    func saveSiteContent(
        session: AuthSession,
        section: AdminSiteContentSection,
        expectedUpdatedAt: String?,
        draft: AdminSiteContentData
    ) async -> AdminSiteContentRow? {
        guard savingSiteContentSection == nil,
              !isLoadingSiteContent,
              !isUploadingSiteImage else { return nil }
        guard siteContentIsCurrent else {
            errorMessage = "Refresh Site Content before publishing website changes."
            return nil
        }
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
            siteContentRows.sort { $0.key < $1.key }
            siteContentUnavailable = false
            siteContentStatusMessage = nil
            AdminSiteContentDraftStore.clear(section, ownerID: session.user?.id)
            lastUpdatedAt = Date()
            return saved
        } catch {
            siteContentUnavailable = true
            siteContentStatusMessage = "Site Content changed or could not be verified. Refresh and review the latest live section before publishing again."
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
        guard !isUploadingSiteImage,
              savingSiteContentSection == nil,
              !isLoadingSiteContent else { return nil }
        guard siteContentIsCurrent else {
            errorMessage = "Refresh Site Content before uploading public media."
            return nil
        }
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

    func leadPipelineIsCurrent(_ pipeline: AdminLeadPipeline) -> Bool {
        loadedLeadPipelines.contains(pipeline) && !unavailableLeadPipelines.contains(pipeline)
    }

    private func refreshLeadPipelineAfterMutation(
        session: AuthSession,
        pipeline: AdminLeadPipeline,
        completedAction: String
    ) async {
        async let pipelineRequest = api.adminLeads(session: session, pipeline: pipeline)
        async let countRequest = api.adminLeadActionCounts(session: session)

        do {
            leadsByPipeline[pipeline] = try await pipelineRequest
            loadedLeadPipelines.insert(pipeline)
            unavailableLeadPipelines.remove(pipeline)
            leadPipelineStatusMessage = nil
        } catch {
            unavailableLeadPipelines.insert(pipeline)
            leadPipelineStatusMessage = "\(completedAction), but the latest pipeline could not be loaded. Refresh before making another change."
        }

        do {
            leadActionCounts = try await countRequest
            loadedSources.insert("lead actions")
            refreshUnavailableSources.removeAll { $0 == "lead actions" }
            if case .partial(let unavailableSources) = operationalQueueState {
                let remaining = unavailableSources.filter { $0 != "lead actions" }
                operationalQueueState = remaining.isEmpty
                    ? .ready
                    : .partial(unavailableSources: remaining)
            }
        } catch {
            if !refreshUnavailableSources.contains("lead actions") {
                refreshUnavailableSources.append("lead actions")
            }
            switch operationalQueueState {
            case .partial(let unavailableSources):
                if !unavailableSources.contains("lead actions") {
                    operationalQueueState = .partial(
                        unavailableSources: unavailableSources + ["lead actions"]
                    )
                }
            case .ready:
                operationalQueueState = .partial(unavailableSources: ["lead actions"])
            case .idle, .loading:
                break
            }
        }
    }

    func loadLeads(session: AuthSession, pipeline: AdminLeadPipeline, force: Bool = false) async {
        guard loadingLeadPipeline == nil else { return }
        if !force,
           loadedLeadPipelines.contains(pipeline),
           !unavailableLeadPipelines.contains(pipeline) { return }
        loadingLeadPipeline = pipeline
        defer { loadingLeadPipeline = nil }
        do {
            leadsByPipeline[pipeline] = try await api.adminLeads(session: session, pipeline: pipeline)
            loadedLeadPipelines.insert(pipeline)
            unavailableLeadPipelines.remove(pipeline)
            leadPipelineStatusMessage = nil
            lastUpdatedAt = Date()
        } catch {
            unavailableLeadPipelines.insert(pipeline)
            leadPipelineStatusMessage = "Could not refresh \(pipeline.title.lowercased()). Last loaded leads remain read-only."
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
        guard leadPipelineIsCurrent(pipeline) else {
            errorMessage = "Refresh \(pipeline.title.lowercased()) before changing this lead."
            return false
        }
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
            await refreshLeadPipelineAfterMutation(
                session: session,
                pipeline: pipeline,
                completedAction: "\(lead.displayName) was updated"
            )
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
        guard leadPipelineIsCurrent(pipeline) else {
            errorMessage = "Refresh \(pipeline.title.lowercased()) before updating selected leads."
            return false
        }
        savingLeadIDs = ids
        defer { savingLeadIDs = [] }
        do {
            try await api.adminUpdateLeadStatuses(
                session: session,
                pipeline: pipeline,
                leadIDs: Array(ids),
                status: status
            )
            await refreshLeadPipelineAfterMutation(
                session: session,
                pipeline: pipeline,
                completedAction: "\(ids.count) lead\(ids.count == 1 ? " was" : "s were") updated"
            )
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func loadBookingRequests(session: AuthSession, force: Bool = false) async {
        guard !isLoadingBookingRequests else { return }
        if !force, hasLoadedBookingRequests, !bookingRequestsUnavailable { return }
        isLoadingBookingRequests = true
        defer { isLoadingBookingRequests = false }
        do {
            bookingRequests = try await api.adminBookingRequests(session: session)
            hasLoadedBookingRequests = true
            bookingRequestsUnavailable = false
            bookingRequestStatusMessage = nil
            lastUpdatedAt = Date()
        } catch {
            bookingRequestsUnavailable = true
            bookingRequestStatusMessage = "Booking requests could not refresh. Last loaded requests remain read-only."
        }
    }

    var bookingRequestsAreCurrent: Bool {
        hasLoadedBookingRequests && !bookingRequestsUnavailable
    }

    func updateBookingRequest(
        session: AuthSession,
        booking: AdminBookingRequest,
        status: String
    ) async -> Bool {
        guard updatingBookingRequestIDs.isEmpty else { return false }
        guard bookingRequestsAreCurrent else {
            errorMessage = "Refresh Booking Requests before changing a booking."
            return false
        }
        updatingBookingRequestIDs = [booking.id]
        defer { updatingBookingRequestIDs = [] }
        do {
            bookingDecisionStatusSessionID = nil
            bookingDecisionNoticeWarning = nil
            let warning = try await api.adminUpdateBookingRequestStatus(session: session, booking: booking, status: status)
            bookingDecisionNoticeWarning = warning
            await refreshBookingOperationsAfterMutation(
                session: session,
                completedAction: "\(booking.fullName)'s booking was updated"
            )
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
        guard bookingRequestsAreCurrent else {
            errorMessage = "Refresh Booking Requests before updating selected bookings."
            return Set(bookings.map(\.id))
        }
        updatingBookingRequestIDs = Set(bookings.map(\.id))
        bookingDecisionStatusSessionID = nil
        defer { updatingBookingRequestIDs = [] }
        var failed: Set<String> = []
        for booking in bookings {
            do {
                let warning = try await api.adminUpdateBookingRequestStatus(session: session, booking: booking, status: status)
                if let warning { bookingDecisionNoticeWarning = warning }
            }
            catch { failed.insert(booking.id) }
        }
        let succeeded = bookings.count - failed.count
        if succeeded > 0 {
            await refreshBookingOperationsAfterMutation(
                session: session,
                completedAction: "\(succeeded) booking\(succeeded == 1 ? " was" : "s were") updated"
            )
            lastUpdatedAt = Date()
        }
        if !failed.isEmpty {
            errorMessage = "\(failed.count) booking update\(failed.count == 1 ? "" : "s") failed and remain selected. Review class capacity, credits, or current status."
        }
        return failed
    }

    private func refreshBookingOperationsAfterMutation(
        session: AuthSession,
        completedAction: String
    ) async {
        async let bookingRequest = api.adminBookingRequests(session: session)
        async let operationsRequest = api.adminDailyOperations(session: session)
        async let waitlistRequest = api.adminWaitlist(session: session)
        var failures: [String] = []
        do {
            bookingRequests = try await bookingRequest
            hasLoadedBookingRequests = true
            bookingRequestsUnavailable = false
        } catch {
            bookingRequestsUnavailable = true
            failures.append("booking requests")
        }
        do {
            dailyOperations = try await operationsRequest
            loadedSources.insert("today's classes")
            refreshUnavailableSources.removeAll { $0 == "today's classes" }
        } catch {
            failures.append("today's classes")
            if !refreshUnavailableSources.contains("today's classes") {
                refreshUnavailableSources.append("today's classes")
            }
        }
        do {
            waitlist = try await waitlistRequest
            loadedSources.insert("waitlists")
            refreshUnavailableSources.removeAll { $0 == "waitlists" }
        } catch {
            failures.append("waitlists")
            if !refreshUnavailableSources.contains("waitlists") {
                refreshUnavailableSources.append("waitlists")
            }
        }
        bookingRequestStatusMessage = failures.isEmpty
            ? nil
            : "\(completedAction), but \(failures.joined(separator: " and ")) could not refresh."
    }

    func saveLegacyBookingNotes(
        session: AuthSession,
        booking: AdminBookingRequest,
        notes: String
    ) async -> Bool {
        guard updatingBookingRequestIDs.isEmpty else { return false }
        guard bookingRequestsAreCurrent else {
            errorMessage = "Refresh Booking Requests before changing staff notes."
            return false
        }
        updatingBookingRequestIDs = [booking.id]
        defer { updatingBookingRequestIDs = [] }
        do {
            try await api.adminUpdateLegacyBookingNotes(session: session, booking: booking, notes: notes)
            await refreshBookingOperationsAfterMutation(
                session: session,
                completedAction: "Staff notes were saved"
            )
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func promoteNext(
        session: AuthSession,
        classSessionID: UUID,
        expectedBookingID: UUID,
        requestID: UUID
    ) async -> Bool {
        guard promotingSessionID == nil else { return false }
        promotingSessionID = classSessionID
        promotionNoticeWarning = nil
        promotionStatusMessage = nil
        promotionStatusIsWarning = false
        defer { promotingSessionID = nil }

        let outcome: AdminWaitlistPromotionOutcome
        do {
            outcome = try await api.adminPromoteNextWaitlisted(
                session: session,
                classSessionID: classSessionID,
                expectedBookingID: expectedBookingID,
                requestID: requestID
            )
        } catch {
            let message = error.localizedDescription
            if message.localizedCaseInsensitiveContains("WAITLIST_CHANGED")
                || message.localizedCaseInsensitiveContains("WAITLIST_PROMOTION_REQUEST_CONFLICT") {
                errorMessage = "The queue changed before confirmation. Refresh and review the next member."
            } else if message.localizedCaseInsensitiveContains("admin_promote_next_waitlisted_with_notice") {
                errorMessage = "Apply the waitlist promotion notifications migration before promoting members."
            } else {
                errorMessage = message
            }
            return false
        }

        promotionNoticeWarning = outcome.warning
        var unavailableReadbacks: [String] = []
        do {
            waitlist = try await api.adminWaitlist(session: session)
            markScheduleSourceCurrent("waitlists")
        } catch {
            markScheduleSourceUnavailable("waitlists")
            unavailableReadbacks.append("waitlists")
        }
        do {
            dailyOperations = try await api.adminDailyOperations(session: session)
            markScheduleSourceCurrent("today's classes")
        } catch {
            markScheduleSourceUnavailable("today's classes")
            unavailableReadbacks.append("today's classes")
        }

        let bookingReceipt = outcome.promotion.booking_id.uuidString.lowercased()
        if unavailableReadbacks.isEmpty {
            promotionStatusMessage = "Member promoted. Booking receipt \(bookingReceipt)."
        } else {
            promotionStatusIsWarning = true
            promotionStatusMessage = "Member promoted, but \(unavailableReadbacks.joined(separator: " and ")) could not reload. Booking receipt \(bookingReceipt). Do not promote another member; refresh Class Desk."
        }
        lastUpdatedAt = Date()
        return true
    }

    @discardableResult
    func loadClassRoster(
        session: AuthSession,
        classSessionID: UUID,
        preserveCurrent: Bool = false
    ) async -> Bool {
        if requestedRosterSessionID != classSessionID {
            staffBookingFeedback = nil
        }
        rosterLoadGeneration &+= 1
        let generation = rosterLoadGeneration
        requestedRosterSessionID = classSessionID
        loadingRosterSessionID = classSessionID
        rosterLoadErrorSessionID = nil
        rosterLoadErrorMessage = nil
        let canPreserveCurrent = preserveCurrent && loadedRosterSessionID == classSessionID
        if !canPreserveCurrent {
            loadedRosterSessionID = nil
            loadedRosterAt = nil
            classRoster = []
            classRosterReadiness = [:]
        }
        rosterReadinessStatusMessage = nil
        defer {
            if rosterLoadGeneration == generation {
                loadingRosterSessionID = nil
            }
        }
        do {
            let roster = try await api.adminSessionRoster(session: session, classSessionID: classSessionID)
            guard rosterLoadGeneration == generation else { return false }
            loadedRosterSessionID = classSessionID
            loadedRosterAt = Date()
            classRoster = roster
            do {
                let summaries = try await api.adminMemberOnboardingSummaries(
                    session: session,
                    memberIDs: roster.map(\.member_id)
                )
                guard rosterLoadGeneration == generation else { return false }
                classRosterReadiness = Dictionary(
                    uniqueKeysWithValues: summaries.map { ($0.user_id, $0) }
                )
            } catch {
                guard rosterLoadGeneration == generation else { return false }
                rosterReadinessStatusMessage = "Member readiness is unavailable. Open a member record before relying on their training clearance."
            }
            return true
        } catch {
            guard rosterLoadGeneration == generation else { return false }
            rosterLoadErrorSessionID = classSessionID
            rosterLoadErrorMessage = error.localizedDescription
            return false
        }
    }

    func setBookingStatus(
        session: AuthSession,
        classSessionID: UUID,
        bookingID: UUID,
        status: String
    ) async -> Bool {
        guard updatingBookingID == nil,
              requestedRosterSessionID == classSessionID,
              loadedRosterSessionID == classSessionID,
              rosterLoadErrorSessionID != classSessionID else {
            errorMessage = "Refresh this class roster before changing another booking."
            return false
        }
        updatingBookingID = bookingID
        bookingDecisionNoticeWarning = nil
        bookingDecisionStatusMessage = nil
        bookingDecisionStatusIsWarning = false
        bookingDecisionStatusSessionID = nil
        defer { updatingBookingID = nil }

        let outcome: AdminBookingDecisionOutcome
        do {
            outcome = try await api.adminSetBookingStatus(
                session: session,
                bookingID: bookingID,
                status: status
            )
        } catch {
            errorMessage = error.localizedDescription
            return false
        }

        bookingDecisionNoticeWarning = outcome.warning
        bookingDecisionStatusSessionID = classSessionID
        var unavailableReadbacks: [String] = []
        if requestedRosterSessionID == classSessionID {
            let rosterRefreshed = await loadClassRoster(
                session: session,
                classSessionID: classSessionID,
                preserveCurrent: true
            )
            if !rosterRefreshed {
                unavailableReadbacks.append("class roster")
            }
        }
        do {
            dailyOperations = try await api.adminDailyOperations(session: session)
            markCatalogueSourceCurrent("today's classes")
        } catch {
            markCatalogueSourceUnavailable("today's classes")
            unavailableReadbacks.append("today's classes")
        }
        do {
            waitlist = try await api.adminWaitlist(session: session)
            markCatalogueSourceCurrent("waitlists")
        } catch {
            markCatalogueSourceUnavailable("waitlists")
            unavailableReadbacks.append("waitlists")
        }

        let receipt = outcome.decision.booking_id.uuidString.lowercased()
        let updatedStatus = outcome.decision.new_status.replacingOccurrences(of: "_", with: " ")
        bookingDecisionStatusIsWarning = outcome.warning != nil || !unavailableReadbacks.isEmpty
        bookingDecisionStatusMessage = unavailableReadbacks.isEmpty
            ? "Booking \(receipt) is now \(updatedStatus)."
            : "Booking \(receipt) is now \(updatedStatus), but \(unavailableReadbacks.joined(separator: " and ")) could not reload. Do not repeat this decision; refresh the roster."
        lastUpdatedAt = Date()
        return true
    }

    func bookMemberIntoClass(
        session: AuthSession,
        classSessionID: UUID,
        member: AdminMemberSummary,
        requestID: UUID
    ) async -> Bool {
        guard addingRosterMemberID == nil,
              requestedRosterSessionID == classSessionID,
              loadedRosterSessionID == classSessionID,
              rosterLoadErrorSessionID != classSessionID else { return false }
        addingRosterMemberID = member.id
        staffBookingFeedback = nil
        defer { addingRosterMemberID = nil }

        do {
            let outcome = try await api.adminBookMemberIntoClass(
                session: session,
                classSessionID: classSessionID,
                memberID: member.id,
                requestID: requestID
            )
            var refreshFailures: [String] = []
            let rosterRefreshed = await loadClassRoster(
                session: session,
                classSessionID: classSessionID,
                preserveCurrent: true
            )
            if !rosterRefreshed { refreshFailures.append("roster") }
            do {
                dailyOperations = try await api.adminDailyOperations(session: session)
                loadedSources.insert("today's classes")
                refreshUnavailableSources.removeAll { $0 == "today's classes" }
            } catch {
                refreshFailures.append("today's classes")
                if !refreshUnavailableSources.contains("today's classes") {
                    refreshUnavailableSources.append("today's classes")
                }
            }
            do {
                waitlist = try await api.adminWaitlist(session: session)
                loadedSources.insert("waitlists")
                refreshUnavailableSources.removeAll { $0 == "waitlists" }
            } catch {
                refreshFailures.append("waitlist")
                if !refreshUnavailableSources.contains("waitlists") {
                    refreshUnavailableSources.append("waitlists")
                }
            }

            let placement = outcome.receipt.booking_status == "confirmed"
                ? "confirmed in the class"
                : "added to the FIFO waitlist"
            var details = ["\(member.displayName) was \(placement)."]
            if let warning = outcome.warning { details.append(warning) }
            if !refreshFailures.isEmpty {
                details.append(
                    "\(refreshFailures.joined(separator: " and ").capitalized) could not refresh."
                )
            }
            staffBookingFeedback = AdminStaffBookingFeedback(
                sessionID: classSessionID,
                message: details.joined(separator: " "),
                needsAttention: outcome.warning != nil || !refreshFailures.isEmpty
            )
            lastUpdatedAt = Date()
            return true
        } catch {
            let message = error.localizedDescription
            if message.localizedCaseInsensitiveContains("MEMBER_HAS_NO_CREDITS") {
                errorMessage = "\(member.displayName) has no available class credits. Grant credits or choose a session pack first."
            } else if message.localizedCaseInsensitiveContains("MEMBER_ALREADY_ON_ROSTER") {
                errorMessage = "\(member.displayName) already has an active place or waitlist entry for this class."
            } else if message.localizedCaseInsensitiveContains("STAFF_BOOKING_REQUEST_CONFLICT") {
                errorMessage = "This booking request was already used for another member. Close the picker and try again."
            } else if message.localizedCaseInsensitiveContains("CLASS_CAPACITY_INVALID") {
                errorMessage = "Set a valid class capacity before adding members."
            } else if message.localizedCaseInsensitiveContains("SESSION_FINISHED") {
                errorMessage = "This class has finished and can no longer accept roster additions."
            } else if message.localizedCaseInsensitiveContains("SESSION_INTEREST_ONLY") {
                errorMessage = "This class collects interest only and cannot accept roster bookings."
            } else if message.localizedCaseInsensitiveContains("SESSION_NOT_BOOKABLE") {
                errorMessage = "This class is not currently open for roster bookings."
            } else if message.localizedCaseInsensitiveContains("BOOKING_TIME_CONFLICT") {
                errorMessage = "\(member.displayName) already has another class at this time."
            } else if message.localizedCaseInsensitiveContains("MEMBER_NOT_BOOKABLE") {
                errorMessage = "Choose an active member account. Staff and administrator accounts cannot be booked into classes."
            } else if message.localizedCaseInsensitiveContains("admin_book_member_into_class") {
                errorMessage = "Apply the staff-assisted booking migration before adding members from Class Desk."
            } else {
                errorMessage = message
            }
            return false
        }
    }

    func recordAttendance(
        session: AuthSession,
        classSessionID: UUID,
        attendedIDs: [UUID],
        noShowIDs: [UUID]
    ) async -> Bool {
        guard recordingAttendanceSessionID == nil,
              requestedRosterSessionID == classSessionID,
              loadedRosterSessionID == classSessionID else { return false }
        recordingAttendanceSessionID = classSessionID
        defer { recordingAttendanceSessionID = nil }
        do {
            try await api.adminRecordAttendance(
                session: session,
                classSessionID: classSessionID,
                attendedIDs: attendedIDs,
                noShowIDs: noShowIDs
            )
            if requestedRosterSessionID == classSessionID {
                await loadClassRoster(
                    session: session,
                    classSessionID: classSessionID,
                    preserveCurrent: true
                )
            }
            dailyOperations = try await api.adminDailyOperations(session: session)
            lastUpdatedAt = Date()
            return true
        } catch {
            let message = error.localizedDescription
            if message.localizedCaseInsensitiveContains("PENDING_BOOKING_REQUESTS") {
                errorMessage = "Confirm or decline every pending booking request before completing this class."
            } else {
                errorMessage = message
            }
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

    func logActivationFollowUp(
        session: AuthSession,
        member: AdminMemberActivationItem,
        channel: String
    ) async -> Bool {
        guard loggingFollowUpMemberID == nil else { return false }
        loggingFollowUpMemberID = member.id
        defer { loggingFollowUpMemberID = nil }
        do {
            try await api.adminAddMemberNote(
                session: session,
                memberID: member.id,
                category: "follow_up",
                body: "Activation follow-up completed via \(channel). Next step: \(member.reasonLabel)."
            )
            activationQueue.removeAll { $0.id == member.id }
            lastUpdatedAt = Date()
            do {
                activationQueue = try await api.adminMemberActivationQueue(session: session)
                loadedSources.insert("activation actions")
                refreshUnavailableSources.removeAll { $0 == "activation actions" }
            } catch {
                if !refreshUnavailableSources.contains("activation actions") {
                    refreshUnavailableSources.append("activation actions")
                }
            }
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
        guard !draft.payments_enabled || draft.bookings_enabled else {
            errorMessage = "Open member bookings before enabling session-pack payments."
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
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
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

    func pauseMemberOperations(session: AuthSession) async -> Bool {
        guard !isSavingSettings else { return false }
        let sourceIsCurrent = loadedSources.contains("platform controls")
            && !refreshUnavailableSources.contains("platform controls")
            && !isLoading
        let plan = AdminEmergencyPausePlan(
            settings: settings,
            sourceIsCurrent: sourceIsCurrent
        )
        guard let pausedSettings = plan.pausedSettings else {
            errorMessage = plan.state == .paused
                ? "New member bookings and checkout are already paused."
                : "Refresh Platform Controls before using the emergency pause."
            return false
        }
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
        isSavingSettings = true
        defer { isSavingSettings = false }
        do {
            settings = try await api.adminPauseMemberOperations(
                session: session,
                settings: pausedSettings
            )
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
        guard healthSourceIsCurrent("Stripe health") else {
            errorMessage = "Refresh Operations Health before marking this Stripe incident handled."
            return false
        }
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
        stripeIncidentStatusMessage = nil
        stripeIncidentStatusIsWarning = false
        resolvingStripeIncidentID = incident.event_id
        defer { resolvingStripeIncidentID = nil }

        let receipt: AdminStripeReviewResolutionResponse
        do {
            receipt = try await api.adminResolveStripeReview(
                session: session,
                eventID: incident.event_id,
                errorCode: errorCode
            )
        } catch {
            errorMessage = error.localizedDescription
            return false
        }

        do {
            commerceHealth = try await api.adminCommerceHealth(session: session)
            markCatalogueSourceCurrent("Stripe health")
        } catch {
            markCatalogueSourceUnavailable("Stripe health")
            stripeIncidentStatusIsWarning = true
        }
        stripeIncidentStatusMessage = stripeIncidentStatusIsWarning
            ? "Stripe incident \(receipt.event_id) was marked handled, but Operations Health could not reload. Do not mark it again; refresh this screen."
            : "Stripe incident \(receipt.event_id) was marked handled."
        lastUpdatedAt = Date()
        return true
    }

    func retryStripeEvent(
        session: AuthSession,
        incident: AdminCommerceHealth.WebhookDelivery.Incident
    ) async -> Bool {
        guard retryingStripeIncidentID == nil, incident.resolution == nil else { return false }
        guard healthSourceIsCurrent("Stripe health") else {
            errorMessage = "Refresh Operations Health before retrying this Stripe incident."
            return false
        }
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
        stripeIncidentStatusMessage = nil
        stripeIncidentStatusIsWarning = false
        retryingStripeIncidentID = incident.event_id
        defer { retryingStripeIncidentID = nil }

        let receipt: AdminStripeRetryResponse
        do {
            receipt = try await api.adminRetryStripeEvent(session: session, eventID: incident.event_id)
        } catch {
            errorMessage = error.localizedDescription
            return false
        }

        var details = receipt.duplicate
            ? "Stripe incident \(receipt.event_id) was already processed safely."
            : "Stripe incident \(receipt.event_id) retry finished with status \(receipt.status)."
        if receipt.status == "failed" {
            stripeIncidentStatusIsWarning = true
            details += " Owner review is still required."
        }
        do {
            commerceHealth = try await api.adminCommerceHealth(session: session)
            markCatalogueSourceCurrent("Stripe health")
        } catch {
            markCatalogueSourceUnavailable("Stripe health")
            stripeIncidentStatusIsWarning = true
            details += " Operations Health could not reload. Do not retry it again; refresh this screen."
        }
        stripeIncidentStatusMessage = details
        lastUpdatedAt = Date()
        return true
    }

    func updatePTRequest(
        session: AuthSession,
        request: AdminPTRequest,
        status: String,
        notes: String? = nil,
        updateNotes: Bool = false
    ) async -> Bool {
        guard updatingPTRequestID == nil, bulkUpdatingPTRequestIDs.isEmpty else { return false }
        guard ptRequestsAreCurrent else {
            errorMessage = "Refresh PT Requests before changing this request."
            return false
        }
        guard updateNotes || request.allowedNextStatuses.contains(status) else {
            errorMessage = "This PT request cannot move from \(request.status) to \(status)."
            return false
        }
        updatingPTRequestID = request.id
        ptRequestStatusMessage = nil
        ptRequestStatusIsWarning = false
        defer { updatingPTRequestID = nil }

        let receipt: UUID
        do {
            receipt = try await api.adminUpdatePTRequest(
                session: session,
                requestID: request.id,
                status: status,
                adminNotes: notes,
                updateNotes: updateNotes
            )
        } catch {
            errorMessage = error.localizedDescription
            return false
        }

        let queueRefreshed = await refreshPTRequestsAfterMutation(session: session)
        let action = updateNotes ? "Private PT notes saved" : "PT request updated"
        let receiptText = receipt.uuidString.lowercased()
        ptRequestStatusIsWarning = !queueRefreshed
        ptRequestStatusMessage = queueRefreshed
            ? "\(action). Audit receipt \(receiptText)."
            : "\(action), but the latest queue could not reload. Audit receipt \(receiptText). Do not repeat this change; refresh PT Requests."
        lastUpdatedAt = Date()
        return true
    }

    func sendOwnerPushSmokeTest(session: AuthSession) async -> Bool {
        guard !isLoading,
              !isRefreshingHealth,
              !isSendingOwnerPushTest,
              healthSourceIsCurrent("push health"),
              pushHealth?.ready == true else {
            ownerPushTestStatusMessage = "Refresh Operations Health and resolve APNs setup before sending a production test."
            ownerPushTestStatusIsWarning = true
            return false
        }
        isSendingOwnerPushTest = true
        ownerPushTestStatusMessage = nil
        ownerPushTestStatusIsWarning = false
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
        defer { isSendingOwnerPushTest = false }

        let result: AdminOwnerPushSmokeTestResult
        do {
            result = try await api.adminSendOwnerPushSmokeTest(session: session)
        } catch {
            ownerPushTestStatusMessage = "The production owner push test could not be completed. Check APNs health and retry."
            ownerPushTestStatusIsWarning = true
            return false
        }

        var healthRefreshed = false
        do {
            pushHealth = try await api.adminPushHealth(session: session)
            loadedSources.insert("push health")
            refreshUnavailableSources.removeAll { $0 == "push health" }
            healthSourceUpdatedAt["push health"] = Date()
            lastUpdatedAt = Date()
            healthRefreshed = true
        } catch {
            if !refreshUnavailableSources.contains("push health") {
                refreshUnavailableSources.append("push health")
            }
        }

        if !result.configured {
            ownerPushTestStatusMessage = "Production APNs configuration changed during the test. Restore the missing Vercel values, redeploy, and refresh launch gates."
            ownerPushTestStatusIsWarning = true
            return false
        }
        if result.attempted == 0 {
            ownerPushTestStatusMessage = "No production owner device is registered. Install the TestFlight build, sign in as this owner, and enable Member notice notifications."
            ownerPushTestStatusIsWarning = true
            return false
        }
        if result.delivered == result.attempted, result.failed == 0 {
            ownerPushTestStatusMessage = healthRefreshed
                ? "Production push delivered to \(result.delivered) owner device\(result.delivered == 1 ? "" : "s"). Refresh all launch gates to certify the current release."
                : "Production push delivered, but live APNs health could not refresh. Retry launch-gate verification before certifying the release."
            ownerPushTestStatusIsWarning = !healthRefreshed
            return true
        }
        ownerPushTestStatusMessage = "\(result.delivered) of \(result.attempted) owner-device pushes reached APNs; \(result.failed) failed. Review the latest APNs attempt below."
        ownerPushTestStatusIsWarning = true
        return false
    }

    func bulkUpdatePTRequests(
        session: AuthSession,
        requests: [AdminPTRequest],
        status: String
    ) async -> Set<UUID> {
        guard updatingPTRequestID == nil, bulkUpdatingPTRequestIDs.isEmpty else {
            return Set(requests.map(\.id))
        }
        guard ptRequestsAreCurrent else {
            errorMessage = "Refresh PT Requests before changing selected requests."
            return Set(requests.map(\.id))
        }

        let boundedRequests = Array(requests.prefix(50))
        guard !boundedRequests.isEmpty else { return [] }
        guard boundedRequests.allSatisfy({ $0.allowedNextStatuses.contains(status) }) else {
            errorMessage = "Selected PT requests do not share a valid next status."
            return Set(requests.map(\.id))
        }
        bulkUpdatingPTRequestIDs = Set(boundedRequests.map(\.id))
        ptRequestStatusMessage = nil
        ptRequestStatusIsWarning = false
        defer { bulkUpdatingPTRequestIDs = [] }

        var mutationFailures = Set<UUID>()
        var auditReceipts: [UUID] = []
        for request in boundedRequests {
            do {
                let receipt = try await api.adminUpdatePTRequest(
                    session: session,
                    requestID: request.id,
                    status: status,
                    adminNotes: nil,
                    updateNotes: false
                )
                auditReceipts.append(receipt)
            } catch {
                mutationFailures.insert(request.id)
            }
        }

        let succeededCount = boundedRequests.count - mutationFailures.count
        let failures = mutationFailures.union(requests.dropFirst(50).map(\.id))
        if succeededCount > 0 {
            let queueRefreshed = await refreshPTRequestsAfterMutation(session: session)
            let visibleReceipts = auditReceipts.prefix(3).map { $0.uuidString.lowercased() }
            let remainingReceiptCount = max(0, auditReceipts.count - visibleReceipts.count)
            let receiptSummary = visibleReceipts.joined(separator: ", ")
                + (remainingReceiptCount > 0 ? " + \(remainingReceiptCount) more in Admin Audit" : "")
            ptRequestStatusIsWarning = !queueRefreshed || !failures.isEmpty
            ptRequestStatusMessage = queueRefreshed
                ? "\(succeededCount) PT request\(succeededCount == 1 ? " was" : "s were") updated. Audit receipts: \(receiptSummary)."
                : "\(succeededCount) PT request\(succeededCount == 1 ? " was" : "s were") updated, but the queue could not reload. Audit receipts: \(receiptSummary). Do not repeat successful changes; refresh PT Requests."
            lastUpdatedAt = Date()
        }
        if !failures.isEmpty {
            errorMessage = "\(failures.count) selected PT request\(failures.count == 1 ? "" : "s") could not be updated. They remain selected for retry."
        }
        return failures
    }

    var ptRequestsAreCurrent: Bool {
        loadedSources.contains("PT requests")
            && !refreshUnavailableSources.contains("PT requests")
    }

    func refreshPTRequests(session: AuthSession) async {
        guard updatingPTRequestID == nil,
              bulkUpdatingPTRequestIDs.isEmpty,
              !isLoading,
              !isRefreshingOperations else { return }
        do {
            ptRequests = try await api.adminPTRequests(session: session)
            loadedSources.insert("PT requests")
            refreshUnavailableSources.removeAll { $0 == "PT requests" }
            ptRequestStatusMessage = nil
            ptRequestStatusIsWarning = false
            lastUpdatedAt = Date()
        } catch {
            if !refreshUnavailableSources.contains("PT requests") {
                refreshUnavailableSources.append("PT requests")
            }
            ptRequestStatusMessage = "PT Requests could not refresh. Last loaded requests remain read-only."
            ptRequestStatusIsWarning = true
        }
    }

    private func refreshPTRequestsAfterMutation(session: AuthSession) async -> Bool {
        do {
            ptRequests = try await api.adminPTRequests(session: session)
            loadedSources.insert("PT requests")
            refreshUnavailableSources.removeAll { $0 == "PT requests" }
            return true
        } catch {
            if !refreshUnavailableSources.contains("PT requests") {
                refreshUnavailableSources.append("PT requests")
            }
            return false
        }
    }

    func publishAnnouncement(session: AuthSession, title: String, body: String, tone: String) async -> Bool {
        var draft = AdminAnnouncementDraft()
        draft.title = title
        draft.body = body
        draft.tone = tone
        return await publishAnnouncement(session: session, announcement: nil, draft: draft)
    }

    func refreshAnnouncements(session: AuthSession) async {
        guard !isMutatingAnnouncements, !isRefreshingAnnouncements else { return }
        isRefreshingAnnouncements = true
        defer { isRefreshingAnnouncements = false }
        do {
            announcements = try await api.adminAnnouncements(session: session)
            markAnnouncementsCurrent()
            announcementStatusMessage = nil
            await refreshAnnouncementDeliveryMetrics(session: session)
        } catch {
            if !refreshUnavailableSources.contains("member notices") {
                refreshUnavailableSources.append("member notices")
            }
            announcementStatusMessage = nil
            announcementLoadErrorMessage = "Member notices could not refresh. The last loaded snapshot remains read-only."
        }
    }

    func saveAnnouncement(
        session: AuthSession,
        announcement: AdminAnnouncement?,
        draft: AdminAnnouncementDraft
    ) async -> Bool {
        guard announcementMutationAvailable else { return false }
        announcementMutationID = announcement?.id ?? UUID()
        announcementStatusMessage = nil
        defer { announcementMutationID = nil }
        do {
            let saved = try await api.adminSaveAnnouncement(
                session: session,
                announcement: announcement,
                draft: draft
            )
            mergeAnnouncement(saved)
            markAnnouncementsCurrent()
            announcementStatusMessage = announcement == nil
                ? "Draft created. It remains hidden until you publish it."
                : "Notice changes saved."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func publishAnnouncement(
        session: AuthSession,
        announcement: AdminAnnouncement?,
        draft: AdminAnnouncementDraft
    ) async -> Bool {
        guard announcementMutationAvailable, !isPublishingAnnouncement else { return false }
        isPublishingAnnouncement = true
        announcementStatusMessage = nil
        defer { isPublishingAnnouncement = false }
        do {
            let outcome = try await api.adminPublishAnnouncement(
                session: session,
                announcement: announcement,
                draft: draft
            )
            mergeAnnouncement(outcome.announcement)
            markAnnouncementsCurrent()
            let push = outcome.push
            announcementStatusMessage = push.configured
                ? push.attempted > 0
                    ? "\(push.delivered) device notification\(push.delivered == 1 ? "" : "s") delivered\(push.failed > 0 ? "; \(push.failed) failed" : "")."
                    : "Notice is live. No enabled iOS devices were registered."
                : "Notice is live. APNs delivery is not configured."
            await refreshAnnouncementDeliveryMetrics(session: session)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func unpublishAnnouncement(session: AuthSession, announcement: AdminAnnouncement) async -> Bool {
        guard announcementMutationAvailable else { return false }
        announcementMutationID = announcement.id
        announcementStatusMessage = nil
        defer { announcementMutationID = nil }
        do {
            mergeAnnouncement(try await api.adminUnpublishAnnouncement(
                session: session,
                announcement: announcement
            ))
            markAnnouncementsCurrent()
            announcementStatusMessage = "Notice unpublished and hidden from member accounts."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func setAnnouncementArchived(
        session: AuthSession,
        announcement: AdminAnnouncement,
        archived: Bool
    ) async -> Bool {
        guard announcementMutationAvailable else { return false }
        announcementMutationID = announcement.id
        announcementStatusMessage = nil
        defer { announcementMutationID = nil }
        do {
            try await api.adminSetAnnouncementArchived(
                session: session,
                announcement: announcement,
                archived: archived
            )
            announcements = try await api.adminAnnouncements(session: session)
            markAnnouncementsCurrent()
            announcementStatusMessage = archived
                ? "Notice archived. Delivery history remains available."
                : "Notice restored as a private draft."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func deleteAnnouncement(session: AuthSession, announcement: AdminAnnouncement) async -> Bool {
        guard announcementMutationAvailable else { return false }
        announcementMutationID = announcement.id
        announcementStatusMessage = nil
        defer { announcementMutationID = nil }
        do {
            try await api.adminDeleteAnnouncement(session: session, announcement: announcement)
            announcements.removeAll(where: { $0.id == announcement.id })
            markAnnouncementsCurrent()
            announcementStatusMessage = "Unpublished draft deleted."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private var announcementMutationAvailable: Bool {
        guard !isMutatingAnnouncements,
              loadedSources.contains("member notices"),
              !refreshUnavailableSources.contains("member notices"),
              !isLoading else {
            if !isMutatingAnnouncements {
                errorMessage = "Refresh Member Notices before changing communications."
            }
            return false
        }
        return true
    }

    private func mergeAnnouncement(_ announcement: AdminAnnouncement) {
        announcements.removeAll(where: { $0.id == announcement.id })
        announcements.insert(announcement, at: 0)
    }

    private func markAnnouncementsCurrent() {
        loadedSources.insert("member notices")
        refreshUnavailableSources.removeAll { $0 == "member notices" }
        announcementLoadErrorMessage = nil
        lastUpdatedAt = Date()
    }

    private func refreshAnnouncementDeliveryMetrics(session: AuthSession) async {
        do {
            async let receiptRequest = api.adminAnnouncementReceiptMetrics(session: session)
            async let pushRequest = api.adminAnnouncementPushMetrics(session: session)
            let (receiptRows, pushRows) = try await (receiptRequest, pushRequest)
            setAnnouncementDeliveryMetrics(receiptRows: receiptRows, pushRows: pushRows)
        } catch {
            announcementDeliveryStatusMessage = "Delivery evidence is temporarily unavailable. Existing counts may be out of date."
        }
    }

    private func setAnnouncementDeliveryMetrics(
        receiptRows: [AdminAnnouncementReceiptMetrics],
        pushRows: [AdminAnnouncementPushMetrics]
    ) {
        var merged: [UUID: AdminAnnouncementDeliveryMetrics] = [:]
        for row in receiptRows {
            merged[row.announcement_id] = AdminAnnouncementDeliveryMetrics(
                readCount: row.read_count,
                dismissedCount: row.dismissed_count
            )
        }
        for row in pushRows {
            var metrics = merged[row.announcement_id] ?? AdminAnnouncementDeliveryMetrics()
            metrics.pushDeliveredCount = row.delivered_count
            metrics.pushFailedCount = row.failed_count + row.invalid_token_count
            metrics.pushLastAttemptedAt = row.last_attempted_at
            merged[row.announcement_id] = metrics
        }
        announcementDeliveryMetrics = merged
        announcementDeliveryStatusMessage = nil
    }

    func saveProduct(session: AuthSession, product: AdminProduct?, draft: AdminProductDraft) async -> Bool {
        guard savingProductID == nil, provisioningProductPriceID == nil else { return false }
        guard loadedSources.contains("session packs"),
              !refreshUnavailableSources.contains("session packs"),
              !isLoading else {
            errorMessage = "Refresh Session Packs & Pricing before saving catalogue changes."
            return false
        }
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
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

    func provisionProductPrice(session: AuthSession, product: AdminProduct) async -> AdminProduct? {
        guard provisioningProductPriceID == nil, savingProductID == nil else { return nil }
        guard !product.active, product.stripe_price_id == nil else {
            errorMessage = "Only an unlinked private pack can create a Stripe Price."
            return nil
        }
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
        provisioningProductPriceID = product.id
        defer { provisioningProductPriceID = nil }
        do {
            let saved = try await api.adminProvisionProductPrice(session: session, product: product)
            mergeProduct(saved)
            loadedSources.insert("session packs")
            refreshUnavailableSources.removeAll { $0 == "session packs" }
            lastUpdatedAt = Date()
            return saved
        } catch {
            errorMessage = error.localizedDescription
            return nil
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

    var eventCalendarIsCurrent: Bool {
        loadedSources.contains("event calendar")
            && !refreshUnavailableSources.contains("event calendar")
    }

    var eventTrainingGroupsAreCurrent: Bool {
        loadedSources.contains("event training groups")
            && !refreshUnavailableSources.contains("event training groups")
    }

    var missingXertEventCalendarCount: Int {
        let existingKeys = Set(events.map { "\($0.name)|\($0.event_date ?? "")" })
        return XertEventCalendar.fallback.filter {
            !existingKeys.contains("\($0.name)|\($0.event_date ?? "")")
        }.count
    }

    var teamDirectoryIsCurrent: Bool {
        loadedSources.contains("team directory")
            && !refreshUnavailableSources.contains("team directory")
    }

    func refreshEventCatalogue(session: AuthSession) async {
        guard !isLoading,
              !isRefreshingEventCatalogue,
              !isSeedingEventCalendar,
              savingEventID == nil,
              deletingEventID == nil else { return }
        isRefreshingEventCatalogue = true
        defer { isRefreshingEventCatalogue = false }
        async let eventRequest = api.adminEvents(session: session)
        async let goalsRequest = api.adminEventGoalReferences(session: session)
        var failures: [String] = []
        do {
            events = try await eventRequest
            markCatalogueSourceCurrent("event calendar")
        } catch {
            markCatalogueSourceUnavailable("event calendar")
            failures.append("calendar")
        }
        do {
            eventGoalCounts = Dictionary(grouping: try await goalsRequest, by: \.event_id).mapValues(\.count)
            markCatalogueSourceCurrent("event training groups")
        } catch {
            markCatalogueSourceUnavailable("event training groups")
            failures.append("training groups")
        }
        eventCatalogueStatusMessage = failures.isEmpty
            ? nil
            : "Could not refresh \(failures.joined(separator: " and ")). Last loaded records remain read-only where required."
        if failures.isEmpty { lastUpdatedAt = Date() }
    }

    func saveEvent(session: AuthSession, event: AdminEvent?, draft: AdminEventDraft) async -> Bool {
        guard savingEventID == nil,
              deletingEventID == nil,
              !isLoading,
              !isRefreshingEventCatalogue,
              !isSeedingEventCalendar else { return false }
        guard eventCalendarIsCurrent else {
            errorMessage = "Refresh Event Calendar before saving catalogue changes."
            return false
        }
        savingEventID = event?.id ?? UUID()
        defer { savingEventID = nil }
        do {
            let saved: AdminEvent
            if let event {
                saved = try await api.adminUpdateEvent(session: session, event: event, draft: draft)
            } else {
                saved = try await api.adminCreateEvent(session: session, draft: draft)
            }
            mergeEvent(saved)
            await refreshEventsAfterMutation(
                session: session,
                completedAction: "\(saved.name) was saved"
            )
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func deleteEvent(session: AuthSession, event: AdminEvent) async -> Bool {
        guard deletingEventID == nil,
              savingEventID == nil,
              !isLoading,
              !isRefreshingEventCatalogue,
              !isSeedingEventCalendar else { return false }
        guard eventCalendarIsCurrent, eventTrainingGroupsAreCurrent else {
            errorMessage = "Refresh Event Calendar and training groups before deleting an event."
            return false
        }
        deletingEventID = event.id
        defer { deletingEventID = nil }
        do {
            try await api.adminDeleteEvent(session: session, event: event)
            events.removeAll { $0.id == event.id }
            eventGoalCounts[event.id] = nil
            await refreshEventsAfterMutation(
                session: session,
                completedAction: "\(event.name) was deleted"
            )
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func loadEventRoster(session: AuthSession, eventID: UUID) async {
        eventRosterGeneration &+= 1
        let generation = eventRosterGeneration
        eventRoster = []
        eventRosterLoadedEventID = nil
        eventRosterUnavailableEventID = nil
        loadingEventRosterID = eventID
        defer {
            if generation == eventRosterGeneration {
                loadingEventRosterID = nil
            }
        }
        do {
            let roster = try await api.adminEventGoalMembers(session: session, eventID: eventID)
            guard generation == eventRosterGeneration else { return }
            eventRoster = roster
            eventRosterLoadedEventID = eventID
        } catch {
            guard generation == eventRosterGeneration else { return }
            eventRosterUnavailableEventID = eventID
        }
    }

    func seedXertEventCalendar(session: AuthSession) async -> Int? {
        guard !isSeedingEventCalendar,
              savingEventID == nil,
              deletingEventID == nil,
              !isLoading,
              !isRefreshingEventCatalogue else { return nil }
        guard eventCalendarIsCurrent else {
            errorMessage = "Refresh Event Calendar before adding the XERT 2026 calendar."
            return nil
        }

        isSeedingEventCalendar = true
        defer { isSeedingEventCalendar = false }
        do {
            let inserted = try await api.adminSeedEventCalendar(session: session)
            await refreshEventsAfterMutation(
                session: session,
                completedAction: inserted.isEmpty
                    ? "The XERT 2026 calendar was already complete"
                    : "\(inserted.count) XERT 2026 event\(inserted.count == 1 ? "" : "s") were added"
            )
            lastUpdatedAt = Date()
            XertHaptics.play(.success)
            return inserted.count
        } catch {
            errorMessage = error.localizedDescription
            XertHaptics.play(.error)
            return nil
        }
    }

    private func refreshEventsAfterMutation(
        session: AuthSession,
        completedAction: String
    ) async {
        async let eventRequest = api.adminEvents(session: session)
        async let goalsRequest = api.adminEventGoalReferences(session: session)
        var failures: [String] = []
        do {
            events = try await eventRequest
            markCatalogueSourceCurrent("event calendar")
        } catch {
            markCatalogueSourceUnavailable("event calendar")
            failures.append("calendar")
        }
        do {
            eventGoalCounts = Dictionary(grouping: try await goalsRequest, by: \.event_id).mapValues(\.count)
            markCatalogueSourceCurrent("event training groups")
        } catch {
            markCatalogueSourceUnavailable("event training groups")
            failures.append("training groups")
        }
        eventCatalogueStatusMessage = failures.isEmpty
            ? nil
            : "\(completedAction), but the latest \(failures.joined(separator: " and ")) could not be loaded. Refresh before making another change."
    }

    func refreshTeamDirectory(session: AuthSession) async {
        guard !isLoading,
              !isRefreshingTeamDirectory,
              savingCoachID == nil,
              deletingCoachID == nil else { return }
        isRefreshingTeamDirectory = true
        defer { isRefreshingTeamDirectory = false }
        do {
            coaches = try await api.adminCoaches(session: session)
            markCatalogueSourceCurrent("team directory")
            teamDirectoryStatusMessage = nil
            lastUpdatedAt = Date()
        } catch {
            markCatalogueSourceUnavailable("team directory")
            teamDirectoryStatusMessage = "Team Directory could not refresh. Last loaded profiles remain read-only."
        }
    }

    func saveCoach(session: AuthSession, coach: AdminCoach?, draft: AdminCoachDraft) async -> Bool {
        guard savingCoachID == nil,
              deletingCoachID == nil,
              !isLoading,
              !isRefreshingTeamDirectory else { return false }
        guard teamDirectoryIsCurrent else {
            errorMessage = "Refresh Team Directory before saving profile changes."
            return false
        }
        savingCoachID = coach?.id ?? UUID()
        defer { savingCoachID = nil }
        do {
            let saved: AdminCoach
            if let coach {
                saved = try await api.adminUpdateCoach(session: session, coach: coach, draft: draft)
            } else {
                saved = try await api.adminCreateCoach(session: session, draft: draft)
            }
            mergeCoach(saved)
            await refreshTeamAfterMutation(
                session: session,
                completedAction: "\(saved.name) was saved"
            )
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func deleteCoach(session: AuthSession, coach: AdminCoach) async -> Bool {
        guard deletingCoachID == nil,
              savingCoachID == nil,
              !isLoading,
              !isRefreshingTeamDirectory else { return false }
        guard teamDirectoryIsCurrent else {
            errorMessage = "Refresh Team Directory before deleting a profile."
            return false
        }
        deletingCoachID = coach.id
        defer { deletingCoachID = nil }
        do {
            try await api.adminDeleteCoach(session: session, coach: coach)
            coaches.removeAll { $0.id == coach.id }
            await refreshTeamAfterMutation(
                session: session,
                completedAction: "\(coach.name) was deleted"
            )
            lastUpdatedAt = Date()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func refreshTeamAfterMutation(
        session: AuthSession,
        completedAction: String
    ) async {
        do {
            coaches = try await api.adminCoaches(session: session)
            markCatalogueSourceCurrent("team directory")
            teamDirectoryStatusMessage = nil
        } catch {
            markCatalogueSourceUnavailable("team directory")
            teamDirectoryStatusMessage = "\(completedAction), but the latest directory could not be loaded. Refresh before making another change."
        }
    }

    private func mergeEvent(_ event: AdminEvent) {
        events.removeAll { $0.id == event.id }
        events.append(event)
        events.sort {
            let left = $0.event_date ?? "9999-12-31"
            let right = $1.event_date ?? "9999-12-31"
            if left != right { return left < right }
            return $0.sort_order < $1.sort_order
        }
    }

    private func mergeCoach(_ coach: AdminCoach) {
        coaches.removeAll { $0.id == coach.id }
        coaches.append(coach)
        coaches.sort {
            if $0.sort_order != $1.sort_order { return $0.sort_order < $1.sort_order }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    private func markCatalogueSourceCurrent(_ source: String) {
        loadedSources.insert(source)
        refreshUnavailableSources.removeAll { $0 == source }
    }

    private func markCatalogueSourceUnavailable(_ source: String) {
        if !refreshUnavailableSources.contains(source) {
            refreshUnavailableSources.append(source)
        }
    }

    func saveClass(session: AuthSession, classSession: AdminClassSession?, draft: AdminClassDraft) async -> Bool {
        guard savingClassID == nil else { return false }
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
        classMutationStatusMessage = nil
        classMutationStatusIsWarning = false
        savingClassID = classSession?.id ?? UUID()
        defer { savingClassID = nil }

        let mutationID: UUID
        do {
            if let classSession {
                mutationID = try await api.adminUpdateClass(
                    session: session,
                    classSession: classSession,
                    draft: draft
                )
            } else {
                mutationID = try await api.adminCreateClass(session: session, draft: draft)
            }
        } catch {
            errorMessage = error.localizedDescription
            return false
        }

        var unavailableReadbacks: [String] = []
        do {
            classSessions = try await api.adminClassSessions(session: session)
            markScheduleSourceCurrent("full timetable")
        } catch {
            markScheduleSourceUnavailable("full timetable")
            unavailableReadbacks.append("full timetable")
        }
        do {
            dailyOperations = try await api.adminDailyOperations(session: session)
            markScheduleSourceCurrent("today's classes")
        } catch {
            markScheduleSourceUnavailable("today's classes")
            unavailableReadbacks.append("today's classes")
        }

        let action = classSession == nil ? "Class created" : "Class updated"
        let receipt = mutationID.uuidString.lowercased()
        if unavailableReadbacks.isEmpty {
            classMutationStatusMessage = "\(action). Receipt \(receipt)."
        } else {
            classMutationStatusIsWarning = true
            classMutationStatusMessage = "\(action), but \(unavailableReadbacks.joined(separator: " and ")) could not reload. Receipt \(receipt). Do not save or create it again; refresh Class Desk."
        }
        lastUpdatedAt = Date()
        return true
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

    func cancelClass(
        session: AuthSession,
        classSession: AdminClassSession
    ) async -> AdminClassCancellationFollowUp? {
        guard cancellingClassID == nil else { return nil }
        healthRefreshGeneration &+= 1
        launchGateUpdatedAt = nil
        classCancellationFollowUp = nil
        cancellingClassID = classSession.id
        defer { cancellingClassID = nil }

        async let rosterRequest = api.adminSessionRoster(
            session: session,
            classSessionID: classSession.id
        )
        async let enquiryRequest = api.adminClassCancellationEnquiries(
            session: session,
            classSessionID: classSession.id
        )
        var roster: [AdminRosterMember] = []
        var enquiries: [AdminLegacyBookingRequest] = []
        var contactLookupFailures = 0
        do { roster = try await rosterRequest }
        catch { contactLookupFailures += 1 }
        do { enquiries = try await enquiryRequest }
        catch { contactLookupFailures += 1 }

        do {
            let affectedBookings = try await api.adminCancelClass(
                session: session,
                classSessionID: classSession.id
            )

            var notification: AdminClassCancellationNoticeOutcome?
            var notificationWarning: String?
            if affectedBookings > 0 {
                do {
                    notification = try await api.adminNotifyClassCancellation(
                        session: session,
                        classSessionID: classSession.id
                    )
                } catch {
                    notificationWarning = "The private notice was created, but Apple push delivery could not be confirmed: \(error.localizedDescription)"
                }
            }

            var refreshWarnings: [String] = []
            do {
                classSessions = try await api.adminClassSessions(session: session)
                loadedSources.insert("full timetable")
                refreshUnavailableSources.removeAll { $0 == "full timetable" }
            } catch {
                refreshWarnings.append("full timetable")
                if !refreshUnavailableSources.contains("full timetable") {
                    refreshUnavailableSources.append("full timetable")
                }
            }
            do {
                dailyOperations = try await api.adminDailyOperations(session: session)
                loadedSources.insert("today's classes")
                refreshUnavailableSources.removeAll { $0 == "today's classes" }
            } catch {
                refreshWarnings.append("today's classes")
                if !refreshUnavailableSources.contains("today's classes") {
                    refreshUnavailableSources.append("today's classes")
                }
            }
            do {
                waitlist = try await api.adminWaitlist(session: session)
                loadedSources.insert("waitlists")
                refreshUnavailableSources.removeAll { $0 == "waitlists" }
            } catch {
                refreshWarnings.append("waitlists")
                if !refreshUnavailableSources.contains("waitlists") {
                    refreshUnavailableSources.append("waitlists")
                }
            }
            do {
                bookingRequests = try await api.adminBookingRequests(session: session)
                hasLoadedBookingRequests = true
                bookingRequestsUnavailable = false
            } catch {
                bookingRequestsUnavailable = true
                refreshWarnings.append("booking requests")
            }

            let followUp = AdminClassCancellationFollowUp(
                sessionID: classSession.id,
                classTitle: classSession.title,
                affectedBookings: affectedBookings,
                contacts: AdminClassCancellationFollowUp.contacts(
                    roster: roster,
                    enquiries: enquiries
                ),
                message: AdminClassCancellationMessage(classSession: classSession),
                contactLookupIncomplete: contactLookupFailures > 0,
                notification: notification,
                notificationWarning: notificationWarning,
                refreshWarnings: refreshWarnings,
                completedAt: Date()
            )
            classCancellationFollowUp = followUp
            lastUpdatedAt = Date()
            return followUp
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func clearClassCancellationFollowUp() {
        classCancellationFollowUp = nil
    }

    func saveAvailability(session: AuthSession, block: AdminAvailabilityBlock?, draft: AdminAvailabilityDraft) async -> Bool {
        guard savingScheduleWindowID == nil else { return false }
        guard scheduleSourceIsCurrent("availability") else {
            errorMessage = "Refresh Schedule Controls before changing availability."
            return false
        }
        savingScheduleWindowID = block?.id ?? UUID()
        scheduleMutationWarning = nil
        scheduleMutationIsWarning = false
        defer { savingScheduleWindowID = nil }
        do {
            let saved = try await api.adminSaveAvailability(session: session, block: block, draft: draft)
            mergeAvailability(saved)
            let refreshed = await refreshAvailabilitySnapshot(session: session)
            let action = block == nil ? "Availability created" : "Availability updated"
            scheduleMutationIsWarning = !refreshed
            scheduleMutationWarning = refreshed
                ? "\(action). Record \(saved.id.uuidString.lowercased())."
                : "\(action), but the latest availability list could not reload. Record \(saved.id.uuidString.lowercased()). Do not repeat this change; refresh Schedule Controls."
            lastUpdatedAt = Date()
            return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func saveBlackout(session: AuthSession, period: AdminBlackoutPeriod?, draft: AdminBlackoutDraft) async -> Bool {
        guard savingScheduleWindowID == nil else { return false }
        guard scheduleSourceIsCurrent("blackouts"), scheduleSourceIsCurrent("full timetable") else {
            errorMessage = "Refresh Schedule Controls before changing a blackout."
            return false
        }
        savingScheduleWindowID = period?.id ?? UUID()
        scheduleMutationWarning = nil
        scheduleMutationIsWarning = false
        defer { savingScheduleWindowID = nil }
        do {
            let saved = try await api.adminSaveBlackout(session: session, period: period, draft: draft)
            mergeBlackout(saved)
            let refreshed = await refreshBlackoutSnapshot(session: session)
            let action = period == nil ? "Blackout created" : "Blackout updated"
            scheduleMutationIsWarning = !refreshed
            scheduleMutationWarning = refreshed
                ? "\(action). Record \(saved.id.uuidString.lowercased())."
                : "\(action), but the latest blackout list could not reload. Record \(saved.id.uuidString.lowercased()). Do not repeat this change; refresh Schedule Controls."
            lastUpdatedAt = Date()
            return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func deleteAvailability(session: AuthSession, block: AdminAvailabilityBlock) async -> Bool {
        guard deletingScheduleWindowID == nil else { return false }
        guard scheduleSourceIsCurrent("availability") else {
            errorMessage = "Refresh Schedule Controls before removing availability."
            return false
        }
        deletingScheduleWindowID = block.id
        scheduleMutationWarning = nil
        scheduleMutationIsWarning = false
        defer { deletingScheduleWindowID = nil }
        do {
            let removedID = try await api.adminDeleteAvailability(session: session, block: block)
            availabilityBlocks.removeAll { $0.id == removedID }
            let refreshed = await refreshAvailabilitySnapshot(session: session)
            scheduleMutationIsWarning = !refreshed
            scheduleMutationWarning = refreshed
                ? "Availability removed. Record \(removedID.uuidString.lowercased())."
                : "Availability removed, but the latest list could not reload. Record \(removedID.uuidString.lowercased()). Do not repeat this removal; refresh Schedule Controls."
            lastUpdatedAt = Date()
            return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func deleteBlackout(session: AuthSession, period: AdminBlackoutPeriod) async -> Bool {
        guard deletingScheduleWindowID == nil else { return false }
        guard scheduleSourceIsCurrent("blackouts"), scheduleSourceIsCurrent("full timetable") else {
            errorMessage = "Refresh Schedule Controls before removing a blackout."
            return false
        }
        deletingScheduleWindowID = period.id
        scheduleMutationWarning = nil
        scheduleMutationIsWarning = false
        defer { deletingScheduleWindowID = nil }
        do {
            let removedID = try await api.adminDeleteBlackout(session: session, period: period)
            blackoutPeriods.removeAll { $0.id == removedID }
            let refreshed = await refreshBlackoutSnapshot(session: session)
            scheduleMutationIsWarning = !refreshed
            scheduleMutationWarning = refreshed
                ? "Blackout removed. Record \(removedID.uuidString.lowercased())."
                : "Blackout removed, but the latest list could not reload. Record \(removedID.uuidString.lowercased()). Do not repeat this removal; refresh Schedule Controls."
            lastUpdatedAt = Date()
            return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func refreshScheduleControls(session: AuthSession) async {
        guard !isRefreshingScheduleControls else { return }
        isRefreshingScheduleControls = true
        defer { isRefreshingScheduleControls = false }
        scheduleMutationWarning = nil
        scheduleMutationIsWarning = false

        async let availabilityRequest = api.adminAvailabilityBlocks(session: session)
        async let blackoutRequest = api.adminBlackoutPeriods(session: session)
        async let timetableRequest = api.adminClassSessions(session: session)
        var failures: [String] = []
        do {
            availabilityBlocks = try await availabilityRequest
            markScheduleSourceCurrent("availability")
        } catch {
            markScheduleSourceUnavailable("availability")
            failures.append("availability")
        }
        do {
            blackoutPeriods = try await blackoutRequest
            markScheduleSourceCurrent("blackouts")
        } catch {
            markScheduleSourceUnavailable("blackouts")
            failures.append("blackouts")
        }
        do {
            classSessions = try await timetableRequest
            markScheduleSourceCurrent("full timetable")
        } catch {
            markScheduleSourceUnavailable("full timetable")
            failures.append("full timetable")
        }
        if failures.isEmpty {
            lastUpdatedAt = Date()
        } else {
            scheduleMutationWarning = "Could not refresh \(failures.joined(separator: " and ")). Last loaded records remain read-only."
            scheduleMutationIsWarning = true
        }
    }

    private func refreshAvailabilitySnapshot(session: AuthSession) async -> Bool {
        do {
            availabilityBlocks = try await api.adminAvailabilityBlocks(session: session)
            markScheduleSourceCurrent("availability")
            return true
        } catch {
            markScheduleSourceUnavailable("availability")
            return false
        }
    }

    private func refreshBlackoutSnapshot(session: AuthSession) async -> Bool {
        do {
            blackoutPeriods = try await api.adminBlackoutPeriods(session: session)
            markScheduleSourceCurrent("blackouts")
            return true
        } catch {
            markScheduleSourceUnavailable("blackouts")
            return false
        }
    }

    private func mergeAvailability(_ saved: AdminAvailabilityBlock) {
        availabilityBlocks.removeAll { $0.id == saved.id }
        availabilityBlocks.append(saved)
        availabilityBlocks.sort { $0.start_time < $1.start_time }
    }

    private func mergeBlackout(_ saved: AdminBlackoutPeriod) {
        blackoutPeriods.removeAll { $0.id == saved.id }
        blackoutPeriods.append(saved)
        blackoutPeriods.sort { $0.start_time < $1.start_time }
    }

    private func markScheduleSourceCurrent(_ source: String) {
        loadedSources.insert(source)
        refreshUnavailableSources.removeAll { $0 == source }
    }

    private func markScheduleSourceUnavailable(_ source: String) {
        if !refreshUnavailableSources.contains(source) {
            refreshUnavailableSources.append(source)
        }
    }

    private func scheduleSourceIsCurrent(_ source: String) -> Bool {
        loadedSources.contains(source) && !refreshUnavailableSources.contains(source)
    }
}
