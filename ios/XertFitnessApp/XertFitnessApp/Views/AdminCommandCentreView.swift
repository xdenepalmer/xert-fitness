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
                AdminMetricTile(title: "Requests", value: admin.requestedPlaces, icon: "tray.full")
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
                AdminDestinationRow(title: "Finance", detail: "Track pack sales and revenue", icon: "chart.line.uptrend.xyaxis") {
                    AdminFinanceView(admin: admin)
                }
                AdminDestinationRow(title: "Platform controls", detail: "Control bookings, launch and public messaging", icon: "switch.2") {
                    AdminPlatformView(admin: admin, session: session)
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
