import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

private enum AdminWorkspaceSection: String, CaseIterable, Identifiable {
    case operate = "Operate"
    case grow = "Grow"
    case publish = "Publish"
    case commerce = "Commerce"
    case platform = "Platform"

    var id: String { rawValue }
}

private enum AdminWorkspace: String, CaseIterable, Identifiable {
    case overview
    case members
    case classDesk
    case bookingRequests
    case timetable
    case availability
    case ptRequests
    case retention
    case leads
    case campaigns
    case siteContent
    case notices
    case events
    case team
    case finance
    case products
    case controls
    case health
    case audit

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .members: return "Members"
        case .classDesk: return "Class Desk"
        case .bookingRequests: return "Booking requests"
        case .timetable: return "Full Timetable"
        case .availability: return "Availability"
        case .ptRequests: return "PT Requests"
        case .retention: return "Retention"
        case .leads: return "Lead pipelines"
        case .campaigns: return "Campaign attribution"
        case .siteContent: return "Site content"
        case .notices: return "Member Notices"
        case .events: return "Event Calendar"
        case .team: return "Team Directory"
        case .finance: return "Finance"
        case .products: return "Session Packs"
        case .controls: return "Platform Controls"
        case .health: return "Operations Health"
        case .audit: return "Admin Audit"
        }
    }

    var detail: String {
        switch self {
        case .overview: return "Business pulse and today's priorities"
        case .members: return "Search accounts and review member value"
        case .classDesk: return "Run today's schedule and waitlists"
        case .bookingRequests: return "Resolve member and public requests"
        case .timetable: return "Create, publish and cancel classes"
        case .availability: return "Control bookable windows and blackouts"
        case .ptRequests: return "Approve and complete private training"
        case .retention: return "Contact members before they disengage"
        case .leads: return "Manage member, trainer and partner opportunities"
        case .campaigns: return "Measure acquisition sources and campaigns"
        case .siteContent: return "Edit public copy, FAQs and hero media"
        case .notices: return "Publish updates to web and iOS"
        case .events: return "Coordinate the annual training calendar"
        case .team: return "Manage coaches and practitioners"
        case .finance: return "Track pack sales, revenue and refunds"
        case .products: return "Control pricing, credits and Stripe links"
        case .controls: return "Control launch, bookings and messaging"
        case .health: return "Verify Stripe, schema and APNs readiness"
        case .audit: return "Review protected operational changes"
        }
    }

    var icon: String {
        switch self {
        case .overview: return "waveform.path.ecg.rectangle"
        case .members: return "person.2"
        case .classDesk: return "calendar.badge.clock"
        case .bookingRequests: return "tray.full"
        case .timetable: return "calendar"
        case .availability: return "calendar.badge.exclamationmark"
        case .ptRequests: return "figure.strengthtraining.traditional"
        case .retention: return "arrow.triangle.2.circlepath"
        case .leads: return "person.crop.circle.badge.plus"
        case .campaigns: return "chart.bar.xaxis"
        case .siteContent: return "square.and.pencil"
        case .notices: return "bell.badge"
        case .events: return "trophy"
        case .team: return "person.crop.rectangle.stack"
        case .finance: return "chart.line.uptrend.xyaxis"
        case .products: return "ticket"
        case .controls: return "switch.2"
        case .health: return "checkmark.shield"
        case .audit: return "clock.arrow.circlepath"
        }
    }

    var section: AdminWorkspaceSection? {
        switch self {
        case .overview: return nil
        case .members, .classDesk, .bookingRequests, .timetable, .availability, .ptRequests: return .operate
        case .retention, .leads, .campaigns: return .grow
        case .siteContent, .notices, .events, .team: return .publish
        case .finance, .products: return .commerce
        case .controls, .health, .audit: return .platform
        }
    }

    static func workspaces(in section: AdminWorkspaceSection) -> [Self] {
        allCases.filter { $0.section == section }
    }
}

struct AdminCommandCentreView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @StateObject private var admin = AdminStore()
    @SceneStorage("xert.adminWorkspace") private var restoredWorkspace = AdminWorkspace.overview.rawValue
    var onClose: (() -> Void)? = nil

    var body: some View {
        Group {
            if let session = store.authSession, store.profile?.isAdmin == true {
                if horizontalSizeClass == .regular {
                    ownerSplitWorkspace(session: session)
                } else {
                    ownerCompactWorkspace(session: session)
                }
            } else {
                NavigationStack { accessDenied }
            }
        }
        .background(Color.xertNavy.ignoresSafeArea())
        .task {
            guard let session = store.authSession, store.profile?.isAdmin == true else { return }
            await admin.refresh(session: session)
        }
        .alert("Command Centre", isPresented: Binding(
            get: { admin.errorMessage != nil },
            set: { if !$0 { admin.errorMessage = nil } }
        )) {
            Button("OK") { admin.errorMessage = nil }
        } message: {
            Text(admin.errorMessage ?? "")
        }
    }

    private var currentWorkspace: AdminWorkspace {
        AdminWorkspace(rawValue: restoredWorkspace) ?? .overview
    }

    private var workspaceSelection: Binding<AdminWorkspace?> {
        Binding(
            get: { currentWorkspace },
            set: { restoredWorkspace = ($0 ?? .overview).rawValue }
        )
    }

    private func ownerCompactWorkspace(session: AuthSession) -> some View {
        NavigationStack {
            dashboard(session: session)
                .navigationTitle("Command Centre")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { closeToolbar }
        }
    }

    private func ownerSplitWorkspace(session: AuthSession) -> some View {
        NavigationSplitView {
            List(selection: workspaceSelection) {
                Label(AdminWorkspace.overview.title, systemImage: AdminWorkspace.overview.icon)
                    .tag(AdminWorkspace.overview)

                ForEach(AdminWorkspaceSection.allCases) { section in
                    Section(section.rawValue) {
                        ForEach(AdminWorkspace.workspaces(in: section)) { workspace in
                            HStack(spacing: 10) {
                                Label(workspace.title, systemImage: workspace.icon)
                                Spacer(minLength: 4)
                                if let badge = workspaceBadge(workspace), badge > 0 {
                                    Text(badge > 99 ? "99+" : "\(badge)")
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(Color.xertNavy)
                                        .padding(.horizontal, 7)
                                        .frame(minHeight: 20)
                                        .background(Color.xertSteel)
                                        .clipShape(Capsule())
                                }
                            }
                            .tag(workspace)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.xertInk)
            .navigationTitle("Command Centre")
            .toolbar {
                closeToolbar
                ToolbarItem(placement: .primaryAction) {
                    Button { Task { await admin.refresh(session: session) } } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(admin.isLoading)
                    .accessibilityLabel("Refresh owner workspace")
                }
            }
            .navigationSplitViewColumnWidth(min: 230, ideal: 270, max: 320)
        } detail: {
            NavigationStack {
                workspaceDestination(currentWorkspace, session: session)
                    .id(currentWorkspace)
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    private func dashboard(session: AuthSession) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                ownerHeader
                attentionGrid
                businessPulse
                todayDesk(session: session)
                managementDirectory(session: session)
            }
            .frame(maxWidth: 880)
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity)
        }
        .background(Color.xertNavy)
        .refreshable { await admin.refresh(session: session) }
    }

    private var accessDenied: some View {
        VStack(spacing: 14) {
            Image(systemName: "lock.shield")
                .font(.system(size: 38, weight: .semibold))
                .foregroundStyle(Color.xertSteel)
            Text("Owner access required").xertDisplay(28)
            Text("This workspace is available only to XERT administrators.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.xertPale.opacity(0.7))
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.xertNavy)
        .navigationTitle("Command Centre")
        .toolbar { closeToolbar }
    }

    @ToolbarContentBuilder
    private var closeToolbar: some ToolbarContent {
        if let onClose {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: onClose) {
                    Label("Close", systemImage: "xmark")
                }
                .foregroundStyle(Color.xertSteel)
            }
        }
    }

    private var ownerHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("OWNER WORKSPACE")
                        .font(.caption.weight(.bold))
                        .tracking(2)
                        .foregroundStyle(Color.xertSteel)
                    Text("Run XERT from one place.")
                        .xertDisplay(32)
                        .foregroundStyle(Color.xertOffWhite)
                }
                Spacer()
                if admin.isLoading {
                    ProgressView().tint(Color.xertSteel)
                } else {
                    Image(systemName: "waveform.path.ecg.rectangle")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Color.xertSteel)
                }
            }
            Text("Members, classes, retention and live operations use the same protected business data as the desktop command centre.")
                .font(.subheadline)
                .foregroundStyle(Color.xertPale.opacity(0.72))
            if let updated = admin.lastUpdatedAt {
                Text("Updated \(updated.formatted(date: .omitted, time: .shortened))")
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.45))
            }
        }
        .padding(18)
        .background(Color.xertInk)
        .overlay(alignment: .leading) {
            Rectangle().fill(Color.xertSteel).frame(width: 3)
        }
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.2), lineWidth: 1))
    }

    private var attentionGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            adminHeading("Needs attention")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                AdminMetricTile(title: "Requests", value: admin.requestedPlaces + admin.pendingPTRequests, icon: "tray.full")
                AdminMetricTile(title: "Waitlisted", value: admin.waitingMembers, icon: "person.2.badge.clock")
                AdminMetricTile(title: "Follow-ups", value: admin.followUps.count, icon: "phone.arrow.up.right")
                AdminMetricTile(title: "Roll calls", value: admin.attendanceDue, icon: "checklist")
            }
        }
    }

    private var businessPulse: some View {
        VStack(alignment: .leading, spacing: 12) {
            adminHeading("Business pulse")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                AdminMoneyTile(title: "This month", cents: admin.monthRevenueCents)
                AdminMoneyTile(title: "Total revenue", cents: admin.totalRevenueCents)
                AdminMetricTile(title: "Members", value: admin.memberCount, icon: "person.2")
                AdminMetricTile(title: "Paid orders", value: admin.paidOrders.count, icon: "creditcard")
            }
        }
    }

    @ViewBuilder
    private func todayDesk(session: AuthSession) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                adminHeading("Today's classes")
                Spacer()
                NavigationLink {
                    AdminClassesView(admin: admin, session: session)
                } label: {
                    Text("OPEN DESK")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.xertOffWhite)
                }
            }

            if !admin.isLoading && admin.dailyOperations.isEmpty {
                AdminEmptyState(icon: "calendar", text: "No classes are scheduled today.")
            } else {
                ForEach(admin.dailyOperations.prefix(4)) { item in
                    HStack(spacing: 14) {
                        VStack(spacing: 2) {
                            Text(item.start_time.formatted(date: .omitted, time: .shortened))
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(Color.xertOffWhite)
                            Text(item.status.uppercased())
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(Color.xertSteel)
                        }
                        .frame(width: 72)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title)
                                .font(.headline)
                                .foregroundStyle(Color.xertOffWhite)
                            Text("\(item.confirmed_count) confirmed · \(item.requested_count) requested · \(item.waitlist_count) waiting")
                                .font(.caption)
                                .foregroundStyle(Color.xertPale.opacity(0.6))
                        }
                        Spacer()
                        if item.attendance_due {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundStyle(.orange)
                                .accessibilityLabel("Attendance due")
                        }
                    }
                    .padding(14)
                    .background(Color.xertInk)
                    .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.16), lineWidth: 1))
                }
            }
        }
    }

    private func managementDirectory(session: AuthSession) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            adminHeading("Manage XERT")
            ForEach(AdminWorkspaceSection.allCases) { section in
                adminHeading(section.rawValue)
                    .padding(.top, section == .operate ? 0 : 8)
                ForEach(AdminWorkspace.workspaces(in: section)) { workspace in
                    AdminDestinationRow(
                        title: workspace.title,
                        detail: compactWorkspaceDetail(workspace),
                        icon: workspace.icon
                    ) {
                        workspaceDestination(workspace, session: session)
                    }
                }
            }
        }
    }

    private func compactWorkspaceDetail(_ workspace: AdminWorkspace) -> String {
        switch workspace {
        case .members:
            return "Search \(admin.memberCount) accounts and review member value"
        case .notices:
            return "\(admin.liveAnnouncements) live · publish to web and iOS"
        case .health:
            if !admin.hasHealthSnapshot { return "Checking release services" }
            return admin.healthIssues == 0
                ? "Schema, Stripe and APNs ready"
                : "\(admin.healthIssues) release issue\(admin.healthIssues == 1 ? "" : "s")"
        default:
            return workspace.detail
        }
    }

    private func workspaceBadge(_ workspace: AdminWorkspace) -> Int? {
        switch workspace {
        case .classDesk:
            return admin.requestedPlaces + admin.waitingMembers + admin.attendanceDue
        case .bookingRequests:
            return admin.requestedPlaces
        case .ptRequests:
            return admin.pendingPTRequests
        case .retention:
            return admin.followUps.count
        case .notices:
            return admin.liveAnnouncements
        case .health:
            return admin.hasHealthSnapshot ? admin.healthIssues : nil
        default:
            return nil
        }
    }

    private func workspaceDestination(_ workspace: AdminWorkspace, session: AuthSession) -> AnyView {
        switch workspace {
        case .overview:
            return AnyView(dashboard(session: session).navigationTitle("Overview"))
        case .members:
            return AnyView(AdminMembersView(admin: admin, session: session))
        case .classDesk:
            return AnyView(AdminClassesView(admin: admin, session: session))
        case .bookingRequests:
            return AnyView(AdminBookingRequestsView(admin: admin, session: session))
        case .timetable:
            return AnyView(AdminScheduleView(admin: admin, session: session))
        case .availability:
            return AnyView(AdminAvailabilityView(admin: admin, session: session))
        case .ptRequests:
            return AnyView(AdminPTRequestsView(admin: admin, session: session))
        case .retention:
            return AnyView(AdminRetentionView(admin: admin, session: session))
        case .leads:
            return AnyView(AdminLeadsView(admin: admin, session: session))
        case .campaigns:
            return AnyView(AdminCampaignAttributionView(admin: admin, session: session))
        case .siteContent:
            return AnyView(AdminSiteContentView(admin: admin, session: session))
        case .notices:
            return AnyView(AdminCommunicationsView(admin: admin, session: session))
        case .events:
            return AnyView(AdminEventsView(admin: admin, session: session))
        case .team:
            return AnyView(AdminCoachesView(admin: admin, session: session))
        case .finance:
            return AnyView(AdminFinanceView(admin: admin, session: session))
        case .products:
            return AnyView(AdminProductsView(admin: admin, session: session))
        case .controls:
            return AnyView(AdminPlatformView(admin: admin, session: session))
        case .health:
            return AnyView(AdminOperationsHealthView(admin: admin, session: session))
        case .audit:
            return AnyView(AdminAuditView(admin: admin))
        }
    }
}

private struct AdminMembersView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""

    var body: some View {
        List {
            if admin.isSearchingMembers {
                HStack { Spacer(); ProgressView().tint(Color.xertSteel); Spacer() }
                    .listRowBackground(Color.xertInk)
            }
            ForEach(admin.members) { member in
                NavigationLink {
                    AdminMemberDetailView(admin: admin, session: session, member: member)
                } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.displayName).font(.headline).foregroundStyle(Color.xertOffWhite)
                                Text(member.email ?? member.phone ?? "No contact details")
                                    .font(.caption).foregroundStyle(Color.xertPale.opacity(0.58))
                            }
                            Spacer()
                            Text(member.role.uppercased())
                                .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                        }
                        HStack(spacing: 18) {
                            Label("\(member.credits_remaining) credits", systemImage: "ticket")
                            Label("\(member.bookings_count) bookings", systemImage: "calendar")
                            Text(member.totalSpent)
                        }
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                    }
                    .padding(.vertical, 6)
                }
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Members")
        .searchable(text: $query, prompt: "Name, email or phone")
        .onSubmit(of: .search) { Task { await admin.searchMembers(session: session, query: query) } }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { query = ""; Task { await admin.searchMembers(session: session, query: "") } } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
    }
}

private struct AdminMemberDetailView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let member: AdminMemberSummary
    @State private var noteCategory = "general"
    @State private var noteBody = ""
    @State private var showingGrant = false
    @State private var pendingRole: String?

    private var current: AdminMemberSummary { admin.members.first(where: { $0.id == member.id }) ?? member }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(current.displayName).xertDisplay(25).foregroundStyle(Color.xertOffWhite)
                    if let email = current.email, let url = URL(string: "mailto:\(email)") { Link(email, destination: url) }
                    if let phone = current.phone,
                       let encoded = phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                       let url = URL(string: "tel:\(encoded)") { Link(phone, destination: url) }
                    Text("Joined \(current.joined_at.formatted(date: .abbreviated, time: .omitted))")
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.5))
                }
                .listRowBackground(Color.xertInk)
            }
            Section("Account value") {
                LabeledContent("Available credits", value: current.credits_remaining.formatted())
                LabeledContent("Bookings", value: current.bookings_count.formatted())
                LabeledContent("Paid orders", value: current.orders_count.formatted())
                LabeledContent("Lifetime spend", value: current.totalSpent)
                Button { showingGrant = true } label: { Label("Grant class credits", systemImage: "ticket") }
                    .disabled(admin.servicingMemberID != nil)
            }
            .listRowBackground(Color.xertInk)

            Section("Access") {
                LabeledContent("Current role", value: current.role.capitalized)
                Button {
                    pendingRole = current.role == "admin" ? "member" : "admin"
                } label: {
                    Label(current.role == "admin" ? "Remove administrator access" : "Promote to administrator",
                          systemImage: current.role == "admin" ? "person.badge.minus" : "person.badge.key")
                }
                .foregroundStyle(current.role == "admin" ? Color.red : Color.xertSteel)
                .disabled(admin.servicingMemberID != nil)
            }
            .listRowBackground(Color.xertInk)

            Section("Add staff note") {
                Picker("Category", selection: $noteCategory) {
                    Text("General").tag("general"); Text("Coaching").tag("coaching")
                    Text("Follow-up").tag("follow_up"); Text("Billing").tag("billing")
                }
                TextField("Operational context", text: $noteBody, axis: .vertical).lineLimit(3...7)
                Button("Add note") {
                    Task {
                        if await admin.addMemberNote(session: session, memberID: current.id, category: noteCategory, body: noteBody) {
                            noteBody = ""
                        }
                    }
                }
                .disabled(admin.servicingMemberID != nil || noteBody.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
            }
            .listRowBackground(Color.xertInk)

            Section("Staff timeline") {
                if admin.loadingMemberDetailID == current.id { ProgressView().tint(Color.xertSteel) }
                if admin.memberNotes.isEmpty && admin.loadingMemberDetailID == nil { Text("No staff notes yet.") }
                ForEach(admin.memberNotes) { note in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(note.category.replacingOccurrences(of: "_", with: " ").uppercased())
                                .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                            Spacer()
                            Button {
                                Task { _ = await admin.archiveMemberNote(session: session, memberID: current.id, note: note) }
                            } label: { Image(systemName: note.archived_at == nil ? "archivebox" : "arrow.uturn.backward.circle") }
                                .buttonStyle(.plain)
                                .accessibilityLabel(note.archived_at == nil ? "Archive note" : "Restore note")
                        }
                        Text(note.body).font(.subheadline)
                        Text("\(note.author_name ?? "Former admin") · \(note.created_at.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption2).foregroundStyle(Color.xertPale.opacity(0.45))
                    }
                    .opacity(note.archived_at == nil ? 1 : 0.5)
                    .padding(.vertical, 4)
                }
            }
            .listRowBackground(Color.xertInk)
        }
        .scrollContentBackground(.hidden).background(Color.xertNavy)
        .navigationTitle("Member Record").navigationBarTitleDisplayMode(.inline)
        .task { await admin.loadMemberDetail(session: session, memberID: current.id) }
        .sheet(isPresented: $showingGrant) {
            AdminCreditGrantView(admin: admin, session: session, member: current)
        }
        .confirmationDialog(
            pendingRole == "admin" ? "Grant administrator access?" : "Remove administrator access?",
            isPresented: Binding(get: { pendingRole != nil }, set: { if !$0 { pendingRole = nil } }),
            presenting: pendingRole
        ) { role in
            Button(role == "admin" ? "Promote to administrator" : "Remove administrator", role: role == "member" ? .destructive : nil) {
                Task { _ = await admin.setMemberRole(session: session, memberID: current.id, role: role); pendingRole = nil }
            }
            Button("Cancel", role: .cancel) { pendingRole = nil }
        } message: { role in
            Text(role == "admin" ? "This person will gain full owner command-centre access." : "This person will lose all administrative access. The final administrator cannot be removed.")
        }
    }
}

private struct AdminCreditGrantView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let member: AdminMemberSummary
    @State private var sessions = 1
    @State private var validityDays = 28
    @State private var noExpiry = false
    @State private var reason = ""
    @State private var requestID = UUID()

    var body: some View {
        NavigationStack {
            Form {
                Section("Credit grant") {
                    Stepper("Credits: \(sessions)", value: $sessions, in: 1...100)
                    Toggle("No expiry", isOn: $noExpiry)
                    if !noExpiry { Stepper("Valid for \(validityDays) days", value: $validityDays, in: 1...3_650) }
                    TextField("Reason", text: $reason, axis: .vertical).lineLimit(3...6)
                    Text("Manual grants are permanently audited and idempotent.").font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Grant to \(member.displayName)").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Grant") {
                        let id = requestID
                        Task {
                            if await admin.grantCredits(session: session, memberID: member.id, sessions: sessions,
                                                        validityDays: noExpiry ? nil : validityDays, requestID: id, note: reason) {
                                requestID = UUID(); dismiss()
                            }
                        }
                    }
                    .disabled(admin.servicingMemberID != nil || reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
                }
            }
        }
    }
}

