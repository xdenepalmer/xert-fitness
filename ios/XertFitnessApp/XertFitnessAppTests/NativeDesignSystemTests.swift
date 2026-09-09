import XCTest
import SwiftUI
import UIKit
@testable import XertFitness

final class NativeDesignSystemTests: XCTestCase {
    func testControlStatePriorityAndInputGate() {
        XCTAssertEqual(XertControlState.resolve(enabled: false, loading: true, error: true, focused: true), .disabled)
        XCTAssertEqual(XertControlState.resolve(enabled: true, loading: true, error: true), .loading)
        XCTAssertEqual(XertControlState.resolve(enabled: true, error: true, focused: true), .error)
        XCTAssertEqual(XertControlState.resolve(enabled: true, focused: true), .focused)
        XCTAssertEqual(XertControlState.resolve(enabled: true), .normal)
        XCTAssertFalse(XertControlState.loading.acceptsInput)
        XCTAssertFalse(XertControlState.disabled.acceptsInput)
        XCTAssertTrue(XertControlState.error.acceptsInput, "An error must still allow correction/retry")
    }

    func testMotionOptOutAndSemanticHapticPairings() {
        XCTAssertEqual(XertMotion.duration(reduceMotion: true), 0)
        XCTAssertEqual(XertMotion.duration(reduceMotion: false), XertTokens.durationStandard)
        XCTAssertNil(XertMotion.spring(reduceMotion: true))
        XCTAssertNil(XertMotion.pulse(reduceMotion: true))
        XCTAssertEqual(XertMotion.pressScale(pressed: true, reduceMotion: true), 1)
        XCTAssertEqual(XertMotion.pressScale(pressed: true, reduceMotion: false), XertTokens.nativeMotionPressScale)
        XCTAssertEqual(XertInteraction.selection.haptic, .selection)
        XCTAssertEqual(XertButtonVariant.danger.interaction.haptic, .warning)
        XCTAssertEqual(XertInteraction.success.haptic, .success)
        XCTAssertEqual(XertInteraction.failure.haptic, .error)
    }

    func testTypeRampScalesEveryRoleForAccessibility() {
        XCTAssertEqual(XertSpace.lg, 16)
        XCTAssertEqual(XertSpace.lg, XertTokens.spaceRowComfortable)
        XCTAssertGreaterThan(XertTypography.display.baseSize, XertTypography.title.baseSize)
        XCTAssertGreaterThan(XertTypography.title.baseSize, XertTypography.heading.baseSize)
        XCTAssertGreaterThan(XertTypography.heading.baseSize, XertTypography.body.baseSize)
        for role in XertTypography.allCases {
            XCTAssertGreaterThan(role.scaledSize(for: .accessibilityExtraExtraExtraLarge), role.scaledSize(for: .large), "\(role) must honor Dynamic Type")
        }
    }

    @MainActor
    func testHostedControlsAtDefaultAndAccessibilitySizes() throws {
        for group in 0..<3 {
            let standardHeight = try attach(group: group, size: .large, name: "native-kit-\(group)-default")
            let accessibilityHeight = try attach(group: group, size: .accessibility3, name: "native-kit-\(group)-accessibility")
            XCTAssertGreaterThan(accessibilityHeight, standardHeight, "Accessible typography must grow the control layout rather than shrink or clip copy")
        }
    }

    @MainActor
    private func attach(group: Int, size: DynamicTypeSize, name: String) throws -> CGFloat {
        // Test-only controls, no production screen, account, service or network access.
        let content = NativeKitEvidence(group: group)
            .environment(\.dynamicTypeSize, size)
            .preferredColorScheme(.dark)
        let host = UIHostingController(rootView: content)
        let proposed = CGSize(width: 390, height: CGFloat.greatestFiniteMagnitude)
        let fit = host.sizeThatFits(in: proposed)
        XCTAssertTrue(fit.height.isFinite)
        XCTAssertGreaterThan(fit.height, 0)
        let window = UIWindow(frame: CGRect(origin: .zero, size: CGSize(width: proposed.width, height: ceil(fit.height))))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.frame = window.bounds
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        let renderer = UIGraphicsImageRenderer(size: window.bounds.size)
        var rendered = false
        let image = renderer.image { _ in rendered = host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true) }
        XCTAssertTrue(rendered, "The hosted control hierarchy must render before attaching visual evidence")
        XCTAssertNotNil(image.cgImage)
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        let settings = XCTAttachment(string: "Reduce Motion: \(UIAccessibility.isReduceMotionEnabled); Reduce Transparency: \(UIAccessibility.isReduceTransparencyEnabled). These system settings were observed, not overridden by the fixture.")
        settings.name = "\(name)-system-settings"
        settings.lifetime = .keepAlways
        add(settings)
        return fit.height
    }
}

private struct NativeKitEvidence: View {
    let group: Int
    @State private var name = "Jordan Lee"
    @State private var notes = "Technique notes wrap and remain editable at accessibility text sizes."
    @State private var selected = "confirmed"
    @State private var enabled = true
    @FocusState private var editorFocused: Bool
    private let choices = [XertChoice(value: "confirmed", label: "Confirmed"), XertChoice(value: "waiting", label: "Waiting list")]

    var body: some View {
        VStack(alignment: .leading, spacing: XertSpace.lg) {
            XertSectionHeading("Native vocabulary")
            if group == 0 {
                XertButton(title: "Confirm reviewed booking", icon: "checkmark") {}
                XertButton(title: "Save attendance correction", variant: .ghost) {}
                XertButton(title: "Cancel this class and notify attendees", variant: .danger) {}
                XertButton(title: "Back to class calendar", variant: .quiet) {}
                XertButton(title: "Saving booking", isLoading: true) {}
                XertButton(title: "Unavailable action") {}
                    .disabled(true)
                XertField(title: "Member name", text: $name, textContentType: .name)
                XertField(title: "Notes", text: $notes, axis: .vertical, lineRange: 3...8, externalFocus: $editorFocused)
                XertField(title: "Mobile number", text: .constant(""), error: "Enter a valid Australian mobile number.", keyboardType: .phonePad)
            } else if group == 1 {
                XertSegmented(title: "Booking status", selection: $selected, choices: choices)
                XertMenuField(title: "Move booking to", selection: $selected, choices: choices)
                XertToggleRow(title: "Member notifications", detail: "Send a private notice after a confirmed booking change.", isOn: $enabled)
                XertToggleRow(title: "Disabled setting", isOn: .constant(false)).disabled(true)
                XertBadge(title: "Confirmed", tone: .success)
                XertBadge(title: "Waiting for review", tone: .warning)
                XertStat(title: "Attended classes", value: "24", detail: "Recorded attendance for this member")
                XertOwnerRow(title: "Class calendar", detail: "Review classes, capacity and attendance", icon: "calendar") {}
            } else {
                Text("A precise heading").xertTypography(.display)
                Text("Today’s classes").xertTypography(.title)
                Text("Body copy grows with the user’s preferred reading size.").xertTypography(.body)
                Text("CONFIRMED · 6:15 AM").xertTypography(.mono)
                XertHairline()
                XertCard { Text("Tinted card content with a hairline border").xertTypography(.body) }
                XertSurface(.sunken) { Text("Inset surface").padding(XertSpace.lg) }
                XertEmptyState(icon: "calendar", title: "No classes today", detail: "Add a class when the timetable is ready.")
                XertInlineError(message: "Attendance could not be saved. Review the connection and retry.", retry: {})
                XertSkeleton()
            }
        }
        .padding(XertSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(XertTokens.textPrimary)
        .background(XertTokens.surfaceBase)
    }
}
