import SwiftUI

// Text Members: pick an audience, untick anyone who should not get it, send.
// Sending rides the admin communications function, which holds the Twilio
// credentials; this screen only ever handles names and numbers.
struct AdminSmsView: View {
    let session: AuthSession

    enum Audience: String, CaseIterable, Identifiable {
        case members
        case classSignups
        case leads
        case ptRequests

        var id: String { rawValue }

        var title: String {
            switch self {
            case .members: return "All members"
            case .classSignups: return "A class"
            case .leads: return "Member leads"
            case .ptRequests: return "PT requests"
            }
        }

        var icon: String {
            switch self {
            case .members: return "person.2"
            case .classSignups: return "calendar"
            case .leads: return "person.crop.circle.badge.plus"
            case .ptRequests: return "figure.strengthtraining.traditional"
            }
        }
    }

    @State private var audience: Audience = .members
    @State private var classes: [AdminClassSession] = []
    @State private var selectedClassID: UUID?
    @State private var pool = SmsCampaign.Audience(recipients: [], missingPhone: 0, invalidPhone: 0, duplicates: 0)
    @State private var excluded: Set<String> = []
    @State private var message = ""
    @State private var isLoading = false
    @State private var isSending = false
    @State private var loadError: String?
    @State private var errorMessage: String?
    @State private var outcome: AdminSmsOutcome?
    @State private var showingConfirmation = false
    private let api = XertAPI()

    private var selected: [SmsCampaign.Recipient] {
        pool.recipients.filter { !excluded.contains($0.phone) }
    }

