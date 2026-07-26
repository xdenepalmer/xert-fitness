import SwiftUI
import UIKit

struct MemberReadinessStatusCard: View {
    @EnvironmentObject private var store: XertStore
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: statusIcon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(statusColor)
                    .frame(width: 38, height: 38)
                    .background(statusColor.opacity(0.1))
                    .clipShape(Circle())
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Member readiness")
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text(statusTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(statusColor)
                    Text(statusDetail)
                        .font(.caption)
                        .foregroundStyle(Color.xertPale)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
            }

            Button(action: onOpen) {
                Label(actionTitle, systemImage: "person.text.rectangle")
            }
            .buttonStyle(.xertPrimary)
            .disabled(!store.onboardingLoaded && store.memberOnboarding == nil && !isUnavailable)
            .accessibilityHint("Opens your private member details, emergency contact and current XERT documents")
        }
        .padding(14)
        .xertCardStyle()
        .accessibilityElement(children: .contain)
    }

    private var state: MemberOnboardingState? { store.memberOnboarding }
    private var isUnavailable: Bool { store.unavailableDataSources.contains(.onboarding) }

    private var statusTitle: String {
        if isUnavailable {
            return state == nil ? "Status unavailable" : "Last known status"
        }
        guard store.onboardingLoaded, let state else { return "Checking status…" }
        return state.is_complete ? "Complete" : "Action requested"
    }

    private var statusDetail: String {
        if isUnavailable {
            return state == nil
                ? "XERT could not refresh this private record. Open it to retry."
                : "XERT could not refresh this record. Your saved details remain available while you retry."
        }
        guard store.onboardingLoaded, let state else {
            return "Loading your member setup securely."
        }
        if state.is_complete {
            return "Your current details and required documents are saved. You can review or update them any time."
        }
        let missing = [
            state.profile_complete ? nil : "your details",
            state.emergency_contact_complete ? nil : "an emergency contact",
            state.documents_complete ? nil : "document acknowledgements",
        ].compactMap { $0 }
        return "Complete \(missing.joined(separator: ", ")). This is advisory and does not block class browsing or bookings."
    }

    private var actionTitle: String {
        if isUnavailable { return "Open & Retry" }
        return state?.is_complete == true ? "Review Details" : "Complete Readiness"
    }

    private var statusIcon: String {
        if isUnavailable { return "wifi.exclamationmark" }
        if !store.onboardingLoaded { return "arrow.clockwise" }
        return state?.is_complete == true ? "checkmark.shield.fill" : "person.badge.clock"
    }

    private var statusColor: Color {
        if isUnavailable { return .orange }
        return state?.is_complete == true ? .green : .xertSteel
    }
}

