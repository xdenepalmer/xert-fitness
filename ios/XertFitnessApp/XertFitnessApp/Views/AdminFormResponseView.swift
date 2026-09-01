import Foundation
import PDFKit
import SwiftUI
import UIKit

struct AdminFormResponseView: View {
    let session: AuthSession
    let form: AdminForm
    let response: AdminFormResponse
    let onStatusChanged: (String) -> Void

    @State private var status: String
    @State private var persistedStatus: String
    @State private var resolvedResponse: AdminFormResponse?
    @State private var isLoadingRecord = false
    @State private var recordLoadError: String?
    @State private var isUpdatingStatus = false
    @State private var errorMessage: String?
    @State private var pdfURL: URL?
    @State private var isPreparingPDF = false
    @State private var showingPDFPreview = false
    private let api = XertAPI()

    private var activeResponse: AdminFormResponse { resolvedResponse ?? response }

    private var record: AdminFormSubmissionRecord {
        AdminFormSubmissionRecord(form: form, response: activeResponse)
    }

    init(
        session: AuthSession,
        form: AdminForm,
        response: AdminFormResponse,
        onStatusChanged: @escaping (String) -> Void
    ) {
        self.session = session
        self.form = form
        self.response = response
        self.onStatusChanged = onStatusChanged
        _status = State(initialValue: response.status)
        _persistedStatus = State(initialValue: response.status)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                responseControls
                if let recordLoadError, resolvedResponse == nil {
                    unavailableRecord(message: recordLoadError)
                } else if isLoadingRecord && resolvedResponse == nil {
                    loadingRecord
                } else if resolvedResponse != nil {
                    submissionPaper
                    privacyNote
                }
            }
            .xertOwnerContentPadding()
        }
        .xertOwnerScreen()
        .navigationTitle(response.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { responseActions }
        .refreshable { await loadRecord() }
        .task { await loadRecord() }
        .onDisappear { discardPDF() }
        .sheet(isPresented: $showingPDFPreview) { pdfPreviewSheet }
        .alert(
            "Form response",
            isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )
        ) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    @ToolbarContentBuilder
    private var responseActions: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Menu {
                if resolvedResponse == nil {
                    Button { Task { await loadRecord() } } label: {
                        Label("Retry full response", systemImage: "arrow.clockwise")
                    }
                    .disabled(isLoadingRecord)
                } else if let pdfURL {
                    Button { showingPDFPreview = true } label: {
                        Label("Preview printable PDF", systemImage: "doc.text.magnifyingglass")
                    }
                    ShareLink(
                        item: pdfURL,
                        subject: Text("\(record.title) - \(response.displayName)"),
                        message: Text("Confidential XERT form response")
                    ) {
                        Label("Share or save PDF", systemImage: "square.and.arrow.up")
                    }
                    Button { printPDF() } label: {
                        Label("Print PDF", systemImage: "printer")
                    }
                    Button { preparePDF() } label: {
                        Label("Rebuild PDF", systemImage: "arrow.clockwise")
                    }
                } else {
                    Button { preparePDF(showPreview: true) } label: {
                        Label(
                            isPreparingPDF ? "Preparing PDF…" : "Prepare printable PDF",
                            systemImage: "doc.richtext"
                        )
                    }
                    .disabled(isPreparingPDF)
                }
            } label: {
                Label("Response actions", systemImage: "ellipsis.circle")
            }
        }
    }

    @ViewBuilder
    private var pdfPreviewSheet: some View {
        if let pdfURL {
            NavigationStack {
                AdminFormResponsePDFPreview(url: pdfURL)
                    .navigationTitle("Printable response")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { showingPDFPreview = false }
                        }
                        ToolbarItemGroup(placement: .primaryAction) {
                            ShareLink(item: pdfURL) {
                                Label("Share PDF", systemImage: "square.and.arrow.up")
                            }
                            Button { printPDF() } label: {
                                Label("Print PDF", systemImage: "printer")
                            }
                        }
                    }
            }
        } else {
            VStack(spacing: 12) {
                Image(systemName: "doc.badge.ellipsis")
                    .font(.largeTitle)
                Text("PDF unavailable").font(.headline)
                Text("Close this preview and prepare the PDF again.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .padding(24)
        }
    }

    private var responseControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Response status", systemImage: "checklist")
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
                Spacer()
                if isUpdatingStatus { ProgressView().tint(Color.xertSteel) }
            }
            Picker("Response status", selection: $status) {
                Text("New").tag("new")
                Text("Reviewed").tag("reviewed")
                Text("Followed up").tag("followed_up")
                Text("Closed").tag("closed")
            }
            .pickerStyle(.menu)
            .tint(Color.xertSteel)
            .disabled(isUpdatingStatus || isLoadingRecord || resolvedResponse == nil)
            .onChange(of: status) { value in
                guard value != persistedStatus, !isUpdatingStatus else { return }
                Task { await updateStatus(value) }
            }

            contactActions

            Text(resolvedResponse == nil
                ? "Load the verified full response before changing its workflow status."
                : "Operational status is separate from the immutable submitted answers below.")
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.58))
        }
        .padding(15)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.2)))
    }

    private var loadingRecord: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.large)
                .tint(Color.xertSteel)
            Text("Loading the complete submitted form…")
                .font(.headline)
                .foregroundStyle(Color.xertOffWhite)
            Text("XERT is verifying the immutable form snapshot and every stored answer.")
                .font(.caption)
                .foregroundStyle(Color.xertPale.opacity(0.58))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
        .padding(20)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.2)))
        .accessibilityElement(children: .combine)
    }

    private func unavailableRecord(message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.shield.fill")
                .font(.largeTitle)
                .foregroundStyle(Color.orange)
            Text("Full response unavailable")
                .font(.headline)
                .foregroundStyle(Color.xertOffWhite)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.xertPale.opacity(0.68))
                .multilineTextAlignment(.center)
            Button { Task { await loadRecord() } } label: {
                Label("Try again", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.xertSteel)
            .disabled(isLoadingRecord)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding(20)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.orange.opacity(0.3)))
    }

    @ViewBuilder
    private var contactActions: some View {
        let email = activeResponse.respondent_email?.trimmingCharacters(in: .whitespacesAndNewlines)
        let phone = activeResponse.respondent_phone?.filter { $0.isNumber || $0 == "+" }
        if email?.nilIfEmpty != nil || phone?.nilIfEmpty != nil {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { contactLinks(email: email, phone: phone) }
                VStack(alignment: .leading, spacing: 8) { contactLinks(email: email, phone: phone) }
            }
        }
    }

    @ViewBuilder
    private func contactLinks(email: String?, phone: String?) -> some View {
        if let email = email?.nilIfEmpty,
           let address = email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let url = URL(string: "mailto:\(address)") {
            Link(destination: url) { Label("Email", systemImage: "envelope") }
                .buttonStyle(.bordered)
                .tint(Color.xertSteel)
        }
        if let phone = phone?.nilIfEmpty,
           let url = URL(string: "tel:\(phone)") {
            Link(destination: url) { Label("Call", systemImage: "phone") }
                .buttonStyle(.bordered)
                .tint(Color.xertSteel)
        }
    }

    private var submissionPaper: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                Text("XERT FITNESS")
                    .font(.caption.weight(.bold))
                    .tracking(1.5)
                    .foregroundStyle(Color.xertSteel)
                Text(record.title)
                    .font(.title.bold())
                    .foregroundStyle(Color.xertNavy)
                if !record.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(record.description)
                        .font(.subheadline)
                        .foregroundStyle(Color.xertNavy.opacity(0.68))
                }
                if let headerMedia = record.headerMedia {
                    mediaReference(headerMedia, label: "Header media")
                        .padding(.top, 4)
                }
                responseMetadata
            }
            .padding(20)

            Divider().overlay(Color.xertNavy.opacity(0.15))

            if record.items.isEmpty {
                Text("This response contains no form fields.")
                    .italic()
                    .foregroundStyle(Color.xertNavy.opacity(0.55))
                    .padding(20)
            } else {
                ForEach(record.items) { item in submissionItem(item) }
            }

            recordDetailsNote
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.xertSteel.opacity(0.2))
        )
        .shadow(color: .black.opacity(0.15), radius: 16, y: 7)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Completed form for \(activeResponse.displayName)")
    }

    private var recordDetailsNote: some View {
        Text(
            record.usesSubmissionSnapshot
                ? "Record details: Form definition preserved at submission."
                : "Record details: Submitted answers are original; labels and layout were reconstructed and may not be exact."
        )
        .font(.caption2)
        .foregroundStyle(Color.xertNavy.opacity(0.48))
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var responseMetadata: some View {
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 7) {
            metadataRow("Record ID", activeResponse.id.uuidString.lowercased())
            metadataRow("Form ID", activeResponse.form_id.uuidString.lowercased())
            metadataRow("Form type", record.formType.replacingOccurrences(of: "_", with: " ").capitalized)
            metadataRow("Respondent", metadataValue(activeResponse.respondent_name, wasCollected: record.collectsName))
            metadataRow("Email", metadataValue(activeResponse.respondent_email, wasCollected: record.collectsEmail))
            metadataRow("Phone", metadataValue(activeResponse.respondent_phone, wasCollected: record.collectsPhone))
            metadataRow("Completed", Self.completedFormatter.string(from: activeResponse.completed_at))
            metadataRow("Recorded", Self.completedFormatter.string(from: activeResponse.created_at))
            metadataRow("Time", Self.durationLabel(activeResponse.time_taken_seconds))
            metadataRow("Source page", activeResponse.source_url?.nilIfEmpty ?? "Not recorded")
        }
        .font(.caption)
        .padding(12)
        .background(Color.xertPale.opacity(0.42))
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .textSelection(.enabled)
    }

    private func metadataRow(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(Color.xertSteel)
            Text(value)
                .foregroundStyle(Color.xertNavy)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func metadataValue(_ value: String?, wasCollected: Bool) -> String {
        value?.nilIfEmpty ?? (wasCollected ? "Not supplied" : "Not collected")
    }

    @ViewBuilder
    private func submissionItem(_ item: AdminFormSubmissionItem) -> some View {
        switch item {
        case .section(let row):
            VStack(alignment: .leading, spacing: 8) {
                Text(row.text).font(.title3.bold()).foregroundStyle(Color.xertNavy)
                if let description = row.description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(Color.xertNavy.opacity(0.58))
                        .textSelection(.enabled)
                }
                if let media = row.media {
                    mediaReference(media, label: "Section media")
                }
                Rectangle().fill(Color.xertSteel.opacity(0.35)).frame(height: 1)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 8)
        case .statement(let row):
            VStack(alignment: .leading, spacing: 7) {
                Text(row.text)
                    .font(.subheadline)
                    .foregroundStyle(Color.xertNavy.opacity(0.76))
                if let description = row.description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(Color.xertNavy.opacity(0.58))
                }
                if let media = row.media {
                    mediaReference(media, label: "Statement media")
                }
            }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.xertPale.opacity(0.42))
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
                .textSelection(.enabled)
        case .answer(let row):
            answerRow(row)
        }
    }

    private func answerRow(_ row: AdminFormSubmissionAnswerRow) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if row.isArchivedAnswer {
                Label("ARCHIVED ANSWER", systemImage: "archivebox.fill")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color.orange)
            }
            Text(row.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.xertNavy)
            if let helper = row.description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty {
                Text(helper)
                    .font(.caption)
                    .foregroundStyle(Color.xertNavy.opacity(0.52))
            }
            if let media = row.media {
                mediaReference(media, label: "Question media")
            }
            if row.type == "signature",
               let image = AdminFormResponseValueFormatter.signatureImage(from: row.answer) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 340, maxHeight: 150)
                    .padding(8)
                    .background(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 5)
                            .stroke(Color.xertNavy.opacity(0.18))
                    )
                    .accessibilityLabel("Captured signature")
            } else {
                Text(
                    AdminFormResponseValueFormatter.displayText(
                        for: row.answer,
                        fieldType: row.type
                    )
                )
                .font(.body)
                .foregroundStyle(row.answer == nil ? Color.xertNavy.opacity(0.48) : Color.xertNavy)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(row.isArchivedAnswer ? Color.orange.opacity(0.055) : Color.clear)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.xertNavy.opacity(0.09))
                .frame(height: 1)
                .padding(.horizontal, 20)
        }
    }

    private func mediaReference(_ media: AdminFormMediaReference, label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(label.uppercased(), systemImage: "photo.on.rectangle.angled")
                .font(.caption2.weight(.bold))
                .foregroundStyle(Color.xertSteel)
            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 4) {
                mediaReferenceRow("Type", media.typeLabel)
                mediaReferenceRow("URL", media.url ?? "Not recorded")
                mediaReferenceRow("Caption", media.caption ?? "Not recorded")
            }
            .font(.caption2)
            Text(AdminFormMediaReference.preservationNote)
                .font(.caption2)
                .foregroundStyle(Color.xertNavy.opacity(0.55))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.xertPale.opacity(0.5))
        .overlay(
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .stroke(Color.xertSteel.opacity(0.2))
        )
        .textSelection(.enabled)
        .accessibilityElement(children: .combine)
    }

    private func mediaReferenceRow(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label.uppercased())
                .fontWeight(.bold)
                .foregroundStyle(Color.xertSteel)
            Text(value)
                .foregroundStyle(Color.xertNavy)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var privacyNote: some View {
        Label(
            "Confidential member information. Temporary PDF files are protected while the device is locked and removed when you leave this response.",
            systemImage: "lock.shield"
        )
        .font(.caption)
        .foregroundStyle(Color.xertPale.opacity(0.58))
    }

    @MainActor
    private func updateStatus(_ value: String) async {
        guard resolvedResponse != nil else {
            status = persistedStatus
            return
        }
        isUpdatingStatus = true
        defer { isUpdatingStatus = false }
        do {
            try await api.adminUpdateFormResponseStatus(
                session: session,
                responseID: response.id,
                status: value
            )
            persistedStatus = value
            onStatusChanged(value)
            XertHaptics.play(.selection)
            if pdfURL != nil { preparePDF() }
        } catch {
            status = persistedStatus
            XertHaptics.play(.error)
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func preparePDF(showPreview: Bool = false) {
        guard !isPreparingPDF else { return }
        guard let resolvedResponse else {
            errorMessage = "Load the complete response before preparing its PDF."
            return
        }
        isPreparingPDF = true
        defer { isPreparingPDF = false }
        discardPDF()
        do {
            pdfURL = try AdminFormResponsePDFExport.write(
                record: record,
                response: resolvedResponse,
                status: persistedStatus
            )
            if showPreview { showingPDFPreview = true }
        } catch {
            errorMessage = "The printable PDF could not be prepared. Please try again."
        }
    }

    @MainActor
    private func printPDF() {
        if pdfURL == nil { preparePDF() }
        guard let pdfURL else { return }
        do {
            try AdminFormResponsePrinter.present(
                fileURL: pdfURL,
                jobName: "\(record.title) - \(response.displayName)"
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func discardPDF() {
        AdminFormResponsePDFExport.removeExport(at: pdfURL)
        pdfURL = nil
    }

    @MainActor
    private func loadRecord() async {
        guard !isLoadingRecord else { return }
        isLoadingRecord = true
        recordLoadError = nil
        defer { isLoadingRecord = false }
        do {
            let loaded = try await api.adminFormResponse(session: session, responseID: response.id)
            guard loaded.id == response.id, loaded.form_id == form.id else {
                throw APIError(message: "XERT returned a different form response. Return to the list and refresh.")
            }
            discardPDF()
            resolvedResponse = loaded
            persistedStatus = loaded.status
            status = loaded.status
        } catch {
            if Task.isCancelled { return }
            if resolvedResponse == nil {
                recordLoadError = error.localizedDescription
            } else {
                errorMessage = "The latest response could not be verified. The previously loaded record remains visible."
            }
        }
    }

    private static let completedFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_AU")
        formatter.timeZone = TimeZone(identifier: "Australia/Brisbane")
        formatter.dateFormat = "d MMM yyyy, h:mm a zzz"
        return formatter
    }()

    private static func durationLabel(_ seconds: Int) -> String {
        let safeSeconds = max(seconds, 0)
        if safeSeconds < 60 { return "\(safeSeconds) seconds" }
        let minutes = safeSeconds / 60
        if minutes < 60 { return "\(minutes)m \(safeSeconds % 60)s" }
        return "\(minutes / 60)h \(minutes % 60)m"
    }
}

private struct AdminFormResponsePDFPreview: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = UIColor(Color.xertNavy)
        view.document = PDFDocument(url: url)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        if view.document == nil { view.document = PDFDocument(url: url) }
    }
}
