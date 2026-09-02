import SwiftUI
import UIKit

// MARK: - XERT design system
// Mirrors the website's brand tokens (src/index.css) so both surfaces read as
// one product: navy/ink surfaces, steel accents, pale text, sharp 2pt corners
// and condensed uppercase display type (Bebas Neue).
//
// Core brand colors (xertNavy, xertInk, xertSteel, xertOffWhite) live in
// RootView.swift; this file adds the remaining tokens plus typography and
// reusable components.

extension Color {
    /// #32485A — secondary surface / pressed states.
    static let xertDeep = Color(red: 50 / 255, green: 72 / 255, blue: 90 / 255)
    /// #D1DDE6 — pale brand tint for secondary text on dark surfaces.
    static let xertPale = Color(red: 209 / 255, green: 221 / 255, blue: 230 / 255)
    /// Card surface, matches the site's `--card` (hsl 213 29% 14%).
    static let xertCard = Color(red: 25 / 255, green: 36 / 255, blue: 46 / 255)
    /// Muted copy, matches the site's `--muted-foreground`.
    static let xertMuted = Color(red: 119 / 255, green: 135 / 255, blue: 150 / 255)
}

enum XertTheme {
    /// Bundled brand display font. Falls back to a condensed system face if the
    /// font failed to register so headlines never silently render in Times.
    static func displayFont(size: CGFloat, relativeTo textStyle: Font.TextStyle) -> Font {
        if UIFont(name: "BebasNeue-Regular", size: size) != nil {
            return .custom("BebasNeue-Regular", size: size, relativeTo: textStyle)
        }
        return .system(textStyle, design: .default).weight(.heavy)
    }

    /// UIKit twin of `displayFont` for appearance proxies.
    static func displayUIFont(size: CGFloat, textStyle: UIFont.TextStyle) -> UIFont {
        let base = UIFont(name: "BebasNeue-Regular", size: size)
            ?? .systemFont(ofSize: size, weight: .heavy)
        return UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base)
    }

    /// Global UIKit chrome: navy tab bar and navigation bars with Bebas titles,
    /// so every screen carries the brand without per-view boilerplate.
    static func configureAppearance() {
        let navy = UIColor(red: 16 / 255, green: 24 / 255, blue: 32 / 255, alpha: 1)
        let ink = UIColor(red: 11 / 255, green: 18 / 255, blue: 24 / 255, alpha: 1)
        let steel = UIColor(red: 123 / 255, green: 167 / 255, blue: 188 / 255, alpha: 1)
        let offWhite = UIColor(red: 241 / 255, green: 243 / 255, blue: 244 / 255, alpha: 1)

        let nav = UINavigationBarAppearance()
        nav.configureWithDefaultBackground()
        nav.backgroundEffect = UIBlurEffect(style: .systemChromeMaterialDark)
        nav.backgroundColor = navy.withAlphaComponent(0.86)
        nav.shadowColor = steel.withAlphaComponent(0.25)
        nav.titleTextAttributes = [
            .font: displayUIFont(size: 22, textStyle: .headline),
            .foregroundColor: offWhite,
            .kern: 1.5,
        ]
        nav.largeTitleTextAttributes = [
            .font: displayUIFont(size: 40, textStyle: .largeTitle),
            .foregroundColor: offWhite,
            .kern: 1.5,
        ]
        let navButton = UIBarButtonItemAppearance(style: .plain)
        navButton.normal.titleTextAttributes = [.foregroundColor: steel]
        navButton.highlighted.titleTextAttributes = [.foregroundColor: offWhite]
        nav.buttonAppearance = navButton
        nav.doneButtonAppearance = navButton
        nav.backButtonAppearance = navButton
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav

        let tab = UITabBarAppearance()
        tab.configureWithDefaultBackground()
        tab.backgroundEffect = UIBlurEffect(style: .systemChromeMaterialDark)
        tab.backgroundColor = ink.withAlphaComponent(0.9)
        tab.shadowColor = steel.withAlphaComponent(0.25)
        for item in [tab.stackedLayoutAppearance, tab.inlineLayoutAppearance, tab.compactInlineLayoutAppearance] {
            item.selected.iconColor = steel
            item.selected.titleTextAttributes = [.foregroundColor: steel]
            item.normal.iconColor = offWhite.withAlphaComponent(0.55)
            item.normal.titleTextAttributes = [.foregroundColor: offWhite.withAlphaComponent(0.55)]
        }
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
    }
}

// MARK: - Typography helpers

