import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('compact owner overview keeps priority work in the page instead of stacking controls above phone chrome', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const dashboard = view.slice(
    view.indexOf('private func dashboard('),
    view.indexOf('private var ownerRunNextDock'),
  );

  assert.match(
    dashboard,
    /ownerHeader[\s\S]*AdminRefreshDataWarning[\s\S]*nextClassFocus[\s\S]*priorityQueue[\s\S]*attentionGrid[\s\S]*quickTools[\s\S]*pinnedDirectory[\s\S]*managementDirectory[\s\S]*businessPulse/,
  );
  assert.doesNotMatch(dashboard, /safeAreaInset|ownerRunNextDock|stripeLaunchRunway|incidentControl/);
  assert.match(dashboard, /frame\(maxWidth: 880\)/);
  assert.match(dashboard, /refreshable \{ await admin\.refresh\(session: session\) \}/);
});

test('partial-data health stays actionable on Today without polluting every owner workspace', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const dashboard = view.slice(
    view.indexOf('private func dashboard('),
    view.indexOf('private var ownerRunNextDock'),
  );
  const surface = view.slice(
    view.indexOf('private func ownerWorkspaceSurface('),
    view.indexOf('private func workspaceDestination('),
  );
  const toolbar = view.slice(
    view.indexOf('private var workspaceSwitcherToolbar'),
    view.indexOf('private var ownerWorkspaceToolbar'),
  );

  assert.match(view, /ownerWorkspaceSurface\(workspace, session: session\)/);
  assert.match(view, /ownerWorkspaceSurface\(currentWorkspace, session: session\)/);
  assert.match(surface, /workspaceDestination\(workspace, session: session\)/);
  assert.doesNotMatch(surface, /safeAreaInset|AdminOwnerDataHealthBar|refreshUnavailableSources/);
  assert.match(dashboard, /!admin\.refreshUnavailableSources\.isEmpty[\s\S]*AdminRefreshDataWarning\(/);
  assert.match(dashboard, /refreshOwnerData\(session: session\)/);
  assert.match(toolbar, /exclamationmark\.triangle\.fill/);
  assert.match(toolbar, /ownerActionsAccessibilityLabel/);
  assert.match(toolbar, /Refresh owner data/);
  assert.match(toolbar, /Label\("Manage", systemImage: "square\.grid\.2x2"\)/);
});

