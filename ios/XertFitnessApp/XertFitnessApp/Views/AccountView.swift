import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var store: XertStore
    @State private var email = ""
    @State private var password = ""
    @State private var isCreatingAccount = false
    @State private var fullName = ""
    @State private var phone = ""
    @State private var didSaveProfile = false
    @FocusState private var focusedProfileField: ProfileField?

    private enum ProfileField {
        case fullName, phone
    }

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
                    }

                    Section("Account Details") {
                        TextField("Full name", text: $fullName)
                            .textContentType(.name)
                            .focused($focusedProfileField, equals: .fullName)
                            .submitLabel(.next)
                            .onSubmit { focusedProfileField = .phone }
                        TextField("Mobile number", text: $phone)
                            .textContentType(.telephoneNumber)
                            .keyboardType(.phonePad)
                            .focused($focusedProfileField, equals: .phone)
                        Button {
                            Task {
                                let saved = await store.updateProfile(fullName: fullName, phone: phone)
                                didSaveProfile = saved
                                if saved { focusedProfileField = nil }
                            }
                        } label: {
                            HStack {
                                Text(store.isSavingProfile ? "Saving..." : "Save Account Details")
                                Spacer()
                                if store.isSavingProfile {
                                    ProgressView()
                                }
                            }
                        }
                        .disabled(store.isSavingProfile)
                        .onChange(of: fullName) { _ in didSaveProfile = false }
                        .onChange(of: phone) { _ in didSaveProfile = false }

                        if didSaveProfile {
                            Label("Account details saved", systemImage: "checkmark.circle.fill")
                                .font(.footnote)
                                .foregroundStyle(.xertSteel)
                        }
                    }

                    Section {
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
                                    if booking.isCancellable {
                                        Button("Cancel booking", role: .destructive) {
                                            Task { await store.cancel(booking) }
                                        }
                                        .disabled(store.cancellingBookingID == booking.id)
                                    }
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
            .onAppear(perform: syncProfileForm)
            .onChange(of: store.profile) { _ in
                syncProfileForm()
            }
        }
    }

    private func syncProfileForm() {
        fullName = store.profile?.full_name ?? ""
        phone = store.profile?.phone ?? ""
    }
}

private extension BookingItem {
    var isCancellable: Bool {
        (status == "requested" || status == "confirmed") && start_time > Date()
    }
}
