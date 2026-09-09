import SwiftUI
import UIKit

// The native vocabulary consumes the same generated semantic scale as the web.
// Legacy owner wrappers below delegate here, so workspaces can migrate incrementally.
enum XertSpace {
    static let hairline: CGFloat = XertTokens.spaceHairline
    static let xs: CGFloat = XertTokens.spaceLabel
    static let sm: CGFloat = XertTokens.spaceInline
    static let md: CGFloat = XertTokens.spaceControl
    static let lg: CGFloat = XertTokens.spaceRowComfortable
    static let xl: CGFloat = XertTokens.spaceGroup
    static let section: CGFloat = XertTokens.spaceSection
}

enum XertTypography: CaseIterable {
    case display, title, heading, body, caption, mono

    var baseSize: CGFloat {
        switch self {
        case .display: return XertTokens.nativeTypeDisplay
        case .title: return XertTokens.nativeTypeTitle
        case .heading: return XertTokens.nativeTypeHeading
        case .body: return XertTokens.nativeTypeBody
        case .caption: return XertTokens.nativeTypeCaption
        case .mono: return XertTokens.nativeTypeMono
        }
    }
    var textStyle: Font.TextStyle {
        switch self {
        case .display: return .largeTitle
        case .title: return .title
        case .heading: return .headline
        case .body: return .body
        case .caption: return .caption
        case .mono: return .callout
        }
    }
    var uiTextStyle: UIFont.TextStyle {
        switch self {
        case .display: return .largeTitle
        case .title: return .title1
        case .heading: return .headline
        case .body: return .body
        case .caption: return .caption1
        case .mono: return .callout
        }
    }
    func scaledSize(for category: UIContentSizeCategory) -> CGFloat {
        UIFontMetrics(forTextStyle: uiTextStyle).scaledValue(for: baseSize, compatibleWith: UITraitCollection(preferredContentSizeCategory: category))
    }
    func font(at size: CGFloat) -> Font {
        if self == .display || self == .title {
            if UIFont(name: "BebasNeue-Regular", size: size) != nil { return .custom("BebasNeue-Regular", fixedSize: size) }
            return .system(size: size, weight: .heavy)
        }
        return .system(size: size, weight: self == .heading ? .semibold : .regular, design: self == .mono ? .monospaced : .default)
    }
}

private struct XertTypographyModifier: ViewModifier {
    let role: XertTypography
    @ScaledMetric private var size: CGFloat
    init(role: XertTypography) {
        self.role = role
        _size = ScaledMetric(wrappedValue: role.baseSize, relativeTo: role.textStyle)
    }
    func body(content: Content) -> some View { content.font(role.font(at: size)) }
}

enum XertControlState: Equatable {
    case normal, focused, disabled, loading, error
    static func resolve(enabled: Bool, loading: Bool = false, error: Bool = false, focused: Bool = false) -> Self {
        if !enabled { return .disabled }
        if loading { return .loading }
        if error { return .error }
        return focused ? .focused : .normal
    }
    var acceptsInput: Bool { self != .disabled && self != .loading }
    var border: Color {
        switch self {
        case .error: return XertTokens.stateDanger
        case .focused: return XertTokens.focusRing
        default: return XertTokens.borderStrong
        }
    }
}

enum XertInteraction {
    case selection, action, destructive, success, failure
    var haptic: XertHapticFeedback {
        switch self {
        case .selection: return .selection
        case .action: return .lightImpact
        case .destructive: return .warning
        case .success: return .success
        case .failure: return .error
        }
    }
}

enum XertMotion {
    static func duration(reduceMotion: Bool) -> TimeInterval {
        XertTokens.duration(XertTokens.durationStandard, reduceMotion: reduceMotion)
    }
    static func spring(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(response: XertTokens.nativeMotionSpringResponse, dampingFraction: Double(XertTokens.nativeMotionSpringDamping))
    }
    static func pulse(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeInOut(duration: XertTokens.durationSlow).repeatForever(autoreverses: true)
    }
    static func pressScale(pressed: Bool, reduceMotion: Bool) -> CGFloat {
        pressed && !reduceMotion ? XertTokens.nativeMotionPressScale : 1
    }
}

enum XertElevation {
    case base, raised, overlay, sunken
    func color(reduceTransparency: Bool) -> Color {
        switch self {
        case .base: return XertTokens.surfaceBase
        case .raised: return XertTokens.surfaceRaised
        case .overlay: return reduceTransparency ? XertTokens.surfaceRaised : XertTokens.surfaceOverlay
        case .sunken: return XertTokens.surfaceSunken
        }
    }
}

struct XertSurfaceModifier: ViewModifier {
    var elevation: XertElevation = .raised
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    func body(content: Content) -> some View {
        content.background(elevation.color(reduceTransparency: reduceTransparency))
            .clipShape(RoundedRectangle(cornerRadius: XertTokens.nativeRadiusStructure, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: XertTokens.nativeRadiusStructure, style: .continuous).strokeBorder(XertTokens.borderHairline, lineWidth: XertTokens.navLineWidth))
    }
}

struct XertSurface<Content: View>: View {
    var elevation: XertElevation
    private let content: Content
    init(_ elevation: XertElevation = .raised, @ViewBuilder content: () -> Content) {
        self.elevation = elevation; self.content = content()
    }
    var body: some View { content.modifier(XertSurfaceModifier(elevation: elevation)) }
}