    private var segments: SmsCampaign.Segments { SmsCampaign.segments(for: message) }
    private var validationMessage: String? {
        SmsCampaign.validationMessage(message: message, recipients: selected)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                audiencePicker
                if audience == .classSignups { classPicker }
                recipientsSection
                composerSection
                if let result = outcome { outcomeSection(result) }
            }
            .padding(16)
        }
        .background(Color.xertNavy)
        .navigationTitle("Text Members")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadClasses() }
        .task(id: audienceKey) { await loadAudience() }
        .refreshable { await loadAudience() }
        .alert("Could not send", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) { Button("OK") { errorMessage = nil } } message: { Text(errorMessage ?? "") }
        .confirmationDialog(
            "Text \(selected.count) \(selected.count == 1 ? "person" : "people")?",
            isPresented: $showingConfirmation,
            titleVisibility: .visible
        ) {
            Button("Send SMS now") { Task { await send() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Each person gets \(segments.segments) SMS segment\(segments.segments == 1 ? "" : "s") from the XERT number. This cannot be recalled.")
        }
    }

    private var audienceKey: String {
        "\(audience.rawValue)-\(selectedClassID?.uuidString ?? "none")"
    }

    // MARK: - Audience

    private var audiencePicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            adminSmsHeading("Audience")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(Audience.allCases) { option in
                    Button {
                        XertHaptics.play(.selection)
                        audience = option
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Image(systemName: option.icon)
                                .foregroundStyle(audience == option ? Color.xertNavy : Color.xertSteel)
                            Text(option.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(audience == option ? Color.xertNavy : Color.xertOffWhite)
                                .multilineTextAlignment(.leading)
                        }
                        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                        .padding(12)
                        .background(audience == option ? Color.xertSteel : Color.xertInk)
                        .overlay(
                            Rectangle().strokeBorder(
                                audience == option ? Color.xertSteel : Color.xertSteel.opacity(0.25),
                                lineWidth: 1
                            )
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(audience == option ? [.isSelected] : [])
                }
            }
        }
    }

    private var classPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            adminSmsHeading("Class")
            Picker("Class", selection: $selectedClassID) {
                Text("Choose a class…").tag(UUID?.none)
                ForEach(classes) { item in
                    Text(classLabel(item)).tag(UUID?.some(item.id))
                }
            }
            .pickerStyle(.menu)
            .tint(Color.xertSteel)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .padding(.horizontal, 12)
            .xertCardStyle()
        }
    }

    private func classLabel(_ item: AdminClassSession) -> String {
        guard let start = item.start_time else { return item.title }
        return "\(item.title) — \(start.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute()))"
    }

    // MARK: - Recipients

    private var recipientsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                adminSmsHeading("Recipients")
                Spacer()
                Text("\(selected.count) of \(pool.recipients.count)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.xertSteel)
                    .accessibilityLabel("\(selected.count) of \(pool.recipients.count) selected")
            }

            if !pool.recipients.isEmpty {
                HStack(spacing: 10) {
                    Button("Select all") { excluded.removeAll() }
                        .buttonStyle(.bordered)
                        .tint(Color.xertSteel)
                    Button("Clear all") { excluded = Set(pool.recipients.map(\.phone)) }
                        .buttonStyle(.bordered)
                        .tint(Color.xertSteel)
                }
                .font(.footnote)
            }

            if isLoading {
                ProgressView("Loading recipients…")
                    .frame(maxWidth: .infinity, minHeight: 140)
                    .xertCardStyle()
            } else if let failure = loadError {
                VStack(alignment: .leading, spacing: 10) {
                    Text(failure).font(.subheadline).foregroundStyle(Color.xertPale)
                    Button("Try again") { Task { await loadAudience() } }
                        .buttonStyle(.borderedProminent)
                        .tint(Color.xertSteel)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .xertCardStyle()
            } else if audience == .classSignups && selectedClassID == nil {
                emptyCard("Choose a class to load its sign-ups and roster.")
            } else if pool.recipients.isEmpty {
                emptyCard("Nobody in this group has a usable Australian mobile number\(pool.skipped > 0 ? " (\(pool.skipped) without one)" : "").")
            } else {
                VStack(spacing: 0) {
                    ForEach(pool.recipients) { recipient in
                        recipientRow(recipient)
                        if recipient.id != pool.recipients.last?.id {
                            Divider().overlay(Color.xertSteel.opacity(0.15))
                        }
                    }
                }
                .xertCardStyle()

                if pool.skipped > 0 || pool.duplicates > 0 {
                    Text(skippedSummary)
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.5))
                }
            }
        }
    }

    private var skippedSummary: String {
        var parts: [String] = []
        if pool.skipped > 0 {
            parts.append("\(pool.skipped) skipped (no valid mobile)")
        }
        if pool.duplicates > 0 {
            parts.append("\(pool.duplicates) duplicate number\(pool.duplicates == 1 ? "" : "s") merged")
        }
        return parts.joined(separator: " · ")
    }

    private func recipientRow(_ recipient: SmsCampaign.Recipient) -> some View {
        let isOn = !excluded.contains(recipient.phone)
        return Button {
            XertHaptics.play(.selection)
            if isOn { excluded.insert(recipient.phone) } else { excluded.remove(recipient.phone) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isOn ? "checkmark.square.fill" : "square")
                    .font(.title3)
                    .foregroundStyle(isOn ? Color.xertSteel : Color.xertPale.opacity(0.4))
                VStack(alignment: .leading, spacing: 2) {
                    Text(recipient.name)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(isOn ? Color.xertOffWhite : Color.xertPale.opacity(0.45))
                        .strikethrough(!isOn)
                    Text(recipient.detail.isEmpty ? recipient.phone : "\(recipient.phone) · \(recipient.detail)")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.45))
                }
                Spacer(minLength: 8)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(recipient.name)
        .accessibilityValue(isOn ? "Will receive this message" : "Excluded")
        .accessibilityAddTraits(isOn ? [.isSelected] : [])
    }

    private func emptyCard(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Color.xertPale.opacity(0.6))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .xertCardStyle()
    }

    // MARK: - Composer

    private var composerSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            adminSmsHeading("Message")
            TextEditor(text: $message)
                .frame(minHeight: 130)
                .scrollContentBackground(.hidden)
                .padding(10)
                .background(Color.xertInk)
                .overlay(Rectangle().strokeBorder(Color.xertSteel.opacity(0.25), lineWidth: 1))
                .foregroundStyle(Color.xertOffWhite)
                .accessibilityLabel("Message text")

            Text(counterLabel)
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.5))

            Button {
                XertHaptics.play(.lightImpact)
                showingConfirmation = true
            } label: {
                HStack(spacing: 8) {
                    if isSending { ProgressView().tint(Color.xertNavy) }
                    Text(isSending
                         ? "Sending…"
                         : "Send to \(selected.count) \(selected.count == 1 ? "person" : "people")")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.xertSteel)
            .foregroundStyle(Color.xertNavy)
            .disabled(validationMessage != nil || isSending)

            if let problem = validationMessage, !message.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(problem).font(.caption).foregroundStyle(Color.xertPale.opacity(0.55))
            }
            Text("Replies go to the XERT Twilio number, not the app. Only message people who expect to hear from XERT.")
                .font(.caption2)
                .foregroundStyle(Color.xertPale.opacity(0.35))
        }
    }

    private var counterLabel: String {
        var text = "\(segments.characters) characters · \(segments.segments) segment\(segments.segments == 1 ? "" : "s") each"
        if segments.isUnicode { text += " · emoji shorten segments" }
        if !selected.isEmpty && segments.segments > 0 {
            text += " · \(selected.count * segments.segments) total"
        }
        return text
    }

    private func outcomeSection(_ outcome: AdminSmsOutcome) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            adminSmsHeading(outcome.summaryLabel)
            VStack(spacing: 0) {
                ForEach(outcome.results) { result in
                    HStack(spacing: 10) {
                        Image(systemName: result.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(result.ok ? Color.green : Color.orange)
                        Text(result.name)
                            .font(.subheadline)
                            .foregroundStyle(Color.xertOffWhite)
                        Spacer(minLength: 8)
                        Text(result.outcomeLabel)
                            .font(.caption)
                            .foregroundStyle(Color.xertPale.opacity(0.5))
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    if result.id != outcome.results.last?.id {
                        Divider().overlay(Color.xertSteel.opacity(0.15))
                    }
                }
            }
            .xertCardStyle()
        }
    }

    // MARK: - Loading

    @MainActor private func loadClasses() async {
        guard classes.isEmpty else { return }
        do {
            let loaded = try await api.adminClassSessions(session: session)
            let floor = Date().addingTimeInterval(-6 * 60 * 60)
            classes = loaded
                .filter { ($0.start_time ?? .distantPast) > floor }
                .sorted { ($0.start_time ?? .distantPast) < ($1.start_time ?? .distantPast) }
        } catch {
            classes = []
        }
    }

    @MainActor private func loadAudience() async {
        isLoading = true
        loadError = nil
        outcome = nil
        excluded = []
        defer { isLoading = false }
        do {
            pool = SmsCampaign.audience(from: try await contacts())
        } catch {
            pool = SmsCampaign.audience(from: [])
            loadError = error.localizedDescription
        }
    }

    private func contacts() async throws -> [SmsCampaign.Contact] {
        switch audience {
        case .members:
            // adminMembers caps each call at 100, so page until the run is
            // short: texting only the first page would silently skip members.
            var members: [AdminMemberSummary] = []
            var offset = 0
            while members.count < SmsCampaign.maxRecipients {
                let page = try await api.adminMembers(session: session, limit: 100, offset: offset)
                members.append(contentsOf: page)
                if page.count < 100 { break }
                offset += page.count
            }
            return members.map {
                SmsCampaign.Contact(name: $0.displayName, phone: $0.phone, detail: "Member")
            }
        case .leads:
            let leads = try await api.adminLeads(session: session, pipeline: .members)
            return leads.map {
                SmsCampaign.Contact(
                    name: $0.full_name ?? "",
                    phone: $0.phone,
                    detail: "Lead · \($0.status ?? "new")"
                )
            }
        case .ptRequests:
            let requests = try await api.adminPTRequests(session: session)
            return requests.map {
                SmsCampaign.Contact(
                    name: $0.full_name ?? "",
                    phone: $0.phone,
                    detail: "PT · \($0.status)"
                )
            }
        case .classSignups:
            guard let classID = selectedClassID else { return [] }
            let roster = try await api.adminSessionRoster(session: session, classSessionID: classID)
            return roster.map {
                SmsCampaign.Contact(
                    name: $0.displayName,
                    phone: $0.phone,
                    detail: "Roster · \($0.status)"
                )
            }
        }
    }

    @MainActor private func send() async {
        isSending = true
        defer { isSending = false }
        do {
            let result = try await api.adminSendSMS(session: session, message: message, recipients: selected)
            outcome = result
            XertHaptics.play(result.failed == 0 ? .success : .error)
        } catch {
            errorMessage = error.localizedDescription
            XertHaptics.play(.error)
        }
    }
}

private func adminSmsHeading(_ title: String) -> some View {
    Text(title.uppercased())
        .font(.caption.weight(.bold))
        .tracking(1.8)
        .foregroundStyle(Color.xertSteel)
        .accessibilityAddTraits(.isHeader)
}
