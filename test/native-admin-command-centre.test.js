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
  assert.match(view, /interactiveDismissDisabled\(isDirty \|\| isSaving\)/);
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
  assert.match(api, /path: "admin_set_booking_status"/);
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
  assert.match(view, /AdminClassEditor\(admin: admin, session: session, classSession: nil\)/);
  assert.match(view, /AdminAnnouncementComposer\(isPublishing: admin\.isPublishingAnnouncement\)/);
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
  assert.match(editor, /isDirty && validationMessage == nil && !isSaving && pricingMutationAvailable/);
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
  assert.match(store, /private func refreshBookingOperationsSnapshot/);
  assert.match(store, /async let bookingRequest = api\.adminBookingRequests/);
  assert.match(store, /async let operationsRequest = api\.adminDailyOperations/);
  assert.match(store, /async let waitlistRequest = api\.adminWaitlist/);
  assert.ok((store.match(/try await refreshBookingOperationsSnapshot\(session: session\)/g) || []).length >= 2);
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
  assert.match(navigation, /guard paymentsEnabled == true else/);
  assert.match(navigation, /paymentSwitchState\?\.lowercased\(\) == "enabled", activationReceiptReady == true/);
  assert.match(navigation, /route: exactProductRoute\(blockingProductIDs\) \?\? XertOwnerRoute\(workspace: \.products\)/);
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
