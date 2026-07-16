import SwiftUI

enum XertSceneNavigationCommand: Hashable {
    case destination(XertPrimaryDestination)
    case previous
    case next
    case quickSwitcher
    case refresh
    case owner
}

struct XertNavigationCommandContext {
    let isAvailable: Bool
    let selection: XertPrimaryDestination
    let previousRoute: XertMemberRoute?
    let nextRoute: XertMemberRoute?
    let isAdmin: Bool
    let perform: (XertSceneNavigationCommand) -> Void
}

private struct XertNavigationCommandContextKey: FocusedValueKey {
    typealias Value = XertNavigationCommandContext
}

extension FocusedValues {
    var xertNavigationCommandContext: XertNavigationCommandContext? {
        get { self[XertNavigationCommandContextKey.self] }
        set { self[XertNavigationCommandContextKey.self] = newValue }
    }
}

struct XertNavigationCommands: Commands {
    @FocusedValue(\.xertNavigationCommandContext) private var context

    var body: some Commands {
        CommandMenu("XERT") {
            workspaceButton(.home, shortcut: "1")
            workspaceButton(.booking, shortcut: "2")
            workspaceButton(.events, shortcut: "3")
            workspaceButton(.explore, shortcut: "4")
            workspaceButton(.account, shortcut: "5")

            Divider()

            Button("Quick Switcher", systemImage: "magnifyingglass") {
                context?.perform(.quickSwitcher)
            }
            .keyboardShortcut("k", modifiers: .command)
            .disabled(!hasActiveScene)

            Button("Back to Previous Task", systemImage: "arrow.uturn.backward") {
                context?.perform(.previous)
            }
            .keyboardShortcut("[", modifiers: .command)
            .disabled(context?.previousRoute == nil)

            Button("Forward to Next Task", systemImage: "arrow.uturn.forward") {
                context?.perform(.next)
            }
            .keyboardShortcut("]", modifiers: .command)
            .disabled(context?.nextRoute == nil)

            Button("Refresh Current Workspace", systemImage: "arrow.clockwise") {
                context?.perform(.refresh)
            }
            .keyboardShortcut("r", modifiers: .command)
            .disabled(!hasActiveScene)

            if context?.isAvailable == true, context?.isAdmin == true {
                Divider()
                Button("Owner Command Centre", systemImage: "waveform.path.ecg.rectangle") {
                    context?.perform(.owner)
                }
                .keyboardShortcut("a", modifiers: [.command, .shift])
            }
        }
    }

    private func workspaceButton(
        _ destination: XertPrimaryDestination,
        shortcut: KeyEquivalent
    ) -> some View {
        Button("Open \(destination.title)", systemImage: destination.icon) {
            context?.perform(.destination(destination))
        }
        .keyboardShortcut(shortcut, modifiers: .command)
        .disabled(context.map { !$0.isAvailable || $0.selection == destination } ?? true)
    }

    private var hasActiveScene: Bool {
        context?.isAvailable == true
    }
}
