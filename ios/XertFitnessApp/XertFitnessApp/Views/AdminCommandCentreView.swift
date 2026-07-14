import SwiftUI

struct AdminCommandCentreView: View {
    @EnvironmentObject private var store: XertStore
    @StateObject private var admin = AdminStore()

    var body: some View {
        NavigationStack {
            Group {
                if let session = store.authSession, store.profile?.isAdmin == true {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 20) {
                            ownerHeader
                            attentionGrid
                            businessPulse
                            todayDesk(session: session)
                            managementDirectory
                        }
                        .padding(.horizontal, 18)
                        .padding(.bottom, 32)
                    }
                    .refreshable { await admin.refresh(session: session) }
                    .task { await admin.refresh(session: session) }
                } else {
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
                }
            }
            .background(Color.xertNavy.ignoresSafeArea())
            .navigationTitle("Command Centre")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Command Centre", isPresented: Binding(
                get: { admin.errorMessage != nil },
                set: { if !$0 { admin.errorMessage = nil } }
            )) {
                Button("OK") { admin.errorMessage = nil }
            } message: {
                Text(admin.errorMessage ?? "")
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

    private var managementDirectory: some View {
        VStack(alignment: .leading, spacing: 12) {
            adminHeading("Manage XERT")
            if let session = store.authSession {
                AdminDestinationRow(title: "Members", detail: "Search \(admin.memberCount) accounts and review value", icon: "person.2") {
                    AdminMembersView(admin: admin, session: session)
                }
                AdminDestinationRow(title: "Classes & waitlists", detail: "Run today's schedule and fill open places", icon: "calendar.badge.clock") {
                    AdminClassesView(admin: admin, session: session)
                }
                AdminDestinationRow(title: "Retention", detail: "Contact members before they disengage", icon: "arrow.triangle.2.circlepath") {
                    AdminRetentionView(admin: admin, session: session)
                }
                AdminDestinationRow(title: "PT requests", detail: "Approve, reschedule and complete private training", icon: "figure.strengthtraining.traditional") {
                    AdminPTRequestsView(admin: admin, session: session)
                }
                AdminDestinationRow(title: "Member notices", detail: "\(admin.liveAnnouncements) live · publish to web and iOS", icon: "bell.badge") {
                    AdminCommunicationsView(admin: admin, session: session)
                }
                AdminDestinationRow(title: "Finance", detail: "Track pack sales and revenue", icon: "chart.line.uptrend.xyaxis") {
                    AdminFinanceView(admin: admin)
                }
                AdminDestinationRow(title: "Platform controls", detail: "Control bookings, launch and public messaging", icon: "switch.2") {
                    AdminPlatformView(admin: admin, session: session)
                }
                AdminDestinationRow(title: "Operations health", detail: !admin.hasHealthSnapshot ? "Checking release services" : admin.healthIssues == 0 ? "Schema, Stripe and APNs ready" : "\(admin.healthIssues) release issue\(admin.healthIssues == 1 ? "" : "s")", icon: "checkmark.shield") {
                    AdminOperationsHealthView(admin: admin)
                }
            }
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
            }
            Section("Latest transactions") {
                if admin.orders.isEmpty { Text("No orders yet.") }
                ForEach(admin.orders.prefix(50)) { order in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(order.products?.name ?? "Session pack").font(.headline)
                            Text(order.activityDate.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(order.formattedAmount).font(.subheadline.weight(.bold))
                            Text(order.displayStatus.uppercased())
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(order.status == "paid" ? Color.green : Color.orange)
                        }
                    }
                    .foregroundStyle(Color.xertOffWhite)
                    .listRowBackground(Color.xertInk)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle("Finance")
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

    var body: some View {
        Group {
            if draft != nil {
                Form {
                    Section("Live platform") {
                        Toggle("Bookings enabled", isOn: settingBinding(\.bookings_enabled))
                        Text("Disabling bookings changes public class actions to registration interest.")
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
                            Task {
                                saved = await admin.saveSettings(session: session, draft: draft)
                                if saved { self.draft = admin.settings }
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
    }

    private var commerceDetail: String {
        guard let health = admin.commerceHealth else { return "Commerce health is unavailable." }
        if !health.environment.missing.isEmpty {
            return "Missing: \(health.environment.missing.joined(separator: ", "))."
        }
        return "\(health.active_product_count) active packs; \(health.stripe_price_count) Stripe-linked and \(health.dynamic_price_count) dynamic."
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

private struct AdminAnnouncementComposer: View {
    @Environment(\.dismiss) private var dismiss
    let isPublishing: Bool
    let onPublish: (String, String, String) -> Void
    @State private var title = ""
    @State private var body = ""
    @State private var tone = "info"
    @State private var confirming = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Member notice") {
                    TextField("Title", text: $title)
                    TextEditor(text: $body).frame(minHeight: 180)
                    Text("\(body.count)/2000").font(.caption).foregroundStyle(.secondary)
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
                        .disabled(isPublishing || title.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || body.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
                }
            }
            .confirmationDialog("Publish this member notice now?", isPresented: $confirming, titleVisibility: .visible) {
                Button("Publish to members") { onPublish(title, String(body.prefix(2_000)), tone) }
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
