import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var store: XertStore
    @State private var email = ""
    @State private var password = ""
    @State private var isCreatingAccount = false

    var body: some View {
        NavigationStack {
            Form {
                if store.isSignedIn {
                    Section("Membership") {
                        HStack {
                            Text("Signed in")
                            Spacer()
                            Text(store.authSession?.user?.email ?? "Member")
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text("Credits")
                            Spacer()
                            Text("\(store.creditTotal)")
                                .foregroundStyle(.xertSteel)
                                .fontWeight(.bold)
                        }
                        Button("Sign Out", role: .destructive) {
                            store.signOut()
                        }
                    }

                    Section("Bookings") {
                        if store.bookings.isEmpty {
                            Text("No bookings yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(store.bookings) { booking in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(booking.title)
                                        .font(.headline)
                                    Text(booking.start_time.formatted(date: .abbreviated, time: .shortened))
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    Text(booking.status.uppercased())
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(.xertSteel)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                } else {
                    Section(isCreatingAccount ? "Create Account" : "Sign In") {
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                        SecureField("Password", text: $password)
                            .textContentType(isCreatingAccount ? .newPassword : .password)

                        Button {
                            Task {
                                if isCreatingAccount {
                                    await store.signUp(email: email, password: password)
                                } else {
                                    await store.signIn(email: email, password: password)
                                }
                            }
                        } label: {
                            Text(isCreatingAccount ? "Create Account" : "Sign In")
                                .frame(maxWidth: .infinity)
                        }
                        .disabled(email.isEmpty || password.count < 6 || store.isLoading)
                    }

                    Section {
                        Button(isCreatingAccount ? "Already have an account?" : "Create a member account") {
                            isCreatingAccount.toggle()
                        }
                    }
                }
            }
            .navigationTitle("Account")
            .refreshable {
                await store.refresh()
            }
        }
    }
}