struct MemberOnboardingView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dismiss) private var dismiss

    @State private var draft: MemberOnboardingDraft?
    @State private var baseline: MemberOnboardingDraft?
    @State private var draftingUserID: UUID?
    @State private var inlineError: String?
    @State private var didSave = false
    @State private var isSubmitting = false
    @State private var confirmingDiscard = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case fullName
        case phone
        case emergencyName
        case emergencyPhone
        case emergencyRelationship
    }

    var body: some View {
        NavigationStack {
            Form {
                if let state = store.memberOnboarding {
                    overviewSection(state)

                    if store.unavailableDataSources.contains(.onboarding) {
                        unavailableSection(hasSavedState: true)
                    }

                    adultEligibilitySection(state.adultReadinessDocument)
                    memberDetailsSection
                    emergencyContactSection
                    let additionalDocuments = state.required_documents.filter {
                        !$0.isAdultReadinessAcknowledgement
                    }
                    if !additionalDocuments.isEmpty {
                        documentsIntroductionSection
                        documentSections(additionalDocuments)
                    }
                    saveSection(state)
                } else if store.unavailableDataSources.contains(.onboarding) {
                    unavailableSection(hasSavedState: false)
                } else {
                    loadingSection
                }

                Color.clear
                    .frame(height: 28)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .accessibilityHidden(true)
            }
            .xertListBackground()
            .disabled(isSaveInFlight)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Member Readiness")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: requestClose)
                        .disabled(isSaveInFlight)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
        }
        .tint(Color.xertSteel)
        .preferredColorScheme(.dark)
        .privacySensitive()
        .interactiveDismissDisabled(hasUnsavedChanges || isSaveInFlight)
        .confirmationDialog(
            "Discard readiness changes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Keep Editing", role: .cancel) {}
            Button("Discard and Close", role: .destructive) {
                draft = baseline
                dismiss()
            }
        } message: {
            Text("Changes in this private form have not been saved to XERT.")
        }
        .onAppear {
            store.clearMemberOnboardingError()
            adoptServerStateIfSafe(force: false)
            if store.memberOnboarding == nil, store.unavailableDataSources.contains(.onboarding) {
                Task { await store.refreshMemberOnboarding() }
            }
        }
        .onChange(of: store.memberOnboarding) { onboarding in
            guard onboarding != nil else {
                clearPrivateDraft()
                return
            }
            adoptServerStateIfSafe(force: false)
        }
        .onChange(of: store.isSignedIn) { isSignedIn in
            if !isSignedIn {
                clearPrivateDraft()
                dismiss()
            }
        }
    }

    private func overviewSection(_ state: MemberOnboardingState) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: state.is_complete ? "checkmark.shield.fill" : "person.badge.clock")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(state.is_complete ? Color.green : Color.xertSteel)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(state.is_complete ? "Readiness complete" : "Finish your member setup")
                            .font(.headline)
                            .foregroundStyle(Color.xertOffWhite)
                        Text(state.is_complete
                             ? "Your current details and documents are saved. Everything below remains editable."
                             : "Add reliable contact details and acknowledge the current XERT documents.")
                            .font(.subheadline)
                            .foregroundStyle(Color.xertPale)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                ProgressView(value: progressValue(for: state), total: 3)
                    .tint(state.is_complete ? .green : .xertSteel)
                    .accessibilityLabel("Member readiness progress")
                    .accessibilityValue("\(Int(progressValue(for: state))) of 3 sections complete")

                Text("This setup supports safe member service. It is advisory in the app and does not diagnose a condition or block class browsing or bookings.")
                    .font(.footnote)
                    .foregroundStyle(Color.xertMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 4)
        }
        .listRowBackground(Color.xertInk)
    }

    private var loadingSection: some View {
        Section {
            HStack(spacing: 12) {
                ProgressView().tint(Color.xertSteel)
                Text("Loading your private readiness record…")
                    .foregroundStyle(Color.xertPale)
            }
            .frame(minHeight: 64)
            .accessibilityElement(children: .combine)
        }
        .listRowBackground(Color.xertInk)
    }

    private func unavailableSection(hasSavedState: Bool) -> some View {
        Section {
            Label(
                hasSavedState
                    ? "XERT could not refresh this record. Review the saved copy below, then retry before saving."
                    : "XERT could not load your private readiness record.",
                systemImage: "wifi.exclamationmark"
            )
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.orange)
            .fixedSize(horizontal: false, vertical: true)

            Button {
                Task { await store.refreshMemberOnboarding() }
            } label: {
                HStack(spacing: 8) {
                    Label(
                        store.isLoadingMemberOnboarding ? "Refreshing Readiness…" : "Retry Readiness",
                        systemImage: "arrow.clockwise"
                    )
                    if store.isLoadingMemberOnboarding {
                        ProgressView()
                            .controlSize(.small)
                            .accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(.xertGhost)
            .disabled(store.isLoadingMemberOnboarding || isSaveInFlight)

            if let error = store.onboardingErrorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .listRowBackground(Color.xertInk)
    }

    private func adultEligibilitySection(_ document: MemberOnboardingDocument?) -> some View {
        Section {
            if let document {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(document.title)
                            .font(.headline)
                            .foregroundStyle(Color.xertOffWhite)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Text("V\(document.version)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.xertSteel)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.45)))
                    }

                    Text(document.body)
                        .font(.subheadline)
                        .foregroundStyle(Color.xertPale)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)

                    if let sourceURL = document.sourceURL {
                        Link(destination: sourceURL) {
                            Label("Open official AUSactive source", systemImage: "arrow.up.right.square")
                                .frame(minHeight: 44)
                        }
                        .font(.subheadline.weight(.semibold))
                    }
                }

                Toggle(
                    "I confirm I am 18 years of age or older and acknowledge this document",
                    isOn: adultEligibilityBinding(documentID: document.id)
                )
                .tint(Color.xertSteel)
                .fixedSize(horizontal: false, vertical: true)
            } else {
                Label(
                    "The adult readiness acknowledgement is unavailable. Retry before saving.",
                    systemImage: "exclamationmark.triangle"
                )
                .foregroundStyle(Color.orange)
                .fixedSize(horizontal: false, vertical: true)
            }

            if draft?.confirmsAdultEligibility != true {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Under 18? Do not submit this adult form.", systemImage: "person.2.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.orange)
                    Text("Ask a parent or guardian to contact XERT so the team can discuss the appropriate pathway with you.")
                        .font(.footnote)
                        .foregroundStyle(Color.xertPale)
                        .fixedSize(horizontal: false, vertical: true)
                    Link(destination: AppConfig.webURL(path: "contact")) {
                        Label("Contact XERT with a parent or guardian", systemImage: "arrow.up.right.square")
                            .frame(minHeight: 44)
                    }
                    .font(.subheadline.weight(.semibold))
                }
            }
        } header: {
            Text("18+ Eligibility").xertEyebrow()
        } footer: {
            Text("This Member Readiness pathway and its published acknowledgement are for adults aged 18 or older.")
        }
        .listRowBackground(Color.xertInk)
    }

    private var memberDetailsSection: some View {
        Section {
            TextField("Full name", text: fullNameBinding)
                .textContentType(.name)
                .focused($focusedField, equals: .fullName)
                .submitLabel(.next)
                .onSubmit { focusedField = .phone }
                .foregroundStyle(Color.xertOffWhite)
                .tint(Color.xertSteel)
                .accessibilityHint("Required for your XERT member record")

            TextField("Mobile number", text: phoneBinding)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .focused($focusedField, equals: .phone)
                .foregroundStyle(Color.xertOffWhite)
                .tint(Color.xertSteel)
                .accessibilityHint("Required so XERT can contact you about your membership")
        } header: {
            Text("Your Details").xertEyebrow()
        } footer: {
            Text("Use the name and mobile number XERT should use for your member account.")
        }
        .listRowBackground(Color.xertInk)
    }

    private var emergencyContactSection: some View {
        Section {
            TextField("Contact name", text: emergencyNameBinding)
                .textContentType(.name)
                .focused($focusedField, equals: .emergencyName)
                .submitLabel(.next)
                .onSubmit { focusedField = .emergencyPhone }
                .foregroundStyle(Color.xertOffWhite)
                .tint(Color.xertSteel)

            TextField("Contact mobile", text: emergencyPhoneBinding)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .focused($focusedField, equals: .emergencyPhone)
                .foregroundStyle(Color.xertOffWhite)
                .tint(Color.xertSteel)

            TextField("Relationship to you", text: emergencyRelationshipBinding)
                .textContentType(.name)
                .focused($focusedField, equals: .emergencyRelationship)
                .submitLabel(.done)
                .onSubmit { focusedField = nil }
                .foregroundStyle(Color.xertOffWhite)
                .tint(Color.xertSteel)

            Toggle(
                "I confirm this person knows I have nominated them as my emergency contact",
                isOn: contactAwareBinding
            )
            .tint(Color.xertSteel)
            .fixedSize(horizontal: false, vertical: true)
        } header: {
            Text("Emergency Contact").xertEyebrow()
        } footer: {
            Text("Changing any emergency-contact detail clears this confirmation so you can confirm the current person is aware.")
        }
        .listRowBackground(Color.xertInk)
    }

    private var documentsIntroductionSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Label("Read every current document", systemImage: "doc.text.magnifyingglass")
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
                Text("Each additional document includes its current version and complete server-published wording. Read it carefully before acknowledging it.")
                    .font(.footnote)
                    .foregroundStyle(Color.xertPale)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } header: {
            Text("Current XERT Documents").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
    }

    @ViewBuilder
    private func documentSections(_ documents: [MemberOnboardingDocument]) -> some View {
        if documents.isEmpty {
            Section {
                Label("Required documents are unavailable. Retry before saving.", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .listRowBackground(Color.xertInk)
        } else {
            ForEach(documents) { document in
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(document.title)
                                .font(.headline)
                                .foregroundStyle(Color.xertOffWhite)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Text("V\(document.version)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(Color.xertSteel)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 4)
                                .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.45)))
                        }

                        Text(document.body)
                            .font(.subheadline)
                            .foregroundStyle(Color.xertPale)
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)

                        if let sourceURL = document.sourceURL {
                            Link(destination: sourceURL) {
                                Label("Open official source", systemImage: "arrow.up.right.square")
                                    .frame(minHeight: 44)
                            }
                            .font(.subheadline.weight(.semibold))
                        }
                    }

                    Toggle(
                        "I have read and acknowledge \(document.title), version \(document.version)",
                        isOn: documentAcceptanceBinding(document.id)
                    )
                    .tint(Color.xertSteel)
                    .fixedSize(horizontal: false, vertical: true)
                } header: {
                    Text(document.document_key.replacingOccurrences(of: "_", with: " "))
                        .xertEyebrow()
                }
                .listRowBackground(Color.xertInk)
            }
        }
    }

    private func saveSection(_ state: MemberOnboardingState) -> some View {
        Section {
            if let message = inlineError ?? store.onboardingErrorMessage {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Could not save member readiness. \(message)")
            }

            if didSave {
                Label(
                    store.memberOnboarding?.is_complete == true
                        ? "Member readiness saved and complete"
                        : "Member readiness changes saved",
                    systemImage: "checkmark.circle.fill"
                )
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.green)
            }

            Button(action: submit) {
                HStack(spacing: 10) {
                    Text(isSaveInFlight
                         ? "Saving Readiness…"
                         : (state.is_complete ? "Save Readiness Updates" : "Save Member Readiness"))
                    Spacer(minLength: 8)
                    if isSaveInFlight {
                        ProgressView()
                            .controlSize(.small)
                            .tint(Color.xertNavy)
                            .accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(.xertPrimary)
            .disabled(
                isSaveInFlight
                    || draft?.confirmsAdultEligibility != true
                    || !hasUnsavedChanges
            )
            .accessibilityValue(isSaveInFlight ? "In progress" : "")

            Text("Saving sends these details and acknowledgements securely to XERT. Nothing from this form is stored in app preferences, Handoff or navigation history.")
                .font(.footnote)
                .foregroundStyle(Color.xertMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .listRowBackground(Color.xertInk)
    }

    private var fullNameBinding: Binding<String> {
        Binding(
            get: { draft?.fullName ?? "" },
            set: { value in
                updateDraft { $0.fullName = value }
            }
        )
    }

    private var phoneBinding: Binding<String> {
        Binding(
            get: { draft?.phone ?? "" },
            set: { value in
                updateDraft { $0.phone = value }
            }
        )
    }

    private var emergencyNameBinding: Binding<String> {
        Binding(
            get: { draft?.emergencyContactName ?? "" },
            set: { value in
                updateDraft { next in
                    if next.emergencyContactName != value { next.contactIsAware = false }
                    next.emergencyContactName = value
                }
            }
        )
    }

    private var emergencyPhoneBinding: Binding<String> {
        Binding(
            get: { draft?.emergencyContactPhone ?? "" },
            set: { value in
                updateDraft { next in
                    if next.emergencyContactPhone != value { next.contactIsAware = false }
                    next.emergencyContactPhone = value
                }
            }
        )
    }

    private var emergencyRelationshipBinding: Binding<String> {
        Binding(
            get: { draft?.emergencyContactRelationship ?? "" },
            set: { value in
                updateDraft { next in
                    if next.emergencyContactRelationship != value { next.contactIsAware = false }
                    next.emergencyContactRelationship = value
                }
            }
        )
    }

    private var contactAwareBinding: Binding<Bool> {
        Binding(
            get: { draft?.contactIsAware ?? false },
            set: { value in
                updateDraft { $0.contactIsAware = value }
            }
        )
    }

    private func adultEligibilityBinding(documentID: UUID) -> Binding<Bool> {
        Binding(
            get: {
                draft?.confirmsAdultEligibility == true
                    && draft?.acceptedDocumentIDs.contains(documentID) == true
            },
            set: { confirmed in
                updateDraft { next in
                    next.confirmsAdultEligibility = confirmed
                    if confirmed {
                        next.acceptedDocumentIDs.insert(documentID)
                    } else {
                        next.acceptedDocumentIDs.remove(documentID)
                    }
                }
            }
        )
    }

    private func documentAcceptanceBinding(_ documentID: UUID) -> Binding<Bool> {
        Binding(
            get: { draft?.acceptedDocumentIDs.contains(documentID) == true },
            set: { accepted in
                updateDraft { next in
                    if accepted {
                        next.acceptedDocumentIDs.insert(documentID)
                    } else {
                        next.acceptedDocumentIDs.remove(documentID)
                    }
                }
            }
        )
    }

    private var hasUnsavedChanges: Bool {
        guard let draft, let baseline else { return false }
        return draft != baseline
    }

    private var isSaveInFlight: Bool {
        isSubmitting || store.isSavingMemberOnboarding
    }

    private func markEdited() {
        didSave = false
        inlineError = nil
        store.clearMemberOnboardingError()
    }

    private func updateDraft(_ update: (inout MemberOnboardingDraft) -> Void) {
        guard var next = draft else { return }
        update(&next)
        draft = next
        markEdited()
    }

    private func adoptServerStateIfSafe(force: Bool) {
        guard let state = store.memberOnboarding else { return }
        if let draftingUserID, draftingUserID != state.user_id {
            clearPrivateDraft()
        }
        guard force || draft == nil || !hasUnsavedChanges else { return }
        let serverDraft = MemberOnboardingDraft(state: state)
        draft = serverDraft
        baseline = serverDraft
        draftingUserID = state.user_id
        inlineError = nil
    }

    private func clearPrivateDraft() {
        draft = nil
        baseline = nil
        draftingUserID = nil
        inlineError = nil
        didSave = false
    }

    private func submit() {
        guard !isSaveInFlight,
              let draft,
              let state = store.memberOnboarding
        else { return }
        focusedField = nil
        inlineError = nil

        do {
            _ = try MemberOnboardingSaveRequest(
                draft: draft,
                requiredDocuments: state.required_documents
            )
        } catch {
            inlineError = error.localizedDescription
            focusFirstIncompleteField(in: draft)
            XertHaptics.play(.warning)
            UIAccessibility.post(notification: .announcement, argument: error.localizedDescription)
            return
        }

        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            let saved = await store.saveMemberOnboarding(draft)
            if saved {
                adoptServerStateIfSafe(force: true)
                didSave = true
                UIAccessibility.post(notification: .announcement, argument: "Member readiness saved")
            } else {
                inlineError = store.onboardingErrorMessage ?? "Could not update member readiness."
                UIAccessibility.post(notification: .announcement, argument: inlineError)
            }
        }
    }

    private func focusFirstIncompleteField(in draft: MemberOnboardingDraft) {
        if draft.fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            focusedField = .fullName
        } else if draft.phone.filter(\.isNumber).count < 8 {
            focusedField = .phone
        } else if draft.emergencyContactName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            focusedField = .emergencyName
        } else if draft.emergencyContactPhone.filter(\.isNumber).count < 8 {
            focusedField = .emergencyPhone
        } else if draft.emergencyContactRelationship.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            focusedField = .emergencyRelationship
        }
    }

    private func requestClose() {
        focusedField = nil
        if hasUnsavedChanges {
            confirmingDiscard = true
        } else {
            dismiss()
        }
    }

    private func progressValue(for state: MemberOnboardingState) -> Double {
        Double([
            state.profile_complete,
            state.emergency_contact_complete,
            state.documents_complete,
        ].filter { $0 }.count)
    }
}