private struct AdminClassesView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var promotion: AdminWaitlistItem?

    var body: some View {
        List {
            Section("Today") {
                if admin.dailyOperations.isEmpty {
                    Text("No classes today.")
                }
                ForEach(admin.dailyOperations) { item in
                    NavigationLink {
                        AdminClassRosterView(admin: admin, session: session, operation: item)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.title).font(.headline)
                            Text("\(item.start_time.formatted(date: .omitted, time: .shortened)) · \(item.activeCount) active · \(item.waitlist_count) waiting")
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                            if item.attendance_due {
                                Label("Roll call is due", systemImage: "checklist")
                                    .font(.caption.weight(.bold)).foregroundStyle(.orange)
                            }
                        }
                        .foregroundStyle(Color.xertOffWhite)
                    }
                    .listRowBackground(Color.xertInk)
                }
            }
            Section("Waitlist desk") {
                if admin.waitlist.isEmpty {
                    Text("No members are waiting for a class place.")
                }
                ForEach(admin.waitlist) { item in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item.title).font(.headline)
                        Text("Next: \(item.nextMemberName) · \(item.next_available_credits) credits")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                        Button {
                            promotion = item
                        } label: {
                            Label("Promote next member", systemImage: "person.fill.badge.plus")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.xertSteel)
                        .disabled(!item.can_promote || item.next_available_credits < 1 || admin.promotingSessionID != nil)
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Class Desk")
        .confirmationDialog(
            "Promote \(promotion?.nextMemberName ?? "next member")?",
            isPresented: Binding(
                get: { promotion != nil },
                set: { if !$0 { promotion = nil } }
            ),
            presenting: promotion
        ) { item in
            Button("Confirm promotion") {
                Task { _ = await admin.promoteNext(session: session, classSessionID: item.session_id) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { item in
            Text("This confirms the next FIFO waitlisted member into \(item.title) and consumes one available credit.")
        }
    }
}

private struct AdminClassRosterView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let operation: AdminDailyOperation
    @State private var attendance: [UUID: Bool] = [:]
    @State private var confirmingRollCall = false

    private var eligible: [AdminRosterMember] { admin.classRoster.filter(\.attendanceEligible) }
    private var canRecordAttendance: Bool {
        !eligible.isEmpty && operation.start_time <= Date()
            && admin.recordingAttendanceSessionID == nil
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(operation.start_time.formatted(date: .abbreviated, time: .shortened)).font(.headline)
                    Text([operation.coach_name, operation.location_zone].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    Text("\(operation.confirmed_count) confirmed · \(operation.requested_count) requested · \(operation.waitlist_count) waiting")
                        .font(.caption).foregroundStyle(Color.xertSteel)
                }
                .listRowBackground(Color.xertInk)
            }

            Section("Member roster") {
                if admin.loadingRosterSessionID == operation.id {
                    HStack { Spacer(); ProgressView().tint(Color.xertSteel); Spacer() }
                } else if admin.classRoster.isEmpty {
                    Text("No member bookings for this class.")
                }
                ForEach(admin.classRoster) { member in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.displayName).font(.headline)
                                Text(member.status.replacingOccurrences(of: "_", with: " ").uppercased())
                                    .font(.caption2.weight(.bold)).foregroundStyle(statusColour(member.status))
                            }
                            Spacer()
                            if member.attendanceEligible && operation.start_time <= Date() {
                                Toggle("Attended", isOn: Binding(
                                    get: { attendance[member.id, default: member.status != "no_show"] },
                                    set: { attendance[member.id] = $0 }
                                ))
                                .labelsHidden()
                                .accessibilityLabel("\(member.displayName) attended")
                            } else if let actions = bookingActions(member.status), !actions.isEmpty {
                                Menu {
                                    ForEach(actions) { action in
                                        Button(role: action.role) {
                                            Task {
                                                _ = await admin.setBookingStatus(
                                                    session: session,
                                                    classSessionID: operation.id,
                                                    bookingID: member.id,
                                                    status: action.status
                                                )
                                            }
                                        } label: { Label(action.label, systemImage: action.icon) }
                                    }
                                } label: {
                                    Image(systemName: "ellipsis.circle").font(.title3)
                                }
                                .disabled(admin.updatingBookingID != nil)
                                .accessibilityLabel("Manage \(member.displayName) booking")
                            }
                        }
                        HStack(spacing: 14) {
                            if let email = contact(member.email), let url = URL(string: "mailto:\(email)") {
                                Link(destination: url) { Label("Email", systemImage: "envelope") }
                            }
                            if let phone = contact(member.phone),
                               let encoded = phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                               let url = URL(string: "tel:\(encoded)") {
                                Link(destination: url) { Label("Call", systemImage: "phone") }
                            }
                        }
                        .font(.caption.weight(.semibold)).foregroundStyle(Color.xertSteel)
                    }
                    .padding(.vertical, 5)
                    .listRowBackground(Color.xertInk)
                }
            }

            if operation.start_time <= Date() {
                Section {
                    Button { confirmingRollCall = true } label: {
                        HStack {
                            Spacer()
                            if admin.recordingAttendanceSessionID == operation.id { ProgressView().tint(Color.xertNavy) }
                            Label("Save complete roll call", systemImage: "checklist")
                                .fontWeight(.bold)
                            Spacer()
                        }
                    }
                    .disabled(!canRecordAttendance)
                    .listRowBackground(Color.xertSteel)
                    .foregroundStyle(Color.xertNavy)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(operation.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await admin.loadClassRoster(session: session, classSessionID: operation.id)
            attendance = Dictionary(uniqueKeysWithValues: admin.classRoster.filter(\.attendanceEligible).map {
                ($0.id, $0.status != "no_show")
            })
        }
        .confirmationDialog("Complete this class?", isPresented: $confirmingRollCall, titleVisibility: .visible) {
            Button("Record attendance and complete class") {
                let attended = eligible.filter { attendance[$0.id, default: $0.status != "no_show"] }.map(\.id)
                let noShows = eligible.filter { !attendance[$0.id, default: $0.status != "no_show"] }.map(\.id)
                Task {
                    _ = await admin.recordAttendance(
                        session: session,
                        classSessionID: operation.id,
                        attendedIDs: attended,
                        noShowIDs: noShows
                    )
                }
            }
            Button("Review roll call", role: .cancel) {}
        } message: {
            Text("This records every confirmed member as attended or no-show, completes the class, and removes it from the public timetable.")
        }
    }

    private struct BookingAction: Identifiable {
        var id: String { status }
        let status: String
        let label: String
        let icon: String
        let role: ButtonRole?
    }

    private func bookingActions(_ status: String) -> [BookingAction]? {
        switch status {
        case "requested":
            return [BookingAction(status: "confirmed", label: "Confirm place", icon: "checkmark.circle", role: nil),
                    BookingAction(status: "waitlisted", label: "Move to waitlist", icon: "person.2.badge.clock", role: nil),
                    BookingAction(status: "declined", label: "Decline request", icon: "xmark.circle", role: .destructive)]
        case "confirmed":
            return [BookingAction(status: "cancelled", label: "Cancel booking", icon: "calendar.badge.minus", role: .destructive)]
        case "waitlisted":
            return [BookingAction(status: "cancelled", label: "Remove from waitlist", icon: "person.crop.circle.badge.minus", role: .destructive)]
        default:
            return nil
        }
    }

    private func statusColour(_ status: String) -> Color {
        switch status {
        case "confirmed", "attended": return .green
        case "requested", "waitlisted": return .orange
        case "declined", "cancelled", "no_show": return .red
        default: return Color.xertSteel
        }
    }

    private func contact(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct AdminScheduleView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    @State private var showingCreate = false
    @State private var pendingCancellation: AdminClassSession?

    private var rows: [AdminClassSession] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return admin.classSessions }
        return admin.classSessions.filter {
            "\($0.title) \($0.class_type ?? "") \($0.coach_name ?? "") \($0.location_zone ?? "")".lowercased().contains(term)
        }
    }

    private func classSummary(_ item: AdminClassSession) -> String {
        let time = item.start_time?.formatted(date: .omitted, time: .shortened) ?? "Time TBC"
        let capacity = item.capacity ?? 0
        return "\(time) · \(capacity) places"
    }

    private func classDay(_ item: AdminClassSession) -> String {
        item.start_time?.formatted(.dateTime.day()) ?? "--"
    }

    private func classMonth(_ item: AdminClassSession) -> String {
        item.start_time?.formatted(.dateTime.month(.abbreviated)) ?? "TBC"
    }

    var body: some View {
        List {
            if rows.isEmpty { Text("No matching classes.").listRowBackground(Color.xertInk) }
            ForEach(rows) { item in
                classRow(item)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Full Timetable")
        .searchable(text: $query, prompt: "Search timetable")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Create class")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack { AdminClassEditor(admin: admin, session: session, classSession: nil) }
        }
        .confirmationDialog(
            "Cancel this class?",
            isPresented: Binding(get: { pendingCancellation != nil }, set: { if !$0 { pendingCancellation = nil } }),
            presenting: pendingCancellation
        ) { item in
            Button("Cancel \(item.title)", role: .destructive) {
                Task {
                    _ = await admin.cancelClass(session: session, classSession: item)
                    pendingCancellation = nil
                }
            }
            Button("Keep class", role: .cancel) { pendingCancellation = nil }
        } message: { _ in
            Text("Every active booking is cancelled, reserved credits are returned, and affected members receive a cancellation notice.")
        }
    }

    private func classRow(_ item: AdminClassSession) -> some View {
        HStack(alignment: .top, spacing: 12) {
            classDateBadge(item)
            classInformation(item)
        }
        .padding(.vertical, 6)
        .listRowBackground(Color.xertInk)
    }

    private func classDateBadge(_ item: AdminClassSession) -> some View {
        VStack(spacing: 2) {
            Text(classDay(item)).font(.title3.weight(.bold))
            Text(classMonth(item)).font(.caption2.weight(.bold))
        }
        .frame(width: 42)
        .foregroundStyle(Color.xertSteel)
    }

    private func classInformation(_ item: AdminClassSession) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            NavigationLink {
                AdminClassEditor(admin: admin, session: session, classSession: item)
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).font(.headline)
                    Text(classSummary(item))
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.6))
                }
            }
            classStatusActions(item)
        }
        .foregroundStyle(Color.xertOffWhite)
    }

    private func classStatusActions(_ item: AdminClassSession) -> some View {
        HStack {
            Text(item.status.uppercased()).foregroundStyle(classStatusColour(item.status))
            if item.public_visible == true { Text("PUBLIC").foregroundStyle(.green) }
            Spacer()
            Menu {
                Button {
                    Task { _ = await admin.duplicateClass(session: session, classSession: item) }
                } label: {
                    Label("Duplicate as draft", systemImage: "plus.square.on.square")
                }
                if !["cancelled", "completed"].contains(item.status) {
                    Button(role: .destructive) { pendingCancellation = item } label: {
                        Label("Cancel class", systemImage: "calendar.badge.minus")
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .disabled(admin.savingClassID != nil || admin.cancellingClassID != nil)
            .accessibilityLabel("Manage \(item.title)")
        }
        .font(.caption2.weight(.bold))
    }

    private func classStatusColour(_ status: String) -> Color {
        switch status {
        case "published": return .green
        case "full": return .orange
        case "cancelled": return .red
        default: return Color.xertSteel
        }
    }
}

private struct AdminClassEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let classSession: AdminClassSession?
    private let baseline: AdminClassDraft
    @State private var draft: AdminClassDraft

    private var isTerminal: Bool { classSession.map { ["cancelled", "completed"].contains($0.status) } ?? false }

    init(admin: AdminStore, session: AuthSession, classSession: AdminClassSession?) {
        let initial = AdminClassDraft(classSession: classSession)
        self.admin = admin
        self.session = session
        self.classSession = classSession
        baseline = initial
        _draft = State(initialValue: initial)
    }

    var body: some View {
        Form {
            if isTerminal {
                Section {
                    Label("This class is \(classSession?.status ?? "closed") and cannot be reopened. Duplicate it to create a new draft.", systemImage: "lock")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
            Section("Class") {
                Picker("Type", selection: $draft.classType) {
                    ForEach(AdminClassDraft.classTypes, id: \.self) { Text($0).tag($0) }
                }
                TextField("Title", text: $draft.title)
                TextField("Description", text: $draft.description, axis: .vertical).lineLimit(2...6)
                Picker("Status", selection: $draft.status) {
                    Text("Draft").tag("draft")
                    Text("Published").tag("published")
                    Text("Full").tag("full")
                }
            }
            Section("Date and capacity") {
                DatePicker("Starts", selection: $draft.startTime)
                Toggle("Set an end time", isOn: $draft.hasEndTime)
                if draft.hasEndTime {
                    DatePicker("Ends", selection: $draft.endTime, in: draft.startTime...)
                }
                Stepper("Duration: \(draft.durationMinutes) min", value: $draft.durationMinutes, in: 15...240, step: 5)
                Stepper("Capacity: \(draft.capacity)", value: $draft.capacity, in: 1...100)
            }
            Section("Delivery") {
                TextField("Coach", text: $draft.coachName)
                TextField("Location or zone", text: $draft.location)
                Picker("Intensity", selection: $draft.intensity) {
                    ForEach(AdminClassDraft.intensities, id: \.self) { Text($0).tag($0) }
                }
                Picker("Booking mode", selection: $draft.bookingMode) {
                    Text("Interest only").tag("interest_only")
                    Text("Request to book").tag("request_to_book")
                    Text("Instant book").tag("instant_book")
                }
                Toggle("Beginner friendly", isOn: $draft.beginnerFriendly)
                Toggle("Visible on public timetable", isOn: $draft.publicVisible)
                    .disabled(draft.status != "published")
            }
            Section("Internal notes") {
                TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(2...6)
            }
            if !isTerminal {
                Section {
                    Button {
                        Task {
                            if await admin.saveClass(session: session, classSession: classSession, draft: draft) { dismiss() }
                        }
                    } label: {
                        HStack {
                            Spacer()
                            if admin.savingClassID != nil { ProgressView().tint(Color.xertNavy) }
                            Text(classSession == nil ? "Create class" : "Save class").fontWeight(.bold)
                            Spacer()
                        }
                    }
                    .disabled(admin.savingClassID != nil || draft == baseline)
                    .listRowBackground(Color.xertSteel)
                    .foregroundStyle(Color.xertNavy)
                }
            }
        }
        .disabled(isTerminal)
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(classSession == nil ? "New Class" : "Edit Class")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if classSession == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .onChange(of: draft.status) { status in
            if status != "published" { draft.publicVisible = false }
        }
    }
}

private enum AdminScheduleRemoval: Identifiable {
    case availability(AdminAvailabilityBlock)
    case blackout(AdminBlackoutPeriod)
    var id: UUID {
        switch self { case .availability(let item): return item.id; case .blackout(let item): return item.id }
    }
}

private struct AdminAvailabilityView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var mode = "availability"
    @State private var showingCreate = false
    @State private var pendingRemoval: AdminScheduleRemoval?

    var body: some View {
        List {
            Section {
                Picker("Schedule controls", selection: $mode) {
                    Text("Availability").tag("availability")
                    Text("Blackouts").tag("blackouts")
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.xertNavy)

            if mode == "availability" {
                if admin.availabilityBlocks.isEmpty { Text("No availability blocks set.").listRowBackground(Color.xertInk) }
                ForEach(admin.availabilityBlocks) { block in
                    scheduleRow(
                        title: block.type,
                        detail: scheduleRange(block.start_time, block.end_time),
                        note: [block.coach_name, block.notes].compactMap { $0 }.joined(separator: " · "),
                        accent: block.is_bookable ? .green : Color.xertSteel,
                        badge: block.is_bookable ? "BOOKABLE" : "PLANNING"
                    ) {
                        AdminAvailabilityEditor(admin: admin, session: session, block: block)
                    } remove: { pendingRemoval = .availability(block) }
                }
            } else {
                if admin.blackoutPeriods.isEmpty { Text("No blackout periods set.").listRowBackground(Color.xertInk) }
                ForEach(admin.blackoutPeriods) { period in
                    scheduleRow(
                        title: period.reason.capitalized,
                        detail: scheduleRange(period.start_time, period.end_time),
                        note: "Affects \(period.affects.replacingOccurrences(of: "_", with: " "))" + (period.notes.map { " · \($0)" } ?? ""),
                        accent: .red,
                        badge: "CLOSED"
                    ) {
                        AdminBlackoutEditor(admin: admin, session: session, period: period)
                    } remove: { pendingRemoval = .blackout(period) }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Schedule Controls")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel(mode == "availability" ? "Add availability" : "Add blackout")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                if mode == "availability" {
                    AdminAvailabilityEditor(admin: admin, session: session, block: nil)
                } else {
                    AdminBlackoutEditor(admin: admin, session: session, period: nil)
                }
            }
        }
        .confirmationDialog(
            "Remove schedule control?",
            isPresented: Binding(get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } }),
            presenting: pendingRemoval
        ) { removal in
            Button("Remove", role: .destructive) {
                Task {
                    switch removal {
                    case .availability(let block): _ = await admin.deleteAvailability(session: session, block: block)
                    case .blackout(let period): _ = await admin.deleteBlackout(session: session, period: period)
                    }
                    pendingRemoval = nil
                }
            }
            Button("Keep", role: .cancel) { pendingRemoval = nil }
        } message: { removal in
            switch removal {
            case .availability: Text("This time will no longer appear available for planning.")
            case .blackout: Text("Classes and staff planning may immediately become available during this period.")
            }
        }
    }

    private func scheduleRange(_ start: Date, _ end: Date) -> String {
        "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))"
    }

    private func scheduleRow<Destination: View>(
        title: String, detail: String, note: String, accent: Color, badge: String,
        @ViewBuilder destination: () -> Destination, remove: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink(destination: destination()) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack { Text(title).font(.headline); Spacer(); Text(badge).font(.caption2.weight(.bold)).foregroundStyle(accent) }
                    Text(detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.65))
                    if !note.isEmpty { Text(note).font(.caption2).foregroundStyle(Color.xertPale.opacity(0.45)) }
                }
            }
            HStack { Spacer(); Button(role: .destructive, action: remove) { Image(systemName: "trash") }.buttonStyle(.plain) }
        }
        .foregroundStyle(Color.xertOffWhite)
        .padding(.vertical, 5)
        .listRowBackground(Color.xertInk)
    }
}

private struct AdminAvailabilityEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let block: AdminAvailabilityBlock?
    private let baseline: AdminAvailabilityDraft
    @State private var draft: AdminAvailabilityDraft

    init(admin: AdminStore, session: AuthSession, block: AdminAvailabilityBlock?) {
        let initial = AdminAvailabilityDraft(block: block)
        self.admin = admin; self.session = session; self.block = block; baseline = initial
        _draft = State(initialValue: initial)
    }

    var body: some View {
        Form {
            Section("Availability") {
                Picker("Type", selection: $draft.type) { ForEach(AdminAvailabilityDraft.types, id: \.self) { Text($0.capitalized).tag($0) } }
                DatePicker("Starts", selection: $draft.startTime)
                DatePicker("Ends", selection: $draft.endTime, in: draft.startTime...)
                TextField("Coach (optional)", text: $draft.coachName)
                Toggle("Bookable", isOn: $draft.isBookable)
                TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(2...5)
            }
            saveButton(label: block == nil ? "Create availability" : "Save availability") {
                await admin.saveAvailability(session: session, block: block, draft: draft)
            }
        }
        .scrollContentBackground(.hidden).background(Color.xertNavy)
        .navigationTitle(block == nil ? "New Availability" : "Edit Availability").navigationBarTitleDisplayMode(.inline)
        .toolbar { if block == nil { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } } }
    }

    @ViewBuilder private func saveButton(label: String, action: @escaping () async -> Bool) -> some View {
        Section { Button { Task { if await action() { dismiss() } } } label: { HStack { Spacer(); Text(label).fontWeight(.bold); Spacer() } }
            .disabled(admin.savingScheduleWindowID != nil || draft == baseline).listRowBackground(Color.xertSteel).foregroundStyle(Color.xertNavy) }
    }
}

private struct AdminBlackoutEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let period: AdminBlackoutPeriod?
    private let baseline: AdminBlackoutDraft
    @State private var draft: AdminBlackoutDraft

    init(admin: AdminStore, session: AuthSession, period: AdminBlackoutPeriod?) {
        let initial = AdminBlackoutDraft(period: period)
        self.admin = admin; self.session = session; self.period = period; baseline = initial
        _draft = State(initialValue: initial)
    }

    var body: some View {
        Form {
            Section("Blackout") {
                Picker("Reason", selection: $draft.reason) { ForEach(AdminBlackoutDraft.reasons, id: \.self) { Text($0.capitalized).tag($0) } }
                Picker("Affects", selection: $draft.affects) { ForEach(AdminBlackoutDraft.scopes, id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) } }
                DatePicker("Starts", selection: $draft.startTime)
                DatePicker("Ends", selection: $draft.endTime, in: draft.startTime...)
                TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(2...5)
            }
            Section { Button { Task { if await admin.saveBlackout(session: session, period: period, draft: draft) { dismiss() } } } label: {
                HStack { Spacer(); Text(period == nil ? "Create blackout" : "Save blackout").fontWeight(.bold); Spacer() }
            }.disabled(admin.savingScheduleWindowID != nil || draft == baseline).listRowBackground(Color.xertSteel).foregroundStyle(Color.xertNavy) }
        }
        .scrollContentBackground(.hidden).background(Color.xertNavy)
        .navigationTitle(period == nil ? "New Blackout" : "Edit Blackout").navigationBarTitleDisplayMode(.inline)
        .toolbar { if period == nil { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } } }
    }
}

