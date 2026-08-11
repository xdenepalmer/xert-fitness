import SwiftUI
import UIKit

struct AdminFormsView: View {
    let session: AuthSession
    @State private var forms: [AdminForm] = []
    @State private var query = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var editor: AdminFormEditorContext?
    private let api = XertAPI()

    private var filteredForms: [AdminForm] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return forms }
        return forms.filter { "\($0.title) \($0.description) \($0.form_type)".lowercased().contains(term) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                summary
                if isLoading && forms.isEmpty {
                    ProgressView("Loading forms…")
                        .frame(maxWidth: .infinity, minHeight: 180)
                } else if filteredForms.isEmpty {
                    emptyState
                } else {
                    ForEach(filteredForms) { form in
                        NavigationLink(value: form) { formRow(form) }
                            .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Color.xertNavy)
        .navigationTitle("Forms & Surveys")
        .searchable(text: $query, prompt: "Search forms")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    XertHaptics.play(.lightImpact)
                    editor = AdminFormEditorContext(form: nil)
                } label: { Label("New form", systemImage: "plus") }
            }
        }
        .navigationDestination(for: AdminForm.self) { form in
            AdminFormDetailView(session: session, form: form) { updated in
                if let index = forms.firstIndex(where: { $0.id == updated.id }) { forms[index] = updated }
            } onArchived: { forms.removeAll { $0.id == form.id } }
        }
        .sheet(item: $editor) { context in
            NavigationStack {
                AdminFormEditorView(session: session, context: context) { saved in
                    if let index = forms.firstIndex(where: { $0.id == saved.id }) { forms[index] = saved }
                    else { forms.insert(saved, at: 0) }
                    editor = nil
                }
            }
        }
        .refreshable { await load() }
        .task { if forms.isEmpty { await load() } }
        .alert("Forms & Surveys", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("ENGAGE & LEARN").font(.caption.weight(.bold)).tracking(1.8).foregroundStyle(Color.xertSteel)
            Text("Build forms anywhere")
                .font(XertTheme.displayFont(size: 32, relativeTo: .title))
                .textCase(.uppercase).foregroundStyle(Color.xertOffWhite)
            Text("Create, publish, share and review XERT forms from iPhone, iPad or desktop.")
                .font(.subheadline).foregroundStyle(Color.xertPale.opacity(0.68))
            HStack(spacing: 10) {
                metric("Forms", forms.count)
                metric("Live", forms.filter(\.is_active).count)
                metric("Responses", forms.reduce(0) { $0 + $1.response_count })
            }
        }
        .padding(18)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.22)))
    }

    private func metric(_ label: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value.formatted()).font(.title2.bold()).foregroundStyle(Color.xertOffWhite)
            Text(label.uppercased()).font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(Color.xertPale.opacity(0.48))
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func formRow(_ form: AdminForm) -> some View {
        HStack(spacing: 13) {
            Image(systemName: "list.clipboard").font(.title3).foregroundStyle(Color.xertSteel)
                .frame(width: 42, height: 42).background(Color.xertSteel.opacity(0.1))
            VStack(alignment: .leading, spacing: 4) {
                HStack { Text(form.title).font(.headline).foregroundStyle(Color.xertOffWhite).lineLimit(2); Spacer(); Text(form.is_active ? "LIVE" : "PAUSED").font(.caption2.bold()).foregroundStyle(form.is_active ? Color.green : Color.xertPale.opacity(0.45)) }
                Text("\(form.questions.filter { !["section_break", "statement"].contains($0.type) }.count) fields · \(form.response_count) responses")
                    .font(.caption).foregroundStyle(Color.xertPale.opacity(0.52))
            }
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Color.xertSteel.opacity(0.55))
        }
        .padding(14).background(Color.xertInk).overlay(Rectangle().stroke(Color.xertSteel.opacity(0.18)))
        .contentShape(Rectangle())
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "list.clipboard").font(.system(size: 42)).foregroundStyle(Color.xertSteel.opacity(0.4))
            Text("No forms yet").font(XertTheme.displayFont(size: 26, relativeTo: .title2)).textCase(.uppercase).foregroundStyle(Color.xertOffWhite)
            Text("Create a survey, registration, feedback form or custom workflow.").multilineTextAlignment(.center).foregroundStyle(Color.xertPale.opacity(0.55))
            Button("Create first form") { editor = AdminFormEditorContext(form: nil) }.buttonStyle(.borderedProminent).tint(Color.xertSteel)
        }.frame(maxWidth: .infinity, minHeight: 260)
    }

    @MainActor private func load() async {
        guard !isLoading else { return }
        isLoading = true; defer { isLoading = false }
        do { forms = try await api.adminForms(session: session) }
        catch { errorMessage = error.localizedDescription }
    }
}

