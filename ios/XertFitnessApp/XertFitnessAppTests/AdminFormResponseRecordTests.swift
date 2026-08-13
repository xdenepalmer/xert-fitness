import XCTest
import CoreImage
import UIKit
@testable import XertFitness

final class AdminFormResponseRecordTests: XCTestCase {
    func testEmailDeduplicationRequiresARequiredEmailField() {
        var draft = AdminFormDraft()
        draft.questions[0].question = "Your feedback"
        draft.setOneResponsePerEmail(true)

        XCTAssertTrue(draft.oneResponsePerEmail)
        XCTAssertTrue(draft.collectEmail)
        XCTAssertTrue(draft.collectEmailRequired)
        XCTAssertNil(draft.validationMessage)

        draft.collectEmailRequired = false

        XCTAssertEqual(
            draft.validationMessage,
            "Require email before limiting responses by email."
        )

        draft.collectEmailRequired = true
        XCTAssertNil(draft.validationMessage)

        draft.setOneResponsePerEmail(false)
        XCTAssertFalse(draft.oneResponsePerEmail)
    }

    func testSubmissionRecordPrefersCapturedSnapshotAndPreservesArchivedAnswers() {
        let response = makeResponse(
            answers: [
                "consent": .string("I agree"),
                "removed-field": .string("Historical value"),
                "removed-signature": .string("data:image/png;base64,not-valid-image")
            ],
            snapshot: snapshot(
                source: "captured_at_submission",
                title: "Original waiver",
                questions: [
                    question(id: "intro", type: "section_break", content: "Agreement"),
                    question(id: "consent", question: "I accept the original terms")
                ]
            )
        )

        let record = AdminFormSubmissionRecord(form: currentForm(), response: response)

        XCTAssertEqual(record.title, "Original waiver")
        XCTAssertEqual(record.provenanceLabel, "Form as submitted")
        XCTAssertTrue(record.usesSubmissionSnapshot)
        XCTAssertEqual(record.items.map(\.id), ["intro", "consent", "removed-field", "removed-signature"])

        guard let archivedItem = record.items.first(where: { $0.id == "removed-field" }),
              case .answer(let archived) = archivedItem else {
            return XCTFail("Expected the unknown answer to remain in the record")
        }
        XCTAssertTrue(archived.isArchivedAnswer)
        XCTAssertEqual(archived.title, "Archived answer")
        XCTAssertEqual(archived.answer, .string("Historical value"))
        guard let signatureItem = record.items.last,
              case .answer(let signature) = signatureItem else {
            return XCTFail("Expected the archived signature to remain in the record")
        }
        XCTAssertEqual(signature.type, "signature")
        XCTAssertEqual(
            AdminFormResponseValueFormatter.displayText(for: signature.answer, fieldType: signature.type),
            "Signature captured - preview unavailable"
        )
    }

    func testSubmissionRecordPreservesHeaderAndPerQuestionMediaAsTextualReferences() throws {
        let response = makeResponse(
            answers: ["photo-consent": .string("Yes")],
            snapshot: snapshot(
                source: "captured_at_submission",
                title: "Media waiver",
                questions: [
                    question(
                        id: "media-section",
                        type: "section_break",
                        content: "Before you continue",
                        description: "Review the information below.",
                        mediaType: "video",
                        mediaURL: "https://cdn.example.com/original-intro.mp4",
                        mediaCaption: "Original orientation video"
                    ),
                    question(
                        id: "media-statement",
                        type: "statement",
                        content: "Photo use summary",
                        description: "The complete consent wording is stored here.",
                        mediaType: "image",
                        mediaURL: "https://cdn.example.com/photo-example.jpg",
                        mediaCaption: "Example campaign image"
                    ),
                    question(
                        id: "photo-consent",
                        type: "yes_no",
                        question: "Do you consent?",
                        description: "Answer after reading the form content.",
                        mediaType: "link",
                        mediaURL: "https://example.com/reference",
                        mediaCaption: "Supporting reference"
                    )
                ],
                headerMediaType: "image",
                headerMediaURL: "https://cdn.example.com/original-header.jpg",
                headerMediaCaption: "Waiver header"
            )
        )

        let record = AdminFormSubmissionRecord(form: currentForm(), response: response)

        let header = try XCTUnwrap(record.headerMedia)
        XCTAssertEqual(header.type, "image")
        XCTAssertEqual(header.url, "https://cdn.example.com/original-header.jpg")
        XCTAssertEqual(header.caption, "Waiver header")

        guard case .section(let section) = record.items[0] else {
            return XCTFail("Expected the captured section")
        }
        XCTAssertEqual(section.description, "Review the information below.")
        XCTAssertEqual(section.media?.type, "video")
        XCTAssertEqual(section.media?.caption, "Original orientation video")

        guard case .statement(let statement) = record.items[1] else {
            return XCTFail("Expected the captured statement")
        }
        XCTAssertEqual(statement.description, "The complete consent wording is stored here.")
        XCTAssertEqual(statement.media?.url, "https://cdn.example.com/photo-example.jpg")

        guard case .answer(let answer) = record.items[2] else {
            return XCTFail("Expected the captured answer field")
        }
        XCTAssertEqual(answer.description, "Answer after reading the form content.")
        XCTAssertEqual(answer.media?.type, "link")
        XCTAssertEqual(answer.media?.url, "https://example.com/reference")
        XCTAssertTrue(AdminFormMediaReference.preservationNote.contains("not embedded or downloaded"))
        XCTAssertTrue(AdminFormMediaReference.preservationNote.contains("Legal or consent wording"))
    }