private struct AdminRetentionView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var selected: AdminFollowUp?

    var body: some View {
        List {
            if admin.followUps.isEmpty {
                Text("The retention queue is caught up.")
                    .listRowBackground(Color.xertInk)
            }
            ForEach(admin.followUps) { member in
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(member.displayName).font(.headline)
                            Text(member.reasonLabel).font(.caption).foregroundStyle(Color.xertSteel)
                        }
                        Spacer()
                        Text("P\(member.priority)").font(.caption2.weight(.bold)).foregroundStyle(.orange)
                    }
                    Text("\(member.credits_remaining) credits · \(member.bookings_count) bookings")
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    HStack {
                        if let phone = member.phone, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                            Link(destination: url) { Label("Call", systemImage: "phone") }
                                .buttonStyle(.bordered)
                        }
                        if let email = member.email, let url = URL(string: "mailto:\(email)") {
                            Link(destination: url) { Label("Email", systemImage: "envelope") }
                                .buttonStyle(.bordered)
                        }
                        Button { selected = member } label: { Label("Log", systemImage: "checkmark.circle") }
                            .buttonStyle(.borderedProminent).tint(Color.xertSteel)
                            .disabled(admin.loggingFollowUpMemberID != nil)
                    }
                    .font(.caption.weight(.bold))
                }
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 6)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Retention")
        .confirmationDialog(
            "Log follow-up",
            isPresented: Binding(
                get: { selected != nil },
                set: { if !$0 { selected = nil } }
            ),
            presenting: selected
        ) { member in
            ForEach(["phone", "email", "SMS", "in person"], id: \.self) { channel in
                Button(channel.capitalized) {
                    Task { _ = await admin.logFollowUp(session: session, member: member, channel: channel) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

private struct AdminFinanceView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    @State private var status = "all"
    @State private var selectedOrder: OrderItem?

    private var filteredOrders: [OrderItem] {
        admin.orders.filter { order in
            let matchesStatus = status == "all" || order.status == status
            let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let haystack = [
                order.id.uuidString, order.email ?? "", order.products?.name ?? "",
                order.stripe_checkout_session_id ?? "", order.stripe_payment_intent_id ?? ""
            ].joined(separator: " ").lowercased()
            return matchesStatus && (needle.isEmpty || haystack.contains(needle))
        }
    }

    var body: some View {
        List {
            Section("Revenue") {
                FinanceSummaryRow(label: "This month", cents: admin.monthRevenueCents)
                FinanceSummaryRow(label: "All paid orders", cents: admin.totalRevenueCents)
                HStack {
                    Text("Paid orders")
                    Spacer()
                    Text(admin.paidOrders.count.formatted()).fontWeight(.bold)
                }
                .foregroundStyle(Color.xertOffWhite)
                .listRowBackground(Color.xertInk)
            }
            Section("Order operations") {
                Picker("Order status", selection: $status) {
                    Text("All").tag("all")
                    Text("Paid").tag("paid")
                    Text("Pending").tag("pending")
                    Text("Failed").tag("failed")
                    Text("Refunded").tag("refunded")
                }
                .pickerStyle(.menu)
                .tint(Color.xertSteel)
                .listRowBackground(Color.xertInk)

                if filteredOrders.isEmpty {
                    AdminEmptyState(icon: "creditcard", text: admin.orders.isEmpty ? "No orders yet." : "No matching orders.")
                        .listRowBackground(Color.xertInk)
                }
                ForEach(filteredOrders) { order in
                    Button { selectedOrder = order } label: {
                        HStack(spacing: 12) {
                            Image(systemName: order.isRecoverable ? "exclamationmark.arrow.circlepath" : "creditcard")
                                .foregroundStyle(order.isRecoverable ? Color.orange : Color.xertSteel)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(order.products?.name ?? "Session pack").font(.headline)
                            Text((order.email?.isEmpty == false ? order.email : nil) ?? "Anonymized buyer")
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.65))
                            Text(order.activityDate.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(order.displayAmount).font(.subheadline.weight(.bold))
                            Text(order.displayStatus.uppercased())
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(financeStatusColour(order.status))
                            Image(systemName: "chevron.right")
                                .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                        }
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Finance")
        .searchable(text: $query, prompt: "Email, pack or Stripe ID")
        .sheet(item: $selectedOrder) { order in
            NavigationStack {
                AdminOrderDetailView(admin: admin, session: session, order: order)
            }
        }
    }

    private func financeStatusColour(_ value: String) -> Color {
        switch value {
        case "paid": return .green
        case "refunded": return Color.xertPale.opacity(0.55)
        case "failed": return .red
        default: return .orange
        }
    }
}

private struct AdminOrderDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let order: OrderItem
    @State private var refundReason = "requested_by_customer"
    @State private var refundConfirmation = ""
    @State private var confirmingReconciliation = false
    @State private var resultMessage: String?

    private var isOperating: Bool { admin.operatingOrderID == order.id }

    var body: some View {
        List {
            Section("Order") {
                orderValue("Product", order.products?.name ?? "Session pack")
                orderValue("Buyer", (order.email?.isEmpty == false ? order.email : nil) ?? "Anonymized buyer")
                orderValue("Amount", order.displayAmount)
                orderValue("Status", order.displayStatus)
                orderValue("Purchased terms", order.purchasedTerms)
                orderValue("Created", order.created_at.formatted(date: .abbreviated, time: .shortened))
                if let paidAt = order.paid_at { orderValue("Paid", paidAt.formatted(date: .abbreviated, time: .shortened)) }
                identifier("XERT order", order.id.uuidString)
                identifier("Stripe checkout", order.stripe_checkout_session_id)
                identifier("Payment intent", order.stripe_payment_intent_id)
                if let reconciledAt = order.reconciled_at {
                    orderValue("Reconciled", reconciledAt.formatted(date: .abbreviated, time: .shortened))
                    identifier("Reconciled by", order.reconciled_by?.uuidString)
                }
            }

            if order.isRecoverable {
                Section("Payment recovery") {
                    Text("Ask Stripe whether this checkout was paid. Credits are granted only when the member, product, amount, currency and purchased terms match this order.")
                        .font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.7))
                    Button { confirmingReconciliation = true } label: {
                        Label(isOperating ? "Checking Stripe..." : "Check and reconcile payment", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(isOperating)
                }
            }

            if order.status == "refunded" {
                Section("Refund reconciliation") {
                    orderValue("Refunded", order.refundedAmount ?? order.displayAmount)
                    if let refund = order.refund {
                        orderValue("Unused credits revoked", refund.credits_revoked.formatted())
                        orderValue("Credits already consumed", refund.credits_consumed.formatted())
                        orderValue("Future bookings cancelled", refund.bookings_cancelled.formatted())
                        identifier("Stripe refund", refund.refund_id)
                    }
                }
            }

            if order.isRefundable {
                Section("Full refund") {
                    Text("This sends the full payment back through Stripe, revokes unused credits, and cancels future bookings funded by this order.")
                        .font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.7))
                    Picker("Reason", selection: $refundReason) {
                        Text("Requested by customer").tag("requested_by_customer")
                        Text("Duplicate payment").tag("duplicate")
                    }
                    TextField("Type REFUND to confirm", text: $refundConfirmation)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    Button(role: .destructive) {
                        Task {
                            if let result = await admin.refundOrder(
                                session: session,
                                order: order,
                                reason: refundReason,
                                confirmation: refundConfirmation
                            ) {
                                resultMessage = "Refund complete. \(result.credits_revoked) unused credits revoked, \(result.credits_consumed) already consumed, and \(result.bookings_cancelled) future bookings cancelled."
                            }
                        }
                    } label: {
                        Label(isOperating ? "Refunding..." : "Refund \(order.displayAmount)", systemImage: "arrow.uturn.backward.circle")
                    }
                    .disabled(isOperating || refundConfirmation != "REFUND")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Order detail")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(isOperating) } }
        .confirmationDialog("Check this payment with Stripe?", isPresented: $confirmingReconciliation, titleVisibility: .visible) {
            Button("Check and reconcile") {
                Task {
                    if let result = await admin.reconcileOrder(session: session, order: order) {
                        resultMessage = result.already_paid
                            ? "Fulfilment verified. \(result.credits_granted) session credits are attached to this order."
                            : "Payment reconciled. \(result.credits_granted) session credits were granted."
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("No credits are granted unless Stripe and the XERT order match exactly.")
        }
        .alert("Order updated", isPresented: Binding(
            get: { resultMessage != nil },
            set: { if !$0 { resultMessage = nil; dismiss() } }
        )) {
            Button("Done") { resultMessage = nil; dismiss() }
        } message: { Text(resultMessage ?? "") }
    }

    @ViewBuilder
    private func orderValue(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundStyle(Color.xertPale.opacity(0.6))
            Spacer()
            Text(value).multilineTextAlignment(.trailing).foregroundStyle(Color.xertOffWhite)
        }
        .listRowBackground(Color.xertInk)
    }

    @ViewBuilder
    private func identifier(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                Text(value).font(.caption.monospaced()).textSelection(.enabled).foregroundStyle(Color.xertOffWhite)
            }
            .listRowBackground(Color.xertInk)
        }
    }
}

private struct AdminBookingRequestsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    @State private var status = "all"
    @State private var source = "all"
    @State private var days = "30"
    @State private var selectedRequest: AdminBookingRequest?
    @State private var selectedIDs: Set<String> = []
    @State private var bulkStatus = ""
    @State private var confirmingBulk = false

    private let statuses = ["requested", "confirmed", "waitlisted", "cancelled", "declined", "attended", "no_show"]

    private var filteredRequests: [AdminBookingRequest] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cutoff: Date? = days == "all" ? nil : Calendar.current.date(byAdding: .day, value: -(Int(days) ?? 30), to: Date())
        return admin.bookingRequests.filter { booking in
            let withinWindow = cutoff.map { booking.createdAt >= $0 } ?? true
            return (status == "all" || booking.status == status)
                && (source == "all" || booking.source.rawValue == source)
                && withinWindow
                && (needle.isEmpty || booking.searchableText.contains(needle))
        }
    }

    private var selectedRequests: [AdminBookingRequest] {
        admin.bookingRequests.filter { selectedIDs.contains($0.id) }
    }

    private var bulkOptions: [String] {
        let selected = selectedRequests
        guard let first = selected.first, selected.allSatisfy({ $0.status == first.status }) else { return [] }
        return first.allowedNextStatuses
    }

    var body: some View {
        List {
            Section("Queue filters") {
                Picker("Status", selection: $status) {
                    Text("All statuses").tag("all")
                    ForEach(statuses, id: \.self) { Text(statusLabel($0)).tag($0) }
                }
                Picker("Source", selection: $source) {
                    Text("All sources").tag("all")
                    Text("Member credit").tag("member")
                    Text("Enquiry form").tag("enquiry")
                }
                .pickerStyle(.segmented)
                Picker("Age", selection: $days) {
                    Text("30 days").tag("30")
                    Text("90 days").tag("90")
                    Text("All time").tag("all")
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.xertInk)

            Section("Matching workload") {
                metricRow("Matching", filteredRequests.count)
                metricRow("Requested", filteredRequests.filter { $0.status == "requested" }.count)
                metricRow("Confirmed", filteredRequests.filter { $0.status == "confirmed" }.count)
                metricRow("Attended", filteredRequests.filter { $0.status == "attended" }.count)
            }

            if !selectedIDs.isEmpty {
                Section("Bulk update") {
                    HStack {
                        Text("\(selectedIDs.count) selected")
                        Spacer()
                        Button("Clear") { selectedIDs = []; bulkStatus = "" }
                    }
                    if bulkOptions.isEmpty {
                        Text("Select bookings with the same actionable status to update them together.")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    } else {
                        Picker("Move selected to", selection: $bulkStatus) {
                            Text("Choose status").tag("")
                            ForEach(bulkOptions, id: \.self) { Text(statusLabel($0)).tag($0) }
                        }
                        Button { confirmingBulk = true } label: {
                            Label(admin.updatingBookingRequestIDs.isEmpty ? "Apply booking update" : "Updating bookings...", systemImage: "arrow.triangle.2.circlepath")
                        }
                        .disabled(bulkStatus.isEmpty || !admin.updatingBookingRequestIDs.isEmpty)
                    }
                }
                .listRowBackground(Color.xertInk)
            }

            Section("Booking operations") {
                if admin.isLoadingBookingRequests && admin.bookingRequests.isEmpty {
                    HStack { ProgressView(); Text("Loading booking requests...") }
                        .listRowBackground(Color.xertInk)
                } else if filteredRequests.isEmpty {
                    AdminEmptyState(icon: "tray", text: admin.bookingRequests.isEmpty ? "No booking requests yet." : "No matching bookings.")
                        .listRowBackground(Color.xertInk)
                }
                ForEach(filteredRequests) { booking in
                    HStack(spacing: 12) {
                        Button { toggleSelection(booking.id) } label: {
                            Image(systemName: selectedIDs.contains(booking.id) ? "checkmark.circle.fill" : "circle")
                                .font(.title3).foregroundStyle(Color.xertSteel)
                        }
                        .buttonStyle(.plain)
                        .disabled(selectedIDs.count >= 50 && !selectedIDs.contains(booking.id))
                        .accessibilityLabel(selectedIDs.contains(booking.id) ? "Deselect \(booking.fullName)" : "Select \(booking.fullName)")

                        Button { selectedRequest = booking } label: {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(booking.fullName).font(.headline)
                                    Text(booking.session?.title ?? "Class not linked")
                                        .font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.72))
                                    if let start = booking.session?.start_time {
                                        Text(start.formatted(date: .abbreviated, time: .shortened))
                                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.52))
                                    }
                                    Text(booking.source.label.uppercased())
                                        .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 5) {
                                    Text(statusLabel(booking.status).uppercased())
                                        .font(.caption2.weight(.bold)).foregroundStyle(bookingStatusColour(booking.status))
                                    if booking.creditBatchID != nil {
                                        Label("Reserved", systemImage: "ticket").font(.caption2).foregroundStyle(Color.xertPale.opacity(0.5))
                                    }
                                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Color.xertSteel)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .padding(.vertical, 5)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Booking Requests")
        .searchable(text: $query, prompt: "Member, contact, class or coach")
        .refreshable { await admin.loadBookingRequests(session: session, force: true) }
        .task { await admin.loadBookingRequests(session: session) }
        .onChange(of: status) { _ in resetSelection() }
        .onChange(of: source) { _ in resetSelection() }
        .onChange(of: days) { _ in resetSelection() }
        .sheet(item: $selectedRequest) { booking in
            NavigationStack {
                AdminBookingRequestDetailView(admin: admin, session: session, booking: booking)
            }
        }
        .confirmationDialog("Update \(selectedRequests.count) bookings?", isPresented: $confirmingBulk, titleVisibility: .visible) {
            Button("Move to \(statusLabel(bulkStatus))", role: bulkStatus == "cancelled" ? .destructive : nil) {
                let selected = selectedRequests
                Task {
                    selectedIDs = await admin.bulkUpdateBookingRequests(session: session, bookings: selected, status: bulkStatus)
                    if selectedIDs.isEmpty { bulkStatus = "" }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(bulkStatus == "cancelled" ? "Confirmed member bookings follow the server credit-return policy." : "Every selected enquiry and member booking will be updated.")
        }
    }

    private func toggleSelection(_ id: String) {
        if selectedIDs.contains(id) { selectedIDs.remove(id) } else { selectedIDs.insert(id) }
        if selectedIDs.count > 50 { selectedIDs.remove(id) }
        if !bulkOptions.contains(bulkStatus) { bulkStatus = "" }
    }

    private func resetSelection() { selectedIDs = []; bulkStatus = ""; selectedRequest = nil }

    private func statusLabel(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func bookingStatusColour(_ value: String) -> Color {
        switch value {
        case "confirmed", "attended": return .green
        case "requested", "waitlisted", "no_show": return .orange
        case "cancelled", "declined": return Color.xertPale.opacity(0.45)
        default: return Color.xertSteel
        }
    }

    private func metricRow(_ label: String, _ value: Int) -> some View {
        HStack { Text(label); Spacer(); Text(value.formatted()).fontWeight(.bold) }
            .foregroundStyle(Color.xertOffWhite).listRowBackground(Color.xertInk)
    }
}

private struct AdminBookingRequestDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let booking: AdminBookingRequest
    @State private var notes: String
    @State private var pendingStatus: String?

    init(admin: AdminStore, session: AuthSession, booking: AdminBookingRequest) {
        self.admin = admin
        self.session = session
        self.booking = booking
        _notes = State(initialValue: booking.adminNotes ?? "")
    }

    private var isUpdating: Bool { admin.updatingBookingRequestIDs.contains(booking.id) }

    var body: some View {
        List {
            Section("Booking") {
                detailRow("Member", booking.fullName)
                detailRow("Source", booking.source.label)
                detailRow("Status", statusLabel(booking.status))
                detailRow("Requested", booking.createdAt.formatted(date: .abbreviated, time: .shortened))
                if booking.creditBatchID != nil { detailRow("Class credit", "Reserved") }
                if let email = nonBlank(booking.email), let url = URL(string: "mailto:\(email)") {
                    Link(destination: url) { Label(email, systemImage: "envelope") }
                }
                if let phone = nonBlank(booking.phone), let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(destination: url) { Label(phone, systemImage: "phone") }
                }
            }
            Section("Class") {
                detailRow("Class", booking.session?.title ?? "Not linked")
                if let start = booking.session?.start_time { detailRow("Starts", start.formatted(date: .complete, time: .shortened)) }
                optionalRow("Coach", booking.session?.coach_name)
                optionalRow("Location", booking.session?.location_zone)
            }
            if !booking.allowedNextStatuses.isEmpty {
                Section("Decision") {
                    ForEach(booking.allowedNextStatuses, id: \.self) { next in
                        Button(role: next == "cancelled" || next == "declined" ? .destructive : nil) {
                            pendingStatus = next
                        } label: {
                            Label(statusLabel(next), systemImage: statusIcon(next))
                        }
                        .disabled(isUpdating)
                    }
                }
            }
            if booking.source == .enquiry {
                Section("Staff notes") {
                    TextEditor(text: $notes).frame(minHeight: 120)
                    Text("\(notes.count)/5,000").font(.caption2)
                        .foregroundStyle(notes.count > 5_000 ? Color.red : Color.xertPale.opacity(0.45))
                    Button {
                        Task {
                            if await admin.saveLegacyBookingNotes(session: session, booking: booking, notes: notes) { dismiss() }
                        }
                    } label: { Label(isUpdating ? "Saving..." : "Save notes", systemImage: "note.text") }
                    .disabled(isUpdating || notes.count > 5_000)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Booking Detail")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(isUpdating) } }
        .confirmationDialog("Move booking to \(statusLabel(pendingStatus ?? ""))?", isPresented: Binding(
            get: { pendingStatus != nil },
            set: { if !$0 { pendingStatus = nil } }
        ), titleVisibility: .visible) {
            if let pendingStatus {
                Button(statusLabel(pendingStatus), role: pendingStatus == "cancelled" || pendingStatus == "declined" ? .destructive : nil) {
                    Task {
                        if await admin.updateBookingRequest(session: session, booking: booking, status: pendingStatus) { dismiss() }
                    }
                }
            }
            Button("Keep current status", role: .cancel) { pendingStatus = nil }
        } message: {
            Text(pendingStatus == "cancelled" && booking.source == .member
                ? "The server will return the reserved class credit according to the cancellation policy."
                : "This change is recorded in the permanent admin request audit.")
        }
    }

    private func statusLabel(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }
    private func statusIcon(_ value: String) -> String {
        switch value {
        case "confirmed": return "checkmark.circle"
        case "waitlisted": return "clock"
        case "attended": return "person.badge.checkmark"
        case "no_show": return "person.badge.minus"
        default: return "xmark.circle"
        }
    }
    private func nonBlank(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
    @ViewBuilder private func optionalRow(_ label: String, _ value: String?) -> some View {
        if let value = nonBlank(value) { detailRow(label, value) }
    }
    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundStyle(Color.xertPale.opacity(0.55))
            Spacer()
            Text(value).multilineTextAlignment(.trailing).foregroundStyle(Color.xertOffWhite)
        }
    }
}

private struct AdminSiteContentView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession

    var body: some View {
        List {
            Section {
                Text("Changes publish to the public website immediately. Empty saved fields use XERT's built-in copy, and unfinished drafts stay on this device.")
                    .foregroundStyle(Color.xertPale.opacity(0.7))
            }
            Section("Public sections") {
                ForEach(AdminSiteContentSection.allCases) { section in
                    NavigationLink {
                        AdminSiteContentEditor(
                            admin: admin,
                            session: session,
                            section: section,
                            row: admin.siteContentRow(for: section)
                        )
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(section.title).font(.headline)
                                Text(section.summary).font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                            }
                        } icon: {
                            Image(systemName: section.icon).foregroundStyle(Color.xertSteel)
                        }
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Site Content")
        .overlay {
            if admin.isLoadingSiteContent && !admin.hasLoadedSiteContent {
                ProgressView("Loading live content...").tint(Color.xertSteel)
            }
        }
        .refreshable { await admin.loadSiteContent(session: session, force: true) }
        .task { await admin.loadSiteContent(session: session) }
    }
}

private struct AdminSiteContentEditor: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let section: AdminSiteContentSection
    let row: AdminSiteContentRow?
    @State private var baseline: AdminSiteContentData
    @State private var draft: AdminSiteContentData
    @State private var expectedUpdatedAt: String?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoURL = ""

    init(admin: AdminStore, session: AuthSession, section: AdminSiteContentSection, row: AdminSiteContentRow?) {
        self.admin = admin
        self.session = session
        self.section = section
        self.row = row
        let live = (row?.data ?? AdminSiteContentData()).merged(over: .defaults(for: section))
        _baseline = State(initialValue: live)
        _draft = State(initialValue: AdminSiteContentDraftStore.load(section) ?? live)
        _expectedUpdatedAt = State(initialValue: row?.updated_at)
    }

    private var dirty: Bool { draft != baseline }
    private var isSaving: Bool { admin.savingSiteContentSection == section }

    var body: some View {
        Form {
            Section {
                Label(section.summary, systemImage: section.icon)
                    .foregroundStyle(Color.xertPale.opacity(0.72))
                Link(destination: AppConfig.webURL(path: section.publicPath)) {
                    Label("View live page", systemImage: "safari")
                }
            }

            fields

            Section {
                Button {
                    Task {
                        if let saved = await admin.saveSiteContent(
                            session: session,
                            section: section,
                            expectedUpdatedAt: expectedUpdatedAt,
                            draft: draft
                        ) {
                            baseline = draft
                            expectedUpdatedAt = saved.updated_at
                        }
                    }
                } label: {
                    if isSaving { ProgressView() } else { Label(dirty ? "Publish section" : "Published", systemImage: "checkmark.circle") }
                }
                .disabled(!dirty || isSaving)

                Button {
                    draft = .defaults(for: section)
                } label: {
                    Label("Restore original copy", systemImage: "arrow.counterclockwise")
                }
                if dirty {
                    Button("Discard draft", role: .destructive) {
                        draft = baseline
                        AdminSiteContentDraftStore.clear(section)
                    }
                }
            } footer: {
                Text(dirty ? "Unsaved draft stored on this device." : "This section matches the live version loaded from Supabase.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(section.title)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: draft) { value in
            if value == baseline { AdminSiteContentDraftStore.clear(section) }
            else { AdminSiteContentDraftStore.save(value, section: section) }
        }
        .onChange(of: selectedPhoto) { item in
            guard let item else { return }
            Task { await upload(item) }
        }
    }

    @ViewBuilder
    private var fields: some View {
        switch section {
        case .hero:
            Section("Hero copy") {
                TextField("Headline", text: textBinding(\.headline))
                TextField("Subheading", text: textBinding(\.subheading), axis: .vertical).lineLimit(3...8)
                TextField("Supporting line", text: textBinding(\.supporting), axis: .vertical).lineLimit(3...8)
            }
            Section("Rotating photos") {
                ForEach((draft.photos ?? []).indices, id: \.self) { index in
                    heroPhotoRow(index: index)
                }
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label(admin.isUploadingSiteImage ? "Uploading..." : "Upload photo", systemImage: "photo.badge.plus")
                }
                .disabled(admin.isUploadingSiteImage)
                HStack {
                    TextField("https://... or /assets/...", text: $photoURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    Button {
                        guard !photoURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                        draft.photos = (draft.photos ?? []) + [photoURL]
                        photoURL = ""
                    } label: { Image(systemName: "plus.circle.fill") }
                    .accessibilityLabel("Add photo URL")
                }
            }
        case .booking:
            Section("Booking introduction") {
                TextField("Introduction", text: textBinding(\.intro), axis: .vertical).lineLimit(5...12)
            }
        case .about:
            Section("About paragraphs") {
                ForEach((draft.paragraphs ?? []).indices, id: \.self) { index in
                    editableTextListRow(index: index)
                }
                Button {
                    draft.paragraphs = (draft.paragraphs ?? []) + [""]
                } label: {
                    Label("Add paragraph", systemImage: "plus")
                }
            }
        case .contact:
            Section("Public contact") {
                TextField("Email", text: textBinding(\.email)).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Phone", text: textBinding(\.phone)).keyboardType(.phonePad)
                TextField("Address or location", text: textBinding(\.address), axis: .vertical)
                TextField("Instagram handle", text: textBinding(\.instagram_handle)).textInputAutocapitalization(.never)
                TextField("Instagram URL", text: textBinding(\.instagram_url)).keyboardType(.URL).textInputAutocapitalization(.never)
                TextField("Contact page introduction", text: textBinding(\.intro), axis: .vertical).lineLimit(4...10)
            }
        case .faq:
            Section("Questions and answers") {
                ForEach((draft.items ?? []).indices, id: \.self) { index in
                    faqRow(index: index)
                }
                Button {
                    draft.items = (draft.items ?? []) + [AdminFAQItem(q: "", a: "")]
                } label: {
                    Label("Add question", systemImage: "plus")
                }
            }
        }
    }

    private func textBinding(_ keyPath: WritableKeyPath<AdminSiteContentData, String?>) -> Binding<String> {
        Binding(
            get: { draft[keyPath: keyPath] ?? "" },
            set: { draft[keyPath: keyPath] = $0 }
        )
    }

    @ViewBuilder
    private func heroPhotoRow(index: Int) -> some View {
        let value = (draft.photos ?? [])[index]
        HStack(spacing: 12) {
            AsyncImage(url: publicImageURL(value)) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Image(systemName: "photo").foregroundStyle(Color.xertPale.opacity(0.4))
            }
            .frame(width: 58, height: 70).clipped()
            Text(value).font(.caption).lineLimit(2)
            Spacer()
            reorderButtons(index: index, count: draft.photos?.count ?? 0) { from, to in
                draft.photos?.swapAt(from, to)
            } remove: {
                draft.photos?.remove(at: index)
            }
        }
    }

    @ViewBuilder
    private func editableTextListRow(index: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Paragraph \(index + 1)").font(.caption.weight(.bold))
                Spacer()
                reorderButtons(index: index, count: draft.paragraphs?.count ?? 0) { from, to in
                    draft.paragraphs?.swapAt(from, to)
                } remove: {
                    draft.paragraphs?.remove(at: index)
                }
            }
            TextField("Paragraph", text: Binding(
                get: { draft.paragraphs?[index] ?? "" },
                set: { draft.paragraphs?[index] = $0 }
            ), axis: .vertical).lineLimit(5...14)
        }
    }

    @ViewBuilder
    private func faqRow(index: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Question \(index + 1)").font(.caption.weight(.bold))
                Spacer()
                reorderButtons(index: index, count: draft.items?.count ?? 0) { from, to in
                    draft.items?.swapAt(from, to)
                } remove: {
                    draft.items?.remove(at: index)
                }
            }
            TextField("Question", text: Binding(
                get: { draft.items?[index].q ?? "" },
                set: { draft.items?[index].q = $0 }
            ))
            TextField("Answer", text: Binding(
                get: { draft.items?[index].a ?? "" },
                set: { draft.items?[index].a = $0 }
            ), axis: .vertical).lineLimit(3...10)
        }
    }

    private func reorderButtons(
        index: Int,
        count: Int,
        move: @escaping (Int, Int) -> Void,
        remove: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 4) {
            Button { move(index, index - 1) } label: { Image(systemName: "arrow.up") }
                .disabled(index == 0).accessibilityLabel("Move up")
            Button { move(index, index + 1) } label: { Image(systemName: "arrow.down") }
                .disabled(index >= count - 1).accessibilityLabel("Move down")
            Button(role: .destructive, action: remove) { Image(systemName: "trash") }
                .accessibilityLabel("Remove")
        }
        .buttonStyle(.borderless)
    }

    private func publicImageURL(_ value: String) -> URL? {
        value.hasPrefix("/") ? AppConfig.webURL(path: value) : URL(string: value)
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { selectedPhoto = nil }
        guard let sourceData = try? await item.loadTransferable(type: Data.self) else {
            admin.errorMessage = "The selected photo could not be read."
            return
        }
        guard sourceData.count <= 5 * 1_024 * 1_024 else {
            admin.errorMessage = "Image must be under 5 MB."
            return
        }
        let type = item.supportedContentTypes.first(where: { $0.conforms(to: .image) }) ?? .jpeg
        let upload: (data: Data, mimeType: String, fileExtension: String)
        if type.conforms(to: .jpeg) || type.conforms(to: .png) {
            upload = (sourceData, type.preferredMIMEType ?? "image/jpeg", type.preferredFilenameExtension ?? "jpg")
        } else if let image = UIImage(data: sourceData), let jpeg = image.jpegData(compressionQuality: 0.9) {
            upload = (jpeg, "image/jpeg", "jpg")
        } else {
            admin.errorMessage = "The selected image type could not be prepared for the website."
            return
        }
        if let url = await admin.uploadSiteImage(
            session: session,
            data: upload.data,
            mimeType: upload.mimeType,
            fileExtension: upload.fileExtension
        ) {
            draft.photos = (draft.photos ?? []) + [url]
        }
    }
}

private struct AdminCampaignAttributionView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var range = AdminCampaignRange.thirty
    @State private var exportDocument: AdminCampaignCSVDocument?
    @State private var isExporting = false

    private var summary: AdminCampaignSummary {
        AdminCampaignSummary(rows: admin.campaignAttributionRows, range: range)
    }

    var body: some View {
        List {
            Section {
                Picker("Reporting range", selection: $range) {
                    ForEach(AdminCampaignRange.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            } footer: {
                Text("Member-interest attribution uses Australia/Brisbane reporting days and matches the desktop command centre.")
            }

            Section("Acquisition pulse") {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    AdminCampaignMetric(title: "Leads", value: "\(summary.total)")
                    AdminCampaignMetric(title: "UTM attributed", value: "\(summary.attributed)")
                    AdminCampaignMetric(title: "Direct / unknown", value: "\(summary.direct)")
                    AdminCampaignMetric(
                        title: "Attribution rate",
                        value: summary.attributionRate.formatted(.percent.precision(.fractionLength(0)))
                    )
                }
                .padding(.vertical, 4)
                .listRowBackground(Color.xertNavy)
            }

            AdminCampaignBreakdownSection(
                title: "Traffic sources", items: summary.sources, total: summary.total,
                emptyText: "No source data in this range."
            )
            AdminCampaignBreakdownSection(
                title: "Campaigns", items: summary.campaigns, total: summary.total,
                emptyText: "No UTM campaigns in this range."
            )
            AdminCampaignBreakdownSection(
                title: "Channels / mediums", items: summary.mediums, total: summary.total,
                emptyText: "No channel data in this range."
            )

            Section("Daily signups - latest 30 Queensland days") {
                if summary.dailySignups.allSatisfy({ $0.count == 0 }) {
                    AdminEmptyState(icon: "chart.bar", text: "No member leads in the latest 30 days.")
                        .listRowInsets(EdgeInsets())
                } else {
                    AdminCampaignDailyChart(days: summary.dailySignups)
                        .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Campaign Attribution")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    exportDocument = AdminCampaignCSVDocument(csv: summary.csv)
                    isExporting = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(summary.total == 0)
                .accessibilityLabel("Export campaign attribution CSV")
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .commaSeparatedText,
            defaultFilename: "xert-campaign-attribution-\(range.rawValue)"
        ) { result in
            if case .failure(let error) = result { admin.errorMessage = error.localizedDescription }
        }
        .overlay {
            if admin.isLoadingCampaignAttribution && admin.campaignAttributionRows.isEmpty {
                ProgressView("Loading attribution...").tint(Color.xertSteel)
            }
        }
        .refreshable { await admin.loadCampaignAttribution(session: session, force: true) }
        .task { await admin.loadCampaignAttribution(session: session) }
    }
}

private struct AdminCampaignMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.xertOffWhite)
                .minimumScaleFactor(0.75)
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(Color.xertPale.opacity(0.55))
        }
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .padding(12)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.16), lineWidth: 1))
    }
}