private struct AdminFormEditorContext: Identifiable {
    let id = UUID()
    let form: AdminForm?
}

private struct AdminFormEditorView: View {
    @Environment(\.dismiss) private var dismiss
    let session: AuthSession
    let context: AdminFormEditorContext
    let onSaved: (AdminForm) -> Void
    @State private var draft: AdminFormDraft
    @State private var isSaving = false
    @State private var errorMessage: String?
    private let api = XertAPI()

    init(session: AuthSession, context: AdminFormEditorContext, onSaved: @escaping (AdminForm) -> Void) {
        self.session = session; self.context = context; self.onSaved = onSaved
        _draft = State(initialValue: AdminFormDraft(form: context.form))
    }

    var body: some View {
        Form {
            Section("Basics") {
                TextField("Form title", text: $draft.title)
                Picker("Type", selection: $draft.formType) { ForEach(AdminFormDraft.types, id: \.self) { Text(formTypeLabel($0)).tag($0) } }
                TextField("Description", text: $draft.description, axis: .vertical).lineLimit(3...8)
                TextField("Public link", text: $draft.slug).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Section("Fields") {
                ForEach($draft.questions) { $question in
                    NavigationLink { AdminFormQuestionEditor(question: $question, questions: draft.questions) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(question.displayTitle).lineLimit(2)
                            Text(fieldTypeLabel(question.type)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onMove { draft.questions.move(fromOffsets: $0, toOffset: $1) }
                .onDelete { draft.questions.remove(atOffsets: $0) }
                Menu {
                    ForEach(AdminFormDraft.fieldTypes, id: \.self) { type in
                        Button(fieldTypeLabel(type)) { draft.questions.append(.blank(type: type)) }
                    }
                } label: { Label("Add field", systemImage: "plus") }
            }
            Section("Respondent details") {
                collectionToggle("Collect name", value: $draft.collectName, required: $draft.collectNameRequired)
                collectionToggle("Collect email", value: $draft.collectEmail, required: $draft.collectEmailRequired)
                collectionToggle("Collect phone", value: $draft.collectPhone, required: $draft.collectPhoneRequired)
                Toggle("One response per email", isOn: $draft.oneResponsePerEmail)
            }
            Section("Publishing") {
                Toggle("Form is live", isOn: $draft.isActive)
                Toggle("Show progress bar", isOn: $draft.showProgressBar)
                Toggle("Flag new responses for review", isOn: $draft.notifyAdmin)
                TextField("Thank-you message", text: $draft.thankYouMessage, axis: .vertical).lineLimit(2...6)
                TextField("Optional redirect URL", text: $draft.redirectURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Section("Header media") {
                Picker("Media", selection: $draft.headerMediaType) { Text("None").tag(""); Text("Image").tag("image"); Text("Video").tag("video"); Text("Link").tag("link") }
                if !draft.headerMediaType.isEmpty {
                    TextField("Media URL", text: $draft.headerMediaURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Caption", text: $draft.headerMediaCaption)
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(context.form == nil ? "New Form" : "Edit Form")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "Saving…" : "Save") { Task { await save() } }.disabled(isSaving) }
            ToolbarItem(placement: .keyboard) { Spacer(); Button("Done") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } }
        }
        .alert("Could not save form", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) { Button("OK") { errorMessage = nil } } message: { Text(errorMessage ?? "") }
    }

    @ViewBuilder private func collectionToggle(_ title: String, value: Binding<Bool>, required: Binding<Bool>) -> some View {
        Toggle(title, isOn: value)
        if value.wrappedValue { Toggle("Require \(title.replacingOccurrences(of: "Collect ", with: "").lowercased())", isOn: required) }
    }

    @MainActor private func save() async {
        if let validation = draft.validationMessage { errorMessage = validation; return }
        isSaving = true; defer { isSaving = false }
        do { let saved = try await api.adminSaveForm(session: session, form: context.form, draft: draft); XertHaptics.play(.success); onSaved(saved) }
        catch { XertHaptics.play(.error); errorMessage = error.localizedDescription }
    }
}

private struct AdminFormQuestionEditor: View {
    @Binding var question: AdminFormQuestion
    let questions: [AdminFormQuestion]

    private var choiceOptions: [String] { question.type == "yes_no" ? ["Yes", "No"] : question.options ?? [] }
    private var optionsText: Binding<String> { Binding(get: { (question.options ?? []).joined(separator: "\n") }, set: { question.options = $0.split(separator: "\n", omittingEmptySubsequences: true).map(String.init) }) }

    var body: some View {
        Form {
            Section("Field") {
                Picker("Type", selection: $question.type) { ForEach(AdminFormDraft.fieldTypes, id: \.self) { Text(fieldTypeLabel($0)).tag($0) } }
                if ["section_break", "statement"].contains(question.type) {
                    TextField("Content", text: Binding(get: { question.content ?? "" }, set: { question.content = $0 }), axis: .vertical)
                } else {
                    TextField("Question or label", text: $question.question, axis: .vertical)
                    TextField("Helper text", text: optional($question.description), axis: .vertical)
                    Toggle("Required", isOn: $question.required)
                }
                Toggle("Hidden", isOn: Binding(get: { question.hidden ?? false }, set: { question.hidden = $0 }))
            }
            if ["single_choice", "multiple_choice", "dropdown"].contains(question.type) {
                Section("Options") { TextField("One option per line", text: optionsText, axis: .vertical).lineLimit(4...12); Toggle("Allow Other", isOn: Binding(get: { question.allow_other ?? false }, set: { question.allow_other = $0 })) }
            }
            if ["linear_scale", "star_rating"].contains(question.type) {
                Section("Scale") { Stepper("Minimum: \(question.scale_min ?? 1)", value: Binding(get: { question.scale_min ?? 1 }, set: { question.scale_min = $0 }), in: 0...10); Stepper("Maximum: \(question.scale_max ?? 10)", value: Binding(get: { question.scale_max ?? 10 }, set: { question.scale_max = $0 }), in: 1...20); TextField("Minimum label", text: optional($question.scale_min_label)); TextField("Maximum label", text: optional($question.scale_max_label)) }
            }
            if ["single_choice", "multiple_choice", "dropdown", "yes_no"].contains(question.type), !choiceOptions.isEmpty {
                Section("Skip logic") {
                    ForEach(choiceOptions, id: \.self) { option in
                        Picker("If \(option)", selection: skipTarget(option)) {
                            Text("Next question").tag(0)
                            ForEach(Array(questions.enumerated()), id: \.element.id) { index, destination in
                                Text("Q\(index + 1) · \(destination.displayTitle)").tag(index + 1)
                            }
                        }
                    }
                }
            }
            Section("Media") {
                Picker("Attachment", selection: optional($question.media_type)) { Text("None").tag(""); Text("Image").tag("image"); Text("Video").tag("video"); Text("Link").tag("link") }
                if !(question.media_type ?? "").isEmpty { TextField("Media URL", text: optional($question.media_url)).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled(); TextField("Caption", text: optional($question.media_caption)) }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Edit Field")
    }

    private func optional(_ binding: Binding<String?>) -> Binding<String> { Binding(get: { binding.wrappedValue ?? "" }, set: { binding.wrappedValue = $0.nilIfEmpty }) }
    private func skipTarget(_ option: String) -> Binding<Int> { Binding(get: { question.skip_rules?.first(where: { $0.option == option })?.skip_to ?? 0 }, set: { target in var rules = (question.skip_rules ?? []).filter { $0.option != option }; if target > 0 { rules.append(AdminFormSkipRule(option: option, skip_to: target)) }; question.skip_rules = rules }) }
}

private struct AdminFormDetailView: View {
    let session: AuthSession
    @State var form: AdminForm
    let onUpdated: (AdminForm) -> Void
    let onArchived: () -> Void
    @State private var responses: [AdminFormResponse] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var editor: AdminFormEditorContext?
    @State private var showingArchive = false
    private let api = XertAPI()

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack { Text(form.is_active ? "LIVE" : "PAUSED").font(.caption.bold()).foregroundStyle(form.is_active ? Color.green : .secondary); Spacer(); Text("\(form.response_count) responses").font(.caption).foregroundStyle(.secondary) }
                    Text(form.title).font(XertTheme.displayFont(size: 30, relativeTo: .title)).textCase(.uppercase)
                    if !form.description.isEmpty { Text(form.description).foregroundStyle(.secondary) }
                }.padding(.vertical, 6)
            }
            Section("Share") {
                ShareLink(item: form.publicURL, subject: Text(form.title), message: Text("Complete this XERT form")) { Label("Share public link", systemImage: "square.and.arrow.up") }
                Link(destination: form.publicURL) { Label("Preview public form", systemImage: "safari") }
            }
            Section("Responses") {
                if isLoading { ProgressView("Loading responses…") }
                else if responses.isEmpty { Text("No responses yet").foregroundStyle(.secondary) }
                ForEach(responses) { response in
                    NavigationLink { AdminFormResponseView(session: session, form: form, response: response) { status in if let index = responses.firstIndex(where: { $0.id == response.id }) { responses[index] = AdminFormResponse(id: response.id, form_id: response.form_id, answers: response.answers, respondent_name: response.respondent_name, respondent_email: response.respondent_email, respondent_phone: response.respondent_phone, status: status, completed_at: response.completed_at, time_taken_seconds: response.time_taken_seconds, created_at: response.created_at) } } } label: {
                        VStack(alignment: .leading, spacing: 3) { HStack { Text(response.displayName); Spacer(); Text(response.status.replacingOccurrences(of: "_", with: " ").uppercased()).font(.caption2.bold()).foregroundStyle(response.status == "new" ? Color.xertSteel : .secondary) }; Text(response.completed_at.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
            Section("Controls") {
                Button(form.is_active ? "Pause responses" : "Publish form") { Task { await toggleLive() } }
                Button("Edit form") { editor = AdminFormEditorContext(form: form) }
                Button("Archive form", role: .destructive) { showingArchive = true }
            }
        }
        .navigationTitle("Form")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loadResponses() }
        .task { await loadResponses() }
        .sheet(item: $editor) { context in NavigationStack { AdminFormEditorView(session: session, context: context) { saved in form = saved; onUpdated(saved); editor = nil } } }
        .confirmationDialog("Archive this form?", isPresented: $showingArchive, titleVisibility: .visible) { Button("Archive form", role: .destructive) { Task { await archive() } } } message: { Text("The public link will stop accepting responses. Existing response history is preserved.") }
        .alert("Forms & Surveys", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) { Button("OK") { errorMessage = nil } } message: { Text(errorMessage ?? "") }
    }

    @MainActor private func loadResponses() async { guard !isLoading else { return }; isLoading = true; defer { isLoading = false }; do { responses = try await api.adminFormResponses(session: session, formID: form.id) } catch { errorMessage = error.localizedDescription } }
    @MainActor private func toggleLive() async { var draft = AdminFormDraft(form: form); draft.isActive.toggle(); do { form = try await api.adminSaveForm(session: session, form: form, draft: draft); onUpdated(form); XertHaptics.play(.success) } catch { errorMessage = error.localizedDescription } }
    @MainActor private func archive() async { do { try await api.adminArchiveForm(session: session, form: form); XertHaptics.play(.success); onArchived() } catch { errorMessage = error.localizedDescription } }
}

private struct AdminFormResponseView: View {
    let session: AuthSession
    let form: AdminForm
    let response: AdminFormResponse
    let onStatusChanged: (String) -> Void
    @State private var status: String
    @State private var errorMessage: String?
    private let api = XertAPI()

    init(session: AuthSession, form: AdminForm, response: AdminFormResponse, onStatusChanged: @escaping (String) -> Void) {
        self.session = session; self.form = form; self.response = response; self.onStatusChanged = onStatusChanged; _status = State(initialValue: response.status)
    }

    var body: some View {
        List {
            Section("Respondent") {
                LabeledContent("Name", value: response.respondent_name ?? "Not supplied")
                if let email = response.respondent_email,
                   let url = URL(string: "mailto:\(email)") {
                    Link(email, destination: url)
                }
                if let phone = response.respondent_phone,
                   let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(phone, destination: url)
                }
                LabeledContent("Completed", value: response.completed_at.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Time", value: "\(response.time_taken_seconds)s")
            }
            Section("Status") { Picker("Status", selection: $status) { Text("New").tag("new"); Text("Reviewed").tag("reviewed"); Text("Followed up").tag("followed_up"); Text("Closed").tag("closed") }.onChange(of: status) { value in Task { await updateStatus(value) } } }
            Section("Answers") {
                ForEach(form.questions.filter { !["section_break", "statement"].contains($0.type) }) { question in
                    VStack(alignment: .leading, spacing: 5) { Text(question.question).font(.caption).foregroundStyle(.secondary); Text(response.answers[question.id]?.displayValue ?? "—").textSelection(.enabled) }.padding(.vertical, 3)
                }
            }
        }
        .navigationTitle(response.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Could not update response", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) { Button("OK") { errorMessage = nil } } message: { Text(errorMessage ?? "") }
    }

    @MainActor private func updateStatus(_ value: String) async { do { try await api.adminUpdateFormResponseStatus(session: session, responseID: response.id, status: value); onStatusChanged(value); XertHaptics.play(.selection) } catch { status = response.status; errorMessage = error.localizedDescription } }
}

private func formTypeLabel(_ value: String) -> String { ["contact":"Contact Form","registration":"Registration","application":"Application","feedback":"Feedback","booking":"Booking Request","survey":"Survey","quiz":"Quiz / Assessment","waiver":"Waiver / Consent","order":"Order / Request","custom":"Custom Form"][value] ?? value.replacingOccurrences(of: "_", with: " ").capitalized }
private func fieldTypeLabel(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }
