import Foundation
import ImageIO
import UIKit

enum AdminFormResponseValueFormatter {
    private static let maximumSignatureBytes = 2_000_000
    private static let maximumSignaturePixels = 16_000_000

    static func displayText(for answer: AdminFormAnswer?, fieldType: String) -> String {
        guard let answer else { return "No answer" }
        if case .null = answer { return "No answer" }
        if fieldType == "signature", signatureImage(from: answer) != nil {
            return "Signature captured"
        }
        if fieldType == "signature", signatureWasCaptured(answer) {
            return "Signature captured - preview unavailable"
        }
        if fieldType == "file_upload" { return fileDescription(answer) }
        if fieldType == "address" {
            return objectDescription(
                answer,
                preferredKeys: ["street", "suburb", "state", "postcode", "country"]
            ) ?? "No answer"
        }
        if fieldType == "name_fields" {
            return objectDescription(answer, preferredKeys: ["first", "last"]) ?? "No answer"
        }
        return structuredText(answer) ?? "No answer"
    }

    static func signatureImage(from answer: AdminFormAnswer?) -> UIImage? {
        guard let answer,
              case .string(let value) = answer,
              let comma = value.firstIndex(of: ",") else { return nil }
        let prefix = String(value[..<comma]).lowercased()
        guard prefix == "data:image/png;base64" || prefix == "data:image/jpeg;base64" else { return nil }
        let encoded = String(value[value.index(after: comma)...])
        guard !encoded.isEmpty,
              encoded.utf8.count <= ((maximumSignatureBytes + 2) / 3) * 4,
              let data = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters),
              !data.isEmpty,
              data.count <= maximumSignatureBytes,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) == 1,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
              width > 0,
              height > 0,
              width <= maximumSignaturePixels / height,
              let image = UIImage(data: data, scale: 1) else { return nil }
        return image
    }

    private static func signatureWasCaptured(_ answer: AdminFormAnswer?) -> Bool {
        guard let answer, case .string(let value) = answer else { return false }
        return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func fileDescription(_ answer: AdminFormAnswer) -> String {
        guard case .object(let values) = answer else {
            return structuredText(answer) ?? "No file details"
        }
        var details: [String] = []
        if let name = scalarText(values["name"]), !name.isEmpty { details.append(name) }
        if let type = scalarText(values["type"]), !type.isEmpty { details.append(type) }
        if let size = numericValue(values["size"]),
           size >= 0,
           size <= Double(Int64.max) {
            details.append(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
        }
        let knownKeys = Set(["name", "type", "size"])
        details.append(contentsOf: values.keys.sorted().compactMap { key in
            guard !knownKeys.contains(key), let value = structuredText(values[key]), !value.isEmpty else { return nil }
            return "\(key.replacingOccurrences(of: "_", with: " ").capitalized): \(value)"
        })
        return details.isEmpty ? "File details unavailable" : details.joined(separator: " - ")
    }

    private static func structuredText(_ answer: AdminFormAnswer?) -> String? {
        guard let answer else { return nil }
        switch answer {
        case .string(let value):
            return value.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        case .number(let value):
            return value.formatted()
        case .boolean(let value):
            return value ? "Yes" : "No"
        case .array(let values):
            let parts = values.compactMap { structuredText($0) }.filter { !$0.isEmpty }
            return parts.isEmpty ? nil : parts.joined(separator: ", ")
        case .object(let values):
            let parts = values.keys.sorted().compactMap { key -> String? in
                guard let value = structuredText(values[key]), !value.isEmpty else { return nil }
                let label = key.replacingOccurrences(of: "_", with: " ").capitalized
                return "\(label): \(value)"
            }
            return parts.isEmpty ? nil : parts.joined(separator: "\n")
        case .null:
            return nil
        }
    }

    private static func objectDescription(
        _ answer: AdminFormAnswer,
        preferredKeys: [String]
    ) -> String? {
        guard case .object(let values) = answer else { return structuredText(answer) }
        let orderedKeys = preferredKeys + values.keys
            .filter { !preferredKeys.contains($0) }
            .sorted()
        let parts = orderedKeys.compactMap { key -> String? in
            guard let value = structuredText(values[key]), !value.isEmpty else { return nil }
            let label = key.replacingOccurrences(of: "_", with: " ").capitalized
            return "\(label): \(value)"
        }
        return parts.isEmpty ? nil : parts.joined(separator: "\n")
    }

    private static func scalarText(_ answer: AdminFormAnswer?) -> String? {
        guard let answer else { return nil }
        switch answer {
        case .string(let value): return value
        case .number(let value): return value.formatted()
        case .boolean(let value): return value ? "Yes" : "No"
        default: return nil
        }
    }

    private static func numericValue(_ answer: AdminFormAnswer?) -> Double? {
        guard let answer else { return nil }
        switch answer {
        case .number(let value): return value
        case .string(let value): return Double(value)
        default: return nil
        }
    }
}

enum AdminFormResponsePDFExport {
    private static let pageBounds = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
    private static let rootDirectoryName = "xert-private-form-response-pdfs"

    private static var rootDirectory: URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(rootDirectoryName, isDirectory: true)
    }

    static func write(
        record: AdminFormSubmissionRecord,
        response: AdminFormResponse,
        status: String
    ) throws -> URL {
        let fileManager = FileManager.default
        let directory = rootDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let filename = safeFilename("\(record.title)-\(response.displayName)") + ".pdf"
        let fileURL = directory.appendingPathComponent(filename)
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = pdfData(record: record, response: response, status: status)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            return fileURL
        } catch {
            try? fileManager.removeItem(at: directory)
            throw error
        }
    }

    static func removeExport(at fileURL: URL?) {
        guard let fileURL else { return }
        let directory = fileURL.deletingLastPathComponent().standardizedFileURL
        guard directory.deletingLastPathComponent().standardizedFileURL == rootDirectory.standardizedFileURL else {
            return
        }
        try? FileManager.default.removeItem(at: directory)
    }

    static func pdfData(
        record: AdminFormSubmissionRecord,
        response: AdminFormResponse,
        status: String
    ) -> Data {
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [
            kCGPDFContextTitle as String: record.title,
            kCGPDFContextAuthor as String: "XERT Fitness",
            kCGPDFContextSubject as String: "Form submission \(response.id.uuidString.lowercased())"
        ]
        let renderer = UIGraphicsPDFRenderer(bounds: pageBounds, format: format)
        return renderer.pdfData { context in
            let canvas = PDFCanvas(context: context, responseID: response.id)
            canvas.beginPage()
            canvas.drawDocumentHeader(record: record)
            canvas.drawMetadata(record: record, response: response, status: status)
            canvas.drawItems(record.items)
        }
    }

    private static func safeFilename(_ value: String) -> String {
        let normalized = value.map { character -> Character in
            character.isLetter || character.isNumber || character == "-" || character == "_" ? character : "-"
        }
        let collapsed = String(normalized)
            .replacingOccurrences(of: #"-+"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return String((collapsed.nilIfEmpty ?? "xert-form-response").prefix(120))
    }
}

