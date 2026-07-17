import SwiftUI

enum XertSceneNavigationCommand: Hashable {
    case destination(XertPrimaryDestination)
    case ownerWorkspace(XertOwnerWorkspace)
    case previous
    case next
    case quickSwitcher
    case refresh
    case owner
    case closeOwner
}

enum XertSceneNavigationScope: Equatable {
    case member(XertPrimaryDestination)
    case owner(XertOwnerWorkspace)
}

struct XertNavigationCommandContext {
    let isAvailable: Bool
    let scope: XertSceneNavigationScope
    let previousTitle: String?
    let nextTitle: String?
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
            if let ownerSelection {
                ownerCommands(selection: ownerSelection)
            } else {
                memberCommands
            }
        }
    }

    @ViewBuilder
    private var memberCommands: some View {
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

        historyCommands(taskNoun: "Task")

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

    @ViewBuilder
    private func ownerCommands(selection: XertOwnerWorkspace) -> some View {
        Button("Owner Workspace Switcher", systemImage: "magnifyingglass") {
            context?.perform(.quickSwitcher)
        }
        .keyboardShortcut("k", modifiers: .command)
        .disabled(!hasActiveScene)

        historyCommands(taskNoun: "Workspace")

        Button("Refresh Owner Workspace", systemImage: "arrow.clockwise") {
            context?.perform(.refresh)
        }
        .keyboardShortcut("r", modifiers: .command)
        .disabled(!hasActiveScene)

        Divider()

        Menu("Open Owner Workspace", systemImage: "square.grid.2x2") {
            ownerWorkspaceButton(.overview, selection: selection)
            ForEach(XertOwnerWorkspaceSection.allCases) { section in
                Menu(section.rawValue) {
                    ForEach(XertOwnerWorkspace.workspaces(in: section)) { workspace in
                        ownerWorkspaceButton(workspace, selection: selection)
                    }
                }
            }
        }
        .disabled(!hasActiveScene)

        Divider()

        Button("Close Owner Command Centre", systemImage: "xmark") {
            context?.perform(.closeOwner)
        }
        .keyboardShortcut("a", modifiers: [.command, .shift])
        .disabled(!hasActiveScene)
    }

    @ViewBuilder
    private func historyCommands(taskNoun: String) -> some View {
        Button(context?.previousTitle.map { "Back to \($0)" } ?? "No Previous \(taskNoun)", systemImage: "arrow.uturn.backward") {
            context?.perform(.previous)
        }
        .keyboardShortcut("[", modifiers: .command)
        .disabled(context?.previousTitle == nil)

        Button(context?.nextTitle.map { "Forward to \($0)" } ?? "No Next \(taskNoun)", systemImage: "arrow.uturn.forward") {
            context?.perform(.next)
        }
        .keyboardShortcut("]", modifiers: .command)
        .disabled(context?.nextTitle == nil)
    }

    private func ownerWorkspaceButton(
        _ workspace: XertOwnerWorkspace,
        selection: XertOwnerWorkspace
    ) -> some View {
        Button(workspace.title, systemImage: workspace.icon) {
            context?.perform(.ownerWorkspace(workspace))
        }
        .disabled(!hasActiveScene || selection == workspace)
    }

    private var ownerSelection: XertOwnerWorkspace? {
        guard let scope = context?.scope, case .owner(let workspace) = scope else { return nil }
        return workspace
    }

    private var memberSelection: XertPrimaryDestination? {
        guard let scope = context?.scope, case .member(let destination) = scope else { return nil }
        return destination
    }

    private func workspaceButton(
        _ destination: XertPrimaryDestination,
        shortcut: KeyEquivalent
    ) -> some View {
        Button("Open \(destination.title)", systemImage: destination.icon) {
            context?.perform(.destination(destination))
        }
        .keyboardShortcut(shortcut, modifiers: .command)
        .disabled(!hasActiveScene || memberSelection == destination)
    }

    private var hasActiveScene: Bool {
        context?.isAvailable == true
    }
}