private struct AdminCampaignBreakdownSection: View {
    let title: String
    let items: [AdminCampaignBreakdown]
    let total: Int
    let emptyText: String

    var body: some View {
        Section(title) {
            if items.isEmpty {
                Text(emptyText).foregroundStyle(Color.xertPale.opacity(0.6))
            } else {
                ForEach(items.prefix(8)) { item in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Text(item.label).lineLimit(1)
                            Spacer()
                            Text("\(item.count)").fontWeight(.bold).monospacedDigit()
                        }
                        ProgressView(value: Double(item.count), total: Double(max(total, 1)))
                            .tint(Color.xertSteel)
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
    }
}

private struct AdminCampaignDailyChart: View {
    let days: [AdminCampaignDailyCount]
    private var maximum: Int { max(days.map(\.count).max() ?? 0, 1) }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(days.indices, id: \.self) { index in
                    let day = days[index]
                    VStack(spacing: 4) {
                        Text(day.count == 0 ? "" : "\(day.count)")
                            .font(.caption2).monospacedDigit()
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                            .frame(height: 12)
                        Rectangle()
                            .fill(Color.xertSteel)
                            .frame(width: 14, height: max(2, CGFloat(day.count) / CGFloat(maximum) * 92))
                        Text(index % 5 == 0 || index == days.count - 1 ? String(day.dateKey.suffix(5)) : "")
                            .font(.system(size: 8))
                            .foregroundStyle(Color.xertPale.opacity(0.45))
                            .frame(width: 24)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(day.dateKey), \(day.count) signups")
                }
            }
            .frame(minHeight: 125, alignment: .bottom)
            .padding(.vertical, 6)
        }
    }
}

