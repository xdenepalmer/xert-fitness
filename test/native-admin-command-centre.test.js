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
    'admin_promote_next_waitlisted',
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
  assert.match(view, /This active pack blocks live Stripe checkout/);
  assert.match(view, /stripePriceIDIsValid/);
  assert.match(api, /path: "admin_update_product"/);
  assert.match(api, /p_expected_updated_at: product\.updated_at/);
  assert.match(adminStore, /func saveProduct/);
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
  assert.match(view, /openWorkspace\(priority\.workspace\)/);
  assert.match(view, /All operational queues are clear/);
  assert.match(view, /case \.idle, \.loading:[\s\S]*Checking operational queues/);
  assert.match(view, /case \.partial\(let unavailableSources\)/);
  assert.match(view, /case \.ready:[\s\S]*All operational queues are clear/);
  assert.match(view, /Button \{\s*openWorkspace\(\.classDesk\)[\s\S]*Text\("OPEN DESK"\)/);
  assert.match(view, /AdminMetricTile[\s\S]*let action: \(\(\) -> Void\)\?/);
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
  assert.match(view, /NavigationStack\(path: \$compactPath\)/);
  assert.match(view, /navigationDestination\(for: XertOwnerWorkspace\.self\)/);
  assert.match(view, /applyRequestedRoute\(requestedRoute, resolvesTask: false\)/);
  assert.match(view, /navigationSplitViewColumnWidth\(min: 230, ideal: 270, max: 320\)/);
  assert.match(view, /navigationSplitViewStyle\(\.balanced\)/);
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
  assert.match(view, /\.searchable\(text: \$query, prompt: "Workspace, member, order, pack or event"\)/);
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
