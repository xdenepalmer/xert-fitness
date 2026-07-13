import SwiftUI

@main
struct XertFitnessApp: App {
    @UIApplicationDelegateAdaptor(XertAppDelegate.self) private var appDelegate
    @StateObject private var store = XertStore()

    init() {
        XertTheme.configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .task {
                    await store.bootstrap()
                }
        }
    }
}