private struct AdminCampaignCSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }
    let csv: String

    init(csv: String) { self.csv = csv }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents,
              let value = String(data: data, encoding: .utf8) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        csv = value
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(csv.utf8))
    }
}

private struct AdminLeadsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var pipeline = AdminLeadPipeline.members
    @State private var query = ""
    @State private var status = "all"
    @State private var selectedLead: AdminLead?
    @State private var selectedIDs: Set<AdminLeadIdentifier> = []
    @State private var bulkStatus = ""

    private var leads: [AdminLead] { admin.leads(for: pipeline) }
    private var filteredLeads: [AdminLead] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return leads.filter { lead in
            (status == "all" || lead.effectiveStatus == status)
                && (needle.isEmpty || lead.searchableText.contains(needle))
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Lead pipeline", selection: $pipeline) {
                    ForEach(AdminLeadPipeline.allCases) { option in
                        Text(option.shortLabel).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                Picker("Status", selection: $status) {
                    Text("All statuses").tag("all")
                    ForEach(pipeline.statuses, id: \.self) { value in
                        Text(statusLabel(value)).tag(value)
                    }
                }
                .pickerStyle(.menu)
                .tint(Color.xertSteel)
            }
            .listRowBackground(Color.xertInk)

            if !selectedIDs.isEmpty {
                Section("Bulk update") {
                    HStack {
                        Text("\(selectedIDs.count) selected")
                        Spacer()
                        Button("Clear") { selectedIDs = [] }
                    }
                    Picker("Move selected to", selection: $bulkStatus) {
                        Text("Choose status").tag("")
                        ForEach(pipeline.statuses, id: \.self) { value in
                            Text(statusLabel(value)).tag(value)
                        }
                    }
                    Button {
                        let ids = selectedIDs
                        Task {
                            if await admin.bulkUpdateLeads(session: session, pipeline: pipeline, ids: ids, status: bulkStatus) {
                                selectedIDs = []
                                bulkStatus = ""
                            }
                        }
                    } label: {
                        Label(admin.savingLeadIDs.isEmpty ? "Apply bulk status" : "Updating leads...", systemImage: "person.2.badge.gearshape")
                    }
                    .disabled(bulkStatus.isEmpty || !admin.savingLeadIDs.isEmpty)
                }
                .listRowBackground(Color.xertInk)
            }

            Section(pipeline.title) {
                if admin.loadingLeadPipeline == pipeline && leads.isEmpty {
                    HStack { ProgressView(); Text("Loading pipeline...") }
                        .listRowBackground(Color.xertInk)
                } else if filteredLeads.isEmpty {
                    AdminEmptyState(icon: "person.crop.circle.badge.questionmark", text: leads.isEmpty ? "No leads yet." : "No matching leads.")
                        .listRowBackground(Color.xertInk)
                }

                ForEach(filteredLeads) { lead in
                    HStack(spacing: 12) {
                        Button { toggleSelection(lead.id) } label: {
                            Image(systemName: selectedIDs.contains(lead.id) ? "checkmark.circle.fill" : "circle")
                                .font(.title3).foregroundStyle(Color.xertSteel)
                        }
                        .buttonStyle(.plain)
                        .disabled(selectedIDs.count >= 100 && !selectedIDs.contains(lead.id))
                        .accessibilityLabel(selectedIDs.contains(lead.id) ? "Deselect \(lead.displayName)" : "Select \(lead.displayName)")

                        Button { selectedLead = lead } label: {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(lead.displayName).font(.headline)
                                    Text([lead.email, lead.phone].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.62))
                                    if let goals = lead.main_training_goals, !goals.isEmpty {
                                        Text(goals.prefix(3).joined(separator: ", "))
                                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.5)).lineLimit(1)
                                    }
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 5) {
                                    Text(statusLabel(lead.effectiveStatus).uppercased())
                                        .font(.caption2.weight(.bold)).foregroundStyle(leadStatusColour(lead.effectiveStatus))
                                    Text(lead.created_at.formatted(date: .abbreviated, time: .omitted))
                                        .font(.caption2).foregroundStyle(Color.xertPale.opacity(0.42))
                                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Color.xertSteel)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .padding(.vertical, 5)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Lead Pipelines")
        .searchable(text: $query, prompt: "Name, email, phone or source")
        .refreshable { await admin.loadLeads(session: session, pipeline: pipeline, force: true) }
        .task { await admin.loadLeads(session: session, pipeline: pipeline) }
        .onChange(of: pipeline) { newPipeline in
            query = ""
            status = "all"
            selectedIDs = []
            bulkStatus = ""
            selectedLead = nil
            Task { await admin.loadLeads(session: session, pipeline: newPipeline) }
        }
        .sheet(item: $selectedLead) { lead in
            NavigationStack {
                AdminLeadDetailView(admin: admin, session: session, pipeline: pipeline, lead: lead)
            }
        }
    }

    private func toggleSelection(_ id: AdminLeadIdentifier) {
        if selectedIDs.contains(id) { selectedIDs.remove(id) }
        else if selectedIDs.count < 100 { selectedIDs.insert(id) }
    }

    private func statusLabel(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func leadStatusColour(_ value: String) -> Color {
        switch value {
        case "new", "hot": return .orange
        case "joined", "hired", "approved", "booked_trial": return .green
        case "not_suitable", "archived": return Color.xertPale.opacity(0.45)
        default: return Color.xertSteel
        }
    }
}

private struct AdminLeadDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let pipeline: AdminLeadPipeline
    let lead: AdminLead
    @State private var status: String
    @State private var notes: String

    init(admin: AdminStore, session: AuthSession, pipeline: AdminLeadPipeline, lead: AdminLead) {
        self.admin = admin
        self.session = session
        self.pipeline = pipeline
        self.lead = lead
        _status = State(initialValue: lead.effectiveStatus)
        _notes = State(initialValue: lead.admin_notes ?? "")
    }

    private var isSaving: Bool { admin.savingLeadIDs.contains(lead.id) }

    var body: some View {
        List {
            Section("Contact") {
                detailRow("Name", lead.displayName)
                if let email = nonBlank(lead.email), let url = URL(string: "mailto:\(email)") {
                    Link(destination: url) { Label(email, systemImage: "envelope") }
                }
                if let phone = nonBlank(lead.phone), let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(destination: url) { Label(phone, systemImage: "phone") }
                }
                detailRow("Submitted", lead.created_at.formatted(date: .abbreviated, time: .shortened))
            }

            Section("Application") {
                optionalRow("Business", lead.business_name)
                optionalRow("Suburb", lead.suburb_town)
                optionalRow("Training level", lead.current_training_level)
                optionalList("Goals", lead.main_training_goals)
                optionalList("Preferred times", lead.preferred_training_times)
                optionalRow("Qualifications", lead.qualifications)
                optionalRow("Experience", lead.years_experience)
                optionalRow("Functional training", lead.functional_training_experience)
                optionalList("Specialties", lead.specialties)
                optionalRow("Profession", lead.profession)
                optionalList("Services", lead.services_offered)
                optionalRow("Introduction", lead.short_intro)
                if let website = nonBlank(lead.website_social_link), let url = URL(string: website), url.scheme != nil {
                    Link(destination: url) { Label("Website or social profile", systemImage: "safari") }
                }
                if let source = nonBlank(lead.utm_source) {
                    detailRow("Source", [source, lead.utm_medium, lead.utm_campaign].compactMap { nonBlank($0) }.joined(separator: " / "))
                }
            }

            Section("Pipeline") {
                Picker("Status", selection: $status) {
                    ForEach(pipeline.statuses, id: \.self) { value in
                        Text(value.replacingOccurrences(of: "_", with: " ").capitalized).tag(value)
                    }
                }
                TextEditor(text: $notes)
                    .frame(minHeight: 120)
                    .overlay(alignment: .topLeading) {
                        if notes.isEmpty {
                            Text("Internal notes").foregroundStyle(Color.xertPale.opacity(0.35)).padding(.top, 8).allowsHitTesting(false)
                        }
                    }
                Text("\(notes.count)/5,000")
                    .font(.caption2).foregroundStyle(notes.count > 5_000 ? Color.red : Color.xertPale.opacity(0.45))
                Button {
                    Task {
                        if await admin.saveLead(session: session, pipeline: pipeline, lead: lead, status: status, notes: notes) {
                            dismiss()
                        }
                    }
                } label: {
                    Label(isSaving ? "Saving..." : "Save pipeline changes", systemImage: "checkmark.circle")
                }
                .disabled(isSaving || notes.count > 5_000)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(lead.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(isSaving) } }
    }

    @ViewBuilder
    private func optionalRow(_ label: String, _ value: String?) -> some View {
        if let value = nonBlank(value) { detailRow(label, value) }
    }

    @ViewBuilder
    private func optionalList(_ label: String, _ values: [String]?) -> some View {
        if let values, !values.isEmpty { detailRow(label, values.joined(separator: ", ")) }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(Color.xertPale.opacity(0.48))
            Text(value).foregroundStyle(Color.xertOffWhite)
        }
    }

    private func nonBlank(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct AdminPTRequestsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var filter = "active"
    @State private var notesRequest: AdminPTRequest?

    private var rows: [AdminPTRequest] {
        switch filter {
        case "active": return admin.ptRequests.filter { ["requested", "reschedule_requested", "approved"].contains($0.status) }
        case "completed": return admin.ptRequests.filter { $0.status == "completed" }
        default: return admin.ptRequests
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Request filter", selection: $filter) {
                    Text("Active").tag("active")
                    Text("Completed").tag("completed")
                    Text("All").tag("all")
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.xertNavy)

            if rows.isEmpty {
                Text("No matching PT requests.")
                    .listRowBackground(Color.xertInk)
            }
            ForEach(rows) { request in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(request.displayName).font(.headline)
                            Text(request.requested_session_type)
                                .font(.caption.weight(.bold)).foregroundStyle(Color.xertSteel)
                        }
                        Spacer()
                        Text(request.status.replacingOccurrences(of: "_", with: " ").uppercased())
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(request.isPending ? Color.orange : Color.xertPale.opacity(0.65))
                    }
                    Text([request.preferred_day, request.preferred_time].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    if let goal = request.training_goal, !goal.isEmpty {
                        Text("Goal: \(goal)").font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                    }
                    HStack(spacing: 8) {
                        if let phone = request.phone, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                            Link(destination: url) { Image(systemName: "phone") }.buttonStyle(.bordered)
                        }
                        if let email = request.email, let url = URL(string: "mailto:\(email)") {
                            Link(destination: url) { Image(systemName: "envelope") }.buttonStyle(.bordered)
                        }
                        Menu {
                            if request.isPending {
                                requestAction("Approve", status: "approved", request: request)
                                requestAction("Request reschedule", status: "reschedule_requested", request: request)
                                requestAction("Decline", status: "declined", request: request)
                            }
                            if request.status == "approved" {
                                requestAction("Mark complete", status: "completed", request: request)
                                requestAction("Cancel", status: "cancelled", request: request)
                            }
                        } label: {
                            Label("Update", systemImage: "arrow.triangle.2.circlepath")
                        }
                        .buttonStyle(.borderedProminent).tint(Color.xertSteel)
                        .disabled(admin.updatingPTRequestID != nil)

                        Button { notesRequest = request } label: { Image(systemName: "note.text") }
                            .buttonStyle(.bordered)
                            .accessibilityLabel("Edit admin notes")
                    }
                    .font(.caption.weight(.bold))
                }
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 6)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("PT Requests")
        .sheet(item: $notesRequest) { request in
            AdminPTNotesEditor(request: request) { notes in
                Task {
                    _ = await admin.updatePTRequest(
                        session: session,
                        request: request,
                        status: request.status,
                        notes: notes,
                        updateNotes: true
                    )
                    notesRequest = nil
                }
            }
        }
    }

    @ViewBuilder
    private func requestAction(_ title: String, status: String, request: AdminPTRequest) -> some View {
        Button(title) {
            Task { _ = await admin.updatePTRequest(session: session, request: request, status: status) }
        }
    }
}

private struct AdminPTNotesEditor: View {
    @Environment(\.dismiss) private var dismiss
    let request: AdminPTRequest
    let onSave: (String) -> Void
    @State private var notes: String

    init(request: AdminPTRequest, onSave: @escaping (String) -> Void) {
        self.request = request
        self.onSave = onSave
        _notes = State(initialValue: request.admin_notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Private owner notes") {
                    TextEditor(text: $notes).frame(minHeight: 160)
                    Text("\(notes.count)/5000").font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle(request.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(String(notes.prefix(5_000))) }
                }
            }
        }
    }
}

private struct AdminPlatformView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var draft: AdminPlatformSettings?
    @State private var saved = false
    @State private var confirmingPaymentActivation = false

    var body: some View {
        Group {
            if draft != nil {
                Form {
                    Section("Live platform") {
                        Toggle("Bookings enabled", isOn: settingBinding(\.bookings_enabled))
                        Text("Disabling bookings changes public class actions to registration interest.")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        Toggle("Session pack payments", isOn: settingBinding(\.payments_enabled))
                        Text("Master checkout switch for pack purchases on the website and iOS app. Keep off until Stripe launch checks pass.")
                            .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        Toggle("Launch countdown", isOn: settingBinding(\.countdown_enabled))
                    }
                    Section("Public announcement") {
                        Toggle("Show announcement banner", isOn: settingBinding(\.announcement_banner_enabled))
                        TextField("Announcement text", text: announcementBinding, axis: .vertical)
                            .lineLimit(2...5)
                    }
                    Section("Launch") {
                        TextField("Target date (YYYY-MM-DD)", text: settingBinding(\.target_launch_date))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    Section {
                        Button {
                            guard let draft else { return }
                            if draft.payments_enabled && admin.settings?.payments_enabled != true {
                                confirmingPaymentActivation = true
                            } else {
                                save(draft)
                            }
                        } label: {
                            HStack {
                                Spacer()
                                if admin.isSavingSettings { ProgressView().tint(Color.xertNavy) }
                                Text(saved ? "Settings saved" : "Save live settings").fontWeight(.bold)
                                Spacer()
                            }
                        }
                        .disabled(admin.isSavingSettings || draft == admin.settings)
                        .listRowBackground(Color.xertSteel)
                        .foregroundStyle(Color.xertNavy)
                    }
                }
                .scrollContentBackground(.hidden)
            } else {
                ProgressView("Loading platform settings...").tint(Color.xertSteel)
            }
        }
        .background(Color.xertNavy)
        .navigationTitle("Platform Controls")
        .onAppear { draft = admin.settings }
        .onChange(of: admin.settings) { settings in
            if draft == nil || draft == settings { draft = settings }
        }
        .onChange(of: draft) { _ in saved = false }
        .confirmationDialog("Open session pack checkout?", isPresented: $confirmingPaymentActivation, titleVisibility: .visible) {
            Button("Enable pack checkout") {
                guard let draft else { return }
                save(draft)
            }
            Button("Keep payments paused", role: .cancel) {}
        } message: {
            Text(admin.commerceHealth?.ready == true
                ? "Stripe launch checks passed recently. XERT will run them again on the server before enabling purchases."
                : "XERT will run every Stripe launch check on the server. Payments remain paused if any check fails.")
        }
    }

    private func save(_ settings: AdminPlatformSettings) {
        Task {
            saved = await admin.saveSettings(session: session, draft: settings)
            if saved { draft = admin.settings }
        }
    }

    private func settingBinding<Value>(_ keyPath: WritableKeyPath<AdminPlatformSettings, Value>) -> Binding<Value> {
        Binding(
            get: { draft![keyPath: keyPath] },
            set: {
                guard var value = draft else { return }
                value[keyPath: keyPath] = $0
                draft = value
            }
        )
    }

    private var announcementBinding: Binding<String> {
        Binding(
            get: { draft?.announcementText ?? "" },
            set: {
                guard var value = draft else { return }
                value.announcementText = $0
                draft = value
            }
        )
    }
}

