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
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = navy
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
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav

        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = ink
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

extension View {
    /// Navy full-bleed background every branded screen sits on.
    func xertScreenBackground() -> some View {
        background(Color.xertNavy.ignoresSafeArea())
    }

    /// Hides the system list/scroll background so the navy shows through.
    func xertListBackground() -> some View {
        scrollContentBackground(.hidden)
            .background(Color.xertNavy.ignoresSafeArea())
    }

    /// Brand card: ink surface with the site's hairline steel border and the
    /// sharp 2pt radius from the web (`--radius: 0.125rem`).
    func xertCardStyle() -> some View {
        background(Color.xertInk)
            .overlay(
                RoundedRectangle(cornerRadius: 2)
                    .stroke(Color.xertSteel.opacity(0.18), lineWidth: 1)
            )
    }
}

// MARK: - Buttons

/// Solid steel call-to-action, navy label, sharp corners — the site's primary button.
struct XertPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .textCase(.uppercase)
            .tracking(1.2)
            .foregroundStyle(Color.xertNavy)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(configuration.isPressed ? Color.xertPale : Color.xertSteel)
            .clipShape(RoundedRectangle(cornerRadius: 2))
    }
}

/// Outlined secondary action matching the site's ghost buttons.
struct XertGhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .textCase(.uppercase)
            .tracking(1.2)
            .foregroundStyle(configuration.isPressed ? Color.xertPale : Color.xertSteel)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .overlay(
                RoundedRectangle(cornerRadius: 2)
                    .stroke(Color.xertSteel.opacity(configuration.isPressed ? 1 : 0.6), lineWidth: 1)
            )
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
