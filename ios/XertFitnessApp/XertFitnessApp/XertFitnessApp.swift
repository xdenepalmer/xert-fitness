import SwiftUI

@main
struct XertFitnessApp: App {
    @StateObject private var store = XertStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .task {
                    await store.bootstrap()
                }
        }
    }
}
