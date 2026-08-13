import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation
import UIKit

enum AdminFormQRCode {
    static let pixelDimension = 1_024
    static let logoWidthRatio: CGFloat = 0.16
    static let protectedLogoWidthRatio: CGFloat = 0.20

    private static let maximumPayloadBytes = 2_048
    private static let rootDirectoryName = "xert-private-form-qr-codes"

    private static var rootDirectory: URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(rootDirectoryName, isDirectory: true)
    }

    static func image(publicURL: URL) throws -> UIImage {
        guard let scheme = publicURL.scheme?.lowercased(),
              ["https", "http"].contains(scheme),
              let host = publicURL.host,
              !host.isEmpty,
              let payload = publicURL.absoluteString.data(using: .utf8),
              payload.count <= maximumPayloadBytes else {
            throw APIError(message: "The public form link could not be encoded as a QR code.")
        }
        guard let logo = UIImage(named: "XertQRLogo") else {
            throw APIError(message: "The XERT QR logo asset is unavailable in this app build.")
        }

        let filter = CIFilter.qrCodeGenerator()
        filter.message = payload
        filter.correctionLevel = "H"
        guard let output = filter.outputImage else {
            throw APIError(message: "The form QR code could not be generated.")
        }

        let moduleCount = Int(output.extent.width.rounded())
        guard moduleCount > 0 else {
            throw APIError(message: "The form QR code could not be generated.")
        }
        let quietZoneModules = 4
        let scale = max(1, pixelDimension / (moduleCount + quietZoneModules * 2))
        let qrPixelWidth = moduleCount * scale
        let scaled = output.transformed(by: CGAffineTransform(scaleX: CGFloat(scale), y: CGFloat(scale)))
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let qrCGImage = context.createCGImage(scaled, from: scaled.extent) else {
            throw APIError(message: "The form QR code could not be rendered.")
        }

        let format = UIGraphicsImageRendererFormat()
        format.opaque = true
        format.scale = 1
        let canvasSide = CGFloat(pixelDimension)
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: canvasSide, height: canvasSide),
            format: format
        )
        return renderer.image { rendererContext in
            let cg = rendererContext.cgContext
            UIColor.white.setFill()
            cg.fill(CGRect(x: 0, y: 0, width: canvasSide, height: canvasSide))
            cg.interpolationQuality = .none
            let qrOrigin = CGFloat(pixelDimension - qrPixelWidth) / 2
            let qrRect = CGRect(
                x: qrOrigin,
                y: qrOrigin,
                width: CGFloat(qrPixelWidth),
                height: CGFloat(qrPixelWidth)
            )
            UIImage(cgImage: qrCGImage).draw(in: qrRect)

            // A high correction level plus a small, white-isolated centre mark
            // preserves reliable scanning. The visible mark remains at 16% of
            // the QR width and its entire protected pad remains at 20%.
            let protectedSide = floor(CGFloat(qrPixelWidth) * protectedLogoWidthRatio)
            let logoSide = floor(CGFloat(qrPixelWidth) * logoWidthRatio)
            let protectedRect = CGRect(
                x: canvasSide / 2 - protectedSide / 2,
                y: canvasSide / 2 - protectedSide / 2,
                width: protectedSide,
                height: protectedSide
            )
            UIColor.white.setFill()
            UIBezierPath(
                roundedRect: protectedRect,
                cornerRadius: protectedSide * 0.12
            ).fill()
            let logoRect = CGRect(
                x: canvasSide / 2 - logoSide / 2,
                y: canvasSide / 2 - logoSide / 2,
                width: logoSide,
                height: logoSide
            )
            // QR modules need nearest-neighbour rendering; the photographic
            // app asset benefits from high-quality downsampling once the code
            // itself has already been rasterised.
            cg.interpolationQuality = .high
            logo.draw(in: logoRect)
        }
    }

    static func write(form: AdminForm) throws -> URL {
        let fileManager = FileManager.default
        let directory = rootDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let filename = safeFilename("\(form.slug)-xert-qr") + ".png"
        let fileURL = directory.appendingPathComponent(filename)
        do {
            let image = try image(publicURL: form.publicURL)
            guard let data = image.pngData() else {
                throw APIError(message: "The form QR image could not be prepared.")
            }
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            return fileURL
        } catch {
            try? fileManager.removeItem(at: directory)
            throw error
        }
    }

    static func remove(at fileURL: URL?) {
        guard let fileURL else { return }
        let directory = fileURL.deletingLastPathComponent().standardizedFileURL
        guard directory.deletingLastPathComponent().standardizedFileURL == rootDirectory.standardizedFileURL else {
            return
        }
        try? FileManager.default.removeItem(at: directory)
    }

    private static func safeFilename(_ value: String) -> String {
        let normalized = value.map { character -> Character in
            character.isLetter || character.isNumber || character == "-" || character == "_"
                ? character
                : "-"
        }
        let collapsed = String(normalized)
            .replacingOccurrences(of: #"-+"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return String((collapsed.nilIfEmpty ?? "xert-form-qr").prefix(120))
    }
}

@MainActor
enum AdminFormQRCodePrinter {
    static func present(fileURL: URL, formTitle: String) throws {
        guard let image = UIImage(contentsOfFile: fileURL.path) else {
            throw APIError(message: "The QR image is no longer available. Generate it again.")
        }
        guard UIPrintInteractionController.isPrintingAvailable else {
            throw APIError(message: "Printing is not available on this device. Share the QR image to print it elsewhere.")
        }
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = "\(formTitle) - XERT QR code"
        info.outputType = .photo
        controller.printInfo = info
        controller.showsNumberOfCopies = true
        controller.printingItem = image

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
        if let navigation = controller as? UINavigationController {
            controller = navigation.visibleViewController
        }
        if let tabs = controller as? UITabBarController {
            controller = tabs.selectedViewController
        }
        return controller?.view ?? window
    }
}