@MainActor
enum AdminFormResponsePrinter {
    static func present(fileURL: URL, jobName: String) throws {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw APIError(message: "The printable PDF is no longer available. Prepare it again.")
        }
        guard UIPrintInteractionController.isPrintingAvailable else {
            throw APIError(message: "Printing is not available on this device. Share the PDF to save or print it elsewhere.")
        }
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = jobName
        info.outputType = .general
        controller.printInfo = info
        controller.showsNumberOfCopies = true
        controller.printingItem = fileURL

        if UIDevice.current.userInterfaceIdiom == .pad {
            guard let view = activePresentationView else {
                throw APIError(message: "The print panel could not be opened. Please try again.")
            }
            let anchor = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 1, width: 1, height: 1)
            controller.present(from: anchor, in: view, animated: true, completionHandler: nil)
        } else {
            controller.present(animated: true, completionHandler: nil)
        }
    }

    private static var activePresentationView: UIView? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let window = scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
        var controller = window?.rootViewController
        while let presented = controller?.presentedViewController { controller = presented }
        if let navigation = controller as? UINavigationController { controller = navigation.visibleViewController }
        if let tabs = controller as? UITabBarController { controller = tabs.selectedViewController }
        return controller?.view ?? window
    }
}

private final class PDFCanvas {
    private let context: UIGraphicsPDFRendererContext
    private let responseID: UUID
    private let bounds = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
    private let horizontalMargin: CGFloat = 44
    private let contentTop: CGFloat = 52
    private let contentBottom: CGFloat = 54
    private var pageNumber = 0
    private var cursorY: CGFloat = 52

