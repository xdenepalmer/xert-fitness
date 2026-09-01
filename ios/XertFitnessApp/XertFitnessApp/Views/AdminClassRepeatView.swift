import SwiftUI

struct AdminClassRepeatView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let classSession: AdminClassSession
    let mutationAllowed: Bool

    @State private var plan: AdminClassRepeatPlan
    @State private var errorMessage: String?
    @State private var operationID = UUID()

    init(
        admin: AdminStore,
        session: AuthSession,
        classSession: AdminClassSession,
        mutationAllowed: Bool
    ) {
        self.admin = admin
        self.session = session
        self.classSession = classSession
        self.mutationAllowed = mutationAllowed
        _plan = State(initialValue: AdminClassRepeatPlan(classSession: classSession))
    }

    private var isCreating: Bool {
        admin.savingClassID == classSession.id
    }

    private var validationMessage: String? {
        guard mutationAllowed else {
            return "Refresh the full timetable before creating repeated classes."
        }
        return plan.validationMessage(for: classSession)
    }

    private var canCreate: Bool {
        validationMessage == nil
            && admin.savingClassID == nil
            && admin.cancellingClassID == nil
    }

    var body: some View {
        NavigationStack {
            Form {
                sourceSection
                scheduleSection
                publishingSection
                previewSection

                if let validationMessage {
                    Section {
                        Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .listRowBackground(Color.orange.opacity(0.08))
                }
            }
            .scrollContentBackground(.hidden)
            .xertOwnerScreen()
            .navigationTitle("Repeat Class")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isCreating)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                createBar
            }
        }
        .interactiveDismissDisabled(isCreating)
        .adminOwnerExitState(
            id: operationID,
            title: "Repeat Class",
            isDirty: false,
            isBusy: isCreating
        )
        .alert(
            "Could not repeat class",
            isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )
        ) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "The repeat block could not be created.")
        }
    }

    private var sourceSection: some View {
        Section("Source class") {
            VStack(alignment: .leading, spacing: 6) {
                Text(classSession.title)
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
                if let start = classSession.start_time {
                    Text(start.formatted(date: .complete, time: .shortened))
                        .font(.subheadline)
                        .foregroundStyle(Color.xertPale.opacity(0.68))
                } else {
                    Text("Start time unavailable")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.orange)
                }
                Text("The source class is not changed. XERT creates a new atomic block after it.")
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 4)
        }
        .listRowBackground(Color.xertInk)
    }

    private var scheduleSection: some View {
        Section("Repeat schedule") {
            Picker("Every", selection: $plan.intervalDays) {
                ForEach(AdminClassRepeatPlan.intervalOptions, id: \.self) { days in
                    Text(intervalLabel(days)).tag(days)
                }
            }
            .pickerStyle(.menu)
            .tint(Color.xertSteel)
            .disabled(isCreating)

            Stepper(
                "\(plan.copyCount) cop\(plan.copyCount == 1 ? "y" : "ies")",
                value: $plan.copyCount,
                in: AdminClassRepeatPlan.minimumCopies...AdminClassRepeatPlan.maximumCopies
            )
            .disabled(isCreating)
            .accessibilityIdentifier("owner.classRepeat.copyCount")
        }
        .listRowBackground(Color.xertInk)
    }

    private var publishingSection: some View {
        Section("Copy status") {
            if dynamicTypeSize.isAccessibilitySize {
                Picker("Status", selection: $plan.mode) {
                    modeOptions
                }
                .pickerStyle(.menu)
            } else {
                Picker("Status", selection: $plan.mode) {
                    modeOptions
                }
                .pickerStyle(.segmented)
            }

            Text(plan.mode.detail)
                .font(.caption)
                .foregroundStyle(
                    plan.mode == .published
                        ? Color.orange
                        : Color.xertPale.opacity(0.58)
                )
                .fixedSize(horizontal: false, vertical: true)

            if plan.mode == .published {
                Label(
                    classSession.public_visible == true
                        ? "Every copy will be visible and bookable immediately."
                        : "Copies will be published but retain this class's hidden public visibility.",
                    systemImage: "bolt.shield.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.orange)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .listRowBackground(Color.xertInk)
    }

    @ViewBuilder
    private var modeOptions: some View {
        ForEach(AdminClassRepeatMode.allCases) { mode in
            Text(mode.title).tag(mode)
        }
    }

    private var previewSection: some View {
        Section("Next dates") {
            let dates = plan.previewDates(for: classSession)
            if dates.isEmpty {
                Text("Add a valid source start time to preview this block.")
                    .foregroundStyle(Color.xertPale.opacity(0.58))
            } else {
                ForEach(Array(dates.enumerated()), id: \.offset) { index, date in
                    LabeledContent("Copy \(index + 1)") {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                    }
                }
                if plan.copyCount > dates.count,
                   let finalDate = plan.finalDate(for: classSession) {
                    LabeledContent("Final copy") {
                        Text(finalDate.formatted(date: .abbreviated, time: .shortened))
                    }
                }
            }
        }
        .listRowBackground(Color.xertInk)
    }

    private var createBar: some View {
        Button {
            XertHaptics.play(.lightImpact)
            Task { await createCopies() }
        } label: {
            HStack(spacing: 10) {
                if isCreating {
                    ProgressView().tint(Color.xertNavy)
                } else {
                    Image(systemName: plan.mode == .published ? "calendar.badge.checkmark" : "calendar.badge.plus")
                }
                Text(isCreating ? "Creating \(plan.copyCount) copies..." : "Create \(plan.copyCount) cop\(plan.copyCount == 1 ? "y" : "ies")")
                    .font(.headline)
            }
            .foregroundStyle(Color.xertNavy)
            .frame(maxWidth: .infinity, minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(canCreate ? Color.xertSteel : Color.xertSteel.opacity(0.42))
        .disabled(!canCreate)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) {
            Rectangle().fill(Color.xertSteel.opacity(0.24)).frame(height: 1)
        }
        .accessibilityIdentifier("owner.classRepeat.create")
        .accessibilityHint(validationMessage ?? "Creates the complete repeat block in one protected operation")
    }

    private func intervalLabel(_ days: Int) -> String {
        switch days {
        case 1: return "1 day · Daily"
        case 7: return "7 days · Weekly"
        case 8: return "8 days · 4-on / 4-off"
        case 14: return "14 days · Fortnightly"
        default: return "\(days) days"
        }
    }

    @MainActor
    private func createCopies() async {
        guard canCreate else {
            if let validationMessage { errorMessage = validationMessage }
            XertHaptics.play(.warning)
            return
        }
        let succeeded = await admin.repeatClass(
            session: session,
            classSession: classSession,
            plan: plan
        )
        guard succeeded else {
            errorMessage = admin.errorMessage
                ?? "The repeat block could not be confirmed. Refresh the timetable before trying again."
            admin.errorMessage = nil
            XertHaptics.play(.error)
            return
        }
        XertHaptics.play(.success)
        dismiss()
    }
}