    func testCapturedNoHeaderMediaNeverFallsBackToAChangedCurrentForm() {
        let response = makeResponse(
            answers: [:],
            snapshot: snapshot(
                source: "captured_at_submission",
                title: "Original no-media form",
                questions: [question(id: "field", question: "Original field")]
            )
        )
        let changedForm = currentForm(
            headerMediaType: "image",
            headerMediaURL: "https://example.com/added-later.jpg",
            headerMediaCaption: "Added after submission"
        )

        let record = AdminFormSubmissionRecord(form: changedForm, response: response)

        XCTAssertNil(record.headerMedia)
    }

    func testSubmissionRecordAppliesSnapshotBranchingWithoutImplyingSkippedFieldsWereSeen() {
        var trigger = question(id: "trigger", type: "yes_no", question: "Do you need details?")
        trigger.skip_rules = [AdminFormSkipRule(option: "No", skip_to: 4)]
        let response = makeResponse(
            answers: [
                "trigger": .string("No"),
                "skipped-answer": .string("Unexpected legacy value"),
                "visible": .string("Done")
            ],
            snapshot: snapshot(
                source: "captured_at_submission",
                title: "Branching form",
                questions: [
                    trigger,
                    question(id: "skipped-statement", type: "statement", content: "Only on the Yes path"),
                    question(id: "skipped-answer", question: "Also only on the Yes path"),
                    question(id: "visible", question: "Final field")
                ]
            )
        )

        let record = AdminFormSubmissionRecord(form: currentForm(), response: response)

        XCTAssertFalse(record.items.contains { $0.id == "skipped-statement" })
        XCTAssertEqual(record.items.filter { $0.id == "skipped-answer" }.count, 1)
        guard let branchedItem = record.items.first(where: { $0.id == "skipped-answer" }),
              case .answer(let malformedBranchAnswer) = branchedItem else {
            return XCTFail("Expected a preserved branched-field answer")
        }
        XCTAssertTrue(malformedBranchAnswer.isArchivedAnswer)
        XCTAssertTrue(malformedBranchAnswer.description?.contains("not presented") == true)
        XCTAssertTrue(record.items.contains { $0.id == "visible" })
    }

    func testStaleAnswerForAnAlreadySkippedControlCannotChangeCanonicalBranch() {
        var firstControl = question(id: "q1", type: "yes_no", question: "Use the short path?")
        firstControl.skip_rules = [AdminFormSkipRule(option: "Yes", skip_to: 4)]
        var staleControl = question(id: "q2", type: "yes_no", question: "Stale hidden control")
        staleControl.skip_rules = [AdminFormSkipRule(option: "Yes", skip_to: 6)]

        let response = makeResponse(
            answers: [
                "q1": .string("Yes"),
                "q2": .string("Yes"),
                "q4": .string("Still shown"),
                "q5": .string("Also shown")
            ],
            snapshot: snapshot(
                source: "captured_at_submission",
                title: "Nested branching form",
                questions: [
                    firstControl,
                    staleControl,
                    question(id: "q3", question: "Skipped with q2"),
                    question(id: "q4", question: "Canonical destination"),
                    question(id: "q5", question: "Final field")
                ]
            )
        )

        let record = AdminFormSubmissionRecord(form: currentForm(), response: response)

        XCTAssertEqual(record.items.filter { $0.id == "q2" }.count, 1)
        guard let staleItem = record.items.first(where: { $0.id == "q2" }),
              case .answer(let staleAnswer) = staleItem else {
            return XCTFail("Expected the stale hidden answer to be preserved as archived data")
        }
        XCTAssertTrue(staleAnswer.isArchivedAnswer)
        XCTAssertTrue(staleAnswer.description?.contains("not presented") == true)
        XCTAssertFalse(record.items.contains { $0.id == "q3" })
        XCTAssertTrue(record.items.contains { $0.id == "q4" })
        XCTAssertTrue(record.items.contains { $0.id == "q5" })
    }