test('native member directory has complete server-backed operator controls', async () => {
  const [api, store, models, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);
  const directory = view.slice(
    view.indexOf('private struct AdminMembersView'),
    view.indexOf('private struct AdminMemberDetailView'),
  );
  const search = store.slice(
    store.indexOf('func searchMembers('),
    store.indexOf('func searchOwnerMembers('),
  );
  const apiMethod = api.slice(
    api.indexOf('func adminMembers('),
    api.indexOf('func adminMember('),
  );

  assert.match(apiMethod, /role: String = "all"/);
  assert.match(apiMethod, /credit: String = "all"/);
  assert.match(apiMethod, /offset: Int = 0/);
  assert.match(apiMethod, /p_role: normalizedRole/);
  assert.match(apiMethod, /p_credit: normalizedCredit/);
  assert.match(apiMethod, /p_offset: max\(offset, 0\)/);

  assert.match(store, /@Published private\(set\) var memberDirectoryRows: \[AdminMemberSummary\] = \[\]/);
  assert.match(store, /@Published private\(set\) var memberDirectoryUnavailable = false/);
  assert.match(search, /memberDirectoryGeneration &\+= 1/);
  assert.match(search, /generation == memberDirectoryGeneration/);
  assert.match(search, /guard !Task\.isCancelled/);
  assert.match(search, /offset: \(safePage - 1\) \* safePageSize/);
  assert.match(search, /The last loaded page is shown and exports are paused/);
  assert.doesNotMatch(search, /members = rows/);
  assert.match(store, /func exportMembers\([\s\S]*let pageSize = 100/);
  assert.match(store, /while rows\.count < \(expectedTotal \?\? Int\.max\)/);
  assert.match(store, /This export exceeds 10,000 members/);
  assert.match(store, /var memberCount: Int \{[\s\S]*members\.map\(\\\.total_count\)\.max\(\)[\s\S]*members\.count/);
  assert.match(store, /await refreshLoadedMemberDirectory\(session: session\)/);
  assert.match(store, /The role was updated, but the member summary could not refresh/);
  assert.match(store, /mergeResolvedMember\(try await api\.adminMember\(session: session, id: memberID\)\)/);

  assert.match(directory, /Picker\("Role", selection: \$role\)/);
  assert.match(directory, /Picker\("Credits", selection: \$credit\)/);
  assert.match(directory, /\.task\(id: requestKey\)/);
  assert.match(directory, /Task\.sleep\(nanoseconds: 300_000_000\)/);
  assert.match(directory, /Label\("Previous", systemImage: "chevron\.left"\)/);
  assert.match(directory, /Label\("Next", systemImage: "chevron\.right"\)/);
  assert.match(directory, /Export filtered member directory CSV/);
  assert.match(directory, /!directoryIsCurrent/);
  assert.match(directory, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(directory, /\.fileExporter\(/);

  assert.match(models, /struct AdminMemberReport/);
  assert.match(models, /"Spent \(AUD\)"/);
  assert.match(models, /String\(format: "%.2f"/);
  assert.doesNotMatch(
    models.slice(models.indexOf('struct AdminMemberReport'), models.indexOf('struct AdminMemberOnboardingSummary')),
    /emergency|note|orders_count/,
  );
});

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
  assert.match(api, /\/api\/admin-push-health/);
  assert.match(api, /xert_schema_capabilities/);
  assert.match(view, /AdminOperationsHealthView/);
  // Payments and memberships are handled in Fitbox: Operations Health no
  // longer renders the Stripe checklist, incidents desk or launch checks.
  assert.doesNotMatch(view, /Stripe launch checklist|Unresolved Stripe incidents|Latest Stripe operation|Stripe — last snapshot/);
  assert.doesNotMatch(view, /Copy Stripe Event ID|Retry safely|Opens the exact session pack blocking Stripe launch/);
  // The guarded incident-recovery plumbing stays in the API and store for the
  // Stripe wind-down, even though the health screen no longer drives it.
  assert.match(adminModels, /let resolution: String\?/);
  assert.match(api, /adminResolveStripeReview/);
  assert.match(adminStore, /resolveStripeReview/);
  assert.match(api, /adminRetryStripeEvent/);
  assert.match(api, /action: "retry_stripe_event"/);
  assert.match(api, /confirmation: "RETRY EVENT"/);
  assert.match(adminStore, /retryingStripeIncidentID/);
  assert.match(adminStore, /func retryStripeEvent/);
  assert.match(view, /AdminAuditView/);
  assert.match(view, /AdminProductsView/);
  assert.match(view, /AdminProductEditor/);
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
  // The Stripe launch checklist is gone from Operations Health (Fitbox owns
  // payments); the guarded payment switch itself still lives in Controls.
  assert.match(view, /Toggle\("Session pack payments", isOn: settingBinding\(\\\.payments_enabled\)\)/);
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
  const [view, design] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminDesignSystem.swift'),
  ]);

  assert.match(view, /private var priorityQueue: some View/);
  const dashboard = view.slice(view.indexOf('private func dashboard(session:'), view.indexOf('private var accessDenied:'));
  assert.match(
    dashboard,
    /nextClassFocus[\s\S]*priorityQueue[\s\S]*attentionGrid[\s\S]*quickTools[\s\S]*pinnedDirectory[\s\S]*managementDirectory[\s\S]*businessPulse/,
  );
  assert.doesNotMatch(dashboard, /shiftBriefing|stripeLaunchRunway|incidentControl|activationPulse|todayDesk/);
  assert.match(view, /private var operationalPriorities: \[AdminPriorityAction\]/);
  assert.match(view, /private struct AdminPriorityRow: View/);
  assert.match(view, /ForEach\(priorities\) \{ priority in/);
  assert.doesNotMatch(view, /operationalPriorities\.prefix/);
  for (const destination of ['health', 'bookingRequests', 'ptRequests', 'classDesk', 'retention', 'orders']) {
    assert.match(view, new RegExp(`workspace: \\.${destination}`));
  }
  assert.match(view, /openOwnerRouteWithFeedback\(priority\.route\)/);
  assert.match(view, /var actionTitle: String \{\s*task == nil \? "Open workspace" : "Open exact task"/);
  assert.match(view, /Label\(priority\.actionTitle, systemImage: "arrow\.right"\)/);
  assert.match(view, /All operational queues are clear/);
  assert.match(view, /case \.idle, \.loading:[\s\S]*Checking operational queues/);
  assert.match(view, /case \.partial\(let unavailableSources\)/);
  assert.match(view, /case \.ready:[\s\S]*All operational queues are clear/);
  assert.match(view, /Button \{\s*openWorkspaceWithFeedback\(\.classDesk\)[\s\S]*Text\("OPEN DESK"\)/);
  assert.match(view, /AdminMetricTile[\s\S]*let action: \(\(\) -> Void\)\?/);
  // adminHeading now delegates to the shared owner design system, so the
  // accessibility trait is asserted where it is actually implemented.
  assert.match(view, /private func adminHeading\(_ title: String\)[\s\S]*XertOwnerHeading\(title\)/);
  assert.match(design, /struct XertOwnerHeading: View[\s\S]*accessibilityAddTraits\(\.isHeader\)/);
});

test('native owner priorities open the exact protected task when one workload is affected', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const priorities = view.slice(
    view.indexOf('private var operationalPriorities: [AdminPriorityAction]'),
    view.indexOf('private var attendancePriorityRoute: XertOwnerRoute'),
  );

  assert.match(priorities, /title: "Pack sales setup"[\s\S]*task: singlePricingAttentionTask/);
  assert.match(priorities, /title: "Class booking requests"[\s\S]*task: singleBookingRequestTask \?\? singleBookingRequestClassTask/);
  assert.match(priorities, /title: "PT enquiries"[\s\S]*task: singlePTRequestTask/);
  assert.match(priorities, /title: "Waitlisted members"[\s\S]*task: singleWaitlistClassTask/);
  assert.match(priorities, /title: "Member activation actions"[\s\S]*task: singleActivationTask/);
  assert.match(priorities, /title: "Retention follow-ups"[\s\S]*task: singleRetentionTask/);
  assert.match(priorities, /title: "Orders to reconcile"[\s\S]*task: singleRecoverableOrderTask/);

  assert.match(priorities, /private var singlePricingAttentionTask:[\s\S]*return \.product\(product\.id\)[\s\S]*return \.product\(draft\.id\)/);
  assert.match(priorities, /private var singleBookingRequestTask:[\s\S]*admin\.bookingRequests\.filter \{ \$0\.status == "requested" \}[\s\S]*let recordID = request\.routeRecordID[\s\S]*return \.bookingRequest\(request\.source, recordID\)/);
  assert.match(priorities, /private var singleBookingRequestClassTask:[\s\S]*requested_count \+ \$0\.public_request_count > 0[\s\S]*return \.classSession\(operation\.id\)/);
  assert.match(priorities, /private var singlePTRequestTask:[\s\S]*admin\.ptRequests\.filter\(\\\.isPending\)[\s\S]*return \.ptRequest\(request\.id\)/);
  assert.match(priorities, /private var singleActivationTask:[\s\S]*admin\.activationQueue\.count == 1[\s\S]*return \.member\(member\.id\)/);
  assert.match(priorities, /private var singleWaitlistClassTask:[\s\S]*\$0\.waitlist_count > 0[\s\S]*return \.classSession\(item\.session_id\)/);
  assert.match(priorities, /private var singleRetentionTask:[\s\S]*admin\.followUps\.count == 1[\s\S]*return \.member\(followUp\.id\)/);
  assert.match(priorities, /private var singleRecoverableOrderTask:[\s\S]*admin\.orders\.filter\(\\\.isRecoverable\)[\s\S]*return \.order\(order\.id\)/);
  assert.match(view, /case \.retention:[\s\S]*admin\.activationQueue\.count \+ admin\.followUps\.count/);
});

test('native owner overview counts fresh lead work without downloading lead histories', async () => {
  const [view, store, api, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  assert.match(models, /struct AdminLeadActionCounts: Equatable[\s\S]*var total: Int/);
  assert.match(models, /var overdueTotal: Int[\s\S]*var overduePriorityPipeline: AdminLeadPipeline\?[\s\S]*var triagePipeline: AdminLeadPipeline\?/);
  assert.match(models, /private static func priorityPipeline[\s\S]*filter \{ \$0\.count > 0 \}[\s\S]*AdminLeadPipeline\.allCases\.firstIndex/);
  assert.match(api, /func adminLeadActionCounts[\s\S]*pipeline: \.members, status: "new"[\s\S]*pipeline: \.trainers, status: "new"[\s\S]*pipeline: \.partners, status: "new"/);
  assert.match(api, /overdueCutoff = Date\(\)\.addingTimeInterval\(-86_400\)[\s\S]*overdueMemberLeads[\s\S]*overdueTrainerApplicants[\s\S]*overduePartnerEnquiries/);
  assert.match(api, /createdBefore: Date\? = nil[\s\S]*name: "created_at"[\s\S]*value: "lt\.\\\(ISO8601DateFormatter\.standard\.string\(from: createdBefore\)\)"/);
  assert.match(api, /private func restCount[\s\S]*request\.httpMethod = "HEAD"[\s\S]*"count=exact"[\s\S]*"Content-Range"/);
  assert.ok(
    (store.match(/async let leadActionCountRequest = api\.adminLeadActionCounts/g) || []).length === 2,
    'only the main and operational dashboard refreshes should request lead counts',
  );
  assert.match(store, /leadActionCounts = try await leadActionCountRequest[\s\S]*successfulSources\.insert\("lead actions"\)/);
  assert.match(store, /let next = try await leadActionCountRequest[\s\S]*generation == operationalRefreshGeneration[\s\S]*leadActionCounts = next/);
  assert.match(store, /"activation actions", "orders", "PT requests", "lead actions"/);
  assert.match(view, /title: "New lead enquiries"[\s\S]*count: admin\.leadActionCounts\?\.total \?\? 0[\s\S]*workspace: \.leads,[\s\S]*isCritical: \(admin\.leadActionCounts\?\.overdueTotal \?\? 0\) > 0/);
  assert.match(view, /counts\.memberLeads[\s\S]*counts\.trainerApplicants[\s\S]*counts\.partnerEnquiries/);
  assert.match(view, /counts\.overdueTotal > 0[\s\S]*waiting 24h\+/);
  assert.match(view, /case \.leads:[\s\S]*admin\.leadActionCounts\?\.total/);
  assert.match(view, /AdminLeadsView\([\s\S]*initialPipeline: admin\.leadActionCounts\?\.triagePipeline[\s\S]*prioritizesNewWork: \(admin\.leadActionCounts\?\.total \?\? 0\) > 0/);
  assert.match(view, /let initialStatus = prioritizesNewWork \? "new" : "all"[\s\S]*_pipeline = State\(initialValue: initialPipeline \?\? \.members\)[\s\S]*_status = State\(initialValue: initialStatus\)/);
  assert.match(view, /\.onChange\(of: pipeline\)[\s\S]*status = defaultStatus/);
  assert.match(view, /if status == "new"[\s\S]*matches\.sorted \{ \$0\.created_at < \$1\.created_at \}/);
  assert.match(view, /owner\.leads\.overdueSLA/);
  assert.match(view, /private var pipelinePicker: some View[\s\S]*dynamicTypeSize\.isAccessibilitySize[\s\S]*pickerStyle\(\.menu\)[\s\S]*pickerStyle\(\.segmented\)/);
  assert.match(store, /refreshLeadPipelineAfterMutation[\s\S]*async let pipelineRequest = api\.adminLeads[\s\S]*async let countRequest = api\.adminLeadActionCounts/);
  assert.match(store, /leadActionCounts = try await countRequest[\s\S]*refreshUnavailableSources\.removeAll \{ \$0 == "lead actions" \}/);
  assert.match(store, /case \.ready:[\s\S]*operationalQueueState = \.partial\(unavailableSources: \["lead actions"\]\)/);
  assert.match(view, /Log contacted and save[\s\S]*private func logContacted\(\)[\s\S]*status: "contacted"/);
  assert.match(view, /mailto:[\s\S]*minHeight: 44[\s\S]*tel:[\s\S]*minHeight: 44/);
  assert.match(view, /Text\(leadAgeLabel\(lead\)\)[\s\S]*private func leadAgeLabel[\s\S]*Waiting <1h[\s\S]*Waiting \\\(hours\)h[\s\S]*Waiting \\\(max\(hours \/ 24, 1\)\)d/);
  assert.match(view, /private func leadAgeColour[\s\S]*>= 86_400 \? Color\.red : Color\.orange/);
});

test('native owner overview is freshness-aware and exposes safe one-tap operating tools', async () => {
  const [view, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
  ]);

  assert.match(view, /@Environment\(\\\.scenePhase\) private var scenePhase/);
  assert.match(store, /enum AdminPresentationRefreshPolicy/);
  assert.match(store, /static let fullRefreshAfter: TimeInterval = 10 \* 60/);
  assert.match(view, /onChange\(of: scenePhase\)[\s\S]*admin\.refreshForPresentation/);
  assert.match(view, /private enum AdminOwnerQuickAction[\s\S]*case newClass[\s\S]*case newNotice[\s\S]*case newSessionPack/);
  assert.match(view, /private var quickTools: some View/);
  for (const label of [
    'Find a member',
    'Create a class',
    'Publish a notice',
    "Set today's workout",
    'Create a form',
    'Create a session pack',
  ]) {
    assert.match(view, new RegExp(label));
  }
  assert.match(view, /sheet\(item: \$presentedQuickAction, onDismiss:/);
  assert.match(
    view,
    /AdminClassEditor\([\s\S]*classSession: nil,[\s\S]*mutationAllowed: admin\.loadedSources\.contains\("full timetable"\)/,
  );
  assert.match(view, /AdminAnnouncementComposer\([\s\S]*announcement: nil,[\s\S]*isSaving: admin\.announcementMutationID != nil,[\s\S]*isPublishing: admin\.isPublishingAnnouncement/);
  assert.match(view, /AdminProductEditor\([\s\S]*product: nil/);
  assert.match(view, /case \.newCoach:[\s\S]*AdminCoachEditor\([\s\S]*coach: nil/);
  assert.match(view, /case \.newEvent:[\s\S]*AdminEventEditor\([\s\S]*event: nil/);
  // Keep the compact dashboard focused: the complete owner catalogue remains
  // discoverable through Manage, with compile-time-valid workspace routing.
  assert.match(view, /Label\("Manage", systemImage: "square\.grid\.2x2"\)/);
  assert.match(view, /private var managementDirectory:[\s\S]*ForEach\(XertOwnerWorkspace\.workspaces\(in: section\)\)[\s\S]*AdminDestinationRow/);
  assert.match(view, /case \.siteContent:[\s\S]*AdminSiteContentView/);
  assert.match(view, /case \.events:[\s\S]*AdminEventsView/);
  assert.match(view, /case \.team:[\s\S]*AdminCoachesView/);
  assert.match(view, /title: "Set today's workout"[\s\S]*openWorkspaceWithFeedback\(\.workouts\)/);
  assert.match(view, /title: "Create a form"[\s\S]*requestCreateForm\(\)/);

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

  assert.match(models, /struct AdminAnnouncementDraft: Codable, Hashable/);
  assert.match(models, /struct AdminAnnouncementDeliveryMetrics: Hashable/);
  assert.match(models, /var pushAttemptedCount: Int/);
  assert.match(models, /published_at > now \{ return "Scheduled" \}/);
  assert.match(models, /Action label and destination must be provided together/);
  assert.match(models, /url\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(api, /func adminSaveAnnouncement/);
  assert.match(api, /func adminAnnouncement\(session auth: AuthSession, id: UUID\)/);
  assert.match(api, /func adminAnnouncementReceiptMetrics[\s\S]*path: "admin_announcement_metrics"/);
  assert.match(api, /func adminAnnouncementPushMetrics[\s\S]*path: "admin_announcement_push_metrics"/);
  assert.match(api, /This member notice is no longer available to your administrator account/);
  assert.match(api, /func adminUnpublishAnnouncement/);
  assert.match(api, /func adminSetAnnouncementArchived/);
  assert.match(api, /func adminDeleteAnnouncement/);
  assert.ok(api.includes('URLQueryItem(name: "updated_at", value: "eq.\\(announcement.updated_at)")'));
  assert.match(api, /guard !announcement\.wasPublished/);
  assert.match(store, /private var announcementMutationAvailable: Bool/);
  assert.match(store, /Refresh Member Notices before changing communications/);
  assert.match(store, /mergeAnnouncement\(outcome\.announcement\)/);
  assert.match(store, /No enabled iOS devices were registered/);
  assert.match(store, /@Published private\(set\) var announcementDeliveryMetrics: \[UUID: AdminAnnouncementDeliveryMetrics\]/);
  assert.match(store, /async let receiptRequest = api\.adminAnnouncementReceiptMetrics/);
  assert.match(store, /async let pushRequest = api\.adminAnnouncementPushMetrics/);
  assert.match(store, /async let announcementReceiptMetricsRequest = api\.adminAnnouncementReceiptMetrics/);
  assert.match(store, /async let announcementPushMetricsRequest = api\.adminAnnouncementPushMetrics/);
  assert.match(store, /guard !isMutatingAnnouncements, !isRefreshingAnnouncements else \{ return \}/);
  assert.match(store, /var isMutatingAnnouncements: Bool \{[\s\S]*isRefreshingAnnouncements/);
  assert.match(store, /private func setAnnouncementDeliveryMetrics/);
  assert.match(store, /announcementDeliveryStatusMessage = "Delivery evidence is temporarily unavailable/);
  assert.match(store, /announcementLoadErrorMessage = "Member notices could not refresh/);
  assert.match(store, /private func markAnnouncementsCurrent\(\)[\s\S]*announcementLoadErrorMessage = nil/);

  const exactDetail = view.slice(
    view.indexOf('private struct AdminAnnouncementDetailView'),
    view.indexOf('private struct AdminCommunicationsView'),
  );
  assert.match(exactDetail, /admin\.loadedSources\.contains\("member notices"\)/);
  assert.match(exactDetail, /!admin\.refreshUnavailableSources\.contains\("member notices"\)/);
  assert.match(exactDetail, /private var currentAnnouncement: AdminAnnouncement \{[\s\S]*admin\.announcements\.first\(where: \{ \$0\.id == announcement\.id \}\) \?\? announcement/);
  assert.match(exactDetail, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(exactDetail, /Label\("Unpublish now", systemImage: "eye\.slash\.fill"\)/);
  assert.match(exactDetail, /confirm\(\.unpublish\(currentAnnouncement\)\)/);
  assert.match(exactDetail, /Label\("Review & publish", systemImage: "paperplane\.fill"\)/);
  assert.match(exactDetail, /confirm\(\.archive\(currentAnnouncement\)\)/);
  assert.match(exactDetail, /confirm\(\.restore\(currentAnnouncement\)\)/);
  assert.match(exactDetail, /confirm\(\.delete\(currentAnnouncement\)\)/);
  assert.match(exactDetail, /Section\("Member reach"\)/);
  assert.match(exactDetail, /"Push delivered"[\s\S]*metrics\.pushDeliveredCount/);
  assert.match(exactDetail, /No delivery attempts have been recorded for this notice/);
  assert.match(exactDetail, /owner\.notice\.detail/);
  assert.match(exactDetail, /owner\.notice\.unpublish/);

  const communications = view.slice(
    view.indexOf('private struct AdminCommunicationsView'),
    view.indexOf('private struct AdminAnnouncementComposer'),
  );
  assert.match(communications, /AdminAnnouncementStatusStrip/);
  assert.match(communications, /Showing the last notice snapshot/);
  assert.match(communications, /admin\.announcementLoadErrorMessage/);
  assert.match(communications, /Label\("Review and publish", systemImage: "paperplane"\)/);
  assert.match(communications, /Label\("Unpublish", systemImage: "eye\.slash"\)/);
  assert.match(communications, /Label\("Archive", systemImage: "archivebox"\)/);
  assert.match(communications, /Label\("Delete draft", systemImage: "trash"\)/);
  assert.match(communications, /\.refreshable \{ await admin\.refreshAnnouncements\(session: session\) \}/);
  assert.match(communications, /deliveryMetricItems\(metrics\)/);
  assert.match(communications, /\.disabled\(!noticesAreCurrent\)/);
  assert.doesNotMatch(communications, /\.disabled\(!mutationAllowed\)/);

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
  assert.match(models, /struct AdminMemberNoticeDraft: Codable, Hashable/);
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

test('native owner overview creates a privacy-safe current-only shift handoff', async () => {
  const [view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);
  const briefing = view.slice(
    view.indexOf('private var shiftBriefing: some View'),
    view.indexOf('private func operationalFreshnessColour'),
  );
  const model = models.slice(
    models.indexOf('struct AdminShiftClassBrief'),
    models.indexOf('struct AdminRosterMember'),
  );

  assert.match(model, /struct AdminShiftBriefing: Equatable/);
  assert.match(model, /var openActionCount: Int/);
  assert.match(model, /let classSetupGaps: Int/);
  assert.match(model, /"Classes needing setup", classSetupGaps/);
  assert.match(model, /XERT OWNER SHIFT BRIEF/);
  assert.match(model, /TODAY'S CLASSES/);
  assert.match(model, /DATA WARNING/);
  assert.match(model, /requested_count \+ operation\.public_request_count/);
  assert.doesNotMatch(model, /full_name|email|phone|member_id|payment_intent/);

  assert.match(briefing, /AdminShiftBriefing\(/);
  assert.match(briefing, /classSetupGaps: dailyClassReadiness\.affectedClassCount/);
  assert.match(briefing, /admin\.operationalQueueState == \.ready/);
  assert.match(briefing, /freshness == \.current/);
  assert.match(briefing, /No member names, contact details, notes or payment identifiers are included\./);
  assert.match(briefing, /ShareLink\([\s\S]*item: briefing\.text/);
  assert.match(briefing, /UIPasteboard\.general\.string = briefing\.text/);
  assert.match(briefing, /UIAccessibility\.post\(notification: \.announcement, argument: "Shift brief copied"\)/);
  assert.match(briefing, /shiftBriefCopyFeedbackID == nil \? "Copy brief" : "Copied"/);
  assert.match(briefing, /Refresh operational queues before copying or sharing this handoff\./);
  assert.match(briefing, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(briefing, /frame\(maxWidth: \.infinity, minHeight: 58/);
});

test('native owner overview detects today setup defects and opens the exact class editor', async () => {
  const [view, models, navigation, store, swiftTests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);

  const readiness = models.slice(
    models.indexOf('enum AdminDailyClassSetupIssueKind'),
    models.indexOf('struct AdminShiftClassBrief'),
  );
  const overview = view.slice(
    view.indexOf('private var operationalPriorities: [AdminPriorityAction]'),
    view.indexOf('private var managementDirectory: some View'),
  );

  for (const issue of ['missingCoach', 'missingLocation', 'invalidCapacity', 'overCapacity']) {
    assert.match(readiness, new RegExp(`case ${issue}`));
  }
  assert.match(readiness, /guard sourceIsCurrent else \{ return \[\] \}/);
  assert.match(readiness, /\["published", "full"\]\.contains\(operation\.status\.lowercased\(\)\)/);
  assert.match(readiness, /operation\.confirmed_count > capacity/);
  assert.match(readiness, /var affectedClassCount: Int/);
  assert.match(readiness, /var singleAffectedClassID: UUID\?/);

  assert.match(overview, /title: "Class setup gaps"/);
  assert.match(overview, /task: dailyClassReadiness\.singleAffectedClassID\.map \{ \.classSetup\(\$0\) \}/);
  assert.ok(overview.includes('dailyClassReadiness.issues.contains(where: \\.isCritical)'));
  assert.match(overview, /classCapacitySummary\(item\)/);
  assert.match(overview, /classAssignmentSummary\(item\)/);
  assert.match(overview, /todayClassActions\(item, hasSetupIssues: !setupIssues\.isEmpty\)/);
  assert.match(overview, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(overview, /Label\("Fix setup", systemImage: "wrench\.and\.screwdriver\.fill"\)/);
  assert.match(overview, /XertOwnerRoute\(task: \.classSetup\(item\.id\)\)/);
  assert.match(overview, /XertOwnerRoute\(task: \.classSession\(item\.id\)\)/);

  assert.match(navigation, /case classSetup\(UUID\)/);
  assert.match(navigation, /case \.classSetup: return \.timetable/);
  assert.match(navigation, /case \(\.timetable, "class-setup"\): return \.classSetup\(id\)/);
  assert.match(store, /case \.classSetup\(let sessionID\):[\s\S]*timetableIsCurrent[\s\S]*api\.adminClassSessions/);
  assert.match(swiftTests, /testDailyClassReadinessFindsOnlyCurrentActionableSetupDefects/);
});

test('native owner incident control performs a minimal verified emergency pause', async () => {
  const [view, models, store, api, activationGuard, contentAudit, bookingGuard] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../src/supabase/payment_activation_drift_guard_upgrade.sql'),
    read('../src/supabase/content_change_audit_upgrade.sql'),
    read('../src/supabase/member_booking_switch_guard_upgrade.sql'),
  ]);
  const incident = view.slice(
    view.indexOf('private func incidentControl(session: AuthSession)'),
    view.indexOf('private var quickTools: some View'),
  );
  const plan = models.slice(
    models.indexOf('enum AdminMemberOperationsState'),
    models.indexOf('struct AdminPTRequest'),
  );
  const storePause = store.slice(
    store.indexOf('func pauseMemberOperations('),
    store.indexOf('func resolveStripeReview('),
  );
  const apiPause = api.slice(
    api.indexOf('func adminPauseMemberOperations('),
    api.indexOf('func adminActivatePlatformPayments('),
  );
  const pausePayload = api.slice(
    api.indexOf('private struct AdminEmergencyPauseUpdate'),
    api.indexOf('private struct AdminPaymentActivationSettings'),
  );

  assert.match(plan, /case unavailable/);
  assert.match(plan, /case paused/);
  assert.match(plan, /case bookingsOpen/);
  assert.match(plan, /case liveCommerce/);
  assert.match(plan, /case inconsistent/);
  assert.match(plan, /case \(false, true\): return \.inconsistent/);
  assert.match(plan, /guard canPause, var paused = settings/);
  assert.match(plan, /paused\.bookings_enabled = false/);
  assert.match(plan, /paused\.payments_enabled = false/);

  const dashboard = view.slice(
    view.indexOf('private func dashboard(session:'),
    view.indexOf('private var accessDenied:'),
  );
  assert.doesNotMatch(dashboard, /stripeLaunchRunway|incidentControl\(session: session\)/);
  assert.match(incident, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(incident, /Pause bookings & checkout/);
  assert.match(incident, /Pause new member activity\?/);
  assert.match(incident, /Existing bookings, class rosters, member records and owner tools remain available\./);
  assert.match(incident, /admin\.pauseMemberOperations\(session: session\)/);
  assert.match(incident, /platformDraftSnapshot = admin\.settings/);
  assert.match(incident, /UIAccessibility\.post\(/);
  assert.match(incident, /Refresh to unlock/);
  assert.match(incident, /accessibilityIdentifier\("owner\.incidentControl"\)/);

  assert.match(storePause, /loadedSources\.contains\("platform controls"\)/);
  assert.match(storePause, /refreshUnavailableSources\.contains\("platform controls"\)/);
  assert.match(storePause, /AdminEmergencyPausePlan\(/);
  assert.match(storePause, /guard let pausedSettings = plan\.pausedSettings/);
  assert.match(storePause, /api\.adminPauseMemberOperations/);
  assert.match(storePause, /loadedSources\.insert\("platform controls"\)/);
  assert.doesNotMatch(storePause, /saveSettings\(/);

  assert.match(apiPause, /path: "\/rest\/v1\/admin_settings"/);
  assert.ok(apiPause.includes('URLQueryItem(name: "id", value: "eq.\\(settings.id.uuidString)")'));
  assert.ok(apiPause.includes('URLQueryItem(name: "updated_at", value: "eq.\\(settings.updated_at)")'));
  assert.match(apiPause, /request\.httpMethod = "PATCH"/);
  assert.match(apiPause, /AdminEmergencyPauseUpdate\(/);
  assert.match(apiPause, /updated\.id == settings\.id/);
  assert.match(apiPause, /!updated\.bookings_enabled/);
  assert.match(apiPause, /!updated\.payments_enabled/);
  assert.doesNotMatch(apiPause, /target_launch_date|announcement_banner|adminActivatePlatformPayments/);
  assert.match(pausePayload, /let bookings_enabled: Bool/);
  assert.match(pausePayload, /let payments_enabled: Bool/);
  assert.match(pausePayload, /let updated_at: String/);
  assert.doesNotMatch(pausePayload, /target_launch_date|announcement/);

  assert.doesNotMatch(activationGuard, /new\.payments_enabled is false[\s\S]*raise exception/i);
  assert.match(contentAudit, /admin_settings_audit_admin_change/i);
  assert.doesNotMatch(bookingGuard, /delete from public\.session_bookings|update public\.session_bookings/i);
});

test('native emergency pause becomes a guarded communication and recovery runbook', async () => {
  const [view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);
  const incident = view.slice(
    view.indexOf('private func incidentControl(session: AuthSession)'),
    view.indexOf('private var quickTools: some View'),
  );
  const composer = view.slice(
    view.indexOf('private struct AdminAnnouncementComposer: View'),
    view.indexOf('private enum AdminOwnerQuickAction'),
  );
  const template = models.slice(
    models.indexOf('struct AdminAnnouncementDraft'),
    models.indexOf('struct AdminAnnouncementPushSummary'),
  );

  assert.match(template, /static func memberOperationsPaused\(\) -> Self/);
  assert.match(template, /static let memberOperationsPausedTitle = "Bookings and checkout temporarily paused"/);
  assert.match(template, /static let memberBookingsRestoredTitle = "Bookings are available again"/);
  assert.match(template, /static let memberCommerceRestoredTitle = "Bookings and checkout are available again"/);
  assert.match(template, /Bookings and checkout temporarily paused/);
  assert.match(template, /new bookings, waitlist joins and session-pack checkout/);
  assert.match(template, /Existing bookings remain confirmed/);
  assert.match(template, /draft\.tone = "urgent"/);
  assert.match(template, /static func memberOperationsRestored\(checkoutAvailable: Bool\) -> Self/);
  assert.match(template, /Session-pack checkout remains temporarily paused/);
  assert.match(template, /draft\.ctaURL = "\/booking"/);
  assert.doesNotMatch(template, /resolved|fixed|safe to book/i);

  assert.match(view, /@State private var quickNoticeDraft: AdminAnnouncementDraft\?/);
  assert.match(view, /\.sheet\(item: \$presentedQuickAction, onDismiss: \{\s*quickNoticeDraft = nil/);
  assert.match(view, /private func presentNoticeQuickAction\(draft: AdminAnnouncementDraft\? = nil\)/);
  assert.match(view, /initialDraft: quickNoticeDraft/);
  assert.match(composer, /initialDraft: AdminAnnouncementDraft\? = nil/);
  assert.match(composer, /announcement\.map\(AdminAnnouncementDraft\.init\)\s*\?\? initialDraft\s*\?\? AdminAnnouncementDraft\(\)/);
  assert.match(composer, /Publish this member notice now\?/);
  assert.match(composer, /Publish to members/);

  assert.match(incident, /AdminIncidentCommunicationPlan\(/);
  assert.match(incident, /communicationNoticeID: communication\.actionNoticeID/);
  assert.match(incident, /if plan\.state == \.paused \{\s*incidentRunbook\(communication: communication\.state\)/);
  assert.match(incident, /INCIDENT RUNBOOK/);
  assert.match(incident, /Member activity protected/);
  assert.match(incident, /Tell members what changed/);
  assert.match(incident, /Investigate the cause/);
  assert.match(incident, /Reopen deliberately/);
  assert.match(incident, /accessibilityIdentifier\("owner\.incidentRunbook"\)/);
  assert.match(incident, /presentNoticeQuickAction\(draft: \.memberOperationsPaused\(\)\)/);
  assert.match(incident, /Review live update/);
  assert.match(incident, /openWorkspaceWithFeedback\(\.notices\)/);
  assert.match(incident, /MESSAGE CONFLICT/);
  assert.match(incident, /ALL-CLEAR DUE/);
  assert.match(incident, /RECOVERY SHARED/);
  assert.match(incident, /ViewThatFits\(in: \.horizontal\) \{[\s\S]*incidentControlActions\([\s\S]*VStack\(spacing: 10\) \{[\s\S]*incidentControlActions\(/);
  assert.match(incident, /accessibilityIdentifier\("owner\.incidentCommunicationStatus"\)/);
  assert.match(incident, /Fix member message/);
  assert.match(incident, /openOwnerRouteWithFeedback\(\s*XertOwnerRoute\(task: \.announcement\(noticeID\)\)/);
  assert.match(incident, /Draft all-clear/);
  assert.match(incident, /memberOperationsRestored\(\s*checkoutAvailable: operationsState == \.liveCommerce/);
  assert.match(incident, /Review all-clear/);
  assert.match(incident, /Verify messages/);
  assert.match(incident, /openWorkspaceWithFeedback\(\.health\)/);
  assert.match(incident, /openWorkspaceWithFeedback\(\.controls\)/);
  assert.match(incident, /Refresh notices/);
  assert.match(incident, /Task \{ await admin\.refresh\(session: session\) \}/);
  assert.doesNotMatch(incident, /publishAnnouncement|saveAnnouncement/);

  assert.match(models, /enum AdminIncidentCommunicationState: Equatable/);
  for (const state of [
    'unavailable',
    'normal',
    'pausedNeedsUpdate',
    'pausedUpdateLive',
    'livePauseNoticeConflict',
    'recoveryUpdateNeeded',
    'recoveryUpdateLive',
  ]) {
    assert.match(models, new RegExp(`case ${state}`));
  }
  assert.match(models, /static let recoveryWindow: TimeInterval = 72 \* 60 \* 60/);
  assert.match(models, /guard sourceIsCurrent else \{ return \.unavailable \}/);
  assert.match(models, /if livePauseNotice != nil \{ return \.livePauseNoticeConflict \}/);
  assert.match(models, /guard let pauseDate = latestRecentPauseDate else \{ return \.normal \}/);
  assert.match(models, /liveRecoveryNotice\(after: pauseDate\) == nil/);
  assert.match(models, /var actionNoticeID: UUID\?/);
  assert.match(models, /case \.bookingsOpen:[\s\S]*memberBookingsRestoredTitle/);
  assert.match(models, /case \.liveCommerce:[\s\S]*memberCommerceRestoredTitle/);
});

test('native Admin Audit attributes operators and includes protected commerce recovery', async () => {
  const [view, models, api, schema] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../src/supabase/booking_schema.sql'),
  ]);
  const auditView = view.slice(
    view.indexOf('private struct AdminAuditView: View'),
    view.indexOf('private struct AdminAuditCSVDocument'),
  );
  const auditAPI = api.slice(
    api.indexOf('func adminAudit(session auth: AuthSession)'),
    api.indexOf('func adminProducts(session auth: AuthSession)'),
  );
  const auditRows = api.slice(
    api.indexOf('private struct AdminRoleAuditRow'),
    api.indexOf('private struct AdminProductPayload'),
  );
  const auditModels = models.slice(
    models.indexOf('struct AdminAuditEntry'),
    models.indexOf('struct AdminProduct'),
  );

  assert.match(auditModels, /let operatorID: UUID\?/);
  assert.match(auditModels, /let subjectID: String\?/);
  assert.match(auditModels, /struct AdminAuditSummary: Equatable/);
  assert.match(auditModels, /last24Hours = entries\.lazy\.filter/);
  assert.match(auditModels, /\$0\.category == "Commerce" \|\| \$0\.category == "Credits"/);
  assert.match(auditModels, /Set\(entries\.compactMap\(\\\.operatorID\)\)\.count/);
  assert.match(auditModels, /Operator ID,Subject ID/);

  assert.match(auditAPI, /table: "orders"[\s\S]*reconciled_at[\s\S]*not\.is\.null/);
  assert.match(auditAPI, /table: "stripe_refunds"/);
  assert.match(auditAPI, /source: "Order reconciliation"/);
  assert.match(auditAPI, /source: "Refunds"/);
  assert.match(auditAPI, /unavailableSources\.count < 10/);
  assert.match(auditAPI, /reconciliationRows\.map \{ \$0\.entry \}, refundRows\.map \{ \$0\.entry \}/);

  assert.match(auditRows, /AdminOrderReconciliationAuditRow[\s\S]*category: "Commerce"/);
  assert.match(auditRows, /AdminRefundAuditRow[\s\S]*category: "Commerce"/);
  assert.match(auditRows, /credits_consumed\) already used/);
  assert.match(auditRows, /parts\.count >= 3, parts\[0\] == "admin"/);
  assert.match(auditRows, /operatorID: changed_by/);
  assert.match(auditRows, /operatorID: granted_by/);
  assert.match(auditRows, /operatorID: actor_id/);

  assert.match(auditView, /owner\.audit\.summary/);
  assert.match(auditView, /OPERATOR ACCOUNTABILITY/);
  assert.match(auditView, /Money actions/);
  assert.match(auditView, /Operators seen/);
  assert.match(auditView, /entry\.operatorID\?\.uuidString/);
  assert.match(auditView, /System or historical action/);
  assert.match(auditView, /Member or system initiated/);
  assert.match(auditView, /case "Commerce": return "creditcard\.and\.123"/);
  assert.match(auditView, /\.disabled\(!reportIsCurrent \|\| rows\.isEmpty\)/);

  assert.match(schema, /stripe_refunds_admin_read[\s\S]*public\.is_admin\(\)/i);
  assert.match(schema, /orders_select_own_or_admin[\s\S]*public\.is_admin\(\)/i);
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
  assert.match(health, /private var pushHealthIsCurrent: Bool/);
  assert.match(health, /if let push = admin\.pushHealth, pushHealthIsCurrent/);
  assert.match(health, /Retry health checks/);
  // Fitbox owns payments: the health screen carries no Stripe snapshot UI.
  assert.doesNotMatch(health, /stripeHealthIsCurrent|Stripe — last snapshot/);
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
  assert.match(
    view,
    /interactiveDismissDisabled\([\s\S]*hasUnsavedPlatformDraft[\s\S]*admin\.isSavingSettings[\s\S]*isSavingPlatformExit/,
  );
  assert.match(view, /let didSave = await admin\.saveSettings\(session: session, draft: draft\)[\s\S]*if didSave \{[\s\S]*performOwnerExit\(request\)/);
  assert.match(view, /case \.closeOwner:\s*requestOwnerExit\(\.close\)/);
  assert.match(view, /Button \{ requestOwnerExit\(\.close\) \}/);
  assert.match(view, /private var compactNavigationPath:[\s\S]*hasUnsavedPlatformDraft[\s\S]*requestOwnerExit/);
  assert.match(platform, /draft = initialDraft \?\? recovered\?\.draft \?\? live/);
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
    'overview', 'members', 'access', 'classDesk', 'bookingRequests', 'timetable', 'availability',
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
  assert.match(view, /navigationDestination\(for: XertOwnerWorkspace\.self\)[\s\S]*ownerWorkspaceSurface\(workspace, session: session\)[\s\S]*navigationBarTitleDisplayMode\(\.inline\)/);
  assert.match(view, /applyRequestedRoute\(requestedRoute, resolvesTask: false\)/);
  assert.match(view, /navigationSplitViewColumnWidth\(min: 230, ideal: 270, max: 320\)/);
  assert.match(view, /navigationSplitViewStyle\(\.balanced\)/);
  assert.match(view, /ownerWorkspaceSurface\(currentWorkspace, session: session\)[\s\S]*\.id\(currentWorkspace\)[\s\S]*navigationBarTitleDisplayMode\(\.inline\)/);
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

test('native owner access control governs launch-day administrator coverage', async () => {
  const [view, models, navigation, store, sql] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../src/supabase/admin_role_safety_upgrade.sql'),
  ]);
  const access = view.slice(
    view.indexOf('private enum AdminAccessDirectoryMode'),
    view.indexOf('private struct AdminMembersView'),
  );
  const memberDetail = view.slice(
    view.indexOf('private struct AdminMemberDetailView'),
    view.indexOf('private struct AdminMemberNoticeHistoryRow'),
  );
  const snapshot = models.slice(
    models.indexOf('struct AdminAccessSnapshot'),
    models.indexOf('struct AdminMemberOnboardingSummary'),
  );

  assert.match(navigation, /case access/);
  assert.match(navigation, /case \.access: return "Access Control"/);
  assert.match(navigation, /case \.access: return "Review administrators and govern owner access"/);
  assert.match(navigation, /case \.access: return "person\.badge\.key"/);
  assert.match(navigation, /case \.access, \.controls, \.health, \.audit: return \.platform/);
  assert.match(view, /case \.access:\s+AdminAccessControlView\(/);
  assert.match(view, /ForEach\(XertOwnerWorkspaceSection\.allCases\)[\s\S]*XertOwnerWorkspace\.workspaces\(in: section\)/);

  assert.match(snapshot, /static let recommendedAdministratorCount = 2/);
  assert.match(snapshot, /var hasOperationalBackup: Bool/);
  assert.match(snapshot, /var currentUserListingIsComplete: Bool/);
  assert.match(snapshot, /case 1: return "Single administrator"/);
  assert.match(snapshot, /Add one trusted backup administrator before launch\./);

  assert.match(access, /case administrators/);
  assert.match(access, /case candidates/);
  assert.match(access, /normalizedQuery\.count >= 2/);
  assert.match(access, /role: mode\.role/);
  assert.match(access, /admin\.memberDirectoryRole == mode\.role/);
  assert.match(access, /AdminAccessSnapshot\(/);
  assert.match(access, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(access, /member\.id == session\.user\?\.id \? "YOU"/);
  assert.match(access, /Find a backup administrator/);
  assert.match(access, /mode = \.candidates/);
  assert.match(access, /filter \{ \$0\.category == "Access" \}/);
  assert.match(access, /Open full Admin Audit/);
  assert.match(access, /Every administrator role change is recorded in the protected audit ledger\./);
  assert.match(access, /\.refreshable \{/);
  assert.match(access, /admin\.loadAudit\(session: session, force: true\)/);
  assert.doesNotMatch(access, /adminSetRole|admin_set_role/);

  assert.match(memberDetail, /private var isSignedInAdministrator: Bool/);
  assert.match(memberDetail, /current\.role == "admin" && current\.id == session\.user\?\.id/);
  assert.match(memberDetail, /\.disabled\(!memberRecordMutationsAllowed \|\| isSignedInAdministrator\)/);
  assert.match(memberDetail, /private var memberRecordIsCurrent[\s\S]*admin\.loadedMemberDetailID == current\.id/);
  assert.match(memberDetail, /private var memberRecordMutationsAllowed[\s\S]*memberRecordIsCurrent/);
  assert.match(memberDetail, /cannot remove its own access/);
  assert.match(store, /func setMemberRole[\s\S]*api\.adminSetRole/);
  assert.match(sql, /p_user_id = auth\.uid\(\) and p_role <> 'admin'/i);
  assert.match(sql, /CANNOT_DEMOTE_LAST_ADMIN/);
  assert.match(sql, /insert into public\.admin_role_changes/i);
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

test('native class operations surface one freshness-gated run-next action', async () => {
  const [view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  assert.match(models, /enum AdminClassOperationalPhase: Equatable/);
  assert.match(models, /struct AdminClassOperationalFocus: Equatable/);
  assert.match(models, /guard sourceIsCurrent else \{ return nil \}/);
  assert.match(models, /if operation\.attendance_due \{[\s\S]*return \(0, operation\)/);
  assert.match(models, /operation\.start_time <= now, assumedEnd > now[\s\S]*return \(1, operation\)/);
  assert.match(models, /operation\.start_time > now[\s\S]*return \(2, operation\)/);
  assert.match(view, /private var nextClassFocus: some View/);
  assert.match(
    view,
    /AdminClassOperationalFocus\.resolve\([\s\S]*sourceIsCurrent: dashboardDataState\(for: "today's classes"\) == \.current/,
    'the run-next action stays gated on fresh class data',
  );
  assert.match(view, /accessibilityIdentifier\("owner\.nextClassFocus"\)/);
  assert.match(view, /dashboardDataState\(for: "today's classes"\) == \.current/);
  assert.match(view, /nextClassActionTitle\(focus, hasSetupIssues:/);
  assert.match(view, /Section\(operationalFocus == nil \? "Today" : "Run next"\)/);
  assert.match(view, /Section\("Later today"\)/);
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
  assert.match(roster, /private var unresolvedRequests: \[AdminRosterMember\]/);
  assert.match(roster, /unresolvedRequests\.isEmpty && attendanceSummary\.isComplete/);
  assert.match(roster, /must be confirmed or declined before this class can close/);
  assert.match(roster, /accessibilityIdentifier\("owner\.roster\.pendingRequestGuard"\)/);
  assert.ok(roster.includes('Resolve \\(unresolvedRequests.count) booking request'));
  assert.match(roster, /Label\("Mark all present", systemImage: "checkmark\.circle"\)/);
  assert.match(roster, /Label\("Clear marks", systemImage: "arrow\.counterclockwise"\)/);
  assert.match(roster, /title: "Present"[\s\S]*mark: \.attended/);
  assert.match(roster, /title: "No show"[\s\S]*mark: \.noShow/);
  assert.match(roster, /\.disabled\(!canRecordAttendance\)/);
  assert.match(roster, /attendedIDs: attended[\s\S]*noShowIDs: noShows/);
  assert.match(roster, /@State private var attendanceBaseline = AdminAttendanceDraft\(\)/);
  assert.match(roster, /private var isDirty: Bool \{ attendance != attendanceBaseline \}/);
  assert.match(roster, /attendanceBaseline = attendance/);
  assert.match(roster, /\.adminOwnerExitState\([\s\S]*roll call for/);
  assert.match(roster, /\.interactiveDismissDisabled\(isDirty \|\| isBusy\)/);
  assert.match(roster, /Discard unfinished roll call\?/);
  assert.match(roster, /didRecord[\s\S]*attendanceBaseline = attendance[\s\S]*XertHaptics\.play\(\.success\)/);
});

test('native class rosters surface privacy-safe readiness and reject stale class data', async () => {
  const [view, api, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
  ]);
  const roster = view.slice(
    view.indexOf('private struct AdminClassRosterView'),
    view.indexOf('private struct AdminScheduleView'),
  );
  const rosterLoader = store.slice(
    store.indexOf('func loadClassRoster('),
    store.indexOf('func setBookingStatus('),
  );
  const bookingMutation = store.slice(
    store.indexOf('func setBookingStatus('),
    store.indexOf('func recordAttendance('),
  );
  const attendanceMutation = store.slice(
    store.indexOf('func recordAttendance('),
    store.indexOf('func logFollowUp('),
  );

  assert.match(api, /func adminMemberOnboardingSummaries[\s\S]*stride\(from: 0, to: uniqueIDs\.count, by: 100\)/);
  assert.match(api, /summaries\.count == uniqueIDs\.count[\s\S]*returnedIDs == Set\(uniqueIDs\)/);
  assert.match(store, /@Published private\(set\) var classRosterReadiness: \[UUID: AdminMemberOnboardingSummary\]/);
  assert.match(store, /@Published private\(set\) var loadedRosterSessionID: UUID\?/);
  assert.match(store, /@Published private\(set\) var rosterLoadErrorSessionID: UUID\?/);
  assert.match(rosterLoader, /rosterLoadGeneration &\+= 1/);
  assert.match(rosterLoader, /requestedRosterSessionID = classSessionID/);
  assert.match(rosterLoader, /let canPreserveCurrent = preserveCurrent && loadedRosterSessionID == classSessionID/);
  assert.match(rosterLoader, /if !canPreserveCurrent \{[\s\S]*loadedRosterSessionID = nil[\s\S]*classRoster = \[\]/);
  assert.match(rosterLoader, /guard rosterLoadGeneration == generation else \{ return false \}/);
  assert.match(rosterLoader, /rosterLoadErrorSessionID = classSessionID[\s\S]*rosterLoadErrorMessage = error\.localizedDescription/);
  assert.match(rosterLoader, /adminMemberOnboardingSummaries[\s\S]*Dictionary\([\s\S]*summaries\.map \{ \(\$0\.user_id, \$0\) \}/);
  assert.match(
    bookingMutation,
    /requestedRosterSessionID == classSessionID,[\s\S]*loadedRosterSessionID == classSessionID,[\s\S]*rosterLoadErrorSessionID != classSessionID else \{[\s\S]*Refresh this class roster before changing another booking/,
  );
  assert.match(bookingMutation, /if requestedRosterSessionID == classSessionID \{[\s\S]*preserveCurrent: true/);
  assert.match(attendanceMutation, /requestedRosterSessionID == classSessionID,[\s\S]*loadedRosterSessionID == classSessionID else \{ return false \}/);
  assert.match(attendanceMutation, /if requestedRosterSessionID == classSessionID \{[\s\S]*preserveCurrent: true/);
  assert.match(attendanceMutation, /PENDING_BOOKING_REQUESTS[\s\S]*Confirm or decline every pending booking request/);
  assert.match(roster, /private var rosterIsCurrent: Bool \{ admin\.loadedRosterSessionID == operation\.id \}/);
  assert.match(roster, /\.task\(id: operation\.id\) \{ await loadRoster\(preserveCurrent: false\) \}/);
  assert.match(roster, /\.refreshable \{ await loadRoster\(preserveCurrent: true\) \}/);
  assert.match(roster, /guard didLoad, admin\.loadedRosterSessionID == operation\.id else \{ return \}/);
  assert.match(roster, /Showing the last verified roster/);
  assert.match(roster, /Label\("Retry roster", systemImage: "arrow\.clockwise"\)/);
  assert.match(roster, /Section\("Training readiness"\)/);
  assert.match(roster, /Every active booking has completed the required readiness steps/);
  assert.match(roster, /need readiness review before training/);
  assert.match(roster, /readinessIssueLabel[\s\S]*emergency contact[\s\S]*documents/);
  assert.match(roster, /Label\([\s\S]*"Member record"[\s\S]*systemImage: "person\.text\.rectangle"/);
  assert.match(roster, /await admin\.resolveOwnerTask\(session: session, task: \.member\(memberID\)\)/);
  assert.match(roster, /\.sheet\(item: \$presentedMember\)/);
  assert.match(roster, /\.safeAreaInset\(edge: \.bottom, spacing: 0\)/);
  assert.doesNotMatch(roster, /contact_name|contact_phone|relationship/);
});

test('native class desk exports only a verified roster with explicit privacy and draft labels', async () => {
  const [view, models, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
  ]);
  const roster = view.slice(
    view.indexOf('private struct AdminClassRosterView'),
    view.indexOf('private struct AdminScheduleView'),
  );

  assert.match(models, /struct AdminClassRosterReport/);
  assert.match(models, /"Roster verified"[\s\S]*"Roll call draft"/);
  assert.match(models, /"=\+-@"\.contains\(first\)/);
  assert.match(store, /@Published private\(set\) var loadedRosterAt: Date\?/);
  assert.match(store, /loadedRosterSessionID = classSessionID[\s\S]*loadedRosterAt = Date\(\)/);
  assert.match(roster, /private var canExportRoster: Bool/);
  assert.match(roster, /rosterIsCurrent[\s\S]*admin\.loadedRosterAt != nil/);
  assert.match(roster, /admin\.loadingRosterSessionID != operation\.id[\s\S]*!loadFailed/);
  assert.match(roster, /accessibilityIdentifier\("owner\.roster\.verifiedAt"\)/);
  assert.match(roster, /accessibilityLabel\("Export verified class roster"\)/);
  assert.match(roster, /This file contains member contact details/);
  assert.match(roster, /Unsaved attendance marks are labelled as a roll call draft/);
  assert.match(roster, /AdminClassRosterReport\([\s\S]*attendance: attendance/);
  assert.match(roster, /\.fileExporter\([\s\S]*contentType: \.commaSeparatedText/);
  assert.match(roster, /private struct AdminClassRosterCSVDocument: FileDocument/);
});

test('native roll call recovers short-lived owner-scoped drafts without caching roster PII', async () => {
  const [view, models, store, localState] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/AdminAttendanceDraftStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/MemberLocalState.swift'),
  ]);
  const roster = view.slice(
    view.indexOf('private struct AdminClassRosterView'),
    view.indexOf('private struct AdminScheduleView'),
  );

  assert.match(models, /enum AdminAttendanceMark: String, Codable, Equatable/);
  assert.match(models, /var persistedMarks: \[UUID: AdminAttendanceMark\]/);
  assert.match(models, /mutating func restore\([\s\S]*whenCurrentMatches baselineMarks/);
  assert.match(models, /guard marks\[bookingID\] == baselineMarks\[bookingID\] else \{ continue \}/);
  assert.match(models, /for member in eligible \{[\s\S]*case AdminAttendanceMark\.attended\.rawValue:[\s\S]*marks\[member\.id\] = \.attended/);
  assert.match(store, /struct AdminAttendanceDraftSnapshot: Codable, Equatable/);
  assert.match(store, /static let maximumAge: TimeInterval = 12 \* 60 \* 60/);
  assert.match(store, /let ownerID: UUID[\s\S]*let sessionID: UUID[\s\S]*let marks: \[UUID: AdminAttendanceMark\][\s\S]*let baselineMarks: \[UUID: AdminAttendanceMark\]/);
  assert.doesNotMatch(store, /full_name|email|phone|readiness/);
  assert.match(store, /snapshot\.marks\.count <= 250/);
  assert.match(store, /now\.timeIntervalSince\(snapshot\.savedAt\) <= maximumAge/);
  assert.match(store, /static func clearAll\(ownerID: UUID/);
  assert.match(localState, /AdminAttendanceDraftStore\.clearAll\(ownerID: userID/);
  assert.match(roster, /AdminAttendanceDraftStore\.load\([\s\S]*ownerID: session\.user\?\.id/);
  assert.match(roster, /recovered\.restore\([\s\S]*snapshot\.marks,[\s\S]*whenCurrentMatches: snapshot\.baselineMarks/);
  assert.match(roster, /accessibilityIdentifier\("owner\.roster\.recoveredDraft"\)/);
  assert.match(roster, /Discard recovered marks/);
  assert.match(roster, /\.onChange\(of: attendance\)[\s\S]*persistAttendanceDraft\(\)/);
  assert.match(roster, /if didRecord \{[\s\S]*clearPersistedAttendanceDraft\(\)/);
  assert.match(roster, /Button\("Discard marks", role: \.destructive\)[\s\S]*clearPersistedAttendanceDraft\(\)/);
});

test('high-consequence owner drafts share command-centre exit protection', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const taskSheet = view.slice(
    view.indexOf('private struct AdminOwnerTaskSheet'),
    view.indexOf('private struct AdminMembersView'),
  );
  const memberNotice = view.slice(
    view.indexOf('private struct AdminMemberNoticeComposer'),
    view.indexOf('private struct AdminCreditGrantView'),
  );
  const creditGrant = view.slice(
    view.indexOf('private struct AdminCreditGrantView'),
    view.indexOf('private struct AdminClassesView'),
  );
  const productEditor = view.slice(
    view.indexOf('private struct AdminProductEditor'),
    view.indexOf('private struct AdminEventsView'),
  );
  const eventEditor = view.slice(
    view.indexOf('private struct AdminEventEditor'),
    view.indexOf('private struct AdminEventRosterView'),
  );
  const coachEditor = view.slice(
    view.indexOf('private struct AdminCoachEditor'),
    view.indexOf('private struct AdminAnnouncementComposer'),
  );
  const announcementEditor = view.slice(
    view.indexOf('private struct AdminAnnouncementComposer'),
    view.indexOf('private struct AdminOwnerFreshnessBadge'),
  );

  assert.match(taskSheet, /editorExitCoordinator\?\.active\?\.isDirty == true/);
  assert.match(taskSheet, /editorExitCoordinator\?\.active\?\.isBusy == true/);
  assert.match(taskSheet, /Discard unsaved \\\(editorExitCoordinator\?\.active\?\.title/);
  assert.match(taskSheet, /Button\("Close", action: requestClose\)/);

  assert.match(creditGrant, /private var isDirty: Bool/);
  assert.match(creditGrant, /title: "manual credit grant"/);
  assert.match(creditGrant, /Discard manual credit grant\?/);
  assert.match(creditGrant, /ToolbarItemGroup\(placement: \.keyboard\)/);
  assert.match(creditGrant, /\.interactiveDismissDisabled\(isDirty \|\| isBusy\)/);
  assert.match(creditGrant, /\.safeAreaInset\(edge: \.bottom, spacing: 0\)/);
  assert.match(creditGrant, /confirmingGrant/);

  for (const editor of [
    memberNotice,
    productEditor,
    eventEditor,
    coachEditor,
    announcementEditor,
  ]) {
    assert.match(editor, /@State private var exitStateID = UUID\(\)/);
    assert.match(editor, /\.adminOwnerExitState\(/);
    assert.match(editor, /isDirty:/);
    assert.match(editor, /isBusy:/);
  }

  for (const editor of [eventEditor, coachEditor]) {
    assert.match(editor, /@FocusState private var textInputFocused: Bool/);
    assert.match(editor, /\.scrollDismissesKeyboard\(\.interactively\)/);
    assert.match(editor, /\.safeAreaInset\(edge: \.bottom, spacing: 0\) \{ saveBar \}/);
    assert.match(editor, /ToolbarItemGroup\(placement: \.keyboard\)[\s\S]*Button\("Done"\)/);
    assert.match(editor, /private var saveBar: some View/);
    assert.match(editor, /private func save\(\)/);
    assert.match(editor, /XertHaptics\.play\(\.success\)/);
    assert.match(editor, /XertHaptics\.play\(\.error\)/);
  }
  assert.match(eventEditor, /owner\.eventEditor\.save/);
  assert.match(coachEditor, /owner\.coachEditor\.save/);

  assert.ok((view.match(/\.adminOwnerExitState\(/g) || []).length >= 10);
});

test('native intake notes remain retryable and cannot be discarded through sheet exits', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const memberDetail = view.slice(
    view.indexOf('private struct AdminMemberDetailView'),
    view.indexOf('private enum AdminMemberHistoryTab'),
  );
  const bookingDetail = view.slice(
    view.indexOf('private struct AdminBookingRequestDetailView'),
    view.indexOf('private struct AdminSiteContentView'),
  );
  const leadDetail = view.slice(
    view.indexOf('private struct AdminLeadDetailView'),
    view.indexOf('private struct AdminPTRequestsView'),
  );
  const ptNotes = view.slice(
    view.indexOf('private struct AdminPTRequestDetailView'),
    view.indexOf('private struct AdminPlatformView'),
  );

  assert.match(memberDetail, /private var hasNoteDraft: Bool/);
  assert.match(memberDetail, /Button\("Close", action: requestDismiss\)/);
  assert.match(memberDetail, /Discard staff note\?/);
  assert.match(memberDetail, /title: "staff note for \\\(current\.displayName\)"/);

  for (const editor of [bookingDetail, leadDetail, ptNotes]) {
    assert.match(editor, /baselineNotes/);
    assert.match(editor, /private var isDirty: Bool/);
    assert.match(editor, /@State private var exitStateID = UUID\(\)/);
    assert.match(editor, /\.adminOwnerExitState\(/);
    assert.match(editor, /\.interactiveDismissDisabled\(isDirty \|\| is[A-Z][A-Za-z]+\)/);
    assert.match(editor, /ToolbarItemGroup\(placement: \.keyboard\)/);
    assert.match(editor, /confirmationDialog\(/);
    assert.match(
      editor,
      /XertHaptics\.play\((?:\.success|admin\.ptRequestStatusIsWarning \? \.warning : \.success)\)/,
    );
    assert.match(editor, /XertHaptics\.play\(\.error\)/);
  }

  assert.match(bookingDetail, /Save or discard the staff-note draft before changing this booking's status/);
  assert.match(bookingDetail, /\.disabled\(!mutationAllowed \|\| isUpdating \|\| isDirty\)/);
  assert.match(leadDetail, /status != baselineStatus \|\| notes != baselineNotes/);
  assert.match(ptNotes, /let didSave = await admin\.updatePTRequest/);
  assert.match(ptNotes, /if didSave \{[\s\S]*dismiss\(\)[\s\S]*\} else \{[\s\S]*XertHaptics\.play\(\.error\)/);
  assert.match(ptNotes, /Section\("Contact"\)/);
  assert.match(ptNotes, /Section\("Training request"\)/);
  assert.match(ptNotes, /Section\("Workflow"\)/);
  assert.match(ptNotes, /Label\("Update request status", systemImage: "arrow\.triangle\.2\.circlepath"\)/);
  assert.match(ptNotes, /Save or discard private notes before changing workflow status/);
  assert.match(ptNotes, /\.disabled\(!mutationAllowed \|\| isDirty \|\| isSaving\)/);
  assert.doesNotMatch(ptNotes, /let onSave:/);
  assert.ok((view.match(/\.adminOwnerExitState\(/g) || []).length >= 14);
});

test('native intake desks export the same filtered operational records as desktop', async () => {
  const [models, view, swiftTests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);
  const bookingDesk = view.slice(
    view.indexOf('private struct AdminBookingRequestsView'),
    view.indexOf('private struct AdminBookingRequestDetailView'),
  );
  const leadDesk = view.slice(
    view.indexOf('private struct AdminLeadsView'),
    view.indexOf('private struct AdminLeadDetailView'),
  );

  assert.match(models, /struct AdminLeadReport/);
  assert.match(models, /case \.members:[\s\S]*"Suburb \/ town"[\s\S]*"Campaign source"/);
  assert.match(models, /case \.trainers:[\s\S]*"Qualifications"/);
  assert.match(models, /case \.partners:[\s\S]*"Business", "Profession"/);
  assert.match(models, /struct AdminBookingRequestReport/);
  assert.match(models, /"Requested", "Source", "Status", "Name", "Email", "Phone"/);
  assert.match(models, /booking\.source == \.member \? "Member credit booking" : "Enquiry form"/);

  assert.match(bookingDesk, /AdminBookingRequestReport\(rows: filteredRequests\)\.csv/);
  assert.match(bookingDesk, /defaultFilename: "xert-bookings-/);
  assert.match(bookingDesk, /\.disabled\(filteredRequests\.isEmpty \|\| !requestsAreCurrent\)/);
  assert.match(leadDesk, /AdminLeadReport\(pipeline: pipeline, rows: filteredLeads\)\.csv/);
  assert.match(leadDesk, /defaultFilename: "xert-\\\(pipeline\.rawValue\)-/);
  assert.match(leadDesk, /\.disabled\(filteredLeads\.isEmpty \|\| !pipelineIsCurrent\)/);
  assert.match(view, /private struct AdminIntakeCSVDocument: FileDocument/);

  assert.match(swiftTests, /AdminLeadReport\(pipeline: \.members, rows: \[lead\]\)/);
  assert.match(swiftTests, /AdminBookingRequestReport\(rows: \[booking\]\)/);
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

test('native full timetable prioritizes current work with compact truthful scopes', async () => {
  const [view, models, swiftTests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);
  const schedule = view.slice(
    view.indexOf('private struct AdminScheduleView'),
    view.indexOf('private struct AdminClassCancellationFollowUpView'),
  );

  assert.match(schedule, /@State private var scope = AdminScheduleScope\.upcoming/);
  assert.match(schedule, /Picker\("Timetable scope", selection: \$scope\)/);
  assert.match(schedule, /ForEach\(AdminScheduleScope\.allCases\)/);
  assert.match(schedule, /\.pickerStyle\(\.segmented\)/);
  assert.match(schedule, /owner\.timetable\.scope/);
  assert.match(schedule, /scope\.includes\(\$0, now: Date\(\)\)/);
  assert.match(schedule, /return scope == \.upcoming \? left < right : left > right/);
  assert.match(schedule, /No current or upcoming classes are scheduled/);
  assert.match(models, /enum AdminScheduleScope: String, CaseIterable, Identifiable/);
  assert.match(models, /case \.upcoming: return end >= now/);
  assert.match(models, /case \.past: return end < now/);
  assert.match(swiftTests, /testAdminScheduleScopeKeepsActiveClassesInUpcomingWork/);
  assert.match(swiftTests, /AdminScheduleScope\.upcoming\.includes\(active, now: now\)/);
  assert.match(swiftTests, /AdminScheduleScope\.past\.includes\(past, now: now\)/);
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
  assert.match(api, /Result<\[AdminOrderReconciliationAuditRow\], Error>/);
  assert.match(api, /Result<\[AdminRefundAuditRow\], Error>/);
  assert.match(api, /guard unavailableSources\.count < 10/);
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

test('native finance is a currency-safe current-data-gated owner decision workspace', async () => {
  const [view, models, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
  ]);
  const finance = view.slice(
    view.indexOf('private struct AdminFinanceView'),
    view.indexOf('private struct AdminOrdersView'),
  );

  assert.match(models, /struct AdminFinanceReport/);
  assert.match(models, /Self\.currencyCode\(\$0\.currency\) == normalizedCurrency/);
  assert.match(models, /currentStart[\s\S]*previousStart[\s\S]*monthStart/);
  assert.match(models, /let currentPaid = paid\.filter/);
  assert.match(models, /let previousPaid = paid\.filter/);
  assert.match(models, /dailyRevenue = \(0\.\.<30\)\.compactMap/);
  assert.match(models, /productLeaders = Dictionary\(grouping: currentPaid\)/);
  assert.match(models, /var periodChangePercent: Double\?/);
  assert.match(store, /private var paidAUDOrders: \[OrderItem\]/);
  assert.match(store, /code\.isEmpty \|\| code == "AUD"/);
  assert.match(store, /var totalRevenueCents: Int \{ paidAUDOrders\.reduce/);
  assert.match(store, /let calendar = EventItem\.calendar/);

  assert.match(finance, /let session: AuthSession/);
  assert.match(finance, /AdminFinanceReport\(orders: admin\.orders, currency: currency\)/);
  assert.match(finance, /admin\.loadedSources\.contains\("orders"\)/);
  assert.match(finance, /Finance data unavailable/);
  assert.match(finance, /The figures below may be stale/);
  assert.match(finance, /Picker\("Reporting currency", selection: \$currency\)/);
  assert.match(finance, /Section\(ordersAreCurrent \? "Revenue pulse" : "Last revenue pulse"\)/);
  assert.match(finance, /AdminFinanceTrendChart\(days: report\.dailyRevenue, currency: report\.currency\)/);
  assert.match(finance, /Top packs - 30 days/);
  assert.match(finance, /report\.recoverableCount/);
  assert.match(finance, /New revenue - the previous 30 days had no paid sales/);
  assert.match(finance, /\.refreshable \{[\s\S]*admin\.refreshOperationalPulse\(session: session\)/);
  assert.match(finance, /ViewThatFits\(in: \.horizontal\)/);
  assert.doesNotMatch(finance, /admin\.monthRevenueCents|admin\.totalRevenueCents/);
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
  assert.match(store, /@Published private\(set\) var scheduleMutationIsWarning/);
  assert.match(scheduleStore, /func refreshScheduleControls\(session: AuthSession\)/);
  assert.match(scheduleStore, /guard scheduleSourceIsCurrent\("availability"\)/);
  assert.match(scheduleStore, /guard scheduleSourceIsCurrent\("blackouts"\), scheduleSourceIsCurrent\("full timetable"\)/);
  assert.match(scheduleStore, /async let availabilityRequest = api\.adminAvailabilityBlocks/);
  assert.match(scheduleStore, /async let blackoutRequest = api\.adminBlackoutPeriods/);
  assert.match(scheduleStore, /async let timetableRequest = api\.adminClassSessions/);
  assert.match(scheduleStore, /Availability created[\s\S]*lastUpdatedAt = Date\(\)[\s\S]*return true/);
  assert.match(scheduleStore, /Blackout created[\s\S]*lastUpdatedAt = Date\(\)[\s\S]*return true/);
  assert.match(scheduleStore, /latest availability list could not reload/);
  assert.match(scheduleStore, /latest blackout list could not reload/);

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
  assert.match(scheduleView, /mutationAllowed && conflicts\.isEmpty && !isBusy && isDirty/);
  assert.match(scheduleView, /\.disabled\(!canSave\)/);
  assert.match(scheduleView, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(scheduleView, /frame\(maxWidth: \.infinity, minHeight: 44\)/);
});

test('native schedule editors protect dirty work across local and command-centre navigation', async () => {
  const [view, ownerNavigation, swiftTests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);
  const ownerShell = view.slice(0, view.indexOf('private struct AdminWorkspaceSwitcher'));
  const classEditor = view.slice(
    view.indexOf('struct AdminClassEditor'),
    view.indexOf('private enum AdminScheduleRemoval'),
  );
  const scheduleEditors = view.slice(
    view.indexOf('private struct AdminAvailabilityEditor'),
    view.indexOf('private struct AdminRetentionView'),
  );

  assert.match(ownerNavigation, /final class XertOwnerEditorExitCoordinator: ObservableObject/);
  assert.match(ownerNavigation, /private var states: \[UUID: XertOwnerEditorExitState\]/);
  assert.match(ownerNavigation, /order\.reversed\(\)\.compactMap \{ states\[\$0\] \}\.first/);
  assert.match(swiftTests, /testOwnerEditorExitCoordinatorRestoresTheUnderlyingDirtyDraft/);
  assert.match(swiftTests, /coordinator\.clear\(id: classID\)[\s\S]*XCTAssertEqual\(coordinator\.active\?\.id, blackoutID\)/);
  assert.match(ownerShell, /struct AdminOwnerExitReportingModifier: ViewModifier/);
  assert.match(ownerShell, /\.onChange\(of: state\) \{ coordinator\?\.report\(\$0\) \}/);
  assert.match(ownerShell, /\.environment\(\\\.adminEditorExitCoordinator, editorExitCoordinator\)/);
  assert.match(ownerShell, /editorExitCoordinator\.active\?\.isDirty == true/);
  assert.match(ownerShell, /editorExitCoordinator\.active\?\.isBusy == true/);
  assert.match(ownerShell, /Unsaved \\\(editorExitCoordinator\.active\?\.title/);
  assert.match(ownerShell, /Discard changes and continue/);
  assert.match(ownerShell, /if let activeEditor = editorExitCoordinator\.active/);
  assert.match(ownerShell, /activeEditor\.isBusy[\s\S]*still saving/);
  assert.match(ownerShell, /activeEditor\.isDirty[\s\S]*showingEditorExitConfirmation = true/);

  for (const editor of [classEditor, scheduleEditors]) {
    assert.match(editor, /@Environment\(\\\.adminEditorExitCoordinator\)/);
    assert.match(editor, /@FocusState private var textInputFocused: Bool/);
    assert.match(editor, /\.navigationBarBackButtonHidden\(true\)/);
    assert.match(editor, /\.scrollDismissesKeyboard\(\.interactively\)/);
    assert.match(editor, /ToolbarItemGroup\(placement: \.keyboard\)[\s\S]*Button\("Done"\)/);
    assert.match(editor, /\.interactiveDismissDisabled\(isDirty \|\| isBusy\)/);
    assert.match(editor, /\.adminOwnerExitState\(/);
    assert.match(editor, /frame\(width: 44, height: 44\)/);
  }

  assert.match(classEditor, /Discard unsaved class changes\?/);
  assert.match(scheduleEditors, /Discard unsaved availability changes\?/);
  assert.match(scheduleEditors, /Discard unsaved blackout changes\?/);
  assert.equal(
    (scheduleEditors.match(/\.interactiveDismissDisabled\(isDirty \|\| isBusy\)/g) || []).length,
    2,
  );
  assert.equal(
    (scheduleEditors.match(/editorExitCoordinator\?\.clear\(id: exitStateID\)/g) || []).length >= 6,
    true,
  );
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
  assert.match(store, /let queueRefreshed = await refreshPTRequestsAfterMutation[\s\S]*latest queue could not reload/);
  assert.match(store, /private func refreshPTRequestsAfterMutation\(session: AuthSession\) async -> Bool/);
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
  assert.match(
    intakeViews,
    /let failedIDs = await admin\.bulkUpdatePTRequests[\s\S]*selectedIDs = failedIDs/,
  );
  assert.match(intakeViews, /Only requests that fail will remain selected for retry/);
  assert.match(intakeViews, /AdminIntakeCSVDocument\(csv: report\.csv\)/);
  assert.match(intakeViews, /defaultFilename: "xert-pt-requests-/);
  assert.match(intakeViews, /Contact and request details remain available, but workflow and notes are read-only/);
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
  assert.match(catalogueViews, /interactiveDismissDisabled\(isDirty \|\| isBusy\)/);
  assert.ok(
    (catalogueViews.match(/interactiveDismissDisabled\(isDirty \|\| isBusy\)/g) || []).length >= 2,
  );

  assert.match(models, /struct AdminEventRosterReport/);
  assert.match(models, /Event,Member,Email,Phone,Joined/);
});

test('native owner can idempotently install missing XERT calendar rows', async () => {
  const [api, store, view, models, migration, freshSchema] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../supabase/migrations/20260714017000_reconcile_2026_event_calendar.sql'),
    read('../src/supabase/booking_schema.sql'),
  ]);

  assert.match(migration, /unique index if not exists events_name_date_uidx[\s\S]*\(name, event_date\)/);
  assert.match(freshSchema, /unique index if not exists events_name_date_uidx[\s\S]*\(name, event_date\)/);
  assert.match(models, /init\(seed event: EventItem/);
  assert.match(api, /func adminSeedEventCalendar\(session auth: AuthSession\)/);
  assert.match(api, /on_conflict", value: "name,event_date"/);
  assert.match(api, /resolution=ignore-duplicates,return=representation/);
  assert.match(api, /XertEventCalendar\.fallback[\s\S]*AdminEventDraft\(seed: \$0\)/);
  assert.match(store, /@Published private\(set\) var isSeedingEventCalendar = false/);
  assert.match(store, /var missingXertEventCalendarCount: Int/);
  assert.match(store, /func seedXertEventCalendar\(session: AuthSession\) async -> Int\?/);
  assert.match(store, /guard eventCalendarIsCurrent else/);
  assert.match(store, /refreshEventsAfterMutation/);
  assert.ok((store.match(/!isSeedingEventCalendar/g) || []).length >= 4);

  const eventsView = view.slice(
    view.indexOf('private struct AdminEventsView'),
    view.indexOf('private struct AdminEventEditor'),
  );
  assert.match(eventsView, /XERT Annual Calendar 2026/);
  assert.match(eventsView, /Add missing 2026 events/);
  assert.match(eventsView, /Add missing XERT 2026 events\?/);
  assert.match(eventsView, /Existing events and member training goals are left unchanged/);
  assert.match(eventsView, /Calendar updated/);
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
  assert.match(cms, /Refresh live section/);
  assert.match(cms, /private func refreshAuthoritativeSnapshot\(\) async/);
  assert.match(cms, /let draftAtRefreshStart = draft[\s\S]*let wasDirtyAtRefreshStart = dirty[\s\S]*loadSiteContent\(session: session, force: true\)/);
  assert.match(cms, /let preserveDraft = wasDirtyAtRefreshStart \|\| draft != draftAtRefreshStart/);
  assert.match(cms, /baseline = authoritative[\s\S]*if !preserveDraft \{[\s\S]*replaceDraft\(with: authoritative\)/);
  assert.match(cms, /\.scrollDismissesKeyboard\(\.interactively\)/);
  assert.match(cms, /\.safeAreaInset\(edge: \.bottom, spacing: 0\) \{ publishBar \}/);
  assert.match(cms, /owner\.siteContentEditor\.publish/);
  assert.match(cms, /XertHaptics\.play\(\.success\)/);
  assert.match(cms, /XertHaptics\.play\(\.error\)/);
  assert.match(cms, /validationMessage == nil/);
  assert.match(cms, /Hero photography is limited to 12 images/);
  assert.match(cms, /kCGImageSourceThumbnailMaxPixelSize: 2_400/);
  assert.match(cms, /jpegData\(compressionQuality: 0\.86\)/);
  assert.match(cms, /frame\(width: 44, height: 44\)/);

  assert.match(models, /Hero photography is limited to 12 images/);
  assert.match(models, /The About page is limited to 12 paragraphs/);
  assert.match(models, /The homepage is limited to 20 FAQ items/);
  assert.match(models, /Public media URLs must be 2,048 characters or fewer/);
});
