import SwiftUI

// FitBox in the owner app: what FitBox last told XERT about members,
// memberships and bookings, plus a live lookup and a one-tap sync. All
// FitBox calls go through the XERT gateway; no Zapier credential is on device.
struct AdminFitboxView: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    @State private var lookupEmail = ""
    @State private var syncOutcome: String?
    @State private var memberFilter = ""

    private var overview: AdminFitboxOverview? { admin.fitboxOverview }
    private var gatewayReady: Bool { overview?.gateway.ready == true }
    private var mirrorInstalled: Bool { overview?.mirror_installed == true }

    private var filteredUsers: [AdminFitboxUser] {
        let term = memberFilter.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return Array(admin.fitboxUsers.prefix(60)) }
        return admin.fitboxUsers.filter { user in
            user.displayName.lowercased().contains(term)
                || (user.email ?? "").lowercased().contains(term)
                || user.fitbox_user_id.contains(term)
        }
    }

    var body: some View {
        List {
            connectionSection
            if let message = admin.fitboxWorkspaceStatusMessage {
                Section {
                    Label(message, systemImage: "exclamationmark.triangle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                        .listRowBackground(Color.xertInk)
                }
            }
            if let summary = overview?.summary {
                Section("At a glance") {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        fitboxMetric("Active members", "\(summary.users.active)")
                        fitboxMetric("Prospects", "\(summary.users.prospects)")
                        fitboxMetric("Active memberships", "\(summary.subscriptions.active)")
                        fitboxMetric("Upcoming bookings", "\(summary.attendance.upcoming)")
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
            }
            lookupSection
            membersSection
            membershipsSection
            bookingsSection
            reviewSection
            syncHistorySection
        }
        .scrollContentBackground(.hidden)
        .xertOwnerScreen()
        .navigationTitle("FitBox")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await admin.loadFitboxWorkspace(session: session) }
                } label: {
                    if admin.isLoadingFitboxWorkspace {
                        ProgressView().tint(Color.xertSteel)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(admin.isLoadingFitboxWorkspace)
                .accessibilityLabel("Refresh FitBox")
            }
        }
        .task { await admin.loadFitboxWorkspace(session: session) }
        .refreshable { await admin.loadFitboxWorkspace(session: session) }
    }

    // MARK: - Sections

    private var connectionSection: some View {
        Section {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: gatewayReady ? "bolt.circle.fill" : "bolt.slash.circle")
                    .font(.title2)
                    .foregroundStyle(gatewayReady ? Color.green : Color.orange)
                VStack(alignment: .leading, spacing: 4) {
                    Text(gatewayReady ? "Live gateway connected" : "Live gateway not connected")
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text(connectionDetail)
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.7))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 4)
            .listRowBackground(Color.xertInk)

            Button {
                Task { syncOutcome = await admin.syncFitbox(session: session) }
            } label: {
                Label(
                    admin.isSyncingFitbox
                        ? "Syncing \(admin.fitboxSyncProgress?.replacingOccurrences(of: "_", with: " ") ?? "")…"
                        : "Sync everything now",
                    systemImage: "arrow.triangle.2.circlepath"
                )
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.xertPrimary)
            .disabled(!gatewayReady || !mirrorInstalled || admin.isSyncingFitbox || overview?.gateway.feedsAvailable != true)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            if gatewayReady, overview?.gateway.feedsAvailable != true {
                Text("This Zapier server is in actions-only mode: lookups and prospect registration work, bulk feeds do not.")
                    .font(.caption)
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }

            if let syncOutcome {
                Text(syncOutcome)
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.xertInk)
            }
        } header: {
            XertOwnerHeading("Connection")
        }
    }

    private var connectionDetail: String {
        guard let overview else { return "Checking the FitBox connection…" }
        if !overview.mirror_installed {
            return "FitBox mirror tables are not installed. Apply the live-mirror migration in Supabase, then sync."
        }
        if overview.gateway.mode == "unreachable" {
            return "Zapier rejected the configured server URL. Regenerate it in Zapier and update Vercel."
        }
        if overview.gateway.ready {
            if let last = overview.last_completed_sync {
                return "Gym \(overview.gym_id ?? "—"). Last full sync \(last.formatted(date: .abbreviated, time: .shortened))."
            }
            return "Gym \(overview.gym_id ?? "—"). Nothing synced yet."
        }
        return "Add the Zapier MCP server URL in Vercel to sync and look up FitBox from here. Missing: \(overview.gateway.missing.joined(separator: ", "))."
    }

    private var lookupSection: some View {
        Section {
            HStack(spacing: 10) {
                TextField("Member email", text: $lookupEmail)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit { Task { await admin.lookupFitbox(session: session, email: lookupEmail) } }
                Button {
                    Task { await admin.lookupFitbox(session: session, email: lookupEmail) }
                } label: {
                    if admin.isLookingUpFitbox {
                        ProgressView().tint(Color.xertSteel)
                    } else {
                        Image(systemName: "magnifyingglass")
                    }
                }
                .disabled(!gatewayReady || admin.isLookingUpFitbox || lookupEmail.trimmingCharacters(in: .whitespaces).isEmpty)
                .accessibilityLabel("Look up in FitBox")
            }
            .listRowBackground(Color.xertInk)

            if let result = admin.fitboxLookupResult {
                if result.found, let user = result.user {
                    VStack(alignment: .leading, spacing: 4) {
                        Text([user.first_name, user.last_name].compactMap { $0 }.joined(separator: " "))
                            .font(.headline)
                            .foregroundStyle(Color.xertOffWhite)
                        Text("\(user.email ?? "No email") · \(user.status ?? "unknown") · FitBox ID \(user.fitbox_user_id)")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.7))
                        Text(nextSessionLine(result.next_session))
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.7))
                        if (result.linked ?? 0) > 0 {
                            Label("Linked to an XERT member by verified email", systemImage: "link")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.green)
                        }
                    }
                    .listRowBackground(Color.xertInk)
                } else {
                    Text("FitBox has no user with that email.")
                        .font(.caption)
                        .foregroundStyle(Color.orange)
                        .listRowBackground(Color.xertInk)
                }
            }
        } header: {
            XertOwnerHeading("Look up in FitBox")
        } footer: {
            Text("Asks FitBox live, keeps the profile in the mirror and links it to an XERT member when the email matches exactly.")
        }
    }

    private func nextSessionLine(_ session: AdminFitboxNextSession?) -> String {
        guard let session else { return "Next session: none booked" }
        if session.unavailable != nil { return "Next session: could not be checked" }
        if let start = session.session_start_time {
            return "Next session: \(session.class_name ?? "Class") · \(start.formatted(date: .abbreviated, time: .shortened))"
        }
        return "Next session: none booked"
    }

    private var membersSection: some View {
        Section {
            if !mirrorInstalled {
                AdminFitboxEmptyRow(text: "Members appear here after the mirror is installed and synced.")
            } else if admin.fitboxUsers.isEmpty {
                AdminFitboxEmptyRow(text: "No FitBox members synced yet.")
            } else {
                TextField("Filter by name, email or ID", text: $memberFilter)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .listRowBackground(Color.xertInk)
                ForEach(filteredUsers) { user in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(user.displayName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.xertOffWhite)
                            Spacer()
                            AdminFitboxStatusChip(value: user.status)
                        }
                        Text("\(user.email ?? "No email") · \(user.phone ?? "No phone")\(user.role == "staff" ? " · staff" : "")")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                            .lineLimit(2)
                    }
                    .listRowBackground(Color.xertInk)
                }
            }
        } header: {
            XertOwnerHeading("Members · \(admin.fitboxUsers.count)")
        }
    }

    private var membershipsSection: some View {
        Section {
            if admin.fitboxSubscriptions.isEmpty {
                AdminFitboxEmptyRow(text: mirrorInstalled ? "No memberships synced yet." : "Memberships appear here after the mirror is installed.")
            } else {
                ForEach(admin.fitboxSubscriptions.prefix(40)) { row in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(row.product_name ?? "Membership")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.xertOffWhite)
                            Spacer()
                            AdminFitboxStatusChip(value: row.status)
                        }
                        Text("\(row.email ?? "FitBox user \(row.fitbox_user_id)") · \(row.priceLabel)\(row.sessions_count.map { " · \($0) sessions" } ?? "")")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                            .lineLimit(2)
                    }
                    .listRowBackground(Color.xertInk)
                }
            }
        } header: {
            XertOwnerHeading("Memberships · \(admin.fitboxSubscriptions.count)")
        }
    }

    private var bookingsSection: some View {
        Section {
            if admin.fitboxAttendance.isEmpty {
                AdminFitboxEmptyRow(text: mirrorInstalled ? "No upcoming FitBox bookings in the mirror." : "Bookings appear here after the mirror is installed.")
            } else {
                ForEach(admin.fitboxAttendance.prefix(40)) { row in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(row.class_name ?? "Class")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.xertOffWhite)
                            Spacer()
                            AdminFitboxStatusChip(value: row.status)
                        }
                        Text("\(row.session_start_time?.formatted(date: .abbreviated, time: .shortened) ?? "Time unknown") · FitBox user \(row.fitbox_user_id)")
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                    }
                    .listRowBackground(Color.xertInk)
                }
            }
        } header: {
            XertOwnerHeading("Upcoming bookings · \(admin.fitboxAttendance.count)")
        }
    }

    private var reviewSection: some View {
        Section {
            HStack {
                Label("Signals awaiting review", systemImage: "tray.full")
                    .foregroundStyle(Color.xertOffWhite)
                Spacer()
                Text("\(overview?.review_queue ?? 0)")
                    .font(.headline)
                    .foregroundStyle((overview?.review_queue ?? 0) > 0 ? Color.orange : Color.xertPale.opacity(0.6))
            }
            .listRowBackground(Color.xertInk)
        } header: {
            XertOwnerHeading("Review queue")
        } footer: {
            Text("Review and acknowledge FitBox signals in the web Command Centre under Business → FitBox. Nothing in XERT changes automatically.")
        }
    }

    private var syncHistorySection: some View {
        Section {
            if let runs = overview?.recent_runs, !runs.isEmpty {
                ForEach(runs.prefix(8)) { run in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(run.feedTitle)
                                .font(.subheadline)
                                .foregroundStyle(Color.xertOffWhite)
                            Text(syncRunDetail(run))
                                .font(.caption)
                                .foregroundStyle(Color.xertPale.opacity(0.6))
                        }
                        Spacer()
                        AdminFitboxStatusChip(value: run.status)
                    }
                    .listRowBackground(Color.xertInk)
                }
            } else {
                AdminFitboxEmptyRow(text: "No syncs recorded yet.")
            }
        } header: {
            XertOwnerHeading("Recent syncs")
        }
    }

    private func syncRunDetail(_ run: AdminFitboxSyncRun) -> String {
        var parts = [(run.finished_at ?? run.started_at).formatted(date: .abbreviated, time: .shortened)]
        parts.append("\(run.accepted ?? 0) stored")
        if let rejected = run.rejected, rejected > 0 { parts.append("\(rejected) skipped") }
        if let linked = run.linked, linked > 0 { parts.append("\(linked) linked") }
        if let code = run.error_code { parts.append(code.replacingOccurrences(of: "_", with: " ").lowercased()) }
        return parts.joined(separator: " · ")
    }

    private func fitboxMetric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption2.weight(.bold))
                .textCase(.uppercase)
                .tracking(0.8)
                .foregroundStyle(Color.xertSteel)
            Text(value)
                .xertDisplay(28)
        }
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .padding(XertSpace.md)
        .xertCardStyle()
    }
}

private struct AdminFitboxEmptyRow: View {
    let text: String

    var body: some View {
        XertOwnerEmptyState(icon: "link.circle", text: text)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
    }
}

private struct AdminFitboxStatusChip: View {
    let value: String?

    private var tint: Color {
        switch value {
        case "active", "booked", "completed": return .green
        case "prospect", "pending", "running": return .orange
        case "cancelled", "failed", "suspended": return .red
        default: return Color.xertSteel
        }
    }

    var body: some View {
        Text((value ?? "unknown").replacingOccurrences(of: "_", with: " "))
            .xertChip(tint)
    }
}