    func testLegacyBackfillIsNotPresentedAsAnExactHistoricalSnapshot() {
        let response = makeResponse(
            answers: ["consent": .boolean(true)],
            snapshot: snapshot(
                source: "legacy_backfill",
                title: "Recovered waiver",
                questions: [
                    question(id: "legacy-section", type: "section_break", content: "Recovered layout"),
                    question(id: "legacy-terms", type: "statement", content: "Recovered terms"),
                    question(id: "consent", question: "Recovered label")
                ]
            )
        )

        let record = AdminFormSubmissionRecord(form: currentForm(), response: response)

        XCTAssertFalse(record.usesSubmissionSnapshot)
        XCTAssertTrue(record.provenanceLabel.contains("reconstructed"))
        XCTAssertTrue(record.provenanceLabel.contains("not guaranteed exact"))
        XCTAssertFalse(record.items.contains { $0.id == "legacy-section" })
        XCTAssertFalse(record.items.contains { $0.id == "legacy-terms" })
        XCTAssertTrue(record.items.contains { item in
            guard case .section(let row) = item else { return false }
            return row.text == "Reconstructed form layout - not verified as presented"
        })
        XCTAssertTrue(record.items.contains { item in
            guard case .statement(let row) = item else { return false }
            return row.text == "Reconstructed statement: Recovered terms"
        })
    }

    func testResponseDecodingToleratesSnapshotFieldsFromDifferentRolloutVersions() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let response = try decoder.decode(AdminFormResponse.self, from: Data("""
        {
          "id":"00000000-0000-0000-0000-000000000001",
          "form_id":"00000000-0000-0000-0000-000000000002",
          "answers":{},
          "form_snapshot":{"version":1,"snapshot_source":"captured_at_submission","title":"Partial snapshot","header_media_type":"image","header_media_url":"https://example.com/header.jpg","header_media_caption":"Original header"},
          "respondent_name":null,
          "respondent_email":null,
          "respondent_phone":null,
          "status":"new",
          "completed_at":"2026-08-13T03:00:00Z",
          "time_taken_seconds":10,
          "source_url":"https://www.xertfitness.com.au/forms/partial",
          "created_at":"2026-08-13T03:00:00Z"
        }
        """.utf8))

