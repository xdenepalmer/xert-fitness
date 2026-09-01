import SwiftUI

// MARK: - Owner design system
// The owner workspaces grew one screen at a time and drifted: eleven different
// padding values, a dozen stack spacings, and some screens on the branded
// backdrop while others sat on flat navy with stock iOS Form chrome. The result
// read as several apps stitched together.
//
// Everything an owner screen needs to look like the same product lives here.
// Screens compose these instead of hand-rolling padding, borders and headings,
// so a change to the system reaches every workspace at once.

/// The only spacing values owner screens should use. A short, opinionated
/// scale is what stops the drift coming back.
enum XertSpace {
    /// 2 — hairline gaps inside a single label stack.
    static let hairline: CGFloat = 2
    /// 4 — between a title and its caption.
    static let xs: CGFloat = 4
    /// 8 — between tightly related controls.
    static let sm: CGFloat = 8
    /// 12 — inside a card, between its rows.
    static let md: CGFloat = 12
    /// 16 — card padding and screen gutters. The workhorse value.
    static let lg: CGFloat = 16
    /// 24 — between distinct sections of a screen.
    static let xl: CGFloat = 24
    /// 32 — above a screen's closing action.
    static let section: CGFloat = 32
}

extension View {
    /// The standard owner-workspace backdrop: branded texture, no stock iOS
    /// list chrome. Every owner screen uses this so none of them look like a
    /// different app.
    func xertOwnerScreen() -> some View {
        scrollContentBackground(.hidden)
            .background(XertScreenBackdrop().ignoresSafeArea())
    }

    /// Standard gutters for scrolling owner content.
    func xertOwnerContentPadding() -> some View {
        padding(.horizontal, XertSpace.lg)
            .padding(.top, XertSpace.md)
            .padding(.bottom, XertSpace.section)
    }

    /// A branded card with the system's own padding already applied.
    func xertOwnerCard(padding: CGFloat = XertSpace.lg) -> some View {
        self.padding(padding).xertCardStyle()
    }
}

/// Small uppercase steel label above a group of content. Owner screens used
/// three near-identical private copies of this before it lived here.
struct XertOwnerHeading: View {
    let title: String

    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title.uppercased())
            .font(.caption.weight(.bold))
            .tracking(1.8)
            .foregroundStyle(Color.xertSteel)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Tappable navigation row: icon, title, supporting line, chevron.
struct XertOwnerRow: View {
    let title: String
    let detail: String
    let icon: String
    var onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: XertSpace.md) {
                Image(systemName: icon)
                    .frame(width: 26)
                    .foregroundStyle(Color.xertSteel)
                VStack(alignment: .leading, spacing: XertSpace.hairline) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.55))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: XertSpace.sm)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.xertSteel)
            }
            .frame(minHeight: 44)
            .xertOwnerCard(padding: XertSpace.lg)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The one way an owner screen says "nothing here yet".
struct XertOwnerEmptyState: View {
    let icon: String
    let text: String

    var body: some View {
        Label(text, systemImage: icon)
            .font(.subheadline)
            .foregroundStyle(Color.xertPale.opacity(0.65))
            .frame(maxWidth: .infinity, alignment: .leading)
            .xertOwnerCard()
    }
}