struct XertCard<Content: View>: View {
    var padding: CGFloat
    private let content: Content
    init(padding: CGFloat = XertSpace.lg, @ViewBuilder content: () -> Content) {
        self.padding = padding; self.content = content()
    }
    var body: some View { XertSurface { content.padding(padding) } }
}

struct XertHairline: View {
    var body: some View { Rectangle().fill(XertTokens.borderHairline).frame(height: XertTokens.navLineWidth).accessibilityHidden(true) }
}

struct XertSectionHeading: View {
    let title: String
    init(_ title: String) { self.title = title }
    var body: some View {
        Text(title).xertTypography(.heading).tracking(XertTokens.nativeTypeTracking).foregroundStyle(XertTokens.textPrimary)
            .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
    }
}

enum XertTone { case neutral, success, warning, danger
    var color: Color {
        switch self {
        case .neutral: return XertTokens.textSecondary
        case .success: return XertTokens.stateSuccess
        case .warning: return XertTokens.stateWarning
        case .danger: return XertTokens.stateDangerPale
        }
    }
}

struct XertBadge: View {
    let title: String
    var tone: XertTone = .neutral
    var body: some View {
        Text(title).xertTypography(.caption).foregroundStyle(tone.color)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, XertSpace.sm).padding(.vertical, XertSpace.xs)
            .background(XertTokens.surfaceSunken)
            .clipShape(RoundedRectangle(cornerRadius: XertTokens.nativeRadiusStructure))
            .accessibilityLabel(title)
    }
}

struct XertStat: View {
    let title: String
    let value: String
    var detail: String? = nil
    var body: some View {
        XertCard { VStack(alignment: .leading, spacing: XertSpace.sm) {
            Text(value).xertTypography(.display).foregroundStyle(XertTokens.textPrimary)
            Text(title).xertTypography(.caption).foregroundStyle(XertTokens.textSecondary)
            if let detail { Text(detail).xertTypography(.caption).foregroundStyle(XertTokens.textMuted) }
        }.fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading) }
        .accessibilityElement(children: .ignore).accessibilityLabel(title).accessibilityValue([value, detail].compactMap { $0 }.joined(separator: ". "))
    }
}

struct XertEmptyState: View {
    let icon: String
    let title: String
    var detail: String? = nil
    var body: some View {
        XertCard { VStack(alignment: .leading, spacing: XertSpace.sm) {
            Label(title, systemImage: icon).xertTypography(.body).foregroundStyle(XertTokens.textSecondary)
            if let detail { Text(detail).xertTypography(.caption).foregroundStyle(XertTokens.textMuted) }
        }.fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading) }
        .accessibilityElement(children: .combine)
    }
}

struct XertSkeleton: View {
    var lines: Int = 3
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @State private var pulse = false
    var body: some View {
        VStack(spacing: XertSpace.sm) {
            ForEach(0..<max(1, lines), id: \.self) { _ in
                RoundedRectangle(cornerRadius: XertTokens.nativeRadiusStructure)
                    .fill(XertElevation.overlay.color(reduceTransparency: reduceTransparency))
                    .frame(height: XertTokens.nativeSkeletonHeight)
            }
        }
        .opacity(reduceMotion || reduceTransparency || !pulse ? 1 : Double(XertTokens.nativeOpacitySkeletonLow))
        .animation(XertMotion.pulse(reduceMotion: reduceMotion || reduceTransparency), value: pulse)
        .onAppear { pulse = !(reduceMotion || reduceTransparency) }
        .onChange(of: reduceMotion) { pulse = !($0 || reduceTransparency) }
        .onChange(of: reduceTransparency) { pulse = !(reduceMotion || $0) }
        .accessibilityElement(children: .ignore).accessibilityLabel("Loading content")
    }
}

struct XertInlineError: View {
    let message: String
    var retry: (() -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: XertSpace.sm) {
            Label(message, systemImage: "exclamationmark.triangle")
                .xertTypography(.body).foregroundStyle(XertTokens.stateDangerPale)
                .fixedSize(horizontal: false, vertical: true)
            if let retry { Button("Retry", action: retry).buttonStyle(XertControlButtonStyle(variant: .ghost)) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension View {
    func xertTypography(_ role: XertTypography) -> some View { modifier(XertTypographyModifier(role: role)) }
    func xertOwnerScreen() -> some View { scrollContentBackground(.hidden).background(XertScreenBackdrop().ignoresSafeArea()) }
    func xertOwnerContentPadding() -> some View { padding(.horizontal, XertSpace.lg).padding(.top, XertSpace.md).padding(.bottom, XertSpace.section) }
    func xertOwnerCard(padding: CGFloat = XertSpace.lg) -> some View { XertCard(padding: padding) { self } }
}

// Source-compatible wrappers used by current owner workspaces.
struct XertOwnerHeading: View {
    let title: String
    init(_ title: String) { self.title = title }
    var body: some View { XertSectionHeading(title) }
}
struct XertOwnerRow: View {
    let title: String
    let detail: String
    let icon: String
    var onOpen: () -> Void
    var body: some View { XertNavigationRow(title: title, detail: detail, icon: icon, onOpen: onOpen) }
}
struct XertOwnerEmptyState: View {
    let icon: String
    let text: String
    var body: some View { XertEmptyState(icon: icon, title: text) }
}
