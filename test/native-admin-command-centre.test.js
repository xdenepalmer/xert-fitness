import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native app exposes the command centre only to admin profiles', async () => {
  const [models, root, view, api] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
  ]);

  assert.match(models, /let role: String\?/);
  assert.match(models, /var isAdmin: Bool \{ role == "admin" \}/);
  assert.match(root, /if store\.profile\?\.isAdmin == true[\s\S]*AdminCommandCentreView\([\s\S]*requestedRoute: requestedAdminRoute/);
  assert.match(root, /\.fullScreenCover\(isPresented: \$showingAdminCommandCentre\)/);
  assert.match(view, /Owner access required/);
  assert.match(view, /private var authorizedOwnerSession: AuthSession\?/);
  assert.match(view, /store\.profile\?\.isAdmin == true,[\s\S]*session\.user\?\.id != nil/);
  assert.doesNotMatch(view, /session\.user\.id/);
  assert.match(api, /select", value: "id,full_name,phone,email,role"/);
});

test('native owner workspace uses protected operational RPCs and real actions', async () => {
  const [api, adminStore, adminModels, view, ownerNavigation] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
  ]);

  for (const rpc of [
    'admin_daily_operations',
    'admin_waitlist_overview',
    'admin_member_follow_up_queue',
    'admin_list_members_page',
    'admin_promote_next_waitlisted_with_notice',
    'admin_add_member_note',
    'admin_update_request',
  ]) assert.match(api, new RegExp(`path: "${rpc}"`));

  assert.match(adminStore, /func promoteNext/);
  assert.match(adminStore, /func logFollowUp/);
  assert.match(adminStore, /func searchMembers/);
  assert.match(view, /AdminMembersView/);
  assert.match(view, /AdminClassesView/);
  assert.match(view, /AdminRetentionView/);
  assert.match(view, /AdminFinanceView/);
  assert.match(view, /AdminOrdersView/);
  assert.match(view, /AdminPlatformView/);
  assert.match(view, /AdminPTRequestsView/);
  assert.match(view, /AdminCommunicationsView/);
  assert.match(api, /adminUpdatePlatformSettings/);
  assert.match(api, /adminUpdatePTRequest/);
  assert.match(api, /adminPublishAnnouncement/);
  assert.match(api, /\/api\/admin-publish-announcement/);
  assert.match(api, /\/api\/admin-commerce-health/);
  assert.match(adminModels, /let refund_reconciliation_ready: Bool\?/);
  assert.match(adminModels, /let checkout_reconciliation_ready: Bool\?/);
  assert.match(view, /HealthCheckRow\(label: "Refund reconciliation"/);
  assert.match(view, /HealthCheckRow\(label: "Checkout recovery"/);
  assert.match(api, /\/api\/admin-push-health/);
  assert.match(api, /xert_schema_capabilities/);
  assert.match(view, /AdminOperationsHealthView/);
  assert.match(view, /Unresolved Stripe incidents/);
  assert.match(view, /UIPasteboard\.general\.string = incident\.event_id/);
  assert.match(view, /Copy Stripe Event ID/);
  assert.match(adminModels, /let resolution: String\?/);
  assert.match(view, /incident\.resolution/);
  assert.match(api, /adminResolveStripeReview/);
  assert.match(adminStore, /resolveStripeReview/);
  assert.match(view, /Mark handled/);
  assert.match(api, /adminRetryStripeEvent/);
  assert.match(api, /action: "retry_stripe_event"/);
  assert.match(api, /confirmation: "RETRY EVENT"/);
  assert.match(adminStore, /retryingStripeIncidentID/);
  assert.match(adminStore, /func retryStripeEvent/);
  assert.match(view, /Label\("Retry safely", systemImage: "arrow\.triangle\.2\.circlepath"\)/);
  assert.match(view, /XERT verifies its identity and payment mode before processing/);
  assert.match(view, /AdminAuditView/);
  assert.match(view, /AdminProductsView/);
  assert.match(view, /AdminProductEditor/);
  assert.match(view, /accessibilityHint\("Opens the exact session pack blocking Stripe launch"\)/);
  assert.match(view, /issue\.slug == "activation-receipt"[\s\S]*onOpenWorkspace\(\.controls\)/);
  assert.match(view, /LIVE STRIPE READINESS/);
  assert.match(view, /liveBlockedProducts/);
  assert.match(view, /Session Packs & Pricing/);
  assert.match(ownerNavigation, /Session Packs & Pricing/);
  assert.doesNotMatch(view, /Memberships & Pricing|Membership sales/);
  assert.match(view, /Create session pack/);
  assert.match(view, /AdminProductRow/);
  assert.match(view, /dynamicTypeSize\.isAccessibilitySize/);
  assert.match(view, /interactiveDismissDisabled\(isDirty \|\| isProductMutationInFlight\)/);
  assert.match(view, /Discard unsaved pack changes/);
  assert.match(view, /ToolbarItemGroup\(placement: \.keyboard\)/);
  assert.match(view, /safeAreaInset\(edge: \.bottom/);
  assert.match(view, /owner\.productEditor\.save/);
  assert.match(view, /if !admin\.products\.contains\(where: \\.active\) \{ return 1 \}/);
  assert.match(view, /pricingDataUnavailable[\s\S]*Session-pack data is unavailable/);
  assert.match(view, /stripeHealthUnavailable[\s\S]*admin\.commerceHealth\?\.ready == true/);
  assert.match(view, /AdminProductRow\(product: product, dataIsStale: pricingDataUnavailable\)/);
  assert.match(view, /Malformed Price ID/);
  assert.match(view, /Pricing data stale/);
  const pricingView = view.slice(view.indexOf('private struct AdminProductsView'), view.indexOf('private struct AdminProductRow'));
  assert.doesNotMatch(pricingView, /ToolbarItem\(placement: \.primaryAction\)/);
  assert.match(adminModels, /func validationMessage\(existingProduct: AdminProduct\?\)/);
  assert.match(adminModels, /normalizedPriceCents/);
  assert.match(api, /path: "admin_update_product"/);
  assert.match(api, /func adminCreateProduct/);
  assert.match(api, /path: "admin_create_product"/);
  assert.match(api, /AdminProductCreateRequest\([\s\S]*p_slug:[\s\S]*p_product:/);
  assert.match(api, /if draft\.active[\s\S]*path: "\/api\/admin-commerce-health"[\s\S]*action: "activate_product"/);
  assert.match(api, /AdminProductActivationRequest[\s\S]*expected_updated_at/);
  assert.doesNotMatch(api, /path: "\/rest\/v1\/products"\)[\s\S]{0,500}request\.httpMethod = "POST"/);
  assert.match(api, /active: false/);
  assert.match(api, /p_expected_updated_at: product\.updated_at/);
  assert.match(adminStore, /func saveProduct/);
  assert.match(adminStore, /mergeProduct\(savedProduct\)/);
  assert.match(adminStore, /refreshUnavailableSources\.append\("session packs"\)/);
  assert.match(view, /AdminEventsView/);
  assert.match(view, /AdminEventEditor/);
  assert.match(view, /AdminEventRosterView/);
  assert.match(api, /func adminCreateEvent/);
  assert.match(api, /func adminUpdateEvent/);
  assert.match(api, /func adminDeleteEvent/);
  assert.match(api, /path: "admin_event_goal_members"/);
  assert.ok(api.includes('URLQueryItem(name: "updated_at", value: "eq.\\(event.updated_at)")'));
  assert.match(adminStore, /func loadEventRoster/);
  assert.match(view, /AdminCoachesView/);
  assert.match(view, /AdminCoachEditor/);
  assert.match(api, /func adminCreateCoach/);
  assert.match(api, /func adminUpdateCoach/);
  assert.match(api, /func adminDeleteCoach/);
  assert.ok(api.includes('URLQueryItem(name: "updated_at", value: "eq.\\(coach.updated_at)")'));
  assert.match(adminStore, /func saveCoach/);
  assert.match(view, /AdminClassRosterView/);
  assert.match(view, /Save complete roll call/);
  assert.match(api, /path: "admin_session_roster"/);
  assert.match(api, /path: "admin_set_booking_status_with_notice"/);
  assert.match(api, /path: "admin_record_session_attendance"/);
  assert.match(adminStore, /func setBookingStatus/);
  assert.match(adminStore, /func recordAttendance/);
  assert.match(view, /AdminScheduleView/);
  assert.match(view, /AdminClassEditor/);
  assert.match(api, /func adminCreateClass/);
  assert.match(api, /path: "admin_update_class_session"/);
  assert.match(api, /path: "admin_cancel_class_session"/);
  assert.match(api, /notify_class_cancellation/);
  assert.match(adminStore, /func duplicateClass/);
  assert.match(adminStore, /func cancelClass/);
  assert.match(view, /AdminAvailabilityView/);
  assert.match(view, /AdminAvailabilityEditor/);
  assert.match(view, /AdminBlackoutEditor/);
  assert.match(api, /\/rest\/v1\/availability_blocks/);
  assert.match(api, /\/rest\/v1\/blackout_periods/);
  assert.match(api, /BLACKOUT_OVERLAPS_PUBLISHED_CLASS/);
  assert.match(adminStore, /func saveAvailability/);
  assert.match(adminStore, /func saveBlackout/);
  assert.match(view, /AdminMemberDetailView/);
  assert.match(view, /AdminCreditGrantView/);
  assert.match(api, /path: "admin_grant_credits_v2"/);
  assert.match(api, /path: "admin_set_role"/);
  assert.match(api, /path: "admin_list_member_notes"/);
  assert.match(api, /path: "admin_set_member_note_archived"/);
  assert.match(adminStore, /func grantCredits/);
  assert.match(adminStore, /func setMemberRole/);
  assert.match(view, /AdminOrderDetailView/);
  assert.match(view, /Payment switch/);
  assert.match(view, /Activation receipt/);
  assert.match(adminModels, /struct ActivationReceipt: Codable, Hashable/);
  assert.match(view, /Type REFUND to confirm/);
  assert.match(api, /func adminOrders/);
  assert.match(api, /while true[\s\S]*URLQueryItem\(name: "offset", value: String\(offset\)\)[\s\S]*offset \+= pageSize/);
  assert.match(api, /\/api\/admin-reconcile-order/);
  assert.match(view, /Check Stripe outcome/);
  assert.match(view, /expired unpaid checkout/);
  assert.match(view, /result\.checkout_status == "expired"/);
  assert.match(api, /\/api\/admin-refund-order/);
  assert.match(api, /confirmation == "REFUND"/);
  assert.match(adminStore, /func reconcileOrder/);
  assert.match(adminStore, /func refundOrder/);
  assert.match(view, /AdminLeadsView/);
  assert.match(view, /AdminLeadDetailView/);
  assert.match(ownerNavigation, /Lead Pipelines/);
  assert.match(api, /func adminLeads/);
  assert.match(api, /path: "admin_update_lead"/);
  assert.match(api, /path: "admin_update_lead_statuses"/);
  assert.match(api, /ids\.count <= 100/);
  assert.match(adminStore, /func saveLead/);
  assert.match(adminStore, /func bulkUpdateLeads/);
  assert.match(view, /AdminCampaignAttributionView/);
  assert.match(ownerNavigation, /Campaign Attribution/);
  assert.match(view, /fileExporter/);
  assert.match(api, /func adminCampaignAttribution/);
  assert.match(api, /id,utm_source,utm_medium,utm_campaign,source,created_at/);
  assert.match(api, /path: "\/rest\/v1\/member_interest"/);
  assert.match(adminStore, /func loadCampaignAttribution/);
  assert.match(view, /AdminSiteContentView/);
  assert.match(view, /AdminSiteContentEditor/);
  assert.match(ownerNavigation, /Site Content/);
  assert.match(view, /PhotosPicker/);
  assert.match(api, /func adminSiteContent/);
  assert.match(api, /func adminSaveSiteContent/);
  assert.match(api, /func adminUploadSiteImage/);
  assert.match(api, /\/storage\/v1\/object\/site-images/);
  assert.match(api, /updated_at", value: "eq\.\\\(expectedUpdatedAt\)/);
  assert.match(adminStore, /func saveSiteContent/);
  assert.match(adminStore, /func uploadSiteImage/);
  assert.match(view, /AdminBookingRequestsView/);
  assert.match(view, /AdminBookingRequestDetailView/);
  assert.match(ownerNavigation, /Booking Requests/);
  assert.match(api, /func adminBookingRequests/);
  assert.match(api, /\/rest\/v1\/class_bookings/);
  assert.match(api, /\/rest\/v1\/session_bookings/);
  assert.match(api, /func adminUpdateBookingRequestStatus/);
  assert.match(api, /try await adminSetBookingStatus/);
  assert.match(api, /p_request_type: "class_booking"/);
  assert.match(adminStore, /func bulkUpdateBookingRequests/);
  for (const table of [
    'admin_role_changes', 'admin_credit_grants', 'admin_request_status_changes',
    'member_announcement_admin_events', 'admin_lead_changes', 'admin_schedule_changes',
    'admin_content_changes', 'session_booking_changes',
  ]) assert.match(api, new RegExp(`table: "${table}"`));
  assert.match(api, /URLQueryItem\(name: "updated_at", value: "eq\.\\\(settings\.updated_at\)"\)/);
});

test('native owner dashboard consolidates live priorities into actionable workspaces', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');

  assert.match(view, /private var priorityQueue: some View/);
  const dashboard = view.slice(view.indexOf('private func dashboard(session:'), view.indexOf('private var accessDenied:'));
  assert.ok(dashboard.indexOf('priorityQueue') < dashboard.indexOf('stripeLaunchRunway'));
  assert.ok(dashboard.indexOf('priorityQueue') < dashboard.indexOf('quickTools'));
  assert.match(view, /private var operationalPriorities: \[AdminPriorityAction\]/);
  assert.match(view, /private struct AdminPriorityRow: View/);
  assert.match(view, /ForEach\(priorities\) \{ priority in/);
  assert.doesNotMatch(view, /operationalPriorities\.prefix/);
  for (const destination of ['health', 'bookingRequests', 'ptRequests', 'classDesk', 'retention', 'orders']) {
    assert.match(view, new RegExp(`workspace: \\.${destination}`));
  }
  assert.match(view, /openOwnerRouteWithFeedback\(priority\.route\)/);
  assert.match(view, /All operational queues are clear/);
  assert.match(view, /case \.idle, \.loading:[\s\S]*Checking operational queues/);
  assert.match(view, /case \.partial\(let unavailableSources\)/);
  assert.match(view, /case \.ready:[\s\S]*All operational queues are clear/);
  assert.match(view, /Button \{\s*openWorkspaceWithFeedback\(\.classDesk\)[\s\S]*Text\("OPEN DESK"\)/);
  assert.match(view, /AdminMetricTile[\s\S]*let action: \(\(\) -> Void\)\?/);
  assert.match(view, /private func adminHeading\(_ title: String\)[\s\S]*accessibilityAddTraits\(\.isHeader\)/);
});

test('native owner overview is freshness-aware and exposes safe one-tap operating tools', async () => {
  const [view, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
  ]);

  assert.match(view, /@Environment\(\\\.scenePhase\) private var scenePhase/);
  assert.match(view, /Date\(\)\.timeIntervalSince\(updatedAt\) >= 120/);
  assert.match(view, /onChange\(of: scenePhase\)[\s\S]*ownerDataNeedsForegroundRefresh[\s\S]*admin\.refresh/);
  assert.match(view, /private enum AdminOwnerQuickAction[\s\S]*case newClass[\s\S]*case newNotice[\s\S]*case newSessionPack/);
  assert.match(view, /private var quickTools: some View/);
  for (const label of ['Find a member', 'Create a class', 'Publish a notice', 'Create a session pack']) {
    assert.match(view, new RegExp(label));
  }
  assert.match(view, /sheet\(item: \$presentedQuickAction\)/);
  assert.match(
    view,
    /AdminClassEditor\([\s\S]*classSession: nil,[\s\S]*mutationAllowed: admin\.loadedSources\.contains\("full timetable"\)/,
  );
  assert.match(view, /AdminAnnouncementComposer\([\s\S]*announcement: nil,[\s\S]*isSaving: admin\.announcementMutationID != nil,[\s\S]*isPublishing: admin\.isPublishingAnnouncement/);
  assert.match(view, /AdminProductEditor\([\s\S]*product: nil/);

  assert.match(store, /@Published private\(set\) var loadedSources: Set<String> = \[\]/);
  assert.match(store, /@Published private\(set\) var hasCompletedRefresh = false/);
  assert.match(store, /var successfulSources = Set<String>\(\)/);
  assert.match(store, /loadedSources\.formUnion\(successfulSources\)/);
  assert.match(store, /var unavailableHealthSourceCount: Int/);
  assert.match(store, /guard hasCompletedRefresh else \{ return 0 \}/);
  assert.match(store, /!loadedSources\.contains\(\$0\) \|\| refreshUnavailableSources\.contains\(\$0\)/);
  assert.match(store, /var healthIssues: Int \{[\s\S]*unavailableHealthSourceCount/);
  assert.match(view, /private enum AdminDashboardDataState: Equatable/);
  assert.match(view, /return admin\.loadedSources\.contains\(source\) \? \.stale : \.unavailable/);
  assert.match(view, /count: admin\.healthIssues,[\s\S]*workspace: \.health/);
  assert.match(view, /live health check[\s\S]*unavailable/);
  assert.match(view, /if !admin\.hasCompletedRefresh \{[\s\S]*Checking release services/);
  assert.match(view, /case \.unavailable:[\s\S]*Text\("—"\)/);
  assert.match(view, /Unavailable totals are hidden so they cannot be mistaken for zero/);
});

test('native member communications supports a safe complete notice lifecycle', async () => {
  const [view, store, api, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  assert.match(models, /struct AdminAnnouncementDraft: Equatable/);
  assert.match(models, /published_at > now \{ return "Scheduled" \}/);
  assert.match(models, /Action label and destination must be provided together/);
  assert.match(models, /url\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(api, /func adminSaveAnnouncement/);
  assert.match(api, /func adminUnpublishAnnouncement/);
  assert.match(api, /func adminSetAnnouncementArchived/);
  assert.match(api, /func adminDeleteAnnouncement/);
  assert.ok(api.includes('URLQueryItem(name: "updated_at", value: "eq.\\(announcement.updated_at)")'));
  assert.match(api, /guard !announcement\.wasPublished/);
  assert.match(store, /private var announcementMutationAvailable: Bool/);
  assert.match(store, /Refresh Member Notices before changing communications/);
  assert.match(store, /mergeAnnouncement\(outcome\.announcement\)/);
  assert.match(store, /No enabled iOS devices were registered/);

  const communications = view.slice(
    view.indexOf('private struct AdminCommunicationsView'),
    view.indexOf('private struct AdminAnnouncementComposer'),
  );
  assert.match(communications, /AdminAnnouncementStatusStrip/);
  assert.match(communications, /Showing the last notice snapshot/);
  assert.match(communications, /Label\("Review and publish", systemImage: "paperplane"\)/);
  assert.match(communications, /Label\("Unpublish", systemImage: "eye\.slash"\)/);
  assert.match(communications, /Label\("Archive", systemImage: "archivebox"\)/);
  assert.match(communications, /Label\("Delete draft", systemImage: "trash"\)/);
  assert.match(communications, /\.refreshable \{ await admin\.refreshAnnouncements\(session: session\) \}/);

  const composer = view.slice(
    view.indexOf('private struct AdminAnnouncementComposer'),
    view.indexOf('private enum AdminOwnerQuickAction'),
  );
  assert.match(composer, /\.safeAreaInset\(edge: \.bottom/);
  assert.match(composer, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(composer, /\.scrollDismissesKeyboard\(\.interactively\)/);
  assert.match(composer, /\.interactiveDismissDisabled\(isDirty \|\| isBusy\)/);
  assert.match(composer, /Section\("Member action"\)/);
  assert.match(composer, /Section\("Visibility window"\)/);
  assert.match(composer, /owner\.notice\.save/);
  assert.match(composer, /owner\.notice\.publish/);
});

test('native member records can send and audit private member notices', async () => {
  const [view, store, api, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  assert.match(models, /struct AdminMemberNotice: Identifiable, Codable, Hashable/);
  assert.match(models, /struct AdminMemberNoticeDraft: Equatable/);
  assert.match(models, /case \.booking: return \("Book a class", "\/booking"\)/);
  assert.match(models, /guard \[7, 30, 90\]\.contains\(expiryDays\)/);
  assert.match(api, /func adminMemberNotices[\s\S]*path: "admin_list_member_notices"/);
  assert.match(api, /func adminSendMemberNotice[\s\S]*path: "admin_send_member_notice"/);
  assert.match(api, /action: "notify_targeted_announcement"/);
  assert.match(api, /The notice is live in the member app, but Apple push delivery needs attention/);
  assert.match(store, /async let noticesRequest = api\.adminMemberNotices/);
  assert.match(store, /failures\.append\("private notices"\)/);
  assert.match(store, /func sendMemberNotice/);
  assert.match(store, /loadedMemberDetailID == memberID/);
  assert.match(store, /let notices = try await api\.adminMemberNotices[\s\S]*memberNotices = notices/);
  assert.match(store, /memberDetailGeneration == generation,[\s\S]*loadedMemberDetailID == memberID/);
  assert.match(store, /Private notice sent, but delivery history could not refresh/);

  const detail = view.slice(
    view.indexOf('private struct AdminMemberDetailView'),
    view.indexOf('private struct AdminCreditGrantView'),
  );
  assert.match(detail, /privateNoticesSection/);
  assert.match(detail, /Label\("Send private notice", systemImage: "bell\.badge"\)/);
  assert.match(detail, /AdminMemberNoticeHistoryRow/);
  assert.match(detail, /notice\.receiptLabel/);
  assert.match(detail, /notice\.deliveryLabel/);
  assert.match(detail, /private struct AdminMemberNoticeComposer/);
  assert.match(detail, /\.safeAreaInset\(edge: \.bottom/);
  assert.match(detail, /\.scrollDismissesKeyboard\(\.interactively\)/);
  assert.match(detail, /\.interactiveDismissDisabled\(isDirty \|\| isSending\)/);
  assert.match(detail, /Discard private notice draft\?/);
  assert.match(detail, /owner\.memberNotice\.send/);
});

test('native owner queues auto-sync without disturbing unrelated command-centre work', async () => {
  const [view, store, api] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
  ]);

  assert.match(store, /enum AdminOperationalRefreshPolicy/);
  assert.match(store, /intervalNanoseconds: UInt64 = 60_000_000_000/);
  assert.match(store, /staleAfter: TimeInterval = 120/);
  assert.match(store, /@Published private\(set\) var isRefreshingOperations = false/);
  assert.match(store, /@Published private\(set\) var operationalUpdatedAt: Date\?/);
  assert.match(store, /func refreshOperationalPulse\(session: AuthSession\) async -> Bool/);
  for (const operation of [
    'api.adminDailyOperations',
    'api.adminWaitlist',
    'api.adminFollowUps',
    'api.adminMemberActivationQueue',
    'api.adminOrders',
    'api.adminPTRequests',
  ]) assert.match(store, new RegExp(operation.replace('.', '\\.')));
  assert.match(store, /promotingSessionID == nil[\s\S]*loggingFollowUpMemberID == nil/);
  assert.match(store, /updatingBookingID == nil[\s\S]*recordingAttendanceSessionID == nil/);
  assert.match(store, /updatingBookingRequestIDs\.isEmpty/);
  assert.match(store, /operatingOrderID == nil/);
  assert.match(store, /savingClassID == nil[\s\S]*cancellingClassID == nil/);
  assert.match(store, /loadedSources\.formUnion\(successfulSources\)/);
  assert.match(store, /refreshUnavailableSources\.removeAll \{ operationalSources\.contains\(\$0\) \}/);
  assert.match(store, /operationalQueueState = failures\.isEmpty[\s\S]*\.partial\(unavailableSources: failures\)/);
  assert.match(store, /if failures\.isEmpty \{\s*operationalUpdatedAt = Date\(\)/);
  assert.match(store, /if hasUnavailableSources \{ return \.stale \}/);

  assert.match(view, /\.task\(id: operationalPulseTaskID\)/);
  assert.match(view, /Task\.sleep\(nanoseconds: AdminOperationalRefreshPolicy\.intervalNanoseconds\)/);
  assert.match(view, /await admin\.refreshOperationalPulse\(session: session\)/);
  assert.match(view, /hasUnavailableSources: admin\.operationalQueueHasUnavailableSources/);
  assert.match(view, /TimelineView\(\.periodic\(from: \.now, by: 30\)\)/);
  assert.match(view, /accessibilityIdentifier\("owner\.operationalPulse"\)/);
  assert.match(view, /Refreshes requests, waitlists, retention, activation, orders and private training/);
  assert.doesNotMatch(api, /func adminOperationalPulse/);
});

test('native protected order and event routes resolve records outside the initial snapshot', async () => {
  const [store, api] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
  ]);

  assert.match(api, /func adminOrder\(session auth: AuthSession, id: UUID\)/);
  assert.match(api, /func adminEvent\(session auth: AuthSession, id: UUID\)/);
  assert.ok((api.match(/URLQueryItem\(name: "id", value: "eq\.\\\(id\.uuidString\)"\)/g) || []).length >= 2);
  assert.match(store, /case \.order\(let orderID\):[\s\S]*api\.adminOrder\(session: session, id: orderID\)/);
  assert.match(store, /orders\.removeAll\(where: \{ \$0\.id == orderID \}\)[\s\S]*orders\.insert\(order, at: 0\)/);
  assert.match(store, /case \.event\(let eventID\):[\s\S]*api\.adminEvent\(session: session, id: eventID\)/);
  assert.match(store, /events\.removeAll\(where: \{ \$0\.id == eventID \}\)[\s\S]*events\.insert\(event, at: 0\)/);
  assert.doesNotMatch(store, /case \.order, \.event:\s*return/);
  assert.doesNotMatch(store, /case \.order, \.event:\s*break/);
});

test('native platform controls and health recovery remain safe and reachable on compact iPhones', async () => {
  const [view, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
  ]);
  const platform = view.slice(view.indexOf('private struct AdminPlatformView'), view.indexOf('private struct AdminCommunicationsView'));
  const health = view.slice(view.indexOf('private struct AdminOperationsHealthView'), view.indexOf('private struct HealthStatusRow'));

  assert.match(platform, /safeAreaInset\(edge: \.bottom, spacing: 0\)[\s\S]*platformSaveBar/);
  assert.match(platform, /accessibilityIdentifier\("owner\.platform\.save"\)/);
  assert.match(platform, /scrollDismissesKeyboard\(\.interactively\)/);
  assert.match(platform, /lastLoadedSettings/);
  assert.match(platform, /draft == nil \|\| draft == lastLoadedSettings/);
  assert.match(platform, /Live platform settings could not be refreshed/);
  assert.match(platform, /No safe settings snapshot is available/);
  assert.match(platform, /private var platformMutationAvailable: Bool/);
  assert.match(platform, /!admin\.isSavingSettings[\s\S]*!isExitSaving/);
  assert.ok((platform.match(/disabled\(!platformMutationAvailable\)/g) || []).length >= 3);
  assert.match(platform, /let onDraftChange: \(AdminPlatformSettings\?\) -> Void/);
  assert.match(platform, /onDraftChange\(value\)/);
  assert.match(platform, /private func save\(_ settings:[\s\S]*guard platformMutationAvailable else \{ return \}/);
  assert.match(platform, /platformMutationAvailable[\s\S]*draft != admin\.settings/);
  assert.match(store, /loadedSources\.insert\("platform controls"\)/);
  assert.match(store, /refreshUnavailableSources\.removeAll \{ \$0 == "platform controls" \}/);
  assert.match(store, /guard loadedSources\.contains\("platform controls"\),[\s\S]*Refresh Platform Controls before saving/);
  assert.match(platform, /XertHaptics\.play\(\.success\)/);
  assert.match(health, /private var stripeHealthIsCurrent: Bool/);
  assert.match(health, /private var pushHealthIsCurrent: Bool/);
  assert.match(health, /Stripe — last snapshot/);
  assert.match(health, /Actions and readiness checkmarks stay hidden until Stripe health refreshes successfully/);
  assert.match(health, /if let commerce = admin\.commerceHealth, stripeHealthIsCurrent/);
  assert.match(health, /if let push = admin\.pushHealth, pushHealthIsCurrent/);
  assert.match(health, /Retry health checks/);
});

test('native session-pack tools require a current catalogue before exposing mutations', async () => {
  const [view, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
  ]);
  const products = view.slice(view.indexOf('private struct AdminProductsView'), view.indexOf('private struct AdminProductRow'));
  const editor = view.slice(view.indexOf('private struct AdminProductEditor'), view.indexOf('private struct AdminEventsView'));

  assert.match(products, /private var pricingDataIsCurrent: Bool/);
  assert.match(products, /private var pricingDataIsPending: Bool/);
  assert.match(products, /Loading session packs…/);
  assert.ok((products.match(/disabled\(!pricingMutationAvailable\)/g) || []).length >= 2);
  assert.match(editor, /private var pricingMutationAvailable: Bool/);
  assert.match(editor, /Session-pack data is unavailable\. Retry before changing prices or sale state/);
  assert.match(editor, /isDirty && validationMessage == nil && !isProductMutationInFlight && pricingMutationAvailable/);
  assert.match(store, /guard loadedSources\.contains\("session packs"\),[\s\S]*Refresh Session Packs & Pricing before saving/);
});

test('native owner cross-workspace actions preserve compact workflow context', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');

  const retention = view.slice(view.indexOf('private struct AdminRetentionView'), view.indexOf('private struct AdminFinanceView'));
  assert.match(retention, /@State private var presentedMember: AdminMemberSummary\?/);
  assert.match(retention, /await admin\.resolveOwnerTask\(session: session, task: \.member\(memberID\)\)/);
  assert.match(retention, /\.sheet\(item: \$presentedMember\)/);
  assert.doesNotMatch(retention, /onOpenTask/);

  const platform = view.slice(view.indexOf('private struct AdminPlatformView'), view.indexOf('private struct AdminCommunicationsView'));
  assert.match(view, /@State private var platformDraftSnapshot: AdminPlatformSettings\?/);
  assert.match(view, /private enum OwnerExitRequest: Equatable/);
  assert.match(view, /"Unsaved Member App Controls"/);
  assert.match(view, /"Discard changes and continue"/);
  assert.match(view, /"Keep editing"/);
  assert.match(view, /private func requestOwnerExit\(_ request: OwnerExitRequest\)/);
  assert.match(view, /private func savePlatformDraftAndComplete\(_ request: OwnerExitRequest\)/);
  assert.match(view, /private func discardPlatformDraftAndComplete\(_ request: OwnerExitRequest\)/);
  assert.match(view, /interactiveDismissDisabled\(hasUnsavedPlatformDraft \|\| admin\.isSavingSettings \|\| isSavingPlatformExit\)/);
  assert.match(view, /let didSave = await admin\.saveSettings\(session: session, draft: draft\)[\s\S]*if didSave \{[\s\S]*performOwnerExit\(request\)/);
  assert.match(view, /case \.closeOwner:\s*requestOwnerExit\(\.close\)/);
  assert.match(view, /Button \{ requestOwnerExit\(\.close\) \}/);
  assert.match(view, /private var compactNavigationPath:[\s\S]*hasUnsavedPlatformDraft[\s\S]*requestOwnerExit/);
  assert.match(platform, /initialDraft \?\? admin\.settings/);
  assert.match(platform, /requestPricingNavigation\(\)[\s\S]*onOpenPricing\(\)/);
  assert.doesNotMatch(platform, /confirmingPricingNavigation/);
});

test('owner queue freshness and booking mutations keep dashboard counts trustworthy', async () => {
  const store = await read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');

  assert.match(store, /enum AdminOperationalQueueState: Equatable/);
  assert.match(store, /operationalQueueState = \.loading/);
  assert.match(store, /@Published private\(set\) var refreshUnavailableSources: \[String\] = \[\]/);
  assert.match(store, /refreshUnavailableSources = failures/);
  assert.doesNotMatch(store, /errorMessage = "Could not refresh/);
  assert.doesNotMatch(store, /catch \{ failures\.append\("Stripe health"\); queueFailures\.append/);
  assert.doesNotMatch(store, /catch \{ failures\.append\("push health"\); queueFailures\.append/);
  assert.match(store, /queueFailures\.isEmpty[\s\S]*\.ready[\s\S]*\.partial\(unavailableSources: queueFailures\)/);
  assert.match(store, /private func refreshBookingOperationsAfterMutation/);
  assert.match(store, /async let bookingRequest = api\.adminBookingRequests/);
  assert.match(store, /async let operationsRequest = api\.adminDailyOperations/);
  assert.match(store, /async let waitlistRequest = api\.adminWaitlist/);
  assert.ok((store.match(/await refreshBookingOperationsAfterMutation\(/g) || []).length >= 3);
  assert.match(view, /AdminRefreshDataWarning\(/);
  assert.match(view, /Retry unavailable data/);
  assert.match(view, /Task \{ await admin\.refresh\(session: session\) \}/);
});

test('native owner navigation adapts into a categorized scene-restored iPad workspace', async () => {
  const [view, ownerNavigation] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
  ]);

  assert.match(ownerNavigation, /enum XertOwnerWorkspaceSection: String, CaseIterable, Identifiable/);
  for (const section of ['operate', 'grow', 'publish', 'commerce', 'platform']) {
    assert.match(ownerNavigation, new RegExp(`case ${section}`));
  }
  assert.match(ownerNavigation, /enum XertOwnerWorkspace: String, CaseIterable, Identifiable, Codable, Hashable/);
  for (const workspace of [
    'overview', 'members', 'classDesk', 'bookingRequests', 'timetable', 'availability',
    'ptRequests', 'retention', 'leads', 'campaigns', 'siteContent', 'notices', 'events',
    'team', 'finance', 'orders', 'products', 'controls', 'health', 'audit',
  ]) assert.match(ownerNavigation, new RegExp(`case ${workspace}`));
  assert.match(view, /@Environment\(\\\.horizontalSizeClass\) private var horizontalSizeClass/);
  assert.match(view, /@SceneStorage\("xert\.adminWorkspace"\)/);
  assert.match(view, /@SceneStorage\("xert\.adminRecentWorkspaces"\)/);
  assert.match(view, /horizontalSizeClass == \.regular[\s\S]*ownerSplitWorkspace/);
  assert.match(view, /NavigationSplitView \{/);
  assert.match(view, /List\(selection: workspaceSelection\)/);
  assert.match(view, /XertOwnerWorkspace\.workspaces\(in: section\)/);
  assert.match(view, /NavigationStack\(path: compactNavigationPath\)/);
  assert.match(view, /navigationDestination\(for: XertOwnerWorkspace\.self\)/);
  assert.match(view, /navigationDestination\(for: XertOwnerWorkspace\.self\)[\s\S]*workspaceDestination\(workspace, session: session\)[\s\S]*navigationBarTitleDisplayMode\(\.inline\)/);
  assert.match(view, /applyRequestedRoute\(requestedRoute, resolvesTask: false\)/);
  assert.match(view, /navigationSplitViewColumnWidth\(min: 230, ideal: 270, max: 320\)/);
  assert.match(view, /navigationSplitViewStyle\(\.balanced\)/);
  assert.match(view, /workspaceDestination\(currentWorkspace, session: session\)[\s\S]*\.id\(currentWorkspace\)[\s\S]*navigationBarTitleDisplayMode\(\.inline\)/);
  assert.match(view, /private func workspaceBadge/);
  assert.match(view, /@ViewBuilder\s+private func workspaceDestination[\s\S]*-> some View/);
  assert.doesNotMatch(view, /AnyView\(/);
  assert.match(view, /case \.overview:\s+dashboard\(session: session\)/);
  assert.match(view, /managementDirectory/);
  assert.match(view, /private func openOwnerRoute\(_ route: XertOwnerRoute/);
  assert.match(view, /applyOwnerRoute\(ownerRouteHistory\.current\)/);
  assert.match(view, /private func openWorkspace\(_ workspace: XertOwnerWorkspace\)/);
  assert.match(view, /onChange\(of: compactPath\)[\s\S]*let workspace = path\.last \?\? \.overview/);
  assert.match(view, /navigationDestination\(for: XertOwnerWorkspace\.self\)[\s\S]*toolbar \{ ownerWorkspaceToolbar \}/);
  assert.match(view, /private struct AdminWorkspaceSwitcher: View/);
  assert.match(view, /\.searchable\(text: \$query, prompt: "Workspace, Stripe launch, class, member or record"\)/);
  assert.match(view, /\.keyboardShortcut\("k", modifiers: \.command\)/);
  assert.match(view, /workspaceSection\("Needs attention", workspaces: attentionWorkspaces\)/);
  assert.match(view, /workspaceSection\("Recent", workspaces: matchingRecent\)/);
  assert.match(ownerNavigation, /struct XertOwnerWorkspaceRecency: Equatable/);
  assert.match(ownerNavigation, /static let maximumCount = 6/);
  assert.match(ownerNavigation, /func matches\(_ query: String\) -> Bool/);
  assert.match(view, /private func classSummary\(_ item: AdminClassSession\) -> String/);
  assert.match(view, /private func classDay\(_ item: AdminClassSession\) -> String/);
  assert.match(view, /private func classMonth\(_ item: AdminClassSession\) -> String/);
  assert.match(view, /ForEach\(rows\) \{ item in\s*classRow\(item\)/);
  assert.match(view, /private func classStatusActions\(_ item: AdminClassSession\) -> some View/);
  assert.match(view, /if item\.public_visible == true/);
});

test('native owner overview turns Stripe launch evidence into one exact next action', async () => {
  const [view, navigation] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
  ]);

  assert.match(navigation, /enum XertStripeLaunchPhase: Equatable/);
  assert.match(navigation, /struct XertStripeLaunchRunway: Equatable/);
  assert.match(navigation, /guard sourcesAreCurrent else/);
  assert.match(navigation, /guard hasActiveProducts else/);
  assert.match(navigation, /guard activeProductsAreLinked else/);
  assert.match(navigation, /guard healthReady == true else/);
  assert.match(navigation, /guard let bookingsEnabled, let paymentsEnabled else/);
  assert.match(navigation, /if paymentsEnabled && !bookingsEnabled/);
  assert.match(navigation, /guard bookingsEnabled else/);
  assert.match(navigation, /guard paymentsEnabled else/);
  assert.match(navigation, /paymentSwitchState\?\.lowercased\(\) == "enabled", activationReceiptReady == true/);
  assert.match(navigation, /route: exactProductRoute\(blockingProductIDs\) \?\? XertOwnerRoute\(workspace: \.products\)/);
  assert.match(navigation, /phase: \.readyToOpenBookings[\s\S]*route: XertOwnerRoute\(workspace: \.controls\)/);
  assert.match(navigation, /phase: \.readyToActivate[\s\S]*route: XertOwnerRoute\(workspace: \.controls\)/);
  assert.match(view, /stripeLaunchRunway[\s\S]*quickTools/);
  assert.match(view, /requiredSources = \["platform controls", "session packs", "Stripe health"\]/);
  assert.match(view, /activeProducts\.allSatisfy\(\\\.hasStableStripePriceID\)/);
  assert.match(view, /accessibilityIdentifier\("owner\.stripeLaunchRunway"\)/);
  assert.match(view, /launchRunway: stripeLaunchState/);
  assert.match(view, /private var launchRunwayMatches: Bool/);
  assert.match(view, /"stripe launch checkout payments activation"/);
  assert.match(view, /Button \{ onOpenRoute\(launchRunway\.route\) \}/);
  assert.match(view, /accessibilityIdentifier\("owner\.commands\.stripeLaunch"\)/);
  assert.match(view, /Toggle\("Bookings enabled", isOn: bookingsEnabledBinding\)/);
  assert.match(view, /if !isEnabled \{[\s\S]*value\.payments_enabled = false/);
  assert.match(view, /Open bookings and complete the booking smoke test before enabling payments/);
});

test('native owner class work opens exact protected rosters from overview and search', async () => {
  const [view, navigation, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
  ]);

  assert.match(navigation, /case classSession\(UUID\)/);
  assert.match(navigation, /case \.classSession: return \.classDesk/);
  assert.match(navigation, /case \.classSession\(let id\): return "class\/\\\(id\.uuidString\.lowercased\(\)\)"/);
  assert.match(navigation, /case \(\.classDesk, "class"\): return \.classSession\(id\)/);
  assert.match(navigation, /case classSession = "Today's Classes"/);
  assert.match(navigation, /classes: \[AdminDailyOperation\] = \[\]/);
  assert.match(navigation, /classes\.map\(classCandidate\)/);
  assert.match(view, /classes: admin\.dailyOperations/);
  assert.match(view, /openOwnerRouteWithFeedback\(XertOwnerRoute\(task: \.classSession\(item\.id\)\)\)/);
  assert.match(view, /singleAttendanceTask[\s\S]*return \.classSession\(operation\.id\)/);
  assert.match(view, /case \.classSession\(let id\):[\s\S]*AdminClassRosterView/);
  assert.match(store, /case \.classSession\(let sessionID\):[\s\S]*api\.adminDailyOperations/);
});

test('native roll call requires explicit complete attendance and provides compact batch controls', async () => {
  const [view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);
  const roster = view.slice(
    view.indexOf('private struct AdminClassRosterView'),
    view.indexOf('private struct AdminScheduleView'),
  );

  assert.match(models, /enum AdminAttendanceMark[\s\S]*case attended[\s\S]*case noShow = "no_show"/);
  assert.match(models, /struct AdminAttendanceDraft: Equatable/);
  assert.match(models, /var isComplete: Bool \{ total > 0 && unmarked == 0 \}/);
  assert.match(models, /case AdminAttendanceMark\.attended\.rawValue/);
  assert.doesNotMatch(roster, /default: member\.status != "no_show"/);
  assert.match(roster, /attendanceSummary\.isComplete/);
  assert.match(roster, /Mark every member present or no show before saving/);
  assert.match(roster, /Label\("Mark all present", systemImage: "checkmark\.circle"\)/);
  assert.match(roster, /Label\("Clear marks", systemImage: "arrow\.counterclockwise"\)/);
  assert.match(roster, /title: "Present"[\s\S]*mark: \.attended/);
  assert.match(roster, /title: "No show"[\s\S]*mark: \.noShow/);
  assert.match(roster, /\.disabled\(!canRecordAttendance\)/);
  assert.match(roster, /attendedIDs: attended[\s\S]*noShowIDs: noShows/);
});

test('native class desk never presents unavailable operational data as an empty queue', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const desk = view.slice(
    view.indexOf('private struct AdminClassesView'),
    view.indexOf('private struct AdminClassRosterView'),
  );

  assert.match(desk, /admin\.loadedSources\.contains\("today's classes"\)[\s\S]*!admin\.refreshUnavailableSources\.contains\("today's classes"\)/);
  assert.match(desk, /admin\.loadedSources\.contains\("waitlists"\)[\s\S]*!admin\.refreshUnavailableSources\.contains\("waitlists"\)/);
  assert.match(desk, /Today's classes are unavailable\. Refresh before relying on this desk/);
  assert.match(desk, /Waitlists are unavailable\. Refresh before assuming every queue is clear/);
  assert.match(desk, /Showing the last waitlist snapshot\. Refresh before promoting a member/);
  assert.match(desk, /!waitlistIsCurrent \|\| !item\.can_promote/);
  assert.match(desk, /\.refreshable \{ await admin\.refresh\(session: session\) \}/);
});

test('native request notes can omit a workflow status exactly like the RPC contract', async () => {
  const api = await readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8');
  assert.match(api, /private struct AdminRequestUpdate: Encodable \{[\s\S]*let p_status: String\?/);
  assert.match(api, /adminUpdateLegacyBookingNotes[\s\S]*p_status: nil[\s\S]*p_update_admin_notes: true/);
});

test('native campaign attribution keeps form origin separate from marketing source', async () => {
  const models = await read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift');
  const summary = models.slice(models.indexOf('struct AdminCampaignSummary'), models.indexOf('enum AdminSiteContentSection'));

  assert.match(summary, /sources = Self\.breakdown\(rows: filteredRows, fallback: "Direct \/ unknown"\) \{\s*Self\.clean\(\$0\.utm_source\)\s*\}/);
  assert.match(summary, /Self\.clean\(row\.utm_source\) \?\? "Direct \/ unknown"/);
  assert.match(summary, /Self\.clean\(row\.source\) \?\? ""/);
  assert.doesNotMatch(summary, /utm_source\) \?\? Self\.clean\([^\n]*source/);
});

test('native reporting desks never present unavailable evidence as zero activity', async () => {
  const [api, store, view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);
  const campaigns = view.slice(
    view.indexOf('private struct AdminCampaignAttributionView'),
    view.indexOf('private struct AdminCampaignMetric'),
  );
  const audit = view.slice(
    view.indexOf('private struct AdminAuditView'),
    view.indexOf('private struct AdminAuditCSVDocument'),
  );

  for (const state of [
    'hasLoadedCampaignAttribution',
    'campaignAttributionUnavailable',
    'campaignAttributionStatusMessage',
    'campaignAttributionUpdatedAt',
    'hasLoadedAudit',
    'auditUnavailable',
    'auditPartialSources',
    'auditStatusMessage',
    'auditUpdatedAt',
  ]) {
    assert.match(store, new RegExp(`@Published private\\(set\\) var ${state}`));
  }
  assert.match(store, /var campaignAttributionIsCurrent: Bool/);
  assert.match(store, /if !force, campaignAttributionIsCurrent \{ return \}/);
  assert.match(store, /campaignAttributionStatusMessage = hasLoadedCampaignAttribution[\s\S]*last loaded report remains visible but is stale/);
  assert.match(store, /var auditIsCurrent: Bool/);
  assert.match(store, /func loadAudit\(session: AuthSession, force: Bool = false\)/);
  assert.match(store, /auditStatusMessage = hasLoadedAudit[\s\S]*last loaded history remains visible but is stale/);
  assert.match(api, /func adminAudit\(session auth: AuthSession\) async throws -> AdminAuditSnapshot/);
  assert.match(api, /Result<\[AdminRoleAuditRow\], Error>/);
  assert.match(api, /Result<\[AdminBookingAuditRow\], Error>/);
  assert.match(api, /guard unavailableSources\.count < 8/);
  assert.match(models, /struct AdminAuditSnapshot[\s\S]*unavailableSources: \[String\][\s\S]*var isComplete/);

  assert.match(campaigns, /if !admin\.hasLoadedCampaignAttribution/);
  assert.match(campaigns, /LIVE REPORT[\s\S]*CACHED REPORT/);
  assert.match(campaigns, /\.disabled\(!reportIsCurrent \|\| summary\.total == 0\)/);
  assert.match(campaigns, /Retry campaign report/);
  assert.match(campaigns, /frame\(width: 44, height: 44\)/);

  assert.match(audit, /if !admin\.hasLoadedAudit/);
  assert.match(audit, /LIVE HISTORY[\s\S]*CACHED HISTORY[\s\S]*PARTIAL HISTORY/);
  assert.match(audit, /\.disabled\(!reportIsCurrent \|\| rows\.isEmpty\)/);
  assert.match(audit, /Retry Admin Audit/);
  assert.match(audit, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(audit, /\.refreshable \{ await admin\.loadAudit\(session: session, force: true\) \}/);
  assert.match(models, /struct AdminAuditExport[\s\S]*prefix\(300\)[\s\S]*replacingOccurrences\(of: "\\\"", with: "\\\"\\\""\)/);
});

test('native member records provide bounded truthful account history and guarded credit grants', async () => {
  const [api, store, view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  for (const method of [
    'adminMemberCreditBatches',
    'adminMemberCreditGrants',
    'adminMemberBookings',
    'adminMemberOrders',
  ]) {
    const start = api.indexOf(`func ${method}`);
    assert.notEqual(start, -1, `${method} should exist`);
    const contract = api.slice(start, start + 1_900);
    assert.match(contract, /URLQueryItem\(name: "user_id", value: "eq\.\\\(memberID\.uuidString\)"\)/);
    assert.match(contract, /URLQueryItem\(name: "order", value: "created_at\.desc,id\.desc"\)/);
    assert.match(contract, /URLQueryItem\(name: "limit", value: "50"\)/);
  }

  assert.match(models, /struct AdminMemberCreditBatch: Identifiable, Codable, Hashable/);
  assert.match(models, /struct AdminMemberCreditGrant: Identifiable, Codable, Hashable/);
  assert.match(models, /struct AdminMemberBookingHistory: Identifiable, Codable, Hashable/);
  assert.match(models, /enum AdminMemberHistoryTab[\s\S]*case credits[\s\S]*case bookings[\s\S]*case purchases/);

  for (const request of ['creditsRequest', 'grantsRequest', 'bookingsRequest', 'ordersRequest']) {
    assert.match(store, new RegExp(`async let ${request}`));
  }
  for (const source of ['credit history', 'credit audit', 'booking history', 'purchase history']) {
    assert.match(store, new RegExp(`failures\\.append\\("${source}"\\)`));
  }
  assert.match(store, /guard loadedMemberDetailID == memberID,[\s\S]*loadingMemberDetailID == nil,[\s\S]*!memberDetailUnavailableSources\.contains\("credit audit"\)/);
  assert.match(store, /Credit audit is unavailable\. Refresh this member record before granting credits\./);
  assert.match(store, /Credits were granted, but/);

  const memberRecord = view.slice(
    view.indexOf('private struct AdminMemberDetailView'),
    view.indexOf('private struct AdminMemberNoticeHistoryRow'),
  );
  assert.match(memberRecord, /Picker\("Account history", selection: \$historyTab\)/);
  assert.match(memberRecord, /\.pickerStyle\(\.segmented\)/);
  assert.match(memberRecord, /case \.credits:[\s\S]*creditHistory/);
  assert.match(memberRecord, /case \.bookings:[\s\S]*bookingHistory/);
  assert.match(memberRecord, /case \.purchases:[\s\S]*purchaseHistory/);
  assert.match(memberRecord, /admin\.memberCreditGrants\.first\(where: \{ \$0\.credit_batch_id == batch\.id \}\)/);
  assert.match(memberRecord, /Manual grant reasons are unavailable\./);
  assert.match(memberRecord, /Purchase history is unavailable\./);
  assert.match(memberRecord, /Booking history is unavailable\./);
  assert.match(memberRecord, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(memberRecord, /admin\.memberDetailUnavailableSources\.contains\("credit audit"\)/);
});

test('native revenue desk filters and exports a current ledger and member purchases open exact operations', async () => {
  const [view, models, api] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
  ]);

  assert.match(api, /func adminOrders[\s\S]*let pageSize = 500[\s\S]*created_at\.desc,id\.desc[\s\S]*offset/);
  assert.match(models, /enum AdminOrderRange: String, CaseIterable, Identifiable/);
  assert.match(models, /struct AdminOrderReport/);
  assert.match(models, /status == "all" \|\| order\.status == status/);
  assert.match(models, /normalizedCurrency == "all" \|\| orderCurrency\.lowercased\(\) == normalizedCurrency/);
  assert.match(models, /cutoff\.map \{ order\.created_at >= \$0 \} \?\? true/);
  assert.match(models, /Dictionary\(grouping: paid\) \{ Self\.currencyCode\(\$0\) \}/);
  assert.match(models, /Stripe Checkout Session/);
  assert.match(models, /credits_revoked/);
  assert.match(models, /let escaped = value\.replacingOccurrences/);

  const memberRecord = view.slice(
    view.indexOf('private struct AdminMemberDetailView'),
    view.indexOf('private struct AdminMemberNoticeHistoryRow'),
  );
  assert.match(memberRecord, /NavigationLink \{[\s\S]*AdminOrderDetailView\(admin: admin, session: session, order: order\)/);
  assert.match(memberRecord, /Opens payment recovery, reconciliation and refund operations for this purchase/);

  const orders = view.slice(
    view.indexOf('private struct AdminOrdersView'),
    view.indexOf('private struct AdminOrderDetailView'),
  );
  assert.match(orders, /let session: AuthSession/);
  assert.match(orders, /AdminOrderReport\(/);
  assert.match(orders, /Picker\("Reporting range", selection: \$range\)/);
  assert.match(orders, /Picker\("Currency", selection: \$currency\)/);
  assert.match(orders, /ordersAreCurrent/);
  assert.match(orders, /Showing the last order snapshot\. Refresh before exporting or changing a payment\./);
  assert.match(orders, /Section\(ordersAreCurrent \? "Revenue snapshot" : "Last revenue snapshot"\)/);
  assert.match(orders, /\.disabled\(report\.rows\.isEmpty \|\| !ordersAreCurrent\)/);
  assert.match(orders, /AdminOrderCSVDocument\(csv: report\.csv\)/);
  assert.match(orders, /\.fileExporter\(/);
  assert.match(orders, /\.refreshable \{ await admin\.refresh\(session: session\) \}/);
  assert.match(orders, /\.onChange\(of: currencies\)[\s\S]*currency = "all"/);
  assert.match(orders, /ViewThatFits\(in: \.horizontal\)/);
});

test('native class cancellation preserves mutation truth and provides complete member follow-up', async () => {
  const [api, store, view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  assert.match(models, /struct AdminClassCancellationContact: Identifiable, Hashable/);
  assert.match(models, /struct AdminClassCancellationMessage: Hashable/);
  assert.match(models, /struct AdminClassCancellationNoticeOutcome: Codable, Hashable/);
  assert.match(models, /struct AdminClassCancellationFollowUp: Identifiable, Hashable/);
  assert.match(models, /static let maximumBCCRecipients = 40/);
  assert.match(models, /activeStatuses = Set\(\["requested", "confirmed", "waitlisted"\]\)/);
  assert.match(models, /normalizedEmail != nil && \$0\.email == normalizedEmail/);
  assert.match(models, /Any reserved session credit has been returned automatically/);

  const enquiryMethod = api.slice(
    api.indexOf('func adminClassCancellationEnquiries'),
    api.indexOf('func adminClassSessions'),
  );
  assert.match(enquiryMethod, /class_session_id", value: "eq\.\\\(classSessionID\.uuidString\)"/);
  assert.match(enquiryMethod, /status", value: "in\.\(requested,confirmed,waitlisted\)"/);
  assert.match(enquiryMethod, /created_at\.asc,id\.asc/);
  assert.match(enquiryMethod, /while true[\s\S]*offset \+= pageSize/);
  assert.match(api, /func adminNotifyClassCancellation[\s\S]*-> AdminClassCancellationNoticeOutcome/);

  const cancellationStore = store.slice(
    store.indexOf('func cancelClass('),
    store.indexOf('func clearClassCancellationFollowUp'),
  );
  assert.match(cancellationStore, /async let rosterRequest = api\.adminSessionRoster/);
  assert.match(cancellationStore, /async let enquiryRequest = api\.adminClassCancellationEnquiries/);
  assert.match(cancellationStore, /contactLookupFailures \+= 1/);
  assert.match(cancellationStore, /let affectedBookings = try await api\.adminCancelClass/);
  assert.match(cancellationStore, /notification = try await api\.adminNotifyClassCancellation/);
  assert.match(cancellationStore, /The private notice was created, but Apple push delivery could not be confirmed/);
  assert.match(cancellationStore, /refreshWarnings\.append\("full timetable"\)/);
  assert.match(cancellationStore, /refreshWarnings\.append\("today's classes"\)/);
  assert.match(cancellationStore, /refreshWarnings\.append\("waitlists"\)/);
  assert.match(cancellationStore, /bookingRequests = try await api\.adminBookingRequests/);
  assert.match(cancellationStore, /classCancellationFollowUp = followUp[\s\S]*return followUp/);

  assert.match(view, /private struct AdminClassCancellationFollowUpView: View/);
  assert.match(view, /Cancellation result/);
  assert.match(view, /Member notification/);
  assert.match(view, /Contact fallback/);
  assert.match(view, /Ready-to-send message/);
  assert.match(view, /Email \\\(followUp\.emailRecipientCount\) via BCC/);
  assert.match(view, /\.safeAreaInset\(edge: \.bottom/);
  assert.match(view, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(view, /UIPasteboard\.general\.string = followUp\.message\.body/);
  assert.match(view, /\.interactiveDismissDisabled\(\)/);
  assert.match(view, /private var timetableIsCurrent: Bool/);
  assert.match(view, /Showing the last timetable snapshot/);
  assert.match(view, /\.disabled\(!timetableIsCurrent\)/);
  assert.match(view, /\.refreshable \{ await admin\.refresh\(session: session\) \}/);
  assert.match(view, /let mutationAllowed: Bool/);
  assert.match(view, /This timetable snapshot is not current/);
});

test('native schedule controls preserve mutation truth and preview blackout conflicts', async () => {
  const [models, store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const blackoutDraft = models.slice(
    models.indexOf('struct AdminBlackoutDraft'),
    models.indexOf('struct AdminWaitlistItem'),
  );
  assert.match(blackoutDraft, /func overlappingPublishedClasses\(in sessions: \[AdminClassSession\]\)/);
  assert.match(blackoutDraft, /\["all", "group_classes", "facility_only"\]\.contains\(affects\)/);
  assert.match(blackoutDraft, /\["published", "full"\]\.contains\(session\.status\)/);
  assert.match(blackoutDraft, /duration_minutes[\s\S]*session\.end_time[\s\S]*sessionStart < endTime && sessionEnd > startTime/);

  const scheduleStore = store.slice(
    store.indexOf('func saveAvailability'),
    store.lastIndexOf('\\n}'),
  );
  assert.match(store, /@Published private\(set\) var isRefreshingScheduleControls/);
  assert.match(store, /@Published private\(set\) var scheduleMutationWarning/);
  assert.match(scheduleStore, /func refreshScheduleControls\(session: AuthSession\)/);
  assert.match(scheduleStore, /guard scheduleSourceIsCurrent\("availability"\)/);
  assert.match(scheduleStore, /guard scheduleSourceIsCurrent\("blackouts"\), scheduleSourceIsCurrent\("full timetable"\)/);
  assert.match(scheduleStore, /async let availabilityRequest = api\.adminAvailabilityBlocks/);
  assert.match(scheduleStore, /async let blackoutRequest = api\.adminBlackoutPeriods/);
  assert.match(scheduleStore, /async let timetableRequest = api\.adminClassSessions/);
  assert.match(scheduleStore, /Availability created[\s\S]*lastUpdatedAt = Date\(\); return true/);
  assert.match(scheduleStore, /Blackout created[\s\S]*lastUpdatedAt = Date\(\); return true/);
  assert.match(scheduleStore, /but the latest availability list could not be loaded/);
  assert.match(scheduleStore, /but the latest blackout list could not be loaded/);

  const scheduleView = view.slice(
    view.indexOf('private struct AdminAvailabilityView'),
    view.indexOf('private struct AdminRetentionView'),
  );
  assert.match(scheduleView, /private var activeSourceIsCurrent: Bool/);
  assert.match(scheduleView, /private var activeMutationAllowed: Bool/);
  assert.match(scheduleView, /private func removalMutationAllowed\(_ removal: AdminScheduleRemoval\)/);
  assert.match(scheduleView, /No empty-state assumption is being made/);
  assert.match(scheduleView, /\.refreshable \{ await admin\.refreshScheduleControls\(session: session\) \}/);
  assert.match(scheduleView, /Text\("Upcoming"\)\.tag\("upcoming"\)/);
  assert.match(scheduleView, /Classes blocking this blackout/);
  assert.match(scheduleView, /draft\.overlappingPublishedClasses\(in: admin\.classSessions\)/);
  assert.match(scheduleView, /Open a class below to reschedule it/);
  assert.match(scheduleView, /AdminClassEditor\([\s\S]*classSession: classSession,[\s\S]*mutationAllowed: mutationAllowed/);
  assert.match(scheduleView, /\.disabled\(!mutationAllowed \|\| !conflicts\.isEmpty/);
  assert.match(scheduleView, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(scheduleView, /frame\(maxWidth: \.infinity, minHeight: 44\)/);
});

test('native intake desks never hide failed loads or lose confirmed mutation outcomes', async () => {
  const [store, api, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(store, /@Published private\(set\) var loadedLeadPipelines: Set<AdminLeadPipeline>/);
  assert.match(store, /@Published private\(set\) var unavailableLeadPipelines: Set<AdminLeadPipeline>/);
  assert.match(store, /func leadPipelineIsCurrent\(_ pipeline: AdminLeadPipeline\)/);
  assert.match(store, /guard leadPipelineIsCurrent\(pipeline\)/);
  assert.match(store, /refreshLeadPipelineAfterMutation[\s\S]*latest pipeline could not be loaded/);
  assert.match(store, /@Published private\(set\) var hasLoadedBookingRequests = false/);
  assert.match(store, /var bookingRequestsAreCurrent: Bool/);
  assert.match(store, /guard bookingRequestsAreCurrent/);
  assert.match(store, /refreshBookingOperationsAfterMutation[\s\S]*bookingRequestsUnavailable = true/);
  assert.match(store, /completedAction[\s\S]*could not refresh/);
  assert.match(store, /var ptRequestsAreCurrent: Bool/);
  assert.match(store, /guard ptRequestsAreCurrent/);
  assert.match(store, /refreshPTRequestsAfterMutation[\s\S]*latest queue could not be loaded/);
  assert.match(store, /func bulkUpdatePTRequests/);
  assert.match(store, /Array\(requests\.prefix\(50\)\)/);
  assert.match(store, /They remain selected for retry/);

  const ptLoader = api.slice(
    api.indexOf('func adminPTRequests'),
    api.indexOf('func adminLeads'),
  );
  assert.match(ptLoader, /let pageSize = 500/);
  assert.match(ptLoader, /created_at\.desc,id\.desc/);
  assert.match(ptLoader, /while true[\s\S]*offset \+= pageSize/);

  const bookingView = view.slice(
    view.indexOf('private struct AdminBookingRequestsView'),
    view.indexOf('private struct AdminSiteContentView'),
  );
  assert.match(bookingView, /private var requestsAreCurrent: Bool/);
  assert.match(bookingView, /No empty queue assumption is being made/);
  assert.match(bookingView, /if admin\.hasLoadedBookingRequests[\s\S]*Last matching workload/);
  assert.match(bookingView, /mutationAllowed: requestsAreCurrent/);
  assert.match(bookingView, /decisions and staff notes are read-only/);

  const intakeViews = view.slice(
    view.indexOf('private struct AdminLeadsView'),
    view.indexOf('private struct AdminPlatformView'),
  );
  assert.match(intakeViews, /private var pipelineIsCurrent: Bool/);
  assert.match(intakeViews, /No empty pipeline assumption is being made/);
  assert.match(intakeViews, /Contact details remain available, but status and notes are read-only/);
  assert.match(intakeViews, /private var requestsAreCurrent: Bool \{ admin\.ptRequestsAreCurrent \}/);
  assert.match(intakeViews, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(intakeViews, /Submitted \\\(request\.created_at\.formatted/);
  assert.match(intakeViews, /frame\(width: 44, height: 44\)/);
  assert.match(intakeViews, /\.searchable\(text: \$query, prompt: "Name, contact, goal or notes"\)/);
  assert.match(intakeViews, /Picker\("Session type", selection: \$sessionTypeFilter\)/);
  assert.match(intakeViews, /Section\(requestsAreCurrent \? "Matching workload" : "Last matching workload"\)/);
  assert.match(intakeViews, /selectedIDs = await admin\.bulkUpdatePTRequests/);
  assert.match(intakeViews, /Only requests that fail will remain selected for retry/);
  assert.match(intakeViews, /AdminPTCSVDocument\(csv: report\.csv\)/);
  assert.match(intakeViews, /defaultFilename: "xert-pt-requests-/);
  assert.match(intakeViews, /PT Requests must refresh before owner notes can be changed/);
});

test('native event and team catalogues preserve mutation truth and never fake empty records', async () => {
  const [models, store, api, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(api, /func adminCreateEvent[\s\S]*async throws -> AdminEvent/);
  assert.match(api, /func adminUpdateEvent[\s\S]*async throws -> AdminEvent/);
  assert.match(api, /func adminCreateCoach[\s\S]*async throws -> AdminCoach/);
  assert.match(api, /func adminUpdateCoach[\s\S]*async throws -> AdminCoach/);
  assert.match(api, /return=representation/);

  assert.match(store, /var eventCalendarIsCurrent: Bool/);
  assert.match(store, /var eventTrainingGroupsAreCurrent: Bool/);
  assert.match(store, /var teamDirectoryIsCurrent: Bool/);
  assert.match(store, /func refreshEventCatalogue/);
  assert.match(store, /func refreshTeamDirectory/);
  assert.match(store, /mergeEvent\(saved\)[\s\S]*refreshEventsAfterMutation/);
  assert.match(store, /events\.removeAll \{ \$0\.id == event\.id \}[\s\S]*refreshEventsAfterMutation/);
  assert.match(store, /mergeCoach\(saved\)[\s\S]*refreshTeamAfterMutation/);
  assert.match(store, /coaches\.removeAll \{ \$0\.id == coach\.id \}[\s\S]*refreshTeamAfterMutation/);
  assert.match(store, /eventRosterLoadedEventID = eventID/);
  assert.match(store, /eventRosterUnavailableEventID = eventID/);
  assert.match(store, /eventRosterGeneration &\+= 1[\s\S]*guard generation == eventRosterGeneration/);
  assert.match(store, /but the latest directory could not be loaded/);

  const catalogueViews = view.slice(
    view.indexOf('private struct AdminEventsView'),
    view.indexOf('private struct AdminAnnouncementComposer'),
  );
  assert.match(catalogueViews, /No empty calendar assumption is being made/);
  assert.match(catalogueViews, /\.refreshable \{ await admin\.refreshEventCatalogue\(session: session\) \}/);
  assert.match(catalogueViews, /Picker\("Category", selection: \$categoryFilter\)/);
  assert.match(catalogueViews, /This training group could not be loaded/);
  assert.match(catalogueViews, /AdminEventRosterCSVDocument\(csv: report\.csv\)/);
  assert.match(catalogueViews, /No empty-directory assumption is being made/);
  assert.match(catalogueViews, /\.refreshable \{ await admin\.refreshTeamDirectory\(session: session\) \}/);
  assert.match(catalogueViews, /This calendar snapshot is not current/);
  assert.match(catalogueViews, /This team snapshot is not current/);
  assert.match(catalogueViews, /interactiveDismissDisabled\(isDirty \|\| admin\.savingEventID != nil\)/);
  assert.match(catalogueViews, /interactiveDismissDisabled\(isDirty \|\| admin\.savingCoachID != nil\)/);

  assert.match(models, /struct AdminEventRosterReport/);
  assert.match(models, /Event,Member,Email,Phone,Joined/);
});

test('native site CMS cannot publish defaults over an unavailable live snapshot', async () => {
  const [models, store, api, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(store, /@Published private\(set\) var siteContentUnavailable = false/);
  assert.match(store, /var siteContentIsCurrent: Bool/);
  assert.match(store, /if !force, siteContentIsCurrent \{ return \}/);
  assert.match(store, /Site Content could not refresh\. Last loaded sections remain read-only/);
  assert.match(store, /guard siteContentIsCurrent else \{[\s\S]*Refresh Site Content before publishing/);
  assert.match(store, /guard siteContentIsCurrent else \{[\s\S]*Refresh Site Content before uploading public media/);
  assert.match(store, /siteContentRows\.append\(saved\)[\s\S]*siteContentUnavailable = false/);
  assert.match(api, /rows\.count == 1, saved\.key == section\.rawValue/);

  const cms = view.slice(
    view.indexOf('private struct AdminSiteContentView'),
    view.indexOf('private struct AdminCampaignAttributionView'),
  );
  assert.match(cms, /Built-in defaults are not being treated as the server state/);
  assert.match(cms, /if admin\.hasLoadedSiteContent \{[\s\S]*Section\("Public sections"\)/);
  assert.match(cms, /private var mutationAllowed: Bool/);
  assert.match(cms, /let authoritative = saved\.data\.merged\(over: \.defaults\(for: section\)\)/);
  assert.match(cms, /validationMessage != nil/);
  assert.match(cms, /Hero photography is limited to 12 images/);
  assert.match(cms, /kCGImageSourceThumbnailMaxPixelSize: 2_400/);
  assert.match(cms, /jpegData\(compressionQuality: 0\.86\)/);
  assert.match(cms, /frame\(width: 44, height: 44\)/);

  assert.match(models, /Hero photography is limited to 12 images/);
  assert.match(models, /The About page is limited to 12 paragraphs/);
  assert.match(models, /The homepage is limited to 20 FAQ items/);
  assert.match(models, /Public media URLs must be 2,048 characters or fewer/);
});