        XCTAssertEqual(response.form_snapshot?.title, "Partial snapshot")
        XCTAssertNil(response.form_snapshot?.questions)
        XCTAssertEqual(response.form_snapshot?.snapshot_source, "captured_at_submission")
        XCTAssertEqual(response.form_snapshot?.header_media_type, "image")
        XCTAssertEqual(response.form_snapshot?.header_media_url, "https://example.com/header.jpg")
        XCTAssertEqual(response.form_snapshot?.header_media_caption, "Original header")
        let record = AdminFormSubmissionRecord(form: currentForm(), response: response)
        XCTAssertFalse(record.usesSubmissionSnapshot)
    }

    func testFileAnswerFormattingIncludesNameTypeAndHumanReadableSize() {
        let answer = AdminFormAnswer.object([
            "name": .string("clearance.pdf"),
            "type": .string("application/pdf"),
            "size": .number(2_048)
        ])

        let output = AdminFormResponseValueFormatter.displayText(for: answer, fieldType: "file_upload")

        XCTAssertTrue(output.contains("clearance.pdf"))
        XCTAssertTrue(output.contains("application/pdf"))
        XCTAssertFalse(output.contains("data:"))
    }

    func testStructuredFormAnswersRetainHumanFormOrder() throws {
        let address = AdminFormAnswer.object([
            "country": .string("Australia"),
            "postcode": .string("4000"),
            "street": .string("1 XERT Lane"),
            "suburb": .string("Brisbane")
        ])

        let output = AdminFormResponseValueFormatter.displayText(for: address, fieldType: "address")

        XCTAssertLessThan(try XCTUnwrap(output.range(of: "Street")?.lowerBound), try XCTUnwrap(output.range(of: "Suburb")?.lowerBound))
        XCTAssertLessThan(try XCTUnwrap(output.range(of: "Suburb")?.lowerBound), try XCTUnwrap(output.range(of: "Postcode")?.lowerBound))
        XCTAssertLessThan(try XCTUnwrap(output.range(of: "Postcode")?.lowerBound), try XCTUnwrap(output.range(of: "Country")?.lowerBound))
    }

    func testBrandedQRCodeIsBoundedAndRemainsMachineReadable() throws {
        let publicURL = try XCTUnwrap(URL(string: "https://www.xertfitness.com.au/forms/member-waiver"))
        let image = try AdminFormQRCode.image(publicURL: publicURL)

        XCTAssertEqual(Int(image.size.width), AdminFormQRCode.pixelDimension)
        XCTAssertEqual(Int(image.size.height), AdminFormQRCode.pixelDimension)
        XCTAssertLessThanOrEqual(AdminFormQRCode.logoWidthRatio, 0.18)
        XCTAssertLessThanOrEqual(AdminFormQRCode.protectedLogoWidthRatio, 0.20)
        XCTAssertNotNil(UIImage(named: "XertQRLogo"))

        let detector = try XCTUnwrap(CIDetector(
            ofType: CIDetectorTypeQRCode,
            context: nil,
            options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]
        ))
        let ciImage = try XCTUnwrap(CIImage(image: image))
        let messages = detector.features(in: ciImage)
            .compactMap { ($0 as? CIQRCodeFeature)?.messageString }
        XCTAssertTrue(messages.contains(publicURL.absoluteString))
    }

    private func currentForm(
        headerMediaType: String? = nil,
        headerMediaURL: String? = nil,
        headerMediaCaption: String? = nil
    ) -> AdminForm {
        AdminForm(
            id: UUID(),
            title: "Currently edited form",
            description: "Current description",
            form_type: "waiver",
            slug: "current-waiver",
            questions: [question(id: "current", question: "Current label")],
            is_active: true,
            show_progress_bar: true,
            thank_you_message: "Thanks",
            redirect_url: nil,
            header_media_type: headerMediaType,
            header_media_url: headerMediaURL,
            header_media_caption: headerMediaCaption,
            collect_name: true,
            collect_name_required: false,
            collect_email: true,
            collect_email_required: false,
            collect_phone: false,
            collect_phone_required: false,
            one_response_per_email: false,
            notify_admin: true,
            tags: [],
            response_count: 1,
            created_at: Date(timeIntervalSince1970: 1_700_000_000),
            updated_at: "2026-08-13T03:00:00Z"
        )
    }

    private func makeResponse(
        answers: [String: AdminFormAnswer],
        snapshot: AdminFormSnapshot?
    ) -> AdminFormResponse {
        AdminFormResponse(
            id: UUID(),
            form_id: UUID(),
            answers: answers,
            form_snapshot: snapshot,
            respondent_name: "Alex Runner",
            respondent_email: "alex@example.com",
            respondent_phone: "0400 123 456",
            status: "new",
            completed_at: Date(timeIntervalSince1970: 1_700_000_000),
            time_taken_seconds: 72,
            source_url: "https://www.xertfitness.com.au/forms/original-waiver",
            created_at: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func snapshot(
        source: String,
        title: String,
        questions: [AdminFormQuestion],
        headerMediaType: String? = nil,
        headerMediaURL: String? = nil,
        headerMediaCaption: String? = nil
    ) -> AdminFormSnapshot {
        AdminFormSnapshot(
            version: 1,
            snapshot_source: source,
            title: title,
            description: "The original form description",
            form_type: "waiver",
            slug: "original-waiver",
            header_media_type: headerMediaType,
            header_media_url: headerMediaURL,
            header_media_caption: headerMediaCaption,
            questions: questions,
            collect_name: true,
            collect_name_required: false,
            collect_email: true,
            collect_email_required: false,
            collect_phone: false,
            collect_phone_required: false
        )
    }

    private func question(
        id: String,
        type: String = "short_text",
        question: String = "",
        content: String? = nil,
        description: String? = nil,
        mediaType: String? = nil,
        mediaURL: String? = nil,
        mediaCaption: String? = nil
    ) -> AdminFormQuestion {
        AdminFormQuestion(
            id: id,
            type: type,
            question: question,
            description: description,
            required: false,
            hidden: false,
            placeholder: nil,
            options: nil,
            allow_other: false,
            scale_min: nil,
            scale_max: nil,
            scale_min_label: nil,
            scale_max_label: nil,
            media_type: mediaType,
            media_url: mediaURL,
            media_caption: mediaCaption,
            correct_answer: nil,
            points: nil,
            content: content,
            skip_rules: []
        )
    }
}
