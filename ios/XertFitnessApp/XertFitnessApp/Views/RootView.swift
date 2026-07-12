import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: XertStore
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(onNavigate: { selectedTab = $0 })
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(0)

            BookingView(onNavigate: { selectedTab = $0 })
                .tabItem {
                    Label("Book", systemImage: "calendar.badge.plus")
                }
                .tag(1)

            EventsView()
                .tabItem {
                    Label("Events", systemImage: "trophy")
                }
                .tag(2)

            AccountView()
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle")
                }
                .tag(3)
        }
        .tint(.xertSteel)
        .alert("XERT", isPresented: Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            Button("OK") {
                store.errorMessage = nil
            }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}

extension Color {
    static let xertNavy = Color(red: 16 / 255, green: 24 / 255, blue: 32 / 255)
    static let xertInk = Color(red: 11 / 255, green: 18 / 255, blue: 24 / 255)
    static let xertSteel = Color(red: 123 / 255, green: 167 / 255, blue: 188 / 255)
    static let xertOffWhite = Color(red: 241 / 255, green: 243 / 255, blue: 244 / 255)
}

struct XertSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.xertSteel)
                .tracking(1.8)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.18), lineWidth: 1))
    }
}