extension View {
    /// Uppercase tracked headline in the brand display font, like the site's
    /// Bebas Neue headings.
    func xertDisplay(_ size: CGFloat) -> some View {
        let textStyle: Font.TextStyle = if size >= 36 {
            .largeTitle
        } else if size >= 28 {
            .title
        } else if size >= 22 {
            .title2
        } else {
            .title3
        }
        return font(XertTheme.displayFont(size: size, relativeTo: textStyle))
            .textCase(.uppercase)
            .tracking(1.2)
            .foregroundStyle(Color.xertOffWhite)
    }

    /// Small uppercase steel label, like the site's section eyebrows.
    func xertEyebrow() -> some View {
        font(.caption.weight(.bold))
            .textCase(.uppercase)
            .tracking(1.8)
            .foregroundStyle(Color.xertSteel)
    }
}

// MARK: - Screen scaffolding

private struct XertDeviceTopSafeAreaInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    var xertDeviceTopSafeAreaInset: CGFloat {
        get { self[XertDeviceTopSafeAreaInsetKey.self] }
        set { self[XertDeviceTopSafeAreaInsetKey.self] = max(0, newValue) }
    }
}

enum XertScreenLayout {
    static let minimumHeroTopInset: CGFloat = 18
    /// Programmatic routes should settle below navigation and search chrome,
    /// leaving the destination heading and its first actions fully visible.
    static let routedContentAnchor = UnitPoint(x: 0.5, y: 0.2)
    /// Extra scroll runway above the persistent custom dock. The safe-area
    /// inset reserves the dock itself; this lets the final action scroll fully
    /// into view above it on short iPhones and with large Dynamic Type.
    static let scrollEndClearance: CGFloat = 112

    static func heroContentTopInset(deviceTopInset: CGFloat) -> CGFloat {
        max(deviceTopInset, minimumHeroTopInset) + 10
    }

    static func resolvedTopSafeAreaInset(
        localInset: CGFloat,
        inheritedInset: CGFloat
    ) -> CGFloat {
        max(0, max(localInset, inheritedInset))
    }

    static func homeHeroHeight(
        viewportHeight: CGFloat,
        deviceTopInset: CGFloat,
        usesAccessibilityText: Bool
    ) -> CGFloat {
        let availableHeight = max(0, viewportHeight)
        if usesAccessibilityText {
            return max(760, min(920, availableHeight * 1.05 + max(0, deviceTopInset)))
        }
        return min(680, max(580, availableHeight * 0.74))
    }

    static func pageHeroHeight(usesAccessibilityText: Bool) -> CGFloat {
        usesAccessibilityText ? 420 : 250
    }
}

extension View {
    /// Full-bleed architectural backdrop shared by every branded screen.
    func xertScreenBackground() -> some View {
        background(XertScreenBackdrop().ignoresSafeArea())
    }

    /// Hides the system list/scroll background so the navy shows through.
    func xertListBackground() -> some View {
        scrollContentBackground(.hidden)
            .background(XertScreenBackdrop().ignoresSafeArea())
    }

