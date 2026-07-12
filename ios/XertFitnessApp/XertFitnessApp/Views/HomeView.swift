import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: XertStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("XERT Fitness")
                            .font(.system(size: 44, weight: .black, design: .condensed))
                            .foregroundStyle(.xertOffWhite)
                        Text("Train with purpose. Compete together.")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.xertSteel)
                        Text("Semi-private coaching, structured blocks, and event-led training for Kingaroy and South East Queensland.")
                            .foregroundStyle(.white.opacity(0.72))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)

                    XertSection(title: "Today") {
                        HStack(spacing: 14) {
                            MetricView(value: "\(store.sessions.count)", label: "Classes")
                            MetricView(value: "\(store.creditTotal)", label: "Credits")
                            MetricView(value: "\(store.events.count)", label: "Events")
                        }
                    }

                    XertSection(title: "Session Packs") {
                        ForEach(store.products.prefix(3)) { product in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(product.name)
                                        .font(.headline)
                                        .foregroundStyle(.xertOffWhite)
                                    Text("\(product.sessions) sessions")
                                        .font(.caption)
                                        .foregroundStyle(.white.opacity(0.55))
                                }
                                Spacer()
                                Text(product.displayPrice)
                                    .font(.headline)
                                    .foregroundStyle(.xertSteel)
                            }
                            .padding(.vertical, 6)
                        }
                    }
                }
                .padding()
            }
            .background(Color.xertNavy.ignoresSafeArea())
            .navigationTitle("XERT")
            .toolbar {
                Button {
                    Task { await store.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
    }
}

private struct MetricView: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.title.bold())
                .foregroundStyle(.xertOffWhite)
            Text(label.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.xertSteel)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