private struct AdminCommunicationsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var composing = false

    var body: some View {
        List {
            if admin.announcements.isEmpty {
                Text("No member notices yet.").listRowBackground(Color.xertInk)
            }
            ForEach(admin.announcements) { notice in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top) {
                        Text(notice.title).font(.headline)
                        Spacer()
                        Text(notice.stateLabel.uppercased())
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(notice.stateLabel == "Live" ? Color.green : Color.xertSteel)
                    }
                    Text(notice.body).font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.72)).lineLimit(4)
                    HStack {
                        Label(notice.tone.capitalized, systemImage: notice.tone == "urgent" ? "exclamationmark.triangle.fill" : "bell")
                        Spacer()
                        Text(notice.created_at.formatted(date: .abbreviated, time: .shortened))
                    }
                    .font(.caption).foregroundStyle(Color.xertPale.opacity(0.5))
                }
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 6)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Member Notices")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { composing = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New member notice")
            }
        }
        .sheet(isPresented: $composing) {
            AdminAnnouncementComposer(isPublishing: admin.isPublishingAnnouncement) { title, body, tone in
                Task {
                    if await admin.publishAnnouncement(session: session, title: title, body: body, tone: tone) {
                        composing = false
                    }
                }
            }
        }
    }
}

private struct AdminOperationsHealthView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var pendingResolution: AdminCommerceHealth.WebhookDelivery.Incident?

    var body: some View {
        List {
            Section("Release readiness") {
                HealthStatusRow(
                    title: "Database contract",
                    ready: admin.missingSchemaCapabilities.isEmpty,
                    detail: admin.missingSchemaCapabilities.isEmpty
                        ? "All \(AdminSchemaReadiness.required.count) required capabilities are installed."
                        : "\(admin.missingSchemaCapabilities.count) required database capabilities are missing."
                )
                HealthStatusRow(
                    title: "Stripe checkout",
                    ready: admin.commerceHealth?.ready == true,
                    detail: commerceDetail
                )
                HealthStatusRow(
                    title: "Member push notifications",
                    ready: admin.pushHealth?.ready == true,
                    detail: pushDetail
                )
            }

            if !admin.missingSchemaCapabilities.isEmpty {
                Section("Missing database capabilities") {
                    ForEach(admin.missingSchemaCapabilities, id: \.self) { capability in
                        Label(capability.replacingOccurrences(of: "_", with: " ").capitalized, systemImage: "exclamationmark.triangle")
                            .font(.subheadline).foregroundStyle(.orange)
                            .listRowBackground(Color.xertInk)
                    }
                }
            }
            if let commerce = admin.commerceHealth {
                Section("Stripe launch checklist") {
                    HealthValueRow(label: "Mode", value: commerce.mode?.uppercased() ?? "Unknown")
                    HealthValueRow(
                        label: "Payment switch",
                        value: commerce.payment_switch?.state.uppercased() ?? "UNKNOWN"
                    )
                    HealthCheckRow(
                        label: commerce.activation_receipt?.required == true
                            ? "Activation receipt"
                            : "Activation receipt (when enabled)",
                        ready: commerce.activation_receipt?.ready == true
                    )
                    HealthCheckRow(
                        label: "Live settings immutable",
                        ready: commerce.activation_drift_guard_ready == true
                    )
                    if let activatedAt = commerce.activation_receipt?.activated_at {
                        HealthValueRow(
                            label: "Activated",
                            value: activatedAt.formatted(date: .abbreviated, time: .shortened)
                        )
                    }
                    HealthCheckRow(label: "Business verification", ready: commerce.account?.details_submitted == true)
                    HealthCheckRow(label: "Charges enabled", ready: commerce.account?.charges_enabled == true)
                    HealthCheckRow(label: "Payouts enabled", ready: commerce.account?.payouts_enabled == true)
                    HealthCheckRow(
                        label: "Active packs linked",
                        ready: commerce.active_product_count > 0 && commerce.stripe_price_count == commerce.active_product_count
                    )
                    HealthCheckRow(label: "Webhook registered", ready: commerce.webhook?.ready == true)
                    HealthCheckRow(label: "Webhook delivery ledger", ready: commerce.webhook_delivery?.ready == true)
                    HealthCheckRow(label: "Refund reconciliation", ready: commerce.refund_reconciliation_ready == true)
                    HealthCheckRow(label: "Checkout recovery", ready: commerce.checkout_reconciliation_ready == true)
                    if let delivery = commerce.webhook_delivery {
                        HealthCountRow(label: "Deliveries received (24h)", value: delivery.received)
                        HealthCountRow(label: "Delivery retries (24h)", value: delivery.retries)
                        HealthCountRow(label: "Failed or stalled", value: delivery.failed + delivery.stale_processing)
                    }
                }

                if let incidents = commerce.webhook_delivery?.incidents, !incidents.isEmpty {
                    Section("Unresolved Stripe incidents") {
                        ForEach(incidents) { incident in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(incident.status.uppercased())
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(.red)
                                    Text(incident.event_type)
                                        .font(.caption)
                                        .foregroundStyle(Color.xertPale.opacity(0.7))
                                        .lineLimit(2)
                                    Spacer()
                                    Button {
                                        UIPasteboard.general.string = incident.event_id
                                    } label: {
                                        Image(systemName: "doc.on.doc")
                                            .frame(width: 44, height: 44)
                                    }
                                    .buttonStyle(.plain)
                                    .foregroundStyle(Color.xertSteel)
                                    .accessibilityLabel("Copy Stripe Event ID")
                                }
                                Text(incident.event_id)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(Color.xertPale.opacity(0.55))
                                    .textSelection(.enabled)
                                if let orderID = incident.order_id {
                                    Text("Order \(orderID.uuidString.lowercased())")
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(Color.xertPale.opacity(0.45))
                                        .textSelection(.enabled)
                                }
                                HStack(spacing: 12) {
                                    Text("\(incident.attempts) attempt\(incident.attempts == 1 ? "" : "s")")
                                    if let code = incident.error_code { Text(code) }
                                    if let received = incident.last_received_at {
                                        Text(received.formatted(date: .abbreviated, time: .shortened))
                                    }
                                }
                                .font(.caption2)
                                .foregroundStyle(Color.xertPale.opacity(0.45))
                                if let resolution = incident.resolution {
                                    Label(resolution, systemImage: "person.crop.circle.badge.exclamationmark")
                                        .font(.caption)
                                        .foregroundStyle(Color.orange)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Button {
                                        pendingResolution = incident
                                    } label: {
                                        Label("Mark handled", systemImage: "checkmark.seal")
                                    }
                                    .disabled(admin.resolvingStripeIncidentID != nil)
                                }
                            }
                            .padding(.vertical, 4)
                            .listRowBackground(Color.xertInk)
                        }
                    }
                }

                if let issues = commerce.issues, !issues.isEmpty {
                    Section("Stripe actions required") {
                        ForEach(Array(issues.enumerated()), id: \.offset) { _, issue in
                            Label(issue.reason, systemImage: "exclamationmark.triangle")
                                .font(.subheadline)
                                .foregroundStyle(Color.orange)
                                .listRowBackground(Color.xertInk)
                        }
                    }
                }
            }
            if let push = admin.pushHealth {
                Section("APNs activity (24 hours)") {
                    HealthCountRow(label: "Production devices", value: push.subscriptions.production)
                    HealthCountRow(label: "Delivered", value: push.deliveries_24h.delivered)
                    HealthCountRow(label: "Failed", value: push.deliveries_24h.failed + push.deliveries_24h.invalid_token)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Operations Health")
        .confirmationDialog(
            "Mark Stripe incident handled?",
            isPresented: Binding(
                get: { pendingResolution != nil },
                set: { if !$0 { pendingResolution = nil } }
            ),
            presenting: pendingResolution
        ) { incident in
            Button("Mark handled") {
                Task { _ = await admin.resolveStripeReview(session: session, incident: incident) }
            }
            Button("Keep unresolved", role: .cancel) {}
        } message: { incident in
            Text("Confirm that \(incident.event_type) has been reviewed and any required member credit action is complete. Stripe and order records remain unchanged.")
        }
    }

    private var commerceDetail: String {
        guard let health = admin.commerceHealth else { return "Commerce health is unavailable." }
        if !health.environment.missing.isEmpty {
            return "Missing: \(health.environment.missing.joined(separator: ", "))."
        }
        let mode = health.mode?.uppercased() ?? "UNKNOWN"
        let payout = health.account?.payouts_enabled == true ? "payouts ready" : "payouts need attention"
        return "\(mode): \(health.active_product_count) active packs; \(health.stripe_price_count) Stripe-linked, \(health.dynamic_price_count) dynamic; \(payout)."
    }

    private var pushDetail: String {
        guard let health = admin.pushHealth else { return "Push health is unavailable." }
        if !health.environment.missing.isEmpty {
            return "Missing: \(health.environment.missing.joined(separator: ", "))."
        }
        return "\(health.subscriptions.production) production device\(health.subscriptions.production == 1 ? "" : "s") registered."
    }
}

private struct HealthStatusRow: View {
    let title: String
    let ready: Bool
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: ready ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(ready ? Color.green : Color.orange)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline).foregroundStyle(Color.xertOffWhite)
                Text(detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.62))
            }
        }
        .listRowBackground(Color.xertInk)
    }
}

private struct HealthCheckRow: View {
    let label: String
    let ready: Bool

    var body: some View {
        HStack {
            Text(label).foregroundStyle(Color.xertPale)
            Spacer()
            Image(systemName: ready ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(ready ? Color.green : Color.orange)
                .accessibilityLabel(ready ? "Ready" : "Needs attention")
        }
        .listRowBackground(Color.xertInk)
    }
}

private struct HealthValueRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label).foregroundStyle(Color.xertPale)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.xertSteel)
        }
        .listRowBackground(Color.xertInk)
    }
}

private struct HealthCountRow: View {
    let label: String
    let value: Int

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value.formatted()).fontWeight(.bold)
        }
        .foregroundStyle(Color.xertOffWhite)
        .listRowBackground(Color.xertInk)
    }
}

private struct AdminAuditView: View {
    @ObservedObject var admin: AdminStore
    @State private var query = ""
    @State private var category = "All"

    private var categories: [String] {
        ["All"] + Set(admin.auditEntries.map(\.category)).sorted()
    }

    private var rows: [AdminAuditEntry] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return admin.auditEntries.filter { entry in
            (category == "All" || entry.category == category)
                && (term.isEmpty || "\(entry.title) \(entry.detail) \(entry.category)".lowercased().contains(term))
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Audit category", selection: $category) {
                    ForEach(categories, id: \.self) { Text($0).tag($0) }
                }
            }
            .listRowBackground(Color.xertNavy)

            if rows.isEmpty { Text("No matching administrative actions.").listRowBackground(Color.xertInk) }
            ForEach(rows) { entry in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: auditIcon(entry.category))
                        .frame(width: 24).foregroundStyle(Color.xertSteel)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(entry.title).font(.headline)
                            Spacer()
                            Text(entry.category.uppercased())
                                .font(.caption2.weight(.bold)).foregroundStyle(Color.xertSteel)
                        }
                        Text(entry.detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.62))
                        Text(entry.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption2).foregroundStyle(Color.xertPale.opacity(0.4))
                    }
                }
                .foregroundStyle(Color.xertOffWhite)
                .padding(.vertical, 5)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Admin Audit")
        .searchable(text: $query, prompt: "Search changes")
    }

    private func auditIcon(_ category: String) -> String {
        switch category {
        case "Access": return "person.badge.key"
        case "Credits": return "ticket"
        case "Bookings", "Requests": return "calendar.badge.clock"
        case "Notices": return "bell"
        case "Content": return "square.and.pencil"
        case "Schedule": return "calendar"
        default: return "clock.arrow.circlepath"
        }
    }
}

private struct AdminProductsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession

    private var activeProducts: [AdminProduct] { admin.products.filter(\.active) }
    private var liveBlockedProducts: [AdminProduct] { activeProducts.filter { !$0.hasStableStripePriceID } }
    private var isLiveReady: Bool { !activeProducts.isEmpty && liveBlockedProducts.isEmpty }

    var body: some View {
        List {
            Section {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: isLiveReady ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundStyle(isLiveReady ? Color.green : Color.orange)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("LIVE STRIPE READINESS").font(.caption.weight(.bold))
                        if activeProducts.isEmpty {
                            Text("Activate at least one pack and attach its live Stripe Price ID before launch.")
                        } else if isLiveReady {
                            Text("All \(activeProducts.count) active packs have stable Stripe Price IDs.")
                        } else {
                            Text("\(liveBlockedProducts.count) of \(activeProducts.count) active packs block live checkout: \(liveBlockedProducts.map(\.slug).joined(separator: ", ")).")
                            Text("Test checkout may use dynamic prices. Live checkout requires a live price_ ID.")
                                .foregroundStyle(Color.xertPale.opacity(0.5))
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.75))
                }
                .padding(.vertical, 5)
                .listRowBackground(Color.xertInk)
            }
            if admin.products.isEmpty { Text("No session packs configured.").listRowBackground(Color.xertInk) }
            ForEach(admin.products) { product in
                NavigationLink {
                    AdminProductEditor(admin: admin, session: session, product: product)
                } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(product.name).font(.headline)
                                if product.featured {
                                    Text("FEATURED").font(.caption2.weight(.bold)).foregroundStyle(.orange)
                                }
                            }
                            Text("\(product.sessions_count) sessions · \(product.validity_days) days · \(product.displayPrice)")
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(product.active ? "LIVE" : "OFF")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(product.active ? Color.green : Color.xertPale.opacity(0.4))
                            if product.active {
                                Label(product.hasStableStripePriceID ? "Stripe linked" : "Live blocked",
                                      systemImage: product.hasStableStripePriceID ? "checkmark.circle" : "exclamationmark.triangle")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(product.hasStableStripePriceID ? Color.green : Color.orange)
                            }
                        }
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .padding(.vertical, 6)
                }
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Session Packs")
    }
}