    /// Brand card: ink surface with a hairline steel border and softly rounded
    /// corners, matching the redesigned web Command Centre panels.
    func xertCardStyle() -> some View {
        background(
            LinearGradient(
                colors: [
                    Color.xertDeep.opacity(0.38),
                    Color.xertCard.opacity(0.97),
                    Color.xertInk.opacity(0.98),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [.clear, Color.xertSteel.opacity(0.34), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(height: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.xertSteel.opacity(0.24), lineWidth: 1)
            )
    }
}

/// A real final row gives the last control room to clear XERT's persistent
/// navigation dock, including large Dynamic Type and the owner status strip.
struct XertScrollEndSpacer: View {
    var body: some View {
        Color.clear
            .frame(height: XertScreenLayout.scrollEndClearance)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .accessibilityHidden(true)
    }
}

/// Low-contrast blueprint texture used by the website, rendered natively so it
/// stays crisp at every device scale and does not require a decorative asset.
struct XertScreenBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.xertDeep.opacity(0.46), Color.xertNavy, Color.xertInk],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Canvas(opaque: false, colorMode: .linear, rendersAsynchronously: true) { context, size in
                let spacing: CGFloat = 64
                var grid = Path()
                stride(from: CGFloat.zero, through: size.width, by: spacing).forEach { x in
                    grid.move(to: CGPoint(x: x, y: 0))
                    grid.addLine(to: CGPoint(x: x, y: size.height))
                }
                stride(from: CGFloat.zero, through: size.height, by: spacing).forEach { y in
                    grid.move(to: CGPoint(x: 0, y: y))
                    grid.addLine(to: CGPoint(x: size.width, y: y))
                }
                context.stroke(grid, with: .color(Color.xertSteel.opacity(0.055)), lineWidth: 0.7)

                var rail = Path()
                rail.move(to: CGPoint(x: size.width * 0.82, y: 0))
                rail.addLine(to: CGPoint(x: size.width * 0.32, y: size.height))
                context.stroke(rail, with: .color(Color.xertSteel.opacity(0.07)), lineWidth: 28)
            }
            .allowsHitTesting(false)

            VStack {
                Rectangle()
                    .fill(Color.xertSteel.opacity(0.34))
                    .frame(height: 1)
                Spacer()
            }
            .allowsHitTesting(false)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Buttons

/// Solid steel call-to-action, navy label, sharp corners — the site's primary button.
struct XertPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .textCase(.uppercase)
            .tracking(1.2)
            .foregroundStyle(Color.xertNavy)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: configuration.isPressed
                        ? [Color.xertPale, Color.xertSteel]
                        : [Color.xertPale, Color.xertSteel, Color.xertSteel],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(alignment: .top) {
                Rectangle().fill(Color.white.opacity(0.28)).frame(height: 1)
            }
            .opacity(isEnabled ? 1 : 0.46)
            .shadow(
                color: Color.black.opacity(isEnabled ? (configuration.isPressed ? 0.1 : 0.24) : 0),
                radius: 8,
                y: 4
            )
            .scaleEffect(!reduceMotion && isEnabled && configuration.isPressed ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Outlined secondary action matching the site's ghost buttons.
struct XertGhostButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .textCase(.uppercase)
            .tracking(1.2)
            .foregroundStyle(configuration.isPressed ? Color.xertPale : Color.xertSteel)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.xertSteel.opacity(configuration.isPressed ? 0.12 : 0.035))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.xertSteel.opacity(configuration.isPressed ? 1 : 0.6), lineWidth: 1)
            )
            .opacity(isEnabled ? 1 : 0.42)
            .scaleEffect(!reduceMotion && isEnabled && configuration.isPressed ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == XertPrimaryButtonStyle {
    static var xertPrimary: XertPrimaryButtonStyle { XertPrimaryButtonStyle() }
}

extension ButtonStyle where Self == XertGhostButtonStyle {
    static var xertGhost: XertGhostButtonStyle { XertGhostButtonStyle() }
}

// MARK: - Logo

/// The XERT wordmark (reuses the transparent launch asset) for screen headers.
struct XertLogoHeader: View {
    var height: CGFloat = 26

    var body: some View {
        Image("LaunchLogo")
            .resizable()
            .scaledToFit()
            .frame(height: height)
            .accessibilityLabel("XERT Fitness")
    }
}

/// Photographic first section for native feature tabs. It carries the same
/// image-led hierarchy as the website while leaving the operational content
/// immediately below it in the native List or Form.
struct XertPageHero: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let imageName: String
    let eyebrow: String
    let title: String
    let subtitle: String
    var badge: String? = nil

    private var heroHeight: CGFloat {
        XertScreenLayout.pageHeroHeight(usesAccessibilityText: dynamicTypeSize.isAccessibilitySize)
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Image(imageName)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity, minHeight: heroHeight, maxHeight: .infinity)
                .clipped()
                .saturation(0.58)
                .brightness(-0.14)
                .contrast(1.08)
                .accessibilityHidden(true)

            LinearGradient(
                colors: [
                    Color.xertNavy.opacity(0.42),
                    Color.xertDeep.opacity(0.5),
                    Color.xertNavy.opacity(0.97),
                ],
                startPoint: .topTrailing,
                endPoint: .bottomLeading
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 8) {
                XertLogoHeader(height: 24)
                Text(eyebrow)
                    .xertEyebrow()
                Text(title)
                    .xertDisplay(42)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.xertPale)
                    .fixedSize(horizontal: false, vertical: true)
                if let badge {
                    Text(badge)
                        .font(.caption2.weight(.bold))
                        .textCase(.uppercase)
                        .foregroundStyle(Color.xertSteel)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.55), lineWidth: 1))
                        .padding(.top, 3)
                }
            }
            .padding(20)
        }
        .frame(maxWidth: .infinity, minHeight: heroHeight)
        .clipped()
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.xertSteel.opacity(0.72))
                .frame(height: 2)
        }
        .accessibilityElement(children: .combine)
    }
}
