import XCTest
import SwiftUI
import UIKit
@testable import XertFitness

/// Hosted UIKit target/action evidence, not an XCUI touch or VoiceOver test.
/// No private class names, selectors, gesture injection, or production launch mode.
final class NativePickerEvidenceTests: XCTestCase {
    @MainActor
    func testSegmentedValueChangedUpdatesTheBoundSelection() throws {
        let model = PickerEvidenceSelection()
        let window = host(PickerEvidence(selection: model, kind: .segmented, longLabels: false), size: .large)
        defer { close(window) }
        let control = try XCTUnwrap(descendants(window).compactMap { $0 as? UISegmentedControl }.first,
            "This runtime did not expose a UISegmentedControl; use XCTestUI rather than a fabricated binding test")
        XCTAssertEqual(control.numberOfSegments, 2)
        XCTAssertEqual(control.selectedSegmentIndex, 0)
        control.selectedSegmentIndex = 1
        control.sendActions(for: .valueChanged)
        XCTAssertEqual(model.value, "waiting", "The real control's target/action must reach XertSegmented's binding")
    }

    @MainActor
    func testEachSegmentReceivesHitsAcrossAMinimum44PointTarget() throws {
        let window = host(PickerEvidence(selection: PickerEvidenceSelection(), kind: .segmented, longLabels: false), size: .large)
        defer { close(window) }
        let control = try XCTUnwrap(descendants(window).compactMap { $0 as? UISegmentedControl }.first)
        capture(window, name: "native-picker-segmented-hit-regions")
        XCTAssertEqual(control.numberOfSegments, 2)
        // The short-label fixture has equal-width native segments. Probe the
        // WINDOW's routing, not the SwiftUI frame or control.point(inside:) alone.
        let width = control.bounds.width / CGFloat(control.numberOfSegments)
        XCTAssertGreaterThanOrEqual(width, 44)
        for index in 0..<control.numberOfSegments {
            let center = CGPoint(x: width * (CGFloat(index) + 0.5), y: control.bounds.midY)
            for dx in [CGFloat(-21.9), 0, 21.9] {
                for dy in [CGFloat(-21.9), 0, 21.9] {
                    let point = control.convert(CGPoint(x: center.x + dx, y: center.y + dy), to: window)
                    let hit = window.hitTest(point, with: nil)
                    XCTAssertTrue(hit === control || hit?.isDescendant(of: control) == true,
                        "Segment \(index) missed 44pt target at \(point); actual control bounds \(control.bounds); hit \(String(describing: hit))")
                }
            }
        }
    }

    @MainActor
    func testLongSelectedLabelsProduceFocusedRuntimeEvidence() {
        for kind in PickerEvidenceKind.allCases {
            for size in [DynamicTypeSize.large, .accessibility3] {
                let window = host(PickerEvidence(selection: PickerEvidenceSelection(), kind: kind, longLabels: true), size: size)
                capture(window, name: "native-picker-\(kind.rawValue)-long-selected-\(size)")
                close(window)
            }
        }
        // Capture is deliberately NOT a readability assertion. SwiftUI does not
        // promise UILabel-backed text/menu buttons. Inspect the PNGs and the
        // diagnostics; an unexposed label needs XCUI/device verification.
    }

    @MainActor
    private func host<Content: View>(_ content: Content, size: DynamicTypeSize) -> UIWindow {
        let host = UIHostingController(rootView: content.environment(\.dynamicTypeSize, size).preferredColorScheme(.dark))
        let fit = host.sizeThatFits(in: CGSize(width: 390, height: CGFloat.greatestFiniteMagnitude))
        XCTAssertTrue(fit.height.isFinite)
        XCTAssertGreaterThan(fit.height, 0)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: ceil(fit.height)))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        // Flush the actual hosted hierarchy before public UIKit discovery.
        _ = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in
            _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        return window
    }

    @MainActor
    private func close(_ window: UIWindow) {
        window.isHidden = true
        window.rootViewController = nil
    }

    @MainActor
    private func descendants(_ view: UIView) -> [UIView] {
        [view] + view.subviews.flatMap { descendants($0) }
    }

    @MainActor
    private func capture(_ window: UIWindow, name: String) {
        let image = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in
            XCTAssertTrue(window.drawHierarchy(in: window.bounds, afterScreenUpdates: true))
        }
        let screenshot = XCTAttachment(image: image)
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        // Public UIKit geometry is diagnostic only for SwiftUI menu routing.
        // A hosting view hit is NOT proof that the menu will open or select.
        var lines = [
            "Reduce Motion=\(UIAccessibility.isReduceMotionEnabled), Reduce Transparency=\(UIAccessibility.isReduceTransparencyEnabled) (observed, not overridden)",
            "Expected full selected label: \(PickerEvidence.longSelectedLabel)",
            "Menu selection, synthesized touch, and VoiceOver: NOT EXERCISED",
            "UILabel metrics are reported only when UIKit exposes one; missing text is NOT a pass."
        ]
        for view in descendants(window) {
            if let control = view as? UIControl {
                lines.append("Control \(type(of: control)): windowFrame=\(control.convert(control.bounds, to: window)), enabled=\(control.isEnabled), accessibilityLabel=\(control.accessibilityLabel ?? "nil"), value=\(control.accessibilityValue ?? "nil")")
            }
            if let label = view as? UILabel, let text = label.text, !text.isEmpty {
                let required = label.sizeThatFits(CGSize(width: label.bounds.width, height: CGFloat.greatestFiniteMagnitude))
                let natural = (text as NSString).boundingRect(
                    with: CGSize(width: label.bounds.width, height: CGFloat.greatestFiniteMagnitude),
                    options: [.usesLineFragmentOrigin, .usesFontLeading],
                    attributes: [.font: label.font ?? UIFont.preferredFont(forTextStyle: .body)], context: nil)
                lines.append("Label '\(text)': bounds=\(label.bounds), sizeThatFits=\(required), untruncatedText=\(natural.size), numberOfLines=\(label.numberOfLines), adjustsFontSize=\(label.adjustsFontSizeToFitWidth)")
            }
        }
        let diagnostics = XCTAttachment(string: lines.joined(separator: "\n"))
        diagnostics.name = "\(name)-runtime-diagnostics"
        diagnostics.lifetime = .keepAlways
        add(diagnostics)
        print("\(name) runtime diagnostics:\n\(lines.joined(separator: "\n"))")
    }
}

private enum PickerEvidenceKind: String, CaseIterable { case segmented, menu }

@MainActor
private final class PickerEvidenceSelection: ObservableObject {
    @Published var value = "confirmed"
}

private struct PickerEvidence: View {
    @ObservedObject var selection: PickerEvidenceSelection
    let kind: PickerEvidenceKind
    let longLabels: Bool
    static let longSelectedLabel = "Confirmed attendance — Foundation Strength with individual technique coaching"
    private var choices: [XertChoice<String>] {
        [XertChoice(value: "confirmed", label: longLabels ? Self.longSelectedLabel : "Confirmed"),
         XertChoice(value: "waiting", label: longLabels ? "Waiting for a place in the next suitable session" : "Waiting")]
    }
    var body: some View {
        VStack(alignment: .leading, spacing: XertSpace.lg) {
            if kind == .segmented {
                XertSegmented(title: "Booking status", selection: $selection.value, choices: choices)
            } else {
                XertMenuField(title: "Move booking to", selection: $selection.value, choices: choices)
            }
            Text("Selected binding: \(selection.value)").xertTypography(.caption)
        }
        .padding(XertSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(XertTokens.textPrimary)
        .background(XertTokens.surfaceBase)
    }
}