private struct AdminProductEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let product: AdminProduct
    @State private var draft: AdminProductDraft

    init(admin: AdminStore, session: AuthSession, product: AdminProduct) {
        self.admin = admin
        self.session = session
        self.product = product
        _draft = State(initialValue: AdminProductDraft(product: product))
    }

    private var normalizedStripePriceID: String {
        draft.stripePriceID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var stripePriceIDIsValid: Bool {
        normalizedStripePriceID.isEmpty || normalizedStripePriceID.range(of: #"^price_[A-Za-z0-9]+$"#, options: .regularExpression) != nil
    }

    var body: some View {
        Form {
            Section("Pack details") {
                TextField("Name", text: $draft.name)
                TextField("Description", text: $draft.description, axis: .vertical).lineLimit(2...5)
                TextField("Price", text: $draft.price).keyboardType(.decimalPad)
                TextField("Currency", text: $draft.currency)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
            }
            Section("Credits") {
                Stepper("Sessions: \(draft.sessions)", value: $draft.sessions, in: 1...1_000)
                Stepper("Validity: \(draft.validityDays) days", value: $draft.validityDays, in: 1...3_650)
                Stepper("Display order: \(draft.sortOrder)", value: $draft.sortOrder, in: 0...10_000)
            }
            Section("Sale state") {
                Toggle("Active and purchasable", isOn: $draft.active)
                Toggle("Featured pack", isOn: $draft.featured)
                TextField("Stripe Price ID (required for live checkout)", text: $draft.stripePriceID)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                if draft.active && normalizedStripePriceID.isEmpty {
                    Label("This active pack blocks live Stripe checkout.", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption).foregroundStyle(.orange)
                } else if !stripePriceIDIsValid {
                    Label("Use a Stripe Price ID beginning with price_.", systemImage: "xmark.circle.fill")
                        .font(.caption).foregroundStyle(.red)
                } else if !normalizedStripePriceID.isEmpty {
                    Label("Stable Stripe price linked.", systemImage: "checkmark.circle.fill")
                        .font(.caption).foregroundStyle(.green)
                }
                if product.stripe_price_id != nil {
                    Text("Replace or clear the Stripe Price ID before changing price or currency.")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
            Section {
                Button {
                    Task {
                        if await admin.saveProduct(session: session, product: product, draft: draft) {
                            dismiss()
                        }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if admin.savingProductID == product.id { ProgressView().tint(Color.xertNavy) }
                        Text("Save session pack").fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(admin.savingProductID != nil || draft == AdminProductDraft(product: product) || !stripePriceIDIsValid)
                .listRowBackground(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(product.slug)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct AdminEventsView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var query = ""
    @State private var showingCreate = false
    @State private var rosterEvent: AdminEvent?
    @State private var pendingDelete: AdminEvent?

    private var rows: [AdminEvent] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return admin.events }
        return admin.events.filter {
            "\($0.name) \($0.category ?? "") \($0.location ?? "")".lowercased().contains(term)
        }
    }

    var body: some View {
        List {
            if rows.isEmpty { Text("No matching calendar events.").listRowBackground(Color.xertInk) }
            ForEach(rows) { event in
                VStack(alignment: .leading, spacing: 10) {
                    NavigationLink {
                        AdminEventEditor(admin: admin, session: session, event: event)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(event.name).font(.headline)
                                Spacer()
                                Text(event.published ? "LIVE" : "HIDDEN")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(event.published ? Color.green : Color.xertPale.opacity(0.45))
                            }
                            Text([event.event_date ?? "Date TBC", event.location].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                        }
                        .foregroundStyle(Color.xertOffWhite)
                    }
                    HStack(spacing: 18) {
                        Button {
                            rosterEvent = event
                            Task { await admin.loadEventRoster(session: session, eventID: event.id) }
                        } label: {
                            Label("\(admin.eventGoalCounts[event.id, default: 0]) training", systemImage: "person.3")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.xertSteel)

                        Spacer()
                        Button(role: .destructive) { pendingDelete = event } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.plain)
                        .disabled(admin.deletingEventID != nil)
                        .accessibilityLabel("Delete \(event.name)")
                    }
                    .font(.caption.weight(.semibold))
                }
                .padding(.vertical, 6)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Event Calendar")
        .searchable(text: $query, prompt: "Search events")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add event")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack {
                AdminEventEditor(admin: admin, session: session, event: nil)
            }
        }
        .sheet(item: $rosterEvent) { event in
            AdminEventRosterView(admin: admin, event: event)
        }
        .confirmationDialog(
            "Delete calendar event?",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            presenting: pendingDelete
        ) { event in
            Button("Delete \(event.name)", role: .destructive) {
                Task {
                    _ = await admin.deleteEvent(session: session, event: event)
                    pendingDelete = nil
                }
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: { event in
            let count = admin.eventGoalCounts[event.id, default: 0]
            Text(count > 0
                 ? "This also removes \(count) member training goal\(count == 1 ? "" : "s"). This cannot be undone."
                 : "This removes the event from the shared web and iOS calendar. This cannot be undone.")
        }
    }
}

private struct AdminEventEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let event: AdminEvent?
    private let baseline: AdminEventDraft
    @State private var draft: AdminEventDraft

    init(admin: AdminStore, session: AuthSession, event: AdminEvent?) {
        let initialDraft = AdminEventDraft(event: event)
        self.admin = admin
        self.session = session
        self.event = event
        baseline = initialDraft
        _draft = State(initialValue: initialDraft)
    }

    var body: some View {
        Form {
            Section("Event") {
                TextField("Event name", text: $draft.name)
                Picker("Category", selection: $draft.category) {
                    ForEach(AdminEventDraft.categories, id: \.self) { Text($0.capitalized).tag($0) }
                }
                Toggle("Start date confirmed", isOn: $draft.hasStartDate)
                if draft.hasStartDate {
                    DatePicker("Start date", selection: $draft.startDate, displayedComponents: .date)
                }
                Toggle("Multi-day event", isOn: $draft.hasEndDate)
                    .disabled(!draft.hasStartDate)
                if draft.hasStartDate && draft.hasEndDate {
                    DatePicker("End date", selection: $draft.endDate, in: draft.startDate..., displayedComponents: .date)
                }
            }
            Section("Location and link") {
                TextField("Location", text: $draft.location)
                TextField("Region", text: $draft.region)
                TextField("Official website", text: $draft.url)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Section("Publishing") {
                Toggle("Published on web and iOS", isOn: $draft.published)
                Stepper("Display order: \(draft.sortOrder)", value: $draft.sortOrder, in: 0...10_000)
            }
            Section {
                Button {
                    Task {
                        if await admin.saveEvent(session: session, event: event, draft: draft) { dismiss() }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if admin.savingEventID != nil { ProgressView().tint(Color.xertNavy) }
                        Text(event == nil ? "Create event" : "Save event").fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(admin.savingEventID != nil || draft == baseline)
                .listRowBackground(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(event == nil ? "New Event" : "Edit Event")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if event == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .onChange(of: draft.hasStartDate) { enabled in
            if !enabled { draft.hasEndDate = false }
        }
    }
}

private struct AdminEventRosterView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let event: AdminEvent

    var body: some View {
        NavigationStack {
            List {
                if admin.loadingEventRosterID == event.id {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if admin.eventRoster.isEmpty {
                    Text("No members are training toward this event yet.")
                } else {
                    ForEach(admin.eventRoster) { member in
                        VStack(alignment: .leading, spacing: 7) {
                            Text(member.displayName).font(.headline)
                            if let email = nonempty(member.email) {
                                Link(email, destination: URL(string: "mailto:\(email)")!)
                            }
                            if let phone = nonempty(member.phone),
                               let number = phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                               let url = URL(string: "tel:\(number)") {
                                Link(phone, destination: url)
                            }
                            Text("Joined \(member.selected_at.formatted(date: .abbreviated, time: .omitted))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle(event.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private func nonempty(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct AdminCoachesView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var showingCreate = false
    @State private var pendingDelete: AdminCoach?

    var body: some View {
        List {
            if admin.coaches.isEmpty { Text("No team profiles configured.").listRowBackground(Color.xertInk) }
            ForEach(admin.coaches) { coach in
                HStack(alignment: .top, spacing: 12) {
                    AsyncImage(url: URL(string: coach.photo_url ?? "")) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Image(systemName: "person.crop.square").foregroundStyle(Color.xertSteel)
                    }
                    .frame(width: 52, height: 60)
                    .background(Color.xertNavy)
                    .clipped()

                    VStack(alignment: .leading, spacing: 5) {
                        NavigationLink {
                            AdminCoachEditor(admin: admin, session: session, coach: coach)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(coach.name).font(.headline)
                                Text([coach.role, coach.experience].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(Color.xertPale.opacity(0.6))
                            }
                        }
                        HStack {
                            Text(coach.category.uppercased()).foregroundStyle(Color.xertSteel)
                            Text(coach.published ? "LIVE" : "HIDDEN")
                                .foregroundStyle(coach.published ? Color.green : Color.xertPale.opacity(0.45))
                            Spacer()
                            Button(role: .destructive) { pendingDelete = coach } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.plain)
                            .disabled(admin.deletingCoachID != nil)
                            .accessibilityLabel("Delete \(coach.name)")
                        }
                        .font(.caption2.weight(.bold))
                    }
                    .foregroundStyle(Color.xertOffWhite)
                }
                .padding(.vertical, 5)
                .listRowBackground(Color.xertInk)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("XERT Team")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add team member")
            }
        }
        .sheet(isPresented: $showingCreate) {
            NavigationStack { AdminCoachEditor(admin: admin, session: session, coach: nil) }
        }
        .confirmationDialog(
            "Delete team member?",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            presenting: pendingDelete
        ) { coach in
            Button("Delete \(coach.name)", role: .destructive) {
                Task {
                    _ = await admin.deleteCoach(session: session, coach: coach)
                    pendingDelete = nil
                }
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: { coach in
            Text("\(coach.name) will be removed from the public team page. This cannot be undone.")
        }
    }
}

private struct AdminCoachEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let coach: AdminCoach?
    private let baseline: AdminCoachDraft
    @State private var draft: AdminCoachDraft

    init(admin: AdminStore, session: AuthSession, coach: AdminCoach?) {
        let initialDraft = AdminCoachDraft(coach: coach)
        self.admin = admin
        self.session = session
        self.coach = coach
        baseline = initialDraft
        _draft = State(initialValue: initialDraft)
    }

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Name", text: $draft.name)
                Picker("Category", selection: $draft.category) {
                    Text("Coach").tag("coach")
                    Text("Nutritionist").tag("nutritionist")
                    Text("Massage therapist").tag("massage")
                    Text("Physiotherapist").tag("physio")
                }
                TextField("Role", text: $draft.role)
                TextField("Biography", text: $draft.bio, axis: .vertical).lineLimit(3...8)
                TextField("Experience", text: $draft.experience)
                TextField("Currently training for", text: $draft.currentlyTrainingFor)
            }
            Section("Media") {
                TextField("Photo URL", text: $draft.photoURL)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                if let url = URL(string: draft.photoURL), !draft.photoURL.isEmpty {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: { ProgressView() }
                    .frame(height: 180).frame(maxWidth: .infinity).clipped()
                }
                TextField("Social link", text: $draft.socialURL)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Section("Publishing") {
                Toggle("Published on the website", isOn: $draft.published)
                Stepper("Display order: \(draft.sortOrder)", value: $draft.sortOrder, in: 0...10_000)
            }
            Section {
                Button {
                    Task {
                        if await admin.saveCoach(session: session, coach: coach, draft: draft) { dismiss() }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if admin.savingCoachID != nil { ProgressView().tint(Color.xertNavy) }
                        Text(coach == nil ? "Create profile" : "Save profile").fontWeight(.bold)
                        Spacer()
                    }
                }
                .disabled(admin.savingCoachID != nil || draft == baseline)
                .listRowBackground(Color.xertSteel)
                .foregroundStyle(Color.xertNavy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(coach == nil ? "New Team Member" : "Edit Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if coach == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}

private struct AdminAnnouncementComposer: View {
    @Environment(\.dismiss) private var dismiss
    let isPublishing: Bool
    let onPublish: (String, String, String) -> Void
    @State private var title = ""
    @State private var noticeBody = ""
    @State private var tone = "info"
    @State private var confirming = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Member notice") {
                    TextField("Title", text: $title)
                    TextEditor(text: $noticeBody).frame(minHeight: 180)
                    Text("\(noticeBody.count)/2000").font(.caption).foregroundStyle(.secondary)
                    Picker("Priority", selection: $tone) {
                        Text("Information").tag("info")
                        Text("Action requested").tag("action")
                        Text("Urgent").tag("urgent")
                    }
                }
                Section {
                    Text("Publishing makes this visible immediately in member accounts and requests Apple push delivery for enabled devices.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Notice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(isPublishing) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isPublishing ? "Publishing..." : "Publish") { confirming = true }
                        .disabled(isPublishing || title.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || noticeBody.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
                }
            }
            .confirmationDialog("Publish this member notice now?", isPresented: $confirming, titleVisibility: .visible) {
                Button("Publish to members") { onPublish(title, String(noticeBody.prefix(2_000)), tone) }
                Button("Keep editing", role: .cancel) {}
            } message: {
                Text("The notice becomes live on the website and iOS app, and push delivery starts immediately.")
            }
        }
    }
}

private struct AdminMetricTile: View {
    let title: String
    let value: Int
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon).foregroundStyle(Color.xertSteel)
            Text(value.formatted()).xertDisplay(30).foregroundStyle(Color.xertOffWhite)
            Text(title.uppercased()).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Color.xertPale.opacity(0.55))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.16), lineWidth: 1))
    }
}

private struct AdminMoneyTile: View {
    let title: String
    let cents: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "dollarsign.circle").foregroundStyle(Color.xertSteel)
            Text((Double(cents) / 100).formatted(.currency(code: "AUD")))
                .font(.title3.weight(.bold)).foregroundStyle(Color.xertOffWhite).lineLimit(1).minimumScaleFactor(0.7)
            Text(title.uppercased()).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Color.xertPale.opacity(0.55))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.16), lineWidth: 1))
    }
}

private struct FinanceSummaryRow: View {
    let label: String
    let cents: Int

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text((Double(cents) / 100).formatted(.currency(code: "AUD"))).fontWeight(.bold)
        }
        .foregroundStyle(Color.xertOffWhite)
        .listRowBackground(Color.xertInk)
    }
}

private struct AdminDestinationRow<Destination: View>: View {
    let title: String
    let detail: String
    let icon: String
    let destination: Destination

    init(title: String, detail: String, icon: String, @ViewBuilder destination: () -> Destination) {
        self.title = title
        self.detail = detail
        self.icon = icon
        self.destination = destination()
    }

    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 14) {
                Image(systemName: icon).frame(width: 26).foregroundStyle(Color.xertSteel)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline).foregroundStyle(Color.xertOffWhite)
                    Text(detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Color.xertSteel)
            }
            .padding(15)
            .background(Color.xertInk)
            .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.16), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct AdminEmptyState: View {
    let icon: String
    let text: String

    var body: some View {
        Label(text, systemImage: icon)
            .font(.subheadline)
            .foregroundStyle(Color.xertPale.opacity(0.65))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.xertInk)
            .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.16), lineWidth: 1))
    }
}

private func adminHeading(_ title: String) -> some View {
    Text(title.uppercased())
        .font(.caption.weight(.bold))
        .tracking(1.8)
        .foregroundStyle(Color.xertSteel)
}