    private var contentWidth: CGFloat { bounds.width - horizontalMargin * 2 }
    private var maximumY: CGFloat { bounds.height - contentBottom }

    init(context: UIGraphicsPDFRendererContext, responseID: UUID) {
        self.context = context
        self.responseID = responseID
    }

    func beginPage() {
        context.beginPage()
        pageNumber += 1
        cursorY = contentTop
        drawPageFurniture()
    }

    func drawDocumentHeader(record: AdminFormSubmissionRecord) {
        drawText("XERT FITNESS", font: .systemFont(ofSize: 11, weight: .bold), color: .xertPDFSteel, spacingAfter: 8)
        drawText(record.title, font: .systemFont(ofSize: 27, weight: .bold), color: .xertPDFNavy, spacingAfter: 5)
        if !record.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            drawText(record.description, font: .systemFont(ofSize: 10.5), color: .darkGray, spacingAfter: 9)
        }
        if let headerMedia = record.headerMedia {
            drawMediaReference(headerMedia, label: "Header media")
        }
        drawText(
            record.provenanceLabel.uppercased(),
            font: .systemFont(ofSize: 8.5, weight: .bold),
            color: record.usesSubmissionSnapshot ? .xertPDFSteel : .systemOrange,
            spacingAfter: 16
        )
    }

    func drawMetadata(record: AdminFormSubmissionRecord, response: AdminFormResponse, status: String) {
        let labelWidth: CGFloat = 142
        let valueX = horizontalMargin + labelWidth + 18
        let valueWidth = contentWidth - labelWidth - 30
        let labelAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 7.5, weight: .bold),
            .foregroundColor: UIColor.xertPDFSteel
        ]
        let valueAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 9.5),
            .foregroundColor: UIColor.xertPDFNavy
        ]
        let rows = [
            ("Record ID", response.id.uuidString.lowercased()),
            ("Form ID", response.form_id.uuidString.lowercased()),
            ("Form type", record.formType.replacingOccurrences(of: "_", with: " ").capitalized),
            ("Respondent", metadataValue(response.respondent_name, wasCollected: record.collectsName)),
            ("Email", metadataValue(response.respondent_email, wasCollected: record.collectsEmail)),
            ("Phone", metadataValue(response.respondent_phone, wasCollected: record.collectsPhone)),
            ("Completed", Self.timestampFormatter.string(from: response.completed_at)),
            ("Recorded", Self.timestampFormatter.string(from: response.created_at)),
            ("Completion time", Self.duration(response.time_taken_seconds)),
            ("Source page", response.source_url?.nilIfEmpty ?? "Not recorded")
        ]
        let rowHeights = rows.map { _, value in
            max(17, measuredHeight(value, width: valueWidth, attributes: valueAttributes) + 4)
        }
        let boxHeight = rowHeights.reduce(20, +)
        ensureSpace(boxHeight + 12)
        let box = CGRect(x: horizontalMargin, y: cursorY - 8, width: contentWidth, height: boxHeight)
        UIColor.xertPDFPale.setFill()
        UIBezierPath(roundedRect: box, cornerRadius: 7).fill()
        for (index, row) in rows.enumerated() {
            let (label, value) = row
            let rowHeight = rowHeights[index]
            let labelRect = CGRect(x: horizontalMargin + 12, y: cursorY, width: labelWidth, height: rowHeight)
            let valueRect = CGRect(x: valueX, y: cursorY, width: valueWidth, height: rowHeight)
            (label.uppercased() as NSString).draw(
                with: labelRect,
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: labelAttributes,
                context: nil
            )
            (value as NSString).draw(
                with: valueRect,
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: valueAttributes,
                context: nil
            )
            cursorY += rowHeight
        }
        cursorY += 12
        drawOperationalStatus(status)
    }

    private func drawOperationalStatus(_ status: String) {
        ensureSpace(66)
        let box = CGRect(x: horizontalMargin, y: cursorY, width: contentWidth, height: 51)
        UIColor.systemOrange.withAlphaComponent(0.09).setFill()
        UIBezierPath(roundedRect: box, cornerRadius: 7).fill()
        UIColor.systemOrange.withAlphaComponent(0.45).setStroke()
        let border = UIBezierPath(roundedRect: box, cornerRadius: 7)
        border.lineWidth = 0.8
        border.stroke()
        ("OPERATIONAL STATUS AT EXPORT" as NSString).draw(
            in: CGRect(x: box.minX + 12, y: box.minY + 8, width: box.width - 24, height: 10),
            withAttributes: [
                .font: UIFont.systemFont(ofSize: 7.5, weight: .bold),
                .foregroundColor: UIColor.systemOrange
            ]
        )
        let statusText = status.replacingOccurrences(of: "_", with: " ").capitalized
        (statusText as NSString).draw(
            in: CGRect(x: box.minX + 12, y: box.minY + 21, width: box.width - 24, height: 14),
            withAttributes: [
                .font: UIFont.systemFont(ofSize: 10, weight: .semibold),
                .foregroundColor: UIColor.xertPDFNavy
            ]
        )
        ("Workflow metadata only - submitted content remains unchanged." as NSString).draw(
            in: CGRect(x: box.minX + 12, y: box.minY + 36, width: box.width - 24, height: 9),
            withAttributes: [
                .font: UIFont.systemFont(ofSize: 7.5),
                .foregroundColor: UIColor.darkGray
            ]
        )
        cursorY = box.maxY + 14
    }

    func drawItems(_ items: [AdminFormSubmissionItem]) {
        if items.isEmpty {
            drawText("This response contains no form fields.", font: .italicSystemFont(ofSize: 11), color: .gray, spacingAfter: 8)
            return
        }
        for item in items {
            switch item {
            case .section(let row): drawSection(row)
            case .statement(let row): drawStatement(row)
            case .answer(let row): drawAnswer(row)
            }
        }
    }

    private func drawSection(_ row: AdminFormSubmissionContentRow) {
        ensureSpace(row.media == nil ? 54 : 155)
        cursorY += 8
        drawText(row.text, font: .systemFont(ofSize: 16, weight: .bold), color: .xertPDFNavy, spacingAfter: 5)
        if let description = row.description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty {
            drawText(description, font: .systemFont(ofSize: 8.5), color: .gray, spacingAfter: 6)
        }
        if let media = row.media {
            drawMediaReference(media, label: "Section media")
        }
        UIColor.xertPDFSteel.withAlphaComponent(0.45).setFill()
        UIBezierPath(rect: CGRect(x: horizontalMargin, y: cursorY, width: contentWidth, height: 1)).fill()
        cursorY += 13
    }

    private func drawStatement(_ row: AdminFormSubmissionContentRow) {
        ensureSpace(row.media == nil ? 68 : 165)
        cursorY += 4
        UIColor.xertPDFPale.setFill()
        UIBezierPath(roundedRect: CGRect(x: horizontalMargin, y: cursorY, width: contentWidth, height: 5), cornerRadius: 2).fill()
        cursorY += 11
        drawText(row.text, font: .systemFont(ofSize: 10.5), color: .darkGray, indent: 10, spacingAfter: 5)
        if let description = row.description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty {
            drawText(description, font: .systemFont(ofSize: 8.5), color: .gray, indent: 10, spacingAfter: 6)
        }
        if let media = row.media {
            drawMediaReference(media, label: "Statement media")
        }
        cursorY += 8
    }

    private func drawAnswer(_ row: AdminFormSubmissionAnswerRow) {
        let signatureImage = row.type == "signature"
            ? AdminFormResponseValueFormatter.signatureImage(from: row.answer)
            : nil
        let mediaAllowance: CGFloat = row.media == nil ? 0 : 105
        ensureSpace((signatureImage == nil ? 64 : 170) + mediaAllowance)
        if row.isArchivedAnswer {
            drawText("ARCHIVED ANSWER", font: .systemFont(ofSize: 7.5, weight: .bold), color: .systemOrange, spacingAfter: 3)
        }
        drawText(row.title, font: .systemFont(ofSize: 10.5, weight: .semibold), color: .xertPDFNavy, spacingAfter: 3)
        if let helper = row.description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty {
            drawText(helper, font: .systemFont(ofSize: 8.5), color: .gray, spacingAfter: 5)
        }
        if let media = row.media {
            drawMediaReference(media, label: "Question media")
        }

        if let image = signatureImage {
            ensureSpace(118)
            let target = CGRect(x: horizontalMargin + 10, y: cursorY + 5, width: min(contentWidth - 20, 330), height: 98)
            UIColor(white: 0.99, alpha: 1).setFill()
            UIBezierPath(roundedRect: target, cornerRadius: 5).fill()
            UIColor(white: 0.82, alpha: 1).setStroke()
            UIBezierPath(roundedRect: target, cornerRadius: 5).stroke()
            image.draw(in: aspectFitRect(imageSize: image.size, bounds: target.insetBy(dx: 8, dy: 8)))
            cursorY = target.maxY + 12
        } else {
            drawText(
                AdminFormResponseValueFormatter.displayText(for: row.answer, fieldType: row.type),
                font: .systemFont(ofSize: 11),
                color: row.answer == nil ? .gray : .black,
                indent: 10,
                spacingAfter: 10
            )
        }
        UIColor(white: 0.87, alpha: 1).setFill()
        UIBezierPath(rect: CGRect(x: horizontalMargin, y: cursorY, width: contentWidth, height: 0.6)).fill()
        cursorY += 13
    }

    private func drawMediaReference(_ media: AdminFormMediaReference, label: String) {
        ensureSpace(94)
        cursorY += 2
        drawText(
            label.uppercased(),
            font: .systemFont(ofSize: 7.5, weight: .bold),
            color: .xertPDFSteel,
            indent: 10,
            spacingAfter: 3
        )
        drawText(
            "Type: \(media.typeLabel)",
            font: .systemFont(ofSize: 8.5),
            color: .xertPDFNavy,
            indent: 10,
            spacingAfter: 2
        )
        drawText(
            "URL: \(media.url ?? "Not recorded")",
            font: .systemFont(ofSize: 8.5),
            color: .xertPDFNavy,
            indent: 10,
            spacingAfter: 2
        )
        drawText(
            "Caption: \(media.caption ?? "Not recorded")",
            font: .systemFont(ofSize: 8.5),
            color: .xertPDFNavy,
            indent: 10,
            spacingAfter: 4
        )
        drawText(
            AdminFormMediaReference.preservationNote,
            font: .italicSystemFont(ofSize: 7.5),
            color: .gray,
            indent: 10,
            spacingAfter: 7
        )
    }

    private func drawText(
        _ text: String,
        font: UIFont,
        color: UIColor,
        indent: CGFloat = 0,
        spacingAfter: CGFloat
    ) {
        let source = text as NSString
        guard source.length > 0 else { cursorY += spacingAfter; return }
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        var location = 0
        while location < source.length {
            if maximumY - cursorY < font.lineHeight * 1.5 { beginPage() }
            let availableHeight = maximumY - cursorY
            let availableWidth = contentWidth - indent
            let length = fittingLength(
                source: source,
                location: location,
                maximumHeight: availableHeight,
                width: availableWidth,
                attributes: attributes
            )
            let range = NSRange(location: location, length: max(length, 1))
            let chunk = source.substring(with: range)
            let height = measuredHeight(chunk, width: availableWidth, attributes: attributes)
            (chunk as NSString).draw(
                with: CGRect(x: horizontalMargin + indent, y: cursorY, width: availableWidth, height: height),
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: attributes,
                context: nil
            )
            cursorY += height
            location += range.length
            if location < source.length { beginPage() }
        }
        cursorY += spacingAfter
    }

    private func fittingLength(
        source: NSString,
        location: Int,
        maximumHeight: CGFloat,
        width: CGFloat,
        attributes: [NSAttributedString.Key: Any]
    ) -> Int {
        let remaining = source.length - location
        if measuredHeight(source.substring(from: location), width: width, attributes: attributes) <= maximumHeight {
            return remaining
        }
        var lower = 1
        var upper = remaining
        var best = 1
        while lower <= upper {
            let midpoint = lower + (upper - lower) / 2
            let safeMidpoint = composedLength(
                atOrBefore: midpoint,
                source: source,
                location: location
            )
            let candidate = source.substring(with: NSRange(location: location, length: safeMidpoint))
            if measuredHeight(candidate, width: width, attributes: attributes) <= maximumHeight {
                best = safeMidpoint
                lower = midpoint + 1
            } else {
                upper = midpoint - 1
            }
        }
        best = composedLength(atOrBefore: best, source: source, location: location)
        if best < remaining {
            let candidate = source.substring(with: NSRange(location: location, length: best)) as NSString
            let whitespace = candidate.rangeOfCharacter(from: .whitespacesAndNewlines, options: .backwards)
            if whitespace.location != NSNotFound, whitespace.location > best / 2 { return whitespace.location + whitespace.length }
        }
        return best
    }

    private func composedLength(
        atOrBefore proposedLength: Int,
        source: NSString,
        location: Int
    ) -> Int {
        let remaining = source.length - location
        let boundedLength = min(max(proposedLength, 1), remaining)
        let proposedEnd = location + boundedLength
        guard proposedEnd < source.length else { return remaining }
        let containingSequence = source.rangeOfComposedCharacterSequence(at: proposedEnd)
        let boundary = containingSequence.location < proposedEnd
            ? containingSequence.location
            : proposedEnd
        if boundary > location { return boundary - location }
        return source.rangeOfComposedCharacterSequence(at: location).length
    }

    private func measuredHeight(
        _ text: String,
        width: CGFloat,
        attributes: [NSAttributedString.Key: Any]
    ) -> CGFloat {
        ceil((text as NSString).boundingRect(
            with: CGSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attributes,
            context: nil
        ).height)
    }

    private func ensureSpace(_ height: CGFloat) {
        if cursorY + height > maximumY { beginPage() }
    }

    private func drawPageFurniture() {
        UIColor.xertPDFSteel.setFill()
        UIBezierPath(rect: CGRect(x: 0, y: 0, width: 8, height: bounds.height)).fill()
        let footer = "XERT Fitness - Confidential - \(responseID.uuidString.lowercased()) - Page \(pageNumber)"
        (footer as NSString).draw(
            in: CGRect(x: horizontalMargin, y: bounds.height - 34, width: contentWidth, height: 14),
            withAttributes: [.font: UIFont.systemFont(ofSize: 7.5), .foregroundColor: UIColor.gray]
        )
    }

    private func aspectFitRect(imageSize: CGSize, bounds: CGRect) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else { return bounds }
        let scale = min(bounds.width / imageSize.width, bounds.height / imageSize.height)
        let size = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        return CGRect(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2, width: size.width, height: size.height)
    }

    private static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_AU")
        formatter.timeZone = TimeZone(identifier: "Australia/Brisbane")
        formatter.dateFormat = "d MMMM yyyy 'at' h:mm a zzz"
        return formatter
    }()

    private static func duration(_ seconds: Int) -> String {
        let safeSeconds = max(seconds, 0)
        if safeSeconds < 60 { return "\(safeSeconds) seconds" }
        let minutes = safeSeconds / 60
        if minutes < 60 { return "\(minutes) min \(safeSeconds % 60) sec" }
        return "\(minutes / 60) hr \(minutes % 60) min"
    }

    private func metadataValue(_ value: String?, wasCollected: Bool) -> String {
        value?.nilIfEmpty ?? (wasCollected ? "Not supplied" : "Not collected")
    }
}

private extension UIColor {
    static let xertPDFNavy = UIColor(red: 15 / 255, green: 29 / 255, blue: 45 / 255, alpha: 1)
    static let xertPDFSteel = UIColor(red: 57 / 255, green: 126 / 255, blue: 159 / 255, alpha: 1)
    static let xertPDFPale = UIColor(red: 241 / 255, green: 246 / 255, blue: 249 / 255, alpha: 1)
}
